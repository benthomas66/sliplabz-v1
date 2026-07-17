// V1-4g STEP 1 — measure BEFORE you optimize.
//
// Instruments the existing poll path (as used by v1_4f_master.ts / v1_4e_step5)
// with per-phase timing:
//   (a) HTTP round-trip time  — mocked, configurable via HTTP_LATENCY_MS
//   (b) parse / canonicalise  — real code
//   (c) DB writes             — real writes to LOCAL Docker Postgres, split into
//        - INSERT oddsapi_ingestion_runs
//        - INSERT market_snapshots
//        - INSERT market_offerings (per row)
//        - INSERT market_offering_raw_rows (per row)
//        - BEGIN/COMMIT wrapper overhead
//
// Uses the existing tests/fixtures/odds/event-odds-1547-full.json fixture,
// synthesized into 5 distinct events (unique provider_event_id) that match
// the V1-4f-slate size. No live Odds API call is made. No hosted DB write.
//
// Container: sliplabz-v1-4b-postgres (127.0.0.1:55432, sliplabz_v1_4b_it).

import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { openPool } from '../src/db/connection.js';
import type { SliplabzPool } from '../src/db/connection.js';
import { classifyPollResult } from '../src/odds/pollResult.js';
import { classifyFreshness } from '../src/odds/freshness.js';
import {
  isAllowlistedBookmakerKey,
  sourceClassForBookmakerKey,
  V1_CONSENSUS_SPORTSBOOK_KEYS,
} from '../src/odds/bookmakerAllowlist.js';
import { LAUNCH_MARKET_KEYS, isLaunchMarketKey } from '../src/odds/marketKeys.js';
import { normalizeOutcome } from '../src/odds/normalizeOutcome.js';
import { collapseOutcomes } from '../src/odds/duplicateCollapse.js';
import { persistOddsapiSnapshot } from '../src/lines/orchestrator/persistOddsapiSnapshot.js';

const CONTAINER = 'sliplabz-v1-4b-postgres';
const DB_URL = 'postgres://sliplabz:sliplabz_test_only@127.0.0.1:55432/sliplabz_v1_4b_it';
const FIXTURE_PATH = 'tests/fixtures/odds/event-odds-1547-full.json';
const N_EVENTS = 5;
const HTTP_LATENCY_MS = Number(process.env['HTTP_LATENCY_MS'] ?? '800');
const ARTIFACT_DIR = '/tmp/v14g';
if (!existsSync(ARTIFACT_DIR)) mkdirSync(ARTIFACT_DIR, { recursive: true });

interface Phase {
  http_ms: number;
  parse_ms: number;
  ingestion_run_insert_ms: number;
  snapshot_insert_ms: number;
  offering_insert_ms_total: number;
  offering_insert_count: number;
  raw_row_insert_ms_total: number;
  raw_row_insert_count: number;
  txn_wrapper_ms: number;
  wall_ms: number;
}

function newPhase(): Phase {
  return {
    http_ms: 0, parse_ms: 0, ingestion_run_insert_ms: 0, snapshot_insert_ms: 0,
    offering_insert_ms_total: 0, offering_insert_count: 0,
    raw_row_insert_ms_total: 0, raw_row_insert_count: 0,
    txn_wrapper_ms: 0, wall_ms: 0,
  };
}

function nowMs(): number { return performance.now(); }

async function ensureRegistries(pool: SliplabzPool): Promise<void> {
  // Seed the bookmaker registry with all launch sportsbooks (idempotent).
  for (const key of V1_CONSENSUS_SPORTSBOOK_KEYS) {
    await pool.query(
      `INSERT INTO bookmaker_registry (provider_key, display_title, source_class, approved_by)
       VALUES ($1, $1, 'sportsbook', 'v1_4g_measure')
       ON CONFLICT (provider_key) DO NOTHING`,
      [key]
    );
  }
  for (const key of LAUNCH_MARKET_KEYS) {
    await pool.query(
      `INSERT INTO market_registry (provider_key, display_title, is_launch_market, canonical_stat_key, approved_by)
       VALUES ($1, $1, TRUE, $1, 'v1_4g_measure')
       ON CONFLICT (provider_key) DO NOTHING`,
      [key]
    );
  }
}

async function truncateMarketState(pool: SliplabzPool): Promise<void> {
  await pool.query(`
    TRUNCATE TABLE market_offering_raw_rows, market_offerings, market_snapshots,
                   oddsapi_raw_responses, oddsapi_event_snapshots, oddsapi_event_presence,
                   oddsapi_ingestion_runs CASCADE
  `);
}

/**
 * Build 5 distinct synthetic events by cloning the fixture body and swapping
 * provider_event_id. Each event returns the SAME shape (6 books × ~1-2 markets
 * with ~2-4 outcomes each). This matches V1-4f's per-event workload closely
 * enough for the phase-split measurement.
 */
function loadEvents(): Array<{ provider_event_id: string; body: any }> {
  const fx = JSON.parse(readFileSync(FIXTURE_PATH, 'utf-8'));
  const base = fx.response;
  const out: Array<{ provider_event_id: string; body: any }> = [];
  for (let i = 0; i < N_EVENTS; i += 1) {
    const clone = JSON.parse(JSON.stringify(base));
    clone.id = `synth_evt_${i}_${randomUUID().slice(0, 8)}`;
    out.push({ provider_event_id: clone.id, body: clone });
  }
  return out;
}

/**
 * Wrap the pool so that every query is timed and classified. Uses the pool
 * as-is for behavior; the wrapper only observes.
 */
function classifySql(first_arg: unknown): 'ingestion_run' | 'snapshot' | 'offering' | 'raw_row' | 'unclassified' {
  const sql = typeof first_arg === 'string' ? first_arg : ((first_arg as { text?: string })?.text ?? '');
  if (/INSERT INTO oddsapi_ingestion_runs/i.test(sql)) return 'ingestion_run';
  if (/INSERT INTO market_snapshots/i.test(sql)) return 'snapshot';
  if (/INSERT INTO market_offerings/i.test(sql)) return 'offering';
  if (/INSERT INTO market_offering_raw_rows/i.test(sql)) return 'raw_row';
  return 'unclassified';
}

function record(phase: Phase, kind: ReturnType<typeof classifySql>, dt: number): void {
  if (kind === 'ingestion_run') phase.ingestion_run_insert_ms += dt;
  else if (kind === 'snapshot') phase.snapshot_insert_ms += dt;
  else if (kind === 'offering') { phase.offering_insert_ms_total += dt; phase.offering_insert_count += 1; }
  else if (kind === 'raw_row') { phase.raw_row_insert_ms_total += dt; phase.raw_row_insert_count += 1; }
  else phase.txn_wrapper_ms += dt;
}

function makeTimingPool(pool: SliplabzPool, phase: Phase): SliplabzPool {
  // Return a wrapper OBJECT that duck-types SliplabzPool. We don't proxy the
  // real pool because pg-pool marks .query as non-configurable, which breaks
  // Proxy get traps.
  return {
    query: async (...args: unknown[]) => {
      const start = nowMs();
      const res = await (pool.query as any)(...args);
      const dt = nowMs() - start;
      record(phase, classifySql(args[0]), dt);
      return res;
    },
    connect: async () => {
      const client = await pool.connect();
      const wrapped_query = async (...args: unknown[]) => {
        const start = nowMs();
        const res = await (client.query as any)(...args);
        const dt = nowMs() - start;
        record(phase, classifySql(args[0]), dt);
        return res;
      };
      return {
        query: wrapped_query,
        release: (err?: unknown) => (client as any).release(err),
      } as any;
    },
    end: () => pool.end(),
  } as any;
}

/**
 * Run ONE event through the same code path as v1_4f_master.ts / v1_4e_step5.
 * Mocked HTTP; real DB (local Docker). Returns the per-event phase breakdown.
 */
async function pollOneEvent(
  pool: SliplabzPool,
  event: { provider_event_id: string; body: any }
): Promise<Phase> {
  const phase = newPhase();
  const wall_start = nowMs();

  // ---- (a) HTTP ---------------------------------------------------------
  const http_start = nowMs();
  await new Promise((r) => setTimeout(r, HTTP_LATENCY_MS));
  const body_json = event.body;
  phase.http_ms = nowMs() - http_start;

  // ---- (b) parse / canonicalise ----------------------------------------
  const parse_start = nowMs();
  const classification = classifyPollResult({
    http_status: 200, content_type: 'application/json',
    parsed_body: body_json, transport_error_detail: null,
  });
  const bookmakers = Array.isArray(body_json?.bookmakers) ? body_json.bookmakers : [];
  const per_snapshot_prep: Array<{
    bkey: string; bm_title: string; mkey: string;
    provider_last_update: string | null; outcomes_arr: any[];
    canonical_offerings: any[]; raw_rows: any[];
    duplicate_group_count: number; conflict_group_count: number;
  }> = [];
  for (const bm of bookmakers) {
    const bkey = String(bm.key ?? '');
    if (!isAllowlistedBookmakerKey(bkey)) continue;
    if (sourceClassForBookmakerKey(bkey) !== 'sportsbook') continue;
    const bm_title = String(bm.title ?? bkey);
    const bm_last = typeof bm.last_update === 'string' ? bm.last_update : null;
    const markets_arr = Array.isArray(bm.markets) ? bm.markets : [];
    for (const m of markets_arr) {
      const mkey = String(m.key ?? '');
      if (!isLaunchMarketKey(mkey)) continue;
      const provider_last_update = typeof m.last_update === 'string' ? m.last_update : bm_last;
      const outcomes_arr = Array.isArray(m.outcomes) ? m.outcomes : [];
      const collapse_input: any[] = [];
      const q_indexes = new Set<number>();
      const raw_rows_for_persist: any[] = [];
      const observed_at = new Date().toISOString();
      for (let k = 0; k < outcomes_arr.length; k += 1) {
        const raw = outcomes_arr[k] as Record<string, unknown>;
        const nr = normalizeOutcome(raw, 'sportsbook_american');
        if (!nr.ok) {
          q_indexes.add(k);
          raw_rows_for_persist.push({
            raw_row_index: k, raw_name: String(raw['name'] ?? ''),
            raw_description: String(raw['description'] ?? ''),
            raw_price: typeof raw['price'] === 'number' ? raw['price'] : null,
            raw_point: typeof raw['point'] === 'number' ? raw['point'] : null,
            raw_multiplier: typeof raw['multiplier'] === 'number' ? raw['multiplier'] : null,
            raw_payload: raw, disposition: 'quarantined', canonical_offering_index: null, observed_at,
          });
          continue;
        }
        collapse_input.push({ raw_row_index: k, outcome: nr.outcome });
      }
      if (collapse_input.length === 0 && q_indexes.size === 0) continue;
      const collapse = collapseOutcomes(
        collapse_input.map(({ raw_row_index, outcome }: any) => ({ raw_row_index, outcome })),
        {
          provider_event_id: event.provider_event_id, bookmaker_key: bkey, market_key: mkey,
          provider_last_update, promotion_type: 'unknown',
        }
      );
      const canonical_ids: string[] = collapse.offerings.map(() => randomUUID());
      const rIdxToCanIdx = new Map<number, number>();
      for (let ci = 0; ci < collapse.offerings.length; ci += 1) {
        for (const ri of collapse.offerings[ci]!.contributing_raw_row_indexes) rIdxToCanIdx.set(ri, ci);
      }
      const seen = new Map<number, boolean>();
      for (let k = 0; k < outcomes_arr.length; k += 1) {
        if (q_indexes.has(k)) continue;
        const raw = outcomes_arr[k] as Record<string, unknown>;
        if (collapse.quarantined_raw_row_indexes.has(k)) {
          raw_rows_for_persist.push({
            raw_row_index: k, raw_name: String(raw['name'] ?? ''),
            raw_description: String(raw['description'] ?? ''),
            raw_price: typeof raw['price'] === 'number' ? raw['price'] : null,
            raw_point: typeof raw['point'] === 'number' ? raw['point'] : null,
            raw_multiplier: typeof raw['multiplier'] === 'number' ? raw['multiplier'] : null,
            raw_payload: raw, disposition: 'quarantined', canonical_offering_index: null, observed_at,
          });
          continue;
        }
        const ci = rIdxToCanIdx.get(k);
        if (ci === undefined) continue;
        const isFirst = !seen.has(ci); seen.set(ci, true);
        raw_rows_for_persist.push({
          raw_row_index: k, raw_name: String(raw['name'] ?? ''),
          raw_description: String(raw['description'] ?? ''),
          raw_price: typeof raw['price'] === 'number' ? raw['price'] : null,
          raw_point: typeof raw['point'] === 'number' ? raw['point'] : null,
          raw_multiplier: typeof raw['multiplier'] === 'number' ? raw['multiplier'] : null,
          raw_payload: raw, disposition: isFirst ? 'contributed' : 'duplicate',
          canonical_offering_index: ci, observed_at,
        });
      }
      const canonical_offerings = collapse.offerings.map((o: any, ci: number) => ({
        market_offering_id: canonical_ids[ci]!,
        raw_player_description: o.normalized_player_name,
        normalized_player_name: o.normalized_player_name,
        internal_player_id: null,
        side: o.side, point: o.point,
        raw_price_american: o.raw_price_american, raw_multiplier: o.raw_multiplier,
        price_semantic: o.price_semantic, promotion_type: o.promotion_type,
        offering_state: o.offering_state, conflict_reason: o.conflict_reason,
        duplicate_count: o.duplicate_count, provider_last_update,
        source_hash: o.source_hash, eligibility_note: '',
      }));
      per_snapshot_prep.push({
        bkey, bm_title, mkey, provider_last_update, outcomes_arr,
        canonical_offerings, raw_rows: raw_rows_for_persist,
        duplicate_group_count: collapse.duplicate_group_count,
        conflict_group_count: collapse.conflict_group_count,
      });
    }
  }
  phase.parse_ms = nowMs() - parse_start;

  // ---- (c) DB writes ---------------------------------------------------
  // The timing pool tag classifies each query by SQL statement.
  const timing_pool = makeTimingPool(pool, phase);
  const observed_at = new Date().toISOString();
  for (const s of per_snapshot_prep) {
    const fresh_state = classifyFreshness({
      provider_last_update: s.provider_last_update, now: new Date().toISOString(),
      latest_poll_failed: false,
    });
    const ingestion_run_id = randomUUID();
    const market_snapshot_id = randomUUID();
    await timing_pool.query(
      `INSERT INTO oddsapi_ingestion_runs
         (oddsapi_ingestion_run_id, request_kind, endpoint,
          requested_provider_event_id, requested_market_keys, requested_bookmaker_keys,
          requested_regions, requested_effective_time, request_params, redacted_request_url,
          started_at, completed_at, http_status_last, content_type_last,
          response_headers_last, result_state)
       VALUES ($1,'current_poll','event_odds',$2,$3::jsonb,$4::jsonb,'[]'::jsonb,NULL,$5::jsonb,$6,$7,$8,$9,$10,$11::jsonb,'complete')`,
      [
        ingestion_run_id, event.provider_event_id,
        JSON.stringify([s.mkey]), JSON.stringify([s.bkey]),
        JSON.stringify({ markets: [s.mkey], bookmakers: [s.bkey], oddsFormat: 'american' }),
        `redacted`, observed_at, new Date().toISOString(), 200, 'application/json',
        JSON.stringify({}),
      ]
    );
    await persistOddsapiSnapshot(timing_pool, {
      market_snapshot: {
        market_snapshot_id,
        oddsapi_ingestion_run_id: ingestion_run_id,
        raw_response_id: null,
        provider_event_id: event.provider_event_id,
        linked_internal_game_id: null,
        bookmaker_key: s.bkey, bookmaker_title: s.bm_title,
        source_class: 'sportsbook',
        market_key: s.mkey,
        request_kind: 'current_poll', provenance: 'self_observed',
        provider_last_update: s.provider_last_update, provider_snapshot_time: null,
        retrieved_at: observed_at, observed_at,
        freshness_state: fresh_state, schema_state: 'valid',
        raw_outcome_row_count: s.outcomes_arr.length,
        duplicate_group_count: s.duplicate_group_count,
        conflict_group_count: s.conflict_group_count,
      },
      canonical_offerings: s.canonical_offerings,
      raw_rows: s.raw_rows,
    });
  }
  phase.wall_ms = nowMs() - wall_start;
  // classification is used by the real code path — capture it here to
  // silence unused-var warnings without altering behavior
  if (classification.result_state !== 'complete') {
    console.log('# non-complete classification:', classification.result_state);
  }
  return phase;
}

async function main(): Promise<void> {
  console.log(`# V1-4g STEP 1 — measure. Container: ${CONTAINER}. HTTP_LATENCY_MS=${HTTP_LATENCY_MS}`);
  const pool = openPool({
    connectionString: DB_URL, max: 1, statement_timeout_ms: 30_000, ssl: 'disable',
  });
  try {
    await ensureRegistries(pool);
    await truncateMarketState(pool);
    const events = loadEvents();
    const per_event: Phase[] = [];
    for (let i = 0; i < events.length; i += 1) {
      const ph = await pollOneEvent(pool, events[i]!);
      per_event.push(ph);
      console.log(`# event ${i+1}/${events.length}: wall=${ph.wall_ms.toFixed(1)}ms http=${ph.http_ms.toFixed(1)}ms parse=${ph.parse_ms.toFixed(1)}ms tx=${ph.txn_wrapper_ms.toFixed(1)}ms snap=${ph.snapshot_insert_ms.toFixed(1)}ms off=${ph.offering_insert_ms_total.toFixed(1)}ms(${ph.offering_insert_count}) raw=${ph.raw_row_insert_ms_total.toFixed(1)}ms(${ph.raw_row_insert_count}) run=${ph.ingestion_run_insert_ms.toFixed(1)}ms`);
    }

    // Aggregate
    const agg = per_event.reduce<Phase>((a, b) => ({
      http_ms: a.http_ms + b.http_ms, parse_ms: a.parse_ms + b.parse_ms,
      ingestion_run_insert_ms: a.ingestion_run_insert_ms + b.ingestion_run_insert_ms,
      snapshot_insert_ms: a.snapshot_insert_ms + b.snapshot_insert_ms,
      offering_insert_ms_total: a.offering_insert_ms_total + b.offering_insert_ms_total,
      offering_insert_count: a.offering_insert_count + b.offering_insert_count,
      raw_row_insert_ms_total: a.raw_row_insert_ms_total + b.raw_row_insert_ms_total,
      raw_row_insert_count: a.raw_row_insert_count + b.raw_row_insert_count,
      txn_wrapper_ms: a.txn_wrapper_ms + b.txn_wrapper_ms,
      wall_ms: a.wall_ms + b.wall_ms,
    }), newPhase());

    // Verify DB state
    const snaps = await pool.query(`SELECT count(*)::int AS n FROM market_snapshots`);
    const offs = await pool.query(`SELECT count(*)::int AS n FROM market_offerings`);
    const raws = await pool.query(`SELECT count(*)::int AS n FROM market_offering_raw_rows`);
    const runs = await pool.query(`SELECT count(*)::int AS n FROM oddsapi_ingestion_runs`);

    const artifact = {
      ticket: 'V1-4g', step: 1,
      container: CONTAINER, db_url_redacted: DB_URL.replace(/:[^:@]+@/, ':REDACTED@'),
      fixture: FIXTURE_PATH, http_latency_ms: HTTP_LATENCY_MS, n_events: events.length,
      db_after: {
        market_snapshots: (snaps.rows[0] as any).n,
        market_offerings: (offs.rows[0] as any).n,
        market_offering_raw_rows: (raws.rows[0] as any).n,
        oddsapi_ingestion_runs: (runs.rows[0] as any).n,
      },
      per_event, aggregate: agg,
      derived: {
        http_share_pct: (agg.http_ms / agg.wall_ms) * 100,
        parse_share_pct: (agg.parse_ms / agg.wall_ms) * 100,
        db_share_pct: ((agg.ingestion_run_insert_ms + agg.snapshot_insert_ms + agg.offering_insert_ms_total + agg.raw_row_insert_ms_total + agg.txn_wrapper_ms) / agg.wall_ms) * 100,
        db_writes_total_ms: agg.ingestion_run_insert_ms + agg.snapshot_insert_ms + agg.offering_insert_ms_total + agg.raw_row_insert_ms_total + agg.txn_wrapper_ms,
        avg_offering_insert_ms: agg.offering_insert_count > 0 ? agg.offering_insert_ms_total / agg.offering_insert_count : 0,
        avg_raw_row_insert_ms: agg.raw_row_insert_count > 0 ? agg.raw_row_insert_ms_total / agg.raw_row_insert_count : 0,
      },
    };
    writeFileSync(`${ARTIFACT_DIR}/step1_measurement.json`, JSON.stringify(artifact, null, 2));
    console.log(JSON.stringify(artifact, null, 2));
  } finally { await pool.end(); }
}

main().catch((err) => { console.error('# ERROR:', err instanceof Error ? err.stack ?? err.message : String(err)); process.exit(1); });

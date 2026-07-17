// V1-4f — Freshness decay & book movement probe.
//
// Measurement-only ticket. NO code/method/threshold change. NO recommendation.
// Executes:
//   B1: Poll 1 + immediate aggregate + engine, with wall-clock timestamps at boundaries.
//   B2: Re-aggregate + re-run engine (no polls) at +2 / +5 / +10 / +16 / +25 min from t1.
//   A : Poll 2 at ~t1+45 min; movement comparison against Poll 1.
// HARD credit ceiling: 50 (expected: 40 = 5 events × 4 markets × 2 polls).
// Uses CORRECTED patterns (openPool; market.last_update fallback to bookmaker.last_update).

import { randomUUID } from 'node:crypto';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { openPool } from '../src/db/connection.js';
import type { SliplabzPool } from '../src/db/connection.js';
import { buildLiveOddsapiConfig } from '../src/lines/liveInvokeGate.js';
import { oddsapiRequest } from '../src/odds/httpClient.js';
import { validateEventDiscoveryResponse } from '../src/odds/eventDiscovery.js';
import { classifyPollResult } from '../src/odds/pollResult.js';
import { classifyFreshness } from '../src/odds/freshness.js';
import {
  V1_CONSENSUS_SPORTSBOOK_KEYS,
  isAllowlistedBookmakerKey,
  sourceClassForBookmakerKey,
} from '../src/odds/bookmakerAllowlist.js';
import { LAUNCH_MARKET_KEYS, isLaunchMarketKey } from '../src/odds/marketKeys.js';
import { normalizeOutcome } from '../src/odds/normalizeOutcome.js';
import { collapseOutcomes } from '../src/odds/duplicateCollapse.js';
import {
  loadSeedResolutionContext,
  resolveOddsapiEventForSeed,
  persistSeedEventResolution,
} from '../src/seed/orchestrator/eventResolutionForSeed.js';
import { persistOddsapiSnapshot } from '../src/lines/orchestrator/persistOddsapiSnapshot.js';
import type { EventReconciliationInput } from '../src/identity/types.js';
import { aggregateCurrentMarketRowsForGame } from '../src/computation/driver/currentMarketRowsAggregator.js';
import { CURRENT_ONLY_WHERE_CLAUSE } from '../src/lines/currentHistoricalIsolation.js';
import { runEvidencePopulator } from '../src/evidence/driver/populate.js';

const SPORT_KEY = 'basketball_wnba';
const HARD_CREDIT_CEILING = 50;
const MAX_EVENTS = 5;
const ARTIFACT_DIR = '/tmp/v14f';
const DECAY_OFFSETS_SEC = [120, 300, 600, 960, 1500]; // +2, +5, +10, +16, +25 min from t1
const POLL2_OFFSET_SEC = 45 * 60; // +45 min from t1

if (!existsSync(ARTIFACT_DIR)) mkdirSync(ARTIFACT_DIR, { recursive: true });

function normName(s: string): string {
  return s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[’'‘′\-‐‑‒–—_.,]+/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ').trim();
}
function num(h: Record<string, unknown>, k: string): number | null {
  const v = h[k];
  return typeof v === 'number' ? v : null;
}
async function sleepUntil(target_ms: number, label: string): Promise<void> {
  const now = Date.now();
  const dt = Math.max(0, target_ms - now);
  console.log(`# sleep ${label}: ${(dt/1000).toFixed(1)}s until ${new Date(target_ms).toISOString()}`);
  if (dt > 0) await new Promise((r) => setTimeout(r, dt));
}

interface Ledger {
  at: string;
  endpoint: string;
  provider_event_id: string | null;
  http_status: number;
  x_used_before: number | null;
  x_used_after: number | null;
  x_remaining_after: number | null;
  x_last: number | null;
  running_total_this_ticket: number;
}
type OfferingRow = {
  poll_label: 'poll1' | 'poll2';
  provider_event_id: string;
  bookmaker_key: string;
  market_key: string;
  normalized_player_name: string;
  side: string;
  point: number;
  raw_price_american: number | null;
  provider_last_update: string | null;
  observed_at: string;
};

interface PollOutcome {
  label: 'poll1' | 'poll2';
  t_start: string;
  t_persist_end: string;
  credits_spent: number;
  per_event: Array<{
    provider_event_id: string;
    matchup: string;
    linked_internal_game_id: string | null;
    poll_result_state: string;
    snapshots_written: number;
  }>;
  offerings: OfferingRow[];
}

async function pollOnce(
  label: 'poll1' | 'poll2',
  events: Array<{ provider_event_id: string; commence_time: string; home_team: string; away_team: string }>,
  resolutions: Map<string, string | null>,
  player_map: Map<string, string>,
  ledger: Ledger[],
  running_total_ref: { v: number },
): Promise<PollOutcome> {
  const api_key = process.env['ODDS_API_KEY']!;
  const hosted_url = process.env['SLIPLABZ_HOSTED_DATABASE_URL']!;
  const http_cfg = buildLiveOddsapiConfig({ allow_live_invoke: true });
  const t_start = new Date().toISOString();
  const per_event: PollOutcome['per_event'] = [];
  const offerings: OfferingRow[] = [];

  for (let i = 0; i < events.length; i += 1) {
    const ev = events[i]!;
    const gid = resolutions.get(ev.provider_event_id) ?? null;
    if (running_total_ref.v + 4 > HARD_CREDIT_CEILING) {
      console.error(`# HALT: ceiling would be exceeded before ${label} event ${i+1}`);
      break;
    }
    const req_started_at = new Date().toISOString();
    const x_used_before = ledger.length > 0 ? ledger[ledger.length - 1]!.x_used_after : null;
    const odds = await oddsapiRequest(http_cfg, {
      path: `/v4/sports/${SPORT_KEY}/events/${ev.provider_event_id}/odds`,
      query: {
        markets: LAUNCH_MARKET_KEYS as unknown as ReadonlyArray<string>,
        bookmakers: V1_CONSENSUS_SPORTSBOOK_KEYS,
        oddsFormat: 'american',
      },
      api_key,
    });
    const x_used = num(odds.headers, 'x-requests-used');
    const x_rem  = num(odds.headers, 'x-requests-remaining');
    const x_last = num(odds.headers, 'x-requests-last') ?? 0;
    running_total_ref.v += x_last;
    ledger.push({
      at: req_started_at, endpoint: 'event_odds', provider_event_id: ev.provider_event_id,
      http_status: odds.status, x_used_before, x_used_after: x_used,
      x_remaining_after: x_rem, x_last, running_total_this_ticket: running_total_ref.v,
    });
    console.log(`# ${label} evt ${i+1}/${events.length} ${ev.provider_event_id.slice(0,8)}… HTTP ${odds.status} x-last=${x_last} running=${running_total_ref.v}`);

    const classification = classifyPollResult({
      http_status: odds.status, content_type: odds.content_type,
      parsed_body: odds.body_json, transport_error_detail: null,
    });
    const report = {
      provider_event_id: ev.provider_event_id,
      matchup: `${ev.away_team} @ ${ev.home_team}`,
      linked_internal_game_id: gid,
      poll_result_state: classification.result_state,
      snapshots_written: 0,
    };
    if (classification.result_state !== 'complete' && classification.result_state !== 'successful_empty') {
      per_event.push(report);
      continue;
    }
    const body = odds.body_json as any;
    const bookmakers = Array.isArray(body?.bookmakers) ? body.bookmakers : [];
    const write_pool: SliplabzPool = openPool({
      connectionString: hosted_url, max: 1, statement_timeout_ms: 30_000,
      ssl: hosted_url.includes('supabase.') ? 'require' : 'disable',
    });
    try {
      const observed_at = new Date().toISOString();
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
          const raw_rows_for_persist: any[] = [];
          const collapse_input: any[] = [];
          const q_indexes = new Set<number>();
          for (let k = 0; k < outcomes_arr.length; k += 1) {
            const raw = outcomes_arr[k] as Record<string, unknown>;
            const nr = normalizeOutcome(raw, 'sportsbook_american');
            if (!nr.ok) {
              q_indexes.add(k);
              raw_rows_for_persist.push({
                raw_row_index: k, raw_name: String(raw['name'] ?? ''),
                raw_description: String(raw['description'] ?? ''),
                raw_price: typeof raw['price'] === 'number' ? raw['price'] as number : null,
                raw_point: typeof raw['point'] === 'number' ? raw['point'] as number : null,
                raw_multiplier: typeof raw['multiplier'] === 'number' ? raw['multiplier'] as number : null,
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
              provider_event_id: ev.provider_event_id, bookmaker_key: bkey, market_key: mkey,
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
                raw_price: typeof raw['price'] === 'number' ? raw['price'] as number : null,
                raw_point: typeof raw['point'] === 'number' ? raw['point'] as number : null,
                raw_multiplier: typeof raw['multiplier'] === 'number' ? raw['multiplier'] as number : null,
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
              raw_price: typeof raw['price'] === 'number' ? raw['price'] as number : null,
              raw_point: typeof raw['point'] === 'number' ? raw['point'] as number : null,
              raw_multiplier: typeof raw['multiplier'] === 'number' ? raw['multiplier'] as number : null,
              raw_payload: raw, disposition: isFirst ? 'contributed' : 'duplicate',
              canonical_offering_index: ci, observed_at,
            });
          }
          const canonical_offerings = collapse.offerings.map((o, ci) => {
            const pid = player_map.get(o.normalized_player_name) ?? null;
            offerings.push({
              poll_label: label,
              provider_event_id: ev.provider_event_id,
              bookmaker_key: bkey, market_key: mkey,
              normalized_player_name: o.normalized_player_name,
              side: o.side, point: o.point,
              raw_price_american: o.raw_price_american,
              provider_last_update, observed_at,
            });
            return {
              market_offering_id: canonical_ids[ci]!,
              raw_player_description: o.normalized_player_name,
              normalized_player_name: o.normalized_player_name,
              internal_player_id: pid,
              side: o.side, point: o.point,
              raw_price_american: o.raw_price_american, raw_multiplier: o.raw_multiplier,
              price_semantic: o.price_semantic, promotion_type: o.promotion_type,
              offering_state: o.offering_state, conflict_reason: o.conflict_reason,
              duplicate_count: o.duplicate_count, provider_last_update,
              source_hash: o.source_hash, eligibility_note: '',
            };
          });
          const fresh_state = classifyFreshness({
            provider_last_update, now: new Date().toISOString(), latest_poll_failed: false,
          });
          const ingestion_run_id = randomUUID();
          const market_snapshot_id = randomUUID();
          await write_pool.query(
            `INSERT INTO oddsapi_ingestion_runs
               (oddsapi_ingestion_run_id, request_kind, endpoint,
                requested_provider_event_id, requested_market_keys, requested_bookmaker_keys,
                requested_regions, requested_effective_time, request_params, redacted_request_url,
                started_at, completed_at, http_status_last, content_type_last,
                response_headers_last, result_state)
             VALUES ($1,'current_poll','event_odds',$2,$3::jsonb,$4::jsonb,'[]'::jsonb,NULL,$5::jsonb,$6,$7,$8,$9,$10,$11::jsonb,'complete')`,
            [
              ingestion_run_id, ev.provider_event_id,
              JSON.stringify([mkey]), JSON.stringify([bkey]),
              JSON.stringify({ markets: [mkey], bookmakers: [bkey], oddsFormat: 'american' }),
              odds.redacted_request_url, req_started_at, new Date().toISOString(),
              odds.status, odds.content_type, JSON.stringify(odds.headers),
            ]
          );
          try {
            await persistOddsapiSnapshot(write_pool, {
              market_snapshot: {
                market_snapshot_id,
                oddsapi_ingestion_run_id: ingestion_run_id,
                raw_response_id: null,
                provider_event_id: ev.provider_event_id,
                linked_internal_game_id: gid,
                bookmaker_key: bkey, bookmaker_title: bm_title,
                source_class: 'sportsbook',
                market_key: mkey,
                request_kind: 'current_poll', provenance: 'self_observed',
                provider_last_update, provider_snapshot_time: null,
                retrieved_at: observed_at, observed_at,
                freshness_state: fresh_state, schema_state: 'valid',
                raw_outcome_row_count: outcomes_arr.length,
                duplicate_group_count: collapse.duplicate_group_count,
                conflict_group_count: collapse.conflict_group_count,
              },
              canonical_offerings,
              raw_rows: raw_rows_for_persist,
            });
            report.snapshots_written += 1;
          } catch (e) {
            console.log(`# persist ERR ${ev.provider_event_id.slice(0,8)}… ${bkey}/${mkey}: ${(e as Error).message}`);
          }
        }
      }
    } finally { await write_pool.end(); }
    per_event.push(report);
  }
  const t_persist_end = new Date().toISOString();
  const credits_spent = ledger
    .filter((l) => l.endpoint === 'event_odds' && Date.parse(l.at) >= Date.parse(t_start))
    .reduce((a, l) => a + (l.x_last ?? 0), 0);
  return { label, t_start, t_persist_end, credits_spent, per_event, offerings };
}

interface StateSnapshot {
  label: string;
  captured_at: string;
  elapsed_from_t1_sec: number;
  cmr_freshness: Array<{ freshness_state: string; n: number }>;
  cmr_by_book_count: Array<{ bucket: string; n: number }>;
  cmr_total: number;
  cmr_with_consensus: number;
  ep_classification: Array<{ classification: string; n: number }>;
  ep_reasons: Array<{ reason_code: string; category: string; n: number }>;
  ep_strong_count: number;
  ep_total: number;
  t2_from_t1_sec: number | null; // aggregate wall-clock
  t3_from_t1_sec: number | null; // engine wall-clock
}

async function aggregateAndPopulate(
  pool: SliplabzPool, hosted_url: string, t1_ms: number, label: string,
): Promise<StateSnapshot> {
  const t2_start = Date.now();
  const games = await pool.query(
    `SELECT DISTINCT linked_internal_game_id::text AS gid
       FROM market_snapshots
      WHERE ${CURRENT_ONLY_WHERE_CLAUSE}
        AND linked_internal_game_id IS NOT NULL`
  );
  for (const g of games.rows as Array<{ gid: string }>) {
    await aggregateCurrentMarketRowsForGame(pool, { internal_game_id: g.gid });
  }
  const t2_end = Date.now();
  const today = new Date().toISOString().slice(0, 10);
  await runEvidencePopulator({
    connection_string: hosted_url, today_utc_date: today, reference_date: today,
  });
  const t3_end = Date.now();

  const cmr_fresh = await pool.query(`SELECT freshness_state, count(*)::int AS n FROM current_market_rows GROUP BY freshness_state ORDER BY freshness_state`);
  const cmr_by_bc = await pool.query(`
    SELECT CASE WHEN eligible_sportsbook_count = 0 THEN '0'
                WHEN eligible_sportsbook_count = 1 THEN '1'
                WHEN eligible_sportsbook_count = 2 THEN '2'
                WHEN eligible_sportsbook_count >= 3 THEN '3+' END AS bucket,
           count(*)::int AS n
      FROM current_market_rows
      GROUP BY 1 ORDER BY 1`);
  const cmr_total = await pool.query(`SELECT count(*)::int AS n FROM current_market_rows`);
  const cmr_with_consensus = await pool.query(`SELECT count(*)::int AS n FROM current_market_rows WHERE line_consensus_point IS NOT NULL`);
  const ep_cls = await pool.query(`SELECT classification, count(*)::int AS n FROM evidence_profiles GROUP BY classification ORDER BY classification`);
  const ep_reasons = await pool.query(`SELECT reason_code, category, count(*)::int AS n FROM evidence_profile_reasons GROUP BY 1,2 ORDER BY 2, 3 DESC`);
  const ep_strong = await pool.query(`SELECT count(*)::int AS n FROM evidence_profiles WHERE classification IN ('strong_over_evidence','strong_under_evidence')`);
  const ep_total = await pool.query(`SELECT count(*)::int AS n FROM evidence_profiles`);

  return {
    label,
    captured_at: new Date().toISOString(),
    elapsed_from_t1_sec: Math.round((Date.now() - t1_ms) / 1000),
    cmr_freshness: cmr_fresh.rows as Array<{ freshness_state: string; n: number }>,
    cmr_by_book_count: cmr_by_bc.rows as Array<{ bucket: string; n: number }>,
    cmr_total: (cmr_total.rows[0] as any).n,
    cmr_with_consensus: (cmr_with_consensus.rows[0] as any).n,
    ep_classification: ep_cls.rows as any,
    ep_reasons: ep_reasons.rows as any,
    ep_strong_count: (ep_strong.rows[0] as any).n,
    ep_total: (ep_total.rows[0] as any).n,
    t2_from_t1_sec: Math.round((t2_end - t1_ms) / 1000),
    t3_from_t1_sec: Math.round((t3_end - t1_ms) / 1000),
  };
}

async function main(): Promise<void> {
  const api_key = process.env['ODDS_API_KEY'];
  const hosted_url = process.env['SLIPLABZ_HOSTED_DATABASE_URL'];
  if (!api_key || !hosted_url) { console.error('# ERROR: env missing'); process.exit(2); }

  const ledger: Ledger[] = [];
  const running = { v: 0 };

  // ---- Discovery (free) --------------------------------------------------
  const http_cfg = buildLiveOddsapiConfig({ allow_live_invoke: true });
  const disc_started = new Date().toISOString();
  const disc = await oddsapiRequest(http_cfg, {
    path: `/v4/sports/${SPORT_KEY}/events`, query: {}, api_key,
  });
  const disc_used = num(disc.headers, 'x-requests-used');
  const disc_rem  = num(disc.headers, 'x-requests-remaining');
  const disc_last = num(disc.headers, 'x-requests-last') ?? 0;
  ledger.push({
    at: disc_started, endpoint: 'events', provider_event_id: null,
    http_status: disc.status, x_used_before: null, x_used_after: disc_used,
    x_remaining_after: disc_rem, x_last: disc_last, running_total_this_ticket: running.v,
  });
  if (disc.status !== 200 || disc.body_json === null) { console.error('# HALT: discovery failed'); process.exit(3); }
  const validation = validateEventDiscoveryResponse(disc.body_json as any[]);
  const now_ms = Date.now();
  const events = validation.valid_events
    .map((e) => ({
      provider_event_id: e.provider_event_id,
      commence_time: e.raw_commence_time,
      home_team: e.raw_home_team,
      away_team: e.raw_away_team,
    }))
    .filter((e) => Date.parse(e.commence_time) >= now_ms)
    .sort((a, b) => Date.parse(a.commence_time) - Date.parse(b.commence_time))
    .slice(0, MAX_EVENTS);
  console.log(`# discovery: ${events.length} upcoming events`);

  // ---- Resolve identity for all events (idempotent — same as V1-4e Step 3) --
  const resolve_pool = openPool({
    connectionString: hosted_url, max: 1, statement_timeout_ms: 30_000,
    ssl: hosted_url.includes('supabase.') ? 'require' : 'disable',
  });
  const resolutions = new Map<string, string | null>();
  const player_map = new Map<string, string>();
  try {
    for (const ev of events) {
      const ctx = await loadSeedResolutionContext(resolve_pool, {
        provider: 'odds_api', raw_commence_time_utc: ev.commence_time,
      });
      const input: EventReconciliationInput = {
        provider: 'odds_api', provider_game_id: ev.provider_event_id,
        raw_home_team: ev.home_team, raw_away_team: ev.away_team, raw_commence_time: ev.commence_time,
      };
      const outcome = resolveOddsapiEventForSeed(input, ctx);
      await persistSeedEventResolution(resolve_pool, input, outcome);
      resolutions.set(ev.provider_event_id, outcome.kind === 'queued' ? null : outcome.internal_game_id);
    }
    const r = await resolve_pool.query(`SELECT internal_player_id, display_name, normalized_name FROM players`);
    for (const row of r.rows as Array<{ internal_player_id: string; display_name: string; normalized_name: string }>) {
      player_map.set(normName(row.display_name), row.internal_player_id);
      if (row.normalized_name !== '') player_map.set(row.normalized_name, row.internal_player_id);
    }
  } finally { await resolve_pool.end(); }

  // =========================================================================
  // B1 — Poll 1 → aggregate → engine, with wall-clock timestamps
  // =========================================================================
  const t0_ms = Date.now();
  const poll1 = await pollOnce('poll1', events, resolutions, player_map, ledger, running);
  const t1_ms = Date.parse(poll1.t_persist_end);
  console.log(`# t1 (poll persist end): ${new Date(t1_ms).toISOString()}   poll wall-clock: ${((t1_ms - t0_ms)/1000).toFixed(2)}s`);

  const b1_pool = openPool({
    connectionString: hosted_url, max: 1, statement_timeout_ms: 60_000,
    ssl: hosted_url.includes('supabase.') ? 'require' : 'disable',
  });
  let snapshots: StateSnapshot[];
  try {
    const s_immediate = await aggregateAndPopulate(b1_pool, hosted_url, t1_ms, 't=immediate');
    console.log(`# B1 t2-t1=${s_immediate.t2_from_t1_sec}s  t3-t1=${s_immediate.t3_from_t1_sec}s  fresh=${JSON.stringify(s_immediate.cmr_freshness)}`);
    snapshots = [s_immediate];

    // =========================================================================
    // B2 — decay curve
    // =========================================================================
    for (const off of DECAY_OFFSETS_SEC) {
      const target = t1_ms + off * 1000;
      await sleepUntil(target, `decay +${off}s`);
      const s = await aggregateAndPopulate(b1_pool, hosted_url, t1_ms, `t=+${off}s`);
      console.log(`# B2 +${off}s: fresh=${JSON.stringify(s.cmr_freshness)}  strong=${s.ep_strong_count}  cls=${JSON.stringify(s.ep_classification)}`);
      snapshots.push(s);
    }
  } finally { await b1_pool.end(); }

  // Persist intermediate artifact BEFORE poll 2 so B1/B2 survive if A hiccups.
  writeFileSync(`${ARTIFACT_DIR}/b1_b2_artifact.json`, JSON.stringify({
    poll1, snapshots, t0: new Date(t0_ms).toISOString(), t1: new Date(t1_ms).toISOString(),
    ledger, running_total_ticket: running.v,
  }, null, 2));

  // =========================================================================
  // A — Poll 2 at ~t1 + 45min; movement comparison
  // =========================================================================
  const poll2_target = t1_ms + POLL2_OFFSET_SEC * 1000;
  await sleepUntil(poll2_target, 'poll2 target');
  // Refresh discovery+resolutions is unnecessary (same event ids), but re-load
  // player_map to be safe.
  const refresh_pool = openPool({
    connectionString: hosted_url, max: 1, statement_timeout_ms: 30_000,
    ssl: hosted_url.includes('supabase.') ? 'require' : 'disable',
  });
  const player_map2 = new Map<string, string>();
  try {
    const r = await refresh_pool.query(`SELECT internal_player_id, display_name, normalized_name FROM players`);
    for (const row of r.rows as Array<{ internal_player_id: string; display_name: string; normalized_name: string }>) {
      player_map2.set(normName(row.display_name), row.internal_player_id);
      if (row.normalized_name !== '') player_map2.set(row.normalized_name, row.internal_player_id);
    }
  } finally { await refresh_pool.end(); }
  const poll2 = await pollOnce('poll2', events, resolutions, player_map2, ledger, running);
  const t_poll2_persist_ms = Date.parse(poll2.t_persist_end);
  console.log(`# poll2 persist end: ${new Date(t_poll2_persist_ms).toISOString()} credits=${poll2.credits_spent}`);

  // Movement comparison at (event, book, market) grain — timestamp basis —
  // and at (event, book, market, player, side) grain — line/point basis.
  interface KeyTs { event: string; book: string; market: string; provider_last_update: string | null; observed_at: string; }
  const p1_ts = new Map<string, KeyTs>();
  const p2_ts = new Map<string, KeyTs>();
  for (const o of poll1.offerings) {
    const k = `${o.provider_event_id}|${o.bookmaker_key}|${o.market_key}`;
    if (!p1_ts.has(k)) p1_ts.set(k, { event: o.provider_event_id, book: o.bookmaker_key, market: o.market_key, provider_last_update: o.provider_last_update, observed_at: o.observed_at });
  }
  for (const o of poll2.offerings) {
    const k = `${o.provider_event_id}|${o.bookmaker_key}|${o.market_key}`;
    if (!p2_ts.has(k)) p2_ts.set(k, { event: o.provider_event_id, book: o.bookmaker_key, market: o.market_key, provider_last_update: o.provider_last_update, observed_at: o.observed_at });
  }
  const shared_keys = [...p1_ts.keys()].filter((k) => p2_ts.has(k));
  const only_p1 = [...p1_ts.keys()].filter((k) => !p2_ts.has(k));
  const only_p2 = [...p2_ts.keys()].filter((k) => !p1_ts.has(k));
  const ts_moved: Array<{ key: string; book: string; market: string; p1_last: string | null; p2_last: string | null; delta_sec: number | null }> = [];
  const ts_unmoved: Array<{ key: string; book: string; market: string; last: string | null; age_at_poll2_sec: number | null }> = [];
  for (const k of shared_keys) {
    const a = p1_ts.get(k)!;
    const b = p2_ts.get(k)!;
    const a_ts = a.provider_last_update; const b_ts = b.provider_last_update;
    const moved = a_ts !== b_ts;
    if (moved) {
      const delta = (a_ts && b_ts) ? Math.round((Date.parse(b_ts) - Date.parse(a_ts)) / 1000) : null;
      ts_moved.push({ key: k, book: a.book, market: a.market, p1_last: a_ts, p2_last: b_ts, delta_sec: delta });
    } else {
      const age = b_ts ? Math.round((Date.parse(b.observed_at) - Date.parse(b_ts)) / 1000) : null;
      ts_unmoved.push({ key: k, book: a.book, market: a.market, last: b_ts, age_at_poll2_sec: age });
    }
  }

  // Line-move at (event, book, market, player, side) granularity.
  interface LineKey { key: string; point: number; }
  const p1_line = new Map<string, LineKey>();
  const p2_line = new Map<string, LineKey>();
  for (const o of poll1.offerings) {
    const k = `${o.provider_event_id}|${o.bookmaker_key}|${o.market_key}|${o.normalized_player_name}|${o.side}`;
    if (!p1_line.has(k)) p1_line.set(k, { key: k, point: o.point });
  }
  for (const o of poll2.offerings) {
    const k = `${o.provider_event_id}|${o.bookmaker_key}|${o.market_key}|${o.normalized_player_name}|${o.side}`;
    if (!p2_line.has(k)) p2_line.set(k, { key: k, point: o.point });
  }
  const line_shared = [...p1_line.keys()].filter((k) => p2_line.has(k));
  let line_changed = 0, line_same = 0;
  const line_changes: Array<{ key: string; p1_point: number; p2_point: number }> = [];
  for (const k of line_shared) {
    const a = p1_line.get(k)!; const b = p2_line.get(k)!;
    if (a.point !== b.point) { line_changed += 1; line_changes.push({ key: k, p1_point: a.point, p2_point: b.point }); }
    else line_same += 1;
  }

  // Per-bookmaker breakdown.
  const per_book_ts: Record<string, { total: number; moved: number; unmoved: number; ages_sec_unmoved: number[] }> = {};
  for (const k of shared_keys) {
    const a = p1_ts.get(k)!;
    const b = p2_ts.get(k)!;
    const entry = per_book_ts[a.book] ?? { total: 0, moved: 0, unmoved: 0, ages_sec_unmoved: [] };
    entry.total += 1;
    if (a.provider_last_update !== b.provider_last_update) entry.moved += 1;
    else {
      entry.unmoved += 1;
      if (b.provider_last_update) entry.ages_sec_unmoved.push(Math.round((Date.parse(b.observed_at) - Date.parse(b.provider_last_update)) / 1000));
    }
    per_book_ts[a.book] = entry;
  }
  function quantiles(arr: number[]): { min: number | null; p50: number | null; p95: number | null; max: number | null } {
    if (arr.length === 0) return { min: null, p50: null, p95: null, max: null };
    const s = [...arr].sort((x, y) => x - y);
    const q = (p: number) => s[Math.min(s.length - 1, Math.floor(p * s.length))]!;
    return { min: s[0]!, p50: q(0.5), p95: q(0.95), max: s[s.length - 1]! };
  }
  const per_book_summary = Object.entries(per_book_ts).map(([book, v]) => ({
    book, total: v.total, moved: v.moved, unmoved: v.unmoved,
    unmoved_age_stats: quantiles(v.ages_sec_unmoved),
  }));
  const all_unmoved_ages = Object.values(per_book_ts).flatMap((v) => v.ages_sec_unmoved);
  const overall_unmoved_age_stats = quantiles(all_unmoved_ages);

  const artifact = {
    ticket: 'V1-4f', hard_ceiling: HARD_CREDIT_CEILING,
    t0: new Date(t0_ms).toISOString(), t1: new Date(t1_ms).toISOString(),
    poll1_summary: {
      credits_spent: poll1.credits_spent, per_event: poll1.per_event,
      offerings_total: poll1.offerings.length,
    },
    poll2_summary: {
      credits_spent: poll2.credits_spent, per_event: poll2.per_event,
      offerings_total: poll2.offerings.length,
      persist_end: poll2.t_persist_end,
    },
    b1_pipeline_wall_clock: {
      t1_minus_t0_sec: Math.round((t1_ms - t0_ms) / 1000),
      t2_minus_t1_sec: snapshots[0]?.t2_from_t1_sec,
      t3_minus_t2_sec: snapshots[0] ? snapshots[0].t3_from_t1_sec! - snapshots[0].t2_from_t1_sec! : null,
      t3_minus_t1_sec: snapshots[0]?.t3_from_t1_sec,
    },
    b2_decay_snapshots: snapshots,
    movement: {
      shared_market_keys: shared_keys.length,
      only_in_poll1: only_p1.length,
      only_in_poll2: only_p2.length,
      timestamp_changed_count: ts_moved.length,
      timestamp_unchanged_count: ts_unmoved.length,
      per_book: per_book_summary,
      overall_unmoved_age_stats_sec: overall_unmoved_age_stats,
      line_changed_count: line_changed,
      line_same_count: line_same,
      total_line_pairs: line_shared.length,
      timestamp_moved_examples: ts_moved.slice(0, 20),
      line_changes_examples: line_changes.slice(0, 20),
    },
    ledger,
    running_total_credits_ticket: running.v,
    ceiling_ok: running.v <= HARD_CREDIT_CEILING,
  };
  writeFileSync(`${ARTIFACT_DIR}/v1_4f_master_artifact.json`, JSON.stringify(artifact, null, 2));
  console.log(`# artifact written: ${ARTIFACT_DIR}/v1_4f_master_artifact.json`);
  console.log(JSON.stringify({
    credits_total: running.v,
    ceiling_ok: running.v <= HARD_CREDIT_CEILING,
    b1: artifact.b1_pipeline_wall_clock,
    b2_snapshots: snapshots.length,
    movement_shared: shared_keys.length,
    movement_ts_moved: ts_moved.length,
    movement_ts_unmoved: ts_unmoved.length,
    line_changed: line_changed, line_same: line_same,
  }, null, 2));
}

main().catch((err) => { console.error('# ERROR:', err instanceof Error ? err.stack ?? err.message : String(err)); process.exit(1); });

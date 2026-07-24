// V1-4h — Optimized latency, decay, and multi-interval movement probe.
//
// MEASUREMENT ONLY. Proposes no threshold; amends no authority; changes no
// behaviour. Uses V1-4g's runOddsapiPollSweep (bounded concurrency N=3 default).
// Runs the engine in DRY-RUN so evidence_profile rows are UNCHANGED.
//
// Schedule (all times from T0 = poll1 persist start):
//   Poll 1 at T0 (movement baseline)
//   Poll 2 at T0+5min
//   Poll 3 at T0+15min
//   Poll 4 at T0+30min
//   Poll 5 at T0+60min  → immediately run pipeline (Measurement L)
//                       → decay series at t1+2/+5/+10/+16/+25 min (Measurement D)
//
// NO polling during the decay series (would replace snapshots, destroy curve).
//
// Total wall clock ~85 min. HARD credit ceiling 120. Expected 100.

import { randomUUID } from 'node:crypto';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { openPool } from '../src/db/connection.js';
import type { SliplabzPool } from '../src/db/connection.js';
import { buildLiveOddsapiConfig } from '../src/lines/liveInvokeGate.js';
import { oddsapiRequest } from '../src/odds/httpClient.js';
import { validateEventDiscoveryResponse } from '../src/odds/eventDiscovery.js';
import {
  loadSeedResolutionContext,
  resolveOddsapiEventForSeed,
  persistSeedEventResolution,
} from '../src/seed/orchestrator/eventResolutionForSeed.js';
import type { EventReconciliationInput } from '../src/identity/types.js';
import { runOddsapiPollSweep, DEFAULT_MAX_CONCURRENCY } from '../src/lines/orchestrator/oddsapiPollSweep.js';
import { aggregateCurrentMarketRowsForGame } from '../src/computation/driver/currentMarketRowsAggregator.js';
import { CURRENT_ONLY_WHERE_CLAUSE } from '../src/lines/currentHistoricalIsolation.js';
import { runEvidencePopulator } from '../src/evidence/driver/populate.js';

const SPORT_KEY = 'basketball_wnba';
const HARD_CREDIT_CEILING = Number(process.env['V14H_CEILING'] ?? '120');
const MAX_EVENTS = Number(process.env['V14H_EVENTS'] ?? '5');
const CONCURRENCY = DEFAULT_MAX_CONCURRENCY; // 3
const ARTIFACT_DIR = '/tmp/v14h';
if (!existsSync(ARTIFACT_DIR)) mkdirSync(ARTIFACT_DIR, { recursive: true });

// Schedule offsets in seconds from T0 (poll 1 start).
const POLL_OFFSETS_SEC = [0, 5 * 60, 15 * 60, 30 * 60, 60 * 60];
const DECAY_OFFSETS_SEC = [120, 300, 600, 960, 1500]; // from t1 (poll 5 persist end)

function normName(s: string): string {
  return s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[’'‘′\-‐‑‒–—_.,]+/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

async function sleepUntil(target_ms: number, label: string): Promise<void> {
  const now = Date.now();
  const dt = Math.max(0, target_ms - now);
  console.log(`# sleep ${label}: ${(dt/1000).toFixed(1)}s until ${new Date(target_ms).toISOString()}`);
  if (dt > 0) await new Promise((r) => setTimeout(r, dt));
}

interface OfferingRow {
  poll_label: string;
  provider_event_id: string;
  bookmaker_key: string;
  market_key: string;
  normalized_player_name: string;
  side: string;
  point: number;
  raw_price_american: number | null;
  provider_last_update: string | null;
  observed_at: string;
}

interface PollRecord {
  label: string;
  target_offset_sec: number;
  start_at: string;
  persist_end_at: string;
  duration_sec: number;
  credits_spent: number;
  peak_in_flight: number;
  per_event: Array<{
    provider_event_id: string;
    ok: boolean;
    failure_reason: string | null;
    snapshots_written: number;
    attempts: number;
    duration_sec: number;
  }>;
  ledger: {
    authoritative_total: number | null;
    sum_of_per_call_last: number;
    reconciled: boolean;
    x_before: number | null;
    x_after: number | null;
    per_call: Array<{ provider_event_id: string; x_last: number | null; at: string }>;
  };
  offerings_captured: number;
  observed_at_spread_sec: number;
}

interface DecayRecord {
  label: string;
  elapsed_from_t1_sec: number;
  captured_at: string;
  t2_from_t1_sec: number;
  t3_from_t1_sec: number;
  cmr_freshness: Array<{ freshness_state: string; n: number }>;
  cmr_by_book_count: Array<{ bucket: string; n: number }>;
  cmr_total: number;
  cmr_with_consensus: number;
  ep_classification: Array<{ classification: string; n: number }>;
  ep_reasons: Array<{ reason_code: string; category: string; n: number }>;
  ep_strong_count: number;
  eligible_grains: number; // grains that crossed composer's gate (fresh/aging)
}

async function queryOfferingsBetween(pool: SliplabzPool, poll_label: string, start: string, end: string): Promise<OfferingRow[]> {
  const r = await pool.query(`
    SELECT s.provider_event_id, s.bookmaker_key, s.market_key,
           s.provider_last_update::text AS provider_last_update,
           s.observed_at::text AS observed_at,
           o.normalized_player_name, o.side::text AS side,
           o.point::float8 AS point, o.raw_price_american
      FROM market_snapshots s
      JOIN market_offerings o ON o.market_snapshot_id = s.market_snapshot_id
     WHERE s.observed_at BETWEEN $1::timestamptz AND $2::timestamptz
       AND s.request_kind = 'current_poll'
       AND s.provenance = 'self_observed'`,
    [start, end]
  );
  return r.rows.map((row: any) => ({
    poll_label, provider_event_id: row.provider_event_id,
    bookmaker_key: row.bookmaker_key, market_key: row.market_key,
    normalized_player_name: row.normalized_player_name, side: row.side,
    point: row.point, raw_price_american: row.raw_price_american,
    provider_last_update: row.provider_last_update, observed_at: row.observed_at,
  }));
}

async function stateSnapshot(pool: SliplabzPool, label: string, t1_ms: number, t2_ms: number, t3_ms: number): Promise<DecayRecord> {
  const cmr_fresh = await pool.query(`SELECT freshness_state, count(*)::int AS n FROM current_market_rows GROUP BY freshness_state ORDER BY freshness_state`);
  const cmr_by_bc = await pool.query(`
    SELECT CASE WHEN eligible_sportsbook_count = 0 THEN '0'
                WHEN eligible_sportsbook_count = 1 THEN '1'
                WHEN eligible_sportsbook_count = 2 THEN '2'
                WHEN eligible_sportsbook_count >= 3 THEN '3+' END AS bucket,
           count(*)::int AS n
      FROM current_market_rows
      GROUP BY 1 ORDER BY 1`);
  const cmr_total = await pool.query('SELECT count(*)::int AS n FROM current_market_rows');
  const cmr_wc = await pool.query('SELECT count(*)::int AS n FROM current_market_rows WHERE line_consensus_point IS NOT NULL');
  const ep_cls = await pool.query('SELECT classification, count(*)::int AS n FROM evidence_profiles GROUP BY classification ORDER BY classification');
  const ep_r = await pool.query('SELECT reason_code, category, count(*)::int AS n FROM evidence_profile_reasons GROUP BY 1,2 ORDER BY 2, 3 DESC');
  const ep_strong = await pool.query(`SELECT count(*)::int AS n FROM evidence_profiles WHERE classification IN ('strong_over_evidence','strong_under_evidence')`);
  const eligible = await pool.query(`SELECT count(*)::int AS n FROM current_market_rows WHERE freshness_state IN ('fresh','aging')`);
  return {
    label,
    elapsed_from_t1_sec: Math.round((Date.now() - t1_ms) / 1000),
    captured_at: new Date().toISOString(),
    t2_from_t1_sec: Math.round((t2_ms - t1_ms) / 1000),
    t3_from_t1_sec: Math.round((t3_ms - t1_ms) / 1000),
    cmr_freshness: cmr_fresh.rows as any,
    cmr_by_book_count: cmr_by_bc.rows as any,
    cmr_total: (cmr_total.rows[0] as any).n,
    cmr_with_consensus: (cmr_wc.rows[0] as any).n,
    ep_classification: ep_cls.rows as any,
    ep_reasons: ep_r.rows as any,
    ep_strong_count: (ep_strong.rows[0] as any).n,
    eligible_grains: (eligible.rows[0] as any).n,
  };
}

async function main(): Promise<void> {
  const api_key = process.env['ODDS_API_KEY'];
  const hosted_url = process.env['SLIPLABZ_HOSTED_DATABASE_URL'];
  if (!api_key || !hosted_url) { console.error('# ERROR: env missing'); process.exit(2); }

  const evidence_before = await (async () => {
    const p = openPool({ connectionString: hosted_url, max: 1, statement_timeout_ms: 30_000, ssl: hosted_url.includes('supabase.') ? 'require' : 'disable' });
    try {
      const cls = await p.query('SELECT classification, count(*)::int AS n FROM evidence_profiles GROUP BY classification ORDER BY classification');
      const tot = await p.query('SELECT count(*)::int AS n FROM evidence_profiles');
      return { by_classification: cls.rows, total: (tot.rows[0] as any).n };
    } finally { await p.end(); }
  })();
  console.log('# evidence_profiles snapshot BEFORE ticket:', JSON.stringify(evidence_before));

  // ---- Discovery + resolve identities + player map (setup, ~free) ---------
  const http_cfg = buildLiveOddsapiConfig({ allow_live_invoke: true });
  const disc = await oddsapiRequest(http_cfg, {
    path: `/v4/sports/${SPORT_KEY}/events`, query: {}, api_key,
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
    .filter((e) => Date.parse(e.commence_time) >= now_ms + 90 * 60 * 1000) // >=90 min buffer so pollable throughout T0..T0+60 + decay
    .sort((a, b) => Date.parse(a.commence_time) - Date.parse(b.commence_time))
    .slice(0, MAX_EVENTS);
  console.log(`# selected ${events.length} events (all >=90 min buffer at T0):`);
  for (const e of events) console.log(`  ${e.provider_event_id.slice(0,8)} ${e.commence_time} | ${e.away_team} @ ${e.home_team}`);
  if (events.length < MAX_EVENTS) {
    console.error(`# WARN: only ${events.length} events with sufficient buffer; expected ${MAX_EVENTS}`);
  }

  // Resolve identity + player_map once.
  const setup_pool = openPool({ connectionString: hosted_url, max: 1, statement_timeout_ms: 30_000, ssl: hosted_url.includes('supabase.') ? 'require' : 'disable' });
  const resolutions = new Map<string, string | null>();
  const player_map = new Map<string, string>();
  try {
    for (const ev of events) {
      const ctx = await loadSeedResolutionContext(setup_pool, {
        provider: 'odds_api', raw_commence_time_utc: ev.commence_time,
      });
      const input: EventReconciliationInput = {
        provider: 'odds_api', provider_game_id: ev.provider_event_id,
        raw_home_team: ev.home_team, raw_away_team: ev.away_team, raw_commence_time: ev.commence_time,
      };
      const outcome = resolveOddsapiEventForSeed(input, ctx);
      await persistSeedEventResolution(setup_pool, input, outcome);
      resolutions.set(ev.provider_event_id, outcome.kind === 'queued' ? null : outcome.internal_game_id);
      console.log(`  ${ev.provider_event_id.slice(0,8)} → ${outcome.kind}${outcome.kind !== 'queued' ? ` → ${outcome.internal_game_id.slice(0,8)}` : ''}`);
    }
    const r = await setup_pool.query('SELECT internal_player_id, display_name, normalized_name FROM players');
    for (const row of r.rows as Array<{ internal_player_id: string; display_name: string; normalized_name: string }>) {
      player_map.set(normName(row.display_name), row.internal_player_id);
      if (row.normalized_name !== '') player_map.set(row.normalized_name, row.internal_player_id);
    }
  } finally { await setup_pool.end(); }

  const sweep_events = events.map((e) => ({
    provider_event_id: e.provider_event_id,
    linked_internal_game_id: resolutions.get(e.provider_event_id) ?? null,
  }));

  // Setup for polls
  const polls: PollRecord[] = [];
  const all_offerings: OfferingRow[] = [];
  let running_credits = 0;

  const query_pool = openPool({ connectionString: hosted_url, max: 1, statement_timeout_ms: 60_000, ssl: hosted_url.includes('supabase.') ? 'require' : 'disable' });

  try {
    const T0 = Date.now();
    console.log(`# T0 = ${new Date(T0).toISOString()}   scheduled polls at +0/+5/+15/+30/+60 min`);

    for (let poll_idx = 0; poll_idx < POLL_OFFSETS_SEC.length; poll_idx += 1) {
      const off_sec = POLL_OFFSETS_SEC[poll_idx]!;
      const label = `poll${poll_idx + 1}`;
      const target_ms = T0 + off_sec * 1000;
      if (poll_idx > 0) await sleepUntil(target_ms, `${label} target`);
      if (running_credits + 4 * events.length > HARD_CREDIT_CEILING) {
        console.error(`# HALT: credit ceiling would be exceeded (${running_credits + 4 * events.length} > ${HARD_CREDIT_CEILING})`);
        break;
      }
      const start_at = new Date().toISOString();
      console.log(`# ${label} start ${start_at} (cap=${CONCURRENCY})`);

      const sweep = await runOddsapiPollSweep({
        api_key, db_url: hosted_url, http_config: http_cfg,
        events: sweep_events, player_map,
        max_concurrency: CONCURRENCY,
        sequential: false,
        on_connection_check: undefined,
        write_pool_factory: undefined,
        write_pool_release: undefined,
        on_concurrency_change: undefined,
      });
      const persist_end_at = sweep.wall_finished_at;
      const credits = sweep.per_event.reduce((a, e) => a + e.credits_spent_this_event, 0);
      running_credits += credits;
      const per_event = sweep.per_event.map((e) => ({
        provider_event_id: e.provider_event_id,
        ok: e.ok, failure_reason: e.failure_reason,
        snapshots_written: e.snapshots_written,
        attempts: e.attempts,
        duration_sec: (Date.parse(e.finished_at) - Date.parse(e.started_at)) / 1000,
      }));

      // Capture offerings written during this poll window.
      const offerings = await queryOfferingsBetween(query_pool, label, start_at, persist_end_at);
      all_offerings.push(...offerings);

      const observed_ats = offerings.map((o) => Date.parse(o.observed_at)).sort();
      const spread_sec = observed_ats.length > 1
        ? Math.round((observed_ats[observed_ats.length - 1]! - observed_ats[0]!) / 1000)
        : 0;

      const rec: PollRecord = {
        label, target_offset_sec: off_sec, start_at, persist_end_at,
        duration_sec: (Date.parse(persist_end_at) - Date.parse(start_at)) / 1000,
        credits_spent: credits, peak_in_flight: sweep.peak_in_flight,
        per_event,
        ledger: {
          authoritative_total: sweep.ledger.authoritative_total,
          sum_of_per_call_last: sweep.ledger.sum_of_per_call_last,
          reconciled: sweep.ledger.reconciled,
          x_before: sweep.ledger.discovery_before.x_requests_remaining,
          x_after: sweep.ledger.discovery_after.x_requests_remaining,
          per_call: sweep.ledger.per_call.map((c) => ({
            provider_event_id: c.provider_event_id,
            x_last: c.x_requests_last,
            at: c.at,
          })),
        },
        offerings_captured: offerings.length,
        observed_at_spread_sec: spread_sec,
      };
      polls.push(rec);
      console.log(`# ${label} done: dur=${rec.duration_sec.toFixed(2)}s credits=${credits} running=${running_credits} reconciled=${rec.ledger.reconciled} peak_in_flight=${sweep.peak_in_flight} spread=${spread_sec}s offerings=${offerings.length}`);

      // For polls 1-4, save intermediate artifact so we don't lose data if poll 5 hiccups.
      if (poll_idx < POLL_OFFSETS_SEC.length - 1) {
        writeFileSync(`${ARTIFACT_DIR}/polls_partial.json`, JSON.stringify({ polls, all_offerings: all_offerings.length, running_credits }, null, 2));
      }
    }

    // ==============================================================
    // Measurement L — pipeline latency for poll 5
    // ==============================================================
    if (polls.length < POLL_OFFSETS_SEC.length) {
      console.error(`# WARN: only ${polls.length} polls completed; skipping pipeline latency + decay`);
    }
    const poll5 = polls[polls.length - 1]!;
    const t0_ms = Date.parse(poll5.start_at);
    const t1_ms = Date.parse(poll5.persist_end_at);

    // Aggregate — writes current_market_rows (this is the read model, NOT
    // evidence_profiles; and V1-4f/e wrote the same table). Idempotent.
    const t2_start = Date.now();
    const games = await query_pool.query(`
      SELECT DISTINCT linked_internal_game_id::text AS gid
        FROM market_snapshots
       WHERE ${CURRENT_ONLY_WHERE_CLAUSE}
         AND linked_internal_game_id IS NOT NULL`);
    console.log(`# aggregating ${games.rowCount} distinct games`);
    for (const g of games.rows as Array<{ gid: string }>) {
      await aggregateCurrentMarketRowsForGame(query_pool, { internal_game_id: g.gid });
    }
    const t2_end = Date.now();
    // Engine — DRY-RUN (BEGIN/ROLLBACK per batch; no persisted profile).
    const today = new Date().toISOString().slice(0, 10);
    const counters_immediate = await runEvidencePopulator({
      connection_string: hosted_url, today_utc_date: today, reference_date: today,
      dry_run: true,
    });
    const t3_end = Date.now();
    console.log(`# L immediate: t2-t1=${((t2_end - t1_ms)/1000).toFixed(1)}s  t3-t1=${((t3_end - t1_ms)/1000).toFixed(1)}s`);
    console.log(`# L counters: ${JSON.stringify(counters_immediate)}`);

    // Snapshot state after immediate pipeline.
    const snapshots: DecayRecord[] = [];
    const s_immediate = await stateSnapshot(query_pool, 't=immediate', t1_ms, t2_end, t3_end);
    snapshots.push(s_immediate);
    console.log(`# state @immediate elapsed=${s_immediate.elapsed_from_t1_sec}s fresh=${JSON.stringify(s_immediate.cmr_freshness)} strong=${s_immediate.ep_strong_count}`);

    // ==============================================================
    // Measurement D — decay curve (zero credits)
    // ==============================================================
    for (const off of DECAY_OFFSETS_SEC) {
      const target = t1_ms + off * 1000;
      await sleepUntil(target, `decay +${off}s`);
      const t2s = Date.now();
      for (const g of games.rows as Array<{ gid: string }>) {
        await aggregateCurrentMarketRowsForGame(query_pool, { internal_game_id: g.gid });
      }
      const t2e = Date.now();
      const cts = await runEvidencePopulator({
        connection_string: hosted_url, today_utc_date: today, reference_date: today,
        dry_run: true,
      });
      const t3e = Date.now();
      const s = await stateSnapshot(query_pool, `t=+${off}s`, t1_ms, t2e, t3e);
      snapshots.push(s);
      console.log(`# state @+${off}s elapsed=${s.elapsed_from_t1_sec}s fresh=${JSON.stringify(s.cmr_freshness)} strong=${s.ep_strong_count} counters=${JSON.stringify(cts)}`);
      void t2s;
    }

    // Verify evidence_profile IMMUTABILITY at ticket end.
    const evidence_after = {
      by_classification: (await query_pool.query('SELECT classification, count(*)::int AS n FROM evidence_profiles GROUP BY classification ORDER BY classification')).rows,
      total: (await query_pool.query('SELECT count(*)::int AS n FROM evidence_profiles')).rows[0]!.n,
    };
    const mutation_check_ok = JSON.stringify(evidence_before) === JSON.stringify(evidence_after);
    console.log(`# evidence_profiles immutability: ${mutation_check_ok ? 'OK' : 'FAIL'}`);
    console.log(`# evidence_profiles AFTER: ${JSON.stringify(evidence_after)}`);

    // ==============================================================
    // Movement analysis — computed later in a separate script from
    // the offerings artifact. Here we just persist all raw data.
    // ==============================================================
    const artifact = {
      ticket: 'V1-4h',
      hard_ceiling: HARD_CREDIT_CEILING,
      concurrency: CONCURRENCY,
      T0: new Date(T0).toISOString(),
      selected_events: events,
      resolutions: Array.from(resolutions.entries()),
      polls,
      total_credits: running_credits,
      offerings: all_offerings,
      pipeline_latency_L: {
        poll5_start: poll5.start_at,
        poll5_persist_end: poll5.persist_end_at,
        t2_end: new Date(t2_end).toISOString(),
        t3_end: new Date(t3_end).toISOString(),
        t1_minus_t0_sec: (t1_ms - t0_ms) / 1000,
        t2_minus_t1_sec: (t2_end - t1_ms) / 1000,
        t3_minus_t2_sec: (t3_end - t2_end) / 1000,
        t3_minus_t1_sec: (t3_end - t1_ms) / 1000,
        counters_immediate,
      },
      decay_D: snapshots,
      evidence_before, evidence_after,
      evidence_profile_mutation_check: mutation_check_ok,
    };
    writeFileSync(`${ARTIFACT_DIR}/master_artifact.json`, JSON.stringify(artifact, null, 2));
    console.log(`# artifact written: ${ARTIFACT_DIR}/master_artifact.json`);
    console.log(JSON.stringify({
      polls: polls.length, offerings: all_offerings.length,
      total_credits: running_credits, ceiling_ok: running_credits <= HARD_CREDIT_CEILING,
      pipeline_L: artifact.pipeline_latency_L,
      decay_D_snapshots: snapshots.length,
      mutation_check: mutation_check_ok,
    }, null, 2));
  } finally { await query_pool.end(); }
}

main().catch((err) => { console.error('# ERROR:', err instanceof Error ? err.stack ?? err.message : String(err)); process.exit(1); });

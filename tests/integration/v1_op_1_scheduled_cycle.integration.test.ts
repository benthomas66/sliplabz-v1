// V1-OP-1 — scheduled-cycle orchestrator integration proofs.
//
// Local Docker + MOCKED HTTP (discover / prepareEvents / runPollSweep) + REAL
// DB stages (aggregate / listGrainsForGames / populate). No hosted, no Odds
// API. Proves: slate gate (zero API calls), budget floor, full cycle with ONE
// evaluation_reference_time + a correct poll_cycles row, mid-cycle failure
// recording, overlap protection, and idempotency.

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import pg from 'pg';

import { openTestDb } from './support/db.js';
import type { SliplabzPool } from '../../src/db/connection.js';
import { runScheduledCycle, CYCLE_ADVISORY_LOCK_KEY, type ScheduledCycleDeps, type DiscoveryResult } from '../../src/ops/scheduledCycle.js';
import type { OddsapiPollSweepResult } from '../../src/lines/orchestrator/oddsapiPollSweep.js';
import { aggregateCurrentMarketRowsForGame } from '../../src/computation/driver/currentMarketRowsAggregator.js';
import { listAllGrains } from '../../src/evidence/driver/populate.js';
import { runEvidencePopulatorV2 } from '../../src/evidence/v2/populateV2.js';
import { makeV2ReadModelInputBuilder } from '../../src/evidence/v2/readModelInputBuilderV2.js';

let pool: SliplabzPool | null = null;
let skip_reason: string | null = null;
let conn: string | null = null;

before(async () => {
  const h = await openTestDb();
  pool = h.pool; skip_reason = h.skip_reason;
  conn = process.env['SLIPLABZ_DATABASE_URL'] ?? null;
  if (pool !== null) {
    // Ensure the V1-OP-1 migration table exists on the shared local DB.
    const has = (await pool.query(`SELECT count(*)::int AS n FROM information_schema.tables WHERE table_name='poll_cycles'`)).rows[0].n as number;
    if (has === 0) {
      await pool.query(readFileSync('supabase/migrations/20260726120000_poll_cycles.sql', 'utf8'));
    }
  }
});
after(async () => { if (pool !== null) await pool.end(); });
function skipIfUnavailable(t: { skip: (m?: string) => void }): boolean {
  if (pool === null || conn === null) { t.skip(`SKIP: ${skip_reason ?? 'no SLIPLABZ_DATABASE_URL'}`); return true; }
  return false;
}

// ---- fixtures (shape from the V1-A2-5 suite) --------------------------------
async function scrub(p: SliplabzPool): Promise<void> {
  await p.query(`TRUNCATE TABLE evidence_profile_reasons, evidence_profiles, historical_line_results,
    canonical_closing_points, source_closing_quotes, market_offering_raw_rows, market_offerings, market_snapshots,
    close_boundary_evaluations, current_market_rows, oddsapi_ingestion_runs, oddsapi_event_snapshots, oddsapi_raw_responses,
    market_registry, bookmaker_registry, player_reconciliation_queue, event_reconciliation_queue,
    provider_players, provider_games, provider_teams, player_game_stats, bdl_ingestion_runs, players, games, teams,
    poll_cycles CASCADE`);
}
async function seedInWindowGrain(p: SliplabzPool, opts: { tipoff_offset_sec: number; observed_offset_sec: number; point?: number }): Promise<{ game_id: string; player_id: string; provider_event_id: string; commence: string; home: string; away: string }> {
  const point = opts.point ?? 19.5;
  await p.query(`INSERT INTO market_registry (provider_key, display_title, is_launch_market, canonical_stat_key, approved_by) VALUES ('player_points','Player Points',true,'pts','test') ON CONFLICT (provider_key) DO NOTHING`);
  const books = ['draftkings', 'fanduel', 'betmgm'];
  for (const k of books) await p.query(`INSERT INTO bookmaker_registry (provider_key, display_title, source_class, approved_by) VALUES ($1,$1,'sportsbook','test') ON CONFLICT (provider_key) DO NOTHING`, [k]);
  const team_a = randomUUID(); const team_b = randomUUID();
  await p.query(`INSERT INTO teams (internal_team_id, display_name, abbreviation, classification, city) VALUES ($1,'H','H','current_franchise','X'),($2,'A','A','current_franchise','Y')`, [team_a, team_b]);
  const game_id = randomUUID();
  const commence = new Date(Date.now() + opts.tipoff_offset_sec * 1000).toISOString();
  await p.query(`INSERT INTO games (internal_game_id, season, season_type, home_team_id, away_team_id, scheduled_start_utc, postseason, status) VALUES ($1,2026,2,$2,$3,$4::timestamptz,false,'scheduled')`, [game_id, team_a, team_b, commence]);
  const player_id = randomUUID();
  await p.query(`INSERT INTO players (internal_player_id, display_name, normalized_name, current_team_id, status) VALUES ($1,'Op Player','op player',$2,'active_confirmed')`, [player_id, team_a]);
  const run_id = randomUUID();
  await p.query(`INSERT INTO oddsapi_ingestion_runs (oddsapi_ingestion_run_id, request_kind, endpoint, result_state, started_at, completed_at, request_params) VALUES ($1,'current_poll','event_odds','complete',now(),now(),'{}'::jsonb)`, [run_id]);
  const observed = new Date(Date.now() - opts.observed_offset_sec * 1000).toISOString();
  for (const bk of books) {
    const snap = randomUUID();
    await p.query(`INSERT INTO market_snapshots (market_snapshot_id, oddsapi_ingestion_run_id, provider_event_id, linked_internal_game_id, market_key, schema_state, bookmaker_key, bookmaker_title, source_class, request_kind, provenance, provider_last_update, observed_at, freshness_state, raw_outcome_row_count, duplicate_group_count, conflict_group_count) VALUES ($1,$2,$3::text,$4::uuid,'player_points','valid',$5,$5,'sportsbook','current_poll','self_observed',$6::timestamptz,$6::timestamptz,'fresh',1,0,0)`, [snap, run_id, `evt-${game_id.slice(0, 6)}`, game_id, bk, observed]);
    for (const side of ['over', 'under'] as const) {
      await p.query(`INSERT INTO market_offerings (market_offering_id, market_snapshot_id, raw_player_description, normalized_player_name, internal_player_id, side, point, raw_price_american, price_semantic, promotion_type, offering_state, duplicate_count, source_hash) VALUES ($1,$2,'x','x',$3::uuid,$4::outcome_side,$5::numeric,-110,'sportsbook_american','unknown','two_sided_complete',1,$6)`, [randomUUID(), snap, player_id, side, point, `h-${randomUUID()}`]);
    }
  }
  for (let i = 0; i < 15; i += 1) {
    const g = randomUUID();
    await p.query(`INSERT INTO games (internal_game_id, season, season_type, home_team_id, away_team_id, scheduled_start_utc, postseason, status) VALUES ($1,2026,2,$2,$3,$4::timestamptz,false,'final')`, [g, team_a, team_b, `2026-05-${(i + 1).toString().padStart(2, '0')}T00:00:00Z`]);
    const pgs = randomUUID();
    await p.query(`INSERT INTO player_game_stats (player_game_stat_id, provider, provider_player_id, provider_game_id, internal_game_id, internal_player_id, minutes_status, parsed_minutes, raw_stats, normalized_stats, source_hash, raw_minutes, eligibility_state) VALUES ($1,'balldontlie',$2,$3,$4,$5,'played',30,$6::jsonb,$7::jsonb,$8,'30','eligible')`, [pgs, `pp-${g.slice(0, 6)}`, `pg-${g.slice(0, 6)}`, g, player_id, JSON.stringify({ pts: point + 2.5 }), JSON.stringify({ pts: point + 2.5, reb: 0, ast: 0, fg3m: 0 }), `hs-${g}`]);
    const ccp = randomUUID();
    await p.query(`INSERT INTO canonical_closing_points (canonical_closing_point_id, internal_game_id, internal_player_id, market_key, selection_method, canonical_closing_point, total_eligible_sportsbook_count, sportsbook_count_at_selected_point, coverage_label, close_boundary_utc) VALUES ($1,$2,$3,'player_points','single_book',$4,1,1,'single_book',$5::timestamptz)`, [ccp, g, player_id, point, `2026-05-${(i + 1).toString().padStart(2, '0')}T00:00:00Z`]);
    await p.query(`INSERT INTO historical_line_results (internal_game_id, internal_player_id, market_key, canonical_closing_point_id, canonical_closing_point, player_game_stat_id, player_stat_key, player_stat_value, outcome, margin, coverage_state, provenance, computation_version) VALUES ($1,$2,'player_points',$3,$4,$5,'pts',$6,'over',2.5,'single_book','self_observed',3)`, [g, player_id, ccp, point, pgs, point + 2.5]);
  }
  return { game_id, player_id, provider_event_id: `evt-${game_id.slice(0, 6)}`, commence, home: 'H', away: 'A' };
}

// ---- deps builders ----------------------------------------------------------
function mockSweep(sweep_events: ReadonlyArray<{ provider_event_id: string; linked_internal_game_id: string | null }>, remaining_before = 5000): OddsapiPollSweepResult {
  const per = 4; const total = sweep_events.length * per;
  const nowIso = new Date().toISOString();
  return {
    max_concurrency: 3, sequential: false,
    per_event: sweep_events.map((e) => ({ provider_event_id: e.provider_event_id, ok: true, failure_reason: null, snapshots_written: 6, credits_spent_this_event: per, http_status: 200, result_state: 'complete', attempts: 1, started_at: nowIso, finished_at: nowIso })),
    ledger: { discovery_before: { at: nowIso, x_requests_used: null, x_requests_remaining: remaining_before }, discovery_after: { at: nowIso, x_requests_used: null, x_requests_remaining: remaining_before - total }, per_call: [], authoritative_total: total, sum_of_per_call_last: total, reconciled: true },
    peak_in_flight: 1, wall_started_at: nowIso, wall_finished_at: nowIso,
  };
}

function baseDeps(seed: { game_id: string; player_id: string; provider_event_id: string; commence: string }, over: Partial<ScheduledCycleDeps> & { credits_remaining?: number } = {}): ScheduledCycleDeps {
  const p = pool!;
  let discoverCalls = 0; let sweepCalls = 0;
  const deps: ScheduledCycleDeps = {
    connection_string: conn!,
    discover: async (): Promise<DiscoveryResult> => { discoverCalls += 1; (deps as any)._discoverCalls = discoverCalls; return { events: [{ provider_event_id: seed.provider_event_id, commence_time: seed.commence, home_team: 'H', away_team: 'A' }], credits_remaining: over.credits_remaining ?? 5000 }; },
    prepareEvents: async () => ({ sweep_events: [{ provider_event_id: seed.provider_event_id, linked_internal_game_id: seed.game_id }], player_map: new Map([['op player', seed.player_id]]) }),
    runPollSweep: async ({ sweep_events }) => { sweepCalls += 1; (deps as any)._sweepCalls = sweepCalls; return mockSweep(sweep_events); },
    aggregate: (pl, gid) => aggregateCurrentMarketRowsForGame(pl, { internal_game_id: gid }),
    listGrainsForGames: async (cs, ids) => { const s = new Set(ids); return (await listAllGrains(cs)).filter((g) => s.has(g.internal_game_id)); },
    populate: ({ grains, evaluation_reference_time, dry_run }) => runEvidencePopulatorV2({ grains, build_profile_input: makeV2ReadModelInputBuilder({ today_utc_date: '2026-07-15', reference_date: '2026-07-15' }), connection_string: conn!, evaluation_reference_time, dry_run }),
    ...over,
  };
  return deps;
}
async function lastCycleRow(p: SliplabzPool): Promise<any> {
  return (await p.query(`SELECT outcome, evaluation_reference_time::text AS ert, events_polled, credits_spent, grains_aggregated, profiles_persisted, profiles_updated, beyond_horizon_skipped, error_summary, finished_at::text FROM poll_cycles ORDER BY started_at DESC LIMIT 1`)).rows[0];
}

describe('V1-OP-1 — scheduled cycle orchestrator', () => {
  beforeEach(async () => { if (pool !== null) await scrub(pool); });

  it('SLATE GATE — no game in window → skipped_no_slate with ZERO API calls; row written', async (t) => {
    if (skipIfUnavailable(t)) return;
    const seed = await seedInWindowGrain(pool!, { tipoff_offset_sec: 5 * 24 * 3600, observed_offset_sec: 30 }); // 5 days out = NOT in window
    const deps = baseDeps(seed);
    const r = await runScheduledCycle(deps);
    assert.equal(r.outcome, 'skipped_no_slate');
    assert.equal((deps as any)._discoverCalls, undefined, 'discover must NOT be called (zero API calls)');
    assert.equal(r.credits_spent, 0);
    const row = await lastCycleRow(pool!);
    assert.equal(row.outcome, 'skipped_no_slate');
    assert.equal(row.credits_spent, 0);
    assert.equal(row.ert, null);
  });

  it('BUDGET FLOOR — remaining below RESERVE_FLOOR → skipped_budget_floor; no poll', async (t) => {
    if (skipIfUnavailable(t)) return;
    const seed = await seedInWindowGrain(pool!, { tipoff_offset_sec: 3600, observed_offset_sec: 30 });
    const deps = baseDeps(seed, { credits_remaining: 500 }); // < 1000 floor
    const r = await runScheduledCycle(deps);
    assert.equal(r.outcome, 'skipped_budget_floor');
    assert.equal((deps as any)._discoverCalls, 1, 'discover WAS called (free)');
    assert.equal((deps as any)._sweepCalls, undefined, 'sweep must NOT be called below the floor');
    assert.equal(r.credits_spent, 0);
    assert.equal((await lastCycleRow(pool!)).outcome, 'skipped_budget_floor');
  });

  it('FULL CYCLE — persists profiles with ONE evaluation_reference_time; correct poll_cycles row', async (t) => {
    if (skipIfUnavailable(t)) return;
    const seed = await seedInWindowGrain(pool!, { tipoff_offset_sec: 3600, observed_offset_sec: 30 });
    const r = await runScheduledCycle(baseDeps(seed));
    assert.equal(r.outcome, 'completed');
    assert.ok(r.profiles_persisted >= 1, `expected ≥1 profile, got ${r.profiles_persisted}`);
    assert.ok(r.grains_aggregated >= 1);
    assert.ok(r.evaluation_reference_time !== null);
    // ONE evaluation_reference_time across the persisted v2 rows.
    const distinct = (await pool!.query(`SELECT count(DISTINCT evaluation_reference_time)::int AS d FROM evidence_profiles WHERE method_version='evidence_method_v2'`)).rows[0].d;
    assert.equal(distinct, 1);
    // Every persisted v2 row has both timing columns non-null.
    const timing = (await pool!.query(`SELECT count(*)::int AS n, count(*) FILTER (WHERE evaluation_reference_time IS NOT NULL AND profile_generated_at IS NOT NULL)::int AS both FROM evidence_profiles WHERE method_version='evidence_method_v2'`)).rows[0];
    assert.equal(timing.n, timing.both);
    const row = await lastCycleRow(pool!);
    assert.equal(row.outcome, 'completed');
    assert.equal(row.profiles_persisted, r.profiles_persisted);
    assert.ok(row.finished_at !== null);
    assert.equal(row.error_summary, null);
  });

  it('MID-CYCLE FAILURE — a stage throws → outcome failed with error_summary; row written', async (t) => {
    if (skipIfUnavailable(t)) return;
    const seed = await seedInWindowGrain(pool!, { tipoff_offset_sec: 3600, observed_offset_sec: 30 });
    const deps = baseDeps(seed, { runPollSweep: async () => { throw new Error('SIMULATED sweep failure'); } });
    const r = await runScheduledCycle(deps);
    assert.equal(r.outcome, 'failed');
    assert.match(r.error_summary ?? '', /SIMULATED sweep failure/);
    const row = await lastCycleRow(pool!);
    assert.equal(row.outcome, 'failed');
    assert.match(row.error_summary, /SIMULATED sweep failure/);
    assert.ok(row.finished_at !== null, 'failed cycle still records finished_at (no silent hole)');
  });

  it('OVERLAP — a second cycle cannot run while the advisory lock is held', async (t) => {
    if (skipIfUnavailable(t)) return;
    const seed = await seedInWindowGrain(pool!, { tipoff_offset_sec: 3600, observed_offset_sec: 30 });
    const holder = new pg.Client({ connectionString: conn!, ssl: undefined, statement_timeout: 30_000 });
    await holder.connect();
    await holder.query('SELECT pg_advisory_lock($1)', [CYCLE_ADVISORY_LOCK_KEY]);
    try {
      const deps = baseDeps(seed);
      const r = await runScheduledCycle(deps);
      assert.equal(r.outcome, 'blocked');
      assert.equal(r.poll_cycle_id, null);
      assert.equal((deps as any)._discoverCalls, undefined, 'blocked cycle must not poll');
      // No poll_cycles row written for a blocked (never-ran) cycle.
      const n = (await pool!.query(`SELECT count(*)::int AS n FROM poll_cycles`)).rows[0].n;
      assert.equal(n, 0);
    } finally {
      await holder.query('SELECT pg_advisory_unlock($1)', [CYCLE_ADVISORY_LOCK_KEY]);
      await holder.end();
    }
  });

  it('IDEMPOTENCY — re-running over the same market state UPDATES, not duplicates', async (t) => {
    if (skipIfUnavailable(t)) return;
    const seed = await seedInWindowGrain(pool!, { tipoff_offset_sec: 3600, observed_offset_sec: 30 });
    const r1 = await runScheduledCycle(baseDeps(seed));
    assert.equal(r1.outcome, 'completed');
    const count1 = (await pool!.query(`SELECT count(*)::int AS n FROM evidence_profiles WHERE method_version='evidence_method_v2'`)).rows[0].n;
    const r2 = await runScheduledCycle(baseDeps(seed));
    assert.equal(r2.outcome, 'completed');
    const count2 = (await pool!.query(`SELECT count(*)::int AS n FROM evidence_profiles WHERE method_version='evidence_method_v2'`)).rows[0].n;
    assert.equal(count2, count1, 'v2 row count stable — no duplicates');
    assert.equal(r2.profiles_persisted, 0, 'second run inserts nothing');
    assert.ok(r2.profiles_updated >= 1, 'second run UPDATES');
    // Two poll_cycles rows (one per run) — the ledger records both.
    assert.equal((await pool!.query(`SELECT count(*)::int AS n FROM poll_cycles WHERE outcome='completed'`)).rows[0].n, 2);
  });
});

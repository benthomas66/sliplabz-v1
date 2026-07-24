// V1-A2-5 — freshness-neutral composer acceptance proofs.
//
// These drive the PRODUCTION v2 path (freshness-neutral composer wrapper →
// assembly core → v2 engine) against local Docker fixtures and prove the v2
// branches that were UNREACHABLE before this ticket (GAP-12): a grain older
// than v1's ~300s wall-clock window now stays STRUCTURALLY MARKET-PRESENT,
// so `aging` and `stale-present` are reachable.
//
// Proof 3 — grains aged 301/901/1801s remain market-present (book_count ≥ 1)
//           via the v2 path, where the v1 wall-clock composer zeroes them.
// Proof 4 — 901s classifies AGING (no cap).
// Proof 5 — 1801s classifies STALE-PRESENT (Moderate cap + STALE_CURRENT_MARKET).
// Proof 6 — 3600s remains CLASSIFIABLE (row persisted).
// Proof 7 — 3601s persists NO row (beyond-horizon).
// Proof 8 — two grains, one shared evaluation_reference_time, identical
//           classification determined solely by line_observed_at.

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import { openTestDb } from './support/db.js';
import type { SliplabzPool } from '../../src/db/connection.js';
import { withTransaction } from '../../src/db/transaction.js';
import type { EvidenceGrain } from '../../src/evidence/driver/populate.js';
import { makeReadModelInputBuilder } from '../../src/evidence/driver/readModelInputBuilder.js';
import { runEvidencePopulatorV2 } from '../../src/evidence/v2/populateV2.js';
import { makeV2ReadModelInputBuilder } from '../../src/evidence/v2/readModelInputBuilderV2.js';

let pool: SliplabzPool | null = null;
let skip_reason: string | null = null;
let connection_string: string | null = null;

before(async () => {
  const h = await openTestDb();
  pool = h.pool; skip_reason = h.skip_reason;
  connection_string = process.env['SLIPLABZ_DATABASE_URL'] ?? null;
});
after(async () => { if (pool !== null) await pool.end(); });
function skipIfUnavailable(t: { skip: (msg?: string) => void }): boolean {
  if (pool === null || connection_string === null) { t.skip(`SKIP: ${skip_reason ?? 'no DB'}`); return true; }
  return false;
}

// --- fixture helpers (shape copied from the V1-A1-3 Phase C / A2-4 suites) ---

async function scrubEverything(p: SliplabzPool): Promise<void> {
  await p.query(`TRUNCATE TABLE
    evidence_profile_reasons, evidence_profiles,
    historical_line_results, canonical_closing_points, source_closing_quotes,
    market_offering_raw_rows, market_offerings, market_snapshots,
    close_boundary_evaluations, current_market_rows,
    oddsapi_ingestion_runs, oddsapi_event_snapshots, oddsapi_raw_responses,
    market_registry, bookmaker_registry,
    player_reconciliation_queue, event_reconciliation_queue,
    provider_players, provider_games, provider_teams,
    player_game_stats, bdl_ingestion_runs,
    players, games, teams
  CASCADE`);
}
async function seedMarketRegistry(p: SliplabzPool): Promise<void> {
  await p.query(
    `INSERT INTO market_registry (provider_key, display_title, is_launch_market, canonical_stat_key, approved_by)
     VALUES ('player_points','Player Points',true,'pts','test') ON CONFLICT (provider_key) DO NOTHING`);
}
async function seedBookmakers(p: SliplabzPool, keys: readonly string[]): Promise<void> {
  for (const k of keys) {
    await p.query(
      `INSERT INTO bookmaker_registry (provider_key, display_title, source_class, approved_by)
       VALUES ($1,$1,'sportsbook','test') ON CONFLICT (provider_key) DO NOTHING`, [k]);
  }
}
async function seedTeamsGamePlayer(p: SliplabzPool): Promise<{ team_a: string; team_b: string; game_id: string; player_id: string }> {
  const team_a = randomUUID(); const team_b = randomUUID();
  await p.query(
    `INSERT INTO teams (internal_team_id, display_name, abbreviation, classification, city)
     VALUES ($1,'H','H','current_franchise','X'), ($2,'A','A','current_franchise','Y')`, [team_a, team_b]);
  const game_id = randomUUID();
  await p.query(
    `INSERT INTO games (internal_game_id, season, season_type, home_team_id, away_team_id, scheduled_start_utc, postseason, status)
     VALUES ($1,2026,2,$2,$3,'2026-07-20T00:00:00Z',false,'scheduled')`, [game_id, team_a, team_b]);
  const player_id = randomUUID();
  await p.query(
    `INSERT INTO players (internal_player_id, display_name, normalized_name, current_team_id, status)
     VALUES ($1,'X','x',$2,'active_confirmed')`, [player_id, team_a]);
  return { team_a, team_b, game_id, player_id };
}
async function approveIdentity(p: SliplabzPool, s: { player_id: string; game_id: string; team_a: string; team_b: string }): Promise<void> {
  await p.query(
    `INSERT INTO provider_teams (internal_team_id, provider, provider_team_id, mapping_state, raw_full_name)
     VALUES ($1,'balldontlie',$3,'approved','H'), ($2,'balldontlie',$4,'approved','A')`,
    [s.team_a, s.team_b, `bt-h-${s.team_a.slice(0,6)}`, `bt-a-${s.team_b.slice(0,6)}`]);
  await p.query(
    `INSERT INTO provider_players (internal_player_id, provider, provider_player_id, mapping_state, normalized_name)
     VALUES ($1,'balldontlie',$2,'approved','x')`, [s.player_id, `bp-${s.player_id.slice(0,6)}`]);
  await p.query(
    `INSERT INTO provider_games (internal_game_id, provider, provider_game_id, mapping_state, raw_home_team, raw_away_team)
     VALUES ($1,'balldontlie',$2,'approved','H','A')`, [s.game_id, `bg-${s.game_id.slice(0,6)}`]);
}
async function seedOddsRun(p: SliplabzPool): Promise<string> {
  const run_id = randomUUID();
  await p.query(
    `INSERT INTO oddsapi_ingestion_runs (oddsapi_ingestion_run_id, request_kind, endpoint, result_state, started_at, completed_at, request_params)
     VALUES ($1,'current_poll','event_odds','complete',now(),now(),'{}'::jsonb)`, [run_id]);
  return run_id;
}
async function insertOffering(p: SliplabzPool, a: { game_id: string; player_id: string; run_id: string; bookmaker_key: string; point: number; observed_at: string }): Promise<void> {
  const snap_id = randomUUID();
  await p.query(
    `INSERT INTO market_snapshots (market_snapshot_id, oddsapi_ingestion_run_id, provider_event_id, linked_internal_game_id, market_key, schema_state, bookmaker_key, bookmaker_title, source_class, request_kind, provenance, provider_last_update, observed_at, freshness_state, raw_outcome_row_count, duplicate_group_count, conflict_group_count)
     VALUES ($1,$2,$3::text,$4::uuid,'player_points','valid',$5,$5,'sportsbook','current_poll','self_observed',$6::timestamptz,$6::timestamptz,'fresh',1,0,0)`,
    [snap_id, a.run_id, `evt-${a.game_id.slice(0,6)}`, a.game_id, a.bookmaker_key, a.observed_at]);
  for (const side of ['over','under'] as const) {
    await p.query(
      `INSERT INTO market_offerings (market_offering_id, market_snapshot_id, raw_player_description, normalized_player_name, internal_player_id, side, point, raw_price_american, price_semantic, promotion_type, offering_state, duplicate_count, source_hash)
       VALUES ($1,$2,'x','x',$3::uuid,$4::outcome_side,$5::numeric,-110,'sportsbook_american','unknown','two_sided_complete',1,$6)`,
      [randomUUID(), snap_id, a.player_id, side, a.point, `srchash-${randomUUID()}`]);
  }
}
async function seedCurrentMarketRow(p: SliplabzPool, a: { game_id: string; player_id: string; point: number; books: number }): Promise<string> {
  const cmr_id = randomUUID();
  await p.query(
    `INSERT INTO current_market_rows (current_market_row_id, internal_game_id, internal_player_id, market_key, line_consensus_point, line_min_point, line_max_point, eligible_sportsbook_count, point_distribution, freshness_state, provenance, computation_version)
     VALUES ($1,$2,$3,'player_points',$4,$4,$4,$5,$6::jsonb,'fresh','self_observed',3)`,
    [cmr_id, a.game_id, a.player_id, a.point, a.books, JSON.stringify([{ point: a.point, book_count: a.books }])]);
  return cmr_id;
}
async function seedHistory(p: SliplabzPool, a: { player_id: string; team_a: string; team_b: string; point: number; stat: number }): Promise<void> {
  for (let i = 0; i < 15; i += 1) {
    const game_id = randomUUID();
    await p.query(
      `INSERT INTO games (internal_game_id, season, season_type, home_team_id, away_team_id, scheduled_start_utc, postseason, status)
       VALUES ($1,2026,2,$2,$3,$4::timestamptz,false,'final')`,
      [game_id, a.team_a, a.team_b, `2026-05-${(i+1).toString().padStart(2,'0')}T00:00:00Z`]);
    const pgs_id = randomUUID();
    await p.query(
      `INSERT INTO player_game_stats (player_game_stat_id, provider, provider_player_id, provider_game_id, internal_game_id, internal_player_id, minutes_status, parsed_minutes, raw_stats, normalized_stats, source_hash, raw_minutes, eligibility_state)
       VALUES ($1,'balldontlie',$2,$3,$4,$5,'played',30,$6::jsonb,$7::jsonb,$8,'30','eligible')`,
      [pgs_id, `pp-${game_id.slice(0,6)}`, `pg-${game_id.slice(0,6)}`, game_id, a.player_id,
       JSON.stringify({ pts: a.stat }), JSON.stringify({ pts: a.stat, reb: 0, ast: 0, fg3m: 0 }), `hash-${game_id}`]);
    const ccp_id = randomUUID();
    await p.query(
      `INSERT INTO canonical_closing_points (canonical_closing_point_id, internal_game_id, internal_player_id, market_key, selection_method, canonical_closing_point, total_eligible_sportsbook_count, sportsbook_count_at_selected_point, coverage_label, close_boundary_utc)
       VALUES ($1,$2,$3,'player_points','single_book',$4,1,1,'single_book',$5::timestamptz)`,
      [ccp_id, game_id, a.player_id, a.point, `2026-05-${(i+1).toString().padStart(2,'0')}T00:00:00Z`]);
    const margin = a.stat - a.point;
    await p.query(
      `INSERT INTO historical_line_results (internal_game_id, internal_player_id, market_key, canonical_closing_point_id, canonical_closing_point, player_game_stat_id, player_stat_key, player_stat_value, outcome, margin, coverage_state, provenance, computation_version)
       VALUES ($1,$2,'player_points',$3,$4,$5,'pts',$6,$7,$8,'single_book','self_observed',3)`,
      [game_id, a.player_id, ccp_id, a.point, pgs_id, a.stat, margin > 0 ? 'over' : margin < 0 ? 'under' : 'push', margin]);
  }
}

/** Seed a fully-classifiable Over grain whose current offering was observed at `observed_at`. */
async function seedGrainAt(p: SliplabzPool, observed_at: string, point = 19.5): Promise<EvidenceGrain> {
  await seedMarketRegistry(p);
  const books = ['draftkings', 'fanduel', 'betmgm'];
  await seedBookmakers(p, books);
  const s = await seedTeamsGamePlayer(p);
  await approveIdentity(p, s);
  const run_id = await seedOddsRun(p);
  for (const bk of books) await insertOffering(p, { game_id: s.game_id, player_id: s.player_id, run_id, bookmaker_key: bk, point, observed_at });
  const cmr_id = await seedCurrentMarketRow(p, { game_id: s.game_id, player_id: s.player_id, point, books: books.length });
  await seedHistory(p, { player_id: s.player_id, team_a: s.team_a, team_b: s.team_b, point, stat: point + 2.5 });
  return { internal_game_id: s.game_id, internal_player_id: s.player_id, market_key: 'player_points', current_market_row_id: cmr_id, source_read_model_computation_version: 3 };
}

const CTX = { today_utc_date: '2026-07-15', reference_date: '2026-07-15' };
const T0 = '2026-07-18T12:00:00Z';
const T0_MS = Date.parse(T0);
const ertAtAge = (ageSec: number): string => new Date(T0_MS + ageSec * 1000).toISOString();

async function persistedRow(p: SliplabzPool, g: EvidenceGrain): Promise<{ classification: string; quality_capped: boolean; quality_cap_reason: string; evaluated_line: string | null } | null> {
  const r = await p.query(
    `SELECT classification::text, quality_capped, quality_cap_reason::text, evaluated_line
       FROM evidence_profiles WHERE internal_game_id=$1 AND internal_player_id=$2 AND method_version='evidence_method_v2'`,
    [g.internal_game_id, g.internal_player_id]);
  return r.rowCount === 0 ? null : (r.rows[0] as any);
}
async function reasonsFor(p: SliplabzPool, g: EvidenceGrain): Promise<Set<string>> {
  const r = await p.query(
    `SELECT epr.reason_code::text AS rc FROM evidence_profile_reasons epr
       JOIN evidence_profiles ep ON ep.evidence_profile_id = epr.evidence_profile_id
      WHERE ep.internal_game_id=$1 AND ep.internal_player_id=$2 AND ep.method_version='evidence_method_v2'`,
    [g.internal_game_id, g.internal_player_id]);
  return new Set(r.rows.map((x) => (x as { rc: string }).rc));
}

describe('V1-A2-5 — freshness-neutral composer: previously-unreachable v2 branches', () => {
  beforeEach(async () => { if (pool !== null) await scrubEverything(pool); });

  it('PROOF 3 — grains aged 301/901/1801s stay MARKET-PRESENT via v2 (book_count ≥ 1); the v1 wall-clock composer zeroes them', async (t) => {
    if (skipIfUnavailable(t)) return;
    const p = pool!;
    for (const age of [301, 901, 1801]) {
      await scrubEverything(p);
      // observed_at set `age` seconds before real NOW → v1's wall-clock gate sees it as stale.
      const observed_at = new Date(Date.now() - age * 1000).toISOString();
      const grain = await seedGrainAt(p, observed_at);

      const v2Built = await withTransaction(p, async (tx) => makeV2ReadModelInputBuilder(CTX)(grain, tx));
      const v1Built = await withTransaction(p, async (tx) => makeReadModelInputBuilder(CTX)(grain, tx));
      assert.ok(v2Built !== null && v1Built !== null);

      const v2Books = v2Built!.input.current_market_row.eligible_book_count.count;
      const v1Books = v1Built!.input.current_market_row.eligible_book_count.count;
      assert.ok(v2Books >= 1, `age ${age}s: v2 must stay market-present, got book_count=${v2Books}`);
      assert.equal(v1Books, 0, `age ${age}s: v1 wall-clock composer zeroes the offering set`);
      // Structural presence: line_observed_at is a real observation, non-null.
      assert.equal(v2Built!.line_observed_at, observed_at);
    }
  });

  it('PROOF 4 — classification_age 901s classifies AGING (no cap)', async (t) => {
    if (skipIfUnavailable(t)) return;
    const p = pool!;
    const grain = await seedGrainAt(p, T0);
    await runEvidencePopulatorV2({ grains: [grain], build_profile_input: makeV2ReadModelInputBuilder(CTX), connection_string: connection_string!, evaluation_reference_time: ertAtAge(901) });
    const row = await persistedRow(p, grain);
    assert.ok(row !== null, 'aging grain persists a row');
    assert.ok(row!.classification === 'strong_over_evidence' || row!.classification === 'moderate_over_evidence', `got ${row!.classification}`);
    // Aging has NO freshness cap.
    assert.notEqual(row!.quality_cap_reason, 'stale_current_market');
    assert.ok(!(await reasonsFor(p, grain)).has('stale_current_market'), 'aging emits no STALE_CURRENT_MARKET');
  });

  it('PROOF 5 — classification_age 1801s classifies STALE-PRESENT (Moderate cap + STALE_CURRENT_MARKET)', async (t) => {
    if (skipIfUnavailable(t)) return;
    const p = pool!;
    const grain = await seedGrainAt(p, T0);
    await runEvidencePopulatorV2({ grains: [grain], build_profile_input: makeV2ReadModelInputBuilder(CTX), connection_string: connection_string!, evaluation_reference_time: ertAtAge(1801) });
    const row = await persistedRow(p, grain);
    assert.ok(row !== null, 'stale-present grain PERSISTS a row (not absent)');
    assert.equal(row!.quality_capped, true, 'Moderate cap fired');
    assert.equal(row!.quality_cap_reason, 'stale_current_market');
    assert.equal(row!.classification, 'moderate_over_evidence', 'capped at Moderate');
    assert.ok((await reasonsFor(p, grain)).has('stale_current_market'), 'STALE_CURRENT_MARKET emitted');
  });

  it('PROOF 6 — classification_age 3600s remains CLASSIFIABLE (row persisted)', async (t) => {
    if (skipIfUnavailable(t)) return;
    const p = pool!;
    const grain = await seedGrainAt(p, T0);
    const counters = await runEvidencePopulatorV2({ grains: [grain], build_profile_input: makeV2ReadModelInputBuilder(CTX), connection_string: connection_string!, evaluation_reference_time: ertAtAge(3600) });
    assert.equal(counters.profiles_inserted, 1);
    assert.equal(counters.grains_skipped_beyond_horizon, 0);
    assert.ok((await persistedRow(p, grain)) !== null, '3600s persists a row (boundary is inclusive)');
  });

  it('PROOF 7 — classification_age 3601s persists NO row (beyond-horizon)', async (t) => {
    if (skipIfUnavailable(t)) return;
    const p = pool!;
    const grain = await seedGrainAt(p, T0);
    const counters = await runEvidencePopulatorV2({ grains: [grain], build_profile_input: makeV2ReadModelInputBuilder(CTX), connection_string: connection_string!, evaluation_reference_time: ertAtAge(3601) });
    assert.equal(counters.grains_skipped_beyond_horizon, 1);
    assert.equal(counters.profiles_inserted, 0);
    assert.equal(await persistedRow(p, grain), null, 'no row for a beyond-horizon grain');
  });

  it('PROOF 8 — two grains, ONE shared evaluation_reference_time, IDENTICAL classification determined solely by line_observed_at', async (t) => {
    if (skipIfUnavailable(t)) return;
    const p = pool!;
    // Two grains with the SAME line_observed_at (T0) processed in one batch
    // with one shared reference time. v2 reads NO wall clock, so the wall-clock
    // moment each is processed is irrelevant; only line_observed_at matters.
    const g1 = await seedGrainAt(p, T0, 19.5);
    const g2 = await seedGrainAt(p, T0, 19.5);
    const counters = await runEvidencePopulatorV2({
      grains: [g1, g2], build_profile_input: makeV2ReadModelInputBuilder(CTX),
      connection_string: connection_string!, evaluation_reference_time: ertAtAge(1801),
    });
    assert.equal(counters.profiles_inserted, 2);
    const r1 = await persistedRow(p, g1); const r2 = await persistedRow(p, g2);
    assert.ok(r1 !== null && r2 !== null);
    assert.equal(r1!.classification, r2!.classification, 'identical classification');
    assert.equal(r1!.quality_cap_reason, r2!.quality_cap_reason, 'identical cap reason');
    // Both are the stale-present outcome for age 1801s.
    assert.equal(r1!.quality_cap_reason, 'stale_current_market');
    // Single shared reference time across the batch.
    const distinct = (await p.query(
      `SELECT DISTINCT evaluation_reference_time::text AS ert FROM evidence_profiles WHERE method_version='evidence_method_v2'`)).rows;
    assert.equal(distinct.length, 1, 'one shared evaluation_reference_time');
  });
});

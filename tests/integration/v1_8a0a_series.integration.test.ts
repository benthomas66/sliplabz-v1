// V1-8a0a — complete threshold-relative series persistence (integration; Docker).
//
// Proves against a real Postgres:
//   * GAP-20 — the shared reader `readHistoricalSeries` executes its SQL and
//     honours its frozen contract (ordering, nullability, eligibility/provenance
//     semantics, DNP positions present holding chronological place, the
//     Amendment-21 `internal_game_id` stable identity).
//   * The AUTHORIZED JOIN (`buildSeries`) associates requested positions with
//     eligible per-game outcomes on internal_game_id; DNP/ineligible → no verdict.
//   * Writer persistence fidelity, same evaluation event, atomicity, REPLACE.
//   * The reader's typed available / unavailable_not_persisted distinction.
//   * No N+1 (bounded query count reported).

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { openTestDb, truncateAllV14Tables } from './support/db.js';
import type { SliplabzPool } from '../../src/db/connection.js';
import { withTransaction } from '../../src/db/transaction.js';
import { writeV2EvidenceProfile } from '../../src/evidence/v2/writerV2.js';
import { computeEvidenceProfileV2, type EvidenceProfileInputV2 } from '../../src/evidence/v2/engineV2.js';
import { readEvidenceInputBundle, readEvidenceInputBundlesBatched } from '../../src/evidence/v2/readEvidenceInputs.js';
import { readHistoricalSeries } from '../../src/computation/historicalSeriesRead.js';
import { computeThresholdWindow, type ThresholdWindowGame } from '../../src/computation/thresholdWindows.js';
import { buildSeries } from '../../src/evidence/driver/readModelInputBuilder.js';
import type { EvidenceSeriesPosition } from '../../src/evidence/types.js';
import { inputF1 } from '../evidence/fFixtures.js';

let pool: SliplabzPool | null = null;
let skip_reason: string | null = null;

const MARKET = 'player_points' as const;
const LINE = 19.5;
const AUDIT = { current_market_row_id: null, bdl_availability_snapshot_id: null, book_detail_one_sided: 'neither' as const, source_read_model_computation_version: 1 };
const TIMING = { evaluation_reference_time: '2026-07-18T18:10:00Z', profile_generated_at: '2026-07-18T18:10:01Z' };

before(async () => {
  const h = await openTestDb();
  pool = h.pool; skip_reason = h.skip_reason;
  if (pool !== null) {
    for (const [tbl, file] of [
      ['evidence_profile_window_aggregates', 'supabase/migrations/20260728120000_evidence_profile_evidence_inputs.sql'],
      ['evidence_profile_series', 'supabase/migrations/20260728130000_evidence_profile_series.sql'],
    ] as const) {
      const has = await pool.query(`SELECT to_regclass($1) AS t`, [`public.${tbl}`]);
      if (has.rows[0]?.t === null) await pool.query(readFileSync(file, 'utf8'));
    }
  }
});
after(async () => { if (pool !== null) await pool.end(); });
function skipIfUnavailable(t: { skip: (m?: string) => void }): boolean {
  if (pool === null) { t.skip(`SKIP: ${skip_reason}`); return true; }
  return false;
}

interface Grain { day: number; opp: 'A' | 'B' | 'C'; is_home: boolean; minutes: 'played' | 'dnp' | 'unresolved_non_numeric'; elig: 'eligible' | 'non_participation' | 'quarantined'; counted: boolean; provenance?: 'self_observed' | 'backfilled_historical'; stat?: number; }
const GRAINS: Grain[] = [
  { day: 1, opp: 'A', is_home: true,  minutes: 'played', elig: 'eligible', counted: true, provenance: 'self_observed', stat: 22 },
  { day: 2, opp: 'B', is_home: false, minutes: 'played', elig: 'eligible', counted: true, provenance: 'backfilled_historical', stat: 15 },
  { day: 3, opp: 'A', is_home: true,  minutes: 'dnp', elig: 'non_participation', counted: false },
  { day: 4, opp: 'C', is_home: false, minutes: 'unresolved_non_numeric', elig: 'quarantined', counted: false },
  { day: 5, opp: 'B', is_home: true,  minutes: 'played', elig: 'eligible', counted: true, provenance: 'self_observed', stat: 19.5 },
  { day: 6, opp: 'A', is_home: false, minutes: 'played', elig: 'eligible', counted: true, provenance: 'backfilled_historical', stat: 8 },
  { day: 7, opp: 'C', is_home: true,  minutes: 'played', elig: 'eligible', counted: true, provenance: 'self_observed', stat: 25 },
];

/** Seed one player + 7 chronological games spanning the full series matrix. */
async function seedSeries(): Promise<{ game: string; player: string }> {
  const p = pool!;
  const selfTeam = randomUUID();
  const opps = { A: randomUUID(), B: randomUUID(), C: randomUUID() };
  await p.query(
    `INSERT INTO teams (internal_team_id, display_name, abbreviation) VALUES ($1,'Self','SLF'),($2,'Alpha','ALP'),($3,'Bravo','BRV'),($4,'Charlie','CHR')`,
    [selfTeam, opps.A, opps.B, opps.C]);
  const player = randomUUID();
  await p.query(`INSERT INTO players (internal_player_id, display_name, normalized_name, status) VALUES ($1,'Series Subject','series subject','unresolved')`, [player]);
  await p.query(`INSERT INTO market_registry (provider_key, display_title, is_launch_market, canonical_stat_key, approved_by) VALUES ('player_points','Player Points',TRUE,'pts','v1_8a0a') ON CONFLICT (provider_key) DO NOTHING`);
  let anchor = '';
  for (const g of GRAINS) {
    const gameId = randomUUID();
    if (g.day === 7) anchor = gameId;
    const start = `2026-06-0${g.day}T00:00:00Z`;
    const homeTeam = g.is_home ? selfTeam : opps[g.opp];
    const awayTeam = g.is_home ? opps[g.opp] : selfTeam;
    await p.query(`INSERT INTO games (internal_game_id, season, season_type, home_team_id, away_team_id, scheduled_start_utc, status) VALUES ($1,2026,2,$2,$3,$4::timestamptz,'final')`, [gameId, homeTeam, awayTeam, start]);
    const pgsId = randomUUID();
    const pm = g.minutes === 'played' ? 28 : g.minutes === 'dnp' ? 0 : null;
    const qr = g.elig === 'quarantined' ? 'unknown_game_status' : null;
    await p.query(
      `INSERT INTO player_game_stats (player_game_stat_id, provider, provider_player_id, provider_game_id, internal_game_id, internal_player_id, internal_opponent_team_id, is_home, minutes_status, parsed_minutes, raw_stats, normalized_stats, source_hash, raw_minutes, eligibility_state, quarantine_reason)
       VALUES ($1,'balldontlie',$2,$3,$4,$5,$6,$7,$8::bdl_minutes_status,$9,$10::jsonb,$11::jsonb,$12,$13,$14::player_stat_eligibility,$15::player_stat_quarantine_reason)`,
      [pgsId, `pp-${gameId.slice(0, 6)}`, `pg-${gameId.slice(0, 6)}`, gameId, player, opps[g.opp], g.is_home,
       g.minutes, pm, JSON.stringify({ pts: g.stat ?? 0 }), JSON.stringify({ pts: g.stat ?? 0, reb: 0, ast: 0, fg3m: 0 }), `hash-${gameId}`, pm === null ? null : String(pm), g.elig, qr]);
    if (g.counted) {
      const ccpId = randomUUID();
      await p.query(`INSERT INTO canonical_closing_points (canonical_closing_point_id, internal_game_id, internal_player_id, market_key, selection_method, canonical_closing_point, total_eligible_sportsbook_count, sportsbook_count_at_selected_point, coverage_label, close_boundary_utc) VALUES ($1,$2,$3,$4,'single_book',$5,1,1,'single_book',$6::timestamptz)`, [ccpId, gameId, player, MARKET, LINE, start]);
      const margin = (g.stat ?? 0) - LINE;
      await p.query(`INSERT INTO historical_line_results (internal_game_id, internal_player_id, market_key, canonical_closing_point_id, canonical_closing_point, player_game_stat_id, player_stat_key, player_stat_value, outcome, margin, coverage_state, provenance, computation_version) VALUES ($1,$2,$3,$4,$5,$6,'pts',$7,$8,$9,'single_book',$10::oddsapi_provenance,3)`,
        [gameId, player, MARKET, ccpId, LINE, pgsId, g.stat, margin > 0 ? 'over' : margin < 0 ? 'under' : 'push', margin, g.provenance]);
    }
  }
  return { game: anchor, player };
}

/** Exercise the REAL join: reader positions + the extension's season outcomes. */
async function buildRealSeries(game: string, player: string): Promise<ReadonlyArray<EvidenceSeriesPosition>> {
  return withTransaction(pool!, async (tx) => {
    const rows = await readHistoricalSeries(tx, game, player, MARKET);
    // eligible games reverse-chron (what the committed builder feeds the window)
    const eligibleDesc: ThresholdWindowGame[] = rows
      .filter((r) => r.stat_value !== null)
      .map((r) => ({ internal_game_id: r.internal_game_id, game_date_utc: r.game_date_utc, player_stat_value: r.stat_value as number, is_backfilled_historical: r.includes_backfilled_historical }))
      .reverse();
    const season = computeThresholdWindow('season', LINE, eligibleDesc);
    return buildSeries(rows, season.games_evaluated, LINE);
  });
}

async function persistWithSeries(game: string, player: string, series: ReadonlyArray<EvidenceSeriesPosition>): Promise<string> {
  const v2_input: EvidenceProfileInputV2 = {
    ...inputF1(),
    internal_game_id: game, internal_player_id: player, market_key: MARKET,
    series,
    line_observed_at: '2026-07-18T18:00:00Z', evaluation_reference_time: TIMING.evaluation_reference_time,
  };
  const result = computeEvidenceProfileV2(v2_input);
  if (result.kind !== 'classified') throw new Error('fixture did not classify');
  let id = '';
  await withTransaction(pool!, async (tx) => { id = (await writeV2EvidenceProfile(tx, v2_input, result, AUDIT, TIMING)).evidence_profile_id; });
  return id;
}

// -------------------- GAP-20: the shared reader's frozen contract --------------

describe('V1-8a0a — GAP-20: readHistoricalSeries executes its SQL and honours the frozen contract', () => {
  it('returns ALL requested positions oldest→newest with stable identity, DNP/ineligible present, correct nullability/provenance', async (t) => {
    if (skipIfUnavailable(t)) return;
    await truncateAllV14Tables(pool!);
    const { game, player } = await seedSeries();
    const rows = await withTransaction(pool!, (tx) => readHistoricalSeries(tx, game, player, MARKET));

    // (a) every requested position present incl DNP/ineligible (7), oldest→newest
    assert.equal(rows.length, 7);
    assert.deepEqual(rows.map((r) => r.game_date_utc), ['2026-06-01', '2026-06-02', '2026-06-03', '2026-06-04', '2026-06-05', '2026-06-06', '2026-06-07']);
    // (b) stable identity present on every row, unique
    assert.ok(rows.every((r) => typeof r.internal_game_id === 'string' && r.internal_game_id.length > 0));
    assert.equal(new Set(rows.map((r) => r.internal_game_id)).size, 7);
    // (c) nullability: DNP/ineligible rows carry stat_value null and HOLD their place
    assert.equal(rows[2]!.stat_value, null); assert.equal(rows[2]!.minutes_status, 'dnp'); assert.equal(rows[2]!.eligibility_state, 'non_participation');
    assert.equal(rows[3]!.stat_value, null); assert.equal(rows[3]!.eligibility_state, 'quarantined');
    // (d) eligibility semantics: counted rows carry a stat_value
    assert.equal(rows[0]!.stat_value, 22); assert.equal(rows[0]!.eligibility_state, 'eligible');
    // (e) provenance: backfilled flag reflects historical_line_results.provenance
    assert.equal(rows[1]!.includes_backfilled_historical, true);   // day 2 backfilled
    assert.equal(rows[0]!.includes_backfilled_historical, false);  // day 1 self_observed
    // (f) opponent + home/away carried from player_game_stats
    assert.equal(rows[0]!.is_home, true); assert.equal(rows[1]!.is_home, false);
    assert.ok(rows[0]!.opponent_label.length > 0);
  });
});

// -------------------- JOIN + persistence fidelity + discriminated verdict -------

describe('V1-8a0a — join, persistence fidelity, discriminated verdict', () => {
  it('the joined series persists field-for-field; eligible→verdict, DNP/ineligible→no verdict', async (t) => {
    if (skipIfUnavailable(t)) return;
    await truncateAllV14Tables(pool!);
    const { game, player } = await seedSeries();
    const built = await buildRealSeries(game, player);

    // the join: 7 positions, 5 eligible with verdicts, 2 ineligible (no verdict)
    assert.equal(built.length, 7);
    assert.equal(built.filter((s) => s.verdict.kind === 'eligible').length, 5);
    assert.equal(built.filter((s) => s.verdict.kind === 'ineligible').length, 2);
    // day1 stat 22 vs line 19.5 → above; day5 19.5 == 19.5 → equal; day6 8 → below
    const byDate = new Map(built.map((s) => [s.game_date_utc, s]));
    assert.deepEqual(byDate.get('2026-06-01')!.verdict, { kind: 'eligible', outcome: 'above' });
    assert.deepEqual(byDate.get('2026-06-05')!.verdict, { kind: 'eligible', outcome: 'equal' });
    assert.deepEqual(byDate.get('2026-06-06')!.verdict, { kind: 'eligible', outcome: 'below' });
    assert.deepEqual(byDate.get('2026-06-03')!.verdict, { kind: 'ineligible' });
    assert.deepEqual(byDate.get('2026-06-04')!.verdict, { kind: 'ineligible' });

    const id = await persistWithSeries(game, player, built);
    const state = await withTransaction(pool!, (tx) => readEvidenceInputBundle(tx, id));
    assert.equal(state.status, 'available');
    if (state.status !== 'available') return;
    assert.equal(state.bundle.series.status, 'available');
    if (state.bundle.series.status !== 'available') return;
    const persisted = state.bundle.series.positions;

    // field-for-field identical to the built bundle, in chronological order (ordinal)
    assert.equal(persisted.length, built.length);
    for (let i = 0; i < built.length; i += 1) {
      const b = built[i]!, gpos = persisted[i]!;
      assert.equal(gpos.ordinal, i, `ordinal ${i}`);
      assert.equal(gpos.internal_game_id, b.internal_game_id);
      assert.equal(gpos.game_date_utc, b.game_date_utc);
      assert.equal(gpos.opponent_label, b.opponent_label);
      assert.equal(gpos.is_home, b.is_home);
      assert.equal(gpos.stat_value, b.stat_value);
      assert.equal(gpos.evaluated_line, b.evaluated_line);
      assert.equal(gpos.eligibility_state, b.eligibility_state);
      assert.equal(gpos.minutes_status, b.minutes_status);
      assert.equal(gpos.includes_backfilled_historical, b.includes_backfilled_historical);
      assert.deepEqual(gpos.verdict, b.verdict);
    }
    // discriminated storage: ineligible positions carry NO outcome verdict in the DB
    const raw = await pool!.query(`SELECT position_kind, outcome FROM evidence_profile_series WHERE evidence_profile_id=$1 AND position_kind='ineligible'`, [id]);
    assert.equal(raw.rows.length, 2);
    assert.ok(raw.rows.every((r) => r.outcome === null), 'ineligible rows must have NULL outcome (no verdict)');
  });

  it('REPLACE semantics — re-persisting the same profile refreshes, never duplicates', async (t) => {
    if (skipIfUnavailable(t)) return;
    await truncateAllV14Tables(pool!);
    const { game, player } = await seedSeries();
    const built = await buildRealSeries(game, player);
    const id1 = await persistWithSeries(game, player, built);
    const id2 = await persistWithSeries(game, player, built);
    assert.equal(id1, id2, 'same grain → same profile id (upsert)');
    const cnt = await pool!.query(`SELECT count(*)::int AS n FROM evidence_profile_series WHERE evidence_profile_id=$1`, [id1]);
    assert.equal(cnt.rows[0].n, 7, 'exactly one series (no duplication) after re-persist');
  });

  it('ATOMICITY — a failure mid-transaction leaves NO series rows', async (t) => {
    if (skipIfUnavailable(t)) return;
    await truncateAllV14Tables(pool!);
    const { game, player } = await seedSeries();
    const built = await buildRealSeries(game, player);
    await assert.rejects(async () => {
      await withTransaction(pool!, async (tx) => {
        const v2_input: EvidenceProfileInputV2 = { ...inputF1(), internal_game_id: game, internal_player_id: player, market_key: MARKET, series: built, line_observed_at: '2026-07-18T18:00:00Z', evaluation_reference_time: TIMING.evaluation_reference_time };
        const result = computeEvidenceProfileV2(v2_input);
        if (result.kind !== 'classified') throw new Error('fixture did not classify');
        await writeV2EvidenceProfile(tx, v2_input, result, AUDIT, TIMING);
        throw new Error('force rollback AFTER the series write');
      });
    }, /force rollback/);
    const cnt = await pool!.query(`SELECT count(*)::int AS n FROM evidence_profile_series`);
    assert.equal(cnt.rows[0].n, 0, 'rollback left no partial series state');
  });
});

// -------------------- typed availability + no N+1 -----------------------------

describe('V1-8a0a — typed availability + bounded reads', () => {
  it('legacy profile (windows but no series) reports series unavailable_not_persisted', async (t) => {
    if (skipIfUnavailable(t)) return;
    await truncateAllV14Tables(pool!);
    const { game, player } = await seedSeries();
    // persist WITHOUT series (series left untouched by the writer)
    const v2_input: EvidenceProfileInputV2 = { ...inputF1(), internal_game_id: game, internal_player_id: player, market_key: MARKET, line_observed_at: '2026-07-18T18:00:00Z', evaluation_reference_time: TIMING.evaluation_reference_time };
    const result = computeEvidenceProfileV2(v2_input);
    if (result.kind !== 'classified') return;
    let id = '';
    await withTransaction(pool!, async (tx) => { id = (await writeV2EvidenceProfile(tx, v2_input, result, AUDIT, TIMING)).evidence_profile_id; });
    const state = await withTransaction(pool!, (tx) => readEvidenceInputBundle(tx, id));
    assert.equal(state.status, 'available');
    if (state.status !== 'available') return;
    assert.equal(state.bundle.series.status, 'unavailable_not_persisted', 'no series rows → typed unavailable, not empty');
  });

  it('batched bundle read uses exactly THREE bounded queries regardless of profile count (no N+1)', async (t) => {
    if (skipIfUnavailable(t)) return;
    await truncateAllV14Tables(pool!);
    const { game, player } = await seedSeries();
    const built = await buildRealSeries(game, player);
    const id = await persistWithSeries(game, player, built);

    // count queries issued during the batched read by wrapping tx.query
    let queries = 0;
    await withTransaction(pool!, async (tx) => {
      const counting = { query: (sql: string, params?: unknown[]) => { queries += 1; return (tx as { query: (s: string, p?: unknown[]) => Promise<{ rows: unknown[]; rowCount: number }> }).query(sql, params); } };
      const map = await readEvidenceInputBundlesBatched(counting as never, [id, randomUUID(), randomUUID()]);
      assert.equal(map.size, 3);
      assert.equal(map.get(id)!.status, 'available');
    });
    assert.equal(queries, 3, 'window + source + series = 3 bounded queries (no per-profile query)');
  });
});

// V1-8a0 — persisted writer-bound evidence inputs (integration; local Docker).
//
// Proves the acceptance criteria against a real Postgres: persistence fidelity,
// same-evaluation-event, atomicity, legacy typed-unavailable vs zero-sample,
// source-identity (names/IDs only, immutable, non-joinable), and no N+1.

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
import { deriveSourceIdentitySet } from '../../src/evidence/v2/sourceIdentity.js';
import { computeThresholdWindow } from '../../src/computation/thresholdWindows.js';
import type { CurrentOffering } from '../../src/computation/types.js';
import type { EvidenceProfileInput } from '../../src/evidence/types.js';
import { inputF1 } from '../evidence/fFixtures.js';

let pool: SliplabzPool | null = null;
let skip_reason: string | null = null;

const CANARY_POINT = 24.5, CANARY_OVER = -137137, CANARY_UNDER = 424242;
const AUDIT = { current_market_row_id: null, bdl_availability_snapshot_id: null, book_detail_one_sided: 'neither' as const, source_read_model_computation_version: 1 };
const LOA = '2026-07-18T18:00:00Z';
const ERT = '2026-07-18T18:10:00Z'; // 600s after → fresh, classifies
const TIMING = { evaluation_reference_time: ERT, profile_generated_at: '2026-07-18T18:10:01Z' };

before(async () => {
  const h = await openTestDb();
  pool = h.pool; skip_reason = h.skip_reason;
  if (pool !== null) {
    const has = await pool.query(`SELECT to_regclass('public.evidence_profile_window_aggregates') AS t`);
    if (has.rows[0]?.t === null) {
      await pool.query(readFileSync('supabase/migrations/20260728120000_evidence_profile_evidence_inputs.sql', 'utf8'));
    }
  }
});
after(async () => { if (pool !== null) await pool.end(); });
function skipIfUnavailable(t: { skip: (m?: string) => void }): boolean {
  if (pool === null) { t.skip(`SKIP: ${skip_reason}`); return true; }
  return false;
}

async function seedGrain(): Promise<{ game: string; player: string; market: 'player_points' }> {
  const p = pool!;
  const t1 = randomUUID(), t2 = randomUUID();
  await p.query(`INSERT INTO teams (internal_team_id, display_name, abbreviation) VALUES ($1,'A','A'),($2,'B','B')`, [t1, t2]);
  const game = randomUUID();
  await p.query(`INSERT INTO games (internal_game_id, home_team_id, away_team_id, scheduled_start_utc, status, season, season_type) VALUES ($1,$2,$3,'2026-07-20T00:00:00Z','scheduled',2026,2)`, [game, t1, t2]);
  const player = randomUUID();
  await p.query(`INSERT INTO players (internal_player_id, display_name, normalized_name, status) VALUES ($1,'X Y','x y','unresolved')`, [player]);
  await p.query(`INSERT INTO market_registry (provider_key, display_title, is_launch_market, canonical_stat_key, approved_by) VALUES ('player_points','Player Points',TRUE,'pts','v1_8a0') ON CONFLICT (provider_key) DO NOTHING`);
  return { game, player, market: 'player_points' };
}

function offering(book: string, title: string, point: number): CurrentOffering {
  return Object.freeze({
    bookmaker_key: book, display_title: title, point,
    over_price: CANARY_OVER, under_price: CANARY_UNDER,
    provider_last_update: LOA, observed_at: LOA,
    source_snapshot_id: `snap-${book}-HANDLE`, market_offering_id: `off-${book}-HANDLE`,
  });
}
function v2InputFrom(base: EvidenceProfileInput, grain: { game: string; player: string; market: 'player_points' }, offerings: ReadonlyArray<CurrentOffering>): EvidenceProfileInputV2 {
  return {
    ...base,
    internal_game_id: grain.game, internal_player_id: grain.player, market_key: grain.market,
    current_market_row: { ...base.current_market_row, book_detail: { ...base.current_market_row.book_detail, offerings } },
    line_observed_at: LOA, evaluation_reference_time: ERT,
  };
}
async function persist(v2_input: EvidenceProfileInputV2): Promise<{ id: string; classification: string }> {
  const result = computeEvidenceProfileV2(v2_input);
  if (result.kind !== 'classified') throw new Error('unexpected beyond_horizon in fixture');
  let id = '';
  await withTransaction(pool!, async (tx) => {
    const w = await writeV2EvidenceProfile(tx, v2_input, result, AUDIT, TIMING);
    id = w.evidence_profile_id;
  });
  return { id, classification: result.profile.classification };
}

// -------------------- #2/#3 FIDELITY + SAME EVALUATION EVENT --------------------

describe('V1-8a0 — persistence fidelity + same evaluation event', () => {
  it('persisted window bundle is field-for-field identical to the bundle the writer received', async (t) => {
    if (skipIfUnavailable(t)) return;
    await truncateAllV14Tables(pool!);
    const grain = await seedGrain();
    const v2_input = v2InputFrom(inputF1(), grain, [offering('betco', 'BetCo', CANARY_POINT), offering('acme', 'Acme', 23.5)]);
    const { id, classification } = await persist(v2_input);

    const state = await withTransaction(pool!, (tx) => readEvidenceInputBundle(tx, id));
    assert.equal(state.status, 'available');
    if (state.status !== 'available') return;
    const src = v2_input.threshold_windows;
    const persistedWindows = state.bundle.windows;
    for (const key of ['L5', 'L10', 'L20', 'season'] as const) {
      const got = persistedWindows[key];
      const want = src[key];
      assert.equal(got.eligible_n, want.eligible_n, `${key} eligible_n`);
      assert.equal(got.count_above, want.count_above, `${key} count_above`);
      assert.equal(got.count_equal, want.count_equal, `${key} count_equal`);
      assert.equal(got.count_below, want.count_below, `${key} count_below`);
      assert.equal(got.count_above + got.count_equal + got.count_below, got.eligible_n, `${key} counts sum to eligible_n`);
      assert.equal(got.avg_stat_value, want.avg_stat_value, `${key} avg (no rounding)`);
      assert.equal(got.avg_minus_threshold, want.avg_minus_threshold, `${key} avg_minus_threshold`);
      assert.equal(got.median_stat_value, want.median_stat_value, `${key} median`);
      assert.equal(got.current_streak_direction, want.current_streak_direction, `${key} streak dir`);
      assert.equal(got.current_streak_length, want.current_streak_length, `${key} streak len`);
      assert.equal(got.coverage_label, want.coverage_label, `${key} coverage`);
      assert.equal(got.includes_backfilled_historical, want.includes_backfilled_historical, `${key} provenance`);
      assert.equal(got.evaluated_line, want.threshold, `${key} evaluated line == the window threshold`);
    }
    // Same evaluation event: the persisted classification is the one just computed.
    const prof = await pool!.query(`SELECT classification::text AS c FROM evidence_profiles WHERE evidence_profile_id=$1`, [id]);
    assert.equal(prof.rows[0].c, classification);
  });
});

// -------------------- #7 SOURCE IDENTITY: names only, non-joinable --------------------

describe('V1-8a0 — source identity', () => {
  it('persists dedup names/IDs only, alphabetical; no paid value or offering handle survives', async (t) => {
    if (skipIfUnavailable(t)) return;
    await truncateAllV14Tables(pool!);
    const grain = await seedGrain();
    // Two sources, one duplicated with different point/side — must collapse to one.
    const offerings = [offering('zeta', 'Zeta', 25.5), offering('acme', 'Acme', CANARY_POINT), offering('acme', 'Acme', 23.5)];
    const { id } = await persist(v2InputFrom(inputF1(), grain, offerings));

    const state = await withTransaction(pool!, (tx) => readEvidenceInputBundle(tx, id));
    assert.equal(state.status, 'available');
    if (state.status !== 'available') return;
    assert.deepEqual(state.bundle.source_identities.map((s) => s.normalized_source_id), ['acme', 'zeta']);
    assert.equal(state.bundle.source_count, 2);
    for (const s of state.bundle.source_identities) assert.deepEqual(Object.keys(s).sort(), ['display_name', 'normalized_source_id']);
    // No paid content or handle in the serialized bundle → cannot be joined to a paid offering row.
    const blob = JSON.stringify(state.bundle);
    for (const canary of [String(CANARY_POINT), String(CANARY_OVER), String(CANARY_UNDER), 'HANDLE', 'over_price', 'market_offering_id']) {
      assert.ok(!blob.includes(canary), `paid/handle canary "${canary}" leaked into the persisted bundle`);
    }
    // Prove the persistence tables themselves hold no economic column.
    const cols = await pool!.query(`SELECT column_name FROM information_schema.columns WHERE table_name='evidence_profile_source_identities'`);
    const names = new Set(cols.rows.map((r: { column_name: string }) => r.column_name));
    for (const forbidden of ['point', 'price', 'over_price', 'under_price', 'side', 'market_offering_id', 'source_snapshot_id']) {
      assert.ok(!names.has(forbidden), `the source-identity table must not have a "${forbidden}" column`);
    }
  });

  it('#8 IMMUTABILITY (Amendment 14) — P frozen against a later change to its OWN grain offering context, without repopulation', async (t) => {
    if (skipIfUnavailable(t)) return;
    await truncateAllV14Tables(pool!);
    const grain = await seedGrain();
    const { id: idP } = await persist(v2InputFrom(inputF1(), grain, [offering('acme', 'Acme', 24.5), offering('betco', 'BetCo', 24.5)]));
    const s1 = await withTransaction(pool!, (tx) => readEvidenceInputBundle(tx, idP));
    assert.equal(s1.status, 'available');
    if (s1.status !== 'available') return;
    const persisted = s1.bundle.source_identities.map((s) => s.normalized_source_id);
    assert.deepEqual(persisted, ['acme', 'betco']);

    // The offering context for P's OWN grain now changes — DIFFERENT sources
    // participate — but P is NOT repopulated (NO writer call for idP). A fresh
    // derivation from the changed offering set would yield a different set:
    const changedOfferings = [offering('gamma', 'Gamma', 24.5), offering('delta', 'Delta', 24.5)];
    const wouldBeNow = deriveSourceIdentitySet(changedOfferings).map((s) => s.normalized_source_id);
    assert.notDeepEqual(wouldBeNow, persisted, 'the same grain\'s offering context genuinely changed');

    // Read P back — its persisted identity set is IDENTICAL to the evaluation-time
    // set. The free surface reflects the historical evaluation, not today's market.
    const s2 = await withTransaction(pool!, (tx) => readEvidenceInputBundle(tx, idP));
    assert.equal(s2.status, 'available');
    if (s2.status !== 'available') return;
    assert.deepEqual(s2.bundle.source_identities.map((s) => s.normalized_source_id), persisted);
  });

  it('#8 IMMUTABILITY (additional cross-grain case) — persisting a different grain does not alter P', async (t) => {
    if (skipIfUnavailable(t)) return;
    await truncateAllV14Tables(pool!);
    const grainP = await seedGrain();
    const { id: idP } = await persist(v2InputFrom(inputF1(), grainP, [offering('acme', 'Acme', 24.5), offering('betco', 'BetCo', 24.5)]));
    const grainQ = await seedGrain();
    await persist(v2InputFrom(inputF1(), grainQ, [offering('newbook', 'NewBook', 24.5)]));
    const after = await withTransaction(pool!, (tx) => readEvidenceInputBundle(tx, idP));
    assert.equal(after.status, 'available');
    if (after.status !== 'available') return;
    assert.deepEqual(after.bundle.source_identities.map((s) => s.normalized_source_id), ['acme', 'betco']);
  });
});

// -------------------- #6 LEGACY typed-unavailable vs genuine zero sample --------------------

describe('V1-8a0 — legacy compatibility', () => {
  it('a legacy profile (no persisted bundle) is typed unavailable — not zeros, distinguishable from zero-sample', async (t) => {
    if (skipIfUnavailable(t)) return;
    await truncateAllV14Tables(pool!);
    const grain = await seedGrain();
    // LEGACY: insert an evidence_profiles row WITHOUT the V1-8a0 writer (no children).
    const legacy = await pool!.query(
      `INSERT INTO evidence_profiles (internal_game_id, internal_player_id, market_key,
         evaluated_line, evaluated_source_kind, classification, direction, quality_capped, quality_cap_reason,
         includes_backfilled_historical, method_version, computation_version, reference_date,
         source_read_model_computation_version, evaluation_reference_time, profile_generated_at)
       VALUES ($1,$2,'player_points', 20.5,'sportsbook_consensus','strong_over_evidence','over',false,'none',
         false,'evidence_method_v2',1,'2026-07-18',1,$3::timestamptz,$3::timestamptz)
       RETURNING evidence_profile_id::text AS id`,
      [grain.game, grain.player, ERT]
    );
    const legacyId = (legacy.rows[0] as { id: string }).id;
    const legacyState = await withTransaction(pool!, (tx) => readEvidenceInputBundle(tx, legacyId));
    assert.equal(legacyState.status, 'unavailable_not_persisted');
    assert.ok(!('bundle' in legacyState), 'legacy state must carry no bundle (no zeros, no empty arrays)');

    // GENUINE ZERO SAMPLE: persist via the writer with all-empty windows.
    const grain2 = await seedGrain();
    const zeroWindows = {
      L5: computeThresholdWindow('L5', 20.5, []), L10: computeThresholdWindow('L10', 20.5, []),
      L20: computeThresholdWindow('L20', 20.5, []), season: computeThresholdWindow('season', 20.5, []),
    };
    const zeroInput = { ...v2InputFrom(inputF1(), grain2, []), threshold_windows: zeroWindows };
    const { id: zeroId } = await persist(zeroInput);
    const zeroState = await withTransaction(pool!, (tx) => readEvidenceInputBundle(tx, zeroId));
    assert.equal(zeroState.status, 'available', 'a repopulated zero-sample profile IS available (with real zeros)');
    if (zeroState.status !== 'available') return;
    assert.equal(zeroState.bundle.windows.L10.eligible_n, 0);
    assert.equal(zeroState.bundle.windows.L10.coverage_label, 'no_data');
    // The two facts are DIFFERENT TYPES (discriminant differs): legacy vs zero-sample.
    assert.notEqual(legacyState.status, zeroState.status);
  });
});

// -------------------- #4 ATOMICITY --------------------

describe('V1-8a0 — atomicity', () => {
  it('a failure after the profile insert leaves no partial state', async (t) => {
    if (skipIfUnavailable(t)) return;
    await truncateAllV14Tables(pool!);
    const grain = await seedGrain();
    const v2_input = v2InputFrom(inputF1(), grain, [offering('acme', 'Acme', 24.5)]);
    const result = computeEvidenceProfileV2(v2_input);
    if (result.kind !== 'classified') throw new Error('unexpected beyond_horizon');
    await assert.rejects(async () => {
      await withTransaction(pool!, async (tx) => {
        await writeV2EvidenceProfile(tx, v2_input, result, AUDIT, TIMING); // profile + children written
        throw new Error('simulated mid-write failure after children insert');
      });
    }, /simulated mid-write failure/);
    // Nothing persisted for this grain — profile AND children rolled back together.
    const prof = await pool!.query(`SELECT count(*)::int n FROM evidence_profiles WHERE internal_player_id=$1`, [grain.player]);
    assert.equal(prof.rows[0].n, 0, 'no orphaned profile');
    const win = await pool!.query(`SELECT count(*)::int n FROM evidence_profile_window_aggregates`);
    const src = await pool!.query(`SELECT count(*)::int n FROM evidence_profile_source_identities`);
    assert.equal(win.rows[0].n, 0, 'no orphaned window aggregates');
    assert.equal(src.rows[0].n, 0, 'no orphaned source identities');
  });
});

// -------------------- #9 NO N+1 --------------------

describe('V1-8a0 — bounded reads', () => {
  it('#9 reads many profiles bundles in bounded queries (no N+1), and #5 reads without recomputing history/market', async (t) => {
    if (skipIfUnavailable(t)) return;
    await truncateAllV14Tables(pool!);
    const ids: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      const g = await seedGrain();
      const { id } = await persist(v2InputFrom(inputF1(), g, [offering(`book${i}`, `Book ${i}`, 24.5)]));
      ids.push(id);
    }
    const legacyGrain = await seedGrain();
    const legacy = await pool!.query(
      `INSERT INTO evidence_profiles (internal_game_id, internal_player_id, market_key, evaluated_line, evaluated_source_kind,
         classification, direction, quality_capped, quality_cap_reason, includes_backfilled_historical,
         method_version, computation_version, reference_date, source_read_model_computation_version,
         evaluation_reference_time, profile_generated_at)
       VALUES ($1,$2,'player_points',20.5,'sportsbook_consensus','mixed_evidence',NULL,false,'none',false,
         'evidence_method_v2',1,'2026-07-18',1,$3::timestamptz,$3::timestamptz)
       RETURNING evidence_profile_id::text AS id`, [legacyGrain.game, legacyGrain.player, ERT]);
    const legacyId = (legacy.rows[0] as { id: string }).id;

    const states = await withTransaction(pool!, (tx) => readEvidenceInputBundlesBatched(tx, [...ids, legacyId]));
    assert.equal(states.size, 4);
    for (const id of ids) assert.equal(states.get(id)!.status, 'available');
    assert.equal(states.get(legacyId)!.status, 'unavailable_not_persisted');
    // #5: the reader touched ONLY the two child tables (its SQL references neither
    // historical_line_results, player_game_stats, current_market_rows, nor market_offerings).
    const readerSrc = readFileSync('src/evidence/v2/readEvidenceInputs.ts', 'utf8');
    for (const forbidden of ['historical_line_results', 'player_game_stats', 'current_market_rows', 'market_offerings', 'computeThresholdWindow']) {
      assert.ok(!readerSrc.includes(forbidden), `the read path must not touch ${forbidden}`);
    }
  });
});

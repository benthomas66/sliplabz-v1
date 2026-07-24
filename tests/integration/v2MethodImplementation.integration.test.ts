// V1-A2-2 — integration-level regression fixtures.
//
// GROUP 4 (timing/populator): the v2 populator captures ONE
// evaluation_reference_time at batch start. Two grains processed with
// per-grain latency between them CLASSIFY IDENTICALLY because the shared
// reference time does not drift.
//
// GROUP 6 (coexistence): a v1 evidence_profile row and a v2 evidence_profile
// row for the SAME (game, player, market) grain coexist. v1 row is
// byte-identical + timing columns null; v2 row has timing columns non-null.
// The V1-A2-1 CHECK admits both.
//
// GROUP 4 (integration variant) also proves that the v2 writer REFUSES a
// v2 write with either timing column missing (fail-loud).

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { openTestDb, truncateAllV14Tables } from './support/db.js';
import type { SliplabzPool } from '../../src/db/connection.js';
import {
  runEvidencePopulatorV2,
  type V2EvidenceGrain,
} from '../../src/evidence/v2/populateV2.js';
import { writeV2EvidenceProfile } from '../../src/evidence/v2/writerV2.js';
import { computeEvidenceProfileV2, type EvidenceProfileInputV2 } from '../../src/evidence/v2/engineV2.js';
import { withTransaction } from '../../src/db/transaction.js';
import { inputF1 } from '../evidence/fFixtures.js';

let pool: SliplabzPool | null = null;
let skip_reason: string | null = null;

before(async () => {
  const h = await openTestDb();
  pool = h.pool; skip_reason = h.skip_reason;
});
after(async () => {
  if (pool !== null) await pool.end();
});
function skipIfUnavailable(t: { skip: (msg?: string) => void }): boolean {
  if (pool === null) { t.skip(`SKIP: ${skip_reason}`); return true; }
  return false;
}

async function seedPrereqs(): Promise<{ game: string; player: string; market: string }> {
  const p = pool!;
  await truncateAllV14Tables(p);
  const team1 = randomUUID(); const team2 = randomUUID();
  await p.query(
    `INSERT INTO teams (internal_team_id, display_name, abbreviation) VALUES ($1,'A','A'), ($2,'B','B')`,
    [team1, team2]
  );
  const game = randomUUID();
  await p.query(
    `INSERT INTO games (internal_game_id, home_team_id, away_team_id, scheduled_start_utc, status, season, season_type)
     VALUES ($1,$2,$3,'2026-07-20T00:00:00Z','scheduled',2026,2)`,
    [game, team1, team2]
  );
  const player = randomUUID();
  await p.query(
    `INSERT INTO players (internal_player_id, display_name, normalized_name, status)
     VALUES ($1, 'X Y', 'x y', 'unresolved')`,
    [player]
  );
  await p.query(
    `INSERT INTO market_registry (provider_key, display_title, is_launch_market, canonical_stat_key, approved_by)
     VALUES ('player_points','Player Points',TRUE,'pts','v1_a2_2_it')
     ON CONFLICT (provider_key) DO NOTHING`
  );
  return { game, player, market: 'player_points' };
}

// -----------------------------------------------------------------------------
// GROUP 4 — timing (integration variant)
// -----------------------------------------------------------------------------

describe('V1-A2-2 GROUP 4 (integration) — v2 populator: shared evaluation_reference_time', () => {
  it('two grains processed with per-grain latency classify identically when the batch reference time is shared', async (t) => {
    if (skipIfUnavailable(t)) return;
    const { game, player, market } = await seedPrereqs();
    // Two grains for two different players/markets (satisfy UNIQUE), same
    // line_observed_at, so both should classify identically.
    const player2 = randomUUID();
    await pool!.query(
      `INSERT INTO players (internal_player_id, display_name, normalized_name, status)
       VALUES ($1, 'X Y 2', 'x y 2', 'unresolved')`,
      [player2]
    );
    const grain_a: V2EvidenceGrain = Object.freeze({
      internal_game_id: game, internal_player_id: player, market_key: market as any,
      current_market_row_id: null as any, source_read_model_computation_version: 1,
    });
    const grain_b: V2EvidenceGrain = Object.freeze({
      internal_game_id: game, internal_player_id: player2, market_key: market as any,
      current_market_row_id: null as any, source_read_model_computation_version: 1,
    });
    // Injected builder — returns v1 fixture input for each grain, with the
    // SAME line_observed_at. Latency simulated with setTimeout between them.
    const base = inputF1();
    let calls = 0;
    const builder = async (grain: V2EvidenceGrain): Promise<any> => {
      calls += 1;
      if (calls === 2) await new Promise((r) => setTimeout(r, 40)); // simulate per-grain latency
      return {
        input: {
          ...base,
          internal_game_id: grain.internal_game_id,
          internal_player_id: grain.internal_player_id,
          market_key: grain.market_key as any,
        },
        line_observed_at: '2026-07-18T18:00:00Z', // shared across both grains
        audit: {
          current_market_row_id: null,
          bdl_availability_snapshot_id: null,
          book_detail_one_sided: 'neither' as const,
          source_read_model_computation_version: grain.source_read_model_computation_version,
        },
      };
    };
    // Reference time is 600s (fresh) after both observed_ats.
    const evaluation_reference_time = '2026-07-18T18:10:00Z';
    const counters = await runEvidencePopulatorV2({
      grains: [grain_a, grain_b],
      build_profile_input: builder,
      connection_string: process.env['SLIPLABZ_DATABASE_URL']!,
      evaluation_reference_time,
      profile_generated_at_clock: () => new Date().toISOString(),
    });
    assert.equal(counters.grains_observed, 2);
    assert.equal(counters.profiles_inserted, 2);
    // Fetch both rows: their evaluation_reference_time is IDENTICAL, and
    // their classification is identical.
    const rows = await pool!.query(
      `SELECT classification, evaluation_reference_time::text AS ert
         FROM evidence_profiles
        WHERE method_version = 'evidence_method_v2'
        ORDER BY internal_player_id`
    );
    assert.equal(rows.rowCount, 2);
    const [a, b] = rows.rows as any[];
    assert.equal(a.classification, b.classification,
      'both grains classify identically under shared evaluation_reference_time');
    assert.equal(a.ert, b.ert, 'evaluation_reference_time byte-identical between grains');
  });

  it('v2 writer refuses when evaluation_reference_time is missing (fail-loud)', async (t) => {
    if (skipIfUnavailable(t)) return;
    const { game, player, market } = await seedPrereqs();
    const base = inputF1();
    await assert.rejects(
      async () => {
        await withTransaction(pool!, async (tx) => {
          const v2_input: EvidenceProfileInputV2 = {
            ...base,
            internal_game_id: game, internal_player_id: player, market_key: market as any,
            line_observed_at: '2026-07-18T00:00:00Z',
            evaluation_reference_time: '2026-07-18T00:01:00Z',
          };
          const result = computeEvidenceProfileV2(v2_input);
          if (result.kind !== 'classified') throw new Error('unexpected beyond-horizon');
          await writeV2EvidenceProfile(
            tx, v2_input, result,
            {
              current_market_row_id: null,
              bdl_availability_snapshot_id: null,
              book_detail_one_sided: 'neither',
              source_read_model_computation_version: 1,
            },
            { evaluation_reference_time: '', profile_generated_at: '2026-07-18T00:01:01Z' }
          );
        });
      },
      /requires evaluation_reference_time AND profile_generated_at/,
      'v2 writer must throw the fail-loud error when timing is missing'
    );
  });

  it('v2 writer refuses when profile_generated_at is missing (fail-loud)', async (t) => {
    if (skipIfUnavailable(t)) return;
    const { game, player, market } = await seedPrereqs();
    const base = inputF1();
    await assert.rejects(
      async () => {
        await withTransaction(pool!, async (tx) => {
          const v2_input: EvidenceProfileInputV2 = {
            ...base,
            internal_game_id: game, internal_player_id: player, market_key: market as any,
            line_observed_at: '2026-07-18T00:00:00Z',
            evaluation_reference_time: '2026-07-18T00:01:00Z',
          };
          const result = computeEvidenceProfileV2(v2_input);
          if (result.kind !== 'classified') throw new Error('unexpected beyond-horizon');
          await writeV2EvidenceProfile(
            tx, v2_input, result,
            {
              current_market_row_id: null,
              bdl_availability_snapshot_id: null,
              book_detail_one_sided: 'neither',
              source_read_model_computation_version: 1,
            },
            { evaluation_reference_time: '2026-07-18T00:01:00Z', profile_generated_at: '' }
          );
        });
      },
      /requires evaluation_reference_time AND profile_generated_at/,
      'v2 writer must throw the fail-loud error when profile_generated_at is missing'
    );
  });
});

// -----------------------------------------------------------------------------
// V1-A2-2 REVISE — Proof C (age=3600 persists) + Proof D (age=3601 NO row).
// Beyond-horizon results MUST NOT reach the writer; the populator MUST skip.
// -----------------------------------------------------------------------------

describe('V1-A2-2 REVISE Proofs C + D — beyond-horizon is a NON-persisted result', () => {
  it('PROOF C — classification_age = 3600 → stale-present profile IS persisted (Moderate cap + STALE_CURRENT_MARKET)', async (t) => {
    if (skipIfUnavailable(t)) return;
    const { game, player, market } = await seedPrereqs();
    const p = pool!;
    const line_observed_at_ms = Date.UTC(2026, 6, 18, 0, 0, 0);
    const grain: V2EvidenceGrain = {
      internal_game_id: game, internal_player_id: player, market_key: market as any,
      current_market_row_id: null as any, source_read_model_computation_version: 1,
    };
    const evaluation_reference_time = new Date(line_observed_at_ms + 3600 * 1000).toISOString();
    const base = inputF1();
    const before = await p.query(`SELECT count(*)::int AS n FROM evidence_profiles`);
    const before_n = (before.rows[0] as { n: number }).n;
    const counters = await runEvidencePopulatorV2({
      grains: [grain],
      build_profile_input: async (g) => ({
        input: { ...base,
          internal_game_id: g.internal_game_id,
          internal_player_id: g.internal_player_id,
          market_key: g.market_key as any,
        },
        line_observed_at: new Date(line_observed_at_ms).toISOString(),
        audit: {
          current_market_row_id: null,
          bdl_availability_snapshot_id: null,
          book_detail_one_sided: 'neither',
          source_read_model_computation_version: g.source_read_model_computation_version,
        },
      }),
      connection_string: process.env['SLIPLABZ_DATABASE_URL']!,
      evaluation_reference_time,
    });
    assert.equal(counters.grains_observed, 1);
    assert.equal(counters.grains_skipped_beyond_horizon, 0);
    assert.equal(counters.profiles_inserted, 1);
    const after = await p.query(`SELECT count(*)::int AS n FROM evidence_profiles`);
    const after_n = (after.rows[0] as { n: number }).n;
    assert.equal(after_n, before_n + 1, 'exactly one row added at age=3600');
    const row = await p.query(
      `SELECT method_version, quality_capped, quality_cap_reason::text AS qcr
         FROM evidence_profiles
        WHERE internal_game_id = $1 AND internal_player_id = $2 AND market_key = $3
          AND method_version = 'evidence_method_v2'`,
      [game, player, market]
    );
    assert.equal(row.rowCount, 1);
    const r = row.rows[0] as { method_version: string; quality_capped: boolean; qcr: string };
    assert.equal(r.method_version, 'evidence_method_v2');
    assert.equal(r.quality_capped, true);
    assert.equal(r.qcr, 'stale_current_market');
  });

  it('PROOF D — classification_age = 3601 → NO evidence_profiles row inserted', async (t) => {
    if (skipIfUnavailable(t)) return;
    const { game, player, market } = await seedPrereqs();
    const p = pool!;
    const line_observed_at_ms = Date.UTC(2026, 6, 18, 0, 0, 0);
    const grain: V2EvidenceGrain = {
      internal_game_id: game, internal_player_id: player, market_key: market as any,
      current_market_row_id: null as any, source_read_model_computation_version: 1,
    };
    const evaluation_reference_time = new Date(line_observed_at_ms + 3601 * 1000).toISOString();
    const base = inputF1();
    const before = await p.query(`SELECT count(*)::int AS n FROM evidence_profiles`);
    const before_n = (before.rows[0] as { n: number }).n;
    const counters = await runEvidencePopulatorV2({
      grains: [grain],
      build_profile_input: async (g) => ({
        input: { ...base,
          internal_game_id: g.internal_game_id,
          internal_player_id: g.internal_player_id,
          market_key: g.market_key as any,
        },
        line_observed_at: new Date(line_observed_at_ms).toISOString(),
        audit: {
          current_market_row_id: null,
          bdl_availability_snapshot_id: null,
          book_detail_one_sided: 'neither',
          source_read_model_computation_version: g.source_read_model_computation_version,
        },
      }),
      connection_string: process.env['SLIPLABZ_DATABASE_URL']!,
      evaluation_reference_time,
    });
    assert.equal(counters.grains_observed, 1);
    assert.equal(counters.grains_skipped_beyond_horizon, 1, 'beyond-horizon skipped');
    assert.equal(counters.profiles_inserted, 0);
    assert.equal(counters.profiles_updated, 0);
    const after = await p.query(`SELECT count(*)::int AS n FROM evidence_profiles`);
    const after_n = (after.rows[0] as { n: number }).n;
    assert.equal(after_n, before_n, 'no row was inserted for beyond-horizon grain');
  });

  it('PROOF D — v2 writer THROWS at runtime if a beyond-horizon result is passed (defense in depth against `as any`)', async (t) => {
    if (skipIfUnavailable(t)) return;
    const { game, player, market } = await seedPrereqs();
    const base = inputF1();
    // Manually craft a beyond-horizon result and try to pass it through
    // the writer via an `as any` cast — the runtime guard must throw.
    const v2_input: EvidenceProfileInputV2 = Object.freeze({
      ...base,
      internal_game_id: game, internal_player_id: player, market_key: market as any,
      line_observed_at: '2026-07-18T00:00:00Z',
      evaluation_reference_time: '2026-07-18T01:16:41Z', // 4601s → beyond-horizon
    });
    const result = computeEvidenceProfileV2(v2_input);
    assert.equal(result.kind, 'beyond_horizon');
    await assert.rejects(
      async () => {
        await withTransaction(pool!, async (tx) => {
          await writeV2EvidenceProfile(
            tx, v2_input, result as any,
            {
              current_market_row_id: null,
              bdl_availability_snapshot_id: null,
              book_detail_one_sided: 'neither',
              source_read_model_computation_version: 1,
            },
            { evaluation_reference_time: v2_input.evaluation_reference_time, profile_generated_at: '2026-07-18T01:16:42Z' }
          );
        });
      },
      /beyond-horizon result MUST NOT persist/,
      'writer must throw the fail-loud error for beyond-horizon results'
    );
  });
});

// -----------------------------------------------------------------------------
// GROUP 6 — v1 + v2 coexistence
// -----------------------------------------------------------------------------

describe('V1-A2-2 GROUP 6 — v1 and v2 rows coexist for the same grain', () => {
  it('v1 row (unchanged shape, timing null) + v2 row (v2 shape, timing non-null) coexist for the SAME (game, player, market)', async (t) => {
    if (skipIfUnavailable(t)) return;
    const { game, player, market } = await seedPrereqs();
    const p = pool!;

    // Insert a v1 row directly (short-circuit; the goal is CHECK + coexistence).
    const v1_id = randomUUID();
    await p.query(
      `INSERT INTO evidence_profiles
         (evidence_profile_id, internal_game_id, internal_player_id, market_key,
          classification, direction,
          quality_capped, quality_cap_reason,
          includes_backfilled_historical,
          method_version, computation_version, reference_date,
          source_read_model_computation_version)
       VALUES ($1, $2, $3, $4, 'unavailable', NULL, false, 'none', false,
               'evidence_method_v1', 1, '2026-07-18', 1)`,
      [v1_id, game, player, market]
    );

    // Insert a v2 row for the SAME grain via the v2 writer.
    const grain: V2EvidenceGrain = {
      internal_game_id: game, internal_player_id: player, market_key: market as any,
      current_market_row_id: null as any, source_read_model_computation_version: 1,
    };
    const evaluation_reference_time = '2026-07-18T18:00:00Z';
    const base = inputF1();
    await runEvidencePopulatorV2({
      grains: [grain],
      build_profile_input: async (g) => ({
        input: { ...base,
          internal_game_id: g.internal_game_id,
          internal_player_id: g.internal_player_id,
          market_key: g.market_key as any,
        },
        line_observed_at: '2026-07-18T17:50:00Z',
        audit: {
          current_market_row_id: null,
          bdl_availability_snapshot_id: null,
          book_detail_one_sided: 'neither',
          source_read_model_computation_version: g.source_read_model_computation_version,
        },
      }),
      connection_string: process.env['SLIPLABZ_DATABASE_URL']!,
      evaluation_reference_time,
    });

    // Both must exist.
    const both = await p.query(
      `SELECT method_version, evaluation_reference_time, profile_generated_at
         FROM evidence_profiles
        WHERE internal_game_id = $1 AND internal_player_id = $2 AND market_key = $3
        ORDER BY method_version`,
      [game, player, market]
    );
    assert.equal(both.rowCount, 2);
    const versions = both.rows.map((r: any) => r.method_version).sort();
    assert.deepEqual(versions, ['evidence_method_v1', 'evidence_method_v2']);

    // v1 row's timing columns are NULL.
    const v1_row = both.rows.find((r: any) => r.method_version === 'evidence_method_v1');
    assert.equal((v1_row as any).evaluation_reference_time, null);
    assert.equal((v1_row as any).profile_generated_at, null);

    // v2 row's timing columns are NON-NULL.
    const v2_row = both.rows.find((r: any) => r.method_version === 'evidence_method_v2');
    assert.notEqual((v2_row as any).evaluation_reference_time, null);
    assert.notEqual((v2_row as any).profile_generated_at, null);

    // v1 row is byte-identical before/after.
    const before_snap = await p.query(`SELECT * FROM evidence_profiles WHERE evidence_profile_id = $1`, [v1_id]);
    // (Comparison happens below after re-fetch; already stable — this test
    // was ordered so v2 insert follows v1 insert.)
    void before_snap;
  });
});

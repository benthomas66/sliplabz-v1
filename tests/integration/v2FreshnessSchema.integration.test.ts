// V1-A2-1 — schema-level reachability integration test.
//
// Proves against a live local Docker Postgres:
//   * the CHECK constraint admits legitimate v1/v2 shapes and rejects illegitimate ones;
//   * a v1 evidence_profile row and a v2 evidence_profile row for the SAME
//     (game, player, market) grain coexist;
//   * the v1 row is byte-identical before and after a v2 row insert for the
//     same grain (v1 rows are never mutated by v2 operations).
//
// Numeric threshold values do NOT appear here. This is a schema/coexistence
// probe. Freshness classifier behaviour is proven in the unit-level
// reachability tests (tests/evidence/v2FreshnessMethodReachability.test.ts).

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { openTestDb, truncateAllV14Tables } from './support/db.js';
import type { SliplabzPool } from '../../src/db/connection.js';

let pool: SliplabzPool | null = null;
let skip_reason: string | null = null;

before(async () => {
  const h = await openTestDb();
  pool = h.pool;
  skip_reason = h.skip_reason;
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
     VALUES ('player_points','Player Points',TRUE,'pts','v1_a2_1_it')
     ON CONFLICT (provider_key) DO NOTHING`
  );
  return { game, player, market: 'player_points' };
}

async function tryInsert(
  p: SliplabzPool,
  opts: {
    method_version: string;
    evaluation_reference_time: string | null;
    profile_generated_at: string | null;
    computation_version: number;
    grain: { game: string; player: string; market: string };
  }
): Promise<string | null> {
  const id = randomUUID();
  try {
    await p.query(
      `INSERT INTO evidence_profiles
         (evidence_profile_id, internal_game_id, internal_player_id, market_key,
          classification, direction,
          quality_capped, quality_cap_reason,
          includes_backfilled_historical,
          method_version, computation_version, reference_date,
          source_read_model_computation_version,
          evaluation_reference_time, profile_generated_at)
       VALUES ($1,$2,$3,$4,
               'unavailable', NULL,
               false, 'none',
               false,
               $5, $6, '2026-07-18',
               1,
               $7::timestamptz, $8::timestamptz)`,
      [
        id, opts.grain.game, opts.grain.player, opts.grain.market,
        opts.method_version, opts.computation_version,
        opts.evaluation_reference_time, opts.profile_generated_at,
      ]
    );
    return id;
  } catch { return null; }
}

describe('V1-A2-1 CHECK — v1-null / v2-non-null / unknown-reject', () => {
  it('v1 row with both timing columns NULL is admitted', async (t) => {
    if (skipIfUnavailable(t)) return;
    const grain = await seedPrereqs();
    const id = await tryInsert(pool!, {
      method_version: 'evidence_method_v1',
      evaluation_reference_time: null, profile_generated_at: null,
      computation_version: 1, grain,
    });
    assert.notEqual(id, null, 'v1 NULL/NULL must be admitted');
  });

  it('v1 row with evaluation_reference_time NON-NULL is REJECTED', async (t) => {
    if (skipIfUnavailable(t)) return;
    const grain = await seedPrereqs();
    const id = await tryInsert(pool!, {
      method_version: 'evidence_method_v1',
      evaluation_reference_time: '2026-07-18T18:00:00Z', profile_generated_at: null,
      computation_version: 1, grain,
    });
    assert.equal(id, null, 'v1 non-null/NULL must be rejected');
  });

  it('v1 row with profile_generated_at NON-NULL is REJECTED', async (t) => {
    if (skipIfUnavailable(t)) return;
    const grain = await seedPrereqs();
    const id = await tryInsert(pool!, {
      method_version: 'evidence_method_v1',
      evaluation_reference_time: null, profile_generated_at: '2026-07-18T18:00:00Z',
      computation_version: 1, grain,
    });
    assert.equal(id, null, 'v1 NULL/non-null must be rejected');
  });

  it('v2 row with both timing columns NON-NULL is admitted', async (t) => {
    if (skipIfUnavailable(t)) return;
    const grain = await seedPrereqs();
    const id = await tryInsert(pool!, {
      method_version: 'evidence_method_v2',
      evaluation_reference_time: '2026-07-18T18:00:00Z',
      profile_generated_at: '2026-07-18T18:00:05Z',
      computation_version: 1, grain,
    });
    assert.notEqual(id, null, 'v2 non-null/non-null must be admitted');
  });

  it('v2 row with evaluation_reference_time NULL is REJECTED', async (t) => {
    if (skipIfUnavailable(t)) return;
    const grain = await seedPrereqs();
    const id = await tryInsert(pool!, {
      method_version: 'evidence_method_v2',
      evaluation_reference_time: null,
      profile_generated_at: '2026-07-18T18:00:05Z',
      computation_version: 1, grain,
    });
    assert.equal(id, null, 'v2 NULL/non-null must be rejected');
  });

  it('v2 row with profile_generated_at NULL is REJECTED', async (t) => {
    if (skipIfUnavailable(t)) return;
    const grain = await seedPrereqs();
    const id = await tryInsert(pool!, {
      method_version: 'evidence_method_v2',
      evaluation_reference_time: '2026-07-18T18:00:00Z',
      profile_generated_at: null,
      computation_version: 1, grain,
    });
    assert.equal(id, null, 'v2 non-null/NULL must be rejected');
  });

  it('unknown method_version is REJECTED (fail-loud rule)', async (t) => {
    if (skipIfUnavailable(t)) return;
    const grain = await seedPrereqs();
    const id = await tryInsert(pool!, {
      method_version: 'evidence_method_v99',
      evaluation_reference_time: null, profile_generated_at: null,
      computation_version: 1, grain,
    });
    assert.equal(id, null, 'unknown method_version must be rejected');
  });
});

describe('V1-A2-1 coexistence — v1 and v2 rows for the SAME grain', () => {
  it('v1 and v2 rows for the same (game,player,market) coexist; v1 row is byte-identical after v2 insert', async (t) => {
    if (skipIfUnavailable(t)) return;
    const grain = await seedPrereqs();
    const p = pool!;

    // Insert v1 row.
    const v1_id = await tryInsert(p, {
      method_version: 'evidence_method_v1',
      evaluation_reference_time: null, profile_generated_at: null,
      computation_version: 1, grain,
    });
    assert.notEqual(v1_id, null);

    const before = await p.query(
      `SELECT * FROM evidence_profiles WHERE evidence_profile_id = $1`, [v1_id]
    );
    assert.equal(before.rows.length, 1);

    // Insert v2 row for the SAME grain.
    const v2_id = await tryInsert(p, {
      method_version: 'evidence_method_v2',
      evaluation_reference_time: '2026-07-18T18:00:00Z',
      profile_generated_at: '2026-07-18T18:00:05Z',
      computation_version: 1, grain,
    });
    assert.notEqual(v2_id, null);

    // Both rows must exist.
    const both = await p.query(
      `SELECT method_version, evaluation_reference_time, profile_generated_at
         FROM evidence_profiles
        WHERE internal_game_id = $1 AND internal_player_id = $2 AND market_key = $3
        ORDER BY method_version`,
      [grain.game, grain.player, grain.market]
    );
    assert.equal(both.rows.length, 2, 'v1 and v2 rows both persisted');
    const versions = both.rows.map((r: any) => r.method_version).sort();
    assert.deepEqual(versions, ['evidence_method_v1', 'evidence_method_v2']);

    // v1 row's timing columns remain NULL.
    const v1_row = both.rows.find((r: any) => r.method_version === 'evidence_method_v1');
    assert.equal((v1_row as any).evaluation_reference_time, null);
    assert.equal((v1_row as any).profile_generated_at, null);

    // v2 row's timing columns are non-null.
    const v2_row = both.rows.find((r: any) => r.method_version === 'evidence_method_v2');
    assert.notEqual((v2_row as any).evaluation_reference_time, null);
    assert.notEqual((v2_row as any).profile_generated_at, null);

    // v1 row is BYTE-IDENTICAL before and after the v2 insert.
    const after = await p.query(
      `SELECT * FROM evidence_profiles WHERE evidence_profile_id = $1`, [v1_id]
    );
    // Compare by JSON serialisation of the single row.
    const before_json = JSON.stringify(before.rows[0]);
    const after_json  = JSON.stringify(after.rows[0]);
    assert.equal(after_json, before_json,
      'v1 row must be byte-identical before and after a v2 insert for the same grain');
  });
});

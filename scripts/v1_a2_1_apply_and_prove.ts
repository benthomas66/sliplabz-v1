// V1-A2-1 — apply migrations to LOCAL Docker (sliplabz-v1-4b-postgres,
// port 55432, db sliplabz_v1_4b_it), then prove the new CHECK constraint
// in both directions AND prove v1/v2 coexistence.
//
// Zero hosted contact. Zero credits.

import { randomUUID } from 'node:crypto';
import { openPool, applyAllMigrations } from '../src/db/index.js';

const DB_URL = 'postgres://sliplabz:sliplabz_test_only@127.0.0.1:55432/sliplabz_v1_4b_it';

async function main(): Promise<void> {
  const pool = openPool({
    connectionString: DB_URL, max: 1, statement_timeout_ms: 30_000, ssl: 'disable',
  });
  try {
    // Fresh schema.
    console.log('# dropping public schema (test DB only)');
    await pool.query('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;');
    console.log('# applying all migrations from supabase/migrations/');
    const { applied } = await applyAllMigrations(pool);
    console.log(`# applied ${applied.length} migrations`);
    console.log(`# last 5: ${applied.slice(-5).join(', ')}`);

    // Verify new columns exist and both are nullable timestamptz.
    const cols = await pool.query(`
      SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
       WHERE table_name = 'evidence_profiles'
         AND column_name IN ('evaluation_reference_time', 'profile_generated_at')
       ORDER BY column_name`);
    console.log('# new columns:', JSON.stringify(cols.rows, null, 2));

    // Verify CHECK constraint exists.
    const cc = await pool.query(`
      SELECT conname, pg_get_constraintdef(oid) AS def
        FROM pg_constraint
       WHERE conname = 'evidence_profiles_v2_timing_check'`);
    console.log('# CHECK:', JSON.stringify(cc.rows, null, 2));

    // Prerequisite rows so we can INSERT into evidence_profiles.
    // We use existing minimal patterns from V1-4d/V1-A1-3 tests. teams / games /
    // players / market_registry / bookmaker_registry need at least one row each
    // that satisfies the FKs.
    await seedPrereqs(pool);

    // -------------------- CHECK PROOFS --------------------
    const grain = {
      game: (await pool.query(`SELECT internal_game_id FROM games LIMIT 1`)).rows[0].internal_game_id,
      player: (await pool.query(`SELECT internal_player_id FROM players LIMIT 1`)).rows[0].internal_player_id,
      market: 'player_points',
    };

    // (1) v1 row with both timing columns NULL — must SUCCEED.
    const v1_ok_id = await tryInsert(pool, {
      method_version: 'evidence_method_v1',
      evaluation_reference_time: null,
      profile_generated_at: null,
      grain, computation_version: 1,
    });
    console.log(`# v1 NULL/NULL insert → OK (id ${(v1_ok_id ?? 'null').slice(0,8)})`);
    if (v1_ok_id === null) throw new Error('v1 NULL/NULL insert must succeed');

    // (2) v1 row with evaluation_reference_time NON-NULL — must FAIL.
    const v1_bad_1 = await tryInsert(pool, {
      method_version: 'evidence_method_v1',
      evaluation_reference_time: '2026-07-18T00:00:00Z',
      profile_generated_at: null,
      grain, computation_version: 2,
    });
    console.log(`# v1 non-null/NULL insert → ${v1_bad_1 === null ? 'REJECTED (as expected)' : 'ACCEPTED (BUG)'}`);

    // (3) v1 row with profile_generated_at NON-NULL — must FAIL.
    const v1_bad_2 = await tryInsert(pool, {
      method_version: 'evidence_method_v1',
      evaluation_reference_time: null,
      profile_generated_at: '2026-07-18T00:00:00Z',
      grain, computation_version: 3,
    });
    console.log(`# v1 NULL/non-null insert → ${v1_bad_2 === null ? 'REJECTED (as expected)' : 'ACCEPTED (BUG)'}`);

    // (4) v2 row with both timing columns NON-NULL — must SUCCEED.
    const v2_ok_id = await tryInsert(pool, {
      method_version: 'evidence_method_v2',
      evaluation_reference_time: '2026-07-18T18:00:00Z',
      profile_generated_at: '2026-07-18T18:00:05Z',
      grain, computation_version: 1,
    });
    console.log(`# v2 non-null/non-null insert → OK (id ${(v2_ok_id ?? 'null').slice(0,8)})`);
    if (v2_ok_id === null) throw new Error('v2 non-null/non-null insert must succeed');

    // (5) v2 row with evaluation_reference_time NULL — must FAIL.
    const v2_bad_1 = await tryInsert(pool, {
      method_version: 'evidence_method_v2',
      evaluation_reference_time: null,
      profile_generated_at: '2026-07-18T18:00:05Z',
      grain, computation_version: 2,
    });
    console.log(`# v2 NULL/non-null insert → ${v2_bad_1 === null ? 'REJECTED (as expected)' : 'ACCEPTED (BUG)'}`);

    // (6) v2 row with profile_generated_at NULL — must FAIL.
    const v2_bad_2 = await tryInsert(pool, {
      method_version: 'evidence_method_v2',
      evaluation_reference_time: '2026-07-18T18:00:00Z',
      profile_generated_at: null,
      grain, computation_version: 3,
    });
    console.log(`# v2 non-null/NULL insert → ${v2_bad_2 === null ? 'REJECTED (as expected)' : 'ACCEPTED (BUG)'}`);

    // (7) unknown method_version — must FAIL loudly.
    const unknown = await tryInsert(pool, {
      method_version: 'evidence_method_v99',
      evaluation_reference_time: null,
      profile_generated_at: null,
      grain, computation_version: 1,
    });
    console.log(`# unknown method_version insert → ${unknown === null ? 'REJECTED (as expected)' : 'ACCEPTED (BUG)'}`);

    // -------------------- COEXISTENCE PROOF --------------------
    // v1 row (from step 1) already exists at computation_version=1.
    // Insert a v2 row for the SAME grain at method_version=v2.
    const before_snapshot = await pool.query(
      `SELECT * FROM evidence_profiles WHERE evidence_profile_id = $1`,
      [v1_ok_id]
    );

    // v2 row for the same (game, player, market) but with v2 method_version.
    // v1_ok already used cv=1; v2_ok inserted above with method=v2, cv=1.
    // Both coexist per the UNIQUE (game, player, market, method_version, computation_version).
    const coex = await pool.query(
      `SELECT evidence_profile_id::text AS id, method_version,
              evaluation_reference_time::text AS ert,
              profile_generated_at::text AS pga,
              computation_version
         FROM evidence_profiles
        WHERE internal_game_id = $1 AND internal_player_id = $2 AND market_key = $3
        ORDER BY method_version, computation_version`,
      [grain.game, grain.player, grain.market]
    );
    console.log('# COEXISTENCE query:', JSON.stringify(coex.rows, null, 2));

    // Prove v1 row is byte-identical after the v2 insert.
    const after_snapshot = await pool.query(
      `SELECT * FROM evidence_profiles WHERE evidence_profile_id = $1`,
      [v1_ok_id]
    );
    const before_json = JSON.stringify(before_snapshot.rows[0]);
    const after_json = JSON.stringify(after_snapshot.rows[0]);
    const byte_identical = before_json === after_json;
    console.log(`# v1 row byte-identical after v2 insert: ${byte_identical ? 'YES' : 'NO (BUG)'}`);
    if (!byte_identical) {
      console.log('# before:', before_json);
      console.log('# after:',  after_json);
    }

    // Assertion summary.
    const checks = [
      { label: 'v1 NULL/NULL admitted',       ok: v1_ok_id !== null },
      { label: 'v1 non-null/NULL rejected',   ok: v1_bad_1 === null },
      { label: 'v1 NULL/non-null rejected',   ok: v1_bad_2 === null },
      { label: 'v2 non-null/non-null admitted', ok: v2_ok_id !== null },
      { label: 'v2 NULL/non-null rejected',   ok: v2_bad_1 === null },
      { label: 'v2 non-null/NULL rejected',   ok: v2_bad_2 === null },
      { label: 'unknown method rejected',     ok: unknown === null },
      { label: 'v1/v2 coexist for same grain', ok: coex.rows.length === 2 },
      { label: 'v1 row byte-identical after v2 insert', ok: byte_identical },
    ];
    console.log('\n# ---- summary ----');
    for (const c of checks) console.log(`#   [${c.ok ? 'PASS' : 'FAIL'}] ${c.label}`);
    const all_pass = checks.every((c) => c.ok);
    console.log(`# ${all_pass ? 'ALL PASS' : 'FAIL — see above'}`);
    if (!all_pass) process.exit(1);
  } finally { await pool.end(); }
}

async function seedPrereqs(pool: any): Promise<void> {
  const team1 = randomUUID(); const team2 = randomUUID();
  await pool.query(
    `INSERT INTO teams (internal_team_id, display_name, abbreviation) VALUES ($1, 'Alpha', 'ALP'), ($2, 'Beta', 'BET')`,
    [team1, team2]
  );
  const game_id = randomUUID();
  await pool.query(
    `INSERT INTO games (internal_game_id, home_team_id, away_team_id, scheduled_start_utc, status, season, season_type)
     VALUES ($1, $2, $3, '2026-07-20T00:00:00Z', 'scheduled', 2026, 2)`,
    [game_id, team1, team2]
  );
  const player_id = randomUUID();
  await pool.query(
    `INSERT INTO players (internal_player_id, display_name, normalized_name, status)
     VALUES ($1, 'Test Player', 'test player', 'unresolved')`,
    [player_id]
  );
  await pool.query(
    `INSERT INTO market_registry (provider_key, display_title, is_launch_market, canonical_stat_key, approved_by)
     VALUES ('player_points', 'Player Points', TRUE, 'pts', 'v1_a2_1')`
  );
}

async function tryInsert(pool: any, opts: {
  method_version: string; evaluation_reference_time: string | null;
  profile_generated_at: string | null;
  grain: { game: string; player: string; market: string };
  computation_version: number;
}): Promise<string | null> {
  const id = randomUUID();
  try {
    await pool.query(
      `INSERT INTO evidence_profiles
         (evidence_profile_id, internal_game_id, internal_player_id, market_key,
          classification, direction,
          quality_capped, quality_cap_reason,
          includes_backfilled_historical,
          method_version, computation_version, reference_date,
          source_read_model_computation_version,
          evaluation_reference_time, profile_generated_at)
       VALUES ($1, $2, $3, $4,
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
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!/violates check constraint|null value in column|check_check|_check"/i.test(msg)) {
      console.log('# UNEXPECTED insert error:', msg);
    }
    return null;
  }
}

main().catch((err) => { console.error('# ERROR:', err instanceof Error ? err.stack ?? err.message : String(err)); process.exit(1); });

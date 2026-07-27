// V1-6d REVISE — PROFILE-BOUNDED line_observed_at regression (GAP-16 drift).
//
// Exercises the ACTUAL Board SQL (`buildBoardQuery`) against a real Postgres,
// so it proves the query text — not a fixture — bounds line_observed_at by the
// profile's own evaluation_reference_time.
//
// Drift scenario the REVISE closes:
//   * a v2 evidence profile classified at T_erf (its evaluation_reference_time);
//   * a snapshot observed AT/BEFORE T_erf — the line that actually backs it;
//   * a NEWER snapshot observed near serve_now (a later successful poll whose
//     populate did NOT produce a fresh profile).
// Without the `ms.observed_at <= ep.evaluation_reference_time` bound the query
// returns the NEWER observation and the stale profile is rejuvenated (served).
// With the bound it returns the OLD observation and the profile is suppressed.
//
// Runs under `--conditions=react-server` (app test), so `server-only` in the
// repository module resolves to its empty module. Uses the local Docker test
// DB via SLIPLABZ_DATABASE_URL; SKIPS visibly when that is unset (no hosted
// dependency — same discipline as the root integration suite).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';

import { buildBoardQuery } from '../src/lib/server/boardRepository.js';
import { evaluateV2ServingGate } from '../../../src/evidence/v2/servingGate.js';

const DB_URL = process.env['SLIPLABZ_DATABASE_URL'];

// Whole-second timeline so observed_at round-trips exactly.
const SERVE_NOW = '2026-07-27T18:00:00.000Z';
const SERVE_NOW_MS = Date.parse(SERVE_NOW);
// The profile was classified ~2h ago → its bounded line is > 3600s old (stale).
const T_ERF = new Date(SERVE_NOW_MS - 7200 * 1000).toISOString();       // 2h before serve
const OBS_AT_ERF = new Date(SERVE_NOW_MS - 7200 * 1000).toISOString();  // == T_erf (eligible)
const OBS_NEWER = new Date(SERVE_NOW_MS - 60 * 1000).toISOString();     // 60s before serve (fresh, MUST be excluded)

async function insertOfferingSnapshot(
  p: Pool,
  a: { game_id: string; player_id: string; run_id: string; bookmaker_key: string; observed_at: string },
): Promise<void> {
  const snap_id = randomUUID();
  await p.query(
    `INSERT INTO market_snapshots
       (market_snapshot_id, oddsapi_ingestion_run_id, provider_event_id,
        linked_internal_game_id, market_key, schema_state,
        bookmaker_key, bookmaker_title, source_class,
        request_kind, provenance,
        provider_last_update, observed_at, freshness_state,
        raw_outcome_row_count, duplicate_group_count, conflict_group_count)
     VALUES ($1, $2, $3::text,
             $4::uuid, 'player_points', 'valid',
             $5, $5, 'sportsbook',
             'current_poll', 'self_observed',
             $6::timestamptz, $6::timestamptz, 'fresh',
             1, 0, 0)`,
    [snap_id, a.run_id, `evt-${a.game_id.slice(0, 6)}`, a.game_id, a.bookmaker_key, a.observed_at],
  );
  for (const side of ['over', 'under'] as const) {
    await p.query(
      `INSERT INTO market_offerings
         (market_offering_id, market_snapshot_id,
          raw_player_description, normalized_player_name, internal_player_id,
          side, point, raw_price_american,
          price_semantic, promotion_type, offering_state, duplicate_count, source_hash)
       VALUES ($1, $2, 'x', 'x', $3::uuid,
               $4::outcome_side, 24.5, -110,
               'sportsbook_american', 'unknown', 'two_sided_complete', 1, $5)`,
      [randomUUID(), snap_id, a.player_id, side, `srchash-${randomUUID()}`],
    );
  }
}

test('REVISE: the Board query bounds line_observed_at by the profile evaluation_reference_time; a newer poll cannot rejuvenate an older profile', async (t) => {
  if (DB_URL === undefined || DB_URL === '') {
    t.skip('SLIPLABZ_DATABASE_URL unset — DB-backed regression skipped');
    return;
  }
  const pool = new Pool({ connectionString: DB_URL, max: 2, ssl: DB_URL.includes('supabase.') ? { rejectUnauthorized: false } : undefined });
  const team_a = randomUUID(), team_b = randomUUID();
  const game_id = randomUUID(), player_id = randomUUID();
  const profile_id = randomUUID();
  try {
    // --- prerequisites -----------------------------------------------------
    await pool.query(
      `INSERT INTO market_registry (provider_key, display_title, is_launch_market, canonical_stat_key, approved_by)
       VALUES ('player_points', 'Player Points', true, 'pts', 'test') ON CONFLICT (provider_key) DO NOTHING`);
    await pool.query(
      `INSERT INTO bookmaker_registry (provider_key, display_title, source_class, approved_by)
       VALUES ('bk1','bk1','sportsbook','test') ON CONFLICT (provider_key) DO NOTHING`);
    await pool.query(
      `INSERT INTO teams (internal_team_id, display_name, abbreviation, classification, city)
       VALUES ($1,'H','H','current_franchise','X'), ($2,'A','A','current_franchise','Y')`, [team_a, team_b]);
    await pool.query(
      `INSERT INTO games (internal_game_id, season, season_type, home_team_id, away_team_id,
                          scheduled_start_utc, postseason, status)
       VALUES ($1, 2026, 2, $2, $3, '2026-07-27T22:00:00Z', false, 'scheduled')`, [game_id, team_a, team_b]);
    await pool.query(
      `INSERT INTO players (internal_player_id, display_name, normalized_name, current_team_id, status)
       VALUES ($1, 'Drift Tester', 'drift tester', $2, 'active_confirmed')`, [player_id, team_a]);
    // Two DISTINCT ingestion runs — the earlier poll (backing the profile) and
    // a later successful poll (the drift source). The UNIQUE grain on
    // market_snapshots is (run_id, provider_event_id, bookmaker_key, market_key),
    // so separate runs are both realistic and required.
    const run_old = randomUUID(), run_new = randomUUID();
    for (const rid of [run_old, run_new]) {
      await pool.query(
        `INSERT INTO oddsapi_ingestion_runs
           (oddsapi_ingestion_run_id, request_kind, endpoint, result_state, started_at, completed_at, request_params)
         VALUES ($1, 'current_poll', 'event_odds', 'complete', now(), now(), '{}'::jsonb)`, [rid]);
    }

    // --- the two observations: one AT T_erf, one NEWER (near serve_now) -----
    await insertOfferingSnapshot(pool, { game_id, player_id, run_id: run_old, bookmaker_key: 'bk1', observed_at: OBS_AT_ERF });
    await insertOfferingSnapshot(pool, { game_id, player_id, run_id: run_new, bookmaker_key: 'bk1', observed_at: OBS_NEWER });

    // --- the v2 profile, classified at T_erf --------------------------------
    await pool.query(
      `INSERT INTO evidence_profiles
         (evidence_profile_id, internal_game_id, internal_player_id, market_key,
          classification, direction, quality_capped, quality_cap_reason,
          includes_backfilled_historical,
          evaluated_line, evaluated_source_kind,
          method_version, computation_version, reference_date,
          source_read_model_computation_version,
          evaluation_reference_time, profile_generated_at)
       VALUES ($1,$2,$3,'player_points',
               'moderate_over_evidence','over', false,'none',
               false,
               24.5, 'sportsbook_consensus',
               'evidence_method_v2', 1, '2026-07-27',
               1,
               $4::timestamptz, $4::timestamptz)`,
      [profile_id, game_id, player_id, T_ERF]);

    // --- run the ACTUAL Board query ----------------------------------------
    const { text, values } = buildBoardQuery('evidence_method_v2');
    const res = await pool.query(text, values as unknown[]);
    const row = res.rows.find((r: { internal_game_id: string }) => r.internal_game_id === game_id) as
      | { line_observed_at: string | Date | null }
      | undefined;
    assert.ok(row, 'the seeded v2 profile must be returned by the Board query');

    const observed = row.line_observed_at instanceof Date ? row.line_observed_at.toISOString() : row.line_observed_at;

    // CORE ASSERTION: the query returns the AT-T_erf observation, NOT the newer
    // one. This is exactly what fails without the `<= evaluation_reference_time`
    // bound (it would return OBS_NEWER and rejuvenate the profile).
    assert.equal(observed, OBS_AT_ERF, 'line_observed_at must be bounded by evaluation_reference_time (the newer poll is excluded)');
    assert.notEqual(observed, OBS_NEWER, 'the newer post-classification observation must NOT be selected');

    // CONSEQUENCE: with the bounded (old) observation the profile is stale at
    // serve time and the committed gate suppresses it. Had the newer been
    // selected, display_age would be ~60s and it would have served.
    const decision = evaluateV2ServingGate({ line_observed_at: observed, serve_now: SERVE_NOW }).decision;
    assert.equal(decision, 'suppress', 'a profile whose bounded line is > 3600s old must be suppressed');
    const rejuvenated = evaluateV2ServingGate({ line_observed_at: OBS_NEWER, serve_now: SERVE_NOW }).decision;
    assert.equal(rejuvenated, 'serve', 'control: the excluded newer observation would have served (proves the drift the bound closes)');
  } finally {
    // Clean up this test's rows (reverse FK order). Leaves the shared DB pristine.
    await pool.query('DELETE FROM market_offerings mo USING market_snapshots ms WHERE mo.market_snapshot_id = ms.market_snapshot_id AND ms.linked_internal_game_id = $1', [game_id]).catch(() => {});
    await pool.query('DELETE FROM market_snapshots WHERE linked_internal_game_id = $1', [game_id]).catch(() => {});
    await pool.query('DELETE FROM evidence_profiles WHERE internal_game_id = $1', [game_id]).catch(() => {});
    await pool.query('DELETE FROM players WHERE internal_player_id = $1', [player_id]).catch(() => {});
    await pool.query('DELETE FROM games WHERE internal_game_id = $1', [game_id]).catch(() => {});
    await pool.query('DELETE FROM teams WHERE internal_team_id = ANY($1::uuid[])', [[team_a, team_b]]).catch(() => {});
    await pool.end();
  }
});

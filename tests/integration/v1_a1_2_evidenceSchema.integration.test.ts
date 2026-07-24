// V1-A1-2 constraint probes against a live Postgres.
//
// Every CHECK and UNIQUE in the three evidence-profile migrations is
// probed here. The probes:
//   * Attempt a legitimate INSERT — expect success.
//   * Attempt an INSERT that violates the constraint — expect a
//     Postgres error whose message references the constraint name.
// Version-coexistence probe: two rows at the same (game, player, market)
// with different (method_version, computation_version) coexist; a same-
// version duplicate is rejected.
//
// Filename ends in `.integration.test.ts` so it is picked up by
// `npm run test:integration` (see package.json).

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import { openTestDb } from './support/db.js';
import type { SliplabzPool } from '../../src/db/connection.js';
import { EVIDENCE_METHOD_VERSION } from '../../src/evidence/schema.js';

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
  if (pool === null) {
    t.skip(`SKIP: ${skip_reason}`);
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Local truncate — must include the V1-A1-2 tables so probes start clean.
// The V1-4 support/db.ts `truncateAllV14Tables` does not know about
// evidence tables (it is used by many older suites and Agent A's ticket
// too); we add a small local scrub for the evidence rows only, plus rely
// on the callers to CASCADE-truncate the underlying seed rows.
// ---------------------------------------------------------------------------
async function scrubEvidence(p: SliplabzPool): Promise<void> {
  await p.query('TRUNCATE TABLE evidence_profile_reasons, evidence_profiles CASCADE');
}

/**
 * Truncate every seed row on this database so probes are deterministic.
 * Includes the V1-A1-2 evidence tables in addition to the V1-4 targets.
 */
async function scrubAll(p: SliplabzPool): Promise<void> {
  await p.query(`TRUNCATE TABLE
    evidence_profile_reasons,
    evidence_profiles,
    seed_slice_watermarks,
    seed_run_records,
    real_line_windows,
    historical_line_results,
    canonical_closing_points,
    source_closing_quotes,
    movement_events,
    observed_line_lifecycle,
    close_boundary_evaluations,
    current_market_rows,
    market_offering_raw_rows,
    market_offerings,
    market_snapshots,
    oddsapi_event_presence,
    oddsapi_event_snapshots,
    oddsapi_raw_responses,
    oddsapi_ingestion_runs,
    oddsapi_quarantine,
    market_registry,
    bookmaker_registry,
    recomputation_invalidations,
    post_final_reconciliation_schedule,
    bdl_availability_current_state,
    bdl_availability_snapshots,
    player_game_stat_history,
    player_game_stats,
    game_status_observations,
    bdl_game_snapshots,
    bdl_active_player_presence,
    bdl_active_player_snapshots,
    bdl_team_snapshots,
    bdl_import_watermarks,
    bdl_raw_responses,
    bdl_ingestion_runs,
    mapping_history,
    player_reconciliation_queue,
    event_reconciliation_queue,
    player_aliases,
    team_aliases,
    provider_games,
    provider_players,
    provider_teams,
    games,
    players,
    teams
  CASCADE`);
}

interface SeedIds {
  team_a: string;
  team_b: string;
  game_id: string;
  player_id: string;
  current_market_row_id: string;
  availability_snapshot_id: string;
}

async function seedMinimalGraph(p: SliplabzPool): Promise<SeedIds> {
  const team_a = randomUUID();
  const team_b = randomUUID();
  await p.query(
    `INSERT INTO teams (internal_team_id, display_name, abbreviation, classification, city)
     VALUES ($1, 'H', 'H', 'current_franchise', 'X'),
            ($2, 'A', 'A', 'current_franchise', 'Y')`,
    [team_a, team_b]
  );
  const game_id = randomUUID();
  await p.query(
    `INSERT INTO games
       (internal_game_id, season, season_type, home_team_id, away_team_id,
        scheduled_start_utc, postseason, status)
     VALUES ($1, 2026, 2, $2, $3, '2026-07-14T00:00:00Z', false, 'scheduled')`,
    [game_id, team_a, team_b]
  );
  const player_id = randomUUID();
  await p.query(
    `INSERT INTO players
       (internal_player_id, display_name, normalized_name, current_team_id, status)
     VALUES ($1, 'X', 'x', $2, 'active_confirmed')`,
    [player_id, team_a]
  );
  await p.query(
    `INSERT INTO bookmaker_registry (provider_key, display_title, source_class, approved_by)
     VALUES ('draftkings', 'DraftKings', 'sportsbook', 'test')`
  );
  await p.query(
    `INSERT INTO market_registry (provider_key, display_title, is_launch_market, canonical_stat_key, approved_by)
     VALUES ('player_points', 'Player Points', true, 'pts', 'test')`
  );

  // A CurrentMarketRow to reference for source-snapshot reproducibility.
  const current_market_row_id = randomUUID();
  await p.query(
    `INSERT INTO current_market_rows
       (current_market_row_id, internal_game_id, internal_player_id, market_key,
        line_consensus_point, line_min_point, line_max_point,
        eligible_sportsbook_count, point_distribution,
        freshness_state, provenance, computation_version)
     VALUES ($1, $2, $3, 'player_points',
             20.5, 20.0, 21.0,
             1, '[]'::jsonb,
             'fresh', 'self_observed', 3)`,
    [current_market_row_id, game_id, player_id]
  );

  // A BDL availability snapshot to reference. Requires a bdl_ingestion_run.
  const bdl_run_id = randomUUID();
  await p.query(
    `INSERT INTO bdl_ingestion_runs
       (bdl_ingestion_run_id, endpoint, query_scope_key,
        completion_state, started_at, completed_at)
     VALUES ($1, 'active_players', 'test',
             'complete', now(), now())`,
    [bdl_run_id]
  );
  const availability_snapshot_id = randomUUID();
  await p.query(
    `INSERT INTO bdl_availability_snapshots
       (bdl_availability_snapshot_id, bdl_ingestion_run_id,
        provider_player_id, raw_payload, content_hash)
     VALUES ($1, $2, 'pp-1', '{}'::jsonb, 'hash-1')`,
    [availability_snapshot_id, bdl_run_id]
  );

  return { team_a, team_b, game_id, player_id, current_market_row_id, availability_snapshot_id };
}

// ---------------------------------------------------------------------------
// A minimal, deterministic INSERT for a Moderate Over evidence profile
// (used as the happy path and as the base for CHECK-violation probes).
// ---------------------------------------------------------------------------
async function insertModerateOver(
  p: SliplabzPool,
  seed: SeedIds,
  overrides: Partial<{
    method_version: string;
    computation_version: number;
    classification: string;
    direction: string | null;
    evaluated_line: number | null;
    evaluated_source_kind: string | null;
    composite_score: number | null;
    c_rtp: number | null;
    c_ms: number | null;
    c_wa: number | null;
    c_ma: number | null;
    quality_capped: boolean;
    quality_cap_reason: string;
    source_read_model_computation_version: number;
  }> = {}
): Promise<string> {
  const id = randomUUID();
  // Callers may pass an explicit `null` for direction / evaluated_line /
  // evaluated_source_kind / composite_score / components; `??` treats null
  // as a non-nullish value which is exactly what we want here (an explicit
  // null overrides the default).
  const pick = <T>(v: T | undefined, dflt: T): T => (v === undefined ? dflt : v);
  await p.query(
    `INSERT INTO evidence_profiles
       (evidence_profile_id, internal_game_id, internal_player_id, market_key,
        evaluated_line, evaluated_source_kind, evaluated_source_identifier,
        classification, direction,
        composite_score, c_rtp, c_ms, c_wa, c_ma,
        quality_capped, quality_cap_reason,
        includes_backfilled_historical,
        method_version, computation_version,
        reference_date, source_read_model_computation_version,
        current_market_row_id, bdl_availability_snapshot_id,
        book_detail_one_sided,
        evaluation_reference_time, profile_generated_at)
     VALUES ($1, $2, $3, 'player_points',
             $4, $5, NULL,
             $6, $7,
             $8, $9, $10, $11, $12,
             $13, $14,
             false,
             $15, $16,
             '2026-07-14', $17,
             $18, $19,
             'neither',
             $20::timestamptz, $21::timestamptz)`,
    [
      id,
      seed.game_id,
      seed.player_id,
      pick<number | null>(overrides.evaluated_line, 19.5),
      pick<string | null>(overrides.evaluated_source_kind, 'sportsbook_consensus'),
      pick<string>(overrides.classification, 'moderate_over_evidence'),
      pick<string | null>(overrides.direction, 'over'),
      pick<number | null>(overrides.composite_score, 0.4997),
      pick<number | null>(overrides.c_rtp, 0.5194),
      pick<number | null>(overrides.c_ms, 0.3916),
      pick<number | null>(overrides.c_wa, 1.0),
      pick<number | null>(overrides.c_ma, 0.1),
      pick<boolean>(overrides.quality_capped, false),
      pick<string>(overrides.quality_cap_reason, 'none'),
      pick<string>(overrides.method_version, EVIDENCE_METHOD_VERSION),
      pick<number>(overrides.computation_version, 1),
      pick<number>(overrides.source_read_model_computation_version, 3),
      seed.current_market_row_id,
      seed.availability_snapshot_id,
      // V1-A2-2 REVISE repair 10: the V1-A2-1 CHECK constraint
      // (evidence_profiles_v2_timing_check) requires evaluation_reference_time
      // and profile_generated_at to be NULL for evidence_method_v1 and NON-NULL
      // for evidence_method_v2. This helper populates both fields conditionally
      // on method_version so DR-24 simulation tests (P-UNIQ-VERSION-2) honour
      // the constraint instead of tripping it.
      pick<string>(overrides.method_version, EVIDENCE_METHOD_VERSION) === 'evidence_method_v2'
        ? '2026-07-18T18:00:00Z' : null,
      pick<string>(overrides.method_version, EVIDENCE_METHOD_VERSION) === 'evidence_method_v2'
        ? '2026-07-18T18:00:05Z' : null,
    ]
  );
  return id;
}

/**
 * Assert that the given async operation throws a Postgres error whose
 * message references `expectedConstraintFragment`. Used to prove a probe
 * violated the CHECK/UNIQUE we intended.
 */
async function assertViolates(
  fn: () => Promise<unknown>,
  expectedConstraintFragment: string
): Promise<void> {
  try {
    await fn();
    assert.fail(
      `expected constraint violation containing "${expectedConstraintFragment}" but INSERT succeeded`
    );
  } catch (err: unknown) {
    const message = (err instanceof Error ? err.message : String(err));
    assert.ok(
      message.includes(expectedConstraintFragment),
      `expected error to reference "${expectedConstraintFragment}", got: ${message}`
    );
  }
}

// ---------------------------------------------------------------------------
// Probes
// ---------------------------------------------------------------------------

describe('V1-A1-2 evidence schema — constraint probes', () => {
  it('happy path: a legitimate Moderate Over row inserts', async (t) => {
    if (skipIfUnavailable(t)) return;
    const p = pool!;
    await scrubAll(p);
    const seed = await seedMinimalGraph(p);
    const id = await insertModerateOver(p, seed);
    const res = await p.query(
      `SELECT classification, direction, composite_score, quality_capped
         FROM evidence_profiles WHERE evidence_profile_id = $1`,
      [id]
    );
    assert.equal(res.rowCount, 1);
    const row = res.rows[0] as {
      classification: string;
      direction: string;
      composite_score: string;
      quality_capped: boolean;
    };
    assert.equal(row.classification, 'moderate_over_evidence');
    assert.equal(row.direction, 'over');
    assert.equal(row.quality_capped, false);
  });

  it('P-CLASS-DIR-1: Strong Over with direction=under is REJECTED (classification_direction_check)', async (t) => {
    if (skipIfUnavailable(t)) return;
    const p = pool!;
    await scrubAll(p);
    const seed = await seedMinimalGraph(p);
    await assertViolates(
      () =>
        insertModerateOver(p, seed, {
          classification: 'strong_over_evidence',
          direction: 'under',
        }),
      'evidence_profiles_classification_direction_check'
    );
  });

  it('P-CLASS-DIR-2: Mixed with direction=over is REJECTED (classification_direction_check)', async (t) => {
    if (skipIfUnavailable(t)) return;
    const p = pool!;
    await scrubEvidence(p);
    const seed = await seedMinimalGraphOrReuse(p);
    await assertViolates(
      () =>
        insertModerateOver(p, seed, {
          classification: 'mixed_evidence',
          direction: 'over',
        }),
      'evidence_profiles_classification_direction_check'
    );
  });

  it('P-CLASS-DIR-3: Insufficient with a non-NULL direction is REJECTED', async (t) => {
    if (skipIfUnavailable(t)) return;
    const p = pool!;
    await scrubEvidence(p);
    const seed = await seedMinimalGraphOrReuse(p);
    await assertViolates(
      () =>
        insertModerateOver(p, seed, {
          classification: 'insufficient_evidence',
          direction: 'over',
        }),
      'evidence_profiles_classification_direction_check'
    );
  });

  it('P-CLASS-DIR-4: Unavailable with NULL direction is ACCEPTED (evaluated_line may also be NULL)', async (t) => {
    if (skipIfUnavailable(t)) return;
    const p = pool!;
    await scrubEvidence(p);
    const seed = await seedMinimalGraphOrReuse(p);
    // The insertModerateOver helper always sets evaluated_line — the CHECK
    // admits a non-NULL evaluated_line for Unavailable too, so this row is
    // legitimate.
    await insertModerateOver(p, seed, {
      classification: 'unavailable',
      direction: null,
      composite_score: null,
      c_rtp: null,
      c_ms: null,
      c_wa: null,
      c_ma: null,
    });
    const res = await p.query(
      `SELECT count(*)::int AS n FROM evidence_profiles WHERE classification = 'unavailable'`
    );
    assert.equal((res.rows[0] as { n: number }).n, 1);
  });

  it('P-EVAL-LINE-1: non-Unavailable classification with NULL evaluated_line is REJECTED', async (t) => {
    if (skipIfUnavailable(t)) return;
    const p = pool!;
    await scrubEvidence(p);
    const seed = await seedMinimalGraphOrReuse(p);
    await assertViolates(
      () =>
        insertModerateOver(p, seed, {
          evaluated_line: null,
        }),
      'evidence_profiles_evaluated_line_availability_check'
    );
  });

  it('P-EVAL-LINE-2: Unavailable WITH NULL evaluated_line + NULL source_kind is ACCEPTED (§C.9 unresolved mapping case)', async (t) => {
    if (skipIfUnavailable(t)) return;
    const p = pool!;
    await scrubEvidence(p);
    const seed = await seedMinimalGraphOrReuse(p);
    await insertModerateOver(p, seed, {
      classification: 'unavailable',
      direction: null,
      evaluated_line: null,
      evaluated_source_kind: null,
      composite_score: null,
      c_rtp: null,
      c_ms: null,
      c_wa: null,
      c_ma: null,
    });
    const res = await p.query(
      `SELECT count(*)::int AS n FROM evidence_profiles
        WHERE classification = 'unavailable' AND evaluated_line IS NULL`
    );
    assert.equal((res.rows[0] as { n: number }).n, 1);
  });

  it('P-SCORE-CLAMP-1: composite_score = 1.5 is REJECTED (score_clamp_check)', async (t) => {
    if (skipIfUnavailable(t)) return;
    const p = pool!;
    await scrubEvidence(p);
    const seed = await seedMinimalGraphOrReuse(p);
    await assertViolates(
      () =>
        insertModerateOver(p, seed, {
          composite_score: 1.5,
        }),
      'evidence_profiles_score_clamp_check'
    );
  });

  it('P-SCORE-CLAMP-2: c_wa = -1.0001 is REJECTED (score_clamp_check)', async (t) => {
    if (skipIfUnavailable(t)) return;
    const p = pool!;
    await scrubEvidence(p);
    const seed = await seedMinimalGraphOrReuse(p);
    await assertViolates(
      () =>
        insertModerateOver(p, seed, {
          c_wa: -1.0001,
        }),
      'evidence_profiles_score_clamp_check'
    );
  });

  it('P-CAP-1: quality_capped=true with cap_reason=none is REJECTED (quality_cap_pairing_check)', async (t) => {
    if (skipIfUnavailable(t)) return;
    const p = pool!;
    await scrubEvidence(p);
    const seed = await seedMinimalGraphOrReuse(p);
    await assertViolates(
      () =>
        insertModerateOver(p, seed, {
          quality_capped: true,
          quality_cap_reason: 'none',
        }),
      'evidence_profiles_quality_cap_pairing_check'
    );
  });

  it('P-CAP-2: quality_capped=false with cap_reason=stale_current_market is REJECTED', async (t) => {
    if (skipIfUnavailable(t)) return;
    const p = pool!;
    await scrubEvidence(p);
    const seed = await seedMinimalGraphOrReuse(p);
    await assertViolates(
      () =>
        insertModerateOver(p, seed, {
          quality_capped: false,
          quality_cap_reason: 'stale_current_market',
        }),
      'evidence_profiles_quality_cap_pairing_check'
    );
  });

  it('P-CAP-3: quality_capped=true with cap_reason=one_sided_offering is ACCEPTED (§C.7 case)', async (t) => {
    if (skipIfUnavailable(t)) return;
    const p = pool!;
    await scrubEvidence(p);
    const seed = await seedMinimalGraphOrReuse(p);
    await insertModerateOver(p, seed, {
      quality_capped: true,
      quality_cap_reason: 'one_sided_offering',
    });
    const res = await p.query(
      `SELECT count(*)::int AS n FROM evidence_profiles WHERE quality_capped = true`
    );
    assert.equal((res.rows[0] as { n: number }).n, 1);
  });

  it('P-CVER: computation_version = 0 is REJECTED (computation_version_positive_check)', async (t) => {
    if (skipIfUnavailable(t)) return;
    const p = pool!;
    await scrubEvidence(p);
    const seed = await seedMinimalGraphOrReuse(p);
    await assertViolates(
      () =>
        insertModerateOver(p, seed, {
          computation_version: 0,
        }),
      'evidence_profiles_computation_version_positive_check'
    );
  });

  it('P-SRMVER: source_read_model_computation_version = 0 is REJECTED', async (t) => {
    if (skipIfUnavailable(t)) return;
    const p = pool!;
    await scrubEvidence(p);
    const seed = await seedMinimalGraphOrReuse(p);
    await assertViolates(
      () =>
        insertModerateOver(p, seed, {
          source_read_model_computation_version: 0,
        }),
      'evidence_profiles_source_read_model_positive_check'
    );
  });

  // -------------------------------------------------------------------------
  // Version coexistence + duplicate rejection
  // -------------------------------------------------------------------------

  it('P-UNIQ-VERSION: two rows at the same grain with DIFFERENT computation_versions COEXIST (V1-5 recomputation-writer lesson)', async (t) => {
    if (skipIfUnavailable(t)) return;
    const p = pool!;
    await scrubEvidence(p);
    const seed = await seedMinimalGraphOrReuse(p);
    await insertModerateOver(p, seed, { computation_version: 1 });
    await insertModerateOver(p, seed, { computation_version: 2 });
    const res = await p.query(
      `SELECT computation_version FROM evidence_profiles
        WHERE internal_game_id = $1 AND internal_player_id = $2
          AND market_key = 'player_points'
        ORDER BY computation_version`,
      [seed.game_id, seed.player_id]
    );
    assert.equal(res.rowCount, 2);
    const versions = res.rows.map((r) => (r as { computation_version: number }).computation_version);
    assert.deepStrictEqual(versions, [1, 2]);
  });

  it('P-UNIQ-VERSION-2: two rows at the same grain with DIFFERENT method_versions COEXIST (DR-24 bump path)', async (t) => {
    if (skipIfUnavailable(t)) return;
    const p = pool!;
    await scrubEvidence(p);
    const seed = await seedMinimalGraphOrReuse(p);
    // v1 baseline.
    await insertModerateOver(p, seed, {
      method_version: 'evidence_method_v1',
      computation_version: 1,
    });
    // A hypothetical DR-24 bump to v2 — no schema migration required per
    // the DR-24 policy; the writer stores the new value.
    await insertModerateOver(p, seed, {
      method_version: 'evidence_method_v2',
      computation_version: 1,
    });
    const res = await p.query(
      `SELECT method_version FROM evidence_profiles
        WHERE internal_game_id = $1 AND internal_player_id = $2
          AND market_key = 'player_points'
        ORDER BY method_version`,
      [seed.game_id, seed.player_id]
    );
    assert.equal(res.rowCount, 2);
    const versions = res.rows.map((r) => (r as { method_version: string }).method_version);
    assert.deepStrictEqual(versions, ['evidence_method_v1', 'evidence_method_v2']);
  });

  it('P-UNIQ-DUP: a same-version duplicate at the same grain is REJECTED (evidence_profiles_grain_version_unique)', async (t) => {
    if (skipIfUnavailable(t)) return;
    const p = pool!;
    await scrubEvidence(p);
    const seed = await seedMinimalGraphOrReuse(p);
    await insertModerateOver(p, seed, { computation_version: 5 });
    await assertViolates(
      () => insertModerateOver(p, seed, { computation_version: 5 }),
      'evidence_profiles_grain_version_unique'
    );
  });

  // -------------------------------------------------------------------------
  // evidence_profile_reasons probes
  // -------------------------------------------------------------------------

  it('P-REASON-1: attaching a legitimate reason with valid rank is ACCEPTED', async (t) => {
    if (skipIfUnavailable(t)) return;
    const p = pool!;
    await scrubEvidence(p);
    const seed = await seedMinimalGraphOrReuse(p);
    const profile_id = await insertModerateOver(p, seed);
    await p.query(
      `INSERT INTO evidence_profile_reasons
         (evidence_profile_id, reason_code, category, intra_category_rank, contribution_magnitude)
       VALUES ($1, 'positive_margin_support', 'support', 1, 0.3916)`,
      [profile_id]
    );
    const res = await p.query(
      `SELECT reason_code, category FROM evidence_profile_reasons WHERE evidence_profile_id = $1`,
      [profile_id]
    );
    assert.equal(res.rowCount, 1);
  });

  it('P-REASON-DUP: attaching the SAME reason_code twice on the same profile is REJECTED (profile_reason_unique)', async (t) => {
    if (skipIfUnavailable(t)) return;
    const p = pool!;
    await scrubEvidence(p);
    const seed = await seedMinimalGraphOrReuse(p);
    const profile_id = await insertModerateOver(p, seed);
    await p.query(
      `INSERT INTO evidence_profile_reasons
         (evidence_profile_id, reason_code, category, intra_category_rank)
       VALUES ($1, 'positive_margin_support', 'support', 1)`,
      [profile_id]
    );
    await assertViolates(
      () =>
        p.query(
          `INSERT INTO evidence_profile_reasons
             (evidence_profile_id, reason_code, category, intra_category_rank)
           VALUES ($1, 'positive_margin_support', 'support', 2)`,
          [profile_id]
        ),
      'evidence_profile_reasons_profile_reason_unique'
    );
  });

  it('P-REASON-RANK-DUP: two reasons at the SAME (category, rank) on the same profile is REJECTED', async (t) => {
    if (skipIfUnavailable(t)) return;
    const p = pool!;
    await scrubEvidence(p);
    const seed = await seedMinimalGraphOrReuse(p);
    const profile_id = await insertModerateOver(p, seed);
    await p.query(
      `INSERT INTO evidence_profile_reasons
         (evidence_profile_id, reason_code, category, intra_category_rank)
       VALUES ($1, 'positive_margin_support', 'support', 1)`,
      [profile_id]
    );
    await assertViolates(
      () =>
        p.query(
          `INSERT INTO evidence_profile_reasons
             (evidence_profile_id, reason_code, category, intra_category_rank)
           VALUES ($1, 'window_agreement_support', 'support', 1)`,
          [profile_id]
        ),
      'evidence_profile_reasons_profile_category_rank_unique'
    );
  });

  it('P-REASON-RANK-ZERO: intra_category_rank = 0 is REJECTED (rank_positive_check)', async (t) => {
    if (skipIfUnavailable(t)) return;
    const p = pool!;
    await scrubEvidence(p);
    const seed = await seedMinimalGraphOrReuse(p);
    const profile_id = await insertModerateOver(p, seed);
    await assertViolates(
      () =>
        p.query(
          `INSERT INTO evidence_profile_reasons
             (evidence_profile_id, reason_code, category, intra_category_rank)
           VALUES ($1, 'positive_margin_support', 'support', 0)`,
          [profile_id]
        ),
      'evidence_profile_reasons_rank_positive_check'
    );
  });

  it('P-REASON-MAG-OOB: contribution_magnitude = 1.5 is REJECTED (contribution_range_check)', async (t) => {
    if (skipIfUnavailable(t)) return;
    const p = pool!;
    await scrubEvidence(p);
    const seed = await seedMinimalGraphOrReuse(p);
    const profile_id = await insertModerateOver(p, seed);
    await assertViolates(
      () =>
        p.query(
          `INSERT INTO evidence_profile_reasons
             (evidence_profile_id, reason_code, category, intra_category_rank, contribution_magnitude)
           VALUES ($1, 'positive_margin_support', 'support', 1, 1.5)`,
          [profile_id]
        ),
      'evidence_profile_reasons_contribution_range_check'
    );
  });

  it('P-REASON-CASCADE: deleting a profile CASCADEs its reasons rows', async (t) => {
    if (skipIfUnavailable(t)) return;
    const p = pool!;
    await scrubEvidence(p);
    const seed = await seedMinimalGraphOrReuse(p);
    const profile_id = await insertModerateOver(p, seed);
    await p.query(
      `INSERT INTO evidence_profile_reasons
         (evidence_profile_id, reason_code, category, intra_category_rank)
       VALUES ($1, 'positive_margin_support', 'support', 1)`,
      [profile_id]
    );
    await p.query(`DELETE FROM evidence_profiles WHERE evidence_profile_id = $1`, [profile_id]);
    const res = await p.query(
      `SELECT count(*)::int AS n FROM evidence_profile_reasons WHERE evidence_profile_id = $1`,
      [profile_id]
    );
    assert.equal((res.rows[0] as { n: number }).n, 0);
  });
});

/**
 * Between test cases we scrubEvidence (evidence rows only, cheap) so probes
 * that share the same underlying game/player/market seed don't need to
 * re-seed. If the game row is absent (first test after a full scrub or a
 * fresh DB), reseed the graph. Idempotent by design.
 */
async function seedMinimalGraphOrReuse(p: SliplabzPool): Promise<SeedIds> {
  const cmr = await p.query(
    `SELECT internal_game_id, internal_player_id, current_market_row_id
       FROM current_market_rows LIMIT 1`
  );
  if (cmr.rowCount === 0) {
    await scrubAll(p);
    return await seedMinimalGraph(p);
  }
  const row = cmr.rows[0] as {
    internal_game_id: string;
    internal_player_id: string;
    current_market_row_id: string;
  };
  const av = await p.query(
    `SELECT bdl_availability_snapshot_id FROM bdl_availability_snapshots LIMIT 1`
  );
  if (av.rowCount === 0) {
    await scrubAll(p);
    return await seedMinimalGraph(p);
  }
  const availability_snapshot_id = (av.rows[0] as {
    bdl_availability_snapshot_id: string;
  }).bdl_availability_snapshot_id;
  return {
    team_a: '',
    team_b: '',
    game_id: row.internal_game_id,
    player_id: row.internal_player_id,
    current_market_row_id: row.current_market_row_id,
    availability_snapshot_id,
  };
}

// V1-5 governor ledger #2 integration test — recomputation writer.
//
// Six governor-required correctness scenarios (V1-5 revise 2026-07-13):
//   (a) existing stale derived row + invalidation → corrected state, NOT a
//       silent no-op;
//   (b) computation-version change → new persisted row, prior row untouched;
//   (c) injected failure AFTER derived-write but BEFORE processed_at →
//       full rollback, invalidation remains unprocessed;
//   (d) retry after that rollback writes ONCE and marks processed;
//   (e) two concurrent drainers cannot process the same invalidation;
//   (f) a second completed invocation is idempotent (no duplicate rows,
//       no changes).
//
// Plus the original two acceptance tests (initial recompute + rerun
// idempotence) retained.

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import { openTestDb, truncateAllV14Tables } from './support/db.js';
import { loadRegistries } from '../../src/computation/registry/registryLoader.js';
import { drainRecomputationInvalidations } from '../../src/computation/driver/recomputationWriter.js';
import { V1_5_COMPUTATION_VERSION } from '../../src/computation/computationVersion.js';
import type { SliplabzPool } from '../../src/db/connection.js';

let pool: SliplabzPool | null = null;
let skip_reason: string | null = null;

before(async () => { const h = await openTestDb(); pool = h.pool; skip_reason = h.skip_reason; });
after(async () => { if (pool !== null) await pool.end(); });
function skipIfUnavailable(t: { skip: (msg?: string) => void }): boolean {
  if (pool === null) { t.skip(`SKIP: ${skip_reason}`); return true; }
  return false;
}

async function seedBase(opts: { canon_point?: number; pgs_pts?: number } = {}): Promise<{
  game_id: string; player_id: string; pgs_id: string; ccp_id: string;
  history_id: string; bdl_run_id: string;
}> {
  const canonPoint = opts.canon_point ?? 18.5;
  const pgsPts = opts.pgs_pts ?? 20;
  const p = pool!;
  await truncateAllV14Tables(p);
  await p.query(`TRUNCATE bookmaker_registry, market_registry CASCADE`);
  await loadRegistries(p);

  const team_a = randomUUID(); const team_b = randomUUID();
  await p.query(
    `INSERT INTO teams (internal_team_id, display_name, abbreviation, classification, city)
     VALUES ($1,'H','H','current_franchise','X'), ($2,'A','A','current_franchise','Y')`,
    [team_a, team_b]
  );
  const game_id = randomUUID();
  await p.query(
    `INSERT INTO games (internal_game_id, season, season_type, home_team_id, away_team_id, scheduled_start_utc, postseason, status)
     VALUES ($1, 2026, 2, $2, $3, '2026-07-13T00:00:00Z', false, 'final')`,
    [game_id, team_a, team_b]
  );
  const player_id = randomUUID();
  await p.query(
    `INSERT INTO players (internal_player_id, display_name, normalized_name, current_team_id, status)
     VALUES ($1, 'X', 'x', $2, 'active_confirmed')`,
    [player_id, team_a]
  );
  const pgs_id = randomUUID();
  await p.query(
    `INSERT INTO player_game_stats
       (player_game_stat_id, provider, provider_player_id, provider_game_id,
        internal_game_id, internal_player_id,
        minutes_status, parsed_minutes, raw_stats, normalized_stats,
        source_hash, raw_minutes, eligibility_state)
     VALUES ($1, 'balldontlie', 'pp1', 'pg1', $2, $3, 'played', 34,
             $4::jsonb, $5::jsonb,
             'h1', '34', 'eligible')`,
    [pgs_id, game_id, player_id,
     JSON.stringify({ pts: pgsPts }),
     JSON.stringify({ pts: pgsPts, reb: 0, ast: 0, fg3m: 0 })]
  );
  const ccp_id = randomUUID();
  await p.query(
    `INSERT INTO canonical_closing_points
       (canonical_closing_point_id, internal_game_id, internal_player_id,
        market_key, selection_method, canonical_closing_point,
        total_eligible_sportsbook_count, sportsbook_count_at_selected_point,
        coverage_label, close_boundary_utc)
     VALUES ($1,$2,$3,'player_points','single_book',$4,1,1,'single_book','2026-07-13T00:00:00Z')`,
    [ccp_id, game_id, player_id, canonPoint]
  );
  const bdl_run_id = randomUUID();
  await p.query(
    `INSERT INTO bdl_ingestion_runs
       (bdl_ingestion_run_id, endpoint, query_scope_key, completion_state,
        completed_at, page_count, row_count, cursor_chain_sent,
        cursor_chain_returned, http_status_last, content_type_last, response_headers_last)
     VALUES ($1,'player_stats','game=pg1','complete', now(), 1, 1,
             '[null]'::jsonb, '[null]'::jsonb, 200, 'application/json', '{}'::jsonb)`,
    [bdl_run_id]
  );
  const history_id = randomUUID();
  await p.query(
    `INSERT INTO player_game_stat_history
       (player_game_stat_history_id, player_game_stat_id,
        provider, provider_player_id, provider_game_id, change_kind,
        prior_source_hash, new_source_hash,
        prior_normalized_stats, new_normalized_stats,
        prior_minutes_status, new_minutes_status,
        new_raw_stats, prior_parsed_minutes, new_parsed_minutes,
        bdl_ingestion_run_id)
     VALUES ($1,$2,'balldontlie','pp1','pg1','material_correction',
             'h0','h1', '{}'::jsonb, $4::jsonb,
             'unresolved_non_numeric','played',
             $5::jsonb, 0, 34, $3)`,
    [history_id, pgs_id, bdl_run_id,
     JSON.stringify({ pts: pgsPts, reb: 0, ast: 0, fg3m: 0 }),
     JSON.stringify({ pts: pgsPts })]
  );
  await p.query(
    `INSERT INTO recomputation_invalidations
       (entity_kind, entity_id, reason,
        triggering_history_id, provider, provider_player_id, provider_game_id,
        changed_fields)
     VALUES ('player_game_stat', $1, 'material_stat_change',
             $2, 'balldontlie', 'pp1', 'pg1', '["pts"]'::jsonb)`,
    [pgs_id, history_id]
  );
  return { game_id, player_id, pgs_id, ccp_id, history_id, bdl_run_id };
}

async function emitFreshInvalidation(pgs_id: string, history_id: string): Promise<void> {
  const p = pool!;
  await p.query(
    `INSERT INTO recomputation_invalidations
       (entity_kind, entity_id, reason,
        triggering_history_id, provider, provider_player_id, provider_game_id,
        changed_fields)
     VALUES ('player_game_stat', $1, 'material_stat_change',
             $2, 'balldontlie', 'pp1', 'pg1', '["pts"]'::jsonb)`,
    [pgs_id, history_id]
  );
}

describe('V1-5 ledger #2 — recomputation writer (governor-required correction scenarios)', () => {
  it('acceptance: drains an invalidation, writes historical_line_results at V1_5_COMPUTATION_VERSION, marks processed with per-invalidation disposition', async (t) => {
    if (skipIfUnavailable(t)) return;
    const p = pool!;
    const base = await seedBase();

    const result = await drainRecomputationInvalidations(p, { max_batch: 10 });
    assert.equal(result.invalidations_processed, 1);
    assert.ok(result.historical_results_written >= 1);
    assert.equal(result.computation_version, V1_5_COMPUTATION_VERSION);

    const hlr = await p.query(
      `SELECT outcome, margin, computation_version
         FROM historical_line_results
        WHERE internal_game_id = $1 AND internal_player_id = $2`,
      [base.game_id, base.player_id]
    );
    assert.equal(hlr.rowCount, 1);
    const row = hlr.rows[0] as { outcome: string; margin: string; computation_version: number };
    assert.equal(row.outcome, 'over');
    assert.equal(Number(row.margin), 1.5);
    assert.equal(row.computation_version, V1_5_COMPUTATION_VERSION);

    // processed_note is per-invalidation disposition, NOT a constant.
    const inv = await p.query(
      `SELECT processed_at, processed_note
         FROM recomputation_invalidations
        WHERE entity_id = $1`,
      [base.pgs_id]
    );
    const r = inv.rows[0] as { processed_at: Date | null; processed_note: string | null };
    assert.ok(r.processed_at !== null);
    assert.equal(r.processed_note, 'recomputed');
  });

  // ---------------------------------------------------------------------
  // (a) stale derived row + invalidation → corrected state (no silent no-op)
  // ---------------------------------------------------------------------
  it('(a) LOAD-BEARING: existing STALE derived row + invalidation → corrected state, NOT a silent no-op', async (t) => {
    if (skipIfUnavailable(t)) return;
    const p = pool!;
    // Seed: canonical 18.5, pgs pts 25 (over by 6.5).
    const base = await seedBase({ canon_point: 18.5, pgs_pts: 25 });
    // Pre-existing stale historical_line_results at V1_5_COMPUTATION_VERSION
    // reflecting an OLD pts=15 (under). Reproducing the primary bug scenario:
    // a correction updates the pgs, and the derived row must FLIP.
    await p.query(
      `INSERT INTO historical_line_results
         (internal_game_id, internal_player_id, market_key,
          canonical_closing_point_id, canonical_closing_point,
          player_game_stat_id, player_stat_key, player_stat_value,
          outcome, margin, coverage_state, provenance, computation_version)
       VALUES ($1,$2,'player_points',$3,18.5,$4,'pts',15,'under',-3.5,'single_book','self_observed',$5)`,
      [base.game_id, base.player_id, base.ccp_id, base.pgs_id, V1_5_COMPUTATION_VERSION]
    );

    // Sanity: prior row is stale (over_or_under = under).
    const before = await p.query(
      `SELECT outcome, player_stat_value FROM historical_line_results
         WHERE internal_game_id=$1 AND internal_player_id=$2 AND computation_version=$3`,
      [base.game_id, base.player_id, V1_5_COMPUTATION_VERSION]
    );
    assert.equal((before.rows[0] as any).outcome, 'under');

    // Drain — the pgs_id invalidation must UPSERT the stale row.
    const result = await drainRecomputationInvalidations(p, { max_batch: 10 });
    assert.equal(result.invalidations_processed, 1);
    assert.equal(result.historical_results_written, 1); // affected rows, not attempts

    const after = await p.query(
      `SELECT outcome, player_stat_value::float8 AS v, margin::float8 AS m FROM historical_line_results
         WHERE internal_game_id=$1 AND internal_player_id=$2 AND computation_version=$3`,
      [base.game_id, base.player_id, V1_5_COMPUTATION_VERSION]
    );
    assert.equal(after.rowCount, 1);
    const aftr = after.rows[0] as { outcome: string; v: number; m: number };
    assert.equal(aftr.outcome, 'over');
    assert.equal(aftr.v, 25);
    assert.equal(aftr.m, 6.5);
  });

  // ---------------------------------------------------------------------
  // (b) version bump → new row, prior row untouched
  // ---------------------------------------------------------------------
  it('(b) LOAD-BEARING: computation-version change → new persisted row, prior row UNTOUCHED', async (t) => {
    if (skipIfUnavailable(t)) return;
    const p = pool!;
    const base = await seedBase({ canon_point: 18.5, pgs_pts: 25 });
    // Insert a PRIOR-version (v=1) historical row reflecting the ORIGINAL pgs pts.
    await p.query(
      `INSERT INTO historical_line_results
         (internal_game_id, internal_player_id, market_key,
          canonical_closing_point_id, canonical_closing_point,
          player_game_stat_id, player_stat_key, player_stat_value,
          outcome, margin, coverage_state, provenance, computation_version)
       VALUES ($1,$2,'player_points',$3,18.5,$4,'pts',20,'over',1.5,'single_book','self_observed',1)`,
      [base.game_id, base.player_id, base.ccp_id, base.pgs_id]
    );
    // Drain — the V1-5 writer inserts at V1_5_COMPUTATION_VERSION (currently 3).
    const result = await drainRecomputationInvalidations(p, { max_batch: 10 });
    assert.equal(result.invalidations_processed, 1);
    assert.equal(result.historical_results_written, 1);

    // Both rows coexist; the prior version 1 was NOT mutated.
    const rows = await p.query(
      `SELECT computation_version, outcome, player_stat_value::float8 AS v, margin::float8 AS m
         FROM historical_line_results
        WHERE internal_game_id=$1 AND internal_player_id=$2 AND market_key='player_points'
        ORDER BY computation_version`,
      [base.game_id, base.player_id]
    );
    assert.equal(rows.rowCount, 2);
    const v1 = rows.rows[0] as any;
    const vNew = rows.rows[1] as any;
    assert.equal(v1.computation_version, 1);
    assert.equal(v1.outcome, 'over');
    assert.equal(v1.v, 20);
    assert.equal(v1.m, 1.5);
    assert.equal(vNew.computation_version, V1_5_COMPUTATION_VERSION);
    assert.equal(vNew.outcome, 'over');
    assert.equal(vNew.v, 25);
    assert.equal(vNew.m, 6.5);
  });

  // ---------------------------------------------------------------------
  // (c) injected failure AFTER derived writes but BEFORE processed_at → full rollback
  // ---------------------------------------------------------------------
  it('(c) LOAD-BEARING: injected failure after derived-write but before processed_at → FULL rollback (no derived rows, invalidation remains unprocessed)', async (t) => {
    if (skipIfUnavailable(t)) return;
    const p = pool!;
    const base = await seedBase();

    // Drain with a poison hook that throws AFTER derived writes.
    await assert.rejects(
      () => drainRecomputationInvalidations(p, {
        max_batch: 10,
        on_after_derived_writes: async () => {
          throw new Error('INJECTED FAILURE between derived writes and processed_at');
        },
      })
    );

    // Rollback: no historical_line_results row exists.
    const hlr = await p.query(
      `SELECT count(*)::int AS n FROM historical_line_results WHERE internal_game_id=$1`,
      [base.game_id]
    );
    assert.equal((hlr.rows[0] as any).n, 0);
    // No real_line_windows row exists either.
    const rlw = await p.query(
      `SELECT count(*)::int AS n FROM real_line_windows WHERE internal_player_id=$1`,
      [base.player_id]
    );
    assert.equal((rlw.rows[0] as any).n, 0);
    // Invalidation is still unprocessed.
    const inv = await p.query(
      `SELECT processed_at, processed_note FROM recomputation_invalidations WHERE entity_id=$1`,
      [base.pgs_id]
    );
    const iv = inv.rows[0] as any;
    assert.equal(iv.processed_at, null);
    assert.equal(iv.processed_note, null);
  });

  // ---------------------------------------------------------------------
  // (d) retry after (c) — writes once and marks processed
  // ---------------------------------------------------------------------
  it('(d) LOAD-BEARING: retry after rollback → writes ONCE and marks processed', async (t) => {
    if (skipIfUnavailable(t)) return;
    const p = pool!;
    // Same DB state as (c) — the seed was just rolled back except the
    // invalidation row (which committed pre-transaction). Retry:
    const result = await drainRecomputationInvalidations(p, { max_batch: 10 });
    assert.equal(result.invalidations_processed, 1);
    assert.equal(result.historical_results_written, 1);

    const hlr = await p.query(
      `SELECT count(*)::int AS n FROM historical_line_results`
    );
    assert.equal((hlr.rows[0] as any).n, 1);

    const inv = await p.query(
      `SELECT processed_at, processed_note FROM recomputation_invalidations`
    );
    const iv = inv.rows[0] as any;
    assert.ok(iv.processed_at !== null);
    assert.equal(iv.processed_note, 'recomputed');
  });

  // ---------------------------------------------------------------------
  // (e) two concurrent drainers cannot process the same invalidation
  // ---------------------------------------------------------------------
  it('(e) LOAD-BEARING: two concurrent drainers cannot process the same invalidation (FOR UPDATE SKIP LOCKED)', async (t) => {
    if (skipIfUnavailable(t)) return;
    const p = pool!;
    const base = await seedBase();

    // Race two drains against the same single invalidation. FOR UPDATE
    // SKIP LOCKED guarantees at most one sees it.
    const [r1, r2] = await Promise.all([
      drainRecomputationInvalidations(p, { max_batch: 10 }),
      drainRecomputationInvalidations(p, { max_batch: 10 }),
    ]);
    const totalProcessed = r1.invalidations_processed + r2.invalidations_processed;
    assert.equal(totalProcessed, 1, `exactly one drainer must claim; got r1=${r1.invalidations_processed}, r2=${r2.invalidations_processed}`);

    // Exactly one historical_line_results row exists (not two).
    const hlr = await p.query(
      `SELECT count(*)::int AS n FROM historical_line_results
         WHERE internal_game_id=$1`,
      [base.game_id]
    );
    assert.equal((hlr.rows[0] as any).n, 1);
  });

  // ---------------------------------------------------------------------
  // (f) a second completed invocation is idempotent
  // ---------------------------------------------------------------------
  it('(f) LOAD-BEARING: a second completed invocation is idempotent (no duplicate rows, no changes)', async (t) => {
    if (skipIfUnavailable(t)) return;
    const p = pool!;
    const base = await seedBase();

    await drainRecomputationInvalidations(p, { max_batch: 10 });
    // Snapshot post-first-run state.
    const snap1Hlr = await p.query(
      `SELECT computation_version, outcome, margin::float8 AS m, computed_at
         FROM historical_line_results WHERE internal_game_id=$1 ORDER BY computation_version`,
      [base.game_id]
    );
    const snap1Rlw = await p.query(
      `SELECT count(*)::int AS n FROM real_line_windows WHERE internal_player_id=$1`,
      [base.player_id]
    );
    const snap1Inv = await p.query(
      `SELECT processed_at, processed_note FROM recomputation_invalidations WHERE entity_id=$1`,
      [base.pgs_id]
    );

    // Second call — no new invalidations to drain.
    const r2 = await drainRecomputationInvalidations(p, { max_batch: 10 });
    assert.equal(r2.invalidations_processed, 0);
    assert.equal(r2.historical_results_written, 0);
    assert.equal(r2.real_line_windows_written, 0);

    // State unchanged.
    const snap2Hlr = await p.query(
      `SELECT computation_version, outcome, margin::float8 AS m, computed_at
         FROM historical_line_results WHERE internal_game_id=$1 ORDER BY computation_version`,
      [base.game_id]
    );
    assert.equal(snap1Hlr.rowCount, snap2Hlr.rowCount);
    assert.equal((snap1Hlr.rows[0] as any).computation_version, (snap2Hlr.rows[0] as any).computation_version);
    assert.equal((snap1Hlr.rows[0] as any).outcome, (snap2Hlr.rows[0] as any).outcome);
    assert.equal((snap1Hlr.rows[0] as any).m, (snap2Hlr.rows[0] as any).m);
    // computed_at should not change under an idempotent no-op.
    assert.equal(
      (snap1Hlr.rows[0] as any).computed_at.toISOString(),
      (snap2Hlr.rows[0] as any).computed_at.toISOString()
    );

    const snap2Rlw = await p.query(
      `SELECT count(*)::int AS n FROM real_line_windows WHERE internal_player_id=$1`,
      [base.player_id]
    );
    assert.equal((snap1Rlw.rows[0] as any).n, (snap2Rlw.rows[0] as any).n);

    // Invalidation still processed with disposition 'recomputed'.
    const snap2Inv = await p.query(
      `SELECT processed_at, processed_note FROM recomputation_invalidations WHERE entity_id=$1`,
      [base.pgs_id]
    );
    assert.equal((snap1Inv.rows[0] as any).processed_at.toISOString(), (snap2Inv.rows[0] as any).processed_at.toISOString());
    assert.equal((snap1Inv.rows[0] as any).processed_note, 'recomputed');
    assert.equal((snap2Inv.rows[0] as any).processed_note, 'recomputed');
  });

  // ---------------------------------------------------------------------
  // Disposition test: no eligible source → processed_note='no_eligible_source'
  // ---------------------------------------------------------------------
  it('LOAD-BEARING: no eligible source state → processed_note=\'no_eligible_source\' (not silently marked as recomputed)', async (t) => {
    if (skipIfUnavailable(t)) return;
    const p = pool!;
    // Seed but then DELETE the pgs so the invalidation resolves to nothing.
    const base = await seedBase();
    // Emit a new invalidation pointing at a bogus pgs_id (no matching row).
    const bogus_pgs_id = randomUUID();
    await emitFreshInvalidation(bogus_pgs_id, base.history_id);
    // Drain — the first pgs invalidation succeeds; the bogus one gets
    // marked 'no_eligible_source'.
    const r = await drainRecomputationInvalidations(p, { max_batch: 10 });
    assert.equal(r.invalidations_processed, 2);
    assert.equal(r.skipped_no_effect, 1);
    const bogus = await p.query(
      `SELECT processed_note FROM recomputation_invalidations WHERE entity_id=$1::uuid`,
      [bogus_pgs_id]
    );
    assert.equal((bogus.rows[0] as any).processed_note, 'no_eligible_source');
    const real = await p.query(
      `SELECT processed_note FROM recomputation_invalidations WHERE entity_id=$1::uuid`,
      [base.pgs_id]
    );
    assert.equal((real.rows[0] as any).processed_note, 'recomputed');
  });
});

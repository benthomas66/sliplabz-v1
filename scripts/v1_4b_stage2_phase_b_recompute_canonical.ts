// V1-4b Stage 2 Phase B — canonical_closing_points correction (reproducible).
//
// SCOPE
//   The pre-launch initial seed's canonical_closing_points rows were computed
//   from the wrong grain — per (event, bookmaker, market) rather than the
//   correct (internal_game_id, internal_player_id, market_key) cross-book.
//   This script deletes the incorrect rows and inserts the correct set,
//   inside a single transaction.
//
// AUTHORITY
//   Governor revise 2026-07-13 (delete-and-replace explicitly authorized for
//   the V1-4b pre-launch initial seed only).
//   Complete spec §7.10.2 — canonical selection (unique modal).
//   Odds sub-spec §18.4 — no synthetic point, no interpolation.
//
// WHAT THIS SCRIPT DOES
//   1. Loads every source_closing_quote from the hosted DB.
//   2. Groups them by (game, player, market) and calls
//      selectCanonicalClosingPoint on each group.
//   3. Inside a single BEGIN/COMMIT block:
//        a. DELETE FROM canonical_closing_points (bounded scope: all rows).
//        b. INSERT the corrected set (batched, 500 rows/statement).
//      If any batch fails, ROLLBACK reverts to the pre-correction state.
//   4. Marks the inserted rows with computation_version=2 so a downstream
//      auditor can identify the corrected set. (V1-4 default is 1.)
//
// WHAT THIS SCRIPT DOES NOT DO
//   * No provider calls of any kind.
//   * No modification of source_closing_quotes, market_snapshots,
//     market_offerings, oddsapi_ingestion_runs, oddsapi_raw_responses, or
//     any seed_run_records / seed_slice_watermarks row.
//   * No touching of observed_line_lifecycle, movement_events,
//     current_market_rows (schema CHECKs already reject seeded provenance).
//
// USAGE
//   SLIPLABZ_HOSTED_DATABASE_URL=... npx tsx \
//     scripts/v1_4b_stage2_phase_b_recompute_canonical.ts
//
// This is a governor-authorized one-time correction. Post-launch canonical
// corrections should use a forward-fix (bumped computation_version + a
// superseded audit) rather than delete-and-replace.

import pg from 'pg';

import { deleteAndReplaceCanonicalClosingPointsFromDb } from '../src/seed/orchestrator/canonicalClosingPointsForSeed.js';
import type { SliplabzPool } from '../src/db/connection.js';

const CORRECTION_COMPUTATION_VERSION = 2;

const DB_URL = process.env['SLIPLABZ_HOSTED_DATABASE_URL'];
if (DB_URL === undefined || DB_URL === '') {
  console.error('SLIPLABZ_HOSTED_DATABASE_URL required'); process.exit(1);
}

const rawPool = new pg.Pool({
  connectionString: DB_URL,
  max: 1,
  idleTimeoutMillis: 10_000,
  allowExitOnIdle: true,
  keepAlive: true,
});
const pool: SliplabzPool = Object.freeze({
  raw: rawPool,
  query: (sql: string, params?: unknown[]) => (params === undefined ? rawPool.query(sql) : rawPool.query(sql, params)),
  connect: () => rawPool.connect(),
  end: () => rawPool.end(),
});

async function main(): Promise<void> {
  console.log('# V1-4b Phase B canonical correction starting');
  console.log(`#   hosted DB: ${DB_URL!.replace(/:[^:@]+@/, ':REDACTED@')}`);
  console.log(`#   correction computation_version: ${CORRECTION_COMPUTATION_VERSION}`);

  // Report the pre-correction count so the audit-trail is complete.
  const before = await pool.query(
    `SELECT count(*)::int AS n,
            count(*) FILTER (WHERE computation_version = 1)::int AS v1,
            count(*) FILTER (WHERE computation_version = 2)::int AS v2
       FROM canonical_closing_points`
  );
  const beforeCounts = before.rows[0] as { n: number; v1: number; v2: number };
  console.log(`# pre-correction canonical_closing_points: total=${beforeCounts.n} (v1=${beforeCounts.v1}, v2=${beforeCounts.v2})`);
  const sourceRow = await pool.query(`SELECT count(*)::int AS n FROM source_closing_quotes`);
  console.log(`# source_closing_quotes rows (input to correction): ${(sourceRow.rows[0] as { n: number }).n}`);

  // Perform the transactional correction. `restrict_to_internal_game_ids:
  // null` covers the entire table — appropriate for the pre-launch initial
  // seed per governor authorization.
  const result = await deleteAndReplaceCanonicalClosingPointsFromDb(pool, {
    restrict_to_internal_game_ids: null,
    computation_version: CORRECTION_COMPUTATION_VERSION,
  });

  console.log(`\n# transactional correction complete`);
  console.log(`#   deleted (pre-existing rows): ${result.deleted}`);
  console.log(`#   inserted (post-correction rows): ${result.inserted}`);
  console.log(`#   by selection_method: ${JSON.stringify(result.counts_by_selection_method)}`);
  console.log(`#   by coverage_label:    ${JSON.stringify(result.counts_by_coverage_label)}`);

  // Post-correction verification.
  const after = await pool.query(
    `SELECT count(*)::int AS n,
            count(*) FILTER (WHERE computation_version = 2)::int AS v2
       FROM canonical_closing_points`
  );
  const afterCounts = after.rows[0] as { n: number; v2: number };
  console.log(`# post-correction canonical_closing_points: total=${afterCounts.n} (v2=${afterCounts.v2})`);
  if (afterCounts.n !== result.inserted) {
    console.error(`# WARNING: post-correction total (${afterCounts.n}) does not match inserted (${result.inserted}) — investigate.`);
    process.exitCode = 2;
  }

  // Non-modification confirmation — read-only sanity queries.
  const sourceRowAfter = await pool.query(`SELECT count(*)::int AS n FROM source_closing_quotes`);
  const snapshotsAfter = await pool.query(`SELECT count(*)::int AS n FROM market_snapshots WHERE request_kind='historical_query'`);
  console.log(`\n# non-modification confirmation:`);
  console.log(`#   source_closing_quotes rows: ${(sourceRowAfter.rows[0] as { n: number }).n} (unchanged from ${(sourceRow.rows[0] as { n: number }).n})`);
  console.log(`#   historical market_snapshots rows: ${(snapshotsAfter.rows[0] as { n: number }).n}`);
}

main().catch((e) => { console.error('# correction failed:', e); process.exitCode = 1; }).finally(() => pool.end());

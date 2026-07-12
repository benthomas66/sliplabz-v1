// Integration-test database bootstrap.
//
// Authority: docs/architecture/V1_PERSISTENCE_CONTRACT.md §6.
//
// This helper CENTRALIZES the "SLIPLABZ_DATABASE_URL detected? then connect
// and apply migrations. Not detected? print a visible SKIP once and every
// caller test skips explicitly."

import { readEnvConfig, openPool, applyAllMigrations } from '../../../src/db/index.js';
import type { SliplabzPool } from '../../../src/db/connection.js';

let _skip_notice_printed = false;

export interface TestDbHandle {
  readonly available: boolean;
  readonly pool: SliplabzPool | null;
  readonly skip_reason: string | null;
}

/**
 * Check whether the database already has the V1-4 schema. Makes migration
 * application idempotent across multiple integration-test files that share
 * the same target database.
 */
async function schemaAlreadyApplied(pool: SliplabzPool): Promise<boolean> {
  const res = await pool.query(
    `SELECT count(*)::int AS n FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'canonical_closing_points'`
  );
  return (res.rows[0] as { n: number }).n === 1;
}

/**
 * Open a fresh database against `SLIPLABZ_DATABASE_URL`, apply all
 * migrations if not already applied, and return a pool. If the env var is
 * absent, return `available: false` with a visible skip reason.
 *
 * The caller MUST invoke `pool.end()` in an `after` hook.
 */
export async function openTestDb(): Promise<TestDbHandle> {
  const cfg = readEnvConfig();
  if (cfg === null) {
    const reason =
      'SLIPLABZ_DATABASE_URL not set; skipping persistence integration test. ' +
      'Start `sliplabz-v1-4-postgres` docker container and export the URL to run.';
    if (!_skip_notice_printed) {
      // eslint-disable-next-line no-console
      console.log(`# SKIP integration: ${reason}`);
      _skip_notice_printed = true;
    }
    return Object.freeze({ available: false, pool: null, skip_reason: reason });
  }
  const pool = openPool(cfg);
  if (!(await schemaAlreadyApplied(pool))) {
    await applyAllMigrations(pool);
  }
  return Object.freeze({ available: true, pool, skip_reason: null });
}

/**
 * TRUNCATE every table that could contain persisted V1-4 state. Called at
 * the start of each integration test to ensure isolation without dropping
 * the schema.
 */
export async function truncateAllV14Tables(pool: SliplabzPool): Promise<void> {
  const tables = [
    'real_line_windows',
    'historical_line_results',
    'canonical_closing_points',
    'source_closing_quotes',
    'movement_events',
    'observed_line_lifecycle',
    'close_boundary_evaluations',
    'current_market_rows',
    'market_offering_raw_rows',
    'market_offerings',
    'market_snapshots',
    'oddsapi_event_presence',
    'oddsapi_event_snapshots',
    'oddsapi_raw_responses',
    'oddsapi_ingestion_runs',
    'oddsapi_quarantine',
    'market_registry',
    'bookmaker_registry',
    'recomputation_invalidations',
    'post_final_reconciliation_schedule',
    'bdl_availability_current_state',
    'bdl_availability_snapshots',
    'player_game_stat_history',
    'player_game_stats',
    'game_status_observations',
    'bdl_game_snapshots',
    'bdl_active_player_presence',
    'bdl_active_player_snapshots',
    'bdl_team_snapshots',
    'bdl_import_watermarks',
    'bdl_raw_responses',
    'bdl_ingestion_runs',
    'mapping_history',
    'player_reconciliation_queue',
    'event_reconciliation_queue',
    'player_aliases',
    'team_aliases',
    'provider_games',
    'provider_players',
    'provider_teams',
    'games',
    'players',
    'teams',
  ];
  await pool.query(`TRUNCATE TABLE ${tables.join(', ')} CASCADE`);
}

// V1-4c Phase B — thin operator script for the historical_line_results
// populator.
//
// Composition-only: every load-bearing decision lives in
// src/lines/historicalLineResultsBackfill.ts. This script:
//   * Loads SLIPLABZ_HOSTED_DATABASE_URL from the environment (never
//     printed).
//   * Prints a preflight summary (row counts + eligible-grain count) so
//     the operator sees what will be written BEFORE any INSERT.
//   * Runs runHistoricalLineResultsBackfill.
//   * Prints per-batch progress and the final counters as JSON.
//
// Governor gates:
//   * ZERO provider calls. No src/odds/* or src/bdl/httpClient imported.
//   * Writes go to the HOSTED database only (SLIPLABZ_HOSTED_DATABASE_URL).
//   * The test suite is unchanged; this is an operator script, not a test.
//
// Usage:
//   set -a && source .env && set +a
//   node --import tsx scripts/v1_4c_phase_b_populate.ts \
//     > /tmp/v1_4c_phase_b.log 2>&1
//   Flags (all optional):
//     --dry-run             BEGIN/ROLLBACK per batch; no persistent effect.
//     --market <key>        restrict to one market (spot-check).
//     --batch-size N        override DEFAULT_BATCH_SIZE (500).
//     --game <uuid>         restrict to explicit internal_game_id(s);
//                           repeatable. Reuses the committed
//                           restrict_to_internal_game_ids scope parameter.
//                           Omit for the historical global behaviour.

import pg from 'pg';

import {
  runHistoricalLineResultsBackfill,
  HISTORICAL_LINE_RESULTS_BACKFILL_ELIGIBILITY_SQL,
  BACKFILL_PROVENANCE,
  DEFAULT_BATCH_SIZE,
  type BackfillCounters,
} from '../src/lines/historicalLineResultsBackfill.js';
import { V1_5_COMPUTATION_VERSION } from '../src/computation/computationVersion.js';

interface Args {
  readonly dry_run: boolean;
  readonly only_market: string | null;
  readonly batch_size: number;
  /** Explicit game restriction (repeatable `--game`). Empty = global. */
  readonly games: ReadonlyArray<string>;
}

function parseArgs(argv: readonly string[]): Args {
  let dry_run = false;
  let only_market: string | null = null;
  let batch_size = DEFAULT_BATCH_SIZE;
  // V1-OP-8c Track 1: repeatable game restriction, reusing the COMMITTED
  // `restrict_to_internal_game_ids` scope parameter (`54c346d`). Narrowing
  // only — the eligibility SQL, grain, and UPSERT are untouched, so a grain
  // processed under it is byte-identical to an unrestricted run. Omitting the
  // flag preserves the historical global behaviour exactly.
  const games: string[] = [];
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--dry-run') dry_run = true;
    else if (a === '--market') {
      const v = argv[i + 1];
      if (v === undefined) throw new Error('--market requires a value');
      only_market = v;
      i += 1;
    } else if (a === '--batch-size') {
      const v = argv[i + 1];
      if (v === undefined) throw new Error('--batch-size requires a value');
      const n = Number(v);
      if (!Number.isFinite(n) || n < 1) throw new Error('--batch-size must be a positive integer');
      batch_size = Math.floor(n);
      i += 1;
    } else if (a === '--game') {
      const v = argv[i + 1];
      if (v === undefined) throw new Error('--game requires a value');
      if (v.trim() === '') throw new Error('--game requires a non-empty internal_game_id');
      games.push(v.trim());
      i += 1;
    }
  }
  return { dry_run, only_market, batch_size, games };
}

function redactUrl(u: string): string {
  return u.replace(/:[^:@]+@/, ':REDACTED@');
}

/**
 * Preflight probe: read-only, wrapped in a READ ONLY transaction so an
 * accidental write would be rejected server-side. Reports the eligible
 * grain count the run will target.
 */
async function preflight(connection_string: string, only_market: string | null): Promise<{
  historical_line_results_before: number;
  eligible_grains_expected: number;
  per_market_expected: Record<string, number>;
}> {
  const c = new pg.Client({
    connectionString: connection_string,
    ssl: connection_string.includes('supabase.') ? { rejectUnauthorized: false } : undefined,
    statement_timeout: 15_000,
  });
  await c.connect();
  try {
    await c.query('BEGIN READ ONLY');
    const total = await c.query(`SELECT COUNT(*)::int AS n FROM historical_line_results`);
    const historical_line_results_before = (total.rows[0] as { n: number }).n;

    const params: unknown[] = [];
    let market_clause = '';
    if (only_market !== null) {
      market_clause = `AND ccp.market_key = $1::text`;
      params.push(only_market);
    }
    const eligible = await c.query(
      `SELECT ccp.market_key, COUNT(*)::int AS n
         FROM canonical_closing_points ccp
         JOIN market_registry mr
           ON mr.provider_key = ccp.market_key
         JOIN player_game_stats pgs
           ON pgs.internal_game_id   = ccp.internal_game_id
          AND pgs.internal_player_id = ccp.internal_player_id
        WHERE ${HISTORICAL_LINE_RESULTS_BACKFILL_ELIGIBILITY_SQL}
          ${market_clause}
        GROUP BY ccp.market_key
        ORDER BY ccp.market_key`,
      params
    );
    let expected = 0;
    const per_market: Record<string, number> = {};
    for (const row of eligible.rows as Array<{ market_key: string; n: number }>) {
      per_market[row.market_key] = row.n;
      expected += row.n;
    }
    await c.query('ROLLBACK');
    return { historical_line_results_before, eligible_grains_expected: expected, per_market_expected: per_market };
  } finally {
    await c.end();
  }
}

async function main(): Promise<void> {
  const url = process.env['SLIPLABZ_HOSTED_DATABASE_URL'];
  if (url === undefined || url === '') {
    console.error(
      'ERROR: SLIPLABZ_HOSTED_DATABASE_URL is required. Load your .env first ' +
      '(`set -a && source .env && set +a`). This script does NOT fall back to a local URL.'
    );
    process.exit(2);
  }

  const args = parseArgs(process.argv.slice(2));

  console.log(
    JSON.stringify(
      {
        kind: 'preflight',
        hosted_db_host_redacted: redactUrl(url),
        args,
        computation_version: V1_5_COMPUTATION_VERSION,
        provenance: BACKFILL_PROVENANCE,
        eligibility_sql: HISTORICAL_LINE_RESULTS_BACKFILL_ELIGIBILITY_SQL,
        governor_notes:
          'ZERO provider calls. No Odds API. No BDL. Reads/writes are hosted-Supabase-only.',
      },
      null,
      2
    )
  );

  const pre = await preflight(url, args.only_market);
  console.log(
    JSON.stringify(
      {
        kind: 'preflight_counts',
        historical_line_results_before: pre.historical_line_results_before,
        eligible_grains_expected: pre.eligible_grains_expected,
        per_market_expected: pre.per_market_expected,
      },
      null,
      2
    )
  );

  if (pre.eligible_grains_expected === 0) {
    console.log(
      JSON.stringify(
        {
          kind: 'preflight_empty',
          note:
            'zero eligible grains — either player_game_stats is empty or the eligibility ' +
            'filter excluded every row. No batches will be executed.',
        },
        null,
        2
      )
    );
    return;
  }

  let batches_reported = 0;
  const counters: BackfillCounters = await runHistoricalLineResultsBackfill({
    connection_string: url,
    batch_size: args.batch_size,
    dry_run: args.dry_run,
    ...(args.only_market !== null ? { only_market: args.only_market } : {}),
    ...(args.games.length > 0 ? { restrict_to_internal_game_ids: args.games } : {}),
    on_batch: (progress) => {
      batches_reported += 1;
      // Cheap progress line — full counters on end of run below.
      if (batches_reported <= 20 || batches_reported % 5 === 0) {
        console.log(
          JSON.stringify(
            {
              kind: 'batch_progress',
              batches_ok: progress.batches_ok,
              batches_retried: progress.batches_retried,
              grains_observed: progress.grains_observed,
              rows_inserted: progress.rows_inserted,
              rows_updated: progress.rows_updated,
            },
            null,
            2
          )
        );
      }
    },
  });

  console.log(
    JSON.stringify(
      {
        kind: 'complete',
        counters,
        dry_run: args.dry_run,
      },
      null,
      2
    )
  );
}

main().catch((err: unknown) => {
  console.error('# ERROR:', err instanceof Error ? err.stack ?? err.message : String(err));
  process.exit(1);
});

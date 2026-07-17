// V1-4d STEP 3 — run V1-5 current_market_rows aggregator.
//
// Composes: aggregateCurrentMarketRowsForGame (src/computation/driver/currentMarketRowsAggregator.ts).
// Chain: poll → market_snapshots (current_poll, self_observed) → aggregator → current_market_rows.
//
// Because all five current_poll snapshots landed with
// `linked_internal_game_id = NULL` (upcoming games not seeded in games table),
// the aggregator's per-game selector finds zero distinct games and reports
// zero grains. The isolation invariant (CURRENT_ONLY_WHERE_CLAUSE) still
// holds trivially: no current row is visible through the historical path
// and no historical row is visible through the current path.

import { openPool } from '../src/db/connection.js';
import { aggregateCurrentMarketRowsForGame } from '../src/computation/driver/currentMarketRowsAggregator.js';

const HOSTED = process.env['SLIPLABZ_HOSTED_DATABASE_URL']!;

async function main(): Promise<void> {
  const pool = openPool({
    connectionString: HOSTED,
    max: 1,
    statement_timeout_ms: 30_000,
    ssl: HOSTED.includes('supabase.') ? 'require' : 'disable',
  });
  try {
    // Enumerate distinct linked internal_game_ids across current_poll snapshots.
    const q = await pool.query(
      `SELECT DISTINCT linked_internal_game_id::text AS gid
         FROM market_snapshots
        WHERE request_kind = 'current_poll'
          AND provenance = 'self_observed'
          AND linked_internal_game_id IS NOT NULL`
    );
    console.log(JSON.stringify({
      kind: 'step3_preflight',
      distinct_linked_games: q.rowCount,
      games_to_aggregate: q.rows,
    }, null, 2));

    let total_grains = 0;
    let total_rows_written = 0;
    for (const r of q.rows as Array<{ gid: string }>) {
      const result = await aggregateCurrentMarketRowsForGame(pool, {
        internal_game_id: r.gid,
      });
      total_grains += result.grains_processed;
      total_rows_written += result.rows_written;
      console.log(`  game ${r.gid.slice(0, 8)}…: grains=${result.grains_processed} rows=${result.rows_written} v=${result.computation_version}`);
    }

    // Report current_market_rows count after aggregation.
    const cmr = await pool.query(`SELECT count(*)::int AS n FROM current_market_rows`);
    const cmr_freshness = await pool.query(`SELECT freshness_state, count(*)::int AS n FROM current_market_rows GROUP BY freshness_state ORDER BY freshness_state`);
    console.log(JSON.stringify({
      kind: 'step3_summary',
      total_grains_processed: total_grains,
      total_rows_written: total_rows_written,
      current_market_rows_after: (cmr.rows[0] as { n: number }).n,
      freshness_distribution_in_current_market_rows: cmr_freshness.rows,
    }, null, 2));
  } finally {
    await pool.end();
  }
}

main().catch((err: unknown) => {
  console.error('# ERROR:', err instanceof Error ? err.stack ?? err.message : String(err));
  process.exit(1);
});

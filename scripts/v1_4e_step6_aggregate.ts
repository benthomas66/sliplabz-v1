// V1-4e STEP 6 — aggregate for each linked game.
// OBSERVATIONAL ONLY. No cadence recommendation. No §C.3 change.

import { openPool } from '../src/db/connection.js';
import { aggregateCurrentMarketRowsForGame } from '../src/computation/driver/currentMarketRowsAggregator.js';
import { CURRENT_ONLY_WHERE_CLAUSE } from '../src/lines/currentHistoricalIsolation.js';
import { writeFileSync } from 'node:fs';

const HOSTED = process.env['SLIPLABZ_HOSTED_DATABASE_URL']!;

async function main(): Promise<void> {
  const pool = openPool({
    connectionString: HOSTED, max: 1, statement_timeout_ms: 30_000,
    ssl: HOSTED.includes('supabase.') ? 'require' : 'disable',
  });
  try {
    const games = await pool.query(
      `SELECT DISTINCT linked_internal_game_id::text AS gid
         FROM market_snapshots
        WHERE ${CURRENT_ONLY_WHERE_CLAUSE}
          AND linked_internal_game_id IS NOT NULL`
    );
    const per_game: any[] = [];
    let total_grains = 0, total_rows = 0;
    for (const g of games.rows as Array<{ gid: string }>) {
      const r = await aggregateCurrentMarketRowsForGame(pool, { internal_game_id: g.gid });
      total_grains += r.grains_processed; total_rows += r.rows_written;
      per_game.push({ internal_game_id: g.gid, grains: r.grains_processed, rows_written: r.rows_written, cv: r.computation_version });
    }

    const cmr_total = await pool.query(`SELECT count(*)::int AS n FROM current_market_rows`);
    const cmr_fresh = await pool.query(`SELECT freshness_state, count(*)::int AS n FROM current_market_rows GROUP BY freshness_state ORDER BY freshness_state`);
    const cmr_by_market = await pool.query(`SELECT market_key, count(*)::int AS n FROM current_market_rows GROUP BY market_key ORDER BY market_key`);
    const cmr_by_book_count = await pool.query(`SELECT eligible_sportsbook_count, count(*)::int AS n FROM current_market_rows GROUP BY eligible_sportsbook_count ORDER BY eligible_sportsbook_count`);

    const artifact = {
      ticket: 'V1-4e', step: 6,
      per_game_aggregation: per_game,
      totals: { grains_processed: total_grains, rows_written: total_rows },
      current_market_rows_after: (cmr_total.rows[0] as { n: number }).n,
      freshness_distribution: cmr_fresh.rows,
      by_market: cmr_by_market.rows,
      by_eligible_sportsbook_count: cmr_by_book_count.rows,
      observational_note:
        'Observational only. Freshness distribution reported. Cadence/threshold decisions '
        + 'are out of scope for this ticket and belong to the two-poll freshness probe / §C.3 revisit.',
    };
    console.log(JSON.stringify(artifact, null, 2));
    writeFileSync('/tmp/v14d/step6_v4e_artifact.json', JSON.stringify(artifact, null, 2));
  } finally { await pool.end(); }
}

main().catch((err) => { console.error('# ERROR:', err instanceof Error ? err.stack ?? err.message : String(err)); process.exit(1); });

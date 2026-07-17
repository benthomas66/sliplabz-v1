// V1-4e hosted proof — read-only.
import { openPool } from '../src/db/connection.js';
import { CURRENT_ONLY_WHERE_CLAUSE } from '../src/lines/currentHistoricalIsolation.js';
import { aggregateCurrentMarketRowsForGame } from '../src/computation/driver/currentMarketRowsAggregator.js';

const HOSTED = process.env['SLIPLABZ_HOSTED_DATABASE_URL']!;

async function main(): Promise<void> {
  const pool = openPool({
    connectionString: HOSTED, max: 1, statement_timeout_ms: 30_000,
    ssl: HOSTED.includes('supabase.') ? 'require' : 'disable',
  });
  try {
    console.log(`CURRENT_ONLY_WHERE_CLAUSE = ${CURRENT_ONLY_WHERE_CLAUSE}`);

    // (a) upcoming games exist.
    const upc = await pool.query(
      `SELECT count(*)::int AS n_upcoming,
              min(scheduled_start_utc) AS min_start,
              max(scheduled_start_utc) AS max_start
         FROM games WHERE scheduled_start_utc >= now()`
    );
    console.log('upcoming games:', upc.rows[0]);

    // (b) queued events before/after (target 5 events).
    const target_pids = [
      '00a997433337939ebda3beb882a1e2db',
      '571b28ddb7c28b45b2925d493d2085c8',
      '4a1af047b50cc335d69665ae9b499206',
      '034012f210532a879b3d1ab5de8306e6',
      '02c8aae5b168305c60aa6f9c66f443d1',
    ];
    const pg = await pool.query(
      `SELECT count(*)::int AS n_approved FROM provider_games
        WHERE provider='odds_api' AND provider_game_id = ANY($1::text[]) AND mapping_state='approved'`,
      [target_pids]
    );
    console.log('target provider_games approved (was 0, now):', pg.rows[0]);

    // (c) linked_internal_game_id populated for the new (STEP-5) snapshots.
    const ss = await pool.query(
      `SELECT linked_internal_game_id IS NULL AS null_linked, count(*)::int AS n
         FROM market_snapshots WHERE request_kind='current_poll'
         GROUP BY linked_internal_game_id IS NULL`
    );
    console.log('current_poll snapshots by null-linked:', ss.rows);

    // (d) current_market_rows produced.
    const cmr = await pool.query(`SELECT count(*)::int AS n FROM current_market_rows`);
    console.log('current_market_rows:', cmr.rows[0]);

    // (e) isolation — both directions.
    const isoA = await pool.query(
      `SELECT count(*)::int AS n FROM market_snapshots
        WHERE (request_kind='historical_query' OR provenance='backfilled_historical')
          AND (request_kind='current_poll' AND provenance='self_observed')`
    );
    const isoB = await pool.query(
      `SELECT count(*)::int AS n FROM market_snapshots
        WHERE ${CURRENT_ONLY_WHERE_CLAUSE}
          AND (request_kind='historical_query' OR provenance='backfilled_historical')`
    );
    const isoC = await pool.query(
      `SELECT request_kind, provenance, count(*)::int AS n FROM market_snapshots
        GROUP BY request_kind, provenance ORDER BY request_kind`
    );
    console.log('isolation A (current-through-historical-path):', isoA.rows[0], '(must be 0)');
    console.log('isolation B (historical-through-CURRENT_ONLY):', isoB.rows[0], '(must be 0)');
    console.log('both kinds present:', isoC.rows);

    // (f) counts unchanged.
    const hlr = await pool.query(`SELECT count(*)::int AS n FROM historical_line_results`);
    const pgs = await pool.query(`SELECT count(*)::int AS n FROM player_game_stats`);
    console.log('historical_line_results:', hlr.rows[0], '(expected 4658)');
    console.log('player_game_stats:', pgs.rows[0], '(expected 4194)');

    // (g) idempotency: re-run aggregator + re-populate; checksum on derived cols.
    const cmr_before = await pool.query(
      `SELECT count(*)::int AS n,
              coalesce(md5(string_agg(concat_ws('|',
                internal_game_id::text, internal_player_id::text, market_key,
                coalesce(line_consensus_point::text,'-'),
                coalesce(eligible_sportsbook_count::text,'-'),
                coalesce(freshness_state::text,'-'),
                computation_version::text
              ), '::' ORDER BY internal_game_id::text, internal_player_id::text, market_key)), '(empty)') AS checksum
        FROM current_market_rows`
    );
    const games_q = await pool.query(
      `SELECT DISTINCT linked_internal_game_id::text AS gid FROM market_snapshots
        WHERE ${CURRENT_ONLY_WHERE_CLAUSE} AND linked_internal_game_id IS NOT NULL`
    );
    let re_grains = 0;
    for (const g of games_q.rows as Array<{ gid: string }>) {
      const r = await aggregateCurrentMarketRowsForGame(pool, { internal_game_id: g.gid });
      re_grains += r.grains_processed;
    }
    const cmr_after = await pool.query(
      `SELECT count(*)::int AS n,
              coalesce(md5(string_agg(concat_ws('|',
                internal_game_id::text, internal_player_id::text, market_key,
                coalesce(line_consensus_point::text,'-'),
                coalesce(eligible_sportsbook_count::text,'-'),
                coalesce(freshness_state::text,'-'),
                computation_version::text
              ), '::' ORDER BY internal_game_id::text, internal_player_id::text, market_key)), '(empty)') AS checksum
        FROM current_market_rows`
    );
    console.log('idempotency: n_before=', (cmr_before.rows[0] as any).n,
      'checksum_before=', (cmr_before.rows[0] as any).checksum.slice(0, 16),
      '\n              n_after= ', (cmr_after.rows[0] as any).n,
      'checksum_after= ', (cmr_after.rows[0] as any).checksum.slice(0, 16),
      '\n              re_grains=', re_grains,
      'pass=', (cmr_before.rows[0] as any).checksum === (cmr_after.rows[0] as any).checksum);
  } finally { await pool.end(); }
}

main().catch((err) => { console.error('# ERROR:', err instanceof Error ? err.stack ?? err.message : String(err)); process.exit(1); });

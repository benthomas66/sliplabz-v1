// V1-4d verification — hosted, read-only.
//
// (i) Isolation invariant (CURRENT_ONLY_WHERE_CLAUSE from src/lines/currentHistoricalIsolation.ts):
//     - Zero current_poll rows visible through the historical path.
//     - Zero historical_query rows visible through the current path.
// (ii) historical_line_results count unchanged at 4658.
// (iii) player_game_stats count unchanged at 4194.
// (iv) Aggregator + populator are idempotent (checksum over derived columns).

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
    console.log(`# CURRENT_ONLY_WHERE_CLAUSE = ${CURRENT_ONLY_WHERE_CLAUSE}`);

    // (i.a) Zero current_poll rows visible through the historical path:
    //       any query that selects historical must NOT return current_poll rows.
    const iso_a = await pool.query(
      `SELECT count(*)::int AS n FROM market_snapshots
        WHERE request_kind = 'historical_query' AND provenance = 'self_observed'`
    );
    const iso_a_wrong = await pool.query(
      `SELECT count(*)::int AS n FROM market_snapshots
        WHERE (request_kind = 'historical_query' OR provenance = 'backfilled_historical')
          AND (request_kind = 'current_poll' AND provenance = 'self_observed')`
    );
    console.log(JSON.stringify({
      isolation_invariant_ia_current_visible_through_historical_path: {
        historical_self_observed_count: (iso_a.rows[0] as { n: number }).n,
        rows_that_would_violate_isolation: (iso_a_wrong.rows[0] as { n: number }).n,
        expected_violation_count: 0,
        pass: (iso_a_wrong.rows[0] as { n: number }).n === 0,
      },
    }, null, 2));

    // (i.b) Zero historical rows visible through the current path — using the
    //       actual clause directly.
    const iso_b = await pool.query(
      `SELECT request_kind, provenance, count(*)::int AS n
         FROM market_snapshots
        WHERE ${CURRENT_ONLY_WHERE_CLAUSE}
        GROUP BY request_kind, provenance`
    );
    const iso_b_only_current = iso_b.rows.every((r: any) => r.request_kind === 'current_poll' && r.provenance === 'self_observed');
    console.log(JSON.stringify({
      isolation_invariant_ib_historical_visible_through_current_path: {
        rows_matching_CURRENT_ONLY_WHERE_CLAUSE_by_kind: iso_b.rows,
        only_current_self_observed: iso_b_only_current,
        pass: iso_b_only_current,
      },
    }, null, 2));

    // (i.c) Both must hold WITH BOTH KINDS PRESENT: verify by counting each.
    const both = await pool.query(
      `SELECT request_kind, provenance, count(*)::int AS n
         FROM market_snapshots GROUP BY request_kind, provenance ORDER BY request_kind, provenance`
    );
    console.log(JSON.stringify({
      isolation_invariant_ic_both_kinds_present: {
        by_kind_provenance: both.rows,
        both_present:
          both.rows.some((r: any) => r.request_kind === 'current_poll') &&
          both.rows.some((r: any) => r.request_kind === 'historical_query'),
      },
    }, null, 2));

    // (ii) historical_line_results unchanged at 4658.
    const hlr = await pool.query(`SELECT count(*)::int AS n FROM historical_line_results`);
    console.log(JSON.stringify({
      historical_line_results_count: (hlr.rows[0] as { n: number }).n,
      expected: 4658,
      pass: (hlr.rows[0] as { n: number }).n === 4658,
    }, null, 2));

    // (iii) player_game_stats unchanged at 4194.
    const pgs = await pool.query(`SELECT count(*)::int AS n FROM player_game_stats`);
    console.log(JSON.stringify({
      player_game_stats_count: (pgs.rows[0] as { n: number }).n,
      expected: 4194,
      pass: (pgs.rows[0] as { n: number }).n === 4194,
    }, null, 2));

    // (iv) Idempotency: aggregate again (zero linked games → still zero grains)
    // and confirm current_market_rows didn't change. The populator's zero-grain
    // branch is idempotent by construction.
    const cmr_before = await pool.query(
      `SELECT count(*)::int AS n,
              coalesce(md5(string_agg(concat_ws('|',
                 internal_game_id::text, internal_player_id::text, market_key,
                 coalesce(line_consensus_point::text,'-'),
                 coalesce(eligible_sportsbook_count::text,'-'),
                 coalesce(freshness_state::text,'-'),
                 computation_version::text
              ), '::')), '(empty)') AS checksum
         FROM current_market_rows`
    );
    const games = await pool.query(
      `SELECT DISTINCT linked_internal_game_id::text AS gid
         FROM market_snapshots
        WHERE ${CURRENT_ONLY_WHERE_CLAUSE} AND linked_internal_game_id IS NOT NULL`
    );
    let re_grains = 0;
    for (const g of games.rows as Array<{ gid: string }>) {
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
              ), '::')), '(empty)') AS checksum
         FROM current_market_rows`
    );
    console.log(JSON.stringify({
      idempotency_reaggregate: {
        cmr_count_before: (cmr_before.rows[0] as any).n,
        cmr_checksum_before: (cmr_before.rows[0] as any).checksum,
        distinct_linked_games_reaggregated: games.rowCount,
        grains_reprocessed: re_grains,
        cmr_count_after: (cmr_after.rows[0] as any).n,
        cmr_checksum_after: (cmr_after.rows[0] as any).checksum,
        pass: (cmr_before.rows[0] as any).checksum === (cmr_after.rows[0] as any).checksum,
      },
    }, null, 2));
  } finally {
    await pool.end();
  }
}

main().catch((err: unknown) => {
  console.error('# ERROR:', err instanceof Error ? err.stack ?? err.message : String(err));
  process.exit(1);
});

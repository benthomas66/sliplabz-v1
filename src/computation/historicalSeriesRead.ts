// V1-8a0b — the ONE authoritative historical-series reader (shared, src-owned).
//
// Retrieves the per-game historical series for a (player, market): every game
// the player has a `player_game_stats` row for, oldest→newest, INCLUDING DNP and
// ineligible positions (they hold their chronological place; their absence from
// the eligible set is itself information — Grammar §2.2). This is the reader the
// Research View (`apps/web`) previously owned inline as `readSeries` (V1-7b); it
// is MOVED here verbatim so historical-series retrieval has exactly one owner.
// The population path (V1-8a0a) and the Research View both consume THIS reader.
//
// SEMANTICS ARE BORROWED, NOT AUTHORED. Eligibility and DNP status are the
// PERSISTED output of the committed `src/bdl/eligibility.ts computeEligibility`,
// read verbatim off `player_game_stats.eligibility_state` and `.minutes_status`;
// the "counted"/has-a-line set is anchored to `historical_line_results` with the
// committed `coverage_state IN ('complete','single_book')` predicate. This reader
// re-authors none of it.
//
// CONNECTION: caller-supplied `Tx` (a transaction/client the caller owns), so
// both the src population path and the apps/web Research View supply their own.
//
// CONTRACT: frozen for V1-8a0a (see V1_TICKET_8A0B_REPORT.md). Same rows, order,
// fields, and semantics as the V1-7b implementation — this is a MOVE, not a change.

import type { Tx } from '../db/transaction.js';
import type { PlayerStatEligibility, BdlMinutesStatus } from '../shared/enums.js';

/** ONE per-game historical-series row, oldest→newest. `stat_value` is null for
 *  games with no eligible line result (DNP / ineligible). Verbatim shape of the
 *  V1-7b app-side reader. */
export interface HistoricalSeriesRow {
  readonly game_date_utc: string;
  readonly opponent_label: string;
  readonly is_home: boolean | null;
  readonly stat_value: number | null;
  readonly eligibility_state: PlayerStatEligibility;
  readonly minutes_status: BdlMinutesStatus;
  readonly includes_backfilled_historical: boolean;
}

/**
 * Read the (player, market) historical series. `internal_game_id` is accepted
 * for call-site parity with the moved reader but is not a filter — the series
 * spans the player's window, not just the anchor game.
 */
export async function readHistoricalSeries(
  tx: Tx, internal_game_id: string, internal_player_id: string, market_key: string,
): Promise<ReadonlyArray<HistoricalSeriesRow>> {
  const r = await tx.query(
    `WITH hlr AS (
       SELECT DISTINCT ON (internal_game_id)
              internal_game_id, player_stat_value, provenance, computation_version
         FROM historical_line_results
        WHERE internal_player_id = $2::uuid
          AND market_key = $3
          AND coverage_state IN ('complete', 'single_book')
        ORDER BY internal_game_id, computation_version DESC, computed_at DESC
     )
     SELECT to_char(g.scheduled_start_utc AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS game_date_utc,
            COALESCE(ot.display_name, '') AS opponent_label,
            pgs.is_home AS is_home,
            CASE WHEN hlr.internal_game_id IS NOT NULL THEN hlr.player_stat_value::float8 ELSE NULL END AS stat_value,
            pgs.eligibility_state::text AS eligibility_state,
            pgs.minutes_status::text AS minutes_status,
            COALESCE(hlr.provenance = 'backfilled_historical', false) AS includes_backfilled_historical
       FROM player_game_stats pgs
       JOIN games g ON g.internal_game_id = pgs.internal_game_id
       LEFT JOIN teams ot ON ot.internal_team_id = pgs.internal_opponent_team_id
       LEFT JOIN hlr ON hlr.internal_game_id = pgs.internal_game_id
      WHERE pgs.internal_player_id = $1::uuid
      ORDER BY g.scheduled_start_utc ASC`,
    [internal_player_id, internal_player_id, market_key],
  );
  // NOTE: $1 (series scope: the player's games) and $2 (hlr filter) are the
  // same player id; internal_game_id is not filtered — the series spans the
  // player's window, not just the anchor game.
  void internal_game_id;
  return (r.rows as ReadonlyArray<{
    game_date_utc: string; opponent_label: string; is_home: boolean | null;
    stat_value: number | null; eligibility_state: PlayerStatEligibility;
    minutes_status: BdlMinutesStatus; includes_backfilled_historical: boolean;
  }>).map((x) => ({
    game_date_utc: x.game_date_utc, opponent_label: x.opponent_label, is_home: x.is_home,
    stat_value: x.stat_value, eligibility_state: x.eligibility_state,
    minutes_status: x.minutes_status, includes_backfilled_historical: x.includes_backfilled_historical,
  }));
}

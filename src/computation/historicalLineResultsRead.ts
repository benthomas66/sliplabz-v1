// V1-5 latest-version read helper for historical_line_results.
//
// Authority:
//   Complete spec §12.3 (each derived record includes computation_version;
//     downstream consumers select the latest per grain).
//   Governor V1-5 revise (2026-07-13): historical_line_results.UNIQUE now
//     includes computation_version, so prior-version rows are genuinely
//     immutable. Any consumer that reads historical_line_results MUST
//     select the LATEST computation_version per (game, player, market)
//     grain; otherwise a bumped result on a corrected row would be
//     shadowed by the stale prior-version row.
//
// This module is the ONE canonical read helper. New consumers that need
// "the current historical result" MUST call `readLatestHistoricalForPlayer`
// (or its companion `readLatestHistoricalForGame`) rather than SELECT
// FROM historical_line_results directly. That preserves the single-owner
// invariant per V1_COMPUTATION_CONTRACT.md §1.

import type { SliplabzPool } from '../db/connection.js';
import type { Tx } from '../db/transaction.js';
import type { RealLineOutcome } from '../shared/enums.js';

export interface LatestHistoricalLineResult {
  readonly internal_game_id: string;
  readonly internal_player_id: string;
  readonly market_key: string;
  readonly canonical_closing_point: number;
  readonly player_stat_value: number;
  readonly outcome: RealLineOutcome;
  readonly margin: number;
  readonly coverage_state: 'complete' | 'single_book';
  readonly computation_version: number;
}

/** Shared query fragment: latest computation_version per grain. */
const LATEST_CTE = `
  WITH latest AS (
    SELECT DISTINCT ON (internal_game_id, internal_player_id, market_key)
           internal_game_id, internal_player_id, market_key,
           canonical_closing_point, player_stat_value,
           outcome, margin, coverage_state, computation_version
      FROM historical_line_results
     WHERE coverage_state IN ('complete', 'single_book')
     ORDER BY internal_game_id, internal_player_id, market_key,
              computation_version DESC, computed_at DESC
  )
`;

function coerce(rows: unknown[]): ReadonlyArray<LatestHistoricalLineResult> {
  return Object.freeze(rows.map((r) => {
    const row = r as {
      internal_game_id: string; internal_player_id: string; market_key: string;
      canonical_closing_point: string; player_stat_value: string;
      outcome: RealLineOutcome; margin: string;
      coverage_state: 'complete' | 'single_book';
      computation_version: number;
    };
    return Object.freeze({
      internal_game_id: row.internal_game_id,
      internal_player_id: row.internal_player_id,
      market_key: row.market_key,
      canonical_closing_point: Number(row.canonical_closing_point),
      player_stat_value: Number(row.player_stat_value),
      outcome: row.outcome,
      margin: Number(row.margin),
      coverage_state: row.coverage_state,
      computation_version: row.computation_version,
    });
  }));
}

export async function readLatestHistoricalForPlayer(
  db: SliplabzPool | Tx,
  player_id: string
): Promise<ReadonlyArray<LatestHistoricalLineResult>> {
  const r = await db.query(
    `${LATEST_CTE}
     SELECT internal_game_id::text AS internal_game_id,
            internal_player_id::text AS internal_player_id,
            market_key,
            canonical_closing_point,
            player_stat_value,
            outcome, margin, coverage_state, computation_version
       FROM latest
      WHERE internal_player_id = $1::uuid`,
    [player_id]
  );
  return coerce(r.rows);
}

export async function readLatestHistoricalForGame(
  db: SliplabzPool | Tx,
  game_id: string
): Promise<ReadonlyArray<LatestHistoricalLineResult>> {
  const r = await db.query(
    `${LATEST_CTE}
     SELECT internal_game_id::text AS internal_game_id,
            internal_player_id::text AS internal_player_id,
            market_key,
            canonical_closing_point,
            player_stat_value,
            outcome, margin, coverage_state, computation_version
       FROM latest
      WHERE internal_game_id = $1::uuid`,
    [game_id]
  );
  return coerce(r.rows);
}

// V1-5 governor ledger #3 — current_market_rows aggregation writer.
//
// Reads the CURRENT (self_observed) offering universe via the read-model
// composer, then writes ONE row per (game, player, market, computation
// version) into `current_market_rows`.
//
// Load-bearing invariants:
//   * Uses `composeCurrentMarketRow` (single owner) — no formula duplication.
//   * The write path filters offerings via `CURRENT_ONLY_WHERE_CLAUSE` on
//     `market_snapshots` (§11.4). No historical row can leak in.
//   * `computation_version` is bumped by the caller (typically via the
//     recomputation writer). Concurrent aggregators writing at the same
//     version are idempotent via the UNIQUE (game, player, market,
//     computation_version) constraint.

import { withTransaction } from '../../db/transaction.js';
import type { SliplabzPool } from '../../db/connection.js';
import { composeCurrentMarketRow } from '../currentMarketRow.js';
import { V1_5_COMPUTATION_VERSION } from '../computationVersion.js';
import { CURRENT_ONLY_WHERE_CLAUSE } from '../../lines/currentHistoricalIsolation.js';
import type { CurrentOffering } from '../types.js';

export interface AggregateCurrentMarketRowsInput {
  readonly internal_game_id: string;
  /** When null, aggregates every player observed for the game. */
  readonly internal_player_id?: string | null;
}

export interface AggregateCurrentMarketRowsResult {
  readonly rows_written: number;
  readonly grains_processed: number;
  readonly computation_version: number;
}

export async function aggregateCurrentMarketRowsForGame(
  pool: SliplabzPool,
  input: AggregateCurrentMarketRowsInput
): Promise<AggregateCurrentMarketRowsResult> {
  let rows_written = 0;
  let grains_processed = 0;

  await withTransaction(pool, async (tx) => {
    // Enumerate distinct (player, market) grains from current offerings.
    const grains = await tx.query(
      `SELECT DISTINCT mo.internal_player_id::text AS pid, ms.market_key
         FROM market_offerings mo
         JOIN market_snapshots ms ON ms.market_snapshot_id = mo.market_snapshot_id
        WHERE ms.linked_internal_game_id = $1::uuid
          AND ${CURRENT_ONLY_WHERE_CLAUSE}
          AND mo.internal_player_id IS NOT NULL
          ${input.internal_player_id !== undefined && input.internal_player_id !== null ? 'AND mo.internal_player_id = $2::uuid' : ''}`,
      input.internal_player_id !== undefined && input.internal_player_id !== null
        ? [input.internal_game_id, input.internal_player_id]
        : [input.internal_game_id]
    );

    for (const g of grains.rows as Array<{ pid: string; market_key: string }>) {
      grains_processed += 1;
      // Pull the CURRENT offerings for the grain.
      const offs = await tx.query(
        `SELECT mo.market_offering_id::text AS market_offering_id,
                ms.market_snapshot_id::text AS source_snapshot_id,
                ms.bookmaker_key,
                COALESCE(br.display_title, ms.bookmaker_title) AS display_title,
                mo.point::float8 AS point,
                mo.raw_price_american AS raw_price_american,
                mo.side,
                ms.provider_last_update,
                ms.observed_at
           FROM market_offerings mo
           JOIN market_snapshots ms ON ms.market_snapshot_id = mo.market_snapshot_id
           JOIN bookmaker_registry br ON br.provider_key = ms.bookmaker_key
          WHERE ms.linked_internal_game_id = $1::uuid
            AND ${CURRENT_ONLY_WHERE_CLAUSE}
            AND mo.internal_player_id = $2::uuid
            AND ms.market_key = $3::text`,
        [String(input.internal_game_id), String(g.pid), String(g.market_key)]
      );

      // Group over/under prices at the same (book, point) to build CurrentOffering.
      const byBookPoint = new Map<string, {
        bookmaker_key: string; display_title: string; point: number;
        over_price: number | null; under_price: number | null;
        provider_last_update: string | null; observed_at: string;
        source_snapshot_id: string; market_offering_id: string;
      }>();
      for (const r of offs.rows as any[]) {
        const key = `${r.bookmaker_key}|${r.point}`;
        const entry = byBookPoint.get(key) ?? {
          bookmaker_key: r.bookmaker_key,
          display_title: r.display_title ?? r.bookmaker_key,
          point: Number(r.point),
          over_price: null, under_price: null,
          provider_last_update: r.provider_last_update instanceof Date ? r.provider_last_update.toISOString() : r.provider_last_update,
          observed_at: r.observed_at instanceof Date ? r.observed_at.toISOString() : r.observed_at,
          source_snapshot_id: r.source_snapshot_id,
          market_offering_id: r.market_offering_id,
        };
        if (r.side === 'over') entry.over_price = r.raw_price_american;
        else if (r.side === 'under') entry.under_price = r.raw_price_american;
        byBookPoint.set(key, entry);
      }
      const currentOfferings: ReadonlyArray<CurrentOffering> = Array.from(byBookPoint.values()).map((v) => Object.freeze(v));

      // Compose the row. Freshness derives from the latest observed_at.
      const latestObserved = currentOfferings
        .map((o) => o.observed_at)
        .sort()
        .at(-1) ?? null;
      const composed = composeCurrentMarketRow({
        internal_game_id: input.internal_game_id,
        internal_player_id: g.pid,
        market_key: g.market_key,
        current_offerings: currentOfferings,
        earliest_observations: [], // populated by a separate first-observed batch when available
        movement_events: [],
        freshness: {
          last_observed_at: latestObserved,
          now: new Date().toISOString(),
          last_poll_succeeded: true,
          source_unavailable: false,
        },
        availability: null,
      });

      // Persist. Idempotent per (grain, computation_version). Split into
      // UPDATE-then-INSERT because prepared-statement type inference for
      // pg's ON CONFLICT on this table with these many placeholders emits
      // "inconsistent types deduced for parameter" when the caller feeds
      // uuid-shaped strings. Correctness is preserved: the pair is a single
      // (internal_game_id, internal_player_id, market_key, computation_version)
      // UNIQUE grain, and we're inside a BEGIN/COMMIT.
      const upd = await tx.query(
        `UPDATE current_market_rows SET
            line_consensus_point = $4::numeric,
            line_min_point = $5::numeric,
            line_max_point = $6::numeric,
            eligible_sportsbook_count = $7::int,
            point_distribution = $8::jsonb,
            first_observed_consensus_point = $9::numeric,
            first_observed_at = $10::timestamptz,
            freshness_state = $11::freshness_state,
            updated_at = now()
          WHERE internal_game_id = $1::uuid AND internal_player_id = $2::uuid
            AND market_key = $3 AND computation_version = $12::int`,
        [
          input.internal_game_id, g.pid, g.market_key,
          composed.line_consensus.consensus_point,
          composed.line_range.min_point, composed.line_range.max_point,
          composed.eligible_book_count.count,
          JSON.stringify(composed.point_distribution.counts),
          composed.first_observed.point, composed.first_observed.at,
          composed.freshness.state,
          V1_5_COMPUTATION_VERSION,
        ]
      );
      if ((upd.rowCount ?? 0) === 0) {
        await tx.query(
          `INSERT INTO current_market_rows
             (internal_game_id, internal_player_id, market_key,
              line_consensus_point, line_min_point, line_max_point,
              eligible_sportsbook_count, point_distribution,
              first_observed_consensus_point, first_observed_at,
              freshness_state, computation_version)
           VALUES ($1::uuid,$2::uuid,$3,$4::numeric,$5::numeric,$6::numeric,$7::int,$8::jsonb,$9::numeric,$10::timestamptz,$11::freshness_state,$12::int)`,
          [
            input.internal_game_id, g.pid, g.market_key,
            composed.line_consensus.consensus_point,
            composed.line_range.min_point, composed.line_range.max_point,
            composed.eligible_book_count.count,
            JSON.stringify(composed.point_distribution.counts),
            composed.first_observed.point, composed.first_observed.at,
            composed.freshness.state,
            V1_5_COMPUTATION_VERSION,
          ]
        );
      }
      rows_written += 1;
    }
  });

  return Object.freeze({
    rows_written, grains_processed,
    computation_version: V1_5_COMPUTATION_VERSION,
  });
}

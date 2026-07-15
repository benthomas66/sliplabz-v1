// V1-5x RME-1 — HistoricalCoverageResult owner.
//
// Authority anchors:
//   docs/product/EVIDENCE_PROFILE_METHOD_V1.md §A.1 (input binding
//     "historical coverage start" → HistoricalCoverageResult.coverage_start_date)
//   docs/product/EVIDENCE_PROFILE_METHOD_V1.md §I.2 (V1-5x prerequisite ruling)
//   docs/product/EVIDENCE_PROFILE_METHOD_V1.md §C.1 / DR-25 (30-day
//     eligible-history predicate depends on this field)
//   docs/product/EVIDENCE_PROFILE_METHOD_V1.md DR-23 (backfilled_historical
//     rows count toward the windows and toward coverage)
//   docs/architecture/V1_COMPUTATION_CONTRACT.md §1 (one owner per metric)
//   docs/architecture/V1_COMPUTATION_CONTRACT.md §5 (per-metric
//     includes_backfilled_historical labeling)
//
// This module is the SINGLE owner of `HistoricalCoverageResult`. The
// evidence engine (V1-A1-3) will consume this field and MUST NOT derive
// a parallel version — the single-owner invariant in §1 of the computation
// contract is load-bearing.
//
// Source of truth (from-storage, never estimated):
//   * `historical_line_results` — one row per (game, player, market) at a
//     given `computation_version`. Per its schema comment, a row is only
//     stored when the game has a canonical_closing_point AND an eligible
//     player_game_stats row (V1-4/§11.5). Both `self_observed` and
//     `backfilled_historical` provenances are eligible per V1-4b
//     migration 44 and per DR-23.
//   * `games.scheduled_start_utc` — authoritative game date per V1-1
//     identity contract §5 (never derived from actual_start).
//
// Grain:
//   Per (`internal_player_id`, `market_key`) — matching the method
//   authority's binding table in §A.1. The engine invokes one lookup per
//   evaluated (player, market) profile.
//
// Version-latest read:
//   The read helper selects the LATEST `computation_version` per
//   (game, player, market) grain using DISTINCT ON, mirroring
//   `historicalLineResultsRead.ts`. This preserves §12.3 immutability of
//   prior-version rows while ensuring coverage reflects the current state.
//
// Under-specification recorded (see V1_TICKET_5X_REPORT.md):
//   * The authority names `coverage_start_date` without stating its type.
//     Choice: ISO-8601 date string (`YYYY-MM-DD`, UTC-day) so the DR-25
//     predicate `(today - coverage_start_date) >= 30 days` is a simple
//     day-arithmetic check with no timezone ambiguity. Null when no
//     eligible row exists.

import { V1_5_COMPUTATION_VERSION, methodVersionOf } from './computationVersion.js';
import type { SliplabzPool } from '../db/connection.js';
import type { Tx } from '../db/transaction.js';
import type { HistoricalCoverageResult } from './types.js';

/**
 * Pure input row for `computeHistoricalCoverage`. One per eligible
 * historical_line_results row at the (player, market) grain.
 */
export interface HistoricalCoverageInputRow {
  /** ISO-8601 date string (YYYY-MM-DD) derived from
   *  `games.scheduled_start_utc` in UTC. */
  readonly game_date_utc: string;
  /** True when the underlying historical_line_results row's provenance is
   *  `backfilled_historical`. */
  readonly is_backfilled_historical: boolean;
}

/**
 * Pure aggregation over an eligible historical_line_results set for a
 * single (player, market) grain. Deterministic on identical inputs.
 *
 * Non-fabrication: `coverage_start_date` is the MIN of the supplied
 * `game_date_utc` values. An empty input set returns
 * `coverage_start_date = null` and `eligible_game_count = 0`.
 */
export function computeHistoricalCoverage(
  internal_player_id: string,
  market_key: string,
  rows: ReadonlyArray<HistoricalCoverageInputRow>
): HistoricalCoverageResult {
  let earliest: string | null = null;
  let includes_backfilled = false;
  for (const r of rows) {
    if (earliest === null || r.game_date_utc < earliest) earliest = r.game_date_utc;
    if (r.is_backfilled_historical) includes_backfilled = true;
  }
  return Object.freeze({
    internal_player_id,
    market_key,
    coverage_start_date: earliest,
    eligible_game_count: rows.length,
    includes_backfilled_historical: includes_backfilled,
    method_version: methodVersionOf('historical_coverage'),
    computation_version: V1_5_COMPUTATION_VERSION,
  });
}

/**
 * Read-model helper: return the HistoricalCoverageResult for one
 * (player, market) grain, selecting the LATEST computation_version per
 * (game, player, market) triple so prior-version rows do not shadow the
 * current state (per V1_COMPUTATION_CONTRACT §12.3 and the pattern
 * established by `historicalLineResultsRead.ts`).
 */
export async function readHistoricalCoverageForPlayerMarket(
  db: SliplabzPool | Tx,
  internal_player_id: string,
  market_key: string
): Promise<HistoricalCoverageResult> {
  const r = await db.query(
    `WITH latest AS (
       SELECT DISTINCT ON (internal_game_id, internal_player_id, market_key)
              internal_game_id, internal_player_id, market_key,
              provenance, computation_version
         FROM historical_line_results
        WHERE internal_player_id = $1::uuid
          AND market_key = $2
          AND coverage_state IN ('complete', 'single_book')
        ORDER BY internal_game_id, internal_player_id, market_key,
                 computation_version DESC, computed_at DESC
     )
     SELECT to_char(g.scheduled_start_utc AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS game_date_utc,
            latest.provenance AS provenance
       FROM latest
       JOIN games g ON g.internal_game_id = latest.internal_game_id
      ORDER BY g.scheduled_start_utc ASC`,
    [internal_player_id, market_key]
  );
  const rows: HistoricalCoverageInputRow[] = (r.rows as Array<{
    game_date_utc: string;
    provenance: 'self_observed' | 'backfilled_historical';
  }>).map((row) => ({
    game_date_utc: row.game_date_utc,
    is_backfilled_historical: row.provenance === 'backfilled_historical',
  }));
  return computeHistoricalCoverage(internal_player_id, market_key, rows);
}

/**
 * DR-25 predicate: does this coverage satisfy the "≥ 30 days of eligible
 * player-game history" requirement, evaluated as of a caller-supplied
 * reference date?
 *
 * The engine calls this to decide whether to attach
 * `INCOMPLETE_HISTORICAL_COVERAGE` and force Insufficient per §C.1.
 *
 * `today_utc_date` is an ISO-8601 date string in UTC. The predicate
 * reduces to whole-day arithmetic against `coverage_start_date`; returns
 * `false` when `coverage_start_date` is null.
 *
 * A change to the 30-day threshold requires a governor decision under
 * DR-24 (a DR-25 revision → method_version bump).
 */
export function satisfiesDR25ThirtyDayCoverage(
  coverage: HistoricalCoverageResult,
  today_utc_date: string
): boolean {
  if (coverage.coverage_start_date === null) return false;
  const start = Date.UTC(
    Number(coverage.coverage_start_date.slice(0, 4)),
    Number(coverage.coverage_start_date.slice(5, 7)) - 1,
    Number(coverage.coverage_start_date.slice(8, 10))
  );
  const today = Date.UTC(
    Number(today_utc_date.slice(0, 4)),
    Number(today_utc_date.slice(5, 7)) - 1,
    Number(today_utc_date.slice(8, 10))
  );
  const days = Math.floor((today - start) / (1000 * 60 * 60 * 24));
  return days >= 30;
}

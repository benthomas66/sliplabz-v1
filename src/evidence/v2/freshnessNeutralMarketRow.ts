// V1-A2-5 — v2 composer WRAPPER (freshness-neutral market row).
//
// Owner ruling R3: the v2 wrapper applies NO freshness gate and NO
// wall-clock. It hands ALL self_observed offerings to the freshness-neutral
// assembly core (`src/computation/currentMarketRowCore.ts`) and returns the
// structural row plus `line_observed_at`. A grain older than v1's 300s
// wall-clock window therefore remains STRUCTURALLY MARKET-PRESENT for v2
// (eligible_book_count ≥ 1); its disposition is decided ONLY by the v2
// classifier from `classification_age = evaluation_reference_time −
// line_observed_at` against the D-A1 thresholds (owner ruling R5).
//
// HONESTY (the trap): the returned `CurrentMarketRow` OMITS `freshness`
// entirely. `CurrentMarketRow.freshness` is optional as of V1-A2-5; v2
// leaves it undefined. There is NO fabricated freshness value, NO sentinel,
// NO placeholder timestamp, NO `as any`. This is NOT the rejected
// `currentMarketRowV2.ts` design (owner ruling R4) — that fabricated a
// `state: 'unavailable'` sentinel; this fabricates nothing.
//
// R2 — NO WALL CLOCK: this file contains no `new Date`, no `Date.now`, no
// SQL `now()`, and imports nothing that reads a clock. The v2 composition
// path is clock-free end to end (proof 2).

import { assembleMarketRowCore } from '../../computation/currentMarketRowCore.js';
import type { AvailabilityContextInput } from '../../computation/availabilityContext.js';
import type { EarliestObservation } from '../../computation/firstObserved.js';
import type { MovementEventForSummary } from '../../computation/movementSummary.js';
import type { CurrentOffering, CurrentMarketRow } from '../../computation/types.js';

export interface FreshnessNeutralMarketRowInput {
  readonly internal_game_id: string;
  readonly internal_player_id: string;
  readonly market_key: string;
  /**
   * ALL self_observed current-poll offerings for the grain. NO wall-clock
   * gate is applied — the offerings pass straight through to the core.
   */
  readonly current_offerings: ReadonlyArray<CurrentOffering>;
  readonly earliest_observations: ReadonlyArray<EarliestObservation>;
  readonly movement_events: ReadonlyArray<MovementEventForSummary>;
  readonly availability: AvailabilityContextInput | null;
}

export interface FreshnessNeutralMarketRowResult {
  /**
   * A `CurrentMarketRow` WITHOUT `freshness`. All structural facts are
   * computed over the FULL offering set (no gate), so `eligible_book_count`
   * reflects the real present book count even for a grain that v1 would
   * consider stale.
   */
  readonly row: CurrentMarketRow;
  /**
   * Freshest `observed_at` across the offerings — from the core (single
   * owner). Feeds the v2 engine's `classification_age`; `null` when the
   * grain has no offering.
   */
  readonly line_observed_at: string | null;
}

/**
 * Compose the freshness-neutral current market row for evidence_method_v2.
 * Pure. No clock. No gate. No fabrication.
 */
export function composeCurrentMarketRowV2(
  input: FreshnessNeutralMarketRowInput
): FreshnessNeutralMarketRowResult {
  const core = assembleMarketRowCore({
    internal_game_id: input.internal_game_id,
    internal_player_id: input.internal_player_id,
    market_key: input.market_key,
    offerings: input.current_offerings,
    earliest_observations: input.earliest_observations,
    movement_events: input.movement_events,
    availability: input.availability,
  });

  // `freshness` is intentionally OMITTED (not set to any value). The v2
  // classification path never reads it.
  const row: CurrentMarketRow = Object.freeze({
    internal_game_id: core.internal_game_id,
    internal_player_id: core.internal_player_id,
    market_key: core.market_key,
    line_consensus: core.line_consensus,
    line_range: core.line_range,
    point_distribution: core.point_distribution,
    eligible_book_count: core.eligible_book_count,
    first_observed: core.first_observed,
    movement_summary: core.movement_summary,
    book_detail: core.book_detail,
    availability_context: core.availability_context,
    method_version: core.method_version,
    computation_version: core.computation_version,
    source_snapshot_ids: core.source_snapshot_ids,
  });

  return Object.freeze({ row, line_observed_at: core.line_observed_at });
}

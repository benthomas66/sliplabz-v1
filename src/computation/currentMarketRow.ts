// V1-5 current market row composer — §7.5, §11.5.
//
// Assembles the shared read-model row from the individual metric owners.
// The web app and Brief BOTH consume this composed row; a Brief/app
// equality test proves identical inputs → identical outputs.

import { computeFreshness, isFreshEnoughForConsensus } from './freshness.js';
import { assembleMarketRowCore } from './currentMarketRowCore.js';
import type { AvailabilityContextInput } from './availabilityContext.js';
import type { EarliestObservation } from './firstObserved.js';
import type { MovementEventForSummary } from './movementSummary.js';
import type { CurrentOffering, CurrentMarketRowV1 } from './types.js';
import type { FreshnessInput } from './freshness.js';

export interface CurrentMarketRowInput {
  readonly internal_game_id: string;
  readonly internal_player_id: string;
  readonly market_key: string;
  /** All self_observed offerings for the grain. Historical (backfilled_historical)
   *  rows MUST NOT appear here — the caller enforces this via the
   *  CURRENT_ONLY_WHERE_CLAUSE predicate on `market_snapshots`. */
  readonly current_offerings: ReadonlyArray<CurrentOffering>;
  readonly earliest_observations: ReadonlyArray<EarliestObservation>;
  readonly movement_events: ReadonlyArray<MovementEventForSummary>;
  readonly freshness: FreshnessInput;
  readonly availability: AvailabilityContextInput | null;
}

/**
 * Compose a `CurrentMarketRow`. Pure. Deterministic on identical inputs;
 * the Brief/app equality test asserts this by calling this function twice
 * with the same input and asserting deep equality.
 *
 * Stale sources are structurally excluded from consensus BEFORE this
 * composer is called — the caller passes only current_offerings whose
 * source freshness is fresh/aging (isFreshEnoughForConsensus). This
 * separation keeps the consensus formula honest at the input boundary
 * rather than embedding freshness filtering inside every metric.
 */
export function composeCurrentMarketRow(
  input: CurrentMarketRowInput
): CurrentMarketRowV1 {
  // Structural freshness gate on the offerings that reach the consensus
  // formulas. The caller has already computed freshness for each source,
  // and passed in only offerings whose source is fresh_or_aging. As a
  // defense-in-depth check, we compute the grain freshness here and, when
  // it is unavailable / stale / failed, treat the consensus as no_line by
  // passing an empty offering set to the consensus formulas.
  //
  // V1-A2-5: the wall-clock gate + freshness stay HERE (v1's method-specific
  // eligibility rule). The structural computation is delegated UNCHANGED to
  // the freshness-neutral core. This is byte-identical to the pre-V1-A2-5
  // body: identical formulas, identical order, over the identical gated set.
  const freshness = computeFreshness(input.freshness);
  const structurallyEligibleOfferings = isFreshEnoughForConsensus(freshness.state)
    ? input.current_offerings
    : Object.freeze([]) as ReadonlyArray<CurrentOffering>;

  const core = assembleMarketRowCore({
    internal_game_id: input.internal_game_id,
    internal_player_id: input.internal_player_id,
    market_key: input.market_key,
    offerings: structurallyEligibleOfferings,
    earliest_observations: input.earliest_observations,
    movement_events: input.movement_events,
    availability: input.availability,
  });

  // v1's row shape is UNCHANGED: it carries `freshness` and does NOT carry
  // `line_observed_at` (that lives on MarketRowCore only). Dropping the
  // core's `line_observed_at` here keeps the persisted/serialized v1 row
  // byte-identical to before.
  return Object.freeze({
    internal_game_id: core.internal_game_id,
    internal_player_id: core.internal_player_id,
    market_key: core.market_key,
    line_consensus: core.line_consensus,
    line_range: core.line_range,
    point_distribution: core.point_distribution,
    eligible_book_count: core.eligible_book_count,
    first_observed: core.first_observed,
    movement_summary: core.movement_summary,
    freshness,
    book_detail: core.book_detail,
    availability_context: core.availability_context,
    method_version: core.method_version,
    computation_version: core.computation_version,
    source_snapshot_ids: core.source_snapshot_ids,
  });
}

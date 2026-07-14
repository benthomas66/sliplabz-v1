// V1-5 current market row composer — §7.5, §11.5.
//
// Assembles the shared read-model row from the individual metric owners.
// The web app and Brief BOTH consume this composed row; a Brief/app
// equality test proves identical inputs → identical outputs.

import {
  computeEligibleBookCount,
  computeLineConsensus,
  computeLineRange,
  computePointDistribution,
} from './consensus.js';
import { computeBookDetail } from './bookDetail.js';
import { computeFirstObservedConsensus } from './firstObserved.js';
import { computeMovementSummary } from './movementSummary.js';
import { computeFreshness, isFreshEnoughForConsensus } from './freshness.js';
import { computeAvailabilityContext } from './availabilityContext.js';
import { V1_5_COMPUTATION_VERSION, methodVersionOf } from './computationVersion.js';
import type { AvailabilityContextInput } from './availabilityContext.js';
import type { EarliestObservation } from './firstObserved.js';
import type { MovementEventForSummary } from './movementSummary.js';
import type { CurrentOffering, CurrentMarketRow } from './types.js';
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
): CurrentMarketRow {
  // Structural freshness gate on the offerings that reach the consensus
  // formulas. The caller has already computed freshness for each source,
  // and passed in only offerings whose source is fresh_or_aging. As a
  // defense-in-depth check, we compute the grain freshness here and, when
  // it is unavailable / stale / failed, treat the consensus as no_line by
  // passing an empty offering set to the consensus formulas.
  const freshness = computeFreshness(input.freshness);
  const structurallyEligibleOfferings = isFreshEnoughForConsensus(freshness.state)
    ? input.current_offerings
    : Object.freeze([]) as ReadonlyArray<CurrentOffering>;

  const consensus = computeLineConsensus(structurallyEligibleOfferings);
  const range = computeLineRange(structurallyEligibleOfferings);
  const distribution = computePointDistribution(structurallyEligibleOfferings);
  const bookCount = computeEligibleBookCount(structurallyEligibleOfferings);
  const firstObserved = computeFirstObservedConsensus(input.earliest_observations);
  const movement = computeMovementSummary(
    input.movement_events,
    firstObserved.point,
    consensus.consensus_point
  );
  const bookDetail = computeBookDetail(structurallyEligibleOfferings);
  const availability = computeAvailabilityContext(input.availability);

  const source_snapshot_ids = Object.freeze(
    Array.from(new Set(structurallyEligibleOfferings.map((o) => o.source_snapshot_id)))
      .filter((s) => s !== '')
      .sort()
  );

  return Object.freeze({
    internal_game_id: input.internal_game_id,
    internal_player_id: input.internal_player_id,
    market_key: input.market_key,
    line_consensus: consensus,
    line_range: range,
    point_distribution: distribution,
    eligible_book_count: bookCount,
    first_observed: firstObserved,
    movement_summary: movement,
    freshness,
    book_detail: bookDetail,
    availability_context: availability,
    method_version: methodVersionOf('current_market_row'),
    computation_version: V1_5_COMPUTATION_VERSION,
    source_snapshot_ids,
  });
}

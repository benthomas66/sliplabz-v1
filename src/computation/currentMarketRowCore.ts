// V1-A2-5 — freshness-neutral current-market-row assembly CORE.
//
// Owner ruling R3: the composer is split into
//   * this FRESHNESS-NEUTRAL ASSEMBLY CORE — structural market computation
//     only (consensus, offered points, book count, ranges, source rows,
//     line_observed_at, and all non-temporal market facts);
//   * a v1 WRAPPER (`composeCurrentMarketRow`) applying the wall-clock gate;
//   * a v2 WRAPPER (`freshnessNeutralMarketRow.ts`) applying NO gate.
//
// This mirrors the V1-A2-2 engineCore extraction: extract the shared
// computation; each method wraps it with its own policy. The core owns
// NO eligibility rule — it computes over exactly the offering set it is
// given. The WRAPPER decides which offerings are eligible.
//
// PURE. No I/O. NO CLOCK (`new Date`, `Date.now`, SQL `now()` all absent).
// No freshness state. No fabrication. Given identical inputs → identical
// output, forever.
//
// `line_observed_at` OWNERSHIP (owner ruling): the core is the single
// owner. It computes `line_observed_at` = the freshest
// `market_snapshots.observed_at` across the offering set it receives, and
// callers TAKE it from the core rather than recomputing it. v1's wrapper
// derives its wall-clock freshness verdict from the SAME offering data;
// v2's wrapper surfaces this value straight to the engine.

import {
  computeEligibleBookCount,
  computeLineConsensus,
  computeLineRange,
  computePointDistribution,
} from './consensus.js';
import { computeBookDetail } from './bookDetail.js';
import { computeFirstObservedConsensus } from './firstObserved.js';
import { computeMovementSummary } from './movementSummary.js';
import { computeAvailabilityContext } from './availabilityContext.js';
import { V1_5_COMPUTATION_VERSION, methodVersionOf } from './computationVersion.js';
import type { AvailabilityContextInput } from './availabilityContext.js';
import type { EarliestObservation } from './firstObserved.js';
import type { MovementEventForSummary } from './movementSummary.js';
import type { CurrentOffering, MarketRowCore } from './types.js';

export interface MarketRowCoreInput {
  readonly internal_game_id: string;
  readonly internal_player_id: string;
  readonly market_key: string;
  /**
   * The offerings the core computes over. The WRAPPER has already applied
   * its method-specific eligibility rule (v1: wall-clock gate → fresh/aging
   * only, else empty; v2: all self_observed offerings pass through). The
   * core applies NO further gate.
   */
  readonly offerings: ReadonlyArray<CurrentOffering>;
  readonly earliest_observations: ReadonlyArray<EarliestObservation>;
  readonly movement_events: ReadonlyArray<MovementEventForSummary>;
  readonly availability: AvailabilityContextInput | null;
}

/**
 * Assemble the freshness-neutral structural market facts over the given
 * offering set. Byte-for-byte the same formulas, in the same order, over
 * the same inputs as the pre-V1-A2-5 `composeCurrentMarketRow` body —
 * only freshness and the eligibility gate are lifted out to the wrappers.
 */
export function assembleMarketRowCore(input: MarketRowCoreInput): MarketRowCore {
  const offerings = input.offerings;

  const consensus = computeLineConsensus(offerings);
  const range = computeLineRange(offerings);
  const distribution = computePointDistribution(offerings);
  const bookCount = computeEligibleBookCount(offerings);
  const firstObserved = computeFirstObservedConsensus(input.earliest_observations);
  const movement = computeMovementSummary(
    input.movement_events,
    firstObserved.point,
    consensus.consensus_point
  );
  const bookDetail = computeBookDetail(offerings);
  const availability = computeAvailabilityContext(input.availability);

  const source_snapshot_ids = Object.freeze(
    Array.from(new Set(offerings.map((o) => o.source_snapshot_id)))
      .filter((s) => s !== '')
      .sort()
  );

  // line_observed_at = freshest observed_at across the offering set. ISO-8601
  // UTC strings sort lexically = chronologically, so max = the last after
  // sort. `null` when the set is empty. This is the SAME derivation the
  // builder previously did as `latestObserved`; it now lives here, once.
  const line_observed_at = offerings
    .map((o) => o.observed_at)
    .sort()
    .at(-1) ?? null;

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
    book_detail: bookDetail,
    availability_context: availability,
    line_observed_at,
    method_version: methodVersionOf('current_market_row'),
    computation_version: V1_5_COMPUTATION_VERSION,
    source_snapshot_ids,
  });
}

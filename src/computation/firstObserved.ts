// V1-5 first-observed consensus per §7.8.
//
// A SlipLabz observation, NEVER labeled "opening line" (§7.8). The compute
// takes a set of `observed_line_lifecycle`-shaped rows for the (game, player,
// market) grain — one per book × side × point × generation — and returns
// the earliest self-observed consensus point.

import { isConsensusEligibleBookmakerKey } from '../odds/bookmakerAllowlist.js';
import { methodVersionOf } from './computationVersion.js';
import { computeLineConsensus } from './consensus.js';
import type { CurrentOffering, FirstObservedResult } from './types.js';

/**
 * Shape of an early observation across books. The caller passes in the
 * EARLIEST-observed offering per (book, side, point) grain, and this module
 * computes consensus over that set.
 */
export interface EarliestObservation {
  readonly bookmaker_key: string;
  readonly point: number;
  readonly observed_at: string; // ISO 8601
}

/**
 * Compute the first-observed consensus point. Rule:
 *   1. Filter to sportsbook-only (isConsensusEligibleBookmakerKey).
 *   2. Group by point; count distinct books at each point.
 *   3. Modal point wins; ties yield null (unresolved_consensus).
 *   4. The `at` timestamp is the earliest observed_at across the books that
 *      shipped the modal point.
 *
 * Delegates the mode logic to `computeLineConsensus` so a single owner
 * governs "modal point across books".
 */
export function computeFirstObservedConsensus(
  observations: ReadonlyArray<EarliestObservation>
): FirstObservedResult {
  // Adapt to `CurrentOffering[]` so we can reuse consensus.
  const asOfferings: ReadonlyArray<CurrentOffering> = observations.map((o) => Object.freeze({
    bookmaker_key: o.bookmaker_key,
    display_title: '',
    point: o.point,
    over_price: null,
    under_price: null,
    provider_last_update: null,
    observed_at: o.observed_at,
    source_snapshot_id: '',
    market_offering_id: '',
  } as CurrentOffering));
  const consensus = computeLineConsensus(asOfferings);
  if (consensus.consensus_point === null) {
    return Object.freeze({
      point: null,
      at: null,
      method_version: methodVersionOf('first_observed_consensus'),
    });
  }
  const modal = consensus.consensus_point;
  const modalBooks = observations
    .filter((o) => isConsensusEligibleBookmakerKey(o.bookmaker_key) && o.point === modal);
  const earliest = modalBooks
    .map((o) => o.observed_at)
    .sort()
    .at(0) ?? null;
  return Object.freeze({
    point: modal,
    at: earliest,
    method_version: methodVersionOf('first_observed_consensus'),
  });
}

// V1-5 line consensus + line range + point distribution + eligible book count.
//
// ONE owner per metric. This module is the single canonical implementation
// of §7.6, §7.7, §7.10.2 for the CURRENT (self-observed) selection universe.
// Historical (backfilled_historical) canonical selection lives in
// src/lines/canonicalClosingPoint.ts and is called separately by the seed
// pipeline / read-model historical path.
//
// Load-bearing invariants (identical to §7.10.2):
//   1. sportsbook-only via isConsensusEligibleBookmakerKey;
//   2. NEVER a synthetic point — every returned point is one that appeared
//      in an eligible offering;
//   3. cross-book grouping (per V1-4b lesson);
//   4. tied → tied_no_unique_mode with canonical NULL.

import { isConsensusEligibleBookmakerKey } from '../odds/bookmakerAllowlist.js';
import { methodVersionOf } from './computationVersion.js';
import type {
  CurrentOffering,
  EligibleBookCountResult,
  LineConsensusResult,
  LineRangeResult,
  PointCount,
  PointDistributionResult,
} from './types.js';

/** Filter offerings to sportsbook-only. Consensus never mixes classes. */
function sportsbookOnly(
  offerings: ReadonlyArray<CurrentOffering>
): ReadonlyArray<CurrentOffering> {
  return offerings.filter((o) => isConsensusEligibleBookmakerKey(o.bookmaker_key));
}

/** Distinct sportsbook count offering ANY point at the grain. */
function distinctSportsbooks(
  offerings: ReadonlyArray<CurrentOffering>
): number {
  const s = new Set<string>();
  for (const o of offerings) if (isConsensusEligibleBookmakerKey(o.bookmaker_key)) s.add(o.bookmaker_key);
  return s.size;
}

/**
 * Line consensus per §7.6, §7.10.2 — cross-book modal point. NEVER a
 * synthetic point; the returned point ALWAYS appears in at least one input
 * offering.
 */
export function computeLineConsensus(
  offerings: ReadonlyArray<CurrentOffering>
): LineConsensusResult {
  const eligible = sportsbookOnly(offerings);
  // Per-book eligible count: use distinct book keys, not distinct offerings.
  const totalEligibleBooks = distinctSportsbooks(offerings);
  if (eligible.length === 0) {
    return Object.freeze({
      consensus_point: null,
      selection_method: 'no_eligible_source' as const,
      total_eligible_sportsbook_count: 0,
      sportsbook_count_at_selected_point: null,
      coverage_label: 'no_line' as const,
      method_version: methodVersionOf('line_consensus'),
    });
  }
  if (totalEligibleBooks === 1) {
    // Only one book contributes — single_book coverage regardless of how
    // many offerings that book has (which shouldn't be >1 at same point).
    return Object.freeze({
      consensus_point: eligible[0]!.point,
      selection_method: 'single_book' as const,
      total_eligible_sportsbook_count: 1,
      sportsbook_count_at_selected_point: 1,
      coverage_label: 'single_book' as const,
      method_version: methodVersionOf('line_consensus'),
    });
  }
  // Count books-per-point. Each book contributes at most once per point.
  const booksByPoint = new Map<number, Set<string>>();
  for (const o of eligible) {
    const s = booksByPoint.get(o.point) ?? new Set<string>();
    s.add(o.bookmaker_key);
    booksByPoint.set(o.point, s);
  }
  let maxCount = 0;
  let modes: number[] = [];
  for (const [point, books] of booksByPoint) {
    const c = books.size;
    if (c > maxCount) { maxCount = c; modes = [point]; }
    else if (c === maxCount) modes.push(point);
  }
  if (modes.length !== 1) {
    return Object.freeze({
      consensus_point: null,
      selection_method: 'tied_no_unique_mode' as const,
      total_eligible_sportsbook_count: totalEligibleBooks,
      sportsbook_count_at_selected_point: null,
      coverage_label: 'unresolved_consensus' as const,
      method_version: methodVersionOf('line_consensus'),
    });
  }
  return Object.freeze({
    consensus_point: modes[0]!,
    selection_method: 'unique_modal' as const,
    total_eligible_sportsbook_count: totalEligibleBooks,
    sportsbook_count_at_selected_point: maxCount,
    coverage_label: 'complete' as const,
    method_version: methodVersionOf('line_consensus'),
  });
}

/** Min/max point across eligible sportsbook offerings. */
export function computeLineRange(
  offerings: ReadonlyArray<CurrentOffering>
): LineRangeResult {
  const eligible = sportsbookOnly(offerings);
  if (eligible.length === 0) {
    return Object.freeze({
      min_point: null, max_point: null,
      method_version: methodVersionOf('line_range'),
    });
  }
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const o of eligible) { if (o.point < min) min = o.point; if (o.point > max) max = o.point; }
  return Object.freeze({
    min_point: min, max_point: max,
    method_version: methodVersionOf('line_range'),
  });
}

/**
 * Exact-point counts per §7.7. Point count = distinct-books-at-point.
 * NEVER interpolated; every returned point equals a point observed in at
 * least one eligible sportsbook offering.
 */
export function computePointDistribution(
  offerings: ReadonlyArray<CurrentOffering>
): PointDistributionResult {
  const eligible = sportsbookOnly(offerings);
  const booksByPoint = new Map<number, Set<string>>();
  for (const o of eligible) {
    const s = booksByPoint.get(o.point) ?? new Set<string>();
    s.add(o.bookmaker_key);
    booksByPoint.set(o.point, s);
  }
  const counts: PointCount[] = Array.from(booksByPoint.entries())
    .map(([point, books]) => Object.freeze({ point, book_count: books.size }))
    .sort((a, b) => a.point - b.point);
  return Object.freeze({
    counts: Object.freeze(counts),
    method_version: methodVersionOf('point_distribution'),
  });
}

/** Distinct sportsbook book count offering ANY point at the grain. */
export function computeEligibleBookCount(
  offerings: ReadonlyArray<CurrentOffering>
): EligibleBookCountResult {
  return Object.freeze({
    count: distinctSportsbooks(offerings),
    method_version: methodVersionOf('eligible_book_count'),
  });
}

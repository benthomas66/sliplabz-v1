// V1-5 per-book offering detail. Paid-only field.
//
// The capability filter (`capabilityFilter.ts`) removes this from the
// serialized payload for free-tier requests BEFORE serialization.

import { methodVersionOf } from './computationVersion.js';
import type { BookDetailResult, CurrentOffering } from './types.js';

/**
 * Return the per-book detail for all offerings on the grain (both sportsbook
 * and DFS books). Consumers can filter further by class, but structural
 * consensus-eligible filtering already happens upstream.
 */
export function computeBookDetail(
  offerings: ReadonlyArray<CurrentOffering>
): BookDetailResult {
  // Deterministic ordering (bookmaker_key ASC, point ASC) for Brief/app
  // equality on identical inputs.
  const sorted = [...offerings].sort((a, b) => {
    if (a.bookmaker_key < b.bookmaker_key) return -1;
    if (a.bookmaker_key > b.bookmaker_key) return 1;
    return a.point - b.point;
  });
  return Object.freeze({
    offerings: Object.freeze(sorted),
    method_version: methodVersionOf('book_detail'),
  });
}

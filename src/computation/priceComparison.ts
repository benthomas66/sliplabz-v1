// V1-5 exact-point / exact-side price comparison per §7.7.
//
// Price consensus (best-of-Over-price / best-of-Under-price) is only ever
// computed for offerings that AGREE on the exact (point, side). Never
// compare Over @ 12.5 against Under @ 13.5 or Over @ 12.5 against Over @
// 13.5 for a "best price" metric. This module is the single canonical
// implementation of that rule.

import { isConsensusEligibleBookmakerKey } from '../odds/bookmakerAllowlist.js';
import type { CurrentOffering } from './types.js';

export interface BestPriceAtPointSideInput {
  readonly offerings: ReadonlyArray<CurrentOffering>;
  readonly point: number;
  readonly side: 'over' | 'under';
}

export interface BestPriceAtPointSideResult {
  readonly point: number;
  readonly side: 'over' | 'under';
  readonly best_american: number | null;
  readonly book_at_best: string | null;
  readonly eligible_book_count_at_point_side: number;
  readonly all_books_at_point_side: ReadonlyArray<string>;
}

/**
 * Return the best (highest American price for Over, highest American for
 * Under — American semantics; +150 > -110 > -200 > -300) offering at
 * EXACTLY the (point, side). Sportsbook-only.
 *
 * NEVER cross-side: an Over-selection at 12.5 does not consult Under prices
 * at 12.5, and vice versa. NEVER cross-point: a request at 12.5 does not
 * consult offerings at 13.5.
 */
export function bestPriceAtExactPointSide(
  input: BestPriceAtPointSideInput
): BestPriceAtPointSideResult {
  const eligible = input.offerings.filter(
    (o) => isConsensusEligibleBookmakerKey(o.bookmaker_key) && o.point === input.point
  );
  const withPrice = eligible
    .map((o) => ({
      book: o.bookmaker_key,
      price: input.side === 'over' ? o.over_price : o.under_price,
    }))
    .filter((x): x is { book: string; price: number } => x.price !== null);
  if (withPrice.length === 0) {
    return Object.freeze({
      point: input.point,
      side: input.side,
      best_american: null,
      book_at_best: null,
      eligible_book_count_at_point_side: 0,
      all_books_at_point_side: Object.freeze([]) as ReadonlyArray<string>,
    });
  }
  // "Best" in American semantics = numerically highest. -110 > -200; +150 > -110.
  let best = withPrice[0]!;
  for (const w of withPrice) if (w.price > best.price) best = w;
  const distinctBooks = Array.from(new Set(withPrice.map((x) => x.book))).sort();
  return Object.freeze({
    point: input.point,
    side: input.side,
    best_american: best.price,
    book_at_best: best.book,
    eligible_book_count_at_point_side: distinctBooks.length,
    all_books_at_point_side: Object.freeze(distinctBooks),
  });
}

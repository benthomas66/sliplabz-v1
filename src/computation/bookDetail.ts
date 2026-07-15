// V1-5 per-book offering detail. Paid-only field.
//
// The capability filter (`capabilityFilter.ts`) removes the per-book
// `offerings` list from the serialized payload for free-tier requests
// BEFORE serialization. The `one_sided` summary field remains visible on
// every tier — it is truth-about-availability per §16.8 ("truth is never
// paywalled") and is consumed by V1-A1-3 §C.7 / DR-18 as a first-class
// evidence-quality input.
//
// V1-5x adds `one_sided` per RME-3 (EVIDENCE_PROFILE_METHOD_V1.md §I.2).
// The classification is grain-level: it summarizes whether the aggregate
// of eligible sportsbook offerings for the (game, player, market) grain
// quotes only one side, both sides, or has no eligible offerings.

import { methodVersionOf } from './computationVersion.js';
import type {
  BookDetailResult,
  CurrentOffering,
  OneSidedOfferingKind,
} from './types.js';

/**
 * Classify the aggregate offering set as one-sided or two-sided.
 *
 * Semantics (per DR-18 / method §A.4 / method §C.7):
 *   - `'over_only'`  — at least one book quoted an Over price and NO book
 *                     quoted an Under price anywhere on the grain.
 *   - `'under_only'` — mirror image.
 *   - `'neither'`    — both Over and Under are quoted somewhere on the
 *                     grain (grain is NOT one-sided).
 *   - `null`         — no eligible sportsbook offerings on the grain.
 *
 * Non-fabrication guarantee: the classification derives strictly from the
 * `over_price` / `under_price` non-null bits already present on each
 * offering. The missing side is never fabricated.
 */
export function classifyOneSided(
  offerings: ReadonlyArray<CurrentOffering>
): OneSidedOfferingKind | null {
  if (offerings.length === 0) return null;
  let has_over = false;
  let has_under = false;
  for (const o of offerings) {
    if (o.over_price !== null) has_over = true;
    if (o.under_price !== null) has_under = true;
    if (has_over && has_under) return 'neither';
  }
  if (has_over && !has_under) return 'over_only';
  if (has_under && !has_over) return 'under_only';
  // Neither side quoted despite offering rows present — treat as no
  // eligible sportsbook offering signal for one-sidedness (null).
  return null;
}

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
    one_sided: classifyOneSided(sorted),
    method_version: methodVersionOf('book_detail'),
  });
}

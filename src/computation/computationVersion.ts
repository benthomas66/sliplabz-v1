// V1-5 canonical computation-version registry.
//
// Authority: complete spec §12.3 (each derived record includes a computation
// version). Every read-model metric writes its computation version + method
// version alongside its value. A METHOD-VERSION change is a spec-authorized
// change to the formula; a COMPUTATION-VERSION change is a re-run under the
// same method (e.g. normalization-version bump).
//
// One owner per metric. Adding a new metric here means the metric has ONE
// owning module in `src/computation/`. Duplication is a lint failure.

/**
 * Method versions per metric. A method-version change requires a spec
 * amendment (or governor decision for internal metrics with no product
 * exposure); a downgrade is never permitted.
 */
export const METHOD_VERSIONS = Object.freeze({
  line_consensus: 1,
  line_range: 1,
  point_distribution: 1,
  eligible_book_count: 1,
  first_observed_consensus: 1,
  movement_summary: 1,
  freshness: 1,
  // book_detail bumped 1→2 by V1-5x: `BookDetailResult` now carries the
  // grain-level `one_sided` summary consumed by V1-A1-3 §C.7 / DR-18.
  book_detail: 2,
  availability_context: 1,
  real_line_window: 1,
  threshold_window: 1,
  average_stat: 1,
  median_stat: 1,
  sample_size_label: 1,
  current_market_row: 1,
  // V1-5x additions — the three read-model extensions required by
  // EVIDENCE_PROFILE_METHOD_V1.md §I.2 before V1-A1-3 can begin.
  historical_coverage: 1,
  mapping_resolution: 1,
});

export type MetricName = keyof typeof METHOD_VERSIONS;

/**
 * Compute the composed computation-version tag. Downstream persistence
 * writes this string into `computation_version` columns as-is.
 */
export function methodVersionOf(metric: MetricName): number {
  return METHOD_VERSIONS[metric];
}

/**
 * V1-5 canonical computation version. Consumed by callers that persist
 * derived rows against the seeded V1-4b data. Bump to 3+ on any material
 * change to any metric formula. V1-4b's canonical-correction wrote at 2.
 */
export const V1_5_COMPUTATION_VERSION = 3;

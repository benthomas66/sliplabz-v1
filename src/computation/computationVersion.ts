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
  book_detail: 1,
  availability_context: 1,
  real_line_window: 1,
  threshold_window: 1,
  average_stat: 1,
  median_stat: 1,
  sample_size_label: 1,
  current_market_row: 1,
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

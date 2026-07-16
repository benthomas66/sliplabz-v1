// V1-A1-3 Phase A — Component 2 §B.3 Margin Support (C_MS) with T1 rule.
//
// Authority: docs/product/EVIDENCE_PROFILE_METHOD_V1.md §B.3, including
// the T1 null-handling rule EXACTLY as stated: each available term keeps
// its base weight; omit every term whose input is null; sum the retained
// base weights; divide each retained weight by that sum; compute C_MS with
// those normalized weights. If no margin inputs are available, C_MS = 0.
// This is the ONE rule; no other relative ratio governs re-weighting.
//
// Pure function. No I/O. No clock.

import type { ThresholdWindows } from '../types.js';
import { marginNormalizer, normMargin } from '../marginNormalizers.js';

/**
 * §B.3 fixed base weights, in the four-term order the authority lists:
 * L10.avg (0.40), L10.median (0.30), season.avg (0.20), season.median (0.10).
 * Sum to 1.00 in the fully-available case; T1 re-weights on nulls.
 */
export const CMS_BASE_WEIGHTS = Object.freeze({
  l10_avg: 0.40,
  l10_median: 0.30,
  season_avg: 0.20,
  season_median: 0.10,
});

export interface CmsInputs {
  readonly l10_avg_minus_threshold: number | null;
  readonly l10_median_minus_threshold: number | null;
  readonly season_avg_minus_threshold: number | null;
  readonly season_median_minus_threshold: number | null;
}

export function collectCmsInputs(windows: ThresholdWindows): CmsInputs {
  return Object.freeze({
    l10_avg_minus_threshold: windows.L10.avg_minus_threshold,
    l10_median_minus_threshold: windows.L10.median_minus_threshold,
    season_avg_minus_threshold: windows.season.avg_minus_threshold,
    season_median_minus_threshold: windows.season.median_minus_threshold,
  });
}

export interface CmsResult {
  readonly c_ms: number;
  /** The four norm_margin values in the same order as CMS_BASE_WEIGHTS
   *  (null when the raw input was null and the term was omitted). */
  readonly norms: {
    readonly l10_avg: number | null;
    readonly l10_median: number | null;
    readonly season_avg: number | null;
    readonly season_median: number | null;
  };
  /** True when all four inputs were null → C_MS defaulted to 0 by T1. */
  readonly all_terms_null: boolean;
}

/**
 * §B.3 C_MS with T1 null-handling. `market` selects the DR-14 normalizer M.
 */
export function computeCMS(inputs: CmsInputs, market: string): CmsResult {
  const M = marginNormalizer(market);
  const l10a = inputs.l10_avg_minus_threshold;
  const l10m = inputs.l10_median_minus_threshold;
  const sa = inputs.season_avg_minus_threshold;
  const sm = inputs.season_median_minus_threshold;

  // Retained base weights: only include a weight if its input is non-null.
  let retained_sum = 0;
  if (l10a !== null) retained_sum += CMS_BASE_WEIGHTS.l10_avg;
  if (l10m !== null) retained_sum += CMS_BASE_WEIGHTS.l10_median;
  if (sa !== null) retained_sum += CMS_BASE_WEIGHTS.season_avg;
  if (sm !== null) retained_sum += CMS_BASE_WEIGHTS.season_median;

  const norms = {
    l10_avg: l10a === null ? null : normMargin(l10a, M),
    l10_median: l10m === null ? null : normMargin(l10m, M),
    season_avg: sa === null ? null : normMargin(sa, M),
    season_median: sm === null ? null : normMargin(sm, M),
  };

  if (retained_sum === 0) {
    return Object.freeze({
      c_ms: 0,
      norms: Object.freeze(norms),
      all_terms_null: true,
    });
  }

  // Normalized weight per term: base_weight / retained_sum. Then C_MS =
  // Σ normalized_weight × norm_margin(term). Terms whose input was null
  // contribute 0 by omission (they are absent from the sum).
  let c_ms = 0;
  if (norms.l10_avg !== null) c_ms += (CMS_BASE_WEIGHTS.l10_avg / retained_sum) * norms.l10_avg;
  if (norms.l10_median !== null) c_ms += (CMS_BASE_WEIGHTS.l10_median / retained_sum) * norms.l10_median;
  if (norms.season_avg !== null) c_ms += (CMS_BASE_WEIGHTS.season_avg / retained_sum) * norms.season_avg;
  if (norms.season_median !== null) c_ms += (CMS_BASE_WEIGHTS.season_median / retained_sum) * norms.season_median;

  // §B.3 does not explicitly clamp C_MS post-sum; each individual term is
  // already clamped to [-1, +1] by norm_margin. A weighted mean of values
  // in [-1, +1] with non-negative weights summing to 1 is itself in [-1,
  // +1] by construction. Belt-and-braces clamp anyway.
  return Object.freeze({
    c_ms: Math.max(-1, Math.min(+1, c_ms)),
    norms: Object.freeze(norms),
    all_terms_null: false,
  });
}

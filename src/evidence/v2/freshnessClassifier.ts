// V1-A2-2 — evidence_method_v2 freshness classifier.
//
// Authority: docs/product/EVIDENCE_PROFILE_METHOD_V2.md §3.2 (branch table).
// Constants: src/evidence/v2/thresholds.ts (D-A1 LOCKED).
//
// PURE FUNCTION. No I/O. No clock reads. Given identical inputs, identical
// outputs, forever.
//
// The branch table is reproduced VERBATIM from the authority §3.2 so that a
// side-by-side diff of the authority and this file makes drift immediately
// visible.

import {
  T_FRESH_MAX_SECONDS,
  T_AGING_MAX_SECONDS,
  T_SERVE_SUPPRESS_MAX_SECONDS,
} from './thresholds.js';

/**
 * The four v2 freshness branches, as named by the authority §3.2.
 *
 * Note: `beyond-horizon` is added per D-A1 addendum. The classifier still
 * emits a branch value for a grain whose classification-age exceeds the
 * unified horizon — it does NOT silently reclassify the grain. The serving
 * layer decides suppression separately (see servingGate.ts §D of ticket).
 */
export type V2FreshnessBranch =
  | 'fresh'
  | 'aging'
  | 'stale-present'
  | 'absent'
  | 'beyond-horizon';

/** Reason code emitted with the branch (authority §3.3 semantics). */
export type V2FreshnessReasonCode =
  | 'stale_current_market'
  | 'no_current_market'
  | null;

/**
 * Classification effect on the profile per the branch table.
 *   * `none`       — the profile classifies normally under §B/§C.
 *   * `moderate`   — cap the classification at Moderate.
 *   * `unavailable`— profile is Unavailable.
 */
export type V2ClassificationCap = 'none' | 'moderate' | 'unavailable';

export interface V2ClassifierInput {
  /** classification_age = evaluation_reference_time - line_observed_at, seconds. */
  readonly classification_age_seconds: number;
  /** eligible_book_count.count on the grain's read-model row. */
  readonly book_count: number;
}

export interface V2ClassifierOutput {
  readonly branch: V2FreshnessBranch;
  readonly classification_cap: V2ClassificationCap;
  readonly reason_code: V2FreshnessReasonCode;
  /**
   * True when the serving layer MUST suppress this profile at read time
   * IF the display_age also exceeds the horizon. The classifier reports
   * this on the OUTPUT because a grain classified as beyond-horizon at
   * generation time is ALREADY past the horizon; the serving layer is the
   * final decision-maker (owner R4).
   */
  readonly beyond_serve_horizon: boolean;
}

/**
 * v2 freshness classifier — the single classifier for evidence_method_v2.
 *
 * Authority §3.2 branch table (verbatim):
 *   * classification_age <= T_FRESH_MAX_SECONDS AND book_count >= 1
 *     → fresh (no cap)
 *   * T_FRESH_MAX_SECONDS < classification_age <= T_AGING_MAX_SECONDS
 *     AND book_count >= 1 → aging (no cap)
 *   * T_AGING_MAX_SECONDS < classification_age <= T_SERVE_SUPPRESS_MAX_SECONDS
 *     AND book_count >= 1 → stale-present (cap Moderate, emit STALE_CURRENT_MARKET)
 *   * book_count = 0 (regardless of classification_age)
 *     → absent (Unavailable, emit NO_CURRENT_MARKET)
 *   * classification_age > T_SERVE_SUPPRESS_MAX_SECONDS AND book_count >= 1
 *     → beyond-horizon (engine still classifies stale-present-shaped but
 *       serving layer suppresses; see servingGate.ts).
 *
 * Owner rulings honoured:
 *   R1: line-age only; the classifier does NOT consume price recency.
 *   R2: one global policy; no per-book branching.
 *   R3: the numeric values are LOCKED in thresholds.ts (this file has no
 *       hard-coded numbers).
 */
export function classifyV2Freshness(input: V2ClassifierInput): V2ClassifierOutput {
  // Guard: negative age = data-integrity violation. Treat as if age = 0
  // (fresh) because the alternative (throwing) would abort the batch on a
  // single corrupt grain. The v2 populator asserts non-negative before
  // reaching here; this is a defense-in-depth clamp.
  const age = Math.max(0, input.classification_age_seconds);

  if (input.book_count === 0) {
    return Object.freeze({
      branch: 'absent' as const,
      classification_cap: 'unavailable' as const,
      reason_code: 'no_current_market' as const,
      beyond_serve_horizon: false,
    });
  }
  if (age <= T_FRESH_MAX_SECONDS) {
    return Object.freeze({
      branch: 'fresh' as const,
      classification_cap: 'none' as const,
      reason_code: null,
      beyond_serve_horizon: false,
    });
  }
  if (age <= T_AGING_MAX_SECONDS) {
    return Object.freeze({
      branch: 'aging' as const,
      classification_cap: 'none' as const,
      reason_code: null,
      beyond_serve_horizon: false,
    });
  }
  if (age <= T_SERVE_SUPPRESS_MAX_SECONDS) {
    return Object.freeze({
      branch: 'stale-present' as const,
      classification_cap: 'moderate' as const,
      reason_code: 'stale_current_market' as const,
      beyond_serve_horizon: false,
    });
  }
  // classification_age > T_SERVE_SUPPRESS_MAX_SECONDS: the grain is beyond
  // the unified horizon at classification time. The engine can still
  // classify it (Moderate cap + STALE_CURRENT_MARKET), but the beyond-horizon
  // flag tells downstream that the serving layer MUST suppress it.
  return Object.freeze({
    branch: 'beyond-horizon' as const,
    classification_cap: 'moderate' as const,
    reason_code: 'stale_current_market' as const,
    beyond_serve_horizon: true,
  });
}

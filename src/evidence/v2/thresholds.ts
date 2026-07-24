// V1-A2-2 — evidence_method_v2 LOCKED freshness thresholds.
//
// Authorities:
//   * docs/product/EVIDENCE_PROFILE_METHOD_V2.md §3.1 (named boundaries).
//   * OWNER D-A1 (2026-07-18, plus addendum): the three constants below are
//     LOCKED. No further threshold change may be made without a new
//     method_version bump under DR-24.
//
// This module is the ONLY production file that carries these numeric
// values. Reachability fixtures under tests/ carry LOCAL fixture values
// (still prefixed `FIXTURE_`) for arithmetic-legibility on unit tests that
// need boundary-crossing to occur at small numbers; NO test may import the
// production constants and then assert against unrelated numbers.
//
// D-A1 addendum: 3600 is a UNIFIED horizon. The same 3600 governs BOTH
// classification-age (evaluation_reference_time - line_observed_at) AND
// display-age (serve_now - line_observed_at). There is NO second
// suppression threshold; a caller MUST NOT introduce one.
//
// Provenance markers on each constant so a future reader cannot mistake
// these values for a proposal.

/**
 * Classification-age upper bound for the `fresh` state.
 * `classification_age <= T_FRESH_MAX_SECONDS`  → fresh.
 * LOCKED by OWNER D-A1 (2026-07-18).
 */
export const T_FRESH_MAX_SECONDS = 900;

/**
 * Classification-age upper bound for the `aging` state.
 * `T_FRESH_MAX_SECONDS < classification_age <= T_AGING_MAX_SECONDS` → aging.
 * LOCKED by OWNER D-A1 (2026-07-18).
 */
export const T_AGING_MAX_SECONDS = 1800;

/**
 * Unified horizon. Two roles under one number (D-A1 addendum):
 *   1. Classification-age upper bound for the `stale-present` state.
 *      `T_AGING_MAX_SECONDS < classification_age <= T_SERVE_SUPPRESS_MAX_SECONDS`
 *      → stale-present (cap Moderate, emit STALE_CURRENT_MARKET when
 *      eligible book_count >= 1; NO_CURRENT_MARKET when book_count = 0).
 *      `classification_age > T_SERVE_SUPPRESS_MAX_SECONDS` → beyond-horizon
 *      (not presented as servable evidence — engine may still classify but
 *      the serving layer suppresses).
 *   2. Display-age upper bound at read time.
 *      `display_age <= T_SERVE_SUPPRESS_MAX_SECONDS` → serve with disclosure.
 *      `display_age > T_SERVE_SUPPRESS_MAX_SECONDS` → suppress.
 *      Serving MUST NOT rewrite or reinterpret the persisted classification
 *      (owner R4/D-A1).
 * LOCKED by OWNER D-A1 (2026-07-18 + addendum).
 */
export const T_SERVE_SUPPRESS_MAX_SECONDS = 3600;

// Ordering invariant asserted at MODULE LOAD. A future edit that violates
// the ordering throws immediately, refusing to run the app.
if (!(T_FRESH_MAX_SECONDS < T_AGING_MAX_SECONDS
      && T_AGING_MAX_SECONDS < T_SERVE_SUPPRESS_MAX_SECONDS)) {
  throw new Error(
    'V1-A2-2 threshold ordering invariant violated at load time: ' +
    'T_FRESH_MAX_SECONDS < T_AGING_MAX_SECONDS < T_SERVE_SUPPRESS_MAX_SECONDS. ' +
    `Got fresh=${T_FRESH_MAX_SECONDS} aging=${T_AGING_MAX_SECONDS} ` +
    `serve=${T_SERVE_SUPPRESS_MAX_SECONDS}.`
  );
}

/** Read-only view for callers that want the whole set atomically. */
export const V2_FRESHNESS_THRESHOLDS = Object.freeze({
  T_FRESH_MAX_SECONDS,
  T_AGING_MAX_SECONDS,
  T_SERVE_SUPPRESS_MAX_SECONDS,
});
export type V2FreshnessThresholds = typeof V2_FRESHNESS_THRESHOLDS;

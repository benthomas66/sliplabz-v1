// V1-A2-2 Scope D — v2 serving gate.
//
// Authority: docs/product/EVIDENCE_PROFILE_METHOD_V2.md §5 (serving) +
// D-A1 addendum (unified horizon).
//
// Pure function. Reads no clocks. Never mutates the persisted classification.
// Returns a serving DECISION alongside the untouched persisted state.
//
// The unified horizon `T_SERVE_SUPPRESS_MAX_SECONDS` (defined in thresholds.ts) serves double
// duty — it is BOTH the classification-age upper bound AND the display-age
// upper bound. The gate never receives a "different" boundary; there is
// only one value, defined in `thresholds.ts`.
//
// This module is method/read-model logic, not UI. Surfaces decide what
// MARK looks like (a chip, an icon, a strike-through, etc.) and what
// SUPPRESS looks like (hide from list, gray out, etc.). Those are V1-6 /
// V1-7 / V1-8 concerns.

import { T_SERVE_SUPPRESS_MAX_SECONDS } from './thresholds.js';

/**
 * The three serving decisions.
 *   * `serve`    — display normally with the required freshness disclosure.
 *   * `mark`     — display but visibly distinguish that the profile has
 *                  aged since generation (surface-specific rendering).
 *                  Reserved for future use; today the gate returns either
 *                  `serve` or `suppress` — but the API admits `mark` so a
 *                  surface can drive marking off the same output type
 *                  without a schema-shape change.
 *   * `suppress` — do not display on user-facing surfaces.
 *
 * The DECISION is orthogonal to the classification: a `stale-present`
 * profile with `display_age <= T_SERVE_SUPPRESS_MAX_SECONDS` STILL serves;
 * a `fresh`-classified profile with `display_age > T_SERVE_SUPPRESS_MAX_SECONDS`
 * suppresses. The gate does not read the classification.
 */
export type V2ServingDecision = 'serve' | 'mark' | 'suppress';

export interface V2ServingGateInput {
  /**
   * The freshest `line_observed_at` for the grain (via the immutable audit
   * chain; the same value used to derive classification_age). May be
   * `null` when the grain has no offering; in that case the gate returns
   * `suppress` because there is no line to disclose.
   */
  readonly line_observed_at: string | null;
  /** Wall-clock instant at which the surface is about to serve the row. */
  readonly serve_now: string;
}

export interface V2ServingGateOutput {
  /** Serving decision — MUST NOT mutate the persisted classification. */
  readonly decision: V2ServingDecision;
  /** Positive display_age in seconds (or null when line_observed_at is null). */
  readonly display_age_seconds: number | null;
  /** Convenience: the horizon threshold used, for surface logging. */
  readonly horizon_seconds: number;
}

/**
 * v2 serving gate. Pure. No clock reads (serve_now is caller-supplied).
 *
 *   display_age = serve_now − line_observed_at (seconds)
 *   display_age ≤ T_SERVE_SUPPRESS_MAX_SECONDS → serve.
 *   display_age >  T_SERVE_SUPPRESS_MAX_SECONDS → suppress.
 *
 * The gate NEVER returns a `mark` today; the return type admits it so a
 * later surface-visibility ticket can introduce marking without a widening
 * schema change. Owner ruling D-A1: "There is NO second suppression
 * threshold; do not introduce one." — the gate honours this by hard-coding
 * the single horizon `T_SERVE_SUPPRESS_MAX_SECONDS`.
 *
 * Contract with the writer: the persisted classification and reasons on
 * the profile row are NEVER changed by this gate. If a profile was
 * classified Moderate + STALE_CURRENT_MARKET at generation time and now
 * suppresses at serve time, the persisted row STILL says Moderate +
 * STALE_CURRENT_MARKET. The gate's `decision` is a serving-layer boolean;
 * it lives in memory, not on disk.
 */
export function evaluateV2ServingGate(input: V2ServingGateInput): V2ServingGateOutput {
  if (input.line_observed_at === null) {
    return Object.freeze({
      decision: 'suppress' as const,
      display_age_seconds: null,
      horizon_seconds: T_SERVE_SUPPRESS_MAX_SECONDS,
    });
  }
  const serve_ms = Date.parse(input.serve_now);
  const obs_ms   = Date.parse(input.line_observed_at);
  if (!Number.isFinite(serve_ms) || !Number.isFinite(obs_ms)) {
    // Data-integrity failure: suppress. Better to hide than to serve a
    // profile whose age we can't compute.
    return Object.freeze({
      decision: 'suppress' as const,
      display_age_seconds: null,
      horizon_seconds: T_SERVE_SUPPRESS_MAX_SECONDS,
    });
  }
  const display_age_seconds = Math.max(0, (serve_ms - obs_ms) / 1000);
  const decision: V2ServingDecision =
    display_age_seconds > T_SERVE_SUPPRESS_MAX_SECONDS ? 'suppress' : 'serve';
  return Object.freeze({
    decision, display_age_seconds,
    horizon_seconds: T_SERVE_SUPPRESS_MAX_SECONDS,
  });
}

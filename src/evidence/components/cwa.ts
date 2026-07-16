// V1-A1-3 Phase A — Component 3 §B.4 Window Agreement (C_WA).
//
// Authority: docs/product/EVIDENCE_PROFILE_METHOD_V1.md §B.4 verbatim
// below. L5 is inspected here (small sub-weight 0.10) — its ONLY role in
// scoring per DR-12. L5 NEVER independently triggers WINDOWS_DISAGREE
// (that rule uses L10/L20/season per §C.5 / corrected DR-17); this module
// only computes the C_WA scalar.
//
// Pure function. No I/O. No clock.

import type { ThresholdWindows } from '../types.js';
import { rateDeviation } from './crtp.js';

/** L5 / L10 / L20 / season, in the order §B.4 lists them. */
export const CWA_WEIGHTS = Object.freeze([0.10, 0.40, 0.25, 0.25]);

/** direction_sign(w) := sign(rate_deviation(w)) ∈ {-1, 0, +1}. */
function directionSign(rd: number): -1 | 0 | 1 {
  if (rd > 0) return 1;
  if (rd < 0) return -1;
  return 0;
}

export interface CwaResult {
  readonly c_wa: number;
  /** Signs in [L5, L10, L20, season] order per §B.4. */
  readonly signs: readonly [-1 | 0 | 1, -1 | 0 | 1, -1 | 0 | 1, -1 | 0 | 1];
  readonly dominant_sign: -1 | 0 | 1;
}

/**
 * §B.4 verbatim:
 *   signs := [sign(rd(L5)), sign(rd(L10)), sign(rd(L20)), sign(rd(season))]
 *   weights := [0.10, 0.40, 0.25, 0.25]
 *   C_WA_raw := let dominant := sign(Σ weights[i] × signs[i])
 *               in Σ weights[i] × (1 if signs[i] == dominant else (0 if signs[i] == 0 else -1))
 *   C_WA := max(-1, min(+1, C_WA_raw))
 * Then "C_WA is signed by the dominant direction — for an all-agree Under
 * case, the raw magnitude is negated so the Over-signed component is
 * negative."
 *
 * Interpretation confirmed against §F.2:
 *   All-Under: signs = [-1,-1,-1,-1]; weighted-sum-for-dominance = -1.00;
 *   dominant = -1; each entry matches dominant → +weight each →
 *   C_WA_raw = +1.00; then "applying the dominant sign to the Over-signed
 *   component" negates: C_WA = -1.00.
 * That works out to: C_WA = dominant × Σ(weights[i] × match/opposite/zero),
 * where match=+1, opposite=-1, zero=0.
 *
 * F.3 confirms: signs = [+1,+1,-1,-1]; weighted-sum = 0.00; dominant = 0;
 * each non-zero non-matching signs[i] contributes -weight; C_WA_raw =
 * -0.10 - 0.40 - 0.25 - 0.25 = -1.00; clamped: -1.00. When dominant = 0
 * we DO NOT re-apply a dominant-sign flip (there is no direction); the
 * raw stays as-is. §F.3 shows C_WA = -1.00 which matches.
 */
export function computeCWA(windows: ThresholdWindows): CwaResult {
  const rd = [
    rateDeviation(windows.L5),
    rateDeviation(windows.L10),
    rateDeviation(windows.L20),
    rateDeviation(windows.season),
  ] as const;
  const signs = [
    directionSign(rd[0]),
    directionSign(rd[1]),
    directionSign(rd[2]),
    directionSign(rd[3]),
  ] as [-1 | 0 | 1, -1 | 0 | 1, -1 | 0 | 1, -1 | 0 | 1];
  // Weighted sum for dominance.
  let dom_sum = 0;
  for (let i = 0; i < 4; i += 1) dom_sum += CWA_WEIGHTS[i]! * (signs[i] as number);
  const dominant: -1 | 0 | 1 = dom_sum > 0 ? 1 : dom_sum < 0 ? -1 : 0;
  // Raw sum per §B.4.
  let c_wa_raw = 0;
  for (let i = 0; i < 4; i += 1) {
    const s = signs[i];
    let contribution: number;
    if (s === dominant) contribution = 1;
    else if (s === 0) contribution = 0;
    else contribution = -1;
    c_wa_raw += CWA_WEIGHTS[i]! * contribution;
  }
  // §B.4: "C_WA is signed by the dominant direction — for an all-agree
  // Under case, the raw magnitude is negated". Apply dominant sign to
  // the raw magnitude. When dominant = 0 (no direction), leave as-is
  // (confirmed against F.3 which produces C_WA = -1.00 without a
  // sign flip).
  const signed_raw = dominant === 0 ? c_wa_raw : dominant * c_wa_raw;
  const c_wa = Math.max(-1, Math.min(+1, signed_raw));
  return Object.freeze({ c_wa, signs, dominant_sign: dominant });
}

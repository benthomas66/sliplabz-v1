// V1-A1-3 Phase A — §B.6 composite + §B.7 direction.
//
// Authority: docs/product/EVIDENCE_PROFILE_METHOD_V1.md §B.6, §B.7, DR-1
// (weights), DR-5 (tie zone).
//
//   score := 0.35 × C_RTP + 0.25 × C_MS + 0.20 × C_WA + 0.20 × C_MA
//   score clamped to [-1, +1].
//   |score| < DR-5 (0.05) → no direction (Mixed at §D.1 step 4).
//   else direction := 'over' if score > 0 else 'under'.
//
// Pure function.

import type { EvidenceDirection } from '../../shared/enums.js';

/** §B.6 DR-1 composite weights, in [C_RTP, C_MS, C_WA, C_MA] order. */
export const COMPOSITE_WEIGHTS = Object.freeze({
  c_rtp: 0.35,
  c_ms: 0.25,
  c_wa: 0.20,
  c_ma: 0.20,
});

/** §B.7 DR-5 tie zone — `|score| < 0.05` → no direction. */
export const NEUTRAL_ZONE_ABS = 0.05;

export interface ComponentSummary {
  readonly c_rtp: number;
  readonly c_ms: number;
  readonly c_wa: number;
  readonly c_ma: number;
}

/** §B.6 composite (Over-signed), clamped to [-1, +1]. */
export function compositeScore(c: ComponentSummary): number {
  const raw =
    COMPOSITE_WEIGHTS.c_rtp * c.c_rtp +
    COMPOSITE_WEIGHTS.c_ms * c.c_ms +
    COMPOSITE_WEIGHTS.c_wa * c.c_wa +
    COMPOSITE_WEIGHTS.c_ma * c.c_ma;
  return Math.max(-1, Math.min(+1, raw));
}

/**
 * §B.7 direction:
 *   |score| < DR-5 (0.05) → null (Mixed at §D.1 step 4 downstream).
 *   score > 0 → 'over'
 *   score < 0 → 'under'
 */
export function directionFromScore(score: number): EvidenceDirection | null {
  if (Math.abs(score) < NEUTRAL_ZONE_ABS) return null;
  return score > 0 ? 'over' : 'under';
}

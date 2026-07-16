// V1-A1-3 Phase A — Component 1 §B.2 Recent Threshold Performance (C_RTP).
//
// Authority: docs/product/EVIDENCE_PROFILE_METHOD_V1.md §B.2 (formulas
// verbatim below). L5 has ZERO weight in C_RTP per DR-12 — C_RTP consumes
// only L10, longer_window(L20/season) per DR-13, and season. This module
// also owns the §C.10 clause 4 non-L5 magnitude test (same three terms),
// because the same three per-window `rate_deviation` values feed both.
//
// Pure function. No I/O. No clock. Given identical inputs, identical output.

import type { ThresholdWindowResult } from '../../computation/types.js';
import type { ThresholdWindows } from '../types.js';

/**
 * §B.2 helper: over_rate on a window `w`, with pushes excluded from the
 * denominator (§A1 §8 + spec §14.4). Returns null when the denominator
 * is zero.
 */
export function overRate(w: ThresholdWindowResult): number | null {
  const denom = w.count_above + w.count_below;
  if (denom === 0) return null;
  return w.count_above / denom;
}

/**
 * §B.2 helper: Over-signed rate deviation from 0.5, per
 * `rate_deviation(w) := if over_rate(w) = null then 0 else (2 × over_rate(w)) − 1`.
 * By construction the value is in [-1, +1] (no explicit clamp needed).
 */
export function rateDeviation(w: ThresholdWindowResult): number {
  const p = overRate(w);
  if (p === null) return 0;
  return 2 * p - 1;
}

/**
 * §B.2 DR-13 preference: L20 when its eligible_n ≥ 10; season fallback
 * otherwise. Returns both the chosen window and its identity so the
 * caller can record `longer_window_choice`.
 */
export function chooseLongerWindow(
  w_l20: ThresholdWindowResult,
  w_season: ThresholdWindowResult
): { readonly window: ThresholdWindowResult; readonly choice: 'L20' | 'season' } {
  if (w_l20.eligible_n >= 10) {
    return Object.freeze({ window: w_l20, choice: 'L20' as const });
  }
  return Object.freeze({ window: w_season, choice: 'season' as const });
}

/**
 * §B.2 C_RTP = 0.55 × rd(L10) + 0.25 × rd(longer_window) + 0.20 × rd(season).
 * Clamped to [-1, +1].
 *
 * §C.10 clause 4 non-L5 magnitude test: the ABSOLUTE VALUE of the same
 * weighted sum (before the clamp). Returned alongside so callers don't
 * have to reproduce the arithmetic.
 */
export interface CrtpResult {
  readonly c_rtp: number;
  readonly non_l5_magnitude: number;
  readonly longer_window_choice: 'L20' | 'season';
  readonly rd_L10: number;
  readonly rd_longer: number;
  readonly rd_season: number;
}

export function computeCRTP(windows: ThresholdWindows): CrtpResult {
  const rd_L10 = rateDeviation(windows.L10);
  const { window: w_longer, choice } = chooseLongerWindow(windows.L20, windows.season);
  const rd_longer = rateDeviation(w_longer);
  const rd_season = rateDeviation(windows.season);
  const raw = 0.55 * rd_L10 + 0.25 * rd_longer + 0.20 * rd_season;
  const c_rtp = Math.max(-1, Math.min(+1, raw));
  return Object.freeze({
    c_rtp,
    non_l5_magnitude: Math.abs(raw),
    longer_window_choice: choice,
    rd_L10,
    rd_longer,
    rd_season,
  });
}

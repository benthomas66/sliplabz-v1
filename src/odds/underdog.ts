// Underdog-specific behavior.
//
// Authority:
//   Odds sub-spec §12.4 (locked price interpretation — provider synthetic/
//     display price; excluded from implied probability, vig removal, best
//     price logic, sportsbook consensus, expected value)
//   Odds sub-spec §12.5 (multiplier interpretation — `1.0` remains
//     uninterpreted provider metadata)
//   Odds sub-spec §12.6 (one-sided offerings are VALID; over-only observed
//     for kayla thornton at 8.5 player_points; never fabricate missing side)
//   Odds sub-spec §12.9 (excluded from sportsbook consensus)
//   Ticket V1-3 hard invariants:
//     - Sportsbook and DFS records never mix in consensus;
//     - One-sided offerings preserved as one-sided; missing side NEVER fabricated.

import type { DfsPromotionType, PriceSemantic } from '../shared/enums.js';

export const UNDERDOG_KEY = 'underdog';

export const UNDERDOG_PRICE_SEMANTIC: PriceSemantic =
  'provider_synthetic_or_display_price';

/**
 * Underdog multiplier per §12.5 is stored as provider metadata. It is NEVER
 * converted into probability or expected value. Storage is a plain
 * `raw_multiplier` numeric — no interpretation.
 */
export function underdogMultiplierIsInterpreted(
  _multiplier: number | null
): boolean {
  return false;
}

/**
 * Underdog promotion type per §12.5 — the audit did not observe a value that
 * would resolve Standard vs alternate. Always `unknown` in V1-3.
 */
export function resolveUnderdogPromotionType(_row: unknown): DfsPromotionType {
  return 'unknown';
}

export function isUnderdogBookmakerKey(provider_key: string): boolean {
  return provider_key === UNDERDOG_KEY;
}

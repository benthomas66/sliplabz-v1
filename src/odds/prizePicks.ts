// PrizePicks-specific behavior.
//
// Authority:
//   Odds sub-spec §11.4 (locked price interpretation — provider synthetic/
//     display price; must not be used for implied probability, best price,
//     vig removal, consensus, or side-strength)
//   Odds sub-spec §11.5 (multiplier interpretation — null does not identify
//     Standard/Goblin/Demon)
//   Odds sub-spec §11.7 (promotion type: `unknown` unless explicitly established)
//   Odds sub-spec §11.8 (excluded from sportsbook consensus)
//   Ticket V1-3 hard invariants:
//     - Sportsbook and DFS records never mix in consensus;
//     - PrizePicks -137 prices retained as synthetic/display.

import type { DfsPromotionType, PriceSemantic } from '../shared/enums.js';

export const PRIZEPICKS_KEY = 'prizepicks';

export const PRIZEPICKS_PRICE_SEMANTIC: PriceSemantic =
  'provider_synthetic_or_display_price';

/**
 * PrizePicks promotion type per §11.7.
 *
 * The audit could not resolve Goblin / Demon from any single field. Explicit
 * identification is required. This function ALWAYS returns `unknown` in
 * V1-3 — a future spec amendment may enable explicit classification.
 */
export function resolvePrizePicksPromotionType(_row: unknown): DfsPromotionType {
  return 'unknown';
}

/**
 * True when the row is a PrizePicks outcome (bookmaker key match). The
 * `price_semantic` and consensus-eligibility decisions flow from this.
 */
export function isPrizePicksBookmakerKey(provider_key: string): boolean {
  return provider_key === PRIZEPICKS_KEY;
}

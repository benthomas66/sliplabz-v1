// V1-A1-3 Phase A — DR-14 margin normalizers.
//
// Authority: docs/product/EVIDENCE_PROFILE_METHOD_V1.md §B.3, DR-14
// (VALIDATED 2026-07-15 — approved normalizers stand; no change authorized).
//
// These are the ONLY four constants the method uses for `norm_margin`. Any
// change is a governor decision routed through DR-24 (bumps
// evidence_method_v1 → evidence_method_v2 and triggers regression fixtures
// per A1 §12). This module refuses to answer for any other market_key so a
// silent extension is impossible.

export const LAUNCH_MARKETS = [
  'player_points',
  'player_rebounds',
  'player_assists',
  'player_threes',
] as const;
export type LaunchMarket = (typeof LAUNCH_MARKETS)[number];

/** DR-14 constants (locked; validated 2026-07-15 by owner ruling). */
export const MARGIN_NORMALIZERS: Readonly<Record<LaunchMarket, number>> = Object.freeze({
  player_points: 6.0,
  player_rebounds: 3.0,
  player_assists: 2.0,
  player_threes: 1.5,
});

export function isLaunchMarket(key: string): key is LaunchMarket {
  return (LAUNCH_MARKETS as ReadonlyArray<string>).includes(key);
}

/**
 * Look up the market's normalizer M. Throws on any market outside the DR-14
 * locked set — refusing to silently default is the point (§I.1: "no
 * estimation where data is absent"; GD-9: four-market scope locked).
 */
export function marginNormalizer(market: string): number {
  if (!isLaunchMarket(market)) {
    throw new Error(
      `V1-A1-3: no DR-14 margin normalizer for market_key='${market}'. ` +
      `The four locked markets are: ${LAUNCH_MARKETS.join(', ')}. ` +
      `Any change routes through owner/governor review under DR-24.`
    );
  }
  return MARGIN_NORMALIZERS[market];
}

/**
 * `norm_margin(raw) := max(-1, min(+1, raw / M))` per §B.3.
 * Pure function; deterministic; clamps into [-1, +1].
 */
export function normMargin(raw: number, M: number): number {
  return Math.max(-1, Math.min(+1, raw / M));
}

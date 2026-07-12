// Four V1 launch markets — Odds sub-spec §2, complete spec §6.1, A1 §4.1.
//
// A1 §4.1 locks the launch market set to exactly these four. Any expansion
// requires a spec amendment; there is no path from a normal ticket to a
// silent addition.

export const LAUNCH_MARKET_KEYS = Object.freeze([
  'player_points',
  'player_rebounds',
  'player_assists',
  'player_threes',
] as const);

export type LaunchMarketKey = (typeof LAUNCH_MARKET_KEYS)[number];

/**
 * True when `market_key` is one of the four launch markets. This is the
 * single canonical predicate — every ingestion path that decides whether to
 * accept a market MUST consult this function.
 */
export function isLaunchMarketKey(
  market_key: string
): market_key is LaunchMarketKey {
  return (LAUNCH_MARKET_KEYS as ReadonlyArray<string>).includes(market_key);
}

/**
 * Canonical SlipLabz stat key per market (V1-5 mapping surface). Not
 * dependent on the provider strings; documented here for cross-provider
 * downstream code.
 */
export const CANONICAL_STAT_BY_MARKET: Readonly<
  Record<LaunchMarketKey, 'pts' | 'reb' | 'ast' | 'fg3m'>
> = Object.freeze({
  player_points: 'pts',
  player_rebounds: 'reb',
  player_assists: 'ast',
  player_threes: 'fg3m',
});

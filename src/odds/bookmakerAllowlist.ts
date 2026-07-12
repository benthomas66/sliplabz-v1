// Odds API bookmaker allowlist — Odds sub-spec §10.3, §10.12, §13.5, §18.1.
//
// The initial V1 allowlist is exactly 8 conventional sportsbook keys plus
// 2 pick'em / DFS keys. Explicit-key policy (not regions=us) per §13.5.
// The `source_class` field is STRUCTURAL — consensus never mixes classes.

import type { SourceClass } from '../shared/enums.js';

export interface BookmakerAllowlistEntry {
  readonly provider_key: string;
  readonly display_title: string;
  readonly source_class: SourceClass;
  readonly note: string;
}

/**
 * V1 default bundle. Ten explicit keys total, which under Odds §13.3 /
 * §14.6 bills as ONE bookmaker-region equivalent per event-odds request.
 * PrizePicks and Underdog are `dfs_pickem` and excluded from consensus.
 */
export const V1_BOOKMAKER_ALLOWLIST: ReadonlyArray<BookmakerAllowlistEntry> =
  Object.freeze([
    { provider_key: 'draftkings',    display_title: 'DraftKings',     source_class: 'sportsbook',  note: '' },
    { provider_key: 'fanduel',       display_title: 'FanDuel',        source_class: 'sportsbook',  note: '' },
    { provider_key: 'betmgm',        display_title: 'BetMGM',         source_class: 'sportsbook',  note: '' },
    { provider_key: 'williamhill_us', display_title: 'Caesars',       source_class: 'sportsbook',  note: 'williamhill_us returns Caesars' },
    { provider_key: 'fanatics',      display_title: 'Fanatics',       source_class: 'sportsbook',  note: '' },
    { provider_key: 'betrivers',     display_title: 'BetRivers',      source_class: 'sportsbook',  note: '' },
    { provider_key: 'hardrockbet',   display_title: 'Hard Rock Bet',  source_class: 'sportsbook',  note: '' },
    { provider_key: 'espnbet',       display_title: 'theScore Bet',   source_class: 'sportsbook',  note: 'espnbet returns theScore Bet title (Odds §13.9)' },
    { provider_key: 'prizepicks',    display_title: 'PrizePicks',     source_class: 'dfs_pickem',  note: 'Excluded from sportsbook consensus (Odds §11.8, §18.1)' },
    { provider_key: 'underdog',      display_title: 'Underdog',       source_class: 'dfs_pickem',  note: 'Excluded from sportsbook consensus (Odds §12.9, §18.1)' },
  ] as BookmakerAllowlistEntry[]);

const BY_KEY: ReadonlyMap<string, BookmakerAllowlistEntry> = new Map(
  V1_BOOKMAKER_ALLOWLIST.map((e) => [e.provider_key, e])
);

/**
 * True when the key is in the reviewed allowlist. `regions=us` is NEVER
 * used in place of this check (Odds §13.5 explicit).
 */
export function isAllowlistedBookmakerKey(provider_key: string): boolean {
  return BY_KEY.has(provider_key);
}

/**
 * Look up the source class for a provider key. Returns `unknown` when the
 * key is not in the allowlist — an out-of-band provider addition MUST NOT
 * silently receive a sportsbook classification.
 */
export function sourceClassForBookmakerKey(provider_key: string): SourceClass {
  return BY_KEY.get(provider_key)?.source_class ?? 'unknown';
}

/**
 * Predicate that governs consensus eligibility. Sportsbook-only per §18.1.
 * PrizePicks and Underdog return `false`.
 */
export function isConsensusEligibleBookmakerKey(provider_key: string): boolean {
  return sourceClassForBookmakerKey(provider_key) === 'sportsbook';
}

/**
 * The ten default V1 allowlist keys as a plain string array — the shape the
 * request layer sends to the provider.
 */
export const V1_ALLOWLISTED_KEYS: ReadonlyArray<string> = Object.freeze(
  V1_BOOKMAKER_ALLOWLIST.map((e) => e.provider_key)
);

/**
 * The subset that is consensus-eligible (sportsbook class).
 */
export const V1_CONSENSUS_SPORTSBOOK_KEYS: ReadonlyArray<string> = Object.freeze(
  V1_BOOKMAKER_ALLOWLIST.filter((e) => e.source_class === 'sportsbook').map(
    (e) => e.provider_key
  )
);

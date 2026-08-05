// V1-OP-8b §0.4 / GAP-41 — team-name matching against the provider vocabulary.
//
// THE DEFECT THIS FIXES. `teams.display_name` stores city-less names for the
// two 2026 expansion franchises — `POR = "Fire"`, `TOR = "Tempo"` — while the
// provider returns `"Portland Fire"` and `"Toronto Tempo"`. The original
// matcher required exact normalized equality on BOTH team names, so every game
// involving POR or TOR was classified `(c) unrecoverable` BY CONSTRUCTION,
// whether or not the provider event existed. 6 of 19 (c) in the fired sample
// were this artifact; 5 sat inside recent-N and inflated the reported floor.
//
// THE LESSON ENCODED HERE. The conservative rule (both teams must match;
// ambiguity → (c)) correctly stops (b) from being INFLATED, but it also makes
// (c) silently absorb every data-quality defect on OUR side. (c) must mean
// "genuinely unmatchable at the provider", never "our DB stores a short name".
//
// The relaxation is deliberately narrow: token CONTAINMENT, not fuzzy distance.
// `"Fire"` matches `"Portland Fire"` because every one of our tokens appears in
// the provider's name. `"Chicago Sky"` still does not match `"Chicago Fire"`.
// Ambiguity is still resolved to (c) by the caller's uniqueness requirement, so
// a short name that matches two provider teams is never promoted.

import { normalizeName } from '../identity/nameNormalization.js';

/** Normalized whitespace-delimited tokens of a team name. */
export function nameTokens(input: string): ReadonlyArray<string> {
  const n = normalizeName(input);
  return n === '' ? [] : n.split(' ');
}

export type TeamMatchKind = 'exact' | 'token_containment' | 'none';

/**
 * PURE. Does our team name denote the same team as the provider's?
 *
 *   * `exact` — normalized equality (the overwhelming majority).
 *   * `token_containment` — one side's tokens are a complete subset of the
 *     other's, in order-independent fashion. This is what admits the city-less
 *     expansion names WITHOUT admitting unrelated teams: it requires EVERY
 *     token of the shorter name to be present in the longer, so a single shared
 *     word (`"Chicago Sky"` vs `"Chicago Fire"`) never matches.
 *   * `none` — otherwise.
 *
 * Empty names never match: a team with no resolvable identity (the TBD
 * exhibition) stays unmatched, which is a correct (c), not an artifact.
 */
export function matchTeamName(ours: string, provider: string): TeamMatchKind {
  const a = normalizeName(ours);
  const b = normalizeName(provider);
  if (a === '' || b === '') return 'none';
  if (a === b) return 'exact';

  const at = nameTokens(a);
  const bt = nameTokens(b);
  const [short, long] = at.length <= bt.length ? [at, bt] : [bt, at];
  // A bare city ("Portland") must not match "Portland Fire" on its own, so a
  // single-token containment is only accepted when that token is the other
  // name's NICKNAME (final token) — which is exactly the expansion-name shape.
  if (short.length === 1) {
    return short[0] === long[long.length - 1] ? 'token_containment' : 'none';
  }
  const longSet = new Set(long);
  return short.every((t) => longSet.has(t)) ? 'token_containment' : 'none';
}

/** Convenience: did both sides of a matchup match? */
export function matchupMatches(
  ourHome: string,
  ourAway: string,
  providerHome: string,
  providerAway: string,
): boolean {
  return matchTeamName(ourHome, providerHome) !== 'none'
    && matchTeamName(ourAway, providerAway) !== 'none';
}

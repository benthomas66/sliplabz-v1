// Name normalization for candidate generation ONLY.
//
// Complete spec §7.3 and BDL §12A.6 require that normalization can never
// create a permanent, approved mapping on its own. Everything in this file
// exists to *widen* the pool of candidate matches; the reconciliation
// logic in playerReconciliation.ts / eventReconciliation.ts is what
// decides whether a candidate becomes an approved mapping.
//
// The normalization is deliberately lossless-in-storage: the raw provider
// string is retained separately in provider_players.raw_full_name /
// provider_teams.raw_full_name. This module never modifies raw strings.

/**
 * Normalize a name for candidate matching.
 *
 *   * Unicode NFKD-decomposes so that "Cammero" and "Camméro" (i.e.,
 *     an "e" + combining acute accent) collapse to the same base letters.
 *   * Strips combining marks (diacritics) so `Cammeró` and `Cammero` match.
 *   * Lowercases with locale-neutral `.toLowerCase()`.
 *   * Replaces the curly apostrophe (’), the straight apostrophe ('),
 *     and hyphen variants with a space so `O'Neal`, `O’Neal`, and
 *     `O-Neal` collapse to a single normalized token stream.
 *   * Collapses any remaining non-alphanumeric characters to a single space.
 *   * Collapses whitespace runs to a single space.
 *   * Trims.
 *
 * Two inputs normalize to the same string only when they are plausible
 * candidates. They still must clear the reconciliation precedence checks
 * (event/team context, alias approval) before becoming an approved mapping.
 */
export function normalizeName(input: string): string {
  if (input === '') return '';
  // NFKD decomposes accented characters into base + combining marks.
  const decomposed = input.normalize('NFKD');
  // Strip combining marks (U+0300 - U+036F).
  const stripped = decomposed.replace(/[̀-ͯ]/g, '');
  // Lowercase.
  const lowered = stripped.toLowerCase();
  // Collapse apostrophes and hyphens (and their unicode friends) to spaces.
  const punctuated = lowered.replace(/[’'‘′\-‐‑‒–—_.,]+/g, ' ');
  // Collapse remaining non-alphanumeric to space (this preserves ASCII
  // letters and digits and drops everything else).
  const alnum = punctuated.replace(/[^a-z0-9]+/g, ' ');
  // Collapse runs of whitespace and trim.
  return alnum.replace(/\s+/g, ' ').trim();
}

/**
 * Normalize a team-facing string. Same rules as normalizeName, plus stripping
 * common league or franchise noise words that appear in provider labels but
 * are not identity-bearing. Used only to widen candidate search on team
 * lookups; never used to auto-approve a team mapping.
 *
 * Examples:
 *   "Golden State Valkyries"      -> "golden state valkyries"
 *   "Los Angeles Sparks (LA)"     -> "los angeles sparks la"
 *   "Tempo"                       -> "tempo"
 *   "TBD"                         -> "tbd"
 */
export function normalizeTeamString(input: string): string {
  return normalizeName(input);
}

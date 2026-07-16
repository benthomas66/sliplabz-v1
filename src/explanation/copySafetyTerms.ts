// V1-A1-4 Explanation Templates — hardened §27.6 / §G.4 forbidden-copy list.
//
// GOVERNOR REVISE (2026-07-15): the prior version placed `probability`,
// `probabilities`, `expected value`, `guarantee`, and `guarantees` in a
// `CONTEXT_SENSITIVE_TOKENS` bucket that produced `attention_flags`
// instead of `violations`. Tests asserted only on `violations`; the five
// most dangerous words in this product's vocabulary therefore passed the
// gate. Corrected here: all five are now HARD forbidden terms, and the
// `attention_flags` mechanism is deleted entirely. The disclosure
// exemption is enforced by an exact-string allowlist (not a module scope)
// pinned to the authority via a separate conformance test.
//
// Authority sources (both consulted; the operative rule is the union):
//   docs/product/EVIDENCE_PROFILE_METHOD_V1.md §E preamble line 475:
//     "User-facing translations pass A1 §27.6 (no `guaranteed`, `lock`,
//      `sure thing`, `probability`, `expected value`, `free money`,
//      `risk-free`, `safest bet`, `proven winner`)."
//   docs/product/EVIDENCE_PROFILE_METHOD_V1.md §G.4:
//     "None of the translations in §E, none of the rendered explanations
//      in §F, and no user-facing string produced by the engine or its
//      templates may contain: `guaranteed`, `lock`, `can't miss`, `free
//      money`, `sure thing`, `guaranteed winner`, `probability` (as a
//      claim about a prop outcome), `expected value` (as a claim about a
//      prop outcome), `EV`, `+EV`, `ROI` (as a claim about future
//      returns), `risk-free`, `safest bet`, or `proven winner`."
//   docs/product/amendments/SLIPLABZ_V1_AMENDMENT_A1_INTEGRATED.md §27.6:
//     "Forbidden-language tests must reject guaranteed, lock, can't miss,
//      free money, sure thing, guaranteed winner, unauthorized probability
//      claims, and unauthorized expected-value claims."
//
// The §G.4 "as a claim about a prop outcome" qualifier is enforced not by
// weakening the term list but by the EXACT-STRING allowlist: the two §G
// disclosures — which use these tokens in explicit-negation form — are
// exempt by byte-identical match against the pinned literals below. Any
// other rendered string containing `probability` etc. is a violation.

/**
 * Shape describing one forbidden term.
 */
export interface CopySafetyTerm {
  readonly term: string;
  readonly kind: 'word' | 'phrase' | 'phrase_with_apostrophe';
  readonly case: 'insensitive' | 'sensitive_uppercase';
  readonly authority_section: string;
}

/**
 * Authoritative forbidden terms. Every match is a HARD violation; there is
 * no attention-flag tier. Ordered by combined authority citation for
 * traceability. Adding a term = updating this list and its authority cite.
 *
 * Case sensitivity for `EV` / `+EV` / `ROI` is chosen because the lowercase
 * forms are innocuous everyday tokens (e.g. `"ev"` inside `"evidence"`,
 * `"roi"` inside `"royal"`). The uppercase forms are the domain slang the
 * authority forbids. See the "EV / +EV / ROI are case-sensitive" test.
 *
 * `guarantee` and `guarantees` are treated as distinct forbidden tokens
 * (not derivable from the `guaranteed` word-boundary match — they are
 * different grammatical forms of the same claim, both dangerous when used
 * as claims about a prop outcome). The §G.1 disclosure ("not guarantees or
 * predicted probabilities") is exempt by exact-string allowlist below.
 */
export const FORBIDDEN_COPY_TERMS: ReadonlyArray<CopySafetyTerm> = Object.freeze([
  // -- §27.6 + §G.4 (both authorities list these) ---------------------------
  { term: 'guaranteed',       kind: 'word',                     case: 'insensitive',       authority_section: '§27.6 + §G.4' },
  { term: 'lock',             kind: 'word',                     case: 'insensitive',       authority_section: '§27.6 + §G.4' },
  { term: 'free money',       kind: 'phrase',                   case: 'insensitive',       authority_section: '§27.6 + §G.4' },
  { term: 'sure thing',       kind: 'phrase',                   case: 'insensitive',       authority_section: '§27.6 + §G.4' },
  { term: 'guaranteed winner',kind: 'phrase',                   case: 'insensitive',       authority_section: '§27.6 + §G.4' },
  { term: "can't miss",       kind: 'phrase_with_apostrophe',   case: 'insensitive',       authority_section: '§27.6 + §G.4' },
  { term: 'risk-free',        kind: 'phrase',                   case: 'insensitive',       authority_section: '§27.6 (§E preamble) + §G.4' },
  { term: 'safest bet',       kind: 'phrase',                   case: 'insensitive',       authority_section: '§27.6 (§E preamble) + §G.4' },
  { term: 'proven winner',    kind: 'phrase',                   case: 'insensitive',       authority_section: '§27.6 (§E preamble) + §G.4' },

  // -- §27.6 (§E preamble) + §G.4 — HARD per governor REVISE (2026-07-15) --
  // These five were previously in a CONTEXT_SENSITIVE_TOKENS bucket that
  // did not fail the sweep. Now they are absolute forbidden terms; the
  // §G disclosure exemption is handled by exact-string allowlist only.
  { term: 'probability',      kind: 'word',                     case: 'insensitive',       authority_section: '§27.6 (§E preamble) + §G.4' },
  { term: 'probabilities',    kind: 'word',                     case: 'insensitive',       authority_section: '§27.6 (§E preamble) + §G.4' },
  { term: 'expected value',   kind: 'phrase',                   case: 'insensitive',       authority_section: '§27.6 (§E preamble) + §G.4' },
  { term: 'guarantee',        kind: 'word',                     case: 'insensitive',       authority_section: '§27.6 (§E preamble)' },
  { term: 'guarantees',       kind: 'word',                     case: 'insensitive',       authority_section: '§27.6 (§E preamble)' },

  // -- §G.4-only tokens -----------------------------------------------------
  { term: 'EV',               kind: 'word',                     case: 'sensitive_uppercase', authority_section: '§G.4' },
  { term: '+EV',              kind: 'phrase',                   case: 'sensitive_uppercase', authority_section: '§G.4' },
  { term: 'ROI',              kind: 'word',                     case: 'sensitive_uppercase', authority_section: '§G.4' },
]);

/**
 * EXACT-STRING allowlist. A rendered string is exempt from the sweep if
 * and only if it is BYTE-IDENTICAL to one of these two literals (the §G.1
 * and §G.2 disclosures — the authority's own text, in explicit-negation
 * form).
 *
 * DESIGN INVARIANT: this list is NOT built from `disclosures.ts` exports.
 * The literals are inlined here so an edit to `disclosures.ts` cannot
 * silently widen the exemption. The `tests/explanation/authorityConformance.test.ts`
 * suite reads `EVIDENCE_PROFILE_METHOD_V1.md` at test time and asserts
 * BOTH that (a) these literals match the authority verbatim AND (b)
 * `disclosures.ts`'s constants match this file's literals. Any drift
 * from any direction fails a test.
 *
 * NARROW BY CONSTRUCTION: exactly two entries; no wildcard, no fuzzy
 * match, no substring, no negation heuristic.
 */
export const EXEMPT_ALLOWLIST_STRINGS: ReadonlyArray<string> = Object.freeze([
  // §G.1 disclosure text — verbatim from EVIDENCE_PROFILE_METHOD_V1.md.
  'Evidence profiles summarize historical results and current market information. They are research tools, not guarantees or predicted probabilities.',
  // §G.2 disclosure text — verbatim from EVIDENCE_PROFILE_METHOD_V1.md.
  'Evidence Strength is a transparent research-ranking score. It is not the estimated probability that a prop will hit.',
]);

/**
 * Result of a copy-safety sweep. HARD violations only — no attention-flag
 * tier. `attention_flags` was DELETED per governor REVISE (2026-07-15).
 */
export interface CopySafetySweepResult {
  readonly violations: ReadonlyArray<{
    readonly term: string;
    readonly authority_section: string;
    readonly context_excerpt: string;
  }>;
}

/**
 * Build a matcher regex for one term. Word-boundary for 'word' kind;
 * whitespace-tolerant phrase match for 'phrase' / 'phrase_with_apostrophe'.
 * Case-sensitive when the term is `sensitive_uppercase`.
 */
function makeMatcher(t: CopySafetyTerm): RegExp {
  const flags = t.case === 'insensitive' ? 'i' : '';
  const escaped = t.term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (t.kind === 'word') {
    return new RegExp(`\\b${escaped}\\b`, flags);
  }
  // Phrase: allow any whitespace between tokens; anchored on either side by
  // a non-word character or string boundary to avoid mid-word matches.
  const escapedPhrase = escaped.replace(/\s+/g, '\\s+');
  return new RegExp(`(?:^|\\W)${escapedPhrase}(?:$|\\W)`, flags);
}

/**
 * Sweep a single string against every forbidden term. Returns violations
 * with a short context excerpt for reporting.
 *
 * EXEMPTION RULE: a string that is BYTE-IDENTICAL to an entry in
 * `EXEMPT_ALLOWLIST_STRINGS` returns an empty violations set. Any other
 * string — including a disclosure with a single word altered — is swept.
 */
export function sweepForbiddenTerms(text: string): CopySafetySweepResult {
  // Exact-string allowlist first. Byte-identical match only.
  if (EXEMPT_ALLOWLIST_STRINGS.includes(text)) {
    return Object.freeze({ violations: Object.freeze([]) });
  }
  const violations: Array<{ term: string; authority_section: string; context_excerpt: string }> = [];
  for (const t of FORBIDDEN_COPY_TERMS) {
    const re = makeMatcher(t);
    const m = re.exec(text);
    if (m !== null) {
      violations.push({
        term: t.term,
        authority_section: t.authority_section,
        context_excerpt: excerpt(text, m.index, m[0].length),
      });
    }
  }
  return Object.freeze({ violations: Object.freeze(violations) });
}

function excerpt(text: string, at: number, len: number): string {
  const start = Math.max(0, at - 20);
  const end = Math.min(text.length, at + len + 20);
  return `${start > 0 ? '…' : ''}${text.slice(start, end)}${end < text.length ? '…' : ''}`;
}

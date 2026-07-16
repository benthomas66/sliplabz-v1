// V1-A1-4 Explanation Templates — §G disclosures (verbatim + placement metadata).
//
// Authority: docs/product/EVIDENCE_PROFILE_METHOD_V1.md §G.1, §G.2.
// The two disclosures below are the AUTHORITY'S EXACT wording. They are
// NOT paraphrased or reformatted here.
//
// Placement rules from §G are expressed as structured data (not comments)
// so V1-6/7/8 surfaces can honor them mechanically:
//
//   §G.1 placement: "adjacent to the classification label OR in a
//     persistent methodology-link position that meets accessibility
//     affordances. May not be hidden behind hover-only or click-only
//     affordances that would let a keyboard user miss it."
//
//   §G.2 placement: "adjacent to the numeric score value; not hover-only."
//
// The disclosures are quoted from the authority as-is; the §G.1 disclosure
// contains "guarantees" and "predicted probabilities" — used in explicit
// NEGATION form ("not guarantees or predicted probabilities") because
// disclosure is the very act of denying probability-style framing. See
// §G.4 which glosses `probability` as forbidden only "as a claim about a
// prop outcome"; the disclosure is the opposite of a claim. This is
// analyzed in the ticket report's copy-safety section.

/**
 * §G.1 disclosure — REQUIRED on every product surface that renders an
 * Evidence Profile. Verbatim.
 */
export const DISCLOSURE_G1_TEXT =
  'Evidence profiles summarize historical results and current market information. They are research tools, not guarantees or predicted probabilities.';

/**
 * §G.2 disclosure — REQUIRED whenever a numeric composite score is
 * displayed. Per DR-19 that surface is Research View / grade-detail only.
 */
export const DISCLOSURE_G2_TEXT =
  'Evidence Strength is a transparent research-ranking score. It is not the estimated probability that a prop will hit.';

/**
 * Placement kinds — structured data the surface consumes. NEVER free-text
 * suggestions; the enums are exhaustive.
 */
export type DisclosurePlacement =
  | 'adjacent_to_classification_label'
  | 'persistent_methodology_link'
  | 'adjacent_to_numeric_score';

/**
 * The affordance constraints §G places on a disclosure. Both G.1 and G.2
 * forbid hover-only and click-only reveals.
 */
export interface DisclosureAffordanceRules {
  readonly must_not_be_hover_only: boolean;
  readonly must_not_be_click_only: boolean;
  readonly must_meet_keyboard_a11y: boolean;
}

/** Immutable rule set used by both disclosures. */
const DISCLOSURE_AFFORDANCE_RULES: DisclosureAffordanceRules = Object.freeze({
  must_not_be_hover_only: true,
  must_not_be_click_only: true,
  must_meet_keyboard_a11y: true,
});

/**
 * Structured disclosure for a single surface slot. The text is verbatim
 * §G; the placement options are the exhaustive set §G authorizes.
 */
export interface RenderedDisclosure {
  readonly source_section: 'G.1' | 'G.2';
  readonly text: string;
  readonly allowed_placements: ReadonlyArray<DisclosurePlacement>;
  readonly affordance_rules: DisclosureAffordanceRules;
}

/** Build the §G.1 disclosure — attached to every Full and Compact output. */
export function disclosureG1(): RenderedDisclosure {
  return Object.freeze({
    source_section: 'G.1' as const,
    text: DISCLOSURE_G1_TEXT,
    allowed_placements: Object.freeze<DisclosurePlacement[]>([
      'adjacent_to_classification_label',
      'persistent_methodology_link',
    ]),
    affordance_rules: DISCLOSURE_AFFORDANCE_RULES,
  });
}

/**
 * Build the §G.2 disclosure — attached ONLY when the surface will display
 * a numeric composite score (Research View / grade-detail area per DR-19).
 */
export function disclosureG2(): RenderedDisclosure {
  return Object.freeze({
    source_section: 'G.2' as const,
    text: DISCLOSURE_G2_TEXT,
    allowed_placements: Object.freeze<DisclosurePlacement[]>([
      'adjacent_to_numeric_score',
    ]),
    affordance_rules: DISCLOSURE_AFFORDANCE_RULES,
  });
}

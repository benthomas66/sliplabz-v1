// V1-A1-4 Explanation Templates — public output types.
//
// Authority: docs/product/EVIDENCE_PROFILE_METHOD_V1.md §D.1 / §D.2 (labels),
// §D.4 (surface rules), §E (reason categories), §G (disclosures), DR-19
// (numeric score research-view-only), DR-23 (provenance marker), DR-26
// (canonical stored order).
//
// These are STRUCTURED types the surfaces will render. This module never
// emits markup, HTML, CSS, or React — only data. V1-6 / V1-7 / V1-8 own
// rendering.

import type {
  EvidenceClassification,
  EvidenceDirection,
  EvidenceReasonCategory,
  EvidenceReasonCode,
} from '../shared/enums.js';
import type { RenderedDisclosure } from './disclosures.js';

/**
 * One reason attached to the profile, ready for the surface to render.
 * `text` is the §E translation for the reason code (or, in the rare case
 * a reason category needs composition, a sentence composed from §E strings
 * without altering their meaning). `intra_category_rank` mirrors the
 * DR-26 canonical stored order 1..N within category.
 */
export interface RenderedReason {
  readonly reason_code: EvidenceReasonCode;
  readonly category: EvidenceReasonCategory;
  readonly intra_category_rank: number;
  readonly text: string;
}

/**
 * DR-23 provenance marker for profiles whose windows include seeded
 * historical closing-line data. §D.4 rule 7: "Includes seeded historical
 * closing lines"; the marker MUST NOT be hover-only; the profile MUST
 * NEVER be described as "observed since launch."
 */
export interface ProvenanceMarker {
  readonly text: string;
  readonly must_not_be_hover_only: boolean;
  readonly must_never_describe_as_observed_since_launch: boolean;
}

/**
 * §D.4 rule 6 binding-cap emphasis. When present, compact surfaces SHOULD
 * elevate this ahead of support text so the user learns the cap without
 * opening a methodology panel. `visual_reordering_permitted_by_DR26_compact_clause`
 * is a permanent boolean marker so surfaces cannot forget.
 */
export interface BindingCapEmphasis {
  readonly reason_code: EvidenceReasonCode;
  /** Short cap tag joined to the classification label ("Moderate Over —
   *  stale market"). Composed from §E's translation without paraphrase. */
  readonly cap_summary_short: string;
  /** DR-26 compact-UI clause: the compact surface MAY reorder to elevate
   *  the cap, but MUST NOT alter the canonical stored order in the profile
   *  record. */
  readonly visual_reordering_permitted_by_DR26_compact_clause: true;
}

/**
 * Full explanation for Research View (§D.4 rule 3): full classification;
 * concise rendered explanation composed from §E; reasons in DR-26 order;
 * binding cap; provenance marker; §G.1 disclosure; and — only when the
 * surface will render a numeric composite score — the §G.2 disclosure.
 *
 * The numeric score itself is NOT included here. Per DR-19 the numeric
 * score is Research View methodology-panel-only and is a separate
 * concern from the explanation prose; the Research View surface reads
 * the score from `EvidenceProfileOutput.components.composite_score`.
 */
export interface FullExplanation {
  readonly kind: 'full';
  readonly classification: EvidenceClassification;
  readonly classification_label: string;
  readonly direction: EvidenceDirection | null;
  /** Deterministic prose composed from §E translations in DR-26 canonical
   *  stored order. Split into paragraphs so surfaces can render breaks. */
  readonly prose_paragraphs: ReadonlyArray<string>;
  readonly reasons: ReadonlyArray<RenderedReason>;
  readonly binding_cap: BindingCapEmphasis | null;
  readonly provenance_marker: ProvenanceMarker | null;
  readonly disclosure_g1: RenderedDisclosure;
  /** Present only when the surface WILL render the numeric composite
   *  score adjacent to this explanation (per DR-19: Research View
   *  grade-detail area only). The composer requires the caller to opt in
   *  via `renderFullExplanation({ ..., render_numeric_score: true })`. */
  readonly disclosure_g2: RenderedDisclosure | null;
}

/**
 * Compact explanation for Board / Discover dense rows (§D.2, §D.4 rule 1).
 *
 * Invariants baked into the type:
 *   - `must_never_expose_numeric_score: true` — permanent marker enforcing
 *     DR-19 at the shape level. A compact surface that types this shape
 *     cannot forget the rule.
 *   - The binding cap and provenance marker MUST NOT require hover to
 *     reveal (§D.4 rule 6, rule 7); both are top-level fields, never
 *     nested behind an affordance.
 */
export interface CompactExplanation {
  readonly kind: 'compact';
  readonly classification: EvidenceClassification;
  readonly compact_label: string;
  /** Combined display line the surface MAY render directly, e.g.
   *  "Moderate Over — stale market". Composed deterministically from the
   *  compact label and the binding cap; when no cap fires this equals
   *  the compact label alone. */
  readonly compact_display_line: string;
  readonly binding_cap: BindingCapEmphasis | null;
  readonly provenance_marker: ProvenanceMarker | null;
  readonly disclosure_g1: RenderedDisclosure;
  readonly must_never_expose_numeric_score: true;
}

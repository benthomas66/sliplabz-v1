// V1-A1-4 Explanation Templates — deterministic composer.
//
// Given an `EvidenceProfileOutput` from `src/evidence/`, produce a
// `FullExplanation` (Research View) or a `CompactExplanation` (Board /
// Discover dense row). Pure functions; no I/O, no clock, no randomness;
// same profile always renders identically.
//
// Authority mapping (one-to-one with output elements):
//   FULL classification label     ← §D.1 taxonomy (verbatim in labels.ts)
//   FULL prose composition        ← §E translations in DR-26 stored order
//   FULL reasons list             ← §E.1 + DR-26 (ordering owner: reasons.ts,
//                                    preserved as-received from the engine)
//   FULL binding cap emphasis     ← §D.4 rule 6 + §E cap-effect translations
//   FULL provenance marker        ← DR-23 + §D.4 rule 7
//   FULL §G.1 disclosure          ← §G.1 verbatim, adjacent to classification
//   FULL §G.2 disclosure          ← §G.2 verbatim, ONLY when caller opts to
//                                    render the numeric composite score
//                                    (DR-19 Research View / grade-detail)
//   COMPACT compact label         ← §D.2 mapping (verbatim in labels.ts)
//   COMPACT display line          ← §D.4 rule 6 shape "<label> — <cap>"
//   COMPACT binding cap emphasis  ← §D.4 rule 6
//   COMPACT provenance marker     ← DR-23 + §D.4 rule 7 (NOT hover-only)
//   COMPACT §G.1 disclosure       ← §G.1 verbatim
//   COMPACT no numeric score      ← DR-19 (baked into the shape as `must_never_expose_numeric_score: true`)

import type { EvidenceProfileOutput } from '../evidence/types.js';
import type {
  EvidenceQualityCapReason,
  EvidenceReasonCategory,
  EvidenceReasonCode,
} from '../shared/enums.js';
import { disclosureG1, disclosureG2 } from './disclosures.js';
import {
  compactClassificationLabel,
  fullClassificationLabel,
} from './labels.js';
import { translateReasonCode } from './vocabulary.js';
import type {
  BindingCapEmphasis,
  CompactExplanation,
  FullExplanation,
  ProvenanceMarker,
  RenderedReason,
} from './types.js';

// ---------------------------------------------------------------------------
// Reason ordering / composition helpers.
// ---------------------------------------------------------------------------

/**
 * DR-26 category priority: (1) support, (2) contradiction, (3) quality.
 * The engine (reasons.ts) already sorts within category by absolute
 * contribution magnitude; the composer preserves that order and merely
 * groups by category so §E.2's canonical order is applied end-to-end.
 */
const CATEGORY_ORDER: Readonly<Record<EvidenceReasonCategory, number>> = Object.freeze({
  support: 0,
  contradiction: 1,
  quality: 2,
});

function orderReasons(
  reasons: EvidenceProfileOutput['reasons']
): ReadonlyArray<EvidenceProfileOutput['reasons'][number]> {
  return [...reasons].sort((a, b) => {
    const c = CATEGORY_ORDER[a.category] - CATEGORY_ORDER[b.category];
    if (c !== 0) return c;
    return a.intra_category_rank - b.intra_category_rank;
  });
}

/**
 * Compose a paragraph from the ordered reasons in one category. Each §E
 * translation is a complete sentence; the composer joins them with a
 * single space to form a paragraph without altering their meaning.
 *
 * Empty paragraphs (no reasons in the category) are dropped upstream.
 */
function paragraphFromCategory(
  ordered: ReadonlyArray<EvidenceProfileOutput['reasons'][number]>,
  category: EvidenceReasonCategory
): string {
  const rows = ordered.filter((r) => r.category === category);
  if (rows.length === 0) return '';
  return rows.map((r) => translateReasonCode(r.reason_code)).join(' ');
}

function renderedReasonsList(
  ordered: ReadonlyArray<EvidenceProfileOutput['reasons'][number]>
): ReadonlyArray<RenderedReason> {
  return Object.freeze(
    ordered.map((r) =>
      Object.freeze({
        reason_code: r.reason_code,
        category: r.category,
        intra_category_rank: r.intra_category_rank,
        text: translateReasonCode(r.reason_code),
      })
    )
  );
}

// ---------------------------------------------------------------------------
// Binding-cap emphasis — §D.4 rule 6.
// ---------------------------------------------------------------------------

/**
 * Short cap tags used in the §D.4 rule 6 compact-row shape
 * "Moderate Over — stale market". Composed by shortening the §E
 * translation to a noun phrase without paraphrasing the underlying
 * concept.
 *
 * Silent-authority choice recorded in the ticket report §S: the authority
 * illustrates the shape with "stale market" and "limited book coverage"
 * but does not enumerate a short tag for every cap-effect reason. The
 * tags below use the salient noun phrase from each §E translation,
 * lower-cased, and are the composer's ONE mechanical shortening. If a
 * downstream ticket needs to display the full sentence instead, it can
 * render the underlying `translateReasonCode(reason_code)` directly.
 */
const CAP_SHORT_TAGS: Readonly<Record<EvidenceQualityCapReason, string>> = Object.freeze({
  none: '',
  stale_current_market: 'stale market',
  insufficient_book_coverage: 'limited book coverage',
  push_heavy_sample: 'push-heavy recent sample',
  market_disagrees_with_history: 'market disagrees with history',
  one_sided_offering: 'one-sided offering',
});

/**
 * A cap-effect reason code is REQUIRED when quality_cap_reason ≠ 'none';
 * this map tells the composer which reason to point at. Kept explicit so
 * a future cap-effect reason cannot be forgotten by shape.
 */
const CAP_REASON_TO_CODE: Readonly<Record<Exclude<EvidenceQualityCapReason, 'none'>, EvidenceReasonCode>> = Object.freeze({
  stale_current_market: 'stale_current_market',
  insufficient_book_coverage: 'insufficient_book_coverage',
  push_heavy_sample: 'push_heavy_sample',
  market_disagrees_with_history: 'market_disagrees_with_history',
  one_sided_offering: 'one_sided_offering',
});

function bindingCapFor(profile: EvidenceProfileOutput): BindingCapEmphasis | null {
  if (!profile.quality_capped || profile.quality_cap_reason === 'none') return null;
  const capReasonCode = CAP_REASON_TO_CODE[profile.quality_cap_reason];
  const shortTag = CAP_SHORT_TAGS[profile.quality_cap_reason];
  return Object.freeze({
    reason_code: capReasonCode,
    cap_summary_short: shortTag,
    visual_reordering_permitted_by_DR26_compact_clause: true as const,
  });
}

// ---------------------------------------------------------------------------
// Provenance marker — DR-23 + §D.4 rule 7.
// ---------------------------------------------------------------------------

/**
 * The §D.4 rule 7 text is the short surface copy authorized by the
 * authority: "Includes seeded historical closing lines". Verbatim. The
 * surface MUST NOT paraphrase this to "observed since launch" (DR-23 c).
 */
const PROVENANCE_MARKER_TEXT = 'Includes seeded historical closing lines';

function provenanceMarkerFor(profile: EvidenceProfileOutput): ProvenanceMarker | null {
  if (!profile.includes_backfilled_historical) return null;
  return Object.freeze({
    text: PROVENANCE_MARKER_TEXT,
    must_not_be_hover_only: true,
    must_never_describe_as_observed_since_launch: true,
  });
}

// ---------------------------------------------------------------------------
// Full / Compact composers.
// ---------------------------------------------------------------------------

export interface RenderFullExplanationOptions {
  /**
   * Whether the surface will render the numeric composite score adjacent
   * to this explanation. Attaches the §G.2 disclosure ONLY when true.
   * Per DR-19 this is a Research View grade-detail-area concern; every
   * other surface passes `false` (or omits the option — same default).
   */
  readonly render_numeric_score?: boolean;
}

/**
 * Compose the Research View / full explanation for a profile.
 *
 * Deterministic on identical input. Never reads a clock. Never invokes
 * a randomness source. Same profile always produces byte-identical
 * output.
 */
export function renderFullExplanation(
  profile: EvidenceProfileOutput,
  opts: RenderFullExplanationOptions = {}
): FullExplanation {
  // Defence-in-depth: never render the RESERVED code.
  for (const r of profile.reasons) {
    if (r.reason_code === 'abnormal_dispersion') {
      throw new Error(
        `explanation/compose: profile carries RESERVED reason "abnormal_dispersion" ` +
        `— MUST NOT be rendered in evidence_method_v1 (§I.3 clause 2).`
      );
    }
  }

  const ordered = orderReasons(profile.reasons);
  const supportPara = paragraphFromCategory(ordered, 'support');
  const contradictionPara = paragraphFromCategory(ordered, 'contradiction');
  const qualityPara = paragraphFromCategory(ordered, 'quality');

  // Prose paragraphs: one per non-empty category, in DR-26 order.
  const proseParagraphs: string[] = [];
  if (supportPara !== '') proseParagraphs.push(supportPara);
  if (contradictionPara !== '') proseParagraphs.push(contradictionPara);
  if (qualityPara !== '') proseParagraphs.push(qualityPara);

  const disclosure_g2 = opts.render_numeric_score === true ? disclosureG2() : null;

  return Object.freeze({
    kind: 'full' as const,
    classification: profile.classification,
    classification_label: fullClassificationLabel(profile.classification),
    direction: profile.direction,
    prose_paragraphs: Object.freeze(proseParagraphs),
    reasons: renderedReasonsList(ordered),
    binding_cap: bindingCapFor(profile),
    provenance_marker: provenanceMarkerFor(profile),
    disclosure_g1: disclosureG1(),
    disclosure_g2,
  });
}

/**
 * Compose the Board / Discover compact explanation for a profile.
 *
 * §D.4 rule 1: MUST NOT expose the numeric composite score. That
 * constraint is baked into the return type
 * (`must_never_expose_numeric_score: true`).
 */
export function renderCompactExplanation(
  profile: EvidenceProfileOutput
): CompactExplanation {
  for (const r of profile.reasons) {
    if (r.reason_code === 'abnormal_dispersion') {
      throw new Error(
        `explanation/compose: profile carries RESERVED reason "abnormal_dispersion" ` +
        `— MUST NOT be rendered in evidence_method_v1 (§I.3 clause 2).`
      );
    }
  }

  const compact_label = compactClassificationLabel(profile.classification);
  const binding_cap = bindingCapFor(profile);
  const compact_display_line =
    binding_cap !== null && binding_cap.cap_summary_short !== ''
      ? `${compact_label} — ${binding_cap.cap_summary_short}`
      : compact_label;

  return Object.freeze({
    kind: 'compact' as const,
    classification: profile.classification,
    compact_label,
    compact_display_line,
    binding_cap,
    provenance_marker: provenanceMarkerFor(profile),
    disclosure_g1: disclosureG1(),
    must_never_expose_numeric_score: true as const,
  });
}

/**
 * Convenience: enumerate every rendered user-facing string in an
 * explanation. Used by the copy-safety sweep in tests. `sweepable_strings`
 * excludes the §G disclosures because their text is authored verbatim by
 * the authority (§G.1 / §G.2) and uses "guarantees" / "probability" in
 * explicit-negation form — the very act of disclosure. Callers that want
 * to include the disclosures can call `allRenderedStrings` and filter
 * downstream; the sweep separation is documented in the ticket report.
 */
export function sweepableStrings(
  x: FullExplanation | CompactExplanation
): ReadonlyArray<string> {
  const out: string[] = [];
  if (x.kind === 'full') {
    out.push(x.classification_label);
    for (const p of x.prose_paragraphs) out.push(p);
    for (const r of x.reasons) out.push(r.text);
    if (x.binding_cap !== null) out.push(x.binding_cap.cap_summary_short);
    if (x.provenance_marker !== null) out.push(x.provenance_marker.text);
  } else {
    out.push(x.compact_label);
    out.push(x.compact_display_line);
    if (x.binding_cap !== null) out.push(x.binding_cap.cap_summary_short);
    if (x.provenance_marker !== null) out.push(x.provenance_marker.text);
  }
  return Object.freeze(out.filter((s) => s.length > 0));
}

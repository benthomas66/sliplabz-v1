// V1-A1-4 Explanation Templates — classification labels (verbatim §D.1 / §D.2).
//
// Authority:
//   docs/product/EVIDENCE_PROFILE_METHOD_V1.md
//     §D.1 (seven-value taxonomy per A1 §10, GD-15 fixed)
//     §D.2 (compact-display mapping table, DR-21 / DR-26)
//     §D.5 (Insufficient vs Unavailable — distinct labels, distinct treatment)
//   docs/product/V1_GOVERNANCE_DECISIONS.md
//     GD-15 (evidence-label taxonomy: A1 §10 canonical; compact variants
//     permitted under a documented mapping).
//
// The strings here are the authority's exact labels. Do not invent a
// synonym, a shortened form, or a "friendlier" label.

import type { EvidenceClassification } from '../shared/enums.js';

/**
 * §D.1 / §D.2 "Discover card / Research View — MUST show" column.
 * Verbatim from the mapping table.
 */
export const FULL_CLASSIFICATION_LABELS: Readonly<Record<EvidenceClassification, string>> = Object.freeze({
  strong_over_evidence: 'Strong Over Evidence',
  moderate_over_evidence: 'Moderate Over Evidence',
  mixed_evidence: 'Mixed Evidence',
  moderate_under_evidence: 'Moderate Under Evidence',
  strong_under_evidence: 'Strong Under Evidence',
  insufficient_evidence: 'Insufficient Evidence',
  unavailable: 'Unavailable',
});

/**
 * §D.2 "Compact variant (dense Board only)" column. Verbatim from the
 * mapping table. Strong and Moderate BOTH map to "Over-leaning" /
 * "Under-leaning" as required (a compact row must be a many-to-one map).
 *
 * §D.4 rule 2 binds: dense rows may carry a deterministic strength
 * treatment separately (e.g. a chip); this string is the label itself
 * and is bound by §D.2 to be the many-to-one form.
 *
 * §D.2 rule 3: Unavailable is NEVER collapsed into Insufficient. Distinct
 * labels here honor that.
 */
export const COMPACT_CLASSIFICATION_LABELS: Readonly<Record<EvidenceClassification, string>> = Object.freeze({
  strong_over_evidence: 'Over-leaning',
  moderate_over_evidence: 'Over-leaning',
  mixed_evidence: 'Mixed',
  moderate_under_evidence: 'Under-leaning',
  strong_under_evidence: 'Under-leaning',
  insufficient_evidence: 'Insufficient Evidence',
  unavailable: 'Unavailable',
});

/**
 * Full label lookup with a runtime guard the compiler cannot supply
 * (e.g. an unknown code arriving from a downstream persistence read).
 */
export function fullClassificationLabel(cls: EvidenceClassification): string {
  const label = FULL_CLASSIFICATION_LABELS[cls];
  if (label === undefined || label === '') {
    throw new Error(`explanation/labels: unknown or empty full label for "${cls}"`);
  }
  return label;
}

/** Compact label lookup with the same guard. */
export function compactClassificationLabel(cls: EvidenceClassification): string {
  const label = COMPACT_CLASSIFICATION_LABELS[cls];
  if (label === undefined || label === '') {
    throw new Error(`explanation/labels: unknown or empty compact label for "${cls}"`);
  }
  return label;
}

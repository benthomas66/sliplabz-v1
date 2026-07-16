// V1-A1-4 Explanation Templates — public surface.
//
// Consumers import from `src/explanation/` root:
//
//   import {
//     renderFullExplanation,
//     renderCompactExplanation,
//     sweepForbiddenTerms,
//     REASON_TRANSLATIONS,
//   } from '../explanation/index.js';
//
// This module owns NO logic; it is the surface aggregator.

export {
  renderFullExplanation,
  renderCompactExplanation,
  sweepableStrings,
  type RenderFullExplanationOptions,
} from './compose.js';

export type {
  FullExplanation,
  CompactExplanation,
  RenderedReason,
  ProvenanceMarker,
  BindingCapEmphasis,
} from './types.js';

export {
  disclosureG1,
  disclosureG2,
  DISCLOSURE_G1_TEXT,
  DISCLOSURE_G2_TEXT,
  type RenderedDisclosure,
  type DisclosurePlacement,
  type DisclosureAffordanceRules,
} from './disclosures.js';

export {
  REASON_TRANSLATIONS,
  translateReasonCode,
} from './vocabulary.js';

export {
  FULL_CLASSIFICATION_LABELS,
  COMPACT_CLASSIFICATION_LABELS,
  fullClassificationLabel,
  compactClassificationLabel,
} from './labels.js';

// Mechanical downstream update forced by the governor REVISE
// (2026-07-15) hardening of copySafetyTerms: `CONTEXT_SENSITIVE_TOKENS`
// was deleted (its silent-tier design defeated the copy-safety gate) and
// `EXEMPT_ALLOWLIST_STRINGS` was added (narrow exact-match exemption). No
// other design in this file is changed.
export {
  FORBIDDEN_COPY_TERMS,
  EXEMPT_ALLOWLIST_STRINGS,
  sweepForbiddenTerms,
  type CopySafetyTerm,
  type CopySafetySweepResult,
} from './copySafetyTerms.js';

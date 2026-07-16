// V1-A1-3 Phase B — evidence-engine computation version.
//
// Authority: docs/product/EVIDENCE_PROFILE_METHOD_V1.md §H (reproducibility)
// and V1_COMPUTATION_CONTRACT.md §2 (method_version vs computation_version).
//
//   * method_version — the FORMULA. Locked to `evidence_method_v1` at
//     this ticket.
//   * computation_version — a batch tag on persisted rows. Bumped when a
//     re-run at the same method_version is required (e.g. a downstream
//     read-model normalization change, a governor-authorized reseed).
//
// Precedent: src/computation/computationVersion.ts holds V1-5's read-model
// computation_version (currently 3). This module holds the EVIDENCE-ENGINE
// side.
//
// Starts at 1 per ticket. Downgrades are never permitted.

export const EVIDENCE_COMPUTATION_VERSION = 1;

/** `evidence_method_v1` — the formula version. See §H (locked), DR-24. */
export const EVIDENCE_METHOD_VERSION = 'evidence_method_v1' as const;
export type EvidenceMethodVersion = typeof EVIDENCE_METHOD_VERSION;

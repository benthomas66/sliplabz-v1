-- ============================================================================
-- V1-A1-2a  Migration 52 : evidence_reason_code — add 'no_unique_consensus_line'
--
-- Governor-created micro-ticket applying an owner ruling of 2026-07-15.
-- Closes an implementation-blocking omission discovered before any Evidence
-- Profile has ever been computed: the closed reason vocabulary had NO code
-- for a tied consensus (`CurrentMarketRow.line_consensus.selection_method
-- = 'tied_no_unique_mode'` with `eligible_book_count.count > 0`). The
-- nearest existing code (`NO_CURRENT_MARKET`, translation "No current
-- market is available") would be FALSE for a market where several books
-- are actively quoting but split evenly.
--
-- Owner ruling recorded verbatim in the authority:
--   docs/product/EVIDENCE_PROFILE_METHOD_V1.md v1.2 — §E.1 vocabulary row,
--   DR-28 (Decision Register), DR-29 (pre-first-profile exception), §C.3
--   tie note.
--
-- Governor rulings applied (G1..G4):
--   * G1 ENUM CASE: the committed evidence_reason_code enum uses LOWERCASE
--     for every one of its 21 values (see migration 20260714000000). The
--     authority's prose uses UPPERCASE. This additive migration writes the
--     LOWERCASE literal 'no_unique_consensus_line' to preserve the enum's
--     case convention. The authority's §E.1 row is `NO_UNIQUE_CONSENSUS_LINE`
--     to match every other code's prose form. Do NOT introduce the only
--     uppercase value into the enum.
--   * G2 ENUM POSITION: this migration places the new value BEFORE the
--     RESERVED terminal value `'abnormal_dispersion'` so that the RESERVED
--     value keeps its position as the last enum label. No existing value's
--     relative order changes; the enum is not reordered or recreated; no
--     data is rewritten. Enum_range before/after equality on every
--     pre-existing value is proven by the schemaShape migration probe.
--   * G3 TEST SPLIT: this migration ships with a schemaShape probe (owner
--     test 6) + a reason-vocabulary probe (owner test at
--     tests/evidence/reasonVocabulary.test.ts) + an existing consensus
--     order-independence check (owner test 4 — see the report §G3
--     hand-off list for the split with V1-A1-3).
--
-- Method-version note: this correction is admitted WITHOUT bumping
-- `method_version` (which remains `evidence_method_v1`) under the DR-29
-- pre-first-profile method-correction exception. That exception applies
-- ONLY because zero `evidence_profiles` rows have ever been persisted under
-- `evidence_method_v1`. It EXPIRES PERMANENTLY AND AUTOMATICALLY at the
-- moment the first `evidence_profiles` row is committed under
-- `evidence_method_v1`. See DR-29 and §I.3 for the exception's five
-- required conditions and the V1-A1-3 hand-off obligation to document the
-- first-profile event (timestamp, method_version, evidence_profile_id,
-- commit HEAD, confirmation the exception is permanently closed).
--
-- PostgreSQL constraint honored: `ALTER TYPE ... ADD VALUE` cannot use the
-- new value in the same transaction that adds it. This migration
-- therefore contains ONLY the ADD VALUE statement — no CHECK / INSERT /
-- UPDATE references the new value anywhere. The V1-A1-2 CHECKs on
-- `evidence_profile_reasons.reason_code` are enum-typed (no explicit list
-- of allowed values), so they automatically admit the new value once
-- committed. The version-aware UNIQUE constraints are unchanged.
-- ============================================================================

ALTER TYPE evidence_reason_code
  ADD VALUE IF NOT EXISTS 'no_unique_consensus_line'
  BEFORE 'abnormal_dispersion';

COMMENT ON TYPE evidence_reason_code IS
  'A1 §26 + EVIDENCE_PROFILE_METHOD_V1.md §E.1 closed vocabulary (v1.2 addition: no_unique_consensus_line — tied-consensus → Unavailable per DR-28). ABNORMAL_DISPERSION is RESERVED — NOT EMITTED IN evidence_method_v1 per DR-27 / §I.3. Activation requires a DR-24 method-version bump AND regression fixtures per A1 §12.';

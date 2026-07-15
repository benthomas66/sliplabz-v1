-- ============================================================================
-- V1-A1-2  Migration 51 : evidence_profile_reasons
--
-- Authority anchors:
--   * A1 §26 — required machine-readable reason codes.
--   * EVIDENCE_PROFILE_METHOD_V1.md §E.1 — closed reason-code vocabulary +
--     one-to-one triggers, effects, translations. §E.2 — canonical stored
--     order per DR-26.
--   * DR-27 / §E.1 ABNORMAL_DISPERSION row / §I.3 clause (2/4) — the
--     RESERVED reason code MUST NOT be emitted by an `evidence_method_v1`
--     writer. A schema CHECK cannot forbid the value without violating the
--     closed-vocabulary requirement (§E.1); the reservation is enforced by
--     the writer's method-version gate and by the unit-test assertion in
--     tests/evidence/schema.test.ts. The COMMENT below documents the
--     reservation for any future reader inspecting the schema.
--
-- Grain: one row per (evidence_profile_id, reason_code). A profile carries
-- 0..N attached reasons; a Strong profile has support reasons but no cap
-- reasons (§F.1a); an Unavailable profile has one Unavailable reason and
-- no support reasons (§F.5); a Mixed profile may have both a contradiction
-- and support-side reasons that failed to attach (§F.3). Every reason on
-- the profile appears here — this table is the FULL reason set for the
-- profile.
--
-- Storage-only ticket. The writer (V1-A1-3) computes both the closed
-- vocabulary trigger (which reason attaches) and the DR-26 ordering
-- (category order + intra-category magnitude order); this table stores
-- the resulting ordered list.
--
-- Future-writer conflict strategy (documented per this ticket's rubric;
-- writer is V1-A1-3):
--   * On a same-version evidence_profiles UPSERT, the writer atomically
--     REPLACES the reasons rowset for the affected evidence_profile_id
--     inside the same transaction. Recommended pattern:
--       DELETE FROM evidence_profile_reasons WHERE evidence_profile_id = $1;
--       INSERT INTO evidence_profile_reasons (...) VALUES (...);
--     This is safe because the reasons set is entirely derived from the
--     profile's inputs at (method_version, computation_version), and the
--     writer holds the profile row's transaction lock.
--   * On a version bump, a NEW evidence_profile_id is inserted and its
--     reasons INSERT alongside — prior evidence_profile_id rows and their
--     reasons remain IMMUTABLE. This preserves the audit trail per §H.
--   * The UNIQUE below prevents a same-reason duplicate on the same
--     profile — the writer emits every triggered reason at most once
--     (§E.1 one trigger per code).
-- ============================================================================

CREATE TABLE evidence_profile_reasons (
  evidence_profile_reason_id              uuid                          PRIMARY KEY DEFAULT gen_random_uuid(),

  evidence_profile_id                     uuid                          NOT NULL
                                                                        REFERENCES evidence_profiles(evidence_profile_id)
                                                                        ON UPDATE RESTRICT ON DELETE CASCADE,

  -- The reason code from the §E.1 closed vocabulary. `abnormal_dispersion`
  -- is present in the enum per DR-27 / §I.3 (closed-vocabulary requirement)
  -- but MUST NOT be written by an `evidence_method_v1` writer. See the
  -- COMMENT on the enum type declaration in 20260714000000_evidence_enums.sql.
  reason_code                             evidence_reason_code          NOT NULL,

  -- DR-26 category: 'support' | 'contradiction' | 'quality'. The writer
  -- knows the category for every reason code because it triggered the
  -- reason. Stored so consumers can order by category without reproducing
  -- §E.1's classification table.
  category                                evidence_reason_category      NOT NULL,

  -- DR-26 intra-category ordering key. Positive integer. Rank 1 is the
  -- top-listed reason within its category; the writer computes this from
  -- absolute contribution magnitude descending, tie-broken lexicographically
  -- by reason code (DR-26). A profile with N reasons in a category has
  -- ranks 1..N within that category.
  intra_category_rank                     integer                       NOT NULL,
  CONSTRAINT evidence_profile_reasons_rank_positive_check
    CHECK (intra_category_rank >= 1),
  -- Admitted states: any positive integer. Rank sparsity is not enforced
  -- (the writer produces contiguous 1..N ranks by construction, but a gap
  -- would still be legitimately ordered).

  -- Optional per-reason contribution magnitude (§E.1 "Effect" column
  -- documents magnitude concepts for some reasons — e.g. NEGATIVE_MARGIN_SUPPORT
  -- fires at |C_MS| >= 0.30). Storing the magnitude lets consumers show a
  -- "why this reason bound" strength without recomputing from source.
  -- Nullable because not every reason has a numeric contribution
  -- (e.g. UNRESOLVED_PLAYER_MAPPING is a boolean fact — magnitude concept
  -- does not apply). The writer decides per-reason.
  contribution_magnitude                  numeric(12,10),
  CONSTRAINT evidence_profile_reasons_contribution_range_check
    CHECK (contribution_magnitude IS NULL
        OR (contribution_magnitude >= -1 AND contribution_magnitude <= 1)),
  -- Admitted states: NULL (boolean-fact reasons like §C.9 mapping) or any
  -- clamped [-1, +1] value (component-derived reasons like §E.1 support /
  -- contradiction). Nothing legitimate is excluded — §B components clamp
  -- to [-1, +1] per §B, so a legitimate reason's contribution respects the
  -- same bound.

  created_at                              timestamptz                   NOT NULL DEFAULT now(),

  -- One row per (profile, reason_code). A profile emits each reason at most
  -- once per §E.1's one-trigger-one-code contract.
  CONSTRAINT evidence_profile_reasons_profile_reason_unique
    UNIQUE (evidence_profile_id, reason_code),

  -- One row per (profile, category, intra_category_rank). Prevents a writer
  -- from silently placing two reasons at the same rank inside a category —
  -- DR-26's canonical order is a total order within category.
  CONSTRAINT evidence_profile_reasons_profile_category_rank_unique
    UNIQUE (evidence_profile_id, category, intra_category_rank)
);

CREATE INDEX evidence_profile_reasons_profile_idx
  ON evidence_profile_reasons (evidence_profile_id);
CREATE INDEX evidence_profile_reasons_reason_code_idx
  ON evidence_profile_reasons (reason_code);
CREATE INDEX evidence_profile_reasons_category_idx
  ON evidence_profile_reasons (category);

COMMENT ON TABLE evidence_profile_reasons IS
  'Per-profile attached reasons from the §E.1 closed vocabulary. Stored order (DR-26): category ASC (support, contradiction, quality) then intra_category_rank ASC.';
COMMENT ON COLUMN evidence_profile_reasons.reason_code IS
  '§E.1 closed vocabulary. ABNORMAL_DISPERSION is RESERVED — an evidence_method_v1 writer MUST NOT emit this value (see enum COMMENT + DR-27 halt condition).';
COMMENT ON COLUMN evidence_profile_reasons.category IS
  'DR-26 category. Compact-UI visual reordering (DR-26 last clause) never alters the stored category order.';
COMMENT ON COLUMN evidence_profile_reasons.intra_category_rank IS
  'DR-26 tie-broken order within category: absolute contribution magnitude DESC, then reason_code lexicographically ASC.';
COMMENT ON CONSTRAINT evidence_profile_reasons_profile_reason_unique
  ON evidence_profile_reasons IS
  '§E.1 one-trigger-one-code — each reason attaches to a profile at most once. Version bumps produce a NEW evidence_profile_id whose reason rows are independent.';

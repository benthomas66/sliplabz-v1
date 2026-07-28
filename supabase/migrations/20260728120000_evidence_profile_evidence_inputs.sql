-- ============================================================================
-- V1-8a0 — Persisted writer-bound evidence INPUTS (additive child tables).
--
-- Ticket:    V1-8a0 (persist writer-bound evidence inputs) — narrowed scope.
-- Authority: docs/product/EVIDENCE_PROFILE_METHOD_V1.md (READ-ONLY; the
--            computation is unchanged), docs/product/SLIPLABZ_EVIDENCE_GRAMMAR.md
--            §2.2/§7 (surface vocabulary), and the founder source-identity ruling.
--
-- Persists, ALONGSIDE the evidence profile and EXACTLY as the writer received
-- them, the authoritative evidence INPUTS that already exist at the writer
-- boundary (`EvidenceProfileInput.threshold_windows`), plus the deduplicated
-- factual SOURCE-IDENTITY SET (names/IDs only) built server-side from the
-- population-time offering context.
--
-- SCOPE DISCIPLINE:
--   * PURELY ADDITIVE. No existing table is altered.
--   * These are THRESHOLD-RELATIVE window aggregates — a DIFFERENT semantic
--     object from `real_line_windows` (real-line). `real_line_windows` is NOT
--     overloaded.
--   * NO per-game series table here (V1-8a0a/V1-8a0b own the series; an empty
--     series table now would make "not yet populated" indistinguishable from
--     "no series").
--   * The source-identity table holds NAMES/IDs ONLY. It carries no point,
--     price, side, timestamp, ranking, per-source offer count, or any handle
--     permitting retrieval of a paid `book_detail.offerings` row.
--   * No composite score is exposed here (it stays on evidence_profiles only).
--
-- LEGACY: existing v2 profiles have NO rows in these tables. A reader treats
--   "zero window-aggregate rows" as a TYPED unavailable state — distinct from a
--   profile whose windows exist but are genuinely zero-sample (eligible_n = 0).
-- ============================================================================

-- profile → window aggregates (one row per authorized window) -----------------
CREATE TABLE evidence_profile_window_aggregates (
  window_aggregate_id             uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  evidence_profile_id             uuid          NOT NULL
                                                REFERENCES evidence_profiles(evidence_profile_id) ON DELETE CASCADE,
  -- deterministic window identity
  window_type                     text          NOT NULL
    CONSTRAINT epwa_window_type_check CHECK (window_type IN ('L5', 'L10', 'L20', 'season')),
  -- the evaluated line the window was computed against (threshold-relative)
  evaluated_line                  numeric(10,2) NOT NULL,
  -- ThresholdWindowResult, persisted field-for-field (no derivation/rounding)
  requested_n                     integer       NOT NULL,
  eligible_n                      integer       NOT NULL,
  incomplete                      boolean       NOT NULL,
  count_above                     integer       NOT NULL,
  count_equal                     integer       NOT NULL,
  count_below                     integer       NOT NULL,
  avg_stat_value                  numeric(14,4),
  median_stat_value               numeric(14,4),
  avg_minus_threshold             numeric(14,4),
  median_minus_threshold          numeric(14,4),
  current_streak_direction        text
    CONSTRAINT epwa_streak_dir_check CHECK (current_streak_direction IS NULL
                                            OR current_streak_direction IN ('above', 'below', 'equal')),
  current_streak_length           integer,
  coverage_label                  text          NOT NULL
    CONSTRAINT epwa_coverage_check CHECK (coverage_label IN ('complete', 'incomplete', 'no_data')),
  window_method_version           integer       NOT NULL,
  includes_backfilled_historical  boolean       NOT NULL,
  created_at                      timestamptz   NOT NULL DEFAULT now(),
  -- uniqueness: one row per (profile, window) — no duplicate window rows
  CONSTRAINT epwa_profile_window_unique UNIQUE (evidence_profile_id, window_type)
);
CREATE INDEX epwa_profile_idx ON evidence_profile_window_aggregates (evidence_profile_id);

COMMENT ON TABLE evidence_profile_window_aggregates IS
  'V1-8a0. Threshold-relative window aggregates persisted with the profile, exactly as the writer received them in EvidenceProfileInput.threshold_windows. NOT real_line_windows. No composite score.';

-- profile → source-identity set (names/IDs only) ------------------------------
CREATE TABLE evidence_profile_source_identities (
  source_identity_id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  evidence_profile_id             uuid          NOT NULL
                                                REFERENCES evidence_profiles(evidence_profile_id) ON DELETE CASCADE,
  -- canonical source identifier (bookmaker_key) — an identity, not a paid handle
  normalized_source_id            text          NOT NULL,
  -- authorized public display name / approved mark
  display_name                    text          NOT NULL,
  -- FIXED NON-ECONOMIC ordering (alphabetical by normalized_source_id) — never
  -- the original paid-offering row order (which could encode economic signal)
  ordinal                         integer       NOT NULL,
  created_at                      timestamptz   NOT NULL DEFAULT now(),
  -- dedup: one row per (profile, source) — cannot reveal per-source offer count
  CONSTRAINT epsi_profile_source_unique UNIQUE (evidence_profile_id, normalized_source_id)
);
CREATE INDEX epsi_profile_idx ON evidence_profile_source_identities (evidence_profile_id);

COMMENT ON TABLE evidence_profile_source_identities IS
  'V1-8a0. Deduplicated factual set of source identities that supplied >=1 eligible observation for the grain, frozen with the profile evaluation. Names/IDs only: NO point, price, side, timestamp, ranking, per-source count, or handle to a paid offering row.';

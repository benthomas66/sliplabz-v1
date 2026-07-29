-- ============================================================================
-- V1-8a0a — Persisted complete per-game SERIES (additive child table).
--
-- Ticket:    V1-8a0a (complete threshold-relative series persistence).
-- Authority: docs/product/SLIPLABZ_EVIDENCE_GRAMMAR.md §2.2 (the Evidence Strip
--            is the chronological REQUESTED window; DNP/ineligible positions
--            hold their place and carry NO verdict — "their absence is
--            information"); the frozen V1-8a0b reader contract (RE-FROZEN under
--            Amendment 21 to add the single server-side-only `internal_game_id`);
--            and the pre-authorized interface extension exposing the already-
--            computed per-game threshold-relative outcomes.
--
-- Persists, ALONGSIDE the evidence profile and its window aggregates + source
-- identities, ONE complete series per profile: every requested-window position
-- (from the frozen reader) joined on the canonical `internal_game_id` to its
-- eligible per-game outcome (from the interface extension). This is the
-- profile → series child relation.
--
-- SCOPE DISCIPLINE:
--   * PURELY ADDITIVE. No existing table is altered. `real_line_windows` is NOT
--     overloaded (this is threshold-relative per-game evidence, a different
--     object).
--   * ONE SERIES PER PROFILE (not one per window). Board windows (L5/L10/L20/
--     season) are reproduced by selecting the most-recent N ELIGIBLE positions
--     from this single chronological series — see the ticket's window proof.
--   * NO PAID OFFERING VALUES: no book/price/side/timestamp/per-source handle.
--     `stat_value` is the player's factual game stat; `evaluated_line` is the
--     same consensus threshold already persisted on the window aggregates.
--   * NO composite score (it stays on evidence_profiles only).
--   * `internal_game_id` is SERVER-SIDE ONLY (Amendment 21): the join key + the
--     stable row identity. It is NOT a browser projection field and remains on
--     RESEARCH_PROJECTION_FORBIDDEN_KEYS. A read path may carry it only inside a
--     trusted server-side type; it is omitted before any browser-visible
--     serialization.
--
-- DISCRIMINATED "NO VERDICT": `position_kind` is the discriminant. An eligible
--   position carries an authoritative threshold-relative `outcome`
--   (above/below/equal); an ineligible/DNP requested position has
--   `outcome IS NULL`, enforced by a CHECK so `outcome` can NEVER be read as an
--   unknown eligible value. A consumer reads `position_kind` first.
--
-- LEGACY: existing profiles have NO rows here. A reader treats "zero series
--   rows" as a TYPED unavailable state (unavailable_not_persisted), distinct
--   from a genuinely empty series.
-- ============================================================================

-- profile → complete per-game series (one row per requested-window position) ---
CREATE TABLE evidence_profile_series (
  series_position_id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  evidence_profile_id             uuid          NOT NULL
                                                REFERENCES evidence_profiles(evidence_profile_id) ON DELETE CASCADE,
  -- deterministic chronological order (0-based, oldest→newest as the frozen
  -- reader returns them). Unique per profile → no duplicate positions.
  ordinal                         integer       NOT NULL,
  -- canonical stable game identity (games PK). SERVER-SIDE ONLY (Amendment 21):
  -- the join key + the stable row identity. Never browser-projected.
  internal_game_id                uuid          NOT NULL,
  -- requested-position chronology (verbatim from the frozen V1-8a0b reader)
  game_date_utc                   date          NOT NULL,
  opponent_label                  text          NOT NULL,
  is_home                         boolean,
  stat_value                      numeric(14,4),
  -- the evaluated line the outcome is relative to (same threshold as the windows)
  evaluated_line                  numeric(10,2) NOT NULL,
  -- DISCRIMINANT: eligible observation vs ineligible/DNP requested position
  position_kind                   text          NOT NULL
    CONSTRAINT eps_position_kind_check CHECK (position_kind IN ('eligible', 'ineligible')),
  -- threshold-relative verdict — present ONLY on an eligible position; NULL (no
  -- verdict) on an ineligible/DNP position, enforced so it cannot be misread.
  outcome                         text
    CONSTRAINT eps_outcome_discriminated_check CHECK (
      (position_kind = 'eligible'   AND outcome IN ('above', 'below', 'equal'))
      OR
      (position_kind = 'ineligible' AND outcome IS NULL)
    ),
  -- DNP/ineligible state + provenance (verbatim from the frozen reader)
  eligibility_state               player_stat_eligibility NOT NULL,
  minutes_status                  bdl_minutes_status      NOT NULL,
  includes_backfilled_historical  boolean       NOT NULL,
  created_at                      timestamptz   NOT NULL DEFAULT now(),
  -- uniqueness: one row per (profile, game) — no duplicate game-series rows
  CONSTRAINT eps_profile_game_unique    UNIQUE (evidence_profile_id, internal_game_id),
  -- uniqueness: one row per (profile, ordinal) — deterministic ordering
  CONSTRAINT eps_profile_ordinal_unique UNIQUE (evidence_profile_id, ordinal)
);
CREATE INDEX eps_profile_idx ON evidence_profile_series (evidence_profile_id);

COMMENT ON TABLE evidence_profile_series IS
  'V1-8a0a. ONE complete per-game series per profile: every requested-window position (frozen V1-8a0b reader chronology) joined on internal_game_id to its eligible per-game threshold outcome (interface extension). DNP/ineligible positions present with position_kind=ineligible and outcome NULL (no verdict). internal_game_id is server-side-only (Amendment 21). No paid offering values; no composite score.';
COMMENT ON COLUMN evidence_profile_series.internal_game_id IS
  'Server-side-only canonical game identity (Amendment 21): join key + stable row identity. NEVER a browser projection field; on RESEARCH_PROJECTION_FORBIDDEN_KEYS.';
COMMENT ON COLUMN evidence_profile_series.outcome IS
  'Threshold-relative verdict, present ONLY when position_kind=eligible (above/below/equal); NULL when position_kind=ineligible. The discriminated no-verdict state — never an ambiguous nullable eligible value.';

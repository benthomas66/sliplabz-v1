-- ============================================================================
-- V1-1  Migration 04 : provider_teams
--
-- Authority anchors:
--   Complete spec §11.1 provider_teams
--   BALLDONTLIE sub-spec §12B (teams registry)
--   BALLDONTLIE sub-spec §12B.5 (uniqueness — provider_team_id is the only
--     globally unique team key per provider; full_name and abbreviation
--     are NOT unique inside BDL)
--   BALLDONTLIE sub-spec §12B.7 (expansion metadata — empty city, null
--     conference are load-bearing)
--   BALLDONTLIE sub-spec §12B.10 (team refresh; content_hash + change ts)
--   Odds API sub-spec §25 (cross-provider handoff)
--
-- Load-bearing invariants:
--   * UNIQUE (provider, provider_team_id).
--   * NO UNIQUE on raw_full_name.
--   * NO UNIQUE on raw_abbreviation.
--   * raw_city may be empty string.
--   * raw_conference may be NULL.
--   * internal_team_id is nullable; unresolved provider rows are allowed.
-- ============================================================================

CREATE TABLE provider_teams (
  provider_team_row_id  uuid                 PRIMARY KEY DEFAULT gen_random_uuid(),

  provider              provider_kind        NOT NULL,

  -- Provider-native identifier stored as text since some providers use
  -- numeric IDs and others use opaque strings. Uniqueness is per-provider.
  provider_team_id      text                 NOT NULL,

  -- Optional link to the resolved internal team. NULL when unresolved,
  -- quarantined, or pending review. Required when mapping_state='approved'.
  internal_team_id      uuid                 REFERENCES teams(internal_team_id)
                                             ON UPDATE RESTRICT ON DELETE RESTRICT,

  -- Raw provider values preserved verbatim; never overwritten by an alias.
  raw_full_name         text                 NOT NULL DEFAULT '',
  raw_name              text                 NOT NULL DEFAULT '',
  raw_abbreviation      text                 NOT NULL DEFAULT '',
  raw_city              text                 NOT NULL DEFAULT '',
  raw_conference        text,

  -- Applied classification (BDL §12B.4). May differ from provider
  -- conference-derived guesses.
  classification        team_classification  NOT NULL DEFAULT 'unknown',

  first_seen_at         timestamptz          NOT NULL DEFAULT now(),
  last_seen_at          timestamptz          NOT NULL DEFAULT now(),

  -- Content hash of the raw provider payload; changes trigger observation
  -- of metadata drift without treating it as identity change.
  content_hash          text,

  mapping_state         mapping_state        NOT NULL DEFAULT 'unresolved',

  -- When mapping_state='approved', internal_team_id must be set.
  CHECK ( mapping_state <> 'approved' OR internal_team_id IS NOT NULL ),

  created_at            timestamptz          NOT NULL DEFAULT now(),
  updated_at            timestamptz          NOT NULL DEFAULT now(),

  -- The load-bearing per-provider uniqueness.
  UNIQUE (provider, provider_team_id)
);

CREATE INDEX provider_teams_internal_team_idx  ON provider_teams (internal_team_id);
CREATE INDEX provider_teams_mapping_state_idx  ON provider_teams (mapping_state);
CREATE INDEX provider_teams_raw_abbr_lower_idx ON provider_teams (LOWER(raw_abbreviation));
CREATE INDEX provider_teams_raw_full_lower_idx ON provider_teams (LOWER(raw_full_name));

COMMENT ON TABLE  provider_teams                 IS 'Provider team identities and their (possibly-null) mapping to internal teams.';
COMMENT ON COLUMN provider_teams.provider_team_id IS 'Provider-native ID; opaque text. Unique per provider.';
COMMENT ON COLUMN provider_teams.raw_city         IS 'Empty string preserved verbatim for expansion teams. See BDL §12B.7.';
COMMENT ON COLUMN provider_teams.raw_conference   IS 'NULL preserved verbatim for expansion / historical / national / placeholder teams.';

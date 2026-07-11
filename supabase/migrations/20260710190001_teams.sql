-- ============================================================================
-- V1-1  Migration 01 : internal teams
--
-- Authority anchors:
--   Complete spec §7.1 (provider-independent IDs)
--   Complete spec §11.1 teams
--   BALLDONTLIE sub-spec §11 (team identity)
--   BALLDONTLIE sub-spec §12B.5 (uniqueness — provider full_name and abbr
--     are NOT globally unique; placeholder IDs 32 and 33 both use 'TBD')
--   BALLDONTLIE sub-spec §12B.7 (expansion metadata may have empty city
--     and null conference — Portland Fire id 31, Toronto Tempo id 30)
--   BALLDONTLIE sub-spec §12B.8 (historical franchise handling)
--
-- Load-bearing invariants enforced here:
--   * No UNIQUE on display_name.
--   * No UNIQUE on abbreviation.
--   * conference is nullable.
--   * city is nullable and may be empty string.
--
-- Forward-fix strategy: additive columns and CHECK relaxations only.
-- A future migration may introduce a franchise_lineage_id FK when the
-- separate franchise-lineage curation table lands; that lineage table
-- is intentionally deferred beyond V1-1.
-- ============================================================================

CREATE TABLE teams (
  -- Stable internal primary key. Never derived from a provider string.
  internal_team_id  uuid          PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Curated canonical display. NOT unique; two teams may share a display
  -- string during expansion transitions or in the placeholder registry.
  display_name      text          NOT NULL,
  CHECK (length(display_name) >= 1),

  -- Curated short abbreviation. NOT unique; placeholder teams may share.
  abbreviation      text          NOT NULL,
  CHECK (length(abbreviation) BETWEEN 1 AND 6),

  -- Registry classification driven by BDL §12B.4.
  classification    team_classification NOT NULL DEFAULT 'unknown',

  -- Optional curated display city; may be empty string for expansion teams
  -- whose canonical BDL city field is empty (Fire id 31, Tempo id 30).
  city              text          NOT NULL DEFAULT '',

  -- Conference / division metadata. NULL is allowed and expected for
  -- expansion, historical, national, and placeholder teams.
  conference        text,

  -- Free-form curated lineage note referring to the successor / predecessor
  -- franchise. The formal lineage table is a later ticket.
  lineage_note      text,

  created_at        timestamptz   NOT NULL DEFAULT now(),
  updated_at        timestamptz   NOT NULL DEFAULT now()
);

-- Non-unique index to accelerate provider-string-to-internal-team candidate
-- lookups. Case-insensitive via LOWER() to align with candidate normalization.
CREATE INDEX teams_abbr_lower_idx     ON teams (LOWER(abbreviation));
CREATE INDEX teams_display_lower_idx  ON teams (LOWER(display_name));
CREATE INDEX teams_classification_idx ON teams (classification);

COMMENT ON TABLE  teams                    IS 'Internal, provider-independent WNBA team identity. UNIQUE only on internal_team_id; see BDL §12B.5.';
COMMENT ON COLUMN teams.display_name       IS 'Curated display; may collide across teams (e.g., placeholders share ''TBD'').';
COMMENT ON COLUMN teams.abbreviation       IS 'Curated abbreviation; NOT unique. See BDL §12B.5.';
COMMENT ON COLUMN teams.classification     IS 'See BDL §12B.4 six-value taxonomy.';
COMMENT ON COLUMN teams.city               IS 'Empty string allowed for expansion teams (BDL §12B.7).';
COMMENT ON COLUMN teams.conference         IS 'NULL allowed for expansion / historical / national / placeholder teams.';

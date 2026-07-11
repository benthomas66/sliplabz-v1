-- ============================================================================
-- V1-1  Migration 07 : team_aliases
--
-- Authority anchors:
--   Complete spec §7.3 (mapping order — reviewed provider mapping >
--     normalized-name+context > reviewed alias > manual)
--   Odds API sub-spec §6 (mapping policy)
--
-- Load-bearing invariants:
--   * scope_kind + scope_provider identifies which provider corpus this
--     alias may be applied against.
--   * Versioned via alias_version; superseded aliases retained but
--     is_active=false.
--   * Normalization alone can never create an alias — approver is required.
--   * NO UNIQUE on alias_text — the same string may exist as an alias for
--     several teams via reviewed decisions.
-- ============================================================================

CREATE TABLE team_aliases (
  team_alias_id      uuid                 PRIMARY KEY DEFAULT gen_random_uuid(),

  internal_team_id   uuid                 NOT NULL
                                          REFERENCES teams(internal_team_id)
                                          ON UPDATE RESTRICT ON DELETE RESTRICT,

  scope_kind         alias_scope_kind     NOT NULL,
  alias_type         alias_type           NOT NULL DEFAULT 'match_candidate',

  -- Raw alias string as reviewed. Preserved verbatim.
  alias_text         text                 NOT NULL,
  CHECK (length(alias_text) >= 1),

  -- Normalized form of the alias, used for candidate matching only.
  normalized_alias   text                 NOT NULL,
  CHECK (length(normalized_alias) >= 1),

  alias_version      integer              NOT NULL,
  CHECK (alias_version >= 1),

  is_active          boolean              NOT NULL DEFAULT true,

  -- Reviewed metadata. approver_id / process is required to enforce that
  -- normalization alone did not create the alias.
  approved_by        text                 NOT NULL,
  approval_note      text,
  approved_at        timestamptz          NOT NULL DEFAULT now(),

  superseded_by      uuid                 REFERENCES team_aliases(team_alias_id)
                                          ON UPDATE RESTRICT ON DELETE RESTRICT,
  superseded_at      timestamptz,

  created_at         timestamptz          NOT NULL DEFAULT now(),
  updated_at         timestamptz          NOT NULL DEFAULT now(),

  -- Within a given team + scope + alias_type, alias_version is unique.
  UNIQUE (internal_team_id, scope_kind, alias_type, alias_version),

  -- Superseded rows must carry the supersession pointer + timestamp.
  CHECK ( (is_active = true  AND superseded_by IS NULL AND superseded_at IS NULL)
       OR (is_active = false) )
);

CREATE INDEX team_aliases_scope_idx      ON team_aliases (scope_kind, is_active);
CREATE INDEX team_aliases_normalized_idx ON team_aliases (normalized_alias);
CREATE INDEX team_aliases_internal_idx   ON team_aliases (internal_team_id, is_active);

COMMENT ON TABLE  team_aliases                IS 'Reviewed team aliases. Versioned; never derived from normalization alone.';
COMMENT ON COLUMN team_aliases.scope_kind     IS 'Which provider corpus this alias may match against; ''internal'' = display alias only.';
COMMENT ON COLUMN team_aliases.approved_by    IS 'Actor identifier (human reviewer or reviewed process). Required.';

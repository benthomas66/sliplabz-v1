-- ============================================================================
-- V1-1  Migration 08 : player_aliases
--
-- Authority anchors:
--   Complete spec §7.3 (mapping order)
--   BALLDONTLIE sub-spec §12A.6 (names: apostrophes, hyphens, spaces,
--     diacritics, transliteration differences; initials or shortened forms)
--
-- Load-bearing invariants: identical to team_aliases; see that file for
-- the mirror pattern. NO UNIQUE on alias_text or normalized_alias.
-- ============================================================================

CREATE TABLE player_aliases (
  player_alias_id     uuid                 PRIMARY KEY DEFAULT gen_random_uuid(),

  internal_player_id  uuid                 NOT NULL
                                           REFERENCES players(internal_player_id)
                                           ON UPDATE RESTRICT ON DELETE RESTRICT,

  scope_kind          alias_scope_kind     NOT NULL,
  alias_type          alias_type           NOT NULL DEFAULT 'match_candidate',

  alias_text          text                 NOT NULL,
  CHECK (length(alias_text) >= 1),

  normalized_alias    text                 NOT NULL,
  CHECK (length(normalized_alias) >= 1),

  alias_version       integer              NOT NULL,
  CHECK (alias_version >= 1),

  is_active           boolean              NOT NULL DEFAULT true,

  approved_by         text                 NOT NULL,
  approval_note       text,
  approved_at         timestamptz          NOT NULL DEFAULT now(),

  superseded_by       uuid                 REFERENCES player_aliases(player_alias_id)
                                           ON UPDATE RESTRICT ON DELETE RESTRICT,
  superseded_at       timestamptz,

  created_at          timestamptz          NOT NULL DEFAULT now(),
  updated_at          timestamptz          NOT NULL DEFAULT now(),

  UNIQUE (internal_player_id, scope_kind, alias_type, alias_version),

  CHECK ( (is_active = true  AND superseded_by IS NULL AND superseded_at IS NULL)
       OR (is_active = false) )
);

CREATE INDEX player_aliases_scope_idx      ON player_aliases (scope_kind, is_active);
CREATE INDEX player_aliases_normalized_idx ON player_aliases (normalized_alias);
CREATE INDEX player_aliases_internal_idx   ON player_aliases (internal_player_id, is_active);

COMMENT ON TABLE  player_aliases            IS 'Reviewed player aliases. Versioned; never derived from normalization alone.';

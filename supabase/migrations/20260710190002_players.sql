-- ============================================================================
-- V1-1  Migration 02 : internal players
--
-- Authority anchors:
--   Complete spec §7.1, §7.3, §11.1 players
--   BALLDONTLIE sub-spec §12A (active-player behavior)
--   BALLDONTLIE sub-spec §12A.6 (name-matching implications)
--   BALLDONTLIE sub-spec §12A.7 (roster-snapshot storage)
--
-- Load-bearing invariants:
--   * display_name is not unique.
--   * normalized_name is not unique (used only for candidate generation).
--   * A player's team change updates current_team_id; a new internal row is
--     NOT created just because a provider reassigns the player.
--   * status distinguishes historical identity from current-roster presence.
--   * Provider IDs never appear here; they live only in provider_players.
--
-- Forward-fix strategy: additive. If a display_alias table is added later,
-- this table's display_name remains the reviewed canonical value.
-- ============================================================================

CREATE TABLE players (
  internal_player_id  uuid          PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Reviewed canonical display. Preserves diacritics, punctuation, and the
  -- original casing from the reviewed identity source. NOT unique.
  display_name        text          NOT NULL,
  CHECK (length(display_name) >= 1),

  -- Candidate-only search key produced by nameNormalization. NEVER used
  -- as a permanent match key; enforcement lives in reconciliation logic.
  -- Redundantly present for query-side efficiency.
  normalized_name     text          NOT NULL,
  CHECK (length(normalized_name) >= 1),

  -- Current team pointer. May be NULL when the player is unresolved,
  -- historical, or not currently rostered.
  current_team_id     uuid          REFERENCES teams(internal_team_id)
                                    ON UPDATE RESTRICT ON DELETE RESTRICT,

  -- Lifecycle status; see enums migration.
  status              player_status NOT NULL DEFAULT 'unresolved',

  created_at          timestamptz   NOT NULL DEFAULT now(),
  updated_at          timestamptz   NOT NULL DEFAULT now()
);

-- Candidate lookup indexes only. NOT UNIQUE — normalization is not identity.
CREATE INDEX players_normalized_name_idx ON players (normalized_name);
CREATE INDEX players_display_lower_idx   ON players (LOWER(display_name));
CREATE INDEX players_current_team_idx    ON players (current_team_id);
CREATE INDEX players_status_idx          ON players (status);

COMMENT ON TABLE  players                  IS 'Internal, provider-independent player identity. See BDL §12A.6: no name-only permanent match.';
COMMENT ON COLUMN players.normalized_name  IS 'Candidate search key only. Not identity.';
COMMENT ON COLUMN players.current_team_id  IS 'NULL when unresolved or historical. Team change updates this; new internal row is NOT minted.';

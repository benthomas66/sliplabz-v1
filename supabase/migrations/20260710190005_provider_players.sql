-- ============================================================================
-- V1-1  Migration 05 : provider_players
--
-- Authority anchors:
--   Complete spec §7.3, §11.1 provider_players
--   BALLDONTLIE sub-spec §12A.6 (name-matching implications)
--   BALLDONTLIE sub-spec §12A.7 (roster-snapshot storage)
--   Odds API sub-spec §10.11 (player reconciliation)
--
-- Load-bearing invariants:
--   * UNIQUE (provider, provider_player_id).
--   * NO UNIQUE on normalized_name — normalization is candidate-only.
--   * internal_player_id is nullable.
--   * Team change updates internal_player_id's current_team_id; new internal
--     row is NOT minted here.
-- ============================================================================

CREATE TABLE provider_players (
  provider_player_row_id  uuid           PRIMARY KEY DEFAULT gen_random_uuid(),

  provider                provider_kind  NOT NULL,

  provider_player_id      text           NOT NULL,

  internal_player_id      uuid           REFERENCES players(internal_player_id)
                                         ON UPDATE RESTRICT ON DELETE RESTRICT,

  -- Raw provider identifying strings preserved verbatim.
  raw_first_name          text           NOT NULL DEFAULT '',
  raw_last_name           text           NOT NULL DEFAULT '',
  raw_full_name           text           NOT NULL DEFAULT '',

  -- Candidate-only normalized form of the provider's full name.
  normalized_name         text           NOT NULL DEFAULT '',

  -- Current provider team ID at last-seen time. Provider-native text.
  provider_team_id_seen   text,

  -- Rolling seen timestamps and mapping-state metadata.
  first_seen_at           timestamptz    NOT NULL DEFAULT now(),
  last_seen_at            timestamptz    NOT NULL DEFAULT now(),

  content_hash            text,

  mapping_state           mapping_state  NOT NULL DEFAULT 'unresolved',

  -- Alias-version pin: which alias-version was authoritative when this
  -- mapping was approved. NULL when no alias participated in the decision.
  alias_version_at_mapping  integer,

  CHECK ( mapping_state <> 'approved' OR internal_player_id IS NOT NULL ),

  created_at              timestamptz    NOT NULL DEFAULT now(),
  updated_at              timestamptz    NOT NULL DEFAULT now(),

  UNIQUE (provider, provider_player_id)
);

CREATE INDEX provider_players_internal_player_idx     ON provider_players (internal_player_id);
CREATE INDEX provider_players_mapping_state_idx       ON provider_players (mapping_state);
CREATE INDEX provider_players_normalized_name_idx     ON provider_players (normalized_name);
CREATE INDEX provider_players_provider_team_seen_idx  ON provider_players (provider_team_id_seen);

COMMENT ON TABLE  provider_players                   IS 'Provider player identities and their mapping to internal players. See BDL §12A.6.';
COMMENT ON COLUMN provider_players.normalized_name    IS 'Candidate-only. No UNIQUE. See spec §7.3.';
COMMENT ON COLUMN provider_players.internal_player_id IS 'NULL when unresolved. Team change never mints a new internal player.';

-- ============================================================================
-- V1-1  Migration 06 : provider_games
--
-- Authority anchors:
--   Complete spec §7.2, §11.1 provider_games
--   Odds API sub-spec §4 (event response contract)
--   Odds API sub-spec §6, §7 (reconciliation & lifecycle)
--
-- Load-bearing invariants:
--   * UNIQUE (provider, provider_game_id).
--   * A single provider event ID must never be reused for another internal
--     game — Odds §6.1. Enforced by the UNIQUE and by mapping-history.
--   * Raw provider team strings and raw commence time preserved.
--   * Time delta (SlipLabz observed) preserved to inspect tolerance.
-- ============================================================================

CREATE TABLE provider_games (
  provider_game_row_id  uuid           PRIMARY KEY DEFAULT gen_random_uuid(),

  provider              provider_kind  NOT NULL,

  provider_game_id      text           NOT NULL,

  internal_game_id      uuid           REFERENCES games(internal_game_id)
                                       ON UPDATE RESTRICT ON DELETE RESTRICT,

  -- Raw provider strings; never rewritten by a reviewed alias.
  raw_home_team         text           NOT NULL DEFAULT '',
  raw_away_team         text           NOT NULL DEFAULT '',
  raw_sport_key         text           NOT NULL DEFAULT '',
  raw_sport_title       text           NOT NULL DEFAULT '',

  -- Provider's commence_time as observed.
  raw_commence_time     timestamptz,

  -- (Scheduled tip on the matched internal game) - (raw commence_time).
  -- NULL until a candidate is proposed. Used for the 15-minute tolerance
  -- window (complete spec §7.2, Odds §6.1).
  time_delta_seconds    integer,

  first_seen_at         timestamptz    NOT NULL DEFAULT now(),
  last_seen_at          timestamptz    NOT NULL DEFAULT now(),

  content_hash          text,

  mapping_state         mapping_state  NOT NULL DEFAULT 'unresolved',

  CHECK ( mapping_state <> 'approved' OR internal_game_id IS NOT NULL ),

  created_at            timestamptz    NOT NULL DEFAULT now(),
  updated_at            timestamptz    NOT NULL DEFAULT now(),

  UNIQUE (provider, provider_game_id)
);

CREATE INDEX provider_games_internal_game_idx   ON provider_games (internal_game_id);
CREATE INDEX provider_games_mapping_state_idx   ON provider_games (mapping_state);
CREATE INDEX provider_games_raw_commence_idx    ON provider_games (raw_commence_time);
CREATE INDEX provider_games_raw_home_lower_idx  ON provider_games (LOWER(raw_home_team));
CREATE INDEX provider_games_raw_away_lower_idx  ON provider_games (LOWER(raw_away_team));

COMMENT ON TABLE  provider_games                  IS 'Provider events (games) and their mapping to internal games.';
COMMENT ON COLUMN provider_games.time_delta_seconds IS 'Signed seconds between internal scheduled_start and provider commence_time. Used to enforce the tolerance window.';

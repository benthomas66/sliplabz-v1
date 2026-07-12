-- ============================================================================
-- V1-2  Migration 18 : BDL game snapshots + game-status observations
--
-- Authority anchors:
--   BALLDONTLIE sub-spec §10 (game-state authority — BDL `status` is
--     authoritative; period and clock do NOT independently establish finality)
--   BALLDONTLIE sub-spec §6A (regular season vs postseason semantics)
--   Complete spec §9.6 (final status), §11.1 games / provider_games
--   Ticket V1-2 hard invariant: finality comes only from the mapped game
--     status, never inferred from clock or period fields.
--   Ticket V1-2 hard invariant: unknown game statuses quarantine; never guess.
--
-- Load-bearing invariants:
--   * One raw snapshot per (ingestion_run_id, provider_game_id).
--   * Transitions to and from `final` are recorded in game_status_observations
--     so V1-5 recomputation triggers can consume them without re-parsing raws.
--   * Unknown provider status strings quarantine the game (canonical_status
--     = 'unresolved') and do not admit downstream stat rows.
-- ============================================================================

CREATE TABLE bdl_game_snapshots (
  bdl_game_snapshot_id   uuid          PRIMARY KEY DEFAULT gen_random_uuid(),

  bdl_ingestion_run_id   uuid          NOT NULL
                                       REFERENCES bdl_ingestion_runs(bdl_ingestion_run_id)
                                       ON UPDATE RESTRICT ON DELETE RESTRICT,

  raw_response_id        uuid          REFERENCES bdl_raw_responses(raw_response_id)
                                       ON UPDATE RESTRICT ON DELETE RESTRICT,

  provider_game_id       text          NOT NULL,

  -- Provider-native identifiers preserved verbatim.
  raw_status             text          NOT NULL,
  raw_period             integer,
  raw_time               text,
  raw_date               text,
  raw_season             integer,
  raw_season_type        integer,
  raw_postseason         boolean,
  raw_home_team_id       text,
  raw_visitor_team_id    text,

  -- Full raw provider game object for audit / reprocessing.
  raw_payload            jsonb         NOT NULL,

  -- Canonical status mapped from raw_status. `unresolved` denotes a status
  -- string the mapping table does not recognize — the game quarantines and
  -- dependent player-stat rows do not become eligible.
  canonical_status       game_status   NOT NULL,

  content_hash           text          NOT NULL,

  retrieved_at           timestamptz   NOT NULL DEFAULT now(),

  created_at             timestamptz   NOT NULL DEFAULT now(),

  UNIQUE (bdl_ingestion_run_id, provider_game_id)
);

CREATE INDEX bdl_game_snapshots_provider_game_idx
  ON bdl_game_snapshots (provider_game_id);
CREATE INDEX bdl_game_snapshots_status_idx
  ON bdl_game_snapshots (canonical_status);
CREATE INDEX bdl_game_snapshots_retrieved_idx
  ON bdl_game_snapshots (retrieved_at DESC);


-- ---------------------------------------------------------------------------
-- Every observed change to a game's canonical status. Feeds:
--   * post-final reconciliation scheduling on `... -> final`;
--   * invalidation events on `final -> other` (BDL §12C source corrections);
--   * quarantine tracking on `... -> unresolved`.
-- Append-only in intent.
-- ---------------------------------------------------------------------------
CREATE TABLE game_status_observations (
  game_status_observation_id  uuid           PRIMARY KEY DEFAULT gen_random_uuid(),

  provider_game_id            text           NOT NULL,

  internal_game_id            uuid           REFERENCES games(internal_game_id)
                                             ON UPDATE RESTRICT ON DELETE RESTRICT,

  bdl_ingestion_run_id        uuid           NOT NULL
                                             REFERENCES bdl_ingestion_runs(bdl_ingestion_run_id)
                                             ON UPDATE RESTRICT ON DELETE RESTRICT,

  bdl_game_snapshot_id        uuid           REFERENCES bdl_game_snapshots(bdl_game_snapshot_id)
                                             ON UPDATE RESTRICT ON DELETE RESTRICT,

  prior_canonical_status      game_status,
  observed_canonical_status   game_status    NOT NULL,

  raw_status                  text           NOT NULL,

  observed_at                 timestamptz    NOT NULL DEFAULT now(),

  created_at                  timestamptz    NOT NULL DEFAULT now()
);

CREATE INDEX game_status_observations_provider_game_idx
  ON game_status_observations (provider_game_id, observed_at DESC);
CREATE INDEX game_status_observations_internal_game_idx
  ON game_status_observations (internal_game_id, observed_at DESC);
CREATE INDEX game_status_observations_status_idx
  ON game_status_observations (observed_canonical_status);

COMMENT ON TABLE  bdl_game_snapshots
  IS 'Per-run BDL game observations. canonical_status is mapped by application code; unknown provider statuses map to unresolved (quarantine).';
COMMENT ON TABLE  game_status_observations
  IS 'Append-only game canonical-status change log. Drives post-final scheduling and invalidation. Never UPDATE/DELETE.';

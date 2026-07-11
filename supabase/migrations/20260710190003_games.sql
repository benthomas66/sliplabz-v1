-- ============================================================================
-- V1-1  Migration 03 : internal games
--
-- Authority anchors:
--   Complete spec §7.2 (event mapping)
--   Complete spec §7.10 (close boundary — actual vs scheduled)
--   Complete spec §11.1 games
--   BALLDONTLIE sub-spec §10 (game-state authority)
--   BALLDONTLIE sub-spec §6A (season semantics — regular vs postseason)
--
-- Load-bearing invariants:
--   * scheduled_start_utc and actual_start_utc are separate columns.
--     Do NOT alias one to the other; complete spec §7.10 requires distinct
--     handling for close-boundary evaluation.
--   * home_team_id and away_team_id are ORDERED (home vs away is semantic,
--     not a symmetric pair). CHECK forbids identical home and away.
--   * season is stored as integer season year (BDL §6A).
--   * season_type is stored as smallint to match BDL provider values
--     (2 = regular, 3 = postseason). A separate postseason boolean is
--     retained as convenience metadata.
--
-- Forward-fix strategy: additive. If period / clock or per-quarter metadata
-- ever land here (they should not in V1), they go in a follow-up migration.
-- ============================================================================

CREATE TABLE games (
  internal_game_id     uuid          PRIMARY KEY DEFAULT gen_random_uuid(),

  -- BDL §6A: integer season year.
  season               smallint      NOT NULL,
  CHECK (season BETWEEN 1997 AND 2100),

  -- BDL §6A: 2 = regular, 3 = postseason. Additional values quarantine.
  season_type          smallint      NOT NULL,
  CHECK (season_type IN (2, 3)),

  home_team_id         uuid          NOT NULL
                                     REFERENCES teams(internal_team_id)
                                     ON UPDATE RESTRICT ON DELETE RESTRICT,
  away_team_id         uuid          NOT NULL
                                     REFERENCES teams(internal_team_id)
                                     ON UPDATE RESTRICT ON DELETE RESTRICT,

  -- A game may not have identical home and away teams. Rejecting the
  -- degenerate self-match is a schema-level invariant, not a runtime check.
  CHECK (home_team_id <> away_team_id),

  -- Scheduled tip in UTC. Never renamed to actual start.
  scheduled_start_utc  timestamptz   NOT NULL,

  -- Actual start in UTC. NULL until observed; NEVER copied from scheduled
  -- as a shortcut.
  actual_start_utc     timestamptz,

  -- Canonical game status; see enums migration.
  status               game_status   NOT NULL DEFAULT 'scheduled',

  -- Convenience mirror of season_type; MAY be used by product UIs.
  postseason           boolean       NOT NULL DEFAULT false,

  created_at           timestamptz   NOT NULL DEFAULT now(),
  updated_at           timestamptz   NOT NULL DEFAULT now(),

  -- Keeps postseason bool honest against season_type.
  CHECK ( (postseason = true  AND season_type = 3)
       OR (postseason = false AND season_type = 2) )
);

CREATE INDEX games_scheduled_start_idx ON games (scheduled_start_utc);
CREATE INDEX games_home_team_idx       ON games (home_team_id);
CREATE INDEX games_away_team_idx       ON games (away_team_id);
CREATE INDEX games_status_idx          ON games (status);
CREATE INDEX games_season_idx          ON games (season, season_type);

COMMENT ON TABLE  games                     IS 'Internal, provider-independent game identity. See complete spec §7.2, §7.10.';
COMMENT ON COLUMN games.scheduled_start_utc IS 'Scheduled tip; never overwritten by actual start.';
COMMENT ON COLUMN games.actual_start_utc    IS 'Observed actual start; NULL until observed. See complete spec §7.10.';
COMMENT ON COLUMN games.home_team_id        IS 'Ordered — home and away are not interchangeable. See Odds §6.1.';

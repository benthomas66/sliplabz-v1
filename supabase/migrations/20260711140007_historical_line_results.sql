-- ============================================================================
-- V1-4  Migration 41 : historical line results
--
-- Authority anchors:
--   Complete spec §7.11 (historical real-line game eligibility)
--   Complete spec §7.12 (push — separate outcome; excluded from Over/Under
--     percentages and from streak direction)
--   Complete spec §11.5 historical_line_results (canonical fields)
--   Complete spec §14.2 (real-line eligibility)
--   Odds sub-spec §18.4 (canonical closing point method)
--
-- Load-bearing invariants:
--   * UNIQUE (internal_game_id, internal_player_id, market_key) — one
--     historical line result per (game, player, market) at a given
--     computation_version.
--   * `outcome` is `over` | `under` | `push`. `push` is a first-class outcome
--     that MUST be preserved as its own value; downstream aggregations must
--     exclude push rows from Over/Under percentages and from streak direction.
--   * `player_stat_value` is denormalized from player_game_stats.normalized_stats
--     for the mapped canonical stat (pts / reb / ast / fg3m). Denormalized
--     here so V1-5 doesn't need to re-join; the value at write time is
--     authoritative for THIS computation_version. A V1-2 material_stat_change
--     invalidation triggers recomputation; the new row supersedes at a new
--     computation_version rather than mutating.
--   * `margin` = player_stat_value - canonical_closing_point. Preserved as
--     numeric so consumer aggregations can average/median without
--     re-computation. Absent when the outcome is `push` (margin is trivially
--     zero) — schema still stores it for auditability.
--   * `coverage_state` mirrors §11.5. A game is only stored here when it has
--     a canonical_closing_point AND an eligible player_game_stats row.
--     Otherwise it does not appear.
-- ============================================================================

CREATE TABLE historical_line_results (
  historical_line_result_id       uuid                        PRIMARY KEY DEFAULT gen_random_uuid(),

  internal_game_id                uuid                        NOT NULL
                                                              REFERENCES games(internal_game_id)
                                                              ON UPDATE RESTRICT ON DELETE RESTRICT,
  internal_player_id              uuid                        NOT NULL
                                                              REFERENCES players(internal_player_id)
                                                              ON UPDATE RESTRICT ON DELETE RESTRICT,
  market_key                      text                        NOT NULL
                                                              REFERENCES market_registry(provider_key)
                                                              ON UPDATE RESTRICT ON DELETE RESTRICT,

  canonical_closing_point_id      uuid                        NOT NULL
                                                              REFERENCES canonical_closing_points(canonical_closing_point_id)
                                                              ON UPDATE RESTRICT ON DELETE RESTRICT,
  canonical_closing_point         numeric(10,2)               NOT NULL,

  -- Canonical stat value from player_game_stats.normalized_stats.
  player_game_stat_id             uuid                        NOT NULL
                                                              REFERENCES player_game_stats(player_game_stat_id)
                                                              ON UPDATE RESTRICT ON DELETE RESTRICT,
  player_stat_key                 text                        NOT NULL,
  CHECK (player_stat_key IN ('pts', 'reb', 'ast', 'fg3m')),
  player_stat_value               numeric(6,2)                NOT NULL,

  outcome                         real_line_outcome           NOT NULL,
  margin                          numeric(10,2)               NOT NULL,

  -- Push outcomes are documented as zero-margin by construction.
  CHECK ( (outcome = 'push' AND margin = 0)
       OR (outcome = 'over'  AND margin > 0)
       OR (outcome = 'under' AND margin < 0) ),

  coverage_state                  coverage_label              NOT NULL,
  CHECK (coverage_state IN ('complete', 'single_book')),

  -- Provenance mirror for cheap querying. Structural: historical_line_results
  -- rows exist for canonical rows that came from self_observed source quotes
  -- only. V1-4b will separately gate a distinct backfilled_historical path.
  provenance                      oddsapi_provenance          NOT NULL DEFAULT 'self_observed',
  CHECK (provenance = 'self_observed'),

  computation_version             integer                     NOT NULL DEFAULT 1,

  computed_at                     timestamptz                 NOT NULL DEFAULT now(),
  created_at                      timestamptz                 NOT NULL DEFAULT now(),
  updated_at                      timestamptz                 NOT NULL DEFAULT now(),

  UNIQUE (internal_game_id, internal_player_id, market_key)
);

CREATE INDEX historical_line_results_player_market_idx
  ON historical_line_results (internal_player_id, market_key);
CREATE INDEX historical_line_results_game_idx
  ON historical_line_results (internal_game_id);
CREATE INDEX historical_line_results_outcome_idx
  ON historical_line_results (outcome);
CREATE INDEX historical_line_results_coverage_idx
  ON historical_line_results (coverage_state);

COMMENT ON TABLE historical_line_results
  IS 'One historical result per (game, player, market). Push is first-class; excluded from Over/Under percentages downstream.';
COMMENT ON COLUMN historical_line_results.outcome
  IS 'over | under | push. Push MUST be excluded from Over/Under percentages and from streak direction.';

-- ============================================================================
-- V1-4  Migration 39 : source-level closing quotes
--
-- Authority anchors:
--   Complete spec §7.10.1 (source closing quote definition & eligibility)
--   Complete spec §7.10.2 (retained inputs to canonical closing point selection)
--   Complete spec §11.5 historical_line_results.source_level_closing_quote_references
--   Odds sub-spec §16.1 (current snapshot selection rules)
--   Odds sub-spec §16.3 (opening / first-observed clarification)
--   Odds sub-spec §18.4 (canonical historical closing point method)
--
-- Load-bearing invariants:
--   * UNIQUE (internal_game_id, internal_player_id, market_key, bookmaker_key):
--     one closing quote PER (game, player, market, source). Multiple points
--     from the same bookmaker collapse to at most ONE closing quote — the
--     latest eligible pregame observation for THAT source at the close boundary.
--   * `close_capture_state` distinguishes eligible / close_capture_stale /
--     no_snapshot per spec §7.10.1. Only `eligible` rows contribute to the
--     canonical closing-point selection.
--   * `source_class` is denormalized here so the canonical-closing-point query
--     can filter to `sportsbook` without a join. PrizePicks / Underdog rows
--     may be persisted for audit (`source_class = 'dfs_pickem'`) but the
--     canonical selection query MUST exclude them.
--   * `market_snapshot_id` / `market_offering_id` back-references make every
--     closing quote walk-back auditable to its raw evidence.
--   * A postponed game NEVER produces closing quotes: the write path skips
--     any game whose close_boundary_evaluations.boundary_source is
--     `postponed_no_close`.
-- ============================================================================

CREATE TABLE source_closing_quotes (
  source_closing_quote_id     uuid                    PRIMARY KEY DEFAULT gen_random_uuid(),

  internal_game_id            uuid                    NOT NULL
                                                      REFERENCES games(internal_game_id)
                                                      ON UPDATE RESTRICT ON DELETE RESTRICT,
  internal_player_id          uuid                    NOT NULL
                                                      REFERENCES players(internal_player_id)
                                                      ON UPDATE RESTRICT ON DELETE RESTRICT,
  market_key                  text                    NOT NULL
                                                      REFERENCES market_registry(provider_key)
                                                      ON UPDATE RESTRICT ON DELETE RESTRICT,
  bookmaker_key               text                    NOT NULL
                                                      REFERENCES bookmaker_registry(provider_key)
                                                      ON UPDATE RESTRICT ON DELETE RESTRICT,

  -- Denormalized structural filter. Sportsbook consensus never mixes classes.
  source_class                source_class            NOT NULL,

  -- The closing point per §7.10.1: the point observed at (or before) the
  -- close boundary from the last eligible pregame snapshot for this source.
  closing_point               numeric(10,2),

  -- Optional prices from the final observed pregame observation for this source.
  closing_over_price          integer,
  closing_under_price         integer,

  -- Provider `last_update` for the observation this closing quote represents.
  provider_last_update        timestamptz,

  -- The snapshot & offering references this quote came from. NULL when
  -- close_capture_state != 'eligible'.
  source_snapshot_id          uuid                    REFERENCES market_snapshots(market_snapshot_id)
                                                      ON UPDATE RESTRICT ON DELETE RESTRICT,
  source_offering_id          uuid                    REFERENCES market_offerings(market_offering_id)
                                                      ON UPDATE RESTRICT ON DELETE RESTRICT,

  -- Close capture eligibility. Only `eligible` contributes to canonical selection.
  close_capture_state         close_capture_state     NOT NULL,

  -- Structural pairings.
  CHECK ( (close_capture_state = 'eligible' AND closing_point IS NOT NULL AND source_snapshot_id IS NOT NULL AND source_offering_id IS NOT NULL)
       OR (close_capture_state = 'close_capture_stale' AND closing_point IS NULL AND source_snapshot_id IS NOT NULL)
       OR (close_capture_state = 'no_snapshot' AND closing_point IS NULL AND source_snapshot_id IS NULL AND source_offering_id IS NULL) ),

  -- Effective close boundary at the time this quote was computed. Kept for
  -- auditability when a later correction changes the boundary.
  close_boundary_utc          timestamptz             NOT NULL,

  computation_version         integer                 NOT NULL DEFAULT 1,

  computed_at                 timestamptz             NOT NULL DEFAULT now(),
  created_at                  timestamptz             NOT NULL DEFAULT now(),
  updated_at                  timestamptz             NOT NULL DEFAULT now(),

  UNIQUE (internal_game_id, internal_player_id, market_key, bookmaker_key)
);

CREATE INDEX source_closing_quotes_game_player_market_idx
  ON source_closing_quotes (internal_game_id, internal_player_id, market_key);
CREATE INDEX source_closing_quotes_bookmaker_idx
  ON source_closing_quotes (bookmaker_key);
CREATE INDEX source_closing_quotes_state_idx
  ON source_closing_quotes (close_capture_state);
CREATE INDEX source_closing_quotes_source_class_idx
  ON source_closing_quotes (source_class);
CREATE INDEX source_closing_quotes_point_idx
  ON source_closing_quotes (closing_point)
  WHERE closing_point IS NOT NULL;

COMMENT ON TABLE source_closing_quotes
  IS 'One closing quote per (game, player, market, source). Feeds canonical closing-point selection. Sportsbook-only for consensus.';
COMMENT ON COLUMN source_closing_quotes.close_capture_state
  IS 'eligible | close_capture_stale | no_snapshot. Only eligible contributes to canonical selection.';

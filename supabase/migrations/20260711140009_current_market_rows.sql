-- ============================================================================
-- V1-4  Migration 43 : current market rows
--
-- Authority anchors:
--   Complete spec §7.5 (primary research row grain)
--   Complete spec §7.6 (line consensus)
--   Complete spec §7.7 (price comparison at exact point/side only)
--   Complete spec §11.5 current_market_rows (line consensus, line range,
--     point distribution, eligible sportsbook count, freshness, first-observed
--     consensus, movement)
--   Odds sub-spec §16.1 (current snapshot), §16.2 (current offering), §18.2
--     (line consensus vs price consensus grain)
--
-- Load-bearing invariants:
--   * UNIQUE (internal_game_id, internal_player_id, market_key,
--     computation_version) — one row per grain per computation version.
--   * `line_consensus_point` is the SPORTSBOOK-only line consensus per §7.6.
--     PrizePicks / Underdog offerings NEVER contribute.
--   * `eligible_sportsbook_count` counts distinct sportsbook books currently
--     offering the player-market grain; snapshot classification is structural.
--   * `point_distribution` is a jsonb array of `{ point, book_count }` so
--     product surfaces can render exact-point counts without a re-scan.
--   * `first_observed_consensus_point` is the point most recently observed
--     as the SlipLabz first-observed consensus — labeled "first observed",
--     NEVER "opening line" (§7.8).
--   * `freshness_state` mirrors §19.2 states.
-- ============================================================================

CREATE TABLE current_market_rows (
  current_market_row_id           uuid                       PRIMARY KEY DEFAULT gen_random_uuid(),

  internal_game_id                uuid                       NOT NULL
                                                             REFERENCES games(internal_game_id)
                                                             ON UPDATE RESTRICT ON DELETE RESTRICT,
  internal_player_id              uuid                       NOT NULL
                                                             REFERENCES players(internal_player_id)
                                                             ON UPDATE RESTRICT ON DELETE RESTRICT,
  market_key                      text                       NOT NULL
                                                             REFERENCES market_registry(provider_key)
                                                             ON UPDATE RESTRICT ON DELETE RESTRICT,

  -- Line consensus (sportsbook-only) per §7.6.
  line_consensus_point            numeric(10,2),

  -- Range.
  line_min_point                  numeric(10,2),
  line_max_point                  numeric(10,2),

  -- Distinct sportsbook count offering ANY point at this grain.
  eligible_sportsbook_count       integer                    NOT NULL DEFAULT 0,
  CHECK (eligible_sportsbook_count >= 0),

  -- Point distribution as [{point, book_count}, …] sorted by point ascending.
  point_distribution              jsonb                      NOT NULL DEFAULT '[]'::jsonb,

  -- First-observed consensus per §7.8.
  first_observed_consensus_point  numeric(10,2),
  first_observed_at               timestamptz,

  -- Freshness state per Odds §19.2.
  freshness_state                 freshness_state            NOT NULL DEFAULT 'unavailable',

  -- Movement summary references (latest movement_events for this grain).
  latest_movement_event_id        uuid                       REFERENCES movement_events(movement_event_id)
                                                             ON UPDATE RESTRICT ON DELETE RESTRICT,
  latest_movement_detected_at     timestamptz,

  -- Structural provenance mirror.
  provenance                      oddsapi_provenance         NOT NULL DEFAULT 'self_observed',
  CHECK (provenance = 'self_observed'),

  computation_version             integer                    NOT NULL DEFAULT 1,

  computed_at                     timestamptz                NOT NULL DEFAULT now(),
  created_at                      timestamptz                NOT NULL DEFAULT now(),
  updated_at                      timestamptz                NOT NULL DEFAULT now(),

  UNIQUE (internal_game_id, internal_player_id, market_key, computation_version)
);

CREATE INDEX current_market_rows_game_idx
  ON current_market_rows (internal_game_id);
CREATE INDEX current_market_rows_player_market_idx
  ON current_market_rows (internal_player_id, market_key);
CREATE INDEX current_market_rows_freshness_idx
  ON current_market_rows (freshness_state);

COMMENT ON TABLE current_market_rows
  IS 'Materialized current-line summary per (game, player, market). Sportsbook-only consensus; freshness and movement denormalized for cheap product reads.';
COMMENT ON COLUMN current_market_rows.line_consensus_point
  IS 'SPORTSBOOK-ONLY consensus per §7.6. NEVER computed from PrizePicks / Underdog offerings.';

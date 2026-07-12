-- ============================================================================
-- V1-4  Migration 38 : movement events
--
-- Authority anchors:
--   Complete spec §13.1 (movement types)
--   Complete spec §13.2 (point transition = old point removed + new point added)
--   Odds sub-spec §17 (movement & disappearance contract)
--
-- Load-bearing invariants:
--   * Append-only in intent. No UPDATE / DELETE / TRUNCATE anywhere.
--   * One row per detected transition between two consecutive market_snapshots
--     at the same event/bookmaker/market/player/side/point grain.
--   * `prior_snapshot_id` and `current_snapshot_id` reference market_snapshots;
--     `prior_offering_id` and `current_offering_id` reference market_offerings.
--     Nulls indicate the corresponding side of the transition wasn't present.
--   * `internal_game_id` / `internal_player_id` are denormalized for query
--     performance; both are NULL only for pre-mapping transitions (bookmaker
--     added/removed at the run level).
--   * All rows are self-observed current-poll rows only (structural: the
--     linked market_snapshots CHECK on the V1-3 schema already forces this,
--     and V1-4 further tightens with the additive event_discovery CHECK).
-- ============================================================================

CREATE TABLE movement_events (
  movement_event_id         uuid              PRIMARY KEY DEFAULT gen_random_uuid(),

  movement_type             movement_type     NOT NULL,

  provider_event_id         text,
  internal_game_id          uuid              REFERENCES games(internal_game_id)
                                              ON UPDATE RESTRICT ON DELETE RESTRICT,
  internal_player_id        uuid              REFERENCES players(internal_player_id)
                                              ON UPDATE RESTRICT ON DELETE RESTRICT,

  bookmaker_key             text              REFERENCES bookmaker_registry(provider_key)
                                              ON UPDATE RESTRICT ON DELETE RESTRICT,
  market_key                text              REFERENCES market_registry(provider_key)
                                              ON UPDATE RESTRICT ON DELETE RESTRICT,
  side                      outcome_side,
  point                     numeric(10,2),

  -- Snapshot references for walk-back.
  prior_snapshot_id         uuid              REFERENCES market_snapshots(market_snapshot_id)
                                              ON UPDATE RESTRICT ON DELETE RESTRICT,
  current_snapshot_id       uuid              REFERENCES market_snapshots(market_snapshot_id)
                                              ON UPDATE RESTRICT ON DELETE RESTRICT,

  -- Canonical-offering references (one or both nullable depending on movement_type).
  prior_offering_id         uuid              REFERENCES market_offerings(market_offering_id)
                                              ON UPDATE RESTRICT ON DELETE RESTRICT,
  current_offering_id       uuid              REFERENCES market_offerings(market_offering_id)
                                              ON UPDATE RESTRICT ON DELETE RESTRICT,

  -- Point / price transitions preserved as numeric values.
  prior_point               numeric(10,2),
  current_point             numeric(10,2),
  prior_over_price          integer,
  current_over_price        integer,
  prior_under_price         integer,
  current_under_price       integer,

  -- Provider timestamp change (Odds §17 provider_timestamp_changed).
  prior_provider_last_update    timestamptz,
  current_provider_last_update  timestamptz,

  -- SlipLabz observation time for this transition (detected_at).
  detected_at               timestamptz       NOT NULL DEFAULT now(),

  -- Confidence per Odds §17. `high` when both prior and current snapshots
  -- succeeded; `low` when the transition involves an implicit-omission edge.
  confidence                text              NOT NULL DEFAULT 'high',
  CHECK (confidence IN ('high', 'low')),

  computation_version       integer           NOT NULL DEFAULT 1,

  created_at                timestamptz       NOT NULL DEFAULT now()
);

CREATE INDEX movement_events_type_idx
  ON movement_events (movement_type);
CREATE INDEX movement_events_game_player_market_idx
  ON movement_events (internal_game_id, internal_player_id, market_key)
  WHERE internal_game_id IS NOT NULL;
CREATE INDEX movement_events_bookmaker_idx
  ON movement_events (bookmaker_key)
  WHERE bookmaker_key IS NOT NULL;
CREATE INDEX movement_events_detected_at_idx
  ON movement_events (detected_at DESC);
CREATE INDEX movement_events_current_snapshot_idx
  ON movement_events (current_snapshot_id)
  WHERE current_snapshot_id IS NOT NULL;

COMMENT ON TABLE movement_events
  IS 'Append-only movement / disappearance log per Odds §17 / spec §13.1. Never UPDATE / DELETE.';
COMMENT ON COLUMN movement_events.confidence
  IS 'high when both snapshots succeeded; low when the edge involves an implicit omission.';

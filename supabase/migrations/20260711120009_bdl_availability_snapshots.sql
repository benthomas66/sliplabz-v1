-- ============================================================================
-- V1-2  Migration 21 : BDL availability snapshots + derived interpretation
--
-- Authority anchors:
--   BALLDONTLIE sub-spec §13 (current player availability)
--   BALLDONTLIE sub-spec §20 (current-availability lifecycle — interpretation
--     states: currently_reported, not_returned_latest_complete_snapshot,
--     stale_feed, unresolved_player, source_unavailable)
--   Complete spec §9.10 availability
--   Complete spec §11.3 availability_snapshots
--   Ticket V1-2 hard invariant: absence from an availability feed never
--     becomes "healthy"; it is its own lifecycle state.
--
-- Load-bearing invariants:
--   * One row per (ingestion_run_id, provider_player_id) captured from the
--     run. A player may appear in many runs.
--   * bdl_availability_current_state advances the derived interpretation
--     state only from COMPLETE runs. Partial/failed pulls never change
--     presence (BDL §20 explicit rule).
--   * The interpretation state `not_returned_latest_complete_snapshot` is
--     distinct from `currently_reported`. Absence is NEVER labeled "healthy".
-- ============================================================================

CREATE TABLE bdl_availability_snapshots (
  bdl_availability_snapshot_id  uuid          PRIMARY KEY DEFAULT gen_random_uuid(),

  bdl_ingestion_run_id          uuid          NOT NULL
                                              REFERENCES bdl_ingestion_runs(bdl_ingestion_run_id)
                                              ON UPDATE RESTRICT ON DELETE RESTRICT,

  raw_response_id               uuid          REFERENCES bdl_raw_responses(raw_response_id)
                                              ON UPDATE RESTRICT ON DELETE RESTRICT,

  provider_player_id            text          NOT NULL,

  -- Optional link to internal player when the reconciliation layer has an
  -- approved mapping; null otherwise (BDL §20 unresolved_player).
  internal_player_id            uuid          REFERENCES players(internal_player_id)
                                              ON UPDATE RESTRICT ON DELETE RESTRICT,

  -- Provider fields per §13.
  source_status                 text          NOT NULL DEFAULT '',
  source_comment                text          NOT NULL DEFAULT '',
  source_return_date_text       text          NOT NULL DEFAULT '',

  raw_payload                   jsonb         NOT NULL,

  content_hash                  text          NOT NULL,

  observed_at                   timestamptz   NOT NULL DEFAULT now(),

  created_at                    timestamptz   NOT NULL DEFAULT now(),

  UNIQUE (bdl_ingestion_run_id, provider_player_id)
);

CREATE INDEX bdl_availability_snapshots_player_idx
  ON bdl_availability_snapshots (provider_player_id, observed_at DESC);
CREATE INDEX bdl_availability_snapshots_internal_player_idx
  ON bdl_availability_snapshots (internal_player_id);
CREATE INDEX bdl_availability_snapshots_run_idx
  ON bdl_availability_snapshots (bdl_ingestion_run_id);
CREATE INDEX bdl_availability_snapshots_content_hash_idx
  ON bdl_availability_snapshots (content_hash);


-- ---------------------------------------------------------------------------
-- Derived current-availability interpretation state per BDL §20.
-- Advanced ONLY by ingestion runs whose completion_state = 'complete'.
-- ---------------------------------------------------------------------------
CREATE TABLE bdl_availability_current_state (
  provider_player_id            text          PRIMARY KEY,

  internal_player_id            uuid          REFERENCES players(internal_player_id)
                                              ON UPDATE RESTRICT ON DELETE RESTRICT,

  interpretation_state          availability_interpretation_state NOT NULL,

  -- Presence markers.
  first_seen_at                 timestamptz,
  last_seen_at                  timestamptz,
  observed_changed_at           timestamptz,
  last_absent_at                timestamptz,

  -- The run that most recently ADVANCED the interpretation state. Never
  -- advanced by a non-`complete` run.
  latest_complete_run_id        uuid          REFERENCES bdl_ingestion_runs(bdl_ingestion_run_id)
                                              ON UPDATE RESTRICT ON DELETE RESTRICT,

  latest_snapshot_id            uuid          REFERENCES bdl_availability_snapshots(bdl_availability_snapshot_id)
                                              ON UPDATE RESTRICT ON DELETE RESTRICT,

  latest_source_status          text          NOT NULL DEFAULT '',
  latest_source_comment         text          NOT NULL DEFAULT '',
  latest_source_return_date_text text         NOT NULL DEFAULT '',

  created_at                    timestamptz   NOT NULL DEFAULT now(),
  updated_at                    timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX bdl_availability_current_state_interpretation_idx
  ON bdl_availability_current_state (interpretation_state);
CREATE INDEX bdl_availability_current_state_internal_player_idx
  ON bdl_availability_current_state (internal_player_id);

COMMENT ON TABLE  bdl_availability_snapshots
  IS 'Per-run BDL availability observations. Immutable per (run, provider_player_id).';
COMMENT ON TABLE  bdl_availability_current_state
  IS 'Derived per-player availability interpretation state. Advanced ONLY by complete runs. See BDL §20.';

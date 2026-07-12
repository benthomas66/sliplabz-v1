-- ============================================================================
-- V1-2  Migration 17 : BDL active-player snapshots
--
-- Authority anchors:
--   BALLDONTLIE sub-spec §12A.7 (roster-snapshot storage: provider player ID,
--     current team ID, raw identity fields, raw team object, retrieval,
--     first-seen-active, last-seen-active, content hash, observed
--     team-assignment change)
--   BALLDONTLIE sub-spec §12A.4 (a player missing from a later completed
--     snapshot is marked not_seen_active; the record is NOT deleted)
--   BALLDONTLIE sub-spec §12A.4 (a partial or failed pull must NOT mark
--     absent players inactive)
--   Complete spec §9.8 active players
--
-- Load-bearing invariants:
--   * One row per (ingestion_run_id, provider_player_id).
--   * Absence-driven `not_seen_active` transitions are performed only after
--     an ingestion_run with completion_state = 'complete' completes. This
--     table stores the raw observation; the derived presence state lives in
--     bdl_active_player_presence.
-- ============================================================================

CREATE TABLE bdl_active_player_snapshots (
  bdl_active_player_snapshot_id  uuid          PRIMARY KEY DEFAULT gen_random_uuid(),

  bdl_ingestion_run_id           uuid          NOT NULL
                                               REFERENCES bdl_ingestion_runs(bdl_ingestion_run_id)
                                               ON UPDATE RESTRICT ON DELETE RESTRICT,

  raw_response_id                uuid          REFERENCES bdl_raw_responses(raw_response_id)
                                               ON UPDATE RESTRICT ON DELETE RESTRICT,

  provider_player_id             text          NOT NULL,

  -- Provider team ID at snapshot time. May be null when the provider
  -- omits a team object (BDL §12A audit found none such but the schema
  -- retains NULLability out of an abundance of caution).
  provider_team_id               text,

  raw_first_name                 text          NOT NULL DEFAULT '',
  raw_last_name                  text          NOT NULL DEFAULT '',
  raw_full_name                  text          NOT NULL DEFAULT '',

  -- Full raw provider active-player object.
  raw_payload                    jsonb         NOT NULL,

  content_hash                   text          NOT NULL,

  retrieved_at                   timestamptz   NOT NULL DEFAULT now(),
  first_seen_active_at           timestamptz   NOT NULL DEFAULT now(),
  last_seen_active_at            timestamptz   NOT NULL DEFAULT now(),
  observed_team_change_at        timestamptz,

  created_at                     timestamptz   NOT NULL DEFAULT now(),

  UNIQUE (bdl_ingestion_run_id, provider_player_id)
);

CREATE INDEX bdl_active_player_snapshots_player_idx
  ON bdl_active_player_snapshots (provider_player_id);
CREATE INDEX bdl_active_player_snapshots_run_idx
  ON bdl_active_player_snapshots (bdl_ingestion_run_id);
CREATE INDEX bdl_active_player_snapshots_team_idx
  ON bdl_active_player_snapshots (provider_team_id);
CREATE INDEX bdl_active_player_snapshots_retrieved_idx
  ON bdl_active_player_snapshots (retrieved_at DESC);

COMMENT ON TABLE  bdl_active_player_snapshots
  IS 'Per-run BDL active-player observations. Absence-driven transitions to not_seen_active happen only after a complete run. See BDL §12A.7.';


-- ---------------------------------------------------------------------------
-- Derived presence state. Advanced only when the source snapshot came from a
-- run with completion_state = 'complete'. A failed/partial run may not mark
-- a player not_seen_active (BDL §12A.4). Enforced in src/bdl/rosterSnapshot.ts.
-- ---------------------------------------------------------------------------
CREATE TABLE bdl_active_player_presence (
  provider_player_id        text          PRIMARY KEY,

  -- Latest observed presence in a COMPLETE snapshot.
  latest_complete_run_id    uuid          REFERENCES bdl_ingestion_runs(bdl_ingestion_run_id)
                                          ON UPDATE RESTRICT ON DELETE RESTRICT,

  -- true when present in the latest complete snapshot; false when absent.
  present_in_latest_complete boolean      NOT NULL DEFAULT false,

  first_seen_active_at      timestamptz,
  last_seen_active_at       timestamptz,
  last_marked_not_seen_at   timestamptz,

  -- Provider team ID at last observation (may drift across runs; used by
  -- reconciliation to schedule a team-change invalidation).
  latest_provider_team_id   text,

  created_at                timestamptz   NOT NULL DEFAULT now(),
  updated_at                timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX bdl_active_player_presence_present_idx
  ON bdl_active_player_presence (present_in_latest_complete);

COMMENT ON TABLE  bdl_active_player_presence
  IS 'Derived per-player active-roster presence, advanced ONLY by complete runs. See BDL §12A.4.';

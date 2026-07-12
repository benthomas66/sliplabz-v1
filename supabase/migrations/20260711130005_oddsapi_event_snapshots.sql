-- ============================================================================
-- V1-3  Migration 29 : Odds API event snapshots + derived event presence
--
-- Authority anchors:
--   Odds API sub-spec §4 (events endpoint audit)
--   Odds API sub-spec §5 (six-event slate universe)
--   Odds API sub-spec §7 (event discovery and lifecycle: first_seen,
--     last_seen, active-in-provider-feed flag, raw payload hash)
--   Odds API sub-spec §17 (disappearance contract)
--   Complete spec §11.4 (provider events)
--   Ticket V1-3 hard invariant: current-poll snapshots carry provenance
--     suitable for V1-4 current/historical isolation (self_observed only).
--
-- Load-bearing invariants:
--   * One event snapshot row per (ingestion_run, provider_event_id).
--   * `bdl_active_in_provider_feed` transitions only after a `complete`
--     event-discovery run (mirrors BDL §12A.4 pattern from V1-2).
--   * `linked_internal_game_id` and `linked_provider_game_row_id` are
--     populated by the reconciliation adapter (src/odds/eventReconciliationAdapter.ts).
--   * A single omission is `single_omission`; two consecutive omissions
--     is `confirmed_removed` (§17 / spec §13.3).
-- ============================================================================

CREATE TABLE oddsapi_event_snapshots (
  oddsapi_event_snapshot_id    uuid                        PRIMARY KEY DEFAULT gen_random_uuid(),

  oddsapi_ingestion_run_id     uuid                        NOT NULL
                                                           REFERENCES oddsapi_ingestion_runs(oddsapi_ingestion_run_id)
                                                           ON UPDATE RESTRICT ON DELETE RESTRICT,

  raw_response_id              uuid                        REFERENCES oddsapi_raw_responses(oddsapi_raw_response_id)
                                                           ON UPDATE RESTRICT ON DELETE RESTRICT,

  provider_event_id            text                        NOT NULL,

  raw_sport_key                text                        NOT NULL DEFAULT '',
  raw_sport_title              text                        NOT NULL DEFAULT '',
  raw_home_team                text                        NOT NULL DEFAULT '',
  raw_away_team                text                        NOT NULL DEFAULT '',
  raw_commence_time            timestamptz,

  raw_payload                  jsonb                       NOT NULL,
  content_hash                 text                        NOT NULL,

  observed_at                  timestamptz                 NOT NULL DEFAULT now(),

  -- Reconciliation results — populated by the reconciliation adapter after
  -- the V1-1 reconcileEvent path returns. NULL when unresolved / quarantined.
  linked_internal_game_id      uuid                        REFERENCES games(internal_game_id)
                                                           ON UPDATE RESTRICT ON DELETE RESTRICT,
  linked_provider_game_row_id  uuid                        REFERENCES provider_games(provider_game_row_id)
                                                           ON UPDATE RESTRICT ON DELETE RESTRICT,

  created_at                   timestamptz                 NOT NULL DEFAULT now(),

  UNIQUE (oddsapi_ingestion_run_id, provider_event_id)
);

CREATE INDEX oddsapi_event_snapshots_event_idx
  ON oddsapi_event_snapshots (provider_event_id);
CREATE INDEX oddsapi_event_snapshots_run_idx
  ON oddsapi_event_snapshots (oddsapi_ingestion_run_id);
CREATE INDEX oddsapi_event_snapshots_commence_idx
  ON oddsapi_event_snapshots (raw_commence_time);
CREATE INDEX oddsapi_event_snapshots_linked_idx
  ON oddsapi_event_snapshots (linked_internal_game_id)
  WHERE linked_internal_game_id IS NOT NULL;


-- ---------------------------------------------------------------------------
-- Derived per-event presence state per §17.
-- Advanced ONLY by complete (or successful_empty) event-discovery runs.
-- ---------------------------------------------------------------------------
CREATE TABLE oddsapi_event_presence (
  provider_event_id                text                        PRIMARY KEY,

  latest_complete_run_id           uuid                        REFERENCES oddsapi_ingestion_runs(oddsapi_ingestion_run_id)
                                                               ON UPDATE RESTRICT ON DELETE RESTRICT,

  presence_state                   event_presence_state        NOT NULL DEFAULT 'currently_returned',

  first_seen_at                    timestamptz,
  last_seen_at                     timestamptz,
  observed_changed_at              timestamptz,

  consecutive_omission_count       integer                     NOT NULL DEFAULT 0,
  CHECK (consecutive_omission_count >= 0),

  last_observed_snapshot_id        uuid                        REFERENCES oddsapi_event_snapshots(oddsapi_event_snapshot_id)
                                                               ON UPDATE RESTRICT ON DELETE RESTRICT,

  linked_internal_game_id          uuid                        REFERENCES games(internal_game_id)
                                                               ON UPDATE RESTRICT ON DELETE RESTRICT,

  created_at                       timestamptz                 NOT NULL DEFAULT now(),
  updated_at                       timestamptz                 NOT NULL DEFAULT now()
);

CREATE INDEX oddsapi_event_presence_state_idx
  ON oddsapi_event_presence (presence_state);

COMMENT ON TABLE  oddsapi_event_snapshots
  IS 'Per event-discovery-run observation of Odds API event universe. Immutable per (run, provider_event_id).';
COMMENT ON TABLE  oddsapi_event_presence
  IS 'Derived per-event presence lifecycle. Advanced only by complete runs. See Odds §17 / spec §13.3.';

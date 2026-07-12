-- ============================================================================
-- V1-3  Migration 30 : market snapshots
--
-- Authority anchors:
--   Odds API sub-spec §10.7 (response hierarchy: event → bookmaker → market → outcome)
--   Odds API sub-spec §10.10 (last_update stored separately from observed_at)
--   Odds API sub-spec §14.5 (market-level last_update)
--   Odds API sub-spec §15.2 (normalized market snapshot: synthetic
--     market_snapshot_id; unique on (ingestion_run_id, provider_event_id,
--     bookmaker_key, market_key); provider timestamps are attributes)
--   Odds API sub-spec §16.1 (current snapshot selection)
--   Odds API sub-spec §19.2 (freshness states)
--   Odds API sub-spec §20 (schema drift preserves raw body, quarantines)
--   Complete spec §11.4 market_snapshots
--   Ticket V1-3 hard invariants:
--     - Current-poll snapshots carry provenance suitable for V1-4
--       (current_poll + self_observed only in V1-3);
--     - Empty success and failed poll produce distinguishable stored states;
--     - Schema drift quarantines with the raw payload preserved.
--
-- Load-bearing invariants:
--   * UNIQUE (ingestion_run_id, provider_event_id, bookmaker_key, market_key)
--     per spec §11.4 / Odds §15.2.
--   * `provider_last_update` is a plain nullable attribute — NEVER coerced
--     into a composite key member.
--   * `schema_state` distinguishes valid / valid_empty / schema_drift.
--   * `request_kind` is `current_poll` for V1-3; `historical_query` reserved
--     for V1-4b — enforced by CHECK so a mis-wired writer cannot leak.
-- ============================================================================

CREATE TABLE market_snapshots (
  market_snapshot_id           uuid                        PRIMARY KEY DEFAULT gen_random_uuid(),

  oddsapi_ingestion_run_id     uuid                        NOT NULL
                                                           REFERENCES oddsapi_ingestion_runs(oddsapi_ingestion_run_id)
                                                           ON UPDATE RESTRICT ON DELETE RESTRICT,

  raw_response_id              uuid                        REFERENCES oddsapi_raw_responses(oddsapi_raw_response_id)
                                                           ON UPDATE RESTRICT ON DELETE RESTRICT,

  -- Odds API identity for the event this snapshot belongs to; provider text.
  provider_event_id            text                        NOT NULL,

  -- Linked internal game ID; populated after event reconciliation. NULL
  -- while unresolved / quarantined.
  linked_internal_game_id      uuid                        REFERENCES games(internal_game_id)
                                                           ON UPDATE RESTRICT ON DELETE RESTRICT,

  bookmaker_key                text                        NOT NULL
                                                           REFERENCES bookmaker_registry(provider_key)
                                                           ON UPDATE RESTRICT ON DELETE RESTRICT,
  bookmaker_title              text                        NOT NULL DEFAULT '',
  source_class                 source_class                NOT NULL,

  market_key                   text                        NOT NULL
                                                           REFERENCES market_registry(provider_key)
                                                           ON UPDATE RESTRICT ON DELETE RESTRICT,

  request_kind                 oddsapi_request_kind        NOT NULL,
  provenance                   oddsapi_provenance          NOT NULL,

  -- V1-3 writes ONLY (current_poll, self_observed).
  CHECK ( request_kind = 'event_discovery'
       OR request_kind = 'historical_query'
       OR (request_kind = 'current_poll' AND provenance = 'self_observed') ),
  CHECK ( request_kind <> 'historical_query' OR provenance = 'backfilled_historical' ),

  -- Provider timestamps per §10.10 / §14.5. `provider_last_update` is
  -- market-level; `provider_snapshot_time` populates for historical queries.
  provider_last_update         timestamptz,
  provider_snapshot_time       timestamptz,

  retrieved_at                 timestamptz                 NOT NULL DEFAULT now(),

  -- Current-poll observation time. NULL for historical queries.
  observed_at                  timestamptz,
  CHECK ( request_kind <> 'current_poll' OR observed_at IS NOT NULL ),

  freshness_state              freshness_state             NOT NULL DEFAULT 'unavailable',
  schema_state                 snapshot_schema_state       NOT NULL DEFAULT 'unresolved',

  -- Raw outcome tallies observed on this snapshot BEFORE dedup / offering
  -- collapse. Preserved so V1-5 / operators can walk back to the raw view.
  raw_outcome_row_count        integer                     NOT NULL DEFAULT 0,
  duplicate_group_count        integer                     NOT NULL DEFAULT 0,
  conflict_group_count         integer                     NOT NULL DEFAULT 0,

  created_at                   timestamptz                 NOT NULL DEFAULT now(),
  updated_at                   timestamptz                 NOT NULL DEFAULT now(),

  UNIQUE (oddsapi_ingestion_run_id, provider_event_id, bookmaker_key, market_key)
);

CREATE INDEX market_snapshots_run_idx           ON market_snapshots (oddsapi_ingestion_run_id);
CREATE INDEX market_snapshots_event_idx         ON market_snapshots (provider_event_id);
CREATE INDEX market_snapshots_internal_game_idx ON market_snapshots (linked_internal_game_id)
  WHERE linked_internal_game_id IS NOT NULL;
CREATE INDEX market_snapshots_book_market_idx   ON market_snapshots (bookmaker_key, market_key);
CREATE INDEX market_snapshots_source_class_idx  ON market_snapshots (source_class);
CREATE INDEX market_snapshots_freshness_idx     ON market_snapshots (freshness_state);
CREATE INDEX market_snapshots_schema_state_idx  ON market_snapshots (schema_state);
CREATE INDEX market_snapshots_observed_idx      ON market_snapshots (observed_at DESC)
  WHERE observed_at IS NOT NULL;
CREATE INDEX market_snapshots_provider_last_update_idx
  ON market_snapshots (provider_last_update DESC)
  WHERE provider_last_update IS NOT NULL;

COMMENT ON TABLE  market_snapshots
  IS 'One snapshot per (run, event, bookmaker, market). Preserves raw counts before duplicate collapse. See Odds §15.2.';
COMMENT ON COLUMN market_snapshots.request_kind
  IS 'V1-3 writes current_poll only; historical_query reserved for V1-4b (Odds §15.2, complete spec §11.4).';
COMMENT ON COLUMN market_snapshots.provider_last_update
  IS 'Provider market-level last_update per Odds §14.5. Stored as attribute, not composite-key member.';

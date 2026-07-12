-- ============================================================================
-- V1-3  Migration 33 : Odds API quarantine (schema drift + snapshot-level)
--
-- Authority anchors:
--   Odds API sub-spec §10.5 rule 5 (conflicting duplicates quarantine)
--   Odds API sub-spec §10.14 (missing-data policy)
--   Odds API sub-spec §13.7 (invalid market 422 handling)
--   Odds API sub-spec §20 (schema drift preserves raw body, quarantines)
--   Complete spec §15 (freshness / failures / degraded modes)
--   Ticket V1-3 hard invariant: schema drift (HTTP 200 with an invalid
--     body) quarantines with the raw payload preserved.
--
-- Load-bearing invariants:
--   * Every quarantine row references the raw_response_id and the
--     ingestion_run_id so evidence walk-back is always possible.
--   * `reason` distinguishes schema-drift, missing-required-field, or a
--     conflict summary that snapshots or offerings could not resolve.
--   * Append-only in intent: no `updated_at`; consumers write `resolution`
--     via a new row rather than mutating.
-- ============================================================================

CREATE TABLE oddsapi_quarantine (
  oddsapi_quarantine_id        uuid                        PRIMARY KEY DEFAULT gen_random_uuid(),

  oddsapi_ingestion_run_id     uuid                        NOT NULL
                                                           REFERENCES oddsapi_ingestion_runs(oddsapi_ingestion_run_id)
                                                           ON UPDATE RESTRICT ON DELETE RESTRICT,

  raw_response_id              uuid                        REFERENCES oddsapi_raw_responses(oddsapi_raw_response_id)
                                                           ON UPDATE RESTRICT ON DELETE RESTRICT,

  -- Optional link to the specific market snapshot the quarantine belongs to;
  -- NULL when the quarantine is at the response level (e.g. HTTP 200 with a
  -- body that failed schema validation entirely).
  market_snapshot_id           uuid                        REFERENCES market_snapshots(market_snapshot_id)
                                                           ON UPDATE RESTRICT ON DELETE RESTRICT,

  provider_event_id            text,
  bookmaker_key                text,
  market_key                   text,

  -- Approved reasons. Text-with-CHECK because the taxonomy is broader
  -- than a single enum can capture at this stage and additions land as a
  -- CHECK expansion migration.
  reason                       text                        NOT NULL,
  CHECK (reason IN (
    'schema_drift_http_200',
    'missing_bookmakers_array',
    'missing_markets_array',
    'missing_outcomes_array',
    'missing_last_update',
    'missing_price',
    'missing_point',
    'missing_player_description',
    'missing_side',
    'unexpected_field_shape',
    'conflicting_outcomes',
    'unallowlisted_bookmaker_key',
    'unlaunched_market_key',
    'duplicate_event_id',
    'missing_event_id',
    'invalid_market_response_422'
  )),

  reason_detail                text                        NOT NULL DEFAULT '',

  -- Verbatim provider payload snippet involved in the quarantine.
  raw_payload                  jsonb                       NOT NULL,

  observed_at                  timestamptz                 NOT NULL DEFAULT now(),

  created_at                   timestamptz                 NOT NULL DEFAULT now()
);

CREATE INDEX oddsapi_quarantine_run_idx     ON oddsapi_quarantine (oddsapi_ingestion_run_id);
CREATE INDEX oddsapi_quarantine_reason_idx  ON oddsapi_quarantine (reason);
CREATE INDEX oddsapi_quarantine_event_idx   ON oddsapi_quarantine (provider_event_id)
  WHERE provider_event_id IS NOT NULL;
CREATE INDEX oddsapi_quarantine_snapshot_idx ON oddsapi_quarantine (market_snapshot_id)
  WHERE market_snapshot_id IS NOT NULL;

COMMENT ON TABLE  oddsapi_quarantine
  IS 'Append-only Odds API quarantine records. Every row references the raw response and ingestion run.';

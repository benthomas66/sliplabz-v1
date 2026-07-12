-- ============================================================================
-- V1-3  Migration 27 : Odds API ingestion runs
--
-- Authority anchors:
--   Odds API sub-spec §8 (quota headers)
--   Odds API sub-spec §13.8 (quota forecasting contract)
--   Odds API sub-spec §15.1 (raw captures — every request creates an
--     immutable ingestion record)
--   Odds API sub-spec §19.3 (failure behavior; retain last valid data)
--   Odds API sub-spec §20 (error and retry matrix)
--   Complete spec §11.4 (odds ingestion runs)
--   Ticket V1-3 hard invariants:
--     - a successful-but-empty response and a failed poll produce
--       distinguishable stored states;
--     - the quota forecast must reconcile against the response headers;
--       divergence is recorded, never ignored.
--
-- Load-bearing invariants:
--   * Every request — successful, failed, or empty — creates exactly one
--     ingestion-run row.
--   * `result_state` is enum-typed and captures the distinction between
--     `successful_empty` and every failure class; complete spec §10.10
--     requires the two to be structurally distinct.
--   * `quota_forecast` / `quota_observed` / `quota_delta_flag` are the
--     reconciliation record. `x-requests-last` is authoritative; a
--     divergence sets the delta flag but never silently rewrites the forecast.
-- ============================================================================

CREATE TABLE oddsapi_ingestion_runs (
  oddsapi_ingestion_run_id     uuid                        PRIMARY KEY DEFAULT gen_random_uuid(),

  request_kind                 oddsapi_request_kind        NOT NULL,
  endpoint                     oddsapi_endpoint            NOT NULL,

  -- Which Odds API event this request was scoped to; NULL for the free
  -- events discovery endpoint.
  requested_provider_event_id  text,

  -- Requested market keys / bookmaker keys / regions / effective time,
  -- preserved as jsonb for query flexibility.
  requested_market_keys        jsonb                       NOT NULL DEFAULT '[]'::jsonb,
  requested_bookmaker_keys     jsonb                       NOT NULL DEFAULT '[]'::jsonb,
  requested_regions            jsonb                       NOT NULL DEFAULT '[]'::jsonb,
  requested_effective_time     timestamptz,

  -- Sanitized request parameters (never carries apiKey).
  request_params               jsonb                       NOT NULL DEFAULT '{}'::jsonb,

  -- Redacted request URL per Odds §4.1, §14.1. The `apiKey` query
  -- parameter MUST be replaced with `REDACTED` before this column is populated.
  redacted_request_url         text,

  started_at                   timestamptz                 NOT NULL DEFAULT now(),
  completed_at                 timestamptz,

  http_status_last             integer,
  content_type_last            text,

  -- Retained non-sensitive headers; MUST include the three quota headers
  -- when they were present on the response.
  response_headers_last        jsonb                       NOT NULL DEFAULT '{}'::jsonb,

  -- Terminal state per Odds §20 + §10.10 successful-empty separation.
  result_state                 oddsapi_run_state           NOT NULL DEFAULT 'running',
  failure_detail               text,

  -- Documenting invariant: a running run has no completed_at; every terminal
  -- run has completed_at set at close.
  CHECK ( (result_state = 'running' AND completed_at IS NULL)
       OR (result_state <> 'running' AND completed_at IS NOT NULL) ),

  -- Quota accounting. NULL when the request never reached a response
  -- boundary (transport failure before parsing quota headers).
  quota_forecast               integer,
  quota_observed               integer,
  quota_delta_flag             quota_delta_flag,

  -- Ratel-limit state observed from response headers (denormalized from
  -- response_headers_last for query hygiene).
  x_requests_used              integer,
  x_requests_remaining         integer,
  x_requests_last              integer,

  parser_version               integer                     NOT NULL DEFAULT 1,
  normalization_version        integer                     NOT NULL DEFAULT 1,

  created_at                   timestamptz                 NOT NULL DEFAULT now(),
  updated_at                   timestamptz                 NOT NULL DEFAULT now()
);

CREATE INDEX oddsapi_ingestion_runs_kind_idx       ON oddsapi_ingestion_runs (request_kind);
CREATE INDEX oddsapi_ingestion_runs_endpoint_idx   ON oddsapi_ingestion_runs (endpoint);
CREATE INDEX oddsapi_ingestion_runs_result_idx     ON oddsapi_ingestion_runs (result_state);
CREATE INDEX oddsapi_ingestion_runs_event_idx      ON oddsapi_ingestion_runs (requested_provider_event_id)
  WHERE requested_provider_event_id IS NOT NULL;
CREATE INDEX oddsapi_ingestion_runs_started_idx    ON oddsapi_ingestion_runs (started_at DESC);
CREATE INDEX oddsapi_ingestion_runs_completed_idx  ON oddsapi_ingestion_runs (completed_at DESC)
  WHERE completed_at IS NOT NULL;

COMMENT ON TABLE  oddsapi_ingestion_runs
  IS 'One row per Odds API request — successful, empty, or failed. Retained forever. See Odds §15.1.';
COMMENT ON COLUMN oddsapi_ingestion_runs.result_state
  IS 'Distinguishes successful_empty from every failure class per Odds §10.10 / §20.';
COMMENT ON COLUMN oddsapi_ingestion_runs.redacted_request_url
  IS 'API key REDACTED before persistence per Odds §14.1 / §22.';
COMMENT ON COLUMN oddsapi_ingestion_runs.quota_delta_flag
  IS 'Forecast vs observed reconciliation per Odds §13.8. Divergence is recorded, never ignored.';

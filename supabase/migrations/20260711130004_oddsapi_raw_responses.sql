-- ============================================================================
-- V1-3  Migration 28 : Odds API immutable raw responses
--
-- Authority anchors:
--   Odds API sub-spec §15.1 (raw response bodies are retained; failed parse
--     does NOT destroy the raw body)
--   Odds API sub-spec §20 (schema drift row: HTTP 200 with invalid body —
--     preserve raw body; quarantine; alert)
--   Odds API sub-spec §22 (API keys are server-side secrets; query strings
--     redacted before logging)
--   Complete spec §11.4 (odds ingestion runs + raw response references)
--   Ticket V1-3 hard invariant: raw snapshots are retained BEFORE duplicate
--     collapse and BEFORE any product normalization.
--
-- Load-bearing invariants:
--   * ONE row per ingestion-run (event odds and event discovery are single
--     requests, unlike BDL's cursor pagination).
--   * Immutable in intent: no `updated_at`.
--   * `response_body` (jsonb) is populated only when the response parses;
--     `response_body_text` retains the raw text for schema-drift and
--     content-type-non-json responses.
-- ============================================================================

CREATE TABLE oddsapi_raw_responses (
  oddsapi_raw_response_id      uuid                        PRIMARY KEY DEFAULT gen_random_uuid(),

  oddsapi_ingestion_run_id     uuid                        NOT NULL
                                                           REFERENCES oddsapi_ingestion_runs(oddsapi_ingestion_run_id)
                                                           ON UPDATE RESTRICT ON DELETE RESTRICT,

  retrieved_at                 timestamptz                 NOT NULL DEFAULT now(),

  http_status                  integer                     NOT NULL,
  content_type                 text,

  response_headers             jsonb                       NOT NULL DEFAULT '{}'::jsonb,

  response_body                jsonb,
  response_body_text           text,
  response_body_bytes          integer,

  -- Retained diagnostic identifiers per Odds §9 / §22.
  provider_request_id          text,
  trace_id                     text,

  created_at                   timestamptz                 NOT NULL DEFAULT now()

  -- Deliberately no updated_at.
);

CREATE UNIQUE INDEX oddsapi_raw_responses_run_unique
  ON oddsapi_raw_responses (oddsapi_ingestion_run_id);
CREATE INDEX oddsapi_raw_responses_retrieved_idx
  ON oddsapi_raw_responses (retrieved_at DESC);

COMMENT ON TABLE  oddsapi_raw_responses
  IS 'Immutable raw response payload per Odds ingestion run. Never UPDATE / DELETE / TRUNCATE.';
COMMENT ON COLUMN oddsapi_raw_responses.response_body
  IS 'Parsed JSON body when content-type indicated JSON. NULL for non-JSON responses.';
COMMENT ON COLUMN oddsapi_raw_responses.response_body_text
  IS 'Raw response text preserved verbatim (Odds §15.1: failed parse does not destroy the raw body).';

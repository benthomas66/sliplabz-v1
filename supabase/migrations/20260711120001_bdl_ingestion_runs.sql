-- ============================================================================
-- V1-2  Migration 13 : BDL ingestion runs
--
-- Authority anchors:
--   BALLDONTLIE sub-spec §5 (pagination contract)
--   BALLDONTLIE sub-spec §14 (raw-data retention)
--   BALLDONTLIE sub-spec §15A (error-response contracts)
--   BALLDONTLIE sub-spec §19.1 (ingestion run contract)
--   Complete spec §9.2 (partial traversal cannot advance watermark)
--
-- Load-bearing invariants:
--   * One row per ingestion attempt. Attempts are never deleted;
--     failed and partial runs are retained for diagnosis (BDL §19.1).
--   * `completion_state = 'complete'` is the ONLY state that may advance
--     an import watermark (BDL §19.1 last paragraph, complete spec §9.2).
--     Enforcement lives in the watermark table's advancement code path,
--     not a trigger; the constraint here is a documenting invariant.
--   * `cursor_chain` retains every provider cursor observed and every
--     cursor SlipLabz sent, in exact order. NOT reconstructed after the run.
--   * Response headers are stored on the run (last-observed headers) for
--     x-ratelimit-* auditability (BDL §15A.4).
-- ============================================================================

CREATE TABLE bdl_ingestion_runs (
  bdl_ingestion_run_id  uuid              PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Endpoint per BDL §3.
  endpoint              bdl_endpoint      NOT NULL,

  -- Sanitized request parameters. Never includes the Authorization header
  -- or any credential. Stored as jsonb for query-side filtering.
  request_params        jsonb             NOT NULL DEFAULT '{}'::jsonb,

  -- Query scope key. Anchors the watermark that a `complete` run advances.
  -- Examples: 'all', 'season=2026', 'game_ids=24752'. Watermark keys are
  -- application-defined text; no schema enum limits them because operators
  -- may issue targeted reconciliation pulls that would otherwise require a
  -- schema change per query shape.
  query_scope_key       text              NOT NULL,

  started_at            timestamptz       NOT NULL DEFAULT now(),
  completed_at          timestamptz,

  -- Row and page tallies observed at run completion.
  page_count            integer           NOT NULL DEFAULT 0,
  row_count             integer           NOT NULL DEFAULT 0,

  -- Cursor chain preserved verbatim. Each element is the exact opaque
  -- provider cursor SlipLabz sent (or `null` for the first page).
  -- BDL §5: cursors are provider tokens; SlipLabz never derives them.
  cursor_chain_sent     jsonb             NOT NULL DEFAULT '[]'::jsonb,
  cursor_chain_returned jsonb             NOT NULL DEFAULT '[]'::jsonb,

  -- Last observed HTTP status (0 when transport failed before response).
  http_status_last      integer,

  -- Last observed content type and headers (for parse-and-audit safety per
  -- BDL §15A.3). Selected headers only — never the Authorization header.
  content_type_last     text,
  response_headers_last jsonb             NOT NULL DEFAULT '{}'::jsonb,

  -- Terminal completion state per BDL §19.1.
  completion_state      bdl_run_state     NOT NULL DEFAULT 'running',

  -- Documenting invariant. A `running` run should have no completed_at;
  -- every terminal state must have a completed_at set at close.
  CHECK ( (completion_state = 'running' AND completed_at IS NULL)
       OR (completion_state <> 'running' AND completed_at IS NOT NULL) ),

  -- Free-text detail for terminal states other than `complete` (e.g.
  -- '401 without WNBA tier access', '429 with retry-after=60'). Never
  -- contains the API key or the Authorization header value.
  failure_detail        text,

  -- Normalization/computation version this run's derivations were computed
  -- against. Matches src/bdl/versions.ts.
  normalization_version integer           NOT NULL DEFAULT 1,

  created_at            timestamptz       NOT NULL DEFAULT now(),
  updated_at            timestamptz       NOT NULL DEFAULT now()
);

CREATE INDEX bdl_ingestion_runs_endpoint_idx     ON bdl_ingestion_runs (endpoint);
CREATE INDEX bdl_ingestion_runs_scope_key_idx    ON bdl_ingestion_runs (query_scope_key);
CREATE INDEX bdl_ingestion_runs_state_idx        ON bdl_ingestion_runs (completion_state);
CREATE INDEX bdl_ingestion_runs_started_at_idx   ON bdl_ingestion_runs (started_at DESC);
CREATE INDEX bdl_ingestion_runs_completed_at_idx ON bdl_ingestion_runs (completed_at DESC)
  WHERE completed_at IS NOT NULL;

COMMENT ON TABLE  bdl_ingestion_runs                     IS 'One row per BDL ingestion attempt. Retained forever including failures.';
COMMENT ON COLUMN bdl_ingestion_runs.completion_state    IS 'Only `complete` may advance an import watermark. See BDL §19.1.';
COMMENT ON COLUMN bdl_ingestion_runs.cursor_chain_sent   IS 'Exact opaque cursors SlipLabz sent, in order. Cursor never derived (BDL §5).';
COMMENT ON COLUMN bdl_ingestion_runs.cursor_chain_returned IS 'Exact provider `meta.next_cursor` values observed, in order.';
COMMENT ON COLUMN bdl_ingestion_runs.request_params      IS 'Sanitized parameters. Never carries the API key.';

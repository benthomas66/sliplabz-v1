-- ============================================================================
-- V1-2  Migration 14 : BDL raw response references
--
-- Authority anchors:
--   BALLDONTLIE sub-spec §14 (raw-data retention: raw payload or immutable
--     retrievable representation for every normalized row)
--   BALLDONTLIE sub-spec §19.1 (raw-response references field on the run)
--   Complete spec §21.6 (raw preservation — no normalization ticket may
--     discard raw source evidence)
--   Ticket V1-2 hard invariant: raw provider payload references are immutable
--     and traceable from every derived row.
--
-- Load-bearing invariants:
--   * Every raw response row is immutable in intent. This table has no
--     UPDATE code path in V1-2 modules. The schema documents that intent
--     via a static-lint check in tests/migrations/schemaShape.test.ts.
--   * Every derived row (player_game_stats, bdl_active_player_snapshots,
--     etc.) MUST reference a raw_response_id or the ingestion_run_id.
--   * Response bodies are stored as jsonb when the response is JSON. When
--     the provider returned a non-JSON body (BDL §15A.2 401 plain text),
--     the raw text is retained in response_body_text and response_body is
--     `null`. That distinction is load-bearing per BDL §15A.3.
-- ============================================================================

CREATE TABLE bdl_raw_responses (
  raw_response_id       uuid           PRIMARY KEY DEFAULT gen_random_uuid(),

  bdl_ingestion_run_id  uuid           NOT NULL
                                       REFERENCES bdl_ingestion_runs(bdl_ingestion_run_id)
                                       ON UPDATE RESTRICT ON DELETE RESTRICT,

  -- 0-indexed page position within the run's cursor traversal.
  page_index            integer        NOT NULL,
  CHECK (page_index >= 0),

  -- The exact cursor SlipLabz sent to obtain this page. `null` for the
  -- first page of a paginated endpoint. Preserved as text to keep the raw
  -- opaque cursor characters intact (BDL §5).
  cursor_used_to_fetch  text,

  -- The exact `meta.next_cursor` returned in this response, `null` when
  -- exhausted or when the endpoint is not paginated.
  cursor_returned_next  text,

  -- Retrieval timestamp per BDL §14 and §19.1.
  retrieved_at          timestamptz    NOT NULL DEFAULT now(),

  -- HTTP status code observed. 0 when the request never reached a
  -- response boundary (transport failure).
  http_status           integer        NOT NULL,

  -- The response's Content-Type header, as observed. Content-type
  -- awareness is load-bearing per BDL §15A.3.
  content_type          text,

  -- Selected non-sensitive response headers. Rate-limit headers per
  -- BDL §15A.4 are always retained when present.
  response_headers      jsonb          NOT NULL DEFAULT '{}'::jsonb,

  -- Parsed JSON body when the response was JSON. `null` when the response
  -- had no body, was empty, or parsed as non-JSON.
  response_body         jsonb,

  -- Raw response text when JSON parsing was skipped or failed. Used to
  -- retain BDL's 401 plain-text `Unauthorized` responses (BDL §15A.2).
  response_body_text    text,

  -- Byte length of the raw body observed on the wire. Used for future
  -- ingestion-health metrics and to sanity-check truncation.
  response_body_bytes   integer,

  -- Row count observed in the parsed body's `data` array, when applicable.
  observed_row_count    integer,

  created_at            timestamptz    NOT NULL DEFAULT now()

  -- Deliberately no updated_at. Rows are immutable in intent.
);

-- One page-index per run.
CREATE UNIQUE INDEX bdl_raw_responses_run_page_unique
  ON bdl_raw_responses (bdl_ingestion_run_id, page_index);

CREATE INDEX bdl_raw_responses_run_idx        ON bdl_raw_responses (bdl_ingestion_run_id);
CREATE INDEX bdl_raw_responses_retrieved_idx  ON bdl_raw_responses (retrieved_at DESC);

COMMENT ON TABLE  bdl_raw_responses                 IS 'Immutable per-page raw provider response references. Never UPDATE, DELETE, or TRUNCATE.';
COMMENT ON COLUMN bdl_raw_responses.cursor_used_to_fetch    IS 'The exact opaque cursor SlipLabz sent to obtain this page. NULL on first page.';
COMMENT ON COLUMN bdl_raw_responses.cursor_returned_next    IS 'meta.next_cursor exactly as returned. Never derived. See BDL §5.';
COMMENT ON COLUMN bdl_raw_responses.response_body_text      IS 'Raw text body preserved when response was non-JSON (BDL §15A.2 401 plain text).';

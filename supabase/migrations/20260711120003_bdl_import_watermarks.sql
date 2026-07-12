-- ============================================================================
-- V1-2  Migration 15 : BDL import watermarks
--
-- Authority anchors:
--   BALLDONTLIE sub-spec §19.4 (complete-import watermarks maintained per
--     endpoint and query scope)
--   BALLDONTLIE sub-spec §19.1 (partial or failed run may not advance a
--     complete-import watermark)
--   Complete spec §9.2 (partial traversal cannot advance watermark)
--   Ticket V1-2 hard invariant: partial imports never advance completeness
--     watermarks.
--
-- Load-bearing invariants:
--   * ONE watermark per (endpoint, query_scope_key). PRIMARY KEY enforces it.
--   * `completed_at` and `completed_by_run_id` are advanced together and
--     only when the referenced run's completion_state = 'complete'.
--     Enforcement lives in the application code (src/bdl/watermark.ts) so
--     the constraint here documents the invariant.
--   * A season-to-date watermark does NOT mean the eventual season is
--     complete (BDL §19.4 explicit note).
--   * `completed_by_run_id` FK is to a complete run. Nothing prevents a
--     later `complete` run of the same scope from overwriting the prior;
--     `previous_completed_at` and `previous_completed_by_run_id` retain
--     the last superseded state for audit.
-- ============================================================================

CREATE TABLE bdl_import_watermarks (
  endpoint                    bdl_endpoint  NOT NULL,

  -- Scope key must match the ingestion run's query_scope_key that
  -- advances it. Free-form text; examples: 'all', 'season=2026',
  -- 'game_ids=24752'.
  query_scope_key             text          NOT NULL,

  -- Timestamp of the most recent SUCCESSFUL complete run.
  completed_at                timestamptz,

  -- The run that advanced the watermark. NULL when never advanced.
  completed_by_run_id         uuid
                              REFERENCES bdl_ingestion_runs(bdl_ingestion_run_id)
                              ON UPDATE RESTRICT ON DELETE RESTRICT,

  -- The row and page tallies observed at the advancing run's completion.
  completed_row_count         integer,
  completed_page_count        integer,

  -- The previous complete-run state, retained for audit.
  previous_completed_at       timestamptz,
  previous_completed_by_run_id uuid
                              REFERENCES bdl_ingestion_runs(bdl_ingestion_run_id)
                              ON UPDATE RESTRICT ON DELETE RESTRICT,

  created_at                  timestamptz   NOT NULL DEFAULT now(),
  updated_at                  timestamptz   NOT NULL DEFAULT now(),

  -- One watermark per endpoint × scope key.
  PRIMARY KEY (endpoint, query_scope_key),

  -- Documenting invariant. When completed_at is present, so must the run.
  CHECK ( (completed_at IS NULL AND completed_by_run_id IS NULL)
       OR (completed_at IS NOT NULL AND completed_by_run_id IS NOT NULL) ),

  -- Never rewind a watermark by explicit CHECK: completed_at must be
  -- greater than or equal to previous_completed_at when previous is set.
  CHECK ( previous_completed_at IS NULL
       OR completed_at IS NULL
       OR completed_at >= previous_completed_at )
);

CREATE INDEX bdl_import_watermarks_completed_by_idx
  ON bdl_import_watermarks (completed_by_run_id) WHERE completed_by_run_id IS NOT NULL;

COMMENT ON TABLE  bdl_import_watermarks
  IS 'One watermark per (endpoint, query_scope_key). Advanced only by ingestion runs whose completion_state = ''complete''. See BDL §19.4 / complete spec §9.2.';
COMMENT ON COLUMN bdl_import_watermarks.completed_at
  IS 'Timestamp of the most recent successful complete run. NULL until first complete run.';
COMMENT ON COLUMN bdl_import_watermarks.previous_completed_at
  IS 'Retained for audit; never rewound past the most recent completion.';

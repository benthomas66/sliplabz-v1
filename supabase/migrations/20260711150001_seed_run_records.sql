-- ============================================================================
-- V1-4b  Migration 45 : seed run records
--
-- Authority anchors:
--   Complete spec §3.6 (launch historical seeding)
--   Complete spec §10.13 (historical seed requests)
--   Odds sub-spec §14.11 (V1 seed policy, historical quota, provenance)
--   Ticket §8b required behavior: idempotent, resumable seed runs; per-slice
--     coverage watermarks; interrupted runs never report false completeness;
--     coverage report generation.
--
-- Load-bearing invariants:
--   * One row per invocation of the seed pipeline (`run_kind = seed`) or the
--     bounded Stage 1 live probe (`run_kind = stage1_probe`). Rows are
--     retained forever including failed and aborted runs.
--   * `completion_state` distinguishes running / complete / partial /
--     aborted_credit_budget / failed_transport / failed_authentication_or_access.
--   * A `complete` state is the ONLY state that admits advancing per-slice
--     watermarks in seed_slice_watermarks. Enforced by the application
--     (src/seed/watermarks.ts); documented invariant here.
--   * `credit_budget` and `credits_observed_total` are the running quota
--     ledger. Every request adds `x-requests-last` to
--     `credits_observed_total`. When the next request's forecast would
--     exceed budget, the pipeline halts and closes the run with state
--     `aborted_credit_budget`.
-- ============================================================================

CREATE TABLE seed_run_records (
  seed_run_id                    uuid              PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Run kind: full-season seed OR the Stage 1 bounded probe.
  run_kind                       text              NOT NULL,
  CHECK (run_kind IN ('seed', 'stage1_probe')),

  -- Free-form label so operators can identify a run in the coverage report.
  label                          text              NOT NULL DEFAULT '',

  started_at                     timestamptz       NOT NULL DEFAULT now(),
  completed_at                   timestamptz,

  -- Governor-set credit budget for THIS run. Stage 1 = 200; full seed = the
  -- forecasted value at run start.
  credit_budget                  integer           NOT NULL,
  CHECK (credit_budget >= 0),

  -- Running total of observed credits. Advanced by `x-requests-last` after
  -- every request (Odds §13.8, §14.11.2).
  credits_observed_total         integer           NOT NULL DEFAULT 0,
  CHECK (credits_observed_total >= 0),

  -- The event / market / bookmaker scope for this run. Retained as jsonb
  -- so slice filters can be operator-parametrized without a schema change.
  requested_market_keys          jsonb             NOT NULL DEFAULT '[]'::jsonb,
  requested_bookmaker_keys       jsonb             NOT NULL DEFAULT '[]'::jsonb,

  -- The dates (slate boundaries) attempted by this run. Enables the
  -- coverage report to enumerate probed dates without joining raw responses.
  attempted_slate_dates          jsonb             NOT NULL DEFAULT '[]'::jsonb,

  -- Counters for the coverage report.
  events_probed                  integer           NOT NULL DEFAULT 0,
  events_admitted                integer           NOT NULL DEFAULT 0,
  events_stale_rejected          integer           NOT NULL DEFAULT 0,
  events_no_snapshot             integer           NOT NULL DEFAULT 0,

  completion_state               text              NOT NULL DEFAULT 'running',
  CHECK (completion_state IN (
    'running',
    'complete',
    'partial',
    'aborted_credit_budget',
    'failed_transport',
    'failed_authentication_or_access',
    'failed_forbidden_or_subscription',
    'failed_invalid_request',
    'failed_schema_drift',
    'failed_parse'
  )),
  CHECK ( (completion_state = 'running' AND completed_at IS NULL)
       OR (completion_state <> 'running' AND completed_at IS NOT NULL) ),

  failure_detail                 text,

  -- Free-form operator notes.
  operator_note                  text              NOT NULL DEFAULT '',

  created_at                     timestamptz       NOT NULL DEFAULT now(),
  updated_at                     timestamptz       NOT NULL DEFAULT now()
);

CREATE INDEX seed_run_records_kind_idx      ON seed_run_records (run_kind);
CREATE INDEX seed_run_records_state_idx     ON seed_run_records (completion_state);
CREATE INDEX seed_run_records_started_idx   ON seed_run_records (started_at DESC);
CREATE INDEX seed_run_records_completed_idx ON seed_run_records (completed_at DESC)
  WHERE completed_at IS NOT NULL;

COMMENT ON TABLE seed_run_records
  IS 'One row per seed / Stage 1 probe run. Governor budget accounting + per-slice attempt log. See Odds §14.11.';
COMMENT ON COLUMN seed_run_records.credits_observed_total
  IS 'Running sum of x-requests-last from every request. Halt-approaching-budget check reads this.';
COMMENT ON COLUMN seed_run_records.completion_state
  IS 'Only `complete` may advance seed_slice_watermarks. See src/seed/watermarks.ts.';

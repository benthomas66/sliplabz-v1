-- ============================================================================
-- V1-4b  Migration 46 : seed slice watermarks
--
-- Authority anchors:
--   Complete spec §3.6 (per-slice coverage; missing gaps stay missing)
--   Complete spec §10.13 (historical seed requests; slice-level tracking)
--   Odds sub-spec §14.11 (V1 seed policy; unsupported / unapproved slices
--     remain forward-only and are labeled missing)
--   Ticket §8b required behavior: idempotent, resumable seed runs;
--     interrupted runs never report false completeness.
--
-- Load-bearing invariants:
--   * A slice is the natural "resumable unit": one (slate_date, market_key,
--     bookmaker_key) triple. Per §3.6, coverage is reported at this grain.
--   * `completed_at` is advanced ONLY when the seed run's completion_state
--     was `complete` for the slice's underlying event batch (application
--     enforcement, mirrors V1-2 BDL watermark policy).
--   * `resume_cursor` is a free-form jsonb blob the seed pipeline uses to
--     restart mid-slice after an interruption. Its structure is
--     documented in src/seed/watermarks.ts; the schema stays generic to
--     survive future pipeline shape changes.
--   * `slice_coverage_state` distinguishes:
--       - `attempted_none`          — no events probed for this slice
--       - `partial_in_progress`     — some events probed, more to attempt
--       - `complete`                — every eligible event probed
--       - `no_coverage_available`   — provider returned no eligible offerings
--                                      across the slice (rights + coverage
--                                      confirmed absent)
--       - `rights_not_authorized`   — governor did not authorize this slice
--
-- No implicit dependency on run_id: a completed run is retained separately
-- via `completed_by_run_id`; the same slice may be advanced multiple times
-- across independent runs (idempotence).
-- ============================================================================

CREATE TABLE seed_slice_watermarks (
  slate_date                     date              NOT NULL,
  market_key                     text              NOT NULL
                                                   REFERENCES market_registry(provider_key)
                                                   ON UPDATE RESTRICT ON DELETE RESTRICT,
  bookmaker_key                  text              NOT NULL
                                                   REFERENCES bookmaker_registry(provider_key)
                                                   ON UPDATE RESTRICT ON DELETE RESTRICT,

  slice_coverage_state           text              NOT NULL DEFAULT 'attempted_none',
  CHECK (slice_coverage_state IN (
    'attempted_none',
    'partial_in_progress',
    'complete',
    'no_coverage_available',
    'rights_not_authorized'
  )),

  events_attempted               integer           NOT NULL DEFAULT 0,
  events_admitted                integer           NOT NULL DEFAULT 0,
  events_stale_rejected          integer           NOT NULL DEFAULT 0,
  events_no_snapshot             integer           NOT NULL DEFAULT 0,
  CHECK (events_attempted >= 0),
  CHECK (events_admitted >= 0),
  CHECK (events_stale_rejected >= 0),
  CHECK (events_no_snapshot >= 0),

  -- The last cursor / offset used to resume. Opaque to the schema; owner is
  -- src/seed/watermarks.ts.
  resume_cursor                  jsonb             NOT NULL DEFAULT '{}'::jsonb,

  first_attempted_at             timestamptz,
  last_attempted_at              timestamptz,
  completed_at                   timestamptz,
  completed_by_run_id            uuid              REFERENCES seed_run_records(seed_run_id)
                                                   ON UPDATE RESTRICT ON DELETE RESTRICT,

  -- Structural: completed_at implies both a run reference and a valid state.
  CHECK ( (completed_at IS NULL AND completed_by_run_id IS NULL)
       OR (completed_at IS NOT NULL AND completed_by_run_id IS NOT NULL
           AND slice_coverage_state IN ('complete', 'no_coverage_available')) ),

  created_at                     timestamptz       NOT NULL DEFAULT now(),
  updated_at                     timestamptz       NOT NULL DEFAULT now(),

  PRIMARY KEY (slate_date, market_key, bookmaker_key)
);

CREATE INDEX seed_slice_watermarks_state_idx
  ON seed_slice_watermarks (slice_coverage_state);
CREATE INDEX seed_slice_watermarks_completed_idx
  ON seed_slice_watermarks (completed_at DESC)
  WHERE completed_at IS NOT NULL;
CREATE INDEX seed_slice_watermarks_market_book_idx
  ON seed_slice_watermarks (market_key, bookmaker_key);

COMMENT ON TABLE seed_slice_watermarks
  IS 'Per (slate_date, market_key, bookmaker_key) coverage watermark for resumable seed runs. See §3.6, Odds §14.11.';
COMMENT ON COLUMN seed_slice_watermarks.slice_coverage_state
  IS 'attempted_none | partial_in_progress | complete | no_coverage_available | rights_not_authorized.';
COMMENT ON COLUMN seed_slice_watermarks.resume_cursor
  IS 'Opaque resume state owned by src/seed/watermarks.ts. Schema stays generic to survive future pipeline changes.';

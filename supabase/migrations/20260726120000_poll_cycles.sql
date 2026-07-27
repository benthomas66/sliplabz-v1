-- V1-OP-1 — poll_cycles: the OPERATIONS cycle ledger.
--
-- This is an OPERATIONS ledger, NOT evidence data. It records one row per
-- scheduled-cycle attempt by the orchestrator (src/ops/scheduledCycle.ts):
-- what the cycle did, what it spent, what it persisted. It is APPEND-ONLY
-- from the orchestrator (one INSERT per cycle; no UPDATE, no DELETE in the
-- operational path).
--
-- SCOPE DISCIPLINE (V1-OP-1):
--   * No evidence table is altered. No existing table is changed in any way.
--   * This migration is purely ADDITIVE (one new table).
--   * The evidence method, thresholds, engine, writers, composer, sweep,
--     aggregator, and populator are untouched — the orchestrator COMPOSES
--     them; this table only records the outcome.
--
-- A cycle that fails mid-way STILL writes its row (outcome='failed',
-- error_summary set) so the ledger never has silent holes.

CREATE TABLE poll_cycles (
  poll_cycle_id             uuid          PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Timing of the cycle attempt.
  started_at                timestamptz   NOT NULL,
  finished_at               timestamptz,            -- NULL only if the process died before RECORD

  -- What the cycle resolved to.
  outcome                   text          NOT NULL
    CONSTRAINT poll_cycles_outcome_check
      CHECK (outcome IN ('completed', 'skipped_no_slate', 'skipped_budget_floor', 'failed')),

  -- The ONE evaluation_reference_time the populate stage used (R4). NULL for
  -- cycles that skipped before populate (no_slate / budget_floor / early fail).
  evaluation_reference_time timestamptz,

  -- Real numbers from the stages (0 for stages that did not run).
  events_polled             integer       NOT NULL DEFAULT 0,
  credits_spent             integer       NOT NULL DEFAULT 0,
  credits_remaining_after   integer,                -- NULL when not observed
  grains_aggregated         integer       NOT NULL DEFAULT 0,
  profiles_persisted        integer       NOT NULL DEFAULT 0,
  profiles_updated          integer       NOT NULL DEFAULT 0,
  beyond_horizon_skipped    integer       NOT NULL DEFAULT 0,

  -- Populated only when outcome='failed'.
  error_summary             text,

  created_at                timestamptz   NOT NULL DEFAULT now()
);

-- Operators read the ledger newest-first when auditing spend / cadence.
CREATE INDEX poll_cycles_started_at_idx ON poll_cycles (started_at DESC);

COMMENT ON TABLE poll_cycles IS
  'V1-OP-1 operations cycle ledger. Append-only from the scheduled-cycle orchestrator. Not evidence data; alters no existing table.';
COMMENT ON COLUMN poll_cycles.evaluation_reference_time IS
  'The single R4 evaluation_reference_time the populate stage used for this cycle; NULL when the cycle skipped before populate.';
COMMENT ON COLUMN poll_cycles.outcome IS
  'completed | skipped_no_slate | skipped_budget_floor | failed. A mid-cycle failure still writes a row (failed + error_summary).';

-- ============================================================================
-- V1-4b  Migration 44 : historical_line_results — allow backfilled_historical
--                       provenance for seeded rows
--
-- ============================================================================
-- GOVERNOR FLAG — REVIEW OBLIGATION FOR V1-4b:
-- ============================================================================
-- The V1-4 migration 20260711140007_historical_line_results.sql shipped a
-- CHECK (provenance = 'self_observed') on historical_line_results. That
-- constraint was correct for V1-4 (which did not persist seeded results)
-- but blocks V1-4b's authorized seed pipeline. This migration REPLACES that
-- inline CHECK with a broader CHECK that permits BOTH self_observed and
-- backfilled_historical, keeping self_observed distinguishable from
-- backfilled_historical at the row level via the provenance column.
--
-- Why this is safe (structural isolation preserved):
--   * The `provenance` column value is retained. Every downstream query that
--     needs "self-observed only" or "backfilled only" filters on the column.
--   * The V1-3/V1-4 CHECKs on market_snapshots still gate the underlying
--     snapshot rows: (current_poll, self_observed) and
--     (historical_query, backfilled_historical) remain the only two
--     structurally-valid pairings admitted to market_snapshots. A seeded
--     historical_line_results row can NEVER derive from a current_poll
--     snapshot because the intermediate source_closing_quotes and
--     canonical_closing_points still reference the snapshot lineage.
--   * `CURRENT_ONLY_WHERE_CLAUSE` (src/lines/currentHistoricalIsolation.ts)
--     filters on market_snapshots' (request_kind, provenance) — not on
--     historical_line_results. Historical rows here remain invisible to
--     current-selection queries by construction.
--
-- Enforcement inside the seed pipeline (application-level, tested):
--   * historical_line_results.provenance = 'backfilled_historical' is set
--     only by src/seed/orchestrator/persistHistoricalSnapshot.ts.
--   * canonical_closing_points computed from historical source_closing_quotes
--     never feed observed_line_lifecycle or movement_events (those tables
--     still carry CHECK (provenance = 'self_observed') and structurally
--     reject seeded input).
--
-- The old inline CHECK is anonymous. We locate it via pg_get_constraintdef
-- to keep this migration robust across environments; DROP it if found;
-- then ADD a named replacement CHECK.
-- ============================================================================

DO $$
DECLARE
  cnname text;
BEGIN
  SELECT conname INTO cnname
    FROM pg_constraint
    WHERE conrelid = 'historical_line_results'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%provenance = ''self_observed''%';
  IF cnname IS NOT NULL THEN
    EXECUTE format(
      'ALTER TABLE historical_line_results DROP CONSTRAINT %I',
      cnname
    );
  END IF;
END $$;

ALTER TABLE historical_line_results
  ADD CONSTRAINT historical_line_results_provenance_check
  CHECK (provenance IN ('self_observed', 'backfilled_historical'));

COMMENT ON COLUMN historical_line_results.provenance
  IS 'self_observed | backfilled_historical (V1-4b). Row-level distinguishability preserved; current-selection isolation lives on market_snapshots and on the CURRENT_ONLY_WHERE_CLAUSE (src/lines/currentHistoricalIsolation.ts) which never filters on this table.';

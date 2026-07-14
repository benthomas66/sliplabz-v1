-- ============================================================================
-- V1-5  Migration 48 : historical_line_results — UNIQUE includes computation_version
--
-- Authority anchors:
--   Complete spec §11.5 historical_line_results (computation_version field)
--   Complete spec §12.3 (each derived record includes a computation_version)
--   Ticket V1-5 governor obligation #2 (recomputation writer produces NEW
--     computation_version rows in historical_line_results; prior versions
--     never mutated)
--   Governor V1-5 revise (2026-07-13): the shipped ON CONFLICT
--     (game, player, market) DO NOTHING silently no-oped an existing-row
--     correction, and the UNIQUE excluding computation_version prevented
--     new-version rows from coexisting with old-version rows. Both are
--     unconditional defects; this migration is the additive schema half of
--     the correction, adopted per governor authorization.
--
-- What this migration does:
--   1. DROPs the prior inline UNIQUE (internal_game_id, internal_player_id,
--      market_key) constraint (name auto-generated; located via
--      pg_get_constraintdef).
--   2. ADDs the corrected UNIQUE (internal_game_id, internal_player_id,
--      market_key, computation_version) — prior-version rows are now
--      genuinely immutable per §12.3.
--
-- Safety notes:
--   * V1-4 shipped no derived rows into this table beyond the integration-
--     test fixtures. V1-4b and V1-5 do not write live rows during the
--     seed run (the V1-4b seed pipeline stops at canonical_closing_points).
--     No production row loss is possible from this migration; the change
--     alters the constraint shape, not any row body.
--   * The migration replaces an inline UNIQUE with a named one so future
--     inspection is deterministic; the new constraint has an explicit name.
-- ============================================================================

DO $$
DECLARE
  cnname text;
BEGIN
  SELECT conname INTO cnname
    FROM pg_constraint
    WHERE conrelid = 'historical_line_results'::regclass
      AND contype = 'u'
      AND pg_get_constraintdef(oid) = 'UNIQUE (internal_game_id, internal_player_id, market_key)';
  IF cnname IS NOT NULL THEN
    EXECUTE format(
      'ALTER TABLE historical_line_results DROP CONSTRAINT %I',
      cnname
    );
  END IF;
END $$;

ALTER TABLE historical_line_results
  ADD CONSTRAINT historical_line_results_grain_version_unique
  UNIQUE (internal_game_id, internal_player_id, market_key, computation_version);

COMMENT ON CONSTRAINT historical_line_results_grain_version_unique
  ON historical_line_results
  IS 'One historical result per (game, player, market) per computation_version. Prior-version rows are immutable per §12.3.';

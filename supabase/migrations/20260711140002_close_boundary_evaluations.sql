-- ============================================================================
-- V1-4  Migration 36 : close boundary evaluations
--
-- Authority anchors:
--   Complete spec §7.10 (close boundary):
--     1. verified actual game start when available;
--     2. otherwise scheduled tip with the approved grace rule;
--     3. never an abandoned start time for a postponed / rescheduled game.
--   Complete spec §7.10 (close does not occur against an abandoned postponed tip).
--
-- Load-bearing invariants:
--   * One row per internal_game_id (the chosen close boundary for THAT game).
--   * `boundary_source` records which of the three §7.10 branches applied.
--   * `close_boundary_utc` is nullable ONLY when `boundary_source =
--     'postponed_no_close'`; every other row has a non-null timestamp.
--   * `grace_seconds` records the exact grace value applied when the branch
--     was `scheduled_with_grace`; NULL otherwise.
--   * Rows are recomputed when the underlying game's actual/scheduled/status
--     changes; the row is UPSERT-safe on internal_game_id.
-- ============================================================================

CREATE TABLE close_boundary_evaluations (
  close_boundary_evaluation_id  uuid                    PRIMARY KEY DEFAULT gen_random_uuid(),

  internal_game_id              uuid                    NOT NULL UNIQUE
                                                        REFERENCES games(internal_game_id)
                                                        ON UPDATE RESTRICT ON DELETE RESTRICT,

  boundary_source               close_boundary_source   NOT NULL,

  close_boundary_utc            timestamptz,

  -- The applied grace (seconds) when boundary_source = 'scheduled_with_grace'.
  grace_seconds                 integer,

  -- The observed game status at evaluation time. Postponed / canceled games
  -- receive `postponed_no_close` regardless of any residual clock value.
  observed_game_status          game_status             NOT NULL,

  -- Load-bearing pairings:
  CHECK (
    (boundary_source = 'postponed_no_close' AND close_boundary_utc IS NULL AND grace_seconds IS NULL)
    OR
    (boundary_source = 'verified_actual_start' AND close_boundary_utc IS NOT NULL AND grace_seconds IS NULL)
    OR
    (boundary_source = 'scheduled_with_grace' AND close_boundary_utc IS NOT NULL AND grace_seconds IS NOT NULL AND grace_seconds >= 0)
  ),

  computation_version           integer                 NOT NULL DEFAULT 1,

  computed_at                   timestamptz             NOT NULL DEFAULT now(),
  created_at                    timestamptz             NOT NULL DEFAULT now(),
  updated_at                    timestamptz             NOT NULL DEFAULT now()
);

CREATE INDEX close_boundary_evaluations_boundary_idx
  ON close_boundary_evaluations (close_boundary_utc);
CREATE INDEX close_boundary_evaluations_source_idx
  ON close_boundary_evaluations (boundary_source);

COMMENT ON TABLE close_boundary_evaluations
  IS 'One row per game: the chosen close boundary and which §7.10 branch chose it.';
COMMENT ON COLUMN close_boundary_evaluations.close_boundary_utc
  IS 'NULL only when boundary_source = postponed_no_close (game has no valid close).';

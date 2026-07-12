-- ============================================================================
-- V1-2  Migration 22 : post-final reconciliation schedule
--
-- Authority anchors:
--   BALLDONTLIE sub-spec §12C.4 (V1 reconciliation schedule: first pull
--     after final, ~2h after final, next-day, weekly season sweep)
--   BALLDONTLIE sub-spec §16A (default operating cadence — player statistics)
--   Complete spec §9.9 post-final reconciliation
--   Ticket V1-2 requirement: post-final reconciliation scheduling
--
-- Load-bearing invariants:
--   * The schedule is generated when a game transitions to canonical_status
--     = 'final'. Generation happens in src/bdl/postFinalScheduling.ts.
--   * Each row is a single scheduled pull with a due_at timestamp. Rows are
--     marked completed_at when the actual reconciliation run finishes.
--   * A single game may have multiple rows for the same kind if a source
--     correction re-schedules follow-ups (BDL §12C.5).
--   * The schema does not itself invoke jobs. This is an in-repo scheduling
--     primitive — the ticket forbids external scheduler infrastructure.
-- ============================================================================

CREATE TABLE post_final_reconciliation_schedule (
  post_final_reconciliation_schedule_id  uuid                              PRIMARY KEY DEFAULT gen_random_uuid(),

  internal_game_id      uuid                                               NOT NULL
                                                                           REFERENCES games(internal_game_id)
                                                                           ON UPDATE RESTRICT ON DELETE RESTRICT,

  provider_game_id      text                                               NOT NULL,

  kind                  post_final_reconciliation_kind                     NOT NULL,

  -- The observation that triggered the scheduling (game transitioned to final).
  triggering_observation_id  uuid                                          NOT NULL
                                                                           REFERENCES game_status_observations(game_status_observation_id)
                                                                           ON UPDATE RESTRICT ON DELETE RESTRICT,

  -- When the scheduled reconciliation should run.
  due_at                timestamptz                                        NOT NULL,

  -- When the reconciliation ran and its result (referenced run).
  completed_at          timestamptz,
  completed_by_run_id   uuid                                               REFERENCES bdl_ingestion_runs(bdl_ingestion_run_id)
                                                                           ON UPDATE RESTRICT ON DELETE RESTRICT,

  -- Free-form reason detail for audit; when the schedule was superseded
  -- because of a source-correction cascade, the reason lands here.
  cancelled_at          timestamptz,
  cancelled_reason      text,

  created_at            timestamptz                                        NOT NULL DEFAULT now(),
  updated_at            timestamptz                                        NOT NULL DEFAULT now(),

  -- Documenting invariants.
  CHECK ( (completed_at IS NULL AND completed_by_run_id IS NULL)
       OR (completed_at IS NOT NULL AND completed_by_run_id IS NOT NULL) ),
  CHECK ( cancelled_at IS NULL OR completed_at IS NULL )
);

CREATE INDEX post_final_reconciliation_schedule_game_idx
  ON post_final_reconciliation_schedule (internal_game_id, kind);
CREATE INDEX post_final_reconciliation_schedule_due_idx
  ON post_final_reconciliation_schedule (due_at)
  WHERE completed_at IS NULL AND cancelled_at IS NULL;
CREATE INDEX post_final_reconciliation_schedule_kind_idx
  ON post_final_reconciliation_schedule (kind);

COMMENT ON TABLE  post_final_reconciliation_schedule
  IS 'In-repo primitive for BDL post-final reconciliation cadence. Not a cron; a durable queue of scheduled pulls.';

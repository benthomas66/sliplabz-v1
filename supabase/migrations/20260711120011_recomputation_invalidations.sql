-- ============================================================================
-- V1-2  Migration 23 : recomputation invalidations
--
-- Authority anchors:
--   BALLDONTLIE sub-spec §12C.5 (material corrections trigger recomputation
--     of L5/L10/L20 windows, averages/medians, exact-line results, hit rates,
--     streaks, cached research views)
--   BALLDONTLIE sub-spec §14 (reconciliation preserves raw and triggers
--     dependent recomputation)
--   Complete spec §12 computation ownership
--   Ticket V1-2 requirement: recomputation invalidation hooks (never silent
--     overwrites)
--
-- Load-bearing invariants:
--   * Append-only in intent. This is a hook queue; V1-5 will consume it.
--   * One row per (entity_kind, entity_id, reason, triggering_event_id) —
--     duplicates on the same triggering event are meaningless.
--   * `processed_at` is set by the downstream consumer (V1-5); this ticket
--     does not itself consume the queue.
-- ============================================================================

CREATE TABLE recomputation_invalidations (
  recomputation_invalidation_id  uuid                          PRIMARY KEY DEFAULT gen_random_uuid(),

  entity_kind                    invalidation_entity_kind      NOT NULL,

  -- Denormalized entity identifier. Interpretation depends on entity_kind:
  --   * player_game_stat: player_game_stats.player_game_stat_id
  --   * internal_player: players.internal_player_id
  --   * internal_game:   games.internal_game_id
  entity_id                      uuid                          NOT NULL,

  reason                         invalidation_reason           NOT NULL,

  -- The event that triggered this invalidation. Retained as a reference to
  -- either a player_game_stat_history row (for stat corrections) or a
  -- game_status_observation row (for status transitions).
  triggering_history_id          uuid                          REFERENCES player_game_stat_history(player_game_stat_history_id)
                                                               ON UPDATE RESTRICT ON DELETE RESTRICT,
  triggering_observation_id      uuid                          REFERENCES game_status_observations(game_status_observation_id)
                                                               ON UPDATE RESTRICT ON DELETE RESTRICT,

  -- Cross-check: at least one triggering ref must be set.
  CHECK ( triggering_history_id IS NOT NULL OR triggering_observation_id IS NOT NULL ),

  -- Provider source key snapshot for downstream query hygiene.
  provider                       provider_kind                 NOT NULL,
  provider_player_id             text,
  provider_game_id               text,

  changed_fields                 jsonb                         NOT NULL DEFAULT '[]'::jsonb,

  observed_at                    timestamptz                   NOT NULL DEFAULT now(),
  created_at                     timestamptz                   NOT NULL DEFAULT now(),

  -- V1-5 will mark rows processed when it acts on them. This ticket does
  -- not consume the queue.
  processed_at                   timestamptz,
  processed_note                 text
);

CREATE INDEX recomputation_invalidations_entity_idx
  ON recomputation_invalidations (entity_kind, entity_id);
CREATE INDEX recomputation_invalidations_reason_idx
  ON recomputation_invalidations (reason);
CREATE INDEX recomputation_invalidations_unprocessed_idx
  ON recomputation_invalidations (observed_at)
  WHERE processed_at IS NULL;
CREATE INDEX recomputation_invalidations_history_idx
  ON recomputation_invalidations (triggering_history_id)
  WHERE triggering_history_id IS NOT NULL;
CREATE INDEX recomputation_invalidations_observation_idx
  ON recomputation_invalidations (triggering_observation_id)
  WHERE triggering_observation_id IS NOT NULL;

COMMENT ON TABLE  recomputation_invalidations
  IS 'Append-only queue of recomputation invalidation events. Consumed by V1-5 shared computation service. See BDL §12C.5.';

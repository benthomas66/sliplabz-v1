-- ============================================================================
-- V1-2  Migration 20 : player_game_stat_history
--
-- Authority anchors:
--   BALLDONTLIE sub-spec §12C.4 (repeated pulls upsert, compare source hash,
--     record changed fields, preserve/reference prior raw representation)
--   BALLDONTLIE sub-spec §12C.5 (correction semantics may change participation,
--     minutes, counting stats, team assignment, presence)
--   Complete spec §11.2 (player_game_stats history is auditable)
--   Ticket V1-2 hard invariants:
--       - Historical player-game rows are stable and correction-safe
--       - Source corrections are detected, recorded, and trigger invalidation
--         hooks — never silent overwrites
--
-- Load-bearing invariants:
--   * Append-only in intent. NO UPDATE, DELETE, or TRUNCATE in any V1-2
--     migration or module.
--   * Every material change appends a row referencing the prior source_hash
--     AND the new source_hash so the change is walk-back auditable.
--   * changed_fields is a jsonb array of source-field names that changed
--     (BDL §12C.4 "records changed fields"). Descriptive metadata changes
--     that do not affect computation are still logged with a distinct
--     `change_kind`.
-- ============================================================================

CREATE TABLE player_game_stat_history (
  player_game_stat_history_id  uuid                        PRIMARY KEY DEFAULT gen_random_uuid(),

  player_game_stat_id          uuid                        NOT NULL
                                                           REFERENCES player_game_stats(player_game_stat_id)
                                                           ON UPDATE RESTRICT ON DELETE RESTRICT,

  -- Provider source key snapshot (denormalized for query-side sanity).
  provider                     provider_kind               NOT NULL,
  provider_player_id           text                        NOT NULL,
  provider_game_id             text                        NOT NULL,

  -- Change kind. `initial_observation` marks the first row when a
  -- player_game_stats entry is created (upsert insert). `material_correction`
  -- marks BDL §12C.5 corrections. `metadata_change` marks changes that do
  -- not affect counting statistics.
  change_kind                  text                        NOT NULL,
  CHECK (change_kind IN ('initial_observation', 'material_correction', 'metadata_change')),

  prior_source_hash            text,
  new_source_hash              text                        NOT NULL,

  changed_fields               jsonb                       NOT NULL DEFAULT '[]'::jsonb,

  -- Full prior representation preserved for walk-back (BDL §14 immutability
  -- and §12C.4 "preserves or references the prior raw representation").
  prior_raw_stats              jsonb,
  prior_normalized_stats       jsonb,
  prior_minutes_status         bdl_minutes_status,
  prior_raw_minutes            text,
  prior_parsed_minutes         numeric(6,2),

  new_raw_stats                jsonb                       NOT NULL,
  new_normalized_stats         jsonb                       NOT NULL,
  new_minutes_status           bdl_minutes_status          NOT NULL,
  new_raw_minutes              text,
  new_parsed_minutes           numeric(6,2),

  -- Traceability to the run and raw response that produced the new state.
  bdl_ingestion_run_id         uuid                        NOT NULL
                                                           REFERENCES bdl_ingestion_runs(bdl_ingestion_run_id)
                                                           ON UPDATE RESTRICT ON DELETE RESTRICT,
  raw_response_id              uuid                        REFERENCES bdl_raw_responses(raw_response_id)
                                                           ON UPDATE RESTRICT ON DELETE RESTRICT,

  observed_at                  timestamptz                 NOT NULL DEFAULT now(),
  created_at                   timestamptz                 NOT NULL DEFAULT now()
);

CREATE INDEX player_game_stat_history_stat_idx
  ON player_game_stat_history (player_game_stat_id, observed_at DESC);
CREATE INDEX player_game_stat_history_change_kind_idx
  ON player_game_stat_history (change_kind);
CREATE INDEX player_game_stat_history_hash_idx
  ON player_game_stat_history (prior_source_hash, new_source_hash);

COMMENT ON TABLE  player_game_stat_history
  IS 'Append-only history of player_game_stats material changes. NEVER UPDATE/DELETE. See BDL §12C.4, §12C.5.';
COMMENT ON COLUMN player_game_stat_history.change_kind
  IS 'initial_observation | material_correction | metadata_change';

-- ============================================================================
-- V1-1  Migration 10 : player_reconciliation_queue
--
-- Authority anchors:
--   Complete spec §7.3 (player mapping order)
--   BALLDONTLIE sub-spec §11A (referential-integrity checks)
--   BALLDONTLIE sub-spec §12A.6 (name-matching implications)
--   Odds API sub-spec §10.11 (player reconciliation)
--
-- Purpose: durable, non-destructive record of every provider player that
-- was NOT permanently mapped. Reason evidence is immutable.
-- ============================================================================

CREATE TABLE player_reconciliation_queue (
  queue_row_id            uuid                 PRIMARY KEY DEFAULT gen_random_uuid(),

  provider                provider_kind        NOT NULL,
  provider_player_id      text                 NOT NULL,

  provider_player_row_id  uuid                 REFERENCES provider_players(provider_player_row_id)
                                               ON UPDATE RESTRICT ON DELETE RESTRICT,

  raw_first_name          text                 NOT NULL DEFAULT '',
  raw_last_name           text                 NOT NULL DEFAULT '',
  raw_full_name           text                 NOT NULL DEFAULT '',
  normalized_name         text                 NOT NULL DEFAULT '',

  -- Event / team context captured at queue time. NULLs allowed because
  -- context may be exactly what was missing.
  provider_team_id_seen   text,
  provider_game_id_seen   text,

  candidate_internal_player_ids  uuid[]        NOT NULL DEFAULT ARRAY[]::uuid[],

  reason                  player_queue_reason  NOT NULL,
  reason_detail           text                 NOT NULL DEFAULT '',

  created_at              timestamptz          NOT NULL DEFAULT now(),
  last_evaluated_at       timestamptz          NOT NULL DEFAULT now(),

  resolution              queue_resolution     NOT NULL DEFAULT 'open',

  resolved_internal_player_id  uuid            REFERENCES players(internal_player_id)
                                               ON UPDATE RESTRICT ON DELETE RESTRICT,
  resolved_by             text,
  resolved_note           text,
  resolved_at             timestamptz,

  CHECK ( resolution <> 'approved' OR resolved_internal_player_id IS NOT NULL )
);

CREATE INDEX player_queue_open_idx      ON player_reconciliation_queue (resolution) WHERE resolution = 'open';
CREATE INDEX player_queue_provider_idx  ON player_reconciliation_queue (provider, provider_player_id);
CREATE INDEX player_queue_reason_idx    ON player_reconciliation_queue (reason);
CREATE INDEX player_queue_normalized_idx ON player_reconciliation_queue (normalized_name);

COMMENT ON TABLE player_reconciliation_queue IS 'Non-destructive queue for provider players not auto-mapped. Reason evidence is immutable.';

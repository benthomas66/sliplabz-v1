-- ============================================================================
-- V1-1  Migration 09 : event_reconciliation_queue
--
-- Authority anchors:
--   Complete spec §7.2 (event mapping)
--   Odds API sub-spec §6 (mapping policy)
--   Odds API sub-spec §6.1 (auto-approval requires uniqueness)
--
-- Purpose: durable, non-destructive record of every provider event that
-- was NOT permanently mapped, plus the evidence that triggered the queue.
-- Reason evidence must never be overwritten.
-- ============================================================================

CREATE TABLE event_reconciliation_queue (
  queue_row_id            uuid                 PRIMARY KEY DEFAULT gen_random_uuid(),

  provider                provider_kind        NOT NULL,
  provider_game_id        text                 NOT NULL,

  -- Optional pointer to the provider_games row that produced this queue
  -- entry. May be NULL when queued before a provider_games row lands.
  provider_game_row_id    uuid                 REFERENCES provider_games(provider_game_row_id)
                                               ON UPDATE RESTRICT ON DELETE RESTRICT,

  -- Raw provider identifying fields captured at queue time.
  raw_home_team           text                 NOT NULL DEFAULT '',
  raw_away_team           text                 NOT NULL DEFAULT '',
  raw_commence_time       timestamptz,

  -- Candidate internal games considered during reconciliation.
  -- Empty array for "unmatched", one element for "quarantined-single-
  -- reason-other-than-ambiguity", two or more for "ambiguous".
  candidate_internal_game_ids  uuid[]          NOT NULL DEFAULT ARRAY[]::uuid[],

  -- Auditable reason the candidate was not auto-mapped.
  reason                  event_queue_reason   NOT NULL,

  -- Free-form supporting detail (which teams did not resolve, which
  -- candidate times were too far apart, etc.). Human-readable.
  reason_detail           text                 NOT NULL DEFAULT '',

  created_at              timestamptz          NOT NULL DEFAULT now(),
  last_evaluated_at       timestamptz          NOT NULL DEFAULT now(),

  resolution              queue_resolution     NOT NULL DEFAULT 'open',

  resolved_internal_game_id  uuid              REFERENCES games(internal_game_id)
                                               ON UPDATE RESTRICT ON DELETE RESTRICT,
  resolved_by             text,
  resolved_note           text,
  resolved_at             timestamptz,

  -- If resolved='approved', an internal_game_id must accompany it.
  CHECK ( resolution <> 'approved' OR resolved_internal_game_id IS NOT NULL )
);

CREATE INDEX event_queue_open_idx      ON event_reconciliation_queue (resolution) WHERE resolution = 'open';
CREATE INDEX event_queue_provider_idx  ON event_reconciliation_queue (provider, provider_game_id);
CREATE INDEX event_queue_reason_idx    ON event_reconciliation_queue (reason);

COMMENT ON TABLE  event_reconciliation_queue IS 'Non-destructive queue for provider events not auto-mapped. Reason evidence is immutable.';

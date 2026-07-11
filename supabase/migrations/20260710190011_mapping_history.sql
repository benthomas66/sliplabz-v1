-- ============================================================================
-- V1-1  Migration 11 : mapping_history
--
-- Authority anchors:
--   Complete spec §7 (definitions), §11.1 (identity), §21.6 (raw preservation)
--   BALLDONTLIE sub-spec §22 (cross-provider handoff — versioned/auditable)
--   Odds API sub-spec §6.1 (mapping table stores review state + matched_at)
--
-- Purpose: append-only audit trail of every mapping decision touching
-- provider identities. Enables answering:
--   * which provider identity was mapped;
--   * to which internal identity;
--   * prior mapping (if any);
--   * new mapping;
--   * action taken;
--   * reason;
--   * mapping / alias version at decision time;
--   * timestamp;
--   * actor.
--
-- Invariant: rows are never UPDATEd or DELETEd. Corrections append a new
-- row with a new action (e.g. `superseded`) referencing the prior row.
-- Enforcement of append-only is a runtime guarantee; no trigger is added
-- in V1-1 to keep the migration reversible.
-- ============================================================================

CREATE TABLE mapping_history (
  history_id            uuid                 PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Which provider / entity this history row belongs to.
  provider              provider_kind        NOT NULL,
  entity_kind           text                 NOT NULL,
  CHECK (entity_kind IN ('team','player','game','team_alias','player_alias')),

  -- Provider-native identifier of the entity, opaque text.
  provider_entity_id    text                 NOT NULL,

  -- The internal entity involved (nullable; e.g., a `quarantined` action
  -- may not have a resolved internal entity).
  internal_entity_id    uuid,

  -- The prior mapping (may be NULL for the first-ever action).
  prior_internal_entity_id  uuid,

  action                mapping_action       NOT NULL,
  reason                text                 NOT NULL DEFAULT '',

  -- Version pins at decision time. Distinguish `mapping_version` (the
  -- monotonic version on the mapping table itself) from `alias_version`
  -- (which alias was consulted, if any).
  mapping_version       integer,
  alias_version         integer,

  actor                 text                 NOT NULL DEFAULT 'system',
  actor_note            text,

  created_at            timestamptz          NOT NULL DEFAULT now()
);

CREATE INDEX mapping_history_lookup_idx  ON mapping_history (provider, entity_kind, provider_entity_id, created_at DESC);
CREATE INDEX mapping_history_internal_idx ON mapping_history (internal_entity_id);
CREATE INDEX mapping_history_action_idx  ON mapping_history (action);

COMMENT ON TABLE mapping_history IS 'Append-only audit of mapping decisions. Never UPDATE or DELETE — corrections append a new row.';

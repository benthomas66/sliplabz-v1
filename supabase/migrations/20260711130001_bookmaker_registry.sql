-- ============================================================================
-- V1-3  Migration 25 : bookmaker registry
--
-- Authority anchors:
--   Odds API sub-spec §10.3 (initial source configuration; 10 allowlisted keys)
--   Odds API sub-spec §10.4 (source classes)
--   Odds API sub-spec §13.5 (explicit allowlist policy)
--   Odds API sub-spec §13.9 (key-title distinction; espnbet / theScore Bet)
--   Odds API sub-spec §18.1 (consensus eligibility — sportsbook only)
--   Complete spec §10.3, §10.4
--   Ticket V1-3 hard invariant: sportsbook vs DFS classification is
--     structural, not a display flag; consensus never mixes classes.
--
-- Load-bearing invariants:
--   * `provider_key` is unique (this is the Odds API bookmaker key).
--   * `source_class` is enum-typed; NOT a text tag.
--   * `allowlist_status` gates ingestion eligibility.
--   * `display_title` is provider-supplied metadata that may change; NEVER
--     used as identity (spec §13.9 explicit).
-- ============================================================================

CREATE TABLE bookmaker_registry (
  provider_key             text                        PRIMARY KEY,

  -- Provider-supplied display title. May change; NOT an identifier.
  display_title            text                        NOT NULL DEFAULT '',

  source_class             source_class                NOT NULL,

  allowlist_status         bookmaker_allowlist_status  NOT NULL DEFAULT 'active',

  -- Free-form reviewed note (e.g. "espnbet returns theScore Bet title").
  reviewed_note            text                        NOT NULL DEFAULT '',

  -- The reviewer / process that curated this entry. NOT NULL — the same
  -- guard V1-1 aliases carry: registry entries are reviewed decisions.
  approved_by              text                        NOT NULL,
  approved_at              timestamptz                 NOT NULL DEFAULT now(),

  first_seen_at            timestamptz                 NOT NULL DEFAULT now(),
  last_seen_at             timestamptz                 NOT NULL DEFAULT now(),

  created_at               timestamptz                 NOT NULL DEFAULT now(),
  updated_at               timestamptz                 NOT NULL DEFAULT now()
);

CREATE INDEX bookmaker_registry_source_class_idx
  ON bookmaker_registry (source_class);
CREATE INDEX bookmaker_registry_allowlist_idx
  ON bookmaker_registry (allowlist_status)
  WHERE allowlist_status = 'active';

COMMENT ON TABLE  bookmaker_registry
  IS 'Reviewed Odds API bookmaker allowlist. source_class governs consensus eligibility. See Odds §13.5, §18.1.';
COMMENT ON COLUMN bookmaker_registry.source_class
  IS 'STRUCTURAL: sportsbook / dfs_pickem / unknown. Consensus never mixes classes.';

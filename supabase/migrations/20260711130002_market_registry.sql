-- ============================================================================
-- V1-3  Migration 26 : market registry
--
-- Authority anchors:
--   Odds API sub-spec §2 (V1 market scope: exactly four launch markets)
--   Odds API sub-spec §14.3 (event-odds endpoint accepts any market key)
--   Complete spec §6.1 (launch markets: points, rebounds, assists, made threes)
--   Complete spec §10 (Odds API ingestion requirements)
--   A1 §4.1 (launch markets locked to exactly four; no silent expansion)
--   Ticket V1-3 hard invariant: markets outside the four launch markets and
--     books outside the allowlist are not ingested as product data.
--
-- Load-bearing invariants:
--   * `provider_key` is unique.
--   * `is_launch_market` is a strict flag; only the four V1 markets set it
--     `true`. Any other observed market key is retained here for auditing
--     but never crosses the ingestion boundary as product data.
-- ============================================================================

CREATE TABLE market_registry (
  provider_key             text                        PRIMARY KEY,

  display_title            text                        NOT NULL DEFAULT '',

  -- Load-bearing: only the four V1 launch markets set this true. A1 §4.1
  -- locks the set to points / rebounds / assists / made threes.
  is_launch_market         boolean                     NOT NULL DEFAULT false,

  -- Canonical SlipLabz stat identifier for downstream mapping (V1-5).
  canonical_stat_key       text                        NOT NULL DEFAULT '',

  reviewed_note            text                        NOT NULL DEFAULT '',

  approved_by              text                        NOT NULL,
  approved_at              timestamptz                 NOT NULL DEFAULT now(),

  first_seen_at            timestamptz                 NOT NULL DEFAULT now(),
  last_seen_at             timestamptz                 NOT NULL DEFAULT now(),

  created_at               timestamptz                 NOT NULL DEFAULT now(),
  updated_at               timestamptz                 NOT NULL DEFAULT now()
);

CREATE INDEX market_registry_launch_idx
  ON market_registry (is_launch_market)
  WHERE is_launch_market = true;

COMMENT ON TABLE  market_registry
  IS 'Reviewed Odds API market keys. Only is_launch_market=true admits product data. See Odds §2, A1 §4.1.';

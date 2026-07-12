-- ============================================================================
-- V1-3  Migration 24 : Odds API ingestion enums
--
-- Authority anchors:
--   Odds API sub-spec §7 (event lifecycle)
--   Odds API sub-spec §10.4/§10.12 (source classification)
--   Odds API sub-spec §10.6/§10.9 (outcome completeness / offering state)
--   Odds API sub-spec §15 (canonical storage contract)
--   Odds API sub-spec §16.1/§16.2 (current snapshot, offering)
--   Odds API sub-spec §19.2 (freshness states)
--   Odds API sub-spec §20 (error and retry matrix)
--   Odds API sub-spec §21 (quota budgeting)
--   Complete spec §10 (Odds API ingestion), §11.4 (odds ingestion storage)
--
-- Forward-fix strategy: enum values are additive only; never DROP or RENAME.
-- Additions land in a new migration alongside code cutover.
-- ============================================================================

-- Request kind — the sub-spec §15.1 explicit distinction between forward
-- polling (`current_poll`) and historical seed queries (`historical_query`)
-- plus the free `event_discovery` request. V1-3 emits ONLY the first and
-- third values; `historical_query` is reserved for V1-4b.
CREATE TYPE oddsapi_request_kind AS ENUM (
  'event_discovery',
  'current_poll',
  'historical_query'
);

-- Provenance — the flag that keeps V1-4's current/historical isolation
-- structural (complete spec §11.4, §12.1). V1-3 writes `self_observed` only.
CREATE TYPE oddsapi_provenance AS ENUM (
  'self_observed',
  'backfilled_historical'
);

-- Ingestion-run lifecycle state. `complete` is the only state that admits a
-- market snapshot into the current selection (spec §16.1).
CREATE TYPE oddsapi_run_state AS ENUM (
  'running',
  'complete',
  'partial',
  'failed_transport',
  'failed_authentication_or_access',
  'failed_forbidden_or_subscription',
  'failed_not_found',
  'failed_rate_limited',
  'failed_invalid_request',
  'failed_schema_drift',
  'successful_empty',
  'failed_parse'
);

-- Endpoint per sub-spec §14. Only three endpoints are used by V1-3;
-- historical endpoints are declared for schema completeness so V1-4b
-- reuses this enum without a schema change.
CREATE TYPE oddsapi_endpoint AS ENUM (
  'events',
  'event_odds',
  'event_markets',
  'historical_events',
  'historical_event_odds'
);

-- Source class per sub-spec §10.4. Structural, not a display flag.
CREATE TYPE source_class AS ENUM (
  'sportsbook',
  'dfs_pickem',
  'unknown'
);

-- Bookmaker allowlist status per sub-spec §13.5 / §18.1. Explicit-key
-- policy is preferred over `regions=us` (sub-spec §13.5).
CREATE TYPE bookmaker_allowlist_status AS ENUM (
  'active',
  'suspended',
  'not_allowlisted'
);

-- Outcome side per sub-spec §10.7 (`name`: Over / Under). PrizePicks and
-- Underdog use the same values (§11.3, §12.3). Additional Push / Yes / No
-- variants would ship as ADD VALUE additions.
CREATE TYPE outcome_side AS ENUM (
  'over',
  'under'
);

-- Offering state per sub-spec §10.9. The single load-bearing enum that
-- captures whether an offering is two-sided complete, one-sided, multi-line,
-- or in conflict / duplicate / unresolved. `over_only` and `under_only` are
-- valid states — the missing side is NEVER fabricated (ticket hard invariant).
CREATE TYPE offering_state AS ENUM (
  'two_sided_complete',
  'over_only',
  'under_only',
  'multi_line',
  'duplicate_contaminated',
  'conflicting',
  'unresolved'
);

-- Freshness state per sub-spec §19.2. Product thresholds, not provider
-- guarantees. `unavailable` and `failed_latest_poll` are distinct from any
-- staleness class.
CREATE TYPE freshness_state AS ENUM (
  'fresh',
  'aging',
  'stale',
  'unavailable',
  'failed_latest_poll'
);

-- Market snapshot schema-validation state per sub-spec §20 (schema drift
-- row: HTTP 200 with an invalid body). Load-bearing: schema drift preserves
-- the raw body and quarantines; it does NOT retry blindly.
CREATE TYPE snapshot_schema_state AS ENUM (
  'valid',
  'valid_empty',
  'schema_drift_quarantined',
  'unresolved'
);

-- PrizePicks / Underdog promotion type per sub-spec §11.7. `unknown` is
-- the default because the audit could not resolve Goblin / Demon from any
-- available field.
CREATE TYPE dfs_promotion_type AS ENUM (
  'standard',
  'goblin',
  'demon',
  'unknown'
);

-- PrizePicks / Underdog price interpretation flag per sub-spec §11.4 /
-- §12.4. The raw price is retained; this flag documents that the price is
-- not a conventional sportsbook price.
CREATE TYPE price_semantic AS ENUM (
  'sportsbook_american',
  'provider_synthetic_or_display_price'
);

-- Offering-level conflict reason. Populated when offering_state = 'conflicting'
-- or 'duplicate_contaminated' so V1-5 / operators can consume the queue
-- without re-parsing raw rows.
CREATE TYPE offering_conflict_reason AS ENUM (
  'conflicting_prices_same_key',
  'conflicting_points_same_key',
  'materially_different_last_update',
  'missing_side_semantics',
  'missing_point',
  'missing_player_description',
  'missing_price',
  'unresolved'
);

-- Event snapshot disappearance state per sub-spec §10.13 / §17. `two_omissions`
-- confirms removal; a single omission is `single_omission`.
CREATE TYPE event_presence_state AS ENUM (
  'currently_returned',
  'single_omission',
  'confirmed_removed',
  'source_unavailable',
  'commenced_or_in_play'
);

-- Quota-forecast reconciliation outcome. Retained on every ingestion run.
CREATE TYPE quota_delta_flag AS ENUM (
  'exact_match',
  'observed_lower_than_forecast',
  'observed_higher_than_forecast',
  'observed_missing'
);

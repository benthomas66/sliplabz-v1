// SlipLabz V1-1 shared enums.
//
// These string-literal unions mirror the PostgreSQL enums declared in
// supabase/migrations/20260710190000_enums.sql. They exist so the
// TypeScript reconciliation logic can reason about mapping states
// without importing a schema client.
//
// Authority: complete spec §7, §11.1; BDL §10, §12A, §12B; Odds §6, §7.

export const PROVIDERS = ['balldontlie', 'odds_api'] as const;
export type Provider = (typeof PROVIDERS)[number];

export const MAPPING_STATES = [
  'unresolved',
  'pending_review',
  'approved',
  'quarantined',
  'superseded',
] as const;
export type MappingState = (typeof MAPPING_STATES)[number];

export const TEAM_CLASSIFICATIONS = [
  'current_franchise',
  'historical_franchise',
  'all_star_or_exhibition',
  'national_team',
  'placeholder',
  'unknown',
] as const;
export type TeamClassification = (typeof TEAM_CLASSIFICATIONS)[number];

export const GAME_STATUSES = [
  'scheduled',
  'live',
  'final',
  'postponed',
  'canceled',
  'unresolved',
] as const;
export type GameStatus = (typeof GAME_STATUSES)[number];

export const PLAYER_STATUSES = [
  'active_confirmed',
  'not_seen_active',
  'historical_identity',
  'unresolved',
] as const;
export type PlayerStatus = (typeof PLAYER_STATUSES)[number];

export const EVENT_QUEUE_REASONS = [
  'unmatched',
  'ambiguous_multiple_candidates',
  'unresolved_provider_team',
  'time_window_exceeded',
  'ordered_teams_disagree',
  'self_match_invalid',
] as const;
export type EventQueueReason = (typeof EVENT_QUEUE_REASONS)[number];

export const PLAYER_QUEUE_REASONS = [
  'unmatched',
  'ambiguous_multiple_candidates',
  'ambiguous_alias_conflict',
  'missing_event_context',
  'missing_team_context',
  'normalized_name_only',
] as const;
export type PlayerQueueReason = (typeof PLAYER_QUEUE_REASONS)[number];

export const QUEUE_RESOLUTIONS = [
  'open',
  'approved',
  'quarantined',
  'withdrawn',
] as const;
export type QueueResolution = (typeof QUEUE_RESOLUTIONS)[number];

export const MAPPING_ACTIONS = [
  'proposed',
  'approved',
  'quarantined',
  'superseded',
  'withdrawn',
  'reopened',
  'alias_added',
  'alias_deactivated',
] as const;
export type MappingAction = (typeof MAPPING_ACTIONS)[number];

export const ALIAS_SCOPE_KINDS = ['internal', 'balldontlie', 'odds_api'] as const;
export type AliasScopeKind = (typeof ALIAS_SCOPE_KINDS)[number];

export const ALIAS_TYPES = ['display', 'match_candidate'] as const;
export type AliasType = (typeof ALIAS_TYPES)[number];

// -- V1-2 BDL ingestion enums (mirror supabase/migrations/20260711120000_bdl_enums.sql) --

export const BDL_ENDPOINTS = [
  'players',
  'active_players',
  'teams',
  'games',
  'player_stats',
  'player_injuries',
] as const;
export type BdlEndpoint = (typeof BDL_ENDPOINTS)[number];

export const BDL_RUN_STATES = [
  'running',
  'complete',
  'partial_pagination',
  'failed_transport',
  'failed_authentication_or_access',
  'failed_invalid_request',
  'failed_schema',
  'failed_parse',
] as const;
export type BdlRunState = (typeof BDL_RUN_STATES)[number];

export const BDL_MINUTES_STATUSES = [
  'played',
  'dnp',
  'unresolved_non_numeric',
] as const;
export type BdlMinutesStatus = (typeof BDL_MINUTES_STATUSES)[number];

export const PLAYER_STAT_ELIGIBILITIES = [
  'eligible',
  'non_participation',
  'unresolved_minutes',
  'quarantined',
  'live_or_non_final',
] as const;
export type PlayerStatEligibility = (typeof PLAYER_STAT_ELIGIBILITIES)[number];

export const PLAYER_STAT_QUARANTINE_REASONS = [
  'missing_game',
  'missing_player',
  'team_not_in_game',
  'season_mismatch',
  'date_mismatch',
  'duplicate_source_key',
  'unsupported_competition_team',
  'unresolved_minutes',
  'unknown_game_status',
] as const;
export type PlayerStatQuarantineReason =
  (typeof PLAYER_STAT_QUARANTINE_REASONS)[number];

export const AVAILABILITY_INTERPRETATION_STATES = [
  'currently_reported',
  'not_returned_latest_complete_snapshot',
  'stale_feed',
  'unresolved_player',
  'source_unavailable',
] as const;
export type AvailabilityInterpretationState =
  (typeof AVAILABILITY_INTERPRETATION_STATES)[number];

export const POST_FINAL_RECONCILIATION_KINDS = [
  'first_post_final',
  't_plus_2h',
  'next_day',
  'season_sweep',
] as const;
export type PostFinalReconciliationKind =
  (typeof POST_FINAL_RECONCILIATION_KINDS)[number];

export const INVALIDATION_ENTITY_KINDS = [
  'player_game_stat',
  'internal_player',
  'internal_game',
] as const;
export type InvalidationEntityKind = (typeof INVALIDATION_ENTITY_KINDS)[number];

export const INVALIDATION_REASONS = [
  'material_stat_change',
  'minutes_state_change',
  'game_status_transition_to_final',
  'game_status_transition_from_final',
  'game_status_change_other',
  'roster_team_change',
  'availability_state_change',
] as const;
export type InvalidationReason = (typeof INVALIDATION_REASONS)[number];

// -- V1-3 Odds API ingestion enums (mirror supabase/migrations/20260711130000_oddsapi_enums.sql) --

export const ODDSAPI_REQUEST_KINDS = [
  'event_discovery',
  'current_poll',
  'historical_query',
] as const;
export type OddsapiRequestKind = (typeof ODDSAPI_REQUEST_KINDS)[number];

export const ODDSAPI_PROVENANCES = ['self_observed', 'backfilled_historical'] as const;
export type OddsapiProvenance = (typeof ODDSAPI_PROVENANCES)[number];

export const ODDSAPI_RUN_STATES = [
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
  'failed_parse',
] as const;
export type OddsapiRunState = (typeof ODDSAPI_RUN_STATES)[number];

export const ODDSAPI_ENDPOINTS = [
  'events',
  'event_odds',
  'event_markets',
  'historical_events',
  'historical_event_odds',
] as const;
export type OddsapiEndpoint = (typeof ODDSAPI_ENDPOINTS)[number];

export const SOURCE_CLASSES = ['sportsbook', 'dfs_pickem', 'unknown'] as const;
export type SourceClass = (typeof SOURCE_CLASSES)[number];

export const BOOKMAKER_ALLOWLIST_STATUSES = [
  'active',
  'suspended',
  'not_allowlisted',
] as const;
export type BookmakerAllowlistStatus =
  (typeof BOOKMAKER_ALLOWLIST_STATUSES)[number];

export const OUTCOME_SIDES = ['over', 'under'] as const;
export type OutcomeSide = (typeof OUTCOME_SIDES)[number];

export const OFFERING_STATES = [
  'two_sided_complete',
  'over_only',
  'under_only',
  'multi_line',
  'duplicate_contaminated',
  'conflicting',
  'unresolved',
] as const;
export type OfferingState = (typeof OFFERING_STATES)[number];

export const FRESHNESS_STATES = [
  'fresh',
  'aging',
  'stale',
  'unavailable',
  'failed_latest_poll',
] as const;
export type FreshnessState = (typeof FRESHNESS_STATES)[number];

export const SNAPSHOT_SCHEMA_STATES = [
  'valid',
  'valid_empty',
  'schema_drift_quarantined',
  'unresolved',
] as const;
export type SnapshotSchemaState = (typeof SNAPSHOT_SCHEMA_STATES)[number];

export const DFS_PROMOTION_TYPES = ['standard', 'goblin', 'demon', 'unknown'] as const;
export type DfsPromotionType = (typeof DFS_PROMOTION_TYPES)[number];

export const PRICE_SEMANTICS = [
  'sportsbook_american',
  'provider_synthetic_or_display_price',
] as const;
export type PriceSemantic = (typeof PRICE_SEMANTICS)[number];

export const OFFERING_CONFLICT_REASONS = [
  'conflicting_prices_same_key',
  'conflicting_points_same_key',
  'materially_different_last_update',
  'missing_side_semantics',
  'missing_point',
  'missing_player_description',
  'missing_price',
  'unresolved',
] as const;
export type OfferingConflictReason = (typeof OFFERING_CONFLICT_REASONS)[number];

export const EVENT_PRESENCE_STATES = [
  'currently_returned',
  'single_omission',
  'confirmed_removed',
  'source_unavailable',
  'commenced_or_in_play',
] as const;
export type EventPresenceState = (typeof EVENT_PRESENCE_STATES)[number];

export const QUOTA_DELTA_FLAGS = [
  'exact_match',
  'observed_lower_than_forecast',
  'observed_higher_than_forecast',
  'observed_missing',
] as const;
export type QuotaDeltaFlag = (typeof QUOTA_DELTA_FLAGS)[number];

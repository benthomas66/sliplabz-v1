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

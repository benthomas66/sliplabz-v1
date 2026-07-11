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

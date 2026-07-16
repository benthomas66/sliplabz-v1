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

// -- V1-4 lines enums (mirror supabase/migrations/20260711140001_lines_enums.sql) --

export const CLOSE_BOUNDARY_SOURCES = [
  'verified_actual_start',
  'scheduled_with_grace',
  'postponed_no_close',
] as const;
export type CloseBoundarySource = (typeof CLOSE_BOUNDARY_SOURCES)[number];

export const CLOSE_CAPTURE_STATES = [
  'eligible',
  'close_capture_stale',
  'no_snapshot',
] as const;
export type CloseCaptureState = (typeof CLOSE_CAPTURE_STATES)[number];

export const CLOSING_SELECTION_METHODS = [
  'single_book',
  'unique_modal',
  'tied_no_unique_mode',
  'no_eligible_source',
] as const;
export type ClosingSelectionMethod = (typeof CLOSING_SELECTION_METHODS)[number];

export const COVERAGE_LABELS = [
  'complete',
  'single_book',
  'incomplete',
  'unresolved_closing_consensus',
  'no_closing_line',
] as const;
export type CoverageLabel = (typeof COVERAGE_LABELS)[number];

export const MOVEMENT_TYPES = [
  'point_changed',
  'over_price_changed',
  'under_price_changed',
  'side_added',
  'side_removed',
  'point_added',
  'point_removed',
  'player_added',
  'player_removed',
  'market_added',
  'market_removed',
  'bookmaker_added',
  'bookmaker_removed',
  'duplicate_state_changed',
  'provider_timestamp_changed',
  'unchanged',
] as const;
export type MovementType = (typeof MOVEMENT_TYPES)[number];

export const SOURCE_PRESENCE_STATES = [
  'present',
  'single_omission',
  'confirmed_removed',
] as const;
export type SourcePresenceState = (typeof SOURCE_PRESENCE_STATES)[number];

export const REAL_LINE_OUTCOMES = ['over', 'under', 'push'] as const;
export type RealLineOutcome = (typeof REAL_LINE_OUTCOMES)[number];

export const REAL_LINE_WINDOW_TYPES = ['L5', 'L10', 'L20', 'season'] as const;
export type RealLineWindowType = (typeof REAL_LINE_WINDOW_TYPES)[number];

// -- V1-A1-2 evidence-profile enums (mirror supabase/migrations/20260714000000_evidence_enums.sql) --
//
// Authorities:
//   docs/product/EVIDENCE_PROFILE_METHOD_V1.md
//     - §D.1 + GD-15 → EVIDENCE_CLASSIFICATIONS (seven-value taxonomy)
//     - §B.7        → EVIDENCE_DIRECTIONS
//     - A1 §25 + §17 + §13.3 → EVIDENCE_EVALUATED_SOURCE_KINDS
//     - §C.2 / §C.3 / §C.5 / §C.6 / §C.7 → EVIDENCE_QUALITY_CAP_REASONS
//     - §A.4 RME-3 → EVIDENCE_ONE_SIDED_STATES
//     - §E.1 closed vocabulary → EVIDENCE_REASON_CODES
//     - §E.2 + DR-26 → EVIDENCE_REASON_CATEGORIES
//
// Every string here is verbatim identical to the Postgres enum label; the
// tests/evidence/schema.test.ts suite asserts that identity so a divergence
// fails at test time rather than at run time.

export const EVIDENCE_CLASSIFICATIONS = [
  'strong_over_evidence',
  'moderate_over_evidence',
  'mixed_evidence',
  'moderate_under_evidence',
  'strong_under_evidence',
  'insufficient_evidence',
  'unavailable',
] as const;
export type EvidenceClassification = (typeof EVIDENCE_CLASSIFICATIONS)[number];

export const EVIDENCE_DIRECTIONS = ['over', 'under'] as const;
export type EvidenceDirection = (typeof EVIDENCE_DIRECTIONS)[number];

export const EVIDENCE_EVALUATED_SOURCE_KINDS = [
  'sportsbook_consensus',
  'sportsbook_specific',
  'pickem',
  'user_entered',
] as const;
export type EvidenceEvaluatedSourceKind =
  (typeof EVIDENCE_EVALUATED_SOURCE_KINDS)[number];

export const EVIDENCE_QUALITY_CAP_REASONS = [
  'none',
  'insufficient_book_coverage',
  'stale_current_market',
  'market_disagrees_with_history',
  'push_heavy_sample',
  'one_sided_offering',
] as const;
export type EvidenceQualityCapReason =
  (typeof EVIDENCE_QUALITY_CAP_REASONS)[number];

export const EVIDENCE_ONE_SIDED_STATES = [
  'over_only',
  'under_only',
  'neither',
] as const;
export type EvidenceOneSidedState = (typeof EVIDENCE_ONE_SIDED_STATES)[number];

// Closed reason-code vocabulary per §E.1. ABNORMAL_DISPERSION is RESERVED
// (DR-27 / §I.3) and MUST NOT be emitted by an `evidence_method_v1` writer.
// See EVIDENCE_METHOD_VERSION and the reserved-code assertion in
// tests/evidence/schema.test.ts.
export const EVIDENCE_REASON_CODES = [
  'window_agreement_support',
  'favorable_consensus_difference',
  'positive_margin_support',
  'unfavorable_consensus_difference',
  'negative_margin_support',
  'margin_measures_disagree',
  'market_disagrees_with_history',
  'windows_disagree',
  'stale_current_market',
  'insufficient_book_coverage',
  'push_heavy_sample',
  'one_sided_offering',
  'source_unavailable',
  'insufficient_l10_sample',
  'incomplete_historical_coverage',
  'unresolved_player_mapping',
  'unresolved_event_mapping',
  'no_current_market',
  'postponed_game',
  'canceled_game',
  // V1-A1-2a addition (owner ruling 2026-07-15, DR-28) — placed before
  // `abnormal_dispersion` to match the ordinal position produced by the
  // migration's `ALTER TYPE ... ADD VALUE ... BEFORE 'abnormal_dispersion'`.
  // The RESERVED terminal value `abnormal_dispersion` stays last.
  // V1-A1-2a hand-off §6 authorized V1-A1-3 to make this update when the
  // engine wires the emitter for `no_unique_consensus_line`.
  'no_unique_consensus_line',
  'abnormal_dispersion',
] as const;
export type EvidenceReasonCode = (typeof EVIDENCE_REASON_CODES)[number];

/**
 * Reason codes in the §E.1 vocabulary that are RESERVED per DR-27 / §I.3
 * clause (2) and MUST NOT be emitted by an `evidence_method_v1` writer.
 * The V1-A1-3 engine + V1-A1-4 template writer MUST refuse to attach any
 * value in this set.
 */
export const EVIDENCE_RESERVED_REASON_CODES: ReadonlySet<EvidenceReasonCode> =
  new Set<EvidenceReasonCode>(['abnormal_dispersion']);

export const EVIDENCE_REASON_CATEGORIES = [
  'support',
  'contradiction',
  'quality',
] as const;
export type EvidenceReasonCategory = (typeof EVIDENCE_REASON_CATEGORIES)[number];

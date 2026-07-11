// Immutable identity contracts.
//
// Reconciliation results are always tagged unions so the caller cannot
// accidentally treat a queued or quarantined outcome as an approved
// mapping (spec §7.3, Odds §6.1).

import type {
  AliasScopeKind,
  AliasType,
  EventQueueReason,
  GameStatus,
  MappingAction,
  MappingState,
  PlayerQueueReason,
  PlayerStatus,
  Provider,
  QueueResolution,
  TeamClassification,
} from '../shared/enums.js';

// -- Internal identities ---------------------------------------------------

export interface InternalTeam {
  readonly internal_team_id: string;
  readonly display_name: string;
  readonly abbreviation: string;
  readonly classification: TeamClassification;
  readonly city: string;
  readonly conference: string | null;
  readonly lineage_note: string | null;
}

export interface InternalPlayer {
  readonly internal_player_id: string;
  readonly display_name: string;
  readonly normalized_name: string;
  readonly current_team_id: string | null;
  readonly status: PlayerStatus;
}

export interface InternalGame {
  readonly internal_game_id: string;
  readonly season: number;
  readonly season_type: 2 | 3;
  readonly home_team_id: string;
  readonly away_team_id: string;
  readonly scheduled_start_utc: string; // ISO-8601 UTC
  readonly actual_start_utc: string | null;
  readonly status: GameStatus;
  readonly postseason: boolean;
}

// -- Provider identities ---------------------------------------------------

export interface ProviderTeam {
  readonly provider: Provider;
  readonly provider_team_id: string;
  readonly internal_team_id: string | null;
  readonly raw_full_name: string;
  readonly raw_name: string;
  readonly raw_abbreviation: string;
  readonly raw_city: string;
  readonly raw_conference: string | null;
  readonly classification: TeamClassification;
  readonly mapping_state: MappingState;
}

export interface ProviderPlayer {
  readonly provider: Provider;
  readonly provider_player_id: string;
  readonly internal_player_id: string | null;
  readonly raw_first_name: string;
  readonly raw_last_name: string;
  readonly raw_full_name: string;
  readonly normalized_name: string;
  readonly provider_team_id_seen: string | null;
  readonly mapping_state: MappingState;
  readonly alias_version_at_mapping: number | null;
}

export interface ProviderGame {
  readonly provider: Provider;
  readonly provider_game_id: string;
  readonly internal_game_id: string | null;
  readonly raw_home_team: string;
  readonly raw_away_team: string;
  readonly raw_commence_time: string; // ISO-8601 UTC
  readonly time_delta_seconds: number | null;
  readonly mapping_state: MappingState;
}

// -- Aliases ---------------------------------------------------------------

export interface Alias {
  readonly alias_id: string;
  readonly internal_entity_id: string;
  readonly scope_kind: AliasScopeKind;
  readonly alias_type: AliasType;
  readonly alias_text: string;
  readonly normalized_alias: string;
  readonly alias_version: number;
  readonly is_active: boolean;
  readonly approved_by: string;
  readonly approved_at: string;
  readonly superseded_by?: string;
  readonly superseded_at?: string;
}

// -- Reconciliation input --------------------------------------------------

export interface EventReconciliationInput {
  readonly provider: Provider;
  readonly provider_game_id: string;
  readonly raw_home_team: string;
  readonly raw_away_team: string;
  readonly raw_commence_time: string; // ISO-8601 UTC
}

export interface PlayerReconciliationInput {
  readonly provider: Provider;
  readonly provider_player_id: string;
  readonly raw_first_name: string;
  readonly raw_last_name: string;
  readonly raw_full_name: string;
  readonly provider_team_id_seen: string | null;
  readonly provider_game_id_seen: string | null;
}

// -- Reconciliation outcomes (tagged unions) -------------------------------

export type EventReconciliationOutcome =
  | {
      readonly kind: 'approved';
      readonly internal_game_id: string;
      readonly match_method: 'exact_time' | 'time_tolerance';
      readonly time_delta_seconds: number;
      readonly candidate_internal_game_ids: readonly string[];
      readonly action: MappingAction;
    }
  | {
      readonly kind: 'queued';
      readonly reason: EventQueueReason;
      readonly reason_detail: string;
      readonly candidate_internal_game_ids: readonly string[];
      readonly resolution: QueueResolution;
    }
  | {
      readonly kind: 'quarantined';
      readonly reason: EventQueueReason;
      readonly reason_detail: string;
      readonly candidate_internal_game_ids: readonly string[];
      readonly resolution: QueueResolution;
    };

export type PlayerReconciliationOutcome =
  | {
      readonly kind: 'approved';
      readonly internal_player_id: string;
      readonly match_method:
        | 'reviewed_provider_mapping'
        | 'reviewed_alias'
        | 'normalized_name_plus_context';
      readonly candidate_internal_player_ids: readonly string[];
      readonly alias_version_at_mapping: number | null;
      readonly action: MappingAction;
    }
  | {
      readonly kind: 'proposed_for_review';
      readonly internal_player_id: string;
      readonly match_method: 'normalized_name_plus_context';
      readonly candidate_internal_player_ids: readonly string[];
      readonly reason_detail: string;
    }
  | {
      readonly kind: 'queued';
      readonly reason: PlayerQueueReason;
      readonly reason_detail: string;
      readonly candidate_internal_player_ids: readonly string[];
      readonly resolution: QueueResolution;
    }
  | {
      readonly kind: 'quarantined';
      readonly reason: PlayerQueueReason;
      readonly reason_detail: string;
      readonly candidate_internal_player_ids: readonly string[];
      readonly resolution: QueueResolution;
    };

// -- Mapping-history event -------------------------------------------------

export interface MappingHistoryEvent {
  readonly provider: Provider;
  readonly entity_kind: 'team' | 'player' | 'game' | 'team_alias' | 'player_alias';
  readonly provider_entity_id: string;
  readonly internal_entity_id: string | null;
  readonly prior_internal_entity_id: string | null;
  readonly action: MappingAction;
  readonly reason: string;
  readonly mapping_version: number | null;
  readonly alias_version: number | null;
  readonly actor: string;
  readonly actor_note: string | null;
  readonly created_at: string; // ISO-8601 UTC
}

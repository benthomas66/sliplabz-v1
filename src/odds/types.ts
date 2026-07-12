// Odds API ingestion domain types.
//
// Authority: Odds sub-spec §§4, 7, 10, 11, 12, 14, 15; complete spec §11.4.

import type {
  DfsPromotionType,
  EventPresenceState,
  FreshnessState,
  OddsapiEndpoint,
  OddsapiProvenance,
  OddsapiRequestKind,
  OddsapiRunState,
  OfferingConflictReason,
  OfferingState,
  OutcomeSide,
  PriceSemantic,
  SnapshotSchemaState,
  SourceClass,
} from '../shared/enums.js';

// -- Provider-shaped response envelopes ------------------------------------

/**
 * Odds API events endpoint row (Odds §4.3).
 */
export interface OddsapiEventRow {
  readonly id: string;
  readonly sport_key: string;
  readonly sport_title: string;
  readonly commence_time: string;
  readonly home_team: string;
  readonly away_team: string;
}

export interface OddsapiEventOddsResponse {
  readonly id?: string;
  readonly sport_key?: string;
  readonly sport_title?: string;
  readonly commence_time?: string;
  readonly home_team?: string;
  readonly away_team?: string;
  readonly bookmakers?: ReadonlyArray<OddsapiBookmakerBlock>;
}

export interface OddsapiBookmakerBlock {
  readonly key: string;
  readonly title?: string;
  readonly last_update?: string;
  readonly markets?: ReadonlyArray<OddsapiMarketBlock>;
}

export interface OddsapiMarketBlock {
  readonly key: string;
  readonly last_update?: string;
  readonly outcomes?: ReadonlyArray<OddsapiOutcomeRow>;
}

/**
 * Odds §10.7 outcome. `description` is the player display name; `name` is
 * Over / Under.
 */
export interface OddsapiOutcomeRow {
  readonly name: string;
  readonly description?: string;
  readonly price?: number;
  readonly point?: number;
  readonly multiplier?: number | null;
}

// -- Ingestion run scaffolding --------------------------------------------

export interface OddsapiRunOpenInput {
  readonly oddsapi_ingestion_run_id: string;
  readonly request_kind: OddsapiRequestKind;
  readonly endpoint: OddsapiEndpoint;
  readonly requested_provider_event_id?: string;
  readonly requested_market_keys?: ReadonlyArray<string>;
  readonly requested_bookmaker_keys?: ReadonlyArray<string>;
  readonly requested_regions?: ReadonlyArray<string>;
  readonly requested_effective_time?: string;
  readonly request_params?: Readonly<Record<string, unknown>>;
  readonly redacted_request_url?: string;
  readonly started_at: string;
}

export interface OddsapiRunOpen {
  readonly oddsapi_ingestion_run_id: string;
  readonly request_kind: OddsapiRequestKind;
  readonly endpoint: OddsapiEndpoint;
  readonly requested_provider_event_id: string | null;
  readonly requested_market_keys: ReadonlyArray<string>;
  readonly requested_bookmaker_keys: ReadonlyArray<string>;
  readonly requested_regions: ReadonlyArray<string>;
  readonly requested_effective_time: string | null;
  readonly request_params: Readonly<Record<string, unknown>>;
  readonly redacted_request_url: string | null;
  readonly started_at: string;
  readonly result_state: 'running';
}

export interface OddsapiRunClosed {
  readonly oddsapi_ingestion_run_id: string;
  readonly request_kind: OddsapiRequestKind;
  readonly endpoint: OddsapiEndpoint;
  readonly requested_provider_event_id: string | null;
  readonly requested_market_keys: ReadonlyArray<string>;
  readonly requested_bookmaker_keys: ReadonlyArray<string>;
  readonly requested_regions: ReadonlyArray<string>;
  readonly requested_effective_time: string | null;
  readonly request_params: Readonly<Record<string, unknown>>;
  readonly redacted_request_url: string | null;
  readonly started_at: string;
  readonly completed_at: string;
  readonly http_status_last: number | null;
  readonly content_type_last: string | null;
  readonly response_headers_last: Readonly<Record<string, string | number>>;
  readonly result_state: OddsapiRunState;
  readonly failure_detail: string | null;
  readonly quota_forecast: number | null;
  readonly quota_observed: number | null;
  readonly quota_delta_flag: string | null;
  readonly x_requests_used: number | null;
  readonly x_requests_remaining: number | null;
  readonly x_requests_last: number | null;
  readonly parser_version: number;
  readonly normalization_version: number;
}

// -- Event snapshot & presence --------------------------------------------

export interface OddsapiEventSnapshotRow {
  readonly oddsapi_event_snapshot_id: string;
  readonly oddsapi_ingestion_run_id: string;
  readonly raw_response_id: string | null;
  readonly provider_event_id: string;
  readonly raw_sport_key: string;
  readonly raw_sport_title: string;
  readonly raw_home_team: string;
  readonly raw_away_team: string;
  readonly raw_commence_time: string | null;
  readonly raw_payload: unknown;
  readonly content_hash: string;
  readonly observed_at: string;
  readonly linked_internal_game_id: string | null;
  readonly linked_provider_game_row_id: string | null;
}

export interface OddsapiEventPresenceRow {
  readonly provider_event_id: string;
  readonly latest_complete_run_id: string | null;
  readonly presence_state: EventPresenceState;
  readonly first_seen_at: string | null;
  readonly last_seen_at: string | null;
  readonly observed_changed_at: string | null;
  readonly consecutive_omission_count: number;
  readonly last_observed_snapshot_id: string | null;
  readonly linked_internal_game_id: string | null;
}

// -- Market snapshot & offering -------------------------------------------

export interface MarketSnapshotWrite {
  readonly market_snapshot_id: string;
  readonly oddsapi_ingestion_run_id: string;
  readonly raw_response_id: string | null;
  readonly provider_event_id: string;
  readonly linked_internal_game_id: string | null;
  readonly bookmaker_key: string;
  readonly bookmaker_title: string;
  readonly source_class: SourceClass;
  readonly market_key: string;
  readonly request_kind: OddsapiRequestKind;
  readonly provenance: OddsapiProvenance;
  readonly provider_last_update: string | null;
  readonly provider_snapshot_time: string | null;
  readonly retrieved_at: string;
  readonly observed_at: string | null;
  readonly freshness_state: FreshnessState;
  readonly schema_state: SnapshotSchemaState;
  readonly raw_outcome_row_count: number;
  readonly duplicate_group_count: number;
  readonly conflict_group_count: number;
}

export interface MarketOfferingWrite {
  readonly market_offering_id: string;
  readonly market_snapshot_id: string;
  readonly raw_player_description: string;
  readonly normalized_player_name: string;
  readonly internal_player_id: string | null;
  readonly side: OutcomeSide;
  readonly point: number;
  readonly raw_price_american: number;
  readonly raw_multiplier: number | null;
  readonly price_semantic: PriceSemantic;
  readonly promotion_type: DfsPromotionType;
  readonly offering_state: OfferingState;
  readonly conflict_reason: OfferingConflictReason | null;
  readonly duplicate_count: number;
  readonly provider_last_update: string | null;
  readonly source_hash: string;
  readonly eligibility_note: string;
}

export interface MarketOfferingRawRow {
  readonly market_offering_raw_row_id: string;
  readonly market_snapshot_id: string;
  readonly raw_row_index: number;
  readonly raw_name: string;
  readonly raw_description: string;
  readonly raw_price: number | null;
  readonly raw_point: number | null;
  readonly raw_multiplier: number | null;
  readonly raw_payload: unknown;
  readonly canonical_offering_id: string | null;
  readonly disposition: 'contributed' | 'duplicate' | 'quarantined';
  readonly observed_at: string;
}

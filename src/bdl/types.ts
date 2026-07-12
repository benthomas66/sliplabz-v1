// BDL ingestion domain types.
//
// Authority:
//   BDL sub-spec §3B (approved V1 request shapes)
//   BDL sub-spec §5 (cursor pagination)
//   BDL sub-spec §9A (core V1 stat mapping: pts, reb, ast, fg3m)
//   BDL sub-spec §19 (canonical storage contract)
//   BDL sub-spec §20 (availability lifecycle)
//   Complete spec §11 (canonical storage model)
//
// These types are the shape SlipLabz sees. They do not attempt to model
// every provider field — only the ones V1-2 ingests, normalizes, or
// preserves for traceability. Raw payloads are kept intact separately.

import type {
  AvailabilityInterpretationState,
  BdlEndpoint,
  BdlMinutesStatus,
  BdlRunState,
  GameStatus,
  InvalidationEntityKind,
  InvalidationReason,
  PlayerStatEligibility,
  PlayerStatQuarantineReason,
  PostFinalReconciliationKind,
  TeamClassification,
} from '../shared/enums.js';

// -- Provider-shaped response envelopes ------------------------------------

/**
 * BDL pagination envelope: `data: T[]` and `meta.next_cursor` per BDL §5.
 * Non-paginated endpoints omit `meta.next_cursor`.
 */
export interface BdlPaginatedResponse<T> {
  readonly data: ReadonlyArray<T>;
  readonly meta?: { readonly next_cursor?: string | null | undefined };
}

/**
 * BDL team object (subset). Full raw payload is preserved separately;
 * only these fields are directly used by normalization.
 */
export interface BdlTeam {
  readonly id: number;
  readonly full_name?: string | null;
  readonly name?: string | null;
  readonly abbreviation?: string | null;
  readonly city?: string | null;
  readonly conference?: string | null;
}

export interface BdlPlayerLite {
  readonly id: number;
  readonly first_name?: string | null;
  readonly last_name?: string | null;
  readonly team?: BdlTeam | null;
}

/**
 * BDL game object (subset). `status` is the authoritative provider field
 * per BDL §10; period and time are retained but never determine finality.
 */
export interface BdlGame {
  readonly id: number;
  readonly date?: string | null;
  readonly season?: number | null;
  readonly season_type?: number | null;
  readonly status?: string | null;
  readonly period?: number | null;
  readonly time?: string | null;
  readonly postseason?: boolean | null;
  readonly home_team?: BdlTeam | null;
  readonly visitor_team?: BdlTeam | null;
  readonly home_team_id?: number | null;
  readonly visitor_team_id?: number | null;
}

/**
 * BDL player_stat row. Raw minutes may be `"--"`, null, empty, or a numeric
 * string. Counting stats may be null (BDL §9). Preserved verbatim.
 */
export interface BdlPlayerStatRow {
  readonly id?: number;
  readonly player?: BdlPlayerLite | null;
  readonly game?: BdlGame | null;
  readonly team?: BdlTeam | null;
  readonly min?: string | number | null;
  readonly pts?: number | null;
  readonly reb?: number | null;
  readonly ast?: number | null;
  readonly fg3m?: number | null;
  readonly stl?: number | null;
  readonly blk?: number | null;
  readonly turnover?: number | null;
  readonly fgm?: number | null;
  readonly fga?: number | null;
  readonly fg3a?: number | null;
  readonly ftm?: number | null;
  readonly fta?: number | null;
  readonly oreb?: number | null;
  readonly dreb?: number | null;
  readonly pf?: number | null;
  readonly plus_minus?: number | null;
  // Provider IDs may also appear under nested objects; the raw payload
  // preserves them either way.
}

export interface BdlPlayerInjury {
  readonly id?: number | string;
  readonly player?: BdlPlayerLite | null;
  readonly status?: string | null;
  readonly description?: string | null;
  readonly return_date?: string | null;
}

// -- SlipLabz normalized shapes --------------------------------------------

/**
 * The four V1 launch stats plus the fields BDL §9 permits null-to-zero on
 * an eligible played row. Fields kept nullable at type level; normalization
 * rules govern when null becomes 0.
 */
export interface NormalizedCountingStats {
  readonly pts: number | null;
  readonly reb: number | null;
  readonly ast: number | null;
  readonly fg3m: number | null;
  readonly stl: number | null;
  readonly blk: number | null;
  readonly turnover: number | null;
  readonly fgm: number | null;
  readonly fga: number | null;
  readonly fg3a: number | null;
  readonly ftm: number | null;
  readonly fta: number | null;
  readonly oreb: number | null;
  readonly dreb: number | null;
  readonly pf: number | null;
}

export interface MinutesParseResult {
  readonly status: BdlMinutesStatus;
  readonly parsed_minutes: number | null;
  readonly raw_minutes: string | null; // exactly-as-observed; may be null when the provider omitted the field
}

export interface GameStatusMappingResult {
  readonly canonical_status: GameStatus;
  readonly raw_status: string;
  readonly is_unknown: boolean;
}

// -- Ingestion run scaffolding --------------------------------------------

export interface IngestionRunOpen {
  readonly bdl_ingestion_run_id: string;
  readonly endpoint: BdlEndpoint;
  readonly request_params: Readonly<Record<string, unknown>>;
  readonly query_scope_key: string;
  readonly started_at: string;
  readonly completion_state: 'running';
}

export interface RawResponsePage {
  readonly raw_response_id: string;
  readonly bdl_ingestion_run_id: string;
  readonly page_index: number;
  readonly cursor_used_to_fetch: string | null;
  readonly cursor_returned_next: string | null;
  readonly retrieved_at: string;
  readonly http_status: number;
  readonly content_type: string | null;
  readonly response_headers: Readonly<Record<string, string | number>>;
  readonly response_body: unknown | null;
  readonly response_body_text: string | null;
  readonly response_body_bytes: number | null;
  readonly observed_row_count: number | null;
}

export interface IngestionRunClosed {
  readonly bdl_ingestion_run_id: string;
  readonly endpoint: BdlEndpoint;
  readonly request_params: Readonly<Record<string, unknown>>;
  readonly query_scope_key: string;
  readonly started_at: string;
  readonly completed_at: string;
  readonly page_count: number;
  readonly row_count: number;
  readonly cursor_chain_sent: ReadonlyArray<string | null>;
  readonly cursor_chain_returned: ReadonlyArray<string | null>;
  readonly http_status_last: number | null;
  readonly content_type_last: string | null;
  readonly response_headers_last: Readonly<Record<string, string | number>>;
  readonly completion_state: BdlRunState;
  readonly failure_detail: string | null;
  readonly normalization_version: number;
}

// -- Watermark and roster/state ---------------------------------------------

export interface ImportWatermark {
  readonly endpoint: BdlEndpoint;
  readonly query_scope_key: string;
  readonly completed_at: string | null;
  readonly completed_by_run_id: string | null;
  readonly completed_row_count: number | null;
  readonly completed_page_count: number | null;
  readonly previous_completed_at: string | null;
  readonly previous_completed_by_run_id: string | null;
}

export interface ActivePlayerPresence {
  readonly provider_player_id: string;
  readonly latest_complete_run_id: string | null;
  readonly present_in_latest_complete: boolean;
  readonly first_seen_active_at: string | null;
  readonly last_seen_active_at: string | null;
  readonly last_marked_not_seen_at: string | null;
  readonly latest_provider_team_id: string | null;
}

export interface AvailabilityCurrentState {
  readonly provider_player_id: string;
  readonly internal_player_id: string | null;
  readonly interpretation_state: AvailabilityInterpretationState;
  readonly first_seen_at: string | null;
  readonly last_seen_at: string | null;
  readonly observed_changed_at: string | null;
  readonly last_absent_at: string | null;
  readonly latest_complete_run_id: string | null;
  readonly latest_snapshot_id: string | null;
  readonly latest_source_status: string;
  readonly latest_source_comment: string;
  readonly latest_source_return_date_text: string;
}

// -- Player-game stats and history ----------------------------------------

export interface NormalizedPlayerGameStat {
  readonly provider: 'balldontlie';
  readonly provider_player_id: string;
  readonly provider_game_id: string;
  readonly provider_team_id: string | null;
  readonly raw_minutes: string | null;
  readonly parsed_minutes: number | null;
  readonly minutes_status: BdlMinutesStatus;
  readonly raw_stats: NormalizedCountingStats;
  readonly normalized_stats: NormalizedCountingStats;
  readonly source_hash: string;
  readonly eligibility_state: PlayerStatEligibility;
  readonly quarantine_reason: PlayerStatQuarantineReason | null;
  readonly season: number | null;
  readonly season_type: number | null;
  readonly normalization_version: number;
}

export interface PlayerGameStatDiff {
  readonly change_kind:
    | 'initial_observation'
    | 'material_correction'
    | 'metadata_change';
  readonly prior_source_hash: string | null;
  readonly new_source_hash: string;
  readonly changed_fields: ReadonlyArray<string>;
  readonly minutes_state_changed: boolean;
}

export interface RecomputationInvalidationInput {
  readonly entity_kind: InvalidationEntityKind;
  readonly entity_id: string;
  readonly reason: InvalidationReason;
  readonly triggering_history_id: string | null;
  readonly triggering_observation_id: string | null;
  readonly provider: 'balldontlie';
  readonly provider_player_id: string | null;
  readonly provider_game_id: string | null;
  readonly changed_fields: ReadonlyArray<string>;
  readonly observed_at: string;
}

// -- Post-final reconciliation ---------------------------------------------

export interface PostFinalReconciliationEntry {
  readonly internal_game_id: string;
  readonly provider_game_id: string;
  readonly kind: PostFinalReconciliationKind;
  readonly due_at: string;
  readonly triggering_observation_id: string;
}

// -- Team classification helpers -------------------------------------------

export interface TeamClassificationMap {
  /**
   * Deterministic classification map from BDL provider_team_id → application
   * classification. See BDL §12B.4. Values that are not present in the map
   * default to `unknown` at ingestion time; the review queue owns re-mapping.
   */
  readonly by_provider_team_id: ReadonlyMap<string, TeamClassification>;
}

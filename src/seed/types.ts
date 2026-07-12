// V1-4b seed pipeline domain types.
//
// Authority:
//   Complete spec §3.6 (launch historical seeding)
//   Complete spec §7.10.1 / §7.10.2 (close boundary, canonical closing point)
//   Complete spec §10.13 (historical seed requests)
//   Odds sub-spec §14.11 (V1 seed policy, provenance & time)

import type {
  CloseCaptureState,
  CoverageLabel,
  ClosingSelectionMethod,
} from '../shared/enums.js';

/**
 * Historical event returned by `/v4/historical/sports/{sport}/events`.
 */
export interface HistoricalEventRow {
  readonly id: string;
  readonly sport_key: string;
  readonly sport_title: string;
  readonly commence_time: string;
  readonly home_team: string;
  readonly away_team: string;
  /** Provider snapshot timestamp for THIS event-discovery response. */
  readonly snapshot_ts?: string;
  readonly previous_ts?: string | null;
  readonly next_ts?: string | null;
}

export interface HistoricalEventOddsResponse {
  readonly timestamp: string;
  readonly previous_timestamp?: string | null;
  readonly next_timestamp?: string | null;
  readonly data?: {
    readonly id: string;
    readonly sport_key: string;
    readonly commence_time?: string;
    readonly home_team?: string;
    readonly away_team?: string;
    readonly bookmakers?: ReadonlyArray<{
      readonly key: string;
      readonly title?: string;
      readonly last_update?: string;
      readonly markets?: ReadonlyArray<{
        readonly key: string;
        readonly last_update?: string;
        readonly outcomes?: ReadonlyArray<{
          readonly name: string;
          readonly description?: string;
          readonly price?: number;
          readonly point?: number;
        }>;
      }>;
    }>;
  };
}

/**
 * Governor scope for a seed run OR a Stage 1 probe. Cannot be modified by
 * the pipeline once a run is opened.
 */
export interface SeedRunScope {
  readonly run_kind: 'seed' | 'stage1_probe';
  readonly label: string;
  readonly credit_budget: number;
  readonly requested_market_keys: ReadonlyArray<string>;
  readonly requested_bookmaker_keys: ReadonlyArray<string>;
  readonly attempted_slate_dates: ReadonlyArray<string>;
}

export interface SeedRunOpen {
  readonly seed_run_id: string;
  readonly scope: SeedRunScope;
  readonly started_at: string;
  readonly completion_state: 'running';
  readonly credits_observed_total: number;
}

export interface SeedRunClosed {
  readonly seed_run_id: string;
  readonly scope: SeedRunScope;
  readonly started_at: string;
  readonly completed_at: string;
  readonly completion_state:
    | 'complete'
    | 'partial'
    | 'aborted_credit_budget'
    | 'failed_transport'
    | 'failed_authentication_or_access'
    | 'failed_forbidden_or_subscription'
    | 'failed_invalid_request'
    | 'failed_schema_drift'
    | 'failed_parse';
  readonly failure_detail: string | null;
  readonly credits_observed_total: number;
  readonly events_probed: number;
  readonly events_admitted: number;
  readonly events_stale_rejected: number;
  readonly events_no_snapshot: number;
}

/**
 * Result of evaluating a returned historical snapshot against the requested
 * close-boundary timestamp. §7.10.1 close-capture eligibility.
 */
export interface CloseCaptureEvaluation {
  readonly requested_close_boundary_utc: string;
  readonly returned_snapshot_ts: string | null;
  readonly age_seconds_before_boundary: number | null;
  readonly close_capture_state: CloseCaptureState;
  readonly detail: string;
}

/**
 * A single historical source_closing_quote candidate (per bookmaker × market)
 * derived from a returned final snapshot. §7.10.1 / §7.10.2 §11.5.
 */
export interface HistoricalSourceClosingQuoteCandidate {
  readonly provider_event_id: string;
  readonly bookmaker_key: string;
  readonly market_key: string;
  readonly source_class: 'sportsbook' | 'dfs_pickem' | 'unknown';
  readonly closing_point: number | null;
  readonly closing_over_price: number | null;
  readonly closing_under_price: number | null;
  readonly provider_last_update: string | null;
  readonly close_capture_state: CloseCaptureState;
  readonly detail: string;
}

/**
 * Coverage report row per §8b "coverage report by date, market, source,
 * player, exclusion reason". Aggregated inside the pipeline; persisted only
 * as part of the report file (not the schema).
 */
export interface CoverageReportRow {
  readonly slate_date: string;
  readonly market_key: string;
  readonly bookmaker_key: string;
  readonly player_display: string | null;
  readonly outcome:
    | 'admitted'
    | 'no_snapshot'
    | 'close_capture_stale'
    | 'unlaunched_market_key'
    | 'unallowlisted_bookmaker_key'
    | 'dfs_pickem_excluded_from_sportsbook_consensus'
    | 'unresolved_event_mapping'
    | 'unresolved_player_mapping';
  readonly reason_detail: string;
  readonly canonical_selection_method?: ClosingSelectionMethod;
  readonly coverage_label?: CoverageLabel;
}

/**
 * Quota ledger entry appended by every request. The seed run's running
 * total is `sum(observed_x_requests_last)`.
 */
export interface QuotaLedgerEntry {
  readonly at: string;
  readonly endpoint: 'historical_events' | 'historical_event_odds';
  readonly forecast: number;
  readonly observed_x_requests_last: number | null;
  readonly x_requests_remaining: number | null;
  readonly x_requests_used: number | null;
  readonly running_total: number;
  readonly budget_remaining: number;
}

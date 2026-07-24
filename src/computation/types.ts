// V1-5 shared computation types.
//
// These types are the SINGLE source-of-truth shape for read-model output.
// Both product surfaces and Brief consume them; a Brief/app equality test
// proves identical outputs from identical inputs (ticket §9 required test).

import type { FreshnessState } from '../shared/enums.js';

/** One eligible sportsbook offering at the (game, player, market) grain. */
export interface CurrentOffering {
  /** Book identifier (Odds API provider_key). */
  readonly bookmaker_key: string;
  /** Display title curated by the reviewed registry. */
  readonly display_title: string;
  /** The offered point value. */
  readonly point: number;
  /** American-format Over price when present. */
  readonly over_price: number | null;
  /** American-format Under price when present. */
  readonly under_price: number | null;
  /** Provider snapshot time (last_update) for THIS offering. */
  readonly provider_last_update: string | null;
  /** SlipLabz observation time for THIS offering. */
  readonly observed_at: string;
  /** Snapshot the offering came from — for audit walk-back. */
  readonly source_snapshot_id: string;
  /** Offering id — for audit walk-back. */
  readonly market_offering_id: string;
}

/**
 * Line consensus (sportsbook-only) per §7.6. Modal point across eligible
 * sportsbook books at the (game, player, market) grain. `tied_no_unique_mode`
 * and `no_eligible_source` return null; the coverage_label distinguishes.
 */
export interface LineConsensusResult {
  readonly consensus_point: number | null;
  readonly selection_method:
    | 'single_book'
    | 'unique_modal'
    | 'tied_no_unique_mode'
    | 'no_eligible_source';
  readonly total_eligible_sportsbook_count: number;
  readonly sportsbook_count_at_selected_point: number | null;
  readonly coverage_label:
    | 'complete'
    | 'single_book'
    | 'unresolved_consensus'
    | 'no_line';
  readonly method_version: number;
}

/** Line range: min/max point across eligible sportsbook offerings. */
export interface LineRangeResult {
  readonly min_point: number | null;
  readonly max_point: number | null;
  readonly method_version: number;
}

/** Exact-point count for a single point. */
export interface PointCount {
  readonly point: number;
  readonly book_count: number;
}

/**
 * Exact-point distribution per §7.7. NEVER interpolated — a value that
 * appears here MUST equal a point observed in at least one eligible
 * sportsbook offering.
 */
export interface PointDistributionResult {
  readonly counts: ReadonlyArray<PointCount>;
  readonly method_version: number;
}

/** Distinct sportsbook count offering ANY point at the grain. */
export interface EligibleBookCountResult {
  readonly count: number;
  readonly method_version: number;
}

/**
 * First-observed consensus per §7.8. NEVER labeled "opening line".
 */
export interface FirstObservedResult {
  readonly point: number | null;
  readonly at: string | null;
  readonly method_version: number;
}

/**
 * Movement summary per §13.
 * A grain-level summary of point transitions plus price and side changes
 * across the observation window. This is a compact aggregate; full detail
 * lives in movement_events (walk-back-able).
 */
export interface MovementSummaryResult {
  readonly first_observed_point: number | null;
  readonly current_point: number | null;
  readonly net_point_movement: number | null; // current - first, when both non-null
  readonly point_changes_observed: number;
  readonly over_price_changes: number;
  readonly under_price_changes: number;
  readonly side_removed_count: number;
  readonly side_added_count: number;
  readonly method_version: number;
}

/** Freshness label mirrors Odds §19.2 states. Read-model computes from
 *  the latest current-poll snapshot for the grain. */
export interface FreshnessResult {
  readonly state: FreshnessState;
  readonly last_observed_at: string | null;
  readonly method_version: number;
}

/**
 * One-sided-offering classification per amendment §9.4 and DR-18.
 * Grain-level summary across all eligible sportsbook offerings for the
 * (game, player, market) grain:
 *   - `'over_only'`  — at least one book quoted an Over price and NO book
 *                     quoted an Under price anywhere for the grain.
 *   - `'under_only'` — mirror image.
 *   - `'neither'`    — both sides are quoted somewhere in the grain
 *                     (i.e. the grain is NOT one-sided).
 *   - `null`         — no eligible sportsbook offerings on the grain.
 * Consumed directly by V1-A1-3 §C.7 to attach `ONE_SIDED_OFFERING` and
 * clamp `C_MA := 0` per DR-18.
 */
export type OneSidedOfferingKind = 'over_only' | 'under_only' | 'neither';

/**
 * Per-book detail (paid tier). Field-level capability control lives in the
 * capabilityFilter step.
 *
 * `one_sided` (RME-3) is a grain-level summary derived from `offerings` and
 * is truth-about-availability; it is NEVER paywalled per §16.8.
 */
export interface BookDetailResult {
  readonly offerings: ReadonlyArray<CurrentOffering>;
  readonly one_sided: OneSidedOfferingKind | null;
  readonly method_version: number;
}

/**
 * Availability context for the player at the grain, from the derived
 * `bdl_availability_current_state`. Never fabricates a "healthy" label.
 */
export interface AvailabilityContextResult {
  readonly presence_state:
    | 'currently_reported'
    | 'not_returned_latest_complete_snapshot'
    | 'stale_feed'
    | 'unresolved_player'
    | 'source_unavailable';
  readonly source_status: string;
  readonly source_comment: string;
  readonly source_return_date_text: string;
  readonly observed_at: string | null;
  readonly method_version: number;
}

/**
 * Real-line window (L5/L10/L20/season). Re-exports the shape from
 * src/lines/realLineWindows.ts and adds method version metadata.
 */
export interface RealLineWindowResult {
  readonly window_type: 'L5' | 'L10' | 'L20' | 'season';
  readonly requested_n: number;
  readonly eligible_n: number;
  readonly incomplete: boolean;
  readonly over_count: number;
  readonly under_count: number;
  readonly push_count: number;
  readonly over_rate: number | null;
  readonly avg_margin: number | null;
  readonly median_margin: number | null;
  readonly avg_stat_value: number | null;
  readonly median_stat_value: number | null;
  readonly current_streak_direction: 'over' | 'under' | 'push' | null;
  readonly current_streak_length: number | null;
  readonly coverage_label:
    | 'complete'
    | 'incomplete'
    | 'single_book'
    | 'no_closing_line'
    | 'unresolved_closing_consensus';
  readonly method_version: number;
  /** True if any input row derives from a `backfilled_historical`
   *  provenance. Consumers labeling "observed by SlipLabz since launch"
   *  MUST filter these out. */
  readonly includes_backfilled_historical: boolean;
}

/**
 * Threshold-relative window (A1 §9.2). Compares player performance to a
 * user-supplied threshold; NEVER a real-line comparison.
 */
export interface ThresholdWindowResult {
  readonly window_type: 'L5' | 'L10' | 'L20' | 'season';
  readonly threshold: number;
  readonly requested_n: number;
  readonly eligible_n: number;
  readonly incomplete: boolean;
  readonly count_above: number;
  readonly count_equal: number;
  readonly count_below: number;
  readonly avg_stat_value: number | null;
  readonly median_stat_value: number | null;
  readonly avg_minus_threshold: number | null;
  readonly median_minus_threshold: number | null;
  readonly current_streak_direction: 'above' | 'below' | 'equal' | null;
  readonly current_streak_length: number | null;
  readonly coverage_label: 'complete' | 'incomplete' | 'no_data';
  readonly method_version: number;
  readonly includes_backfilled_historical: boolean;
}

/**
 * Simple statistical central-tendency values across an eligible player-game
 * sample. Distinct from real-line and threshold windows because it operates
 * on raw stat values only.
 */
export interface AveragesMediansResult {
  readonly window_type: 'L5' | 'L10' | 'L20' | 'season';
  readonly eligible_n: number;
  readonly average: number | null;
  readonly median: number | null;
  readonly method_version: number;
  readonly includes_backfilled_historical: boolean;
}

/**
 * Sample-size label — a plain-language label per §7.14 for the actual n.
 * NEVER paywalled (truth is never paywalled).
 */
export interface SampleSizeLabelResult {
  readonly eligible_n: number;
  readonly label: 'complete' | 'incomplete' | 'no_data';
  readonly requested_n: number;
  readonly method_version: number;
}

/**
 * Historical coverage per (player, market_key) — RME-1.
 *
 * The earliest eligible historical observation date backing this profile's
 * windows. Derived from `historical_line_results` (which per its schema
 * comment only stores rows with a canonical closing point AND an eligible
 * player_game_stats row). Includes `backfilled_historical` provenance rows
 * per DR-23 (they count toward the profile's windows). The
 * `includes_backfilled_historical` field makes the provenance stance
 * visible on the returned shape.
 *
 * `coverage_start_date` is an ISO-8601 date string (YYYY-MM-DD, UTC-day)
 * derived from `games.scheduled_start_utc`. Never estimated; never derived
 * from a season calendar. Null when no eligible historical row exists for
 * the (player, market) grain.
 *
 * DR-25 predicate (30-day historical coverage): the engine evaluates
 *   (today_utc_date - coverage_start_date) >= 30 days
 * directly from this shape.
 */
export interface HistoricalCoverageResult {
  readonly internal_player_id: string;
  readonly market_key: string;
  readonly coverage_start_date: string | null;
  readonly eligible_game_count: number;
  readonly includes_backfilled_historical: boolean;
  readonly method_version: number;
  readonly computation_version: number;
}

/**
 * Player + event mapping resolution snapshot — RME-2.
 *
 * Read-only view of the V1-1 identity layer's open reconciliation queues.
 * `player_resolved = false` when `player_reconciliation_queue` has an OPEN
 * row that either references this `internal_player_id` in
 * `candidate_internal_player_ids` OR whose approval would create/remap this
 * identity. `event_resolved` analogous for `event_reconciliation_queue` and
 * `internal_game_id`. `queue_reason` carries the raw V1-1 queue-reason
 * enum value (either `player_queue_reason` or `event_queue_reason`) —
 * never a parallel vocabulary. Null when both are resolved. When BOTH are
 * unresolved simultaneously, `queue_reason` reflects the PLAYER queue's
 * reason (§C.9 checks `UNRESOLVED_PLAYER_MAPPING` first); `player_resolved`
 * and `event_resolved` remain independently visible.
 *
 * This module never writes, approves, or quarantines — the identity layer
 * (V1-1) owns those actions.
 */
export interface MappingResolutionResult {
  readonly internal_player_id: string;
  readonly internal_game_id: string;
  readonly player_resolved: boolean;
  readonly event_resolved: boolean;
  readonly queue_reason: string | null;
  readonly method_version: number;
}

/**
 * Composed current market row (§7.5, §11.5). This is the primary shared
 * output consumed by Board / Research / Compare / Brief.
 */
export interface CurrentMarketRow {
  readonly internal_game_id: string;
  readonly internal_player_id: string;
  readonly market_key: string;
  readonly line_consensus: LineConsensusResult;
  readonly line_range: LineRangeResult;
  readonly point_distribution: PointDistributionResult;
  readonly eligible_book_count: EligibleBookCountResult;
  readonly first_observed: FirstObservedResult;
  readonly movement_summary: MovementSummaryResult;
  /**
   * Wall-clock freshness verdict. OPTIONAL as of V1-A2-5.
   *
   * The v1 composer wrapper (`composeCurrentMarketRow`) ALWAYS populates
   * this — v1 rows are byte-identical to before, and every v1 consumer
   * receives it. The v2 composer wrapper
   * (`src/evidence/v2/freshnessNeutralMarketRow.ts`) OMITS it: v2 has no
   * composition-time freshness state — its disposition is decided at
   * classification from `classification_age = evaluation_reference_time −
   * line_observed_at` (D-A1). Omission is the HONEST representation of
   * "freshness not evaluated here"; the field is never set to a fabricated
   * value, a sentinel, or a placeholder timestamp on the v2 path (owner
   * ruling R2 + the honesty trap). The v2 classification path never reads
   * this field (engineV2 injects a typed C3 verdict; engineCore reads only
   * availability_context), so its absence changes no v2 behaviour.
   */
  readonly freshness?: FreshnessResult;
  /** Per-book offerings. Paid-only field; the capability filter strips
   *  this before serialization for free tier. */
  readonly book_detail: BookDetailResult;
  readonly availability_context: AvailabilityContextResult | null;
  readonly method_version: number;
  readonly computation_version: number;
  /** Source snapshot ids consulted, for walk-back. */
  readonly source_snapshot_ids: ReadonlyArray<string>;
}

/**
 * `CurrentMarketRow` guaranteed to carry a wall-clock `freshness` verdict.
 * The v1 composer wrapper returns this stricter type so existing v1
 * consumers (the aggregator, the read path) see `freshness` as REQUIRED,
 * exactly as before V1-A2-5.
 */
export type CurrentMarketRowV1 = CurrentMarketRow & { readonly freshness: FreshnessResult };

/**
 * FRESHNESS-NEUTRAL assembly core output (V1-A2-5).
 *
 * The shared structural market computation, owning NO method-specific
 * eligibility rule and NO wall-clock. Both composer wrappers (v1 + v2)
 * build on this. It carries `line_observed_at` — the freshest
 * `market_snapshots.observed_at` across the offering set the core was
 * given — as the single owner of that metric (no duplicate computation).
 *
 * It deliberately has NO `freshness` field: freshness is a method-specific
 * policy applied by the wrapper, not a structural market fact.
 */
export interface MarketRowCore {
  readonly internal_game_id: string;
  readonly internal_player_id: string;
  readonly market_key: string;
  readonly line_consensus: LineConsensusResult;
  readonly line_range: LineRangeResult;
  readonly point_distribution: PointDistributionResult;
  readonly eligible_book_count: EligibleBookCountResult;
  readonly first_observed: FirstObservedResult;
  readonly movement_summary: MovementSummaryResult;
  readonly book_detail: BookDetailResult;
  readonly availability_context: AvailabilityContextResult | null;
  /** Freshest observed_at across the given offering set; null when empty. */
  readonly line_observed_at: string | null;
  readonly method_version: number;
  readonly computation_version: number;
  readonly source_snapshot_ids: ReadonlyArray<string>;
}

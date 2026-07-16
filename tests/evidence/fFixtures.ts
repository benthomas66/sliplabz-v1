// V1-A1-3 Phase A — §F worked-example fixtures.
//
// The authority's §F examples are the acceptance standard. Every input,
// every intermediate value, and every output listed in §F.1..F.6 is
// asserted by the accompanying `fixtures_f*.test.ts` files.
//
// Fixture inputs are constructed to match §F verbatim. Where §F is silent
// on a specific field (e.g. availability_context, mapping_resolution), a
// "healthy" default is used so the field doesn't accidentally trip an
// unrelated §C rule. Those defaults are labeled in a comment.
//
// NO OWNER INVENTION: nothing here decides what F.1's C_RTP should be.
// The authority's own arithmetic is the target; the fixtures reproduce
// its input specification.

import type {
  CurrentMarketRow,
  HistoricalCoverageResult,
  MappingResolutionResult,
  ThresholdWindowResult,
} from '../../src/computation/types.js';
import type { EvidenceProfileInput, ThresholdWindows } from '../../src/evidence/types.js';
import type { LaunchMarket } from '../../src/evidence/marginNormalizers.js';

/** A healthy availability_context that never trips §C source_unavailable. */
function healthyAvailability(): NonNullable<CurrentMarketRow['availability_context']> {
  return Object.freeze({
    presence_state: 'currently_reported' as const,
    source_status: '',
    source_comment: '',
    source_return_date_text: '',
    observed_at: '2026-07-15T00:00:00Z',
    method_version: 1,
  });
}

/** A healthy mapping resolution (both resolved). */
function resolvedMapping(): MappingResolutionResult {
  return Object.freeze({
    internal_player_id: 'p1',
    internal_game_id: 'g1',
    player_resolved: true,
    event_resolved: true,
    queue_reason: null,
    method_version: 1,
  });
}

/** Historical coverage that satisfies DR-25 (100 days back from 2026-07-15). */
function ampleCoverage(): HistoricalCoverageResult {
  return Object.freeze({
    internal_player_id: 'p1',
    market_key: 'player_points',
    coverage_start_date: '2026-04-01', // 105 days before today
    eligible_game_count: 60,
    includes_backfilled_historical: false,
    method_version: 1,
    computation_version: 3,
  });
}

/** Threshold window helper. */
function tw(
  window_type: 'L5' | 'L10' | 'L20' | 'season',
  threshold: number,
  eligible_n: number,
  count_above: number,
  count_below: number,
  count_equal: number,
  avg_minus_threshold: number | null = null,
  median_minus_threshold: number | null = null,
  includes_backfilled_historical = false
): ThresholdWindowResult {
  const requested_n = window_type === 'L5' ? 5 : window_type === 'L10' ? 10 : window_type === 'L20' ? 20 : 165;
  return Object.freeze({
    window_type,
    threshold,
    requested_n,
    eligible_n,
    incomplete: eligible_n < requested_n && window_type !== 'season',
    count_above,
    count_below,
    count_equal,
    avg_stat_value: null,
    median_stat_value: null,
    avg_minus_threshold,
    median_minus_threshold,
    current_streak_direction: null,
    current_streak_length: null,
    coverage_label: (eligible_n === 0 ? 'no_data' : (eligible_n < requested_n && window_type !== 'season') ? 'incomplete' : 'complete') as 'complete' | 'incomplete' | 'no_data',
    method_version: 1,
    includes_backfilled_historical,
  });
}

interface CurrentMarketArgs {
  readonly evaluated_line: number; // needed for point_distribution keys? No — E is passed to engine separately
  readonly consensus_point: number | null;
  readonly selection_method: 'single_book' | 'unique_modal' | 'tied_no_unique_mode' | 'no_eligible_source';
  readonly coverage_label: 'complete' | 'single_book' | 'unresolved_consensus' | 'no_line';
  readonly point_distribution: ReadonlyArray<{ point: number; book_count: number }>;
  readonly eligible_book_count: number;
  readonly first_observed_point: number | null;
  readonly first_observed_at: string | null;
  readonly net_point_movement: number | null;
  readonly freshness_state: 'fresh' | 'aging' | 'stale' | 'unavailable' | 'failed_latest_poll';
  readonly line_min_point: number | null;
  readonly line_max_point: number | null;
  readonly one_sided: 'over_only' | 'under_only' | 'neither' | null;
}

function cmr(a: CurrentMarketArgs): CurrentMarketRow {
  return Object.freeze({
    internal_game_id: 'g1',
    internal_player_id: 'p1',
    market_key: 'player_points',
    line_consensus: Object.freeze({
      consensus_point: a.consensus_point,
      selection_method: a.selection_method,
      total_eligible_sportsbook_count: a.eligible_book_count,
      sportsbook_count_at_selected_point:
        a.selection_method === 'single_book' ? 1 :
        a.selection_method === 'unique_modal' ? Math.max(...a.point_distribution.map((c) => c.book_count)) :
        null,
      coverage_label: a.coverage_label,
      method_version: 1,
    }),
    line_range: Object.freeze({
      min_point: a.line_min_point,
      max_point: a.line_max_point,
      method_version: 1,
    }),
    point_distribution: Object.freeze({
      counts: Object.freeze(a.point_distribution.map((c) => Object.freeze({ ...c }))),
      method_version: 1,
    }),
    eligible_book_count: Object.freeze({
      count: a.eligible_book_count,
      method_version: 1,
    }),
    first_observed: Object.freeze({
      point: a.first_observed_point,
      at: a.first_observed_at,
      method_version: 1,
    }),
    movement_summary: Object.freeze({
      first_observed_point: a.first_observed_point,
      current_point: a.consensus_point,
      net_point_movement: a.net_point_movement,
      point_changes_observed: 0,
      over_price_changes: 0,
      under_price_changes: 0,
      side_removed_count: 0,
      side_added_count: 0,
      method_version: 1,
    }),
    freshness: Object.freeze({
      state: a.freshness_state,
      last_observed_at: '2026-07-15T00:00:00Z',
      method_version: 1,
    }),
    book_detail: Object.freeze({
      offerings: [],
      one_sided: a.one_sided,
      method_version: 2,
    }),
    availability_context: healthyAvailability(),
    method_version: 1,
    computation_version: 3,
    source_snapshot_ids: [],
  });
}

// ---------------------------------------------------------------------------
// F.1 — Moderate Over, points at 19.5
// ---------------------------------------------------------------------------
export function inputF1(): EvidenceProfileInput {
  const windows: ThresholdWindows = Object.freeze({
    L5: tw('L5', 19.5, 5, 4, 1, 0),
    L10: tw('L10', 19.5, 10, 8, 2, 0, +2.6, +2.5),
    L20: tw('L20', 19.5, 20, 14, 5, 1),
    season: tw('season', 19.5, 65, 42, 20, 3, +1.8, +2.0),
  });
  return Object.freeze({
    internal_game_id: 'g_f1',
    internal_player_id: 'p_f1',
    market_key: 'player_points' as LaunchMarket,
    evaluated_line: 19.5,
    evaluated_source_kind: 'sportsbook_consensus' as const,
    evaluated_source_identifier: null,
    threshold_windows: windows,
    current_market_row: cmr({
      evaluated_line: 19.5,
      consensus_point: 20.0,
      selection_method: 'unique_modal',
      coverage_label: 'complete',
      point_distribution: [
        { point: 19.5, book_count: 2 },
        { point: 20.0, book_count: 4 },
        { point: 20.5, book_count: 2 },
      ],
      eligible_book_count: 8,
      first_observed_point: 20.0,
      first_observed_at: '2026-07-14T22:30:00Z',
      net_point_movement: 0.0,
      freshness_state: 'fresh',
      line_min_point: 19.5,
      line_max_point: 20.5,
      one_sided: 'neither',
    }),
    historical_coverage: ampleCoverage(),
    mapping_resolution: resolvedMapping(),
    game_status: 'scheduled',
    today_utc_date: '2026-07-15',
    reference_date: '2026-07-15',
  });
}

// ---------------------------------------------------------------------------
// F.1a — Strong Over (identical to F.1 except L10 hits, avg, consensus_gap)
// ---------------------------------------------------------------------------
export function inputF1a(): EvidenceProfileInput {
  const f1 = inputF1();
  const windows: ThresholdWindows = Object.freeze({
    L5: f1.threshold_windows.L5,
    L10: tw('L10', 19.5, 10, 9, 1, 0, +3.9, +2.5),
    L20: f1.threshold_windows.L20,
    season: f1.threshold_windows.season,
  });
  return Object.freeze({
    ...f1,
    threshold_windows: windows,
    current_market_row: cmr({
      evaluated_line: 19.5,
      consensus_point: 20.5,
      selection_method: 'unique_modal',
      coverage_label: 'complete',
      point_distribution: [
        { point: 19.5, book_count: 2 },
        { point: 20.0, book_count: 4 },
        { point: 20.5, book_count: 2 },
      ],
      eligible_book_count: 8,
      first_observed_point: 20.5,
      first_observed_at: '2026-07-14T22:30:00Z',
      net_point_movement: 0.0,
      freshness_state: 'fresh',
      line_min_point: 19.5,
      line_max_point: 20.5,
      one_sided: 'neither',
    }),
  });
}

// ---------------------------------------------------------------------------
// F.2 — Moderate Under at rebounds 8.5
// ---------------------------------------------------------------------------
export function inputF2(): EvidenceProfileInput {
  const windows: ThresholdWindows = Object.freeze({
    L5: tw('L5', 8.5, 5, 1, 4, 0),
    L10: tw('L10', 8.5, 10, 3, 6, 1, -1.1, -1.0),
    L20: tw('L20', 8.5, 20, 7, 12, 1),
    season: tw('season', 8.5, 52, 20, 30, 2, -0.5, -0.5),
  });
  return Object.freeze({
    internal_game_id: 'g_f2',
    internal_player_id: 'p_f2',
    market_key: 'player_rebounds' as LaunchMarket,
    evaluated_line: 8.5,
    evaluated_source_kind: 'sportsbook_consensus' as const,
    evaluated_source_identifier: null,
    threshold_windows: windows,
    current_market_row: {
      ...cmr({
        evaluated_line: 8.5,
        consensus_point: 8.0,
        selection_method: 'unique_modal',
        coverage_label: 'complete',
        point_distribution: [
          { point: 8.0, book_count: 5 },
          { point: 8.5, book_count: 2 },
          { point: 9.0, book_count: 1 },
        ],
        eligible_book_count: 8,
        first_observed_point: 8.5,
        first_observed_at: '2026-07-14T22:30:00Z',
        net_point_movement: -0.5,
        freshness_state: 'fresh',
        line_min_point: 8.0,
        line_max_point: 9.0,
        one_sided: 'neither',
      }),
      market_key: 'player_rebounds',
    },
    historical_coverage: {
      ...ampleCoverage(),
      market_key: 'player_rebounds',
    },
    mapping_resolution: resolvedMapping(),
    game_status: 'scheduled',
    today_utc_date: '2026-07-15',
    reference_date: '2026-07-15',
  });
}

// ---------------------------------------------------------------------------
// F.3 — Mixed by WINDOWS_DISAGREE at assists 5.5
// ---------------------------------------------------------------------------
export function inputF3(): EvidenceProfileInput {
  const windows: ThresholdWindows = Object.freeze({
    L5: tw('L5', 5.5, 5, 4, 1, 0),
    L10: tw('L10', 5.5, 10, 8, 2, 0, +1.1, +1.0),
    L20: tw('L20', 5.5, 20, 6, 13, 1),
    season: tw('season', 5.5, 55, 22, 30, 3, -0.4, -0.4),
  });
  return Object.freeze({
    internal_game_id: 'g_f3',
    internal_player_id: 'p_f3',
    market_key: 'player_assists' as LaunchMarket,
    evaluated_line: 5.5,
    evaluated_source_kind: 'sportsbook_consensus' as const,
    evaluated_source_identifier: null,
    threshold_windows: windows,
    current_market_row: {
      ...cmr({
        evaluated_line: 5.5,
        consensus_point: 5.5,
        selection_method: 'unique_modal',
        coverage_label: 'complete',
        point_distribution: [
          { point: 5.0, book_count: 1 },
          { point: 5.5, book_count: 4 },
          { point: 6.0, book_count: 1 },
        ],
        eligible_book_count: 6,
        first_observed_point: 5.5,
        first_observed_at: '2026-07-14T22:30:00Z',
        net_point_movement: 0.0,
        freshness_state: 'fresh',
        line_min_point: 5.0,
        line_max_point: 6.0,
        one_sided: 'neither',
      }),
      market_key: 'player_assists',
    },
    historical_coverage: { ...ampleCoverage(), market_key: 'player_assists' },
    mapping_resolution: resolvedMapping(),
    game_status: 'scheduled',
    today_utc_date: '2026-07-15',
    reference_date: '2026-07-15',
  });
}

// ---------------------------------------------------------------------------
// F.4 — Insufficient by sample (L10 = 3)
// ---------------------------------------------------------------------------
export function inputF4(): EvidenceProfileInput {
  const windows: ThresholdWindows = Object.freeze({
    L5: tw('L5', 12.5, 3, 2, 1, 0),
    L10: tw('L10', 12.5, 3, 2, 1, 0),
    L20: tw('L20', 12.5, 3, 2, 1, 0),
    season: tw('season', 12.5, 3, 2, 1, 0),
  });
  return Object.freeze({
    internal_game_id: 'g_f4',
    internal_player_id: 'p_f4',
    market_key: 'player_points' as LaunchMarket,
    evaluated_line: 12.5,
    evaluated_source_kind: 'sportsbook_consensus' as const,
    evaluated_source_identifier: null,
    threshold_windows: windows,
    current_market_row: cmr({
      evaluated_line: 12.5,
      consensus_point: 12.5,
      selection_method: 'unique_modal',
      coverage_label: 'complete',
      point_distribution: [{ point: 12.5, book_count: 8 }],
      eligible_book_count: 8,
      first_observed_point: 12.5,
      first_observed_at: '2026-07-14T22:30:00Z',
      net_point_movement: 0.0,
      freshness_state: 'fresh',
      line_min_point: 12.5,
      line_max_point: 12.5,
      one_sided: 'neither',
    }),
    historical_coverage: ampleCoverage(),
    mapping_resolution: resolvedMapping(),
    game_status: 'scheduled',
    today_utc_date: '2026-07-15',
    reference_date: '2026-07-15',
  });
}

// ---------------------------------------------------------------------------
// F.5 — Unavailable by freshness (unavailable + book_count = 0)
// ---------------------------------------------------------------------------
export function inputF5(): EvidenceProfileInput {
  const windows: ThresholdWindows = Object.freeze({
    L5: tw('L5', 19.5, 5, 4, 1, 0),
    L10: tw('L10', 19.5, 10, 7, 3, 0, +1.0, +1.0),
    L20: tw('L20', 19.5, 20, 12, 7, 1),
    season: tw('season', 19.5, 60, 35, 20, 5, +0.5, +0.5),
  });
  return Object.freeze({
    internal_game_id: 'g_f5',
    internal_player_id: 'p_f5',
    market_key: 'player_points' as LaunchMarket,
    evaluated_line: 19.5,
    evaluated_source_kind: 'sportsbook_consensus' as const,
    evaluated_source_identifier: null,
    threshold_windows: windows,
    current_market_row: cmr({
      evaluated_line: 19.5,
      consensus_point: null,
      selection_method: 'no_eligible_source',
      coverage_label: 'no_line',
      point_distribution: [],
      eligible_book_count: 0,
      first_observed_point: null,
      first_observed_at: null,
      net_point_movement: null,
      freshness_state: 'unavailable',
      line_min_point: null,
      line_max_point: null,
      one_sided: null,
    }),
    historical_coverage: ampleCoverage(),
    mapping_resolution: resolvedMapping(),
    game_status: 'scheduled',
    today_utc_date: '2026-07-15',
    reference_date: '2026-07-15',
  });
}

// ---------------------------------------------------------------------------
// F.6 — Quality-capped at points 22.5 (stale + book_count=2)
// ---------------------------------------------------------------------------
export function inputF6(): EvidenceProfileInput {
  const windows: ThresholdWindows = Object.freeze({
    L5: tw('L5', 22.5, 5, 4, 1, 0),
    L10: tw('L10', 22.5, 10, 8, 2, 0, +2.6, +2.5),
    L20: tw('L20', 22.5, 20, 14, 5, 1),
    season: tw('season', 22.5, 65, 42, 20, 3, +1.8, +2.0),
  });
  return Object.freeze({
    internal_game_id: 'g_f6',
    internal_player_id: 'p_f6',
    market_key: 'player_points' as LaunchMarket,
    evaluated_line: 22.5,
    evaluated_source_kind: 'sportsbook_consensus' as const,
    evaluated_source_identifier: null,
    threshold_windows: windows,
    current_market_row: cmr({
      evaluated_line: 22.5,
      consensus_point: 21.5,
      selection_method: 'unique_modal',
      coverage_label: 'complete',
      // "coverage_at_line = 0 of 2" — 22.5 does NOT appear.
      point_distribution: [
        { point: 21.0, book_count: 1 },
        { point: 21.5, book_count: 1 },
      ],
      eligible_book_count: 2,
      first_observed_point: 22.0,
      first_observed_at: '2026-07-14T22:30:00Z',
      net_point_movement: -0.5,
      freshness_state: 'stale',
      line_min_point: 21.0,
      line_max_point: 21.5,
      one_sided: 'neither',
    }),
    historical_coverage: ampleCoverage(),
    mapping_resolution: resolvedMapping(),
    game_status: 'scheduled',
    today_utc_date: '2026-07-15',
    reference_date: '2026-07-15',
  });
}

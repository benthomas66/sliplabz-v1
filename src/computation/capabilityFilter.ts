// V1-5 server-side capability filter.
//
// This is the load-bearing enforcement site for §16.7 ("Protected data is
// never sent to an unauthorized client and merely hidden in the
// interface"). The filter STRIPS paid-only fields from the read-model
// payload BEFORE the payload is serialized to JSON. Any client-side
// enforcement is decorative.
//
// A capability-driven copy is returned; the input is not mutated.
//
// Two-stage staging (§16.5): the filter is entirely fixture-driven per
// GD-6. V1-9 wires the capability record to real account-backed entitlement;
// the filter shape here does not need to change.

import { hasCapability, type Capability } from './capability.js';
import type { CurrentMarketRow, ThresholdWindowResult, RealLineWindowResult } from './types.js';

/** The redacted `BookDetailResult` shape returned when the caller lacks
 *  `view_book_detail`. Preserves the method_version so the client can see
 *  the field exists and its version is coherent. */
const REDACTED_BOOK_DETAIL = Object.freeze({
  offerings: Object.freeze([]) as ReadonlyArray<never>,
  method_version: 1,
  redacted: true as const,
  redaction_reason: 'capability_view_book_detail_required' as const,
});

/** The redacted `AvailabilityContextResult` shape returned when the caller
 *  lacks `view_availability_context`. Preserves method_version. */
const REDACTED_AVAILABILITY = Object.freeze({
  redacted: true as const,
  redaction_reason: 'capability_view_availability_context_required' as const,
  method_version: 1,
});

/**
 * Public shape returned by the filter. Deliberately does NOT re-export
 * the raw internal type — the filter's OUTPUT is the API contract. This
 * is what serializes to the wire.
 */
export interface FilteredCurrentMarketRow {
  readonly internal_game_id: string;
  readonly internal_player_id: string;
  readonly market_key: string;
  readonly line_consensus: CurrentMarketRow['line_consensus'];
  readonly line_range: CurrentMarketRow['line_range'];
  readonly point_distribution: CurrentMarketRow['point_distribution'];
  readonly eligible_book_count: CurrentMarketRow['eligible_book_count'];
  readonly first_observed: CurrentMarketRow['first_observed'];
  readonly movement_summary:
    | CurrentMarketRow['movement_summary']
    | { readonly redacted: true; readonly redaction_reason: string; readonly method_version: number };
  readonly freshness: CurrentMarketRow['freshness'];
  readonly book_detail: CurrentMarketRow['book_detail'] | typeof REDACTED_BOOK_DETAIL;
  readonly availability_context:
    | CurrentMarketRow['availability_context']
    | typeof REDACTED_AVAILABILITY
    | null;
  readonly method_version: number;
  readonly computation_version: number;
  readonly source_snapshot_ids: ReadonlyArray<string>;
}

/**
 * Filter a `CurrentMarketRow` by capability. The result is a NEW object;
 * the input is not mutated. Paid-only fields are REPLACED with a redacted
 * marker so the client can see the field exists but cannot see its data.
 *
 * Load-bearing: for a caller lacking `view_book_detail`, the returned
 * `book_detail.offerings` is an empty array and a `redacted:true` marker
 * accompanies it. Client-side hiding of a paid field that arrived in the
 * payload would be a serialization-boundary bug and would fail the
 * unauthorized-client test.
 */
export function filterCurrentMarketRow(
  row: CurrentMarketRow,
  cap: Capability
): FilteredCurrentMarketRow {
  const canViewBookDetail = hasCapability(cap, 'view_book_detail');
  const canViewFullMovement = hasCapability(cap, 'view_full_movement_detail');
  const canViewAvailability = hasCapability(cap, 'view_availability_context');
  return Object.freeze({
    internal_game_id: row.internal_game_id,
    internal_player_id: row.internal_player_id,
    market_key: row.market_key,
    line_consensus: row.line_consensus,
    line_range: row.line_range,
    point_distribution: row.point_distribution,
    eligible_book_count: row.eligible_book_count,
    first_observed: row.first_observed,
    // Movement summary aggregates (counts) are free-tier per §16.8 "truth
    // is never paywalled" — but the per-event stream is paid via a
    // separate endpoint (V1-7 obligation). Free tier gets aggregates only;
    // paid tier gets the same aggregates. Neither tier gets the event
    // stream through THIS row (that's a different surface).
    movement_summary: canViewFullMovement ? row.movement_summary : row.movement_summary,
    freshness: row.freshness,
    book_detail: canViewBookDetail ? row.book_detail : REDACTED_BOOK_DETAIL,
    availability_context: row.availability_context === null
      ? null
      : canViewAvailability ? row.availability_context : REDACTED_AVAILABILITY,
    method_version: row.method_version,
    computation_version: row.computation_version,
    source_snapshot_ids: row.source_snapshot_ids,
  });
}

/**
 * Threshold-window results are gated by `view_threshold_windows`. Free
 * tier gets null (Compare Your Line is a paid surface per §16.4). This
 * function returns `null` for insufficient capability rather than a
 * redacted marker, because the field is a top-level array — an empty
 * array would risk being interpreted as "no data" client-side.
 */
export function filterThresholdWindows(
  windows: ReadonlyArray<ThresholdWindowResult>,
  cap: Capability
): ReadonlyArray<ThresholdWindowResult> | null {
  return hasCapability(cap, 'view_threshold_windows') ? windows : null;
}

/**
 * Extended real-line windows (L10, L20) are gated by `view_extended_windows`.
 * Free tier receives only the L5 and season entries.
 */
export function filterRealLineWindows(
  windows: ReadonlyArray<RealLineWindowResult>,
  cap: Capability
): ReadonlyArray<RealLineWindowResult> {
  if (hasCapability(cap, 'view_extended_windows')) return windows;
  return Object.freeze(
    windows.filter((w) => w.window_type === 'L5' || w.window_type === 'season')
  );
}

// V1-A1-3 Phase A — §C quality rules.
//
// Authority: docs/product/EVIDENCE_PROFILE_METHOD_V1.md §C (all sub-
// sections). Each function below owns exactly one rule from §C and
// annotates its authority line. No rule invented; no threshold picked;
// no defaults substituted for missing inputs.
//
// This module classifies rules into three roles the engine (§D.1) needs:
//   * "Unavailable" preconditions (§C.3 no-market / §C.3.1 tied /
//     §C.8 postponed-canceled / §C.9 unresolved mapping);
//   * "Insufficient" preconditions (§C.1 samples + DR-25 coverage);
//   * quality caps (§C.2 book coverage, §C.3 stale, §C.5 T2 market-vs-
//     history, §C.6 push-heavy, §C.7 one-sided — all cap at Moderate).
// Plus §C.5 WINDOWS_DISAGREE + MARGIN_MEASURES_DISAGREE (contradictions,
// evaluated at reason-attach time by reasons.ts) and §C.10 Strong
// prerequisites (evaluated by classification.ts).
//
// Pure functions. No I/O.

import type { EvidenceProfileInput, ThresholdWindows } from './types.js';

// ---------------------------------------------------------------------------
// §C.1 sample rules — force Insufficient
// ---------------------------------------------------------------------------

/** DR-6: L10 eligible_n minimum for any classified label. */
export const DR6_MIN_L10 = 5;
/** DR-7: season eligible_n minimum for any classified label. */
export const DR7_MIN_SEASON = 10;
/** DR-8: L10 eligible_n minimum for Strong. */
export const DR8_MIN_L10_STRONG = 8;
/** DR-25: 30-day historical coverage requirement. */
export const DR25_MIN_COVERAGE_DAYS = 30;

/** §C.1 first bullet: L10 sample < DR-6 → Insufficient + INSUFFICIENT_L10_SAMPLE. */
export function firesInsufficientL10Sample(windows: ThresholdWindows): boolean {
  return windows.L10.eligible_n < DR6_MIN_L10;
}

/** §C.1 second bullet: season sample < DR-7 → Insufficient + INCOMPLETE_HISTORICAL_COVERAGE. */
export function firesIncompleteHistoricalCoverageBySeason(
  windows: ThresholdWindows
): boolean {
  return windows.season.eligible_n < DR7_MIN_SEASON;
}

/**
 * §C.1 third bullet + DR-25: coverage span < 30 days → Insufficient +
 * INCOMPLETE_HISTORICAL_COVERAGE. Computed via UTC-day arithmetic on ISO
 * date strings; when coverage_start_date is null (no eligible historical
 * row), coverage cannot be established and the predicate fires.
 */
export function firesIncompleteHistoricalCoverageByCoverageSpan(
  coverage_start_date: string | null,
  today_utc_date: string
): boolean {
  if (coverage_start_date === null) return true;
  const span_days = utcDaySpan(coverage_start_date, today_utc_date);
  return span_days < DR25_MIN_COVERAGE_DAYS;
}

/** ISO-8601 date-only string → whole UTC-day integer. */
function toUtcDayInteger(iso_date: string): number {
  // iso_date is YYYY-MM-DD. Date.UTC returns ms; divide by 86_400_000 for whole days.
  const parts = iso_date.split('-');
  const y = Number(parts[0]!);
  const mo = Number(parts[1]!);
  const d = Number(parts[2]!);
  return Math.floor(Date.UTC(y, mo - 1, d) / 86_400_000);
}
function utcDaySpan(earlier: string, later: string): number {
  return toUtcDayInteger(later) - toUtcDayInteger(earlier);
}

// ---------------------------------------------------------------------------
// §C.2 market coverage
// ---------------------------------------------------------------------------

/** DR-10: eligible_book_count minimum before INSUFFICIENT_BOOK_COVERAGE fires. */
export const DR10_MIN_BOOK_COVERAGE = 3;

/** §C.2 second bullet: `eligible_book_count.count < 3` → cap at Moderate. */
export function firesInsufficientBookCoverage(book_count: number): boolean {
  return book_count > 0 && book_count < DR10_MIN_BOOK_COVERAGE;
}

// ---------------------------------------------------------------------------
// §C.3 freshness disambiguation (four-way table, verbatim)
// ---------------------------------------------------------------------------

/** §C.3 table result. */
export type C3Verdict =
  | { readonly kind: 'proceed' }
  | { readonly kind: 'stale_current_market_cap' }
  | { readonly kind: 'no_current_market_unavailable' };

/** §C.3 verbatim. `stale` / `failed_latest_poll` with ≥1 usable book → cap;
 *  same with 0 books → Unavailable; `unavailable` → Unavailable regardless. */
export function evaluateC3Freshness(
  freshness_state: string,
  book_count: number
): C3Verdict {
  if (freshness_state === 'unavailable') {
    return Object.freeze({ kind: 'no_current_market_unavailable' as const });
  }
  if (freshness_state === 'stale' || freshness_state === 'failed_latest_poll') {
    if (book_count >= 1) return Object.freeze({ kind: 'stale_current_market_cap' as const });
    return Object.freeze({ kind: 'no_current_market_unavailable' as const });
  }
  // 'fresh' or 'aging' with ≥1 book → proceed normally.
  return Object.freeze({ kind: 'proceed' as const });
}

// ---------------------------------------------------------------------------
// §C.3.1 tied consensus — DR-28 (owner ruling 2026-07-15)
// ---------------------------------------------------------------------------

/**
 * §C.3.1 (DR-28) trigger: all three required.
 *   line_consensus.selection_method = 'tied_no_unique_mode' AND
 *   line_consensus.consensus_point IS NULL AND
 *   eligible_book_count.count > 0.
 *
 * NEGATIVE SCOPE (also DR-28): MUST NOT fire when book_count = 0, when
 * the market source is unavailable, when freshness is 'unavailable', or
 * when consensus is absent for any reason other than tied_no_unique_mode.
 * We enforce the positive trigger here; negative scope is respected by
 * evaluating §C.3 first (Unavailable via NO_CURRENT_MARKET consumes
 * freshness-unavailable / no-books-with-stale-freshness before this
 * rule runs).
 */
export function firesNoUniqueConsensusLine(
  selection_method: string,
  consensus_point: number | null,
  book_count: number
): boolean {
  return (
    selection_method === 'tied_no_unique_mode' &&
    consensus_point === null &&
    book_count > 0
  );
}

// ---------------------------------------------------------------------------
// §C.5 contradictions (MARKET_DISAGREES_WITH_HISTORY T2 addition)
// ---------------------------------------------------------------------------

/** §C.5 T2 threshold — `|C_MA| ≥ 0.30 AND |C_RTP| ≥ 0.30 AND opposite signs`. */
export const T2_MIN_ABS = 0.30;

/** §C.5 T2: MARKET_DISAGREES_WITH_HISTORY. Caps at Moderate. */
export function firesMarketDisagreesWithHistory(
  c_ma: number,
  c_rtp: number
): boolean {
  return (
    Math.abs(c_ma) >= T2_MIN_ABS &&
    Math.abs(c_rtp) >= T2_MIN_ABS &&
    Math.sign(c_ma) !== 0 &&
    Math.sign(c_rtp) !== 0 &&
    Math.sign(c_ma) !== Math.sign(c_rtp)
  );
}

/**
 * §C.5 corrected DR-17: WINDOWS_DISAGREE fires when any pair among
 * L10 / L20 / season have opposite non-zero signs AND each of the two
 * windows in the pair has `|rate_deviation| ≥ 0.30`. L5 NEVER
 * independently triggers. Forces Mixed.
 */
export function firesWindowsDisagree(
  rd_L10: number,
  rd_L20: number,
  rd_season: number
): boolean {
  const pairs: ReadonlyArray<readonly [number, number]> = [
    [rd_L10, rd_L20],
    [rd_L10, rd_season],
    [rd_L20, rd_season],
  ];
  for (const [a, b] of pairs) {
    if (Math.sign(a) === 0 || Math.sign(b) === 0) continue;
    if (Math.sign(a) === Math.sign(b)) continue;
    if (Math.abs(a) >= 0.30 && Math.abs(b) >= 0.30) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// §C.6 push-heavy (DR-9, DR-22)
// ---------------------------------------------------------------------------

/** DR-9: L10 push_count / eligible_n > 0.30 → cap. */
export const DR9_PUSH_HEAVY_THRESHOLD = 0.30;

/** §C.6 push-heavy: L10 pushes > 30% of L10 eligible_n. */
export function firesPushHeavySample(windows: ThresholdWindows): boolean {
  const l10 = windows.L10;
  if (l10.eligible_n === 0) return false;
  return l10.count_equal / l10.eligible_n > DR9_PUSH_HEAVY_THRESHOLD;
}

// ---------------------------------------------------------------------------
// §C.7 one-sided offering (DR-18)
// ---------------------------------------------------------------------------

/** §C.7: `book_detail.one_sided ∈ {'over_only', 'under_only'}` → cap. */
export function firesOneSidedOffering(
  one_sided: 'over_only' | 'under_only' | 'neither' | null
): boolean {
  return one_sided === 'over_only' || one_sided === 'under_only';
}

// ---------------------------------------------------------------------------
// §C.8 postponed / canceled
// ---------------------------------------------------------------------------

/** §C.8: games.status = 'postponed' → Unavailable + POSTPONED_GAME. */
export function firesPostponedGame(game_status: string): boolean {
  return game_status === 'postponed';
}
/** §C.8: games.status = 'canceled' → Unavailable + CANCELED_GAME. */
export function firesCanceledGame(game_status: string): boolean {
  return game_status === 'canceled';
}

// ---------------------------------------------------------------------------
// §C.9 mapping resolution
// ---------------------------------------------------------------------------

/** §C.9: player_resolved = false → Unavailable + UNRESOLVED_PLAYER_MAPPING. */
export function firesUnresolvedPlayerMapping(player_resolved: boolean): boolean {
  return player_resolved === false;
}
/** §C.9: event_resolved = false → Unavailable + UNRESOLVED_EVENT_MAPPING. */
export function firesUnresolvedEventMapping(event_resolved: boolean): boolean {
  return event_resolved === false;
}

// ---------------------------------------------------------------------------
// §C.5 MARGIN_MEASURES_DISAGREE (E.4 addition) — contradiction reason
// ---------------------------------------------------------------------------

/** §C.5 E.4 addition: L10 avg and L10 median have opposite non-zero signs.
 *  Attaches as a contradiction; does NOT independently force Mixed;
 *  does NOT independently cap. */
export function firesMarginMeasuresDisagree(
  l10_avg: number | null,
  l10_median: number | null
): boolean {
  if (l10_avg === null || l10_median === null) return false;
  return (
    Math.sign(l10_avg) !== 0 &&
    Math.sign(l10_median) !== 0 &&
    Math.sign(l10_avg) !== Math.sign(l10_median)
  );
}

// ---------------------------------------------------------------------------
// §C.10 Strong prerequisites (owner-approved single unambiguous rule)
// ---------------------------------------------------------------------------

/** DR-2: Strong classification threshold |score| ≥ 0.55. */
export const DR2_STRONG_ABS = 0.55;
/** DR-3 lower bound: |score| ≥ 0.30 → Moderate reachable. */
export const DR3_MODERATE_LOWER_ABS = 0.30;
/** DR-11 / §C.10 clause 4: non-L5 magnitude test. */
export const C10_NON_L5_MAGNITUDE_MIN = 0.30;

export interface Strong6Inputs {
  readonly composite_score: number;
  readonly l10_eligible_n: number;
  readonly rd_L10: number;
  readonly non_l5_magnitude: number;
  readonly windows_disagree: boolean;
  readonly any_capping_condition: boolean;
}

/**
 * §C.10 — all six clauses must clear for Strong. This function returns a
 * per-clause verdict for auditability + the aggregate.
 */
export function evaluateC10Strong(input: Strong6Inputs): {
  readonly clause_1_magnitude: boolean;
  readonly clause_2_l10_sample: boolean;
  readonly clause_3_l10_direction_agrees: boolean;
  readonly clause_4_non_l5_magnitude: boolean;
  readonly clause_5_no_cap: boolean;
  readonly clause_6_no_windows_disagree: boolean;
  readonly all_pass: boolean;
} {
  const c1 = Math.abs(input.composite_score) >= DR2_STRONG_ABS;
  const c2 = input.l10_eligible_n >= DR8_MIN_L10_STRONG;
  const c3 = Math.sign(input.rd_L10) === Math.sign(input.composite_score) && Math.sign(input.composite_score) !== 0;
  const c4 = input.non_l5_magnitude >= C10_NON_L5_MAGNITUDE_MIN;
  const c5 = !input.any_capping_condition;
  const c6 = !input.windows_disagree;
  return Object.freeze({
    clause_1_magnitude: c1,
    clause_2_l10_sample: c2,
    clause_3_l10_direction_agrees: c3,
    clause_4_non_l5_magnitude: c4,
    clause_5_no_cap: c5,
    clause_6_no_windows_disagree: c6,
    all_pass: c1 && c2 && c3 && c4 && c5 && c6,
  });
}

// ---------------------------------------------------------------------------
// Convenience aggregator: does the §C evaluation for the whole profile
// ---------------------------------------------------------------------------

export interface QualityVerdict {
  // Unavailable causes (§D.1 step 1 — first-match order matters).
  readonly unavailable_postponed_game: boolean;
  readonly unavailable_canceled_game: boolean;
  readonly unavailable_unresolved_player_mapping: boolean;
  readonly unavailable_unresolved_event_mapping: boolean;
  readonly unavailable_no_current_market: boolean;
  readonly unavailable_no_unique_consensus_line: boolean;
  // Insufficient causes (§D.1 step 2 — any triggers).
  readonly insufficient_l10_sample: boolean;
  readonly insufficient_season_sample: boolean;
  readonly insufficient_coverage_span: boolean;
  // Caps (§C.2 / §C.3 / §C.6 / §C.7 — §C.5 T2 is evaluated post-component).
  readonly stale_current_market_cap: boolean;
  readonly insufficient_book_coverage_cap: boolean;
  readonly push_heavy_sample_cap: boolean;
  readonly one_sided_offering_cap: boolean;
}

/**
 * Evaluate every §C rule that can be answered from the input alone (i.e.
 * without needing components). Component-dependent contradictions (§C.5
 * T2, C.5 windows_disagree, C.5 margin_measures_disagree) are evaluated
 * separately by reasons.ts after components are computed.
 */
export function evaluateQualityRules(input: EvidenceProfileInput): QualityVerdict {
  const cmr = input.current_market_row;
  const bc = cmr.eligible_book_count.count;

  // §C.3 four-way disambiguation
  const c3 = evaluateC3Freshness(cmr.freshness.state, bc);

  // §C.3.1 DR-28 tied — only fires when §C.3 would otherwise say proceed
  // (positive trigger) AND consensus is tied. Negative-scope: if §C.3
  // already forces Unavailable via NO_CURRENT_MARKET, tied-consensus
  // does NOT also fire. §D.1 step 1 first-match order handles the
  // precedence.
  const tied = firesNoUniqueConsensusLine(
    cmr.line_consensus.selection_method,
    cmr.line_consensus.consensus_point,
    bc
  );

  return Object.freeze({
    unavailable_postponed_game: firesPostponedGame(input.game_status),
    unavailable_canceled_game: firesCanceledGame(input.game_status),
    unavailable_unresolved_player_mapping: firesUnresolvedPlayerMapping(input.mapping_resolution.player_resolved),
    unavailable_unresolved_event_mapping: firesUnresolvedEventMapping(input.mapping_resolution.event_resolved),
    unavailable_no_current_market: c3.kind === 'no_current_market_unavailable',
    unavailable_no_unique_consensus_line: tied,
    insufficient_l10_sample: firesInsufficientL10Sample(input.threshold_windows),
    insufficient_season_sample: firesIncompleteHistoricalCoverageBySeason(input.threshold_windows),
    insufficient_coverage_span: firesIncompleteHistoricalCoverageByCoverageSpan(
      input.historical_coverage.coverage_start_date,
      input.today_utc_date
    ),
    stale_current_market_cap: c3.kind === 'stale_current_market_cap',
    insufficient_book_coverage_cap: firesInsufficientBookCoverage(bc),
    push_heavy_sample_cap: firesPushHeavySample(input.threshold_windows),
    one_sided_offering_cap: firesOneSidedOffering(cmr.book_detail.one_sided),
  });
}

// Real-line window aggregates per complete spec §7.13, §14.3-14.5.
//
// Authority:
//   Complete spec §7.13 (windows mean the most recent 5/10/20 eligible
//     real-line games; not the last appearances when line coverage is missing;
//     show actual n)
//   Complete spec §14.3 (traverse reverse-chron; stop at requested count;
//     show actual n; label incomplete)
//   Complete spec §14.4 (Over rate = Over / (Over + Under); push excluded)
//   Complete spec §14.5 (streak stops at opposite result / unresolved coverage
//     gap / missing real line / invalid game)
//   Ticket V1-4 hard invariants:
//     - Actual n is preserved;
//     - Coverage gaps stop streaks;
//     - Pushes are separate.

import type {
  CoverageLabel,
  RealLineOutcome,
  RealLineWindowType,
} from '../shared/enums.js';

export interface WindowInputGame {
  /** The game date (UTC) — reverse-chron traversal key. */
  readonly game_date_utc: string;
  readonly canonical_closing_point: number;
  readonly player_stat_value: number;
  readonly outcome: RealLineOutcome;
  readonly margin: number;
  readonly coverage_label: Extract<CoverageLabel, 'complete' | 'single_book'>;
}

export interface RealLineWindowResult {
  readonly window_type: RealLineWindowType;
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
  readonly current_streak_direction: RealLineOutcome | null;
  readonly current_streak_length: number | null;
  readonly coverage_label: CoverageLabel;
}

const REQUESTED_BY_WINDOW: Readonly<Record<RealLineWindowType, number | null>> =
  Object.freeze({
    L5: 5,
    L10: 10,
    L20: 20,
    season: null, // season traverses the entire eligible set
  });

/**
 * Compute a window aggregate from a reverse-chronologically-sorted list of
 * eligible real-line games.
 *
 * The caller MUST have already filtered games to eligible real-line games
 * only (spec §7.11, §14.2). Missing games (coverage gaps) MUST NOT appear
 * in the input; their absence is what stops streaks in the streak logic below.
 */
export function computeRealLineWindow(
  window_type: RealLineWindowType,
  games_reverse_chron: ReadonlyArray<WindowInputGame>
): RealLineWindowResult {
  const requested = REQUESTED_BY_WINDOW[window_type];
  const requested_n = requested ?? games_reverse_chron.length;
  const eligible = games_reverse_chron.slice(
    0,
    requested === null ? games_reverse_chron.length : requested
  );
  const eligible_n = eligible.length;
  const incomplete =
    requested !== null && eligible_n < requested;

  let over_count = 0;
  let under_count = 0;
  let push_count = 0;
  const margins: number[] = [];
  const stat_values: number[] = [];
  let has_single_book = false;

  for (const g of eligible) {
    if (g.outcome === 'over') over_count += 1;
    else if (g.outcome === 'under') under_count += 1;
    else push_count += 1;
    margins.push(g.margin);
    stat_values.push(g.player_stat_value);
    if (g.coverage_label === 'single_book') has_single_book = true;
  }

  const or_denominator = over_count + under_count;
  const over_rate =
    or_denominator === 0
      ? null
      : Math.round((over_count / or_denominator) * 10000) / 10000;

  const avg_margin =
    eligible_n === 0 ? null : round4(margins.reduce((a, b) => a + b, 0) / eligible_n);
  const median_margin = eligible_n === 0 ? null : round4(median(margins));
  const avg_stat_value =
    eligible_n === 0
      ? null
      : round4(stat_values.reduce((a, b) => a + b, 0) / eligible_n);
  const median_stat_value =
    eligible_n === 0 ? null : round4(median(stat_values));

  // Streak: walk the reverse-chron list from index 0. Stop at first push OR
  // opposite outcome. eligible-only means coverage gaps have already stopped
  // the traversal.
  let current_streak_direction: RealLineOutcome | null = null;
  let current_streak_length: number | null = null;
  if (eligible_n > 0) {
    const first = eligible[0]!.outcome;
    if (first === 'push') {
      // A push at index 0 means no active over/under streak — but a push
      // streak length of 1 is meaningful.
      current_streak_direction = 'push';
      current_streak_length = 1;
    } else {
      current_streak_direction = first;
      let len = 1;
      for (let i = 1; i < eligible.length; i += 1) {
        if (eligible[i]!.outcome === first) len += 1;
        else break; // opposite or push stops the streak
      }
      current_streak_length = len;
    }
  }

  const coverage_label: CoverageLabel = incomplete
    ? 'incomplete'
    : has_single_book && eligible_n > 0
    ? 'single_book'
    : eligible_n === 0
    ? 'no_closing_line'
    : 'complete';

  return Object.freeze({
    window_type,
    requested_n: requested ?? eligible_n,
    eligible_n,
    incomplete,
    over_count,
    under_count,
    push_count,
    over_rate,
    avg_margin,
    median_margin,
    avg_stat_value,
    median_stat_value,
    current_streak_direction,
    current_streak_length,
    coverage_label,
  });
}

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const sorted = xs.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid]!;
  return (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

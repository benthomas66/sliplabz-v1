// V1-5 threshold-window calculations per amendment A1 §9.2.
//
// Compares player performance against a user-supplied threshold. This is
// LINE-RELATIVE — distinct from real-line results (which compare against
// the game's actual closing line). Both are needed by A1 §9. This module
// owns the threshold form.
//
// Rules:
//   * Reverse-chronological traversal.
//   * Push semantics: value === threshold is `equal`. NEVER a win/loss.
//   * Streak stops at opposite direction or `equal` (mirrors §14.5's
//     "opposite result" rule but for line-relative outcomes).
//   * `includes_backfilled_historical` labels the aggregate for the
//     read-model contract per governor ledger #8.

import { methodVersionOf } from './computationVersion.js';
import type { ThresholdWindowResult } from './types.js';

export interface ThresholdWindowGame {
  readonly game_date_utc: string;
  readonly player_stat_value: number;
  readonly is_backfilled_historical: boolean;
}

const REQUESTED_BY_WINDOW: Readonly<Record<'L5' | 'L10' | 'L20' | 'season', number | null>> = Object.freeze({
  L5: 5, L10: 10, L20: 20, season: null,
});

function median(nums: number[]): number {
  const sorted = [...nums].sort((a, b) => a - b);
  const n = sorted.length;
  if (n === 0) return 0;
  if (n % 2 === 1) return sorted[Math.floor(n / 2)]!;
  return (sorted[n / 2 - 1]! + sorted[n / 2]!) / 2;
}
function round4(n: number): number { return Math.round(n * 10000) / 10000; }

export function computeThresholdWindow(
  window_type: 'L5' | 'L10' | 'L20' | 'season',
  threshold: number,
  games_reverse_chron: ReadonlyArray<ThresholdWindowGame>
): ThresholdWindowResult {
  const requested = REQUESTED_BY_WINDOW[window_type];
  const requested_n = requested ?? games_reverse_chron.length;
  const eligible = games_reverse_chron.slice(
    0,
    requested === null ? games_reverse_chron.length : requested
  );
  const eligible_n = eligible.length;
  const incomplete = requested !== null && eligible_n < requested;

  let count_above = 0, count_equal = 0, count_below = 0;
  const values: number[] = [];
  for (const g of eligible) {
    values.push(g.player_stat_value);
    if (g.player_stat_value > threshold) count_above += 1;
    else if (g.player_stat_value < threshold) count_below += 1;
    else count_equal += 1;
  }
  const avg = eligible_n === 0 ? null : round4(values.reduce((a, b) => a + b, 0) / eligible_n);
  const med = eligible_n === 0 ? null : round4(median(values));
  const avg_minus = avg === null ? null : round4(avg - threshold);
  const med_minus = med === null ? null : round4(med - threshold);

  let dir: 'above' | 'below' | 'equal' | null = null;
  let len: number | null = null;
  if (eligible_n > 0) {
    const first = eligible[0]!.player_stat_value;
    if (first > threshold) dir = 'above';
    else if (first < threshold) dir = 'below';
    else dir = 'equal';
    len = 1;
    for (let i = 1; i < eligible.length; i += 1) {
      const v = eligible[i]!.player_stat_value;
      const cur: 'above' | 'below' | 'equal' =
        v > threshold ? 'above' : v < threshold ? 'below' : 'equal';
      if (cur === dir) len += 1;
      else break;
    }
  }
  const coverage_label: 'complete' | 'incomplete' | 'no_data' =
    eligible_n === 0 ? 'no_data' : incomplete ? 'incomplete' : 'complete';
  return Object.freeze({
    window_type,
    threshold,
    requested_n: requested ?? eligible_n,
    eligible_n,
    incomplete,
    count_above, count_equal, count_below,
    avg_stat_value: avg,
    median_stat_value: med,
    avg_minus_threshold: avg_minus,
    median_minus_threshold: med_minus,
    current_streak_direction: dir,
    current_streak_length: len,
    coverage_label,
    method_version: methodVersionOf('threshold_window'),
    includes_backfilled_historical: eligible.some((g) => g.is_backfilled_historical),
  });
}

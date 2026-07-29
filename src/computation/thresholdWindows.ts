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
  /** Canonical stable game identity (`games` PK). V1-8a0a AMENDMENT 18: threaded
   *  UNCHANGED from the committed historical read so the per-game outcome exposed
   *  for persistence carries the same canonical join key the frozen series reader
   *  now carries. Not consumed by the aggregate math. OPTIONAL on the type so a
   *  windows-only consumer that persists NO series (e.g. the app's fixture
   *  research repository) may omit it without change; the production populate path
   *  (`readHistoricalGamesForPlayerMarket`) ALWAYS supplies it, and the series
   *  join (`buildSeries`) fails loud if an eligible outcome ever lacks it. */
  readonly internal_game_id?: string | undefined;
  readonly game_date_utc: string;
  readonly player_stat_value: number;
  readonly is_backfilled_historical: boolean;
}

/**
 * V1-8a0a SCOPE A (interface extension) — ONE already-computed per-game
 * threshold-relative outcome, exposed SOLELY for persistence of the series.
 * `outcome` is the SAME per-game comparison `computeThresholdWindow` already
 * performs internally to build its counts (`> threshold` → above, `< threshold`
 * → below, else equal). Nothing new is computed, no threshold/classification/
 * score/semantic change; the value equals the transient the count loop uses.
 */
export interface ThresholdWindowGameOutcome {
  /** Carried through UNCHANGED from `ThresholdWindowGame.internal_game_id`
   *  (Amendment 18). `undefined` only for a windows-only caller that supplied no
   *  id; the production populate path always carries it. The series join requires
   *  it (fails loud otherwise). */
  readonly internal_game_id?: string | undefined;
  readonly game_date_utc: string;
  readonly player_stat_value: number;
  readonly outcome: 'above' | 'below' | 'equal';
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
  // V1-8a0a SCOPE A: retain (expose) the per-game outcome the count loop ALREADY
  // determines — no new computation, the same `> / < / =` comparison that
  // increments each counter. Order = eligible order (reverse-chron).
  const games_evaluated: ThresholdWindowGameOutcome[] = [];
  for (const g of eligible) {
    values.push(g.player_stat_value);
    let outcome: 'above' | 'below' | 'equal';
    if (g.player_stat_value > threshold) { count_above += 1; outcome = 'above'; }
    else if (g.player_stat_value < threshold) { count_below += 1; outcome = 'below'; }
    else { count_equal += 1; outcome = 'equal'; }
    games_evaluated.push(Object.freeze({
      internal_game_id: g.internal_game_id,
      game_date_utc: g.game_date_utc,
      player_stat_value: g.player_stat_value,
      outcome,
    }));
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
    games_evaluated: Object.freeze(games_evaluated),
  });
}

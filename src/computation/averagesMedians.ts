// V1-5 averages / medians / sample-size labels — plain central-tendency
// aggregates over an eligible player-game sample.
//
// One owner: this module is the only place average/median/label formulas
// live. Both Board and Brief consume it.

import { methodVersionOf } from './computationVersion.js';
import type { AveragesMediansResult, SampleSizeLabelResult } from './types.js';

export interface SampleGame {
  readonly game_date_utc: string;
  readonly player_stat_value: number;
  readonly is_backfilled_historical: boolean;
}

const REQUESTED_BY_WINDOW: Readonly<Record<'L5' | 'L10' | 'L20' | 'season', number | null>> = Object.freeze({
  L5: 5, L10: 10, L20: 20, season: null,
});

function round4(n: number): number { return Math.round(n * 10000) / 10000; }
function medianOf(nums: number[]): number {
  const s = [...nums].sort((a, b) => a - b);
  const n = s.length;
  if (n === 0) return 0;
  if (n % 2 === 1) return s[Math.floor(n / 2)]!;
  return (s[n / 2 - 1]! + s[n / 2]!) / 2;
}

/** Averages / medians per window. Same reverse-chron traversal as the
 *  other window computers. */
export function computeAveragesMedians(
  window_type: 'L5' | 'L10' | 'L20' | 'season',
  games_reverse_chron: ReadonlyArray<SampleGame>
): AveragesMediansResult {
  const requested = REQUESTED_BY_WINDOW[window_type];
  const eligible = games_reverse_chron.slice(
    0,
    requested === null ? games_reverse_chron.length : requested
  );
  const eligible_n = eligible.length;
  const values = eligible.map((g) => g.player_stat_value);
  return Object.freeze({
    window_type,
    eligible_n,
    average: eligible_n === 0 ? null : round4(values.reduce((a, b) => a + b, 0) / eligible_n),
    median: eligible_n === 0 ? null : round4(medianOf(values)),
    method_version: methodVersionOf('average_stat'),
    includes_backfilled_historical: eligible.some((g) => g.is_backfilled_historical),
  });
}

/**
 * Sample-size label. Truthful (never paywalled). `no_data`, `incomplete`,
 * or `complete` — nothing else.
 */
export function computeSampleSizeLabel(
  window_type: 'L5' | 'L10' | 'L20' | 'season',
  eligible_n: number
): SampleSizeLabelResult {
  const requested = REQUESTED_BY_WINDOW[window_type];
  const requested_n = requested ?? eligible_n;
  let label: 'complete' | 'incomplete' | 'no_data';
  if (eligible_n === 0) label = 'no_data';
  else if (requested !== null && eligible_n < requested) label = 'incomplete';
  else label = 'complete';
  return Object.freeze({
    eligible_n,
    label,
    requested_n,
    method_version: methodVersionOf('sample_size_label'),
  });
}

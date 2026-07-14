// V1-5 real-line windows — thin owner-adapter over src/lines/realLineWindows.ts.
//
// The pure math lives in `src/lines/realLineWindows.ts` (V1-4). This module
// wraps it to add the two V1-5 obligations:
//   (a) `method_version` metadata for the shared computation contract;
//   (b) explicit `includes_backfilled_historical` labeling per governor
//       ledger #8. Historical windows/results computations include
//       backfilled_historical (spec §14 real-line results); anything
//       presented as "observed by SlipLabz since launch" must exclude them.

import { computeRealLineWindow as computeRealLineWindowV14 } from '../lines/realLineWindows.js';
import type { WindowInputGame } from '../lines/realLineWindows.js';
import { methodVersionOf } from './computationVersion.js';
import type { RealLineWindowResult } from './types.js';

export interface RealLineWindowInputGame extends WindowInputGame {
  /** True when the input game's canonical_closing_point derives from a
   *  `backfilled_historical` provenance row. Passed by the caller because
   *  the pure math has no notion of provenance. */
  readonly is_backfilled_historical: boolean;
}

export function computeRealLineWindow(
  window_type: 'L5' | 'L10' | 'L20' | 'season',
  games_reverse_chron: ReadonlyArray<RealLineWindowInputGame>
): RealLineWindowResult {
  const base = computeRealLineWindowV14(window_type, games_reverse_chron);
  const included = games_reverse_chron.slice(
    0,
    window_type === 'season' ? games_reverse_chron.length :
      window_type === 'L5' ? 5 : window_type === 'L10' ? 10 : 20
  );
  const includes_backfilled_historical = included.some((g) => g.is_backfilled_historical);
  return Object.freeze({
    window_type: base.window_type,
    requested_n: base.requested_n,
    eligible_n: base.eligible_n,
    incomplete: base.incomplete,
    over_count: base.over_count,
    under_count: base.under_count,
    push_count: base.push_count,
    over_rate: base.over_rate,
    avg_margin: base.avg_margin,
    median_margin: base.median_margin,
    avg_stat_value: base.avg_stat_value,
    median_stat_value: base.median_stat_value,
    current_streak_direction: base.current_streak_direction,
    current_streak_length: base.current_streak_length,
    coverage_label: base.coverage_label,
    method_version: methodVersionOf('real_line_window'),
    includes_backfilled_historical,
  });
}

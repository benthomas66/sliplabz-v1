// Historical line result: Over / Under / Push per complete spec §7.12.
//
// Authority:
//   Complete spec §7.11 (real-line eligibility)
//   Complete spec §7.12 (push — separate outcome; excluded from percentages
//     and streak direction)
//   Complete spec §11.5 historical_line_results
//   Ticket V1-4 hard invariants:
//     - Push is a distinct outcome — NEVER a win for either side;
//     - Real-line L5/L10/L20/season windows preserve actual n;
//     - Coverage gaps stop streaks rather than bridging them;
//     - Missing closing line is a truthful absent state (excluded here).

import type { CoverageLabel, RealLineOutcome } from '../shared/enums.js';

export interface HistoricalLineResultInput {
  readonly canonical_closing_point: number;
  readonly player_stat_value: number;
  readonly coverage_label: Extract<CoverageLabel, 'complete' | 'single_book'>;
}

export interface HistoricalLineResultOutput {
  readonly outcome: RealLineOutcome;
  readonly margin: number;
  readonly canonical_closing_point: number;
  readonly player_stat_value: number;
  readonly coverage_label: HistoricalLineResultInput['coverage_label'];
}

/**
 * Compute the historical line outcome for one (game, player, market) row.
 *
 * Rules:
 *   * margin = player_stat_value - canonical_closing_point
 *   * margin > 0 → over
 *   * margin < 0 → under
 *   * margin = 0 → push
 *
 * Push is deliberately its own category. Downstream aggregations MUST NOT
 * add push to over_count or under_count. Downstream streak logic MUST stop
 * at a push (spec §7.12, §14.5).
 */
export function computeHistoricalLineResult(
  input: HistoricalLineResultInput
): HistoricalLineResultOutput {
  const margin = input.player_stat_value - input.canonical_closing_point;
  const rounded = Math.round(margin * 100) / 100;
  const outcome: RealLineOutcome =
    rounded > 0 ? 'over' : rounded < 0 ? 'under' : 'push';
  return Object.freeze({
    outcome,
    margin: rounded,
    canonical_closing_point: input.canonical_closing_point,
    player_stat_value: input.player_stat_value,
    coverage_label: input.coverage_label,
  });
}

// V1-7a — INTERNAL research candidate (the raw computed bundle for ONE grain).
//
//   raw rows -> internal research candidate -> ResearchProjection constructor
//     -> ResearchProjection -> (V1-7b) rendering
//
// This type carries the FULL committed computation for a single (game, player,
// market) grain — the engine output (classification, direction, components incl.
// composite score, caps, reasons), the four threshold windows, and the composed
// current-market row (which still carries the PAID per-book `book_detail.offerings`).
// It is NEVER passed to a client component and NEVER rendered. The projection
// constructor reads an allowlist off it and returns a NEW object that omits the
// paid offerings and every restricted handle.
//
// EVERY field here is produced by EXISTING committed code — no new computation:
//   * profile_output  <- the committed v2 engine (persisted evidence_profiles
//                        + evidence_profile_reasons in production; canned in fixtures)
//   * windows         <- computeThresholdWindow (src/computation/thresholdWindows.ts)
//   * current_market_row <- composeCurrentMarketRowV2 (freshness-neutral)
//   * line_observed_at <- the committed read-model builder result

import type { MethodVersion } from './method.js';
import type { EvidenceProfileOutput, ThresholdWindows } from '../../../../src/evidence/types.js';
import type { CurrentMarketRow } from '../../../../src/computation/types.js';
import type { PlayerStatEligibility, BdlMinutesStatus } from '../../../../src/shared/enums.js';

/**
 * V1-7b — ONE per-game series row, oldest-to-newest over the display window.
 * Every field is READ, never re-derived: `eligibility_state` and
 * `minutes_status` are the VERBATIM committed values persisted on
 * `player_game_stats` (the output of `src/bdl/eligibility.ts computeEligibility`);
 * the app repository never re-authors "eligible"/"DNP". `stat_value` is the
 * player's stat for the market; `null` for DNP / ineligible-without-stat rows.
 */
export interface ResearchSeriesRow {
  readonly game_date_utc: string;
  readonly opponent_label: string;
  readonly is_home: boolean | null;
  readonly stat_value: number | null;
  readonly eligibility_state: PlayerStatEligibility;
  readonly minutes_status: BdlMinutesStatus;
  readonly includes_backfilled_historical: boolean;
}

export interface ResearchCandidate {
  // Both sourced from the PERSISTED evidence_profiles row (DR-19(c) — method
  // version shown in the same inspectable area as the score). Never derived.
  readonly method_version: MethodVersion;
  readonly computation_version: number;

  // identity + game context
  readonly player: string;
  readonly team: string;
  readonly market: string;
  readonly evaluated_line: number | null;
  readonly tipoff_utc: string | null;

  // V1-8b — ALREADY-KNOWN game context for the header matchup (opponent + is_home,
  // cities). Server-side only; the projection formats it to a display string.
  readonly opponent_city?: string | null;
  readonly player_team_city?: string | null;
  readonly is_home?: boolean | null;

  // the committed engine output for this grain (classification, direction,
  // components incl. composite_score, caps, and the DR-26 reason set)
  readonly profile_output: EvidenceProfileOutput;

  // the four committed threshold windows (counts / avgs / medians / streaks)
  readonly windows: ThresholdWindows;

  // per-game series (oldest-to-newest) for the chart. Read-only projection of
  // player_game_stats + historical_line_results rows; see ResearchSeriesRow.
  readonly series: ReadonlyArray<ResearchSeriesRow>;

  // the composed current-market row. NOTE: its `book_detail.offerings` is the
  // PAID per-book detail — the projection constructor DROPS it (free tier).
  readonly current_market_row: CurrentMarketRow;

  // serving-gate input (freshest observed_at; V1-6d semantics)
  readonly line_observed_at: string | null;
}

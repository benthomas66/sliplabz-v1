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

  // the committed engine output for this grain (classification, direction,
  // components incl. composite_score, caps, and the DR-26 reason set)
  readonly profile_output: EvidenceProfileOutput;

  // the four committed threshold windows (counts / avgs / medians / streaks)
  readonly windows: ThresholdWindows;

  // the composed current-market row. NOTE: its `book_detail.offerings` is the
  // PAID per-book detail — the projection constructor DROPS it (free tier).
  readonly current_market_row: CurrentMarketRow;

  // serving-gate input (freshest observed_at; V1-6d semantics)
  readonly line_observed_at: string | null;
}

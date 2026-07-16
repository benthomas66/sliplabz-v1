// V1-A1-3 Phase A — Component 4 §B.5 Market Alignment (C_MA).
//
// Authority: docs/product/EVIDENCE_PROFILE_METHOD_V1.md §B.5 verbatim.
//
//   consensus_gap := if C = null then 0 else (C − E)                 // Over-signed
//   consensus_gap_norm := max(-1, min(+1, consensus_gap / M))
//   coverage_at_line := Σ book_count where point == E
//   coverage_norm := 0 if eligible_book_count.count = 0
//                    else min(1, coverage_at_line / eligible_book_count.count)
//   movement_dir := if net_point_movement is null then 0
//                    else max(-1, min(+1, net_point_movement / M))
//   C_MA := 0.60 × consensus_gap_norm
//         + 0.20 × coverage_norm × sign(consensus_gap_norm)
//         + 0.20 × movement_dir
//
// §B.5 last clause: "When line_consensus.selection_method ∈
// {'tied_no_unique_mode', 'no_eligible_source'}, OR the §C.3
// disambiguation forces Unavailable, OR ONE_SIDED_OFFERING fires: C_MA
// := 0 and the profile inherits the reason code that produced the empty
// market alignment."
//
// This module OWNS the arithmetic. The §C.3 / §C.7 / tied-consensus
// force-to-zero clauses are wired here (they are DR-28-compliant zero
// values, not tiebreak inventions). The quality module observes the
// same conditions to emit the reasons.
//
// Pure function. No I/O.

import type { CurrentMarketRow } from '../../computation/types.js';
import { marginNormalizer } from '../marginNormalizers.js';

/** `sign` for §B.5's `coverage_norm × sign(consensus_gap_norm)` term. */
function signOf(x: number): -1 | 0 | 1 {
  if (x > 0) return 1;
  if (x < 0) return -1;
  return 0;
}

/**
 * The reason C_MA was zeroed by the "empty market alignment" branch of
 * §B.5. Consumers use this to attach the corresponding §E reason.
 * `null` means C_MA was NOT zeroed by that branch.
 */
export type CmaZeroCause =
  | null
  | 'tied_no_unique_mode'    // §B.5 + §C.3.1 (DR-28)
  | 'no_eligible_source'     // §B.5 + §C.3 no market
  | 'freshness_unavailable'  // §C.3 unavailable branch
  | 'one_sided_offering';    // §C.7 (DR-18)

export interface CmaInputs {
  readonly evaluated_line: number;
  readonly current_market_row: CurrentMarketRow;
  readonly market_key: string;
  /** Optional override to force C_MA := 0 with an attached cause. Used
   *  when §C.7 one-sided fires (the quality module detects this and
   *  forwards the zero flag). §B.5 tied-consensus and no-market are
   *  detected here from the CurrentMarketRow itself. */
  readonly force_zero_cause?: CmaZeroCause;
}

export interface CmaResult {
  readonly c_ma: number;
  /** Non-null when C_MA was zeroed by an §B.5 last-clause branch. */
  readonly zero_cause: CmaZeroCause;
  /** Intermediate values retained for reason emission / auditability. */
  readonly consensus_gap: number;
  readonly consensus_gap_norm: number;
  readonly coverage_norm: number;
  readonly movement_dir: number;
}

export function computeCMA(input: CmaInputs): CmaResult {
  const cmr = input.current_market_row;
  const M = marginNormalizer(input.market_key);

  // Detect §B.5 last-clause triggers we can see from the CurrentMarketRow.
  // §C.3 stale/failed_latest_poll with usable prior does NOT zero C_MA
  // per §F.6 explicit note ("C_MA STILL computes here — the 'empty
  // consensus' clause fires only when the consensus itself is
  // unresolved OR §C.7 one-sided fires, not merely because the market
  // is stale"). Only freshness = 'unavailable' zeros here.
  let zero_cause: CmaZeroCause = input.force_zero_cause ?? null;
  if (zero_cause === null) {
    const sel = cmr.line_consensus.selection_method;
    if (sel === 'tied_no_unique_mode') zero_cause = 'tied_no_unique_mode';
    else if (sel === 'no_eligible_source') zero_cause = 'no_eligible_source';
    else if (cmr.freshness.state === 'unavailable') zero_cause = 'freshness_unavailable';
  }

  const E = input.evaluated_line;
  const C = cmr.line_consensus.consensus_point;
  const consensus_gap = C === null ? 0 : (C - E);
  const consensus_gap_norm = Math.max(-1, Math.min(+1, consensus_gap / M));

  // coverage_at_line = Σ book_count over point_distribution.counts where point == E.
  let coverage_at_line = 0;
  for (const c of cmr.point_distribution.counts) {
    if (c.point === E) coverage_at_line += c.book_count;
  }
  const book_count = cmr.eligible_book_count.count;
  const coverage_norm = book_count === 0
    ? 0
    : Math.min(1, coverage_at_line / book_count);

  const movement_dir = cmr.movement_summary.net_point_movement === null
    ? 0
    : Math.max(-1, Math.min(+1, cmr.movement_summary.net_point_movement / M));

  if (zero_cause !== null) {
    return Object.freeze({
      c_ma: 0,
      zero_cause,
      consensus_gap,
      consensus_gap_norm,
      coverage_norm,
      movement_dir,
    });
  }

  const c_ma_raw =
    0.60 * consensus_gap_norm +
    0.20 * coverage_norm * signOf(consensus_gap_norm) +
    0.20 * movement_dir;
  const c_ma = Math.max(-1, Math.min(+1, c_ma_raw));
  return Object.freeze({
    c_ma,
    zero_cause: null,
    consensus_gap,
    consensus_gap_norm,
    coverage_norm,
    movement_dir,
  });
}

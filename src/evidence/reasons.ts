// V1-A1-3 Phase A — §E reason attachment + §E.2 / DR-26 ordering.
//
// Authority: docs/product/EVIDENCE_PROFILE_METHOD_V1.md §E.1 (closed
// vocabulary, one trigger per code), §E.2 + DR-26 (canonical stored
// order), §F worked examples (every reason emission below is verified
// against at least one §F example).
//
// GD-8 respected: no probability/EV/projection language anywhere.
//
// DR-27 / §I.3: `abnormal_dispersion` is RESERVED — this module refuses
// to attach it under any condition. The engine test suite asserts this
// across the full fixture matrix.
//
// Pure functions.

import type {
  EvidenceDirection,
  EvidenceReasonCategory,
  EvidenceReasonCode,
} from '../shared/enums.js';
import type { AttachedReason, EvidenceProfileInput, ThresholdWindows } from './types.js';
import type { CmaZeroCause } from './components/cma.js';
import { EVIDENCE_RESERVED_REASON_CODES } from '../shared/enums.js';
import {
  T2_MIN_ABS,
  firesMarginMeasuresDisagree,
  firesMarketDisagreesWithHistory,
  firesWindowsDisagree,
} from './quality.js';

/** DR-15: half-point (0.5) or more, in the market's stat units. */
export const DR15_CONSENSUS_DIFFERENCE = 0.5;

/** §E.1 magnitude thresholds. */
const POSITIVE_NEGATIVE_MARGIN_SUPPORT_MIN = 0.30;
const WINDOW_AGREEMENT_SUPPORT_MIN = 0.60;

/**
 * §E.1 category mapping. This is the ONLY place a reason code's DR-26
 * category is assigned. §E.1 mixes "Downgrade" and "Attach" under the
 * "quality" bucket for stored ordering purposes; the label in the row
 * "Category" column is authoritative.
 *
 * Owner ruling 2026-07-15 (DR-28): NO_UNIQUE_CONSENSUS_LINE is an
 * Exclusion → Unavailable reason; §E.2 canonical-order treatment groups
 * "quality/coverage limitations" — for an Unavailable classification,
 * the reason is a limitation. So category = 'quality' per DR-26 stored
 * ordering. It is the PRIMARY reason on a tied-consensus profile per
 * DR-28.
 */
export const REASON_CATEGORY: Readonly<Record<EvidenceReasonCode, EvidenceReasonCategory>> = Object.freeze({
  // §E.1 Support
  window_agreement_support: 'support',
  favorable_consensus_difference: 'support',
  positive_margin_support: 'support',
  // §E.1 Contradiction
  unfavorable_consensus_difference: 'contradiction',
  negative_margin_support: 'contradiction',
  margin_measures_disagree: 'contradiction',
  market_disagrees_with_history: 'contradiction',
  windows_disagree: 'contradiction',
  // §E.1 Quality (Downgrade / Attach / Exclusion — all classified under
  // "quality/coverage limitations" per §E.2 DR-26 canonical order).
  stale_current_market: 'quality',
  insufficient_book_coverage: 'quality',
  push_heavy_sample: 'quality',
  one_sided_offering: 'quality',
  source_unavailable: 'quality',
  insufficient_l10_sample: 'quality',
  incomplete_historical_coverage: 'quality',
  unresolved_player_mapping: 'quality',
  unresolved_event_mapping: 'quality',
  no_current_market: 'quality',
  no_unique_consensus_line: 'quality',
  postponed_game: 'quality',
  canceled_game: 'quality',
  // RESERVED — must never be emitted.
  abnormal_dispersion: 'quality',
});

/**
 * §E.1 support/contradiction triggers. Consumed by `attachReasons` for
 * classified profiles (Strong / Moderate / Insufficient / Mixed with
 * direction). Returns null when the reason does not fire.
 *
 * A note on §F.3 (Mixed): §F.3 explicitly says
 * "POSITIVE_MARGIN_SUPPORT / NEGATIVE_MARGIN_SUPPORT: |C_MS|=0.31 ≥ 0.30.
 * sign(C_MS) = +1, sign(score) = −1 (score = −0.05) → signs disagree →
 * NEGATIVE_MARGIN_SUPPORT fires." So NEGATIVE_MARGIN_SUPPORT is
 * triggered by comparing sign(C_MS) to sign(score) — NOT to `direction`
 * (which is null when |score| < 0.05). This is why the trigger takes a
 * `sign_reference` parameter that is `sign(score)` — the composite's
 * sign, not the profile's declared direction.
 */
function firesPositiveMarginSupport(c_ms: number, sign_reference: -1 | 0 | 1): boolean {
  return Math.sign(c_ms) === sign_reference && sign_reference !== 0 && Math.abs(c_ms) >= POSITIVE_NEGATIVE_MARGIN_SUPPORT_MIN;
}
function firesNegativeMarginSupport(c_ms: number, sign_reference: -1 | 0 | 1): boolean {
  return Math.sign(c_ms) !== 0 && sign_reference !== 0 && Math.sign(c_ms) !== sign_reference && Math.abs(c_ms) >= POSITIVE_NEGATIVE_MARGIN_SUPPORT_MIN;
}

/**
 * §E.1 WINDOW_AGREEMENT_SUPPORT — attaches only when the profile has a
 * DIRECTION (§F.3 clause: "Since the classification is Mixed (no
 * direction picked), this reason does NOT attach — WINDOW_AGREEMENT_SUPPORT
 * requires a direction to match against.").
 */
function firesWindowAgreementSupport(c_wa: number, direction: EvidenceDirection | null): boolean {
  if (direction === null) return false;
  const dir_sign: -1 | 0 | 1 = direction === 'over' ? 1 : -1;
  return Math.abs(c_wa) >= WINDOW_AGREEMENT_SUPPORT_MIN && Math.sign(c_wa) === dir_sign;
}

/**
 * §E.1 FAVORABLE_CONSENSUS_DIFFERENCE / UNFAVORABLE (DR-15 half-point).
 * "For Over: E ≤ C − 0.5; for Under: E ≥ C + 0.5" for favorable.
 * Unfavorable is the mirror. Neither fires when direction is null.
 * Neither fires when consensus is null.
 */
function firesFavorableConsensusDifference(
  E: number,
  C: number | null,
  direction: EvidenceDirection | null
): boolean {
  if (C === null || direction === null) return false;
  if (direction === 'over') return E <= C - DR15_CONSENSUS_DIFFERENCE;
  return E >= C + DR15_CONSENSUS_DIFFERENCE;
}
function firesUnfavorableConsensusDifference(
  E: number,
  C: number | null,
  direction: EvidenceDirection | null
): boolean {
  if (C === null || direction === null) return false;
  if (direction === 'over') return E >= C + DR15_CONSENSUS_DIFFERENCE;
  return E <= C - DR15_CONSENSUS_DIFFERENCE;
}

// ---------------------------------------------------------------------------
// Reason emission for the six §F worked-example paths
// ---------------------------------------------------------------------------

/**
 * All context the reasons stage needs, gathered by the engine so this
 * module doesn't have to re-derive.
 */
export interface ReasonsContext {
  readonly classification:
    | 'strong_over_evidence' | 'moderate_over_evidence'
    | 'mixed_evidence'
    | 'moderate_under_evidence' | 'strong_under_evidence'
    | 'insufficient_evidence' | 'unavailable';
  readonly direction: EvidenceDirection | null;
  readonly components: {
    readonly c_rtp: number | null;
    readonly c_ms: number | null;
    readonly c_wa: number | null;
    readonly c_ma: number | null;
    readonly composite_score: number | null;
    readonly rd_L10: number | null;
    readonly rd_L20: number | null;
    readonly rd_season: number | null;
  };
  /** Which §C rule made the profile Unavailable/Insufficient (if any). */
  readonly unavailable_cause:
    | 'postponed_game'
    | 'canceled_game'
    | 'unresolved_player_mapping'
    | 'unresolved_event_mapping'
    | 'no_current_market'
    | 'no_unique_consensus_line'
    | null;
  readonly insufficient_causes: {
    readonly l10_sample: boolean;
    readonly season_sample: boolean;
    readonly coverage_span: boolean;
  };
  /** Cap reasons that fired (some may fire while the classification is
   *  still classified — they cap Strong down to Moderate). */
  readonly cap_reasons: {
    readonly stale_current_market: boolean;
    readonly insufficient_book_coverage: boolean;
    readonly push_heavy_sample: boolean;
    readonly one_sided_offering: boolean;
    readonly market_disagrees_with_history: boolean;
  };
  /** Availability signal per §C.3 last paragraph. */
  readonly source_unavailable: boolean;
  readonly cma_zero_cause: CmaZeroCause;
}

/**
 * Emit the ordered reason list for the profile. Rules:
 *   - Unavailable: PRIMARY = the unavailable_cause; no support / no
 *     contradiction attaches.
 *   - Insufficient: quality-side reasons only (no support / no contradiction
 *     evaluated — §F.4 "not evaluated for Insufficient").
 *   - Classified (Strong/Moderate/Mixed): support + contradiction reasons
 *     evaluated on components; caps attach as quality.
 *
 * DR-26 canonical stored order:
 *   support first (rank 1..N by |contribution| desc, tie lex by code);
 *   then contradiction (same ordering);
 *   then quality (same ordering).
 */
export function attachReasons(
  ctx: ReasonsContext,
  input: EvidenceProfileInput
): ReadonlyArray<AttachedReason> {
  type Draft = {
    reason_code: EvidenceReasonCode;
    category: EvidenceReasonCategory;
    contribution_magnitude: number | null;
  };
  const support: Draft[] = [];
  const contradiction: Draft[] = [];
  const quality: Draft[] = [];

  // ---- Unavailable primary reason -----------------------------------------
  if (ctx.classification === 'unavailable') {
    if (ctx.unavailable_cause === 'postponed_game') {
      quality.push({ reason_code: 'postponed_game', category: 'quality', contribution_magnitude: null });
    } else if (ctx.unavailable_cause === 'canceled_game') {
      quality.push({ reason_code: 'canceled_game', category: 'quality', contribution_magnitude: null });
    } else if (ctx.unavailable_cause === 'unresolved_player_mapping') {
      quality.push({ reason_code: 'unresolved_player_mapping', category: 'quality', contribution_magnitude: null });
    } else if (ctx.unavailable_cause === 'unresolved_event_mapping') {
      quality.push({ reason_code: 'unresolved_event_mapping', category: 'quality', contribution_magnitude: null });
    } else if (ctx.unavailable_cause === 'no_current_market') {
      quality.push({ reason_code: 'no_current_market', category: 'quality', contribution_magnitude: null });
    } else if (ctx.unavailable_cause === 'no_unique_consensus_line') {
      quality.push({ reason_code: 'no_unique_consensus_line', category: 'quality', contribution_magnitude: null });
    }
    // §C.3 availability signal attaches independently — never causes Unavailable itself.
    if (ctx.source_unavailable) {
      quality.push({ reason_code: 'source_unavailable', category: 'quality', contribution_magnitude: null });
    }
    return orderDR26(support, contradiction, quality);
  }

  // ---- Insufficient reasons (§F.4: quality only) --------------------------
  if (ctx.classification === 'insufficient_evidence') {
    if (ctx.insufficient_causes.l10_sample) {
      quality.push({ reason_code: 'insufficient_l10_sample', category: 'quality', contribution_magnitude: null });
    }
    if (ctx.insufficient_causes.season_sample || ctx.insufficient_causes.coverage_span) {
      // §C.1 rolls both season-sample-thin and coverage-span-thin under
      // INCOMPLETE_HISTORICAL_COVERAGE. Attach once even if both fire.
      quality.push({ reason_code: 'incomplete_historical_coverage', category: 'quality', contribution_magnitude: null });
    }
    if (ctx.source_unavailable) {
      quality.push({ reason_code: 'source_unavailable', category: 'quality', contribution_magnitude: null });
    }
    return orderDR26(support, contradiction, quality);
  }

  // ---- Classified profile (Strong/Moderate/Mixed): full §E.1 pass ---------
  const c_ms = ctx.components.c_ms;
  const c_wa = ctx.components.c_wa;
  const c_ma = ctx.components.c_ma;
  const c_rtp = ctx.components.c_rtp;
  const score = ctx.components.composite_score;

  // Support / contradiction reasons keyed on the composite's sign (or
  // 0 in the tie zone). This matches §F.3 which fires
  // NEGATIVE_MARGIN_SUPPORT on a Mixed profile with score = -0.05
  // (direction = null) because sign(C_MS) ≠ sign(score) ≠ 0.
  const sign_reference: -1 | 0 | 1 = score === null ? 0 : Math.sign(score) as -1 | 0 | 1;

  if (c_ms !== null && firesPositiveMarginSupport(c_ms, sign_reference)) {
    support.push({ reason_code: 'positive_margin_support', category: 'support', contribution_magnitude: c_ms });
  }
  if (c_wa !== null && firesWindowAgreementSupport(c_wa, ctx.direction)) {
    support.push({ reason_code: 'window_agreement_support', category: 'support', contribution_magnitude: c_wa });
  }
  if (firesFavorableConsensusDifference(
    input.evaluated_line,
    input.current_market_row.line_consensus.consensus_point,
    ctx.direction
  )) {
    const C = input.current_market_row.line_consensus.consensus_point!;
    // Contribution magnitude for ordering: absolute gap (Over-signed).
    support.push({
      reason_code: 'favorable_consensus_difference',
      category: 'support',
      contribution_magnitude: Math.abs(C - input.evaluated_line),
    });
  }

  if (c_ms !== null && firesNegativeMarginSupport(c_ms, sign_reference)) {
    contradiction.push({ reason_code: 'negative_margin_support', category: 'contradiction', contribution_magnitude: c_ms });
  }
  if (firesUnfavorableConsensusDifference(
    input.evaluated_line,
    input.current_market_row.line_consensus.consensus_point,
    ctx.direction
  )) {
    const C = input.current_market_row.line_consensus.consensus_point!;
    contradiction.push({
      reason_code: 'unfavorable_consensus_difference',
      category: 'contradiction',
      contribution_magnitude: Math.abs(C - input.evaluated_line),
    });
  }
  if (firesMarginMeasuresDisagree(
    input.threshold_windows.L10.avg_minus_threshold,
    input.threshold_windows.L10.median_minus_threshold
  )) {
    contradiction.push({ reason_code: 'margin_measures_disagree', category: 'contradiction', contribution_magnitude: null });
  }
  if (c_ma !== null && c_rtp !== null && firesMarketDisagreesWithHistory(c_ma, c_rtp)) {
    // MARKET_DISAGREES_WITH_HISTORY: contribution magnitude = min(|C_MA|, |C_RTP|)
    // — both must be ≥ 0.30, so this is a legitimate strength summary.
    contradiction.push({
      reason_code: 'market_disagrees_with_history',
      category: 'contradiction',
      contribution_magnitude: Math.min(Math.abs(c_ma), Math.abs(c_rtp)),
    });
  }
  // WINDOWS_DISAGREE: derived from rd values (§C.5 corrected DR-17). Only
  // fires on L10/L20/season pair with opposite non-zero signs each with
  // |rd| ≥ 0.30. Contribution magnitude: the max |rd| involved (tie-
  // breaking rank).
  const rdL10 = ctx.components.rd_L10;
  const rdL20 = ctx.components.rd_L20;
  const rdSeason = ctx.components.rd_season;
  if (rdL10 !== null && rdL20 !== null && rdSeason !== null &&
      firesWindowsDisagree(rdL10, rdL20, rdSeason)) {
    contradiction.push({
      reason_code: 'windows_disagree',
      category: 'contradiction',
      contribution_magnitude: Math.max(Math.abs(rdL10), Math.abs(rdL20), Math.abs(rdSeason)),
    });
  }

  // Quality caps (§C.2 / §C.3 / §C.6 / §C.7 / §C.5 T2 — the last
  // already attached as a contradiction; caps attach as quality reasons
  // separately when they fired).
  if (ctx.cap_reasons.stale_current_market) {
    quality.push({ reason_code: 'stale_current_market', category: 'quality', contribution_magnitude: null });
  }
  if (ctx.cap_reasons.insufficient_book_coverage) {
    quality.push({ reason_code: 'insufficient_book_coverage', category: 'quality', contribution_magnitude: null });
  }
  if (ctx.cap_reasons.push_heavy_sample) {
    quality.push({ reason_code: 'push_heavy_sample', category: 'quality', contribution_magnitude: null });
  }
  if (ctx.cap_reasons.one_sided_offering) {
    quality.push({ reason_code: 'one_sided_offering', category: 'quality', contribution_magnitude: null });
  }
  if (ctx.source_unavailable) {
    quality.push({ reason_code: 'source_unavailable', category: 'quality', contribution_magnitude: null });
  }

  return orderDR26(support, contradiction, quality);
}

/**
 * §E.2 + DR-26 canonical stored order:
 *   category order: support → contradiction → quality.
 *   Within category, `|contribution| desc` then lex by reason_code.
 *   Rank is 1..N inside each category.
 *
 * ABNORMAL_DISPERSION guard: this function REFUSES any draft carrying
 * that code. If a bug reaches here with it, throw. The engine tests
 * assert this never happens across the fixture matrix.
 */
function orderDR26(
  support: ReadonlyArray<{ reason_code: EvidenceReasonCode; category: EvidenceReasonCategory; contribution_magnitude: number | null }>,
  contradiction: ReadonlyArray<{ reason_code: EvidenceReasonCode; category: EvidenceReasonCategory; contribution_magnitude: number | null }>,
  quality: ReadonlyArray<{ reason_code: EvidenceReasonCode; category: EvidenceReasonCategory; contribution_magnitude: number | null }>
): ReadonlyArray<AttachedReason> {
  const out: AttachedReason[] = [];
  for (const category of ['support', 'contradiction', 'quality'] as const) {
    const bucket = category === 'support' ? support : category === 'contradiction' ? contradiction : quality;
    // DR-26 tie-broken order: |contribution| desc; ties lex by reason_code asc.
    const sorted = [...bucket].sort((a, b) => {
      const ma = a.contribution_magnitude === null ? -Infinity : Math.abs(a.contribution_magnitude);
      const mb = b.contribution_magnitude === null ? -Infinity : Math.abs(b.contribution_magnitude);
      if (ma !== mb) return mb - ma; // desc
      return a.reason_code < b.reason_code ? -1 : a.reason_code > b.reason_code ? 1 : 0;
    });
    let rank = 1;
    for (const r of sorted) {
      if (EVIDENCE_RESERVED_REASON_CODES.has(r.reason_code)) {
        // DR-27 halt condition — the engine has attempted to emit a
        // reserved reason code. Throw rather than paper over.
        throw new Error(
          `V1-A1-3 halt condition: reserved reason code '${r.reason_code}' attempted attachment. ` +
          `Under evidence_method_v1 this code is RESERVED and MUST NOT be emitted (DR-27 / §I.3).`
        );
      }
      out.push(Object.freeze({
        reason_code: r.reason_code,
        category: r.category,
        intra_category_rank: rank,
        contribution_magnitude: r.contribution_magnitude,
      }));
      rank += 1;
    }
  }
  return Object.freeze(out);
}

/** Unused import guard to satisfy TypeScript when downstream test refs the value. */
export function _refT2ForTests(): number { return T2_MIN_ABS; }
/** Windows-disagree passthrough for tests. */
export function _refWDForTests(windows: ThresholdWindows): boolean {
  // Not used by production code; kept so tests importing ThresholdWindows
  // through this module don't need to reach into ./quality directly.
  void windows;
  return false;
}

// V1-A1-3 Phase A — top-level pure engine.
//
// Authority: docs/product/EVIDENCE_PROFILE_METHOD_V1.md (whole document).
// This module orchestrates §B → §C → §D → §E in the order the authority
// specifies. Every rule is delegated to its owner module; this file
// contains no formula.
//
// Pure function. No I/O. No clock. No persistence.
//
// Given identical inputs, identical outputs, forever.

import type { CmaZeroCause } from './components/cma.js';
import type {
  ComponentValues,
  EvidenceProfileInput,
  EvidenceProfileOutput,
} from './types.js';
import type { EvidenceQualityCapReason } from '../shared/enums.js';

import { computeCRTP, rateDeviation } from './components/crtp.js';
import { collectCmsInputs, computeCMS } from './components/cms.js';
import { computeCWA } from './components/cwa.js';
import { computeCMA } from './components/cma.js';
import { compositeScore, directionFromScore } from './components/composite.js';
import {
  evaluateC10Strong,
  evaluateQualityRules,
  firesMarketDisagreesWithHistory,
  firesWindowsDisagree,
} from './quality.js';
import { attachReasons, type ReasonsContext } from './reasons.js';
import { classify } from './classification.js';

const METHOD_VERSION = 'evidence_method_v1' as const;

/**
 * Compute the Evidence Profile for the input, per evidence_method_v1.
 *
 * The pipeline:
 *   1. Evaluate every §C predicate that can be answered from the input alone.
 *   2. If Unavailable via §C.9 unresolved mapping OR §C.8 postponed/canceled OR
 *      §C.3 no-market OR §C.3.1 tied consensus → short-circuit. Return
 *      Unavailable with the PRIMARY reason attached. Components null.
 *   3. If Insufficient via §C.1 → short-circuit. Return Insufficient with
 *      quality reasons only. Components null.
 *   4. Compute §B.2..§B.5 components (with §C.7 one-sided forcing C_MA := 0).
 *   5. Compute §B.6 composite + §B.7 direction.
 *   6. Evaluate §C.5 T2 MARKET_DISAGREES_WITH_HISTORY on the components.
 *   7. Evaluate §C.10 six clauses.
 *   8. Classify per §D.1 first-match order (WINDOWS_DISAGREE forces Mixed).
 *   9. Attach reasons per §E + DR-26 ordering.
 */
export function computeEvidenceProfile(
  input: EvidenceProfileInput
): EvidenceProfileOutput {
  const q = evaluateQualityRules(input);

  // §D.1 step 1 Unavailable — first-match order among the Unavailable causes.
  // §C.8 postponed/canceled is a game-status fact, so it takes precedence
  // over market/mapping issues. §C.9 mapping issues take precedence over
  // §C.3 no-market (an unresolved player has no market to speak of).
  let unavailable_cause: ReasonsContext['unavailable_cause'] = null;
  if (q.unavailable_postponed_game) unavailable_cause = 'postponed_game';
  else if (q.unavailable_canceled_game) unavailable_cause = 'canceled_game';
  else if (q.unavailable_unresolved_player_mapping) unavailable_cause = 'unresolved_player_mapping';
  else if (q.unavailable_unresolved_event_mapping) unavailable_cause = 'unresolved_event_mapping';
  else if (q.unavailable_no_current_market) unavailable_cause = 'no_current_market';
  else if (q.unavailable_no_unique_consensus_line) unavailable_cause = 'no_unique_consensus_line';

  const source_unavailable =
    input.current_market_row.availability_context !== null &&
    input.current_market_row.availability_context.presence_state === 'source_unavailable';

  if (unavailable_cause !== null) {
    return buildOutput({
      classification: 'unavailable',
      direction: null,
      components: NULL_COMPONENTS,
      quality_capped: false,
      quality_cap_reason: 'none',
      evaluated_line_kept: false,
      input,
      reasonsCtx: {
        classification: 'unavailable',
        direction: null,
        components: {
          c_rtp: null, c_ms: null, c_wa: null, c_ma: null, composite_score: null,
          rd_L10: null, rd_L20: null, rd_season: null,
        },
        unavailable_cause,
        insufficient_causes: { l10_sample: false, season_sample: false, coverage_span: false },
        cap_reasons: {
          stale_current_market: false,
          insufficient_book_coverage: false,
          push_heavy_sample: false,
          one_sided_offering: false,
          market_disagrees_with_history: false,
        },
        source_unavailable,
        cma_zero_cause: null,
      },
    });
  }

  // §D.1 step 2 Insufficient.
  if (q.insufficient_l10_sample || q.insufficient_season_sample || q.insufficient_coverage_span) {
    return buildOutput({
      classification: 'insufficient_evidence',
      direction: null,
      components: NULL_COMPONENTS,
      quality_capped: false,
      quality_cap_reason: 'none',
      evaluated_line_kept: true, // §C.1 fires after read model produced a (line, sample) pair
      input,
      reasonsCtx: {
        classification: 'insufficient_evidence',
        direction: null,
        components: {
          c_rtp: null, c_ms: null, c_wa: null, c_ma: null, composite_score: null,
          rd_L10: null, rd_L20: null, rd_season: null,
        },
        unavailable_cause: null,
        insufficient_causes: {
          l10_sample: q.insufficient_l10_sample,
          season_sample: q.insufficient_season_sample,
          coverage_span: q.insufficient_coverage_span,
        },
        cap_reasons: {
          stale_current_market: false,
          insufficient_book_coverage: false,
          push_heavy_sample: false,
          one_sided_offering: false,
          market_disagrees_with_history: false,
        },
        source_unavailable,
        cma_zero_cause: null,
      },
    });
  }

  // §B components.
  const rtp = computeCRTP(input.threshold_windows);
  const ms = computeCMS(collectCmsInputs(input.threshold_windows), input.market_key);
  const wa = computeCWA(input.threshold_windows);

  // §C.7 forces C_MA := 0 (via §B.5 last clause). §B.5 tied-consensus /
  // no-eligible-source / freshness-unavailable also zero C_MA, detected
  // by the CMA module itself.
  const force_zero_cause: CmaZeroCause = q.one_sided_offering_cap ? 'one_sided_offering' : null;
  const ma = computeCMA({
    evaluated_line: input.evaluated_line,
    current_market_row: input.current_market_row,
    market_key: input.market_key,
    ...(force_zero_cause !== null ? { force_zero_cause } : {}),
  });

  // §B.6 composite + §B.7 direction.
  const score = compositeScore({ c_rtp: rtp.c_rtp, c_ms: ms.c_ms, c_wa: wa.c_wa, c_ma: ma.c_ma });
  const direction = directionFromScore(score);

  // §C.5 corrected DR-17 WINDOWS_DISAGREE.
  const wd = firesWindowsDisagree(rtp.rd_L10, rateDeviation(input.threshold_windows.L20), rtp.rd_season);
  // rtp.rd_longer is either L20 or season depending on DR-13 pick; for the
  // WINDOWS_DISAGREE test we always want the RAW L20 rd (§C.5 uses
  // L10/L20/season by name, not the aggregated "longer_window"). Use a
  // direct call.

  // §C.5 T2 MARKET_DISAGREES_WITH_HISTORY.
  const t2 = firesMarketDisagreesWithHistory(ma.c_ma, rtp.c_rtp);

  // §C.10 gate.
  const any_capping_condition =
    q.stale_current_market_cap ||
    q.insufficient_book_coverage_cap ||
    q.push_heavy_sample_cap ||
    q.one_sided_offering_cap ||
    t2;
  const c10 = evaluateC10Strong({
    composite_score: score,
    l10_eligible_n: input.threshold_windows.L10.eligible_n,
    rd_L10: rtp.rd_L10,
    non_l5_magnitude: rtp.non_l5_magnitude,
    windows_disagree: wd,
    any_capping_condition,
  });

  // §D.1 classify.
  const cls = classify({
    any_unavailable: false, // handled above
    any_insufficient: false, // handled above
    windows_disagree: wd,
    composite_score: score,
    c10_all_pass: c10.all_pass,
    any_c10_clause5_cap_fired: any_capping_condition,
  });

  // §D.3 quality-cap reason (the PRIMARY binding cap for cheap query
  // filtering — the full set is reflected in the reasons list). Order
  // matches §D.3's canonical enumeration; only one wins for the summary
  // column. Prefer §C.7 first (it also zeros C_MA), then §C.6 push-heavy,
  // then §C.3 stale, then §C.2 book coverage, then §C.5 T2.
  let quality_cap_reason: EvidenceQualityCapReason = 'none';
  if (cls.quality_capped) {
    if (q.one_sided_offering_cap) quality_cap_reason = 'one_sided_offering';
    else if (q.push_heavy_sample_cap) quality_cap_reason = 'push_heavy_sample';
    else if (q.stale_current_market_cap) quality_cap_reason = 'stale_current_market';
    else if (q.insufficient_book_coverage_cap) quality_cap_reason = 'insufficient_book_coverage';
    else if (t2) quality_cap_reason = 'market_disagrees_with_history';
  }

  const components: ComponentValues = Object.freeze({
    c_rtp: rtp.c_rtp,
    c_ms: ms.c_ms,
    c_wa: wa.c_wa,
    c_ma: ma.c_ma,
    composite_score: score,
    direction,
    c_rtp_non_l5_magnitude: rtp.non_l5_magnitude,
    longer_window_choice: rtp.longer_window_choice,
  });

  const reasonsCtx: ReasonsContext = {
    classification: cls.classification,
    direction: cls.direction,
    components: {
      c_rtp: rtp.c_rtp,
      c_ms: ms.c_ms,
      c_wa: wa.c_wa,
      c_ma: ma.c_ma,
      composite_score: score,
      rd_L10: rtp.rd_L10,
      rd_L20: rateDeviation(input.threshold_windows.L20),
      rd_season: rtp.rd_season,
    },
    unavailable_cause: null,
    insufficient_causes: { l10_sample: false, season_sample: false, coverage_span: false },
    cap_reasons: {
      stale_current_market: q.stale_current_market_cap,
      insufficient_book_coverage: q.insufficient_book_coverage_cap,
      push_heavy_sample: q.push_heavy_sample_cap,
      one_sided_offering: q.one_sided_offering_cap,
      market_disagrees_with_history: t2,
    },
    source_unavailable,
    cma_zero_cause: ma.zero_cause,
  };

  return buildOutput({
    classification: cls.classification,
    direction: cls.direction,
    components,
    quality_capped: cls.quality_capped,
    quality_cap_reason,
    evaluated_line_kept: true,
    input,
    reasonsCtx,
  });
}

const NULL_COMPONENTS: ComponentValues = Object.freeze({
  c_rtp: null, c_ms: null, c_wa: null, c_ma: null,
  composite_score: null, direction: null,
  c_rtp_non_l5_magnitude: null, longer_window_choice: null,
});

interface BuildOutputArgs {
  readonly classification: EvidenceProfileOutput['classification'];
  readonly direction: EvidenceProfileOutput['direction'];
  readonly components: ComponentValues;
  readonly quality_capped: boolean;
  readonly quality_cap_reason: EvidenceQualityCapReason;
  /** Whether to keep the evaluated_line on the output. False only for
   *  Unavailable via §C.9 unresolved mapping / §C.8 / §C.3 no-market /
   *  §C.3.1 tied. §C.1 Insufficient KEEPS the evaluated_line because
   *  the read model produced a (line, sample) pair. */
  readonly evaluated_line_kept: boolean;
  readonly input: EvidenceProfileInput;
  readonly reasonsCtx: ReasonsContext;
}

function buildOutput(args: BuildOutputArgs): EvidenceProfileOutput {
  const reasons = attachReasons(args.reasonsCtx, args.input);
  return Object.freeze({
    classification: args.classification,
    direction: args.direction,
    components: args.components,
    quality_capped: args.quality_capped,
    quality_cap_reason: args.quality_cap_reason,
    includes_backfilled_historical: computeIncludesBackfilled(args.input),
    evaluated_line: args.evaluated_line_kept ? args.input.evaluated_line : null,
    evaluated_source_kind: args.evaluated_line_kept ? args.input.evaluated_source_kind : null,
    evaluated_source_identifier: args.evaluated_line_kept ? args.input.evaluated_source_identifier : null,
    reasons,
    method_version: METHOD_VERSION,
  });
}

/**
 * §A.5 DR-23 (a) — profile.includes_backfilled_historical is the OR
 * across every window that could have contributed. §A.5 lists threshold
 * windows explicitly; real-line windows and averages/medians are not
 * consumed by this Phase A pipeline (§B binds only to threshold windows +
 * current market + coverage). So the source of truth here is the four
 * threshold_windows' includes_backfilled_historical flags.
 */
function computeIncludesBackfilled(input: EvidenceProfileInput): boolean {
  const t = input.threshold_windows;
  return (
    t.L5.includes_backfilled_historical ||
    t.L10.includes_backfilled_historical ||
    t.L20.includes_backfilled_historical ||
    t.season.includes_backfilled_historical
  );
}


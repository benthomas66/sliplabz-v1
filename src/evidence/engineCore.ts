// V1-A2-2 REVISE — freshness-neutral evidence engine core.
//
// Authority: docs/product/EVIDENCE_PROFILE_METHOD_V1.md (§B / §C / §D / §E)
//            AND docs/product/EVIDENCE_PROFILE_METHOD_V2.md (§3 semantics
//            for the caller-supplied C3 verdict).
//
// Extraction rationale (owner ruling, controlling):
//   The pre-REVISE v1 engine bundled §C.3 freshness disambiguation into
//   the same function that computed §B components, §C.1/§C.2/§C.5/§C.6/
//   §C.7/§C.8/§C.9/§C.10, §D classification, and §E reason attachment.
//   That bundling forced the prior V1-A2-2 attempt to FABRICATE a v1
//   `freshness.state` sentinel on the CMR to steer §C.3 — safety by
//   downstream-guard, "by-absence-of-callers, not by construction."
//   The owner rejected that design.
//
//   This module is that rejection's structural fix: the freshness verdict
//   (fresh/aging vs stale-present-cap vs no-current-market-unavailable) is
//   a TYPED PARAMETER computed by the caller from whichever classifier
//   applies (v1: `evaluateC3Freshness` reading `cmr.freshness.state`;
//   v2: `classifyV2Freshness` reading `evaluation_reference_time -
//   line_observed_at`). The core is IDENTICAL for both methods; §C.3 is
//   never re-computed here from the CMR's freshness state.
//
//   v1's `computeEvidenceProfile` and v2's `computeEvidenceProfileV2` are
//   now thin wrappers that compute the verdict and delegate. v1's
//   observable behaviour is preserved BYTE-FOR-BYTE (proof A).
//
// Pure function. No I/O. No clock. No persistence. No sentinel fabrication.

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
  evaluateQualityRulesCore,
  firesMarketDisagreesWithHistory,
  firesWindowsDisagree,
  type C3Verdict,
} from './quality.js';
import { attachReasons, type ReasonsContext } from './reasons.js';
import { classify } from './classification.js';

const METHOD_VERSION = 'evidence_method_v1' as const;

/**
 * Compute an Evidence Profile from the input + a CALLER-SUPPLIED §C.3
 * freshness verdict.
 *
 * The freshness verdict determines:
 *   * `unavailable_no_current_market` (short-circuits to Unavailable +
 *     NO_CURRENT_MARKET before §B — used by book_count=0 grains).
 *   * `stale_current_market_cap` (contributes to §C.10 clause-5 cap-fired
 *     evaluation and to the persisted `quality_cap_reason`, but does NOT
 *     short-circuit — the profile classifies normally, capped at Moderate).
 *   * `proceed` — the fresh/aging path.
 *
 * The verdict does NOT change what §B, §C.1-C.10 (non-freshness), §D,
 * or §E do; it only changes §C.3's flag values inside the quality-rule
 * set. The core is deterministically identical for identical (input,
 * verdict) pairs.
 *
 * IMPORTANT — the output's `method_version` is HARD-CODED to
 * `'evidence_method_v1'` here because this core reuses v1's §D
 * classification + §E reasons wholesale. v2 wraps this output and TAGS
 * the persisted row with `evidence_method_v2` at the writer boundary
 * (see `src/evidence/v2/writerV2.ts`). The core NEVER writes
 * `'evidence_method_v2'` into the returned profile object — that would
 * be dishonest since the classification computation is v1's.
 */
export function computeCoreEvidenceProfile(
  input: EvidenceProfileInput,
  freshness_verdict: C3Verdict
): EvidenceProfileOutput {
  const q = evaluateQualityRulesCore(input, freshness_verdict);

  // §D.1 step 1 Unavailable — first-match order among the Unavailable causes.
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
      evaluated_line_kept: true,
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
  // no-eligible-source zero-causes are detected by the CMA module itself
  // from the CurrentMarketRow.
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
    any_unavailable: false,
    any_insufficient: false,
    windows_disagree: wd,
    composite_score: score,
    c10_all_pass: c10.all_pass,
    any_c10_clause5_cap_fired: any_capping_condition,
  });

  // §D.3 quality-cap reason.
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

function computeIncludesBackfilled(input: EvidenceProfileInput): boolean {
  const t = input.threshold_windows;
  return (
    t.L5.includes_backfilled_historical ||
    t.L10.includes_backfilled_historical ||
    t.L20.includes_backfilled_historical ||
    t.season.includes_backfilled_historical
  );
}

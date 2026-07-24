// V1-A2-2 REVISE — v2 evidence engine.
//
// Authority: docs/product/EVIDENCE_PROFILE_METHOD_V2.md §§3-4.
//
// ARCHITECTURE (post-REVISE):
//   The v2 engine computes the v2 freshness branch from `line_observed_at`
//   and `evaluation_reference_time`, translates it to a TYPED C3 verdict,
//   and delegates §B/§C-non-freshness/§D/§E to the freshness-neutral core
//   (`src/evidence/engineCore.ts`). No sentinel; no CMR-freshness
//   overriding; no fabricated marker. The core is IDENTICAL for v1 and
//   v2 — the ONLY method-version-specific step is deriving the verdict.
//
// BEYOND-HORIZON:
//   `classification_age > T_SERVE_SUPPRESS_MAX_SECONDS` (3600) is a
//   TYPED NON-CLASSIFIABLE result. `computeEvidenceProfileV2` returns
//   a discriminated union; the `beyond_horizon` variant carries no
//   `EvidenceProfileOutput` and CANNOT be passed to the v2 writer (the
//   writer's parameter type accepts only the `classified` variant, so
//   the type checker enforces this AT COMPILE TIME; the writer also
//   throws at runtime for defense in depth).
//
// Owner rulings honoured:
//   R1 line-recency only — v2 classifier consumes classification_age;
//      the engine does NOT consume price recency at any step.
//   R2 one global policy — no per-book branching.
//   R4 timing — v2 engine takes `evaluation_reference_time` and
//      `line_observed_at` as REQUIRED inputs; classification_age is a
//      pure function of them.
//   R5 STALE_CURRENT_MARKET vs NO_CURRENT_MARKET — disambiguated via
//      the book_count-conditional routing built into `classifyV2Freshness`.
//   R6 engine per-grain latency untouched.
//
// Pure function. No I/O. No clock reads. No fabrication.

import type {
  EvidenceProfileInput,
  EvidenceProfileOutput,
} from '../types.js';
import type { C3Verdict } from '../quality.js';
import { computeCoreEvidenceProfile } from '../engineCore.js';
import {
  classifyV2Freshness,
  type V2ClassifierOutput,
  type V2FreshnessBranch,
} from './freshnessClassifier.js';

/**
 * The v2 engine input extends the v1 input with the two D-A1 timing
 * anchors. Both are REQUIRED.
 */
export interface EvidenceProfileInputV2 extends EvidenceProfileInput {
  /**
   * The freshest `market_snapshots.observed_at` across the grain's
   * offerings (the "line_observed_at" of authority §4.1). May be `null`
   * when the grain has no eligible offering — in which case the derived
   * classification_age is `+Infinity` and the classifier routes via
   * book_count.
   */
  readonly line_observed_at: string | null;
  /**
   * The batch-scoped evaluation reference time (authority §4.1 ¶2).
   * Captured ONCE per batch by the v2 populator; every grain in the
   * batch classifies against this same reference.
   */
  readonly evaluation_reference_time: string;
}

/**
 * The v2 engine result — a DISCRIMINATED UNION.
 *
 *   `classified`     — the profile has a persistable classification. The
 *                      `profile` field is a full `EvidenceProfileOutput`
 *                      identical in shape to v1's output; the v2 writer
 *                      persists it with `method_version='evidence_method_v2'`.
 *   `beyond_horizon` — `classification_age > T_SERVE_SUPPRESS_MAX_SECONDS`.
 *                      No profile is provided. The v2 writer's parameter
 *                      type does NOT accept this variant, so passing it
 *                      is a compile-time error; the writer also throws
 *                      loudly at runtime for defense in depth.
 */
export type EvidenceProfileResultV2 =
  | V2ClassifiedResult
  | V2BeyondHorizonResult;

export interface V2ClassifiedResult {
  readonly kind: 'classified';
  readonly profile: EvidenceProfileOutput;
  readonly v2_freshness: V2ClassifierOutput;
  readonly classification_age_seconds: number;
  readonly line_observed_at: string | null;
  readonly evaluation_reference_time: string;
}

export interface V2BeyondHorizonResult {
  readonly kind: 'beyond_horizon';
  /**
   * Why the grain is not classifiable. Fixed string for logging /
   * telemetry; the reason is always "classification_age exceeds the
   * unified serve horizon" per D-A1.
   */
  readonly reason: 'classification_age_exceeds_serve_horizon';
  readonly classification_age_seconds: number;
  readonly line_observed_at: string | null;
  readonly evaluation_reference_time: string;
  readonly book_count: number;
  readonly v2_freshness: V2ClassifierOutput;
}

/**
 * v2 engine. Pure. Deterministic on identical inputs.
 *
 * Owner R4 timing contract: the caller MUST supply
 * `evaluation_reference_time` at BATCH START and use the SAME value for
 * every grain in the batch. Different values across grains in what is
 * nominally one batch is a defect at the CALLER, not this function.
 */
export function computeEvidenceProfileV2(
  input: EvidenceProfileInputV2
): EvidenceProfileResultV2 {
  const classification_age_seconds = deriveClassificationAgeSeconds(
    input.evaluation_reference_time,
    input.line_observed_at
  );
  const book_count = input.current_market_row.eligible_book_count.count;
  const v2 = classifyV2Freshness({
    classification_age_seconds,
    book_count,
  });

  if (v2.branch === 'beyond-horizon') {
    return Object.freeze({
      kind: 'beyond_horizon' as const,
      reason: 'classification_age_exceeds_serve_horizon' as const,
      classification_age_seconds,
      line_observed_at: input.line_observed_at,
      evaluation_reference_time: input.evaluation_reference_time,
      book_count,
      v2_freshness: v2,
    });
  }

  const c3_verdict = v2BranchToC3Verdict(v2.branch);
  const profile = computeCoreEvidenceProfile(input, c3_verdict);

  return Object.freeze({
    kind: 'classified' as const,
    profile,
    v2_freshness: v2,
    classification_age_seconds,
    line_observed_at: input.line_observed_at,
    evaluation_reference_time: input.evaluation_reference_time,
  });
}

/**
 * Translate a v2 classifier branch (fresh / aging / stale-present /
 * absent) to the corresponding freshness-neutral C3 verdict. Never
 * called for `beyond-horizon` — that branch short-circuits above and
 * returns the beyond_horizon variant instead.
 *
 * fresh / aging → proceed (normal classification path).
 * stale-present → stale_current_market_cap (Moderate cap + STALE_CURRENT_MARKET
 *                                          via v1's §C.10 clause-5 + §D.3).
 * absent        → no_current_market_unavailable (short-circuits to Unavailable
 *                                                with NO_CURRENT_MARKET reason).
 *
 * NOTE — this is NOT a sentinel. There is no CMR fabrication and no
 * `freshness.state` string is chosen to steer downstream logic. The
 * verdict is a TYPED DISCRIMINATED UNION that the neutral core consumes
 * as a parameter, identical in shape to what v1's own classifier
 * produces from `cmr.freshness.state`.
 */
function v2BranchToC3Verdict(
  branch: Exclude<V2FreshnessBranch, 'beyond-horizon'>
): C3Verdict {
  switch (branch) {
    case 'fresh':
    case 'aging':
      return Object.freeze({ kind: 'proceed' as const });
    case 'stale-present':
      return Object.freeze({ kind: 'stale_current_market_cap' as const });
    case 'absent':
      return Object.freeze({ kind: 'no_current_market_unavailable' as const });
  }
}

/**
 * Compute classification_age = evaluation_reference_time - line_observed_at
 * in seconds. Returns +Infinity when line_observed_at is null (drives the
 * classifier via book_count=0 in practice; also correctly triggers
 * beyond-horizon on a non-empty grain that somehow lacks a timestamp).
 */
export function deriveClassificationAgeSeconds(
  evaluation_reference_time: string,
  line_observed_at: string | null
): number {
  if (line_observed_at === null) return Number.POSITIVE_INFINITY;
  const eval_ms = Date.parse(evaluation_reference_time);
  const obs_ms  = Date.parse(line_observed_at);
  if (!Number.isFinite(eval_ms) || !Number.isFinite(obs_ms)) {
    return Number.POSITIVE_INFINITY;
  }
  return (eval_ms - obs_ms) / 1000;
}

/** Type guard for the classified variant. */
export function isClassifiedV2(
  result: EvidenceProfileResultV2
): result is V2ClassifiedResult {
  return result.kind === 'classified';
}

/** Type guard for the beyond-horizon variant. */
export function isBeyondHorizonV2(
  result: EvidenceProfileResultV2
): result is V2BeyondHorizonResult {
  return result.kind === 'beyond_horizon';
}

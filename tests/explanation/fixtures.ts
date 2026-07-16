// V1-A1-4 fixtures — synthetic `EvidenceProfileOutput` shapes covering
// every §E reason code, all seven §D.1 classifications, capped profiles,
// Unavailable, Insufficient, backfilled-provenance, tied-consensus, and
// all seven §F worked-example reason sets.
//
// Every fixture is a bare data literal — no engine invocation. The
// engine's job is to PRODUCE these shapes; the explanation module's job
// is to RENDER them. Fixture-only means the fixture is authored to
// exercise a specific composer path.

import type { EvidenceProfileOutput } from '../../src/evidence/types.js';
import type {
  EvidenceClassification,
  EvidenceDirection,
  EvidenceQualityCapReason,
  EvidenceReasonCategory,
  EvidenceReasonCode,
} from '../../src/shared/enums.js';

interface ReasonSpec {
  readonly code: EvidenceReasonCode;
  readonly category: EvidenceReasonCategory;
  readonly rank: number;
  readonly magnitude?: number | null;
}

function makeProfile(args: {
  readonly name: string;
  readonly classification: EvidenceClassification;
  readonly direction?: EvidenceDirection | null;
  readonly reasons: ReadonlyArray<ReasonSpec>;
  readonly quality_capped?: boolean;
  readonly quality_cap_reason?: EvidenceQualityCapReason;
  readonly includes_backfilled_historical?: boolean;
  readonly evaluated_line?: number | null;
  readonly composite_score?: number | null;
}): EvidenceProfileOutput & { readonly _fixture_name: string } {
  return Object.freeze({
    _fixture_name: args.name,
    classification: args.classification,
    direction: args.direction ?? null,
    components: Object.freeze({
      c_rtp: 0,
      c_ms: 0,
      c_wa: 0,
      c_ma: 0,
      composite_score: args.composite_score ?? null,
      direction: args.direction ?? null,
      c_rtp_non_l5_magnitude: null,
      longer_window_choice: null,
    }),
    quality_capped: args.quality_capped ?? false,
    quality_cap_reason: args.quality_cap_reason ?? 'none',
    includes_backfilled_historical: args.includes_backfilled_historical ?? false,
    evaluated_line: args.evaluated_line ?? null,
    evaluated_source_kind: args.evaluated_line === null ? null : 'sportsbook_consensus',
    evaluated_source_identifier: null,
    reasons: Object.freeze(args.reasons.map((r) => Object.freeze({
      reason_code: r.code,
      category: r.category,
      intra_category_rank: r.rank,
      contribution_magnitude: r.magnitude ?? null,
    }))),
    method_version: 'evidence_method_v1' as const,
  });
}

// ---------------------------------------------------------------------------
// Classification coverage — one profile per §D.1 taxonomy value.
// ---------------------------------------------------------------------------

export const FIXTURE_STRONG_OVER = makeProfile({
  name: 'strong_over',
  classification: 'strong_over_evidence',
  direction: 'over',
  evaluated_line: 19.5,
  composite_score: 0.5699,
  reasons: [
    { code: 'positive_margin_support', category: 'support', rank: 1, magnitude: 0.48 },
    { code: 'window_agreement_support', category: 'support', rank: 2, magnitude: 1.00 },
    { code: 'favorable_consensus_difference', category: 'support', rank: 3 },
  ],
});

export const FIXTURE_MODERATE_OVER = makeProfile({
  name: 'moderate_over',
  classification: 'moderate_over_evidence',
  direction: 'over',
  evaluated_line: 19.5,
  composite_score: 0.4997,
  reasons: [
    { code: 'positive_margin_support', category: 'support', rank: 1, magnitude: 0.39 },
    { code: 'window_agreement_support', category: 'support', rank: 2, magnitude: 1.00 },
    { code: 'favorable_consensus_difference', category: 'support', rank: 3 },
  ],
});

export const FIXTURE_MODERATE_UNDER = makeProfile({
  name: 'moderate_under',
  classification: 'moderate_under_evidence',
  direction: 'under',
  evaluated_line: 8.5,
  composite_score: -0.4121,
  reasons: [
    { code: 'window_agreement_support', category: 'support', rank: 1, magnitude: 1.00 },
    { code: 'favorable_consensus_difference', category: 'support', rank: 2 },
  ],
});

export const FIXTURE_STRONG_UNDER = makeProfile({
  name: 'strong_under',
  classification: 'strong_under_evidence',
  direction: 'under',
  evaluated_line: 8.5,
  composite_score: -0.6300,
  reasons: [
    { code: 'positive_margin_support', category: 'support', rank: 1, magnitude: 0.50 },
    { code: 'window_agreement_support', category: 'support', rank: 2, magnitude: 1.00 },
  ],
});

export const FIXTURE_MIXED = makeProfile({
  name: 'mixed_windows_disagree',
  classification: 'mixed_evidence',
  direction: null,
  evaluated_line: 5.5,
  composite_score: -0.0500,
  reasons: [
    { code: 'windows_disagree', category: 'quality', rank: 1 },
    { code: 'negative_margin_support', category: 'contradiction', rank: 1, magnitude: 0.31 },
  ],
});

export const FIXTURE_INSUFFICIENT = makeProfile({
  name: 'insufficient_by_sample',
  classification: 'insufficient_evidence',
  direction: null,
  evaluated_line: 12.5,
  reasons: [
    { code: 'insufficient_l10_sample', category: 'quality', rank: 1 },
    { code: 'incomplete_historical_coverage', category: 'quality', rank: 2 },
  ],
});

export const FIXTURE_UNAVAILABLE_NO_MARKET = makeProfile({
  name: 'unavailable_no_market',
  classification: 'unavailable',
  direction: null,
  evaluated_line: null,
  reasons: [{ code: 'no_current_market', category: 'quality', rank: 1 }],
});

// ---------------------------------------------------------------------------
// Cap-effect coverage — one capped profile per quality_cap_reason value.
// ---------------------------------------------------------------------------

export const FIXTURE_CAPPED_STALE = makeProfile({
  name: 'capped_stale',
  classification: 'moderate_over_evidence',
  direction: 'over',
  evaluated_line: 22.5,
  composite_score: 0.4564,
  quality_capped: true,
  quality_cap_reason: 'stale_current_market',
  reasons: [
    { code: 'positive_margin_support', category: 'support', rank: 1, magnitude: 0.39 },
    { code: 'window_agreement_support', category: 'support', rank: 2, magnitude: 1.00 },
    { code: 'insufficient_book_coverage', category: 'quality', rank: 1 },
    { code: 'stale_current_market', category: 'quality', rank: 2 },
  ],
});

export const FIXTURE_CAPPED_BOOK_COVERAGE = makeProfile({
  name: 'capped_book_coverage',
  classification: 'moderate_over_evidence',
  direction: 'over',
  evaluated_line: 15.5,
  composite_score: 0.4200,
  quality_capped: true,
  quality_cap_reason: 'insufficient_book_coverage',
  reasons: [
    { code: 'positive_margin_support', category: 'support', rank: 1, magnitude: 0.35 },
    { code: 'insufficient_book_coverage', category: 'quality', rank: 1 },
  ],
});

export const FIXTURE_CAPPED_PUSH_HEAVY = makeProfile({
  name: 'capped_push_heavy',
  classification: 'moderate_over_evidence',
  direction: 'over',
  evaluated_line: 12.5,
  composite_score: 0.3800,
  quality_capped: true,
  quality_cap_reason: 'push_heavy_sample',
  reasons: [
    { code: 'window_agreement_support', category: 'support', rank: 1, magnitude: 0.75 },
    { code: 'push_heavy_sample', category: 'quality', rank: 1 },
  ],
});

export const FIXTURE_CAPPED_MARKET_DISAGREES = makeProfile({
  name: 'capped_market_disagrees',
  classification: 'moderate_over_evidence',
  direction: 'over',
  evaluated_line: 21.5,
  composite_score: 0.3300,
  quality_capped: true,
  quality_cap_reason: 'market_disagrees_with_history',
  reasons: [
    { code: 'positive_margin_support', category: 'support', rank: 1, magnitude: 0.31 },
    { code: 'market_disagrees_with_history', category: 'contradiction', rank: 1, magnitude: 0.45 },
  ],
});

export const FIXTURE_CAPPED_ONE_SIDED = makeProfile({
  name: 'capped_one_sided',
  classification: 'moderate_over_evidence',
  direction: 'over',
  evaluated_line: 7.5,
  composite_score: 0.3100,
  quality_capped: true,
  quality_cap_reason: 'one_sided_offering',
  reasons: [
    { code: 'positive_margin_support', category: 'support', rank: 1, magnitude: 0.36 },
    { code: 'one_sided_offering', category: 'quality', rank: 1 },
  ],
});

// ---------------------------------------------------------------------------
// Provenance + Unavailable variants.
// ---------------------------------------------------------------------------

export const FIXTURE_BACKFILLED_PROVENANCE = makeProfile({
  name: 'backfilled_provenance',
  classification: 'moderate_over_evidence',
  direction: 'over',
  evaluated_line: 14.5,
  composite_score: 0.4200,
  includes_backfilled_historical: true,
  reasons: [
    { code: 'positive_margin_support', category: 'support', rank: 1, magnitude: 0.40 },
  ],
});

export const FIXTURE_TIED_CONSENSUS = makeProfile({
  name: 'unavailable_tied_consensus',
  classification: 'unavailable',
  direction: null,
  evaluated_line: null,
  reasons: [{ code: 'no_unique_consensus_line', category: 'quality', rank: 1 }],
});

export const FIXTURE_UNAVAILABLE_UNRESOLVED_PLAYER = makeProfile({
  name: 'unavailable_unresolved_player',
  classification: 'unavailable',
  direction: null,
  evaluated_line: null,
  reasons: [{ code: 'unresolved_player_mapping', category: 'quality', rank: 1 }],
});

export const FIXTURE_UNAVAILABLE_UNRESOLVED_EVENT = makeProfile({
  name: 'unavailable_unresolved_event',
  classification: 'unavailable',
  direction: null,
  evaluated_line: null,
  reasons: [{ code: 'unresolved_event_mapping', category: 'quality', rank: 1 }],
});

export const FIXTURE_UNAVAILABLE_POSTPONED = makeProfile({
  name: 'unavailable_postponed',
  classification: 'unavailable',
  direction: null,
  evaluated_line: null,
  reasons: [{ code: 'postponed_game', category: 'quality', rank: 1 }],
});

export const FIXTURE_UNAVAILABLE_CANCELED = makeProfile({
  name: 'unavailable_canceled',
  classification: 'unavailable',
  direction: null,
  evaluated_line: null,
  reasons: [{ code: 'canceled_game', category: 'quality', rank: 1 }],
});

// ---------------------------------------------------------------------------
// Every remaining reason code must appear at least once. Fixtures below
// each carry ONE unique reason to guarantee full-vocabulary coverage.
// ---------------------------------------------------------------------------

export const FIXTURE_UNFAVORABLE_CONSENSUS = makeProfile({
  name: 'unfavorable_consensus_difference',
  classification: 'moderate_over_evidence',
  direction: 'over',
  evaluated_line: 21.0,
  composite_score: 0.3200,
  reasons: [
    { code: 'positive_margin_support', category: 'support', rank: 1, magnitude: 0.32 },
    { code: 'unfavorable_consensus_difference', category: 'contradiction', rank: 1 },
  ],
});

export const FIXTURE_NEGATIVE_MARGIN_SUPPORT = makeProfile({
  name: 'negative_margin_support',
  classification: 'mixed_evidence',
  direction: null,
  evaluated_line: 5.5,
  reasons: [
    { code: 'negative_margin_support', category: 'contradiction', rank: 1, magnitude: 0.31 },
  ],
});

export const FIXTURE_MARGIN_MEASURES_DISAGREE = makeProfile({
  name: 'margin_measures_disagree',
  classification: 'moderate_over_evidence',
  direction: 'over',
  evaluated_line: 13.5,
  composite_score: 0.3600,
  reasons: [
    { code: 'positive_margin_support', category: 'support', rank: 1, magnitude: 0.30 },
    { code: 'margin_measures_disagree', category: 'contradiction', rank: 1 },
  ],
});

export const FIXTURE_SOURCE_UNAVAILABLE = makeProfile({
  name: 'source_unavailable_attach',
  classification: 'moderate_over_evidence',
  direction: 'over',
  evaluated_line: 10.5,
  composite_score: 0.3800,
  reasons: [
    { code: 'positive_margin_support', category: 'support', rank: 1, magnitude: 0.40 },
    { code: 'source_unavailable', category: 'quality', rank: 1 },
  ],
});

export const FIXTURE_INCOMPLETE_HISTORICAL_ATTACH = makeProfile({
  name: 'incomplete_historical_attach',
  classification: 'moderate_over_evidence',
  direction: 'over',
  evaluated_line: 11.5,
  composite_score: 0.3400,
  reasons: [
    { code: 'positive_margin_support', category: 'support', rank: 1, magnitude: 0.31 },
    { code: 'incomplete_historical_coverage', category: 'quality', rank: 1 },
  ],
});

// ---------------------------------------------------------------------------
// §F worked-example reason sets (F.1–F.6). Directly mirror the reason
// lists in EVIDENCE_PROFILE_METHOD_V1.md §F for each example.
// ---------------------------------------------------------------------------

export const FIXTURE_F1_MODERATE_OVER = FIXTURE_MODERATE_OVER;
export const FIXTURE_F1a_STRONG_OVER = FIXTURE_STRONG_OVER;
export const FIXTURE_F2_MODERATE_UNDER = FIXTURE_MODERATE_UNDER;
export const FIXTURE_F3_MIXED_BY_CONTRADICTION = FIXTURE_MIXED;
export const FIXTURE_F4_INSUFFICIENT = FIXTURE_INSUFFICIENT;
export const FIXTURE_F5_UNAVAILABLE_BY_FRESHNESS = FIXTURE_UNAVAILABLE_NO_MARKET;
export const FIXTURE_F6_QUALITY_CAPPED = FIXTURE_CAPPED_STALE;

// ---------------------------------------------------------------------------
// Full matrix.
// ---------------------------------------------------------------------------

export const ALL_FIXTURES: ReadonlyArray<EvidenceProfileOutput & { readonly _fixture_name: string }> = Object.freeze([
  FIXTURE_STRONG_OVER,
  FIXTURE_MODERATE_OVER,
  FIXTURE_MODERATE_UNDER,
  FIXTURE_STRONG_UNDER,
  FIXTURE_MIXED,
  FIXTURE_INSUFFICIENT,
  FIXTURE_UNAVAILABLE_NO_MARKET,
  FIXTURE_CAPPED_STALE,
  FIXTURE_CAPPED_BOOK_COVERAGE,
  FIXTURE_CAPPED_PUSH_HEAVY,
  FIXTURE_CAPPED_MARKET_DISAGREES,
  FIXTURE_CAPPED_ONE_SIDED,
  FIXTURE_BACKFILLED_PROVENANCE,
  FIXTURE_TIED_CONSENSUS,
  FIXTURE_UNAVAILABLE_UNRESOLVED_PLAYER,
  FIXTURE_UNAVAILABLE_UNRESOLVED_EVENT,
  FIXTURE_UNAVAILABLE_POSTPONED,
  FIXTURE_UNAVAILABLE_CANCELED,
  FIXTURE_UNFAVORABLE_CONSENSUS,
  FIXTURE_NEGATIVE_MARGIN_SUPPORT,
  FIXTURE_MARGIN_MEASURES_DISAGREE,
  FIXTURE_SOURCE_UNAVAILABLE,
  FIXTURE_INCOMPLETE_HISTORICAL_ATTACH,
]);

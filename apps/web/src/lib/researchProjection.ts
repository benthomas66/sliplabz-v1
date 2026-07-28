// V1-7a — the RESEARCH-surface projection (allowlist CONSTRUCTION).
//
// A NEW, additive type for ONE (game, player, market) grain. It does NOT modify
// BoardProjection and shares none of its construction. Per authority:
//   * §D.2 — the Research View MUST show the FULL classification label verbatim
//     ("Strong Over Evidence"), and strength grading (Strong vs Moderate) is
//     NEVER discarded here.
//   * DR-19 + §D.4 rule 3 — the numeric composite score AND the four component
//     values are Research-View-permitted (methodology / grade-detail area), with
//     the §G.2 disclosure carried so the surface can place it adjacent. They stay
//     FORBIDDEN on BoardProjection (its key-set assertion still rejects them).
//   * Counts are COUNTS — the threshold windows carry above/below/push counts,
//     eligible_n, avgs/medians, streaks. No rate, no percentage, no "N/M" form
//     (ThresholdWindowResult has no rate field, so this is structural).
//   * Paid per-book `book_detail.offerings` is DROPPED (free tier). The grain-
//     level market aggregates and `one_sided` (never paywalled, §16.8) are kept.
//
// The constructor returns a NEWLY CONSTRUCTED allowlisted object literal — no
// spread of a raw row, no spread-then-delete, no omit(), no cast to hide keys —
// and self-checks its key set before returning.

import {
  renderCompactExplanation,
  DISCLOSURE_G2_TEXT,
  fullClassificationLabel,
} from '../../../../src/explanation/index.js';
import type {
  EvidenceClassification,
  EvidenceDirection,
  EvidenceReasonCategory,
  EvidenceReasonCode,
  EvidenceQualityCapReason,
  EvidenceEvaluatedSourceKind,
} from '../../../../src/shared/enums.js';
import type { ThresholdWindowResult } from '../../../../src/computation/types.js';
import type { PlayerStatEligibility, BdlMinutesStatus } from '../../../../src/shared/enums.js';
import type { ResearchCandidate, ResearchSeriesRow } from './researchCandidate.js';

// --- sub-shapes (counts only; no rates; no per-book offerings) ---

export interface ResearchWindow {
  readonly window_type: 'L5' | 'L10' | 'L20' | 'season';
  readonly threshold: number;
  readonly requested_n: number;
  readonly eligible_n: number;
  readonly incomplete: boolean;
  readonly count_above: number;
  readonly count_equal: number;
  readonly count_below: number;
  readonly avg_stat_value: number | null;
  readonly median_stat_value: number | null;
  readonly avg_minus_threshold: number | null;
  readonly median_minus_threshold: number | null;
  readonly current_streak_direction: 'above' | 'below' | 'equal' | null;
  readonly current_streak_length: number | null;
  readonly coverage_label: 'complete' | 'incomplete' | 'no_data';
  readonly includes_backfilled_historical: boolean;
}

export interface ResearchReason {
  readonly reason_code: EvidenceReasonCode;
  readonly category: EvidenceReasonCategory;
  readonly intra_category_rank: number;
  readonly contribution_magnitude: number | null;
}

/**
 * ONE projected per-game series entry (oldest-to-newest). Counts/values/flags
 * only — no rate, no percentage, no "hit" language. `outcome` is the SAME
 * comparison the threshold window performs (stat vs the evaluated line), set
 * ONLY for counted (eligible) entries; DNP/ineligible entries are chart ghosts
 * with `outcome: null` and never enter the window tallies.
 */
export interface ResearchSeriesEntry {
  readonly game_date_utc: string;
  readonly opponent_label: string;
  readonly is_home: boolean | null;
  readonly stat_value: number | null;
  readonly comparison_line: number | null; // the evaluated line (threshold)
  readonly outcome: 'above' | 'below' | 'equal' | null;
  /** True iff the committed `eligibility_state === 'eligible'` — the exact
   *  committed test for "counts as window evidence". */
  readonly counted: boolean;
  /** Verbatim committed values (from player_game_stats), never re-derived. */
  readonly eligibility_state: PlayerStatEligibility;
  readonly minutes_status: BdlMinutesStatus;
  /** Presentation grouping of the committed states (not a new definition):
   *  eligible → 'eligible'; non_participation → 'did_not_play'; else 'ineligible'. */
  readonly display_status: 'eligible' | 'did_not_play' | 'ineligible';
  readonly includes_backfilled_historical: boolean;
}

export interface ResearchComponents {
  readonly c_rtp: number | null;
  readonly c_ms: number | null;
  readonly c_wa: number | null;
  readonly c_ma: number | null;
}

export interface ResearchMarketContext {
  readonly consensus_point: number | null;
  readonly selection_method: 'single_book' | 'unique_modal' | 'tied_no_unique_mode' | 'no_eligible_source';
  readonly consensus_coverage_label: 'complete' | 'single_book' | 'unresolved_consensus' | 'no_line';
  readonly eligible_book_count: number;
  readonly point_distribution: ReadonlyArray<{ readonly point: number; readonly book_count: number }>;
  readonly line_range_min: number | null;
  readonly line_range_max: number | null;
  readonly first_observed_point: number | null;
  readonly first_observed_at: string | null;
  readonly net_point_movement: number | null;
  readonly point_changes_observed: number;
  readonly over_price_changes: number;
  readonly under_price_changes: number;
  readonly one_sided: 'over_only' | 'under_only' | 'neither' | null;
}

export interface ResearchProjection {
  // identity + game context
  readonly player: string;
  readonly team: string;
  readonly market: string;
  readonly evaluated_line: number | null;
  readonly tipoff_utc: string | null;
  readonly evaluated_source_kind: EvidenceEvaluatedSourceKind | null;
  // full §D.2 label + strength-preserving classification
  readonly classification: EvidenceClassification;
  readonly classification_label_full: string;
  readonly direction: EvidenceDirection | null;
  // quality cap
  readonly quality_capped: boolean;
  readonly quality_cap_reason: EvidenceQualityCapReason;
  readonly binding_cap_tag: string | null;
  // the DR-26 reason set as the engine emits it
  readonly reasons: ReadonlyArray<ResearchReason>;
  // per-window evidence (counts only)
  readonly windows: {
    readonly L5: ResearchWindow;
    readonly L10: ResearchWindow;
    readonly L20: ResearchWindow;
    readonly season: ResearchWindow;
  };
  // per-game series (oldest-to-newest) for the chart
  readonly series: ReadonlyArray<ResearchSeriesEntry>;
  // current-market context (NO per-book offerings)
  readonly market_context: ResearchMarketContext;
  // provenance + disclosures
  readonly provenance_marker: string | null;
  readonly disclosure_g1: string;
  readonly disclosure_g2: string;
  // freshness input for the serving gate (V1-6d)
  readonly line_observed_at: string | null;
  // DR-19 grade-detail: score + components (Research-View-sanctioned).
  // `composite_score` is ROUNDED to 2 decimals at this boundary (DR-19(a)) —
  // the browser never receives more precision than the authority sanctions.
  readonly composite_score: number | null;
  readonly components: ResearchComponents;
  // DR-19(c): the method + computation version shown in the same inspectable
  // area as the score. Sourced from the persisted profile (never derived).
  readonly method_version: string;
  readonly computation_version: number;
}

/** The EXACT top-level key set of a ResearchProjection. */
export const RESEARCH_PROJECTION_KEYS = [
  'player', 'team', 'market', 'evaluated_line', 'tipoff_utc', 'evaluated_source_kind',
  'classification', 'classification_label_full', 'direction',
  'quality_capped', 'quality_cap_reason', 'binding_cap_tag',
  'reasons', 'windows', 'series', 'market_context',
  'provenance_marker', 'disclosure_g1', 'disclosure_g2',
  'line_observed_at', 'composite_score', 'components',
  'method_version', 'computation_version',
] as const;

/** Keys that must NEVER appear (paid offerings + restricted handles). Note:
 *  `composite_score`/`components` are ALLOWED here (DR-19 Research View) but
 *  remain forbidden on BoardProjection. */
export const RESEARCH_PROJECTION_FORBIDDEN_KEYS = [
  'offerings', 'book_detail', 'paid_book_offerings', 'profile_output',
  'current_market_row', 'internal_game_id', 'internal_player_id',
  'source_snapshot_ids', 'input', 'score',
] as const;

/** DR-19(a): round the bounded composite score to 2 decimals at the surface
 *  boundary. `null` stays null; full precision is retained on the candidate. */
function round2(x: number | null): number | null {
  return x === null ? null : Math.round(x * 100) / 100;
}

/** Map a raw series row to a projected entry. `outcome` uses the SAME
 *  comparison the threshold window performs (stat vs the evaluated line) and is
 *  set ONLY for counted (eligible) rows — DNP/ineligible stay `null` ghosts. */
function toSeriesEntry(r: ResearchSeriesRow, evaluated_line: number | null): ResearchSeriesEntry {
  // "Counted as window evidence" = the committed eligibility test AND a stat to
  // compare AND a line to compare it to (exactly what enters a threshold-window
  // tally). counted ⟺ outcome !== null, so series and windows reconcile.
  const counted = r.eligibility_state === 'eligible' && r.stat_value !== null && evaluated_line !== null;
  const outcome: 'above' | 'below' | 'equal' | null =
    counted
      ? (r.stat_value! > evaluated_line! ? 'above' : r.stat_value! < evaluated_line! ? 'below' : 'equal')
      : null;
  const display_status: 'eligible' | 'did_not_play' | 'ineligible' =
    r.eligibility_state === 'eligible' ? 'eligible'
      : r.minutes_status === 'dnp' ? 'did_not_play'
        : 'ineligible';
  return {
    game_date_utc: r.game_date_utc,
    opponent_label: r.opponent_label,
    is_home: r.is_home,
    stat_value: r.stat_value,
    comparison_line: evaluated_line,
    outcome,
    counted,
    eligibility_state: r.eligibility_state,
    minutes_status: r.minutes_status,
    display_status,
    includes_backfilled_historical: r.includes_backfilled_historical,
  };
}

function toWindow(w: ThresholdWindowResult): ResearchWindow {
  // Straight pass-through of the committed counts/stats. ThresholdWindowResult
  // carries NO rate/percentage field, so "counts only" is structural.
  return {
    window_type: w.window_type,
    threshold: w.threshold,
    requested_n: w.requested_n,
    eligible_n: w.eligible_n,
    incomplete: w.incomplete,
    count_above: w.count_above,
    count_equal: w.count_equal,
    count_below: w.count_below,
    avg_stat_value: w.avg_stat_value,
    median_stat_value: w.median_stat_value,
    avg_minus_threshold: w.avg_minus_threshold,
    median_minus_threshold: w.median_minus_threshold,
    current_streak_direction: w.current_streak_direction,
    current_streak_length: w.current_streak_length,
    coverage_label: w.coverage_label,
    includes_backfilled_historical: w.includes_backfilled_historical,
  };
}

/**
 * Construct a ResearchProjection from an internal candidate. Newly constructed,
 * allowlisted, offerings dropped. The cap tag, provenance text, and §G.1 come
 * from the COMMITTED renderer (single owner); the full label from the committed
 * labels module. Self-checks the key set before returning.
 */
export function constructResearchProjection(c: ResearchCandidate): ResearchProjection {
  const out = c.profile_output;
  const compact = renderCompactExplanation(out); // committed owner of cap tag / provenance / §G.1
  const cmr = c.current_market_row;

  const projection: ResearchProjection = {
    player: c.player,
    team: c.team,
    market: c.market,
    evaluated_line: c.evaluated_line,
    tipoff_utc: c.tipoff_utc,
    evaluated_source_kind: out.evaluated_source_kind,

    classification: out.classification,
    classification_label_full: fullClassificationLabel(out.classification), // §D.2 full form, verbatim
    direction: out.direction,

    quality_capped: out.quality_capped,
    quality_cap_reason: out.quality_cap_reason,
    binding_cap_tag: compact.binding_cap !== null ? compact.binding_cap.cap_summary_short : null,

    reasons: out.reasons.map((r) => ({
      reason_code: r.reason_code,
      category: r.category,
      intra_category_rank: r.intra_category_rank,
      contribution_magnitude: r.contribution_magnitude,
    })),

    windows: {
      L5: toWindow(c.windows.L5),
      L10: toWindow(c.windows.L10),
      L20: toWindow(c.windows.L20),
      season: toWindow(c.windows.season),
    },

    series: c.series.map((r) => toSeriesEntry(r, c.evaluated_line)),

    market_context: {
      consensus_point: cmr.line_consensus.consensus_point,
      selection_method: cmr.line_consensus.selection_method,
      consensus_coverage_label: cmr.line_consensus.coverage_label,
      eligible_book_count: cmr.eligible_book_count.count,
      point_distribution: cmr.point_distribution.counts.map((p) => ({ point: p.point, book_count: p.book_count })),
      line_range_min: cmr.line_range.min_point,
      line_range_max: cmr.line_range.max_point,
      first_observed_point: cmr.first_observed.point,
      first_observed_at: cmr.first_observed.at,
      net_point_movement: cmr.movement_summary.net_point_movement,
      point_changes_observed: cmr.movement_summary.point_changes_observed,
      over_price_changes: cmr.movement_summary.over_price_changes,
      under_price_changes: cmr.movement_summary.under_price_changes,
      one_sided: cmr.book_detail.one_sided, // grain-level, never paywalled (§16.8)
      // NOTE: cmr.book_detail.offerings (paid, per-book) is DELIBERATELY not read.
    },

    provenance_marker: compact.provenance_marker !== null ? compact.provenance_marker.text : null,
    disclosure_g1: compact.disclosure_g1.text,
    disclosure_g2: DISCLOSURE_G2_TEXT, // DR-19(b): required adjacent to the numeric score

    line_observed_at: c.line_observed_at,

    composite_score: round2(out.components.composite_score), // DR-19(a) — 2 decimals at the boundary
    components: {
      c_rtp: out.components.c_rtp,
      c_ms: out.components.c_ms,
      c_wa: out.components.c_wa,
      c_ma: out.components.c_ma,
    },
    // DR-19(c) — method + computation version, from the persisted profile.
    method_version: c.method_version,
    computation_version: c.computation_version,
  };

  assertResearchProjectionKeySet(projection);
  return Object.freeze(projection);
}

/**
 * RUNTIME KEY-SET ASSERTION. Proves a ResearchProjection contains EXACTLY its
 * allowed top-level keys and NONE of the forbidden ones (paid offerings +
 * restricted handles), including a nested check that the market context never
 * carries per-book offerings. Throws on any mismatch.
 */
export function assertResearchProjectionKeySet(p: ResearchProjection): void {
  const expected = new Set<string>(RESEARCH_PROJECTION_KEYS);
  const actual = Object.keys(p);
  for (const k of actual) {
    if (!expected.has(k)) {
      throw new Error(`V1-7a research projection carries an unexpected key "${k}" (allowed: ${[...expected].sort().join(', ')}).`);
    }
  }
  for (const k of expected) {
    if (!actual.includes(k)) {
      throw new Error(`V1-7a research projection is MISSING required key "${k}".`);
    }
  }
  for (const forbidden of RESEARCH_PROJECTION_FORBIDDEN_KEYS) {
    if (Object.prototype.hasOwnProperty.call(p, forbidden)) {
      throw new Error(`V1-7a research projection carries FORBIDDEN key "${forbidden}".`);
    }
  }
  // Defence in depth: the market context must never carry per-book offerings.
  for (const forbidden of ['offerings', 'book_detail', 'paid_book_offerings']) {
    if (Object.prototype.hasOwnProperty.call(p.market_context, forbidden)) {
      throw new Error(`V1-7a research market_context carries FORBIDDEN paid key "${forbidden}".`);
    }
  }
}

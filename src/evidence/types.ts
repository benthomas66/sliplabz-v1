// V1-A1-3 Phase A — engine input/output types.
//
// Authorities:
//   docs/product/EVIDENCE_PROFILE_METHOD_V1.md
//     §A (input bindings), §B (formulas), §C (quality rules),
//     §D (classifications), §E (reason vocabulary), §H (reproducibility).
//   docs/architecture/V1_COMPUTATION_CONTRACT.md
//     §9 (V1-5x extensions: RME-1/2/3).
//
// Phase A is PURE COMPUTATION. Every function in src/evidence/ is a pure
// function of its inputs. No I/O, no clock reads, no randomness, no
// persistence, no drivers. Given identical inputs, identical outputs,
// forever.
//
// The input shape here is deliberately narrow: it takes the exact V1-5
// read-model shapes the authority §A binds to. It does NOT accept looser
// shapes ("just some counts") — that would let a caller substitute a
// non-owner computation and silently violate the single-owner invariant
// (V1_COMPUTATION_CONTRACT §1).

import type {
  CurrentMarketRow,
  ThresholdWindowResult,
  HistoricalCoverageResult,
  MappingResolutionResult,
} from '../computation/types.js';
import type {
  EvidenceClassification,
  EvidenceDirection,
  EvidenceEvaluatedSourceKind,
  EvidenceQualityCapReason,
  EvidenceReasonCategory,
  EvidenceReasonCode,
  PlayerStatEligibility,
  BdlMinutesStatus,
} from '../shared/enums.js';
import type { LaunchMarket } from './marginNormalizers.js';

/**
 * The exact set of §A.1 threshold windows the engine consumes. All four
 * MUST be present (each may be `null` when the read model returned no
 * eligible data for that window — which the engine treats as `eligible_n
 * = 0`). Windows come from `computeThresholdWindow(window_type, threshold,
 * games)` — one invocation per window, all against the SAME evaluated
 * line.
 */
export interface ThresholdWindows {
  readonly L5: ThresholdWindowResult;
  readonly L10: ThresholdWindowResult;
  readonly L20: ThresholdWindowResult;
  readonly season: ThresholdWindowResult;
}

/**
 * V1-8a0a — ONE persisted per-game series position. The chronology (all fields
 * except `evaluated_line` and `verdict`) comes UNMODIFIED from the frozen
 * V1-8a0b reader (`HistoricalSeriesRow`); the `verdict` comes from the authorized
 * interface extension (`ThresholdWindowResult.games_evaluated`); the two are
 * joined on the canonical `internal_game_id` at population time (same evaluation
 * event). `internal_game_id` is SERVER-SIDE ONLY (Amendment 21).
 *
 * The verdict is a DISCRIMINATED type — an eligible position carries an
 * authoritative threshold-relative outcome; an ineligible/DNP requested position
 * carries NO verdict (its presence and chronological location are the evidence,
 * Grammar §2.2). A consumer reads `verdict.kind` first; `outcome` exists only on
 * the eligible variant, so it can never be misread as an unknown eligible value.
 */
export type SeriesPositionVerdict =
  | { readonly kind: 'eligible'; readonly outcome: 'above' | 'below' | 'equal' }
  | { readonly kind: 'ineligible' };

export interface EvidenceSeriesPosition {
  /** Canonical stable game identity — the join key + persisted row identity.
   *  SERVER-SIDE ONLY (Amendment 21); never a browser-visible field. */
  readonly internal_game_id: string;
  readonly game_date_utc: string;
  readonly opponent_label: string;
  readonly is_home: boolean | null;
  readonly stat_value: number | null;
  /** The evaluated line this position's outcome is relative to (the profile's
   *  threshold; same value the window aggregates were computed against). */
  readonly evaluated_line: number;
  readonly eligibility_state: PlayerStatEligibility;
  readonly minutes_status: BdlMinutesStatus;
  readonly includes_backfilled_historical: boolean;
  readonly verdict: SeriesPositionVerdict;
}

/** Games.status per §C.8 (spec §15.5). */
export type GameStatus =
  | 'scheduled'
  | 'live'
  | 'final'
  | 'postponed'
  | 'canceled'
  | 'unresolved';

/**
 * The full engine input. Every §A binding appears here. `today_utc_date`
 * is injected (not read from a clock) so DR-25's 30-day predicate is
 * pure. `reference_date` is the date the threshold windows were computed
 * against (matches the audit anchor persisted by Phase B).
 */
export interface EvidenceProfileInput {
  readonly internal_game_id: string;
  readonly internal_player_id: string;
  readonly market_key: LaunchMarket;

  /** The line the profile is evaluated at. Consumer's choice (sportsbook
   *  consensus for the canonical Discover profile; other kinds are on-
   *  demand-only per V1-A1-2 grain ruling). */
  readonly evaluated_line: number;
  readonly evaluated_source_kind: EvidenceEvaluatedSourceKind;
  /** Free-text audit anchor per §25 (bookmaker_key for sportsbook_specific,
   *  pick'em source_class for pickem, etc.). Null when not applicable. */
  readonly evaluated_source_identifier: string | null;

  /** §A.1 windows — all four required; each result must be computed
   *  against the SAME evaluated_line. */
  readonly threshold_windows: ThresholdWindows;

  /** V1-8a0a — the complete per-game series (requested chronology from the
   *  frozen V1-8a0b reader, joined to the eligible per-game outcomes on
   *  `internal_game_id`), oldest→newest. Persisted alongside the window
   *  aggregates in the SAME evaluation event. The ENGINE does NOT consume this;
   *  it is a persistence-only field carried on the same input object so the
   *  writer maps it under the same transaction. Optional on the type so the many
   *  engine/fixture constructors that predate it remain valid; the production
   *  builder (`readModelInputBuilder`) ALWAYS sets it. */
  readonly series?: ReadonlyArray<EvidenceSeriesPosition>;

  /** §A.3 current market — composed via V1-5 read model. */
  readonly current_market_row: CurrentMarketRow;

  /** §A.4 historical coverage (RME-1). */
  readonly historical_coverage: HistoricalCoverageResult;

  /** §C.9 mapping resolution (RME-2). */
  readonly mapping_resolution: MappingResolutionResult;

  /** §C.8 game status. */
  readonly game_status: GameStatus;

  /** DR-25 predicate needs today's UTC calendar day. Injected — never
   *  read from a wall clock inside the engine. */
  readonly today_utc_date: string; // YYYY-MM-DD

  /** The date the threshold windows were computed against — matches
   *  Phase B's `reference_date` audit anchor. */
  readonly reference_date: string; // YYYY-MM-DD
}

// ---------------------------------------------------------------------------
// Intermediate values (produced by the components module + used by classification)
// ---------------------------------------------------------------------------

/**
 * §B.6 composite + §B.2..B.5 components. Every field is a raw float in
 * [-1, +1] (or null when not computed — e.g. Unavailable via §C.9). The
 * writer will store these at full precision per DR-20.
 */
export interface ComponentValues {
  readonly c_rtp: number | null;
  readonly c_ms: number | null;
  readonly c_wa: number | null;
  readonly c_ma: number | null;
  readonly composite_score: number | null;
  /** §B.7. `null` when |score| < DR-5 or Mixed/Insufficient/Unavailable. */
  readonly direction: EvidenceDirection | null;
  /** The C_RTP non-L5 magnitude test from §C.10 clause 4 — computed
   *  alongside C_RTP because the same three terms feed it. `null` when
   *  C_RTP itself wasn't computed. */
  readonly c_rtp_non_l5_magnitude: number | null;
  /** Which window was used as `longer_window` per DR-13 (L20 preferred;
   *  season fallback when L20 eligible_n < 10). `null` when not
   *  applicable. */
  readonly longer_window_choice: 'L20' | 'season' | null;
}

/**
 * One attached reason with its DR-26 metadata. `contribution_magnitude`
 * is the numeric contribution used for intra-category ordering (see
 * §E.1's magnitude-based triggers); `null` for boolean-fact reasons
 * (e.g. §C.9 mapping).
 */
export interface AttachedReason {
  readonly reason_code: EvidenceReasonCode;
  readonly category: EvidenceReasonCategory;
  /** Positive integer, 1..N within category. Assigned by DR-26 ordering. */
  readonly intra_category_rank: number;
  readonly contribution_magnitude: number | null;
}

/**
 * The full pure-function output. Phase B writes this into `evidence_profiles`
 * + `evidence_profile_reasons`; Phase A never touches storage.
 *
 * The stored value of `evaluated_line` mirrors §25's requirement plus
 * DR-28 (null when Unavailable via tied consensus / no market / postponed /
 * canceled / unresolved mapping). Components are null when the
 * classification is Unavailable via §C.9 (unresolved mapping — the read
 * model may not even supply valid windows) or §C.8 (postponed/canceled —
 * the profile is unavailable at this scheduled slot).
 */
export interface EvidenceProfileOutput {
  readonly classification: EvidenceClassification;
  readonly direction: EvidenceDirection | null;
  readonly components: ComponentValues;
  readonly quality_capped: boolean;
  readonly quality_cap_reason: EvidenceQualityCapReason;
  /** DR-23 (a) — mirrors input state; never fabricated. */
  readonly includes_backfilled_historical: boolean;
  /** `null` only when classification = 'unavailable' AND the Unavailable
   *  cause is §C.3 no-market / §C.3.1 tied / §C.8 postponed-canceled /
   *  §C.9 unresolved mapping — see §D.1 first-match order. */
  readonly evaluated_line: number | null;
  readonly evaluated_source_kind: EvidenceEvaluatedSourceKind | null;
  readonly evaluated_source_identifier: string | null;
  /** Reasons in DR-26 canonical stored order. Ordering owner: reasons.ts. */
  readonly reasons: ReadonlyArray<AttachedReason>;
  /** §H — locked. Constant. */
  readonly method_version: 'evidence_method_v1';
}

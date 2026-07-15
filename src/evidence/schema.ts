// V1-A1-2 evidence-profile storage types.
//
// STORAGE-ONLY: this module owns the TypeScript row shapes that mirror the
// evidence_profiles / evidence_profile_reasons tables and the frozen
// method-version identifier. NO scoring, NO classification logic, NO engine
// code. Every §B / §C / §D / §E behaviour lives in V1-A1-3.
//
// Authorities:
//   * docs/product/EVIDENCE_PROFILE_METHOD_V1.md
//     - §H (method version + reproducibility)
//     - §D.1 + GD-15 (classification taxonomy — locked)
//     - §B.7 (direction)
//     - §A.5 + DR-23 (includes_backfilled_historical)
//     - §E.1 (closed reason vocabulary)
//     - §E.2 + DR-26 (reason ordering)
//     - DR-24 (method-version bump policy)
//     - DR-27 / §I.3 (ABNORMAL_DISPERSION reservation)
//   * docs/product/amendments/SLIPLABZ_V1_AMENDMENT_A1_INTEGRATED.md §25
//     (data-model requirements).
//   * supabase/migrations/20260714000000..000002 (the migrations these
//     types mirror).

import type {
  EvidenceClassification,
  EvidenceDirection,
  EvidenceEvaluatedSourceKind,
  EvidenceOneSidedState,
  EvidenceQualityCapReason,
  EvidenceReasonCategory,
  EvidenceReasonCode,
} from '../shared/enums.js';

/**
 * The `evidence_method_v1` identifier per EVIDENCE_PROFILE_METHOD_V1.md §H
 * (locked) and DR-24 (method-version bump policy). Every profile written
 * against this authority MUST store this value in the `method_version`
 * column. A DR-24 bump is a NEW string alongside a new migration — never a
 * silent overwrite.
 */
export const EVIDENCE_METHOD_VERSION = 'evidence_method_v1' as const;
export type EvidenceMethodVersion = typeof EVIDENCE_METHOD_VERSION;

/**
 * One row from `evidence_profiles`. Shape mirrors migration
 * 20260714000001_evidence_profiles.sql column-for-column. Numeric columns
 * arrive from `pg` as `string` unless a type parser is registered; this
 * project has not registered one, so the shape declares them as `string`
 * (deferring the parse-to-number choice to consumers).
 */
export interface EvidenceProfileRow {
  readonly evidence_profile_id: string;

  readonly internal_game_id: string;
  readonly internal_player_id: string;
  readonly market_key: string;

  /** §25 evaluated line. NULL admitted only when classification is 'unavailable'. */
  readonly evaluated_line: string | null;
  readonly evaluated_source_kind: EvidenceEvaluatedSourceKind | null;
  readonly evaluated_source_identifier: string | null;

  readonly classification: EvidenceClassification;
  /** §B.7. NULL for 'mixed_evidence' / 'insufficient_evidence' / 'unavailable'. */
  readonly direction: EvidenceDirection | null;

  /** §B.6 composite score, full precision (DR-20). NULL when not computed. */
  readonly composite_score: string | null;
  /** §B.2 Recent Threshold Performance. NULL when not computed. */
  readonly c_rtp: string | null;
  /** §B.3 Margin Support. NULL when not computed. */
  readonly c_ms: string | null;
  /** §B.4 Window Agreement. NULL when not computed. */
  readonly c_wa: string | null;
  /** §B.5 Market Alignment. NULL when not computed. */
  readonly c_ma: string | null;

  /** §D.1 step 5 boolean. */
  readonly quality_capped: boolean;
  /** §C.2 / §C.3 / §C.5 / §C.6 / §C.7 binding cap; 'none' when quality_capped=false. */
  readonly quality_cap_reason: EvidenceQualityCapReason;

  /** DR-23 (a) — preserved per profile. */
  readonly includes_backfilled_historical: boolean;

  /** §H / DR-24. Locked to EVIDENCE_METHOD_VERSION at write. */
  readonly method_version: string;
  /** V1-5 pattern — see V1_COMPUTATION_CONTRACT.md §2. */
  readonly computation_version: number;

  /** UTC calendar day for real_line_windows / threshold_windows reference. */
  readonly reference_date: string;
  /** The V1-5 read-model computation_version consulted at write time. */
  readonly source_read_model_computation_version: number;
  /** Reference to the composed CurrentMarketRow. NULL when no market at write time. */
  readonly current_market_row_id: string | null;
  /** Reference to the availability snapshot. NULL when availability itself unresolved. */
  readonly bdl_availability_snapshot_id: string | null;
  /** RME-3 snapshot. NULL is legitimate (§I.2 rule — offering set empty or every price null). */
  readonly book_detail_one_sided: EvidenceOneSidedState | null;

  readonly computed_at: string;
  readonly created_at: string;
  readonly updated_at: string;
}

/**
 * One row from `evidence_profile_reasons`. Mirrors migration
 * 20260714000002_evidence_profile_reasons.sql column-for-column.
 */
export interface EvidenceProfileReasonRow {
  readonly evidence_profile_reason_id: string;
  readonly evidence_profile_id: string;
  readonly reason_code: EvidenceReasonCode;
  readonly category: EvidenceReasonCategory;
  /** DR-26 rank within category — 1..N. */
  readonly intra_category_rank: number;
  /** Optional per-reason contribution magnitude in [-1, +1]. NULL for boolean facts. */
  readonly contribution_magnitude: string | null;
  readonly created_at: string;
}

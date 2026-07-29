// V1-A2-2 REVISE — v2 evidence-profile writer.
//
// Authority: docs/product/EVIDENCE_PROFILE_METHOD_V2.md §4 (timing);
//            supabase/migrations/20260718000000_evidence_profiles_v2_timing.sql
//            (CHECK: v2 rows must carry both timing columns NON-NULL).
//
// Persists a v2 profile with:
//   * method_version = 'evidence_method_v2'
//   * evaluation_reference_time NON-NULL
//   * profile_generated_at      NON-NULL
//
// TYPE-LEVEL BEYOND-HORIZON GUARD (owner ruling repair 5):
//   The `result` parameter is typed as `V2ClassifiedResult` — the
//   classifiable variant of the discriminated union returned by
//   `computeEvidenceProfileV2`. Passing a `V2BeyondHorizonResult` is a
//   COMPILE-TIME error. A runtime assertion also throws if the
//   discriminant is somehow not `'classified'` (defense in depth against
//   `as any` misuse from callers outside TypeScript's reach).
//
//   NO row is inserted for a beyond-horizon grain — not a marked row,
//   not a suppressed row, NO row (owner ruling 5).
//
// Timing missing → fail loud, before any SQL runs (owner R4).
//
// v1 writer (`src/evidence/writer.ts`) remains UNTOUCHED. v1 rows
// continue to be written with method_version='evidence_method_v1' and
// both timing columns NULL (their default when omitted from INSERT).

import type { Tx } from '../../db/transaction.js';
import type { EvidenceProfileInput } from '../types.js';
import type { ThresholdWindowResult } from '../../computation/types.js';
import type { V2ClassifiedResult } from './engineV2.js';
import type { EvidenceProfileAuditRefs } from '../writer.js';
import { EVIDENCE_RESERVED_REASON_CODES } from '../../shared/enums.js';
import { deriveSourceIdentitySet } from './sourceIdentity.js';

export const EVIDENCE_METHOD_VERSION_V2 = 'evidence_method_v2' as const;
export type EvidenceMethodVersionV2 = typeof EVIDENCE_METHOD_VERSION_V2;
export const EVIDENCE_COMPUTATION_VERSION_V2 = 1;

const NON_CLASSIFIED_MSG = 'V1-A2-2 v2 writer refused: beyond-horizon result MUST NOT persist. ' +
  'Owner D-A1 addendum: classification_age > T_SERVE_SUPPRESS_MAX_SECONDS produces NO evidence_profiles row.';
const MISSING_TIMING_MSG = 'V1-A2-2 v2 writer refused: evidence_method_v2 requires ' +
  'evaluation_reference_time AND profile_generated_at (owner R4/D-A1). ' +
  'A v2 row missing either field is INVALID and cannot persist.';
const CONSENSUS_ONLY_MSG = 'V1-A2-2 v2 writer refused: non-consensus evaluated_source_kind ' +
  'is never persisted at evidence_method_v2 (grain ruling carries from v1).';
const RESERVED_REASON_MSG = 'V1-A2-2 v2 writer refused: reason set contains a RESERVED reason code.';

export interface WriteV2Result {
  readonly evidence_profile_id: string;
  readonly inserted: boolean;
  readonly reasons_written: number;
}

/**
 * Write a v2 evidence profile + its reason set inside the caller-supplied
 * transaction.
 *
 * `result` is the CLASSIFIED variant of `EvidenceProfileResultV2`. The
 * discriminated-union type prevents beyond-horizon results from reaching
 * this writer at compile time; a runtime check throws on defense-in-depth.
 */
export async function writeV2EvidenceProfile(
  tx: Tx,
  input: EvidenceProfileInput,
  result: V2ClassifiedResult,
  audit: EvidenceProfileAuditRefs,
  timing: {
    readonly evaluation_reference_time: string;
    readonly profile_generated_at: string;
  }
): Promise<WriteV2Result> {
  // ---- Non-classifiable guard (defense in depth) ------------------------
  // The type system already excludes beyond_horizon; this guard catches
  // any caller who bypassed the type checker (an `as any` from outside).
  if ((result as { kind: string }).kind !== 'classified') {
    throw new Error(NON_CLASSIFIED_MSG);
  }
  const output = result.profile;
  // ---- Fail-loud timing guard (before any SQL) --------------------------
  if (
    typeof timing.evaluation_reference_time !== 'string' ||
    timing.evaluation_reference_time.length === 0 ||
    typeof timing.profile_generated_at !== 'string' ||
    timing.profile_generated_at.length === 0
  ) {
    throw new Error(MISSING_TIMING_MSG);
  }
  // ---- Consensus-only guard ---------------------------------------------
  if (input.evaluated_source_kind !== 'sportsbook_consensus') {
    throw new Error(
      `${CONSENSUS_ONLY_MSG} Got evaluated_source_kind='${input.evaluated_source_kind}'.`
    );
  }
  // ---- Reserved reason-code guard ---------------------------------------
  for (const r of output.reasons) {
    if (EVIDENCE_RESERVED_REASON_CODES.has(r.reason_code)) {
      throw new Error(`${RESERVED_REASON_MSG} Got '${r.reason_code}'.`);
    }
  }

  // ---- Profile UPSERT (v2 method_version + timing columns) --------------
  const upsertResult = await tx.query(
    `INSERT INTO evidence_profiles
       (internal_game_id, internal_player_id, market_key,
        evaluated_line, evaluated_source_kind, evaluated_source_identifier,
        classification, direction,
        composite_score, c_rtp, c_ms, c_wa, c_ma,
        quality_capped, quality_cap_reason,
        includes_backfilled_historical,
        method_version, computation_version,
        reference_date, source_read_model_computation_version,
        current_market_row_id, bdl_availability_snapshot_id,
        book_detail_one_sided,
        evaluation_reference_time, profile_generated_at,
        computed_at)
     VALUES ($1::uuid, $2::uuid, $3::text,
             $4, $5::evidence_evaluated_source_kind, $6,
             $7::evidence_classification, $8::evidence_direction,
             $9, $10, $11, $12, $13,
             $14, $15::evidence_quality_cap_reason,
             $16,
             $17, $18,
             $19::date, $20,
             $21::uuid, $22::uuid,
             $23::evidence_one_sided_state,
             $24::timestamptz, $25::timestamptz,
             now())
     ON CONFLICT ON CONSTRAINT evidence_profiles_grain_version_unique
     DO UPDATE SET
       evaluated_line = EXCLUDED.evaluated_line,
       evaluated_source_kind = EXCLUDED.evaluated_source_kind,
       evaluated_source_identifier = EXCLUDED.evaluated_source_identifier,
       classification = EXCLUDED.classification,
       direction = EXCLUDED.direction,
       composite_score = EXCLUDED.composite_score,
       c_rtp = EXCLUDED.c_rtp,
       c_ms = EXCLUDED.c_ms,
       c_wa = EXCLUDED.c_wa,
       c_ma = EXCLUDED.c_ma,
       quality_capped = EXCLUDED.quality_capped,
       quality_cap_reason = EXCLUDED.quality_cap_reason,
       includes_backfilled_historical = EXCLUDED.includes_backfilled_historical,
       reference_date = EXCLUDED.reference_date,
       source_read_model_computation_version = EXCLUDED.source_read_model_computation_version,
       current_market_row_id = EXCLUDED.current_market_row_id,
       bdl_availability_snapshot_id = EXCLUDED.bdl_availability_snapshot_id,
       book_detail_one_sided = EXCLUDED.book_detail_one_sided,
       evaluation_reference_time = EXCLUDED.evaluation_reference_time,
       profile_generated_at = EXCLUDED.profile_generated_at,
       computed_at = now(),
       updated_at = now()
     WHERE evidence_profiles.method_version = EXCLUDED.method_version
       AND evidence_profiles.computation_version = EXCLUDED.computation_version
     RETURNING evidence_profile_id::text AS evidence_profile_id,
               (xmax = 0) AS inserted`,
    [
      input.internal_game_id,
      input.internal_player_id,
      input.market_key,
      output.evaluated_line,
      output.evaluated_source_kind,
      output.evaluated_source_identifier,
      output.classification,
      output.direction,
      output.components.composite_score,
      output.components.c_rtp,
      output.components.c_ms,
      output.components.c_wa,
      output.components.c_ma,
      output.quality_capped,
      output.quality_cap_reason,
      output.includes_backfilled_historical,
      EVIDENCE_METHOD_VERSION_V2,
      EVIDENCE_COMPUTATION_VERSION_V2,
      input.reference_date,
      audit.source_read_model_computation_version,
      audit.current_market_row_id,
      audit.bdl_availability_snapshot_id,
      audit.book_detail_one_sided,
      timing.evaluation_reference_time,
      timing.profile_generated_at,
    ]
  );
  if ((upsertResult.rowCount ?? 0) !== 1) {
    throw new Error(
      `V1-A2-2 v2 writer: evidence_profiles UPSERT affected ${upsertResult.rowCount ?? 0} rows ` +
      `for grain=(${input.internal_game_id},${input.internal_player_id},${input.market_key},` +
      `v=${EVIDENCE_METHOD_VERSION_V2},cv=${EVIDENCE_COMPUTATION_VERSION_V2}); expected 1. Rolling back.`
    );
  }
  const { evidence_profile_id, inserted } = upsertResult.rows[0] as {
    evidence_profile_id: string;
    inserted: boolean;
  };

  // ---- Reason-set REPLACE (delete-then-insert) --------------------------
  await tx.query(
    `DELETE FROM evidence_profile_reasons WHERE evidence_profile_id = $1::uuid`,
    [evidence_profile_id]
  );
  for (const reason of output.reasons) {
    const w = await tx.query(
      `INSERT INTO evidence_profile_reasons
         (evidence_profile_id, reason_code, category, intra_category_rank, contribution_magnitude)
       VALUES ($1::uuid, $2::evidence_reason_code, $3::evidence_reason_category, $4::int, $5)`,
      [
        evidence_profile_id, reason.reason_code, reason.category,
        reason.intra_category_rank, reason.contribution_magnitude,
      ]
    );
    if ((w.rowCount ?? 0) !== 1) {
      throw new Error(
        `V1-A2-2 v2 writer: evidence_profile_reasons INSERT affected ${w.rowCount ?? 0} rows for ` +
        `(profile=${evidence_profile_id}, reason=${reason.reason_code}); expected 1. Rolling back.`
      );
    }
  }
  // ---- V1-8a0: persist the writer-bound evidence INPUTS, EXACTLY as received --
  //
  // SAME-EVALUATION-EVENT: the window aggregates are read from the SAME `input`
  // object that produced `result`, written under the SAME `evidence_profile_id`,
  // within the SAME transaction. This invariant holds because the single caller
  // (`populateV2`) passes the very `input` it classified — it is NOT guaranteed
  // by this signature, which still accepts `input` and `result` as INDEPENDENT
  // parameters; the invariant is ENFORCED BY TEST, not by construction. (A
  // governor ruling on restructuring the signature to carry both as one
  // parameter is pending and is out of scope for this ticket.)
  //
  // The writer performs NO recomputation, derivation, rounding, reordering, or
  // enrichment of the window bundle — only schema mapping (persistence fidelity).
  // REPLACE (delete-then-insert), mirroring the reason-set contract, so a
  // same-version repopulation refreshes the bundle instead of duplicating rows.
  await tx.query(
    `DELETE FROM evidence_profile_window_aggregates WHERE evidence_profile_id = $1::uuid`,
    [evidence_profile_id]
  );
  const w = input.threshold_windows;
  for (const win of [w.L5, w.L10, w.L20, w.season] as ReadonlyArray<ThresholdWindowResult>) {
    const iw = await tx.query(
      `INSERT INTO evidence_profile_window_aggregates
         (evidence_profile_id, window_type, evaluated_line,
          requested_n, eligible_n, incomplete,
          count_above, count_equal, count_below,
          avg_stat_value, median_stat_value, avg_minus_threshold, median_minus_threshold,
          current_streak_direction, current_streak_length,
          coverage_label, window_method_version, includes_backfilled_historical)
       VALUES ($1::uuid, $2::text, $3,
               $4, $5, $6,
               $7, $8, $9,
               $10, $11, $12, $13,
               $14, $15,
               $16, $17, $18)`,
      [
        evidence_profile_id, win.window_type, win.threshold,
        win.requested_n, win.eligible_n, win.incomplete,
        win.count_above, win.count_equal, win.count_below,
        win.avg_stat_value, win.median_stat_value, win.avg_minus_threshold, win.median_minus_threshold,
        win.current_streak_direction, win.current_streak_length,
        win.coverage_label, win.method_version, win.includes_backfilled_historical,
      ]
    );
    if ((iw.rowCount ?? 0) !== 1) {
      throw new Error(
        `V1-8a0 v2 writer: window-aggregate INSERT affected ${iw.rowCount ?? 0} rows for ` +
        `(profile=${evidence_profile_id}, window=${win.window_type}); expected 1. Rolling back.`
      );
    }
  }

  // ---- V1-8a0: persist the SOURCE-IDENTITY SET (names/IDs only) ---------------
  // Built server-side from the population-time offering context. Identity-only:
  // no point/price/side/timestamp/handle. Dedup + alphabetical (non-economic).
  await tx.query(
    `DELETE FROM evidence_profile_source_identities WHERE evidence_profile_id = $1::uuid`,
    [evidence_profile_id]
  );
  const sources = deriveSourceIdentitySet(input.current_market_row.book_detail.offerings);
  let ordinal = 0;
  for (const s of sources) {
    const is = await tx.query(
      `INSERT INTO evidence_profile_source_identities
         (evidence_profile_id, normalized_source_id, display_name, ordinal)
       VALUES ($1::uuid, $2::text, $3::text, $4::int)`,
      [evidence_profile_id, s.normalized_source_id, s.display_name, ordinal]
    );
    if ((is.rowCount ?? 0) !== 1) {
      throw new Error(
        `V1-8a0 v2 writer: source-identity INSERT affected ${is.rowCount ?? 0} rows for ` +
        `(profile=${evidence_profile_id}, source=${s.normalized_source_id}); expected 1. Rolling back.`
      );
    }
    ordinal += 1;
  }

  // ---- V1-8a0a: persist the COMPLETE per-game SERIES -------------------------
  //
  // The series was JOINED upstream (readModelInputBuilder Step 4b) in the SAME
  // evaluation event: the same `input` object that produced `result`, the same
  // grain, the same `evaluated_line`, within THIS transaction. After that join
  // the writer performs SCHEMA MAPPING ONLY — NO reorder, recompute, normalize,
  // infer, or repair. `ordinal` preserves the reader's chronological order (the
  // array index); `position_kind`/`outcome` are the discriminated verdict mapped
  // to the constrained storage state. REPLACE (delete-then-insert), mirroring the
  // reason-set and window-aggregate contracts, so a same-version repopulation
  // refreshes rather than duplicates.
  //
  // When `input.series` is absent (engine-only / pre-V1-8a0a callers) the series
  // table is left UNTOUCHED — never wiped. The production builder always sets it.
  if (input.series !== undefined) {
    await tx.query(
      `DELETE FROM evidence_profile_series WHERE evidence_profile_id = $1::uuid`,
      [evidence_profile_id]
    );
    let series_ordinal = 0;
    for (const pos of input.series) {
      const position_kind = pos.verdict.kind === 'eligible' ? 'eligible' : 'ineligible';
      const outcome = pos.verdict.kind === 'eligible' ? pos.verdict.outcome : null;
      const sp = await tx.query(
        `INSERT INTO evidence_profile_series
           (evidence_profile_id, ordinal, internal_game_id, game_date_utc, opponent_label,
            is_home, stat_value, evaluated_line, position_kind, outcome,
            eligibility_state, minutes_status, includes_backfilled_historical)
         VALUES ($1::uuid, $2::int, $3::uuid, $4::date, $5::text,
                 $6, $7, $8, $9::text, $10,
                 $11::player_stat_eligibility, $12::bdl_minutes_status, $13)`,
        [
          evidence_profile_id, series_ordinal, pos.internal_game_id, pos.game_date_utc, pos.opponent_label,
          pos.is_home, pos.stat_value, pos.evaluated_line, position_kind, outcome,
          pos.eligibility_state, pos.minutes_status, pos.includes_backfilled_historical,
        ]
      );
      if ((sp.rowCount ?? 0) !== 1) {
        throw new Error(
          `V1-8a0a v2 writer: series-position INSERT affected ${sp.rowCount ?? 0} rows for ` +
          `(profile=${evidence_profile_id}, game=${pos.internal_game_id}); expected 1. Rolling back.`
        );
      }
      series_ordinal += 1;
    }
  }

  return Object.freeze({
    evidence_profile_id, inserted, reasons_written: output.reasons.length,
  });
}

// V1-A1-3 Phase B — evidence-profile writer.
//
// Authorities:
//   * supabase/migrations/20260714000001_evidence_profiles.sql — header
//     "Future-writer conflict strategy" (documented FOR THIS TICKET).
//     This module implements EXACTLY that strategy: version-aware UPSERT
//     with DO UPDATE SET restricted to the recomputable columns +
//     defense-in-depth WHERE clause. Never ON CONFLICT DO NOTHING (the
//     V1-5 anti-pattern the migration explicitly forbids).
//   * supabase/migrations/20260714000002_evidence_profile_reasons.sql —
//     header "Future-writer conflict strategy" recommends delete-then-
//     insert inside the same transaction for the reason set. This
//     module implements that pattern.
//   * docs/product/EVIDENCE_PROFILE_METHOD_V1.md §H (reproducibility).
//     Every audit reference the profile row stores (current_market_row_id,
//     bdl_availability_snapshot_id, source_read_model_computation_version,
//     reference_date, book_detail_one_sided) is populated truthfully.
//   * V1-A1-2 GRAIN RULING + governor obligation carried into this
//     ticket: only `evaluated_source_kind = 'sportsbook_consensus'`
//     profiles may be persisted at `evidence_method_v1`. Other kinds are
//     computed on demand and NEVER persisted. This module refuses
//     structurally (throws) — matching Phase A's reasons.ts throw on a
//     RESERVED code.
//   * DR-27 halt condition — no `abnormal_dispersion` writer path exists;
//     reasons.ts already refuses to attach it, and this writer inherits
//     that guarantee. Belt-and-braces: this module asserts the reason
//     set contains no RESERVED code before writing.
//
// REASON-SET STRATEGY (declared per ticket rubric):
//   Delete-then-insert inside the profile's UPSERT transaction. Rationale:
//     * simpler than upsert-plus-orphan-delete;
//     * naturally correct against DR-26 ordering AND the schema's UNIQUE
//       (evidence_profile_id, category, intra_category_rank) — a
//       full-replace can never leave stale reasons or duplicate ranks;
//     * safe under concurrency: the writer holds the profile row's
//       transaction lock, so no other writer can see the intermediate
//       "profile updated but reasons empty" state.
//   The delete-then-insert MUST occur inside the SAME transaction as the
//   profile UPSERT — this module enforces that by taking a `Tx` argument
//   (never opening its own transaction).
//
// Pure DB layer: no I/O beyond the pg client, no clock reads that affect
// output beyond the schema's DEFAULT now() timestamps.

import type { Tx } from '../db/transaction.js';
import type { EvidenceProfileInput, EvidenceProfileOutput } from './types.js';
import { EVIDENCE_RESERVED_REASON_CODES } from '../shared/enums.js';
import { EVIDENCE_COMPUTATION_VERSION, EVIDENCE_METHOD_VERSION } from './computationVersion.js';

/**
 * Audit references stored on the profile row per §H reproducibility.
 * Every field maps to a column on `evidence_profiles`; the writer
 * populates them TRUTHFULLY (never fabricated). Nullable fields are
 * documented in the migration.
 */
export interface EvidenceProfileAuditRefs {
  /** Reference to the composed CurrentMarketRow row (persisted table).
   *  NULL when no CurrentMarketRow existed at write time (never happens
   *  in this ticket's driver — the driver's grain source IS the current
   *  market rows table, so every driver-driven profile has one). Tests
   *  may pass null for §C.8/§C.9 fixtures where the grain has no market. */
  readonly current_market_row_id: string | null;
  /** Availability snapshot the profile consulted. Nullable when
   *  availability itself is unresolved. */
  readonly bdl_availability_snapshot_id: string | null;
  /** RME-3 snapshot at write time. Derived from the profile input's
   *  CurrentMarketRow.book_detail.one_sided. Written truthfully — NULL
   *  is a legitimate value (empty offering set OR every price null). */
  readonly book_detail_one_sided: 'over_only' | 'under_only' | 'neither' | null;
  /** The V1-5 read-model computation_version the profile's threshold
   *  windows / historical rows were computed against. Distinct from the
   *  evidence-profile's own computation_version. */
  readonly source_read_model_computation_version: number;
}

export interface WriteEvidenceProfileResult {
  /** UUID assigned to the profile row (existing on same-version update;
   *  freshly generated on insert). */
  readonly evidence_profile_id: string;
  /** True when the profile row was newly inserted (xmax = 0); false when
   *  an existing row was updated via ON CONFLICT ... DO UPDATE. */
  readonly inserted: boolean;
  /** Number of reason rows written after delete-then-insert. Equals
   *  `output.reasons.length`. */
  readonly reasons_written: number;
}

/** Not a real error class — a marker string other layers can grep on. */
const CONSENSUS_ONLY_MSG = 'V1-A1-3 writer refused: non-consensus evaluated_source_kind is never persisted at evidence_method_v1';
const RESERVED_REASON_MSG = 'V1-A1-3 writer refused: reason set contains a RESERVED reason code';

/**
 * Persist an evidence profile + its reason set atomically inside the
 * caller-supplied transaction.
 *
 * REFUSES (throws) when:
 *   - `evaluated_source_kind` is anything other than 'sportsbook_consensus'.
 *   - Any reason in the set is RESERVED (defense-in-depth for DR-27).
 *   - The profile UPSERT's rowCount is not 1 (indicates a race /
 *     misuse; the caller's transaction rolls back).
 *   - Any reason INSERT's rowCount is not 1.
 *
 * The reason set is REPLACED (delete-then-insert) so post-commit the
 * stored reasons equal `output.reasons` exactly, with DR-26 canonical
 * ordering intact.
 */
export async function writeEvidenceProfile(
  tx: Tx,
  input: EvidenceProfileInput,
  output: EvidenceProfileOutput,
  audit: EvidenceProfileAuditRefs
): Promise<WriteEvidenceProfileResult> {
  // ---- Consensus-only structural guard --------------------------------------
  if (input.evaluated_source_kind !== 'sportsbook_consensus') {
    throw new Error(
      `${CONSENSUS_ONLY_MSG}: got evaluated_source_kind='${input.evaluated_source_kind}'. ` +
      `Non-consensus profiles are computed on demand only.`
    );
  }
  // ---- DR-27 reserved-code guard (belt-and-braces; Phase A already throws) --
  for (const r of output.reasons) {
    if (EVIDENCE_RESERVED_REASON_CODES.has(r.reason_code)) {
      throw new Error(`${RESERVED_REASON_MSG}: got '${r.reason_code}'.`);
    }
  }

  // ---- Profile UPSERT --------------------------------------------------------
  //
  // Column list follows the migration schema exactly. DO UPDATE SET is
  // restricted to the recomputable columns declared in the migration
  // header comment (lines 76-86 of 20260714000001_evidence_profiles.sql).
  // The IMMUTABLE columns — internal_game_id, internal_player_id,
  // market_key, method_version, computation_version, evidence_profile_id,
  // created_at — MUST NOT appear in DO UPDATE SET. The WHERE clause is
  // defense-in-depth: even if the caller somehow supplies a mismatched
  // (method_version, computation_version), the row for a different
  // version never mutates.
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
      EVIDENCE_METHOD_VERSION,
      EVIDENCE_COMPUTATION_VERSION,
      input.reference_date,
      audit.source_read_model_computation_version,
      audit.current_market_row_id,
      audit.bdl_availability_snapshot_id,
      audit.book_detail_one_sided,
    ]
  );

  if ((upsertResult.rowCount ?? 0) !== 1) {
    throw new Error(
      `V1-A1-3 writer: evidence_profiles UPSERT affected ${upsertResult.rowCount ?? 0} rows for ` +
      `grain=(${input.internal_game_id},${input.internal_player_id},${input.market_key}, ` +
      `v=${EVIDENCE_METHOD_VERSION},cv=${EVIDENCE_COMPUTATION_VERSION}); expected 1. Rolling back.`
    );
  }

  const { evidence_profile_id, inserted } = upsertResult.rows[0] as {
    evidence_profile_id: string;
    inserted: boolean;
  };

  // ---- Reason-set REPLACE (delete-then-insert inside same tx) ---------------
  //
  // The migration's header recommends this pattern verbatim: "the writer
  // atomically REPLACES the reasons rowset for the affected
  // evidence_profile_id inside the same transaction." Since the FK
  // ON DELETE CASCADE + version-blind UNIQUE (profile, reason_code) mean
  // an orphan / duplicate is impossible by construction, the DELETE
  // clears any pre-existing rows and the INSERTs establish the post-
  // commit truth.
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
        evidence_profile_id,
        reason.reason_code,
        reason.category,
        reason.intra_category_rank,
        reason.contribution_magnitude,
      ]
    );
    if ((w.rowCount ?? 0) !== 1) {
      throw new Error(
        `V1-A1-3 writer: evidence_profile_reasons INSERT affected ${w.rowCount ?? 0} rows for ` +
        `(profile=${evidence_profile_id}, reason=${reason.reason_code}); expected 1. Rolling back.`
      );
    }
  }

  return Object.freeze({
    evidence_profile_id,
    inserted,
    reasons_written: output.reasons.length,
  });
}

// V1-5x RME-2 — MappingResolutionResult owner.
//
// Authority anchors:
//   docs/product/EVIDENCE_PROFILE_METHOD_V1.md §A.4 (input binding
//     "unresolved player mapping" / "unresolved event mapping" →
//     MappingResolutionResult)
//   docs/product/EVIDENCE_PROFILE_METHOD_V1.md §C.9 (Unavailable classifications
//     `UNRESOLVED_PLAYER_MAPPING`, `UNRESOLVED_EVENT_MAPPING`)
//   docs/product/EVIDENCE_PROFILE_METHOD_V1.md §I.2 (V1-5x prerequisite ruling)
//   docs/architecture/V1_IDENTITY_CONTRACT.md §§1, 6, 8 (identity is
//     provider-independent; internal IDs never derived from provider strings;
//     approved mappings live in provider_players / provider_games with
//     `mapping_state = 'approved'` guarded by CHECKs that force
//     internal_player_id / internal_game_id to be non-null on approval)
//
// This module is the SINGLE owner of `MappingResolutionResult`. The
// evidence engine (V1-A1-3) consumes this field and MUST NOT derive a
// parallel version — single-owner invariant per V1_COMPUTATION_CONTRACT §1.
//
// ---------------------------------------------------------------------------
// Governor REVISE (2026-07-15): POSITIVE resolution predicate.
// ---------------------------------------------------------------------------
// Prior implementation derived resolution from the ABSENCE of an open
// reconciliation-queue row. That was a defect: a grain that was never
// mapped at all (or whose mapping was quarantined / superseded) reported
// resolved=true because no open queue row existed, letting Unavailable
// classifications leak through to Insufficient / classified profiles.
//
// Corrected predicate — resolution is read POSITIVELY from V1-1:
//   * `player_resolved = true` iff there EXISTS an approved provider_players
//     row whose `internal_player_id` equals the queried player id.
//     `mapping_state = 'approved'` is guarded by the migration-05 CHECK
//     "mapping_state <> 'approved' OR internal_player_id IS NOT NULL",
//     so an approved row is by construction a positive mapping.
//   * `event_resolved = true` iff there EXISTS an approved provider_games
//     row whose `internal_game_id` equals the queried game id (migration-06
//     CHECK is analogous).
//   * Queue rows are consulted ONLY to supply `queue_reason` for grains
//     that failed the positive predicate. Queue silence NEVER implies
//     resolution; queue noise NEVER un-resolves an approved mapping.
//
// Queue-reason vocabulary (V1-1, reused verbatim — NEVER invented):
//   * player_queue_reason: 'unmatched', 'ambiguous_multiple_candidates',
//       'ambiguous_alias_conflict', 'missing_event_context',
//       'missing_team_context', 'normalized_name_only'
//   * event_queue_reason: 'unmatched', 'ambiguous_multiple_candidates',
//       'unresolved_provider_team', 'time_window_exceeded',
//       'ordered_teams_disagree', 'self_match_invalid'
//   Both enums include `'unmatched'`, which is the truthful vocabulary
//   value for "no provider record maps to this internal id" — the shape
//   the governor's directive requires for the never-mapped case. The
//   existing vocabulary covers every unresolved state this reader can
//   observe (never-mapped, quarantined, superseded, or open-queue) and
//   no gap exists — nothing new is invented.
//
// Queue-reason selection when unresolved:
//   1. Prefer an OPEN queue row (still an active identity issue) with this
//      internal id as a candidate; if several, use the OLDEST for
//      determinism (`ORDER BY created_at ASC LIMIT 1`).
//   2. Otherwise, prefer a NON-open queue row (`quarantined`, `withdrawn`,
//      or an already-approved row that no longer pertains) — again OLDEST
//      for determinism — so a quarantined mapping surfaces the operator's
//      recorded reason rather than a generic label.
//   3. Otherwise (truly no queue row references this internal id), fall
//      back to the vocabulary's `'unmatched'` value. This is the truthful
//      shape for "no provider record maps to this internal id".
//   `queue_reason` is null only when BOTH grains are resolved.
//
// When BOTH grains are unresolved, `queue_reason` reflects the PLAYER
// queue reason: EVIDENCE_PROFILE_METHOD_V1.md §C.9 lists
// `UNRESOLVED_PLAYER_MAPPING` before `UNRESOLVED_EVENT_MAPPING`.
// `player_resolved` and `event_resolved` remain independently visible so
// the engine can attach both reason codes if it chooses.
//
// Read-only with respect to the identity layer: no INSERT, UPDATE, DELETE,
// or advisory lock against provider_*, queues, or mapping_history. V1-1
// owns all writes.
//
// ---------------------------------------------------------------------------
// Provider scope (governor-accepted semantics, 2026-07-15).
// ---------------------------------------------------------------------------
// The EXISTS predicates above are PROVIDER-BLIND: they succeed on the
// FIRST approved provider_players / provider_games row that points at the
// queried internal id, regardless of which provider (`balldontlie` /
// `odds_api`) supplied that row. Therefore:
//
//   * `player_resolved = true` means "an approved provider mapping exists
//     for AT LEAST ONE provider" — NOT "an approved mapping exists for
//     every provider a profile needs."
//   * `event_resolved` has the analogous scope.
//   * A grain that is APPROVED for BALLDONTLIE but UNRESOLVED for the
//     Odds API reports `resolved = true` here. The resulting absence of
//     Odds-API offerings is expected to surface downstream as an
//     Unavailable / market-side outcome via
//     `CurrentMarketRow.freshness.state = 'unavailable'` and
//     `eligible_book_count.count = 0` (EVIDENCE_PROFILE_METHOD_V1.md §C.3
//     `NO_CURRENT_MARKET` disambiguation) — NOT through the §C.9
//     UNRESOLVED_*_MAPPING reasons.
//   * V1-A1-3 MUST NOT assume per-provider resolution from this field. If
//     a future ticket needs per-provider resolution granularity, it must
//     ship as a distinct shape under a method-version bump per DR-24; this
//     shape's semantics are stable at the "any-provider" scope.

import { methodVersionOf } from './computationVersion.js';
import type { SliplabzPool } from '../db/connection.js';
import type { Tx } from '../db/transaction.js';
import type { MappingResolutionResult } from './types.js';

/**
 * Fallback queue-reason value when a grain is unresolved but no queue row
 * references it — the truthful vocabulary shape for "no provider record
 * maps to this internal id". Present in both `player_queue_reason` and
 * `event_queue_reason` V1-1 enums.
 */
const UNRESOLVED_NO_QUEUE_ROW_REASON = 'unmatched';

/**
 * Pure input for `assembleMappingResolution`.
 *
 * The resolution flags come from POSITIVE existence checks against
 * `provider_players` / `provider_games` at `mapping_state = 'approved'`.
 * The queue-reason candidates come from a preference-ordered scan of the
 * corresponding reconciliation queue for the same internal id.
 *
 * When `player_resolved` is true, `player_queue_reason_candidate` MUST be
 * null — the assembler asserts this and refuses to compose a shape where
 * a resolved grain still carries a reason. (Mirror rule for events.)
 */
export interface MappingResolutionInput {
  readonly player_resolved: boolean;
  readonly event_resolved: boolean;
  /** Preferred queue reason for the player when NOT resolved. Set by the
   *  reader (or by unit-test construction). Null on the resolved path. */
  readonly player_queue_reason_candidate: string | null;
  /** Same for the event. */
  readonly event_queue_reason_candidate: string | null;
}

/**
 * Pure assembly. Applies:
 *   * both resolved → queue_reason null
 *   * only player unresolved → player queue reason (or 'unmatched' fallback)
 *   * only event unresolved  → event  queue reason (or 'unmatched' fallback)
 *   * both unresolved         → player reason wins (§C.9 order)
 */
export function assembleMappingResolution(
  internal_player_id: string,
  internal_game_id: string,
  input: MappingResolutionInput
): MappingResolutionResult {
  if (input.player_resolved && input.player_queue_reason_candidate !== null) {
    throw new Error(
      'assembleMappingResolution: player_resolved=true but a queue reason was supplied; ' +
      'positive resolution overrides queue state — the reader is buggy.'
    );
  }
  if (input.event_resolved && input.event_queue_reason_candidate !== null) {
    throw new Error(
      'assembleMappingResolution: event_resolved=true but a queue reason was supplied; ' +
      'positive resolution overrides queue state — the reader is buggy.'
    );
  }
  let queue_reason: string | null;
  if (input.player_resolved && input.event_resolved) {
    queue_reason = null;
  } else if (!input.player_resolved) {
    // Player-unresolved wins when both are unresolved (§C.9 order).
    queue_reason =
      input.player_queue_reason_candidate ?? UNRESOLVED_NO_QUEUE_ROW_REASON;
  } else {
    // Only event unresolved.
    queue_reason =
      input.event_queue_reason_candidate ?? UNRESOLVED_NO_QUEUE_ROW_REASON;
  }
  return Object.freeze({
    internal_player_id,
    internal_game_id,
    player_resolved: input.player_resolved,
    event_resolved: input.event_resolved,
    queue_reason,
    method_version: methodVersionOf('mapping_resolution'),
  });
}

/**
 * DB reader: assemble a `MappingResolutionResult` from live V1-1 state.
 *
 * Query shape (all read-only, ordered deterministically):
 *   1. POSITIVE existence checks against provider_players / provider_games
 *      at `mapping_state = 'approved'` for the queried internal ids.
 *   2. For each unresolved grain, a queue lookup that prefers open rows,
 *      then non-open rows, ordered by `created_at ASC` so identical queue
 *      state always produces the identical `queue_reason` value.
 */
export async function readMappingResolutionForGrain(
  db: SliplabzPool | Tx,
  internal_player_id: string,
  internal_game_id: string
): Promise<MappingResolutionResult> {
  const [playerApproved, eventApproved] = await Promise.all([
    db.query(
      `SELECT EXISTS (
         SELECT 1 FROM provider_players
          WHERE internal_player_id = $1::uuid
            AND mapping_state = 'approved'
       ) AS resolved`,
      [internal_player_id]
    ),
    db.query(
      `SELECT EXISTS (
         SELECT 1 FROM provider_games
          WHERE internal_game_id = $1::uuid
            AND mapping_state = 'approved'
       ) AS resolved`,
      [internal_game_id]
    ),
  ]);
  const player_resolved = (playerApproved.rows[0] as { resolved: boolean }).resolved === true;
  const event_resolved = (eventApproved.rows[0] as { resolved: boolean }).resolved === true;

  let player_queue_reason_candidate: string | null = null;
  let event_queue_reason_candidate: string | null = null;

  if (!player_resolved) {
    const q = await db.query(
      // Prefer open rows (still an active identity issue); fall back to any
      // non-open row (quarantined / withdrawn / approved-for-another-provider)
      // so a quarantined mapping surfaces the operator's recorded reason
      // rather than a generic label. Deterministic on repeated calls.
      `SELECT reason::text AS reason
         FROM player_reconciliation_queue
        WHERE $1::uuid = ANY (candidate_internal_player_ids)
        ORDER BY (resolution = 'open') DESC, created_at ASC
        LIMIT 1`,
      [internal_player_id]
    );
    player_queue_reason_candidate =
      q.rows.length === 0 ? null : (q.rows[0] as { reason: string }).reason;
  }
  if (!event_resolved) {
    const q = await db.query(
      `SELECT reason::text AS reason
         FROM event_reconciliation_queue
        WHERE $1::uuid = ANY (candidate_internal_game_ids)
        ORDER BY (resolution = 'open') DESC, created_at ASC
        LIMIT 1`,
      [internal_game_id]
    );
    event_queue_reason_candidate =
      q.rows.length === 0 ? null : (q.rows[0] as { reason: string }).reason;
  }

  return assembleMappingResolution(internal_player_id, internal_game_id, {
    player_resolved,
    event_resolved,
    player_queue_reason_candidate,
    event_queue_reason_candidate,
  });
}

// V1-OP-5D — scoped status-only game finalizer (the reusable src/ owner).
//
// The SINGLE BDL game-finalization owner. Given an EXPLICIT bounded set of
// internal game ids, it re-observes each game's BDL status and, for the
// selected games only, updates `games.status` (plus `updated_at`) — and
// NOTHING else. V1-OP-5C later invokes THIS owner on a schedule; there is no
// second implementation.
//
// HARD BOUNDARY INVARIANTS (GAP-31 / GAP-30):
//   * Writes ONLY `games.status` + `updated_at`.
//   * NEVER writes `scheduled_start_utc` or `actual_start_utc` (the UPDATE
//     statement names neither column — byte-identity is guaranteed by
//     construction, not by comparison).
//   * NEVER synthesizes a timestamp from any provider field (this owner never
//     touches a timestamp at all).
//   * NEVER creates a game or provider-mapping row, and never touches a game
//     outside the explicit selected set.
//   * Finality is derived ONLY from the committed `mapBdlGameStatus`
//     (`gameStatus.ts`) — unknown statuses QUARANTINE (never guessed), so a
//     game is never moved to a fabricated status.
//   * Makes NO Odds API call.
//
// The pure `planGameFinalization` is fully unit-testable with no DB / network.
// The impure `applyGameFinalization` writes inside a caller-supplied `Tx`.
// `finalizeSelectedGames` orchestrates via injected read-only + tx deps, and a
// `dry_run` performs ZERO database writes of every kind (it never opens a Tx).

import { mapBdlGameStatus } from './gameStatus.js';
import type { GameStatus } from '../shared/enums.js';
import type { Tx } from '../db/transaction.js';

/**
 * READ-ONLY selector for the V1-OP-5D backlog: the stuck past-tip
 * `status='scheduled'` games in the ingestion-failure window that carry an
 * APPROVED balldontlie mapping. `$1` = window start (e.g. `2026-07-12`). Returns
 * the explicit `internal_game_id` set the operator passes to the owner — the
 * owner itself never runs an implicit season scan. SELECT-only; no writes.
 */
export const STUCK_SCHEDULED_BACKLOG_SELECTOR_SQL = `
  SELECT g.internal_game_id::text AS internal_game_id
    FROM games g
   WHERE g.status = 'scheduled'
     AND g.scheduled_start_utc >= $1::timestamptz
     AND g.scheduled_start_utc <  now()
     AND EXISTS (
       SELECT 1 FROM provider_games pv
        WHERE pv.internal_game_id = g.internal_game_id
          AND pv.provider = 'balldontlie'
          AND pv.mapping_state = 'approved'
     )
   ORDER BY g.scheduled_start_utc ASC`;

/** One selected game: our current status + the BDL raw status just observed. */
export interface GameFinalizationInput {
  readonly internal_game_id: string;
  /** Our DB's current canonical status. */
  readonly current_status: GameStatus;
  /** BDL's reported raw status string for this game (null if BDL had none). */
  readonly bdl_raw_status: string | null;
}

export type FinalizationAction = 'update' | 'noop' | 'quarantine';

/** One per-game decision. Carries NO start-time field — by construction. */
export interface GameFinalizationDecision {
  readonly internal_game_id: string;
  readonly current_status: GameStatus;
  readonly mapped_status: GameStatus;
  readonly is_unknown: boolean;
  readonly action: FinalizationAction;
  /** The status to write, ONLY when action === 'update'. */
  readonly to_status: GameStatus | null;
}

/**
 * PURE. For each selected game, derive the intended action:
 *   * unknown BDL status  → `quarantine` (NEVER guessed, NEVER written);
 *   * mapped == current   → `noop` (idempotent — already correct);
 *   * mapped != current   → `update` to the mapped canonical status.
 * The decision references only `status` — never a start-time field.
 */
export function planGameFinalization(
  inputs: ReadonlyArray<GameFinalizationInput>,
): ReadonlyArray<GameFinalizationDecision> {
  return inputs.map((g) => {
    const m = mapBdlGameStatus(g.bdl_raw_status);
    if (m.is_unknown) {
      return Object.freeze({
        internal_game_id: g.internal_game_id,
        current_status: g.current_status,
        mapped_status: m.canonical_status,
        is_unknown: true,
        action: 'quarantine' as const,
        to_status: null,
      });
    }
    if (m.canonical_status === g.current_status) {
      return Object.freeze({
        internal_game_id: g.internal_game_id,
        current_status: g.current_status,
        mapped_status: m.canonical_status,
        is_unknown: false,
        action: 'noop' as const,
        to_status: null,
      });
    }
    return Object.freeze({
      internal_game_id: g.internal_game_id,
      current_status: g.current_status,
      mapped_status: m.canonical_status,
      is_unknown: false,
      action: 'update' as const,
      to_status: m.canonical_status,
    });
  });
}

export interface ApplyResult {
  readonly updated: number;
  readonly noops: number;
  readonly quarantined: number;
  /** Games whose UPDATE did not affect exactly one row — reported, never silent. */
  readonly failures: ReadonlyArray<{ readonly internal_game_id: string; readonly reason: string }>;
}

/**
 * Apply the `update` decisions inside a caller-supplied transaction. Writes
 * ONLY `status` + `updated_at`. Every UPDATE asserts `rowCount === 1`; a
 * mismatch is recorded in `failures` (the caller decides whether to roll back)
 * so a partial batch can never be silently mixed.
 */
export async function applyGameFinalization(
  tx: Tx,
  decisions: ReadonlyArray<GameFinalizationDecision>,
): Promise<ApplyResult> {
  let updated = 0;
  let noops = 0;
  let quarantined = 0;
  const failures: Array<{ internal_game_id: string; reason: string }> = [];
  for (const d of decisions) {
    if (d.action === 'noop') { noops += 1; continue; }
    if (d.action === 'quarantine') { quarantined += 1; continue; }
    // action === 'update' — status + updated_at ONLY. No start-time column named.
    const r = await tx.query(
      `UPDATE games SET status = $2::game_status, updated_at = now() WHERE internal_game_id = $1::uuid`,
      [d.internal_game_id, d.to_status],
    );
    if ((r.rowCount ?? 0) !== 1) {
      failures.push({ internal_game_id: d.internal_game_id, reason: `UPDATE affected ${r.rowCount ?? 0} rows, expected 1` });
    } else {
      updated += 1;
    }
  }
  return Object.freeze({ updated, noops, quarantined, failures: Object.freeze(failures) });
}

/** Read-only + tx dependencies, injected so the orchestrator is testable. */
export interface GameFinalizerDeps {
  /** Resolve the EXPLICIT selected ids to {id, provider_game_id, current_status}
   *  via APPROVED balldontlie mappings only. Returns fewer rows if an id has no
   *  approved mapping (those ids are reported as unresolved). Read-only. */
  readonly listSelected: (
    internal_game_ids: ReadonlyArray<string>,
  ) => Promise<ReadonlyArray<{ readonly internal_game_id: string; readonly provider_game_id: string; readonly current_status: GameStatus }>>;
  /** Read-only BDL status observation for the given provider game ids. */
  readonly fetchBdlStatus: (
    provider_game_ids: ReadonlyArray<string>,
  ) => Promise<ReadonlyMap<string, string | null>>;
  /** Run a function in a transaction (production: withTransaction). Called ONLY
   *  on the live (non-dry-run) path. */
  readonly runInTransaction: <T>(fn: (tx: Tx) => Promise<T>) => Promise<T>;
}

export interface FinalizeReport {
  readonly dry_run: boolean;
  readonly requested_ids: number;
  readonly resolved: number;
  readonly unresolved_ids: ReadonlyArray<string>;
  readonly decisions: ReadonlyArray<GameFinalizationDecision>;
  readonly applied: ApplyResult | null;
}

/**
 * Orchestrate a scoped finalization for an EXPLICIT bounded id set.
 *
 *   * Empty id set → an explicit no-op (never an implicit season-wide scan).
 *   * dry_run === true → plan only; NEVER opens a transaction; ZERO DB writes.
 *   * dry_run === false → apply the plan inside ONE transaction.
 */
export async function finalizeSelectedGames(
  deps: GameFinalizerDeps,
  opts: { readonly internal_game_ids: ReadonlyArray<string>; readonly dry_run: boolean },
): Promise<FinalizeReport> {
  const ids = [...new Set(opts.internal_game_ids)];
  if (ids.length === 0) {
    return Object.freeze({ dry_run: opts.dry_run, requested_ids: 0, resolved: 0, unresolved_ids: Object.freeze([]), decisions: Object.freeze([]), applied: null });
  }
  const selected = await deps.listSelected(ids);
  const resolvedSet = new Set(selected.map((s) => s.internal_game_id));
  const unresolved = ids.filter((id) => !resolvedSet.has(id));
  const bdlStatus = await deps.fetchBdlStatus(selected.map((s) => s.provider_game_id));
  const inputs: GameFinalizationInput[] = selected.map((s) => ({
    internal_game_id: s.internal_game_id,
    current_status: s.current_status,
    bdl_raw_status: bdlStatus.get(s.provider_game_id) ?? null,
  }));
  const decisions = planGameFinalization(inputs);
  if (opts.dry_run) {
    return Object.freeze({ dry_run: true, requested_ids: ids.length, resolved: selected.length, unresolved_ids: Object.freeze(unresolved), decisions, applied: null });
  }
  const applied = await deps.runInTransaction((tx) => applyGameFinalization(tx, decisions));
  return Object.freeze({ dry_run: false, requested_ids: ids.length, resolved: selected.length, unresolved_ids: Object.freeze(unresolved), decisions, applied });
}

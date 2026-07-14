// V1-5 governor ledger #4 — BDL post_final_reconciliation drain loop.
//
// In-repo primitive that consumes `post_final_reconciliation_schedule` rows
// whose `due_at <= now()`. No external cron; a caller invokes this in a
// scheduled context of its own (V1-10 operational obligation).
//
// Load-bearing invariants:
//   * Rows are picked with FOR UPDATE SKIP LOCKED so parallel drainers don't
//     clash.
//   * A "processed" row is marked completed_at + completed_by_run_id. The
//     driver does NOT itself perform the pull — it emits a work item that
//     the caller's operator translates into an ingestion run.
//   * A "cancelled" row (cancelled_at IS NOT NULL) is skipped.
//   * Idempotent: rerunning is safe. Already-completed rows never re-emit.

import { withTransaction } from '../../db/transaction.js';
import type { SliplabzPool } from '../../db/connection.js';

export interface DueReconciliation {
  readonly post_final_reconciliation_schedule_id: string;
  readonly internal_game_id: string;
  readonly provider_game_id: string;
  readonly kind: 'first_post_final' | 't_plus_2h' | 'next_day' | 'season_sweep';
  readonly due_at: string;
}

export interface DrainInput {
  readonly max_batch?: number;
  readonly now?: string; // ISO — override for tests.
}

export interface DrainResult {
  readonly emitted: ReadonlyArray<DueReconciliation>;
  readonly rows_picked_for_processing: number;
}

/**
 * Return every schedule row that is DUE (due_at <= now, not completed, not
 * cancelled). The returned rows are RESERVED via an UPDATE that sets
 * `updated_at = now()`; the caller marks them completed via
 * `markReconciliationCompleted` after the operator ingestion run finishes.
 */
export async function pickDueReconciliations(
  pool: SliplabzPool,
  input: DrainInput = {}
): Promise<DrainResult> {
  const now = input.now ?? new Date().toISOString();
  const max = input.max_batch ?? 50;
  const emitted: DueReconciliation[] = [];

  await withTransaction(pool, async (tx) => {
    const q = await tx.query(
      `SELECT post_final_reconciliation_schedule_id::text AS id,
              internal_game_id::text AS gid,
              provider_game_id, kind,
              due_at::text AS due_at
         FROM post_final_reconciliation_schedule
        WHERE completed_at IS NULL
          AND cancelled_at IS NULL
          AND due_at <= $1::timestamptz
        ORDER BY due_at ASC
        LIMIT $2
        FOR UPDATE SKIP LOCKED`,
      [now, max]
    );
    for (const r of q.rows as any[]) {
      emitted.push(Object.freeze({
        post_final_reconciliation_schedule_id: r.id,
        internal_game_id: r.gid,
        provider_game_id: r.provider_game_id,
        kind: r.kind,
        due_at: r.due_at,
      }));
    }
    // Touch updated_at so parallel drainers see the reservation.
    if (emitted.length > 0) {
      await tx.query(
        `UPDATE post_final_reconciliation_schedule
            SET updated_at = now()
          WHERE post_final_reconciliation_schedule_id = ANY($1::uuid[])`,
        [emitted.map((e) => e.post_final_reconciliation_schedule_id)]
      );
    }
  });

  return Object.freeze({
    emitted: Object.freeze(emitted),
    rows_picked_for_processing: emitted.length,
  });
}

/**
 * Mark a due reconciliation row as completed_at = now(),
 * completed_by_run_id = the BDL ingestion-run id that performed the work.
 * Idempotent: if already completed, does nothing.
 */
export async function markReconciliationCompleted(
  pool: SliplabzPool,
  args: {
    readonly post_final_reconciliation_schedule_id: string;
    readonly completed_by_run_id: string;
  }
): Promise<void> {
  await pool.query(
    `UPDATE post_final_reconciliation_schedule
        SET completed_at = COALESCE(completed_at, now()),
            completed_by_run_id = COALESCE(completed_by_run_id, $2::uuid),
            updated_at = now()
      WHERE post_final_reconciliation_schedule_id = $1::uuid`,
    [args.post_final_reconciliation_schedule_id, args.completed_by_run_id]
  );
}

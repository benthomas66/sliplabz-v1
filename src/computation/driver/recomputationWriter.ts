// V1-5 governor ledger #2 — recomputation writer.
//
// Consumes `recomputation_invalidations` and produces new
// `computation_version` rows in `historical_line_results` and
// `real_line_windows`. Prior-version rows are NEVER mutated; a same-version
// input correction UPSERTs in place (per governor V1-5 revise 2026-07-13).
//
// LOAD-BEARING INVARIANTS (governor V1-5 revise):
//   1. Per claimed invalidation (or safely bounded batch), a SINGLE database
//      transaction encloses: FOR UPDATE SKIP LOCKED claim; read of corrected
//      source state; derived writes; processed_at mark. `withTransaction`
//      provides the boundary.
//   2. If the transaction fails BEFORE the processed_at write, every derived
//      write from that attempt rolls back and the invalidation remains
//      unprocessed. Retry semantics inherit from re-invocation.
//   3. If the transaction commits, the intended recomputed state EXISTS.
//      A uniqueness conflict MUST NEVER silently preserve an obsolete result:
//      historical_line_results uses ON CONFLICT (grain, computation_version)
//      DO UPDATE SET on recomputable columns; real_line_windows likewise.
//   4. Every derived write verifies rowCount against expectation and THROWS
//      on mismatch (rolling back the entire per-invalidation transaction).
//   5. `processed_note` records a per-invalidation disposition — never a
//      constant. Values used: 'recomputed' | 'no_eligible_source'.
//   6. Coverage-label relabels are FORBIDDEN. `unresolved_closing_consensus`
//      is written as-is; `real_line_windows.coverage_label` (line 82 of
//      supabase/migrations/20260711140008_real_line_windows.sql) is the
//      unrestricted `coverage_label` enum, so all five enum values are
//      legitimately admitted. `historical_line_results.coverage_state`
//      (lines 68-69 of migration 20260711140007) has
//      `CHECK (coverage_state IN ('complete','single_book'))` — the pure
//      compute already returns only those two under §7.11 pre-filtering,
//      so no relabel is needed there either.
//
// AFFECTED TABLES + KEYS:
//   * historical_line_results: UNIQUE
//     (internal_game_id, internal_player_id, market_key, computation_version)
//     per migration 20260713000000_historical_line_results_unique_includes_computation_version.sql.
//   * real_line_windows: UNIQUE
//     (internal_player_id, market_key, reference_date, window_type, computation_version)
//     per migration 20260711140008_real_line_windows.sql line 90.
//   * recomputation_invalidations.processed_at: single-writer marker;
//     concurrent drainers are safe because SELECT ... FOR UPDATE SKIP
//     LOCKED reserves the row before the transaction touches derived tables.

import { withTransaction, type Tx } from '../../db/transaction.js';
import type { SliplabzPool } from '../../db/connection.js';
import { V1_5_COMPUTATION_VERSION } from '../computationVersion.js';
import { computeRealLineWindow } from '../realLineWindows.js';
import { computeHistoricalLineResult } from '../../lines/historicalLineResult.js';
import type { RealLineOutcome } from '../../shared/enums.js';

export interface RecomputationWriterInput {
  /** Maximum number of invalidations to drain per call. Default 100.
   *  The whole batch is one transaction so a mid-batch failure rolls
   *  back everything and leaves the batch unprocessed. Callers wanting
   *  finer isolation should pass smaller values or call repeatedly. */
  readonly max_batch?: number;
  /** Test-only fault point (mirrors the V1-4 persistOddsapiSnapshot
   *  pattern). Invoked AFTER derived writes but BEFORE the processed_at
   *  mark. When it throws, the transaction ROLLBACK unwinds every write
   *  and leaves the invalidation unprocessed. Load-bearing for the
   *  crash-window integration test. */
  readonly on_after_derived_writes?: (tx: Tx) => Promise<void>;
}

export interface RecomputationWriterResult {
  readonly invalidations_processed: number;
  readonly historical_results_written: number;
  readonly real_line_windows_written: number;
  readonly skipped_no_effect: number;
  readonly computation_version: number;
}

type InvalidationDisposition = 'recomputed' | 'no_eligible_source';

interface InvalidationRow {
  recomputation_invalidation_id: string;
  entity_kind: 'player_game_stat' | 'internal_player' | 'internal_game';
  entity_id: string;
}

/**
 * Drain up to `max_batch` unprocessed invalidations and produce
 * `computation_version = V1_5_COMPUTATION_VERSION` rows in the affected
 * derived tables.
 *
 * See file header for the load-bearing invariants.
 */
export async function drainRecomputationInvalidations(
  pool: SliplabzPool,
  input: RecomputationWriterInput = {}
): Promise<RecomputationWriterResult> {
  const max = input.max_batch ?? 100;
  let invalidations_processed = 0;
  let historical_results_written = 0;
  let real_line_windows_written = 0;
  let skipped_no_effect = 0;

  await withTransaction(pool, async (tx) => {
    const cursor = await tx.query(
      `SELECT recomputation_invalidation_id::text AS id,
              entity_kind, entity_id::text AS entity_id
         FROM recomputation_invalidations
        WHERE processed_at IS NULL
        ORDER BY observed_at ASC
        LIMIT $1
        FOR UPDATE SKIP LOCKED`,
      [max]
    );
    const rows = cursor.rows as Array<{ id: string; entity_kind: InvalidationRow['entity_kind']; entity_id: string }>;

    for (const row of rows) {
      const inv: InvalidationRow = {
        recomputation_invalidation_id: row.id,
        entity_kind: row.entity_kind,
        entity_id: row.entity_id,
      };
      const affectedPairs = await resolveAffectedPairs(tx, inv);
      let disposition: InvalidationDisposition;
      if (affectedPairs.length === 0) {
        skipped_no_effect += 1;
        disposition = 'no_eligible_source';
      } else {
        for (const p of affectedPairs) {
          const written = await recomputeHistoricalForGamePlayer(tx, p.internal_game_id, p.internal_player_id);
          historical_results_written += written;
        }
        // Real-line windows are per (player, market, reference_date).
        const affectedPlayers = Array.from(new Set(affectedPairs.map((p) => p.internal_player_id)));
        for (const pid of affectedPlayers) {
          const rw = await recomputeRealLineWindowsForPlayer(tx, pid);
          real_line_windows_written += rw;
        }
        disposition = 'recomputed';
      }

      // Optional fault point AFTER derived writes but BEFORE processed_at
      // mark. Preserves the crash-window rollback invariant (R4c test).
      if (input.on_after_derived_writes !== undefined) {
        await input.on_after_derived_writes(tx);
      }

      // Mark processed with per-invalidation disposition (never a constant).
      const upd = await tx.query(
        `UPDATE recomputation_invalidations
            SET processed_at = now(),
                processed_note = $2
          WHERE recomputation_invalidation_id = $1::uuid
            AND processed_at IS NULL`,
        [inv.recomputation_invalidation_id, disposition]
      );
      if ((upd.rowCount ?? 0) !== 1) {
        throw new Error(
          `V1-5 recomputation writer: UPDATE recomputation_invalidations affected ` +
          `${upd.rowCount ?? 0} rows for invalidation_id=${inv.recomputation_invalidation_id}; expected exactly 1. ` +
          `Rolling back to preserve the "committed => intended state exists" invariant.`
        );
      }
      invalidations_processed += 1;
    }
  });

  return Object.freeze({
    invalidations_processed,
    historical_results_written,
    real_line_windows_written,
    skipped_no_effect,
    computation_version: V1_5_COMPUTATION_VERSION,
  });
}

/**
 * Determine the (game, player) pairs affected by an invalidation.
 * Returns [] when the input is not resolvable to a valid pair.
 */
async function resolveAffectedPairs(
  tx: Tx,
  inv: InvalidationRow
): Promise<Array<{ internal_game_id: string; internal_player_id: string }>> {
  if (inv.entity_kind === 'player_game_stat') {
    const r = await tx.query(
      `SELECT internal_game_id::text AS g, internal_player_id::text AS p
         FROM player_game_stats WHERE player_game_stat_id = $1::uuid`,
      [inv.entity_id]
    );
    const row = r.rows[0] as { g: string | null; p: string | null } | undefined;
    if (row === undefined || row.g === null || row.p === null) return [];
    return [{ internal_game_id: row.g, internal_player_id: row.p }];
  }
  if (inv.entity_kind === 'internal_game') {
    const r = await tx.query(
      `SELECT DISTINCT internal_game_id::text AS g, internal_player_id::text AS p
         FROM player_game_stats
        WHERE internal_game_id = $1::uuid AND internal_player_id IS NOT NULL`,
      [inv.entity_id]
    );
    return (r.rows as Array<{ g: string; p: string }>).map((r2) => ({
      internal_game_id: r2.g, internal_player_id: r2.p,
    }));
  }
  const r = await tx.query(
    `SELECT DISTINCT internal_game_id::text AS g, internal_player_id::text AS p
       FROM player_game_stats
      WHERE internal_player_id = $1::uuid AND internal_game_id IS NOT NULL`,
    [inv.entity_id]
  );
  return (r.rows as Array<{ g: string; p: string }>).map((r2) => ({
    internal_game_id: r2.g, internal_player_id: r2.p,
  }));
}

/**
 * Recompute historical_line_results for the (game, player) pair at
 * V1_5_COMPUTATION_VERSION. UPSERTs on (game, player, market, version) so
 * a same-version input correction updates in place while a version bump
 * inserts a new row. Prior-version rows are never touched.
 *
 * Returns the actual affected-row count reported by pg. Under
 * ON CONFLICT ... DO UPDATE, both the insert path AND the update path
 * report rowCount=1 per statement — that's the "committed => intended
 * state exists" proof for this row. Any other value forces rollback.
 */
async function recomputeHistoricalForGamePlayer(
  tx: Tx,
  game_id: string,
  player_id: string
): Promise<number> {
  const q = await tx.query(
    `SELECT ccp.canonical_closing_point_id::text AS ccp_id,
            ccp.market_key,
            ccp.canonical_closing_point,
            ccp.coverage_label,
            mr.canonical_stat_key,
            pgs.player_game_stat_id::text AS pgs_id,
            pgs.normalized_stats
       FROM canonical_closing_points ccp
       JOIN market_registry mr ON mr.provider_key = ccp.market_key
       JOIN player_game_stats pgs
         ON pgs.internal_game_id = ccp.internal_game_id
        AND pgs.internal_player_id = ccp.internal_player_id
      WHERE ccp.internal_game_id = $1::uuid
        AND ccp.internal_player_id = $2::uuid
        AND ccp.canonical_closing_point IS NOT NULL
        AND pgs.eligibility_state = 'eligible'`,
    [game_id, player_id]
  );
  let affected = 0;
  for (const row of q.rows as Array<{
    ccp_id: string; market_key: string; canonical_closing_point: string;
    coverage_label: 'complete' | 'single_book' | 'unresolved_closing_consensus' | 'no_closing_line';
    canonical_stat_key: string; pgs_id: string; normalized_stats: Record<string, unknown>;
  }>) {
    if (row.coverage_label !== 'complete' && row.coverage_label !== 'single_book') {
      // canonical_closing_points has non-eligible coverage (tied or
      // no_closing_line). historical_line_results.coverage_state has
      // CHECK (coverage_state IN ('complete','single_book')) on line 69
      // of migration 20260711140007_historical_line_results.sql — the
      // schema rejects any other value. This grain is EXCLUDED from the
      // derived table by design; the exclusion is honestly recorded as
      // "no row exists at this grain / version", not relabeled.
      continue;
    }
    const statValue = row.normalized_stats[row.canonical_stat_key];
    if (typeof statValue !== 'number' || !Number.isFinite(statValue)) continue;
    const canonPoint = Number(row.canonical_closing_point);
    const result = computeHistoricalLineResult({
      canonical_closing_point: canonPoint,
      player_stat_value: statValue,
      coverage_label: row.coverage_label,
    });
    // UPSERT: same-version input correction updates in place; a version
    // bump inserts a new row. Only recomputable derived columns appear in
    // DO UPDATE SET; identity columns (game, player, market, computation
    // version) are the conflict target and stay fixed. Provenance is
    // NEVER weakened; computation_version is set at insert time and the
    // conflict path leaves it as-is by construction.
    const w = await tx.query(
      `INSERT INTO historical_line_results
         (internal_game_id, internal_player_id, market_key,
          canonical_closing_point_id, canonical_closing_point,
          player_game_stat_id, player_stat_key, player_stat_value,
          outcome, margin, coverage_state, provenance,
          computation_version, computed_at)
       VALUES ($1::uuid,$2::uuid,$3,$4::uuid,$5,$6::uuid,$7,$8,$9,$10,$11,'self_observed',$12,now())
       ON CONFLICT ON CONSTRAINT historical_line_results_grain_version_unique
       DO UPDATE SET
         canonical_closing_point_id = EXCLUDED.canonical_closing_point_id,
         canonical_closing_point = EXCLUDED.canonical_closing_point,
         player_game_stat_id = EXCLUDED.player_game_stat_id,
         player_stat_key = EXCLUDED.player_stat_key,
         player_stat_value = EXCLUDED.player_stat_value,
         outcome = EXCLUDED.outcome,
         margin = EXCLUDED.margin,
         coverage_state = EXCLUDED.coverage_state,
         computed_at = now(),
         updated_at = now()`,
      [game_id, player_id, row.market_key,
       row.ccp_id, canonPoint,
       row.pgs_id, row.canonical_stat_key, statValue,
       result.outcome, result.margin, result.coverage_label,
       V1_5_COMPUTATION_VERSION]
    );
    if ((w.rowCount ?? 0) !== 1) {
      throw new Error(
        `V1-5 recomputation writer: historical_line_results write affected ` +
        `${w.rowCount ?? 0} rows for grain=(${game_id},${player_id},${row.market_key}, v=${V1_5_COMPUTATION_VERSION}); expected 1. Rolling back.`
      );
    }
    affected += 1;
  }
  return affected;
}

/**
 * Recompute real_line_windows for the player at V1_5_COMPUTATION_VERSION.
 * UPSERTs on (player, market, reference_date, window_type, version). Reads
 * historical_line_results at the LATEST computation_version per (game,
 * player, market) grain — a bumped historical row on this run is picked
 * up immediately.
 */
async function recomputeRealLineWindowsForPlayer(
  tx: Tx,
  player_id: string
): Promise<number> {
  const q = await tx.query(
    `WITH latest AS (
       SELECT DISTINCT ON (internal_game_id, internal_player_id, market_key)
              internal_game_id, internal_player_id, market_key,
              canonical_closing_point, player_stat_value,
              outcome, margin, coverage_state
         FROM historical_line_results
        WHERE internal_player_id = $1::uuid
          AND coverage_state IN ('complete','single_book')
        ORDER BY internal_game_id, internal_player_id, market_key,
                 computation_version DESC, computed_at DESC
     )
     SELECT latest.market_key,
            latest.canonical_closing_point,
            latest.player_stat_value,
            latest.outcome,
            latest.margin,
            latest.coverage_state,
            g.scheduled_start_utc,
            EXISTS (
              SELECT 1 FROM market_snapshots ms
               WHERE ms.provenance = 'backfilled_historical'
                 AND ms.linked_internal_game_id = g.internal_game_id
                 AND ms.market_key = latest.market_key
                 LIMIT 1
            ) AS from_backfilled
       FROM latest
       JOIN games g ON g.internal_game_id = latest.internal_game_id
      ORDER BY g.scheduled_start_utc DESC`,
    [player_id]
  );
  const rowsByMarket = new Map<string, Array<{
    game_date_utc: string; canonical_closing_point: number; player_stat_value: number;
    outcome: RealLineOutcome; margin: number; coverage_label: 'complete' | 'single_book';
    is_backfilled_historical: boolean;
  }>>();
  for (const r of q.rows as any[]) {
    const mk = r.market_key as string;
    const arr = rowsByMarket.get(mk) ?? [];
    arr.push({
      game_date_utc: r.scheduled_start_utc.toISOString(),
      canonical_closing_point: Number(r.canonical_closing_point),
      player_stat_value: Number(r.player_stat_value),
      outcome: r.outcome as RealLineOutcome,
      margin: Number(r.margin),
      coverage_label: r.coverage_state as 'complete' | 'single_book',
      is_backfilled_historical: r.from_backfilled === true,
    });
    rowsByMarket.set(mk, arr);
  }
  const today = new Date().toISOString().slice(0, 10);
  let affected = 0;
  for (const [market_key, games] of rowsByMarket) {
    for (const window_type of ['L5', 'L10', 'L20', 'season'] as const) {
      const w = computeRealLineWindow(window_type, games);
      // Governor V1-5 revise: NEVER relabel unresolved_closing_consensus.
      // The schema (line 82 of migration 20260711140008_real_line_windows.sql)
      // types coverage_label as the unrestricted enum, so all five values
      // are legitimately admitted. Written as-is.
      const wr = await tx.query(
        `INSERT INTO real_line_windows
           (internal_player_id, market_key, reference_date, window_type,
            requested_n, eligible_n, incomplete,
            over_count, under_count, push_count, over_rate,
            avg_margin, median_margin, avg_stat_value, median_stat_value,
            current_streak_direction, current_streak_length,
            coverage_label, computation_version, computed_at)
         VALUES ($1::uuid,$2,$3::date,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18::coverage_label,$19::int, now())
         ON CONFLICT (internal_player_id, market_key, reference_date, window_type, computation_version)
         DO UPDATE SET
           requested_n = EXCLUDED.requested_n,
           eligible_n = EXCLUDED.eligible_n,
           incomplete = EXCLUDED.incomplete,
           over_count = EXCLUDED.over_count,
           under_count = EXCLUDED.under_count,
           push_count = EXCLUDED.push_count,
           over_rate = EXCLUDED.over_rate,
           avg_margin = EXCLUDED.avg_margin,
           median_margin = EXCLUDED.median_margin,
           avg_stat_value = EXCLUDED.avg_stat_value,
           median_stat_value = EXCLUDED.median_stat_value,
           current_streak_direction = EXCLUDED.current_streak_direction,
           current_streak_length = EXCLUDED.current_streak_length,
           coverage_label = EXCLUDED.coverage_label,
           computed_at = now(),
           updated_at = now()`,
        [
          player_id, market_key, today, window_type,
          w.requested_n, w.eligible_n, w.incomplete,
          w.over_count, w.under_count, w.push_count, w.over_rate,
          w.avg_margin, w.median_margin, w.avg_stat_value, w.median_stat_value,
          w.current_streak_direction, w.current_streak_length,
          w.coverage_label,
          V1_5_COMPUTATION_VERSION,
        ]
      );
      if ((wr.rowCount ?? 0) !== 1) {
        throw new Error(
          `V1-5 recomputation writer: real_line_windows write affected ` +
          `${wr.rowCount ?? 0} rows for grain=(${player_id},${market_key},${today},${window_type}, v=${V1_5_COMPUTATION_VERSION}); expected 1. Rolling back.`
        );
      }
      affected += 1;
    }
  }
  return affected;
}

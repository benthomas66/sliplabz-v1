// V1-4b Phase B correction — canonical closing point computation & persistence.
//
// Authority:
//   Complete spec §7.10.2 (unique-modal selection rule)
//   Odds sub-spec §18.4 (no synthetic point, no interpolation, no averaging)
//   V1-4b Phase B governor revise (2026-07-13):
//     canonical selection MUST operate at (internal_game_id,
//     internal_player_id, market_key) with quotes from ALL eligible
//     books grouped together — NEVER per (event, bookmaker, market).
//
// This module replaces the canonical-write block previously embedded in
// src/seed/orchestrator/persistHistoricalSnapshot.ts. The persist path
// writes source_closing_quotes per (event, bookmaker, market). This
// module reads those rows across books and computes the canonical row
// at the correct grain.
//
// Two entry points:
//   * `computeCanonicalRows` — pure. Groups quotes by (game, player, market)
//     and computes one CanonicalRow per group. Callable in unit tests.
//   * `deleteAndReplaceCanonicalClosingPointsFromDb` — transactional
//     persistence helper. Loads source_closing_quotes from the hosted DB
//     for a given set of games (or all games if game_ids is null), deletes
//     existing canonical_closing_points, and inserts the correctly-computed
//     rows. Uses a single Client wrapped in a BEGIN/COMMIT block so a mid-
//     write connection loss ROLLBACKs to the pre-correction state.
//
// The persistence writer is intentionally delete-and-replace for the V1-4b
// pre-launch initial seed, per governor authorization. Post-launch, a
// forward-fix would append rows at a bumped `computation_version` and mark
// the prior version superseded via a follow-up ticket.

import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { withTransaction, type Tx } from '../../db/transaction.js';
import type { SliplabzPool } from '../../db/connection.js';
import { selectCanonicalClosingPoint } from '../../lines/canonicalClosingPoint.js';
import type { CanonicalClosingPointResult } from '../../lines/canonicalClosingPoint.js';

/** One source_closing_quote at the resolution grain the canonical writer
 *  cares about. Aligned with the schema of source_closing_quotes. */
export interface CanonicalInputQuote {
  readonly internal_game_id: string;
  readonly internal_player_id: string;
  readonly market_key: string;
  readonly bookmaker_key: string;
  readonly source_class: 'sportsbook' | 'dfs_pickem' | 'unknown';
  readonly close_capture_state: 'eligible' | 'close_capture_stale' | 'no_snapshot';
  readonly closing_point: number | null;
  readonly close_boundary_utc: string;
}

/** One computed canonical row. */
export interface CanonicalRow {
  readonly internal_game_id: string;
  readonly internal_player_id: string;
  readonly market_key: string;
  readonly selection: CanonicalClosingPointResult;
  readonly close_boundary_utc: string;
}

/**
 * Group the input quotes by (internal_game_id, internal_player_id,
 * market_key) and compute one CanonicalRow per non-empty group. This is
 * PURE — no I/O.
 *
 * Load-bearing: quotes for DIFFERENT bookmakers on the same
 * (game, player, market) MUST be passed together so `selectCanonicalClosingPoint`
 * can count each point across the eligible sportsbook set.
 */
export function computeCanonicalRows(
  quotes: ReadonlyArray<CanonicalInputQuote>
): ReadonlyArray<CanonicalRow> {
  const groups = new Map<string, CanonicalInputQuote[]>();
  for (const q of quotes) {
    const key = `${q.internal_game_id}|${q.internal_player_id}|${q.market_key}`;
    const arr = groups.get(key) ?? [];
    arr.push(q);
    groups.set(key, arr);
  }
  const rows: CanonicalRow[] = [];
  for (const [key, group] of groups) {
    const [game_id, player_id, market_key] = key.split('|') as [string, string, string];
    const selection = selectCanonicalClosingPoint(
      group.map((q) => ({
        bookmaker_key: q.bookmaker_key,
        source_class: q.source_class,
        close_capture_state: q.close_capture_state,
        closing_point: q.closing_point,
      }))
    );
    // Use the earliest close_boundary_utc observed for the group. All quotes
    // for a (game, player, market) at the seed run share a boundary, so this
    // is deterministic.
    const boundary = group
      .map((q) => q.close_boundary_utc)
      .reduce((a, b) => (a < b ? a : b));
    rows.push(Object.freeze({
      internal_game_id: game_id,
      internal_player_id: player_id,
      market_key,
      selection,
      close_boundary_utc: boundary,
    }));
  }
  return Object.freeze(rows);
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

export interface DeleteAndReplaceInput {
  /** When provided, restrict the correction to source quotes for these
   *  internal_game_ids. Pass null to correct the entire canonical table. */
  readonly restrict_to_internal_game_ids: ReadonlyArray<string> | null;
  /** Bump this above 1 to mark corrected rows for downstream audit. The
   *  V1-4b Phase B correction uses computation_version=2. */
  readonly computation_version: number;
}

export interface DeleteAndReplaceResult {
  readonly deleted: number;
  readonly inserted: number;
  readonly skipped_no_selection: number;
  readonly counts_by_selection_method: Readonly<Record<string, number>>;
  readonly counts_by_coverage_label: Readonly<Record<string, number>>;
}

/**
 * Load source_closing_quotes from the hosted DB, compute canonical rows at
 * the correct grain, and delete-and-replace `canonical_closing_points`.
 *
 * Runs the DELETE and every batch INSERT inside a SINGLE BEGIN/COMMIT so a
 * mid-write connection loss ROLLBACKs to the pre-correction state. Uses a
 * dedicated pg.PoolClient checked out from `pool` for the transaction (no
 * idle window between statements — Supabase's session pooler cannot kill it
 * because it's continuously in-use).
 *
 * Governor-authorized delete-and-replace policy for V1-4b's pre-launch
 * initial seed. See report for the audit-trail explanation.
 */
export async function deleteAndReplaceCanonicalClosingPointsFromDb(
  pool: SliplabzPool,
  input: DeleteAndReplaceInput
): Promise<DeleteAndReplaceResult> {
  // V1-OP-8b Option A: thin withTransaction wrapper over the extracted
  // in-transaction body. Existing callers keep one transaction per call.
  return withTransaction(pool, (tx) => deleteAndReplaceCanonicalClosingPointsInTx(tx, input));
}

/**
 * V1-OP-8b (Option A). In-transaction body of the canonical delete-and-replace.
 *
 * Runs entirely on a CALLER-SUPPLIED `Tx` and opens NO transaction of its own.
 *
 * IMPORTANT (correctness, not style): the `source_closing_quotes` READ also
 * goes through the same `Tx`. Inside a game-level transaction the quotes were
 * written moments earlier and are NOT yet visible to a separate pool
 * connection; reading through the tx is what makes canonical selection see
 * them. For the standalone wrapper this is equivalent — the read still happens
 * before the DELETE, against the same data — and it is strictly more
 * consistent (read and write share one snapshot).
 *
 * The selection math (`computeCanonicalRows`), the DELETE/INSERT statements,
 * their batching, and the returned counters are IDENTICAL to the
 * pre-extraction body; only transaction ownership moves to the caller.
 */
export async function deleteAndReplaceCanonicalClosingPointsInTx(
  tx: Tx,
  input: DeleteAndReplaceInput
): Promise<DeleteAndReplaceResult> {
  // 1. Read source_closing_quotes across ALL required games — through the tx.
  const params: unknown[] = [];
  const filter = input.restrict_to_internal_game_ids === null
    ? ''
    : ` WHERE internal_game_id = ANY($1::uuid[])`;
  if (input.restrict_to_internal_game_ids !== null) params.push(input.restrict_to_internal_game_ids);
  const q = await tx.query(
    `SELECT internal_game_id::text AS internal_game_id,
            internal_player_id::text AS internal_player_id,
            market_key, bookmaker_key, source_class, close_capture_state,
            closing_point, close_boundary_utc::text AS close_boundary_utc
       FROM source_closing_quotes${filter}`,
    params
  );
  const quotes: CanonicalInputQuote[] = (q.rows as Array<{
    internal_game_id: string; internal_player_id: string;
    market_key: string; bookmaker_key: string;
    source_class: 'sportsbook' | 'dfs_pickem' | 'unknown';
    close_capture_state: 'eligible' | 'close_capture_stale' | 'no_snapshot';
    closing_point: string | number | null;
    close_boundary_utc: string;
  }>).map((r) => ({
    internal_game_id: r.internal_game_id,
    internal_player_id: r.internal_player_id,
    market_key: r.market_key,
    bookmaker_key: r.bookmaker_key,
    source_class: r.source_class,
    close_capture_state: r.close_capture_state,
    closing_point: r.closing_point === null ? null : Number(r.closing_point),
    close_boundary_utc: r.close_boundary_utc,
  }));

  // 2. Compute canonical rows (pure).
  const canonicalRows = computeCanonicalRows(quotes);

  // 3. Filter to rows that produce a non-null point OR are tied/no_eligible.
  //    The schema CHECK admits all four selection_method values; we persist
  //    all of them for the correction.
  const persistable = canonicalRows;

  // Aggregate counters for the report.
  const counts_by_selection_method: Record<string, number> = {};
  const counts_by_coverage_label: Record<string, number> = {};
  let skipped_no_selection = 0;
  for (const r of persistable) {
    counts_by_selection_method[r.selection.selection_method] =
      (counts_by_selection_method[r.selection.selection_method] ?? 0) + 1;
    counts_by_coverage_label[r.selection.coverage_label] =
      (counts_by_coverage_label[r.selection.coverage_label] ?? 0) + 1;
    if (r.selection.canonical_closing_point === null &&
        r.selection.selection_method !== 'tied_no_unique_mode' &&
        r.selection.selection_method !== 'no_eligible_source') {
      skipped_no_selection += 1;
    }
  }

  // 4. Delete-and-replace on the caller's transaction.
  let inserted = 0;
  let deleted = 0;
  {
    const del = input.restrict_to_internal_game_ids === null
      ? await tx.query(`DELETE FROM canonical_closing_points`)
      : await tx.query(
          `DELETE FROM canonical_closing_points WHERE internal_game_id = ANY($1::uuid[])`,
          [input.restrict_to_internal_game_ids]
        );
    deleted = del.rowCount ?? 0;

    // Multi-row INSERTs in batches of 500. Each row = 10 params.
    const BATCH = 500;
    for (let i = 0; i < persistable.length; i += BATCH) {
      const chunk = persistable.slice(i, i + BATCH);
      if (chunk.length === 0) continue;
      const values: string[] = [];
      const bParams: unknown[] = [];
      let pIdx = 1;
      for (const r of chunk) {
        values.push(`($${pIdx++},$${pIdx++},$${pIdx++},$${pIdx++},$${pIdx++},$${pIdx++},$${pIdx++},$${pIdx++},$${pIdx++},$${pIdx++},$${pIdx++})`);
        bParams.push(
          randomUUID(),
          r.internal_game_id, r.internal_player_id, r.market_key,
          r.selection.selection_method, r.selection.canonical_closing_point,
          r.selection.total_eligible_sportsbook_count,
          r.selection.sportsbook_count_at_selected_point,
          r.selection.coverage_label, r.close_boundary_utc,
          input.computation_version,
        );
      }
      const sql = `INSERT INTO canonical_closing_points
        (canonical_closing_point_id, internal_game_id, internal_player_id,
         market_key, selection_method, canonical_closing_point,
         total_eligible_sportsbook_count, sportsbook_count_at_selected_point,
         coverage_label, close_boundary_utc, computation_version)
        VALUES ${values.join(',')}`;
      const ins = await tx.query(sql, bParams);
      inserted += ins.rowCount ?? 0;
    }
  }

  return Object.freeze({
    deleted,
    inserted,
    skipped_no_selection,
    counts_by_selection_method: Object.freeze(counts_by_selection_method),
    counts_by_coverage_label: Object.freeze(counts_by_coverage_label),
  });
}

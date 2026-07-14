// V1-5 governor ledger #1 — multi-grain movement / lifecycle batch driver.
//
// Walks prior/current snapshot offerings per (event, book, market, player,
// side, point) grain, calls `detectGrainMovement` per grain, persists
// `movement_events`, and drives `observed_line_lifecycle` writes through
// `transitionPresence`.
//
// LOAD-BEARING invariants:
//   * `requires_new_lifecycle_row` from `transitionPresence` triggers an
//     INSERT at (same grain, generation + 1). The PRIOR generation is
//     NEVER mutated. Enforced by the schema's UNIQUE (grain, generation)
//     and by our SELECT-for-max-generation query at write time.
//   * Point transitions across grains produce `point_removed` on the old
//     grain PLUS `point_added` on the new grain. When the same (book,
//     market, player, side) has EXACTLY ONE prior grain with the removed
//     point AND EXACTLY ONE new grain with the added point, we also emit
//     a linked `point_changed` event (the "unambiguous" case per §13.2).
//   * A FAILED poll never advances confirmed-removal (transitionPresence
//     enforces).
//   * A single BEGIN/COMMIT scopes each event's writes so partial state
//     is never visible.

import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { withTransaction } from '../../db/transaction.js';
import type { SliplabzPool } from '../../db/connection.js';
import { detectGrainMovement, type MovementEventOutput, type SnapshotContext, type SnapshotOffering } from '../../lines/movement.js';
import { transitionPresence, type PresenceTransitionResult } from '../../lines/confirmedRemoval.js';
import type { SourcePresenceState, OutcomeSide } from '../../shared/enums.js';

/**
 * Grain key that identifies a lifecycle-relevant tuple. Two offerings map
 * to the SAME grain iff every one of these fields matches.
 */
export interface LifecycleGrainKey {
  readonly internal_game_id: string;
  readonly internal_player_id: string;
  readonly market_key: string;
  readonly bookmaker_key: string;
  readonly side: OutcomeSide;
  readonly point: number;
}

/**
 * Extended offering shape the batch driver consumes. Every offering must
 * carry its game / player identity plus its snapshot id — so movement
 * events can trace back to the raw evidence.
 */
export interface BatchOffering extends SnapshotOffering {
  readonly internal_game_id: string;
}

export interface MovementLifecycleBatchInput {
  readonly current_ctx: SnapshotContext;
  readonly prior_offerings: ReadonlyArray<BatchOffering>;
  readonly current_offerings: ReadonlyArray<BatchOffering>;
  /** Optional prior context — carrying whether the prior poll produced
   *  offerings, which affects side_added confidence per §13. */
  readonly prior_ctx: SnapshotContext | null;
  /** True when the event is no longer pregame-eligible (§13.3). */
  readonly event_has_started: boolean;
  /** True when the entire source or market feed failed. */
  readonly source_or_market_unavailable: boolean;
}

export interface MovementLifecycleBatchResult {
  readonly movement_events_persisted: number;
  readonly lifecycle_rows_inserted: number;
  readonly lifecycle_rows_updated: number;
  readonly new_generations_inserted: number;
  readonly newly_confirmed_removed: number;
  readonly linked_point_changed_emitted: number;
}

function grainKey(k: LifecycleGrainKey): string {
  return `${k.internal_game_id}|${k.internal_player_id}|${k.market_key}|${k.bookmaker_key}|${k.side}|${k.point}`;
}

/**
 * Batch driver entry. Persists inside a single transaction. Idempotent
 * behavior for movement_events is achieved by the (prior_snapshot_id,
 * current_snapshot_id, bookmaker_key, market_key, side, point) grain
 * matching the movement_events UNIQUE constraint (added by V1-4).
 */
export async function runMovementLifecycleBatch(
  pool: SliplabzPool,
  input: MovementLifecycleBatchInput
): Promise<MovementLifecycleBatchResult> {
  // Build grain maps.
  const priorByGrain = new Map<string, BatchOffering>();
  const currentByGrain = new Map<string, BatchOffering>();
  const bookMarketPlayerSideKey = (o: BatchOffering) =>
    `${o.internal_game_id}|${o.internal_player_id ?? ''}|${o.market_key}|${o.bookmaker_key}|${o.side}`;
  // Also index by (book, market, player, side) so we can identify unambiguous
  // point transitions.
  const priorByBMPS = new Map<string, BatchOffering[]>();
  const currentByBMPS = new Map<string, BatchOffering[]>();

  for (const o of input.prior_offerings) {
    if (o.internal_player_id === null) continue;
    const gk: LifecycleGrainKey = {
      internal_game_id: o.internal_game_id,
      internal_player_id: o.internal_player_id,
      market_key: o.market_key,
      bookmaker_key: o.bookmaker_key,
      side: o.side,
      point: o.point,
    };
    priorByGrain.set(grainKey(gk), o);
    const bmpsKey = bookMarketPlayerSideKey(o);
    const arr = priorByBMPS.get(bmpsKey) ?? [];
    arr.push(o); priorByBMPS.set(bmpsKey, arr);
  }
  for (const o of input.current_offerings) {
    if (o.internal_player_id === null) continue;
    const gk: LifecycleGrainKey = {
      internal_game_id: o.internal_game_id,
      internal_player_id: o.internal_player_id,
      market_key: o.market_key,
      bookmaker_key: o.bookmaker_key,
      side: o.side,
      point: o.point,
    };
    currentByGrain.set(grainKey(gk), o);
    const bmpsKey = bookMarketPlayerSideKey(o);
    const arr = currentByBMPS.get(bmpsKey) ?? [];
    arr.push(o); currentByBMPS.set(bmpsKey, arr);
  }
  const allGrains = new Set<string>();
  for (const k of priorByGrain.keys()) allGrains.add(k);
  for (const k of currentByGrain.keys()) allGrains.add(k);

  let movement_events_persisted = 0;
  let lifecycle_rows_inserted = 0;
  let lifecycle_rows_updated = 0;
  let new_generations_inserted = 0;
  let newly_confirmed_removed = 0;
  let linked_point_changed_emitted = 0;

  await withTransaction(pool, async (tx) => {
    // 1. Per-grain movement detection.
    for (const key of allGrains) {
      const prior = priorByGrain.get(key) ?? null;
      const current = currentByGrain.get(key) ?? null;
      const events = detectGrainMovement(
        prior,
        current,
        input.prior_ctx,
        input.current_ctx
      );
      for (const e of events) {
        // Skip 'unchanged' — persisting every no-op would bloat.
        if (e.movement_type === 'unchanged') continue;
        const ins = await persistMovement(tx, e, input.current_ctx.market_snapshot_id, input.prior_ctx?.market_snapshot_id ?? null);
        if (ins) movement_events_persisted += 1;
      }
    }

    // 2. Unambiguous point-transition linking. When ONE prior grain at
    // (book, market, player, side) has a point removed and ONE current
    // grain at same (book, market, player, side) has a different point
    // added, emit a linked point_changed event capturing the delta.
    for (const bmps of new Set([...priorByBMPS.keys(), ...currentByBMPS.keys()])) {
      const priorArr = priorByBMPS.get(bmps) ?? [];
      const currentArr = currentByBMPS.get(bmps) ?? [];
      // A "removed" grain is one whose (bmps, point) has NO current match.
      const removedPoints = priorArr
        .filter((p) => !currentArr.some((c) => c.point === p.point))
        .map((p) => p.point);
      const addedPoints = currentArr
        .filter((c) => !priorArr.some((p) => p.point === c.point))
        .map((c) => c.point);
      if (removedPoints.length === 1 && addedPoints.length === 1) {
        // Unambiguous — link them.
        const priorOff = priorArr.find((p) => p.point === removedPoints[0])!;
        const currentOff = currentArr.find((c) => c.point === addedPoints[0])!;
        const linked: MovementEventOutput = Object.freeze({
          movement_type: 'point_changed',
          bookmaker_key: currentOff.bookmaker_key,
          market_key: currentOff.market_key,
          internal_player_id: currentOff.internal_player_id ?? null,
          side: currentOff.side,
          point: currentOff.point,
          prior_snapshot_id: input.prior_ctx?.market_snapshot_id ?? null,
          current_snapshot_id: input.current_ctx.market_snapshot_id,
          prior_offering_id: priorOff.market_offering_id,
          current_offering_id: currentOff.market_offering_id,
          prior_point: priorOff.point,
          current_point: currentOff.point,
          prior_over_price: priorOff.side === 'over' ? priorOff.raw_price_american : null,
          current_over_price: currentOff.side === 'over' ? currentOff.raw_price_american : null,
          prior_under_price: priorOff.side === 'under' ? priorOff.raw_price_american : null,
          current_under_price: currentOff.side === 'under' ? currentOff.raw_price_american : null,
          prior_provider_last_update: priorOff.provider_last_update,
          current_provider_last_update: currentOff.provider_last_update,
          confidence: 'high',
        });
        const ok = await persistMovement(
          tx, linked, input.current_ctx.market_snapshot_id, input.prior_ctx?.market_snapshot_id ?? null
        );
        if (ok) linked_point_changed_emitted += 1;
      }
    }

    // 3. Lifecycle per-grain state machine. For each grain observed EITHER
    // in prior or current, drive transitionPresence and persist lifecycle.
    for (const key of allGrains) {
      const prior = priorByGrain.get(key) ?? null;
      const current = currentByGrain.get(key) ?? null;
      const template = current ?? prior!;
      const grain: LifecycleGrainKey = {
        internal_game_id: template.internal_game_id,
        internal_player_id: template.internal_player_id!,
        market_key: template.market_key,
        bookmaker_key: template.bookmaker_key,
        side: template.side,
        point: template.point,
      };
      // Load the latest lifecycle row for the grain (max generation).
      const latest = await tx.query(
        `SELECT observed_line_lifecycle_id, presence_state,
                consecutive_omission_count, lifecycle_generation
           FROM observed_line_lifecycle
          WHERE internal_game_id=$1 AND internal_player_id=$2
            AND market_key=$3 AND bookmaker_key=$4
            AND side=$5 AND point=$6
          ORDER BY lifecycle_generation DESC
          LIMIT 1`,
        [grain.internal_game_id, grain.internal_player_id, grain.market_key,
         grain.bookmaker_key, grain.side, grain.point]
      );
      const prev = (latest.rows[0] ?? null) as {
        observed_line_lifecycle_id: string;
        presence_state: SourcePresenceState;
        consecutive_omission_count: number;
        lifecycle_generation: number;
      } | null;

      // Feed the state machine.
      const result: PresenceTransitionResult = transitionPresence({
        prior_state: prev?.presence_state ?? 'present',
        prior_consecutive_omission_count: prev?.consecutive_omission_count ?? 0,
        current_poll_succeeded: input.current_ctx.poll_succeeded,
        present_in_current_poll: current !== null,
        event_has_started: input.event_has_started,
        source_or_market_unavailable: input.source_or_market_unavailable,
      });
      if (result.newly_confirmed_removed) newly_confirmed_removed += 1;

      if (prev === null) {
        // First observation for this grain — INSERT at generation 1.
        // Only when the current poll observed the offering.
        if (current !== null) {
          await tx.query(
            `INSERT INTO observed_line_lifecycle
               (internal_game_id, internal_player_id, market_key, bookmaker_key,
                side, point, provenance,
                first_observed_offering_id, first_observed_at,
                current_offering_id, current_observed_at,
                presence_state, consecutive_omission_count, lifecycle_generation)
             VALUES ($1,$2,$3,$4,$5,$6,'self_observed',$7,now(),$7,now(),$8,$9,1)`,
            [grain.internal_game_id, grain.internal_player_id, grain.market_key,
             grain.bookmaker_key, grain.side, grain.point,
             current.market_offering_id,
             result.next_state, result.next_consecutive_omission_count]
          );
          lifecycle_rows_inserted += 1;
        }
      } else if (result.requires_new_lifecycle_row) {
        // REAPPEARANCE after confirmed_removed → insert generation + 1;
        // never mutate the frozen previous row.
        await tx.query(
          `INSERT INTO observed_line_lifecycle
             (internal_game_id, internal_player_id, market_key, bookmaker_key,
              side, point, provenance,
              first_observed_offering_id, first_observed_at,
              current_offering_id, current_observed_at,
              presence_state, consecutive_omission_count, lifecycle_generation)
           VALUES ($1,$2,$3,$4,$5,$6,'self_observed',$7,now(),$7,now(),
                   $8,0,$9)`,
          [grain.internal_game_id, grain.internal_player_id, grain.market_key,
           grain.bookmaker_key, grain.side, grain.point,
           current!.market_offering_id,
           'present', prev.lifecycle_generation + 1]
        );
        new_generations_inserted += 1;
      } else {
        // UPDATE the existing generation row. Never walks backward.
        await tx.query(
          `UPDATE observed_line_lifecycle SET
             presence_state = $2,
             consecutive_omission_count = $3,
             current_offering_id = COALESCE($4, current_offering_id),
             current_observed_at = CASE WHEN $4 IS NOT NULL THEN now() ELSE current_observed_at END,
             updated_at = now()
           WHERE observed_line_lifecycle_id = $1`,
          [prev.observed_line_lifecycle_id, result.next_state,
           result.next_consecutive_omission_count,
           current?.market_offering_id ?? null]
        );
        lifecycle_rows_updated += 1;
      }
    }
  });

  return Object.freeze({
    movement_events_persisted, lifecycle_rows_inserted, lifecycle_rows_updated,
    new_generations_inserted, newly_confirmed_removed, linked_point_changed_emitted,
  });
}

/**
 * Persist a movement event. The `movement_events` table has no UNIQUE
 * constraint (each detected transition is an atomic append), so idempotency
 * is the driver-caller's responsibility: call `runMovementLifecycleBatch`
 * exactly once per (prior_snapshot, current_snapshot) pair. A caller that
 * needs replay-safe semantics should pre-check via
 * `SELECT count(*) FROM movement_events WHERE current_snapshot_id = ...`
 * before invoking.
 */
async function persistMovement(
  tx: { query: (sql: string, params?: unknown[]) => Promise<{ rowCount: number | null; rows: unknown[] }> },
  e: MovementEventOutput,
  current_snapshot_id: string,
  prior_snapshot_id: string | null
): Promise<boolean> {
  const id = randomUUID();
  const res = await tx.query(
    `INSERT INTO movement_events
       (movement_event_id, movement_type,
        internal_player_id,
        bookmaker_key, market_key, side, point,
        prior_snapshot_id, current_snapshot_id,
        prior_offering_id, current_offering_id,
        prior_point, current_point,
        prior_over_price, current_over_price,
        prior_under_price, current_under_price,
        prior_provider_last_update, current_provider_last_update,
        confidence)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)`,
    [
      id, e.movement_type,
      e.internal_player_id,
      e.bookmaker_key, e.market_key, e.side, e.point,
      prior_snapshot_id ?? e.prior_snapshot_id, current_snapshot_id,
      e.prior_offering_id, e.current_offering_id,
      e.prior_point, e.current_point,
      e.prior_over_price, e.current_over_price,
      e.prior_under_price, e.current_under_price,
      e.prior_provider_last_update, e.current_provider_last_update,
      e.confidence,
    ]
  );
  return (res.rowCount ?? 0) > 0;
}

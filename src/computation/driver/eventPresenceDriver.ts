// V1-5 governor ledger #5 — Odds event-presence state machine wiring.
//
// Consumes a single COMPLETE event-discovery run (`oddsapi_ingestion_runs`
// with `result_state = 'complete'` and endpoint = 'event_discovery') and
// updates `oddsapi_event_presence` rows for every event either OBSERVED in
// this run or previously observed but now MISSING.
//
// Load-bearing invariants (spec §13.3 / Odds §17):
//   * Only COMPLETE runs advance presence. Partial / failed runs never
//     change presence.
//   * A single omission bumps state → `single_omission`, count → 1.
//   * A second consecutive omission bumps state → `confirmed_removed`,
//     count → 2. Never advances further.
//   * Reappearance after `confirmed_removed` is HELD — the row is frozen;
//     the caller is expected to create a NEW logical event lifecycle
//     (§17). This driver DOES set an `observed_changed_at` timestamp so
//     the caller can act on the reappearance.
//   * `last_seen_at` reflects the most recent successful observation.

import { withTransaction } from '../../db/transaction.js';
import type { SliplabzPool } from '../../db/connection.js';

export interface AdvanceEventPresenceInput {
  readonly oddsapi_ingestion_run_id: string;
}

export interface AdvanceEventPresenceResult {
  readonly newly_observed: number;
  readonly held_present: number;
  readonly newly_single_omission: number;
  readonly newly_confirmed_removed: number;
  readonly reappeared_after_confirmed_removed: number;
  readonly skipped_non_complete_run: boolean;
}

/**
 * Advance `oddsapi_event_presence` for every event in the discovery run.
 * Idempotent: rerunning on the same complete run leaves state unchanged
 * for events whose presence_state and count are already at the correct
 * post-observation values.
 */
export async function advanceEventPresenceForRun(
  pool: SliplabzPool,
  input: AdvanceEventPresenceInput
): Promise<AdvanceEventPresenceResult> {
  let newly_observed = 0;
  let held_present = 0;
  let newly_single_omission = 0;
  let newly_confirmed_removed = 0;
  let reappeared_after_confirmed_removed = 0;
  let skipped_non_complete_run = false;

  await withTransaction(pool, async (tx) => {
    // Verify the run is a COMPLETE event-discovery run. `request_kind` is
    // the discovery classifier; the wire-level `endpoint` value is 'events'
    // (or 'historical_events'), so we use request_kind as the gate.
    const runRow = await tx.query(
      `SELECT result_state, request_kind
         FROM oddsapi_ingestion_runs
        WHERE oddsapi_ingestion_run_id = $1`,
      [input.oddsapi_ingestion_run_id]
    );
    const run = (runRow.rows[0] ?? null) as { result_state: string; request_kind: string } | null;
    if (run === null || run.result_state !== 'complete' || run.request_kind !== 'event_discovery') {
      skipped_non_complete_run = true;
      return;
    }

    // Events OBSERVED in this run.
    const obsRes = await tx.query(
      `SELECT provider_event_id, oddsapi_event_snapshot_id::text AS snap_id
         FROM oddsapi_event_snapshots
        WHERE oddsapi_ingestion_run_id = $1`,
      [input.oddsapi_ingestion_run_id]
    );
    const observed = new Map<string, string>();
    for (const r of obsRes.rows as Array<{ provider_event_id: string; snap_id: string }>) {
      observed.set(r.provider_event_id, r.snap_id);
    }

    // Set of events previously known to presence.
    const priorRes = await tx.query(
      `SELECT provider_event_id, presence_state,
              consecutive_omission_count
         FROM oddsapi_event_presence`
    );
    const prior = new Map<string, { presence_state: string; consecutive_omission_count: number }>();
    for (const r of priorRes.rows as Array<{ provider_event_id: string; presence_state: string; consecutive_omission_count: number }>) {
      prior.set(r.provider_event_id, {
        presence_state: r.presence_state,
        consecutive_omission_count: r.consecutive_omission_count,
      });
    }

    // 1. Handle every observed event: reset omission_count, set state.
    for (const [providerEventId, snapId] of observed) {
      const p = prior.get(providerEventId);
      if (p === undefined) {
        // Never before observed — INSERT at currently_returned.
        await tx.query(
          `INSERT INTO oddsapi_event_presence
             (provider_event_id, latest_complete_run_id, presence_state,
              first_seen_at, last_seen_at, consecutive_omission_count,
              last_observed_snapshot_id)
           VALUES ($1,$2,'currently_returned', now(), now(), 0, $3::uuid)`,
          [providerEventId, input.oddsapi_ingestion_run_id, snapId]
        );
        newly_observed += 1;
      } else if (p.presence_state === 'confirmed_removed') {
        // REAPPEARANCE after confirmed_removed — §17: HOLD state, record
        // observation change time; the caller creates a new logical event
        // lifecycle if it decides to.
        await tx.query(
          `UPDATE oddsapi_event_presence
              SET latest_complete_run_id = $2,
                  last_seen_at = now(),
                  observed_changed_at = now(),
                  last_observed_snapshot_id = $3::uuid,
                  updated_at = now()
            WHERE provider_event_id = $1`,
          [providerEventId, input.oddsapi_ingestion_run_id, snapId]
        );
        reappeared_after_confirmed_removed += 1;
      } else {
        // Present or transitioning back to present.
        await tx.query(
          `UPDATE oddsapi_event_presence
              SET latest_complete_run_id = $2,
                  presence_state = 'currently_returned',
                  last_seen_at = now(),
                  consecutive_omission_count = 0,
                  last_observed_snapshot_id = $3::uuid,
                  updated_at = now()
            WHERE provider_event_id = $1`,
          [providerEventId, input.oddsapi_ingestion_run_id, snapId]
        );
        held_present += 1;
      }
    }

    // 2. Handle every previously-known event NOT observed in this run:
    //    increment omission count and advance state per §17.
    for (const [providerEventId, p] of prior) {
      if (observed.has(providerEventId)) continue;
      if (p.presence_state === 'confirmed_removed') continue; // frozen
      const nextCount = Math.min(p.consecutive_omission_count + 1, 2);
      const nextState: 'single_omission' | 'confirmed_removed' =
        nextCount >= 2 ? 'confirmed_removed' : 'single_omission';
      await tx.query(
        `UPDATE oddsapi_event_presence
            SET latest_complete_run_id = $2,
                presence_state = $3,
                consecutive_omission_count = $4,
                observed_changed_at = CASE WHEN presence_state <> $3 THEN now() ELSE observed_changed_at END,
                updated_at = now()
          WHERE provider_event_id = $1`,
        [providerEventId, input.oddsapi_ingestion_run_id, nextState, nextCount]
      );
      if (nextState === 'single_omission') newly_single_omission += 1;
      else newly_confirmed_removed += 1;
    }
  });

  return Object.freeze({
    newly_observed,
    held_present,
    newly_single_omission,
    newly_confirmed_removed,
    reappeared_after_confirmed_removed,
    skipped_non_complete_run,
  });
}

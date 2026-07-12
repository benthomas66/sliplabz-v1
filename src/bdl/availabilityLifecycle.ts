// Availability lifecycle per BDL §20 and complete spec §9.10.
//
// Authority:
//   BDL sub-spec §13 (current player availability is a live-only feed)
//   BDL sub-spec §20 (interpretation states — currently_reported,
//     not_returned_latest_complete_snapshot, stale_feed,
//     unresolved_player, source_unavailable)
//   Complete spec §9.10 availability
//   Ticket V1-2 hard invariant: absence from an availability feed never
//     becomes "healthy"; it is its own lifecycle state.
//
// Transitions:
//   * A player observed in a COMPLETE snapshot → `currently_reported`.
//   * A player previously reported, absent in a later COMPLETE snapshot →
//     `not_returned_latest_complete_snapshot`.
//   * The reconciliation layer maps `unresolved_player` for provider IDs
//     that never mapped to an internal player.
//   * `stale_feed` is set by a monitor observing the last completed pull's
//     age exceeding a freshness threshold (not implemented in V1-2 — the
//     interpretation is available for later tickets to set).
//   * `source_unavailable` is set when the provider itself was unavailable
//     across several attempts (not implemented in V1-2).

import type {
  AvailabilityCurrentState,
  IngestionRunClosed,
} from './types.js';
import type { AvailabilityInterpretationState } from '../shared/enums.js';
import { runMayAdvanceWatermark } from './ingestionRun.js';

export interface AvailabilityObservation {
  readonly provider_player_id: string;
  readonly internal_player_id: string | null;
  readonly source_status: string;
  readonly source_comment: string;
  readonly source_return_date_text: string;
  readonly latest_snapshot_id: string;
  readonly observed_at: string;
}

export interface ReconcileAvailabilityInput {
  readonly run: IngestionRunClosed;
  readonly observations: ReadonlyArray<AvailabilityObservation>;
  readonly current_states: ReadonlyArray<AvailabilityCurrentState>;
}

export interface AvailabilityReconciliation {
  readonly next_states: ReadonlyArray<AvailabilityCurrentState>;
  readonly newly_absent: ReadonlyArray<string>;
  readonly newly_present: ReadonlyArray<string>;
  readonly advanced: boolean;
  readonly refusal_reason: string | null;
}

/**
 * Reconcile a completed availability snapshot with the current per-player
 * lifecycle state. Absence transitions fire ONLY on completed runs.
 *
 * Deterministic ordering:
 *   * next_states sorted by provider_player_id.
 *   * newly_absent / newly_present sorted ascending.
 */
export function reconcileAvailability(
  input: ReconcileAvailabilityInput
): AvailabilityReconciliation {
  if (!runMayAdvanceWatermark(input.run)) {
    return {
      next_states: input.current_states,
      newly_absent: [],
      newly_present: [],
      advanced: false,
      refusal_reason: `run completion_state = ${input.run.completion_state}; availability state unchanged`,
    };
  }
  const observed_by_id = new Map(
    input.observations.map((o) => [o.provider_player_id, o])
  );
  const current_by_id = new Map(
    input.current_states.map((s) => [s.provider_player_id, s])
  );

  const next_states = new Map<string, AvailabilityCurrentState>();
  const newly_absent: string[] = [];
  const newly_present: string[] = [];

  // Present in this snapshot → currently_reported.
  for (const [pid, obs] of observed_by_id) {
    const prior = current_by_id.get(pid);
    const interpretation: AvailabilityInterpretationState =
      obs.internal_player_id === null ? 'unresolved_player' : 'currently_reported';
    const first_seen_at = prior?.first_seen_at ?? obs.observed_at;
    const prior_state = prior?.interpretation_state ?? null;
    const observed_changed_at =
      prior === undefined
        ? obs.observed_at
        : prior.latest_source_status !== obs.source_status ||
          prior.latest_source_comment !== obs.source_comment ||
          prior.latest_source_return_date_text !== obs.source_return_date_text
        ? obs.observed_at
        : prior.observed_changed_at;
    next_states.set(
      pid,
      Object.freeze({
        provider_player_id: pid,
        internal_player_id: obs.internal_player_id,
        interpretation_state: interpretation,
        first_seen_at,
        last_seen_at: obs.observed_at,
        observed_changed_at,
        last_absent_at: prior?.last_absent_at ?? null,
        latest_complete_run_id: input.run.bdl_ingestion_run_id,
        latest_snapshot_id: obs.latest_snapshot_id,
        latest_source_status: obs.source_status,
        latest_source_comment: obs.source_comment,
        latest_source_return_date_text: obs.source_return_date_text,
      })
    );
    if (
      prior_state !== null &&
      prior_state === 'not_returned_latest_complete_snapshot'
    ) {
      newly_present.push(pid);
    }
  }

  // Previously reported and absent in this complete snapshot.
  for (const prior of input.current_states) {
    if (observed_by_id.has(prior.provider_player_id)) continue;
    const already_absent =
      prior.interpretation_state ===
      'not_returned_latest_complete_snapshot';
    next_states.set(
      prior.provider_player_id,
      Object.freeze({
        provider_player_id: prior.provider_player_id,
        internal_player_id: prior.internal_player_id,
        interpretation_state: 'not_returned_latest_complete_snapshot',
        first_seen_at: prior.first_seen_at,
        last_seen_at: prior.last_seen_at,
        observed_changed_at: prior.observed_changed_at,
        last_absent_at: already_absent
          ? prior.last_absent_at
          : input.run.completed_at,
        latest_complete_run_id: input.run.bdl_ingestion_run_id,
        latest_snapshot_id: prior.latest_snapshot_id,
        latest_source_status: prior.latest_source_status,
        latest_source_comment: prior.latest_source_comment,
        latest_source_return_date_text: prior.latest_source_return_date_text,
      })
    );
    if (!already_absent) {
      newly_absent.push(prior.provider_player_id);
    }
  }

  const next_sorted = Array.from(next_states.values()).sort((a, b) =>
    a.provider_player_id.localeCompare(b.provider_player_id)
  );

  return {
    next_states: Object.freeze(next_sorted),
    newly_absent: Object.freeze(newly_absent.sort()) as ReadonlyArray<string>,
    newly_present: Object.freeze(newly_present.sort()) as ReadonlyArray<string>,
    advanced: true,
    refusal_reason: null,
  };
}

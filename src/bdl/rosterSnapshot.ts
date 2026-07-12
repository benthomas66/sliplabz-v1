// Active-player roster snapshot semantics.
//
// Authority:
//   BDL sub-spec §12A.4 (a player missing from a later completed snapshot
//     is marked not_seen_active; NEVER deleted; NEVER on partial pull)
//   BDL sub-spec §12A.7 (roster-snapshot storage)
//   Complete spec §9.8 (active players)
//   Ticket V1-2 hard invariant: active-player disappearance is only
//     meaningful after a COMPLETE active-player snapshot; a failed snapshot
//     must not mark anyone not_seen_active.
//
// This module reconciles a single ingestion run's set of observed provider
// player IDs with the currently tracked presence table. It NEVER produces
// updates when the run's completion_state is not 'complete'.

import type {
  ActivePlayerPresence,
  IngestionRunClosed,
} from './types.js';
import { runMayAdvanceWatermark } from './ingestionRun.js';

export interface ReconcilePresenceInput {
  readonly run: IngestionRunClosed;
  readonly observed_provider_player_ids: ReadonlyArray<string>;
  /**
   * Team ID observed alongside each player. Used to detect intra-run
   * roster_team_change events. Provided as a parallel array (index-aligned
   * with observed_provider_player_ids); pass an empty array to skip.
   */
  readonly observed_provider_team_ids: ReadonlyArray<string | null>;
  readonly current_presence: ReadonlyArray<ActivePlayerPresence>;
}

export interface PresenceReconciliation {
  readonly next_presence: ReadonlyArray<ActivePlayerPresence>;
  /**
   * Provider player IDs newly marked `not_seen_active` by THIS
   * reconciliation. Empty when the run cannot advance presence.
   */
  readonly newly_marked_not_seen: ReadonlyArray<string>;
  /**
   * Provider player IDs whose team assignment changed compared to the
   * previous presence record. Fires `roster_team_change` invalidation
   * events downstream.
   */
  readonly team_changes: ReadonlyArray<{
    readonly provider_player_id: string;
    readonly prior_provider_team_id: string | null;
    readonly new_provider_team_id: string | null;
  }>;
  readonly advanced: boolean;
  readonly refusal_reason: string | null;
}

/**
 * Reconcile a completed active-player snapshot with the current presence.
 *
 * When the run's completion_state !== 'complete', no presence transitions
 * are produced. This is the hard invariant.
 *
 * Deterministic ordering:
 *   * `newly_marked_not_seen` is returned in ascending provider_player_id order.
 *   * `team_changes` in ascending provider_player_id order.
 *   * `next_presence` in ascending provider_player_id order.
 */
export function reconcileActivePlayerPresence(
  input: ReconcilePresenceInput
): PresenceReconciliation {
  if (!runMayAdvanceWatermark(input.run)) {
    // Absent players cannot be marked not_seen_active by a partial pull.
    return {
      next_presence: input.current_presence,
      newly_marked_not_seen: [],
      team_changes: [],
      advanced: false,
      refusal_reason: `run completion_state = ${input.run.completion_state}; presence unchanged`,
    };
  }

  const observed_ids = new Set(input.observed_provider_player_ids);
  const observed_teams = new Map<string, string | null>();
  for (let i = 0; i < input.observed_provider_player_ids.length; i += 1) {
    const pid = input.observed_provider_player_ids[i]!;
    observed_teams.set(
      pid,
      i < input.observed_provider_team_ids.length
        ? input.observed_provider_team_ids[i] ?? null
        : null
    );
  }

  const prior_by_id = new Map<string, ActivePlayerPresence>();
  for (const p of input.current_presence) {
    prior_by_id.set(p.provider_player_id, p);
  }

  const now = input.run.completed_at;

  const next_by_id = new Map<string, ActivePlayerPresence>();
  const newly_marked_not_seen: string[] = [];
  const team_changes: PresenceReconciliation['team_changes'] = [];

  // Handle observed players.
  for (const pid of observed_ids) {
    const prior = prior_by_id.get(pid);
    const observed_team = observed_teams.get(pid) ?? null;
    if (prior === undefined) {
      next_by_id.set(
        pid,
        Object.freeze({
          provider_player_id: pid,
          latest_complete_run_id: input.run.bdl_ingestion_run_id,
          present_in_latest_complete: true,
          first_seen_active_at: now,
          last_seen_active_at: now,
          last_marked_not_seen_at: null,
          latest_provider_team_id: observed_team,
        })
      );
      continue;
    }
    // Team-change detection.
    if (
      prior.latest_provider_team_id !== observed_team &&
      prior.latest_provider_team_id !== null // silent first-fill isn't a change
    ) {
      (team_changes as Array<PresenceReconciliation['team_changes'][number]>).push({
        provider_player_id: pid,
        prior_provider_team_id: prior.latest_provider_team_id,
        new_provider_team_id: observed_team,
      });
    }
    next_by_id.set(
      pid,
      Object.freeze({
        provider_player_id: pid,
        latest_complete_run_id: input.run.bdl_ingestion_run_id,
        present_in_latest_complete: true,
        first_seen_active_at: prior.first_seen_active_at ?? now,
        last_seen_active_at: now,
        last_marked_not_seen_at: prior.last_marked_not_seen_at,
        latest_provider_team_id: observed_team,
      })
    );
  }

  // Handle players present in prior but absent from this complete run.
  for (const prior of input.current_presence) {
    if (observed_ids.has(prior.provider_player_id)) continue;
    // Absence-driven transition. Only fires when the current run is complete.
    const already_absent = !prior.present_in_latest_complete;
    next_by_id.set(
      prior.provider_player_id,
      Object.freeze({
        provider_player_id: prior.provider_player_id,
        latest_complete_run_id: input.run.bdl_ingestion_run_id,
        present_in_latest_complete: false,
        first_seen_active_at: prior.first_seen_active_at,
        last_seen_active_at: prior.last_seen_active_at,
        last_marked_not_seen_at: already_absent
          ? prior.last_marked_not_seen_at
          : now,
        latest_provider_team_id: prior.latest_provider_team_id,
      })
    );
    if (!already_absent) {
      newly_marked_not_seen.push(prior.provider_player_id);
    }
  }

  const next_sorted = Array.from(next_by_id.values()).sort((a, b) =>
    a.provider_player_id.localeCompare(b.provider_player_id)
  );

  newly_marked_not_seen.sort();
  const team_changes_sorted = (
    team_changes as Array<PresenceReconciliation['team_changes'][number]>
  )
    .slice()
    .sort((a, b) => a.provider_player_id.localeCompare(b.provider_player_id));

  return {
    next_presence: Object.freeze(next_sorted),
    newly_marked_not_seen: Object.freeze(
      newly_marked_not_seen
    ) as ReadonlyArray<string>,
    team_changes: Object.freeze(team_changes_sorted),
    advanced: true,
    refusal_reason: null,
  };
}

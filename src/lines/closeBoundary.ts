// Close-boundary evaluation per complete spec §7.10.
//
// Authority:
//   Complete spec §7.10 (three-branch rule):
//     1. verified actual game start when available;
//     2. otherwise scheduled tip with the approved grace rule;
//     3. never an abandoned start time for a postponed / rescheduled game.
//   Complete spec §7.10 (close does not occur against an abandoned postponed tip).
//   Ticket V1-4 hard invariants:
//     - Close boundary evaluated against the correct start-time authority;
//     - Postponed game's abandoned tip NEVER produces a close;
//     - Delayed starts handle the boundary per spec — NEVER by copying
//       scheduled into actual.

import type {
  CloseBoundarySource,
  GameStatus,
} from '../shared/enums.js';

/** Approved scheduled-tip grace (seconds). Config-backed; see spec §7.10. */
export const SCHEDULED_START_GRACE_SECONDS = 15 * 60;

export interface CloseBoundaryInput {
  readonly internal_game_id: string;
  readonly scheduled_start_utc: string;
  readonly actual_start_utc: string | null;
  readonly status: GameStatus;
}

export interface CloseBoundaryResult {
  readonly internal_game_id: string;
  readonly boundary_source: CloseBoundarySource;
  readonly close_boundary_utc: string | null;
  readonly grace_seconds: number | null;
  readonly observed_game_status: GameStatus;
}

/**
 * Compute the close boundary for one game.
 *
 * Rules:
 *   * status `postponed` or `canceled` → `postponed_no_close`, boundary NULL.
 *     Even if `actual_start_utc` is set for some clerical reason, an
 *     abandoned tip does not produce a close (§7.10 explicit).
 *   * status not postponed/canceled AND `actual_start_utc IS NOT NULL` →
 *     `verified_actual_start`. Boundary = `actual_start_utc`.
 *   * Otherwise → `scheduled_with_grace`. Boundary = scheduled_start_utc +
 *     `SCHEDULED_START_GRACE_SECONDS`. Delayed starts flow through this branch
 *     as long as the game is not postponed. `actual_start_utc` is NEVER
 *     back-copied from scheduled.
 */
export function evaluateCloseBoundary(
  input: CloseBoundaryInput
): CloseBoundaryResult {
  const status = input.status;
  if (status === 'postponed' || status === 'canceled') {
    return {
      internal_game_id: input.internal_game_id,
      boundary_source: 'postponed_no_close',
      close_boundary_utc: null,
      grace_seconds: null,
      observed_game_status: status,
    };
  }
  if (input.actual_start_utc !== null) {
    return {
      internal_game_id: input.internal_game_id,
      boundary_source: 'verified_actual_start',
      close_boundary_utc: input.actual_start_utc,
      grace_seconds: null,
      observed_game_status: status,
    };
  }
  const scheduled_ms = new Date(input.scheduled_start_utc).getTime();
  if (!Number.isFinite(scheduled_ms)) {
    throw new Error(
      `evaluateCloseBoundary: invalid scheduled_start_utc ${input.scheduled_start_utc}`
    );
  }
  const with_grace_ms = scheduled_ms + SCHEDULED_START_GRACE_SECONDS * 1000;
  return {
    internal_game_id: input.internal_game_id,
    boundary_source: 'scheduled_with_grace',
    close_boundary_utc: new Date(with_grace_ms).toISOString(),
    grace_seconds: SCHEDULED_START_GRACE_SECONDS,
    observed_game_status: status,
  };
}

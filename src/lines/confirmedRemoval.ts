// Confirmed-removal semantics per Odds §17 and complete spec §13.3.
//
// Authority:
//   Odds sub-spec §17 (disappearance: not_returned_in_snapshot vs
//     confirmed_removed; two consecutive successful omissions confirm)
//   Complete spec §13.3 (states: not returned in latest successful snapshot,
//     confirmed removed, source unavailable, market unavailable, event no
//     longer pregame, failed latest poll)
//   Ticket V1-4 hard invariant: a source removed once vs twice follows the
//     spec's confirmed-removal policy; removed offerings are never walked
//     backward into existence.
//
// V1-4 correction (governor review):
//   When prior_state = 'confirmed_removed' and the offering REAPPEARS in a
//   successful poll (present_in_current_poll = true), the state machine
//   HOLDS the row at confirmed_removed and returns `requires_new_lifecycle_row
//   = true`. The write path is required to insert a NEW observed_line_lifecycle
//   row at (same grain, generation + 1) rather than mutating the existing
//   frozen row. Never present/0 for this transition — walking backward is
//   explicitly forbidden by §17.

import type { SourcePresenceState } from '../shared/enums.js';

export interface PresenceTransitionInput {
  /** Prior presence state for the (game, player, market, book, side, point) grain. */
  readonly prior_state: SourcePresenceState;
  readonly prior_consecutive_omission_count: number;
  /** True when the current poll was a successful (non-failed) poll. */
  readonly current_poll_succeeded: boolean;
  /** True when the offering appeared in the current successful poll. */
  readonly present_in_current_poll: boolean;
  /** True when the event has already started; no further disappearance
   *  updates apply after the event stops being pregame-eligible. */
  readonly event_has_started: boolean;
  /** True when the entire source or market feed failed for this poll. */
  readonly source_or_market_unavailable: boolean;
}

export interface PresenceTransitionResult {
  readonly next_state: SourcePresenceState;
  readonly next_consecutive_omission_count: number;
  /** True when THIS transition confirmed removal. */
  readonly newly_confirmed_removed: boolean;
  /**
   * True when the current-poll observation requires the write path to
   * insert a NEW observed_line_lifecycle row at generation + 1 rather than
   * mutating the existing row. True ONLY on the reappearance-after-confirmed
   * case. Every other transition sets this to false.
   */
  readonly requires_new_lifecycle_row: boolean;
  /** Documented reason for the transition. */
  readonly detail: string;
}

/**
 * Compute the next presence state given a prior state and the current poll's
 * outcome. Encodes the rules:
 *
 *   * A FAILED poll never advances confirmed-removal — the offering's
 *     absence is not observed.
 *   * A `source_or_market_unavailable` poll never advances confirmed-removal —
 *     Odds §17 explicit.
 *   * Presence resets `consecutive_omission_count` to 0 and returns to
 *     `present` — EXCEPT when the prior state is `confirmed_removed`. In
 *     that case the state HOLDS at confirmed_removed and the returned
 *     `requires_new_lifecycle_row` is true; the write layer creates a new
 *     lifecycle row at generation + 1 rather than walking the frozen row
 *     backward.
 *   * A single successful omission bumps the count to 1 and sets
 *     `single_omission`.
 *   * A second consecutive successful omission bumps the count to 2 and
 *     sets `confirmed_removed`. Never advances further.
 *   * An event that has already started freezes state (no further
 *     omission-driven confirmed_removed transitions after the event stops
 *     being pregame-eligible).
 */
export function transitionPresence(
  input: PresenceTransitionInput
): PresenceTransitionResult {
  if (!input.current_poll_succeeded || input.source_or_market_unavailable) {
    return {
      next_state: input.prior_state,
      next_consecutive_omission_count: input.prior_consecutive_omission_count,
      newly_confirmed_removed: false,
      requires_new_lifecycle_row: false,
      detail: 'failed_poll_or_source_unavailable: presence unchanged',
    };
  }
  if (input.present_in_current_poll) {
    // Reappearance branch. Split on prior state.
    if (input.prior_state === 'confirmed_removed') {
      // NEVER walk backward. Hold the row at confirmed_removed/2; signal to
      // the write layer that a NEW lifecycle row is required.
      return {
        next_state: 'confirmed_removed',
        next_consecutive_omission_count: 2,
        newly_confirmed_removed: false,
        requires_new_lifecycle_row: true,
        detail:
          'reappearance after confirmed_removed: prior row FROZEN; caller must insert generation + 1',
      };
    }
    return {
      next_state: 'present',
      next_consecutive_omission_count: 0,
      newly_confirmed_removed: false,
      requires_new_lifecycle_row: false,
      detail: 'offering observed in current successful poll',
    };
  }
  if (input.event_has_started) {
    return {
      next_state: input.prior_state,
      next_consecutive_omission_count: input.prior_consecutive_omission_count,
      newly_confirmed_removed: false,
      requires_new_lifecycle_row: false,
      detail: 'event has started; disappearance state frozen',
    };
  }
  // Offering absent AND poll succeeded AND event pregame.
  const next_count = input.prior_consecutive_omission_count + 1;
  if (next_count >= 2 && input.prior_state !== 'confirmed_removed') {
    return {
      next_state: 'confirmed_removed',
      next_consecutive_omission_count: 2,
      newly_confirmed_removed: true,
      requires_new_lifecycle_row: false,
      detail: 'two consecutive successful omissions',
    };
  }
  if (next_count === 1) {
    return {
      next_state: 'single_omission',
      next_consecutive_omission_count: 1,
      newly_confirmed_removed: false,
      requires_new_lifecycle_row: false,
      detail: 'single successful omission',
    };
  }
  // prior_state already confirmed_removed; hold.
  return {
    next_state: 'confirmed_removed',
    next_consecutive_omission_count: 2,
    newly_confirmed_removed: false,
    requires_new_lifecycle_row: false,
    detail: 'already confirmed_removed; state held',
  };
}

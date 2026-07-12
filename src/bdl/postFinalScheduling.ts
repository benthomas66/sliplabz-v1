// Post-final reconciliation scheduling per BDL §12C.4.
//
// Authority:
//   BDL sub-spec §12C.4 (V1 reconciliation schedule)
//   BDL sub-spec §16A (default cadence for player statistics)
//   Complete spec §9.9 post-final reconciliation
//   Ticket V1-2 requirement: post-final reconciliation scheduling
//
// Contract: when a game transitions to `final`, this module produces the
// schedule of follow-up pulls. The V1-5 (or an operator queue processor)
// consumes them via the post_final_reconciliation_schedule table. This
// ticket does NOT authorize external cron infrastructure.

import type {
  PostFinalReconciliationEntry,
} from './types.js';
import type { PostFinalReconciliationKind } from '../shared/enums.js';

export interface BuildScheduleInput {
  readonly internal_game_id: string;
  readonly provider_game_id: string;
  readonly triggering_observation_id: string;
  /** UTC ISO-8601 timestamp of the transition-to-final observation. */
  readonly final_observed_at: string;
}

/**
 * Approximate offsets per BDL §12C.4:
 *   1. first_post_final: pull immediately after final detection (0 sec)
 *   2. t_plus_2h:         ~2 hours after final
 *   3. next_day:          following calendar day, floored to 12:00 UTC of
 *                         the next date after the observation
 *   4. season_sweep:      +7 days as a durable durable-run reminder;
 *                         the season-sweep job also runs on its own cadence
 *                         and will happily reconcile any game regardless
 *                         of this entry.
 */
const OFFSET_SECONDS: Record<
  Exclude<PostFinalReconciliationKind, 'season_sweep'>,
  number
> = {
  first_post_final: 0,
  t_plus_2h: 2 * 60 * 60,
  next_day: 24 * 60 * 60,
};

const SEASON_SWEEP_OFFSET_SECONDS = 7 * 24 * 60 * 60;

/**
 * Build the deterministic schedule for a single game becoming final.
 * Entries are returned in due_at ascending order.
 */
export function buildPostFinalSchedule(
  input: BuildScheduleInput
): ReadonlyArray<PostFinalReconciliationEntry> {
  const t0 = new Date(input.final_observed_at).getTime();
  if (!Number.isFinite(t0)) {
    throw new Error(
      `buildPostFinalSchedule: invalid final_observed_at ${input.final_observed_at}`
    );
  }
  const at = (offset_s: number): string =>
    new Date(t0 + offset_s * 1000).toISOString();

  const entries: PostFinalReconciliationEntry[] = [
    {
      internal_game_id: input.internal_game_id,
      provider_game_id: input.provider_game_id,
      kind: 'first_post_final',
      due_at: at(OFFSET_SECONDS.first_post_final),
      triggering_observation_id: input.triggering_observation_id,
    },
    {
      internal_game_id: input.internal_game_id,
      provider_game_id: input.provider_game_id,
      kind: 't_plus_2h',
      due_at: at(OFFSET_SECONDS.t_plus_2h),
      triggering_observation_id: input.triggering_observation_id,
    },
    {
      internal_game_id: input.internal_game_id,
      provider_game_id: input.provider_game_id,
      kind: 'next_day',
      due_at: at(OFFSET_SECONDS.next_day),
      triggering_observation_id: input.triggering_observation_id,
    },
    {
      internal_game_id: input.internal_game_id,
      provider_game_id: input.provider_game_id,
      kind: 'season_sweep',
      due_at: at(SEASON_SWEEP_OFFSET_SECONDS),
      triggering_observation_id: input.triggering_observation_id,
    },
  ];
  entries.sort(
    (a, b) => new Date(a.due_at).getTime() - new Date(b.due_at).getTime()
  );
  return Object.freeze(entries.map((e) => Object.freeze(e)));
}

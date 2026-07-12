// Seed slice watermark advancement.
//
// Authority:
//   Complete spec §3.6 (per-slice coverage; missing gaps stay missing)
//   Odds sub-spec §14.11.1 (unsupported / unapproved slices remain
//     forward-only and are labeled missing)
//   Ticket §8b required behavior: idempotent, resumable seed runs;
//     interrupted runs never report false completeness.
//   Ticket §8b required tests: idempotent rerun; interrupted-run resumes
//     without false completeness.
//
// Rules:
//   1. Only a `complete` seed run may advance a slice watermark to
//      `complete` OR to `no_coverage_available`.
//   2. Any other completion state (partial / aborted_credit_budget / failed_*)
//      may advance the slice to `partial_in_progress` and update the
//      `resume_cursor`, but MUST NOT set `completed_at` or claim the slice
//      is finished.
//   3. A watermark already at `complete` or `no_coverage_available` may
//      NOT rewind; a re-run at those slices is idempotent (schema-side the
//      caller can UPSERT ON CONFLICT DO NOTHING).

import { runMayAdvanceSliceWatermark } from './seedRun.js';
import type { SeedRunClosed } from './types.js';

export type SliceCoverageState =
  | 'attempted_none'
  | 'partial_in_progress'
  | 'complete'
  | 'no_coverage_available'
  | 'rights_not_authorized';

export interface SliceWatermarkView {
  readonly slate_date: string;
  readonly market_key: string;
  readonly bookmaker_key: string;
  readonly slice_coverage_state: SliceCoverageState;
  readonly events_attempted: number;
  readonly events_admitted: number;
  readonly events_stale_rejected: number;
  readonly events_no_snapshot: number;
  readonly resume_cursor: Readonly<Record<string, unknown>>;
  readonly first_attempted_at: string | null;
  readonly last_attempted_at: string | null;
  readonly completed_at: string | null;
  readonly completed_by_run_id: string | null;
}

export interface SliceAttemptDelta {
  readonly slate_date: string;
  readonly market_key: string;
  readonly bookmaker_key: string;
  readonly events_attempted: number;
  readonly events_admitted: number;
  readonly events_stale_rejected: number;
  readonly events_no_snapshot: number;
  readonly resume_cursor: Readonly<Record<string, unknown>>;
  readonly attempted_at: string;
  /**
   * Governor's coverage verdict for the slice AS OF this run:
   *   * `complete` — every eligible event probed and the run was `complete`.
   *   * `no_coverage_available` — provider returned no eligible offerings.
   *   * `rights_not_authorized` — governor did not authorize this slice.
   *   * `partial_in_progress` — everything else; leaves `completed_at` NULL.
   */
  readonly proposed_state: SliceCoverageState;
}

export interface AdvanceSliceResult {
  readonly next: SliceWatermarkView;
  readonly advanced_to_complete: boolean;
  readonly refusal_reason: string | null;
}

/**
 * Compute the next watermark view given a prior view (or a fresh row when
 * one does not yet exist) and this run's attempt delta for the slice.
 *
 * `run` is the seed-run record; only its `completion_state` matters here.
 */
export function advanceSliceWatermark(
  prior: SliceWatermarkView | null,
  delta: SliceAttemptDelta,
  run: SeedRunClosed
): AdvanceSliceResult {
  if (prior !== null) {
    // Guard against slate/market/book mismatch: caller error.
    if (
      prior.slate_date !== delta.slate_date ||
      prior.market_key !== delta.market_key ||
      prior.bookmaker_key !== delta.bookmaker_key
    ) {
      return {
        next: prior,
        advanced_to_complete: false,
        refusal_reason: 'delta grain does not match prior watermark grain',
      };
    }
    // No rewind past complete / no_coverage_available.
    if (
      prior.slice_coverage_state === 'complete' ||
      prior.slice_coverage_state === 'no_coverage_available'
    ) {
      return {
        next: prior,
        advanced_to_complete: false,
        refusal_reason: `slice already at terminal state ${prior.slice_coverage_state}`,
      };
    }
  }

  const merged_events_attempted =
    (prior?.events_attempted ?? 0) + delta.events_attempted;
  const merged_events_admitted =
    (prior?.events_admitted ?? 0) + delta.events_admitted;
  const merged_events_stale_rejected =
    (prior?.events_stale_rejected ?? 0) + delta.events_stale_rejected;
  const merged_events_no_snapshot =
    (prior?.events_no_snapshot ?? 0) + delta.events_no_snapshot;

  // Rights-not-authorized slices short-circuit — no live probing occurs.
  if (delta.proposed_state === 'rights_not_authorized') {
    return {
      next: Object.freeze({
        slate_date: delta.slate_date,
        market_key: delta.market_key,
        bookmaker_key: delta.bookmaker_key,
        slice_coverage_state: 'rights_not_authorized',
        events_attempted: merged_events_attempted,
        events_admitted: merged_events_admitted,
        events_stale_rejected: merged_events_stale_rejected,
        events_no_snapshot: merged_events_no_snapshot,
        resume_cursor: Object.freeze({ ...(prior?.resume_cursor ?? {}) }),
        first_attempted_at: prior?.first_attempted_at ?? null,
        last_attempted_at: delta.attempted_at,
        completed_at: null,
        completed_by_run_id: null,
      }),
      advanced_to_complete: false,
      refusal_reason: null,
    };
  }

  const may_complete = runMayAdvanceSliceWatermark(run);
  const wants_terminal =
    delta.proposed_state === 'complete' ||
    delta.proposed_state === 'no_coverage_available';

  if (may_complete && wants_terminal) {
    return {
      next: Object.freeze({
        slate_date: delta.slate_date,
        market_key: delta.market_key,
        bookmaker_key: delta.bookmaker_key,
        slice_coverage_state: delta.proposed_state,
        events_attempted: merged_events_attempted,
        events_admitted: merged_events_admitted,
        events_stale_rejected: merged_events_stale_rejected,
        events_no_snapshot: merged_events_no_snapshot,
        resume_cursor: Object.freeze({ ...delta.resume_cursor }),
        first_attempted_at: prior?.first_attempted_at ?? delta.attempted_at,
        last_attempted_at: delta.attempted_at,
        completed_at: delta.attempted_at,
        completed_by_run_id: run.seed_run_id,
      }),
      advanced_to_complete: delta.proposed_state === 'complete',
      refusal_reason: null,
    };
  }

  // Everything else → partial_in_progress. `completed_at` STAYS NULL. This
  // is the "interrupted run never reports false completeness" invariant.
  return {
    next: Object.freeze({
      slate_date: delta.slate_date,
      market_key: delta.market_key,
      bookmaker_key: delta.bookmaker_key,
      slice_coverage_state: 'partial_in_progress',
      events_attempted: merged_events_attempted,
      events_admitted: merged_events_admitted,
      events_stale_rejected: merged_events_stale_rejected,
      events_no_snapshot: merged_events_no_snapshot,
      resume_cursor: Object.freeze({ ...delta.resume_cursor }),
      first_attempted_at: prior?.first_attempted_at ?? delta.attempted_at,
      last_attempted_at: delta.attempted_at,
      completed_at: null,
      completed_by_run_id: null,
    }),
    advanced_to_complete: false,
    refusal_reason:
      may_complete
        ? null
        : 'run.completion_state != complete: slice held at partial_in_progress',
  };
}

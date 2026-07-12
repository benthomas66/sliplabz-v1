// Seed-run lifecycle helpers (opens + closes).
//
// Authority:
//   Odds sub-spec §14.11 (V1 seed policy; provenance & time; credit budget)
//   Ticket §8b required behavior: idempotent, resumable seed runs and
//     per-slice coverage watermarks.
//
// The persistence side is implemented in
// src/seed/orchestrator/persistHistoricalSnapshot.ts. This module produces
// the row objects; the pipeline inserts them via the shared `pg` layer.

import type {
  SeedRunClosed,
  SeedRunOpen,
  SeedRunScope,
} from './types.js';

export interface OpenSeedRunInput {
  readonly seed_run_id: string;
  readonly scope: SeedRunScope;
  readonly started_at: string;
}

export function openSeedRun(input: OpenSeedRunInput): SeedRunOpen {
  return Object.freeze({
    seed_run_id: input.seed_run_id,
    scope: Object.freeze({
      run_kind: input.scope.run_kind,
      label: input.scope.label,
      credit_budget: input.scope.credit_budget,
      requested_market_keys: Object.freeze(
        input.scope.requested_market_keys.slice()
      ) as ReadonlyArray<string>,
      requested_bookmaker_keys: Object.freeze(
        input.scope.requested_bookmaker_keys.slice()
      ) as ReadonlyArray<string>,
      attempted_slate_dates: Object.freeze(
        input.scope.attempted_slate_dates.slice()
      ) as ReadonlyArray<string>,
    }),
    started_at: input.started_at,
    completion_state: 'running' as const,
    credits_observed_total: 0,
  });
}

export interface CloseSeedRunInput {
  readonly open: SeedRunOpen;
  readonly completed_at: string;
  readonly completion_state: SeedRunClosed['completion_state'];
  readonly failure_detail: string | null;
  readonly credits_observed_total: number;
  readonly events_probed: number;
  readonly events_admitted: number;
  readonly events_stale_rejected: number;
  readonly events_no_snapshot: number;
}

export function closeSeedRun(input: CloseSeedRunInput): SeedRunClosed {
  if ((input.completion_state as unknown) === 'running') {
    throw new Error(
      `closeSeedRun called with 'running'; use openSeedRun to build in-flight state`
    );
  }
  if (input.completed_at === '') {
    throw new Error('closeSeedRun requires a completed_at timestamp');
  }
  return Object.freeze({
    seed_run_id: input.open.seed_run_id,
    scope: input.open.scope,
    started_at: input.open.started_at,
    completed_at: input.completed_at,
    completion_state: input.completion_state,
    failure_detail: input.failure_detail,
    credits_observed_total: input.credits_observed_total,
    events_probed: input.events_probed,
    events_admitted: input.events_admitted,
    events_stale_rejected: input.events_stale_rejected,
    events_no_snapshot: input.events_no_snapshot,
  });
}

/**
 * Predicate governing whether this run may advance a per-slice watermark
 * (mirrors the V1-2 BDL rule: only `complete` may advance).
 */
export function runMayAdvanceSliceWatermark(run: SeedRunClosed): boolean {
  return run.completion_state === 'complete';
}

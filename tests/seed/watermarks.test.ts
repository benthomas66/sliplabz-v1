// Ticket §8b required tests covered here:
//   #13: idempotent rerun
//   #14: interrupted run resumes without false completeness
//
// Ticket §8b acceptance criterion: coverage and rights gaps remain missing
// and are reported (never estimated).

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  advanceSliceWatermark,
  type SliceWatermarkView,
} from '../../src/seed/watermarks.js';
import { closeSeedRun, openSeedRun } from '../../src/seed/seedRun.js';
import type { SeedRunClosed } from '../../src/seed/types.js';

function makeRun(
  state: SeedRunClosed['completion_state']
): SeedRunClosed {
  const open = openSeedRun({
    seed_run_id: `run-${state}`,
    started_at: '2026-07-12T00:00:00Z',
    scope: {
      run_kind: 'seed',
      label: 'test',
      credit_budget: 200,
      requested_market_keys: ['player_points'],
      requested_bookmaker_keys: ['draftkings'],
      attempted_slate_dates: ['2026-05-08'],
    },
  });
  return closeSeedRun({
    open,
    completed_at: '2026-07-12T00:01:00Z',
    completion_state: state,
    failure_detail: state === 'complete' ? null : 'test',
    credits_observed_total: 40,
    events_probed: 1,
    events_admitted: 1,
    events_stale_rejected: 0,
    events_no_snapshot: 0,
  });
}

const grain = {
  slate_date: '2026-05-08',
  market_key: 'player_points',
  bookmaker_key: 'draftkings',
} as const;

describe('seed slice watermarks (§3.6, §14.11.1)', () => {
  it('LOAD-BEARING #13 idempotent: a `complete` slice cannot be rewound by a second run', () => {
    const run = makeRun('complete');
    const first = advanceSliceWatermark(
      null,
      {
        ...grain,
        events_attempted: 1,
        events_admitted: 1,
        events_stale_rejected: 0,
        events_no_snapshot: 0,
        resume_cursor: {},
        attempted_at: '2026-07-12T00:00:30Z',
        proposed_state: 'complete',
      },
      run
    );
    assert.equal(first.advanced_to_complete, true);
    assert.equal(first.next.slice_coverage_state, 'complete');
    // Second run tries to advance the same slice — must refuse to rewind.
    const second = advanceSliceWatermark(
      first.next,
      {
        ...grain,
        events_attempted: 1,
        events_admitted: 1,
        events_stale_rejected: 0,
        events_no_snapshot: 0,
        resume_cursor: { page: 1 },
        attempted_at: '2026-07-12T00:05:00Z',
        proposed_state: 'partial_in_progress' as any,
      },
      run
    );
    assert.equal(second.advanced_to_complete, false);
    assert.notEqual(second.refusal_reason, null);
    assert.equal(second.next.slice_coverage_state, 'complete');
  });

  it('LOAD-BEARING #14 interrupted run: aborted_credit_budget → partial_in_progress; completed_at STAYS NULL', () => {
    const run = makeRun('aborted_credit_budget');
    const r = advanceSliceWatermark(
      null,
      {
        ...grain,
        events_attempted: 3,
        events_admitted: 1,
        events_stale_rejected: 0,
        events_no_snapshot: 0,
        resume_cursor: { cursor_id: 'evt_at_index_2' },
        attempted_at: '2026-07-12T00:03:00Z',
        proposed_state: 'complete',
      },
      run
    );
    // The run is NOT complete; the watermark is held at partial_in_progress.
    assert.equal(r.next.slice_coverage_state, 'partial_in_progress');
    assert.equal(r.next.completed_at, null);
    assert.equal(r.next.completed_by_run_id, null);
    assert.equal(r.advanced_to_complete, false);
    assert.notEqual(r.refusal_reason, null);
    assert.equal(r.next.resume_cursor.cursor_id, 'evt_at_index_2');
  });

  it('LOAD-BEARING #14 resume: a later complete run picks up the partial slice and advances to complete', () => {
    const aborted_run = makeRun('aborted_credit_budget');
    const first = advanceSliceWatermark(
      null,
      {
        ...grain,
        events_attempted: 3,
        events_admitted: 1,
        events_stale_rejected: 0,
        events_no_snapshot: 0,
        resume_cursor: { cursor_id: 'evt_at_index_2' },
        attempted_at: '2026-07-12T00:03:00Z',
        proposed_state: 'complete',
      },
      aborted_run
    );
    const complete_run = makeRun('complete');
    const second = advanceSliceWatermark(
      first.next,
      {
        ...grain,
        events_attempted: 5,
        events_admitted: 4,
        events_stale_rejected: 1,
        events_no_snapshot: 0,
        resume_cursor: { cursor_id: 'done' },
        attempted_at: '2026-07-12T00:10:00Z',
        proposed_state: 'complete',
      },
      complete_run
    );
    assert.equal(second.advanced_to_complete, true);
    assert.equal(second.next.slice_coverage_state, 'complete');
    assert.equal(second.next.completed_at, '2026-07-12T00:10:00Z');
    // Aggregate counters accumulated.
    assert.equal(second.next.events_attempted, 8);
    assert.equal(second.next.events_admitted, 5);
    assert.equal(second.next.events_stale_rejected, 1);
  });

  it('rights_not_authorized short-circuits and marks the slice regardless of run state', () => {
    const run = makeRun('complete');
    const r = advanceSliceWatermark(
      null,
      {
        ...grain,
        events_attempted: 0,
        events_admitted: 0,
        events_stale_rejected: 0,
        events_no_snapshot: 0,
        resume_cursor: {},
        attempted_at: '2026-07-12T00:00:00Z',
        proposed_state: 'rights_not_authorized',
      },
      run
    );
    assert.equal(r.next.slice_coverage_state, 'rights_not_authorized');
    // Rights-not-authorized is not "complete"; no terminal completed_at.
    assert.equal(r.next.completed_at, null);
    assert.equal(r.advanced_to_complete, false);
  });

  it('no_coverage_available terminal state also advances only on complete run', () => {
    const complete_run = makeRun('complete');
    const r = advanceSliceWatermark(
      null,
      {
        ...grain,
        events_attempted: 5,
        events_admitted: 0,
        events_stale_rejected: 0,
        events_no_snapshot: 5,
        resume_cursor: {},
        attempted_at: '2026-07-12T00:15:00Z',
        proposed_state: 'no_coverage_available',
      },
      complete_run
    );
    assert.equal(r.next.slice_coverage_state, 'no_coverage_available');
    assert.equal(r.next.completed_at, '2026-07-12T00:15:00Z');
  });
});

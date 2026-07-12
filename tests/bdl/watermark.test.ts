// Ticket §6 hard invariants covered here:
//   - Partial imports never advance completeness watermarks.
//   - failed active-player snapshot cannot advance watermark either.
//
// Ticket §6 requirement: complete-import watermarks per (endpoint, scope).

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { closeRun, openRun, runMayAdvanceWatermark } from '../../src/bdl/ingestionRun.js';
import { advanceWatermark, emptyWatermark } from '../../src/bdl/watermark.js';
import type { BdlEndpoint, BdlRunState } from '../../src/shared/enums.js';

function makeRun(state: BdlRunState, endpoint: BdlEndpoint = 'player_stats', scope = 'season=2026') {
  const open = openRun({
    bdl_ingestion_run_id: `run-${state}`,
    endpoint,
    query_scope_key: scope,
    started_at: '2026-07-11T12:00:00Z',
  });
  return closeRun({
    open,
    completed_at: '2026-07-11T12:05:00Z',
    page_count: 3,
    row_count: 30,
    cursor_chain_sent: [null, 'c1', 'c2'],
    cursor_chain_returned: ['c1', 'c2', null],
    http_status_last: 200,
    content_type_last: 'application/json',
    response_headers_last: {},
    completion_state: state,
    failure_detail: state === 'complete' ? null : 'test failure',
  });
}

describe('import-watermark advancement (BDL §19.4, complete spec §9.2)', () => {
  it('runMayAdvanceWatermark: only "complete" returns true', () => {
    const states: BdlRunState[] = [
      'complete',
      'partial_pagination',
      'failed_transport',
      'failed_authentication_or_access',
      'failed_invalid_request',
      'failed_schema',
      'failed_parse',
    ];
    for (const s of states) {
      const run = makeRun(s);
      assert.equal(
        runMayAdvanceWatermark(run),
        s === 'complete',
        `state ${s} eligibility wrong`
      );
    }
  });

  it('complete run on the matching scope advances the watermark', () => {
    const wm = emptyWatermark('player_stats', 'season=2026');
    const attempt = advanceWatermark(wm, makeRun('complete'));
    assert.equal(attempt.advanced, true);
    assert.equal(attempt.next.completed_at, '2026-07-11T12:05:00Z');
    assert.equal(attempt.next.completed_row_count, 30);
    assert.equal(attempt.next.previous_completed_at, null);
  });

  it('LOAD-BEARING: every non-complete state refuses to advance and preserves prior watermark', () => {
    const wm = emptyWatermark('player_stats', 'season=2026');
    const nonCompleteStates: BdlRunState[] = [
      'partial_pagination',
      'failed_transport',
      'failed_authentication_or_access',
      'failed_invalid_request',
      'failed_schema',
      'failed_parse',
    ];
    for (const s of nonCompleteStates) {
      const attempt = advanceWatermark(wm, makeRun(s));
      assert.equal(attempt.advanced, false, `state ${s} advanced watermark`);
      assert.equal(attempt.next.completed_at, null);
      assert.notEqual(attempt.refusal_reason, null);
    }
  });

  it('endpoint mismatch refuses to advance', () => {
    const wm = emptyWatermark('games', 'season=2026');
    const attempt = advanceWatermark(wm, makeRun('complete', 'player_stats'));
    assert.equal(attempt.advanced, false);
    assert.match(attempt.refusal_reason ?? '', /endpoint mismatch/i);
  });

  it('scope-key mismatch refuses to advance (separate watermarks per query scope)', () => {
    const wm = emptyWatermark('player_stats', 'season=2026');
    const attempt = advanceWatermark(
      wm,
      makeRun('complete', 'player_stats', 'game_ids=24752')
    );
    assert.equal(attempt.advanced, false);
    assert.match(attempt.refusal_reason ?? '', /query_scope_key mismatch/i);
  });

  it('newer complete run supersedes prior; prior state retained in previous_*', () => {
    let wm = emptyWatermark('player_stats', 'season=2026');
    const run1 = makeRun('complete');
    let attempt = advanceWatermark(wm, run1);
    wm = attempt.next;

    // Second run with a later completed_at.
    const open2 = openRun({
      bdl_ingestion_run_id: 'run-2',
      endpoint: 'player_stats',
      query_scope_key: 'season=2026',
      started_at: '2026-07-12T00:00:00Z',
    });
    const run2 = closeRun({
      open: open2,
      completed_at: '2026-07-12T00:05:00Z',
      page_count: 4,
      row_count: 40,
      cursor_chain_sent: [null, 'c1', 'c2', 'c3'],
      cursor_chain_returned: ['c1', 'c2', 'c3', null],
      http_status_last: 200,
      content_type_last: 'application/json',
      response_headers_last: {},
      completion_state: 'complete',
      failure_detail: null,
    });
    attempt = advanceWatermark(wm, run2);
    assert.equal(attempt.advanced, true);
    assert.equal(attempt.next.completed_at, '2026-07-12T00:05:00Z');
    assert.equal(attempt.next.previous_completed_at, '2026-07-11T12:05:00Z');
    assert.equal(attempt.next.previous_completed_by_run_id, run1.bdl_ingestion_run_id);
  });

  it('rewind refused: a "complete" run with an EARLIER completed_at cannot rewind the watermark', () => {
    let wm = emptyWatermark('player_stats', 'season=2026');
    const runLate = makeRun('complete');
    wm = advanceWatermark(wm, runLate).next;

    const open_early = openRun({
      bdl_ingestion_run_id: 'run-early',
      endpoint: 'player_stats',
      query_scope_key: 'season=2026',
      started_at: '2026-07-10T00:00:00Z',
    });
    const runEarly = closeRun({
      open: open_early,
      completed_at: '2026-07-10T00:05:00Z',
      page_count: 3,
      row_count: 20,
      cursor_chain_sent: [null],
      cursor_chain_returned: [null],
      http_status_last: 200,
      content_type_last: 'application/json',
      response_headers_last: {},
      completion_state: 'complete',
      failure_detail: null,
    });
    const attempt = advanceWatermark(wm, runEarly);
    assert.equal(attempt.advanced, false);
    assert.match(attempt.refusal_reason ?? '', /predates/i);
  });
});

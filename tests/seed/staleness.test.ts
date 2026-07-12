// Ticket §8b required tests covered here:
//   #3: snapshot returned within 10 minutes before requested boundary → eligible
//   #4: snapshot more than 10 minutes before close → close_capture_stale

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  CLOSE_CAPTURE_STALENESS_THRESHOLD_SECONDS,
  evaluateCloseCapture,
} from '../../src/seed/staleness.js';

describe('close-capture staleness (§7.10.1, §14.11.1)', () => {
  it('threshold is 10 minutes (product default; NOT loosenable in code)', () => {
    assert.equal(CLOSE_CAPTURE_STALENESS_THRESHOLD_SECONDS, 600);
  });

  it('LOAD-BEARING #3: 9 minutes before boundary → eligible', () => {
    const r = evaluateCloseCapture({
      requested_close_boundary_utc: '2026-05-08T23:00:00Z',
      returned_snapshot_ts: '2026-05-08T22:51:00Z',
    });
    assert.equal(r.close_capture_state, 'eligible');
    assert.equal(r.age_seconds_before_boundary, 9 * 60);
  });

  it('LOAD-BEARING #4: 15 minutes before boundary → close_capture_stale', () => {
    const r = evaluateCloseCapture({
      requested_close_boundary_utc: '2026-05-08T23:00:00Z',
      returned_snapshot_ts: '2026-05-08T22:45:00Z',
    });
    assert.equal(r.close_capture_state, 'close_capture_stale');
    assert.equal(r.age_seconds_before_boundary, 15 * 60);
  });

  it('exactly 10 minutes before boundary → eligible (boundary condition)', () => {
    const r = evaluateCloseCapture({
      requested_close_boundary_utc: '2026-05-08T23:00:00Z',
      returned_snapshot_ts: '2026-05-08T22:50:00Z',
    });
    assert.equal(r.close_capture_state, 'eligible');
    assert.equal(r.age_seconds_before_boundary, 10 * 60);
  });

  it('exactly 10 minutes + 1 second before → close_capture_stale', () => {
    const r = evaluateCloseCapture({
      requested_close_boundary_utc: '2026-05-08T23:00:00Z',
      returned_snapshot_ts: '2026-05-08T22:49:59Z',
    });
    assert.equal(r.close_capture_state, 'close_capture_stale');
  });

  it('snapshot AFTER boundary → close_capture_stale (negative age)', () => {
    const r = evaluateCloseCapture({
      requested_close_boundary_utc: '2026-05-08T23:00:00Z',
      returned_snapshot_ts: '2026-05-08T23:05:00Z',
    });
    assert.equal(r.close_capture_state, 'close_capture_stale');
    assert.equal(r.age_seconds_before_boundary, -5 * 60);
  });

  it('null snapshot ts → no_snapshot (not stale, not eligible)', () => {
    const r = evaluateCloseCapture({
      requested_close_boundary_utc: '2026-05-08T23:00:00Z',
      returned_snapshot_ts: null,
    });
    assert.equal(r.close_capture_state, 'no_snapshot');
    assert.equal(r.age_seconds_before_boundary, null);
  });
});

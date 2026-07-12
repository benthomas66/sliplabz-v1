// Ticket §8 required tests covered here:
//   Test #10: postponed event
//   Test #11: delayed start
//
// Ticket §8 acceptance criterion:
//   Close does not occur against an abandoned postponed tip.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  SCHEDULED_START_GRACE_SECONDS,
  evaluateCloseBoundary,
} from '../../src/lines/closeBoundary.js';

const fx = JSON.parse(
  readFileSync(
    new URL('../fixtures/lines/close-boundary-cases.json', import.meta.url),
    'utf8'
  )
);

describe('close boundary evaluation (spec §7.10)', () => {
  it('SCHEDULED_START_GRACE_SECONDS is 15 minutes (product default)', () => {
    assert.equal(SCHEDULED_START_GRACE_SECONDS, 900);
  });

  it('runs every fixture case with the expected branch', () => {
    for (const c of fx.cases) {
      const r = evaluateCloseBoundary({
        internal_game_id: c.internal_game_id,
        scheduled_start_utc: c.scheduled_start_utc,
        actual_start_utc: c.actual_start_utc,
        status: c.status,
      });
      assert.equal(
        r.boundary_source,
        c.expected_boundary_source,
        `case ${c.case_name}: boundary_source`
      );
      // Compare timestamps as instants (Date.parse) so canonical ISO
      // (2026-07-11T22:15:00.000Z) matches compact ISO fixture form (…22:15:00Z).
      if (c.expected_close_boundary_utc === null) {
        assert.equal(r.close_boundary_utc, null, `case ${c.case_name}: close_boundary_utc`);
      } else {
        assert.equal(
          Date.parse(r.close_boundary_utc!),
          Date.parse(c.expected_close_boundary_utc),
          `case ${c.case_name}: close_boundary_utc`
        );
      }
      if (c.expected_grace_seconds !== undefined) {
        assert.equal(
          r.grace_seconds,
          c.expected_grace_seconds,
          `case ${c.case_name}: grace_seconds`
        );
      }
    }
  });

  it('LOAD-BEARING: postponed game NEVER produces a close boundary, even with actual_start_utc set', () => {
    // Governor case: an abandoned postponed tip must not create a close.
    const r = evaluateCloseBoundary({
      internal_game_id: 'x',
      scheduled_start_utc: '2026-07-11T22:00:00Z',
      actual_start_utc: '2026-07-11T22:03:00Z',
      status: 'postponed',
    });
    assert.equal(r.boundary_source, 'postponed_no_close');
    assert.equal(r.close_boundary_utc, null);
  });

  it('LOAD-BEARING: delayed starts flow through scheduled_with_grace, NEVER by copying scheduled into actual', () => {
    const r = evaluateCloseBoundary({
      internal_game_id: 'x',
      scheduled_start_utc: '2026-07-11T22:00:00Z',
      actual_start_utc: null,
      status: 'live',
    });
    assert.equal(r.boundary_source, 'scheduled_with_grace');
    assert.equal(r.close_boundary_utc, '2026-07-11T22:15:00.000Z');
    assert.equal(r.grace_seconds, 900);
  });

  it('canceled game receives postponed_no_close (§7.10 abandoned tip rule)', () => {
    const r = evaluateCloseBoundary({
      internal_game_id: 'x',
      scheduled_start_utc: '2026-07-11T22:00:00Z',
      actual_start_utc: null,
      status: 'canceled',
    });
    assert.equal(r.boundary_source, 'postponed_no_close');
    assert.equal(r.close_boundary_utc, null);
  });

  it('invalid scheduled_start_utc throws (fixture guard)', () => {
    assert.throws(() =>
      evaluateCloseBoundary({
        internal_game_id: 'x',
        scheduled_start_utc: 'not-a-timestamp',
        actual_start_utc: null,
        status: 'scheduled',
      })
    );
  });
});

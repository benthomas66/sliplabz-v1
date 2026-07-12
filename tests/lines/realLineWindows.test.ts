// Ticket §8 required tests covered here:
//   Test #19: incomplete L10
//
// Ticket §8 acceptance criteria:
//   Coverage gaps stop streaks.
//   Actual n is preserved.
//   Pushes are separate.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { computeRealLineWindow } from '../../src/lines/realLineWindows.js';

const fx = JSON.parse(
  readFileSync(
    new URL('../fixtures/lines/real-line-window-cases.json', import.meta.url),
    'utf8'
  )
);

describe('real-line window aggregates (spec §7.13, §14.3-14.5)', () => {
  it('L5 complete window: eligible_n=5, incomplete=false, counts match', () => {
    const r = computeRealLineWindow('L5', fx.player_reverse_chron_complete);
    assert.equal(r.requested_n, 5);
    assert.equal(r.eligible_n, 5);
    assert.equal(r.incomplete, false);
    // First 5 outcomes in the fixture: over, over, under, under, over
    assert.equal(r.over_count, 3);
    assert.equal(r.under_count, 2);
    assert.equal(r.push_count, 0);
  });

  it('L10 complete window: exactly 10 eligible, incomplete=false, push count preserved', () => {
    const r = computeRealLineWindow('L10', fx.player_reverse_chron_complete);
    assert.equal(r.eligible_n, 10);
    assert.equal(r.incomplete, false);
    // First 10 outcomes: over, over, under, under, over, under, over, under, push, over
    assert.equal(r.over_count, 5);
    assert.equal(r.under_count, 4);
    assert.equal(r.push_count, 1);
    // over_rate excludes push: 5 / (5+4) ≈ 0.5556 (rounded to 4 decimals)
    assert.equal(r.over_rate, 0.5556);
  });

  it('LOAD-BEARING: L10 with only 7 eligible games → eligible_n=7, incomplete=true, coverage_label=incomplete', () => {
    const r = computeRealLineWindow(
      'L10',
      fx.player_reverse_chron_incomplete_l10
    );
    assert.equal(r.requested_n, 10);
    assert.equal(r.eligible_n, 7);
    assert.equal(r.incomplete, true);
    assert.equal(r.coverage_label, 'incomplete');
  });

  it('season window: eligible_n equals input length; never incomplete', () => {
    const r = computeRealLineWindow(
      'season',
      fx.player_reverse_chron_complete
    );
    assert.equal(r.eligible_n, fx.player_reverse_chron_complete.length);
    assert.equal(r.incomplete, false);
    assert.equal(r.requested_n, r.eligible_n);
  });

  it('LOAD-BEARING: push count NEVER added to over_count or under_count', () => {
    const r = computeRealLineWindow('L10', fx.player_reverse_chron_complete);
    assert.equal(
      r.over_count + r.under_count + r.push_count,
      r.eligible_n
    );
    // over_rate denominator excludes push (allow rounding: implementation rounds to 4 decimals).
    const expected = r.over_count / (r.over_count + r.under_count);
    assert.ok(
      Math.abs(r.over_rate! - expected) < 0.0001,
      `over_rate ${r.over_rate} != ${expected}`
    );
  });

  it('LOAD-BEARING: streak stops at opposite outcome (traverse reverse-chron until change)', () => {
    // L20 first two outcomes: over, over → streak_direction=over, length>=2
    const r = computeRealLineWindow('L20', fx.player_reverse_chron_complete);
    assert.equal(r.current_streak_direction, 'over');
    assert.equal(r.current_streak_length, 2);
  });

  it('LOAD-BEARING: streak stops at push (spec §14.5)', () => {
    // Custom sequence: push at index 0 → direction=push, length=1
    const r = computeRealLineWindow('L5', [
      { game_date_utc: '2026-07-11T22:00:00Z', canonical_closing_point: 12.0, player_stat_value: 12, outcome: 'push',  margin:  0,   coverage_label: 'complete' },
      { game_date_utc: '2026-07-09T22:00:00Z', canonical_closing_point: 12.5, player_stat_value: 18, outcome: 'over',  margin:  5.5, coverage_label: 'complete' },
    ]);
    assert.equal(r.current_streak_direction, 'push');
    assert.equal(r.current_streak_length, 1);
  });

  it('empty input: eligible_n=0, streak=null, coverage=no_closing_line', () => {
    const r = computeRealLineWindow('L10', []);
    assert.equal(r.eligible_n, 0);
    assert.equal(r.incomplete, true);
    assert.equal(r.current_streak_direction, null);
    assert.equal(r.current_streak_length, null);
    assert.equal(r.over_rate, null);
    assert.equal(r.coverage_label, 'incomplete');
  });

  it('LOAD-BEARING: single_book coverage propagates into window coverage_label', () => {
    // L5 fixture includes a single_book row at position 10, so the L20 result
    // (which crosses that boundary) picks up single_book.
    const r = computeRealLineWindow('L20', fx.player_reverse_chron_complete);
    assert.equal(r.coverage_label, 'single_book');
  });

  it('averages / medians preserve actual n (not requested_n)', () => {
    const r = computeRealLineWindow('L10', fx.player_reverse_chron_incomplete_l10);
    assert.equal(r.eligible_n, 7);
    // Average margin over 7 elements.
    const margins = fx.player_reverse_chron_incomplete_l10.map(
      (g: any) => g.margin
    );
    const expected_avg =
      margins.reduce((a: number, b: number) => a + b, 0) / margins.length;
    assert.ok(
      Math.abs(r.avg_margin! - expected_avg) < 0.01,
      `avg_margin ${r.avg_margin} vs expected ${expected_avg}`
    );
  });
});

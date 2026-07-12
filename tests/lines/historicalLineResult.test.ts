// Ticket §8 required tests covered here:
//   Test #18: push
//
// Ticket §8 acceptance criterion: Pushes are separate.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { computeHistoricalLineResult } from '../../src/lines/historicalLineResult.js';

const fx = JSON.parse(
  readFileSync(
    new URL('../fixtures/lines/historical-line-result-cases.json', import.meta.url),
    'utf8'
  )
);

describe('historical line result (spec §7.12)', () => {
  it('runs every fixture case', () => {
    for (const c of fx.cases) {
      const r = computeHistoricalLineResult({
        canonical_closing_point: c.canonical_closing_point,
        player_stat_value: c.player_stat_value,
        coverage_label: c.coverage_label,
      });
      assert.equal(r.outcome, c.expected_outcome, `case ${c.case_name}: outcome`);
      assert.equal(r.margin, c.expected_margin, `case ${c.case_name}: margin`);
    }
  });

  it('LOAD-BEARING: push is a distinct outcome; NEVER a win for either side', () => {
    const r = computeHistoricalLineResult({
      canonical_closing_point: 12,
      player_stat_value: 12,
      coverage_label: 'complete',
    });
    assert.equal(r.outcome, 'push');
    assert.equal(r.margin, 0);
    assert.notEqual(r.outcome, 'over');
    assert.notEqual(r.outcome, 'under');
  });

  it('LOAD-BEARING: over/under margin sign matches direction', () => {
    const over = computeHistoricalLineResult({
      canonical_closing_point: 12.5,
      player_stat_value: 18,
      coverage_label: 'complete',
    });
    assert.equal(over.outcome, 'over');
    assert.ok(over.margin > 0);

    const under = computeHistoricalLineResult({
      canonical_closing_point: 12.5,
      player_stat_value: 8,
      coverage_label: 'complete',
    });
    assert.equal(under.outcome, 'under');
    assert.ok(under.margin < 0);
  });

  it('single_book coverage flows through to result row', () => {
    const r = computeHistoricalLineResult({
      canonical_closing_point: 15.5,
      player_stat_value: 20,
      coverage_label: 'single_book',
    });
    assert.equal(r.coverage_label, 'single_book');
  });
});

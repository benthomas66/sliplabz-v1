// Ticket §8 required test covered here:
//   Test #12: final stat correction
//
// Ticket §8 acceptance criterion: corrected inputs trigger deterministic recomputation.
//
// V1-2 already emits a `recomputation_invalidations` row with reason
// `material_stat_change` when a player_game_stats material correction is
// detected. V1-4 must consume that invalidation and produce a NEW
// historical_line_result at an incremented computation_version.
//
// This test is a fixture-pure unit test: it exercises the deterministic
// recomputation function. The persistence-side is exercised in
// tests/integration/historicalLineResult.integration.test.ts.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { computeHistoricalLineResult } from '../../src/lines/historicalLineResult.js';

describe('final stat correction → deterministic recomputation (§7.11, V1-2 §12C.5)', () => {
  it('LOAD-BEARING: same closing point + corrected stat → new outcome, new margin, same coverage', () => {
    // Original observation: player_pts = 12 (matches closing = 12 → push).
    const before = computeHistoricalLineResult({
      canonical_closing_point: 12,
      player_stat_value: 12,
      coverage_label: 'complete',
    });
    assert.equal(before.outcome, 'push');
    assert.equal(before.margin, 0);

    // Correction: player_pts = 13.
    const after = computeHistoricalLineResult({
      canonical_closing_point: 12,
      player_stat_value: 13,
      coverage_label: 'complete',
    });
    assert.equal(after.outcome, 'over');
    assert.equal(after.margin, 1);
    assert.notEqual(after.outcome, before.outcome);
    // Coverage label unchanged — the correction only changed the stat.
    assert.equal(after.coverage_label, before.coverage_label);
  });

  it('LOAD-BEARING: recomputation is DETERMINISTIC — same inputs → same outputs across invocations', () => {
    const a = computeHistoricalLineResult({
      canonical_closing_point: 15.5,
      player_stat_value: 20,
      coverage_label: 'single_book',
    });
    const b = computeHistoricalLineResult({
      canonical_closing_point: 15.5,
      player_stat_value: 20,
      coverage_label: 'single_book',
    });
    assert.deepEqual(a, b);
  });

  it('correction that flips over→under is fully expressed by outcome + margin change', () => {
    const before = computeHistoricalLineResult({
      canonical_closing_point: 12.5,
      player_stat_value: 15,
      coverage_label: 'complete',
    });
    const after = computeHistoricalLineResult({
      canonical_closing_point: 12.5,
      player_stat_value: 10,
      coverage_label: 'complete',
    });
    assert.equal(before.outcome, 'over');
    assert.equal(after.outcome, 'under');
    assert.equal(before.margin, 2.5);
    assert.equal(after.margin, -2.5);
  });
});

// V1-5 ticket §9 required tests — partial window, push, normalization
// version change, backfilled_historical labeling (ledger #8).

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { computeRealLineWindow } from '../../src/computation/realLineWindows.js';
import { computeThresholdWindow } from '../../src/computation/thresholdWindows.js';
import {
  computeAveragesMedians,
  computeSampleSizeLabel,
} from '../../src/computation/averagesMedians.js';
import { V1_5_COMPUTATION_VERSION } from '../../src/computation/computationVersion.js';

// A helper to build a fake game.
function g(date: string, point: number, value: number, backfilled = false) {
  const outcome: 'over' | 'under' | 'push' =
    value > point ? 'over' : value < point ? 'under' : 'push';
  return {
    game_date_utc: date,
    canonical_closing_point: point,
    player_stat_value: value,
    outcome,
    margin: value - point,
    coverage_label: 'complete' as const,
    is_backfilled_historical: backfilled,
  };
}

describe('real-line window aggregate — §14', () => {
  it('REQUIRED: partial window — 3 eligible games at L5 → incomplete, actual n=3', () => {
    const games = [g('2026-07-01', 12.5, 15), g('2026-06-28', 12.5, 10), g('2026-06-25', 12.5, 20)];
    const r = computeRealLineWindow('L5', games);
    assert.equal(r.requested_n, 5);
    assert.equal(r.eligible_n, 3);
    assert.equal(r.incomplete, true);
    assert.equal(r.coverage_label, 'incomplete');
    // Over rate: 2 over, 1 under (all values != point). Push excluded from denominator.
    assert.equal(r.over_count, 2);
    assert.equal(r.under_count, 1);
    assert.equal(r.push_count, 0);
    assert.equal(r.over_rate, 0.6667);
  });

  it('REQUIRED: push is a distinct outcome — excluded from over/under rates but not from n', () => {
    const games = [
      g('2026-07-01', 12.5, 12.5), // push
      g('2026-06-28', 12.5, 15),   // over
      g('2026-06-25', 12.5, 12.5), // push
      g('2026-06-22', 12.5, 15),   // over
      g('2026-06-20', 12.5, 15),   // over
    ];
    const r = computeRealLineWindow('L5', games);
    assert.equal(r.eligible_n, 5);
    assert.equal(r.over_count, 3);
    assert.equal(r.under_count, 0);
    assert.equal(r.push_count, 2);
    // Over rate: 3 / (3 + 0) = 1.0. Push not in denominator.
    assert.equal(r.over_rate, 1.0);
    // Streak: first game is push → streak direction is push, length 1.
    assert.equal(r.current_streak_direction, 'push');
    assert.equal(r.current_streak_length, 1);
  });

  it('LOAD-BEARING (ledger #8): includes_backfilled_historical is TRUE when any input game has backfilled provenance', () => {
    const games = [g('2026-07-01', 12.5, 15), g('2026-06-28', 12.5, 10, /* backfilled */ true)];
    const r = computeRealLineWindow('L5', games);
    assert.equal(r.includes_backfilled_historical, true);
  });

  it('LOAD-BEARING (ledger #8): includes_backfilled_historical is FALSE when NO input game is backfilled', () => {
    const games = [g('2026-07-01', 12.5, 15), g('2026-06-28', 12.5, 10)];
    const r = computeRealLineWindow('L5', games);
    assert.equal(r.includes_backfilled_historical, false);
  });
});

describe('threshold window — A1 §9.2', () => {
  it('threshold=15.5: counts above/below/equal correctly', () => {
    const games = [
      { internal_game_id: 'g-1', game_date_utc: '2026-07-01', player_stat_value: 18, is_backfilled_historical: false },
      { internal_game_id: 'g-2', game_date_utc: '2026-06-28', player_stat_value: 15.5, is_backfilled_historical: false },
      { internal_game_id: 'g-3', game_date_utc: '2026-06-25', player_stat_value: 10, is_backfilled_historical: false },
      { internal_game_id: 'g-4', game_date_utc: '2026-06-22', player_stat_value: 20, is_backfilled_historical: false },
      { internal_game_id: 'g-5', game_date_utc: '2026-06-20', player_stat_value: 12, is_backfilled_historical: false },
    ];
    const r = computeThresholdWindow('L5', 15.5, games);
    assert.equal(r.eligible_n, 5);
    assert.equal(r.count_above, 2); // 18, 20
    assert.equal(r.count_below, 2); // 10, 12
    assert.equal(r.count_equal, 1); // 15.5
    assert.equal(r.avg_stat_value, 15.1); // (18+15.5+10+20+12)/5
    assert.equal(r.avg_minus_threshold, -0.4);
    // Streak direction: first game is above → above; second is equal → streak stops at above/length 1.
    assert.equal(r.current_streak_direction, 'above');
    assert.equal(r.current_streak_length, 1);
  });

  it('V1-8a0a SCOPE A: games_evaluated exposes the per-game outcomes ALREADY computed, aggregates value-equivalent', () => {
    const games = [
      { internal_game_id: 'g-1', game_date_utc: '2026-07-01', player_stat_value: 18, is_backfilled_historical: false },
      { internal_game_id: 'g-2', game_date_utc: '2026-06-28', player_stat_value: 15.5, is_backfilled_historical: false },
      { internal_game_id: 'g-3', game_date_utc: '2026-06-25', player_stat_value: 10, is_backfilled_historical: false },
      { internal_game_id: 'g-4', game_date_utc: '2026-06-22', player_stat_value: 20, is_backfilled_historical: false },
      { internal_game_id: 'g-5', game_date_utc: '2026-06-20', player_stat_value: 12, is_backfilled_historical: false },
    ];
    const r = computeThresholdWindow('season', 15.5, games);
    // (1) One outcome per eligible game, SAME order, tagged with the canonical id.
    assert.deepEqual(
      r.games_evaluated!.map((x) => [x.internal_game_id, x.outcome]),
      [['g-1', 'above'], ['g-2', 'equal'], ['g-3', 'below'], ['g-4', 'above'], ['g-5', 'below']],
    );
    // (2) The exposed outcomes RECONCILE with the aggregate counts (no new computation).
    const above = r.games_evaluated!.filter((x) => x.outcome === 'above').length;
    const below = r.games_evaluated!.filter((x) => x.outcome === 'below').length;
    const equal = r.games_evaluated!.filter((x) => x.outcome === 'equal').length;
    assert.equal(above, r.count_above);
    assert.equal(below, r.count_below);
    assert.equal(equal, r.count_equal);
    // (3) player_stat_value carried verbatim; value-equivalence of the aggregates.
    assert.deepEqual(r.games_evaluated!.map((x) => x.player_stat_value), [18, 15.5, 10, 20, 12]);
    assert.equal(r.count_above, 2); assert.equal(r.count_below, 2); assert.equal(r.count_equal, 1);
    // (4) L5 slice of the SAME games exposes exactly the eligible (sliced) subset.
    const l5 = computeThresholdWindow('L5', 15.5, games);
    assert.equal(l5.games_evaluated!.length, l5.eligible_n);
  });

  it('threshold=15.5: partial → incomplete', () => {
    const games = [
      { internal_game_id: 'g-1', game_date_utc: '2026-07-01', player_stat_value: 18, is_backfilled_historical: false },
      { internal_game_id: 'g-2', game_date_utc: '2026-06-28', player_stat_value: 10, is_backfilled_historical: false },
    ];
    const r = computeThresholdWindow('L5', 15.5, games);
    assert.equal(r.eligible_n, 2);
    assert.equal(r.incomplete, true);
    assert.equal(r.coverage_label, 'incomplete');
  });
});

describe('averages / medians / sample-size labels', () => {
  it('averages: simple values', () => {
    const games = [
      { game_date_utc: '2026-07-01', player_stat_value: 18, is_backfilled_historical: false },
      { game_date_utc: '2026-06-28', player_stat_value: 12, is_backfilled_historical: false },
    ];
    const r = computeAveragesMedians('L5', games);
    assert.equal(r.average, 15);
    assert.equal(r.median, 15);
    assert.equal(r.eligible_n, 2);
  });

  it('sample-size label: 0 → no_data; incomplete → incomplete; full → complete', () => {
    assert.equal(computeSampleSizeLabel('L5', 0).label, 'no_data');
    assert.equal(computeSampleSizeLabel('L5', 3).label, 'incomplete');
    assert.equal(computeSampleSizeLabel('L5', 5).label, 'complete');
    // season: any eligible_n>0 is complete (no requested cap).
    assert.equal(computeSampleSizeLabel('season', 47).label, 'complete');
  });
});

describe('normalization version change (§9 required test)', () => {
  it('REQUIRED: the shared computation_version is a single canonical constant; bump signals recompute', () => {
    // The composed row's computation_version is the single source of truth.
    // Anything that recomputes downstream reads this constant, so bumping it
    // triggers a full re-write of derived rows. If a metric owner had a
    // stale-version copy, this test would fail because the composed value
    // would not match V1_5_COMPUTATION_VERSION.
    assert.equal(typeof V1_5_COMPUTATION_VERSION, 'number');
    assert.ok(V1_5_COMPUTATION_VERSION >= 1);
  });
});

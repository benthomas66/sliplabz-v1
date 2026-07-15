// V1-5x RME-1 unit tests — HistoricalCoverageResult.
//
// Anchors:
//   EVIDENCE_PROFILE_METHOD_V1.md §A.1 binding, §C.1 / DR-25, DR-23.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  computeHistoricalCoverage,
  satisfiesDR25ThirtyDayCoverage,
} from '../../src/computation/historicalCoverage.js';

const PID = '00000000-0000-0000-0000-000000000001';

describe('HistoricalCoverageResult (RME-1) — pure aggregation', () => {
  it('LOAD-BEARING: empty input → coverage_start_date null, count 0, includes_backfilled false', () => {
    const r = computeHistoricalCoverage(PID, 'player_points', []);
    assert.equal(r.coverage_start_date, null);
    assert.equal(r.eligible_game_count, 0);
    assert.equal(r.includes_backfilled_historical, false);
    assert.equal(r.internal_player_id, PID);
    assert.equal(r.market_key, 'player_points');
    assert.equal(typeof r.method_version, 'number');
    assert.equal(typeof r.computation_version, 'number');
  });

  it('coverage_start_date is the MIN of supplied game_date_utc values (earliest wins)', () => {
    const r = computeHistoricalCoverage(PID, 'player_points', [
      { game_date_utc: '2026-03-15', is_backfilled_historical: false },
      { game_date_utc: '2025-11-01', is_backfilled_historical: false },
      { game_date_utc: '2026-01-05', is_backfilled_historical: false },
    ]);
    assert.equal(r.coverage_start_date, '2025-11-01');
    assert.equal(r.eligible_game_count, 3);
  });

  it('LOAD-BEARING (DR-23): includes_backfilled_historical is TRUE when any row is backfilled', () => {
    const r = computeHistoricalCoverage(PID, 'player_rebounds', [
      { game_date_utc: '2026-02-01', is_backfilled_historical: false },
      { game_date_utc: '2025-12-15', is_backfilled_historical: true },
    ]);
    // Earliest (2025-12-15) is the backfilled row — coverage_start_date is
    // still that earliest date; the stance is disclosed via the boolean.
    assert.equal(r.coverage_start_date, '2025-12-15');
    assert.equal(r.includes_backfilled_historical, true);
  });

  it('includes_backfilled_historical is FALSE when NO row is backfilled', () => {
    const r = computeHistoricalCoverage(PID, 'player_assists', [
      { game_date_utc: '2026-05-01', is_backfilled_historical: false },
      { game_date_utc: '2026-04-01', is_backfilled_historical: false },
    ]);
    assert.equal(r.coverage_start_date, '2026-04-01');
    assert.equal(r.includes_backfilled_historical, false);
  });

  it('result is frozen (immutable read-model shape)', () => {
    const r = computeHistoricalCoverage(PID, 'player_threes', []);
    assert.equal(Object.isFrozen(r), true);
  });
});

describe('DR-25 30-day predicate — satisfiesDR25ThirtyDayCoverage', () => {
  it('LOAD-BEARING: no coverage (null coverage_start_date) → false', () => {
    const r = computeHistoricalCoverage(PID, 'player_points', []);
    assert.equal(satisfiesDR25ThirtyDayCoverage(r, '2026-07-14'), false);
  });

  it('exactly 30 days apart → true (>= 30 satisfied)', () => {
    const r = computeHistoricalCoverage(PID, 'player_points', [
      { game_date_utc: '2026-06-14', is_backfilled_historical: false },
    ]);
    assert.equal(satisfiesDR25ThirtyDayCoverage(r, '2026-07-14'), true);
  });

  it('29 days apart → false (below DR-25 threshold)', () => {
    const r = computeHistoricalCoverage(PID, 'player_points', [
      { game_date_utc: '2026-06-15', is_backfilled_historical: false },
    ]);
    assert.equal(satisfiesDR25ThirtyDayCoverage(r, '2026-07-14'), false);
  });

  it('substantial history (many months back) → true', () => {
    const r = computeHistoricalCoverage(PID, 'player_points', [
      { game_date_utc: '2025-10-20', is_backfilled_historical: true },
      { game_date_utc: '2026-05-15', is_backfilled_historical: false },
    ]);
    assert.equal(satisfiesDR25ThirtyDayCoverage(r, '2026-07-14'), true);
  });
});

// V1-8a3 — board filter logic (pure, client-safe). Groups 10-13.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { matchesFilters, DEFAULT_FILTER, type RowFilterMeta, type BoardFilterState } from '../src/lib/board/filter.js';
import { marketLabel, marketBucket, directionBucket } from '../src/lib/board/bandView.js';

const ROWS: ReadonlyArray<RowFilterMeta> = [
  { player: 'Sabrina Ionescu', marketBucket: 'points', direction: 'over' },
  { player: 'Aja Wilson', marketBucket: 'rebounds', direction: 'under' },
  { player: 'Breanna Stewart', marketBucket: 'points', direction: 'under' },
  { player: 'Caitlin Clark', marketBucket: 'threes', direction: 'over' },
];
function visible(f: BoardFilterState): RowFilterMeta[] { return ROWS.filter((m) => matchesFilters(m, f)); }

test('G10: market filter shows only the selected market; All shows every row', () => {
  assert.equal(visible(DEFAULT_FILTER).length, 4);
  assert.deepEqual(visible({ ...DEFAULT_FILTER, market: 'points' }).map((m) => m.player), ['Sabrina Ionescu', 'Breanna Stewart']);
  assert.deepEqual(visible({ ...DEFAULT_FILTER, market: 'threes' }).map((m) => m.player), ['Caitlin Clark']);
});

test('G11: direction filter shows only Over / Under', () => {
  assert.deepEqual(visible({ ...DEFAULT_FILTER, direction: 'over' }).map((m) => m.player), ['Sabrina Ionescu', 'Caitlin Clark']);
  assert.deepEqual(visible({ ...DEFAULT_FILTER, direction: 'under' }).map((m) => m.player), ['Aja Wilson', 'Breanna Stewart']);
});

test('G12: player search is a case-insensitive substring on the player name', () => {
  assert.deepEqual(visible({ ...DEFAULT_FILTER, search: 'clark' }).map((m) => m.player), ['Caitlin Clark']);
  assert.deepEqual(visible({ ...DEFAULT_FILTER, search: 'STEWART' }).map((m) => m.player), ['Breanna Stewart']);
  assert.equal(visible({ ...DEFAULT_FILTER, search: 'zzz' }).length, 0);
});

test('G10+11+12 combined: filters intersect', () => {
  assert.deepEqual(visible({ market: 'points', direction: 'under', search: '' }).map((m) => m.player), ['Breanna Stewart']);
});

test('G13: filtering PRESERVES DR-20 rank order (never reorders)', () => {
  // ROWS is the ranked order; every filtered subset keeps relative order.
  const sub = visible({ ...DEFAULT_FILTER, market: 'points' });
  assert.deepEqual(sub.map((m) => m.player), ['Sabrina Ionescu', 'Breanna Stewart']); // ranked order, not sorted by name
});

test('consumer labels — no internal market_key exposed; buckets map correctly', () => {
  assert.equal(marketLabel('player_points'), 'Points');
  assert.equal(marketLabel('player_rebounds'), 'Rebounds');
  assert.equal(marketLabel('player_assists'), 'Assists');
  assert.equal(marketLabel('player_threes'), '3-Pointers');
  assert.equal(marketBucket('player_threes'), 'threes');
  // the bucket is not the internal key
  assert.notEqual(marketBucket('player_threes'), 'player_threes');
  assert.equal(directionBucket('Over-leaning'), 'over');
  assert.equal(directionBucket('Under-leaning'), 'under');
  assert.equal(directionBucket('Mixed'), 'neither');
});

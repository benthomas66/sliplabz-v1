// Ticket §7 required tests covered here:
//   Test #2: all four markets (only the four launch markets are ingested;
//            everything else is quarantined).

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  LAUNCH_MARKET_KEYS,
  isLaunchMarketKey,
  CANONICAL_STAT_BY_MARKET,
} from '../../src/odds/marketKeys.js';

describe('four launch markets (A1 §4.1, Odds §2)', () => {
  it('exactly four launch market keys and their canonical stat mapping', () => {
    assert.deepEqual(
      [...LAUNCH_MARKET_KEYS].sort(),
      ['player_assists', 'player_points', 'player_rebounds', 'player_threes']
    );
    assert.equal(CANONICAL_STAT_BY_MARKET.player_points, 'pts');
    assert.equal(CANONICAL_STAT_BY_MARKET.player_rebounds, 'reb');
    assert.equal(CANONICAL_STAT_BY_MARKET.player_assists, 'ast');
    assert.equal(CANONICAL_STAT_BY_MARKET.player_threes, 'fg3m');
  });

  it('isLaunchMarketKey accepts the four keys and rejects everything else', () => {
    for (const k of LAUNCH_MARKET_KEYS) assert.equal(isLaunchMarketKey(k), true);
    for (const k of [
      'player_steals',
      'player_blocks',
      'player_points_alternate',
      'h2h',
      'totals',
      'spreads',
      'player_prizepicks_points', // hypothetical rebrand
      '', // empty
    ]) {
      assert.equal(
        isLaunchMarketKey(k),
        false,
        `${k} must NOT be a launch market key`
      );
    }
  });

  it('LAUNCH_MARKET_KEYS is frozen and cannot be mutated (scope lock)', () => {
    assert.ok(Object.isFrozen(LAUNCH_MARKET_KEYS));
  });
});

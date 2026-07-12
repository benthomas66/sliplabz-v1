// Ticket §7 acceptance criterion A support:
//   Sportsbook records and DFS records never mix in consensus.
//   Source classification is STRUCTURAL, not a display flag.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  V1_ALLOWLISTED_KEYS,
  V1_BOOKMAKER_ALLOWLIST,
  V1_CONSENSUS_SPORTSBOOK_KEYS,
  isAllowlistedBookmakerKey,
  isConsensusEligibleBookmakerKey,
  sourceClassForBookmakerKey,
} from '../../src/odds/bookmakerAllowlist.js';

describe('bookmaker allowlist (Odds §10.3, §10.12, §13.5, §18.1)', () => {
  it('exactly 10 keys: 8 sportsbooks + PrizePicks + Underdog', () => {
    assert.equal(V1_ALLOWLISTED_KEYS.length, 10);
    assert.equal(V1_CONSENSUS_SPORTSBOOK_KEYS.length, 8);
  });

  it('sportsbook set matches audit §10.12 exactly', () => {
    assert.deepEqual([...V1_CONSENSUS_SPORTSBOOK_KEYS].sort(), [
      'betmgm',
      'betrivers',
      'draftkings',
      'espnbet',
      'fanatics',
      'fanduel',
      'hardrockbet',
      'williamhill_us',
    ]);
  });

  it('PrizePicks and Underdog are dfs_pickem and NOT consensus-eligible', () => {
    assert.equal(sourceClassForBookmakerKey('prizepicks'), 'dfs_pickem');
    assert.equal(sourceClassForBookmakerKey('underdog'), 'dfs_pickem');
    assert.equal(isConsensusEligibleBookmakerKey('prizepicks'), false);
    assert.equal(isConsensusEligibleBookmakerKey('underdog'), false);
  });

  it('every sportsbook allowlist key is consensus-eligible', () => {
    for (const key of V1_CONSENSUS_SPORTSBOOK_KEYS) {
      assert.equal(sourceClassForBookmakerKey(key), 'sportsbook');
      assert.equal(isConsensusEligibleBookmakerKey(key), true);
    }
  });

  it('non-allowlisted key returns source_class="unknown" (never silently sportsbook)', () => {
    assert.equal(isAllowlistedBookmakerKey('novel_book_xyz'), false);
    assert.equal(sourceClassForBookmakerKey('novel_book_xyz'), 'unknown');
    assert.equal(isConsensusEligibleBookmakerKey('novel_book_xyz'), false);
  });

  it('espnbet returns theScore Bet title per §13.9 (title is display, not identity)', () => {
    const entry = V1_BOOKMAKER_ALLOWLIST.find((e) => e.provider_key === 'espnbet');
    assert.ok(entry !== undefined);
    assert.equal(entry!.display_title, 'theScore Bet');
    assert.equal(entry!.source_class, 'sportsbook');
  });
});

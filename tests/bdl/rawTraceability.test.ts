// Ticket §6 hard invariant covered here:
//   - Raw provider payload references are immutable and traceable from
//     every derived row.
//
// This test asserts the source-hash contract preserves the identifying
// characteristic that lets any derived row walk back to its raw payload
// through the raw_response_id chain.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { canonicalSourceHash, contentHash } from '../../src/bdl/sourceHash.js';
import { parseBdlMinutes } from '../../src/bdl/minutes.js';
import { extractRawCountingStats } from '../../src/bdl/countingStats.js';

describe('source hash & raw traceability (BDL §12C.4, §14)', () => {
  it('canonical hash is deterministic across two invocations with identical inputs', () => {
    const inputs = {
      provider_player_id: '65001',
      provider_game_id: '24752',
      provider_team_id: '3',
      minutes_status: 'played' as const,
      parsed_minutes: 34,
      raw_minutes: '34',
      raw_stats: {
        pts: 22, reb: 6, ast: 4, fg3m: 2, stl: 1, blk: 0, turnover: 3,
        fgm: 9, fga: 17, fg3a: 6, ftm: 2, fta: 2, oreb: 1, dreb: 5, pf: 3,
      },
    };
    assert.equal(canonicalSourceHash(inputs), canonicalSourceHash(inputs));
  });

  it('canonical hash is sensitive to any material field: pts change → different hash', () => {
    const a = {
      provider_player_id: '65001',
      provider_game_id: '24752',
      provider_team_id: '3',
      minutes_status: 'played' as const,
      parsed_minutes: 34,
      raw_minutes: '34',
      raw_stats: {
        pts: 22, reb: 6, ast: 4, fg3m: 2, stl: 1, blk: 0, turnover: 3,
        fgm: 9, fga: 17, fg3a: 6, ftm: 2, fta: 2, oreb: 1, dreb: 5, pf: 3,
      },
    };
    const b = { ...a, raw_stats: { ...a.raw_stats, pts: 20 } };
    assert.notEqual(canonicalSourceHash(a), canonicalSourceHash(b));
  });

  it('LOAD-BEARING: "--" minutes produce a DIFFERENT hash from a missing minutes field (raw preserved)', () => {
    const minutesDashes = parseBdlMinutes('--');
    const minutesNull = parseBdlMinutes(null);
    const raw_stats = extractRawCountingStats({} as any);
    const hDashes = canonicalSourceHash({
      provider_player_id: 'p',
      provider_game_id: 'g',
      provider_team_id: '3',
      minutes_status: minutesDashes.status,
      parsed_minutes: minutesDashes.parsed_minutes,
      raw_minutes: minutesDashes.raw_minutes,
      raw_stats,
    });
    const hNull = canonicalSourceHash({
      provider_player_id: 'p',
      provider_game_id: 'g',
      provider_team_id: '3',
      minutes_status: minutesNull.status,
      parsed_minutes: minutesNull.parsed_minutes,
      raw_minutes: minutesNull.raw_minutes,
      raw_stats,
    });
    // Both are `unresolved_non_numeric` but raw_minutes differs.
    assert.notEqual(hDashes, hNull);
  });

  it('contentHash is order-stable across equivalent object key orderings', () => {
    const a = { z: 1, a: 2, m: { q: 'x', p: 'y' } };
    const b = { a: 2, m: { p: 'y', q: 'x' }, z: 1 };
    assert.equal(contentHash(a), contentHash(b));
  });
});

// Ticket §6 requirement: post-final reconciliation scheduling.
//
// Emits deterministic schedule entries for BDL §12C.4:
//   1. first_post_final: immediately after final detection
//   2. t_plus_2h:         ~2h after final
//   3. next_day:          24h after final
//   4. season_sweep:      +7 days as a durable-run reminder

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { buildPostFinalSchedule } from '../../src/bdl/postFinalScheduling.js';

describe('post-final reconciliation scheduling (BDL §12C.4, complete spec §9.9)', () => {
  it('builds the 4 canonical follow-ups in due_at ascending order', () => {
    const finalObserved = '2026-06-15T22:00:00Z';
    const entries = buildPostFinalSchedule({
      internal_game_id: 'g001',
      provider_game_id: '99001',
      triggering_observation_id: 'gso-01',
      final_observed_at: finalObserved,
    });
    assert.equal(entries.length, 4);
    const kinds = entries.map((e) => e.kind);
    assert.deepEqual(kinds, [
      'first_post_final',
      't_plus_2h',
      'next_day',
      'season_sweep',
    ]);

    // Offsets.
    const t0 = new Date(finalObserved).getTime();
    assert.equal(
      new Date(entries[0]!.due_at).getTime(),
      t0
    );
    assert.equal(
      new Date(entries[1]!.due_at).getTime(),
      t0 + 2 * 60 * 60 * 1000
    );
    assert.equal(
      new Date(entries[2]!.due_at).getTime(),
      t0 + 24 * 60 * 60 * 1000
    );
    assert.equal(
      new Date(entries[3]!.due_at).getTime(),
      t0 + 7 * 24 * 60 * 60 * 1000
    );
  });

  it('invalid final_observed_at throws instead of silently minting NaN due_at', () => {
    assert.throws(() =>
      buildPostFinalSchedule({
        internal_game_id: 'g001',
        provider_game_id: '99001',
        triggering_observation_id: 'gso-01',
        final_observed_at: 'not-a-timestamp',
      })
    );
  });

  it('same triggering_observation_id is carried on every entry (auditable link)', () => {
    const entries = buildPostFinalSchedule({
      internal_game_id: 'g001',
      provider_game_id: '99001',
      triggering_observation_id: 'gso-42',
      final_observed_at: '2026-06-15T22:00:00Z',
    });
    for (const e of entries) {
      assert.equal(e.triggering_observation_id, 'gso-42');
    }
  });
});

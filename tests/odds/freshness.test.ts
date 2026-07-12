// Ticket §7 required tests covered here:
//   Test #16: stale market timestamp classification.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { classifyFreshness } from '../../src/odds/freshness.js';

const fx = JSON.parse(
  readFileSync(
    new URL('../fixtures/odds/stale-market-timestamp.json', import.meta.url),
    'utf8'
  )
);

describe('freshness classification (Odds §19.2)', () => {
  it('classifies four canonical cases per §19.2 thresholds', () => {
    for (const c of fx.cases as ReadonlyArray<{
      provider_last_update: string | null;
      expected_state: string;
    }>) {
      const state = classifyFreshness({
        provider_last_update: c.provider_last_update,
        now: fx.now,
        latest_poll_failed: false,
      });
      assert.equal(
        state,
        c.expected_state,
        `case ${JSON.stringify(c)} classified as ${state}`
      );
    }
  });

  it('LOAD-BEARING: latest_poll_failed takes precedence — even with a fresh timestamp', () => {
    const state = classifyFreshness({
      provider_last_update: fx.now, // "now"; would otherwise be fresh
      now: fx.now,
      latest_poll_failed: true,
    });
    assert.equal(state, 'failed_latest_poll');
  });

  it('null provider_last_update → unavailable (not fresh, not stale)', () => {
    const state = classifyFreshness({
      provider_last_update: null,
      now: fx.now,
      latest_poll_failed: false,
    });
    assert.equal(state, 'unavailable');
  });

  it('exactly 10-minute-old timestamp → fresh (boundary)', () => {
    const state = classifyFreshness({
      provider_last_update: '2026-07-11T16:50:00Z',
      now: '2026-07-11T17:00:00Z',
      latest_poll_failed: false,
    });
    assert.equal(state, 'fresh');
  });

  it('exactly 30-minute-old timestamp → aging (boundary)', () => {
    const state = classifyFreshness({
      provider_last_update: '2026-07-11T16:30:00Z',
      now: '2026-07-11T17:00:00Z',
      latest_poll_failed: false,
    });
    assert.equal(state, 'aging');
  });
});

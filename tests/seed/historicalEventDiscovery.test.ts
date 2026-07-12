// Ticket §8b required test #1: historical event-ID discovery.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { validateHistoricalEventDiscoveryRows } from '../../src/seed/historicalEventDiscovery.js';

const fx = JSON.parse(
  readFileSync(
    new URL('../fixtures/seed/historical-events-response.json', import.meta.url),
    'utf8'
  )
);

describe('historical event discovery (Odds §14.11)', () => {
  it('LOAD-BEARING #1: six-event historical slate validates cleanly; provider snapshot envelope preserved', () => {
    const r = validateHistoricalEventDiscoveryRows(fx.response_body.data);
    assert.equal(r.valid_events.length, 6);
    assert.equal(r.quarantined.length, 0);
    assert.equal(r.is_empty, false);
    for (const evt of r.valid_events) {
      assert.equal(evt.sport_key, 'basketball_wnba');
      assert.ok(evt.id.length > 0);
    }
  });

  it('missing id row quarantines with missing_event_id', () => {
    const r = validateHistoricalEventDiscoveryRows([
      { home_team: 'A', away_team: 'B', commence_time: '2026-05-08T23:00:00Z' },
    ]);
    assert.equal(r.valid_events.length, 0);
    assert.equal(r.quarantined.length, 1);
    assert.equal(r.quarantined[0]!.reason, 'missing_event_id');
  });

  it('duplicate id quarantines all rows sharing the id', () => {
    const dup = fx.response_body.data.slice();
    dup.push({ ...fx.response_body.data[0], home_team: 'Different' });
    const r = validateHistoricalEventDiscoveryRows(dup);
    assert.equal(r.valid_events.length, 5);
    const dup_quar = r.quarantined.filter(
      (q) => q.reason === 'duplicate_event_id'
    );
    assert.ok(dup_quar.length >= 1);
  });

  it('empty response marks is_empty=true', () => {
    const r = validateHistoricalEventDiscoveryRows([]);
    assert.equal(r.is_empty, true);
    assert.equal(r.valid_events.length, 0);
  });
});

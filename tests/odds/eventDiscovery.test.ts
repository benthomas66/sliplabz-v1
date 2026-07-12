// Ticket §7 required tests covered here:
//   Test #1: six-event slate fixture.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { validateEventDiscoveryResponse } from '../../src/odds/eventDiscovery.js';

const fx = JSON.parse(
  readFileSync(
    new URL('../fixtures/odds/events-slate-2026-07-10.json', import.meta.url),
    'utf8'
  )
);

describe('event discovery (Odds §4, §5, §7)', () => {
  it('six-event slate fixture: all six events pass structural validation', () => {
    const result = validateEventDiscoveryResponse(fx.response);
    assert.equal(result.valid_events.length, 6);
    assert.equal(result.quarantined.length, 0);
    assert.equal(result.is_empty, false);
    for (const evt of result.valid_events) {
      assert.equal(evt.raw_sport_key, 'basketball_wnba');
      assert.equal(evt.raw_sport_title, 'WNBA');
      assert.ok(evt.provider_event_id.length > 0);
      assert.ok(evt.content_hash.length === 64);
    }
  });

  it('slate identity: the six audit-verbatim event IDs are all present', () => {
    const result = validateEventDiscoveryResponse(fx.response);
    const ids = result.valid_events
      .map((e) => e.provider_event_id)
      .sort();
    assert.deepEqual(ids, [
      '14c1ed8012d1c1a70778c1d1aa348e83',
      '1547b39904db439304af0dfdacaa469d',
      '7295f7e8db8d22124fdf261cda31a1f6',
      '93c27f5318a98fdd2a9bfbc42269f134',
      '9f2c4d943190edd1073d4cd6760fcf8c',
      'dbbae9c1944a4874fe492f9fe23d8f62',
    ]);
  });

  it('missing id row quarantines with reason `missing_event_id`', () => {
    const result = validateEventDiscoveryResponse([
      { home_team: 'A', away_team: 'B', commence_time: '2026-07-10T23:40:00Z' },
    ]);
    assert.equal(result.valid_events.length, 0);
    assert.equal(result.quarantined.length, 1);
    assert.equal(result.quarantined[0]!.reason, 'missing_event_id');
  });

  it('duplicate id quarantines ALL rows sharing that id (§4.4)', () => {
    const dup = fx.response.slice();
    dup.push({ ...fx.response[0], home_team: 'Different' });
    const result = validateEventDiscoveryResponse(dup);
    // The duplicate id must be quarantined; the OTHER five valid ids remain.
    assert.equal(result.valid_events.length, 5);
    const dup_quar = result.quarantined.filter(
      (q) => q.reason === 'duplicate_event_id'
    );
    assert.ok(dup_quar.length >= 1);
  });

  it('empty valid response marks is_empty=true (§4.4 successful empty)', () => {
    const result = validateEventDiscoveryResponse([]);
    assert.equal(result.is_empty, true);
    assert.equal(result.valid_events.length, 0);
    assert.equal(result.quarantined.length, 0);
  });

  it('bad commence_time quarantines with reason detail', () => {
    const result = validateEventDiscoveryResponse([
      {
        id: 'evt1',
        home_team: 'A',
        away_team: 'B',
        commence_time: 'not-a-timestamp',
      },
    ]);
    assert.equal(result.quarantined.length, 1);
    assert.equal(result.quarantined[0]!.reason, 'unexpected_field_shape');
  });
});

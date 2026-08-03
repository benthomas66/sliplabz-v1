// V1-OP-8 — historical `date` query-parameter serialization.
//
// Live finding (2026-08-02): the Odds API historical endpoints reject
// millisecond-precision `date` with HTTP 422. `evaluateCloseBoundary` emits
// `.toISOString()` (millisecond precision), so the boundary value must be
// normalized to second precision AT THE SOLE HTTP OWNER — impossible by
// construction for any future caller, not merely absent from today's callers.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  toHistoricalDateParam,
  buildHistoricalEventOddsUrl,
  buildHistoricalEventsUrl,
} from '../../src/seed/httpClient.js';
import { evaluateCloseBoundary } from '../../src/lines/closeBoundary.js';

const HTTP_SRC = readFileSync(new URL('../../src/seed/httpClient.ts', import.meta.url), 'utf8');
const CFG = { base_url: 'https://api.the-odds-api.com' };

/** The shape the original seed proved working: `2026-07-12T23:00:00Z`. */
const SECOND_PRECISION = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

describe('V1-OP-8 historical date param — second precision', () => {
  it('FORMAT: a millisecond boundary serializes with no sub-second component', () => {
    const out = toHistoricalDateParam('2026-07-17T23:45:00.000Z');
    assert.equal(out, '2026-07-17T23:45:00Z');
    assert.match(out, SECOND_PRECISION);
    assert.ok(!out.includes('.'), 'no fractional seconds');
  });

  it('FORMAT: the real evaluateCloseBoundary output normalizes correctly', () => {
    const b = evaluateCloseBoundary({
      internal_game_id: 'df22e4f4-d4ef-4cba-88e7-1e83db28ad2d',
      status: 'final',
      scheduled_start_utc: '2026-07-17T23:30:00.000Z',
      actual_start_utc: null,
    } as never);
    // the derived value itself keeps millisecond precision (unchanged semantics)
    assert.equal(b.close_boundary_utc, '2026-07-17T23:45:00.000Z');
    // only the WIRE serialization is normalized
    assert.equal(toHistoricalDateParam(b.close_boundary_utc as string), '2026-07-17T23:45:00Z');
  });

  it('IDEMPOTENT: already-second-precision input is byte-identical (seed path unchanged)', () => {
    for (const v of [
      '2026-07-12T23:00:00Z', // the exact value the seed sent successfully
      '2026-05-08T23:00:00Z',
      '2026-07-17T23:45:00Z',
    ]) {
      assert.equal(toHistoricalDateParam(v), v, `${v} must not change`);
      assert.equal(toHistoricalDateParam(toHistoricalDateParam(v)), v, 'double application is stable');
    }
  });

  it('IDEMPOTENT: normalization is stable under repeated application', () => {
    const once = toHistoricalDateParam('2026-07-17T23:45:00.123456Z');
    assert.equal(once, '2026-07-17T23:45:00Z');
    assert.equal(toHistoricalDateParam(once), once);
  });

  it('touches nothing but the fractional-seconds group', () => {
    // date part, time part, and zone marker all survive verbatim
    assert.equal(toHistoricalDateParam('2026-01-02T03:04:05.678Z'), '2026-01-02T03:04:05Z');
    // a value with no fraction and no zone is passed through untouched
    assert.equal(toHistoricalDateParam('2026-01-02T03:04:05'), '2026-01-02T03:04:05');
  });

  it('the event-odds URL builder emits second precision', () => {
    const url = buildHistoricalEventOddsUrl(CFG as never, {
      api_key: 'KEY',
      at_timestamp: '2026-07-17T23:45:00.000Z',
      provider_event_id: '034012f210532a879b3d1ab5de8306e6',
      market_keys: ['player_points'],
      bookmaker_keys: ['draftkings'],
    });
    assert.ok(url.includes('date=2026-07-17T23%3A45%3A00Z') || url.includes('date=2026-07-17T23:45:00Z'), url);
    assert.ok(!url.includes('.000'), 'no milliseconds on the wire');
  });

  it('the events (discovery) URL builder emits second precision too', () => {
    const url = buildHistoricalEventsUrl(CFG as never, {
      api_key: 'KEY',
      at_timestamp: '2026-07-17T23:45:00.000Z',
    });
    assert.ok(!url.includes('.000'), 'no milliseconds on the discovery wire either');
  });

  it('IMPOSSIBLE BY CONSTRUCTION: no raw at_timestamp reaches a date param', () => {
    // every `date:` site in the sole HTTP owner goes through the normalizer
    assert.ok(!/date:\s*input\.at_timestamp/.test(HTTP_SRC), 'no un-normalized date site remains');
    const normalized = (HTTP_SRC.match(/date:\s*toHistoricalDateParam\(input\.at_timestamp\)/g) ?? []).length;
    assert.equal(normalized, 4, 'all four historical date sites are normalized');
  });
});

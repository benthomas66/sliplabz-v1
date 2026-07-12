// Ticket §7 required tests covered here:
//   Test #11: 10-book quota — exact_match forecast.
//   Test #12: 11+-book quota — 2 region-equivalents; forecast=8.
//
// Ticket §7 acceptance criterion D: quota forecast reconciles to headers.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  bookmakerRegionEquivalents,
  forecastEventDiscoveryCost,
  forecastEventOddsCost,
  reconcileQuota,
} from '../../src/odds/quotaForecast.js';

const fx10 = JSON.parse(
  readFileSync(
    new URL('../fixtures/odds/quota-10-book-response.json', import.meta.url),
    'utf8'
  )
);
const fx12 = JSON.parse(
  readFileSync(
    new URL('../fixtures/odds/quota-12-book-response.json', import.meta.url),
    'utf8'
  )
);

describe('quota forecasting & reconciliation (Odds §13, §14.6, §14.7)', () => {
  it('bookmakerRegionEquivalents: 1–10 → 1; 11–20 → 2; 21–30 → 3', () => {
    assert.equal(bookmakerRegionEquivalents(1), 1);
    assert.equal(bookmakerRegionEquivalents(10), 1);
    assert.equal(bookmakerRegionEquivalents(11), 2);
    assert.equal(bookmakerRegionEquivalents(20), 2);
    assert.equal(bookmakerRegionEquivalents(21), 3);
    assert.equal(bookmakerRegionEquivalents(0), 0);
  });

  it('forecastEventDiscoveryCost === 0 (§14.2)', () => {
    assert.equal(forecastEventDiscoveryCost(), 0);
  });

  it('LOAD-BEARING: 10-book × 4-market forecast = 4; observed header exactly 4 → exact_match', () => {
    const forecast = forecastEventOddsCost({
      requested_market_count: fx10.requested.market_count,
      requested_bookmaker_count: fx10.requested.bookmaker_count,
    });
    assert.equal(forecast, 4);
    const rec = reconcileQuota({
      forecast,
      observed_x_requests_last: fx10.headers['x-requests-last'] as number,
    });
    assert.equal(rec.delta_flag, 'exact_match');
    assert.equal(rec.delta, 0);
  });

  it('LOAD-BEARING: 12-book × 4-market forecast = 8; observed header exactly 8 → exact_match', () => {
    const forecast = forecastEventOddsCost({
      requested_market_count: fx12.requested.market_count,
      requested_bookmaker_count: fx12.requested.bookmaker_count,
    });
    assert.equal(forecast, 8);
    const rec = reconcileQuota({
      forecast,
      observed_x_requests_last: fx12.headers['x-requests-last'] as number,
    });
    assert.equal(rec.delta_flag, 'exact_match');
  });

  it('LOAD-BEARING: divergence records flag; NEVER silently patched', () => {
    const lower = reconcileQuota({
      forecast: 4,
      observed_x_requests_last: 3,
    });
    assert.equal(lower.delta_flag, 'observed_lower_than_forecast');
    assert.equal(lower.delta, -1);
    const higher = reconcileQuota({
      forecast: 4,
      observed_x_requests_last: 8,
    });
    assert.equal(higher.delta_flag, 'observed_higher_than_forecast');
    assert.equal(higher.delta, 4);
    const missing = reconcileQuota({
      forecast: 4,
      observed_x_requests_last: null,
    });
    assert.equal(missing.delta_flag, 'observed_missing');
  });
});

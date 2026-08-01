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
  forecastHistoricalEventOddsCost,
  forecastHistoricalEventDiscoveryCost,
  HISTORICAL_ODDS_MULTIPLIER,
  HISTORICAL_EVENT_DISCOVERY_COST_CREDITS,
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

describe('GAP-29 — HISTORICAL forecasts (§14.11.2 10× multiplier + non-zero discovery)', () => {
  it('constants: historical multiplier = 10 (§14.11.2); historical discovery = 1 (non-zero)', () => {
    assert.equal(HISTORICAL_ODDS_MULTIPLIER, 10);
    assert.equal(HISTORICAL_EVENT_DISCOVERY_COST_CREDITS, 1);
  });

  it('historical event-odds applies the 10× multiplier: 10-book × 4-market = 40 (§14.11.2 worked figure)', () => {
    const hist = forecastHistoricalEventOddsCost({ requested_market_count: 4, requested_bookmaker_count: 10 });
    assert.equal(hist, 40); // 10 × (4 markets × 1 region-equiv)
    // and it is exactly 10× the CURRENT forecast for the same request
    assert.equal(hist, HISTORICAL_ODDS_MULTIPLIER * forecastEventOddsCost({ requested_market_count: 4, requested_bookmaker_count: 10 }));
    // 12 books → 2 region-equiv → current 8, historical 80
    assert.equal(forecastHistoricalEventOddsCost({ requested_market_count: 4, requested_bookmaker_count: 12 }), 80);
  });

  it('REGRESSION PIN: current-endpoint forecasts are UNCHANGED (multiplier 1, discovery 0)', () => {
    assert.equal(forecastEventOddsCost({ requested_market_count: 4, requested_bookmaker_count: 10 }), 4);
    assert.equal(forecastEventOddsCost({ requested_market_count: 4, requested_bookmaker_count: 12 }), 8);
    assert.equal(forecastEventDiscoveryCost(), 0); // §14.2 current /events stays free
  });

  it('historical discovery is NON-ZERO (1/call); current discovery stays 0', () => {
    assert.equal(forecastHistoricalEventDiscoveryCost(), 1);
    assert.equal(forecastEventDiscoveryCost(), 0);
  });

  it('reconcileQuota demonstrates the GAP-29 bug and its fix', () => {
    // BUG (pre-fix): forecasting the CURRENT cost (4) for a HISTORICAL call whose
    // observed header is 40 trips observed_higher_than_forecast on EVERY call.
    const bug = reconcileQuota({ forecast: forecastEventOddsCost({ requested_market_count: 4, requested_bookmaker_count: 10 }), observed_x_requests_last: 40 });
    assert.equal(bug.delta_flag, 'observed_higher_than_forecast');
    assert.equal(bug.delta, 36);
    // FIX: the historical forecast (40) reconciles to exact_match against the header.
    const fixed = reconcileQuota({ forecast: forecastHistoricalEventOddsCost({ requested_market_count: 4, requested_bookmaker_count: 10 }), observed_x_requests_last: 40 });
    assert.equal(fixed.delta_flag, 'exact_match');
    assert.equal(fixed.delta, 0);
  });

  it('worked GAP-29-magnitude example: per-event fix is 10×; ~42-event backfill = ~1,695 all-in', () => {
    // Per-event: the forecast quotaForecast owns corrects 4 → 40 (exactly 10×).
    const perEventOld = forecastEventOddsCost({ requested_market_count: 4, requested_bookmaker_count: 10 }); // 4 (superseded)
    const perEventNew = forecastHistoricalEventOddsCost({ requested_market_count: 4, requested_bookmaker_count: 10 }); // 40
    assert.equal(perEventNew / perEventOld, 10);
    // Aggregate in-window backfill: 42 events × 40 + ≤15 historical discovery calls × 1.
    const events = 42, discoveryCalls = 15;
    const allIn = events * perEventNew + discoveryCalls * forecastHistoricalEventDiscoveryCost();
    assert.equal(allIn, 1695); // ≈ the GAP-29 corrected backlog figure
    // The ~22× headline vs the superseded ~76 = 10× (this forecast fix) × ~2.2× (game
    // count 19→42, a SEPARATE correction not owned by quotaForecast). Documented, not
    // asserted as a quotaForecast property.
    assert.ok(allIn / (19 * perEventOld) > 20); // 1695 / 76 ≈ 22.3×
  });
});

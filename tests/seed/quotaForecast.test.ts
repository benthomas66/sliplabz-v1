// Ticket §8b required test:
//   #12: 40-credit default event forecast and header reconciliation

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  bookmakerRegionEquivalents,
  forecastHistoricalEventOddsCost,
  HISTORICAL_EVENTS_DEFAULT_FORECAST,
  nextRequestWouldExceedBudget,
  reconcileHistoricalQuota,
} from '../../src/seed/quotaForecast.js';

const fx = JSON.parse(
  readFileSync(
    new URL('../fixtures/seed/quota-headers-40-credit.json', import.meta.url),
    'utf8'
  )
);

describe('historical seed quota forecasting (§10.13, §14.11.2)', () => {
  it('bookmakerRegionEquivalents: 1–10 → 1; 11–20 → 2; 21–30 → 3', () => {
    assert.equal(bookmakerRegionEquivalents(1), 1);
    assert.equal(bookmakerRegionEquivalents(10), 1);
    assert.equal(bookmakerRegionEquivalents(11), 2);
    assert.equal(bookmakerRegionEquivalents(20), 2);
    assert.equal(bookmakerRegionEquivalents(21), 3);
    assert.equal(bookmakerRegionEquivalents(0), 0);
  });

  it('LOAD-BEARING #12: default 8-book × 4-market historical event-odds forecast = 40 credits', () => {
    const forecast = forecastHistoricalEventOddsCost({
      requested_market_count: fx.requested.market_count,
      requested_bookmaker_count: fx.requested.bookmaker_count,
    });
    assert.equal(forecast, 40);
  });

  it('LOAD-BEARING #12: observed x-requests-last = forecast → exact_match', () => {
    const forecast = forecastHistoricalEventOddsCost({
      requested_market_count: fx.requested.market_count,
      requested_bookmaker_count: fx.requested.bookmaker_count,
    });
    const rec = reconcileHistoricalQuota({
      forecast,
      observed_x_requests_last: fx.headers['x-requests-last'] as number,
    });
    assert.equal(rec.delta_flag, 'exact_match');
    assert.equal(rec.delta, 0);
  });

  it('divergence records flag; never silently patched', () => {
    const lower = reconcileHistoricalQuota({
      forecast: 40,
      observed_x_requests_last: 30,
    });
    assert.equal(lower.delta_flag, 'observed_lower_than_forecast');
    const higher = reconcileHistoricalQuota({
      forecast: 40,
      observed_x_requests_last: 80,
    });
    assert.equal(higher.delta_flag, 'observed_higher_than_forecast');
    const missing = reconcileHistoricalQuota({
      forecast: 40,
      observed_x_requests_last: null,
    });
    assert.equal(missing.delta_flag, 'observed_missing');
  });

  it('11-book × 4-market historical → 80 credits (2 region-equivalents)', () => {
    const forecast = forecastHistoricalEventOddsCost({
      requested_market_count: 4,
      requested_bookmaker_count: 11,
    });
    assert.equal(forecast, 80);
  });

  it('historical-events endpoint has its own separate budget (documented at 1 credit)', () => {
    assert.equal(HISTORICAL_EVENTS_DEFAULT_FORECAST, 1);
  });

  it('LOAD-BEARING: nextRequestWouldExceedBudget halts the pipeline BEFORE issuing the request', () => {
    // Stage 1 governor budget = 200.
    assert.equal(
      nextRequestWouldExceedBudget({
        credit_budget: 200,
        credits_observed_total: 160,
        next_forecast: 40,
      }),
      false
    );
    // But the very next request would tip over.
    assert.equal(
      nextRequestWouldExceedBudget({
        credit_budget: 200,
        credits_observed_total: 200,
        next_forecast: 40,
      }),
      true
    );
    // 199 + 40 = 239 > 200.
    assert.equal(
      nextRequestWouldExceedBudget({
        credit_budget: 200,
        credits_observed_total: 199,
        next_forecast: 40,
      }),
      true
    );
  });
});

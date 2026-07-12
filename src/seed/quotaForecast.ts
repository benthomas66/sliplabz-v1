// Historical seed quota forecasting per Odds §14.11.2 and complete spec §10.13.
//
// Authority:
//   Odds sub-spec §14.11.2:
//     `10 × regions or bookmaker-region equivalents × markets × events`
//     Region-equivalents follow `ceil(explicit bookmaker count / 10)`.
//     With up to ten explicit conventional sportsbook keys and four launch
//     markets, the forecast is 40 credits per event.
//     Response header `x-requests-last` remains authoritative.
//   Complete spec §10.13 same formula.
//   Ticket §8b required tests:
//     - 40-credit default event forecast and header reconciliation.
//
// This module reuses the V1-3 `bookmakerRegionEquivalents` (Odds §13.4) via
// re-implementation here to keep the seed module self-contained; the arithmetic
// is identical.

import type { QuotaDeltaFlag } from '../shared/enums.js';

/**
 * The historical-events endpoint has its own documented cost (Odds §14.11.2
 * last line: "Historical event discovery has its own documented cost and
 * should be budgeted separately."). Provider header is authoritative; we
 * forecast conservatively at 1 credit per discovery request.
 */
export const HISTORICAL_EVENTS_DEFAULT_FORECAST = 1;

/**
 * Historical odds cost per §14.11.2. Multiplier is 10× current.
 */
export function bookmakerRegionEquivalents(count: number): number {
  if (count <= 0) return 0;
  return Math.ceil(count / 10);
}

/**
 * Forecast credits for a single historical event-odds request:
 *   10 × requested_market_count × bookmaker_region_equivalents(requested_book_count)
 */
export function forecastHistoricalEventOddsCost(input: {
  readonly requested_market_count: number;
  readonly requested_bookmaker_count: number;
}): number {
  if (
    input.requested_market_count <= 0 ||
    input.requested_bookmaker_count <= 0
  )
    return 0;
  return (
    10 *
    input.requested_market_count *
    bookmakerRegionEquivalents(input.requested_bookmaker_count)
  );
}

/**
 * Header reconciliation identical to the V1-3 current-poll path but
 * expressed here so seed callers do not import the odds module.
 */
export interface HistoricalQuotaReconciliation {
  readonly forecast: number;
  readonly observed: number | null;
  readonly delta: number | null;
  readonly delta_flag: QuotaDeltaFlag;
}

export function reconcileHistoricalQuota(input: {
  readonly forecast: number;
  readonly observed_x_requests_last: number | null;
}): HistoricalQuotaReconciliation {
  if (input.observed_x_requests_last === null) {
    return Object.freeze({
      forecast: input.forecast,
      observed: null,
      delta: null,
      delta_flag: 'observed_missing' as const,
    });
  }
  const observed = input.observed_x_requests_last;
  if (observed === input.forecast) {
    return Object.freeze({
      forecast: input.forecast,
      observed,
      delta: 0,
      delta_flag: 'exact_match' as const,
    });
  }
  if (observed < input.forecast) {
    return Object.freeze({
      forecast: input.forecast,
      observed,
      delta: observed - input.forecast,
      delta_flag: 'observed_lower_than_forecast' as const,
    });
  }
  return Object.freeze({
    forecast: input.forecast,
    observed,
    delta: observed - input.forecast,
    delta_flag: 'observed_higher_than_forecast' as const,
  });
}

/**
 * Budget-approach predicate. Returns true when issuing a request costing
 * `next_forecast` credits would exceed the run's credit_budget. The seed
 * pipeline consults this BEFORE every request and halts on true.
 */
export function nextRequestWouldExceedBudget(input: {
  readonly credit_budget: number;
  readonly credits_observed_total: number;
  readonly next_forecast: number;
}): boolean {
  return (
    input.credits_observed_total + input.next_forecast > input.credit_budget
  );
}

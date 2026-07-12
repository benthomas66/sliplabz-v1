// Odds API quota forecasting & reconciliation.
//
// Authority:
//   Odds sub-spec §8 (response quota headers)
//   Odds sub-spec §13.2–§13.4 (10-book vs 11+-book equivalents)
//   Odds sub-spec §13.6 (returned coverage does not determine cost)
//   Odds sub-spec §13.8 (quota forecasting contract; header authoritative)
//   Odds sub-spec §14.6, §14.7 (official quota formula)
//   Odds sub-spec §21 (quota budgeting and safeguards)
//   Ticket V1-3 hard invariant: quota forecast must reconcile against the
//     response headers; divergence is recorded, never ignored.

import type { QuotaDeltaFlag } from '../shared/enums.js';

/**
 * Odds §13.3–§13.4 / §14.6:
 *   1–10 explicit bookmaker keys  → 1 region-equivalent
 *   11–20 explicit bookmaker keys → 2 region-equivalents
 *   continue by groups of 10.
 */
export function bookmakerRegionEquivalents(
  requested_bookmaker_count: number
): number {
  if (requested_bookmaker_count <= 0) return 0;
  return Math.ceil(requested_bookmaker_count / 10);
}

/**
 * Forecast for an event-odds request per §13.8:
 *   requested_market_count × bookmaker_region_equivalents
 *
 * The forecast uses REQUESTED bookmaker count (§13.6 — returned coverage
 * does not determine cost). Header remains authoritative.
 */
export function forecastEventOddsCost(inputs: {
  readonly requested_market_count: number;
  readonly requested_bookmaker_count: number;
}): number {
  if (
    inputs.requested_market_count <= 0 ||
    inputs.requested_bookmaker_count <= 0
  )
    return 0;
  return (
    inputs.requested_market_count *
    bookmakerRegionEquivalents(inputs.requested_bookmaker_count)
  );
}

/**
 * §14.7 empty-odds free rule: an event-odds request that returns no odds
 * data does not consume quota. The forecast still uses worst-case billable
 * markets per §21; observed cost is the source of truth.
 */
export function forecastEventDiscoveryCost(): number {
  // §14.2: the events endpoint does not count against quota.
  return 0;
}

export interface QuotaReconciliationInput {
  readonly forecast: number;
  readonly observed_x_requests_last: number | null;
}

export interface QuotaReconciliation {
  readonly forecast: number;
  readonly observed: number | null;
  readonly delta_flag: QuotaDeltaFlag;
  readonly delta: number | null;
}

/**
 * Reconcile the forecast against `x-requests-last`. Divergences are
 * recorded, NEVER silently patched. This is the load-bearing check for
 * ticket-required acceptance criterion D.
 */
export function reconcileQuota(
  input: QuotaReconciliationInput
): QuotaReconciliation {
  if (input.observed_x_requests_last === null) {
    return Object.freeze({
      forecast: input.forecast,
      observed: null,
      delta_flag: 'observed_missing' as const,
      delta: null,
    });
  }
  const observed = input.observed_x_requests_last;
  if (observed === input.forecast) {
    return Object.freeze({
      forecast: input.forecast,
      observed,
      delta_flag: 'exact_match' as const,
      delta: 0,
    });
  }
  if (observed < input.forecast) {
    return Object.freeze({
      forecast: input.forecast,
      observed,
      delta_flag: 'observed_lower_than_forecast' as const,
      delta: observed - input.forecast,
    });
  }
  return Object.freeze({
    forecast: input.forecast,
    observed,
    delta_flag: 'observed_higher_than_forecast' as const,
    delta: observed - input.forecast,
  });
}

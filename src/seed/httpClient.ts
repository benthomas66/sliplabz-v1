// Historical-endpoint HTTP client for the V1-4b seed pipeline.
//
// Authority:
//   Odds sub-spec §14.11 (historical events + historical event odds endpoints)
//   Odds sub-spec §14.1 (API key as `apiKey` query param, redacted from logs)
//   Complete spec §10.13 (historical seed requests)
//   Ticket §8b: live calls ONLY through the live-invoke gate.
//
// This client:
//   * mirrors the V1-3 Odds HTTP shape (injected fetch; retained rate-limit
//     headers; content-type-aware body parsing) but points at the historical
//     endpoints;
//   * takes an already-verified `OddsapiHttpConfig` produced by
//     `buildLiveOddsapiConfig` in the live-invoke gate; tests inject a
//     fixture-backed fetch;
//   * emits redacted request URLs; the API key is NEVER logged or persisted.

import type {
  OddsapiHttpConfig,
  OddsapiRequestResult,
} from '../odds/httpClient.js';
import { buildOddsapiUrl, oddsapiRequest } from '../odds/httpClient.js';

const SPORT_KEY = 'basketball_wnba';

export interface HistoricalEventsRequest {
  readonly api_key: string;
  /** ISO-8601 timestamp — the historical snapshot boundary. */
  readonly at_timestamp: string;
  readonly commence_time_from?: string;
  readonly commence_time_to?: string;
}

export interface HistoricalEventOddsRequest {
  readonly api_key: string;
  readonly at_timestamp: string;
  readonly provider_event_id: string;
  readonly market_keys: ReadonlyArray<string>;
  readonly bookmaker_keys: ReadonlyArray<string>;
  readonly odds_format?: 'american' | 'decimal';
  readonly include_multipliers?: boolean;
}

export function buildHistoricalEventsUrl(
  cfg: Pick<OddsapiHttpConfig, 'base_url'>,
  input: HistoricalEventsRequest
): string {
  const query: Record<string, string | number | ReadonlyArray<string>> = {
    date: input.at_timestamp,
  };
  if (input.commence_time_from !== undefined) {
    query['commenceTimeFrom'] = input.commence_time_from;
  }
  if (input.commence_time_to !== undefined) {
    query['commenceTimeTo'] = input.commence_time_to;
  }
  return buildOddsapiUrl(cfg, {
    path: `/v4/historical/sports/${SPORT_KEY}/events`,
    query,
    api_key: input.api_key,
  });
}

export function buildHistoricalEventOddsUrl(
  cfg: Pick<OddsapiHttpConfig, 'base_url'>,
  input: HistoricalEventOddsRequest
): string {
  const query: Record<string, string | number | ReadonlyArray<string>> = {
    date: input.at_timestamp,
    markets: input.market_keys,
    bookmakers: input.bookmaker_keys,
    oddsFormat: input.odds_format ?? 'american',
  };
  if (input.include_multipliers === true) {
    query['includeMultipliers'] = 'true';
  }
  return buildOddsapiUrl(cfg, {
    path: `/v4/historical/sports/${SPORT_KEY}/events/${input.provider_event_id}/odds`,
    query,
    api_key: input.api_key,
  });
}

/**
 * Discover historical events at the requested snapshot timestamp. The
 * provider returns a snapshot envelope; the caller extracts `.data`.
 */
export function fetchHistoricalEvents(
  cfg: OddsapiHttpConfig,
  input: HistoricalEventsRequest
): Promise<OddsapiRequestResult> {
  return oddsapiRequest(cfg, {
    path: `/v4/historical/sports/${SPORT_KEY}/events`,
    query: buildEventsQuery(input),
    api_key: input.api_key,
  });
}

function buildEventsQuery(
  input: HistoricalEventsRequest
): Readonly<Record<string, string | number | ReadonlyArray<string>>> {
  const q: Record<string, string | number | ReadonlyArray<string>> = {
    date: input.at_timestamp,
  };
  if (input.commence_time_from !== undefined)
    q['commenceTimeFrom'] = input.commence_time_from;
  if (input.commence_time_to !== undefined)
    q['commenceTimeTo'] = input.commence_time_to;
  return Object.freeze(q);
}

/**
 * Fetch historical event odds at the close-boundary snapshot timestamp.
 */
export function fetchHistoricalEventOdds(
  cfg: OddsapiHttpConfig,
  input: HistoricalEventOddsRequest
): Promise<OddsapiRequestResult> {
  return oddsapiRequest(cfg, {
    path: `/v4/historical/sports/${SPORT_KEY}/events/${input.provider_event_id}/odds`,
    query: {
      date: input.at_timestamp,
      markets: input.market_keys,
      bookmakers: input.bookmaker_keys,
      oddsFormat: input.odds_format ?? 'american',
      ...(input.include_multipliers === true
        ? { includeMultipliers: 'true' }
        : {}),
    },
    api_key: input.api_key,
  });
}

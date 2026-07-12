// Odds API ingestion-run lifecycle helpers.
//
// Authority:
//   Odds sub-spec §15.1 (every request creates an immutable ingestion record)
//   Odds sub-spec §22 (redact API key from stored request URLs)
//   Complete spec §11.4 odds_ingestion_runs
//   Ticket V1-3 hard invariants:
//     - Empty success and failed poll produce distinguishable stored states;
//     - Quota forecast reconciles against response headers; divergence recorded.

import type {
  OddsapiRunClosed,
  OddsapiRunOpen,
  OddsapiRunOpenInput,
} from './types.js';
import type { OddsapiRunState } from '../shared/enums.js';

/**
 * REDACTED sentinel that must replace the `apiKey` query parameter before
 * a request URL is persisted anywhere.
 */
export const API_KEY_REDACTION = 'REDACTED';

/**
 * Replace the `apiKey` query parameter with `REDACTED`, preserving all
 * other parameters. Returns the input unchanged when the URL cannot be parsed.
 */
export function redactApiKey(url: string): string {
  try {
    const u = new URL(url);
    if (u.searchParams.has('apiKey')) {
      u.searchParams.set('apiKey', API_KEY_REDACTION);
    }
    return u.toString();
  } catch {
    return url;
  }
}

export function openRun(input: OddsapiRunOpenInput): OddsapiRunOpen {
  const redacted =
    input.redacted_request_url !== undefined
      ? redactApiKey(input.redacted_request_url)
      : null;
  return Object.freeze({
    oddsapi_ingestion_run_id: input.oddsapi_ingestion_run_id,
    request_kind: input.request_kind,
    endpoint: input.endpoint,
    requested_provider_event_id: input.requested_provider_event_id ?? null,
    requested_market_keys: Object.freeze(
      (input.requested_market_keys ?? []).slice()
    ) as ReadonlyArray<string>,
    requested_bookmaker_keys: Object.freeze(
      (input.requested_bookmaker_keys ?? []).slice()
    ) as ReadonlyArray<string>,
    requested_regions: Object.freeze(
      (input.requested_regions ?? []).slice()
    ) as ReadonlyArray<string>,
    requested_effective_time: input.requested_effective_time ?? null,
    request_params: Object.freeze({ ...(input.request_params ?? {}) }),
    redacted_request_url: redacted,
    started_at: input.started_at,
    result_state: 'running' as const,
  });
}

export interface CloseRunInput {
  readonly open: OddsapiRunOpen;
  readonly completed_at: string;
  readonly http_status_last: number | null;
  readonly content_type_last: string | null;
  readonly response_headers_last: Readonly<Record<string, string | number>>;
  readonly result_state: OddsapiRunState;
  readonly failure_detail: string | null;
  readonly quota_forecast: number | null;
  readonly quota_observed: number | null;
  readonly quota_delta_flag: string | null;
  readonly x_requests_used: number | null;
  readonly x_requests_remaining: number | null;
  readonly x_requests_last: number | null;
  readonly parser_version?: number;
  readonly normalization_version?: number;
}

export function closeRun(input: CloseRunInput): OddsapiRunClosed {
  if (input.result_state === 'running') {
    throw new Error(
      `closeRun called with result_state='running'; use openRun to build in-flight state`
    );
  }
  if (input.completed_at === '') {
    throw new Error(`closeRun requires a completed_at timestamp`);
  }
  return Object.freeze({
    oddsapi_ingestion_run_id: input.open.oddsapi_ingestion_run_id,
    request_kind: input.open.request_kind,
    endpoint: input.open.endpoint,
    requested_provider_event_id: input.open.requested_provider_event_id,
    requested_market_keys: input.open.requested_market_keys,
    requested_bookmaker_keys: input.open.requested_bookmaker_keys,
    requested_regions: input.open.requested_regions,
    requested_effective_time: input.open.requested_effective_time,
    request_params: input.open.request_params,
    redacted_request_url: input.open.redacted_request_url,
    started_at: input.open.started_at,
    completed_at: input.completed_at,
    http_status_last: input.http_status_last,
    content_type_last: input.content_type_last,
    response_headers_last: Object.freeze({
      ...input.response_headers_last,
    }) as Readonly<Record<string, string | number>>,
    result_state: input.result_state,
    failure_detail: input.failure_detail,
    quota_forecast: input.quota_forecast,
    quota_observed: input.quota_observed,
    quota_delta_flag: input.quota_delta_flag,
    x_requests_used: input.x_requests_used,
    x_requests_remaining: input.x_requests_remaining,
    x_requests_last: input.x_requests_last,
    parser_version: input.parser_version ?? 1,
    normalization_version: input.normalization_version ?? 1,
  });
}

/**
 * Predicate governing whether an ingestion run's snapshots are eligible to
 * become the "current" snapshot for their (event, book, market) triple.
 * Both `complete` and `successful_empty` are eligible per §16.1; every
 * failure state is NOT.
 */
export function runOverwritesLastValidSnapshot(run: OddsapiRunClosed): boolean {
  return run.result_state === 'complete' || run.result_state === 'successful_empty';
}

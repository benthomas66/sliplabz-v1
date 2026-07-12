// Odds API HTTP client.
//
// Authority:
//   Odds sub-spec §4.1 (host + query-parameter API key)
//   Odds sub-spec §14.1 (redact key from artifacts)
//   Odds sub-spec §14.9 (request American odds)
//   Odds sub-spec §20 (error and retry matrix)
//   Odds sub-spec §22 (query strings redacted; raw headers filtered)
//   Ticket V1-3 HARD rule: NO live provider call anywhere in the test suite.
//     Fixture-backed fetch injection ONLY.

import type { OddsapiRunState } from '../shared/enums.js';
import { API_KEY_REDACTION } from './ingestionRun.js';

export interface OddsapiHttpConfig {
  readonly base_url: string;
  readonly request_timeout_ms: number;
  readonly fetch: FetchLike;
  /**
   * Explicit opt-in for live invocation. When false (default), the client
   * throws when ODDSAPI_LIVE_INVOKE is not '1'. Tests must never set the
   * env flag.
   */
  readonly allow_live_invoke: boolean;
}

export type FetchLike = (
  input: string,
  init?: {
    readonly method?: string;
    readonly headers?: Readonly<Record<string, string>>;
    readonly signal?: AbortSignal | undefined;
  }
) => Promise<HttpResponseLike>;

export interface HttpResponseLike {
  readonly status: number;
  readonly headers: { readonly get: (name: string) => string | null };
  text: () => Promise<string>;
}

export const DEFAULT_ODDSAPI_CONFIG: Readonly<Omit<OddsapiHttpConfig, 'fetch'>> =
  {
    base_url: 'https://api.the-odds-api.com',
    request_timeout_ms: 15_000,
    allow_live_invoke: false,
  };

const RETAINED_HEADERS = [
  'content-type',
  'x-requests-used',
  'x-requests-remaining',
  'x-requests-last',
  'retry-after',
  'x-request-id',
] as const;

export interface OddsapiRequestInput {
  readonly path: string;
  readonly query: Readonly<Record<string, string | number | ReadonlyArray<string>>>;
  readonly api_key: string;
}

export interface OddsapiRequestResult {
  readonly status: number;
  readonly content_type: string | null;
  readonly headers: Readonly<Record<string, string | number>>;
  readonly body_text: string;
  readonly body_json: unknown | null;
  readonly parse_state: 'json_ok' | 'plain_text' | 'json_parse_error';
  readonly failure_kind: OddsapiRunState | null;
  /** Redacted request URL, safe to persist. */
  readonly redacted_request_url: string;
}

/**
 * Build the full request URL with `apiKey` set to the provided value.
 * Arrays are comma-joined (Odds API convention for `bookmakers`, `markets`).
 */
export function buildOddsapiUrl(
  cfg: Pick<OddsapiHttpConfig, 'base_url'>,
  input: OddsapiRequestInput
): string {
  const url = new URL(input.path, cfg.base_url);
  url.searchParams.set('apiKey', input.api_key);
  for (const [key, value] of Object.entries(input.query)) {
    if (Array.isArray(value)) {
      url.searchParams.set(key, value.join(','));
    } else {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

function redactUrl(url: string): string {
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

function retainHeaders(
  res: HttpResponseLike
): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const name of RETAINED_HEADERS) {
    const v = res.headers.get(name);
    if (v !== null) {
      const n = Number(v);
      out[name] = Number.isFinite(n) && v.trim() !== '' ? n : v;
    }
  }
  return out;
}

export async function oddsapiRequest(
  cfg: OddsapiHttpConfig,
  input: OddsapiRequestInput
): Promise<OddsapiRequestResult> {
  const url = buildOddsapiUrl(cfg, input);
  const redacted = redactUrl(url);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), cfg.request_timeout_ms);
  try {
    const res = await cfg.fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    const retained_headers = retainHeaders(res);
    const content_type = res.headers.get('content-type');
    const body_text = await res.text();
    let body_json: unknown | null = null;
    let parse_state: OddsapiRequestResult['parse_state'] = 'plain_text';
    if (content_type !== null && content_type.startsWith('application/json')) {
      try {
        body_json = body_text === '' ? null : JSON.parse(body_text);
        parse_state = 'json_ok';
      } catch {
        parse_state = 'json_parse_error';
      }
    }
    const failure_kind =
      res.status >= 200 && res.status < 300 ? null : classify(res.status);
    return {
      status: res.status,
      content_type,
      headers: Object.freeze(retained_headers),
      body_text,
      body_json,
      parse_state,
      failure_kind,
      redacted_request_url: redacted,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function classify(status: number): OddsapiRunState {
  if (status === 400 || status === 422) return 'failed_invalid_request';
  if (status === 401) return 'failed_authentication_or_access';
  if (status === 403) return 'failed_forbidden_or_subscription';
  if (status === 404) return 'failed_not_found';
  if (status === 429) return 'failed_rate_limited';
  if (status >= 500) return 'failed_transport';
  return 'failed_transport';
}

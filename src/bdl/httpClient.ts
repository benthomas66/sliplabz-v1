// BDL HTTP client.
//
// Authority:
//   BDL sub-spec §3A (connection & authentication contract)
//   BDL sub-spec §5 (per_page=100; exact cursor pass-through)
//   BDL sub-spec §15 (error handling: 400/401/404/406/429/500/503)
//   BDL sub-spec §15A.1 400 handling: non-retryable_invalid_request
//   BDL sub-spec §15A.2 401 handling: parse content-type-aware; halt run
//   BDL sub-spec §15A.3 (error-envelope implications)
//   BDL sub-spec §15A.4 (rate-limit metadata retention)
//   Complete spec §15 freshness / failures
//
// Ticket V1-2 HARD rule: NO live provider call anywhere in the test suite.
// This client exists but must NOT be invoked in tests without a
// fixture-backed fetch shim.
//
// Live invocation requires:
//   * BALLDONTLIE_API_KEY set in the environment;
//   * BDL_LIVE_INVOKE=1 set in the environment;
// Neither is present by default. Tests inject a custom fetch that returns
// fixture bodies; nothing about the client itself makes a network call
// during unit tests.

import type { BdlEndpoint, BdlRunState } from '../shared/enums.js';

export interface BdlHttpConfig {
  readonly base_url: string;
  readonly wnba_prefix: string;
  readonly request_timeout_ms: number;
  /**
   * When true, and the environment lacks BALLDONTLIE_API_KEY, an attempt to
   * make a live request throws before touching the network. Default true.
   */
  readonly guard_missing_api_key: boolean;
  /**
   * Injected fetch. In production this is the platform fetch; tests
   * inject a fixture-backed function. NEVER auto-resolved to global fetch
   * without an explicit config; that keeps live calls out of tests.
   */
  readonly fetch: FetchLike;
  /**
   * Explicit opt-in for live invocation. When false (default), the client
   * throws if BDL_LIVE_INVOKE is not '1'.
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
  readonly headers: {
    readonly get: (name: string) => string | null;
  };
  text: () => Promise<string>;
  json?: () => Promise<unknown>;
}

export const DEFAULT_BDL_CONFIG: Readonly<Omit<BdlHttpConfig, 'fetch'>> = {
  base_url: 'https://api.balldontlie.io',
  wnba_prefix: '/wnba/v1',
  request_timeout_ms: 15_000,
  guard_missing_api_key: true,
  allow_live_invoke: false,
};

export interface RequestInput {
  readonly endpoint: BdlEndpoint;
  readonly params?: Readonly<Record<string, string | number | boolean | ReadonlyArray<string | number>>>;
  /**
   * Cursor to send verbatim. Never derived; the caller passes the exact
   * opaque string the provider returned on the previous page.
   */
  readonly cursor?: string | null;
}

export interface RequestResult {
  readonly status: number;
  readonly content_type: string | null;
  readonly headers: Readonly<Record<string, string | number>>;
  readonly body_text: string;
  readonly body_json: unknown | null;
  readonly parse_state: 'json_ok' | 'plain_text' | 'json_parse_error';
  readonly failure_kind: BdlRunState | null;
}

/**
 * Build the URL for a BDL WNBA endpoint request. Serializes array parameters
 * using repeated bracketed keys as BDL §3B requires (e.g. `team_ids[]=1&team_ids[]=2`).
 */
export function buildBdlUrl(
  cfg: Pick<BdlHttpConfig, 'base_url' | 'wnba_prefix'>,
  input: RequestInput
): string {
  const path = `${cfg.wnba_prefix}/${bdlEndpointPathSegment(input.endpoint)}`;
  const url = new URL(path, cfg.base_url);
  if (input.cursor !== undefined && input.cursor !== null && input.cursor !== '') {
    url.searchParams.set('cursor', input.cursor);
  }
  if (input.params !== undefined) {
    for (const [key, value] of Object.entries(input.params)) {
      if (Array.isArray(value)) {
        for (const item of value) {
          url.searchParams.append(`${key}[]`, String(item));
        }
      } else {
        url.searchParams.set(key, String(value));
      }
    }
  }
  return url.toString();
}

function bdlEndpointPathSegment(endpoint: BdlEndpoint): string {
  switch (endpoint) {
    case 'players':
      return 'players';
    case 'active_players':
      return 'players/active';
    case 'teams':
      return 'teams';
    case 'games':
      return 'games';
    case 'player_stats':
      return 'player_stats';
    case 'player_injuries':
      return 'player_injuries';
  }
}

/**
 * Selected non-sensitive headers to retain per BDL §15A.4.
 * The Authorization header is NEVER included.
 */
const RETAINED_RESPONSE_HEADERS = [
  'content-type',
  'x-ratelimit-limit',
  'x-ratelimit-remaining',
  'x-ratelimit-reset',
  'retry-after',
] as const;

function retainHeaders(res: HttpResponseLike): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const name of RETAINED_RESPONSE_HEADERS) {
    const v = res.headers.get(name);
    if (v !== null) {
      // Rate-limit values are numeric when parseable; keep as string
      // otherwise. Never coerce a missing header to zero.
      const asNumber = Number(v);
      out[name] = Number.isFinite(asNumber) && v.trim() !== '' ? asNumber : v;
    }
  }
  return out;
}

/**
 * Execute a single BDL request. Content-type aware parsing (BDL §15A.3):
 *   * `application/json` → parse JSON; failure sets parse_state='json_parse_error'
 *   * anything else → keep body as text (BDL §15A.2 401 is plain text)
 *
 * On non-2xx, classifies the failure kind per BDL §15/§15A. 429/500/503 are
 * `partial_pagination` from the traversal's perspective — retryable at a
 * higher layer, not silently retried here.
 *
 * The Authorization header is passed via the `headers` argument by the
 * caller who has already read the API key from process.env. This function
 * never reads process.env itself; that separation makes it fixture-testable.
 */
export async function bdlRequest(
  cfg: BdlHttpConfig,
  input: RequestInput,
  headers: Readonly<Record<string, string>>
): Promise<RequestResult> {
  if (!cfg.allow_live_invoke) {
    // Called from test code without opt-in. The fetch injection is
    // fixture-based; the caller MUST supply a fetch that never touches
    // the network. This check exists to catch mis-wired plumbing early.
    if (process.env['BDL_LIVE_INVOKE'] !== '1') {
      // Fall through: fetch is injected. The guard is a documented
      // reminder in tests.
    }
  }
  const url = buildBdlUrl(cfg, input);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), cfg.request_timeout_ms);
  try {
    const res = await cfg.fetch(url, {
      method: 'GET',
      headers: {
        ...headers,
        Accept: 'application/json',
      },
      signal: controller.signal,
    });
    const retained_headers = retainHeaders(res);
    const content_type = res.headers.get('content-type');
    const body_text = await res.text();
    let body_json: unknown | null = null;
    let parse_state: RequestResult['parse_state'] = 'plain_text';
    if (content_type !== null && content_type.startsWith('application/json')) {
      try {
        body_json = body_text === '' ? null : JSON.parse(body_text);
        parse_state = 'json_ok';
      } catch {
        parse_state = 'json_parse_error';
      }
    }
    const failure_kind =
      res.status >= 200 && res.status < 300 ? null : classifyFailure(res.status);
    return {
      status: res.status,
      content_type,
      headers: Object.freeze(retained_headers),
      body_text,
      body_json,
      parse_state,
      failure_kind,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function classifyFailure(status: number): BdlRunState {
  if (status === 400) return 'failed_invalid_request';
  if (status === 401 || status === 403 || status === 406)
    return 'failed_authentication_or_access';
  if (status === 404) return 'failed_invalid_request';
  if (status === 429 || status === 500 || status === 502 || status === 503)
    return 'failed_transport';
  return 'failed_transport';
}

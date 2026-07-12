// Live-invoke gate.
//
// Authority:
//   Ticket V1-4 review obligation: "src/odds/httpClient.ts documents an
//   allow_live_invoke guard that no code currently enforces. The V1-4
//   orchestration layer is where a config with a real fetch is constructed;
//   that construction site MUST enforce the gate (refuse to build a
//   live-fetch config unless allow_live_invoke is true AND the
//   ODDSAPI_LIVE_INVOKE/BDL_LIVE_INVOKE env opt-in is present), with a test
//   proving tests cannot reach a live config."
//
// This module is the ONLY sanctioned construction site for provider HTTP
// configs that use the platform `fetch`. Any consumer that wants to make a
// real outbound HTTP request MUST go through here. Tests that inject a
// custom fetch bypass this module entirely — they never need to; this
// module refuses to construct a config for them.

import {
  DEFAULT_BDL_CONFIG,
  type BdlHttpConfig,
  type FetchLike as BdlFetch,
} from '../bdl/httpClient.js';
import {
  DEFAULT_ODDSAPI_CONFIG,
  type OddsapiHttpConfig,
  type FetchLike as OddsapiFetch,
} from '../odds/httpClient.js';

export class LiveInvokeGateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LiveInvokeGateError';
  }
}

export interface LiveInvokeEnv {
  readonly ODDSAPI_LIVE_INVOKE?: string;
  readonly BDL_LIVE_INVOKE?: string;
  readonly NODE_ENV?: string;
}

function readEnv(env?: LiveInvokeEnv): LiveInvokeEnv {
  return env ?? (process.env as LiveInvokeEnv);
}

/**
 * Refuse to construct a live-fetch config for the Odds API unless BOTH:
 *   * the caller explicitly set `allow_live_invoke = true`;
 *   * the environment has `ODDSAPI_LIVE_INVOKE=1`.
 *
 * Throws `LiveInvokeGateError` when either condition is missing. Tests must
 * never satisfy both simultaneously.
 */
export function buildLiveOddsapiConfig(input: {
  readonly allow_live_invoke: boolean;
  readonly fetch?: OddsapiFetch;
  readonly env?: LiveInvokeEnv;
}): OddsapiHttpConfig {
  const env = readEnv(input.env);
  if (input.allow_live_invoke !== true) {
    throw new LiveInvokeGateError(
      'buildLiveOddsapiConfig: allow_live_invoke must be true; refusing to build a live Odds API config'
    );
  }
  if (env.ODDSAPI_LIVE_INVOKE !== '1') {
    throw new LiveInvokeGateError(
      'buildLiveOddsapiConfig: ODDSAPI_LIVE_INVOKE=1 not set in environment; refusing to build a live Odds API config'
    );
  }
  const fetch = input.fetch ?? (globalThis.fetch as unknown as OddsapiFetch);
  if (typeof fetch !== 'function') {
    throw new LiveInvokeGateError(
      'buildLiveOddsapiConfig: no fetch available in runtime; cannot build live config'
    );
  }
  return Object.freeze({
    ...DEFAULT_ODDSAPI_CONFIG,
    fetch,
    allow_live_invoke: true,
  });
}

/**
 * BALLDONTLIE mirror of the Odds gate. Same rules.
 */
export function buildLiveBdlConfig(input: {
  readonly allow_live_invoke: boolean;
  readonly fetch?: BdlFetch;
  readonly env?: LiveInvokeEnv;
}): BdlHttpConfig {
  const env = readEnv(input.env);
  if (input.allow_live_invoke !== true) {
    throw new LiveInvokeGateError(
      'buildLiveBdlConfig: allow_live_invoke must be true; refusing to build a live BDL config'
    );
  }
  if (env.BDL_LIVE_INVOKE !== '1') {
    throw new LiveInvokeGateError(
      'buildLiveBdlConfig: BDL_LIVE_INVOKE=1 not set in environment; refusing to build a live BDL config'
    );
  }
  const fetch = input.fetch ?? (globalThis.fetch as unknown as BdlFetch);
  if (typeof fetch !== 'function') {
    throw new LiveInvokeGateError(
      'buildLiveBdlConfig: no fetch available in runtime; cannot build live config'
    );
  }
  return Object.freeze({
    ...DEFAULT_BDL_CONFIG,
    fetch,
    allow_live_invoke: true,
  });
}

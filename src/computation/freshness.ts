// V1-5 freshness state per Odds §19.2 + spec §15.
//
// One owner. Freshness is a function of (latest_observed_at, now, poll_state)
// only. Product surfaces display the state; they never independently compute
// the label from the timestamp.

import { methodVersionOf } from './computationVersion.js';
import type { FreshnessState } from '../shared/enums.js';
import type { FreshnessResult } from './types.js';

/** Provisional thresholds subject to Odds §23.2 audit; documented in the
 *  computation contract. Callers can override for tests but never for
 *  product code paths — a change requires methodology review. */
export const FRESHNESS_FRESH_SECONDS = 90;
export const FRESHNESS_AGING_SECONDS = 300;
export const FRESHNESS_STALE_SECONDS = 900;

export interface FreshnessInput {
  /** Most recent self_observed observation for the grain. */
  readonly last_observed_at: string | null;
  readonly now: string;
  /** True when the latest poll for the source succeeded. */
  readonly last_poll_succeeded: boolean;
  /** True when the source is entirely unavailable this cycle. */
  readonly source_unavailable: boolean;
}

export function computeFreshness(input: FreshnessInput): FreshnessResult {
  if (input.source_unavailable) {
    return Object.freeze({
      state: 'unavailable' as FreshnessState,
      last_observed_at: input.last_observed_at,
      method_version: methodVersionOf('freshness'),
    });
  }
  if (!input.last_poll_succeeded) {
    return Object.freeze({
      state: 'failed_latest_poll' as FreshnessState,
      last_observed_at: input.last_observed_at,
      method_version: methodVersionOf('freshness'),
    });
  }
  if (input.last_observed_at === null) {
    return Object.freeze({
      state: 'unavailable' as FreshnessState,
      last_observed_at: null,
      method_version: methodVersionOf('freshness'),
    });
  }
  const ageSec = Math.max(0,
    Math.round((Date.parse(input.now) - Date.parse(input.last_observed_at)) / 1000));
  let state: FreshnessState;
  if (ageSec <= FRESHNESS_FRESH_SECONDS) state = 'fresh';
  else if (ageSec <= FRESHNESS_AGING_SECONDS) state = 'aging';
  else if (ageSec <= FRESHNESS_STALE_SECONDS) state = 'stale';
  else state = 'unavailable';
  return Object.freeze({
    state,
    last_observed_at: input.last_observed_at,
    method_version: methodVersionOf('freshness'),
  });
}

/**
 * True when a grain's freshness state is eligible for use in current-line
 * selection and consensus. Stale sources are excluded per §15.2.
 */
export function isFreshEnoughForConsensus(state: FreshnessState): boolean {
  return state === 'fresh' || state === 'aging';
}

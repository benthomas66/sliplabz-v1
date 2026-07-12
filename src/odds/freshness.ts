// Freshness state per Odds §19.2 and complete spec §15.
//
// Product thresholds only, NOT provider guarantees. Storage semantics:
//   * `provider_last_update` is the provider's market-level timestamp.
//   * `observed_at` is SlipLabz retrieval time.
//   * The freshness state is a function of `now - provider_last_update`.
//
// Failure states are set explicitly by the ingestion path:
//   * `failed_latest_poll` when the latest poll failed;
//   * `unavailable` when no provider_last_update was ever observed.

import type { FreshnessState } from '../shared/enums.js';

export const FRESH_THRESHOLD_SECONDS = 10 * 60;
export const AGING_THRESHOLD_SECONDS = 30 * 60;

export interface FreshnessInputs {
  readonly provider_last_update: string | null; // ISO-8601
  readonly now: string; // ISO-8601
  /** Whether the LATEST poll for the same event/book/market failed. */
  readonly latest_poll_failed: boolean;
}

/**
 * Return the freshness classification for one market snapshot.
 *
 * Rules per Odds §19.2:
 *   * failed_latest_poll takes precedence when true;
 *   * provider_last_update == null → `unavailable`;
 *   * age ≤ FRESH_THRESHOLD_SECONDS → `fresh`;
 *   * age ≤ AGING_THRESHOLD_SECONDS → `aging`;
 *   * otherwise `stale`.
 */
export function classifyFreshness(inputs: FreshnessInputs): FreshnessState {
  if (inputs.latest_poll_failed) return 'failed_latest_poll';
  if (inputs.provider_last_update === null) return 'unavailable';
  const provider_ms = Date.parse(inputs.provider_last_update);
  const now_ms = Date.parse(inputs.now);
  if (!Number.isFinite(provider_ms) || !Number.isFinite(now_ms))
    return 'unavailable';
  const age_seconds = (now_ms - provider_ms) / 1000;
  if (age_seconds < 0) return 'fresh'; // provider timestamp is in the future — trust it
  if (age_seconds <= FRESH_THRESHOLD_SECONDS) return 'fresh';
  if (age_seconds <= AGING_THRESHOLD_SECONDS) return 'aging';
  return 'stale';
}

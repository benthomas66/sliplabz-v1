// Historical close-capture staleness evaluation.
//
// Authority:
//   Complete spec §7.10 (close boundary)
//   Complete spec §7.10.1 (a snapshot more than 10 minutes before the close
//     boundary is ineligible and receives `close_capture_stale`; the
//     threshold is configuration-backed but may not be loosened without
//     methodology review)
//   Odds sub-spec §14.11.1 rule 6 (reject snapshot >10 min before boundary)
//   Ticket §8b required behavior: reject any returned snapshot more than
//     10 minutes before the close boundary.
//   Ticket §8b required tests:
//     - snapshot returned within 10 minutes before requested close boundary
//     - snapshot more than 10 minutes before close (`close_capture_stale`)

import type { CloseCaptureEvaluation } from './types.js';

/**
 * Approved close-capture staleness threshold. NOT configurable per spec
 * §7.10.1 without methodology review — a code-only change is not authorized.
 */
export const CLOSE_CAPTURE_STALENESS_THRESHOLD_SECONDS = 10 * 60;

export interface EvaluateCloseCaptureInput {
  readonly requested_close_boundary_utc: string;
  readonly returned_snapshot_ts: string | null;
}

/**
 * Evaluate whether a historical snapshot is close-capture eligible.
 *
 * Rules (§7.10.1 / §14.11.1):
 *   * `returned_snapshot_ts === null` → `no_snapshot`.
 *   * `returned_snapshot_ts > requested_close_boundary_utc` → `close_capture_stale`
 *     (the provider returned a snapshot AFTER the requested boundary; the
 *     endpoint contract is "at or before the requested timestamp", so a
 *     future-side response is treated as ineligible; this is the same
 *     eligibility signal as a stale response).
 *   * `age_seconds > threshold` → `close_capture_stale`.
 *   * `0 <= age_seconds <= threshold` → `eligible`.
 *
 * `age_seconds` = `requested_close_boundary_utc - returned_snapshot_ts` (in
 * seconds; positive when the snapshot precedes the boundary).
 */
export function evaluateCloseCapture(
  input: EvaluateCloseCaptureInput
): CloseCaptureEvaluation {
  if (input.returned_snapshot_ts === null) {
    return Object.freeze({
      requested_close_boundary_utc: input.requested_close_boundary_utc,
      returned_snapshot_ts: null,
      age_seconds_before_boundary: null,
      close_capture_state: 'no_snapshot' as const,
      detail: 'provider returned no snapshot at or before the requested timestamp',
    });
  }
  const boundary_ms = Date.parse(input.requested_close_boundary_utc);
  const snapshot_ms = Date.parse(input.returned_snapshot_ts);
  if (!Number.isFinite(boundary_ms) || !Number.isFinite(snapshot_ms)) {
    return Object.freeze({
      requested_close_boundary_utc: input.requested_close_boundary_utc,
      returned_snapshot_ts: input.returned_snapshot_ts,
      age_seconds_before_boundary: null,
      close_capture_state: 'close_capture_stale' as const,
      detail: 'invalid timestamp on request or snapshot',
    });
  }
  const age_seconds = Math.round((boundary_ms - snapshot_ms) / 1000);
  if (age_seconds < 0) {
    return Object.freeze({
      requested_close_boundary_utc: input.requested_close_boundary_utc,
      returned_snapshot_ts: input.returned_snapshot_ts,
      age_seconds_before_boundary: age_seconds,
      close_capture_state: 'close_capture_stale' as const,
      detail: `snapshot_ts is after boundary by ${-age_seconds}s`,
    });
  }
  if (age_seconds > CLOSE_CAPTURE_STALENESS_THRESHOLD_SECONDS) {
    return Object.freeze({
      requested_close_boundary_utc: input.requested_close_boundary_utc,
      returned_snapshot_ts: input.returned_snapshot_ts,
      age_seconds_before_boundary: age_seconds,
      close_capture_state: 'close_capture_stale' as const,
      detail: `snapshot is ${age_seconds}s before boundary (threshold ${CLOSE_CAPTURE_STALENESS_THRESHOLD_SECONDS}s)`,
    });
  }
  return Object.freeze({
    requested_close_boundary_utc: input.requested_close_boundary_utc,
    returned_snapshot_ts: input.returned_snapshot_ts,
    age_seconds_before_boundary: age_seconds,
    close_capture_state: 'eligible' as const,
    detail: `snapshot is ${age_seconds}s before boundary (within threshold)`,
  });
}

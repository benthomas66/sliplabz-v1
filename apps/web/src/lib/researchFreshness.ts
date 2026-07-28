// V1-7b — freshness disclosure for the Research View (pure, testable).
//
// Founder ruling (2026-07-27): "Silent stale serving is forbidden. Disclosed
// historical inspection is allowed." The Research View DISPLAYS an aged
// evaluation WITH a visible age/stale marker — it never suppresses it and never
// implies currency. The horizon is the committed serve-suppress horizon
// (T_SERVE_SUPPRESS_MAX_SECONDS = 3600, D-A1) — imported, never redefined; this
// module reads it, it does NOT change or relax the Board serving gate.

import { T_SERVE_SUPPRESS_MAX_SECONDS } from '../../../../src/evidence/v2/thresholds.js';

export type ResearchFreshnessState = 'fresh' | 'aged_historical' | 'unknown';

export interface ResearchFreshness {
  readonly age_seconds: number | null;
  readonly horizon_seconds: number;
  /** display_age > horizon — beyond the ordinary serving horizon. */
  readonly beyond_horizon: boolean;
  readonly state: ResearchFreshnessState;
}

/** display_age = serve_now − line_observed_at (seconds), clamped at 0. `unknown`
 *  when there is no observation time. `aged_historical` when beyond the horizon:
 *  the surface MUST show the aged marker and MUST NOT describe it as current. */
export function computeResearchFreshness(line_observed_at: string | null, serve_now: string): ResearchFreshness {
  if (line_observed_at === null) {
    return { age_seconds: null, horizon_seconds: T_SERVE_SUPPRESS_MAX_SECONDS, beyond_horizon: false, state: 'unknown' };
  }
  const obs = Date.parse(line_observed_at);
  const now = Date.parse(serve_now);
  if (!Number.isFinite(obs) || !Number.isFinite(now)) {
    return { age_seconds: null, horizon_seconds: T_SERVE_SUPPRESS_MAX_SECONDS, beyond_horizon: false, state: 'unknown' };
  }
  const age_seconds = Math.max(0, Math.round((now - obs) / 1000));
  const beyond_horizon = age_seconds > T_SERVE_SUPPRESS_MAX_SECONDS;
  return {
    age_seconds,
    horizon_seconds: T_SERVE_SUPPRESS_MAX_SECONDS,
    beyond_horizon,
    state: beyond_horizon ? 'aged_historical' : 'fresh',
  };
}

/** Human age like "2 days", "3 hours", "12 minutes" — no percentages, no rates. */
export function humanizeAge(age_seconds: number | null): string {
  if (age_seconds === null) return 'unknown';
  if (age_seconds < 90) return `${age_seconds} seconds`;
  const m = Math.round(age_seconds / 60);
  if (m < 90) return `${m} minutes`;
  const h = Math.round(age_seconds / 3600);
  if (h < 48) return `${h} hours`;
  return `${Math.round(age_seconds / 86400)} days`;
}

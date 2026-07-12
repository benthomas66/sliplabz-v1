// BDL counting-stat normalization.
//
// Authority:
//   BDL sub-spec §9 (counting-stat normalization)
//   BDL sub-spec §9A (core V1 stat mapping)
//   Complete spec §9.5 (raw AND normalized retained)
//   Ticket V1-2 hard invariant: null counting stats on an eligible PLAYED
//     row normalize to zero; null stats on non-played rows do NOT.
//
// The list of null-to-zero-eligible fields is fixed (BDL §9). Descriptive
// metadata (e.g. team assignment) is NEVER null-to-zero coerced.

import type {
  BdlPlayerStatRow,
  NormalizedCountingStats,
} from './types.js';
import type { BdlMinutesStatus } from '../shared/enums.js';

/**
 * The precise field set eligible for null-to-zero normalization per
 * BDL §9. `plus_minus` is retained separately (not required for V1 props)
 * and MUST NOT be null-to-zero-normalized because it is a signed metric,
 * not a count.
 */
export const COUNTING_STAT_FIELDS = [
  'pts',
  'reb',
  'ast',
  'fg3m',
  'stl',
  'blk',
  'turnover',
  'fgm',
  'fga',
  'fg3a',
  'ftm',
  'fta',
  'oreb',
  'dreb',
  'pf',
] as const;

export type CountingStatField = (typeof COUNTING_STAT_FIELDS)[number];

/**
 * Snapshot raw provider counting fields. `undefined` collapses to `null`
 * so downstream code can treat "provider omitted this field" and "provider
 * returned null" identically — both must be preserved as null.
 */
export function extractRawCountingStats(
  row: BdlPlayerStatRow
): NormalizedCountingStats {
  const asRecord = row as unknown as Record<string, unknown>;
  const out: Record<CountingStatField, number | null> = {
    pts: null,
    reb: null,
    ast: null,
    fg3m: null,
    stl: null,
    blk: null,
    turnover: null,
    fgm: null,
    fga: null,
    fg3a: null,
    ftm: null,
    fta: null,
    oreb: null,
    dreb: null,
    pf: null,
  };
  for (const field of COUNTING_STAT_FIELDS) {
    const v = asRecord[field];
    if (typeof v === 'number' && Number.isFinite(v)) {
      out[field] = v;
    } else {
      out[field] = null;
    }
  }
  return Object.freeze(out) as NormalizedCountingStats;
}

/**
 * Apply BDL §9 null-to-zero normalization ONLY when the row qualifies as
 * an eligible played row. All other minute states pass the raw values
 * through unchanged (they may still be null; that's the point).
 *
 * @param raw    the raw counting stats
 * @param minutes_status
 *   `played`     → null-to-zero normalization applies
 *   `dnp`        → NO played-row normalization (BDL §9 last rule).
 *                  Values pass through as observed.
 *   `unresolved` → NO played-row normalization.
 * @param eligible
 *   `true` only when the joined game is `final`, referential integrity is
 *   satisfied, and minutes_status === 'played'. Governed by
 *   src/bdl/eligibility.ts.
 */
export function normalizeCountingStats(
  raw: NormalizedCountingStats,
  minutes_status: BdlMinutesStatus,
  eligible: boolean
): NormalizedCountingStats {
  if (!eligible || minutes_status !== 'played') {
    // Pass through unchanged. Nulls remain nulls; the raw values are the
    // only truth for non-eligible rows.
    return raw;
  }
  const out: Record<CountingStatField, number | null> = { ...raw };
  for (const field of COUNTING_STAT_FIELDS) {
    if (out[field] === null) {
      out[field] = 0;
    }
  }
  return Object.freeze(out) as NormalizedCountingStats;
}

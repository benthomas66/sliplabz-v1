// V1-8a0 — minimal read support for the persisted writer-bound evidence inputs.
//
// Enough to VERIFY persistence and the legacy state. NOT a Board projection, NOT
// a UI, NOT the per-game series. Reads only the two V1-8a0 child tables; never
// reopens `book_detail.offerings`.
//
// LEGACY vs ZERO-SAMPLE — different facts, different types:
//   * a profile with NO persisted window rows → `unavailable_not_persisted`
//     (legacy; its bundle predates this ticket). It returns NEITHER zeros nor
//     empty arrays, and triggers NO read-time reconstruction.
//   * a repopulated profile whose windows are genuinely empty (eligible_n = 0)
//     → `available` with real zero counts. A consumer distinguishes the two by
//     the `status` discriminant.

import type { Tx } from '../../db/transaction.js';
import type { SourceIdentity } from './sourceIdentity.js';

export interface PersistedWindowAggregate {
  readonly window_type: 'L5' | 'L10' | 'L20' | 'season';
  readonly evaluated_line: number;
  readonly requested_n: number;
  readonly eligible_n: number;
  readonly incomplete: boolean;
  readonly count_above: number;
  readonly count_equal: number;
  readonly count_below: number;
  readonly avg_stat_value: number | null;
  readonly median_stat_value: number | null;
  readonly avg_minus_threshold: number | null;
  readonly median_minus_threshold: number | null;
  readonly current_streak_direction: 'above' | 'below' | 'equal' | null;
  readonly current_streak_length: number | null;
  readonly coverage_label: 'complete' | 'incomplete' | 'no_data';
  readonly includes_backfilled_historical: boolean;
}

export interface PersistedEvidenceInputBundle {
  readonly windows: {
    readonly L5: PersistedWindowAggregate;
    readonly L10: PersistedWindowAggregate;
    readonly L20: PersistedWindowAggregate;
    readonly season: PersistedWindowAggregate;
  };
  readonly source_identities: ReadonlyArray<SourceIdentity>;
  readonly source_count: number;
}

/** TYPED unavailable state — legacy profile without a persisted input bundle. */
export type EvidenceInputBundleState =
  | { readonly status: 'available'; readonly bundle: PersistedEvidenceInputBundle }
  | { readonly status: 'unavailable_not_persisted' };

interface WindowRow {
  window_type: 'L5' | 'L10' | 'L20' | 'season';
  evaluated_line: number; requested_n: number; eligible_n: number; incomplete: boolean;
  count_above: number; count_equal: number; count_below: number;
  avg_stat_value: number | null; median_stat_value: number | null;
  avg_minus_threshold: number | null; median_minus_threshold: number | null;
  current_streak_direction: 'above' | 'below' | 'equal' | null; current_streak_length: number | null;
  coverage_label: 'complete' | 'incomplete' | 'no_data'; includes_backfilled_historical: boolean;
}

const WINDOW_SELECT = `
  SELECT evidence_profile_id::text AS evidence_profile_id,
         window_type,
         evaluated_line::float8 AS evaluated_line,
         requested_n, eligible_n, incomplete,
         count_above, count_equal, count_below,
         avg_stat_value::float8 AS avg_stat_value,
         median_stat_value::float8 AS median_stat_value,
         avg_minus_threshold::float8 AS avg_minus_threshold,
         median_minus_threshold::float8 AS median_minus_threshold,
         current_streak_direction, current_streak_length,
         coverage_label, includes_backfilled_historical
    FROM evidence_profile_window_aggregates`;

const SOURCE_SELECT = `
  SELECT evidence_profile_id::text AS evidence_profile_id,
         normalized_source_id, display_name, ordinal
    FROM evidence_profile_source_identities`;

function toAggregate(r: WindowRow): PersistedWindowAggregate {
  return {
    window_type: r.window_type, evaluated_line: r.evaluated_line,
    requested_n: r.requested_n, eligible_n: r.eligible_n, incomplete: r.incomplete,
    count_above: r.count_above, count_equal: r.count_equal, count_below: r.count_below,
    avg_stat_value: r.avg_stat_value, median_stat_value: r.median_stat_value,
    avg_minus_threshold: r.avg_minus_threshold, median_minus_threshold: r.median_minus_threshold,
    current_streak_direction: r.current_streak_direction, current_streak_length: r.current_streak_length,
    coverage_label: r.coverage_label, includes_backfilled_historical: r.includes_backfilled_historical,
  };
}

function assemble(
  windows: ReadonlyArray<WindowRow>,
  sources: ReadonlyArray<{ normalized_source_id: string; display_name: string }>,
): EvidenceInputBundleState {
  if (windows.length === 0) return { status: 'unavailable_not_persisted' };
  const byType = new Map(windows.map((w) => [w.window_type, w]));
  const L5 = byType.get('L5'), L10 = byType.get('L10'), L20 = byType.get('L20'), season = byType.get('season');
  if (L5 === undefined || L10 === undefined || L20 === undefined || season === undefined) {
    // A partial bundle is a data-integrity fault, never a legacy/zero-sample fact.
    throw new Error('V1-8a0 read: persisted window bundle is incomplete (missing one of L5/L10/L20/season).');
  }
  return {
    status: 'available',
    bundle: {
      windows: { L5: toAggregate(L5), L10: toAggregate(L10), L20: toAggregate(L20), season: toAggregate(season) },
      source_identities: sources.map((s) => Object.freeze({ normalized_source_id: s.normalized_source_id, display_name: s.display_name })),
      source_count: sources.length,
    },
  };
}

/** Read ONE profile's persisted input bundle (2 bounded queries). */
export async function readEvidenceInputBundle(tx: Tx, evidence_profile_id: string): Promise<EvidenceInputBundleState> {
  const wr = await tx.query(`${WINDOW_SELECT} WHERE evidence_profile_id = $1::uuid`, [evidence_profile_id]);
  const sr = await tx.query(`${SOURCE_SELECT} WHERE evidence_profile_id = $1::uuid ORDER BY ordinal`, [evidence_profile_id]);
  return assemble(wr.rows as ReadonlyArray<WindowRow>, sr.rows as ReadonlyArray<{ normalized_source_id: string; display_name: string }>);
}

/**
 * Read MANY profiles' bundles in exactly TWO bounded queries (no N+1). Returns
 * a state per requested id ('unavailable_not_persisted' when a profile has no rows).
 */
export async function readEvidenceInputBundlesBatched(
  tx: Tx, evidence_profile_ids: ReadonlyArray<string>,
): Promise<Map<string, EvidenceInputBundleState>> {
  const out = new Map<string, EvidenceInputBundleState>();
  if (evidence_profile_ids.length === 0) return out;
  const ids = [...evidence_profile_ids];
  const wr = await tx.query(`${WINDOW_SELECT} WHERE evidence_profile_id = ANY($1::uuid[])`, [ids]);
  const sr = await tx.query(`${SOURCE_SELECT} WHERE evidence_profile_id = ANY($1::uuid[]) ORDER BY ordinal`, [ids]);
  const winByProfile = new Map<string, WindowRow[]>();
  for (const row of wr.rows as ReadonlyArray<WindowRow & { evidence_profile_id: string }>) {
    (winByProfile.get(row.evidence_profile_id) ?? winByProfile.set(row.evidence_profile_id, []).get(row.evidence_profile_id)!).push(row);
  }
  const srcByProfile = new Map<string, Array<{ normalized_source_id: string; display_name: string }>>();
  for (const row of sr.rows as ReadonlyArray<{ evidence_profile_id: string; normalized_source_id: string; display_name: string }>) {
    (srcByProfile.get(row.evidence_profile_id) ?? srcByProfile.set(row.evidence_profile_id, []).get(row.evidence_profile_id)!).push(row);
  }
  for (const id of ids) {
    out.set(id, assemble(winByProfile.get(id) ?? [], srcByProfile.get(id) ?? []));
  }
  return out;
}

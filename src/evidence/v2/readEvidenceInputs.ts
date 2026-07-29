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
import type { PlayerStatEligibility, BdlMinutesStatus } from '../../shared/enums.js';

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

/**
 * V1-8a0a — ONE persisted per-game series position. This is a TRUSTED
 * SERVER-SIDE type: it carries `internal_game_id` (the stable identity) because
 * a verification/consumer read needs it server-side. It is NOT a browser
 * projection type — `internal_game_id` must be omitted by an exact allowlist
 * before any browser-visible serialization (Amendment 21 containment).
 *
 * The verdict is DISCRIMINATED: an eligible position carries an authoritative
 * outcome; an ineligible/DNP position carries none. A consumer reads
 * `verdict.kind` first — `outcome` cannot be misread as an unknown eligible value.
 */
export type PersistedSeriesVerdict =
  | { readonly kind: 'eligible'; readonly outcome: 'above' | 'below' | 'equal' }
  | { readonly kind: 'ineligible' };

export interface PersistedSeriesPosition {
  readonly ordinal: number;
  /** SERVER-SIDE ONLY (Amendment 21) — never browser-projected. */
  readonly internal_game_id: string;
  readonly game_date_utc: string;
  readonly opponent_label: string;
  readonly is_home: boolean | null;
  readonly stat_value: number | null;
  readonly evaluated_line: number;
  readonly eligibility_state: PlayerStatEligibility;
  readonly minutes_status: BdlMinutesStatus;
  readonly includes_backfilled_historical: boolean;
  readonly verdict: PersistedSeriesVerdict;
}

/** TYPED series availability — a legacy profile reports unavailable for the
 *  series exactly as it does for the window aggregates. */
export type PersistedSeriesState =
  | { readonly status: 'available'; readonly positions: ReadonlyArray<PersistedSeriesPosition> }
  | { readonly status: 'unavailable_not_persisted' };

export interface PersistedEvidenceInputBundle {
  readonly windows: {
    readonly L5: PersistedWindowAggregate;
    readonly L10: PersistedWindowAggregate;
    readonly L20: PersistedWindowAggregate;
    readonly season: PersistedWindowAggregate;
  };
  readonly source_identities: ReadonlyArray<SourceIdentity>;
  readonly source_count: number;
  /** V1-8a0a — the complete per-game series, oldest→newest (ordinal ASC). */
  readonly series: PersistedSeriesState;
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

interface SeriesRow {
  evidence_profile_id: string;
  ordinal: number;
  internal_game_id: string;
  game_date_utc: string;
  opponent_label: string;
  is_home: boolean | null;
  stat_value: number | null;
  evaluated_line: number;
  position_kind: 'eligible' | 'ineligible';
  outcome: 'above' | 'below' | 'equal' | null;
  eligibility_state: PlayerStatEligibility;
  minutes_status: BdlMinutesStatus;
  includes_backfilled_historical: boolean;
}

const SERIES_SELECT = `
  SELECT evidence_profile_id::text AS evidence_profile_id,
         ordinal,
         internal_game_id::text AS internal_game_id,
         to_char(game_date_utc, 'YYYY-MM-DD') AS game_date_utc,
         opponent_label, is_home,
         stat_value::float8 AS stat_value,
         evaluated_line::float8 AS evaluated_line,
         position_kind, outcome,
         eligibility_state::text AS eligibility_state,
         minutes_status::text AS minutes_status,
         includes_backfilled_historical
    FROM evidence_profile_series`;

function toSeriesPosition(r: SeriesRow): PersistedSeriesPosition {
  const verdict: PersistedSeriesVerdict = r.position_kind === 'eligible'
    ? { kind: 'eligible', outcome: r.outcome as 'above' | 'below' | 'equal' }
    : { kind: 'ineligible' };
  return Object.freeze({
    ordinal: r.ordinal, internal_game_id: r.internal_game_id,
    game_date_utc: r.game_date_utc, opponent_label: r.opponent_label, is_home: r.is_home,
    stat_value: r.stat_value, evaluated_line: r.evaluated_line,
    eligibility_state: r.eligibility_state, minutes_status: r.minutes_status,
    includes_backfilled_historical: r.includes_backfilled_historical, verdict,
  });
}

function toSeriesState(rows: ReadonlyArray<SeriesRow>): PersistedSeriesState {
  if (rows.length === 0) return { status: 'unavailable_not_persisted' };
  return { status: 'available', positions: rows.map(toSeriesPosition) };
}

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
  series: ReadonlyArray<SeriesRow>,
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
      series: toSeriesState(series),
    },
  };
}

/** Read ONE profile's persisted input bundle (3 bounded queries). */
export async function readEvidenceInputBundle(tx: Tx, evidence_profile_id: string): Promise<EvidenceInputBundleState> {
  const wr = await tx.query(`${WINDOW_SELECT} WHERE evidence_profile_id = $1::uuid`, [evidence_profile_id]);
  const sr = await tx.query(`${SOURCE_SELECT} WHERE evidence_profile_id = $1::uuid ORDER BY ordinal`, [evidence_profile_id]);
  const er = await tx.query(`${SERIES_SELECT} WHERE evidence_profile_id = $1::uuid ORDER BY ordinal`, [evidence_profile_id]);
  return assemble(
    wr.rows as ReadonlyArray<WindowRow>,
    sr.rows as ReadonlyArray<{ normalized_source_id: string; display_name: string }>,
    er.rows as ReadonlyArray<SeriesRow>,
  );
}

/**
 * Read MANY profiles' bundles in exactly THREE bounded queries (no N+1 — window
 * aggregates, source identities, and the series each fetched once via ANY over
 * the id set). Returns a state per requested id ('unavailable_not_persisted'
 * when a profile has no window rows).
 */
export async function readEvidenceInputBundlesBatched(
  tx: Tx, evidence_profile_ids: ReadonlyArray<string>,
): Promise<Map<string, EvidenceInputBundleState>> {
  const out = new Map<string, EvidenceInputBundleState>();
  if (evidence_profile_ids.length === 0) return out;
  const ids = [...evidence_profile_ids];
  const wr = await tx.query(`${WINDOW_SELECT} WHERE evidence_profile_id = ANY($1::uuid[])`, [ids]);
  const sr = await tx.query(`${SOURCE_SELECT} WHERE evidence_profile_id = ANY($1::uuid[]) ORDER BY ordinal`, [ids]);
  const er = await tx.query(`${SERIES_SELECT} WHERE evidence_profile_id = ANY($1::uuid[]) ORDER BY ordinal`, [ids]);
  const winByProfile = new Map<string, WindowRow[]>();
  for (const row of wr.rows as ReadonlyArray<WindowRow & { evidence_profile_id: string }>) {
    (winByProfile.get(row.evidence_profile_id) ?? winByProfile.set(row.evidence_profile_id, []).get(row.evidence_profile_id)!).push(row);
  }
  const srcByProfile = new Map<string, Array<{ normalized_source_id: string; display_name: string }>>();
  for (const row of sr.rows as ReadonlyArray<{ evidence_profile_id: string; normalized_source_id: string; display_name: string }>) {
    (srcByProfile.get(row.evidence_profile_id) ?? srcByProfile.set(row.evidence_profile_id, []).get(row.evidence_profile_id)!).push(row);
  }
  const serByProfile = new Map<string, SeriesRow[]>();
  for (const row of er.rows as ReadonlyArray<SeriesRow>) {
    (serByProfile.get(row.evidence_profile_id) ?? serByProfile.set(row.evidence_profile_id, []).get(row.evidence_profile_id)!).push(row);
  }
  for (const id of ids) {
    out.set(id, assemble(winByProfile.get(id) ?? [], srcByProfile.get(id) ?? [], serByProfile.get(id) ?? []));
  }
  return out;
}

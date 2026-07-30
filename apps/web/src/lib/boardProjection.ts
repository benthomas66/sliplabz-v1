// V1-6a Scope B — the Board-surface projection (allowlist CONSTRUCTION).
// V1-8a1 — extended with the Parity Spec §1.3 information band, projected from
// the V1-8a0/V1-8a0a PERSISTED bundle (window aggregates + series + source
// identities) plus the persisted current-market context. This ticket RENDERS
// NOTHING; it projects the persisted contract for V1-8a2 to consume.
//
// The projection TYPE cannot carry the composite score, paid offering detail,
// a raw evidence row, or the SERVER-SIDE-ONLY `internal_game_id` (Amendment 21)
// — those fields are simply absent from the type. The constructor returns a
// NEWLY CONSTRUCTED allowlisted object built FIELD-BY-FIELD; it does not spread
// a raw row, does not spread-then-delete, uses no `omit` helper, does not rely
// on JSON serialization, and uses no cast to claim extra runtime fields absent.
//
// AUTHORITIES: §D.2 compact labels + §D.4 cap/provenance (FROZEN v1 method,
// via the committed renderer) · Grammar §2.2 Evidence Strip / §2.8 Sample /
// §7 compact count form · Parity Spec §1.3 band order
// (L5·L10·L20·H2H·STRK·AVG·DIFF·SZN). DR-19 is unchanged and absolute:
// composite_score and the four components are FORBIDDEN here.

import { renderCompactExplanation } from '../../../../src/explanation/index.js';
import type { RankedCandidate } from './rankedCandidate.js';
import type {
  PersistedWindowAggregate,
  PersistedSeriesPosition,
} from '../../../../src/evidence/v2/readEvidenceInputs.js';

/** Keys ALWAYS present on a Board projection. `band` is always present (it is a
 *  discriminated union whose `unavailable_not_persisted` arm is the legacy state). */
export const BOARD_PROJECTION_BASE_KEYS = [
  'player',
  'team',
  'market',
  'evaluated_line',
  'classification_label',
  'compact_display_line',
  'disclosure_g1',
  'band',
] as const;

/** Optional keys — present ONLY when they apply (see constructor). */
export const BOARD_PROJECTION_OPTIONAL_KEYS = ['cap_tag', 'provenance_marker'] as const;

/** Keys that must NEVER appear on a Board projection (defence in depth). Includes
 *  the SERVER-SIDE-ONLY `internal_game_id` (Amendment 21) and `evidence_profile_id`
 *  (the batched-read join key), enforced at EVERY nested level (see the assertion). */
export const BOARD_PROJECTION_FORBIDDEN_KEYS = [
  'composite_score', 'components', 'score', 'book_detail', 'offerings',
  'paid_book_offerings', 'profile_output', 'reasons', 'method_version',
  'l10_eligible_n', 'eligible_sportsbook_count', 'internal_game_id',
  'evidence_profile_id', 'line_observed_at', 'bundle',
  // never a rate/percentage form on any object
  'rate', 'over_rate', 'percentage',
] as const;

// ---------------------------------------------------------------------------
// Information-band cell types (Parity Spec §1.3). Every nested object has an
// EXACT allowed key set enforced at runtime by assertBoardProjectionKeySet.
// ---------------------------------------------------------------------------

/** Grammar §2.8 sample: eligible sample size + coverage state (the Sample Badge). */
export interface WindowSample {
  readonly eligible_n: number;
  readonly coverage: 'complete' | 'incomplete' | 'no_data';
}

/** STRK — the persisted factual run (direction + length). NEVER derived here;
 *  NEVER styled hot/cold; NEVER implies continuation (that framing is V1-8a2's
 *  to refuse). `null` direction/length only for a zero-sample window. */
export interface WindowStreak {
  readonly direction: 'above' | 'below' | 'equal' | null;
  readonly length: number | null;
}

/** One window (L5/L10/L20/season). `compact_counts` is Grammar §7 form:
 *  `A-B` (above-below) or `A-B-P` when pushes (equal) are non-zero — never a
 *  percentage, slash ratio, or the word "rate". AVG = persisted avg_stat_value;
 *  DIFF = persisted avg_minus_threshold (NOT `average − line`). */
export interface WindowCell {
  readonly compact_counts: string;
  readonly sample: WindowSample;
  readonly streak: WindowStreak;
  readonly average: number | null;
  readonly difference: number | null;
}

/** One Evidence Strip position (§2.2). The SERVER-SIDE-ONLY `internal_game_id`
 *  is NOT a field of this type and is never carried. `outcome` is NULL iff the
 *  position is ineligible (discriminated by `position_kind`). */
export interface SeriesCell {
  readonly ordinal: number;
  readonly game_date_utc: string;
  readonly opponent_label: string;
  readonly is_home: boolean | null;
  readonly stat_value: number | null;
  readonly evaluated_line: number;
  readonly position_kind: 'eligible' | 'ineligible';
  readonly outcome: 'above' | 'below' | 'equal' | null;
  readonly eligibility_state: string;
  readonly minutes_status: string;
  readonly includes_backfilled_historical: boolean;
}

/** H2H — GAP (G2, V1-8d). A DISCRIMINATED typed-unavailable marker: no numeric,
 *  no null-that-reads-as-a-value, no empty array that could read as zero sample. */
export interface H2HUnavailable {
  readonly status: 'unavailable';
  readonly reason: 'requires_h2h_window_g2';
}

/** Grain-level source identity — names/IDs only (the V1-8a0 approved exception).
 *  No point, price, side, timestamp, or per-source handle. */
export interface SourceIdentityCell {
  readonly normalized_source_id: string;
  readonly display_name: string;
}

/** Consensus distribution / range / book count from the persisted current-market
 *  row. No paid per-book handle. `distribution` is point→count (non-economic). */
export interface ConsensusCell {
  readonly consensus_point: number | null;
  readonly min_point: number | null;
  readonly max_point: number | null;
  readonly book_count: number;
  readonly distribution: ReadonlyArray<ConsensusPoint>;
}
export interface ConsensusPoint {
  readonly point: number;
  readonly count: number;
}

/** Freshness Badge (Grammar §2.6): discrete STATE + elapsed time. `display_age_seconds`
 *  is the BOUNDED duration already computed by the V1-6d serving gate
 *  (`serve_now − line_observed_at`; ≤ the serve horizon for a served row) — a
 *  DURATION, never the raw `line_observed_at` timestamp, which remains SERVER-SIDE
 *  and a FORBIDDEN projection key. `null` only when the gate had no observation. */
export interface FreshnessCell {
  readonly state: string | null;
  readonly display_age_seconds: number | null;
}

/** The information band. DISCRIMINATED: a legacy profile with no persisted bundle
 *  is `unavailable_not_persisted` — distinct from an `available` band whose
 *  windows are a genuine zero-sample (eligible_n = 0). */
export type BoardBand =
  | { readonly status: 'unavailable_not_persisted' }
  | {
      readonly status: 'available';
      readonly windows: {
        readonly L5: WindowCell;
        readonly L10: WindowCell;
        readonly L20: WindowCell;
        readonly season: WindowCell;
      };
      readonly series: ReadonlyArray<SeriesCell>;
      readonly h2h: H2HUnavailable;
      readonly sources: ReadonlyArray<SourceIdentityCell>;
      readonly source_count: number;
      readonly consensus: ConsensusCell;
      readonly freshness: FreshnessCell;
    };

export interface BoardProjectionBase {
  readonly player: string;
  readonly team: string;
  readonly market: string;
  /** Present per Scope B. Null only for an Unavailable row (authority admits null). */
  readonly evaluated_line: number | null;
  /** §D.2 compact classification label — exact taxonomy (GD-15: Unavailable
   *  is NEVER collapsed into Insufficient). From the committed renderer. */
  readonly classification_label: string;
  /** Combined label [+ binding cap tag], composed by the committed renderer. */
  readonly compact_display_line: string;
  /** §G.1 disclosure text (verbatim authority copy). */
  readonly disclosure_g1: string;
  /** V1-8a1 — the Parity Spec §1.3 information band (projected persisted data). */
  readonly band: BoardBand;
}

export interface BoardProjection extends BoardProjectionBase {
  /** §D.4 rule 6 binding quality-cap short tag — present ONLY when a cap fires. */
  readonly cap_tag?: string;
  /** §D.4 rule 7 provenance marker — present ONLY when includes_backfilled_historical
   *  is true. NOT hover-only: the surface renders it as persistent text. */
  readonly provenance_marker?: string;
}

/** Which conditional fields a given candidate should carry. */
export interface ProjectionApplicability {
  readonly cap: boolean;
  readonly provenance: boolean;
}

// ---------------------------------------------------------------------------
// Grammar §7 compact count form. `A-B`, or `A-B-P` when pushes are non-zero.
// NEVER a percentage, slash ratio, or the word "rate".
// ---------------------------------------------------------------------------
export function compactCounts(count_above: number, count_below: number, count_equal: number): string {
  return count_equal > 0
    ? `${count_above}-${count_below}-${count_equal}`
    : `${count_above}-${count_below}`;
}

function toWindowCell(w: PersistedWindowAggregate): WindowCell {
  return {
    compact_counts: compactCounts(w.count_above, w.count_below, w.count_equal),
    sample: { eligible_n: w.eligible_n, coverage: w.coverage_label },
    // STRK/AVG/DIFF are PROJECTED PERSISTED VALUES — never derived here.
    streak: { direction: w.current_streak_direction, length: w.current_streak_length },
    average: w.avg_stat_value,
    difference: w.avg_minus_threshold, // DR-ruling: persisted avg_minus_threshold, NOT average − line
  };
}

/** Map ONE persisted series position to a projected Evidence Strip cell,
 *  FIELD-BY-FIELD. `internal_game_id` is deliberately NOT read (Amendment 21).
 *  The verdict discriminant becomes position_kind + outcome (NULL iff ineligible). */
function toSeriesCell(p: PersistedSeriesPosition): SeriesCell {
  return {
    ordinal: p.ordinal,
    game_date_utc: p.game_date_utc,
    opponent_label: p.opponent_label,
    is_home: p.is_home,
    stat_value: p.stat_value,
    evaluated_line: p.evaluated_line,
    position_kind: p.verdict.kind,
    outcome: p.verdict.kind === 'eligible' ? p.verdict.outcome : null,
    eligibility_state: p.eligibility_state,
    minutes_status: p.minutes_status,
    includes_backfilled_historical: p.includes_backfilled_historical,
  };
}

/**
 * Build the information band from the candidate's persisted bundle + current
 * market context. Legacy (no persisted bundle) → typed `unavailable_not_persisted`
 * (Scope D); NO read-time reconstruction, NO zeros, NO empty arrays.
 */
function buildBand(candidate: RankedCandidate, displayAgeSeconds: number | null): BoardBand {
  const bundle = candidate.bundle;
  if (bundle === undefined || bundle.status !== 'available') {
    return { status: 'unavailable_not_persisted' };
  }
  const b = bundle.bundle;
  const c = candidate.consensus;
  return {
    status: 'available',
    windows: {
      L5: toWindowCell(b.windows.L5),
      L10: toWindowCell(b.windows.L10),
      L20: toWindowCell(b.windows.L20),
      season: toWindowCell(b.windows.season),
    },
    // ONE ordered series supports all four strips (each strip is a tail-span of
    // it under the display-membership rule); positions are not duplicated per
    // window. `internal_game_id` is dropped by toSeriesCell.
    series: b.series.status === 'available' ? b.series.positions.map(toSeriesCell) : [],
    h2h: { status: 'unavailable', reason: 'requires_h2h_window_g2' },
    sources: b.source_identities.map((s) => ({
      normalized_source_id: s.normalized_source_id,
      display_name: s.display_name,
    })),
    source_count: b.source_count,
    consensus: {
      consensus_point: c?.consensus_point ?? null,
      min_point: c?.min_point ?? null,
      max_point: c?.max_point ?? null,
      book_count: c?.book_count ?? 0,
      distribution: (c?.distribution ?? []).map((d) => ({ point: d.point, count: d.count })),
    },
    freshness: { state: c?.freshness_state ?? null, display_age_seconds: displayAgeSeconds },
  };
}

/**
 * Construct a Board projection from an internal ranked candidate. Returns a
 * NEW object literal with an explicit allowlist of keys; optional keys are
 * attached ONLY when they apply. Self-checks the FULL nested key set before
 * returning.
 */
export function constructBoardProjection(
  candidate: RankedCandidate,
  displayAgeSeconds: number | null = null,
): BoardProjection {
  const compact = renderCompactExplanation(candidate.profile_output);

  const cap = compact.binding_cap !== null && compact.binding_cap.cap_summary_short !== '';
  const provenance = compact.provenance_marker !== null;

  const projection: BoardProjection = {
    player: candidate.player,
    team: candidate.team,
    market: candidate.market,
    evaluated_line: candidate.evaluated_line,
    classification_label: compact.compact_label,
    compact_display_line: compact.compact_display_line,
    disclosure_g1: compact.disclosure_g1.text,
    band: buildBand(candidate, displayAgeSeconds),
    ...(cap ? { cap_tag: compact.binding_cap!.cap_summary_short } : {}),
    ...(provenance ? { provenance_marker: compact.provenance_marker!.text } : {}),
  };

  assertBoardProjectionKeySet(projection, { cap, provenance });
  return Object.freeze(projection);
}

// ---------------------------------------------------------------------------
// NESTED KEY-SET ENFORCEMENT (Amendment 6, binding). Exact allowed keys at
// EVERY level; a forbidden key smuggled into ANY nested object THROWS. Does not
// rely on TypeScript structural typing, serialization, or top-level checks.
// ---------------------------------------------------------------------------

function assertExactKeys(obj: unknown, allowed: readonly string[], where: string): void {
  if (obj === null || typeof obj !== 'object') {
    throw new Error(`V1-8a1 board projection: expected an object at ${where}.`);
  }
  const actual = Object.keys(obj as Record<string, unknown>);
  const allowedSet = new Set(allowed);
  for (const k of actual) {
    if (!allowedSet.has(k)) {
      throw new Error(`V1-8a1 board projection carries an unexpected key "${k}" at ${where} (allowed: ${[...allowedSet].sort().join(', ')}).`);
    }
  }
  for (const k of allowed) {
    if (!actual.includes(k)) {
      throw new Error(`V1-8a1 board projection is MISSING required key "${k}" at ${where}.`);
    }
  }
  // Defence in depth: forbidden keys must NEVER appear at ANY level.
  for (const forbidden of BOARD_PROJECTION_FORBIDDEN_KEYS) {
    if (Object.prototype.hasOwnProperty.call(obj, forbidden)) {
      throw new Error(`V1-8a1 board projection carries FORBIDDEN key "${forbidden}" at ${where}.`);
    }
  }
}

const WINDOW_CELL_KEYS = ['compact_counts', 'sample', 'streak', 'average', 'difference'] as const;
const SAMPLE_KEYS = ['eligible_n', 'coverage'] as const;
const STREAK_KEYS = ['direction', 'length'] as const;
const SERIES_CELL_KEYS = ['ordinal', 'game_date_utc', 'opponent_label', 'is_home', 'stat_value', 'evaluated_line', 'position_kind', 'outcome', 'eligibility_state', 'minutes_status', 'includes_backfilled_historical'] as const;
const H2H_KEYS = ['status', 'reason'] as const;
const SOURCE_KEYS = ['normalized_source_id', 'display_name'] as const;
const CONSENSUS_KEYS = ['consensus_point', 'min_point', 'max_point', 'book_count', 'distribution'] as const;
const CONSENSUS_POINT_KEYS = ['point', 'count'] as const;
const FRESHNESS_KEYS = ['state', 'display_age_seconds'] as const;

function assertWindowCell(w: WindowCell, where: string): void {
  assertExactKeys(w, WINDOW_CELL_KEYS, where);
  assertExactKeys(w.sample, SAMPLE_KEYS, `${where}.sample`);
  assertExactKeys(w.streak, STREAK_KEYS, `${where}.streak`);
}

function assertBand(band: BoardBand): void {
  if (band.status === 'unavailable_not_persisted') {
    assertExactKeys(band, ['status'], 'band');
    return;
  }
  assertExactKeys(band, ['status', 'windows', 'series', 'h2h', 'sources', 'source_count', 'consensus', 'freshness'], 'band');
  assertExactKeys(band.windows, ['L5', 'L10', 'L20', 'season'], 'band.windows');
  for (const wt of ['L5', 'L10', 'L20', 'season'] as const) {
    assertWindowCell(band.windows[wt], `band.windows.${wt}`);
  }
  for (let i = 0; i < band.series.length; i += 1) {
    assertExactKeys(band.series[i], SERIES_CELL_KEYS, `band.series[${i}]`);
  }
  assertExactKeys(band.h2h, H2H_KEYS, 'band.h2h');
  for (let i = 0; i < band.sources.length; i += 1) {
    assertExactKeys(band.sources[i], SOURCE_KEYS, `band.sources[${i}]`);
  }
  assertExactKeys(band.consensus, CONSENSUS_KEYS, 'band.consensus');
  for (let i = 0; i < band.consensus.distribution.length; i += 1) {
    assertExactKeys(band.consensus.distribution[i], CONSENSUS_POINT_KEYS, `band.consensus.distribution[${i}]`);
  }
  assertExactKeys(band.freshness, FRESHNESS_KEYS, 'band.freshness');
}

/**
 * RUNTIME KEY-SET ASSERTION (nested). Proves the projection AND every nested
 * object contain EXACTLY their allowed keys and NONE of the forbidden keys.
 */
export function assertBoardProjectionKeySet(
  p: BoardProjection,
  applies: ProjectionApplicability
): void {
  const expected = new Set<string>(BOARD_PROJECTION_BASE_KEYS);
  if (applies.cap) expected.add('cap_tag');
  if (applies.provenance) expected.add('provenance_marker');

  const actual = Object.keys(p);
  for (const k of actual) {
    if (!expected.has(k)) {
      throw new Error(
        `V1-6a board projection carries an unexpected key "${k}" ` +
        `(allowed for this row: ${[...expected].sort().join(', ')}).`
      );
    }
  }
  for (const k of expected) {
    if (!actual.includes(k)) {
      throw new Error(`V1-6a board projection is MISSING required key "${k}".`);
    }
  }
  // Defence in depth: forbidden keys must never appear regardless of the set math.
  for (const forbidden of BOARD_PROJECTION_FORBIDDEN_KEYS) {
    if (Object.prototype.hasOwnProperty.call(p, forbidden)) {
      throw new Error(`V1-6a board projection carries FORBIDDEN key "${forbidden}".`);
    }
  }
  // Conditional correctness.
  if (applies.cap !== Object.prototype.hasOwnProperty.call(p, 'cap_tag')) {
    throw new Error('V1-6a board projection cap_tag presence disagrees with applicability.');
  }
  if (applies.provenance !== Object.prototype.hasOwnProperty.call(p, 'provenance_marker')) {
    throw new Error('V1-6a board projection provenance_marker presence disagrees with applicability.');
  }
  // NESTED enforcement (Amendment 6): every band object at every level.
  assertBand(p.band);
}

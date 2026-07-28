import 'server-only';
// V1-7a — in-memory RESEARCH fixture repository (SERVER-ONLY).
//
// Implements the SAME `ResearchRepository` interface as production, so tests
// (and V1-7b) exercise the real research candidate -> constructor -> projection
// path with controlled grains and NO hosted connectivity.
//
// Seven grains span every §D.2 classification (so all seven FULL labels are
// reachable — TEST 4) and include the four the ticket names: a Strong-magnitude
// profile capped to Moderate, a Moderate with provenance, an Insufficient, and
// an Unavailable. Window COUNTS come from the committed `computeThresholdWindow`
// — genuinely computed, never invented. Each grain's current-market row carries
// a DISTINCTIVE paid offering so a test can prove the projection DROPS it.
//
// A quality cap forces max Moderate in the engine, so a "Strong capped" profile
// is honestly represented as `moderate_*_evidence` + `quality_capped` (avoids the
// GAP-17 incoherent strong+capped combination); a separate uncapped Strong grain
// supplies the "Strong Over/Under Evidence" labels.

import { computeThresholdWindow, type ThresholdWindowGame } from '../../../../../src/computation/thresholdWindows.js';
import type { ThresholdWindows, EvidenceProfileOutput, ComponentValues, AttachedReason } from '../../../../../src/evidence/types.js';
import type { CurrentMarketRow, CurrentOffering, OneSidedOfferingKind } from '../../../../../src/computation/types.js';
import type {
  EvidenceClassification, EvidenceDirection, EvidenceQualityCapReason,
  PlayerStatEligibility, BdlMinutesStatus,
} from '../../../../../src/shared/enums.js';
import { assertKnownMethodVersion, type MethodVersion } from '../method.js';
import type { ResearchCandidate, ResearchSeriesRow } from '../researchCandidate.js';
import type { ResearchRepository } from './researchRepository.js';
import { DISTINCTIVE_PAID_BOOK, DISTINCTIVE_PAID_PRICE } from './fixtureRepository.js';

const OBSERVED_AT = '2026-07-27T17:30:00.000Z';


function makeWindows(threshold: number, g: ThresholdWindowGame[]): ThresholdWindows {
  return Object.freeze({
    L5: computeThresholdWindow('L5', threshold, g),
    L10: computeThresholdWindow('L10', threshold, g),
    L20: computeThresholdWindow('L20', threshold, g),
    season: computeThresholdWindow('season', threshold, g),
  });
}

interface SeriesSpecEntry {
  readonly opponent: string;
  readonly is_home: boolean | null;
  readonly stat_value: number | null;
  readonly eligibility_state: PlayerStatEligibility;
  readonly minutes_status: BdlMinutesStatus;
  readonly backfilled?: boolean;
}

/**
 * Build the four threshold windows AND the per-game series from ONE spec so
 * they RECONCILE by construction: the windows are computed from exactly the
 * eligible entries (most-recent-first), and the counted series entries are the
 * same rows. DNP/ineligible entries are ghosts — never in the window games.
 */
function buildSeriesAndWindows(threshold: number, spec: readonly SeriesSpecEntry[]): {
  windows: ThresholdWindows; series: ResearchSeriesRow[];
} {
  const series: ResearchSeriesRow[] = spec.map((e, i) => ({
    game_date_utc: `2026-06-${String(i + 1).padStart(2, '0')}`,
    opponent_label: e.opponent, is_home: e.is_home, stat_value: e.stat_value,
    eligibility_state: e.eligibility_state, minutes_status: e.minutes_status,
    includes_backfilled_historical: e.backfilled ?? false,
  }));
  // Window games: eligible entries with a stat, MOST-RECENT-FIRST (the order the
  // committed reader supplies to computeThresholdWindow).
  const eligible = series.filter((s) => s.eligibility_state === 'eligible' && s.stat_value !== null);
  const gamesMostRecentFirst: ThresholdWindowGame[] = eligible.slice().reverse().map((s) => ({
    game_date_utc: s.game_date_utc, player_stat_value: s.stat_value!, is_backfilled_historical: s.includes_backfilled_historical,
  }));
  return { windows: makeWindows(threshold, gamesMostRecentFirst), series };
}

// Synthetic opponents (obviously not real WNBA teams).
const OPP = ['Test Town', 'Mock Bay', 'Sample Falls', 'Preview Park', 'Synthetic Springs', 'Preview City'];
function elig(stat: number, backfilled = false): SeriesSpecEntry {
  return { opponent: OPP[stat % OPP.length]!, is_home: stat % 2 === 0, stat_value: stat, eligibility_state: 'eligible', minutes_status: 'played', backfilled };
}
const DNP: SeriesSpecEntry = { opponent: OPP[1]!, is_home: false, stat_value: null, eligibility_state: 'non_participation', minutes_status: 'dnp' };
const PLAYED_INELIGIBLE: SeriesSpecEntry = { opponent: OPP[2]!, is_home: true, stat_value: null, eligibility_state: 'quarantined', minutes_status: 'played' };

function paidOffering(point: number): CurrentOffering {
  return Object.freeze({
    bookmaker_key: DISTINCTIVE_PAID_BOOK, display_title: DISTINCTIVE_PAID_BOOK,
    point, over_price: DISTINCTIVE_PAID_PRICE, under_price: DISTINCTIVE_PAID_PRICE,
    provider_last_update: OBSERVED_AT, observed_at: OBSERVED_AT,
    source_snapshot_id: 'snap-fixture', market_offering_id: 'off-fixture',
  });
}

function makeMarketRow(a: {
  consensus_point: number | null;
  eligible_book_count: number;
  points: ReadonlyArray<{ point: number; book_count: number }>;
  min_point: number | null; max_point: number | null;
  first_point: number | null;
  one_sided: OneSidedOfferingKind | null;
}): CurrentMarketRow {
  return Object.freeze({
    internal_game_id: 'fixture', internal_player_id: 'fixture', market_key: 'player_points',
    line_consensus: Object.freeze({
      consensus_point: a.consensus_point,
      selection_method: a.eligible_book_count === 0 ? 'no_eligible_source' : a.eligible_book_count === 1 ? 'single_book' : 'unique_modal',
      total_eligible_sportsbook_count: a.eligible_book_count,
      sportsbook_count_at_selected_point: a.consensus_point === null ? null : Math.max(1, a.eligible_book_count - 1),
      coverage_label: a.eligible_book_count === 0 ? 'no_line' : a.eligible_book_count === 1 ? 'single_book' : 'complete',
      method_version: 2,
    }),
    line_range: Object.freeze({ min_point: a.min_point, max_point: a.max_point, method_version: 2 }),
    point_distribution: Object.freeze({ counts: a.points.map((p) => Object.freeze(p)), method_version: 2 }),
    eligible_book_count: Object.freeze({ count: a.eligible_book_count, method_version: 2 }),
    first_observed: Object.freeze({ point: a.first_point, at: a.first_point === null ? null : OBSERVED_AT, method_version: 2 }),
    movement_summary: Object.freeze({
      first_observed_point: a.first_point, current_point: a.consensus_point,
      net_point_movement: a.first_point !== null && a.consensus_point !== null ? Math.round((a.consensus_point - a.first_point) * 100) / 100 : null,
      point_changes_observed: 1, over_price_changes: 0, under_price_changes: 0,
      side_removed_count: 0, side_added_count: 0, method_version: 2,
    }),
    // PAID per-book detail present here; the projection constructor DROPS `offerings`.
    book_detail: Object.freeze({ offerings: a.consensus_point === null ? [] : [paidOffering(a.consensus_point)], one_sided: a.one_sided, method_version: 2 }),
    availability_context: null,
    method_version: 2, computation_version: 1, source_snapshot_ids: Object.freeze([]),
  });
}

function components(score: number | null, dir: EvidenceDirection | null): ComponentValues {
  return score === null
    ? Object.freeze({ c_rtp: null, c_ms: null, c_wa: null, c_ma: null, composite_score: null, direction: null, c_rtp_non_l5_magnitude: null, longer_window_choice: null })
    : Object.freeze({ c_rtp: 0.42, c_ms: 0.31, c_wa: 0.66, c_ma: 0.12, composite_score: score, direction: dir, c_rtp_non_l5_magnitude: 0.5, longer_window_choice: 'L20' });
}

function profile(a: {
  classification: EvidenceClassification; direction: EvidenceDirection | null;
  score: number | null; evaluated_line: number | null;
  quality_cap_reason: EvidenceQualityCapReason; backfilled: boolean;
  reasons: ReadonlyArray<AttachedReason>;
}): EvidenceProfileOutput {
  return {
    classification: a.classification, direction: a.direction, components: components(a.score, a.direction),
    quality_capped: a.quality_cap_reason !== 'none', quality_cap_reason: a.quality_cap_reason,
    includes_backfilled_historical: a.backfilled, evaluated_line: a.evaluated_line,
    evaluated_source_kind: a.evaluated_line === null ? null : 'sportsbook_consensus',
    evaluated_source_identifier: null, reasons: a.reasons, method_version: 'evidence_method_v1',
  };
}

interface FixtureGrain {
  readonly internal_game_id: string;
  readonly internal_player_id: string;
  readonly market_key: string;
  readonly label: string;
  readonly candidate: ResearchCandidate;
}

function grain(n: number, market: string, label: string, c: Omit<ResearchCandidate, 'method_version' | 'computation_version' | 'market'>): FixtureGrain {
  const gid = `eeee0000-0000-0000-0000-${String(n).padStart(12, '0')}`;
  const pid = `ffff0000-0000-0000-0000-${String(n).padStart(12, '0')}`;
  return {
    internal_game_id: gid, internal_player_id: pid, market_key: market, label,
    // computation_version stands in for the persisted profile's stored value.
    candidate: { ...c, method_version: 'evidence_method_v2', computation_version: 1, market },
  };
}

// The seven research grains.
const GRAINS: ReadonlyArray<FixtureGrain> = [
  // 1) Strong Over Evidence (uncapped)
  grain(1, 'player_points', 'Strong Over Evidence', {
    player: 'Research Guard A', team: 'Preview City', evaluated_line: 24.5, tipoff_utc: '2026-07-27T23:00:00.000Z',
    profile_output: profile({ classification: 'strong_over_evidence', direction: 'over', score: 0.7834, evaluated_line: 24.5, quality_cap_reason: 'none', backfilled: false,
      reasons: [{ reason_code: 'window_agreement_support', category: 'support', intra_category_rank: 1, contribution_magnitude: 0.66 },
                { reason_code: 'positive_margin_support', category: 'support', intra_category_rank: 2, contribution_magnitude: 0.31 }] }),
    ...buildSeriesAndWindows(24.5, [elig(30), elig(28), elig(27), elig(26), elig(25), elig(29), elig(26), elig(31), elig(27), elig(28), DNP, PLAYED_INELIGIBLE]),
    current_market_row: makeMarketRow({ consensus_point: 24.5, eligible_book_count: 6, points: [{ point: 24.5, book_count: 5 }, { point: 25.5, book_count: 1 }], min_point: 24.5, max_point: 25.5, first_point: 24.0, one_sided: 'neither' }),
    line_observed_at: OBSERVED_AT,
  }),
  // 2) Strong-magnitude capped -> Moderate Over Evidence (the "Strong capped")
  grain(2, 'player_points', 'Moderate Over Evidence (capped)', {
    player: 'Research Forward B', team: 'Test Town', evaluated_line: 21.5, tipoff_utc: '2026-07-27T23:30:00.000Z',
    profile_output: profile({ classification: 'moderate_over_evidence', direction: 'over', score: 0.58, evaluated_line: 21.5, quality_cap_reason: 'stale_current_market', backfilled: false,
      reasons: [{ reason_code: 'stale_current_market', category: 'quality', intra_category_rank: 1, contribution_magnitude: null },
                { reason_code: 'window_agreement_support', category: 'support', intra_category_rank: 1, contribution_magnitude: 0.61 }] }),
    ...buildSeriesAndWindows(21.5, [elig(26), elig(24), elig(23), elig(25), elig(22), elig(27), elig(24), elig(23), elig(25), elig(24), DNP]),
    current_market_row: makeMarketRow({ consensus_point: 21.5, eligible_book_count: 5, points: [{ point: 21.5, book_count: 4 }, { point: 22.5, book_count: 1 }], min_point: 21.5, max_point: 22.5, first_point: 21.0, one_sided: 'neither' }),
    line_observed_at: OBSERVED_AT,
  }),
  // 3) Moderate Under Evidence WITH provenance
  grain(3, 'player_rebounds', 'Moderate Under Evidence (provenance)', {
    player: 'Research Center C', team: 'Mock Bay', evaluated_line: 8.5, tipoff_utc: '2026-07-28T00:00:00.000Z',
    profile_output: profile({ classification: 'moderate_under_evidence', direction: 'under', score: -0.5312, evaluated_line: 8.5, quality_cap_reason: 'none', backfilled: true,
      reasons: [{ reason_code: 'negative_margin_support', category: 'support', intra_category_rank: 1, contribution_magnitude: 0.34 }] }),
    ...buildSeriesAndWindows(8.5, [elig(6), elig(7), elig(8), elig(5), elig(9), elig(7), elig(6, true), elig(8, true), elig(7, true), elig(6, true), DNP]),
    current_market_row: makeMarketRow({ consensus_point: 8.5, eligible_book_count: 5, points: [{ point: 8.5, book_count: 5 }], min_point: 8.5, max_point: 8.5, first_point: 8.5, one_sided: 'neither' }),
    line_observed_at: OBSERVED_AT,
  }),
  // 4) Mixed Evidence
  grain(4, 'player_assists', 'Mixed Evidence', {
    player: 'Research Guard D', team: 'Sample Falls', evaluated_line: 5.5, tipoff_utc: '2026-07-28T00:30:00.000Z',
    profile_output: profile({ classification: 'mixed_evidence', direction: null, score: 0.04, evaluated_line: 5.5, quality_cap_reason: 'none', backfilled: false,
      reasons: [{ reason_code: 'windows_disagree', category: 'contradiction', intra_category_rank: 1, contribution_magnitude: null }] }),
    ...buildSeriesAndWindows(5.5, [elig(7), elig(4), elig(6), elig(5), elig(8), elig(3), elig(6), elig(5), elig(7), elig(4)]),
    current_market_row: makeMarketRow({ consensus_point: 5.5, eligible_book_count: 4, points: [{ point: 5.5, book_count: 3 }, { point: 4.5, book_count: 1 }], min_point: 4.5, max_point: 5.5, first_point: 5.5, one_sided: 'neither' }),
    line_observed_at: OBSERVED_AT,
  }),
  // 5) Strong Under Evidence
  grain(5, 'player_threes', 'Strong Under Evidence', {
    player: 'Research Guard E', team: 'Preview Park', evaluated_line: 2.5, tipoff_utc: '2026-07-28T01:00:00.000Z',
    profile_output: profile({ classification: 'strong_under_evidence', direction: 'under', score: -0.81, evaluated_line: 2.5, quality_cap_reason: 'none', backfilled: false,
      reasons: [{ reason_code: 'window_agreement_support', category: 'support', intra_category_rank: 1, contribution_magnitude: 0.72 }] }),
    ...buildSeriesAndWindows(2.5, [elig(1), elig(2), elig(0), elig(2), elig(1), elig(3), elig(1), elig(2), elig(0), elig(1)]),
    current_market_row: makeMarketRow({ consensus_point: 2.5, eligible_book_count: 6, points: [{ point: 2.5, book_count: 6 }], min_point: 2.5, max_point: 2.5, first_point: 2.5, one_sided: 'neither' }),
    line_observed_at: OBSERVED_AT,
  }),
  // 6) Insufficient Evidence
  grain(6, 'player_rebounds', 'Insufficient Evidence', {
    player: 'Research Forward F', team: 'Synthetic Springs', evaluated_line: 7.5, tipoff_utc: '2026-07-28T01:30:00.000Z',
    profile_output: profile({ classification: 'insufficient_evidence', direction: null, score: null, evaluated_line: 7.5, quality_cap_reason: 'none', backfilled: false,
      reasons: [{ reason_code: 'insufficient_l10_sample', category: 'quality', intra_category_rank: 1, contribution_magnitude: null }] }),
    ...buildSeriesAndWindows(7.5, [elig(8), elig(6), elig(9), DNP]),
    current_market_row: makeMarketRow({ consensus_point: 7.5, eligible_book_count: 3, points: [{ point: 7.5, book_count: 3 }], min_point: 7.5, max_point: 7.5, first_point: 7.5, one_sided: 'neither' }),
    line_observed_at: OBSERVED_AT,
  }),
  // 7) Unavailable
  grain(7, 'player_assists', 'Unavailable', {
    player: 'Research Center G', team: 'Test Town', evaluated_line: null, tipoff_utc: '2026-07-28T02:00:00.000Z',
    profile_output: profile({ classification: 'unavailable', direction: null, score: null, evaluated_line: null, quality_cap_reason: 'none', backfilled: false,
      reasons: [{ reason_code: 'no_current_market', category: 'quality', intra_category_rank: 1, contribution_magnitude: null }] }),
    windows: makeWindows(0, []),
    series: [
      { game_date_utc: '2026-06-01', opponent_label: 'Mock Bay', is_home: true, stat_value: 4, eligibility_state: 'eligible', minutes_status: 'played', includes_backfilled_historical: false },
      { game_date_utc: '2026-06-02', opponent_label: 'Test Town', is_home: false, stat_value: 6, eligibility_state: 'eligible', minutes_status: 'played', includes_backfilled_historical: false },
      { game_date_utc: '2026-06-03', opponent_label: 'Preview Park', is_home: null, stat_value: null, eligibility_state: 'non_participation', minutes_status: 'dnp', includes_backfilled_historical: false },
    ],
    current_market_row: makeMarketRow({ consensus_point: null, eligible_book_count: 0, points: [], min_point: null, max_point: null, first_point: null, one_sided: null }),
    line_observed_at: null,
  }),
];

/** Grain descriptors (ids + label) so tests can query each fixture. */
export const RESEARCH_FIXTURE_GRAINS = GRAINS.map((g) => ({
  internal_game_id: g.internal_game_id, internal_player_id: g.internal_player_id,
  market_key: g.market_key, label: g.label,
}));

// Grains 2 and 5 render as AGED (beyond the serve horizon) so the Research View
// shows its aged/stale-historical marker; the rest render FRESH; grain 7 has no
// observation (unknown freshness). Freshness is resolved at QUERY time so a
// "fresh" grain is always within the horizon regardless of when it is viewed.
const AGED_GAME_IDS: ReadonlySet<string> = new Set([
  `eeee0000-0000-0000-0000-${String(2).padStart(12, '0')}`,
  `eeee0000-0000-0000-0000-${String(5).padStart(12, '0')}`,
]);
const AGED_OBSERVED_AT = '2026-01-01T00:00:00.000Z'; // always > horizon in the past

export class FixtureResearchRepository implements ResearchRepository {
  private readonly byKey: Map<string, ResearchCandidate>;
  constructor(grains: ReadonlyArray<FixtureGrain> = GRAINS) {
    this.byKey = new Map(grains.map((g) => [`${g.internal_game_id}|${g.internal_player_id}|${g.market_key}`, g.candidate]));
  }
  async queryResearchGrain(
    method: MethodVersion, internal_game_id: string, internal_player_id: string, market_key: string,
  ): Promise<ResearchCandidate | null> {
    assertKnownMethodVersion(method);
    const cand = this.byKey.get(`${internal_game_id}|${internal_player_id}|${market_key}`);
    if (cand === undefined) return null;
    if (cand.line_observed_at === null) return cand; // unknown freshness (grain 7)
    const line_observed_at = AGED_GAME_IDS.has(internal_game_id)
      ? AGED_OBSERVED_AT
      : new Date(Date.now() - 60_000).toISOString(); // fresh: 60s ago
    return { ...cand, line_observed_at };
  }
}

import 'server-only';
// V1-6a Scope E/F — in-memory fixture repository (SERVER-ONLY).
//
// Implements the SAME `BoardRepository` interface as production, so tests and
// the serialization audit exercise the real rank -> project -> render path
// with controlled rows and NO hosted connectivity.
//
// The fixtures carry DISTINCTIVE, unmistakable values for every prohibited
// field (composite score, paid per-book offering detail). The serialization
// audit asserts these values appear NOWHERE in any browser-visible response
// or client bundle. It is legitimate for this SERVER-ONLY module to contain
// them (Scope F): the audit proves they never cross the server->browser
// boundary — not that they are absent from server build artifacts.

import type { BoardRepository } from './boardRepository.js';
import type { RankedCandidate, BoardConsensusContext } from '../rankedCandidate.js';
import { assertKnownMethodVersion, type MethodVersion } from '../method.js';
import { FIXTURE_INGESTION_METRIC, type IngestionLagMetric } from '../../../../../src/ops/ingestionGate.js';
import type { EvidenceProfileOutput, ComponentValues } from '../../../../../src/evidence/types.js';
import type {
  EvidenceInputBundleState,
  PersistedWindowAggregate,
  PersistedSeriesPosition,
} from '../../../../../src/evidence/v2/readEvidenceInputs.js';

// --- DISTINCTIVE prohibited values (could not occur incidentally) ---
export const DISTINCTIVE_COMPOSITE_SCORE = -0.9182736455;
export const DISTINCTIVE_PAID_BOOK = 'ZZQXFIXTUREBOOK7788';
export const DISTINCTIVE_PAID_PRICE = -424242;
// V1-8a1 Amendment 21 CANARY: a distinctive SERVER-SIDE-ONLY internal_game_id
// carried on every fixture series position. The serialization audit + tests
// prove it never reaches a browser-visible response (the projection drops it).
export const DISTINCTIVE_INTERNAL_GAME_ID = 'ZZQXFIXTUREGAME9911CANARY';
// A persisted DIFF that DISAGREES with (avg − evaluated_line): proves the
// projection carries the PERSISTED avg_minus_threshold, never an arithmetic
// derivation (avg 25.3, line 24.5 → avg−line = 0.8, but persisted DIFF = 7.7).
export const DISTINCTIVE_PERSISTED_DIFF = 7.7;

function components(score: number): ComponentValues {
  return {
    c_rtp: 0.4, c_ms: 0.3, c_wa: 0.2, c_ma: 0.1,
    composite_score: score, direction: 'over',
    c_rtp_non_l5_magnitude: null, longer_window_choice: 'L20',
  };
}

function profile(
  classification: EvidenceProfileOutput['classification'],
  opts: {
    direction: EvidenceProfileOutput['direction'];
    quality_capped: boolean;
    quality_cap_reason: EvidenceProfileOutput['quality_cap_reason'];
    includes_backfilled_historical: boolean;
    evaluated_line: number | null;
  }
): EvidenceProfileOutput {
  return {
    classification,
    direction: opts.direction,
    components: components(DISTINCTIVE_COMPOSITE_SCORE),
    quality_capped: opts.quality_capped,
    quality_cap_reason: opts.quality_cap_reason,
    includes_backfilled_historical: opts.includes_backfilled_historical,
    evaluated_line: opts.evaluated_line,
    evaluated_source_kind: opts.evaluated_line === null ? null : 'sportsbook_consensus',
    evaluated_source_identifier: null,
    reasons: [],
    method_version: 'evidence_method_v1',
  };
}

function candidate(
  method: MethodVersion,
  base: {
    internal_game_id: string; player: string; team: string; market: string;
    evaluated_line: number | null; composite_score: number | null;
    l10_eligible_n: number; eligible_sportsbook_count: number;
    // V1-6d: serve-gate input. Optional — defaults to a FRESH observation
    // (well inside the 3600s horizon) so default fixtures always serve.
    line_observed_at?: string | null;
    // V1-8a1 band inputs (server-side). Omit `bundle` for a legacy profile.
    bundle?: EvidenceInputBundleState;
    consensus?: BoardConsensusContext;
    game_context?: { player_team: string; opponent: string; is_home: boolean; scheduled_start_utc: string };
  },
  profile_output: EvidenceProfileOutput
): RankedCandidate {
  return {
    composite_score: base.composite_score,
    l10_eligible_n: base.l10_eligible_n,
    eligible_sportsbook_count: base.eligible_sportsbook_count,
    internal_game_id: base.internal_game_id,
    internal_player_id: `pppp0000-0000-0000-0000-${base.internal_game_id.slice(-12)}`,
    evidence_profile_id: `epid-${base.internal_game_id}`,
    game_context: base.game_context,
    method_version: method,
    line_observed_at: base.line_observed_at === undefined ? freshObservedAt() : base.line_observed_at,
    player: base.player,
    team: base.team,
    market: base.market,
    evaluated_line: base.evaluated_line,
    profile_output,
    paid_book_offerings: [{ book: DISTINCTIVE_PAID_BOOK, price: DISTINCTIVE_PAID_PRICE }],
    ...(base.bundle !== undefined ? { bundle: base.bundle } : {}),
    ...(base.consensus !== undefined ? { consensus: base.consensus } : {}),
  };
}

// --- V1-8a1 fixture bundle builders (mirror the persisted V1-8a0a shape) ---
interface PosSpec { readonly stat: number | null; readonly dnp?: boolean; readonly ineligibleNoLine?: boolean }

/** Build persisted series positions. EVERY position carries the CANARY
 *  internal_game_id (server-side); the projection must drop it. */
function seriesPositions(specs: ReadonlyArray<PosSpec>, evaluated_line: number): PersistedSeriesPosition[] {
  return specs.map((s, i) => {
    const eligible = !s.dnp && !s.ineligibleNoLine && s.stat !== null;
    const outcome: 'above' | 'below' | 'equal' =
      s.stat! > evaluated_line ? 'above' : s.stat! < evaluated_line ? 'below' : 'equal';
    return {
      ordinal: i,
      internal_game_id: DISTINCTIVE_INTERNAL_GAME_ID,
      game_date_utc: `2026-06-${String(i + 1).padStart(2, '0')}`,
      opponent_label: `Opp${i}`,
      is_home: i % 2 === 0,
      stat_value: eligible ? s.stat : null,
      evaluated_line,
      eligibility_state: s.dnp ? 'non_participation' : s.ineligibleNoLine ? 'eligible' : 'eligible',
      minutes_status: s.dnp ? 'dnp' : 'played',
      includes_backfilled_historical: false,
      verdict: eligible ? { kind: 'eligible', outcome } : { kind: 'ineligible' },
    };
  });
}

interface Scalars { readonly avg: number | null; readonly diff: number | null; readonly streakDir: 'above' | 'below' | 'equal' | null; readonly streakLen: number | null }

/** A window aggregate computed from the series' N-most-recent ELIGIBLE positions
 *  (mirrors computeThresholdWindow membership). avg/diff/streak are the PERSISTED
 *  scalars (not derived from the series) — proving the projection carries them. */
function windowFromSeries(window_type: 'L5' | 'L10' | 'L20' | 'season', positions: ReadonlyArray<PersistedSeriesPosition>, evaluated_line: number, N: number | null, sc: Scalars): PersistedWindowAggregate {
  const eligible = positions.filter((p) => p.verdict.kind === 'eligible');
  const chosen = N === null ? eligible : eligible.slice(Math.max(0, eligible.length - N));
  let above = 0, below = 0, equal = 0;
  for (const p of chosen) {
    const o = (p.verdict as { outcome: 'above' | 'below' | 'equal' }).outcome;
    if (o === 'above') above += 1; else if (o === 'below') below += 1; else equal += 1;
  }
  const eligible_n = chosen.length;
  const incomplete = N !== null && eligible_n < N;
  return {
    window_type, evaluated_line, requested_n: N ?? eligible_n, eligible_n, incomplete,
    count_above: above, count_equal: equal, count_below: below,
    avg_stat_value: sc.avg, median_stat_value: sc.avg,
    avg_minus_threshold: sc.diff, median_minus_threshold: sc.diff,
    current_streak_direction: sc.streakDir, current_streak_length: sc.streakLen,
    coverage_label: eligible_n === 0 ? 'no_data' : incomplete ? 'incomplete' : 'complete',
    includes_backfilled_historical: false,
  };
}

function availableBundle(positions: ReadonlyArray<PersistedSeriesPosition>, evaluated_line: number, sc: Scalars): EvidenceInputBundleState {
  return {
    status: 'available',
    bundle: {
      windows: {
        L5: windowFromSeries('L5', positions, evaluated_line, 5, sc),
        L10: windowFromSeries('L10', positions, evaluated_line, 10, sc),
        L20: windowFromSeries('L20', positions, evaluated_line, 20, sc),
        season: windowFromSeries('season', positions, evaluated_line, null, sc),
      },
      source_identities: [
        { normalized_source_id: 'draftkings', display_name: 'DraftKings' },
        { normalized_source_id: 'fanduel', display_name: 'FanDuel' },
      ],
      source_count: 2,
      series: { status: 'available', positions: [...positions] },
    },
  };
}

const FIXTURE_CONSENSUS: BoardConsensusContext = Object.freeze({
  consensus_point: 24.5, min_point: 24.0, max_point: 25.0, book_count: 6,
  distribution: [{ point: 24.0, count: 1 }, { point: 24.5, count: 4 }, { point: 25.0, count: 1 }],
  freshness_state: 'fresh',
});

/** Alpha's series — an ineligible DNP INTERLEAVED inside the L10 span (ordinal 3). */
const ALPHA_SPECS: ReadonlyArray<PosSpec> = [
  { stat: 30 }, { stat: 20 }, { stat: 28 }, { dnp: true, stat: null }, { stat: 26 },
  { stat: 22 }, { stat: 27 }, { stat: 18 }, { stat: 31 }, { stat: 19 }, { stat: 33 }, { stat: 29 },
];
const ALPHA_SCALARS: Scalars = { avg: 25.3, diff: DISTINCTIVE_PERSISTED_DIFF, streakDir: 'above', streakLen: 2 };

/**
 * A recent observation time (60s ago), captured per call, so default fixtures
 * are ALWAYS inside the serve-suppress horizon regardless of when the test or
 * the serialization audit runs. Serve-gate boundary behaviour is exercised by
 * boardServingGate.test.ts, which supplies explicit line_observed_at values
 * relative to an INJECTED serve_now — never by real waiting.
 */
export function freshObservedAt(): string {
  return new Date(Date.now() - 60_000).toISOString();
}

/**
 * Default fixture set: v2 rows spanning classifications (Strong with
 * provenance, Moderate with a stale-market cap, Mixed, Unavailable) PLUS a
 * v1 row that MUST be excluded when the active method is v2.
 */
export function defaultFixtureCandidates(): ReadonlyArray<RankedCandidate> {
  const alphaPositions = seriesPositions(ALPHA_SPECS, 24.5);
  return [
    candidate('evidence_method_v2',
      { internal_game_id: 'aaaa1111-0000-0000-0000-000000000001', player: 'Fixture Alpha', team: 'Aces', market: 'player_points', evaluated_line: 24.5, composite_score: DISTINCTIVE_COMPOSITE_SCORE, l10_eligible_n: 10, eligible_sportsbook_count: 6,
        game_context: { player_team: 'Las Vegas', opponent: 'Phoenix', is_home: false, scheduled_start_utc: '2026-07-30T23:00:00Z' },
        bundle: availableBundle(alphaPositions, 24.5, ALPHA_SCALARS), consensus: FIXTURE_CONSENSUS },
      profile('strong_over_evidence', { direction: 'over', quality_capped: false, quality_cap_reason: 'none', includes_backfilled_historical: true, evaluated_line: 24.5 })),
    candidate('evidence_method_v2',
      { internal_game_id: 'aaaa1111-0000-0000-0000-000000000002', player: 'Fixture Bravo', team: 'Lynx', market: 'player_rebounds', evaluated_line: 8.5, composite_score: 0.42, l10_eligible_n: 9, eligible_sportsbook_count: 5,
        game_context: { player_team: 'Minnesota', opponent: 'Seattle', is_home: true, scheduled_start_utc: '2026-07-31T00:00:00Z' },
        bundle: availableBundle(seriesPositions([{ stat: 10 }, { stat: 7 }, { stat: 9 }, { stat: 11 }, { stat: 6 }], 8.5), 8.5, { avg: 8.6, diff: 0.1, streakDir: 'below', streakLen: 1 }), consensus: FIXTURE_CONSENSUS },
      profile('moderate_over_evidence', { direction: 'over', quality_capped: true, quality_cap_reason: 'stale_current_market', includes_backfilled_historical: false, evaluated_line: 8.5 })),
    // Charlie — GENUINE ZERO-SAMPLE: persisted bundle present, but no eligible
    // observations (empty series, eligible_n = 0). Distinct from legacy.
    candidate('evidence_method_v2',
      { internal_game_id: 'aaaa1111-0000-0000-0000-000000000003', player: 'Fixture Charlie', team: 'Storm', market: 'player_assists', evaluated_line: 5.5, composite_score: 0.05, l10_eligible_n: 8, eligible_sportsbook_count: 4,
        game_context: { player_team: 'Seattle', opponent: 'New York', is_home: false, scheduled_start_utc: '2026-07-31T02:00:00Z' },
        bundle: availableBundle([], 5.5, { avg: null, diff: null, streakDir: null, streakLen: null }), consensus: FIXTURE_CONSENSUS },
      profile('mixed_evidence', { direction: null, quality_capped: false, quality_cap_reason: 'none', includes_backfilled_historical: false, evaluated_line: 5.5 })),
    // Delta — LEGACY: NO persisted bundle → typed unavailable_not_persisted band.
    candidate('evidence_method_v2',
      { internal_game_id: 'aaaa1111-0000-0000-0000-000000000004', player: 'Fixture Delta', team: 'Sky', market: 'player_threes', evaluated_line: null, composite_score: null, l10_eligible_n: 0, eligible_sportsbook_count: 0,
        game_context: { player_team: 'Chicago', opponent: 'Indiana', is_home: true, scheduled_start_utc: '2026-07-31T23:30:00Z' } },
      profile('unavailable', { direction: null, quality_capped: false, quality_cap_reason: 'none', includes_backfilled_historical: false, evaluated_line: null })),
    // v1 row — MUST be excluded when active method is v2.
    candidate('evidence_method_v1',
      { internal_game_id: 'bbbb2222-0000-0000-0000-000000000001', player: 'V1 Should Not Appear', team: 'Sun', market: 'player_points', evaluated_line: 21.5, composite_score: 0.99, l10_eligible_n: 12, eligible_sportsbook_count: 7 },
      profile('strong_over_evidence', { direction: 'over', quality_capped: false, quality_cap_reason: 'none', includes_backfilled_historical: false, evaluated_line: 21.5 })),
  ];
}

/**
 * Fixture repository. Filters by method EXACTLY like production (v1 rows are
 * excluded when v2 is requested). No hosted connectivity.
 */
export class FixtureBoardRepository implements BoardRepository {
  private readonly rows: ReadonlyArray<RankedCandidate>;
  constructor(rows?: ReadonlyArray<RankedCandidate>) {
    this.rows = rows ?? defaultFixtureCandidates();
  }
  async queryRankedCandidates(method: MethodVersion): Promise<ReadonlyArray<RankedCandidate>> {
    assertKnownMethodVersion(method);
    return this.rows.filter((r) => r.method_version === method);
  }

  /**
   * V1-OP-4 — the FIXTURE/preview source has NO live ingestion (it is design
   * data, not a live pipeline), so the ingestion gate is EXEMPT here: it
   * reports "current", never suppresses, and never emits the serve-time log.
   * The design-preview boards and the serialization audit therefore always
   * render.
   */
  async probeIngestionLag(_serve_now: string): Promise<IngestionLagMetric> {
    return FIXTURE_INGESTION_METRIC;
  }
}

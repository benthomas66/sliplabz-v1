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
import type { RankedCandidate } from '../rankedCandidate.js';
import { assertKnownMethodVersion, type MethodVersion } from '../method.js';
import type { EvidenceProfileOutput, ComponentValues } from '../../../../../src/evidence/types.js';

// --- DISTINCTIVE prohibited values (could not occur incidentally) ---
export const DISTINCTIVE_COMPOSITE_SCORE = -0.9182736455;
export const DISTINCTIVE_PAID_BOOK = 'ZZQXFIXTUREBOOK7788';
export const DISTINCTIVE_PAID_PRICE = -424242;

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
  },
  profile_output: EvidenceProfileOutput
): RankedCandidate {
  return {
    composite_score: base.composite_score,
    l10_eligible_n: base.l10_eligible_n,
    eligible_sportsbook_count: base.eligible_sportsbook_count,
    internal_game_id: base.internal_game_id,
    method_version: method,
    player: base.player,
    team: base.team,
    market: base.market,
    evaluated_line: base.evaluated_line,
    profile_output,
    paid_book_offerings: [{ book: DISTINCTIVE_PAID_BOOK, price: DISTINCTIVE_PAID_PRICE }],
  };
}

/**
 * Default fixture set: v2 rows spanning classifications (Strong with
 * provenance, Moderate with a stale-market cap, Mixed, Unavailable) PLUS a
 * v1 row that MUST be excluded when the active method is v2.
 */
export function defaultFixtureCandidates(): ReadonlyArray<RankedCandidate> {
  return [
    candidate('evidence_method_v2',
      { internal_game_id: 'aaaa1111-0000-0000-0000-000000000001', player: 'Fixture Alpha', team: 'Aces', market: 'player_points', evaluated_line: 24.5, composite_score: DISTINCTIVE_COMPOSITE_SCORE, l10_eligible_n: 10, eligible_sportsbook_count: 6 },
      profile('strong_over_evidence', { direction: 'over', quality_capped: false, quality_cap_reason: 'none', includes_backfilled_historical: true, evaluated_line: 24.5 })),
    candidate('evidence_method_v2',
      { internal_game_id: 'aaaa1111-0000-0000-0000-000000000002', player: 'Fixture Bravo', team: 'Lynx', market: 'player_rebounds', evaluated_line: 8.5, composite_score: 0.42, l10_eligible_n: 9, eligible_sportsbook_count: 5 },
      profile('moderate_over_evidence', { direction: 'over', quality_capped: true, quality_cap_reason: 'stale_current_market', includes_backfilled_historical: false, evaluated_line: 8.5 })),
    candidate('evidence_method_v2',
      { internal_game_id: 'aaaa1111-0000-0000-0000-000000000003', player: 'Fixture Charlie', team: 'Storm', market: 'player_assists', evaluated_line: 5.5, composite_score: 0.05, l10_eligible_n: 8, eligible_sportsbook_count: 4 },
      profile('mixed_evidence', { direction: null, quality_capped: false, quality_cap_reason: 'none', includes_backfilled_historical: false, evaluated_line: 5.5 })),
    candidate('evidence_method_v2',
      { internal_game_id: 'aaaa1111-0000-0000-0000-000000000004', player: 'Fixture Delta', team: 'Sky', market: 'player_threes', evaluated_line: null, composite_score: null, l10_eligible_n: 0, eligible_sportsbook_count: 0 },
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
}

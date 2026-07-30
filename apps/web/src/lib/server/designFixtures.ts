import 'server-only';
// V1-6e Scope A — DESIGN-PREVIEW fixture matrix (SERVER-ONLY).
//
// 23 synthetic evidence profiles spanning every classification, all five
// owner-ratified quality-cap tags, provenance, and a spread of display ages,
// built entirely through the REAL types (no `as any`, no partial casts). They
// drive the /design-preview route ONLY — the production /board route never
// imports this module (proven by v1_6e route-isolation test). The route wires
// this set to the SAME injected `BoardRepository` seam the audits already use;
// it is NOT a second production data path and NOT a client-controllable switch.
//
// WHY `server-only`: like `fixtureRepository.ts`, this module legitimately
// carries the DISTINCTIVE prohibited canary values (composite score, paid
// offering detail) so the serialization audit can prove they never cross the
// server→browser boundary from /design-preview either. It must never be
// bundled into a client component.
//
// HONESTY NOTE (reported): quality caps are placed ONLY on scored
// classifications (strong_/moderate_). A cap presupposes a score to downgrade,
// so a cap tag on Unavailable / Insufficient / Mixed is type-constructible but
// semantically incoherent — per the ticket's "do not force it" instruction
// those combinations are omitted, not fabricated.
//
// Player and team names are OBVIOUSLY synthetic ("Fixture Guard A",
// "Preview City") so no screenshot can misrepresent a real person's market.

import type { RankedCandidate } from '../rankedCandidate.js';
import type { EvidenceProfileOutput, ComponentValues } from '../../../../../src/evidence/types.js';
import type {
  EvidenceClassification,
  EvidenceDirection,
  EvidenceQualityCapReason,
} from '../../../../../src/shared/enums.js';
import {
  DISTINCTIVE_COMPOSITE_SCORE,
  DISTINCTIVE_PAID_BOOK,
  DISTINCTIVE_PAID_PRICE,
} from './fixtureRepository.js';

/** The persistent, non-dismissible preview banner. Rendered SERVER-SIDE at the
 *  top of every /design-preview page. Swept by the copy-safety test. */
export const DESIGN_PREVIEW_BANNER =
  'DESIGN PREVIEW — FIXTURE DATA. Not live market information.';

export const DESIGN_PREVIEW_HEADING = 'Design Preview';
export const DESIGN_PREVIEW_SUBHEADING =
  'Synthetic fixtures rendered through the real projection, ranking, serving gate, and renderer.';

function components(score: number | null): ComponentValues {
  // The DISTINCTIVE canary lives in the RESTRICTED components (server-side
  // only) so the audit's grep is meaningful; it never reaches the projection.
  return {
    c_rtp: 0.4, c_ms: 0.3, c_wa: 0.2, c_ma: 0.1,
    composite_score: score === null ? null : DISTINCTIVE_COMPOSITE_SCORE,
    direction: 'over',
    c_rtp_non_l5_magnitude: null, longer_window_choice: 'L20',
  };
}

function profileOutput(a: {
  classification: EvidenceClassification;
  direction: EvidenceDirection | null;
  quality_cap_reason: EvidenceQualityCapReason;
  includes_backfilled_historical: boolean;
  evaluated_line: number | null;
  composite_score: number | null;
}): EvidenceProfileOutput {
  return {
    classification: a.classification,
    direction: a.direction,
    components: components(a.composite_score),
    quality_capped: a.quality_cap_reason !== 'none',
    quality_cap_reason: a.quality_cap_reason,
    includes_backfilled_historical: a.includes_backfilled_historical,
    evaluated_line: a.evaluated_line,
    evaluated_source_kind: a.evaluated_line === null ? null : 'sportsbook_consensus',
    evaluated_source_identifier: null,
    reasons: [],
    // The shared EvidenceProfileOutput shape pins this to v1 (as in
    // fixtureRepository); v2 selection lives on the top-level candidate.
    method_version: 'evidence_method_v1',
  };
}

interface Spec {
  n: number;
  player: string;
  team: string;
  market: string;
  classification: EvidenceClassification;
  direction: EvidenceDirection | null;
  evaluated_line: number | null;
  cap: EvidenceQualityCapReason;
  backfilled: boolean;
  score: number | null;
  books: number;
  age_seconds: number;
}

// The 23-row matrix. Ages are seconds BEFORE the injected serve_now; all are
// ≤ 3400 so every row passes the 3600s serving gate and renders (aging is
// spread so a future age-marker has data). See the report for the full table.
const SPECS: readonly Spec[] = [
  // --- 7 base classifications (no cap, no provenance) ---
  { n: 1,  player: 'Fixture Guard A',   team: 'Preview City',    market: 'player_points',   classification: 'strong_over_evidence',    direction: 'over',  evaluated_line: 24.5, cap: 'none', backfilled: false, score: 0.95,  books: 6, age_seconds: 0 },
  { n: 2,  player: 'Fixture Forward B', team: 'Test Town',       market: 'player_rebounds', classification: 'moderate_over_evidence',  direction: 'over',  evaluated_line: 9.5,  cap: 'none', backfilled: false, score: 0.55,  books: 5, age_seconds: 300 },
  { n: 3,  player: 'Fixture Guard C',   team: 'Mock Bay',        market: 'player_assists',  classification: 'mixed_evidence',          direction: null,    evaluated_line: 5.5,  cap: 'none', backfilled: false, score: 0.05,  books: 4, age_seconds: 700 },
  { n: 4,  player: 'Fixture Center D',  team: 'Sample Falls',    market: 'player_points',   classification: 'moderate_under_evidence', direction: 'under', evaluated_line: 18.5, cap: 'none', backfilled: false, score: -0.55, books: 5, age_seconds: 1100 },
  { n: 5,  player: 'Fixture Guard E',   team: 'Preview Park',    market: 'player_threes',   classification: 'strong_under_evidence',   direction: 'under', evaluated_line: 2.5,  cap: 'none', backfilled: false, score: -0.95, books: 6, age_seconds: 1500 },
  { n: 6,  player: 'Fixture Forward F', team: 'Synthetic Springs', market: 'player_rebounds', classification: 'insufficient_evidence', direction: null,    evaluated_line: 7.5,  cap: 'none', backfilled: false, score: 0.02,  books: 3, age_seconds: 1900 },
  { n: 7,  player: 'Fixture Center G',  team: 'Test Town',       market: 'player_assists',  classification: 'unavailable',             direction: null,    evaluated_line: null, cap: 'none', backfilled: false, score: null,  books: 0, age_seconds: 2300 },

  // --- 5 quality-cap tags (each a distinct cap reason, on scored rows) ---
  { n: 8,  player: 'Fixture Guard H',   team: 'Preview City',    market: 'player_points',   classification: 'moderate_over_evidence',  direction: 'over',  evaluated_line: 21.5, cap: 'stale_current_market',          backfilled: false, score: 0.50,  books: 5, age_seconds: 3400 }, // stale-present-capped, near-boundary
  { n: 9,  player: 'Fixture Forward I', team: 'Mock Bay',        market: 'player_rebounds', classification: 'moderate_under_evidence', direction: 'under', evaluated_line: 8.5,  cap: 'insufficient_book_coverage',    backfilled: false, score: -0.50, books: 2, age_seconds: 250 },
  { n: 10, player: 'Fixture Guard J',   team: 'Sample Falls',    market: 'player_threes',   classification: 'strong_over_evidence',    direction: 'over',  evaluated_line: 3.5,  cap: 'push_heavy_sample',             backfilled: false, score: 0.90,  books: 6, age_seconds: 2600 },
  { n: 11, player: 'Fixture Center K',  team: 'Preview Park',    market: 'player_assists',  classification: 'moderate_over_evidence',  direction: 'over',  evaluated_line: 6.5,  cap: 'market_disagrees_with_history', backfilled: false, score: 0.48,  books: 5, age_seconds: 2900 },
  { n: 12, player: 'Fixture Guard L',   team: 'Synthetic Springs', market: 'player_points', classification: 'strong_under_evidence',  direction: 'under', evaluated_line: 15.5, cap: 'one_sided_offering',            backfilled: false, score: -0.90, books: 4, age_seconds: 3100 },

  // --- provenance TRUE (≥2), incl. cap+provenance combinations ---
  { n: 13, player: 'Fixture Forward M', team: 'Test Town',       market: 'player_rebounds', classification: 'strong_over_evidence',    direction: 'over',  evaluated_line: 11.5, cap: 'none', backfilled: true,  score: 0.93,  books: 6, age_seconds: 150 },
  { n: 14, player: 'Fixture Center N',  team: 'Mock Bay',        market: 'player_assists',  classification: 'moderate_under_evidence', direction: 'under', evaluated_line: 4.5,  cap: 'none', backfilled: true,  score: -0.53, books: 5, age_seconds: 3300 }, // near-boundary
  { n: 15, player: 'Fixture Guard O',   team: 'Preview City',    market: 'player_points',   classification: 'moderate_over_evidence',  direction: 'over',  evaluated_line: 22.5, cap: 'stale_current_market',          backfilled: true,  score: 0.52,  books: 5, age_seconds: 1000 }, // cap AND provenance

  // --- fill to 23: remaining combinations and ages ---
  { n: 16, player: 'Fixture Forward P', team: 'Sample Falls',    market: 'player_threes',   classification: 'mixed_evidence',          direction: null,    evaluated_line: 1.5,  cap: 'none', backfilled: true,  score: 0.01,  books: 4, age_seconds: 500 }, // mixed + provenance
  { n: 17, player: 'Fixture Guard Q',   team: 'Preview Park',    market: 'player_assists',  classification: 'strong_over_evidence',    direction: 'over',  evaluated_line: 7.5,  cap: 'none', backfilled: false, score: 0.88,  books: 6, age_seconds: 3400 }, // near-boundary strong
  { n: 18, player: 'Fixture Center R',  team: 'Synthetic Springs', market: 'player_rebounds', classification: 'moderate_over_evidence', direction: 'over', evaluated_line: 10.5, cap: 'none', backfilled: false, score: 0.45,  books: 5, age_seconds: 1300 },
  { n: 19, player: 'Fixture Forward S', team: 'Test Town',       market: 'player_points',   classification: 'insufficient_evidence',   direction: null,    evaluated_line: null, cap: 'none', backfilled: false, score: 0.00,  books: 2, age_seconds: 2000 }, // insufficient, null line
  { n: 20, player: 'Fixture Guard T',   team: 'Mock Bay',        market: 'player_threes',   classification: 'unavailable',             direction: null,    evaluated_line: null, cap: 'none', backfilled: false, score: null,  books: 0, age_seconds: 2800 },
  { n: 21, player: 'Fixture Center U',  team: 'Sample Falls',    market: 'player_rebounds', classification: 'strong_under_evidence',   direction: 'under', evaluated_line: 6.5,  cap: 'none', backfilled: true,  score: -0.92, books: 6, age_seconds: 850 }, // under + provenance
  { n: 22, player: 'Fixture Forward V', team: 'Preview City',    market: 'player_assists',  classification: 'moderate_under_evidence', direction: 'under', evaluated_line: 3.5,  cap: 'push_heavy_sample',             backfilled: true,  score: -0.48, books: 4, age_seconds: 1450 }, // cap + provenance (different cap)
  { n: 23, player: 'Fixture Guard W',   team: 'Preview Park',    market: 'player_points',   classification: 'moderate_over_evidence',  direction: 'over',  evaluated_line: 19.5, cap: 'one_sided_offering',            backfilled: false, score: 0.47,  books: 3, age_seconds: 2150 },
];

/**
 * Build the 23 design-preview candidates with `line_observed_at` set relative
 * to the caller-supplied `serve_now` (age spread 0..3400s, all inside the
 * 3600s serve window). Deterministic given `serve_now`; reads no clock itself.
 */
export function designFixtureCandidates(serve_now: string): RankedCandidate[] {
  const serveMs = Date.parse(serve_now);
  return SPECS.map((s) => {
    const line_observed_at = new Date(serveMs - s.age_seconds * 1000).toISOString();
    const profile_output = profileOutput({
      classification: s.classification,
      direction: s.direction,
      quality_cap_reason: s.cap,
      includes_backfilled_historical: s.backfilled,
      evaluated_line: s.evaluated_line,
      composite_score: s.score,
    });
    return {
      composite_score: s.score,
      l10_eligible_n: s.books >= 10 ? 10 : s.books,
      eligible_sportsbook_count: s.books,
      internal_game_id: `dddd0000-0000-0000-0000-${String(s.n).padStart(12, '0')}`,
      internal_player_id: `pppp0000-0000-0000-0000-${String(s.n).padStart(12, '0')}`,
      method_version: 'evidence_method_v2',
      line_observed_at,
      player: s.player,
      team: s.team,
      market: s.market,
      evaluated_line: s.evaluated_line,
      profile_output,
      // DISTINCTIVE canary — server-side only; the projection never carries it.
      paid_book_offerings: [{ book: DISTINCTIVE_PAID_BOOK, price: DISTINCTIVE_PAID_PRICE }],
    };
  });
}

export const DESIGN_FIXTURE_COUNT = SPECS.length;

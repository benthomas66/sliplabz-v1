// V1-4d STEP 6 — render V1-A1-4 explanations.
//
// Zero operative profiles were persisted (STEP 5), so no LIVE profile can
// be rendered. To honour the ticket's "no human has read a single output"
// concern, this step renders the V1-A1-4 templates against the authority's
// worked-example fixtures (§F.1a Strong Over, §F.1 Moderate Over,
// §F.3 Mixed, §F.5 Unavailable, §F.6 Quality-capped Moderate Over). Every
// input is a documented fixture, not a fabricated live number.
//
// The purpose is to surface the wired-up renderer's output to a human;
// substantive first-profile evidence-engine outputs will happen on the
// operational polling ticket, after the games table is seeded forward and
// events reconcile to internal_game_ids.

import { writeFileSync } from 'node:fs';
import {
  renderFullExplanation,
  renderCompactExplanation,
} from '../src/explanation/index.js';
import {
  FIXTURE_STRONG_OVER,
  FIXTURE_MODERATE_OVER,
  FIXTURE_MIXED,
  FIXTURE_UNAVAILABLE_NO_MARKET,
  FIXTURE_CAPPED_STALE,
} from '../tests/explanation/fixtures.js';

const cases = [
  { name: 'Strong Over Evidence (§F.1a — clean, crosses DR-2 = 0.55)', fixture: FIXTURE_STRONG_OVER,
    illustrative_player: 'A\'ja Wilson (illustrative — fixture)', illustrative_market: 'player_points',
    illustrative_evidence:
      'L5 9/10 Over; L10 hit rate strong; consensus 20.0, evaluated 19.5 (0.5 favorable to Over); 8 books cover the line.' },
  { name: 'Moderate Over Evidence (§F.1 — clean but not quite Strong)', fixture: FIXTURE_MODERATE_OVER,
    illustrative_player: 'Napheesa Collier (illustrative — fixture)', illustrative_market: 'player_points',
    illustrative_evidence:
      'L5 8/10 Over; consensus 20.0, evaluated 19.5 (0.5 favorable to Over); solid margin support.' },
  { name: 'Mixed Evidence (§F.3 — WINDOWS_DISAGREE fires)', fixture: FIXTURE_MIXED,
    illustrative_player: 'Sabrina Ionescu (illustrative — fixture)', illustrative_market: 'player_threes',
    illustrative_evidence:
      'L10 leans Under, L20 leans Over, each with |rate_deviation| ≥ 0.30.' },
  { name: 'Unavailable — NO_CURRENT_MARKET (§F.5)', fixture: FIXTURE_UNAVAILABLE_NO_MARKET,
    illustrative_player: 'Caitlin Clark (illustrative — fixture)', illustrative_market: 'player_points',
    illustrative_evidence: 'No usable current market snapshot.' },
  { name: 'Moderate Over Evidence, quality-capped (§F.6 — stale + limited coverage)', fixture: FIXTURE_CAPPED_STALE,
    illustrative_player: 'Breanna Stewart (illustrative — fixture)', illustrative_market: 'player_points',
    illustrative_evidence:
      'Strong-eligible score (0.4564 sub-0.55, plus §C.10 clause 5 would fail) capped at Moderate by staleness + <3 eligible books.' },
];

const out: any[] = [];
for (const c of cases) {
  const full = renderFullExplanation(c.fixture, { render_numeric_score: true });
  const compact = renderCompactExplanation(c.fixture);
  const entry = {
    case: c.name,
    illustrative_player: c.illustrative_player,
    illustrative_market: c.illustrative_market,
    evaluated_line: c.fixture.evaluated_line,
    illustrative_evidence: c.illustrative_evidence,
    full: {
      classification_label: full.classification_label,
      direction: full.direction,
      prose_paragraphs: full.prose_paragraphs,
      reasons: full.reasons.map((r) => ({
        code: r.reason_code, category: r.category, text: r.text,
      })),
      binding_cap: full.binding_cap,
      provenance_marker: full.provenance_marker,
      disclosure_g1: full.disclosure_g1.text,
      disclosure_g2: full.disclosure_g2?.text ?? null,
    },
    compact: {
      compact_label: compact.compact_label,
      compact_display_line: compact.compact_display_line,
      binding_cap: compact.binding_cap,
      provenance_marker: compact.provenance_marker,
      disclosure_g1: compact.disclosure_g1.text,
      must_never_expose_numeric_score: compact.must_never_expose_numeric_score,
    },
  };
  out.push(entry);
  console.log(JSON.stringify(entry, null, 2));
  console.log('---');
}
writeFileSync('/tmp/v14d/step6_renders.json', JSON.stringify(out, null, 2));
console.log(`# STEP 6 rendered ${out.length} illustrative explanations to /tmp/v14d/step6_renders.json`);

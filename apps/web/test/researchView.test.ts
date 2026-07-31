// V1-7b Phase 1 — Research View tests (fixture-driven; --conditions=react-server).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { FixtureResearchRepository, RESEARCH_FIXTURE_GRAINS } from '../src/lib/server/fixtureResearchRepository.js';
import { constructResearchProjection, type ResearchProjection } from '../src/lib/researchProjection.js';
import { computeResearchFreshness, humanizeAge } from '../src/lib/researchFreshness.js';
import { sweepForbiddenTerms } from '../../../src/explanation/copySafetyTerms.js';

const APP = join(dirname(fileURLToPath(import.meta.url)), '..');
const METHOD = 'evidence_method_v2';
const repo = new FixtureResearchRepository();

async function projFor(i: number): Promise<ResearchProjection> {
  const g = RESEARCH_FIXTURE_GRAINS[i]!;
  const c = await repo.queryResearchGrain(METHOD, g.internal_game_id, g.internal_player_id, g.market_key);
  assert.ok(c, `grain ${i} resolves`);
  return constructResearchProjection(c);
}
async function allProj(): Promise<ResearchProjection[]> {
  return Promise.all(RESEARCH_FIXTURE_GRAINS.map((_, i) => projFor(i)));
}

// -------------------- 1. All seven render; full labels; GD-15 --------------------

test('all seven fixture grains construct without error; every FULL §D.2 label reachable; GD-15 holds', async () => {
  const ps = await allProj();
  assert.equal(ps.length, 7);
  const labels = new Set(ps.map((p) => p.classification_label_full));
  for (const full of ['Strong Over Evidence', 'Moderate Over Evidence', 'Mixed Evidence',
    'Moderate Under Evidence', 'Strong Under Evidence', 'Insufficient Evidence', 'Unavailable']) {
    assert.ok(labels.has(full), `missing full label ${full}`);
  }
  // GD-15: Unavailable is distinct from Insufficient, both present.
  assert.ok(labels.has('Unavailable') && labels.has('Insufficient Evidence'));
  // Compact forms are never used on this surface.
  for (const compact of ['Over-leaning', 'Under-leaning', 'Mixed']) assert.ok(!labels.has(compact));
});

// -------------------- 2. Series / window consistency --------------------

test('L10 window counts equal the tally of COUNTED series entries; DNP/ineligible excluded', async () => {
  for (const p of await allProj()) {
    const counted = p.series.filter((s) => s.counted);
    const above = counted.filter((s) => s.outcome === 'above').length;
    const below = counted.filter((s) => s.outcome === 'below').length;
    const equal = counted.filter((s) => s.outcome === 'equal').length;
    // Fixtures carry <=10 eligible, so L10 spans all counted entries.
    assert.equal(p.windows.L10.count_above, above, 'L10 count_above must equal counted series tally');
    assert.equal(p.windows.L10.count_below, below, 'L10 count_below must equal counted series tally');
    assert.equal(p.windows.L10.count_equal, equal, 'L10 count_equal must equal counted series tally');
    assert.equal(p.windows.L10.eligible_n, counted.length, 'L10 eligible_n must equal counted series count');
    // DNP / ineligible are ghosts: not counted, no outcome.
    for (const s of p.series) {
      if (s.display_status !== 'eligible') {
        assert.equal(s.counted, false, `${s.display_status} entry must not be counted`);
        assert.equal(s.outcome, null, `${s.display_status} entry must have no outcome`);
      }
    }
  }
});

test('the fixtures exercise DNP, played-ineligible, backfilled provenance, and a too-few-games grain', async () => {
  const ps = await allProj();
  const flat = ps.flatMap((p) => p.series);
  assert.ok(flat.some((s) => s.display_status === 'did_not_play' && s.minutes_status === 'dnp'), 'a DNP entry');
  assert.ok(flat.some((s) => s.display_status === 'ineligible' && s.minutes_status === 'played'), 'a played-ineligible entry');
  assert.ok(flat.some((s) => s.includes_backfilled_historical), 'a backfilled-provenance entry');
  assert.ok(ps.some((p) => p.windows.L10.eligible_n < 5), 'a grain with too few games to fill the window');
});

// -------------------- 3. Freshness (display-with-age, never suppression) --------------------

test('an aged grain is aged_historical + beyond horizon; a fresh grain is fresh; unknown when no line', async () => {
  const now = new Date().toISOString();
  // Grain 1 is fresh; grain 2 (index 1) is aged; grain 7 (index 6) is unknown.
  const fresh = await projFor(0);
  const aged = await projFor(1);
  const unknown = await projFor(6);
  const f1 = computeResearchFreshness(fresh.line_observed_at, now);
  const f2 = computeResearchFreshness(aged.line_observed_at, now);
  const f7 = computeResearchFreshness(unknown.line_observed_at, now);
  assert.equal(f1.state, 'fresh');
  assert.equal(f1.beyond_horizon, false);
  assert.equal(f2.state, 'aged_historical');
  assert.equal(f2.beyond_horizon, true); // VISIBLE with a marker, never suppressed
  assert.equal(f7.state, 'unknown');
  assert.equal(humanizeAge(null), 'unknown');
  assert.ok(!/%/.test(humanizeAge(f2.age_seconds)));
});

// -------------------- 4. Grade detail (DR-19) --------------------

test('grade detail: score at most 2 decimals, never a percentage; §G.2 present; versions present', async () => {
  for (const p of await allProj()) {
    if (p.composite_score !== null) {
      assert.equal(p.composite_score, Math.round(p.composite_score * 100) / 100, 'score exceeds 2 decimals');
    }
    assert.ok(p.disclosure_g2.length > 0, '§G.2 text present');
    assert.ok(!p.disclosure_g2.includes('%'));
    assert.ok(p.method_version.length > 0);
    assert.equal(typeof p.computation_version, 'number');
  }
});

// -------------------- 5. Copy safety over EVERY emitted string --------------------

function stringLiteralsOf(relFile: string): string[] {
  const src = readFileSync(join(APP, relFile), 'utf8');
  const out: string[] = [];
  for (const m of src.matchAll(/'([^'\\]*)'|"([^"\\]*)"|`([^`\\$]*)`/g)) {
    const s = m[1] ?? m[2] ?? m[3] ?? '';
    if (s.trim().length > 0) out.push(s);
  }
  return out;
}

test('every authored string on this surface passes the committed forbidden-term sweep', async () => {
  // Authored literals across the view, chart, freshness copy, and routes.
  const authored = [
    ...stringLiteralsOf('components/research/ResearchView.tsx'),
    ...stringLiteralsOf('components/research/EvidenceChart.tsx'),
    ...stringLiteralsOf('src/lib/researchFreshness.ts'),
    ...stringLiteralsOf('app/design-preview/research/page.tsx'),
    ...stringLiteralsOf('app/research/[internal_game_id]/[internal_player_id]/[market_key]/page.tsx'),
  ];
  // Dynamic projection strings the surface emits.
  const dynamic: string[] = [];
  for (const p of await allProj()) {
    dynamic.push(p.player, p.team, p.market, p.classification_label_full, p.disclosure_g1, p.disclosure_g2,
      p.binding_cap_tag ?? '', p.provenance_marker ?? '', p.market_context.selection_method, p.market_context.consensus_coverage_label);
    for (const r of p.reasons) dynamic.push(r.reason_code, r.category);
    for (const s of p.series) dynamic.push(s.opponent_label, s.display_status);
  }
  for (const s of [...authored, ...dynamic]) {
    if (s.trim().length === 0) continue;
    const r = sweepForbiddenTerms(s);
    assert.equal(r.violations.length, 0, `forbidden-term violation in "${s}": ${JSON.stringify(r.violations)}`);
  }
});

// -------------------- 6. Route isolation --------------------

test('route isolation: production route cannot reach fixtures; preview routes cannot reach hosted', () => {
  const prod = readFileSync(join(APP, 'app/research/[internal_game_id]/[internal_player_id]/[market_key]/page.tsx'), 'utf8');
  assert.ok(!prod.includes('fixtureResearchRepository') && !prod.includes('FixtureResearchRepository'), 'production route must not import fixtures');

  for (const rel of ['app/design-preview/research/page.tsx', 'app/design-preview/research/[idx]/page.tsx']) {
    const src = readFileSync(join(APP, rel), 'utf8');
    assert.ok(!src.includes('PostgresResearchRepository'), `${rel} must not import the hosted repo`);
    assert.ok(!src.includes('getBoardPool') && !src.includes('SLIPLABZ_BOARD_DATABASE_URL'), `${rel} must not reach hosted`);
  }
  // Board files must not IMPORT any research module (a comment mentioning the
  // future "Research View" is fine; a module dependency is not).
  for (const rel of ['app/board/page.tsx', 'src/lib/boardProjection.ts', 'src/lib/server/boardRepository.ts', 'src/lib/server/boardService.ts']) {
    const src = readFileSync(join(APP, rel), 'utf8');
    for (const mod of ['researchRepository', 'researchProjection', 'researchCandidate', 'fixtureResearchRepository', 'ResearchView', 'researchFreshness']) {
      assert.ok(!src.includes(mod), `${rel} must not import ${mod}`);
    }
  }
});

// ============================================================================
// V1-8b — COMPREHENSION PASS. Presentation/terminology/interaction only. The
// checks below are (A) DATA-BOUNDARY assertions over the projection the view
// consumes and (B) STRUCTURE assertions over the authored component source
// (the server component cannot be react-rendered under --conditions=react-server;
// its real rendered HTML is audited by test-audit/serialization.test.ts).
// ============================================================================

const VIEW = readFileSync(join(APP, 'components/research/ResearchView.tsx'), 'utf8');
const CHART = readFileSync(join(APP, 'components/research/EvidenceChart.tsx'), 'utf8');
const HISTORY = readFileSync(join(APP, 'components/research/GameHistory.tsx'), 'utf8');

// -------------------- 7. Data boundary: no raw identity / ISO / enum crosses --------------------

test('V1-8b the projection carries display-safe matchup/tipoff, never raw internal_game_id or raw tipoff ISO', async () => {
  for (const p of await allProj()) {
    const json = JSON.stringify(p);
    // Amendment 21 / R5: internal_game_id never present on the projection.
    assert.ok(!json.includes('internal_game_id'), 'internal_game_id key present on the projection');
    assert.ok(!json.includes('internal_player_id'), 'internal_player_id key present on the projection');
    // R1: matchup/tipoff are display strings (ET, server-formatted), not raw ISO.
    assert.ok(!('tipoff_utc' in (p as unknown as Record<string, unknown>)), 'raw tipoff_utc must not survive onto the projection');
    if (p.tipoff !== null) {
      assert.ok(!/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(p.tipoff), `tipoff renders raw ISO: ${p.tipoff}`);
      assert.ok(!p.tipoff.includes('Z'), `tipoff carries a UTC ISO marker: ${p.tipoff}`);
    }
    // Series entries hold NO internal game id and NO raw eligibility enum leak.
    for (const s of p.series) {
      const sj = JSON.stringify(s);
      assert.ok(!sj.includes('internal_game_id'), 'series entry carries internal_game_id');
      // display_status is a translated typed status, not a raw eligibility_state.
      assert.ok(['eligible', 'did_not_play', 'ineligible'].includes(s.display_status), `unexpected display_status ${s.display_status}`);
    }
  }
});

test('V1-8b the compact classification label — not the full §D.2 card — drives the header finding', async () => {
  // The header finding uses the COMPACT label + findingSummary (R2). The FULL
  // label is relocated to the collapsed technical scoring (kept for the audit).
  assert.ok(/data-testid="rv-finding"/.test(VIEW), 'header finding block absent');
  assert.ok(/findingSummary\(p\.classification\)/.test(VIEW), 'header must render the quiet findingSummary, not a big §D.2 card');
  assert.ok(/classification_label_compact/.test(VIEW), 'compact label must drive the Finding Mark');
  // classification_label_full appears ONLY inside the technical scoring section.
  const grade = VIEW.slice(VIEW.indexOf('section-grade-detail'));
  assert.ok(grade.includes('classification_label_full'), 'full label must live in the technical scoring disclosure');
  const beforeGrade = VIEW.slice(0, VIEW.indexOf('section-grade-detail'));
  assert.ok(!beforeGrade.includes('classification_label_full'), 'full §D.2 label must not appear above the technical disclosure');
});

// -------------------- 8. Window interaction (R3): L10 default, four selectors, one summary --------------------

test('V1-8b window selector: four CSS radios, L10 is the sole default, one summary block per window', () => {
  // The four windows come from ONE constant; the radios/chips/blocks are template-
  // generated per window (server-rendered), so we assert the constant + templates.
  assert.ok(/const WINDOWS = \['L5', 'L10', 'L20', 'season'\]/.test(VIEW), 'the four-window constant is not L5/L10/L20/season');
  assert.ok(VIEW.includes('id={`rv-w-${w}`}'), 'per-window radio template absent');
  assert.ok(VIEW.includes('data-testid={`window-chip-${w}`}'), 'per-window chip template absent');
  assert.ok(VIEW.includes('data-testid={`window-block-${w}`}'), 'per-window block template absent');
  // Exactly one defaultChecked, and it is L10.
  const checks = [...VIEW.matchAll(/defaultChecked=\{w === '([^']+)'\}/g)].map((m) => m[1]);
  assert.deepEqual(checks, ['L10'], 'exactly one window default and it must be L10');
  // The selected summary is ONE block driven by CSS :checked, not four static cards.
  assert.ok(VIEW.includes(':checked ~ .rv-blocks .rv-block-'), 'CSS-driven single-window selection rule absent');
  assert.ok(VIEW.includes('.rv-block { display: none; }'), 'window blocks are not hidden-by-default (would show all four at once)');
});

test('V1-8b the selected window renders PERSISTED window values only — no client-side recomputation', () => {
  // The summary reads count_above/below/equal, eligible_n, avg, streak straight
  // off the persisted window object; there is no arithmetic on series in the view.
  assert.ok(VIEW.includes('w.count_above') && VIEW.includes('w.count_below') && VIEW.includes('w.count_equal'), 'window counts not read from persisted window');
  assert.ok(VIEW.includes('w.eligible_n'), 'eligible_n not read from persisted window');
  // No forbidden client-calc primitives over the series in the view/chart.
  for (const src of [VIEW, CHART]) {
    assert.ok(!/\.filter\([^)]*counted/.test(src), 'view/chart recomputes counted totals (client-side calc)');
    assert.ok(!/\.reduce\(/.test(src), 'view/chart reduces the series (client-side calc)');
  }
});

// -------------------- 9. History visualization (R4) + game inspection (R5/R6) --------------------

test('V1-8b chart: horizontal scroll, one date label per column, ghost bars for ineligible, no valence colors', () => {
  assert.ok(/overflowX:\s*'auto'/.test(CHART), 'chart must scroll horizontally for wide spans');
  assert.ok(CHART.includes('data-testid="chart-scroll"'), 'chart scroll container absent');
  // Exactly one date label helper, one per column (no opponent labels in the plot).
  assert.ok((CHART.match(/shortDate\(/g) ?? []).length >= 1, 'per-column date label absent');
  assert.ok(!CHART.includes('opponent_label'), 'opponent labels in the chart would overlap — they belong in the history rows');
  // Ghost bars mark ineligible/DNP positions; no green/red valence (strip comments
  // first so the word "prediction" doesn't false-match a bare /red/).
  assert.ok(CHART.includes("data-kind={ghost ? 'ineligible' : 'eligible'}"), 'ghost/eligible column kind marker absent');
  const chartCode = CHART.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(!/\bgreen\b|\bred\b|#0f0|#f00|#00ff00|#ff0000/i.test(chartCode), 'chart uses good/bad valence colors');
});

test('V1-8b game history: chronological detail rows, DNP/ineligible marked EXCLUDED, no internal game id', () => {
  const historyCode = HISTORY.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(HISTORY.includes('data-testid="game-row"'), 'game rows absent');
  assert.ok(HISTORY.includes('<details'), 'game inspection must be native <details> (no client JS)');
  // Each row identifies its game by DATE + opponent (display-safe), never an id.
  assert.ok(HISTORY.includes('game_date_utc') && HISTORY.includes('opponent_label'), 'rows must show date + opponent');
  assert.ok(!historyCode.includes('internal_game_id'), 'game row exposes internal_game_id');
  assert.ok(HISTORY.includes('excluded from evidence counts'), 'excluded rows must be marked out of the counts');
  // No box-score stats beyond the tracked stat vs the evaluated line.
  assert.ok(!/rebound|assist|steal|block|minutes played/i.test(historyCode), 'game history leaks box-score stats');
});

// -------------------- 10. Technical disclosure (R7/R8/R9): collapsed, non-probabilistic --------------------

test('V1-8b technical scoring is collapsed by default and the score is labelled non-probabilistic', async () => {
  // <details> for technical scoring must NOT carry `open`.
  const m = /data-testid="technical-scoring"([^>]*)>/.exec(VIEW);
  assert.ok(m !== null, 'technical-scoring details absent');
  assert.ok(!/\bopen\b/.test(m[1]!), 'technical scoring must be collapsed by default (no `open`)');
  // Market + reason technical mappings are also collapsed <details>.
  assert.ok(/data-testid="market-technical"/.test(VIEW) && /data-testid="reasons-technical"/.test(VIEW), 'collapsible technical mappings absent');
  // The score is described as a research-ranking score, never a probability.
  assert.ok(VIEW.includes('Evidence Strength score'), 'score not given a non-probabilistic label');
  for (const p of await allProj()) {
    // §G.2 is committed authority copy that NEGATES probability framing ("...not the
    // estimated probability that a prop will hit"); its job is to frame the score as
    // a research-ranking, so we assert only the positive framing anchor.
    assert.ok(/research-ranking score/i.test(p.disclosure_g2), '§G.2 must frame the score as a research-ranking, not a forecast');
  }
});

test('V1-8b authored view/chart/history carry no probability / pick / hit-rate / EV / confidence framing', () => {
  // Strip comments, then sweep the authored copy for framing forbidden beyond the
  // committed term list (defence in depth over the copySafetyTerms sweep above).
  for (const [name, src] of [['ResearchView', VIEW], ['EvidenceChart', CHART], ['GameHistory', HISTORY]] as const) {
    const code = src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const bad of [/\bprobabilit/i, /\bhit rate\b/i, /\bexpected value\b/i, /\bconfidence\b/i, /\bguarantee/i, /\block of the day\b/i, /\bwin rate\b/i]) {
      assert.ok(!bad.test(code), `${name} authored copy matched forbidden framing ${bad}`);
    }
  }
});

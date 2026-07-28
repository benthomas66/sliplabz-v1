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

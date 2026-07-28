// V1-7a — research read-model plumbing tests (fixture-driven; react-server).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, statSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  FixtureResearchRepository, RESEARCH_FIXTURE_GRAINS,
} from '../src/lib/server/fixtureResearchRepository.js';
import { PostgresResearchRepository } from '../src/lib/server/researchRepository.js';
import {
  constructResearchProjection, assertResearchProjectionKeySet,
  RESEARCH_PROJECTION_KEYS, RESEARCH_PROJECTION_FORBIDDEN_KEYS,
  type ResearchProjection,
} from '../src/lib/researchProjection.js';
import { assertBoardProjectionKeySet, BOARD_PROJECTION_FORBIDDEN_KEYS } from '../src/lib/boardProjection.js';

const APP = join(dirname(fileURLToPath(import.meta.url)), '..');
const METHOD = 'evidence_method_v2';
const repo = new FixtureResearchRepository();

async function allProjections(): Promise<Array<{ label: string; proj: ResearchProjection; cand: NonNullable<Awaited<ReturnType<FixtureResearchRepository['queryResearchGrain']>>> }>> {
  const out = [];
  for (const g of RESEARCH_FIXTURE_GRAINS) {
    const cand = await repo.queryResearchGrain(METHOD, g.internal_game_id, g.internal_player_id, g.market_key);
    assert.ok(cand, `fixture grain ${g.label} must resolve`);
    out.push({ label: g.label, proj: constructResearchProjection(cand), cand });
  }
  return out;
}

// -------------------- 1. EVERY FIELD TRACES; window counts equal source exactly --------------------

test('every ResearchProjection field traces to a computed source value; window counts equal the source exactly', async () => {
  for (const { proj, cand } of await allProjections()) {
    for (const w of ['L5', 'L10', 'L20', 'season'] as const) {
      const src = cand.windows[w];
      const got = proj.windows[w];
      assert.equal(got.count_above, src.count_above, `${w} count_above must equal source`);
      assert.equal(got.count_below, src.count_below, `${w} count_below must equal source`);
      assert.equal(got.count_equal, src.count_equal, `${w} count_equal must equal source`);
      assert.equal(got.eligible_n, src.eligible_n, `${w} eligible_n must equal source`);
      assert.equal(got.avg_stat_value, src.avg_stat_value);
      assert.equal(got.median_stat_value, src.median_stat_value);
      assert.equal(got.current_streak_length, src.current_streak_length);
      // Counts are internally consistent: above+equal+below === eligible_n.
      assert.equal(got.count_above + got.count_equal + got.count_below, got.eligible_n);
    }
    // score traces to the engine output, rounded to 2 decimals (DR-19(a)).
    const rawScore = cand.profile_output.components.composite_score;
    assert.equal(proj.composite_score, rawScore === null ? null : Math.round(rawScore * 100) / 100);
    assert.equal(proj.components.c_rtp, cand.profile_output.components.c_rtp);
    assert.equal(proj.components.c_ma, cand.profile_output.components.c_ma);
    // market context traces to the composed current-market row.
    assert.equal(proj.market_context.consensus_point, cand.current_market_row.line_consensus.consensus_point);
    assert.equal(proj.market_context.eligible_book_count, cand.current_market_row.eligible_book_count.count);
    // reasons trace exactly.
    assert.equal(proj.reasons.length, cand.profile_output.reasons.length);
    for (let i = 0; i < proj.reasons.length; i++) {
      assert.equal(proj.reasons[i]!.reason_code, cand.profile_output.reasons[i]!.reason_code);
      assert.equal(proj.reasons[i]!.category, cand.profile_output.reasons[i]!.category);
    }
    // line_observed_at (serving-gate input) traces.
    assert.equal(proj.line_observed_at, cand.line_observed_at);
  }
});

// -------------------- DR-19(c): method + computation version present and matching --------------------

test('DR-19(c): method_version and computation_version are present and match the persisted candidate', async () => {
  for (const { proj, cand } of await allProjections()) {
    assert.ok(Object.prototype.hasOwnProperty.call(proj, 'method_version'), 'method_version must be present');
    assert.ok(Object.prototype.hasOwnProperty.call(proj, 'computation_version'), 'computation_version must be present');
    assert.equal(proj.method_version, cand.method_version, 'method_version must match the candidate (persisted profile)');
    assert.equal(proj.computation_version, cand.computation_version, 'computation_version must match the candidate (persisted profile)');
    assert.equal(typeof proj.computation_version, 'number');
    assert.ok(proj.method_version.length > 0);
  }
});

// -------------------- DR-19(a): composite_score rounded to 2 decimals at the boundary --------------------

test('DR-19(a): projected composite_score has at most 2 decimals; the candidate retains full precision', async () => {
  let sawHigherPrecisionCandidate = false;
  for (const { proj, cand } of await allProjections()) {
    if (proj.composite_score !== null) {
      // At most 2 decimals: rounding to 2 decimals is a no-op on the projected value.
      assert.equal(proj.composite_score, Math.round(proj.composite_score * 100) / 100, 'projected score exceeds 2 decimals');
      const decimals = (String(proj.composite_score).split('.')[1] ?? '').length;
      assert.ok(decimals <= 2, `projected score "${proj.composite_score}" has ${decimals} decimals`);
    }
    const raw = cand.profile_output.components.composite_score;
    if (raw !== null && Math.round(raw * 100) / 100 !== raw) {
      // The candidate kept MORE precision than the projection exposes.
      sawHigherPrecisionCandidate = true;
      assert.notEqual(proj.composite_score, raw, 'projection must not expose the candidate full precision');
      assert.equal(proj.composite_score, Math.round(raw * 100) / 100);
    }
  }
  assert.ok(sawHigherPrecisionCandidate, 'at least one fixture must carry >2-decimal precision to exercise rounding');
});

// -------------------- 2. KEY-SET ASSERTION: exact allowlist; forbidden throws --------------------

test('key-set assertion accepts the exact allowlist and rejects a smuggled forbidden key', async () => {
  const { proj } = (await allProjections())[0]!;
  assert.doesNotThrow(() => assertResearchProjectionKeySet(proj));
  // composite_score is ALLOWED here (DR-19 Research View).
  assert.ok((RESEARCH_PROJECTION_KEYS as readonly string[]).includes('composite_score'));

  // A smuggled top-level forbidden key throws.
  const withOfferings = { ...proj, offerings: [{ book: 'X', price: -110 }] } as unknown as ResearchProjection;
  assert.throws(() => assertResearchProjectionKeySet(withOfferings), /offerings|FORBIDDEN|unexpected/i);
  // A smuggled unknown key throws.
  const withExtra = { ...proj, surprise: 1 } as unknown as ResearchProjection;
  assert.throws(() => assertResearchProjectionKeySet(withExtra), /unexpected|surprise/i);
  // Per-book offerings smuggled into the market context throws.
  const withNestedPaid = { ...proj, market_context: { ...proj.market_context, offerings: [1] } } as unknown as ResearchProjection;
  assert.throws(() => assertResearchProjectionKeySet(withNestedPaid), /offerings|FORBIDDEN/i);
});

test('the projection never carries paid per-book offerings or restricted handles', async () => {
  for (const { proj } of await allProjections()) {
    const blob = JSON.stringify(proj);
    assert.ok(!blob.includes('ZZQXFIXTUREBOOK7788'), 'paid book leaked into a research projection');
    assert.ok(!blob.includes('-424242'), 'paid price leaked into a research projection');
    for (const f of RESEARCH_PROJECTION_FORBIDDEN_KEYS) {
      assert.ok(!Object.prototype.hasOwnProperty.call(proj, f), `carries forbidden key ${f}`);
    }
  }
});

// -------------------- 3. COUNTS ARE COUNTS: no rate/percentage, no "N/M" --------------------

test('no projected string field encodes a rate, a percentage, or a short "N/M" count form', async () => {
  for (const { proj } of await allProjections()) {
    const strings: string[] = [
      proj.player, proj.team, proj.market, proj.classification, proj.classification_label_full,
      proj.disclosure_g1, proj.disclosure_g2, proj.market_context.selection_method,
      proj.market_context.consensus_coverage_label,
      ...(proj.direction !== null ? [proj.direction] : []),
      ...(proj.tipoff_utc !== null ? [proj.tipoff_utc] : []),
      ...(proj.evaluated_source_kind !== null ? [proj.evaluated_source_kind] : []),
      ...(proj.binding_cap_tag !== null ? [proj.binding_cap_tag] : []),
      ...(proj.provenance_marker !== null ? [proj.provenance_marker] : []),
      ...(proj.market_context.one_sided !== null ? [proj.market_context.one_sided] : []),
      ...proj.reasons.map((r) => `${r.reason_code} ${r.category}`),
    ];
    for (const s of strings) {
      assert.ok(!s.includes('%'), `percentage sign in "${s}"`);
      assert.ok(!/\d+\s*\/\s*\d+/.test(s), `"N/M" short count form in "${s}"`);
      assert.ok(!/\brate\b/i.test(s), `the word "rate" in "${s}"`);
    }
  }
});

// -------------------- 4. FULL §D.2 LABELS reachable; compact forms NOT used --------------------

test('all seven FULL §D.2 labels are reachable across fixtures; compact forms are never used', async () => {
  const labels = new Set((await allProjections()).map((x) => x.proj.classification_label_full));
  for (const full of ['Strong Over Evidence', 'Moderate Over Evidence', 'Mixed Evidence',
    'Moderate Under Evidence', 'Strong Under Evidence', 'Insufficient Evidence', 'Unavailable']) {
    assert.ok(labels.has(full), `full label "${full}" not reachable`);
  }
  // The dense-Board compact forms must NEVER be the Research label.
  for (const compact of ['Over-leaning', 'Under-leaning', 'Mixed']) {
    assert.ok(!labels.has(compact), `compact form "${compact}" used as a Research label`);
  }
});

// -------------------- 5. BOARD ISOLATION: BoardProjection still rejects composite_score --------------------

test('BoardProjection still forbids composite_score (Board path unchanged by this ticket)', () => {
  assert.ok((BOARD_PROJECTION_FORBIDDEN_KEYS as readonly string[]).includes('composite_score'));
  const smuggled = {
    player: 'X', team: 'Y', market: 'player_points', evaluated_line: 1.5,
    classification_label: 'Over-leaning', compact_display_line: 'Over-leaning', disclosure_g1: 'D',
    composite_score: 0.5,
  } as never;
  assert.throws(() => assertBoardProjectionKeySet(smuggled, { cap: false, provenance: false }), /composite_score|FORBIDDEN|unexpected/i);
});

// -------------------- 6. NOTHING RENDERED: no route wires the research modules --------------------

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

// V1-7a rendered nothing; V1-7b (the Research View) legitimately adds the
// /research and /design-preview/research routes. The enduring invariant is that
// research modules are wired ONLY under those research routes — NEVER under the
// Board route (isolation preserved).
test('research modules are wired only under the research routes, never under /board', () => {
  const appFiles = walk(join(APP, 'app'));
  for (const f of appFiles) {
    const src = readFileSync(f, 'utf8');
    const wiresResearch = /research(Projection|Candidate|Repository)|ResearchView|researchFreshness/.test(src);
    if (wiresResearch) {
      assert.ok(/[/\\]research[/\\]|design-preview[/\\]research/.test(f), `${f} wires research outside a research route`);
    }
  }
});

// -------------------- Repository shape + fail-loud --------------------

test('PostgresResearchRepository exists and implements the interface (no connection made)', () => {
  const r = new PostgresResearchRepository();
  assert.equal(typeof r.queryResearchGrain, 'function');
});

test('the fixture repository fails loud on an unknown method and returns null for an unknown grain', async () => {
  await assert.rejects(
    () => repo.queryResearchGrain('evidence_method_bogus' as never, 'g', 'p', 'player_points'),
    /fail-loud/i,
  );
  const miss = await repo.queryResearchGrain(METHOD, 'no-such-game', 'no-such-player', 'player_points');
  assert.equal(miss, null);
});

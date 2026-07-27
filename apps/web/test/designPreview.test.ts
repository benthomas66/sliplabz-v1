// V1-6e — DESIGN-PREVIEW tests (fixture preview mode).
//
// Fixture-driven; run with `--conditions=react-server` (see package.json) so
// the `server-only` markers resolve to their empty module.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { getBoardData } from '../src/lib/server/boardService.js';
import { FixtureBoardRepository } from '../src/lib/server/fixtureRepository.js';
import {
  designFixtureCandidates,
  DESIGN_FIXTURE_COUNT,
  DESIGN_PREVIEW_BANNER,
  DESIGN_PREVIEW_HEADING,
  DESIGN_PREVIEW_SUBHEADING,
} from '../src/lib/server/designFixtures.js';
import { compactClassificationLabel } from '../../../src/explanation/index.js';
import { EVIDENCE_CLASSIFICATIONS } from '../../../src/shared/enums.js';
import { sweepForbiddenTerms } from '../../../src/explanation/copySafetyTerms.js';

const APP = join(dirname(fileURLToPath(import.meta.url)), '..');
const SERVE_NOW = '2026-07-27T18:00:00.000Z';

// -------------------- SCOPE D#1 — ROUTE ISOLATION --------------------

test('the PRODUCTION route module graph cannot reach designFixtures', () => {
  // The production route and its server data path must not import the design
  // fixtures — there is no code path by which /board serves fixture data.
  const productionServerFiles = [
    'app/board/page.tsx',
    'src/lib/server/boardService.ts',
    'src/lib/server/boardRepository.ts',
    'src/lib/boardProjection.ts',
    'src/lib/rankedCandidate.ts',
  ];
  for (const rel of productionServerFiles) {
    const src = readFileSync(join(APP, rel), 'utf8');
    assert.ok(!src.includes('designFixtures'), `${rel} must not reference designFixtures`);
    assert.ok(!src.includes('design-preview'), `${rel} must not reference the preview route`);
  }
});

test('the preview route DOES wire the fixtures, and does so by route (no query/cookie/header/env switch)', () => {
  const page = readFileSync(join(APP, 'app/design-preview/page.tsx'), 'utf8');
  assert.ok(page.includes('designFixtureCandidates'), 'preview route must wire the design fixtures');
  // No request-time source switch: the route selects fixtures unconditionally,
  // never from searchParams/cookies/headers/env.
  for (const bad of ['searchParams', 'cookies(', 'headers(', 'process.env']) {
    assert.ok(!page.includes(bad), `preview route must not select its source via ${bad}`);
  }
});

// -------------------- SCOPE D#2 — BANNER --------------------

test('the banner text lives on the preview route and NOT on the production route', () => {
  const preview = readFileSync(join(APP, 'app/design-preview/page.tsx'), 'utf8');
  const board = readFileSync(join(APP, 'app/board/page.tsx'), 'utf8');
  assert.ok(preview.includes('DESIGN_PREVIEW_BANNER'), 'preview route must render the banner');
  assert.ok(!board.includes('DESIGN_PREVIEW_BANNER') && !board.includes('DESIGN PREVIEW'),
    'production route must never render the preview banner');
  assert.equal(DESIGN_PREVIEW_BANNER, 'DESIGN PREVIEW — FIXTURE DATA. Not live market information.');
});

// -------------------- SCOPE D#3 — 23 FIXTURES RENDER --------------------

test('all 23 fixtures render through the real pipeline; none vanish at the serving gate', async () => {
  assert.equal(DESIGN_FIXTURE_COUNT, 23);
  const candidates = designFixtureCandidates(SERVE_NOW);
  assert.equal(candidates.length, 23);
  const { projections } = await getBoardData(new FixtureBoardRepository(candidates), SERVE_NOW);
  // Every fixture is inside the 3600s window (max age 3400s), so all 23 render.
  assert.equal(projections.length, 23, 'all 23 fixtures must survive the serving gate and project');
});

test('every classification label appears; GD-15 holds (Unavailable never collapsed into Insufficient)', async () => {
  const candidates = designFixtureCandidates(SERVE_NOW);
  const { projections } = await getBoardData(new FixtureBoardRepository(candidates), SERVE_NOW);
  const labels = new Set(projections.map((p) => p.classification_label));
  for (const c of EVIDENCE_CLASSIFICATIONS) {
    assert.ok(labels.has(compactClassificationLabel(c)), `missing classification label for ${c}`);
  }
  // GD-15: the two labels are DISTINCT and both present.
  const unavailable = compactClassificationLabel('unavailable');
  const insufficient = compactClassificationLabel('insufficient_evidence');
  assert.notEqual(unavailable, insufficient);
  assert.ok(labels.has(unavailable) && labels.has(insufficient));
});

test('all five owner-ratified cap tags and provenance are represented', async () => {
  const candidates = designFixtureCandidates(SERVE_NOW);
  const { projections } = await getBoardData(new FixtureBoardRepository(candidates), SERVE_NOW);
  const capTags = new Set(projections.map((p) => p.cap_tag).filter((x): x is string => x !== undefined));
  for (const tag of ['stale market', 'limited book coverage', 'push-heavy recent sample',
    'market disagrees with history', 'one-sided offering']) {
    assert.ok(capTags.has(tag), `missing cap tag "${tag}"`);
  }
  const provCount = projections.filter((p) => p.provenance_marker !== undefined).length;
  assert.ok(provCount >= 2, `provenance marker must appear on >=2 rows, got ${provCount}`);
});

// -------------------- COPY SAFETY (fixtures + preview copy) --------------------

test('every authored preview string and fixture name passes the committed forbidden-term sweep', async () => {
  const strings: string[] = [DESIGN_PREVIEW_BANNER, DESIGN_PREVIEW_HEADING, DESIGN_PREVIEW_SUBHEADING];
  const candidates = designFixtureCandidates(SERVE_NOW);
  for (const c of candidates) {
    strings.push(c.player, c.team, c.market);
  }
  const { projections } = await getBoardData(new FixtureBoardRepository(candidates), SERVE_NOW);
  for (const p of projections) {
    strings.push(p.classification_label, p.compact_display_line, p.disclosure_g1);
    if (p.cap_tag !== undefined) strings.push(p.cap_tag);
    if (p.provenance_marker !== undefined) strings.push(p.provenance_marker);
  }
  for (const s of strings) {
    const r = sweepForbiddenTerms(s);
    assert.equal(r.violations.length, 0, `forbidden-term violation in "${s}": ${JSON.stringify(r.violations)}`);
  }
});

// -------------------- PROJECTION BOUNDARY (fixtures carry no restricted keys) --------------------

test('no design-preview projection carries a forbidden key or a distinctive restricted value', async () => {
  const candidates = designFixtureCandidates(SERVE_NOW);
  const { projections } = await getBoardData(new FixtureBoardRepository(candidates), SERVE_NOW);
  const blob = JSON.stringify(projections);
  assert.ok(!blob.includes('9182736455'), 'composite-score digits leaked into a projection');
  assert.ok(!blob.includes('ZZQXFIXTUREBOOK7788'), 'paid book leaked into a projection');
  assert.ok(!blob.includes('424242'), 'paid price leaked into a projection');
  for (const p of projections) {
    for (const forbidden of ['composite_score', 'paid_book_offerings', 'profile_output', 'line_observed_at', 'internal_game_id']) {
      assert.ok(!Object.prototype.hasOwnProperty.call(p, forbidden), `projection carries forbidden key ${forbidden}`);
    }
  }
});

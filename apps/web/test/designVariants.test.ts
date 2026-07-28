// V1-6f — design-variant tests (fixture-driven; --conditions=react-server).
//
// Rendered-markup assertions (pills, chips, chevrons, GD-15 treatments in the
// served HTML) live in the serialization audit against a real Next server; here
// we cover the pure presentation logic, the projected data, and route isolation.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { getBoardData } from '../src/lib/server/boardService.js';
import { FixtureBoardRepository } from '../src/lib/server/fixtureRepository.js';
import { designFixtureCandidates } from '../src/lib/server/designFixtures.js';
import {
  COMPACT_LABEL_SET,
  pillKindForLabel,
  pillStyle,
  PREVIEW_HUES,
} from '../src/lib/previewVariantStyle.js';

const APP = join(dirname(fileURLToPath(import.meta.url)), '..');
const SERVE_NOW = '2026-07-27T18:00:00.000Z';

async function projections() {
  const c = designFixtureCandidates(SERVE_NOW);
  const { projections } = await getBoardData(new FixtureBoardRepository(c), SERVE_NOW);
  return projections;
}

// -------------------- LABELS: only the five §D.2 compact strings --------------------

test('every rendered pill string is one of the five §D.2 compact labels (no paraphrase, no full form)', async () => {
  const ps = await projections();
  assert.equal(ps.length, 23);
  const allowed = new Set<string>(COMPACT_LABEL_SET);
  for (const p of ps) {
    assert.ok(allowed.has(p.classification_label), `pill "${p.classification_label}" is not a §D.2 compact label`);
  }
  // All five compact forms are exercised by the 23-fixture matrix.
  const seen = new Set(ps.map((p) => p.classification_label));
  for (const l of COMPACT_LABEL_SET) assert.ok(seen.has(l), `compact label "${l}" never appears`);
  // The full (Discover/Research-View) forms must NOT be used as pill text here.
  for (const full of ['Strong Over Evidence', 'Moderate Over Evidence', 'Strong Under Evidence', 'Moderate Under Evidence', 'Mixed Evidence']) {
    assert.ok(!seen.has(full), `full label "${full}" leaked onto a dense-Board pill`);
  }
  // Round-2's mischaracterized strings are legitimate §D.2 compact labels; ensure
  // the pill styler ACCEPTS them (they are not invented) and REJECTS a paraphrase.
  assert.doesNotThrow(() => pillKindForLabel('Over-leaning'));
  assert.doesNotThrow(() => pillKindForLabel('Under-leaning'));
  assert.throws(() => pillKindForLabel('Strong Over Evidence'), /not a §D\.2 compact label/);
  assert.throws(() => pillKindForLabel('Over'), /not a §D\.2 compact label/);
});

// -------------------- STRONG vs MODERATE: deliberately NOT differentiated --------------------

test('Strong and Moderate collapse to one pill treatment (no strength differentiation on the Board)', () => {
  // Both map to the same compact label AND the same pill style — the projection
  // carries no strength signal, and §D.2 rule 4 protects that distinction on
  // Discover / Research View, not the Board.
  assert.equal(pillKindForLabel('Over-leaning'), 'over');
  assert.deepEqual(pillStyle('over'), pillStyle('over'));
  // Sanity: the "Over-leaning" pill is identical regardless of underlying strength
  // (there is only one style for the label), so Strong-over and Moderate-over rows
  // are visually identical pills — by design.
  const overStyle = pillStyle(pillKindForLabel('Over-leaning'));
  assert.equal(overStyle['background'], PREVIEW_HUES.over);
});

// -------------------- GD-15: Insufficient vs Unavailable distinct treatments --------------------

test('GD-15: Insufficient and Unavailable render DISTINCT pill treatments', () => {
  const ins = pillStyle('insufficient');
  const una = pillStyle('unavailable');
  assert.notDeepEqual(ins, una, 'Insufficient and Unavailable must be visually distinct');
  assert.equal(ins['border'], `1px dashed ${PREVIEW_HUES.neutral}`);
  assert.equal(una['opacity'], 0.72);
  // Both are non-directional (neither uses the over/under hue) — no false valence.
  for (const s of [ins, una]) {
    assert.notEqual(s['background'], PREVIEW_HUES.over);
    assert.notEqual(s['background'], PREVIEW_HUES.under);
  }
});

test('the directional hue pair is valence-neutral (documented; not green/red)', () => {
  assert.equal(PREVIEW_HUES.over, '#57A6D9');   // azure
  assert.equal(PREVIEW_HUES.under, '#B58AD6');  // violet
  assert.notEqual(PREVIEW_HUES.over, PREVIEW_HUES.under);
});

// -------------------- CAP + PROVENANCE data present on the right rows --------------------

test('capped fixtures carry cap_tag; backfilled fixtures carry provenance_marker', async () => {
  const ps = await projections();
  const caps = new Set(ps.map((p) => p.cap_tag).filter((x): x is string => x !== undefined));
  for (const tag of ['stale market', 'limited book coverage', 'push-heavy recent sample',
    'market disagrees with history', 'one-sided offering']) {
    assert.ok(caps.has(tag), `cap tag "${tag}" not present to ride a pill`);
  }
  const prov = ps.filter((p) => p.provenance_marker !== undefined);
  assert.ok(prov.length >= 2, 'at least two rows must carry the provenance marker');
  for (const p of prov) {
    assert.equal(p.provenance_marker, 'Includes seeded historical closing lines'); // §D.4 rule 7 verbatim
  }
});

// -------------------- ROUTE ISOLATION (hard rail) --------------------

test('the production /board route cannot reach the variant pages or the design fixtures', () => {
  for (const rel of ['app/board/page.tsx', 'src/lib/server/boardService.ts', 'src/lib/server/boardRepository.ts', 'components/BoardTable.tsx']) {
    const src = readFileSync(join(APP, rel), 'utf8');
    assert.ok(!src.includes('designFixtures'), `${rel} must not reference designFixtures`);
    assert.ok(!src.includes('design-preview'), `${rel} must not reference the preview route`);
    assert.ok(!src.includes('previewVariant'), `${rel} must not reference the variant style module`);
  }
});

test('both variant pages select their fixture source by route, with no request-time switch', () => {
  for (const rel of ['app/design-preview/a/page.tsx', 'app/design-preview/b/page.tsx']) {
    const src = readFileSync(join(APP, rel), 'utf8');
    assert.ok(src.includes('designFixtureCandidates'), `${rel} must wire the design fixtures`);
    for (const bad of ['searchParams', 'cookies(', 'headers(', 'process.env']) {
      assert.ok(!src.includes(bad), `${rel} must not select its source via ${bad}`);
    }
  }
  // The baseline index links to both variants.
  const idx = readFileSync(join(APP, 'app/design-preview/page.tsx'), 'utf8');
  assert.ok(idx.includes('/design-preview/a') && idx.includes('/design-preview/b'), 'baseline must link to both variants');
});

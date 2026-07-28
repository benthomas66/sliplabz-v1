// V1-6b Scope E — DEPLOYED-RESPONSE AUDIT (committed, re-runnable, URL-driven).
//
// Local audit results are NOT evidence for the deployed artifact (founder
// amendment 11). This runs the browser-visible checks against a LIVE preview
// URL so the design review and every future deploy can re-run them.
//
// Usage:  DEPLOY_BOARD_URL=https://<preview-host> \
//           node --conditions=react-server --import tsx --test test-audit/deployedResponse.test.ts
// Skips (does not fail) when DEPLOY_BOARD_URL is unset, so the fast/audit
// suites are unaffected.
//
// What CANNOT be covered against a deployed URL, and why (documented, not
// silently dropped): the server-log scan (no access to the deployed server's
// stdout), and the fixture-driven POPULATED-Board case (the deployed app reads
// hosted, where zero v2 rows exist today → the honest deployed result is the
// approved empty state). Those remain covered by the committed LOCAL audit
// (`serialization.test.ts`) under the SAME webpack builder — which is exactly
// what the V1-6b builder pin (GAP-15) guarantees.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DISTINCTIVE_COMPOSITE_SCORE,
  DISTINCTIVE_PAID_BOOK,
  DISTINCTIVE_PAID_PRICE,
} from '../src/lib/server/fixtureRepository.js';
import { EMPTY_STATE_MESSAGE } from '../src/lib/boardCopy.js';

const BASE = process.env['DEPLOY_BOARD_URL'];
const skip = BASE === undefined || BASE === '' ? 'DEPLOY_BOARD_URL not set' : false;

const SCORE_DIGITS = String(DISTINCTIVE_COMPOSITE_SCORE).replace(/[^0-9]/g, '').replace(/^0+/, '');
const PAID_PRICE_DIGITS = String(DISTINCTIVE_PAID_PRICE).replace(/[^0-9]/g, '');
const PROHIBITED = [SCORE_DIGITS, DISTINCTIVE_PAID_BOOK, PAID_PRICE_DIGITS];
// A connection-string VALUE must never appear. The env var NAME may legitimately
// appear in server-side error text; its VALUE (a postgres URI) must not.
const SECRET_MARKERS = ['postgres://', 'postgresql://', 'SLIPLABZ_BOARD_DATABASE_URL='];

function boardUrl(): string { return `${BASE!.replace(/\/$/, '')}/board`; }
function previewUrl(): string { return `${BASE!.replace(/\/$/, '')}/design-preview`; }
// The distinctive fixture furniture a POPULATED preview board must render.
const PREVIEW_POSITIVE_CONTROLS = ['DESIGN PREVIEW', 'stale market', 'Includes seeded historical closing lines'];

test('deployed Board HTML: prohibited values + secrets absent; flight present; empty-state positive control', { skip }, async () => {
  const res = await fetch(boardUrl());
  const html = await res.text();

  // POSITIVE CONTROL first: the deployed page renders real expected content.
  // Today that is the approved empty state (hosted holds zero v2 profiles). A
  // configuration-error page instead means the env var is wrong/absent — do
  // NOT weaken this to pass.
  assert.equal(res.status, 200, `deployed /board returned ${res.status}; body:\n${html.slice(0, 800)}`);
  assert.ok(
    html.includes(EMPTY_STATE_MESSAGE),
    `deployed page did not render the approved empty state ("${EMPTY_STATE_MESSAGE}"). ` +
    `If a config error is shown, the ${'SLIPLABZ_BOARD_DATABASE_URL'} preview env var is wrong or absent.\n` +
    html.slice(0, 800)
  );

  // ANTI-VACUOUS GUARD: the RSC flight payload IS present in what we fetched.
  assert.ok(html.includes('__next_f'), 'RSC flight marker __next_f absent in the deployed body');

  // Negative assertions over the COMPLETE raw body (incl. <script>).
  for (const bad of PROHIBITED) {
    assert.ok(!html.includes(bad), `prohibited value "${bad}" present in the deployed HTML`);
  }
  for (const s of SECRET_MARKERS) {
    assert.ok(!html.includes(s), `secret material "${s}" present in the deployed HTML`);
  }
});

test('V1-6e deployed /design-preview: banner present, POPULATED board, prohibited values + secrets absent', { skip }, async () => {
  const res = await fetch(previewUrl());
  const html = await res.text();

  assert.equal(res.status, 200, `deployed /design-preview returned ${res.status}; body:\n${html.slice(0, 800)}`);
  // POSITIVE CONTROL: the persistent banner AND a populated board (cap + provenance furniture).
  for (const ctl of PREVIEW_POSITIVE_CONTROLS) {
    assert.ok(html.includes(ctl), `deployed /design-preview missing "${ctl}" — banner absent or board not populated`);
  }
  assert.ok(html.includes('__next_f'), 'RSC flight marker __next_f absent on deployed /design-preview');

  // Fixture canaries and secrets never reach the browser from the preview either.
  for (const bad of PROHIBITED) {
    assert.ok(!html.includes(bad), `prohibited value "${bad}" present in deployed /design-preview HTML`);
  }
  for (const s of SECRET_MARKERS) {
    assert.ok(!html.includes(s), `secret material "${s}" present in deployed /design-preview HTML`);
  }
});

test('V1-6e isolation: the deployed production /board carries NO preview banner', { skip }, async () => {
  const html = await (await fetch(boardUrl())).text();
  assert.ok(!html.includes('DESIGN PREVIEW'), 'preview banner leaked onto the deployed /board route');
});

// V1-6f — the deployed design-variant sub-pages (the founder taps these).
const V6F_COMPACT_LABELS = ['Over-leaning', 'Under-leaning', 'Mixed', 'Insufficient Evidence', 'Unavailable'];
const V6F_FULL_FORBIDDEN = ['Strong Over Evidence', 'Moderate Over Evidence', 'Strong Under Evidence', 'Moderate Under Evidence', 'Mixed Evidence'];
for (const seg of ['a', 'b']) {
  test(`V1-6f deployed /design-preview/${seg}: banner, populated, exact §D.2 labels, prohibited/full-form absent`, { skip }, async () => {
    const res = await fetch(`${BASE!.replace(/\/$/, '')}/design-preview/${seg}`);
    const html = await res.text();
    assert.equal(res.status, 200, `deployed /design-preview/${seg} returned ${res.status}`);
    assert.ok(html.includes('DESIGN PREVIEW'), `variant ${seg} banner missing`);
    assert.ok(html.includes('__next_f'), `variant ${seg} flight marker absent`);
    for (const l of V6F_COMPACT_LABELS) assert.ok(html.includes(l), `variant ${seg} missing §D.2 label "${l}"`);
    for (const f of V6F_FULL_FORBIDDEN) assert.ok(!html.includes(f), `variant ${seg} leaked full label "${f}"`);
    for (const bad of PROHIBITED) assert.ok(!html.includes(bad), `prohibited "${bad}" in variant ${seg}`);
    for (const s of SECRET_MARKERS) assert.ok(!html.includes(s), `secret "${s}" in variant ${seg}`);
  });
}

test('deployed client bundles: no db code, no secrets, no prohibited values', { skip }, async () => {
  const html = await (await fetch(boardUrl())).text();
  const rel = [...html.matchAll(/\/_next\/static\/[^"'()\s]+?\.js/g)].map((m) => m[0]);
  const bundleUrls = Array.from(new Set(rel)).map((p) => `${BASE!.replace(/\/$/, '')}${p}`);
  assert.ok(bundleUrls.length > 0, 'no client bundle URLs found in the deployed HTML');

  for (const u of bundleUrls) {
    const code = await (await fetch(u)).text();
    for (const bad of [...PROHIBITED, ...SECRET_MARKERS, 'pg-connection-string']) {
      assert.ok(!code.includes(bad), `"${bad}" found in deployed client bundle ${u}`);
    }
    assert.ok(!/new Pool\s*\(/.test(code), `pg Pool construction found in deployed client bundle ${u}`);
  }
});

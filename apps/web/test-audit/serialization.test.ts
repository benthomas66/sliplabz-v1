// V1-6a REVISE — BROWSER-VISIBLE SERIALIZATION AUDIT (committed, deterministic).
//
// Codifies the ad-hoc audit from the build session. Run via `npm run audit`
// (which builds first). NO hosted dependency: serves the FIXTURE data source.
//
// It captures the COMPLETE response bodies (initial HTML incl. <script>, and
// the RSC flight) — never a parsed DOM — and asserts every distinctive
// prohibited fixture value is absent, while proving (a) the flight payload IS
// present in what it grepped and (b) known-allowed content IS present, so the
// test cannot pass vacuously against an empty/moved/error body.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DISTINCTIVE_COMPOSITE_SCORE,
  DISTINCTIVE_PAID_BOOK,
  DISTINCTIVE_PAID_PRICE,
  DISTINCTIVE_INTERNAL_GAME_ID,
} from '../src/lib/server/fixtureRepository.js';

const APP_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
// Spawn the Next CLI directly (NOT via `npx`) so we own the process and its
// group — `npx` would orphan the real server and hang the runner at exit.
const NEXT_BIN = join(APP_DIR, 'node_modules', 'next', 'dist', 'bin', 'next');
const FIXTURE_PORT = 39391;
const EMPTY_PORT = 39392;

// Distinctive values as they could appear in any serialization.
const SCORE_DIGITS = String(DISTINCTIVE_COMPOSITE_SCORE).replace(/[^0-9]/g, '').replace(/^0+/, ''); // "9182736455"
const PAID_PRICE_DIGITS = String(DISTINCTIVE_PAID_PRICE).replace(/[^0-9]/g, ''); // "424242"
// V1-8a1 Amendment 21: the SERVER-SIDE-ONLY internal_game_id canary. It is
// carried on every fixture series position (server side) and MUST be dropped by
// the projection before the band crosses to the 'use client' BoardTable — so it
// can never appear in the RSC flight, HTML, client bundles, or the server log.
const PROHIBITED = [SCORE_DIGITS, DISTINCTIVE_PAID_BOOK, PAID_PRICE_DIGITS, DISTINCTIVE_INTERNAL_GAME_ID];
const SECRETS = ['postgres://', 'postgresql://', 'SLIPLABZ_BOARD_DATABASE_URL'];

// Known-ALLOWED, deterministic authority strings that MUST appear (positive control).
const POSITIVE_CONTROLS = ['stale market', 'Includes seeded historical closing lines'];

interface Server {
  child: ChildProcess;
  log: () => string;
}

function startServer(port: number, dataSource: string): Promise<Server> {
  let log = '';
  const child = spawn(process.execPath, [NEXT_BIN, 'start', '-p', String(port)], {
    cwd: APP_DIR,
    detached: true, // own the process group so cleanup kills the real server
    env: { ...process.env, BOARD_DATA_SOURCE: dataSource, PORT: String(port) },
  });
  child.stdout?.on('data', (d) => { log += d.toString(); });
  child.stderr?.on('data', (d) => { log += d.toString(); });
  return new Promise<Server>((resolve, reject) => {
    const deadline = Date.now() + 40_000;
    const poll = async (): Promise<void> => {
      if (Date.now() > deadline) { reject(new Error(`server on :${port} did not become ready.\n${log}`)); return; }
      try {
        const r = await fetch(`http://localhost:${port}/board`);
        if (r.status === 200) { resolve({ child, log: () => log }); return; }
      } catch { /* not ready */ }
      setTimeout(() => { void poll(); }, 400);
    };
    void poll();
  });
}

function stop(s: Server | null): void {
  if (s === null || s.child.pid === undefined) return;
  try { process.kill(-s.child.pid, 'SIGKILL'); } catch { /* group already gone */ }
  try { s.child.kill('SIGKILL'); } catch { /* ignore */ }
}

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

let fixtureServer: Server | null = null;

before(async () => {
  assert.ok(existsSync(join(APP_DIR, '.next')), 'no .next build present — run via `npm run audit` (it builds first)');
  fixtureServer = await startServer(FIXTURE_PORT, 'fixture');
});
after(() => { stop(fixtureServer); });

test('initial HTML document (incl. <script>) leaks no prohibited value; flight + positive control present', async () => {
  const html = await (await fetch(`http://localhost:${FIXTURE_PORT}/board`)).text();

  // GUARD (a): the RSC flight payload we intend to audit IS in the captured body.
  assert.ok(html.includes('__next_f'), 'RSC flight marker __next_f absent — audit would be inspecting nothing');
  // GUARD (b): positive control — a real, populated Board was captured.
  for (const ctl of POSITIVE_CONTROLS) {
    assert.ok(html.includes(ctl), `positive control "${ctl}" missing — did not capture a populated Board`);
  }
  // The negative assertions.
  for (const bad of PROHIBITED) {
    assert.ok(!html.includes(bad), `prohibited value "${bad}" leaked into the initial HTML/RSC body`);
  }
});

test('V1-8a1: the information BAND reaches the flight (positive control) but the internal_game_id canary does NOT', async () => {
  const html = await (await fetch(`http://localhost:${FIXTURE_PORT}/board`)).text();
  // POSITIVE CONTROL: the band IS serialized into the flight (BoardTable is a
  // 'use client' component receiving the full projection), so the audit is not
  // vacuous — the H2H typed-unavailable marker is a band-only string.
  assert.ok(html.includes('requires_h2h_window_g2'), 'band H2H marker absent — the band did not reach the flight');
  // NEGATIVE: the server-side-only identity canary is dropped by the projection.
  assert.ok(!html.includes(DISTINCTIVE_INTERNAL_GAME_ID), 'internal_game_id canary leaked into the /board body');
  assert.ok(!html.includes('internal_game_id'), 'internal_game_id key leaked into the /board body');
  // REVISE (§2.6): the freshness badge carries display_age (a duration) but NEVER
  // the raw line_observed_at timestamp — the key must not appear in the body.
  assert.ok(!html.includes('line_observed_at'), 'line_observed_at key leaked into the /board body');
});

test('RSC / navigation flight response leaks no prohibited value (raw body)', async () => {
  const rsc = await (await fetch(`http://localhost:${FIXTURE_PORT}/board`, { headers: { RSC: '1' } })).text();
  assert.ok(rsc.length > 0, 'empty RSC response');
  // Positive control: the flight carries the projection.
  assert.ok(POSITIVE_CONTROLS.some((c) => rsc.includes(c)), 'RSC response did not carry projection content');
  for (const bad of PROHIBITED) {
    assert.ok(!rsc.includes(bad), `prohibited value "${bad}" leaked into the RSC flight response`);
  }
});

test('V1-6e /design-preview: banner present, POPULATED board, prohibited values absent (full body)', async () => {
  const html = await (await fetch(`http://localhost:${FIXTURE_PORT}/design-preview`)).text();
  // The persistent server-rendered banner must be in the raw HTML.
  assert.ok(html.includes('DESIGN PREVIEW'), 'design-preview banner missing from the served HTML');
  // GUARD (a): the flight payload IS present.
  assert.ok(html.includes('__next_f'), 'RSC flight marker __next_f absent on /design-preview');
  // GUARD (b): positive control — a POPULATED preview board (real cap + provenance furniture).
  for (const ctl of POSITIVE_CONTROLS) {
    assert.ok(html.includes(ctl), `positive control "${ctl}" missing — /design-preview did not render a populated board`);
  }
  // The same negative assertions as /board: fixture canaries never reach the browser.
  for (const bad of PROHIBITED) {
    assert.ok(!html.includes(bad), `prohibited value "${bad}" leaked into the /design-preview body`);
  }
});

test('V1-6e isolation: the preview banner NEVER appears on the production /board response', async () => {
  const html = await (await fetch(`http://localhost:${FIXTURE_PORT}/board`)).text();
  assert.ok(!html.includes('DESIGN PREVIEW'), 'preview banner leaked onto the production /board route');
});

// V1-6f — the two design-variant sub-pages: exact §D.2 taxonomy, banner,
// populated, prohibited absent.
const COMPACT_LABELS = ['Over-leaning', 'Under-leaning', 'Mixed', 'Insufficient Evidence', 'Unavailable'];
const FULL_LABELS_FORBIDDEN_ON_BOARD = ['Strong Over Evidence', 'Moderate Over Evidence', 'Strong Under Evidence', 'Moderate Under Evidence', 'Mixed Evidence'];
for (const route of ['/design-preview/a', '/design-preview/b']) {
  test(`V1-6f ${route}: banner + populated + exact §D.2 compact labels; prohibited/full-form absent`, async () => {
    const html = await (await fetch(`http://localhost:${FIXTURE_PORT}${route}`)).text();
    assert.ok(html.includes('DESIGN PREVIEW'), `${route} banner missing`);
    assert.ok(html.includes('__next_f'), `${route} RSC flight marker absent`);
    // POSITIVE CONTROL: a populated board with real cap + provenance furniture.
    for (const ctl of POSITIVE_CONTROLS) {
      assert.ok(html.includes(ctl), `${route} positive control "${ctl}" missing — board not populated`);
    }
    // The five §D.2 compact labels are the ONLY classification strings on the pills.
    for (const l of COMPACT_LABELS) {
      assert.ok(html.includes(l), `${route} missing §D.2 compact label "${l}"`);
    }
    // The full (Discover/Research-View) forms MUST NOT appear on the dense Board.
    for (const f of FULL_LABELS_FORBIDDEN_ON_BOARD) {
      assert.ok(!html.includes(f), `${route} leaked full label "${f}" onto the dense Board`);
    }
    // GD-15 distinct treatments are actually rendered.
    assert.ok(html.includes('pill-insufficient'), `${route} missing distinct Insufficient treatment`);
    assert.ok(html.includes('pill-unavailable'), `${route} missing distinct Unavailable treatment`);
    // Fixture canaries never reach the browser from the variant pages.
    for (const bad of PROHIBITED) {
      assert.ok(!html.includes(bad), `prohibited value "${bad}" leaked into ${route}`);
    }
  });
}

// V1-7b — the preview Research View routes. CANARY ADJUSTMENT (stated in the
// report): the composite score is LEGITIMATELY present on this surface (DR-19
// Research View), so we do NOT assert the score-digits canary here. Instead we
// assert: (a) the PAID per-book offering canaries are absent; (b) secrets are
// absent; (c) the score shown is the ROUNDED value and the full-precision value
// never appears.
test('V1-7b /design-preview/research index: banner, grain links, no paid canaries/secrets', async () => {
  const html = await (await fetch(`http://localhost:${FIXTURE_PORT}/design-preview/research`)).text();
  assert.ok(html.includes('DESIGN PREVIEW'), 'research index banner missing');
  assert.ok(html.includes('Strong Over Evidence') && html.includes('Unavailable'), 'grain links missing');
  assert.ok(!html.includes(DISTINCTIVE_PAID_BOOK), 'paid book leaked into research index');
  assert.ok(!html.includes(PAID_PRICE_DIGITS), 'paid price leaked into research index');
});

test('V1-7b /design-preview/research/0 (fresh): full §D.2 label, §G.2 adjacent score is ROUNDED; no paid/secret/full-precision', async () => {
  const html = await (await fetch(`http://localhost:${FIXTURE_PORT}/design-preview/research/0`)).text();
  assert.ok(html.includes('__next_f'), 'flight marker absent');
  assert.ok(html.includes('Strong Over Evidence'), 'full §D.2 label absent');
  assert.ok(html.includes('0.78'), 'rounded score absent');           // rounded present (legitimate)
  assert.ok(!html.includes('0.7834'), 'FULL-PRECISION score leaked');  // full precision absent
  assert.ok(html.includes('research-ranking score'), '§G.2 disclosure absent from grade detail');
  assert.ok(!html.includes(DISTINCTIVE_PAID_BOOK), 'paid book leaked');
  assert.ok(!html.includes(PAID_PRICE_DIGITS), 'paid price leaked');
  for (const s of SECRETS) assert.ok(!html.includes(s), `secret ${s} leaked`);
});

test('V1-7b /design-preview/research/1 (aged): the aged-historical marker is in the SERVER-RENDERED body', async () => {
  const html = await (await fetch(`http://localhost:${FIXTURE_PORT}/design-preview/research/1`)).text();
  // Founder ruling: aged evidence is VISIBLE with an unmissable marker, not suppressed.
  assert.ok(html.includes('Aged historical evidence'), 'aged marker missing from server body');
  assert.ok(html.includes('not current market analysis'), 'aged marker must not imply currency');
  assert.ok(!html.includes(DISTINCTIVE_PAID_BOOK), 'paid book leaked into aged grain');
});

test('client JS bundles contain no prohibited value, no db driver code, no connection string, no env var name', () => {
  const files = walk(join(APP_DIR, '.next', 'static')).filter((f) => f.endsWith('.js'));
  assert.ok(files.length > 0, 'no client bundles found to scan');
  const blob = files.map((f) => readFileSync(f, 'utf8')).join('\n');
  for (const bad of [...PROHIBITED, ...SECRETS, 'pg-connection-string']) {
    assert.ok(!blob.includes(bad), `"${bad}" found in a client bundle`);
  }
  // No literal `new Pool(` (pg) construction in client code.
  assert.ok(!/new Pool\s*\(/.test(blob), 'pg Pool construction found in a client bundle');
});

test('server request log contains no prohibited value and no secret', () => {
  const log = fixtureServer!.log();
  for (const bad of [...PROHIBITED, ...SECRETS]) {
    assert.ok(!log.includes(bad), `"${bad}" found in the server log`);
  }
});

test('empty state renders when the fixture repository returns zero rows', async () => {
  let empty: Server | null = null;
  try {
    empty = await startServer(EMPTY_PORT, 'fixture_empty');
    const html = await (await fetch(`http://localhost:${EMPTY_PORT}/board`)).text();
    assert.ok(html.includes('No current Board profiles are available.'), 'approved empty-state copy missing');
    assert.ok(html.includes('board-empty-state'), 'empty-state marker missing');
    for (const bad of PROHIBITED) {
      assert.ok(!html.includes(bad), `prohibited value "${bad}" present in empty state`);
    }
  } finally {
    stop(empty);
  }
});

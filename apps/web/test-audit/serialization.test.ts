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
const PROHIBITED = [SCORE_DIGITS, DISTINCTIVE_PAID_BOOK, PAID_PRICE_DIGITS];
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

test('RSC / navigation flight response leaks no prohibited value (raw body)', async () => {
  const rsc = await (await fetch(`http://localhost:${FIXTURE_PORT}/board`, { headers: { RSC: '1' } })).text();
  assert.ok(rsc.length > 0, 'empty RSC response');
  // Positive control: the flight carries the projection.
  assert.ok(POSITIVE_CONTROLS.some((c) => rsc.includes(c)), 'RSC response did not carry projection content');
  for (const bad of PROHIBITED) {
    assert.ok(!rsc.includes(bad), `prohibited value "${bad}" leaked into the RSC flight response`);
  }
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

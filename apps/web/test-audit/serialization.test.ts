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

test('V1-8a2 GAP-21: the band RENDERS server-side, but the series/band DATA never crosses as a client payload', async () => {
  const html = await (await fetch(`http://localhost:${FIXTURE_PORT}/board`)).text();
  // POSITIVE CONTROL: the band RENDERS (server component → HTML). Rendered
  // artefacts are present, so the audit is not vacuous.
  assert.ok(html.includes('>L10<') || html.includes('L10'), 'rendered window label L10 absent — band did not render');
  assert.ok(html.includes('SZN'), 'rendered SZN strip label absent — band did not render');
  assert.ok(html.includes('not yet available'), 'rendered H2H unavailable text absent — band did not render');
  // GAP-21 NEGATIVE: the raw band DATA did NOT cross as a client-component prop.
  // The projection's raw H2H reason string is server-rendered to different text,
  // so the RAW data string must be absent from the served body/flight.
  assert.ok(!html.includes('requires_h2h_window_g2'), 'raw band DATA (h2h.reason) crossed the client boundary — GAP-21 not closed');
  // The server-side-only identity canary + its key are absent (Amendment 21).
  assert.ok(!html.includes(DISTINCTIVE_INTERNAL_GAME_ID), 'internal_game_id canary leaked into the /board body');
  assert.ok(!html.includes('internal_game_id'), 'internal_game_id key leaked into the /board body');
  // A distinctive SERIES-only value never appears (series payload not shipped).
  assert.ok(!html.includes('position_kind'), 'series structural key leaked into the /board body');
  // REVISE (§2.6): the freshness badge carries display_age (a duration) but NEVER
  // the raw line_observed_at timestamp — the key must not appear in the body.
  assert.ok(!html.includes('line_observed_at'), 'line_observed_at key leaked into the /board body');
});

test('V1-8a2 board surface: all eight band fields present, §D.2 labels only, §7 counts, locked architecture inert, no sort control', async () => {
  const html = await (await fetch(`http://localhost:${FIXTURE_PORT}/board`)).text();
  // (8) band completeness at 390px — all eight fields present in the DOM.
  for (const f of ['L5', 'L10', 'L20', 'H2H', 'STRK', 'AVG', 'DIFF', 'SZN']) {
    assert.ok(html.includes(f), `band field "${f}" absent from the served body`);
  }
  // (4) §D.2 compact labels present; the full Discover/Research forms never here.
  for (const l of ['Over-leaning', 'Mixed', 'Unavailable']) assert.ok(html.includes(l), `§D.2 compact label "${l}" absent`);
  for (const f of ['Strong Over Evidence', 'Moderate Over Evidence', 'Mixed Evidence']) {
    assert.ok(!html.includes(f), `full label "${f}" leaked onto the dense Board`);
  }
  // (3) Grammar §7 — no %, no slash ratio between digits, no "rate" in the
  // USER-VISIBLE TEXT (strip <script>/<style>/all tags so CSS %-widths, the RSC
  // flight, and href slashes are excluded; §7 governs rendered data, not layout).
  const visibleText = html
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<[^>]+>/g, ' ');
  assert.ok(!visibleText.includes('%'), 'percentage present in visible Board text');
  assert.ok(!/\d\s*\/\s*\d/.test(visibleText), 'slash ratio between digits present in visible Board text');
  assert.ok(!/\brate\b/i.test(visibleText), '"rate" present in visible Board text');
  // R2-1/(16): ONE compact Board-level disclosure, NOT per row.
  const boardDisc = (html.match(/data-testid="board-disclosure-g1"/g) ?? []).length;
  assert.equal(boardDisc, 1, `board-level disclosure must appear exactly once (found ${boardDisc})`);
  assert.ok(html.includes('not a predicted probability'), 'compact epistemic-boundary disclosure absent');
  assert.ok(!html.includes('data-testid="disclosure-g1"'), 'per-row §G.1 disclosure must NOT be repeated in rows');
  // R2-2: the legend lives inside a collapsible help control (server-rendered),
  // not a permanently-expanded legend.
  assert.ok(html.includes('data-testid="board-help"') && html.includes('How to read the Board'), 'collapsible help control absent');
  assert.ok(/<details[^>]*data-testid="board-help"/.test(html), 'help control is not a server-rendered <details>');
  // (7) no hover-only — consolidated metadata line + controls in the body.
  assert.ok(html.includes('data-testid="row-meta"'), 'consolidated metadata line not in server body');
  assert.ok(html.includes('data-testid="board-controls"'), 'filter controls not in server body');
  // (11) locked architecture present and inert; non-actionable CTA is disabled.
  assert.ok(html.includes('data-testid="locked-continuation"'), 'locked continuation absent');
  assert.ok(html.includes('data-testid="lock-panel"'), 'lock panel absent');
  assert.ok(html.includes('Membership coming later'), 'non-actionable CTA copy absent');
  assert.ok(/data-testid="locked-cta"[^>]*\bdisabled\b/.test(html) || /\bdisabled\b[^>]*data-testid="locked-cta"/.test(html), 'locked CTA is not disabled (must be non-actionable)');
  // (6) DR-20 sole sort — no alternate sort control in the markup.
  assert.ok(!/<select/i.test(html), 'a <select> sort control exists');
  assert.ok(!/sort by/i.test(html), 'an alternate sort control label exists');
  // (11) real row count equals available profiles (4 v2 fixtures); no gating.
  assert.ok(html.includes('data-row-count="4"'), 'rendered row count != available profile count');
  // (5) DR-19 + Amendment 21 — composite_score, the four components, and the
  // internal identities never appear as DATA KEYS in the served body.
  for (const k of ['composite_score', 'components', 'c_rtp', 'c_ms', 'c_wa', 'c_ma', 'internal_game_id', 'internal_player_id', 'line_observed_at']) {
    assert.ok(!html.includes(k), `forbidden data key "${k}" present in the served Board body`);
  }
});

test('V1-8a3 selector: eight evidence cells render, L10 selected by default, all eight detail panels server-rendered, no raw series data', async () => {
  const html = await (await fetch(`http://localhost:${FIXTURE_PORT}/board`)).text();
  // (1) all eight evidence cells render (per row); (3) each panel is present.
  for (const c of ['L5', 'L10', 'L20', 'H2H', 'STRK', 'AVG', 'DIFF', 'SZN']) {
    assert.ok(html.includes(`data-testid="cell-${c}"`), `evidence cell ${c} absent`);
    assert.ok(html.includes(`data-testid="panel-${c}"`), `detail panel ${c} absent (must be server-rendered for CSS selection)`);
  }
  // (2) L10 is selected by default — its radio carries the checked attribute.
  assert.ok(/id="ev-0-L10"[^>]*\bchecked\b/.test(html) || /\bchecked\b[^>]*id="ev-0-L10"/.test(html), 'L10 is not checked by default on the first row');
  // (4) L20 and SZN full Strips are present when selected (rendered server-side).
  assert.ok((html.match(/data-testid="detail-strip"/g) ?? []).length >= 4, 'full Strips (L5/L10/L20/SZN detail) not all server-rendered');
  // (6/7/8/9) no raw series object / internal identity / score crossed as data.
  assert.ok(!html.includes('position_kind') && !html.includes('opponent_label') && !html.includes('eligibility_state'), 'raw series object keys crossed into the /board body');
  assert.ok(!html.includes(DISTINCTIVE_INTERNAL_GAME_ID), 'series internal_game_id canary present');
  // (10/11/12) filter controls present (market/direction/search).
  for (const t of ['market-all', 'market-points', 'direction-over', 'player-search']) {
    assert.ok(html.includes(`data-testid="${t}"`), `control ${t} absent`);
  }
  // (15) no probability/pick/EV/confidence framing anywhere in the AUTHORED
  // visible text. The verbatim §G.1 authority disclosure is EXEMPT — it uses
  // "predicted probabilities" in explicit NEGATION form (its whole job is to deny
  // probability framing; src/explanation/disclosures.ts), so strip it first.
  const vt = html
    .replace(/<p[^>]*data-testid="board-disclosure-g1"[\s\S]*?<\/p>/g, ' ')
    .replace(/<details[^>]*data-testid="board-help"[\s\S]*?<\/details>/g, ' ')
    .replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ');
  for (const bad of [/\bprobabilit/i, /\bconfidence\b/i, /\bexpected value\b/i, /\bEV\b/, /\bpick\b/i, /\bhit rate\b/i, /\block of the day\b/i]) {
    assert.ok(!bad.test(vt), `forbidden framing matched ${bad} in visible Board text`);
  }
});

test('V1-8a3 R2: matchup+tipoff, market-before-direction, labelled panels, Open full research, help states, no raw ISO/enum', async () => {
  const html = await (await fetch(`http://localhost:${FIXTURE_PORT}/board`)).text();
  const vt = html.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ');
  // R2-3 (4/5): matchup renders consumer-readable + human tipoff (ET). Alpha is
  // Las Vegas @ Phoenix at 23:00Z → 7:00 PM ET.
  assert.ok(html.includes('data-testid="row-matchup"'), 'matchup row absent');
  assert.ok(html.includes('Las Vegas @ Phoenix'), 'matchup not consumer-readable');
  assert.ok(html.includes('7:00 PM') || html.includes('7:00 PM'), 'human tipoff (7:00 PM ET) absent');
  // (6) no raw ISO timestamp in the visible text; (7) no raw market enum in visible text.
  assert.ok(!/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(vt), 'raw ISO timestamp appears in visible Board text');
  for (const enumStr of ['player_points', 'player_threes', 'player_rebounds', 'player_assists', 'sportsbook_consensus']) {
    assert.ok(!vt.includes(enumStr), `raw enum "${enumStr}" appears in visible Board text`);
  }
  // consumer market labels ARE present.
  assert.ok(html.includes('Points') && html.includes('3-Pointers'), 'consumer market labels absent');
  // (8) market+line precede direction in the row's source order.
  const mi = html.indexOf('data-testid="row-market"');
  const di = html.indexOf('data-testid="row-direction"');
  assert.ok(mi !== -1 && di !== -1 && mi < di, 'market/line must precede direction in the row');
  // (12) explicit panel headings; (13) explicit Open full research action.
  assert.ok(html.includes('Last 10 eligible games') && html.includes('Season evidence'), 'explicit panel headings absent');
  assert.ok(html.includes('data-testid="open-research"') && html.includes('Open full research'), 'explicit Research action absent');
  const openHref = /data-testid="open-research"[^>]*href="([^"]+)"|href="([^"]+)"[^>]*data-testid="open-research"/.exec(html);
  assert.ok(openHref !== null && /\/research\//.test(openHref[0]), 'Open full research does not navigate to a research grain URL');
  // (3) the help control exposes all four Strip states + the epistemic boundary.
  for (const s of ['above the evaluated line', 'below the evaluated line', 'on the line', 'did not play']) {
    assert.ok(html.includes(s), `help control missing strip state "${s}"`);
  }
  assert.ok(html.includes('historical evidence, not a predicted probability'), 'help control missing epistemic boundary');
});

test('V1-8a3 (18): every bottom-navigation destination resolves (Board · Players · Methodology)', async () => {
  for (const [path, marker] of [['/board', 'WNBA player props'], ['/players', 'players-pending'], ['/methodology', 'How to read the Board']] as const) {
    const r = await fetch(`http://localhost:${FIXTURE_PORT}${path}`);
    assert.equal(r.status, 200, `${path} did not return 200`);
    const body = await r.text();
    assert.ok(body.includes(marker), `${path} did not render its expected content`);
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

// V1-8b — COMPREHENSION PASS over the REAL rendered Research View (grain 0,
// fresh, Strong Over, player_points). Proves the presentation rewrite renders
// plain language and leaks no raw enum / ISO timestamp / reason-code-in-default /
// internal identity, and that the authorized interactions are server-present.
test('V1-8b research/0: plain matchup+market+finding, window selector (L10 default), collapsed technical scoring, no raw enum/ISO/identity', async () => {
  const html = await (await fetch(`http://localhost:${FIXTURE_PORT}/design-preview/research/0`)).text();
  const visible = html
    .replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ');

  // (R1) consumer matchup + human tipoff (ET, no date/suffix) + plain market/line.
  assert.ok(html.includes('data-testid="rv-matchup"'), 'matchup absent');
  assert.ok(html.includes('Preview City') && html.includes('Mock Bay'), 'matchup teams absent');
  assert.ok(/7:00\s*PM/.test(visible), 'human ET tipoff absent');
  assert.ok(html.includes('Points'), 'plain market label absent');
  // (R2) quiet finding, not the big §D.2 card in the header.
  assert.ok(html.includes('Evidence leans over'), 'plain finding absent');

  // (R3) window selector: four chips, L10 checked by default, single selected block.
  for (const w of ['L5', 'L10', 'L20', 'season']) assert.ok(html.includes(`data-testid="window-chip-${w}"`), `window chip ${w} absent`);
  assert.ok(/id="rv-w-L10"[^>]*\bchecked\b/.test(html) || /\bchecked\b[^>]*id="rv-w-L10"/.test(html), 'L10 is not checked by default');
  // (R8) plain-language reason present in the DEFAULT path.
  assert.ok(html.includes('Recent windows point in the same direction.'), 'plain-language reason absent');
  // (R9) technical scoring is server-rendered but COLLAPSED (no `open`).
  const det = /<details[^>]*data-testid="technical-scoring"([^>]*)>/.exec(html);
  assert.ok(det !== null, 'technical-scoring details absent');
  assert.ok(!/\bopen\b/.test(det[1]!), 'technical scoring must be collapsed by default');
  // (R7) market context in plain language.
  assert.ok(html.includes('Consensus line'), 'plain market-context heading absent');

  // CONTAINMENT — raw enums / reason-code-in-default / ISO timestamp / identities.
  assert.ok(!visible.includes('player_points'), 'raw market enum leaked into visible text');
  assert.ok(!visible.includes('sportsbook_consensus'), 'raw source enum leaked into visible text');
  assert.ok(!visible.includes('unique_modal') && !visible.includes('one_sided'), 'raw market-context enum leaked into visible text');
  // The raw tipoff ISO timestamp must never render (matchup shows ET time only).
  assert.ok(!html.includes('2026-07-27T23:00'), 'raw tipoff ISO timestamp leaked');
  assert.ok(!/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(visible), 'a raw ISO timestamp is present in visible text');
  // Amendment 21 + §2.6 — internal identities and the raw observation key never cross.
  for (const k of ['internal_game_id', 'internal_player_id', 'line_observed_at']) {
    assert.ok(!html.includes(k), `forbidden data key "${k}" present in the research body`);
  }
  assert.ok(!html.includes(DISTINCTIVE_PAID_BOOK) && !html.includes(PAID_PRICE_DIGITS), 'paid canary leaked');

  // (R9) no probability/pick/EV/confidence framing in AUTHORED visible text — the
  // §G.1/§G.2 authority disclosures (which NEGATE probability) are stripped first.
  const authored = html
    .replace(/<p[^>]*data-testid="disclosure-g1"[\s\S]*?<\/p>/g, ' ')
    .replace(/<p[^>]*data-testid="disclosure-g1-full"[\s\S]*?<\/p>/g, ' ')
    .replace(/<div[^>]*data-testid="disclosure-g2"[\s\S]*?<\/div>/g, ' ')
    .replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ');
  for (const bad of [/\bprobabilit/i, /\bhit rate\b/i, /\bexpected value\b/i, /\bconfidence\b/i, /\bpick\b/i, /%/]) {
    assert.ok(!bad.test(authored), `forbidden framing ${bad} in authored research text`);
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

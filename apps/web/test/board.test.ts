// V1-6a — Board slice tests. NONE depend on hosted connectivity: all use the
// injected FixtureBoardRepository. Run with `--conditions=react-server` so the
// `server-only` marker resolves to its empty module (see package.json test).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildBoardQuery,
  PostgresBoardRepository,
} from '../src/lib/server/boardRepository.js';
import {
  FixtureBoardRepository,
  defaultFixtureCandidates,
  DISTINCTIVE_COMPOSITE_SCORE,
  DISTINCTIVE_PAID_BOOK,
  DISTINCTIVE_PAID_PRICE,
} from '../src/lib/server/fixtureRepository.js';
import { getBoardData } from '../src/lib/server/boardService.js';
import {
  constructBoardProjection,
  assertBoardProjectionKeySet,
  BOARD_PROJECTION_FORBIDDEN_KEYS,
  BOARD_PROJECTION_BASE_KEYS,
} from '../src/lib/boardProjection.js';
import { ACTIVE_BOARD_METHOD_VERSION, assertKnownMethodVersion } from '../src/lib/method.js';
import { EMPTY_STATE_MESSAGE, EMPTY_STATE_HEADING, BOARD_TITLE } from '../src/lib/boardCopy.js';
import { sweepForbiddenTerms } from '../../../src/explanation/copySafetyTerms.js';
import type { RankedCandidate } from '../src/lib/rankedCandidate.js';

// -------------------- METHOD SELECTION (Scope C/E) --------------------

test('active Board method is evidence_method_v2', () => {
  assert.equal(ACTIVE_BOARD_METHOD_VERSION, 'evidence_method_v2');
});

test('the hosted-query construction filters EXPLICITLY to the requested method (v2)', () => {
  const q = buildBoardQuery('evidence_method_v2');
  assert.match(q.text, /WHERE ep\.method_version = \$1/);
  assert.deepEqual(q.values, ['evidence_method_v2']);
  // No interpolation of the method into the SQL text.
  assert.doesNotMatch(q.text, /evidence_method_v2/);
});

test('an unknown/unconfigured method version FAILS LOUD (no default, no fallback)', () => {
  assert.throws(() => assertKnownMethodVersion('evidence_method_bogus'), /fail-loud/i);
  assert.throws(() => buildBoardQuery('evidence_method_bogus' as never), /fail-loud/i);
});

test('v1 fixture rows are EXCLUDED when the active method is v2', async () => {
  const { projections } = await getBoardData(new FixtureBoardRepository());
  // The v1 fixture row is titled "V1 Should Not Appear".
  assert.ok(projections.every((p) => p.player !== 'V1 Should Not Appear'));
  // Only the four v2 fixtures survive.
  assert.equal(projections.length, 4);
});

test('mixed (v1 + v2) fixture input cannot produce a mixed Board', async () => {
  const { projections } = await getBoardData(new FixtureBoardRepository());
  const players = new Set(projections.map((p) => p.player));
  assert.ok(!players.has('V1 Should Not Appear'));
  assert.ok(players.has('Fixture Alpha')); // v2 present
});

test('zero v2 rows produce the approved EMPTY STATE (no projections)', async () => {
  const { projections } = await getBoardData(new FixtureBoardRepository([]));
  assert.equal(projections.length, 0);
});

test('adding a v2 fixture row populates the Board with NO method-selection change', async () => {
  const extra: RankedCandidate = defaultFixtureCandidates().find((c) => c.player === 'Fixture Alpha')!;
  const withExtra = new FixtureBoardRepository([
    ...defaultFixtureCandidates(),
    { ...extra, player: 'Fixture Echo', internal_game_id: 'aaaa1111-0000-0000-0000-000000000009' },
  ]);
  const { projections } = await getBoardData(withExtra);
  assert.equal(projections.length, 5); // 4 default v2 + 1 added v2
  assert.ok(projections.some((p) => p.player === 'Fixture Echo'));
});

// -------------------- ORDERING (DR-20, Scope C) --------------------

test('ranking uses full-precision score BEFORE projection; NULL sorts LAST; deterministic', async () => {
  const { projections } = await getBoardData(new FixtureBoardRepository());
  // Scores: Alpha |−0.918|, Bravo 0.42, Charlie 0.05, Delta null → null last.
  assert.deepEqual(projections.map((p) => p.player), [
    'Fixture Alpha', 'Fixture Bravo', 'Fixture Charlie', 'Fixture Delta',
  ]);
  // Repeated requests are stable.
  const again = await getBoardData(new FixtureBoardRepository());
  assert.deepEqual(again.projections.map((p) => p.player), projections.map((p) => p.player));
});

// -------------------- PROJECTION ALLOWLIST (Scope B) --------------------

test('a Board projection is a newly-constructed allowlisted object with NO forbidden keys', async () => {
  const { projections } = await getBoardData(new FixtureBoardRepository());
  for (const p of projections) {
    for (const forbidden of BOARD_PROJECTION_FORBIDDEN_KEYS) {
      assert.ok(!Object.prototype.hasOwnProperty.call(p, forbidden), `carries forbidden key ${forbidden}`);
    }
    // Base keys always present.
    for (const k of BOARD_PROJECTION_BASE_KEYS) {
      assert.ok(Object.prototype.hasOwnProperty.call(p, k), `missing base key ${k}`);
    }
  }
});

test('key-set assertion: cap_tag present only with a cap; provenance_marker only when backfilled', () => {
  const cands = defaultFixtureCandidates().filter((c) => c.method_version === 'evidence_method_v2');
  const byPlayer = new Map(cands.map((c) => [c.player, constructBoardProjection(c)]));

  const alpha = byPlayer.get('Fixture Alpha')!; // backfilled true, no cap
  assert.ok('provenance_marker' in alpha && !('cap_tag' in alpha));
  assertBoardProjectionKeySet(alpha, { cap: false, provenance: true });

  const bravo = byPlayer.get('Fixture Bravo')!; // stale cap, not backfilled
  assert.ok('cap_tag' in bravo && !('provenance_marker' in bravo));
  assert.equal(bravo.cap_tag, 'stale market');
  assertBoardProjectionKeySet(bravo, { cap: true, provenance: false });

  const charlie = byPlayer.get('Fixture Charlie')!; // neither
  assert.ok(!('cap_tag' in charlie) && !('provenance_marker' in charlie));
  assertBoardProjectionKeySet(charlie, { cap: false, provenance: false });

  const delta = byPlayer.get('Fixture Delta')!; // unavailable, evaluated_line null
  assert.equal(delta.evaluated_line, null);
  assert.equal(delta.classification_label.length > 0, true); // GD-15 label present, not collapsed
});

test('key-set assertion THROWS if a forbidden key is smuggled in', () => {
  const good = constructBoardProjection(
    defaultFixtureCandidates().find((c) => c.player === 'Fixture Charlie')!
  );
  const smuggled = { ...good, composite_score: DISTINCTIVE_COMPOSITE_SCORE } as never;
  assert.throws(() => assertBoardProjectionKeySet(smuggled, { cap: false, provenance: false }), /composite_score|FORBIDDEN|unexpected/i);
});

test('the distinctive restricted values are NEVER carried on a projection', async () => {
  const { projections } = await getBoardData(new FixtureBoardRepository());
  const blob = JSON.stringify(projections);
  assert.ok(!blob.includes('9182736455'), 'composite score digits leaked into projection');
  assert.ok(!blob.includes(DISTINCTIVE_PAID_BOOK), 'paid book leaked');
  assert.ok(!blob.includes(String(DISTINCTIVE_PAID_PRICE)), 'paid price leaked');
});

// -------------------- COPY SAFETY (Scope F #15; reuse committed sweep) --------------------

test('every authored Board string passes the committed forbidden-term sweep', async () => {
  const strings: string[] = [EMPTY_STATE_MESSAGE, EMPTY_STATE_HEADING, BOARD_TITLE];
  const { projections } = await getBoardData(new FixtureBoardRepository());
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

// -------------------- PRODUCTION REPO SHAPE (no hosted needed) --------------------

test('PostgresBoardRepository exists and exposes the interface (no connection made)', () => {
  const repo = new PostgresBoardRepository();
  assert.equal(typeof repo.queryRankedCandidates, 'function');
});

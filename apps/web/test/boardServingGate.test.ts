// V1-6d — BOARD SERVING GATE tests (GAP-16 closure).
//
// Fixture-driven; NO hosted dependency. Run with `--conditions=react-server`
// so the `server-only` marker resolves to its empty module (see package.json).
//
// The Board now applies the committed `evaluateV2ServingGate` in the server
// path: ONE serve_now per request, suppressed rows dropped BEFORE projection,
// all-suppressed collapses to the approved empty state, and the serve-gate
// input (line_observed_at) never reaches the projection. These tests exercise
// the boundary via fixture line_observed_at values relative to an INJECTED
// serve_now — never by real waiting.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { getBoardData } from '../src/lib/server/boardService.js';
import { FixtureBoardRepository, defaultFixtureCandidates } from '../src/lib/server/fixtureRepository.js';
import {
  assertBoardProjectionKeySet,
  BOARD_PROJECTION_FORBIDDEN_KEYS,
} from '../src/lib/boardProjection.js';
import { T_SERVE_SUPPRESS_MAX_SECONDS } from '../../../src/evidence/v2/thresholds.js';
import type { RankedCandidate } from '../src/lib/rankedCandidate.js';

// Injected request instant. Deterministic — the gate reads no clock and the
// service uses exactly this value for every candidate.
const SERVE_NOW = '2026-07-24T12:00:00.000Z';
const SERVE_NOW_MS = Date.parse(SERVE_NOW);

/** A line_observed_at exactly `secondsAgo` before the injected serve_now. */
function observedSecondsAgo(secondsAgo: number): string {
  return new Date(SERVE_NOW_MS - secondsAgo * 1000).toISOString();
}

/** Build a v2 candidate off a known-good default, overriding the serve-gate
 *  input, the score (for ordering), and identity. */
function v2Candidate(over: {
  player: string;
  line_observed_at: string | null;
  composite_score: number | null;
  internal_game_id?: string;
}): RankedCandidate {
  const base = defaultFixtureCandidates().find((c) => c.player === 'Fixture Charlie')!;
  return {
    ...base,
    player: over.player,
    internal_game_id: over.internal_game_id ?? `cccc3333-0000-0000-0000-${over.player.replace(/\D/g, '').padStart(12, '0').slice(0, 12)}`,
    composite_score: over.composite_score,
    line_observed_at: over.line_observed_at,
  };
}

// -------------------- 1. BOUNDARY EXACTNESS AT SERVE TIME --------------------

test('boundary: display_age 3599 serves, 3600 serves (<=), 3601 suppresses', async () => {
  assert.equal(T_SERVE_SUPPRESS_MAX_SECONDS, 3600); // the ONE horizon; no second threshold
  const repo = new FixtureBoardRepository([
    v2Candidate({ player: 'Age3599', line_observed_at: observedSecondsAgo(3599), composite_score: 0.9 }),
    v2Candidate({ player: 'Age3600', line_observed_at: observedSecondsAgo(3600), composite_score: 0.8 }),
    v2Candidate({ player: 'Age3601', line_observed_at: observedSecondsAgo(3601), composite_score: 0.7 }),
  ]);
  const { projections } = await getBoardData(repo, SERVE_NOW);
  const players = projections.map((p) => p.player);
  assert.deepEqual(players, ['Age3599', 'Age3600']); // 3601 dropped; ≤3600 served
  assert.ok(!players.includes('Age3601'));
});

// -------------------- 2. ONE serve_now PER REQUEST --------------------

test('one serve_now governs the whole batch: boundary-adjacent rows move together', async () => {
  // Two rows at EXACTLY the horizon. Under a single captured serve_now both
  // are judged against the same instant — neither can be stranded by a
  // re-read of the clock between candidates.
  const rows = [
    v2Candidate({ player: 'BoundaryA', line_observed_at: observedSecondsAgo(3600), composite_score: 0.6 }),
    v2Candidate({ player: 'BoundaryB', line_observed_at: observedSecondsAgo(3600), composite_score: 0.5 }),
  ];
  const both = await getBoardData(new FixtureBoardRepository(rows), SERVE_NOW);
  assert.deepEqual(both.projections.map((p) => p.player), ['BoundaryA', 'BoundaryB']); // both serve

  // Advance the SINGLE serve_now by 2s: both rows are now 3602s old and both
  // suppress together — proving one shared instant, not a per-row clock read.
  const later = new Date(SERVE_NOW_MS + 2000).toISOString();
  const neither = await getBoardData(new FixtureBoardRepository(rows), later);
  assert.equal(neither.projections.length, 0);

  // Determinism: the same injected serve_now yields the same result.
  const again = await getBoardData(new FixtureBoardRepository(rows), SERVE_NOW);
  assert.deepEqual(again.projections.map((p) => p.player), both.projections.map((p) => p.player));
});

// -------------------- 3. MIXED INPUT: SURVIVORS ONLY, ORDERED --------------------

test('mixed fresh + aged: only fresh render and ordering (dr20Compare) applies to survivors', async () => {
  const repo = new FixtureBoardRepository([
    v2Candidate({ player: 'FreshLow', line_observed_at: observedSecondsAgo(100), composite_score: 0.2 }),
    v2Candidate({ player: 'AgedHigh', line_observed_at: observedSecondsAgo(5000), composite_score: 0.99 }),
    v2Candidate({ player: 'FreshHigh', line_observed_at: observedSecondsAgo(100), composite_score: 0.8 }),
  ]);
  const { projections } = await getBoardData(repo, SERVE_NOW);
  const players = projections.map((p) => p.player);
  // AgedHigh is suppressed DESPITE the highest score — the gate runs before rank.
  assert.ok(!players.includes('AgedHigh'));
  // Survivors are ordered by |composite_score| desc: FreshHigh (0.8) before FreshLow (0.2).
  assert.deepEqual(players, ['FreshHigh', 'FreshLow']);
});

// -------------------- 4. ALL-AGED -> APPROVED EMPTY STATE --------------------

test('all rows aged out -> zero projections (the approved empty state, not an error)', async () => {
  const repo = new FixtureBoardRepository([
    v2Candidate({ player: 'Gone1', line_observed_at: observedSecondsAgo(7200), composite_score: 0.9 }),
    v2Candidate({ player: 'Gone2', line_observed_at: observedSecondsAgo(4000), composite_score: 0.5 }),
    v2Candidate({ player: 'GoneNull', line_observed_at: null, composite_score: 0.3 }), // null -> suppress
  ]);
  const { projections, method_version } = await getBoardData(repo, SERVE_NOW);
  assert.equal(projections.length, 0); // page.tsx renders EMPTY_STATE_MESSAGE on length 0
  assert.equal(method_version, 'evidence_method_v2'); // still an honest v2 answer, not an error
});

// -------------------- 5. SUPPRESSION DOES NOT MUTATE (read-only serve) --------------------

test('a request that suppresses rows leaves the repository rows byte-identical', async () => {
  const rows = [
    v2Candidate({ player: 'KeepFresh', line_observed_at: observedSecondsAgo(100), composite_score: 0.4 }),
    v2Candidate({ player: 'DropAged', line_observed_at: observedSecondsAgo(9000), composite_score: 0.9 }),
  ];
  const snapshotBefore = JSON.stringify(rows);
  const { projections } = await getBoardData(new FixtureBoardRepository(rows), SERVE_NOW);
  assert.deepEqual(projections.map((p) => p.player), ['KeepFresh']); // aged dropped
  // The serve path is read-only: the source rows (and their line_observed_at /
  // classification) are unchanged after a request that suppressed one of them.
  assert.equal(JSON.stringify(rows), snapshotBefore);
});

// -------------------- 6. PROJECTION: line_observed_at IS FORBIDDEN --------------------

test('line_observed_at is a forbidden projection key; the key-set assertion rejects it', () => {
  assert.ok((BOARD_PROJECTION_FORBIDDEN_KEYS as readonly string[]).includes('line_observed_at'));
  const smuggled = {
    player: 'X', team: 'Y', market: 'player_points', evaluated_line: 1.5,
    classification_label: 'L', compact_display_line: 'L', disclosure_g1: 'D',
    line_observed_at: '2026-07-24T11:59:00.000Z',
  } as never;
  assert.throws(
    () => assertBoardProjectionKeySet(smuggled, { cap: false, provenance: false }),
    /line_observed_at|FORBIDDEN|unexpected/i,
  );
});

test('no served projection carries line_observed_at (or any timestamp) after the gate', async () => {
  const repo = new FixtureBoardRepository([
    v2Candidate({ player: 'Fresh', line_observed_at: observedSecondsAgo(100), composite_score: 0.5 }),
  ]);
  const { projections } = await getBoardData(repo, SERVE_NOW);
  assert.equal(projections.length, 1);
  for (const p of projections) {
    assert.ok(!Object.prototype.hasOwnProperty.call(p, 'line_observed_at'));
    // Defence in depth: the serve_now / observed timestamps do not leak by value.
    const blob = JSON.stringify(p);
    assert.ok(!blob.includes('2026-07-24T11:5'), 'an observation timestamp leaked into the projection');
  }
});

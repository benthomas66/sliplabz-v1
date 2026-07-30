// V1-8a1 — Board information-band projection tests (test groups 1,3,4,5,6,7,8,9).
// Groups 2 (DR-19 unmodified), 10 (serialization audit), 11 (RV byte-identity),
// and 12 (typecheck/suites) are covered by the existing board.test.ts, the audit,
// and the accounting runs respectively.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  FixtureBoardRepository,
  defaultFixtureCandidates,
  DISTINCTIVE_INTERNAL_GAME_ID,
  DISTINCTIVE_PERSISTED_DIFF,
  DISTINCTIVE_COMPOSITE_SCORE,
} from '../src/lib/server/fixtureRepository.js';
import { getBoardData } from '../src/lib/server/boardService.js';
import { evaluateV2ServingGate } from '../../../src/evidence/v2/servingGate.js';
import {
  constructBoardProjection,
  assertBoardProjectionKeySet,
  compactCounts,
  type BoardProjection,
} from '../src/lib/boardProjection.js';
import { sweepForbiddenTerms } from '../../../src/explanation/copySafetyTerms.js';

function candByPlayer(name: string): BoardProjection {
  const c = defaultFixtureCandidates().find((x) => x.player === name)!;
  return constructBoardProjection(c);
}
function availableBand(p: BoardProjection) {
  assert.equal(p.band.status, 'available');
  if (p.band.status !== 'available') throw new Error('unreachable');
  return p.band;
}

// -------------------- GROUP 1: source tracing + count integrity --------------------

test('G1: every window count traces to source; above+equal+below === eligible_n; counts are Grammar §7 form', () => {
  const alpha = candByPlayer('Fixture Alpha');
  const band = availableBand(alpha);
  for (const wt of ['L5', 'L10', 'L20', 'season'] as const) {
    const w = band.windows[wt];
    const parts = w.compact_counts.split('-').map(Number);
    const a = parts[0] ?? 0, b = parts[1] ?? 0, equal = parts[2] ?? 0;
    assert.equal(a + b + equal, w.sample.eligible_n, `${wt}: A+B+P === eligible_n`);
  }
  // Season eligible_n counts every eligible series position.
  const eligible = band.series.filter((s) => s.position_kind === 'eligible').length;
  assert.equal(band.windows.season.sample.eligible_n, eligible, 'season eligible_n === eligible series positions');
});

test('G1: compactCounts is A-B or A-B-P (pushes) — never %, slash, or rate', () => {
  assert.equal(compactCounts(6, 4, 0), '6-4');
  assert.equal(compactCounts(6, 4, 2), '6-4-2');
});

// -------------------- GROUP 3: Amendment 21 containment --------------------

test('G3: the nested key-set assertion REJECTS internal_game_id smuggled into a series position', () => {
  const alpha = candByPlayer('Fixture Alpha');
  const band = availableBand(alpha);
  const smuggled = {
    ...alpha,
    band: { ...band, series: [{ ...band.series[0], internal_game_id: DISTINCTIVE_INTERNAL_GAME_ID }, ...band.series.slice(1)] },
  } as unknown as BoardProjection;
  assert.throws(
    () => assertBoardProjectionKeySet(smuggled, { cap: false, provenance: true }),
    /internal_game_id|FORBIDDEN|unexpected/i,
  );
});

test('G3: a REAL projection from a candidate whose series carry internal_game_id DROPS it (key + value)', () => {
  const alpha = candByPlayer('Fixture Alpha');
  const band = availableBand(alpha);
  // The canary is on EVERY source series position...
  const src = defaultFixtureCandidates().find((c) => c.player === 'Fixture Alpha')!;
  assert.equal(src.bundle!.status, 'available');
  // ...but NO projected series cell carries it.
  for (const cell of band.series) {
    assert.ok(!Object.prototype.hasOwnProperty.call(cell, 'internal_game_id'), 'series cell must not carry internal_game_id');
  }
  const blob = JSON.stringify(alpha);
  assert.ok(!blob.includes(DISTINCTIVE_INTERNAL_GAME_ID), 'internal_game_id VALUE leaked into the projection');
  assert.ok(!blob.includes('internal_game_id'), 'internal_game_id KEY leaked into the projection');
  assert.ok(!blob.includes('evidence_profile_id') && !blob.includes('epid-'), 'evidence_profile_id leaked');
});

// -------------------- GROUP 4: Grammar §7 — no %, slash, or "rate" anywhere --------------------

test('G4: no projected string contains %, a slash ratio, or the word "rate"', async () => {
  const { projections } = await getBoardData(new FixtureBoardRepository());
  const blob = JSON.stringify(projections);
  assert.ok(!blob.includes('%'), 'percentage present in a projected value');
  assert.ok(!/\d\s*\/\s*\d/.test(blob), 'slash ratio present in a projected value');
  assert.ok(!/\brate\b/i.test(blob), '"rate" present in a projected value');
  // compact counts render A-B / A-B-P
  for (const p of projections) {
    if (p.band.status !== 'available') continue;
    for (const wt of ['L5', 'L10', 'L20', 'season'] as const) {
      assert.match(p.band.windows[wt].compact_counts, /^\d+-\d+(-\d+)?$/);
    }
  }
});

// -------------------- GROUP 5: STRK/AVG/DIFF are PERSISTED, not derived --------------------

test('G5: DIFF is the persisted avg_minus_threshold even when it DISAGREES with (avg − line)', () => {
  const alpha = candByPlayer('Fixture Alpha');
  const band = availableBand(alpha);
  const season = band.windows.season;
  // avg 25.3, line 24.5 → avg − line = 0.8, but persisted DIFF = 7.7. The
  // projection MUST carry the persisted value; no arithmetic derivation path.
  assert.equal(season.average, 25.3);
  assert.equal(season.difference, DISTINCTIVE_PERSISTED_DIFF);
  assert.notEqual(season.difference, Number(((season.average as number) - (alpha.evaluated_line as number)).toFixed(4)));
  // STRK is the persisted run, projected as-is.
  assert.deepEqual(season.streak, { direction: 'above', length: 2 });
});

// -------------------- GROUP 6: H2H typed-unavailable marker --------------------

test('G6: H2H is a discriminated typed-unavailable marker — never a value, null, or empty array', () => {
  const band = availableBand(candByPlayer('Fixture Alpha'));
  assert.deepEqual(band.h2h, { status: 'unavailable', reason: 'requires_h2h_window_g2' });
  // It is an object with a status discriminant — not a number, not null, not [].
  assert.equal(typeof band.h2h, 'object');
  assert.equal(band.h2h.status, 'unavailable');
  assert.ok(!Array.isArray(band.h2h));
});

// -------------------- GROUP 7: strip spans with an interleaved DNP --------------------

test('G7: the L10 span INCLUDES an interleaved ineligible position (no verdict); L10 counts equal the eligible tallies', () => {
  const band = availableBand(candByPlayer('Fixture Alpha'));
  const series = band.series;
  const N = band.windows.L10.sample.eligible_n; // 10
  // display-membership: from the Nth-most-recent eligible through the most recent.
  const eligibleOrdinals = series.filter((s) => s.position_kind === 'eligible').map((s) => s.ordinal);
  const spanStart = eligibleOrdinals[eligibleOrdinals.length - N]!;
  const span = series.filter((s) => s.ordinal >= spanStart);
  // The interleaved DNP (ordinal 3) is inside the span and carries NO verdict.
  const dnp = span.find((s) => s.position_kind === 'ineligible');
  assert.ok(dnp !== undefined, 'the interleaved ineligible position must be inside the L10 span');
  assert.equal(dnp!.outcome, null, 'ineligible position carries no verdict');
  assert.equal(dnp!.minutes_status, 'dnp');
  // The strip therefore renders MORE than 10 cells.
  assert.ok(span.length > N, `L10 strip renders ${span.length} cells (> ${N}) because a DNP falls inside the span`);
  // L10 counts equal the eligible tallies within the span.
  const spanEligible = span.filter((s) => s.position_kind === 'eligible');
  const above = spanEligible.filter((s) => s.outcome === 'above').length;
  const below = spanEligible.filter((s) => s.outcome === 'below').length;
  assert.equal(band.windows.L10.compact_counts, compactCounts(above, below, 0));
  assert.equal(spanEligible.length, N, 'exactly N eligible positions in the L10 span');
});

// -------------------- GROUP 8: legacy vs genuine zero-sample distinguishable --------------------

test('G8: legacy (no bundle) and genuine zero-sample (bundle, eligible_n=0) are DIFFERENT typed states', () => {
  const delta = candByPlayer('Fixture Delta');   // legacy: no persisted bundle
  const charlie = candByPlayer('Fixture Charlie'); // zero-sample: bundle present, eligible_n 0
  assert.equal(delta.band.status, 'unavailable_not_persisted');
  assert.equal(charlie.band.status, 'available');
  if (charlie.band.status !== 'available') throw new Error('unreachable');
  assert.equal(charlie.band.windows.season.sample.eligible_n, 0);
  assert.equal(charlie.band.windows.season.sample.coverage, 'no_data');
  assert.equal(charlie.band.windows.season.compact_counts, '0-0');
  // Neither invents values: legacy has no windows at all; zero-sample has real zeros.
  assert.ok(!('windows' in delta.band));
});

// -------------------- GROUP 9: nested key-set at every level --------------------

test('G9: a forbidden key smuggled into a NESTED object (window / consensus / freshness) THROWS', () => {
  const alpha = candByPlayer('Fixture Alpha');
  const band = availableBand(alpha);
  // window cell
  const badWindow = { ...alpha, band: { ...band, windows: { ...band.windows, L5: { ...band.windows.L5, score: 1 } } } } as unknown as BoardProjection;
  assert.throws(() => assertBoardProjectionKeySet(badWindow, { cap: false, provenance: true }), /score|FORBIDDEN|unexpected/i);
  // consensus cell
  const badConsensus = { ...alpha, band: { ...band, consensus: { ...band.consensus, book_detail: 'x' } } } as unknown as BoardProjection;
  assert.throws(() => assertBoardProjectionKeySet(badConsensus, { cap: false, provenance: true }), /book_detail|FORBIDDEN|unexpected/i);
  // a valid projection passes the nested assertion
  assert.doesNotThrow(() => assertBoardProjectionKeySet(alpha, { cap: false, provenance: true }));
});

test('G9: a composite_score smuggled into the top level still throws (DR-19 defence in depth)', () => {
  const charlie = candByPlayer('Fixture Charlie');
  const smuggled = { ...charlie, composite_score: DISTINCTIVE_COMPOSITE_SCORE } as unknown as BoardProjection;
  assert.throws(() => assertBoardProjectionKeySet(smuggled, { cap: false, provenance: false }), /composite_score|FORBIDDEN|unexpected/i);
});

// -------------------- REVISE: Freshness Badge §2.6 elapsed time --------------------

test('REVISE (§2.6): freshness carries the gate-computed BOUNDED display_age (duration); line_observed_at stays absent', async () => {
  const cands = defaultFixtureCandidates().filter((c) => c.method_version === 'evidence_method_v2');
  const serve_now = new Date().toISOString();
  const { projections } = await getBoardData(new FixtureBoardRepository(cands), serve_now);
  const byPlayer = new Map(cands.map((c) => [c.player, c]));

  let checked = 0;
  for (const p of projections) {
    if (p.band.status !== 'available') continue;
    const c = byPlayer.get(p.player)!;
    const gate = evaluateV2ServingGate({ line_observed_at: c.line_observed_at, serve_now });
    // present, AND traces EXACTLY to the gate's computed value (not recomputed here)
    assert.equal(p.band.freshness.display_age_seconds, gate.display_age_seconds, `${p.player}: display_age traces to the gate`);
    // a bounded, non-negative DURATION (a served row is within the horizon)
    const age = p.band.freshness.display_age_seconds;
    assert.ok(typeof age === 'number', 'display_age must be present (a number) on a served available-band row');
    assert.ok(age >= 0 && age <= gate.horizon_seconds, `display_age must be bounded [0, ${gate.horizon_seconds}]`);
    // it is a DURATION, not an ISO timestamp
    assert.ok(!String(age).includes('T') && !String(age).includes('Z'), 'display_age is a duration, not a timestamp');
    checked += 1;
  }
  assert.ok(checked > 0, 'expected at least one served available-band row');

  // line_observed_at (the raw server-side timestamp) is absent — key and value.
  const blob = JSON.stringify(projections);
  assert.ok(!blob.includes('line_observed_at'), 'line_observed_at key leaked into the projection');
  for (const c of cands) {
    if (typeof c.line_observed_at === 'string') {
      assert.ok(!blob.includes(c.line_observed_at), `raw line_observed_at value leaked for ${c.player}`);
    }
  }
});

// -------------------- copy safety over the NEW band strings --------------------

test('band strings (counts, labels, h2h reason, source names) pass the committed forbidden-term sweep', async () => {
  const { projections } = await getBoardData(new FixtureBoardRepository());
  const strings: string[] = [];
  for (const p of projections) {
    if (p.band.status !== 'available') continue;
    for (const wt of ['L5', 'L10', 'L20', 'season'] as const) strings.push(p.band.windows[wt].compact_counts);
    strings.push(p.band.h2h.reason);
    for (const s of p.band.sources) strings.push(s.display_name, s.normalized_source_id);
    if (p.band.freshness.state !== null) strings.push(p.band.freshness.state);
  }
  for (const s of strings) {
    assert.equal(sweepForbiddenTerms(s).violations.length, 0, `forbidden-term violation in "${s}"`);
  }
});

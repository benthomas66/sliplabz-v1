// V1-OP-4 / V1-OP-4c — PURE ingestion-gate decision + log-format unit tests,
// plus the exact-predicate DRIFT-TRIPWIRE that binds the gate's mirrored
// coverage set to the engine readers' inline predicate.
//
// No database, no server-only, no clock (except the tripwire's read of the
// engine source files). The decision is a PURE function of
// (metric, serve_now, constants); `serve_now` is injected, so boundary
// behaviour is exercised deterministically at exact seconds without waiting.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
  decideIngestionCurrency,
  buildIngestionServeLogLine,
  FIXTURE_INGESTION_METRIC,
  BOARD_SUPPRESSED_PREFIX,
  BOARD_SERVE_OK_PREFIX,
  type IngestionLagMetric,
} from '../../src/ops/ingestionGate.js';
import {
  INGESTION_LAG_GRACE_SECONDS,
  INGESTION_LAG_SUPPRESS_SECONDS,
  USABLE_HLR_COVERAGE_STATES,
  INGESTION_COVERAGE_RECENT_GAMES_N,
} from '../../src/ops/constants.js';

const SERVE_NOW = '2026-07-31T12:00:00.000Z';
const SERVE_NOW_MS = Date.parse(SERVE_NOW);

function isoAgo(secondsAgo: number | null): string | null {
  return secondsAgo === null ? null : new Date(SERVE_NOW_MS - secondsAgo * 1000).toISOString();
}

/** A postgres-source metric. Metric A (coverage) DRIVES suppression; Metric B
 *  (pgs) is diagnostic. `coverageSecondsAgo` places Metric A's oldest tip;
 *  `pgsSecondsAgo` places Metric B's oldest tip (defaults to null = none). */
function pgMetric(over: {
  coverageSecondsAgo: number | null;
  coverageGrace?: number;
  coverageFire?: number;
  newestCoverageSecondsAgo?: number;
  pgsSecondsAgo?: number | null;
  pgsGrace?: number;
  pgsFire?: number;
}): IngestionLagMetric {
  return {
    source_kind: 'postgres',
    coverage_unresolved_past_grace_48h: over.coverageGrace ?? 0,
    coverage_unresolved_past_fire_96h: over.coverageFire ?? 0,
    oldest_coverage_unresolved_tip: isoAgo(over.coverageSecondsAgo),
    newest_usable_coverage_game:
      over.newestCoverageSecondsAgo === undefined ? null : isoAgo(over.newestCoverageSecondsAgo),
    pgs_absent_past_grace_48h: over.pgsGrace ?? 0,
    pgs_absent_past_fire_96h: over.pgsFire ?? 0,
    oldest_pgs_absent_tip: isoAgo(over.pgsSecondsAgo ?? null),
  };
}

describe('ops constants — ingestion gate parameters', () => {
  it('grace = 48h and suppress = 96h, ORTHOGONAL to D-A1 (3600s)', () => {
    assert.equal(INGESTION_LAG_GRACE_SECONDS, 172800);   // 48h
    assert.equal(INGESTION_LAG_SUPPRESS_SECONDS, 345600); // 96h
    assert.ok(INGESTION_LAG_GRACE_SECONDS < INGESTION_LAG_SUPPRESS_SECONDS);
  });

  it('USABLE_HLR_COVERAGE_STATES mirrors the engine coverage set exactly', () => {
    assert.deepEqual([...USABLE_HLR_COVERAGE_STATES], ['complete', 'single_book']);
  });

  it('INGESTION_COVERAGE_RECENT_GAMES_N is a game-count bound centring the feasible band', () => {
    // N=55 centres [43,69] (verified against hosted data 2026-07-31: 07-12 stall
    // at ranks 1-43, oldest permanent hole at rank 70). ±20% must stay in-band so
    // the bound is robust: catch the full stall AND exclude the June holes.
    assert.equal(INGESTION_COVERAGE_RECENT_GAMES_N, 55);
    assert.ok(Number.isInteger(INGESTION_COVERAGE_RECENT_GAMES_N));
    assert.ok(Math.round(INGESTION_COVERAGE_RECENT_GAMES_N * 0.8) >= 43, 'N−20% still covers the full stall (≥43)');
    assert.ok(Math.round(INGESTION_COVERAGE_RECENT_GAMES_N * 1.2) <= 69, 'N+20% still excludes the nearest permanent hole (≤69)');
  });
});

describe('decideIngestionCurrency — suppression keys on Metric A (coverage), never pgs', () => {
  // ---- Test 1 — suppression keys on Metric A, not pgs ----
  it('Test 1: pgs-absent counts present but Metric-A oldest ≤ 96h → SERVES', () => {
    // Box scores stopped (Metric B has old absences) but every past-tip game
    // still has usable coverage within 96h → the engine is NOT blind → serve.
    const metric = pgMetric({
      coverageSecondsAgo: INGESTION_LAG_SUPPRESS_SECONDS - 10, coverageGrace: 1, coverageFire: 0,
      pgsSecondsAgo: 30 * 24 * 3600, pgsGrace: 41, pgsFire: 41,
    });
    assert.equal(decideIngestionCurrency(metric, SERVE_NOW).ingestion_behind, false);
  });

  it('Test 1: Metric-A oldest > 96h → SUPPRESSES (regardless of pgs)', () => {
    const metric = pgMetric({
      coverageSecondsAgo: INGESTION_LAG_SUPPRESS_SECONDS + 1, coverageGrace: 5, coverageFire: 1,
      pgsSecondsAgo: null, pgsGrace: 0, pgsFire: 0, // pgs perfectly current
    });
    assert.equal(decideIngestionCurrency(metric, SERVE_NOW).ingestion_behind, true);
  });

  // ---- Test 2 — THE FIX: box score present, closing line absent, still suppressed ----
  it('Test 2 (THE FIX): pgs PRESENT (no pgs absence) but coverage unresolved > 96h → SUPPRESSES', () => {
    // The exact GAP-26 defect: a naive pgs-anchored gate sees zero pgs
    // absences and SERVES; the coverage-anchored gate sees an unresolved
    // closing line older than 96h and correctly SUPPRESSES.
    const metric = pgMetric({
      coverageSecondsAgo: 5 * 24 * 3600, coverageGrace: 1, coverageFire: 1,
      pgsSecondsAgo: null, pgsGrace: 0, pgsFire: 0,
    });
    assert.equal(metric.oldest_pgs_absent_tip, null, 'pgs is present (box score restored)');
    assert.equal(decideIngestionCurrency(metric, SERVE_NOW).ingestion_behind, true);
  });

  // ---- Test 6 — anomaly-in-band (72h) on Metric A ----
  it('Test 6: a lone coverage straggler at ~72h (grace≥1, fire=0) → SERVES', () => {
    const metric = pgMetric({ coverageSecondsAgo: 72 * 3600, coverageGrace: 1, coverageFire: 0 });
    assert.ok(metric.coverage_unresolved_past_grace_48h >= 1);
    assert.equal(metric.coverage_unresolved_past_fire_96h, 0);
    assert.equal(decideIngestionCurrency(metric, SERVE_NOW).ingestion_behind, false);
  });

  // ---- Test 7 — 96h boundary, strict `>` ----
  it('Test 7: boundary — just past 96h suppresses; exactly 96h and just under serve', () => {
    assert.equal(decideIngestionCurrency(pgMetric({ coverageSecondsAgo: INGESTION_LAG_SUPPRESS_SECONDS + 1, coverageGrace: 1, coverageFire: 1 }), SERVE_NOW).ingestion_behind, true);
    assert.equal(decideIngestionCurrency(pgMetric({ coverageSecondsAgo: INGESTION_LAG_SUPPRESS_SECONDS, coverageGrace: 1, coverageFire: 0 }), SERVE_NOW).ingestion_behind, false);
    assert.equal(decideIngestionCurrency(pgMetric({ coverageSecondsAgo: INGESTION_LAG_SUPPRESS_SECONDS - 1, coverageGrace: 1, coverageFire: 0 }), SERVE_NOW).ingestion_behind, false);
  });

  it('stoppage: coverage oldest advanced past 96h suppresses', () => {
    assert.equal(decideIngestionCurrency(pgMetric({ coverageSecondsAgo: 19 * 24 * 3600, coverageGrace: 44, coverageFire: 42, pgsSecondsAgo: 19 * 24 * 3600, pgsGrace: 41, pgsFire: 41 }), SERVE_NOW).ingestion_behind, true);
  });

  it('no coverage-unresolved past-tip game → not behind (even with pgs absences)', () => {
    assert.equal(decideIngestionCurrency(pgMetric({ coverageSecondsAgo: null, pgsSecondsAgo: 19 * 24 * 3600, pgsGrace: 41, pgsFire: 41 }), SERVE_NOW).ingestion_behind, false);
  });

  // ---- Fixture exemption at the decision layer ----
  it('fixture source is EXEMPT: never behind, flagged exempt', () => {
    const d = decideIngestionCurrency(FIXTURE_INGESTION_METRIC, SERVE_NOW);
    assert.deepEqual(d, { ingestion_behind: false, exempt: true });
    const forced: IngestionLagMetric = { ...pgMetric({ coverageSecondsAgo: 19 * 24 * 3600, coverageGrace: 44, coverageFire: 42 }), source_kind: 'fixture' };
    assert.equal(decideIngestionCurrency(forced, SERVE_NOW).ingestion_behind, false);
    assert.equal(decideIngestionCurrency(forced, SERVE_NOW).exempt, true);
  });

  it('data-integrity: an unparseable Metric-A oldest tip on a LIVE source fails safe (suppress)', () => {
    const bad: IngestionLagMetric = { ...pgMetric({ coverageSecondsAgo: 0, coverageGrace: 1, coverageFire: 1 }), oldest_coverage_unresolved_tip: 'not-a-date' };
    assert.equal(decideIngestionCurrency(bad, SERVE_NOW).ingestion_behind, true);
  });

  it('serve_now discipline: pure function — deterministic, advancing serve_now flips the boundary', () => {
    const metric = pgMetric({ coverageSecondsAgo: INGESTION_LAG_SUPPRESS_SECONDS - 10, coverageGrace: 1, coverageFire: 0 });
    assert.deepEqual(decideIngestionCurrency(metric, SERVE_NOW), decideIngestionCurrency(metric, SERVE_NOW));
    assert.equal(decideIngestionCurrency(metric, SERVE_NOW).ingestion_behind, false);
    const later = new Date(SERVE_NOW_MS + 20_000).toISOString();
    assert.equal(decideIngestionCurrency(metric, later).ingestion_behind, true);
  });
});

describe('buildIngestionServeLogLine — BOTH metric blocks, distinguishable', () => {
  // ---- Test 5 — both metrics reported separately ----
  it('Test 5: log carries coverage_* and pgs_* blocks with DISTINCT oldest-tips, separated by ` || `', () => {
    // A case where they DIFFER: pgs present (Metric B resolved, oldest none)
    // while coverage unresolved (Metric A drives suppression).
    const metric = pgMetric({
      coverageSecondsAgo: 5 * 24 * 3600, coverageGrace: 2, coverageFire: 1, newestCoverageSecondsAgo: 6 * 24 * 3600,
      pgsSecondsAgo: null, pgsGrace: 0, pgsFire: 0,
    });
    const line = buildIngestionServeLogLine(metric, true);
    const parts = line.split(' || ');
    assert.equal(parts.length, 2, 'exactly one ` || ` separates the two metric blocks');
    assert.ok(parts[0]!.includes('coverage_unresolved_past_grace_48h=2'));
    assert.ok(parts[0]!.includes('coverage_unresolved_past_fire_96h=1'));
    assert.ok(/oldest_coverage_unresolved_tip=\d{4}-\d{2}-\d{2}/.test(parts[0]!));
    assert.ok(/newest_usable_coverage=\d{4}-\d{2}-\d{2}/.test(parts[0]!));
    assert.ok(parts[1]!.includes('pgs_absent_past_grace_48h=0'));
    assert.ok(parts[1]!.includes('pgs_absent_past_fire_96h=0'));
    assert.ok(parts[1]!.includes('oldest_pgs_absent_tip=none'), 'Metric B resolved while Metric A unresolved');
    // The pgs block must NOT leak coverage_* keys and vice-versa.
    assert.ok(!parts[1]!.includes('coverage_'));
    assert.ok(!parts[0]!.includes('pgs_'));
  });

  it('suppress path: BOARD_SUPPRESSED coverage_behind prefix + both blocks', () => {
    const metric = pgMetric({ coverageSecondsAgo: 19 * 24 * 3600, coverageGrace: 44, coverageFire: 42, newestCoverageSecondsAgo: 19 * 24 * 3600, pgsSecondsAgo: 19 * 24 * 3600, pgsGrace: 41, pgsFire: 41 });
    const line = buildIngestionServeLogLine(metric, true);
    assert.ok(line.startsWith(BOARD_SUPPRESSED_PREFIX + ' coverage_behind:'));
    assert.ok(line.includes('coverage_unresolved_past_fire_96h=42'));
    assert.ok(line.includes('pgs_absent_past_fire_96h=41'));
  });

  it('pass path: DISTINCT BOARD_SERVE_OK coverage_ok prefix + both blocks', () => {
    const metric = pgMetric({ coverageSecondsAgo: 72 * 3600, coverageGrace: 1, coverageFire: 0 });
    const line = buildIngestionServeLogLine(metric, false);
    assert.ok(line.startsWith(BOARD_SERVE_OK_PREFIX + ' coverage_ok:'));
    assert.ok(line.includes('coverage_unresolved_past_grace_48h=1'));
    assert.ok(line.includes('coverage_unresolved_past_fire_96h=0'));
    assert.notEqual(BOARD_SUPPRESSED_PREFIX, BOARD_SERVE_OK_PREFIX); // grep separately
  });

  it('null timestamps render as `none` (no crash, still greppable)', () => {
    const line = buildIngestionServeLogLine(pgMetric({ coverageSecondsAgo: null }), false);
    assert.ok(line.includes('oldest_coverage_unresolved_tip=none'));
    assert.ok(line.includes('newest_usable_coverage=none'));
    assert.ok(line.includes('oldest_pgs_absent_tip=none'));
  });
});

// ---- Test 4 — EXACT-PREDICATE DRIFT TRIPWIRE ----
//
// Reads the two engine reader sources and asserts the coverage-state set each
// inlines equals USABLE_HLR_COVERAGE_STATES. If the engine ever changes its
// predicate (adds/removes a coverage_state) without the gate following, THIS
// FAILS LOUD — binding gate ↔ engine so they cannot silently diverge. The gate
// deliberately MIRRORS the set (a shared import would break the compose-only
// boundary); the tripwire is what keeps the mirror honest.
describe('Test 4: exact-predicate drift tripwire (gate ↔ engine)', () => {
  const HERE = dirname(fileURLToPath(import.meta.url));
  const REPO = resolve(HERE, '../..');
  const ENGINE_SITES = [
    'src/evidence/driver/readModelInputBuilder.ts',
    'src/computation/historicalSeriesRead.ts',
  ] as const;

  /** Extract every `coverage_state IN ( ... )` literal set found in a source. */
  function extractCoverageSets(src: string): string[][] {
    const sets: string[][] = [];
    const re = /coverage_state\s+IN\s*\(([^)]*)\)/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) !== null) {
      const states = m[1]!
        .split(',')
        .map((s) => s.trim().replace(/^'/, '').replace(/'$/, ''))
        .filter((s) => s.length > 0);
      sets.push(states);
    }
    return sets;
  }

  for (const site of ENGINE_SITES) {
    it(`${site} inlines exactly USABLE_HLR_COVERAGE_STATES`, () => {
      const src = readFileSync(resolve(REPO, site), 'utf8');
      const sets = extractCoverageSets(src);
      assert.ok(sets.length >= 1, `expected at least one coverage_state IN (...) predicate in ${site}`);
      const expected = [...USABLE_HLR_COVERAGE_STATES];
      for (const set of sets) {
        assert.deepEqual(
          set, expected,
          `ENGINE PREDICATE DRIFT: ${site} uses coverage_state IN (${set.map((s) => `'${s}'`).join(', ')}) ` +
          `but the gate mirrors [${expected.map((s) => `'${s}'`).join(', ')}]. ` +
          `Update USABLE_HLR_COVERAGE_STATES in src/ops/constants.ts to follow the engine, ` +
          `or the ingestion gate will suppress on the wrong coverage set.`,
        );
      }
    });
  }
});

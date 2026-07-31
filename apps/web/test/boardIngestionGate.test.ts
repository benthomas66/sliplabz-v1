// V1-OP-4 / V1-OP-4c — BOARD HISTORICAL-INGESTION SERVING GATE tests
// (pipeline + wiring + probe shape + compose-only proof).
//
// Fixture/double-driven; NO hosted dependency. Run with
// `--conditions=react-server` so the `server-only` marker resolves to its
// empty module (see package.json).
//
// The Board applies a SYSTEM-LEVEL, serve-time ingestion gate in getBoardData:
// a read-only probe reports TWO ingestion-lag metrics; a PURE decision
// suppresses the WHOLE Board to the approved empty state when the oldest
// COVERAGE-unresolved past-tip game (Metric A — usable historical_line_results,
// the table the engine consumes) is older than 96h. Metric B (player_game_stats
// absence) is reported only and never drives the decision. Orthogonal to the
// D-A1 market gate. The FIXTURE/preview source is exempt. On the LIVE (postgres)
// source EVERY serve decision emits ONE greppable structured log carrying BOTH
// metric blocks, with a distinct prefix per path.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { getBoardData } from '../src/lib/server/boardService.js';
import { FixtureBoardRepository, defaultFixtureCandidates } from '../src/lib/server/fixtureRepository.js';
import { buildIngestionLagQuery, type BoardRepository } from '../src/lib/server/boardRepository.js';
import type { MethodVersion } from '../src/lib/method.js';
import type { RankedCandidate } from '../src/lib/rankedCandidate.js';
import {
  type IngestionLagMetric,
  BOARD_SUPPRESSED_PREFIX,
  BOARD_SERVE_OK_PREFIX,
} from '../../../src/ops/ingestionGate.js';
import { INGESTION_LAG_GRACE_SECONDS, INGESTION_LAG_SUPPRESS_SECONDS, INGESTION_COVERAGE_RECENT_GAMES_N } from '../../../src/ops/constants.js';

// --- A test-double repository: supplies a controlled ingestion metric AND a
// controlled candidate set, so the wiring (probe -> decision -> suppress/serve)
// is exercised with NO database. Mirrors the production BoardRepository shape.
class ProbeDoubleRepository implements BoardRepository {
  constructor(
    private readonly metric: IngestionLagMetric,
    private readonly rows: ReadonlyArray<RankedCandidate>,
  ) {}
  async queryRankedCandidates(method: MethodVersion): Promise<ReadonlyArray<RankedCandidate>> {
    return this.rows.filter((r) => r.method_version === method);
  }
  async probeIngestionLag(_serve_now: string): Promise<IngestionLagMetric> {
    return this.metric;
  }
}

/** Build a postgres-source metric. Metric A (coverage) DRIVES suppression:
 *  `coverageHoursAgo` places its oldest tip. Metric B (pgs) is diagnostic:
 *  `pgsHoursAgo`/`pgsGrace`/`pgsFire` default to "box scores fine". */
function pgMetric(over: {
  coverageHoursAgo: number | null;
  coverageGrace: number;
  coverageFire: number;
  newestCoverageHoursAgo?: number;
  pgsHoursAgo?: number | null;
  pgsGrace?: number;
  pgsFire?: number;
}): IngestionLagMetric {
  const ago = (h: number | null | undefined): string | null =>
    h === null || h === undefined ? null : new Date(Date.now() - h * 3600_000).toISOString();
  return {
    source_kind: 'postgres',
    coverage_unresolved_past_grace_48h: over.coverageGrace,
    coverage_unresolved_past_fire_96h: over.coverageFire,
    oldest_coverage_unresolved_tip: ago(over.coverageHoursAgo),
    newest_usable_coverage_game: ago(over.newestCoverageHoursAgo),
    pgs_absent_past_grace_48h: over.pgsGrace ?? 0,
    pgs_absent_past_fire_96h: over.pgsFire ?? 0,
    oldest_pgs_absent_tip: ago(over.pgsHoursAgo ?? null),
  };
}

function v2Rows(): ReadonlyArray<RankedCandidate> {
  // Default fixtures carry a FRESH line_observed_at (well inside the 3600s
  // market horizon) so the market gate serves them; the ingestion gate is the
  // variable under test here.
  return defaultFixtureCandidates();
}

/** Capture console.info lines emitted during `fn`. */
async function captureInfo(fn: () => Promise<void>): Promise<string[]> {
  const lines: string[] = [];
  const orig = console.info;
  // eslint-disable-next-line no-console
  console.info = (...args: unknown[]) => { lines.push(args.map(String).join(' ')); };
  try { await fn(); } finally { console.info = orig; }
  return lines;
}

// -------------------- 1. COVERAGE-BEHIND -> APPROVED EMPTY STATE --------------------

test('Test 1: coverage unresolved older than 96h suppresses the whole Board to the empty state', async () => {
  const repo = new ProbeDoubleRepository(pgMetric({ coverageHoursAgo: 24 * 19, coverageGrace: 44, coverageFire: 42, pgsHoursAgo: 24 * 19, pgsGrace: 41, pgsFire: 41 }), v2Rows());
  const { projections, rows, method_version } = await getBoardData(repo, new Date().toISOString());
  assert.equal(projections.length, 0);            // no profile rows in the body
  assert.equal(rows.length, 0);
  assert.equal(method_version, 'evidence_method_v2'); // still an honest v2 answer, not an error
});

// -------------------- Test 10. BYTE-IDENTICAL EMPTY STATE --------------------

test('Test 10: suppression yields byte-identical empty state to a genuinely empty repo', async () => {
  const repo = new ProbeDoubleRepository(pgMetric({ coverageHoursAgo: 24 * 19, coverageGrace: 44, coverageFire: 42 }), v2Rows());
  const suppressed = await getBoardData(repo, new Date().toISOString());
  const empty = await getBoardData(new FixtureBoardRepository([]));
  assert.deepEqual(
    { p: suppressed.projections.length, r: suppressed.rows.length, m: suppressed.method_version },
    { p: empty.projections.length, r: empty.rows.length, m: empty.method_version },
  );
});

// -------------------- 2. COVERAGE-CURRENT -> SERVES NORMALLY --------------------

test('coverage current (no unresolved game older than 96h) serves the Board normally', async () => {
  const repo = new ProbeDoubleRepository(pgMetric({ coverageHoursAgo: null, coverageGrace: 0, coverageFire: 0 }), v2Rows());
  const { projections } = await getBoardData(repo, new Date().toISOString());
  assert.ok(projections.length > 0, 'current coverage serves the surviving v2 rows');
});

// -------------------- Test 2 — THE FIX: box score present, closing line absent --------------------

test('Test 2 (THE FIX): box score PRESENT (zero pgs absence) but coverage unresolved > 96h → STILL SUPPRESSED', async () => {
  // The exact GAP-26 defect. A naive pgs-anchored gate sees pgs_absent = 0 and
  // would SERVE this Board on windows the engine is blind to. The re-anchored
  // gate keys on Metric A (coverage) and correctly SUPPRESSES.
  const metric = pgMetric({
    coverageHoursAgo: 24 * 5, coverageGrace: 1, coverageFire: 1,     // Metric A: unresolved > 96h
    pgsHoursAgo: null, pgsGrace: 0, pgsFire: 0,                       // Metric B: box scores all present
  });
  assert.equal(metric.oldest_pgs_absent_tip, null, 'pgs restored — a pgs-only gate would serve');
  const repo = new ProbeDoubleRepository(metric, v2Rows());
  const { projections, rows } = await getBoardData(repo, new Date().toISOString());
  assert.equal(projections.length, 0, 'coverage-anchored gate suppresses despite present box scores');
  assert.equal(rows.length, 0);
});

// -------------------- Test 3 — resolved requires USABLE hlr --------------------

test('Test 3: coverage-resolved (Metric A oldest null) serves even with pgs absences; unresolved suppresses', async () => {
  // Resolved: every past-tip game has a usable hlr row (Metric A oldest = null)
  // → serves, even though box scores stopped (pgs absences old).
  const resolved = new ProbeDoubleRepository(
    pgMetric({ coverageHoursAgo: null, coverageGrace: 0, coverageFire: 0, pgsHoursAgo: 24 * 30, pgsGrace: 41, pgsFire: 41 }),
    v2Rows(),
  );
  assert.ok((await getBoardData(resolved, new Date().toISOString())).projections.length > 0);

  // Unresolved: a game whose only hlr rows are NOT in the usable set (e.g.
  // no_closing_line / unresolved_closing_consensus) is Metric-A-unresolved —
  // modelled here as a coverage oldest > 96h → suppresses.
  const unresolved = new ProbeDoubleRepository(
    pgMetric({ coverageHoursAgo: 24 * 6, coverageGrace: 1, coverageFire: 1 }),
    v2Rows(),
  );
  assert.equal((await getBoardData(unresolved, new Date().toISOString())).projections.length, 0);
});

// -------------------- Test 6. FIRING THRESHOLD IS 96h, NOT THE 48h GRACE --------------------

test('Test 6 anomaly tolerance: ONE coverage straggler at ~72h (grace>=1, fire=0) still SERVES', async () => {
  const metric = pgMetric({ coverageHoursAgo: 72, coverageGrace: 1, coverageFire: 0 });
  assert.ok(metric.coverage_unresolved_past_grace_48h >= 1);
  assert.equal(metric.coverage_unresolved_past_fire_96h, 0);
  const repo = new ProbeDoubleRepository(metric, v2Rows());
  const { projections } = await getBoardData(repo, new Date().toISOString());
  assert.ok(projections.length > 0, 'a lone 48-96h straggler does NOT suppress the Board');
});

test('stoppage: multiple coverage-unresolved with the oldest past 96h suppresses', async () => {
  const repo = new ProbeDoubleRepository(pgMetric({ coverageHoursAgo: 24 * 5, coverageGrace: 10, coverageFire: 6 }), v2Rows());
  const { projections } = await getBoardData(repo, new Date().toISOString());
  assert.equal(projections.length, 0);
});

// -------------------- system-level: ALL OR NONE --------------------

test('system-level: the ingestion gate drops ALL rows or NONE, never selectively', async () => {
  const rows = v2Rows();
  const servedCount = (await getBoardData(
    new ProbeDoubleRepository(pgMetric({ coverageHoursAgo: null, coverageGrace: 0, coverageFire: 0 }), rows),
    new Date().toISOString(),
  )).projections.length;
  assert.ok(servedCount > 1, 'multiple rows serve when coverage is current');

  const suppressed = await getBoardData(
    new ProbeDoubleRepository(pgMetric({ coverageHoursAgo: 24 * 10, coverageGrace: 20, coverageFire: 15 }), rows),
    new Date().toISOString(),
  );
  assert.equal(suppressed.projections.length, 0, 'behind -> ALL dropped, never a partial subset');
});

// -------------------- Test 8. FIXTURE EXEMPTION --------------------

test('Test 8: fixture / fixture_empty source is EXEMPT: the ingestion gate never suppresses it', async () => {
  const { projections } = await getBoardData(new FixtureBoardRepository());
  assert.ok(projections.length > 0, 'design-preview / audit boards always render');
});

// -------------------- Test 9. SERVE-TIME LOG ON BOTH PATHS (postgres only) --------------------

test('Test 9: BOARD_SUPPRESSED coverage_behind / BOARD_SERVE_OK coverage_ok, both metric blocks; fixture emits neither', async () => {
  const now = new Date().toISOString();

  const suppressLines = await captureInfo(async () => {
    await getBoardData(new ProbeDoubleRepository(pgMetric({ coverageHoursAgo: 24 * 19, coverageGrace: 44, coverageFire: 42, newestCoverageHoursAgo: 24 * 19, pgsHoursAgo: 24 * 19, pgsGrace: 41, pgsFire: 41 }), v2Rows()), now);
  });
  const suppress = suppressLines.filter((l) => l.startsWith(BOARD_SUPPRESSED_PREFIX) || l.startsWith(BOARD_SERVE_OK_PREFIX));
  assert.equal(suppress.length, 1, 'exactly one serve-decision log on the postgres source');
  assert.ok(suppress[0]!.startsWith(BOARD_SUPPRESSED_PREFIX + ' coverage_behind:'));
  // BOTH blocks, separated by ` || `.
  const sParts = suppress[0]!.split(' || ');
  assert.equal(sParts.length, 2);
  for (const key of ['coverage_unresolved_past_grace_48h=44', 'coverage_unresolved_past_fire_96h=42', 'oldest_coverage_unresolved_tip=', 'newest_usable_coverage=']) {
    assert.ok(sParts[0]!.includes(key), `suppress coverage block carries ${key}`);
  }
  for (const key of ['pgs_absent_past_grace_48h=41', 'pgs_absent_past_fire_96h=41', 'oldest_pgs_absent_tip=']) {
    assert.ok(sParts[1]!.includes(key), `suppress pgs block carries ${key}`);
  }

  const passLines = await captureInfo(async () => {
    await getBoardData(new ProbeDoubleRepository(pgMetric({ coverageHoursAgo: 72, coverageGrace: 1, coverageFire: 0, pgsHoursAgo: 24 * 19, pgsGrace: 41, pgsFire: 41 }), v2Rows()), now);
  });
  const pass = passLines.filter((l) => l.startsWith(BOARD_SUPPRESSED_PREFIX) || l.startsWith(BOARD_SERVE_OK_PREFIX));
  assert.equal(pass.length, 1);
  assert.ok(pass[0]!.startsWith(BOARD_SERVE_OK_PREFIX + ' coverage_ok:'));
  const pParts = pass[0]!.split(' || ');
  assert.equal(pParts.length, 2);
  assert.ok(pParts[0]!.includes('coverage_unresolved_past_grace_48h=1') && pParts[0]!.includes('coverage_unresolved_past_fire_96h=0'));
  // Metric B still reported on the pass path (box scores stopped even though coverage is in-band).
  assert.ok(pParts[1]!.includes('pgs_absent_past_fire_96h=41'));

  // Distinct prefixes -> the two paths grep separately.
  assert.notEqual(BOARD_SUPPRESSED_PREFIX, BOARD_SERVE_OK_PREFIX);

  // Fixture / preview path emits NEITHER.
  const fixtureLines = await captureInfo(async () => {
    await getBoardData(new FixtureBoardRepository());
  });
  assert.equal(fixtureLines.filter((l) => l.startsWith(BOARD_SUPPRESSED_PREFIX) || l.startsWith(BOARD_SERVE_OK_PREFIX)).length, 0);
});

// -------------------- Test 11. PROBE QUERY SHAPE --------------------

test('Test 11: the probe query shape — Metric A coverage, Metric B pgs, neither references game status', () => {
  const { text, values } = buildIngestionLagQuery('2026-07-31T00:00:00.000Z');
  // Metric A — engine coverage (drives suppression).
  assert.ok(/historical_line_results/.test(text), 'Metric A references historical_line_results');
  assert.ok(/coverage_state IN \('complete',\s*'single_book'\)/.test(text), 'Metric A uses the exact usable-coverage predicate');
  assert.ok(/NOT EXISTS/i.test(text));
  assert.ok(/scheduled_start_utc\s*<\s*\$1/.test(text));
  // Metric B — box-score absence (reported only).
  assert.ok(/player_game_stats/.test(text), 'Metric B references player_game_stats');
  // Neither metric references game status or a status literal.
  assert.ok(!/\bstatus\b/i.test(text), 'metric must not reference game status');
  assert.ok(!/'final'/i.test(text) && !/'scheduled'/i.test(text), 'metric must not reference any status literal');
  // V1-OP-4c LOWER BOUND: both metrics are measured over only the N most recent
  // past-tip games (recent_games CTE, ORDER BY tipoff DESC, LIMIT $4) — a
  // game-count bound (not calendar) so a live stall cannot scroll out of view
  // and ancient permanent holes are excluded so the gate can lift.
  assert.ok(/recent_games/.test(text), 'both metrics are bounded by the recent_games CTE');
  assert.ok(/ORDER BY\s+g\.scheduled_start_utc\s+DESC/i.test(text), 'recent_games orders by tipoff DESC');
  assert.ok(/LIMIT\s+\$4/.test(text), 'recent_games is bounded by the N parameter ($4)');
  // Grace (48h), suppress (96h), and the recent-games bound N are BOUND parameters.
  assert.deepEqual(values, ['2026-07-31T00:00:00.000Z', INGESTION_LAG_GRACE_SECONDS, INGESTION_LAG_SUPPRESS_SECONDS, INGESTION_COVERAGE_RECENT_GAMES_N]);
  assert.equal(INGESTION_LAG_GRACE_SECONDS, 172800);
  assert.equal(INGESTION_LAG_SUPPRESS_SECONDS, 345600);
  assert.equal(INGESTION_COVERAGE_RECENT_GAMES_N, 55);
});

// -------------------- Test 12. COMPOSE-ONLY BOUNDARY (git diff) --------------------

test('Test 12: compose-only — no working-tree changes to engine/method/persistence/projection files', () => {
  const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
  const changed = execSync('git diff --name-only HEAD', { cwd: REPO, encoding: 'utf8' })
    .split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
  const FORBIDDEN_PREFIXES = [
    'src/evidence/',
    'src/computation/',
    'src/persistence/',
    'migrations/',
  ];
  const FORBIDDEN_EXACT = [
    'src/evidence/v2/servingGate.ts',
    'src/evidence/v2/thresholds.ts',
    'apps/web/src/lib/server/boardProjection.ts',
  ];
  for (const f of changed) {
    for (const pre of FORBIDDEN_PREFIXES) {
      assert.ok(!f.startsWith(pre), `compose-only violation: ${f} is under forbidden ${pre}`);
    }
    assert.ok(!FORBIDDEN_EXACT.includes(f), `compose-only violation: ${f} must have an EMPTY diff`);
  }
});

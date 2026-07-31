// V1-OP-4 — BOARD HISTORICAL-INGESTION SERVING GATE tests (pipeline + wiring).
//
// Fixture/double-driven; NO hosted dependency. Run with
// `--conditions=react-server` so the `server-only` marker resolves to its
// empty module (see package.json).
//
// The Board applies a SYSTEM-LEVEL, serve-time ingestion gate in getBoardData:
// a read-only probe reports historical-ingestion lag; a PURE decision
// suppresses the WHOLE Board to the approved empty state when the oldest
// unresolved past-tip game is older than 96h. Orthogonal to the D-A1 market
// gate. The FIXTURE/preview source is exempt (no live ingestion). On the LIVE
// (postgres) source EVERY serve decision emits ONE greppable structured log,
// with a distinct prefix per path.

import { test } from 'node:test';
import assert from 'node:assert/strict';

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
import { INGESTION_LAG_GRACE_SECONDS, INGESTION_LAG_SUPPRESS_SECONDS } from '../../../src/ops/constants.js';

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

/** Build a postgres-source metric whose oldest unresolved tip is `hoursAgo`
 *  before now, with explicit grace/fire counts. */
function pgMetric(over: {
  hoursAgo: number | null;
  grace: number;
  fire: number;
  newestHoursAgo?: number;
}): IngestionLagMetric {
  return {
    source_kind: 'postgres',
    unresolved_past_grace_48h: over.grace,
    unresolved_past_fire_96h: over.fire,
    oldest_unresolved_tip:
      over.hoursAgo === null ? null : new Date(Date.now() - over.hoursAgo * 3600_000).toISOString(),
    newest_ingested_game:
      over.newestHoursAgo === undefined ? null : new Date(Date.now() - over.newestHoursAgo * 3600_000).toISOString(),
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

// -------------------- 1. INGESTION-BEHIND -> APPROVED EMPTY STATE --------------------

test('ingestion behind (unresolved game older than 96h) suppresses the whole Board to the empty state', async () => {
  const repo = new ProbeDoubleRepository(pgMetric({ hoursAgo: 24 * 19, grace: 36, fire: 31 }), v2Rows());
  const { projections, rows, method_version } = await getBoardData(repo, new Date().toISOString());
  assert.equal(projections.length, 0);            // no profile rows in the body
  assert.equal(rows.length, 0);
  assert.equal(method_version, 'evidence_method_v2'); // still an honest v2 answer, not an error

  // Byte-identical to the genuine zero-row state: same shape as an empty repo.
  const empty = await getBoardData(new FixtureBoardRepository([]));
  assert.deepEqual(
    { p: projections.length, r: rows.length, m: method_version },
    { p: empty.projections.length, r: empty.rows.length, m: empty.method_version },
  );
});

// -------------------- 2. INGESTION-CURRENT -> SERVES NORMALLY --------------------

test('ingestion current (no unresolved game older than 96h) serves the Board normally', async () => {
  const repo = new ProbeDoubleRepository(pgMetric({ hoursAgo: null, grace: 0, fire: 0 }), v2Rows());
  const { projections } = await getBoardData(repo, new Date().toISOString());
  assert.ok(projections.length > 0, 'current ingestion serves the surviving v2 rows');
});

// -------------------- 3. FIRING THRESHOLD IS 96h, NOT THE 48h GRACE --------------------

test('3(b) anomaly tolerance: ONE unresolved game at ~72h (grace>=1, fire=0) still SERVES', async () => {
  // The two-threshold case. A naive "fire on any unresolved-past-grace" gate
  // would suppress here and FAIL this test while passing the boundary case.
  const metric = pgMetric({ hoursAgo: 72, grace: 1, fire: 0 });
  assert.ok(metric.unresolved_past_grace_48h >= 1);
  assert.equal(metric.unresolved_past_fire_96h, 0);
  const repo = new ProbeDoubleRepository(metric, v2Rows());
  const { projections } = await getBoardData(repo, new Date().toISOString());
  assert.ok(projections.length > 0, 'a lone 48-96h straggler does NOT suppress the Board');
});

test('3(c) stoppage: multiple unresolved with the oldest past 96h suppresses', async () => {
  const repo = new ProbeDoubleRepository(pgMetric({ hoursAgo: 24 * 5, grace: 10, fire: 6 }), v2Rows());
  const { projections } = await getBoardData(repo, new Date().toISOString());
  assert.equal(projections.length, 0);
});

// -------------------- 6. SYSTEM-LEVEL: ALL OR NONE --------------------

test('system-level: the ingestion gate drops ALL rows or NONE, never selectively', async () => {
  const rows = v2Rows();
  const servedCount = (await getBoardData(
    new ProbeDoubleRepository(pgMetric({ hoursAgo: null, grace: 0, fire: 0 }), rows),
    new Date().toISOString(),
  )).projections.length;
  assert.ok(servedCount > 1, 'multiple rows serve when ingestion is current');

  const suppressed = await getBoardData(
    new ProbeDoubleRepository(pgMetric({ hoursAgo: 24 * 10, grace: 20, fire: 15 }), rows),
    new Date().toISOString(),
  );
  assert.equal(suppressed.projections.length, 0, 'behind -> ALL dropped, never a partial subset');
});

// -------------------- 7. FIXTURE EXEMPTION --------------------

test('fixture / fixture_empty source is EXEMPT: the ingestion gate never suppresses it', async () => {
  // A real FixtureBoardRepository reports "current" regardless of any lag: it
  // is design data, not live ingestion. The default fixtures therefore serve.
  const { projections } = await getBoardData(new FixtureBoardRepository());
  assert.ok(projections.length > 0, 'design-preview / audit boards always render');
});

// -------------------- 8. SERVE-TIME LOG ON BOTH PATHS (postgres only) --------------------

test('serve-time log: BOARD_SUPPRESSED on the fire path, distinct BOARD_SERVE_OK on the pass path; fixture emits neither', async () => {
  const now = new Date().toISOString();

  const suppressLines = await captureInfo(async () => {
    await getBoardData(new ProbeDoubleRepository(pgMetric({ hoursAgo: 24 * 19, grace: 36, fire: 31, newestHoursAgo: 24 * 19 }), v2Rows()), now);
  });
  const suppress = suppressLines.filter((l) => l.startsWith(BOARD_SUPPRESSED_PREFIX) || l.startsWith(BOARD_SERVE_OK_PREFIX));
  assert.equal(suppress.length, 1, 'exactly one serve-decision log on the postgres source');
  assert.ok(suppress[0]!.startsWith(BOARD_SUPPRESSED_PREFIX));
  for (const key of ['unresolved_past_grace_48h=36', 'unresolved_past_fire_96h=31', 'oldest_unresolved_tip=', 'newest_ingested_game=']) {
    assert.ok(suppress[0]!.includes(key), `suppress log carries ${key}`);
  }

  const passLines = await captureInfo(async () => {
    await getBoardData(new ProbeDoubleRepository(pgMetric({ hoursAgo: 72, grace: 1, fire: 0 }), v2Rows()), now);
  });
  const pass = passLines.filter((l) => l.startsWith(BOARD_SUPPRESSED_PREFIX) || l.startsWith(BOARD_SERVE_OK_PREFIX));
  assert.equal(pass.length, 1);
  assert.ok(pass[0]!.startsWith(BOARD_SERVE_OK_PREFIX));
  assert.ok(pass[0]!.includes('unresolved_past_grace_48h=1') && pass[0]!.includes('unresolved_past_fire_96h=0'));

  // Distinct prefixes -> the two paths grep separately.
  assert.notEqual(BOARD_SUPPRESSED_PREFIX, BOARD_SERVE_OK_PREFIX);

  // Fixture / preview path emits NEITHER.
  const fixtureLines = await captureInfo(async () => {
    await getBoardData(new FixtureBoardRepository());
  });
  assert.equal(fixtureLines.filter((l) => l.startsWith(BOARD_SUPPRESSED_PREFIX) || l.startsWith(BOARD_SERVE_OK_PREFIX)).length, 0);
});

// -------------------- 4. STATUS-INDEPENDENCE OF THE METRIC (pgs-absence only) --------------------

test('the ingestion-lag probe query is pgs-absence only — never game status or newest-final', () => {
  const { text, values } = buildIngestionLagQuery('2026-07-31T00:00:00.000Z');
  // The unresolved test is: past tip AND NOT EXISTS a player_game_stats row.
  assert.ok(/player_game_stats/.test(text));
  assert.ok(/NOT EXISTS/i.test(text));
  assert.ok(/scheduled_start_utc\s*<\s*\$1/.test(text));
  // It NEVER references game status or a newest-FINAL game.
  assert.ok(!/\bstatus\b/i.test(text), 'metric must not reference game status');
  assert.ok(!/'final'/i.test(text) && !/'scheduled'/i.test(text), 'metric must not reference any status literal');
  // Grace (48h) and suppress (96h) seconds are BOUND parameters from the ops
  // constants — SQL counts and the pure decision share one source of truth.
  assert.deepEqual(values, ['2026-07-31T00:00:00.000Z', INGESTION_LAG_GRACE_SECONDS, INGESTION_LAG_SUPPRESS_SECONDS]);
  assert.equal(INGESTION_LAG_GRACE_SECONDS, 172800);
  assert.equal(INGESTION_LAG_SUPPRESS_SECONDS, 345600);
});

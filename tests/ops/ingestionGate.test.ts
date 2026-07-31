// V1-OP-4 — PURE ingestion-gate decision + log-format unit tests.
//
// No database, no server-only, no clock. The decision is a PURE function of
// (metric, serve_now, constants); `serve_now` is injected, so boundary
// behaviour is exercised deterministically at exact seconds without waiting.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

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
} from '../../src/ops/constants.js';

const SERVE_NOW = '2026-07-31T12:00:00.000Z';
const SERVE_NOW_MS = Date.parse(SERVE_NOW);

/** A postgres-source metric whose oldest unresolved tip is exactly
 *  `secondsAgo` before the injected serve_now. */
function pgMetric(over: {
  secondsAgo: number | null;
  grace?: number;
  fire?: number;
  newestSecondsAgo?: number;
}): IngestionLagMetric {
  return {
    source_kind: 'postgres',
    unresolved_past_grace_48h: over.grace ?? 0,
    unresolved_past_fire_96h: over.fire ?? 0,
    oldest_unresolved_tip:
      over.secondsAgo === null ? null : new Date(SERVE_NOW_MS - over.secondsAgo * 1000).toISOString(),
    newest_ingested_game:
      over.newestSecondsAgo === undefined ? null : new Date(SERVE_NOW_MS - over.newestSecondsAgo * 1000).toISOString(),
  };
}

describe('ops constants — ingestion gate parameters', () => {
  it('grace = 48h and suppress = 96h, ORTHOGONAL to D-A1 (3600s)', () => {
    assert.equal(INGESTION_LAG_GRACE_SECONDS, 172800);   // 48h
    assert.equal(INGESTION_LAG_SUPPRESS_SECONDS, 345600); // 96h
    assert.ok(INGESTION_LAG_GRACE_SECONDS < INGESTION_LAG_SUPPRESS_SECONDS);
  });
});

describe('decideIngestionCurrency — the pure serving decision', () => {
  // ---- 3(a) BOUNDARY: 96h, NOT the 48h grace. Test both sides. ----
  it('boundary: oldest tip just past 96h suppresses; exactly 96h and just under serve', () => {
    const justPast = decideIngestionCurrency(pgMetric({ secondsAgo: INGESTION_LAG_SUPPRESS_SECONDS + 1, grace: 1, fire: 1 }), SERVE_NOW);
    assert.equal(justPast.ingestion_behind, true);

    const exactly = decideIngestionCurrency(pgMetric({ secondsAgo: INGESTION_LAG_SUPPRESS_SECONDS, grace: 1, fire: 0 }), SERVE_NOW);
    assert.equal(exactly.ingestion_behind, false); // strict `>`: exactly 96h still serves

    const justUnder = decideIngestionCurrency(pgMetric({ secondsAgo: INGESTION_LAG_SUPPRESS_SECONDS - 1, grace: 1, fire: 0 }), SERVE_NOW);
    assert.equal(justUnder.ingestion_behind, false);
  });

  // ---- 3(b) ANOMALY TOLERANCE: a lone 48-96h straggler still serves ----
  it('anomaly tolerance: one unresolved at ~72h (grace>=1, fire=0) does NOT suppress', () => {
    const metric = pgMetric({ secondsAgo: 72 * 3600, grace: 1, fire: 0 });
    assert.ok(metric.unresolved_past_grace_48h >= 1);
    assert.equal(metric.unresolved_past_fire_96h, 0);
    assert.equal(decideIngestionCurrency(metric, SERVE_NOW).ingestion_behind, false);
  });

  // ---- 3(c) STOPPAGE ----
  it('stoppage: oldest tip advanced past 96h suppresses', () => {
    assert.equal(decideIngestionCurrency(pgMetric({ secondsAgo: 19 * 24 * 3600, grace: 36, fire: 31 }), SERVE_NOW).ingestion_behind, true);
  });

  it('no unresolved past-tip game -> not behind', () => {
    assert.equal(decideIngestionCurrency(pgMetric({ secondsAgo: null }), SERVE_NOW).ingestion_behind, false);
  });

  // ---- 7 FIXTURE EXEMPTION at the decision layer ----
  it('fixture source is EXEMPT: never behind, flagged exempt', () => {
    const d = decideIngestionCurrency(FIXTURE_INGESTION_METRIC, SERVE_NOW);
    assert.deepEqual(d, { ingestion_behind: false, exempt: true });
    // Even a fabricated behind-looking fixture metric cannot suppress.
    const forced: IngestionLagMetric = { ...pgMetric({ secondsAgo: 19 * 24 * 3600, grace: 36, fire: 31 }), source_kind: 'fixture' };
    assert.equal(decideIngestionCurrency(forced, SERVE_NOW).ingestion_behind, false);
    assert.equal(decideIngestionCurrency(forced, SERVE_NOW).exempt, true);
  });

  it('data-integrity: an unparseable oldest tip on a LIVE source fails safe (suppress)', () => {
    const bad: IngestionLagMetric = { source_kind: 'postgres', unresolved_past_grace_48h: 1, unresolved_past_fire_96h: 1, oldest_unresolved_tip: 'not-a-date', newest_ingested_game: null };
    assert.equal(decideIngestionCurrency(bad, SERVE_NOW).ingestion_behind, true);
  });

  // ---- 5 serve_now DISCIPLINE: pure, no clock read ----
  it('serve_now discipline: pure function — deterministic, and advancing serve_now flips the boundary', () => {
    const metric = pgMetric({ secondsAgo: INGESTION_LAG_SUPPRESS_SECONDS - 10, grace: 1, fire: 0 });
    // Deterministic: same inputs -> same output, no matter the real wall clock.
    assert.deepEqual(decideIngestionCurrency(metric, SERVE_NOW), decideIngestionCurrency(metric, SERVE_NOW));
    // Under this serve_now the tip is 10s under 96h -> serves.
    assert.equal(decideIngestionCurrency(metric, SERVE_NOW).ingestion_behind, false);
    // Advance serve_now by 20s: the SAME metric is now 10s past 96h -> suppresses.
    const later = new Date(SERVE_NOW_MS + 20_000).toISOString();
    assert.equal(decideIngestionCurrency(metric, later).ingestion_behind, true);
  });
});

describe('buildIngestionServeLogLine — the serve-time instrument', () => {
  // ---- 8 THREE-NUMBER SHAPE ON BOTH PATHS, DISTINCT PREFIXES ----
  it('suppress path: BOARD_SUPPRESSED prefix + three-number shape', () => {
    const metric = pgMetric({ secondsAgo: 19 * 24 * 3600, grace: 36, fire: 31, newestSecondsAgo: 19 * 24 * 3600 });
    const line = buildIngestionServeLogLine(metric, true);
    assert.ok(line.startsWith(BOARD_SUPPRESSED_PREFIX + ' ingestion_behind:'));
    assert.ok(line.includes('unresolved_past_grace_48h=36'));
    assert.ok(line.includes('unresolved_past_fire_96h=31'));
    assert.ok(/oldest_unresolved_tip=\d{4}-\d{2}-\d{2}/.test(line));
    assert.ok(/newest_ingested_game=\d{4}-\d{2}-\d{2}/.test(line));
  });

  it('pass path: DISTINCT BOARD_SERVE_OK prefix + the same three-number shape', () => {
    const metric = pgMetric({ secondsAgo: 72 * 3600, grace: 1, fire: 0 });
    const line = buildIngestionServeLogLine(metric, false);
    assert.ok(line.startsWith(BOARD_SERVE_OK_PREFIX + ' ingestion_ok:'));
    assert.ok(line.includes('unresolved_past_grace_48h=1'));
    assert.ok(line.includes('unresolved_past_fire_96h=0'));
    assert.notEqual(BOARD_SUPPRESSED_PREFIX, BOARD_SERVE_OK_PREFIX); // grep separately
  });

  it('null timestamps render as `none` (no crash, still greppable)', () => {
    const line = buildIngestionServeLogLine(pgMetric({ secondsAgo: null }), false);
    assert.ok(line.includes('oldest_unresolved_tip=none'));
    assert.ok(line.includes('newest_ingested_game=none'));
  });
});

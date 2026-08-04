// GAP-38 — historical persist must record quota reconciliation to the
// `oddsapi_ingestion_runs` ledger, so every paid call is reconstructable from
// the DB rather than from a session transcript.
//
// Zero cost: no provider call, no live quota read. The INSERT is exercised
// against a fake `Tx` that captures the SQL + bound parameters.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { persistHistoricalSnapshot, type PersistHistoricalSnapshotInput } from '../../src/seed/orchestrator/persistHistoricalSnapshot.js';
import { reconcileQuota } from '../../src/odds/quotaForecast.js';
import type { SliplabzPool } from '../../src/db/connection.js';

/** Captures every statement + params; returns shapes the persist expects. */
function capturingPool() {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const query = async (sql: string, params: unknown[] = []) => {
    calls.push({ sql, params });
    return { rows: [], rowCount: 1 };
  };
  const client = {
    query,
    release: () => {},
  };
  const pool = {
    raw: {} as never,
    query: query as never,
    connect: async () => client as never,
    end: async () => {},
  } as unknown as SliplabzPool;
  return { pool, calls };
}

function baseInput(over: Partial<PersistHistoricalSnapshotInput> = {}): PersistHistoricalSnapshotInput {
  return {
    seed_run_id: '11111111-1111-1111-1111-111111111111',
    provider_event_id: 'evt-1',
    linked_internal_game_id: '22222222-2222-2222-2222-222222222222',
    linked_internal_player_ids_by_normalized_name: new Map(),
    market_key: 'player_points',
    bookmaker_key: 'draftkings',
    bookmaker_title: 'DraftKings',
    requested_close_boundary_utc: '2026-07-17T23:45:00Z',
    provider_snapshot_time: '2026-07-17T23:40:37Z',
    retrieved_at: '2026-08-03T00:00:00Z',
    close_capture: { close_capture_state: 'eligible' } as never,
    redacted_request_url: 'https://api.the-odds-api.com/x?apiKey=REDACTED',
    request_params: { date: '2026-07-17T23:45:00Z' },
    response_headers: {},
    raw_response_body: null,
    raw_response_body_text: null,
    candidates: [],
    ...over,
  };
}

/** The ingestion-run INSERT is the first statement inside the transaction. */
function runInsert(calls: Array<{ sql: string; params: unknown[] }>) {
  const c = calls.find((x) => x.sql.includes('INSERT INTO oddsapi_ingestion_runs'));
  assert.ok(c !== undefined, 'ingestion-run INSERT issued');
  return c;
}

describe('GAP-38 — quota reconciliation reaches the ledger', () => {
  it('TEST 1 (positive population): the four columns are actually written, not left null', async () => {
    const { pool, calls } = capturingPool();
    const rq = reconcileQuota({ forecast: 40, observed_x_requests_last: 40 });
    await persistHistoricalSnapshot(pool, baseInput({
      quota_reconciliation: {
        forecast: rq.forecast,
        observed: rq.observed,
        delta_flag: rq.delta_flag,
        x_requests_last: 40,
        x_requests_remaining: 99347,
        x_requests_used: 653,
      },
    }));

    const ins = runInsert(calls);
    // columns present in the INSERT (GAP-40 widened this to six)
    for (const col of ['quota_forecast', 'quota_observed', 'quota_delta_flag', 'x_requests_last', 'x_requests_remaining', 'x_requests_used']) {
      assert.ok(ins.sql.includes(col), `${col} in the INSERT column list`);
    }
    // and BOUND with the real values — this is the anti-silent-no-op guard
    const tail = ins.params.slice(-6);
    assert.deepEqual(tail, [40, 40, 'exact_match', 40, 99347, 653], `bound params were ${JSON.stringify(tail)}`);
    assert.ok(tail.every((v) => v !== null && v !== undefined), 'no column silently left null when reconciliation is supplied');
  });

  it('TEST 2 (delta-flag semantics): exact_match and divergence are both pinned', async () => {
    const cases: Array<[number, number | null, string]> = [
      [40, 40, 'exact_match'],
      [40, 10, 'observed_lower_than_forecast'],
      [40, 400, 'observed_higher_than_forecast'],
      [40, null, 'observed_missing'],
    ];
    for (const [forecast, observed, expected] of cases) {
      const rq = reconcileQuota({ forecast, observed_x_requests_last: observed });
      assert.equal(rq.delta_flag, expected, `reconcileQuota(${forecast},${observed})`);

      const { pool, calls } = capturingPool();
      await persistHistoricalSnapshot(pool, baseInput({
        quota_reconciliation: {
          forecast: rq.forecast,
          observed: rq.observed,
          delta_flag: rq.delta_flag,
          x_requests_last: observed,
          x_requests_remaining: 99347,
          x_requests_used: 653,
        },
      }));
      const p = runInsert(calls).params.slice(-6);
      assert.equal(p[2], expected, `ledger records ${expected} — a billing anomaly is greppable`);
      assert.equal(p[0], forecast);
      assert.equal(p[1], observed);
      assert.equal(p[3], observed);
      assert.equal(p[4], 99347, 'GAP-40: balance-curve column persisted');
      assert.equal(p[5], 653, 'GAP-40: cumulative-usage column persisted');
    }
  });

  it('TEST 3 (backward-compat): no reconciliation → four nulls, INSERT otherwise unchanged', async () => {
    const withRq = capturingPool();
    await persistHistoricalSnapshot(withRq.pool, baseInput({
      quota_reconciliation: { forecast: 40, observed: 40, delta_flag: 'exact_match', x_requests_last: 40, x_requests_remaining: 99347, x_requests_used: 653 },
    }));
    const withoutRq = capturingPool();
    await persistHistoricalSnapshot(withoutRq.pool, baseInput()); // seed-path shape

    const a = runInsert(withRq.calls);
    const b = runInsert(withoutRq.calls);

    // identical SQL — the statement does not branch on the optional input
    assert.equal(a.sql, b.sql, 'one INSERT statement for both callers');
    // the seed path leaves all SIX null (GAP-40 widened the set)
    assert.deepEqual(b.params.slice(-6), [null, null, null, null, null, null], 'seed path columns stay NULL');
    // every OTHER bound parameter is byte-identical between the two callers.
    // $1 is a per-call randomUUID (correctly non-deterministic) — assert its
    // SHAPE rather than equality, and compare everything after it exactly.
    const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
    assert.match(String(a.params[0]), UUID);
    assert.match(String(b.params[0]), UUID);
    assert.deepEqual(
      b.params.slice(1, -6),
      a.params.slice(1, -6),
      'all pre-existing parameters unchanged — seed path byte-identical',
    );
  });

  it('the INSERT touches no other table and does not change the transaction grain', async () => {
    const { pool, calls } = capturingPool();
    await persistHistoricalSnapshot(pool, baseInput());
    const tables = calls
      .map((c) => c.sql.match(/INSERT INTO (\w+)/)?.[1])
      .filter((t): t is string => t !== undefined);
    for (const t of tables) {
      assert.ok(
        ['oddsapi_ingestion_runs', 'oddsapi_raw_responses', 'market_snapshots', 'market_offerings', 'source_closing_quotes'].includes(t),
        `${t} is one of the persist's committed tables`,
      );
    }
    assert.ok(!calls.some((c) => /INSERT INTO (games|provider_games|players|evidence_profiles)\b/.test(c.sql)));
  });
});

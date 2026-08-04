// V1-OP-8b Gate (b) — Option A refactor + atomic per-game repair + batch runner.
// Zero network, zero database, zero credits.
//
// THE TWO HARDEST-INSPECTION EVIDENCE SETS:
//   A) SEED-PATH EQUIVALENCE — the seed `(pool,input)` API is exercised through
//      the new thin wrapper and asserted to emit byte-identical statements and
//      parameters vs the pre-refactor behavior (BEGIN + body + COMMIT).
//   B) TRANSACTION OWNERSHIP — a mid-sequence failure (after scq/before
//      canonical, and after canonical/before hlr) rolls the whole game back
//      with zero orphan quotes, and the DB client is never held across the fetch.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  persistHistoricalSnapshot,
  persistHistoricalSnapshotInTx,
  type PersistHistoricalSnapshotInput,
} from '../../src/seed/orchestrator/persistHistoricalSnapshot.js';
import { runHistoricalLineResultsBackfillInTx } from '../../src/lines/historicalLineResultsBackfill.js';
import {
  persistGameAtomically,
  runBoundedBatch,
  type AtomicGamePersistDeps,
  type BatchRunnerDeps,
  type ManifestEntry,
} from '../../src/lines/bulkHistoricalRepair.js';
import { withTransaction, type Tx } from '../../src/db/transaction.js';
import type { SliplabzPool } from '../../src/db/connection.js';
import type { TripleGroup } from '../../src/lines/scopedHistoricalRetrieval.js';

const REPAIR_SRC = readFileSync(new URL('../../src/lines/bulkHistoricalRepair.ts', import.meta.url), 'utf8');

/** Records every statement issued, in order, with its params. */
function recordingPool() {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const query = async (sql: string, params: unknown[] = []) => {
    calls.push({ sql, params });
    return { rows: [], rowCount: 1 };
  };
  const pool = {
    raw: {} as never,
    query: query as never,
    connect: async () => ({ query, release: () => {} }) as never,
    end: async () => {},
  } as unknown as SliplabzPool;
  return { pool, calls, tx: { query } as Tx };
}

function persistInput(): PersistHistoricalSnapshotInput {
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
    retrieved_at: '2026-08-04T00:00:00Z',
    close_capture: { close_capture_state: 'eligible' } as never,
    redacted_request_url: 'https://api.the-odds-api.com/x?apiKey=REDACTED',
    request_params: { date: '2026-07-17T23:45:00Z' },
    response_headers: {},
    raw_response_body: null,
    raw_response_body_text: null,
    candidates: [],
  };
}

/** Strip per-call randomUUIDs so two runs are comparable. */
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;
const norm = (v: unknown) => (typeof v === 'string' ? v.replace(UUID_RE, '<uuid>') : v);

describe('V1-OP-8b (A) SEED-PATH EQUIVALENCE — exercised, not asserted from shape', () => {
  it('the seed (pool,input) API still emits BEGIN + identical body + COMMIT', async () => {
    const seed = recordingPool();
    await persistHistoricalSnapshot(seed.pool, persistInput());

    // The wrapper must own exactly one transaction, in the right order.
    assert.equal(seed.calls[0]!.sql, 'BEGIN', 'wrapper opens the transaction first');
    assert.equal(seed.calls[seed.calls.length - 1]!.sql, 'COMMIT', 'and commits last');

    // The body between BEGIN and COMMIT must be byte-identical to the InTx form.
    const direct = recordingPool();
    await persistHistoricalSnapshotInTx(direct.tx, persistInput());

    const seedBody = seed.calls.slice(1, -1);
    assert.equal(seedBody.length, direct.calls.length, 'same statement count');
    for (let i = 0; i < seedBody.length; i += 1) {
      assert.equal(seedBody[i]!.sql, direct.calls[i]!.sql, `statement ${i} identical`);
      assert.deepEqual(
        seedBody[i]!.params.map(norm),
        direct.calls[i]!.params.map(norm),
        `statement ${i} parameters identical`,
      );
    }
  });

  it('the seed path writes exactly its five committed tables, in order', async () => {
    const seed = recordingPool();
    await persistHistoricalSnapshot(seed.pool, persistInput());
    const tables = seed.calls
      .map((c) => c.sql.match(/INSERT INTO (\w+)/)?.[1])
      .filter((t): t is string => t !== undefined);
    assert.deepEqual(tables.slice(0, 3), [
      'oddsapi_ingestion_runs',
      'oddsapi_raw_responses',
      'market_snapshots',
    ], 'lineage order unchanged');
    for (const t of tables) {
      assert.ok(
        ['oddsapi_ingestion_runs', 'oddsapi_raw_responses', 'market_snapshots', 'market_offerings', 'source_closing_quotes'].includes(t),
        `${t} is a committed persist table`,
      );
    }
  });

  it('a failure inside the seed wrapper still ROLLBACKs (independent callers unchanged)', async () => {
    const calls: string[] = [];
    const query = async (sql: string) => {
      calls.push(sql);
      if (sql.includes('INSERT INTO oddsapi_raw_responses')) throw new Error('boom');
      return { rows: [], rowCount: 1 };
    };
    const pool = {
      raw: {} as never, query: query as never,
      connect: async () => ({ query, release: () => {} }) as never, end: async () => {},
    } as unknown as SliplabzPool;
    await assert.rejects(() => persistHistoricalSnapshot(pool, persistInput()), /boom/);
    assert.equal(calls[0], 'BEGIN');
    assert.ok(calls.includes('ROLLBACK'), 'the wrapper rolled its own transaction back');
    assert.ok(!calls.includes('COMMIT'));
  });

  it('the hlr InTx form issues NO BEGIN/COMMIT of its own (caller owns the tx)', async () => {
    const calls: string[] = [];
    const tx: Tx = {
      query: async (sql: string) => {
        calls.push(sql);
        return { rows: [], rowCount: 0 }; // empty batch → loop exits immediately
      },
    };
    await runHistoricalLineResultsBackfillInTx(tx, { restrict_to_internal_game_ids: ['g1'] });
    assert.ok(!calls.some((s) => s === 'BEGIN'), 'no BEGIN');
    assert.ok(!calls.some((s) => s === 'COMMIT'), 'no COMMIT');
    assert.ok(!calls.some((s) => s === 'ROLLBACK'), 'no ROLLBACK');
    // ...and it still applies the game restriction + untouched eligibility SQL
    assert.ok(calls.some((s) => /internal_game_id = ANY/.test(s)), 'game-scoped');
    assert.ok(calls.some((s) => /ccp\.canonical_closing_point IS NOT NULL/.test(s)), 'eligibility SQL unchanged');
  });
});

describe('V1-OP-8b (B) TRANSACTION OWNERSHIP — atomic rollback + fetch ordering', () => {
  const TRIPLES = [
    { market_key: 'player_points', bookmaker_key: 'draftkings', candidates: [{} as never] },
    { market_key: 'player_points', bookmaker_key: 'fanduel', candidates: [{} as never] },
  ] as unknown as TripleGroup[];

  /** A real transaction wrapper over a recording fake, so rollback is observable. */
  function txDeps(fail: 'after_scq' | 'after_canonical' | null) {
    const stmts: string[] = [];
    const committed = { scq: 0, canonical: 0, hlr: 0 };
    const staged = { scq: 0, canonical: 0, hlr: 0 };
    const query = async (sql: string) => {
      stmts.push(sql);
      if (sql === 'COMMIT') { committed.scq = staged.scq; committed.canonical = staged.canonical; committed.hlr = staged.hlr; }
      if (sql === 'ROLLBACK') { staged.scq = 0; staged.canonical = 0; staged.hlr = 0; }
      return { rows: [], rowCount: 1 };
    };
    const pool = {
      raw: {} as never, query: query as never,
      connect: async () => ({ query, release: () => {} }) as never, end: async () => {},
    } as unknown as SliplabzPool;
    const deps: AtomicGamePersistDeps = {
      runInGameTransaction: (body) => withTransaction(pool, body),
      persistTripleInTx: async (tx) => { await tx.query('INSERT INTO source_closing_quotes …'); staged.scq += 1; return { source_closing_quote_ids: ['q'] }; },
      canonicalInTx: async (tx) => {
        if (fail === 'after_scq') throw new Error('injected failure after scq / before canonical');
        await tx.query('INSERT INTO canonical_closing_points …'); staged.canonical += 1; return { inserted: 1 };
      },
      hlrInTx: async (tx) => {
        if (fail === 'after_canonical') throw new Error('injected failure after canonical / before hlr');
        await tx.query('INSERT INTO historical_line_results …'); staged.hlr += 1; return { rows_inserted: 1, rows_updated: 0 };
      },
    };
    return { deps, stmts, committed, staged };
  }

  it('happy path: ONE transaction wraps all three stages', async () => {
    const t = txDeps(null);
    const r = await persistGameAtomically(t.deps, 'game-1', TRIPLES);
    assert.equal(t.stmts.filter((s) => s === 'BEGIN').length, 1, 'exactly one transaction');
    assert.equal(t.stmts.filter((s) => s === 'COMMIT').length, 1);
    assert.equal(r.source_closing_quotes, 2);
    assert.equal(r.canonical_closing_points, 1);
    assert.equal(r.historical_line_results, 1);
    // ordering: quotes → canonical → hlr, all inside the one tx
    const order = t.stmts.filter((s) => s === 'BEGIN' || s === 'COMMIT' || s.startsWith('INSERT'));
    assert.equal(order[0], 'BEGIN');
    assert.equal(order[order.length - 1], 'COMMIT');
  });

  it('failure AFTER scq / BEFORE canonical → full rollback, ZERO orphan quotes', async () => {
    const t = txDeps('after_scq');
    await assert.rejects(() => persistGameAtomically(t.deps, 'game-1', TRIPLES), /after scq/);
    assert.ok(t.stmts.includes('ROLLBACK'), 'rolled back');
    assert.ok(!t.stmts.includes('COMMIT'), 'never committed');
    assert.deepEqual(t.committed, { scq: 0, canonical: 0, hlr: 0 }, 'nothing committed');
    assert.equal(t.staged.scq, 0, 'NO ORPHAN source_closing_quotes survive');
  });

  it('failure AFTER canonical / BEFORE hlr → full rollback of scq AND canonical', async () => {
    const t = txDeps('after_canonical');
    await assert.rejects(() => persistGameAtomically(t.deps, 'game-1', TRIPLES), /after canonical/);
    assert.ok(t.stmts.includes('ROLLBACK'));
    assert.deepEqual(t.committed, { scq: 0, canonical: 0, hlr: 0 });
    assert.equal(t.staged.canonical, 0, 'canonical rolled back with the quotes');
  });

  it('ORDERING: the paid fetch returns BEFORE any transaction opens', async () => {
    const events: string[] = [];
    const deps: BatchRunnerDeps = {
      alreadyRepaired: async () => false,
      retrieveGame: async () => {
        events.push('fetch:start');
        await new Promise((r) => setTimeout(r, 1));
        events.push('fetch:end');
        return {
          close_capture_state: 'eligible', snapshot_age_seconds_before_boundary: 263,
          triples: TRIPLES, credits_forecast: 40, credits_observed: 40, x_requests_remaining: 99763,
        };
      },
      runInGameTransaction: async (body) => {
        events.push('tx:open');
        const r = await body({ query: async () => ({ rows: [], rowCount: 1 }) } as Tx);
        events.push('tx:commit');
        return r;
      },
      persistTripleInTx: async () => ({ source_closing_quote_ids: ['q'] }),
      canonicalInTx: async () => ({ inserted: 1 }),
      hlrInTx: async () => ({ rows_inserted: 1, rows_updated: 0 }),
    };
    await runBoundedBatch(deps, {
      manifest: [{ internal_game_id: 'g1', provider_event_id: 'e1' }],
      max_total_credits: 100, dry_run: false,
    });
    assert.deepEqual(events, ['fetch:start', 'fetch:end', 'tx:open', 'tx:commit'],
      'no DB client is held across provider latency');
    // and the module never performs provider I/O itself
    assert.ok(!/fetch\(|https?:\/\//.test(REPAIR_SRC.replace(/\/\/[^\n]*/g, '')), 'no HTTP in the repair module');
  });
});

describe('V1-OP-8b batch runner — bounding, ledger, spend attribution', () => {
  const base = (over: Partial<BatchRunnerDeps> = {}): BatchRunnerDeps => ({
    alreadyRepaired: async () => false,
    retrieveGame: async () => ({
      close_capture_state: 'eligible', snapshot_age_seconds_before_boundary: 263,
      triples: [{ market_key: 'player_points', bookmaker_key: 'draftkings', candidates: [{} as never] }] as unknown as TripleGroup[],
      credits_forecast: 40, credits_observed: 40, x_requests_remaining: 99763,
    }),
    runInGameTransaction: async (body) => body({ query: async () => ({ rows: [], rowCount: 1 }) } as Tx),
    persistTripleInTx: async () => ({ source_closing_quote_ids: ['q'] }),
    canonicalInTx: async () => ({ inserted: 1 }),
    hlrInTx: async () => ({ rows_inserted: 1, rows_updated: 0 }),
    ...over,
  });
  const m = (n: number): ManifestEntry[] =>
    Array.from({ length: n }, (_, i) => ({ internal_game_id: `g${i}`, provider_event_id: `e${i}` }));

  it('empty manifest is a HARD ERROR, never an implicit "all"', async () => {
    const r = await runBoundedBatch(base(), { manifest: [], max_total_credits: 100, dry_run: false });
    assert.match(r.halt_reason ?? '', /empty_manifest/);
    assert.equal(r.spend.calls_billed, 0);
    assert.equal(r.ledger.length, 0);
  });

  it('dry-run performs NO fetch and NO write', async () => {
    let fetched = 0;
    const r = await runBoundedBatch(base({ retrieveGame: async () => { fetched += 1; throw new Error('must not fetch'); } }),
      { manifest: m(3), max_total_credits: 200, dry_run: true });
    assert.equal(fetched, 0, 'no paid call on a dry-run');
    assert.equal(r.spend.credits_observed_total, 0);
    assert.ok(r.ledger.every((l) => l.outcome === 'skipped'));
  });

  it('halt-before-ceiling: stops BEFORE the call that would exceed', async () => {
    let fetched = 0;
    const r = await runBoundedBatch(base({ retrieveGame: async () => { fetched += 1; return {
      close_capture_state: 'eligible', snapshot_age_seconds_before_boundary: 1,
      triples: [], credits_forecast: 40, credits_observed: 40, x_requests_remaining: 1,
    }; } }), { manifest: m(5), max_total_credits: 100, dry_run: false });
    assert.equal(fetched, 2, 'two calls at 40 = 80; the third would exceed 100');
    assert.match(r.halt_reason ?? '', /ceiling/);
    assert.equal(r.spend.credits_observed_total, 80);
  });

  it('ledger records all four outcomes with grain counts + forecast vs observed', async () => {
    let i = 0;
    const r = await runBoundedBatch(base({
      alreadyRepaired: async (e) => e.internal_game_id === 'g0',
      retrieveGame: async () => {
        i += 1;
        if (i === 1) return { close_capture_state: 'close_capture_stale', snapshot_age_seconds_before_boundary: 5000, triples: [], credits_forecast: 40, credits_observed: 40, x_requests_remaining: 9 };
        if (i === 2) throw new Error('db exploded');
        return { close_capture_state: 'eligible', snapshot_age_seconds_before_boundary: 263,
          triples: [{ market_key: 'player_points', bookmaker_key: 'fanduel', candidates: [{} as never] }] as unknown as TripleGroup[],
          credits_forecast: 40, credits_observed: 40, x_requests_remaining: 8 };
      },
    }), { manifest: m(4), max_total_credits: 500, dry_run: false });

    const outcomes = r.ledger.map((l) => l.outcome);
    assert.deepEqual(outcomes, ['skipped', 'close_capture_stale', 'failed', 'eligible']);
    const stale = r.ledger[1]!;
    assert.equal(stale.credits_observed, 40, 'a stale call still bills');
    assert.equal(stale.grains.historical_line_results, 0, 'and writes nothing');
    const ok = r.ledger[3]!;
    assert.equal(ok.grains.source_closing_quotes, 1);
    assert.equal(ok.grains.historical_line_results, 1);
    assert.equal(ok.credits_forecast, 40);
  });

  it('spend is attributed to THIS batch, never a global balance delta', async () => {
    const r = await runBoundedBatch(base(), { manifest: m(3), max_total_credits: 500, dry_run: false });
    assert.equal(r.spend.calls_billed, 3);
    assert.equal(r.spend.credits_forecast_total, 120);
    assert.equal(r.spend.credits_observed_total, 120);
    assert.equal(r.spend.x_requests_remaining_last, 99763, 'a curve point, not a before/after subtraction');
    // the module never computes a balance difference
    assert.ok(!/balance_before|before\s*-\s*after|_before\b.*-.*_after\b/.test(REPAIR_SRC));
  });

  it('a failed game does not block the batch and is never auto-retried', async () => {
    let calls = 0;
    const r = await runBoundedBatch(base({
      retrieveGame: async (e) => {
        calls += 1;
        if (e.internal_game_id === 'g1') throw new Error('transient');
        return { close_capture_state: 'eligible', snapshot_age_seconds_before_boundary: 1, triples: [], credits_forecast: 40, credits_observed: 40, x_requests_remaining: 5 };
      },
    }), { manifest: m(3), max_total_credits: 500, dry_run: false });
    assert.equal(calls, 3, 'one call per game — no blind retry');
    assert.equal(r.ledger.filter((l) => l.outcome === 'failed').length, 1);
    assert.equal(r.ledger.filter((l) => l.outcome === 'eligible').length, 2, 'failure isolated');
  });
});

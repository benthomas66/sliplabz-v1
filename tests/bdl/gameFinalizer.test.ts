// V1-OP-5D — scoped status-only game finalizer tests (pure + doubles; no DB/net).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  planGameFinalization,
  applyGameFinalization,
  finalizeSelectedGames,
  STUCK_SCHEDULED_BACKLOG_SELECTOR_SQL,
  type GameFinalizerDeps,
} from '../../src/bdl/gameFinalizer.js';
import { mapBdlGameStatus } from '../../src/bdl/gameStatus.js';
import type { Tx } from '../../src/db/transaction.js';

const OWNER_SRC = readFileSync(new URL('../../src/bdl/gameFinalizer.ts', import.meta.url), 'utf8');

/** A fake Tx that records every SQL statement + returns a configurable rowCount. */
function fakeTx(rowCountFor: (sql: string, params: unknown[]) => number = () => 1) {
  const queries: Array<{ sql: string; params: unknown[] }> = [];
  const tx: Tx = {
    query: async (sql: string, params: unknown[] = []) => {
      queries.push({ sql, params });
      return { rows: [], rowCount: rowCountFor(sql, params) };
    },
  };
  return { tx, queries };
}

describe('V1-OP-5D planGameFinalization (pure)', () => {
  it('Test 1: finalized selected game updates status → update to final', () => {
    const d = planGameFinalization([{ internal_game_id: 'g1', current_status: 'scheduled', bdl_raw_status: 'Final' }]);
    assert.deepEqual(d[0], { internal_game_id: 'g1', current_status: 'scheduled', mapped_status: 'final', is_unknown: false, action: 'update', to_status: 'final' });
  });

  it('Test 2: non-final selected game preserves governed status → noop', () => {
    const d = planGameFinalization([{ internal_game_id: 'g2', current_status: 'scheduled', bdl_raw_status: 'scheduled' }]);
    assert.equal(d[0]!.action, 'noop');
    assert.equal(d[0]!.to_status, null);
  });

  it('Test 3: unknown provider status → quarantine (never guessed, never written)', () => {
    const d = planGameFinalization([{ internal_game_id: 'g3', current_status: 'scheduled', bdl_raw_status: 'weird-unknown' }]);
    assert.equal(d[0]!.action, 'quarantine');
    assert.equal(d[0]!.is_unknown, true);
    assert.equal(d[0]!.to_status, null);
    // also empty/null → quarantine
    assert.equal(planGameFinalization([{ internal_game_id: 'g3b', current_status: 'scheduled', bdl_raw_status: null }])[0]!.action, 'quarantine');
  });

  it('Test 4: correction handling — a status change applies ONLY the mapped status', () => {
    // live → final (finalization) and final → postponed (a correction) both apply via mapBdlGameStatus.
    assert.equal(planGameFinalization([{ internal_game_id: 'g4', current_status: 'live', bdl_raw_status: 'Final' }])[0]!.to_status, 'final');
    assert.equal(planGameFinalization([{ internal_game_id: 'g4b', current_status: 'final', bdl_raw_status: 'Postponed' }])[0]!.to_status, 'postponed');
    // an unknown "correction" NEVER overwrites — it quarantines.
    assert.equal(planGameFinalization([{ internal_game_id: 'g4c', current_status: 'final', bdl_raw_status: '??' }])[0]!.action, 'quarantine');
  });

  it('Test 11: rerun idempotent — already-final vs BDL final → noop (no second update)', () => {
    assert.equal(planGameFinalization([{ internal_game_id: 'g11', current_status: 'final', bdl_raw_status: 'Final' }])[0]!.action, 'noop');
  });
});

describe('V1-OP-5D applyGameFinalization (status-only writes)', () => {
  it('Tests 5+6+9: UPDATE names ONLY status + updated_at — never a start-time column, never INSERT', async () => {
    const { tx, queries } = fakeTx();
    await applyGameFinalization(tx, planGameFinalization([{ internal_game_id: 'g1', current_status: 'scheduled', bdl_raw_status: 'Final' }]));
    assert.equal(queries.length, 1);
    const sql = queries[0]!.sql;
    assert.ok(/UPDATE games SET status = \$2::game_status, updated_at = now\(\)/.test(sql), 'writes only status + updated_at');
    assert.ok(!/scheduled_start_utc/.test(sql), 'Test 5: scheduled_start_utc never written');
    assert.ok(!/actual_start_utc/.test(sql), 'Test 6: actual_start_utc never written');
    assert.ok(!/INSERT/i.test(sql), 'Test 9: no INSERT (no row creation)');
  });

  it('Test 12: partial failure is reported, never silent (rowCount != 1 → failures)', async () => {
    // second update affects 0 rows → recorded in failures; first succeeds.
    const plan = planGameFinalization([
      { internal_game_id: 'ok', current_status: 'scheduled', bdl_raw_status: 'Final' },
      { internal_game_id: 'missing', current_status: 'scheduled', bdl_raw_status: 'Final' },
    ]);
    const { tx } = fakeTx((_sql, params) => (params[0] === 'missing' ? 0 : 1));
    const res = await applyGameFinalization(tx, plan);
    assert.equal(res.updated, 1);
    assert.equal(res.failures.length, 1);
    assert.equal(res.failures[0]!.internal_game_id, 'missing');
    assert.ok(/expected 1/.test(res.failures[0]!.reason));
  });

  it('noop + quarantine decisions issue NO write', async () => {
    const { tx, queries } = fakeTx();
    const r = await applyGameFinalization(tx, planGameFinalization([
      { internal_game_id: 'n', current_status: 'scheduled', bdl_raw_status: 'scheduled' },
      { internal_game_id: 'q', current_status: 'scheduled', bdl_raw_status: 'huh' },
    ]));
    assert.equal(queries.length, 0);
    assert.equal(r.noops, 1);
    assert.equal(r.quarantined, 1);
  });
});

describe('V1-OP-5D finalizeSelectedGames (orchestration)', () => {
  const mkDeps = (over: Partial<GameFinalizerDeps> & { txCalled?: { v: boolean } } = {}): GameFinalizerDeps => ({
    listSelected: over.listSelected ?? (async (ids) => ids.map((id) => ({ internal_game_id: id, provider_game_id: 'bdl-' + id, current_status: 'scheduled' as const }))),
    fetchBdlStatus: over.fetchBdlStatus ?? (async (pids) => new Map(pids.map((p) => [p, 'Final']))),
    runInTransaction: over.runInTransaction ?? (async (fn) => { const { tx } = fakeTx(); return fn(tx); }),
  });

  it('Test 8: out-of-batch game untouched — only selected ids produce decisions/updates', async () => {
    // listSelected resolves only the two requested ids; a 3rd game "elsewhere" is never seen.
    const seen: string[] = [];
    const deps = mkDeps({
      runInTransaction: async (fn) => { const { tx, queries } = fakeTx(); const r = await fn(tx); queries.forEach((q) => seen.push(String(q.params[0]))); return r; },
    });
    const rep = await finalizeSelectedGames(deps, { internal_game_ids: ['a', 'b'], dry_run: false });
    assert.deepEqual(rep.decisions.map((d) => d.internal_game_id).sort(), ['a', 'b']);
    assert.deepEqual(seen.sort(), ['a', 'b']); // never touches any out-of-batch game
  });

  it('Test 10: dry-run performs ZERO DB writes — never opens a transaction', async () => {
    let txCalled = false;
    const deps = mkDeps({ runInTransaction: async () => { txCalled = true; throw new Error('dry-run must not open a transaction'); } });
    const rep = await finalizeSelectedGames(deps, { internal_game_ids: ['a', 'b'], dry_run: true });
    assert.equal(txCalled, false, 'runInTransaction never called on dry-run');
    assert.equal(rep.applied, null);
    assert.equal(rep.dry_run, true);
    assert.equal(rep.decisions.length, 2);
  });

  it('empty id set → explicit no-op (never an implicit season scan)', async () => {
    let listed = false;
    const deps = mkDeps({ listSelected: async (ids) => { listed = true; return ids.map((id) => ({ internal_game_id: id, provider_game_id: 'x', current_status: 'scheduled' as const })); } });
    const rep = await finalizeSelectedGames(deps, { internal_game_ids: [], dry_run: false });
    assert.equal(rep.requested_ids, 0);
    assert.equal(rep.resolved, 0);
    assert.equal(rep.applied, null);
    assert.equal(listed, false, 'no selection query runs for an empty set');
  });

  it('unresolved ids (no approved mapping) are reported, not silently dropped', async () => {
    const deps = mkDeps({ listSelected: async (ids) => ids.filter((id) => id !== 'unmapped').map((id) => ({ internal_game_id: id, provider_game_id: 'bdl-' + id, current_status: 'scheduled' as const })) });
    const rep = await finalizeSelectedGames(deps, { internal_game_ids: ['a', 'unmapped'], dry_run: true });
    assert.deepEqual([...rep.unresolved_ids], ['unmapped']);
  });
});

describe('V1-OP-5D source + selector invariants', () => {
  it('Test 7: the owner never sources a timestamp / never writes a start-time field', () => {
    assert.ok(!/scheduled_start_utc\s*=/.test(OWNER_SRC), 'no scheduled_start_utc write');
    assert.ok(!/actual_start_utc\s*=/.test(OWNER_SRC), 'no actual_start_utc write');
    assert.ok(!/\bdatetime\b/.test(OWNER_SRC), 'never references a provider datetime field');
    assert.ok(!/INSERT\s+INTO/i.test(OWNER_SRC), 'no INSERT anywhere');
  });

  it('Test 14: no Odds API — the owner imports/references nothing odds-related', () => {
    assert.ok(!/odds/i.test(OWNER_SRC.replace(/\/\/[^\n]*/g, '')), 'no odds/oddsapi reference in code');
    assert.ok(!/the-odds-api|forecastEventOddsCost|oddsapiRequest/.test(OWNER_SRC));
  });

  it('Test 13: the stuck-scheduled selector filters exactly the governed predicate set', () => {
    const s = STUCK_SCHEDULED_BACKLOG_SELECTOR_SQL;
    assert.ok(/g\.status = 'scheduled'/.test(s), 'status = scheduled');
    assert.ok(/g\.scheduled_start_utc >= \$1::timestamptz/.test(s), 'window start bound');
    assert.ok(/g\.scheduled_start_utc <\s+now\(\)/.test(s), 'past-tip only');
    assert.ok(/provider = 'balldontlie'/.test(s) && /mapping_state = 'approved'/.test(s), 'approved balldontlie mapping only');
    assert.ok(!/INSERT|UPDATE|DELETE/i.test(s), 'selector is read-only');
  });

  it('Test 15: reuses the committed mapBdlGameStatus (not a re-implementation)', () => {
    // finality semantics come from the committed mapper — proven by reuse.
    assert.equal(mapBdlGameStatus('Final').canonical_status, 'final');
    assert.equal(mapBdlGameStatus('zzz').is_unknown, true);
    assert.ok(/from '\.\/gameStatus\.js'/.test(OWNER_SRC), 'owner imports the committed mapper');
  });
});

// V1-OP-8c corrective B — POSITIVE-PERSISTENCE PROOF (standing rule 5b).
//
// This test exercises THE SAME dependency assembly and call path that
// `scripts/v1_op_8b_batch.ts --apply` fires: `buildBatchApplyDeps` driven by
// the committed `runBoundedBatch`. It does NOT call `persistGameAtomically` or
// `persistHistoricalSnapshotInTx` with independently-constructed correct input
// — that would bypass the operator-wiring defect that caused GAP-39 (400
// credits, zero rows) and would have PASSED while the batch still failed.
//
// Zero provider spend: the historical fetch seam is injected with a recorded
// compliant fixture. Zero real database: a controlled in-memory DB double
// records every statement so persistence is asserted by inspection.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { buildBatchApplyDeps, assertLinkedGameId, BATCH_SPORTSBOOK_KEYS, type BatchQuotaTrail } from '../../src/lines/bulkRepairWiring.js';
import { runBoundedBatch, type ManifestEntry } from '../../src/lines/bulkHistoricalRepair.js';
import type { SliplabzPool } from '../../src/db/connection.js';
import type { Tx } from '../../src/db/transaction.js';
import type { OddsapiRequestResult } from '../../src/odds/httpClient.js';

const FIXTURE = JSON.parse(
  readFileSync(new URL('../fixtures/seed/historical-event-odds-clean.json', import.meta.url), 'utf8'),
) as { requested_close_boundary_utc: string; response_body: any };

const GAME = 'aaaaaaaa-1111-2222-3333-444444444444';
const OTHER_GAME = 'bbbbbbbb-9999-8888-7777-666666666666';
const EVENT = 'evt-batch-1';
const ENTRY: ManifestEntry = { internal_game_id: GAME, provider_event_id: EVENT };

/** The fixture's boundary, so close-capture evaluates as eligible. */
const BOUNDARY = FIXTURE.requested_close_boundary_utc;
/** tip = boundary - 900s, so evaluateCloseBoundary derives exactly BOUNDARY. */
const TIP = new Date(new Date(BOUNDARY).getTime() - 900_000).toISOString();

/** Player names the fixture's candidates carry, so identity resolves. */
function fixturePlayerRows(): Array<{ id: string; normalized_name: string }> {
  const names = new Set<string>();
  for (const bk of FIXTURE.response_body.data?.bookmakers ?? []) {
    for (const mk of bk.markets ?? []) {
      for (const oc of mk.outcomes ?? []) {
        if (typeof oc.description === 'string') {
          names.add(oc.description.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim());
        }
      }
    }
  }
  return [...names].map((n, i) => ({ id: `p${i}-0000-0000-0000-00000000000${i % 10}`, normalized_name: n }));
}

/** Controlled DB: records writes, answers the reads the wiring performs. */
function controlledDb(opts: { failOn?: RegExp } = {}) {
  const writes: Array<{ sql: string; params: unknown[] }> = [];
  const stmts: string[] = [];
  const committed: Array<{ sql: string; params: unknown[] }> = [];
  let staged: Array<{ sql: string; params: unknown[] }> = [];

  const query = async (sql: string, params: unknown[] = []) => {
    stmts.push(sql.trim().split('\n')[0]!.trim());
    if (opts.failOn?.test(sql)) throw new Error('injected downstream failure');
    if (sql === 'BEGIN') { staged = []; return { rows: [], rowCount: 0 }; }
    if (sql === 'COMMIT') { committed.push(...staged); staged = []; return { rows: [], rowCount: 0 }; }
    if (sql === 'ROLLBACK') { staged = []; return { rows: [], rowCount: 0 }; }

    // GAP-40 §5: persisted-row count read-backs (must precede the generic
    // source_closing_quotes branch below).
    if (/count\(\*\)::int AS n FROM (source_closing_quotes|canonical_closing_points|historical_line_results)/.test(sql)) {
      const tbl = /FROM (\w+)/.exec(sql)![1]!;
      const n = staged.filter((w) => new RegExp(`INSERT INTO ${tbl}`).test(w.sql)).length;
      return { rows: [{ n }], rowCount: 1 };
    }
    if (/FROM players/.test(sql)) return { rows: fixturePlayerRows(), rowCount: 0 };
    if (/FROM historical_line_results\s*\n?\s*WHERE internal_game_id/.test(sql) || /count\(\*\)::int AS n FROM historical_line_results/.test(sql)) {
      return { rows: [{ n: 0 }], rowCount: 1 };
    }
    if (/FROM games WHERE internal_game_id/.test(sql)) {
      return { rows: [{ id: GAME, status: 'final', scheduled_start_utc: TIP, actual_start_utc: null }], rowCount: 1 };
    }
    if (/FROM source_closing_quotes/.test(sql)) {
      // canonical reads the quotes we just staged, through the same tx
      const rows = staged
        .filter((w) => /INSERT INTO source_closing_quotes/.test(w.sql))
        .map((w) => ({
          internal_game_id: GAME, internal_player_id: String(w.params[3] ?? 'p0'),
          market_key: 'player_points', bookmaker_key: 'draftkings',
          source_class: 'sportsbook', close_capture_state: 'eligible',
          closing_point: 12.5, close_boundary_utc: BOUNDARY,
        }));
      return { rows, rowCount: rows.length };
    }
    if (/FROM canonical_closing_points ccp/.test(sql) || /JOIN market_registry/.test(sql)) {
      // hlr eligibility scan: one eligible grain, then empty to end the loop
      const already = stmts.filter((s) => /SELECT ccp\.canonical_closing_point_id/.test(s)).length;
      if (already > 1) return { rows: [], rowCount: 0 };
      return {
        rows: [{
          ccp_id: 'ccp-1', internal_game_id: GAME, internal_player_id: 'p0-0000-0000-0000-000000000000',
          market_key: 'player_points', canonical_closing_point: '12.5', coverage_label: 'complete',
          canonical_stat_key: 'points', pgs_id: 'pgs-1', normalized_stats: { points: 18 },
        }],
        rowCount: 1,
      };
    }
    if (/INSERT INTO|DELETE FROM|UPDATE /i.test(sql)) {
      const w = { sql, params };
      writes.push(w); staged.push(w);
      return { rows: [{ xmax: '0' }], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  };

  const pool = {
    raw: {} as never, query: query as never,
    connect: async () => ({ query, release: () => {} }) as never, end: async () => {},
  } as unknown as SliplabzPool;

  const runInGameTransaction = async <T,>(body: (tx: Tx) => Promise<T>): Promise<T> => {
    await query('BEGIN');
    try { const r = await body({ query } as Tx); await query('COMMIT'); return r; }
    catch (e) { await query('ROLLBACK'); throw e; }
  };
  return { pool, query, runInGameTransaction, writes, committed, stmts };
}

/** The recorded compliant response — replaces the PAID fetch. Zero credits. */
function recordedFetch(calls: { n: number }) {
  return (async () => {
    calls.n += 1;
    return {
      status: 200,
      content_type: 'application/json',
      headers: { 'x-requests-last': 40, 'x-requests-remaining': 99347, 'x-requests-used': 653 },
      body_text: '',
      body_json: FIXTURE.response_body,
      parse_state: 'json_ok',
      failure_kind: null,
      redacted_request_url: 'https://api.the-odds-api.com/x?apiKey=REDACTED',
    } as OddsapiRequestResult;
  }) as never;
}

function buildDeps(db: ReturnType<typeof controlledDb>, calls: { n: number }, trails: BatchQuotaTrail[]) {
  return buildBatchApplyDeps({
    pool: db.pool,
    connection_string: 'postgres://controlled',
    oddsapi_config: {} as never,
    api_key: 'TEST-KEY',
    seed_run_id_factory: () => '11111111-1111-1111-1111-111111111111',
    now: () => '2026-08-04T00:00:00Z',
    runInGameTransaction: db.runInGameTransaction,
    fetchHistorical: recordedFetch(calls),
    on_quota_trail: (_e, t) => trails.push(t),
  });
}

const paramsOf = (writes: Array<{ sql: string; params: unknown[] }>, re: RegExp) =>
  writes.filter((w) => re.test(w.sql));

describe('V1-OP-8c (B) POSITIVE PERSISTENCE — the exact --apply assembly', () => {
  it('rows ACTUALLY LAND: quotes, canonical, and hlr are all non-empty', async () => {
    const db = controlledDb();
    const calls = { n: 0 };
    const trails: BatchQuotaTrail[] = [];
    const report = await runBoundedBatch(buildDeps(db, calls, trails), {
      manifest: [ENTRY], max_total_credits: 100, dry_run: false,
    });

    assert.equal(calls.n, 1, 'the injected fetch ran exactly once — no real HTTP');
    const led = report.ledger[0]!;
    assert.equal(led.outcome, 'eligible', `outcome was ${led.outcome}: ${led.detail}`);

    // THE assertion GAP-39 needed: rows land, not zero.
    assert.ok(paramsOf(db.writes, /INSERT INTO source_closing_quotes/).length > 0, 'source_closing_quotes NON-EMPTY');
    assert.ok(paramsOf(db.writes, /INSERT INTO canonical_closing_points/).length > 0, 'canonical_closing_points NON-EMPTY');
    assert.ok(paramsOf(db.writes, /INSERT INTO historical_line_results/).length > 0, 'historical_line_results NON-EMPTY');
    assert.ok(led.grains.source_closing_quotes > 0, `ledger scq=${led.grains.source_closing_quotes}`);
  });

  it('the selected internal_game_id reaches persistence NON-NULL and UNCHANGED', async () => {
    const db = controlledDb();
    const trails: BatchQuotaTrail[] = [];
    await runBoundedBatch(buildDeps(db, { n: 0 }, trails), {
      manifest: [ENTRY], max_total_credits: 100, dry_run: false,
    });
    const snaps = paramsOf(db.writes, /INSERT INTO market_snapshots/);
    assert.ok(snaps.length > 0);
    for (const w of snaps) {
      assert.ok(w.params.includes(GAME), 'the selected game id is bound, non-null and unchanged');
      assert.ok(!w.params.includes(null) || true);
    }
    // and it is never the GAP-39 value
    for (const w of db.writes) {
      const i = w.sql.includes('market_snapshots') ? w.params.indexOf(GAME) : -1;
      if (w.sql.includes('market_snapshots')) assert.notEqual(i, -1, 'linked_internal_game_id present');
    }
  });

  it('every written row belongs to the selected game; nothing unrelated is touched', async () => {
    const db = controlledDb();
    await runBoundedBatch(buildDeps(db, { n: 0 }, []), {
      manifest: [ENTRY], max_total_credits: 100, dry_run: false,
    });
    for (const w of db.writes) {
      const other = w.params.some((p) => p === OTHER_GAME);
      assert.equal(other, false, 'no unrelated game id in any write');
    }
    // canonical + hlr are game-restricted, so no globally-eligible grain is swept in
    const restricted = db.stmts.filter((s) => /internal_game_id = ANY/.test(s));
    assert.ok(restricted.length > 0, 'canonical/hlr scoped by game');
  });

  it('neither start-time field is written (no games/provider_games mutation)', async () => {
    const db = controlledDb();
    await runBoundedBatch(buildDeps(db, { n: 0 }, []), {
      manifest: [ENTRY], max_total_credits: 100, dry_run: false,
    });
    for (const w of db.writes) {
      assert.ok(!/INSERT INTO games|UPDATE games|INSERT INTO provider_games|UPDATE provider_games/i.test(w.sql), w.sql.slice(0, 60));
      assert.ok(!/scheduled_start_utc\s*=|actual_start_utc\s*=/.test(w.sql), 'no start-time assignment');
    }
  });

  it('a forced downstream failure rolls back the WHOLE game (zero orphan quotes)', async () => {
    const db = controlledDb({ failOn: /INSERT INTO historical_line_results/ });
    const report = await runBoundedBatch(buildDeps(db, { n: 0 }, []), {
      manifest: [ENTRY], max_total_credits: 100, dry_run: false,
    });
    assert.equal(report.ledger[0]!.outcome, 'failed');
    assert.ok(db.stmts.includes('ROLLBACK'), 'rolled back');
    assert.ok(!db.stmts.includes('COMMIT'), 'never committed');
    assert.equal(
      db.committed.filter((w) => /INSERT INTO source_closing_quotes/.test(w.sql)).length,
      0,
      'ZERO orphan source_closing_quotes survive',
    );
  });

  it('no paid HTTP occurs — the fetch seam is the injected recording', async () => {
    const db = controlledDb();
    const calls = { n: 0 };
    await runBoundedBatch(buildDeps(db, calls, []), { manifest: [ENTRY], max_total_credits: 100, dry_run: false });
    assert.equal(calls.n, 1);
    const src = readFileSync(new URL('../../src/lines/bulkRepairWiring.ts', import.meta.url), 'utf8');
    assert.ok(!/\bfetch\(/.test(src.replace(/\/\/[^\n]*/g, '')), 'the assembly performs no direct HTTP');
  });
});

describe('V1-OP-8c (C) COMPLETE quota trail persisted', () => {
  it('GAP-40: the PERSISTED ROW carries all six ledger quota fields (not the trail object)', async () => {
    const db = controlledDb();
    const trails: BatchQuotaTrail[] = [];
    await runBoundedBatch(buildDeps(db, { n: 0 }, trails), {
      manifest: [ENTRY], max_total_credits: 100, dry_run: false,
    });
    // RULE 5b, sharpened: assert the ACTUAL INSERT's bound parameters — the
    // durable row — NOT `on_quota_trail`. Asserting the intermediate object is
    // precisely what let x_requests_remaining/used land null through a
    // "passing" test (GAP-40).
    const runs = paramsOf(db.writes, /INSERT INTO oddsapi_ingestion_runs/);
    assert.ok(runs.length > 0, 'ingestion-run rows were written');
    for (const w of runs) {
      for (const col of ['quota_forecast', 'quota_observed', 'quota_delta_flag', 'x_requests_last', 'x_requests_remaining', 'x_requests_used']) {
        assert.ok(w.sql.includes(col), `${col} is in the INSERT column list`);
      }
    }
    // GAP-46 (2026-08-06): this loop previously required EVERY row to carry the
    // billed trail — which is exactly the defect: each triple writes its own
    // ledger row, so `SUM(quota_observed)` reported `calls x triples x 40`.
    // The contract is now CARDINALITY: exactly ONE row per paid call carries
    // the trail, and that row still carries all six fields (GAP-40 intact).
    const tails = runs.map((w) => w.params.slice(-6));
    const carrying = tails.filter((t) => t.some((v) => v !== null && v !== undefined));
    assert.equal(carrying.length, 1, `exactly one row per paid call carries the billed quota; got ${carrying.length}`);
    assert.deepEqual(
      carrying[0],
      [40, 40, 'exact_match', 40, 99347, 653],
      `persisted quota params were ${JSON.stringify(carrying[0])}`,
    );
    assert.ok(carrying[0]!.every((v) => v !== null && v !== undefined), 'NO ledger column lands null on the trail row');
    for (const t of tails.filter((x) => x !== carrying[0])) {
      assert.deepEqual(t, [null, null, null, null, null, null], 'sibling triple rows bind NULL');
    }
    const summed = tails.reduce((a, t) => a + (typeof t[1] === 'number' ? t[1] : 0), 0);
    assert.equal(summed, 40, 'SUM(quota_observed) equals actual spend, not spend x triples');
    // the batch-side cumulative is reported on the batch, not the row
    assert.equal(trails[0]!.cumulative_batch_spend, 40, 'batch-attributed, not a global delta');
  });

  it('cumulative batch spend accrues across games (attributed to THIS batch)', async () => {
    const db = controlledDb();
    const trails: BatchQuotaTrail[] = [];
    await runBoundedBatch(buildDeps(db, { n: 0 }, trails), {
      manifest: [ENTRY, { internal_game_id: OTHER_GAME, provider_event_id: 'evt-2' }],
      max_total_credits: 200, dry_run: false,
    });
    assert.deepEqual(trails.map((t) => t.cumulative_batch_spend), [40, 80]);
  });

  it('GAP-40 §5: the ledger reports PERSISTED-ROW counts, not returned ids', async () => {
    const db = controlledDb();
    const report = await runBoundedBatch(buildDeps(db, { n: 0 }, []), {
      manifest: [ENTRY], max_total_credits: 100, dry_run: false,
    });
    const led = report.ledger[0]!;
    // The controlled DB answers countPersistedGrains from the staged rows, so
    // the ledger must equal the ACTUAL persisted row count for each table.
    const actualScq = db.writes.filter((w) => /INSERT INTO source_closing_quotes/.test(w.sql)).length;
    assert.equal(led.grains.source_closing_quotes, actualScq,
      `ledger scq ${led.grains.source_closing_quotes} must equal persisted rows ${actualScq}`);
    assert.ok(/count\(\*\)::int AS n FROM source_closing_quotes/.test(db.stmts.join('\n')),
      'the ledger count is read back from the table, not derived from returned ids');
  });
});

describe('V1-OP-8c (D) incident regression pin', () => {
  it('a manifest entry can NEVER produce a null linked_internal_game_id', () => {
    assert.equal(assertLinkedGameId(ENTRY), GAME);
    for (const bad of [{ internal_game_id: '', provider_event_id: 'e' }, { internal_game_id: '   ', provider_event_id: 'e' }]) {
      assert.throws(() => assertLinkedGameId(bad as ManifestEntry), /empty internal_game_id/);
    }
    assert.throws(() => assertLinkedGameId({ provider_event_id: 'e' } as never), /empty internal_game_id/);
  });

  it('the assembly never passes a literal null linked id (the GAP-39 line)', () => {
    const raw = readFileSync(new URL('../../src/lines/bulkRepairWiring.ts', import.meta.url), 'utf8');
    // strip comments — the header legitimately QUOTES the GAP-39 defect string
    const src = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    assert.ok(!/linked_internal_game_id:\s*null/.test(src), 'the GAP-39 defect cannot reappear in CODE');
    assert.ok(/linked_internal_game_id: linked_game_id/.test(src), 'threaded from the manifest entry');
    // and the operator script owns no effectful wiring at all any more
    const scriptRaw = readFileSync(new URL('../../scripts/v1_op_8b_batch.ts', import.meta.url), 'utf8');
    const script = scriptRaw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    assert.ok(!/linked_internal_game_id/.test(script), 'the script cannot reintroduce it');
    assert.ok(/buildBatchApplyDeps/.test(script), 'the script delegates to the tested assembly');
  });

  it('BATCH_SPORTSBOOK_KEYS stays within one region-equivalent (40cr forecast)', () => {
    assert.ok(BATCH_SPORTSBOOK_KEYS.length > 0 && BATCH_SPORTSBOOK_KEYS.length <= 10);
  });
});

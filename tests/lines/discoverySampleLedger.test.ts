// V1-OP-8b §0.4 — discovery ledger writer + operator-entry gating.
//
// Rule 5b (sharpened) applied: the positive-persistence tests drive the REAL
// `runDiscoverySample` → `recordDiscoveryLedgerInTx` wiring and assert on the
// PERSISTED ROW's bound parameters — not on the intermediate trail object.
// That is exactly the assertion GAP-40 was missing, where the balance-curve
// columns landed null while an in-memory object looked complete.
//
// Zero network, zero database, zero credits.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  recordDiscoveryLedgerInTx,
  DISCOVERY_LEDGER_INSERT_SQL,
} from '../../src/lines/discoverySampleLedger.js';
import { runDiscoverySample, type DiscoveryLedgerRow, type UnmappedGame } from '../../src/lines/unmappedDiscoverySample.js';
import { parseArgs, parsePlan, planHash, probePlanHash, boundaryHash } from '../../scripts/v1_op_8b_discovery_sample.js';
import type { Tx } from '../../src/db/transaction.js';
import type { OddsapiRequestResult } from '../../src/odds/httpClient.js';

const ENTRY = readFileSync(new URL('../../scripts/v1_op_8b_discovery_sample.ts', import.meta.url), 'utf8');

/** Records every statement + its bound params; returns a generated run id. */
function recordingTx() {
  const stmts: Array<{ sql: string; params: unknown[] }> = [];
  const tx: Tx = {
    query: async (sql: string, params: unknown[] = []) => {
      stmts.push({ sql, params });
      return { rows: [{ oddsapi_ingestion_run_id: 'run-1' }], rowCount: 1 };
    },
  };
  return { tx, stmts };
}

const ROW: DiscoveryLedgerRow = Object.freeze({
  probe_at: '2026-07-19T23:15:00Z', slate_date: '2026-07-19', forecast: 1, observed: 1, delta_flag: 'exact_match',
  x_requests_last: 1, x_requests_remaining: 98_765, x_requests_used: 1_235,
  cumulative_sample_spend: 7,
});

describe('§0.4 — the discovery ledger row PERSISTS the full billing trail', () => {
  it('writes one event_discovery/historical_events row with EVERY quota field bound', async () => {
    const { tx, stmts } = recordingTx();
    const id = await recordDiscoveryLedgerInTx(tx, {
      row: ROW,
      at_timestamp: '2026-07-19T23:59:59Z',
      redacted_request_url: 'https://api.the-odds-api.com/v4/historical/sports/basketball_wnba/events?apiKey=REDACTED',
      response_headers: { 'x-requests-last': 1 },
      retrieved_at: '2026-08-05T00:00:00.000Z',
    });

    assert.equal(id, 'run-1', 'returns the persisted ledger row id');
    assert.equal(stmts.length, 1, 'exactly one write');
    const ins = stmts[0]!;

    // The enum labels are literals in the SQL — the row is unmistakably a
    // discovery call, never mis-attributed to the 40cr historical_event_odds.
    assert.match(ins.sql, /INSERT INTO oddsapi_ingestion_runs/);
    assert.match(ins.sql, /'event_discovery','historical_events'/);
    assert.ok(!/historical_event_odds/.test(ins.sql), 'never attributed to the 40cr endpoint');
    assert.match(ins.sql, /'complete'/, 'terminal state — reached only after a 200');

    // THE GAP-40 ASSERTION: the persisted parameters, not an in-memory object.
    assert.ok(ins.params.includes(1), 'quota_forecast bound');
    assert.ok(ins.params.includes('exact_match'), 'quota_delta_flag bound');
    assert.ok(ins.params.includes(98_765), 'x_requests_remaining bound (the GAP-40 column)');
    assert.ok(ins.params.includes(1_235), 'x_requests_used bound (the GAP-40 column)');
    assert.ok(ins.params.includes('2026-07-19T23:59:59Z'), 'requested_effective_time bound');
    assert.ok(
      ins.params.some((p) => typeof p === 'string' && p.includes('apiKey=REDACTED')),
      'the URL is stored REDACTED — the key never reaches the database',
    );
    assert.ok(
      !ins.params.some((p) => typeof p === 'string' && /apiKey=(?!REDACTED)/.test(p)),
      'no un-redacted key in any parameter',
    );

    // No positional placeholder is left unbound.
    const maxPlaceholder = Math.max(...[...DISCOVERY_LEDGER_INSERT_SQL.matchAll(/\$(\d+)/g)].map((m) => Number(m[1])));
    assert.equal(ins.params.length, maxPlaceholder, `all ${maxPlaceholder} placeholders bound`);
  });

  it('END-TO-END: the real runner persists one ledger row per paid call', async () => {
    const games: UnmappedGame[] = [
      { internal_game_id: 'g1', slate_date: '2026-07-19', home_abbr: 'IND', away_abbr: 'NY', home_name: 'Indiana Fever', away_name: 'New York Liberty', in_recent_n: true, scheduled_start_utc: '2026-07-19T17:00:00.000Z', actual_start_utc: null, status: 'final' as const },
      { internal_game_id: 'g2', slate_date: '2026-07-21', home_abbr: 'SEA', away_abbr: 'MIN', home_name: 'Seattle Storm', away_name: 'Minnesota Lynx', in_recent_n: true, scheduled_start_utc: '2026-07-21T20:00:00.000Z', actual_start_utc: null, status: 'final' as const },
    ];
    const { tx, stmts } = recordingTx();
    const fetchEvents = (async (_c: unknown, i: { at_timestamp: string }) => ({
      status: 200, content_type: 'application/json',
      headers: { 'x-requests-last': 1, 'x-requests-remaining': 500, 'x-requests-used': 42 },
      body_text: '', body_json: { data: [] }, parse_state: 'json_ok', failure_kind: null,
      redacted_request_url: `https://api.the-odds-api.com/v4/historical/sports/basketball_wnba/events?date=${i.at_timestamp}&apiKey=REDACTED`,
    })) as never;

    await runDiscoverySample(
      {
        oddsapi_config: {} as never, api_key: 'K', fetchEvents,
        // The REAL writer, on a recording transaction.
        recordLedger: async (row, ctx) => {
          await recordDiscoveryLedgerInTx(tx, {
            row, at_timestamp: ctx.at_timestamp, redacted_request_url: ctx.redacted_request_url,
            response_headers: ctx.response_headers, retrieved_at: ctx.retrieved_at,
          });
        },
      },
      { games, max_total_credits: 20, dry_run: false },
    );

    assert.equal(stmts.length, 2, 'a persisted row per paid call — spend is DB-reconcilable');
    for (const s of stmts) {
      assert.match(s.sql, /'event_discovery','historical_events'/);
      assert.ok(s.params.includes(500), 'the balance curve reached the row');
      assert.ok(s.params.includes(42), 'x_requests_used reached the row');
    }
    // The per-date evidence is distinct — not one date written twice.
    // GAP-42: the persisted evidence is the CLOSE BOUNDARY (tip + 900s), never
    // the old end-of-UTC-day stamp.
    const probes = stmts.map((s) => s.params[0]);
    assert.deepEqual(probes, ['2026-07-19T17:15:00Z', '2026-07-21T20:15:00Z']);
    assert.ok(!probes.some((p) => String(p).endsWith('23:59:59Z')), 'the GAP-42 defect is gone from the ledger');
  });

  it('a DRY-RUN persists NOTHING', async () => {
    const { tx, stmts } = recordingTx();
    await runDiscoverySample(
      {
        oddsapi_config: {} as never, api_key: 'K',
        fetchEvents: (async () => { throw new Error('must not be called'); }) as never,
        recordLedger: async (row, ctx) => { await recordDiscoveryLedgerInTx(tx, { row, ...ctx }); },
      },
      {
        games: [{ internal_game_id: 'g1', slate_date: '2026-07-19', home_abbr: 'IND', away_abbr: 'NY', home_name: 'A', away_name: 'B', in_recent_n: true, scheduled_start_utc: '2026-07-19T17:00:00.000Z', actual_start_utc: null, status: 'final' as const }],
        max_total_credits: 20, dry_run: true,
      },
    );
    assert.equal(stmts.length, 0, 'no ledger write without a paid call');
  });
});

describe('§0.4 — operator entry is double-gated and plan-bound', () => {
  it('requires BOTH --apply and ODDSAPI_LIVE_INVOKE=1 before a call is issued', () => {
    assert.match(ENTRY, /process\.env\.ODDSAPI_LIVE_INVOKE === '1'/, 'env gate present');
    assert.match(ENTRY, /const dry_run = !\(args\.apply && live\)/, 'BOTH gates required (AND, not OR)');
    // Spend-incapability is enforced at the FETCH seam, not merely by omission.
    assert.match(ENTRY, /dry_run \? \(\{\} as never\) : buildLiveOddsapiConfig\(\{ allow_live_invoke: true \}\)/,
      'a live config is constructed ONLY when both gates are open');
    assert.match(ENTRY, /dry-run: the discovery seam is unreachable/, 'the dry-run fetch seam throws');
  });

  it('--plan is mandatory; the sample never re-runs a selector', () => {
    assert.throws(() => parseArgs([]), /--plan is required/);
    assert.throws(() => parseArgs(['--plan']), /--plan requires a path/);
    assert.throws(() => parseArgs(['--plan', '   ']), /--plan requires a path/);
  });

  it('an empty plan file is a hard error, never an implicit "all dates"', () => {
    assert.throws(() => parsePlan(''), /empty plan/);
    assert.throws(() => parsePlan('# only a comment\n\n'), /empty plan/);
  });

  it('the plan hash is order-independent and mismatch-refusing', () => {
    const a = planHash(['2026-07-19', '2026-07-12', '2026-07-21']);
    const b = planHash(['2026-07-12', '2026-07-19', '2026-07-21']);
    assert.equal(a, b, 'ascending-sorted before hashing');
    assert.notEqual(a, planHash(['2026-07-12', '2026-07-19']));
    assert.match(ENTRY, /refusing to run/, 'a hash mismatch aborts');
  });

  it('parses the frozen plan into date -> games, preserving recent-N', () => {
    const p = parsePlan([
      JSON.stringify({ internal_game_id: 'g1', slate_date: '2026-07-19', home_abbr: 'IND', away_abbr: 'NY', home_name: 'A', away_name: 'B', in_recent_n: true, scheduled_start_utc: '2026-07-19T17:00:00.000Z', actual_start_utc: null, status: 'final' }),
      JSON.stringify({ internal_game_id: 'g2', slate_date: '2026-07-19', home_abbr: 'DAL', away_abbr: 'LA', home_name: 'C', away_name: 'D', in_recent_n: true, scheduled_start_utc: '2026-07-19T20:00:00.000Z', actual_start_utc: null, status: 'final' }),
      JSON.stringify({ internal_game_id: 'g3', slate_date: '2026-07-12', home_abbr: 'TOR', away_abbr: 'NY', home_name: 'E', away_name: 'F', in_recent_n: false, scheduled_start_utc: '2026-07-12T19:00:00.000Z', actual_start_utc: null, status: 'final' }),
    ].join('\n'));
    assert.equal(p.games.length, 3);
    assert.deepEqual(p.dates, ['2026-07-12', '2026-07-19']);
    assert.equal(p.games.filter((g) => g.slate_date === '2026-07-19').length, 2);
    assert.equal(p.games.find((g) => g.internal_game_id === 'g3')!.in_recent_n, false, 'recent-N survives the round trip');
  });

  it('the entry never reaches the 40cr seam', () => {
    const code = ENTRY.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    assert.ok(!/fetchHistoricalEventOdds|runBoundedBatch|buildBatchApplyDeps/.test(code),
      'no 40cr retrieval path imported by the discovery entry');
  });
});

describe('§0.4 GAP-42 — the ratification hash binds the PROBE INPUTS', () => {
  const g = (id: string, sched: string): UnmappedGame => ({
    internal_game_id: id, slate_date: sched.slice(0, 10), home_abbr: 'IND', away_abbr: 'NY',
    home_name: 'Indiana Fever', away_name: 'New York Liberty', in_recent_n: true,
    scheduled_start_utc: sched, actual_start_utc: null, status: 'final',
  });

  it('THE REGRESSION: moving a tip changes the gate hash even when the DATE is unchanged', () => {
    const a = [g('g1', '2026-07-19T17:00:00.000Z')];
    const b = [g('g1', '2026-07-19T20:00:00.000Z')]; // same slate date, different boundary
    assert.equal(planHash(a.map((x) => x.slate_date)), planHash(b.map((x) => x.slate_date)),
      'the legacy 12-date hash is BLIND to this — which is why it must not gate');
    assert.notEqual(probePlanHash(a), probePlanHash(b), 'the probe-plan hash catches it');
    assert.notEqual(boundaryHash(a), boundaryHash(b));
  });

  it('changing WHICH game is probed changes the hash', () => {
    assert.notEqual(
      probePlanHash([g('g1', '2026-07-19T17:00:00.000Z')]),
      probePlanHash([g('g2', '2026-07-19T17:00:00.000Z')]),
      'the game set is bound, not just the instants');
  });

  it('is order-independent and stable', () => {
    const a = [g('g1', '2026-07-19T17:00:00.000Z'), g('g2', '2026-07-21T02:00:00.000Z')];
    assert.equal(probePlanHash(a), probePlanHash([...a].reverse()));
    assert.equal(probePlanHash(a), probePlanHash(a), 'deterministic');
  });

  it('the operator gates on the probe-plan hash, not the date hash', () => {
    assert.match(ENTRY, /const hash = probePlanHash\(parsed\.games\)/, 'gate bound to probe inputs');
    assert.match(ENTRY, /probe-plan hash mismatch/, 'mismatch aborts');
    assert.ok(!/args\.expect_sha256 !== dates_hash/.test(ENTRY), 'the date hash never gates');
  });
});

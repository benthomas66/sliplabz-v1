// V1-OP-8b §0.4 — event-id capture (GAP-43, identifier side).
//
// Rule 5b, applied exactly as GAP-40 taught: every positive-persistence
// assertion here reads the PERSISTED row's bound parameters, never an
// intermediate report object. The re-probe's event ids existed only in memory;
// a test that asserted the in-memory classification would have "passed" while
// the identifiers were still being thrown away.
//
// Zero network, zero database, zero credits.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  recordDiscoveryResultInTx,
  matchKindOf,
  DISCOVERY_RESULT_UPSERT_SQL,
} from '../../src/lines/discoveryResultCapture.js';
import { runDiscoverySample, type UnmappedGame, type GameClassification } from '../../src/lines/unmappedDiscoverySample.js';
import type { Tx } from '../../src/db/transaction.js';
import type { OddsapiRequestResult } from '../../src/odds/httpClient.js';

const CAPTURE = readFileSync(new URL('../../src/lines/discoveryResultCapture.ts', import.meta.url), 'utf8');
const MIGRATION = readFileSync(new URL('../../supabase/migrations/20260805120000_discovery_results.sql', import.meta.url), 'utf8');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n]*/g, '').replace(/\/\/[^\n]*/g, '');

const RUN = '11111111-1111-1111-1111-111111111111';
const GAME = '68378a24-9588-49f8-9681-479bcc4e2b7d';

function recordingTx() {
  const stmts: Array<{ sql: string; params: unknown[] }> = [];
  const tx: Tx = {
    query: async (sql: string, params: unknown[] = []) => {
      stmts.push({ sql, params });
      return { rows: [{ discovery_result_id: 'dr-1', oddsapi_ingestion_run_id: RUN }], rowCount: 1 };
    },
  };
  return { tx, stmts };
}

const cls = (over: Partial<GameClassification> = {}): GameClassification => ({
  internal_game_id: GAME, slate_date: '2026-07-13', matchup: 'LA@ATL', in_recent_n: true,
  population: 'b_discovery_recoverable', matched_event_id: 'evt-abc123',
  detail: 'matched on both teams (home=exact, away=exact)', ...over,
});

describe('§0.4 GAP-43 — the discovered event id is PERSISTED, not just reported', () => {
  it('the persisted row carries matched_event_id, game id, probe boundary and match kind', async () => {
    const { tx, stmts } = recordingTx();
    const id = await recordDiscoveryResultInTx(tx, {
      oddsapi_ingestion_run_id: RUN, probe_at: '2026-07-13T23:15:00Z',
      classification: cls(), provider_commence_time: '2026-07-13T23:00:00Z',
    });
    assert.equal(id, 'dr-1');
    assert.equal(stmts.length, 1);
    const ins = stmts[0]!;

    // THE assertion the re-probe lacked: the identifier reaches the database.
    assert.ok(ins.params.includes('evt-abc123'), 'matched_event_id BOUND');
    assert.ok(ins.params.includes(GAME), 'internal_game_id bound');
    assert.ok(ins.params.includes('2026-07-13T23:15:00Z'), 'probe boundary bound');
    assert.ok(ins.params.includes('b_discovery_recoverable'), 'population bound');
    assert.ok(ins.params.includes('exact'), 'match_kind bound');
    assert.ok(ins.params.includes('2026-07-13T23:00:00Z'), 'provider commence_time bound');

    const maxPlaceholder = Math.max(...[...DISCOVERY_RESULT_UPSERT_SQL.matchAll(/\$(\d+)/g)].map((m) => Number(m[1])));
    assert.equal(ins.params.length, maxPlaceholder, `all ${maxPlaceholder} placeholders bound`);
    assert.match(ins.sql, /ON CONFLICT \(internal_game_id, probe_at\) DO UPDATE/, 're-probe updates in place');
  });

  it('a (c) row persists a NULL event id — the constraint pair can never disagree', async () => {
    const { tx, stmts } = recordingTx();
    await recordDiscoveryResultInTx(tx, {
      oddsapi_ingestion_run_id: RUN, probe_at: '2026-07-26T00:45:00Z',
      classification: cls({ population: 'c_unrecoverable', matched_event_id: null, detail: 'no_match at the close boundary' }),
      provider_commence_time: null,
    });
    assert.ok(stmts[0]!.params.includes(null), 'null event id bound');
    assert.ok(!stmts[0]!.params.includes('evt-abc123'));
    // and the schema forbids the inconsistent pair outright
    assert.match(MIGRATION, /discovery_results_population_event_check/);
    assert.match(strip(MIGRATION), /population = 'b_discovery_recoverable' AND matched_event_id IS NOT NULL/);
    assert.match(strip(MIGRATION), /population = 'c_unrecoverable'\s+AND matched_event_id IS NULL/);
  });

  it('records the match kind, including the GAP-44 disambiguation', () => {
    assert.equal(matchKindOf(cls()), 'exact');
    assert.equal(matchKindOf(cls({ detail: 'matched on both teams (home=token_containment, away=exact)' })), 'token_containment');
    assert.equal(matchKindOf(cls({ detail: 'matched on both teams; disambiguated by commence_time (2 candidates, nearest 900s vs 147600s from the boundary)' })), 'disambiguated');
    assert.equal(matchKindOf(cls({ population: 'c_unrecoverable', matched_event_id: null })), null);
  });

  it('THE TWO-FIELD INVARIANT IS STRUCTURAL: no start-time column exists to write', () => {
    const m = strip(MIGRATION);
    assert.ok(!/actual_start_utc|scheduled_start_utc/.test(m), 'the table has no start-time column at all');
    const c = strip(CAPTURE);
    assert.ok(!/actual_start_utc|scheduled_start_utc/.test(c), 'the writer never references either field');
  });

  it('creates NO mapping and never invokes the mapping owner', () => {
    const c = strip(CAPTURE);
    assert.ok(!/provider_games|mapping_state|event_reconciliation_queue/.test(c), 'no mapping table touched');
    assert.ok(!/eventResolutionForSeed/.test(c), 'the governed mapping owner is never invoked');
    assert.ok(!/UPDATE games|INSERT INTO games/.test(c), 'games is never written');
    // the ONLY table this module writes
    const tables = [...c.matchAll(/INSERT INTO (\w+)/g)].map((m) => m[1]);
    assert.deepEqual([...new Set(tables)], ['discovery_results']);
  });
});

describe('§0.4 GAP-43 — END-TO-END through the real runner', () => {
  const game = (id: string, sched: string): UnmappedGame => ({
    internal_game_id: id, slate_date: sched.slice(0, 10), home_abbr: 'ATL', away_abbr: 'LA',
    home_name: 'Atlanta Dream', away_name: 'Los Angeles Sparks', in_recent_n: true,
    scheduled_start_utc: sched, actual_start_utc: null, status: 'final',
  });

  it('every (b) game gets a persisted row carrying its event id', async () => {
    const events = [{ id: 'evt-real-1', away_team: 'Los Angeles Sparks', home_team: 'Atlanta Dream', commence_time: '2026-07-13T23:00:00Z' }];
    const fetchEvents = (async () => ({
      status: 200, content_type: 'application/json',
      headers: { 'x-requests-last': 1, 'x-requests-remaining': 500, 'x-requests-used': 42 },
      body_text: '', body_json: { data: events }, parse_state: 'json_ok', failure_kind: null,
      redacted_request_url: 'https://api.the-odds-api.com/x?apiKey=REDACTED',
    })) as never;

    const { tx, stmts } = recordingTx();
    const rep = await runDiscoverySample(
      {
        oddsapi_config: {} as never, api_key: 'K', fetchEvents,
        recordLedger: async () => RUN, // the ledger row id the capture joins to
        recordResult: async (input) => { await recordDiscoveryResultInTx(tx, input); },
      },
      { games: [game(GAME, '2026-07-13T23:00:00.000Z')], max_total_credits: 20, dry_run: false },
    );

    assert.equal(rep.totals.n_b, 1);
    assert.equal(stmts.length, 1, 'one persisted capture row per classified game');
    const p = stmts[0]!.params;
    assert.ok(p.includes('evt-real-1'), 'the REAL runner threaded the discovered id into the row');
    assert.ok(p.includes(RUN), 'joined to the paid call that produced it');
    assert.ok(p.includes('2026-07-13T23:15:00Z'), 'the close boundary, not a slate date');
    assert.ok(p.includes('2026-07-13T23:00:00Z'), "the provider's own commence_time");
  });

  it('a DRY-RUN captures nothing', async () => {
    const { tx, stmts } = recordingTx();
    await runDiscoverySample(
      {
        oddsapi_config: {} as never, api_key: 'K',
        fetchEvents: (async () => { throw new Error('must not be called'); }) as never,
        recordLedger: async () => RUN,
        recordResult: async (input) => { await recordDiscoveryResultInTx(tx, input); },
      },
      { games: [game(GAME, '2026-07-13T23:00:00.000Z')], max_total_credits: 20, dry_run: true },
    );
    assert.equal(stmts.length, 0, 'no capture without a paid call');
  });

  it('the capture is ADDITIVE — omitting it leaves the run unchanged', async () => {
    const fetchEvents = (async () => ({
      status: 200, content_type: 'application/json',
      headers: { 'x-requests-last': 1, 'x-requests-remaining': 500, 'x-requests-used': 42 },
      body_text: '', body_json: { data: [] }, parse_state: 'json_ok', failure_kind: null,
      redacted_request_url: 'https://x?apiKey=REDACTED',
    })) as never;
    const rep = await runDiscoverySample(
      { oddsapi_config: {} as never, api_key: 'K', fetchEvents },
      { games: [game(GAME, '2026-07-13T23:00:00.000Z')], max_total_credits: 20, dry_run: false },
    );
    assert.equal(rep.totals.credits_observed, 1, 'billing unchanged');
    assert.equal(rep.rows.length, 1, 'classification unchanged');
  });
});

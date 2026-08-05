// V1-OP-8b §0.4 — discovery-sample matcher + bounding tests.
//
// Rule 5b applied to classification: these drive the REAL `runDiscoverySample`
// path with fixture date→events payloads, not hand-built classifications.
// Zero network, zero database, zero credits.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  runDiscoverySample,
  classifyGame,
  summarize,
  type UnmappedGame,
  type DiscoveredEvent,
  type DiscoveryLedgerRow,
} from '../../src/lines/unmappedDiscoverySample.js';
import type { OddsapiRequestResult } from '../../src/odds/httpClient.js';

const SRC = readFileSync(new URL('../../src/lines/unmappedDiscoverySample.ts', import.meta.url), 'utf8');
const code = () => SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

function game(over: Partial<UnmappedGame> & { internal_game_id: string; slate_date: string }): UnmappedGame {
  return {
    home_abbr: 'IND', away_abbr: 'NY', home_name: 'Indiana Fever', away_name: 'New York Liberty',
    in_recent_n: true, ...over,
  };
}
const EV = (id: string, away: string, home: string): DiscoveredEvent =>
  ({ id, away_team: away, home_team: home, commence_time: '2026-07-19T00:00:00Z' });

/** Fixture discovery responses keyed by date. Replaces the 1cr call. */
function fixtureFetch(byDate: Record<string, DiscoveredEvent[]>, calls: { n: number; dates: string[] }) {
  return (async (_cfg: unknown, input: { at_timestamp: string }) => {
    calls.n += 1;
    const d = input.at_timestamp.slice(0, 10);
    calls.dates.push(d);
    return {
      status: 200, content_type: 'application/json',
      headers: { 'x-requests-last': 1, 'x-requests-remaining': 99000 - calls.n, 'x-requests-used': 1000 + calls.n },
      body_text: '', body_json: { data: byDate[d] ?? [] }, parse_state: 'json_ok',
      failure_kind: null, redacted_request_url: 'https://api.the-odds-api.com/x?apiKey=REDACTED',
    } as OddsapiRequestResult;
  }) as never;
}

describe('§0.4 — DISCOVERY-ONLY by construction', () => {
  it('the 40cr event-odds seam is UNREACHABLE from this module', () => {
    // Assert on CODE, not raw source — the header comment legitimately names
    // the forbidden symbols when documenting why they are absent.
    const c0 = code();
    assert.ok(!/fetchHistoricalEventOdds/.test(c0), 'never imports the 40cr fetch');
    assert.ok(!/buildHistoricalEventOddsUrl/.test(c0), 'never builds the 40cr URL');
    // Target the ENDPOINT path shape, not the `../odds/...` import path.
    assert.ok(!/v4\/historical[^'"`]*\/odds/.test(code()), 'no event-odds endpoint path constructed');
    assert.ok(!/events\/\$\{[^}]*\}/.test(code()), 'no per-event URL segment built');
    assert.ok(/import \{ fetchHistoricalEvents \}/.test(c0), 'imports only the 1cr discovery fetch');
  });

  it('writes NO provider_games mapping — classification is report-only', () => {
    const c = code();
    assert.ok(!/INSERT INTO|UPDATE\s+\w+\s+SET|DELETE FROM/i.test(c), 'no SQL in the module at all');
    assert.ok(!/provider_games/.test(c), 'never references the mapping table');
    assert.ok(/recordLedger/.test(c), 'the only write seam is the billing ledger');
  });
});

describe('§0.4 — (b)/(c) matching', () => {
  it('exact match on BOTH teams → (b) with the matched event id', () => {
    const r = classifyGame(game({ internal_game_id: 'g1', slate_date: '2026-07-19' }),
      [EV('evt-1', 'New York Liberty', 'Indiana Fever')]);
    assert.equal(r.population, 'b_discovery_recoverable');
    assert.equal(r.matched_event_id, 'evt-1');
  });

  it('no match on the date → (c)', () => {
    const r = classifyGame(game({ internal_game_id: 'g2', slate_date: '2026-07-19' }),
      [EV('evt-9', 'Los Angeles Sparks', 'Dallas Wings')]);
    assert.equal(r.population, 'c_unrecoverable');
    assert.equal(r.matched_event_id, null);
    assert.match(r.detail, /no_match/);
  });

  it('AMBIGUOUS (multi-match) is NOT promoted to (b) — stays (c)', () => {
    const r = classifyGame(game({ internal_game_id: 'g3', slate_date: '2026-07-19' }),
      [EV('evt-1', 'New York Liberty', 'Indiana Fever'), EV('evt-2', 'New York Liberty', 'Indiana Fever')]);
    assert.equal(r.population, 'c_unrecoverable', 'conservative: ambiguity never inflates the budget');
    assert.match(r.detail, /ambiguous/);
  });

  it('a one-sided match is NOT enough for (b)', () => {
    const r = classifyGame(game({ internal_game_id: 'g4', slate_date: '2026-07-19' }),
      [EV('evt-1', 'Chicago Sky', 'Indiana Fever')]);
    assert.equal(r.population, 'c_unrecoverable');
  });

  it('a game with no internal team identity is (c) by definition (the TBD exhibition)', () => {
    const r = classifyGame(
      game({ internal_game_id: 'g5', slate_date: '2026-07-26', home_name: null, away_name: null, home_abbr: null, away_abbr: null }),
      [EV('evt-1', 'New York Liberty', 'Indiana Fever')]);
    assert.equal(r.population, 'c_unrecoverable');
    assert.match(r.detail, /no internal team identity/);
  });
});

describe('§0.4 — the real path classifies 24 games and computes the (c) floor', () => {
  /** 24 games over 12 dates, mirroring the frozen plan's shape. */
  function buildPlan() {
    const dates = ['2026-07-12','2026-07-13','2026-07-14','2026-07-15','2026-07-16','2026-07-17',
                   '2026-07-19','2026-07-21','2026-07-22','2026-07-23','2026-07-26','2026-07-30'];
    const counts = [1,2,3,2,1,1,3,3,4,2,1,1]; // = 24
    const plan = new Map<string, UnmappedGame[]>();
    let i = 0;
    dates.forEach((d, di) => {
      const gs: UnmappedGame[] = [];
      for (let k = 0; k < counts[di]!; k += 1) {
        i += 1;
        gs.push(game({
          internal_game_id: `g${i}`, slate_date: d,
          home_name: `Home ${i}`, away_name: `Away ${i}`, home_abbr: `H${i}`, away_abbr: `A${i}`,
          // last two dates sit outside the recent-N window
          in_recent_n: di < 10,
        }));
      }
      plan.set(d, gs);
    });
    return plan;
  }

  it('classifies all 24 through the REAL runner, and c_within_recent_n is exact', async () => {
    const plan = buildPlan();
    // Make roughly 3/4 discoverable: emit a matching event for every game whose
    // index is not divisible by 4.
    const byDate: Record<string, DiscoveredEvent[]> = {};
    for (const [d, gs] of plan) {
      byDate[d] = gs
        .filter((g) => Number(g.internal_game_id.slice(1)) % 4 !== 0)
        .map((g) => EV(`evt-${g.internal_game_id}`, g.away_name!, g.home_name!));
    }
    const calls = { n: 0, dates: [] as string[] };
    const ledger: DiscoveryLedgerRow[] = [];
    const rep = await runDiscoverySample(
      { oddsapi_config: {} as never, api_key: 'K', fetchEvents: fixtureFetch(byDate, calls), recordLedger: async (r) => { ledger.push(r); } },
      { plan, max_total_credits: 20, dry_run: false },
    );

    assert.equal(calls.n, 12, 'exactly one discovery call per date');
    assert.equal(rep.rows.length, 24, 'all 24 games classified');
    assert.equal(rep.totals.n_b + rep.totals.n_c, 24);
    assert.equal(rep.totals.n_c, 6, 'every 4th game unmatched → (c)');
    assert.equal(rep.totals.n_b, 18);
    assert.equal(Number(rep.totals.recovery_rate.toFixed(4)), 0.75);

    // THE headline number, computed independently here
    const expectedFloor = rep.rows.filter((r) => r.population === 'c_unrecoverable' && r.in_recent_n).length;
    assert.equal(rep.totals.c_within_recent_n, expectedFloor);
    assert.ok(rep.totals.c_within_recent_n <= rep.totals.n_c);
  });

  it('billing: 12 calls at 1cr, ledger recorded per date with the full trail', async () => {
    const plan = buildPlan();
    const calls = { n: 0, dates: [] as string[] };
    const ledger: DiscoveryLedgerRow[] = [];
    const rep = await runDiscoverySample(
      { oddsapi_config: {} as never, api_key: 'K', fetchEvents: fixtureFetch({}, calls), recordLedger: async (r) => { ledger.push(r); } },
      { plan, max_total_credits: 20, dry_run: false },
    );
    assert.equal(rep.totals.credits_forecast, 12);
    assert.equal(rep.totals.credits_observed, 12);
    assert.equal(ledger.length, 12, 'a ledger row per call — spend is DB-reconcilable');
    for (const r of ledger) {
      assert.equal(r.forecast, 1);
      assert.equal(r.observed, 1);
      assert.equal(r.delta_flag, 'exact_match');
      assert.equal(r.x_requests_last, 1);
      assert.ok(r.x_requests_remaining !== null && r.x_requests_used !== null, 'full trail, no nulls');
    }
    assert.deepEqual(ledger.map((r) => r.cumulative_sample_spend), [1,2,3,4,5,6,7,8,9,10,11,12]);
  });

  it('dry-run issues NO call and spends nothing', async () => {
    const calls = { n: 0, dates: [] as string[] };
    const rep = await runDiscoverySample(
      { oddsapi_config: {} as never, api_key: 'K', fetchEvents: fixtureFetch({}, calls) },
      { plan: buildPlan(), max_total_credits: 20, dry_run: true },
    );
    assert.equal(calls.n, 0, 'no discovery call on a dry-run');
    assert.equal(rep.totals.credits_observed, 0);
    assert.equal(rep.ledger.length, 0);
  });

  it('empty plan is a hard error, never an implicit scan', async () => {
    const rep = await runDiscoverySample({ oddsapi_config: {} as never, api_key: 'K' },
      { plan: new Map(), max_total_credits: 20, dry_run: false });
    assert.match(rep.halt_reason ?? '', /empty_plan/);
    assert.equal(rep.totals.credits_observed, 0);
  });

  it('halt-before-ceiling stops before the call that would exceed', async () => {
    const calls = { n: 0, dates: [] as string[] };
    const rep = await runDiscoverySample(
      { oddsapi_config: {} as never, api_key: 'K', fetchEvents: fixtureFetch({}, calls) },
      { plan: buildPlan(), max_total_credits: 5, dry_run: false },
    );
    assert.equal(calls.n, 5, 'five 1cr calls, then the sixth is refused');
    assert.match(rep.halt_reason ?? '', /ceiling/);
  });

  it('summarize is pure and consistent with the rows', () => {
    const rows = [
      { internal_game_id: 'a', slate_date: 'd', matchup: 'x@y', in_recent_n: true, population: 'c_unrecoverable' as const, matched_event_id: null, detail: '' },
      { internal_game_id: 'b', slate_date: 'd', matchup: 'x@y', in_recent_n: false, population: 'c_unrecoverable' as const, matched_event_id: null, detail: '' },
      { internal_game_id: 'c', slate_date: 'd', matchup: 'x@y', in_recent_n: true, population: 'b_discovery_recoverable' as const, matched_event_id: 'e', detail: '' },
    ];
    const t = summarize(rows, 1, 1);
    assert.equal(t.n_c, 2);
    assert.equal(t.n_b, 1);
    assert.equal(t.c_within_recent_n, 1, 'only the in-window (c) counts toward the floor');
  });
});

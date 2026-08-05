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
  buildProbePlan,
  classifyGame,
  summarize,
  type UnmappedGame,
  type DiscoveredEvent,
  type DiscoveryLedgerRow,
} from '../../src/lines/unmappedDiscoverySample.js';
import { matchTeamName } from '../../src/lines/discoveryTeamMatch.js';
import type { OddsapiRequestResult } from '../../src/odds/httpClient.js';

const SRC = readFileSync(new URL('../../src/lines/unmappedDiscoverySample.ts', import.meta.url), 'utf8');
const code = () => SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

function game(over: Partial<UnmappedGame> & { internal_game_id: string; slate_date: string }): UnmappedGame {
  return {
    home_abbr: 'IND', away_abbr: 'NY', home_name: 'Indiana Fever', away_name: 'New York Liberty',
    in_recent_n: true, scheduled_start_utc: `${over.slate_date}T23:00:00.000Z`,
    actual_start_utc: null, status: 'final', ...over,
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
    assert.match(r.detail, /home=exact/);
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
          // Distinct tip per game on a date, mirroring a real slate — this is
          // what makes each game its own GAP-42 probe rather than a shared one.
          scheduled_start_utc: `${d}T${String(16 + k).padStart(2, '0')}:00:00.000Z`,
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
      { games: [...plan.values()].flat(), max_total_credits: 40, dry_run: false },
    );

    assert.equal(calls.n, 24, 'GAP-42: one call per distinct close boundary');
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

  it('billing: one 1cr call per probe, ledger recorded with the full trail', async () => {
    const plan = buildPlan();
    const calls = { n: 0, dates: [] as string[] };
    const ledger: DiscoveryLedgerRow[] = [];
    const rep = await runDiscoverySample(
      { oddsapi_config: {} as never, api_key: 'K', fetchEvents: fixtureFetch({}, calls), recordLedger: async (r) => { ledger.push(r); } },
      { games: [...plan.values()].flat(), max_total_credits: 40, dry_run: false },
    );
    assert.equal(rep.totals.credits_forecast, 24);
    assert.equal(rep.totals.credits_observed, 24);
    assert.equal(ledger.length, 24, 'a ledger row per call — spend is DB-reconcilable');
    for (const r of ledger) {
      assert.equal(r.forecast, 1);
      assert.equal(r.observed, 1);
      assert.equal(r.delta_flag, 'exact_match');
      assert.equal(r.x_requests_last, 1);
      assert.ok(r.x_requests_remaining !== null && r.x_requests_used !== null, 'full trail, no nulls');
    }
    assert.deepEqual(ledger.map((r) => r.cumulative_sample_spend), Array.from({ length: 24 }, (_, i) => i + 1));
  });

  it('dry-run issues NO call and spends nothing', async () => {
    const calls = { n: 0, dates: [] as string[] };
    const rep = await runDiscoverySample(
      { oddsapi_config: {} as never, api_key: 'K', fetchEvents: fixtureFetch({}, calls) },
      { games: [...buildPlan().values()].flat(), max_total_credits: 20, dry_run: true },
    );
    assert.equal(calls.n, 0, 'no discovery call on a dry-run');
    assert.equal(rep.totals.credits_observed, 0);
    assert.equal(rep.ledger.length, 0);
  });

  it('empty plan is a hard error, never an implicit scan', async () => {
    const rep = await runDiscoverySample({ oddsapi_config: {} as never, api_key: 'K' },
      { games: [], max_total_credits: 20, dry_run: false });
    assert.match(rep.halt_reason ?? '', /empty_plan/);
    assert.equal(rep.totals.credits_observed, 0);
  });

  it('halt-before-ceiling stops before the call that would exceed', async () => {
    const calls = { n: 0, dates: [] as string[] };
    const rep = await runDiscoverySample(
      { oddsapi_config: {} as never, api_key: 'K', fetchEvents: fixtureFetch({}, calls) },
      { games: [...buildPlan().values()].flat(), max_total_credits: 5, dry_run: false },
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

describe('§0.4 GAP-41 — city-less expansion names must NOT be forced to (c)', () => {
  // THE REGRESSION. `teams.display_name` stores "Tempo"/"Fire" for the two 2026
  // expansion franchises; the provider (verified live, free endpoint) returns
  // "Toronto Tempo"/"Portland Fire". The pre-fix matcher required exact
  // equality and pushed all 6 such games to (c) by construction.
  it('"Tempo" matches "Toronto Tempo" — the exact case that broke the fired sample', () => {
    const r = classifyGame(
      game({ internal_game_id: 'g-tor', slate_date: '2026-07-21', home_abbr: 'TOR', away_abbr: 'LV', home_name: 'Tempo', away_name: 'Las Vegas Aces' }),
      [EV('evt-tor', 'Las Vegas Aces', 'Toronto Tempo')]);
    assert.equal(r.population, 'b_discovery_recoverable', 'no longer an artifact (c)');
    assert.equal(r.matched_event_id, 'evt-tor');
    assert.match(r.detail, /token_containment/);
  });

  it('"Fire" matches "Portland Fire", on either side of the matchup', () => {
    const home = classifyGame(
      game({ internal_game_id: 'g-por-h', slate_date: '2026-07-23', home_abbr: 'POR', away_abbr: 'DAL', home_name: 'Fire', away_name: 'Dallas Wings' }),
      [EV('evt-p1', 'Dallas Wings', 'Portland Fire')]);
    assert.equal(home.population, 'b_discovery_recoverable');
    const away = classifyGame(
      game({ internal_game_id: 'g-por-a', slate_date: '2026-07-14', home_abbr: 'CON', away_abbr: 'POR', home_name: 'Connecticut Sun', away_name: 'Fire' }),
      [EV('evt-p2', 'Portland Fire', 'Connecticut Sun')]);
    assert.equal(away.population, 'b_discovery_recoverable');
  });

  it('containment does NOT admit a different team sharing a city word', () => {
    assert.equal(matchTeamName('Chicago Sky', 'Chicago Fire'), 'none', 'one shared token is never a match');
    assert.equal(matchTeamName('Sky', 'Chicago Fire'), 'none');
    assert.equal(matchTeamName('Fire', 'Chicago Fire'), 'token_containment', 'nickname containment is the intended relaxation');
  });

  it('a bare CITY does not match — only the nickname does', () => {
    assert.equal(matchTeamName('Portland', 'Portland Fire'), 'none', 'city-only must not promote');
    assert.equal(matchTeamName('Toronto', 'Toronto Tempo'), 'none');
  });

  it('an empty/undefined identity still yields (c) — a correct one, not an artifact', () => {
    assert.equal(matchTeamName('', 'Toronto Tempo'), 'none');
    assert.equal(matchTeamName('TBD', 'Toronto Tempo'), 'none');
  });

  it('ambiguity is STILL resolved to (c) — the conservative posture is intact', () => {
    const r = classifyGame(
      game({ internal_game_id: 'g-amb', slate_date: '2026-07-21', home_name: 'Tempo', away_name: 'Las Vegas Aces' }),
      [EV('e1', 'Las Vegas Aces', 'Toronto Tempo'), EV('e2', 'Las Vegas Aces', 'Tempo')]);
    assert.equal(r.population, 'c_unrecoverable');
    assert.match(r.detail, /ambiguous/);
  });
});

describe('§0.4 GAP-42 — probes anchor to the committed close boundary', () => {
  it('probes at scheduled+900s, NOT at end-of-UTC-day', () => {
    const { groups } = buildProbePlan([
      game({ internal_game_id: 'g1', slate_date: '2026-07-19', scheduled_start_utc: '2026-07-19T17:00:00.000Z' }),
    ]);
    assert.equal(groups.length, 1);
    assert.equal(groups[0]!.probe_at, '2026-07-19T17:15:00Z', 'tip + the committed 900s grace');
    assert.ok(!groups[0]!.probe_at.endsWith('23:59:59Z'), 'the GAP-42 defect is gone');
  });

  it('honours a verified actual start over the scheduled grace', () => {
    const { groups } = buildProbePlan([
      game({ internal_game_id: 'g1', slate_date: '2026-07-19', scheduled_start_utc: '2026-07-19T17:00:00.000Z', actual_start_utc: '2026-07-19T17:08:00.000Z' }),
    ]);
    assert.equal(groups[0]!.probe_at, '2026-07-19T17:08:00Z');
  });

  it('emits SECOND precision — the historical endpoint rejects milliseconds', () => {
    const { groups } = buildProbePlan([game({ internal_game_id: 'g1', slate_date: '2026-07-19' })]);
    assert.match(groups[0]!.probe_at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  });

  it('games sharing a boundary are paid for ONCE', () => {
    const { groups } = buildProbePlan([
      game({ internal_game_id: 'g1', slate_date: '2026-07-21', scheduled_start_utc: '2026-07-21T02:00:00.000Z' }),
      game({ internal_game_id: 'g2', slate_date: '2026-07-21', scheduled_start_utc: '2026-07-21T02:00:00.000Z' }),
      game({ internal_game_id: 'g3', slate_date: '2026-07-21', scheduled_start_utc: '2026-07-21T00:00:00.000Z' }),
    ]);
    assert.equal(groups.length, 2, 'deduplicated by instant');
    assert.equal(groups.find((g) => g.probe_at === '2026-07-21T02:15:00Z')!.games.length, 2);
    assert.deepEqual(groups.map((g) => g.probe_at), ['2026-07-21T00:15:00Z', '2026-07-21T02:15:00Z'], 'ascending');
  });

  it('a postponed game has NO boundary and is never probed — no credit wasted', async () => {
    const { groups, no_boundary } = buildProbePlan([
      game({ internal_game_id: 'g-pp', slate_date: '2026-07-19', status: 'postponed' }),
    ]);
    assert.equal(groups.length, 0, 'nothing to probe');
    assert.equal(no_boundary.length, 1);

    const calls = { n: 0, dates: [] as string[] };
    const rep = await runDiscoverySample(
      { oddsapi_config: {} as never, api_key: 'K', fetchEvents: fixtureFetch({}, calls) },
      { games: [game({ internal_game_id: 'g-pp', slate_date: '2026-07-19', status: 'postponed' })], max_total_credits: 20, dry_run: false },
    );
    assert.equal(calls.n, 0, 'zero credits spent on an unrepairable game');
    assert.equal(rep.rows[0]!.population, 'c_unrecoverable');
    assert.match(rep.rows[0]!.detail, /no close boundary/);
  });

  it('the ledger row records the probed BOUNDARY, not a slate date', async () => {
    const calls = { n: 0, dates: [] as string[] };
    const ledger: DiscoveryLedgerRow[] = [];
    await runDiscoverySample(
      { oddsapi_config: {} as never, api_key: 'K', fetchEvents: fixtureFetch({}, calls), recordLedger: async (r) => { ledger.push(r); } },
      { games: [game({ internal_game_id: 'g1', slate_date: '2026-07-19', scheduled_start_utc: '2026-07-19T17:00:00.000Z' })], max_total_credits: 20, dry_run: false },
    );
    assert.equal(ledger[0]!.probe_at, '2026-07-19T17:15:00Z');
    assert.equal(ledger[0]!.slate_date, '2026-07-19', 'slate date retained for reporting');
  });
});

describe('§0.4 GAP-44 — a same-matchup series is disambiguated, not abandoned', () => {
  // THE REGRESSION. `455f3873` (MIN@SEA, tip 2026-07-21T02:00Z) and `dcf8be4b`
  // (MIN@SEA, tip 2026-07-22T19:00Z) are a two-game series. At the 02:15Z close
  // boundary BOTH legs were listed, so the uniqueness rule sent leg 1 to (c) —
  // correct under the old rule, but the case is disambiguable.
  const series = (id: string, commence: string): DiscoveredEvent =>
    ({ id, away_team: 'Minnesota Lynx', home_team: 'Seattle Storm', commence_time: commence });
  const minsea = (id: string, sched: string) => game({
    internal_game_id: id, slate_date: sched.slice(0, 10), home_abbr: 'SEA', away_abbr: 'MIN',
    home_name: 'Seattle Storm', away_name: 'Minnesota Lynx', scheduled_start_utc: sched,
  });

  it('picks the leg commencing NEAREST this game boundary', () => {
    const r = classifyGame(
      minsea('455f3873', '2026-07-21T02:00:00.000Z'),
      [series('evt-leg1', '2026-07-21T02:00:00Z'), series('evt-leg2', '2026-07-22T19:00:00Z')],
      '2026-07-21T02:15:00Z');
    assert.equal(r.population, 'b_discovery_recoverable', 'GAP-44: no longer abandoned');
    assert.equal(r.matched_event_id, 'evt-leg1');
    assert.match(r.detail, /disambiguated by commence_time/);
  });

  it('the SIBLING resolves to the other leg at its own boundary', () => {
    const r = classifyGame(
      minsea('dcf8be4b', '2026-07-22T19:00:00.000Z'),
      [series('evt-leg1', '2026-07-21T02:00:00Z'), series('evt-leg2', '2026-07-22T19:00:00Z')],
      '2026-07-22T19:15:00Z');
    assert.equal(r.matched_event_id, 'evt-leg2', 'each leg claims its own event — never the same one twice');
  });

  it('CONSERVATIVE: an exact tie stays (c)', () => {
    const r = classifyGame(
      minsea('g', '2026-07-21T02:00:00.000Z'),
      [series('a', '2026-07-21T02:00:00Z'), series('b', '2026-07-21T02:00:00Z')],
      '2026-07-21T02:15:00Z');
    assert.equal(r.population, 'c_unrecoverable');
    assert.match(r.detail, /ambiguous/);
  });

  it('CONSERVATIVE: a missing commence_time stays (c)', () => {
    const r = classifyGame(
      minsea('g', '2026-07-21T02:00:00.000Z'),
      [{ id: 'a', away_team: 'Minnesota Lynx', home_team: 'Seattle Storm' }, series('b', '2026-07-22T19:00:00Z')],
      '2026-07-21T02:15:00Z');
    assert.equal(r.population, 'c_unrecoverable', 'cannot rank without the field');
  });

  it('CONSERVATIVE: no probe anchor stays (c)', () => {
    const r = classifyGame(
      minsea('g', '2026-07-21T02:00:00.000Z'),
      [series('a', '2026-07-21T02:00:00Z'), series('b', '2026-07-22T19:00:00Z')]);
    assert.equal(r.population, 'c_unrecoverable', 'disambiguation requires the boundary');
  });

  it('a single match is unaffected — no behaviour change off the ambiguous path', () => {
    const r = classifyGame(
      minsea('g', '2026-07-21T02:00:00.000Z'),
      [series('only', '2026-07-21T02:00:00Z')], '2026-07-21T02:15:00Z');
    assert.equal(r.population, 'b_discovery_recoverable');
    assert.match(r.detail, /matched on both teams \(home=/, 'the plain single-match detail, not the disambiguation one');
  });

  it('the runner threads the probe boundary into classification', async () => {
    const calls = { n: 0, dates: [] as string[] };
    const rep = await runDiscoverySample(
      { oddsapi_config: {} as never, api_key: 'K',
        fetchEvents: fixtureFetch({ '2026-07-21': [series('evt-leg1', '2026-07-21T02:00:00Z'), series('evt-leg2', '2026-07-22T19:00:00Z')] }, calls) },
      { games: [minsea('455f3873', '2026-07-21T02:00:00.000Z')], max_total_credits: 20, dry_run: false });
    assert.equal(rep.totals.n_b, 1, 'the real path disambiguates, not just the pure fn');
    assert.equal(rep.rows[0]!.matched_event_id, 'evt-leg1');
  });
});

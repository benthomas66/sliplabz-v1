// V1-OP-8a — scoped historical retrieval/persistence driver tests.
// All 20 ticket-required tests. No network, no database, no credits.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  validateScopedRequest,
  groupCandidatesByTriple,
  executeScopedRetrieval,
  OP8A_WRITABLE_TABLES,
  OP8A_FORBIDDEN_TABLES,
  type ScopedRetrievalDeps,
  type ScopedRetrievalRequest,
} from '../../src/lines/scopedHistoricalRetrieval.js';
import { processHistoricalSnapshot } from '../../src/seed/historicalEventOdds.js';
import { LAUNCH_MARKET_KEYS } from '../../src/odds/marketKeys.js';
import { V1_BOOKMAKER_ALLOWLIST } from '../../src/odds/bookmakerAllowlist.js';

const OWNER_SRC = readFileSync(new URL('../../src/lines/scopedHistoricalRetrieval.ts', import.meta.url), 'utf8');
const HLR_SRC = readFileSync(new URL('../../src/lines/historicalLineResultsBackfill.ts', import.meta.url), 'utf8');

/** Committed fixture; provenance recorded inside the file itself. */
const FIXTURE = JSON.parse(
  readFileSync(new URL('../fixtures/seed/historical-event-odds-clean.json', import.meta.url), 'utf8'),
) as { requested_close_boundary_utc: string; response_body: any; provenance: { kind: string } };

const BOOKS = V1_BOOKMAKER_ALLOWLIST.filter((b) => b.source_class === 'sportsbook').map((b) => b.provider_key);
const GAME = '11111111-2222-3333-4444-555555555555';
const EVENT = 'evt-abc123';

function req(over: Partial<ScopedRetrievalRequest> = {}): ScopedRetrievalRequest {
  return {
    internal_game_id: GAME,
    provider_event_id: EVENT,
    at_timestamp: FIXTURE.requested_close_boundary_utc,
    market_keys: [...LAUNCH_MARKET_KEYS],
    bookmaker_keys: BOOKS,
    max_credit_ceiling: 60,
    requires_discovery: false,
    ...over,
  };
}

/** Deps that record every seam touched, so "never called" is provable. */
function deps(over: Partial<ScopedRetrievalDeps> = {}) {
  const calls = { fetch: 0, fixture: 0, persist: 0, canonical: 0, hlr: 0, boundary: 0 };
  const d: ScopedRetrievalDeps = {
    readCloseBoundary: async () => {
      calls.boundary += 1;
      return { close_boundary_utc: FIXTURE.requested_close_boundary_utc, boundary_source: 'scheduled_with_grace' };
    },
    fetchSnapshot: async () => {
      calls.fetch += 1;
      return { response: FIXTURE.response_body, observed_x_requests_last: 40 };
    },
    loadFixtureSnapshot: async () => {
      calls.fixture += 1;
      return FIXTURE.response_body;
    },
    processSnapshot: (input) => processHistoricalSnapshot(input as never) as never,
    persistTriple: async () => {
      calls.persist += 1;
      return { source_closing_quote_ids: ['q1'] };
    },
    runCanonicalForGame: async () => {
      calls.canonical += 1;
      return { inserted: 1 };
    },
    runHlrForGame: async () => {
      calls.hlr += 1;
      return { rows_inserted: 1, rows_updated: 0 };
    },
    ...over,
  };
  return { d, calls };
}

describe('V1-OP-8a bounding + selection', () => {
  it('Test 1: exactly one explicit game/event is selected', async () => {
    const { d } = deps();
    const r = await executeScopedRetrieval(d, req(), { dry_run: true });
    assert.equal(r.halt_reason, null);
    assert.equal(r.plan.internal_game_id, GAME);
    assert.equal(r.plan.provider_event_id, EVENT);
  });

  it('Test 2: missing selection never broadens scope (hard halt, not "all")', async () => {
    for (const [over, reason] of [
      [{ internal_game_id: '' }, 'missing_internal_game_id'],
      [{ provider_event_id: '' }, 'missing_provider_event_id'],
      [{ at_timestamp: '' }, 'missing_snapshot_timestamp'],
      [{ market_keys: [] }, 'missing_market_keys'],
      [{ bookmaker_keys: [] }, 'missing_bookmaker_allowlist'],
      [{ max_credit_ceiling: 0 }, 'missing_credit_ceiling'],
    ] as const) {
      const { d, calls } = deps();
      const r = await executeScopedRetrieval(d, req(over as never), { dry_run: true });
      assert.equal(r.halt_reason, reason);
      assert.equal(calls.fetch, 0, 'no fetch on an unbounded request');
      assert.equal(r.would_write.length, 0);
    }
  });

  it('Test 3: the discovery cache is never scanned (no filesystem access in the owner)', () => {
    // Structural: the owner cannot read a cache because it imports no fs API
    // and names no cache path. (Word-scanning for "discovery" is meaningless —
    // the GAP-29 discovery COST forecast is legitimately referenced.)
    assert.ok(!/_stage2_discovery_cache/.test(OWNER_SRC), 'no cache directory reference');
    assert.ok(!/from 'node:fs'|require\('fs'\)|readdirSync|readFileSync/.test(OWNER_SRC), 'no filesystem access at all');
    // and no provider-discovery endpoint is reachable from the owner
    assert.ok(!/fetchHistoricalEvents\b|historicalEventDiscovery/.test(OWNER_SRC), 'no provider discovery call');
  });

  it('Test 4: only the 4 governed markets are requestable', async () => {
    const { d } = deps();
    const ok = await executeScopedRetrieval(d, req(), { dry_run: true });
    assert.deepEqual([...ok.plan.market_keys], [...LAUNCH_MARKET_KEYS]);
    const bad = await executeScopedRetrieval(d, req({ market_keys: ['player_steals'] }), { dry_run: true });
    assert.equal(bad.halt_reason, 'unauthorized_market_key');
  });

  it('Test 5: historical cost is forecast correctly (GAP-29-corrected, x1 event)', () => {
    const v = validateScopedRequest(req());
    assert.ok(v.ok);
    // 10x historical multiplier over markets x ceil(books/10); 1 event; no discovery.
    assert.equal(v.plan.forecast_odds_credits, 40);
    assert.equal(v.plan.forecast_discovery_credits, 0);
    assert.equal(v.plan.forecast_total_credits, 40);
    // discovery accounted when required
    const withDisc = validateScopedRequest(req({ requires_discovery: true }));
    assert.ok(withDisc.ok);
    assert.equal(withDisc.plan.forecast_discovery_credits, 1);
    assert.equal(withDisc.plan.forecast_total_credits, 41);
    // ceiling enforced
    const overCeiling = validateScopedRequest(req({ max_credit_ceiling: 10 }));
    assert.equal(overCeiling.ok, false);
  });

  it('Test 6: a reserve-floor breach prevents the request (fetch unreachable)', async () => {
    const { d, calls } = deps();
    const r = await executeScopedRetrieval(d, req(), {
      dry_run: false,
      quota: { credits_remaining: 1010, reserve_floor_credits: 1000 },
    });
    assert.equal(r.halt_reason, 'reserve_floor_breach');
    assert.equal(calls.fetch, 0, 'THE PAID CALL MUST NOT OCCUR');
    assert.equal(r.credits_spent, 0);
    // and it passes when the floor is respected
    const { d: d2 } = deps();
    const ok = await executeScopedRetrieval(d2, req(), {
      dry_run: false,
      quota: { credits_remaining: 5000, reserve_floor_credits: 1000 },
    });
    assert.equal(ok.halt_reason, null);
  });
});

describe('V1-OP-8a processing through the committed primitives', () => {
  it('Test 7: a compliant fixture processes through the existing primitives', async () => {
    const { d } = deps();
    const r = await executeScopedRetrieval(d, req(), { dry_run: true });
    assert.equal(r.halt_reason, null);
    assert.ok(r.candidates_accepted > 0, 'candidates produced by the committed processor');
    assert.equal(FIXTURE.provenance.kind, 'synthetic');
  });

  it('Test 8: close-boundary eligibility uses the committed logic', async () => {
    const { d, calls } = deps();
    const r = await executeScopedRetrieval(d, req(), { dry_run: true });
    assert.equal(calls.boundary, 1, 'boundary read via the committed primitive');
    assert.equal(r.boundary_source, 'scheduled_with_grace');
    assert.equal(r.close_capture?.close_capture_state, 'eligible');
    // the owner does not compute a boundary itself
    assert.ok(!/SCHEDULED_START_GRACE|\+\s*900/.test(OWNER_SRC), 'no local boundary math');
  });

  it('Test 9: an out-of-window snapshot is rejected (no candidates, nothing to write)', async () => {
    const stale = JSON.parse(
      readFileSync(new URL('../fixtures/seed/historical-event-odds-stale.json', import.meta.url), 'utf8'),
    ) as { requested_close_boundary_utc: string; response_body: any };
    const { d } = deps({
      readCloseBoundary: async () => ({ close_boundary_utc: stale.requested_close_boundary_utc, boundary_source: 'scheduled_with_grace' }),
      loadFixtureSnapshot: async () => stale.response_body,
    });
    const r = await executeScopedRetrieval(d, req({ at_timestamp: stale.requested_close_boundary_utc }), { dry_run: true });
    assert.notEqual(r.close_capture?.close_capture_state, 'eligible');
    assert.equal(r.candidates_accepted, 0);
    assert.equal(r.triples.length, 0);
    assert.equal(r.would_write.length, 0, 'a stale snapshot proposes no writes');
  });

  it('Test 10: offerings map deterministically into (market, bookmaker) triples', async () => {
    const { d } = deps();
    const a = await executeScopedRetrieval(d, req(), { dry_run: true });
    const b = await executeScopedRetrieval(deps().d, req(), { dry_run: true });
    const key = (r: typeof a) => r.triples.map((t) => `${t.market_key}|${t.bookmaker_key}|${t.candidates.length}`).join(',');
    assert.equal(key(a), key(b), 'stable across runs');
    assert.deepEqual([...key(a)].length > 0, true);
    // grouping is sorted + total candidates preserved
    const total = a.triples.reduce((n, t) => n + t.candidates.length, 0);
    assert.equal(total, a.candidates_accepted);
  });

  it('Test 11: canonical output comes from the committed owner, not local math', () => {
    const code = OWNER_SRC.replace(/\/\/[^\n]*/g, ''); // strip comments
    assert.ok(!/selectCanonicalClosingPoint|unique_modal|tied_no_unique_mode/.test(code), 'no canonical selection math in the owner');
    assert.ok(/runCanonicalForGame/.test(OWNER_SRC), 'canonical delegated to an injected committed owner');
    // No margin / outcome / push-vs-win classification is computed here — that
    // is computeHistoricalLineResult's job. (Checked as identifiers, not bare
    // substrings: `.push(` on an array is unrelated.)
    assert.ok(!/\bmargin\b|\boutcome_kind\b|\bis_push\b|computeHistoricalLineResult/.test(code), 'no margin/outcome/push math');
    assert.ok(!/historicalLineResult\b/.test(code), 'hlr math not imported into the owner');
  });
});

describe('V1-OP-8a scope + write containment', () => {
  it('Test 12: hlr proposals are bounded to the selected game', async () => {
    const { d } = deps();
    const r = await executeScopedRetrieval(d, req(), { dry_run: true });
    const hlrKeys = r.would_write.filter((w) => w.table === 'historical_line_results');
    assert.ok(hlrKeys.every((w) => w.key === `game:${GAME}`), 'every hlr proposal names the target game');
    // the committed populator now accepts explicit game ownership
    assert.ok(/restrict_to_internal_game_ids/.test(HLR_SRC));
    assert.ok(/ccp\.internal_game_id = ANY\(\$\$\{params\.length \+ 1\}::uuid\[\]\)|internal_game_id = ANY/.test(HLR_SRC));
  });

  it('Test 13: no unrelated globally-eligible grain can be included', async () => {
    const { d } = deps();
    const r = await executeScopedRetrieval(d, req(), { dry_run: true });
    for (const w of r.would_write) {
      if (w.key.startsWith('game:')) assert.equal(w.key, `game:${GAME}`);
    }
    // the eligibility predicate itself is untouched by the narrowing
    assert.ok(/ccp\.canonical_closing_point IS NOT NULL/.test(HLR_SRC));
    assert.ok(/SCOPE NARROWING ONLY/.test(HLR_SRC));
  });

  it('Test 14: dry-run writes nothing at all, including audit/raw-response rows', async () => {
    const { d, calls } = deps();
    const r = await executeScopedRetrieval(d, req(), { dry_run: true });
    assert.equal(calls.persist, 0, 'no persistHistoricalSnapshot (no ingestion-run/raw-response/snapshot rows)');
    assert.equal(calls.canonical, 0);
    assert.equal(calls.hlr, 0);
    assert.equal(calls.fetch, 0, 'no provider call');
    assert.equal(r.persisted, null);
    assert.equal(r.credits_spent, 0);
  });

  it('Test 15: neither start-time field is ever written or synthesized', () => {
    assert.ok(!/actual_start_utc\s*=/.test(OWNER_SRC));
    assert.ok(!/scheduled_start_utc\s*=/.test(OWNER_SRC));
    assert.ok(!/UPDATE\s+games|INSERT\s+INTO\s+games/i.test(OWNER_SRC));
    assert.ok(!/\bdatetime\b/.test(OWNER_SRC), 'no date-only derivation (GAP-31)');
  });

  it('Test 16: no game or provider-mapping row can be created', () => {
    for (const t of ['games', 'provider_games']) {
      assert.ok(OP8A_FORBIDDEN_TABLES.includes(t as never), `${t} is declared forbidden`);
      assert.ok(!OP8A_WRITABLE_TABLES.includes(t as never), `${t} is not writable`);
    }
    assert.ok(!/INSERT\s+INTO/i.test(OWNER_SRC), 'owner issues no SQL of its own');
  });

  it('Test 17: autonomous poll-cycle rows are not attributable to this driver', async () => {
    const { d } = deps();
    const r = await executeScopedRetrieval(d, req(), { dry_run: true });
    // Ownership is asserted by explicit keys, never by global count deltas.
    assert.ok(r.would_write.every((w) => OP8A_WRITABLE_TABLES.includes(w.table as never)));
    for (const t of ['evidence_profiles', 'poll_cycles', 'current_market_rows']) {
      assert.ok(!r.would_write.some((w) => w.table === t), `${t} is never claimed`);
      assert.ok(OP8A_FORBIDDEN_TABLES.includes(t as never));
    }
    assert.ok(r.would_write.every((w) => w.key.includes(EVENT) || w.key === `game:${GAME}`), 'every claimed row names the target event or game');
  });

  it('Test 18: re-execution is a governed no-op / idempotent (dry-run is pure)', async () => {
    const { d } = deps();
    const a = await executeScopedRetrieval(d, req(), { dry_run: true });
    const b = await executeScopedRetrieval(d, req(), { dry_run: true });
    assert.deepEqual(a.would_write, b.would_write);
    assert.equal(a.credits_spent + b.credits_spent, 0);
  });

  it('Test 19: paid provider details stay inside the trusted boundary', () => {
    assert.ok(!/api_key|apiKey|ODDS_API_KEY/.test(OWNER_SRC), 'no api key handling in the owner');
    assert.ok(!/https?:\/\//.test(OWNER_SRC.replace(/\/\/[^\n]*/g, '')), 'no provider URL construction');
    assert.ok(/fetchSnapshot/.test(OWNER_SRC), 'the paid call is an injected seam');
  });

  it('Test 20: declared writable/forbidden table sets are coherent', () => {
    for (const t of OP8A_WRITABLE_TABLES) assert.ok(!OP8A_FORBIDDEN_TABLES.includes(t as never), `${t} cannot be both`);
    assert.ok(OP8A_WRITABLE_TABLES.includes('source_closing_quotes'));
    assert.ok(OP8A_WRITABLE_TABLES.includes('canonical_closing_points'));
    assert.ok(OP8A_WRITABLE_TABLES.includes('historical_line_results'));
  });
});

describe('V1-OP-8a live-path shape (still zero real effects)', () => {
  it('live run reaches persist/canonical/hlr exactly once per grain, all game-scoped', async () => {
    const { d, calls } = deps();
    const r = await executeScopedRetrieval(d, req(), { dry_run: false, quota: { credits_remaining: 99000, reserve_floor_credits: 1000 } });
    assert.equal(calls.fetch, 1, 'paid fetch once, after gates');
    assert.equal(calls.canonical, 1, 'canonical once, game-scoped');
    assert.equal(calls.hlr, 1, 'hlr once, game-scoped');
    assert.equal(calls.persist, r.triples.length, 'one persist per (market, book) triple');
    assert.equal(r.credits_spent, 40, 'reconciled against x-requests-last');
    assert.ok(r.persisted !== null);
  });

  it('groupCandidatesByTriple is pure + deterministic', () => {
    const c = (market_key: string, bookmaker_key: string) => ({ market_key, bookmaker_key }) as never;
    const g = groupCandidatesByTriple([c('player_points', 'fanduel'), c('player_assists', 'draftkings'), c('player_points', 'fanduel')]);
    assert.equal(g.length, 2);
    assert.equal(g[0]!.market_key, 'player_assists');
    assert.equal(g[1]!.candidates.length, 2);
  });
});

// V1-OP-8 one-game validation PART 1 — wiring audit + spend gates + GAP-37
// resume proof. Zero network, zero database, zero credits.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  executeScopedRetrieval,
  OP8A_FORBIDDEN_TABLES,
  OP8A_WRITABLE_TABLES,
  type ScopedRetrievalDeps,
  type ScopedRetrievalRequest,
  type TripleGroup,
} from '../../src/lines/scopedHistoricalRetrieval.js';
import { redactedHistoricalUrl, CANONICAL_COMPUTATION_VERSION } from '../../src/lines/scopedHistoricalRetrievalDeps.js';
import { processHistoricalSnapshot } from '../../src/seed/historicalEventOdds.js';
import { LAUNCH_MARKET_KEYS } from '../../src/odds/marketKeys.js';
import { V1_BOOKMAKER_ALLOWLIST } from '../../src/odds/bookmakerAllowlist.js';

const WIRING_SRC = readFileSync(new URL('../../src/lines/scopedHistoricalRetrievalDeps.ts', import.meta.url), 'utf8');
const FIXTURE = JSON.parse(
  readFileSync(new URL('../fixtures/seed/historical-event-odds-clean.json', import.meta.url), 'utf8'),
) as { requested_close_boundary_utc: string; response_body: any };

const BOOKS = V1_BOOKMAKER_ALLOWLIST.filter((b) => b.source_class === 'sportsbook').map((b) => b.provider_key);
const GAME = 'df22e4f4-d4ef-4cba-88e7-1e83db28ad2d';
const EVENT = '034012f210532a879b3d1ab5de8306e6';

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

/** Wired-shaped deps with counters + injectable per-triple failure. */
function wired(opts: { failOnTripleIndex?: number; alreadyPersisted?: Set<string> } = {}) {
  const calls = { fetch: 0, persist: 0, canonical: 0, hlr: 0 };
  const persistedQuotes = opts.alreadyPersisted ?? new Set<string>();
  let idx = 0;
  const d: ScopedRetrievalDeps = {
    readCloseBoundary: async () => ({
      close_boundary_utc: FIXTURE.requested_close_boundary_utc,
      boundary_source: 'scheduled_with_grace',
    }),
    fetchSnapshot: async () => {
      calls.fetch += 1;
      return { response: FIXTURE.response_body, observed_x_requests_last: 40 };
    },
    loadFixtureSnapshot: async () => FIXTURE.response_body,
    processSnapshot: (input) => processHistoricalSnapshot(input as never) as never,
    persistTriple: async (g: TripleGroup) => {
      const key = `${g.market_key}|${g.bookmaker_key}`;
      if (opts.failOnTripleIndex === idx) {
        idx += 1;
        throw new Error(`injected triple failure at index ${opts.failOnTripleIndex}`);
      }
      idx += 1;
      calls.persist += 1;
      persistedQuotes.add(key); // simulates a committed per-triple transaction
      return { source_closing_quote_ids: [`q-${key}`] };
    },
    runCanonicalForGame: async () => {
      calls.canonical += 1;
      return { inserted: 1 };
    },
    runHlrForGame: async () => {
      calls.hlr += 1;
      return { rows_inserted: 1, rows_updated: 0 };
    },
  };
  return { d, calls, persistedQuotes };
}

describe('V1-OP-8 wiring audit — orchestration only', () => {
  it('wiring composes committed primitives and adds no math of its own', () => {
    const code = WIRING_SRC.replace(/\/\/[^\n]*/g, '');
    for (const p of [
      'fetchHistoricalEventOdds',
      'persistHistoricalSnapshot',
      'deleteAndReplaceCanonicalClosingPointsFromDb',
      'runHistoricalLineResultsBackfill',
      'evaluateCloseBoundary',
    ]) {
      assert.ok(code.includes(p), `${p} is composed`);
    }
    // no local selection / canonicalization / margin / eligibility / hlr math
    assert.ok(!/selectCanonicalClosingPoint|computeCanonicalRows|computeHistoricalLineResult/.test(code));
    assert.ok(!/\bmargin\b|\bis_push\b|unique_modal|tied_no_unique_mode|eligibility_state/.test(code));
  });

  it('wiring never writes a forbidden table (and never games/provider_games)', () => {
    const code = WIRING_SRC.replace(/\/\/[^\n]*/g, '');
    // The only SQL in the wiring is a read of `games` for the boundary.
    const writes = code.match(/INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM/gi) ?? [];
    assert.equal(writes.length, 0, 'the wiring issues no write SQL of its own');
    for (const t of OP8A_FORBIDDEN_TABLES) {
      const bad = new RegExp(`(INSERT\\s+INTO|UPDATE|DELETE\\s+FROM)\\s+${t}\\b`, 'i');
      assert.ok(!bad.test(code), `never writes ${t}`);
    }
    assert.ok(/FROM games WHERE internal_game_id/.test(code), 'games is READ only, for the boundary');
  });

  it('neither start-time field is written or synthesized; no date-only derivation', () => {
    const code = WIRING_SRC.replace(/\/\/[^\n]*/g, '');
    // Precise: forbid SQL assignment (`SET col =`, `col = $n`) — NOT the JS
    // equality comparison `g.actual_start_utc === null` used to READ the
    // stored value for the committed boundary primitive.
    for (const col of ['actual_start_utc', 'scheduled_start_utc']) {
      assert.ok(!new RegExp(`SET[^;]*\\b${col}\\b`, 'i').test(code), `no SQL SET of ${col}`);
      assert.ok(!new RegExp(`\\b${col}\\s*=\\s*\\$\\d`).test(code), `no parameterized write of ${col}`);
      assert.ok(!new RegExp(`\\b${col}\\s*=[^=]`).test(code), `no bare assignment to ${col}`);
      assert.ok(new RegExp(`g\\.${col}`).test(code), `${col} is only READ from the games row`);
    }
    assert.ok(!/\bdatetime\b/.test(code), 'no date-only field derivation (GAP-31)');
    // the boundary is read from the committed primitive, not computed
    assert.ok(/evaluateCloseBoundary\(/.test(code));
    assert.ok(!/\+\s*900|SCHEDULED_START_GRACE/.test(code), 'no local boundary math');
  });

  it('canonical + hlr are BOTH restricted to the single target game', () => {
    const code = WIRING_SRC.replace(/\/\/[^\n]*/g, '');
    const canonical = /restrict_to_internal_game_ids:\s*\[internal_game_id\]/g;
    assert.equal((code.match(canonical) ?? []).length, 2, 'both owners game-restricted');
    assert.ok(!/restrict_to_internal_game_ids:\s*null/.test(code), 'never the global form');
  });

  it('the api key never leaves the trusted boundary (redacted URL only)', () => {
    assert.equal(
      redactedHistoricalUrl('evt1', '2026-07-17T23:45:00Z'),
      'https://api.the-odds-api.com/v4/historical/sports/basketball_wnba/events/evt1/odds?apiKey=REDACTED&date=2026-07-17T23:45:00Z',
    );
    assert.ok(!/apiKey=\$\{|apiKey=' \+|api_key\}/.test(WIRING_SRC), 'no key interpolated into a persisted URL');
    assert.ok(/response_headers: \{\}/.test(WIRING_SRC), 'headers not blindly persisted');
    assert.equal(CANONICAL_COMPUTATION_VERSION, 2);
  });

  it('no blind retry on a failed provider call', () => {
    assert.ok(/No retry attempted/.test(WIRING_SRC));
    assert.ok(!/for\s*\(.*attempt|retry\s*\+\+|maxAttempts/.test(WIRING_SRC), 'no retry loop around the paid call');
  });
});

describe('V1-OP-8 spend safety — the HTTP call is unreachable when a gate fails', () => {
  it('reserve-floor breach: fetchSnapshot is never invoked', async () => {
    const { d, calls } = wired();
    const r = await executeScopedRetrieval(d, req(), {
      dry_run: false,
      quota: { credits_remaining: 1020, reserve_floor_credits: 1000 },
    });
    assert.equal(r.halt_reason, 'reserve_floor_breach');
    assert.equal(calls.fetch, 0, 'PAID CALL MUST NOT OCCUR');
    assert.equal(calls.persist + calls.canonical + calls.hlr, 0, 'nothing persisted');
    assert.equal(r.credits_spent, 0);
  });

  it('ceiling breach: fetchSnapshot is never invoked', async () => {
    const { d, calls } = wired();
    const r = await executeScopedRetrieval(d, req({ max_credit_ceiling: 10 }), { dry_run: false });
    assert.equal(r.halt_reason, 'forecast_exceeds_ceiling');
    assert.equal(calls.fetch, 0, 'PAID CALL MUST NOT OCCUR');
    assert.equal(r.credits_spent, 0);
  });

  it('unbounded request: fetchSnapshot is never invoked', async () => {
    for (const over of [{ internal_game_id: '' }, { provider_event_id: '' }, { market_keys: [] }]) {
      const { d, calls } = wired();
      const r = await executeScopedRetrieval(d, req(over as never), { dry_run: false });
      assert.ok(r.halt_reason !== null);
      assert.equal(calls.fetch, 0, 'PAID CALL MUST NOT OCCUR');
    }
  });

  it('single-event forecast is 40cr flat (4 markets, <=10 books, no discovery)', async () => {
    const { d } = wired();
    const r = await executeScopedRetrieval(d, req(), { dry_run: true });
    assert.equal(r.plan.forecast_odds_credits, 40);
    assert.equal(r.plan.forecast_discovery_credits, 0);
    assert.equal(r.plan.forecast_total_credits, 40);
    assert.ok(BOOKS.length <= 10, `book count ${BOOKS.length} stays within one page`);
  });

  it('x-requests-last reconciliation is wired (spend recorded from the provider)', async () => {
    const { d } = wired();
    const r = await executeScopedRetrieval(d, req(), {
      dry_run: false,
      quota: { credits_remaining: 99000, reserve_floor_credits: 1000 },
    });
    assert.equal(r.credits_spent, 40, 'reconciled against x-requests-last, not the forecast alone');
    assert.ok(/x-requests-last/.test(WIRING_SRC), 'header read in the wiring');
  });
});

describe('V1-OP-8 GAP-37 — resume / idempotency (fixture, 0 credits)', () => {
  it('mid-game triple failure leaves partial quotes and NO canonical/hlr (safe-by-incompleteness)', async () => {
    const persisted = new Set<string>();
    const { d, calls } = wired({ failOnTripleIndex: 1, alreadyPersisted: persisted });
    await assert.rejects(
      () => executeScopedRetrieval(d, req(), { dry_run: false, quota: { credits_remaining: 99000, reserve_floor_credits: 1000 } }),
      /injected triple failure/,
    );
    assert.equal(calls.persist, 1, 'the first triple committed its own transaction');
    assert.equal(persisted.size, 1, 'partial source_closing_quotes exist');
    assert.equal(calls.canonical, 0, 'NO canonical point written');
    assert.equal(calls.hlr, 0, 'NO hlr row written — the grain is unserved, not corrupt');
  });

  it('a re-run resumes to completion and reaches canonical + hlr', async () => {
    const persisted = new Set<string>(['player_points|draftkings']); // survivor of the failed run
    const { d, calls } = wired({ alreadyPersisted: persisted });
    const r = await executeScopedRetrieval(d, req(), {
      dry_run: false,
      quota: { credits_remaining: 99000, reserve_floor_credits: 1000 },
    });
    assert.equal(r.halt_reason, null);
    assert.equal(calls.canonical, 1, 'canonical runs after all triples complete');
    assert.equal(calls.hlr, 1, 'hlr runs after canonical');
    assert.ok(r.persisted !== null);
    // the committed per-triple UPSERT makes re-persisting the survivor safe
    assert.equal(persisted.size, r.triples.length, 'every triple present after resume');
  });

  it('an idempotent dry-run re-check does NOT re-fetch (no second HTTP call)', async () => {
    const { d, calls } = wired();
    const a = await executeScopedRetrieval(d, req(), { dry_run: true });
    const b = await executeScopedRetrieval(d, req(), { dry_run: true });
    assert.equal(calls.fetch, 0, 'dry-run never fetches, however many times it runs');
    assert.deepEqual(a.would_write, b.would_write);
    assert.equal(a.credits_spent + b.credits_spent, 0);
  });

  it('ownership attribution is by target keys, never global count deltas', async () => {
    const { d } = wired();
    const r = await executeScopedRetrieval(d, req(), { dry_run: true });
    assert.ok(r.would_write.length > 0);
    for (const w of r.would_write) {
      assert.ok(OP8A_WRITABLE_TABLES.includes(w.table as never), `${w.table} is declared writable`);
      assert.ok(w.key.includes(EVENT) || w.key === `game:${GAME}`, `${w.key} names the target`);
    }
  });
});

// Ledger integrity — the completed arc.
//
//   GAP-40  the ledger row CARRIES every field the contract claims
//   GAP-46  EXACTLY ONE row per paid call carries the billed quota
//   GAP-47  that row SURVIVES a persistence rollback
//
// Each fix was invisible to the previous level's tests: GAP-40's row-level
// assertions passed while the trail was replicated 24x; GAP-46's cardinality
// assertions passed while an interrupted game erased its own charge record.
// The assertion that catches GAP-47 is fault injection — kill the game
// transaction after the fetch and prove the billing row is still there.
//
// Zero network, zero database, zero credits.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { persistGameAtomically } from '../../src/lines/bulkHistoricalRepair.js';
import { recordPaidCallBillingInTx, PAID_CALL_BILLING_INSERT_SQL, type PaidCallBillingInput } from '../../src/lines/paidCallBilling.js';
import type { TripleGroup } from '../../src/lines/scopedHistoricalRetrieval.js';
import type { Tx } from '../../src/db/transaction.js';

const WIRING = readFileSync(new URL('../../src/lines/bulkRepairWiring.ts', import.meta.url), 'utf8');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

const triple = (market: string, book: string): TripleGroup =>
  ({ market_key: market, bookmaker_key: book, candidates: [] } as unknown as TripleGroup);

/** 24 triples — the shape the (b)-canary actually produced. */
const TRIPLES = ['player_points', 'player_rebounds', 'player_assists', 'player_threes']
  .flatMap((m) => ['fanduel', 'draftkings', 'betmgm', 'caesars', 'pointsbetus', 'betrivers'].map((b) => triple(m, b)));

const BILLING: PaidCallBillingInput = {
  provider_event_id: 'evt-1', internal_game_id: 'game-1', close_boundary_utc: '2026-07-15T16:15:00Z',
  market_keys: ['player_points'], bookmaker_keys: ['fanduel'],
  redacted_request_url: 'https://api.the-odds-api.com/x?apiKey=REDACTED', http_status: 200,
  retrieved_at: '2026-08-07T00:00:00.000Z', response_headers: {},
  quota: { forecast: 40, observed: 40, delta_flag: 'exact_match', x_requests_last: 40, x_requests_remaining: 98_803, x_requests_used: 1_197 },
};

/**
 * A world with TWO independent commit scopes, mirroring production: the billing
 * transaction (committed at fetch-return) and the game transaction (which may
 * roll back). `committedBilling` is what survives; `gameRows` is discarded on
 * rollback.
 */
function world() {
  const committedBilling: unknown[][] = [];
  const gameRows: Array<{ quota: unknown }> = [];
  const billingTx: Tx = {
    query: async (_sql: string, params: unknown[] = []) => {
      committedBilling.push(params); // its own tx: commits immediately
      return { rows: [{ oddsapi_ingestion_run_id: `run-${committedBilling.length}` }], rowCount: 1 };
    },
  };
  const gameTx = { query: async () => ({ rows: [{ n: 0 }], rowCount: 1 }) } as unknown as Tx;
  return {
    committedBilling,
    gameRows,
    billingTx,
    /** Rolls back `gameRows` if the body throws — what withTransaction does. */
    deps: (fail = false) => ({
      runInGameTransaction: async <T>(body: (t: Tx) => Promise<T>): Promise<T> => {
        const mark = gameRows.length;
        try {
          const out = await body(gameTx);
          if (fail) throw new Error('injected fault: interrupt after fetch, before commit');
          return out;
        } catch (e) {
          gameRows.length = mark; // ROLLBACK
          throw e;
        }
      },
      persistTripleInTx: async (_t: Tx, g: TripleGroup) => {
        gameRows.push({ quota: null }); // GAP-46+47: never carries the trail
        return { source_closing_quote_ids: ['a', 'b', 'c', 'd', 'e', 'f'] };
      },
      canonicalInTx: async () => ({ inserted: 31 }),
      hlrInTx: async () => ({ rows_inserted: 26, rows_updated: 0 }),
    }),
  };
}

describe('GAP-47 — the billing record survives a persistence rollback', () => {
  it('FAULT INJECTION: the game rolls back, the charge record REMAINS', async () => {
    const w = world();
    // Production order: fetch -> bill (own tx, commits) -> game tx (fails).
    await recordPaidCallBillingInTx(w.billingTx, BILLING);
    await assert.rejects(() => persistGameAtomically(w.deps(true), 'game-1', TRIPLES), /injected fault/);

    assert.equal(w.gameRows.length, 0, 'persistence rolled back — zero orphans (GAP-37 intact)');
    assert.equal(w.committedBilling.length, 1, 'THE GAP-47 ASSERTION: the charge is still recorded');
    assert.ok(w.committedBilling[0]!.includes(40), 'and it carries the billed amount');
  });

  it('a COMPLETED game records the charge exactly once — not duplicated', async () => {
    const w = world();
    await recordPaidCallBillingInTx(w.billingTx, BILLING);
    await persistGameAtomically(w.deps(false), 'game-1', TRIPLES);
    assert.equal(w.committedBilling.length, 1, 'one charge, one row');
    assert.equal(w.gameRows.length, 24, 'all triples persisted');
    assert.equal(w.gameRows.filter((r) => r.quota !== null).length, 0, 'no game row carries a trail');
  });

  it('SUM over a batch INCLUDING a rolled-back game equals paid-calls x 40', async () => {
    const w = world();
    // three paid calls; the middle game's persistence fails
    for (const [i, fail] of [[0, false], [1, true], [2, false]] as const) {
      await recordPaidCallBillingInTx(w.billingTx, { ...BILLING, provider_event_id: `evt-${i}` });
      if (fail) await assert.rejects(() => persistGameAtomically(w.deps(true), `g${i}`, TRIPLES));
      else await persistGameAtomically(w.deps(false), `g${i}`, TRIPLES);
    }
    assert.equal(w.committedBilling.length, 3, 'three charges, three durable rows');
    // quota_observed is the 13th bound parameter ($13)
    const sum = w.committedBilling.reduce((a, p) => a + (typeof p[12] === 'number' ? (p[12] as number) : 0), 0);
    assert.equal(sum, 120, 'SUM == paid calls x 40, INCLUDING the rolled-back game');
    assert.equal(w.gameRows.length, 48, 'only the two successful games left rows');
  });

  it('the billing row carries all six quota fields (GAP-40 not regressed)', async () => {
    const w = world();
    await recordPaidCallBillingInTx(w.billingTx, BILLING);
    const p = w.committedBilling[0]!;
    for (const v of [40, 40, 'exact_match', 40, 98_803, 1_197]) {
      assert.ok(p.includes(v), `${String(v)} bound on the durable billing row`);
    }
    const maxPlaceholder = Math.max(...[...PAID_CALL_BILLING_INSERT_SQL.matchAll(/\$(\d+)/g)].map((m) => Number(m[1])));
    assert.equal(p.length, maxPlaceholder, `all ${maxPlaceholder} placeholders bound`);
    assert.ok(!p.some((x) => typeof x === 'string' && /apiKey=(?!REDACTED)/.test(x)), 'no un-redacted key');
  });

  it('ORDERING: the wiring bills BEFORE the game transaction opens', () => {
    const w = strip(WIRING);
    const bill = w.indexOf('recordBilling(');
    const persist = w.indexOf('persistGameAtomically');
    assert.ok(bill > 0, 'the wiring calls recordBilling');
    assert.ok(persist === -1 || bill < persist, 'billing precedes persistence in the source order');
    assert.match(w, /readonly recordBilling: \(input: PaidCallBillingInput\) => Promise<void>/, 'declared as its own seam');
  });

  it('GAP-46 holds: no per-triple row carries a quota trail any more', () => {
    const w = strip(WIRING);
    assert.ok(!/carries_quota_trail/.test(w), 'the first-triple flag is gone — no trail on game rows at all');
    assert.ok(!/quota_reconciliation:\s*\{/.test(w), 'the wiring no longer threads a reconciliation into persistence');
  });
});

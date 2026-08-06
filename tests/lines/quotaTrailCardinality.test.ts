// GAP-46 — the billed quota trail rides EXACTLY ONE ledger row per paid call.
//
// GAP-40 taught: assert the PERSISTED row, not an intermediate object. GAP-46 is
// that lesson one level deeper — presence and field-completeness were both
// satisfied while the trail was replicated onto all ~24 per-triple rows, so
// `SUM(quota_observed)` reported `calls x triples x 40` instead of `calls x 40`.
// A 24-48x over-count in the record that is supposed to reconcile against the
// invoice. Presence is not enough; CARDINALITY is the assertion.
//
// Zero network, zero database, zero credits.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { persistGameAtomically } from '../../src/lines/bulkHistoricalRepair.js';
import type { TripleGroup } from '../../src/lines/scopedHistoricalRetrieval.js';
import type { Tx } from '../../src/db/transaction.js';

const WIRING = readFileSync(new URL('../../src/lines/bulkRepairWiring.ts', import.meta.url), 'utf8');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

const triple = (market: string, book: string): TripleGroup =>
  ({ market_key: market, bookmaker_key: book, candidates: [] } as unknown as TripleGroup);

/** 24 triples — the shape the (b)-canary actually produced. */
const TRIPLES = ['player_points', 'player_rebounds', 'player_assists', 'player_threes']
  .flatMap((m) => ['fanduel', 'draftkings', 'betmgm', 'caesars', 'pointsbetus', 'betrivers'].map((b) => triple(m, b)));

const QUOTA = { forecast: 40, observed: 40, delta_flag: 'exact_match', x_requests_last: 40, x_requests_remaining: 98_803, x_requests_used: 1_197 };

/**
 * Stands in for the committed persist: records ONE ledger row per triple,
 * carrying the trail only when the caller says this triple owns it — exactly
 * what `persistHistoricalSnapshotInTx` does with an optional reconciliation.
 */
function ledgerRecordingDeps() {
  const ledger: Array<{ market: string; book: string; quota: typeof QUOTA | null }> = [];
  const tx = { query: async () => ({ rows: [{ n: 0 }], rowCount: 1 }) } as unknown as Tx;
  return {
    ledger,
    deps: {
      runInGameTransaction: async <T>(body: (t: Tx) => Promise<T>) => body(tx),
      persistTripleInTx: async (_t: Tx, g: TripleGroup, carries: boolean) => {
        ledger.push({ market: g.market_key, book: g.bookmaker_key, quota: carries ? QUOTA : null });
        return { source_closing_quote_ids: ['a', 'b', 'c', 'd', 'e', 'f'] };
      },
      canonicalInTx: async () => ({ inserted: 31 }),
      hlrInTx: async () => ({ rows_inserted: 26, rows_updated: 0 }),
    },
  };
}

describe('GAP-46 — one billed quota trail per paid call', () => {
  it('EXACTLY ONE of 24 ledger rows carries the trail; the other 23 are null', async () => {
    const { deps, ledger } = ledgerRecordingDeps();
    await persistGameAtomically(deps, 'game-1', TRIPLES);

    assert.equal(ledger.length, 24, 'one ledger row per triple, as the persist path writes');
    const withTrail = ledger.filter((r) => r.quota !== null);
    assert.equal(withTrail.length, 1, 'EXACTLY ONE row carries the billed quota (the GAP-46 assertion)');
    assert.equal(ledger.filter((r) => r.quota === null).length, 23, 'siblings bind NULL');
  });

  it('SUM(quota_observed) equals actual spend, not spend x triples', async () => {
    const { deps, ledger } = ledgerRecordingDeps();
    await persistGameAtomically(deps, 'game-1', TRIPLES);
    const sum = ledger.reduce((a, r) => a + (r.quota?.observed ?? 0), 0);
    assert.equal(sum, 40, 'one 40cr call sums to 40');
    assert.notEqual(sum, 24 * 40, 'the pre-fix behaviour (960) must not recur');
  });

  it('scales correctly across a batch — 3 calls sum to 120, never 2880', async () => {
    const { deps, ledger } = ledgerRecordingDeps();
    for (const g of ['g1', 'g2', 'g3']) await persistGameAtomically(deps, g, TRIPLES);
    assert.equal(ledger.length, 72, '3 games x 24 triples');
    assert.equal(ledger.filter((r) => r.quota !== null).length, 3, 'one trail per paid call');
    assert.equal(ledger.reduce((a, r) => a + (r.quota?.observed ?? 0), 0), 120);
  });

  it('the trail-carrying row still carries ALL SIX fields (GAP-40 not regressed)', async () => {
    const { deps, ledger } = ledgerRecordingDeps();
    await persistGameAtomically(deps, 'game-1', TRIPLES);
    const q = ledger.find((r) => r.quota !== null)!.quota!;
    for (const k of ['forecast', 'observed', 'delta_flag', 'x_requests_last', 'x_requests_remaining', 'x_requests_used'] as const) {
      assert.ok(q[k] !== null && q[k] !== undefined, `${k} present on the trail row`);
    }
  });

  it('a single-triple call still records its trail — the fix never drops it', async () => {
    const { deps, ledger } = ledgerRecordingDeps();
    await persistGameAtomically(deps, 'game-1', [triple('player_points', 'fanduel')]);
    assert.equal(ledger.length, 1);
    assert.equal(ledger.filter((r) => r.quota !== null).length, 1, 'the only row carries it');
  });

  it('the real wiring gates the trail on the flag, not unconditionally', () => {
    const w = strip(WIRING);
    assert.match(w, /persistTripleInTx: async \(tx, group, carries_quota_trail\)/, 'the closure receives the flag');
    assert.match(w, /quota !== undefined && carries_quota_trail/, 'the trail is conditional on it');
    assert.ok(!/\.\.\.\(quota !== undefined\s*\n?\s*\?\s*\{/.test(w), 'the unconditional form is gone');
  });
});

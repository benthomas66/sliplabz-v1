// GAP-38 / GAP-40 completeness proof — MIGRATED to the billing row (GAP-47).
//
// This suite originally proved that `persistHistoricalSnapshot` wrote the six
// quota columns rather than leaving them null. GAP-47 removed
// `quota_reconciliation` from that contract entirely: billing can no longer be
// written inside a rollback-capable persist transaction by any path, because
// the parameter no longer exists. The footgun is gone, not merely unloaded.
//
// The completeness proof is NOT dropped — it moves to where billing now lives,
// `recordPaidCallBillingInTx`. What it guarantees is unchanged: every field the
// contract claims to persist reaches the row, non-null.
//
// Zero network, zero database, zero credits.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  recordPaidCallBillingInTx,
  PAID_CALL_BILLING_INSERT_SQL,
  type PaidCallBillingInput,
} from '../../src/lines/paidCallBilling.js';
import type { Tx } from '../../src/db/transaction.js';

const PERSIST = readFileSync(new URL('../../src/seed/orchestrator/persistHistoricalSnapshot.ts', import.meta.url), 'utf8');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

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

const base: PaidCallBillingInput = {
  provider_event_id: 'evt-1', internal_game_id: 'game-1', close_boundary_utc: '2026-07-15T16:15:00Z',
  market_keys: ['player_points'], bookmaker_keys: ['fanduel'],
  redacted_request_url: 'https://api.the-odds-api.com/x?apiKey=REDACTED', http_status: 200,
  retrieved_at: '2026-08-07T00:00:00.000Z', response_headers: {},
  quota: { forecast: 40, observed: 40, delta_flag: 'exact_match', x_requests_last: 40, x_requests_remaining: 99_347, x_requests_used: 653 },
};

describe('GAP-38/40 completeness — the BILLING row carries all six quota fields', () => {
  it('TEST 1 (positive population): all six columns are actually written, not left null', async () => {
    const { tx, stmts } = recordingTx();
    await recordPaidCallBillingInTx(tx, base);
    const ins = stmts[0]!;
    for (const col of ['quota_forecast', 'quota_observed', 'quota_delta_flag', 'x_requests_last', 'x_requests_remaining', 'x_requests_used']) {
      assert.ok(ins.sql.includes(col), `${col} is in the INSERT column list`);
    }
    const tail = ins.params.slice(-6);
    assert.deepEqual(tail, [40, 40, 'exact_match', 40, 99_347, 653], `persisted quota params were ${JSON.stringify(tail)}`);
    assert.ok(tail.every((v) => v !== null && v !== undefined), 'NO ledger column lands null');
    const maxPlaceholder = Math.max(...[...PAID_CALL_BILLING_INSERT_SQL.matchAll(/\$(\d+)/g)].map((m) => Number(m[1])));
    assert.equal(ins.params.length, maxPlaceholder, `all ${maxPlaceholder} placeholders bound`);
  });

  it('TEST 2 (delta-flag semantics): exact_match and divergence are both pinned', async () => {
    for (const flag of ['exact_match', 'observed_lower_than_forecast', 'observed_higher_than_forecast', 'observed_missing'] as const) {
      const { tx, stmts } = recordingTx();
      await recordPaidCallBillingInTx(tx, { ...base, quota: { ...base.quota, delta_flag: flag } });
      assert.ok(stmts[0]!.params.includes(flag), `${flag} reaches the row verbatim`);
    }
  });

  it('a null observed (provider gave no header) still writes the row', async () => {
    const { tx, stmts } = recordingTx();
    await recordPaidCallBillingInTx(tx, {
      ...base,
      quota: { ...base.quota, observed: null, delta_flag: 'observed_missing', x_requests_last: null },
    });
    assert.equal(stmts.length, 1, 'the charge is still recorded — a missing header is not a missing charge');
    assert.ok(stmts[0]!.params.includes('observed_missing'));
  });

  it('GAP-47 CLASS CLOSURE: the persist contract can no longer carry billing', () => {
    const p = strip(PERSIST);
    assert.ok(!/quota_reconciliation/.test(p), 'the parameter is REMOVED from the persist contract entirely');
    // the columns remain in the INSERT, bound to NULL — lineage rows never bill
    assert.match(p, /quota_forecast/, 'the columns still exist on the table');
    assert.ok(!/input\.quota/.test(p), 'no quota value can be threaded in from a caller');
  });

  it('LEDGER-TRUTH INVARIANT: quota_observed IS NOT NULL means exactly "billing row"', () => {
    // Lineage rows bind NULL (asserted above); billing rows always bind a
    // forecast. So SUM(quota_observed) = total spend and
    // COUNT(*) WHERE quota_observed IS NOT NULL = paid calls, with no pollution.
    assert.match(PAID_CALL_BILLING_INSERT_SQL, /quota_forecast/);
    assert.match(PAID_CALL_BILLING_INSERT_SQL, /\$12,\$13,\$14::quota_delta_flag,\$15,\$16,\$17/);
  });
});

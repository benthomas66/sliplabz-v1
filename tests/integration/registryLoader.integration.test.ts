// V1-5 governor ledger #6 integration test — registry loader.

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { loadRegistries } from '../../src/computation/registry/registryLoader.js';
import { openTestDb } from './support/db.js';
import type { SliplabzPool } from '../../src/db/connection.js';

let pool: SliplabzPool | null = null;
let skip_reason: string | null = null;

before(async () => { const h = await openTestDb(); pool = h.pool; skip_reason = h.skip_reason; });
after(async () => { if (pool !== null) await pool.end(); });

function skipIfUnavailable(t: { skip: (msg?: string) => void }): boolean {
  if (pool === null) { t.skip(`SKIP: ${skip_reason}`); return true; }
  return false;
}

describe('V1-5 ledger #6 — registry loader', () => {
  it('LOAD-BEARING: seeds bookmaker_registry from V1_BOOKMAKER_ALLOWLIST idempotently', async (t) => {
    if (skipIfUnavailable(t)) return;
    const p = pool!;
    // Truncate + re-truncate is safe against FKs; use TRUNCATE CASCADE.
    await p.query(`TRUNCATE bookmaker_registry, market_registry CASCADE`);

    const first = await loadRegistries(p);
    // Ten bookmakers (8 sportsbook + 2 dfs), 4 launch markets.
    assert.equal(first.bookmakers_inserted, 10);
    assert.equal(first.markets_inserted, 4);
    assert.equal(first.bookmakers_updated, 0);
    assert.equal(first.markets_updated, 0);

    // Idempotent rerun updates only.
    const second = await loadRegistries(p);
    assert.equal(second.bookmakers_inserted, 0);
    assert.equal(second.markets_inserted, 0);
    assert.equal(second.bookmakers_updated, 10);
    assert.equal(second.markets_updated, 4);

    // Verify final DB state.
    const bmRes = await p.query(
      `SELECT count(*)::int AS n, count(*) FILTER (WHERE source_class = 'sportsbook')::int AS n_sb,
              count(*) FILTER (WHERE source_class = 'dfs_pickem')::int AS n_dfs
         FROM bookmaker_registry`
    );
    const bm = bmRes.rows[0] as { n: number; n_sb: number; n_dfs: number };
    assert.equal(bm.n, 10);
    assert.equal(bm.n_sb, 8);
    assert.equal(bm.n_dfs, 2);
    const mkRes = await p.query(
      `SELECT count(*)::int AS n, count(*) FILTER (WHERE is_launch_market = true)::int AS n_launch
         FROM market_registry`
    );
    const mk = mkRes.rows[0] as { n: number; n_launch: number };
    assert.equal(mk.n, 4);
    assert.equal(mk.n_launch, 4);
  });

  it('LOAD-BEARING: refuses any bookmaker_key outside V1_BOOKMAKER_ALLOWLIST', async (t) => {
    if (skipIfUnavailable(t)) return;
    const p = pool!;
    await assert.rejects(
      () => loadRegistries(p, { bookmaker_keys: ['some_book_not_in_allowlist'] }),
      /not in V1_BOOKMAKER_ALLOWLIST/
    );
  });

  it('LOAD-BEARING: refuses any market_key outside LAUNCH_MARKET_KEYS', async (t) => {
    if (skipIfUnavailable(t)) return;
    const p = pool!;
    await assert.rejects(
      () => loadRegistries(p, { market_keys: ['player_steals'] }),
      /not in LAUNCH_MARKET_KEYS/
    );
  });
});

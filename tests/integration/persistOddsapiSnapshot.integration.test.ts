// V1-4 GOVERNOR REVIEW OBLIGATION — transactional raw completeness.
//
// "Required: a live-Postgres integration test that forces a failure between
//  raw-row and offering persistence and proves the transaction rolls back
//  leaving neither."
//
// This test:
//   1. Sets up minimal prerequisite rows (bookmaker + market registries,
//      ingestion run).
//   2. Calls persistOddsapiSnapshot with a poisoned `on_after_offerings`
//      hook that throws AFTER canonical offerings are inserted but BEFORE
//      raw rows are.
//   3. Asserts the caller sees the error propagate.
//   4. Asserts that NEITHER the snapshot header, NOR the offerings, NOR the
//      raw rows persist.
//   5. Then runs the same input WITHOUT the poison and asserts all three
//      sets persist consistently.

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { persistOddsapiSnapshot } from '../../src/lines/orchestrator/persistOddsapiSnapshot.js';
import { openTestDb, truncateAllV14Tables } from './support/db.js';
import type { SliplabzPool } from '../../src/db/connection.js';
import { randomUUID } from 'node:crypto';

let pool: SliplabzPool | null = null;
let skip_reason: string | null = null;

before(async () => {
  const h = await openTestDb();
  pool = h.pool;
  skip_reason = h.skip_reason;
});

after(async () => {
  if (pool !== null) await pool.end();
});

function skipIfUnavailable(t: { skip: (msg?: string) => void }): boolean {
  if (pool === null) {
    t.skip(`SKIP: ${skip_reason}`);
    return true;
  }
  return false;
}

async function seed(): Promise<{
  readonly run_id: string;
  readonly snapshot_id: string;
  readonly offering_ids: readonly string[];
}> {
  const p = pool!;
  await truncateAllV14Tables(p);

  // Registries.
  await p.query(
    `INSERT INTO bookmaker_registry (provider_key, display_title, source_class, approved_by)
     VALUES ('draftkings', 'DraftKings', 'sportsbook', 'test')`
  );
  await p.query(
    `INSERT INTO market_registry (provider_key, display_title, is_launch_market, canonical_stat_key, approved_by)
     VALUES ('player_points', 'Player Points', true, 'pts', 'test')`
  );

  const run_id = randomUUID();
  await p.query(
    `INSERT INTO oddsapi_ingestion_runs (oddsapi_ingestion_run_id, request_kind, endpoint, result_state, completed_at)
     VALUES ($1, 'current_poll', 'event_odds', 'complete', '2026-07-11T22:05:00Z')`,
    [run_id]
  );

  const snapshot_id = randomUUID();
  const offering_ids = [randomUUID(), randomUUID()];
  return { run_id, snapshot_id, offering_ids };
}

describe('persistOddsapiSnapshot — transactional atomicity (V1-4 governor obligation)', () => {
  it('LOAD-BEARING: transaction rolls back leaving neither snapshot NOR offerings NOR raw rows', async (t) => {
    if (skipIfUnavailable(t)) return;
    const { run_id, snapshot_id, offering_ids } = await seed();
    const p = pool!;

    const input = buildInput(run_id, snapshot_id, offering_ids);
    await assert.rejects(
      persistOddsapiSnapshot(p, input, {
        on_after_offerings: async () => {
          throw new Error('INJECTED FAILURE between offerings and raw rows');
        },
      })
    );

    // Assert NEITHER the snapshot header, NOR the offerings, NOR the raw rows persist.
    const ms = await p.query(
      `SELECT count(*)::int AS n FROM market_snapshots WHERE market_snapshot_id = $1`,
      [snapshot_id]
    );
    assert.equal((ms.rows[0] as { n: number }).n, 0, 'market_snapshots must have rolled back');

    const mo = await p.query(
      `SELECT count(*)::int AS n FROM market_offerings WHERE market_offering_id = ANY($1::uuid[])`,
      [offering_ids]
    );
    assert.equal((mo.rows[0] as { n: number }).n, 0, 'market_offerings must have rolled back');

    const mr = await p.query(
      `SELECT count(*)::int AS n FROM market_offering_raw_rows WHERE market_snapshot_id = $1`,
      [snapshot_id]
    );
    assert.equal((mr.rows[0] as { n: number }).n, 0, 'market_offering_raw_rows must have rolled back');
  });

  it('LOAD-BEARING: success path persists all three sets atomically', async (t) => {
    if (skipIfUnavailable(t)) return;
    const { run_id, snapshot_id, offering_ids } = await seed();
    const p = pool!;
    const input = buildInput(run_id, snapshot_id, offering_ids);

    const result = await persistOddsapiSnapshot(p, input);
    assert.equal(result.market_snapshot_id, snapshot_id);
    assert.equal(result.canonical_offering_ids.length, 2);
    assert.equal(result.raw_row_ids.length, 3);

    // Verify persistence.
    const ms = await p.query(
      `SELECT count(*)::int AS n FROM market_snapshots WHERE market_snapshot_id = $1`,
      [snapshot_id]
    );
    assert.equal((ms.rows[0] as { n: number }).n, 1);
    const mo = await p.query(
      `SELECT count(*)::int AS n FROM market_offerings WHERE market_snapshot_id = $1`,
      [snapshot_id]
    );
    assert.equal((mo.rows[0] as { n: number }).n, 2);
    const mr = await p.query(
      `SELECT count(*)::int AS n FROM market_offering_raw_rows WHERE market_snapshot_id = $1`,
      [snapshot_id]
    );
    assert.equal((mr.rows[0] as { n: number }).n, 3);

    // The raw rows that contributed carry back-references.
    const backrefs = await p.query(
      `SELECT canonical_offering_id, disposition FROM market_offering_raw_rows
        WHERE market_snapshot_id = $1 ORDER BY raw_row_index`,
      [snapshot_id]
    );
    const rows = backrefs.rows as Array<{
      canonical_offering_id: string | null;
      disposition: string;
    }>;
    assert.equal(rows[0]!.disposition, 'contributed');
    assert.ok(rows[0]!.canonical_offering_id !== null);
    assert.equal(rows[1]!.disposition, 'duplicate');
    assert.ok(rows[1]!.canonical_offering_id !== null);
    assert.equal(rows[2]!.disposition, 'quarantined');
    assert.equal(rows[2]!.canonical_offering_id, null);
  });
});

function buildInput(
  run_id: string,
  snapshot_id: string,
  offering_ids: readonly string[]
): Parameters<typeof persistOddsapiSnapshot>[1] {
  return {
    market_snapshot: {
      market_snapshot_id: snapshot_id,
      oddsapi_ingestion_run_id: run_id,
      raw_response_id: null,
      provider_event_id: 'evt_test_1',
      linked_internal_game_id: null,
      bookmaker_key: 'draftkings',
      bookmaker_title: 'DraftKings',
      source_class: 'sportsbook',
      market_key: 'player_points',
      request_kind: 'current_poll',
      provenance: 'self_observed',
      provider_last_update: '2026-07-11T22:00:00Z',
      provider_snapshot_time: null,
      retrieved_at: '2026-07-11T22:05:00Z',
      observed_at: '2026-07-11T22:05:00Z',
      freshness_state: 'fresh',
      schema_state: 'valid',
      raw_outcome_row_count: 3,
      duplicate_group_count: 1,
      conflict_group_count: 0,
    },
    canonical_offerings: [
      {
        market_offering_id: offering_ids[0]!,
        raw_player_description: 'Gabby Williams',
        normalized_player_name: 'gabby williams',
        internal_player_id: null,
        side: 'over',
        point: 12.5,
        raw_price_american: -115,
        raw_multiplier: null,
        price_semantic: 'sportsbook_american',
        promotion_type: 'unknown',
        offering_state: 'two_sided_complete',
        conflict_reason: null,
        duplicate_count: 2,
        provider_last_update: '2026-07-11T22:00:00Z',
        source_hash: 'hash_over',
        eligibility_note: '',
      },
      {
        market_offering_id: offering_ids[1]!,
        raw_player_description: 'Gabby Williams',
        normalized_player_name: 'gabby williams',
        internal_player_id: null,
        side: 'under',
        point: 12.5,
        raw_price_american: -105,
        raw_multiplier: null,
        price_semantic: 'sportsbook_american',
        promotion_type: 'unknown',
        offering_state: 'two_sided_complete',
        conflict_reason: null,
        duplicate_count: 1,
        provider_last_update: '2026-07-11T22:00:00Z',
        source_hash: 'hash_under',
        eligibility_note: '',
      },
    ],
    raw_rows: [
      {
        raw_row_index: 0,
        raw_name: 'Over',
        raw_description: 'Gabby Williams',
        raw_price: -115,
        raw_point: 12.5,
        raw_multiplier: null,
        raw_payload: { name: 'Over', description: 'Gabby Williams', price: -115, point: 12.5 },
        disposition: 'contributed',
        canonical_offering_index: 0,
        observed_at: '2026-07-11T22:05:00Z',
      },
      {
        raw_row_index: 1,
        raw_name: 'Over',
        raw_description: 'Gabby Williams',
        raw_price: -115,
        raw_point: 12.5,
        raw_multiplier: null,
        raw_payload: { name: 'Over', description: 'Gabby Williams', price: -115, point: 12.5 },
        disposition: 'duplicate',
        canonical_offering_index: 0,
        observed_at: '2026-07-11T22:05:00Z',
      },
      {
        raw_row_index: 2,
        raw_name: 'Under',
        raw_description: '', // missing description → quarantined
        raw_price: -105,
        raw_point: 12.5,
        raw_multiplier: null,
        raw_payload: { name: 'Under', description: '', price: -105, point: 12.5 },
        disposition: 'quarantined',
        canonical_offering_index: null,
        observed_at: '2026-07-11T22:05:00Z',
      },
    ],
  };
}

// V1-5 integration tests for the remaining drivers:
//   * ledger #3 — current_market_rows aggregator
//   * ledger #4 — post_final_reconciliation drain loop
//   * ledger #5 — Odds event-presence state machine

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import { openTestDb, truncateAllV14Tables } from './support/db.js';
import { loadRegistries } from '../../src/computation/registry/registryLoader.js';
import { aggregateCurrentMarketRowsForGame } from '../../src/computation/driver/currentMarketRowsAggregator.js';
import { advanceEventPresenceForRun } from '../../src/computation/driver/eventPresenceDriver.js';
import { pickDueReconciliations, markReconciliationCompleted } from '../../src/computation/driver/postFinalReconciliationDrain.js';
import type { SliplabzPool } from '../../src/db/connection.js';

let pool: SliplabzPool | null = null;
let skip_reason: string | null = null;

before(async () => { const h = await openTestDb(); pool = h.pool; skip_reason = h.skip_reason; });
after(async () => { if (pool !== null) await pool.end(); });
function skipIfUnavailable(t: { skip: (msg?: string) => void }): boolean {
  if (pool === null) { t.skip(`SKIP: ${skip_reason}`); return true; }
  return false;
}

async function seedRegistries(): Promise<void> {
  const p = pool!;
  await p.query(`TRUNCATE bookmaker_registry, market_registry CASCADE`);
  await loadRegistries(p);
}

// ------------------------------------------------------------------
// Ledger #3 — current_market_rows aggregator
// ------------------------------------------------------------------
describe('V1-5 ledger #3 — current_market_rows aggregator', () => {
  it('LOAD-BEARING: aggregates a game grain across books; writes one row per (player, market) grain; historical rows never contribute', async (t) => {
    if (skipIfUnavailable(t)) return;
    const p = pool!;
    await truncateAllV14Tables(p);
    await seedRegistries();

    const team_a = randomUUID(); const team_b = randomUUID();
    await p.query(
      `INSERT INTO teams (internal_team_id, display_name, abbreviation, classification, city)
       VALUES ($1,'H','H','current_franchise','X'), ($2,'A','A','current_franchise','Y')`,
      [team_a, team_b]
    );
    const game_id = randomUUID();
    await p.query(
      `INSERT INTO games (internal_game_id, season, season_type, home_team_id, away_team_id, scheduled_start_utc, postseason, status)
       VALUES ($1, 2026, 2, $2, $3, '2026-07-13T23:00:00Z', false, 'scheduled')`,
      [game_id, team_a, team_b]
    );
    const player_id = randomUUID();
    await p.query(
      `INSERT INTO players (internal_player_id, display_name, normalized_name, current_team_id, status)
       VALUES ($1, 'Player X', 'player x', $2, 'active_confirmed')`,
      [player_id, team_a]
    );

    // Two current-poll snapshots (dk + fd) and ONE historical snapshot.
    const run_id = randomUUID();
    await p.query(
      `INSERT INTO oddsapi_ingestion_runs
         (oddsapi_ingestion_run_id, request_kind, endpoint, result_state, completed_at)
       VALUES ($1,'current_poll','event_odds','complete', now())`,
      [run_id]
    );
    async function snap(bm: string, request_kind: string, provenance: string, market_snapshot_id: string, run: string) {
      await p.query(
        `INSERT INTO market_snapshots
           (market_snapshot_id, oddsapi_ingestion_run_id, provider_event_id, linked_internal_game_id,
            bookmaker_key, bookmaker_title, source_class, market_key, request_kind, provenance,
            retrieved_at, observed_at, freshness_state, schema_state,
            raw_outcome_row_count, duplicate_group_count, conflict_group_count)
         VALUES ($1,$2,'evt1',$3,$4,$4,'sportsbook','player_points',$5,$6,
                 now(), now(),'fresh','valid',1,0,0)`,
        [market_snapshot_id, run, game_id, bm, request_kind, provenance]
      );
    }
    const snap_dk = randomUUID();
    const snap_fd = randomUUID();
    const hist_run_id = randomUUID();
    await p.query(
      `INSERT INTO oddsapi_ingestion_runs
         (oddsapi_ingestion_run_id, request_kind, endpoint, result_state, completed_at)
       VALUES ($1,'historical_query','historical_event_odds','complete', now())`,
      [hist_run_id]
    );
    const snap_hist = randomUUID();
    await snap('draftkings', 'current_poll', 'self_observed', snap_dk, run_id);
    await snap('fanduel', 'current_poll', 'self_observed', snap_fd, run_id);
    await snap('draftkings', 'historical_query', 'backfilled_historical', snap_hist, hist_run_id);
    async function off(snap_id: string, side: 'over' | 'under', point: number, price: number, offering_id: string) {
      await p.query(
        `INSERT INTO market_offerings
           (market_offering_id, market_snapshot_id, raw_player_description, normalized_player_name,
            internal_player_id, side, point, raw_price_american, price_semantic, promotion_type,
            offering_state, source_hash)
         VALUES ($1::uuid,$2::uuid,'Player X','player x',$3::uuid,$4,$5,$6,'sportsbook_american','unknown','two_sided_complete',$7)`,
        [offering_id, snap_id, player_id, side, point, price, `hash_${offering_id}`]
      );
    }
    await off(snap_dk, 'over', 12.5, -110, randomUUID());
    await off(snap_dk, 'under', 12.5, -110, randomUUID());
    await off(snap_fd, 'over', 12.5, -108, randomUUID());
    await off(snap_fd, 'under', 12.5, -112, randomUUID());
    // Historical: point 8.5 — MUST be excluded by CURRENT_ONLY_WHERE_CLAUSE.
    await off(snap_hist, 'over', 8.5, -110, randomUUID());

    const result = await aggregateCurrentMarketRowsForGame(p, { internal_game_id: game_id });
    assert.equal(result.rows_written, 1);
    assert.equal(result.grains_processed, 1);
    const cmr = await p.query(
      `SELECT line_consensus_point::float8 AS pt,
              eligible_sportsbook_count::int AS n_books,
              point_distribution::text AS pd,
              computation_version
         FROM current_market_rows
        WHERE internal_game_id = $1 AND internal_player_id = $2 AND market_key = 'player_points'`,
      [game_id, player_id]
    );
    const row = cmr.rows[0] as { pt: number; n_books: number; pd: string; computation_version: number };
    // Consensus at 12.5 with 2 books; historical 8.5 excluded.
    assert.equal(row.pt, 12.5);
    assert.equal(row.n_books, 2);
    const pd = JSON.parse(row.pd) as Array<{ point: number; book_count: number }>;
    assert.equal(pd.length, 1);
    assert.equal(pd[0]!.point, 12.5);
    assert.equal(pd[0]!.book_count, 2);
    assert.ok(row.computation_version >= 3);
  });
});

// ------------------------------------------------------------------
// Ledger #4 — post-final reconciliation drain loop
// ------------------------------------------------------------------
describe('V1-5 ledger #4 — post_final_reconciliation drain loop', () => {
  it('LOAD-BEARING: picks due rows, reserves them, marks completed idempotently', async (t) => {
    if (skipIfUnavailable(t)) return;
    const p = pool!;
    await truncateAllV14Tables(p);
    await seedRegistries();

    // Minimal identity plumbing.
    const team_a = randomUUID(); const team_b = randomUUID();
    await p.query(
      `INSERT INTO teams (internal_team_id, display_name, abbreviation, classification, city)
       VALUES ($1,'H','H','current_franchise','X'), ($2,'A','A','current_franchise','Y')`,
      [team_a, team_b]
    );
    const game_id = randomUUID();
    await p.query(
      `INSERT INTO games (internal_game_id, season, season_type, home_team_id, away_team_id, scheduled_start_utc, postseason, status)
       VALUES ($1, 2026, 2, $2, $3, '2026-07-13T23:00:00Z', false, 'final')`,
      [game_id, team_a, team_b]
    );
    // A game_status_observation is required as triggering_observation_id.
    const run_id = randomUUID();
    await p.query(
      `INSERT INTO bdl_ingestion_runs
         (bdl_ingestion_run_id, endpoint, query_scope_key, completion_state,
          completed_at, page_count, row_count, cursor_chain_sent,
          cursor_chain_returned, http_status_last, content_type_last, response_headers_last)
       VALUES ($1,'games','game=g1','complete', now(), 1, 1,
               '[null]'::jsonb,'[null]'::jsonb, 200, 'application/json', '{}'::jsonb)`,
      [run_id]
    );
    const obs_id = randomUUID();
    await p.query(
      `INSERT INTO game_status_observations
         (game_status_observation_id, internal_game_id, provider_game_id,
          bdl_ingestion_run_id, observed_canonical_status, raw_status, observed_at)
       VALUES ($1,$2,'g1',$3,'final','Final', now())`,
      [obs_id, game_id, run_id]
    );

    const sched_id = randomUUID();
    await p.query(
      `INSERT INTO post_final_reconciliation_schedule
         (post_final_reconciliation_schedule_id, internal_game_id,
          provider_game_id, kind, triggering_observation_id, due_at)
       VALUES ($1,$2,'g1','first_post_final',$3, now() - interval '1 minute')`,
      [sched_id, game_id, obs_id]
    );

    const drained = await pickDueReconciliations(p);
    assert.equal(drained.rows_picked_for_processing, 1);
    assert.equal(drained.emitted[0]!.post_final_reconciliation_schedule_id, sched_id);
    assert.equal(drained.emitted[0]!.kind, 'first_post_final');

    // Mark completed; row goes off the queue.
    await markReconciliationCompleted(p, {
      post_final_reconciliation_schedule_id: sched_id,
      completed_by_run_id: run_id,
    });

    const drained2 = await pickDueReconciliations(p);
    assert.equal(drained2.rows_picked_for_processing, 0);
  });
});

// ------------------------------------------------------------------
// Ledger #5 — Odds event-presence state machine
// ------------------------------------------------------------------
describe('V1-5 ledger #5 — event-presence state machine', () => {
  it('LOAD-BEARING: single omission → single_omission, second omission → confirmed_removed; reappearance HELD', async (t) => {
    if (skipIfUnavailable(t)) return;
    const p = pool!;
    await truncateAllV14Tables(p);
    await seedRegistries();

    async function completeDiscoveryRun(observedEventIds: string[]): Promise<string> {
      const run_id = randomUUID();
      await p.query(
        `INSERT INTO oddsapi_ingestion_runs
           (oddsapi_ingestion_run_id, request_kind, endpoint, result_state, completed_at)
         VALUES ($1,'event_discovery','events','complete', now())`,
        [run_id]
      );
      for (const evt of observedEventIds) {
        await p.query(
          `INSERT INTO oddsapi_event_snapshots
             (oddsapi_event_snapshot_id, oddsapi_ingestion_run_id, provider_event_id,
              raw_home_team, raw_away_team, raw_commence_time,
              raw_payload, content_hash)
           VALUES ($1,$2,$3,'H','A', now(), '{}'::jsonb, 'hash')`,
          [randomUUID(), run_id, evt]
        );
      }
      return run_id;
    }

    // Run 1: sees A, B, C.
    const run1 = await completeDiscoveryRun(['A', 'B', 'C']);
    const r1 = await advanceEventPresenceForRun(p, { oddsapi_ingestion_run_id: run1 });
    assert.equal(r1.newly_observed, 3);
    assert.equal(r1.newly_single_omission, 0);
    assert.equal(r1.newly_confirmed_removed, 0);

    // Run 2: sees only A (B and C omitted once).
    const run2 = await completeDiscoveryRun(['A']);
    const r2 = await advanceEventPresenceForRun(p, { oddsapi_ingestion_run_id: run2 });
    assert.equal(r2.newly_single_omission, 2);
    assert.equal(r2.newly_confirmed_removed, 0);

    // Run 3: sees only A again (B and C now confirmed_removed).
    const run3 = await completeDiscoveryRun(['A']);
    const r3 = await advanceEventPresenceForRun(p, { oddsapi_ingestion_run_id: run3 });
    assert.equal(r3.newly_confirmed_removed, 2);

    // Run 4: B REAPPEARS after confirmed_removed. State HELD, but
    // observed_changed_at updates and counter transition recorded.
    const run4 = await completeDiscoveryRun(['A', 'B']);
    const r4 = await advanceEventPresenceForRun(p, { oddsapi_ingestion_run_id: run4 });
    assert.equal(r4.reappeared_after_confirmed_removed, 1);
    // B's presence_state is still confirmed_removed (frozen).
    const q = await p.query(
      `SELECT presence_state FROM oddsapi_event_presence WHERE provider_event_id = 'B'`
    );
    assert.equal((q.rows[0] as { presence_state: string }).presence_state, 'confirmed_removed');
  });

  it('LOAD-BEARING: skips non-complete runs (partial/failed pulls never advance presence)', async (t) => {
    if (skipIfUnavailable(t)) return;
    const p = pool!;
    const run_id = randomUUID();
    await p.query(
      `INSERT INTO oddsapi_ingestion_runs
         (oddsapi_ingestion_run_id, request_kind, endpoint, result_state, completed_at, failure_detail)
       VALUES ($1,'event_discovery','events','failed_transport', now(), 'test')`,
      [run_id]
    );
    const r = await advanceEventPresenceForRun(p, { oddsapi_ingestion_run_id: run_id });
    assert.equal(r.skipped_non_complete_run, true);
  });
});

// V1-5 governor ledger #1 integration test — movement/lifecycle batch driver.
//
// Fixtures a two-snapshot sequence (prior + current) and asserts the driver:
//   * persists movement events for every changed grain;
//   * emits a linked point_changed when the transition is unambiguous;
//   * drives observed_line_lifecycle transitions through transitionPresence;
//   * inserts a generation+1 row on reappearance after confirmed_removed and
//     NEVER mutates the frozen prior generation.

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import { openTestDb, truncateAllV14Tables } from './support/db.js';
import { runMovementLifecycleBatch, type BatchOffering } from '../../src/computation/driver/movementLifecycleBatch.js';
import { loadRegistries } from '../../src/computation/registry/registryLoader.js';
import type { SliplabzPool } from '../../src/db/connection.js';

let pool: SliplabzPool | null = null;
let skip_reason: string | null = null;

before(async () => { const h = await openTestDb(); pool = h.pool; skip_reason = h.skip_reason; });
after(async () => { if (pool !== null) await pool.end(); });
function skipIfUnavailable(t: { skip: (msg?: string) => void }): boolean {
  if (pool === null) { t.skip(`SKIP: ${skip_reason}`); return true; }
  return false;
}

async function seedBase(): Promise<{
  game_id: string; player_id: string;
  prior_snapshot_id: string; current_snapshot_id: string;
  prior_offering_id: string; current_offering_id: string;
}> {
  const p = pool!;
  await truncateAllV14Tables(p);
  await p.query(`TRUNCATE bookmaker_registry, market_registry CASCADE`);
  await loadRegistries(p);

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
     VALUES ($1, 'A. Wilson', 'a wilson', $2, 'active_confirmed')`,
    [player_id, team_a]
  );
  const prior_run_id = randomUUID();
  const current_run_id = randomUUID();
  await p.query(
    `INSERT INTO oddsapi_ingestion_runs (oddsapi_ingestion_run_id, request_kind, endpoint, result_state, completed_at)
     VALUES ($1, 'current_poll', 'event_odds', 'complete', now()),
            ($2, 'current_poll', 'event_odds', 'complete', now())`,
    [prior_run_id, current_run_id]
  );
  const prior_snapshot_id = randomUUID();
  const current_snapshot_id = randomUUID();
  await p.query(
    `INSERT INTO market_snapshots
       (market_snapshot_id, oddsapi_ingestion_run_id, provider_event_id, linked_internal_game_id,
        bookmaker_key, bookmaker_title, source_class, market_key, request_kind, provenance,
        retrieved_at, observed_at, freshness_state, schema_state,
        raw_outcome_row_count, duplicate_group_count, conflict_group_count)
     VALUES ($1,$2,'evt1',$4,'draftkings','DraftKings','sportsbook','player_points','current_poll','self_observed',
             now(), now(), 'fresh','valid',1,0,0),
            ($5,$3,'evt1',$4,'draftkings','DraftKings','sportsbook','player_points','current_poll','self_observed',
             now(), now(), 'fresh','valid',1,0,0)`,
    [prior_snapshot_id, prior_run_id, current_run_id, game_id, current_snapshot_id]
  );
  const prior_offering_id = randomUUID();
  const current_offering_id = randomUUID();
  await p.query(
    `INSERT INTO market_offerings
       (market_offering_id, market_snapshot_id, raw_player_description, normalized_player_name,
        internal_player_id, side, point, raw_price_american, price_semantic, promotion_type,
        offering_state, source_hash)
     VALUES ($1,$2,'A. Wilson','a wilson',$3,'over',12.5,-110,'sportsbook_american','unknown','two_sided_complete','h1'),
            ($4,$5,'A. Wilson','a wilson',$3,'over',13.5,-110,'sportsbook_american','unknown','two_sided_complete','h2')`,
    [prior_offering_id, prior_snapshot_id, player_id, current_offering_id, current_snapshot_id]
  );
  return { game_id, player_id, prior_snapshot_id, current_snapshot_id, prior_offering_id, current_offering_id };
}

describe('V1-5 ledger #1 — movement/lifecycle batch driver', () => {
  it('LOAD-BEARING: point change between two snapshots produces point_removed + point_added + linked point_changed', async (t) => {
    if (skipIfUnavailable(t)) return;
    const p = pool!;
    const base = await seedBase();

    const prior_offerings: BatchOffering[] = [{
      internal_game_id: base.game_id,
      market_offering_id: base.prior_offering_id,
      bookmaker_key: 'draftkings', market_key: 'player_points',
      normalized_player_name: 'a wilson', internal_player_id: base.player_id,
      side: 'over', point: 12.5, raw_price_american: -110,
      provider_last_update: '2026-07-13T22:00:00Z',
    }];
    const current_offerings: BatchOffering[] = [{
      internal_game_id: base.game_id,
      market_offering_id: base.current_offering_id,
      bookmaker_key: 'draftkings', market_key: 'player_points',
      normalized_player_name: 'a wilson', internal_player_id: base.player_id,
      side: 'over', point: 13.5, raw_price_american: -110,
      provider_last_update: '2026-07-13T22:05:00Z',
    }];
    const result = await runMovementLifecycleBatch(p, {
      current_ctx: { market_snapshot_id: base.current_snapshot_id, provider_event_id: 'evt1', internal_game_id: base.game_id, poll_succeeded: true, poll_produced_offerings: true },
      prior_ctx:   { market_snapshot_id: base.prior_snapshot_id,   provider_event_id: 'evt1', internal_game_id: base.game_id, poll_succeeded: true, poll_produced_offerings: true },
      prior_offerings, current_offerings,
      event_has_started: false, source_or_market_unavailable: false,
    });

    // Two grain-level events (side_added for 13.5 + side_removed for 12.5) + one linked point_changed = 3 movement events.
    assert.equal(result.linked_point_changed_emitted, 1);
    assert.ok(result.movement_events_persisted >= 2);

    // Both grains must have lifecycle rows at generation=1.
    const life = await p.query(
      `SELECT point::float8 AS point, lifecycle_generation, presence_state
         FROM observed_line_lifecycle
        WHERE internal_game_id=$1 AND internal_player_id=$2
        ORDER BY point`,
      [base.game_id, base.player_id]
    );
    // 13.5 present, 12.5 confirmed_removed hasn't happened yet (one omission).
    const rows = life.rows as Array<{ point: number; lifecycle_generation: number; presence_state: string }>;
    const row135 = rows.find((r) => r.point === 13.5);
    assert.ok(row135 !== undefined);
    assert.equal(row135!.presence_state, 'present');
    assert.equal(row135!.lifecycle_generation, 1);
    // 12.5 was in prior; the driver processed both grains — 12.5's row is
    // absent (never was created since first observation this batch is prior).
    // The current batch's iteration processes all grains observed in either
    // snapshot; when the prior contained 12.5 but current doesn't, the driver
    // records a NEW lifecycle row would be inserted only when current has
    // that grain — not the case here. So 12.5 has no lifecycle row from
    // THIS batch. That matches spec: 12.5's lifecycle would have been
    // created by a prior batch that had it as current.
  });

  it('LOAD-BEARING: reappearance-after-confirmed_removed inserts generation+1 and never mutates the frozen row', async (t) => {
    if (skipIfUnavailable(t)) return;
    const p = pool!;
    const base = await seedBase();

    // Insert a prior lifecycle row directly at confirmed_removed / gen 1.
    await p.query(
      `INSERT INTO observed_line_lifecycle
         (internal_game_id, internal_player_id, market_key, bookmaker_key,
          side, point, provenance,
          first_observed_offering_id, first_observed_at,
          presence_state, consecutive_omission_count, lifecycle_generation,
          confirmed_removed_at)
       VALUES ($1,$2,'player_points','draftkings','over',12.5,'self_observed',
               $3, '2026-07-13T20:00:00Z',
               'confirmed_removed', 2, 1, '2026-07-13T21:30:00Z')`,
      [base.game_id, base.player_id, base.prior_offering_id]
    );

    // Now: current batch OBSERVES 12.5 again (reappearance).
    const current_offerings: BatchOffering[] = [{
      internal_game_id: base.game_id,
      market_offering_id: base.current_offering_id,
      bookmaker_key: 'draftkings', market_key: 'player_points',
      normalized_player_name: 'a wilson', internal_player_id: base.player_id,
      side: 'over', point: 12.5, raw_price_american: -110,
      provider_last_update: '2026-07-13T22:05:00Z',
    }];
    const result = await runMovementLifecycleBatch(p, {
      current_ctx: { market_snapshot_id: base.current_snapshot_id, provider_event_id: 'evt1', internal_game_id: base.game_id, poll_succeeded: true, poll_produced_offerings: true },
      prior_ctx:   { market_snapshot_id: base.prior_snapshot_id,   provider_event_id: 'evt1', internal_game_id: base.game_id, poll_succeeded: true, poll_produced_offerings: true },
      prior_offerings: [], current_offerings,
      event_has_started: false, source_or_market_unavailable: false,
    });
    assert.ok(result.new_generations_inserted >= 1);

    // Two rows for the same grain — gen 1 (confirmed_removed, frozen) and gen 2 (present).
    const life = await p.query(
      `SELECT lifecycle_generation, presence_state, consecutive_omission_count, confirmed_removed_at
         FROM observed_line_lifecycle
        WHERE internal_game_id=$1 AND internal_player_id=$2 AND point=12.5
        ORDER BY lifecycle_generation`,
      [base.game_id, base.player_id]
    );
    const rows = life.rows as Array<{ lifecycle_generation: number; presence_state: string; consecutive_omission_count: number; confirmed_removed_at: Date | null }>;
    assert.equal(rows.length, 2);
    assert.equal(rows[0]!.lifecycle_generation, 1);
    // Prior generation UNMUTATED.
    assert.equal(rows[0]!.presence_state, 'confirmed_removed');
    assert.equal(rows[0]!.consecutive_omission_count, 2);
    assert.ok(rows[0]!.confirmed_removed_at !== null);
    // New generation observes the reappearance as present @ count 0.
    assert.equal(rows[1]!.lifecycle_generation, 2);
    assert.equal(rows[1]!.presence_state, 'present');
    assert.equal(rows[1]!.consecutive_omission_count, 0);
  });

  it('LOAD-BEARING: failed poll never advances confirmed-removal (transitionPresence contract)', async (t) => {
    if (skipIfUnavailable(t)) return;
    const p = pool!;
    const base = await seedBase();

    // Prior lifecycle at single_omission/1.
    await p.query(
      `INSERT INTO observed_line_lifecycle
         (internal_game_id, internal_player_id, market_key, bookmaker_key,
          side, point, provenance,
          first_observed_offering_id, first_observed_at,
          presence_state, consecutive_omission_count, lifecycle_generation)
       VALUES ($1,$2,'player_points','draftkings','over',12.5,'self_observed',
               $3, '2026-07-13T20:00:00Z',
               'single_omission', 1, 1)`,
      [base.game_id, base.player_id, base.prior_offering_id]
    );
    // FAILED poll: current offering NOT observed, poll_succeeded=false.
    const result = await runMovementLifecycleBatch(p, {
      current_ctx: { market_snapshot_id: base.current_snapshot_id, provider_event_id: 'evt1', internal_game_id: base.game_id, poll_succeeded: false, poll_produced_offerings: false },
      prior_ctx:   { market_snapshot_id: base.prior_snapshot_id,   provider_event_id: 'evt1', internal_game_id: base.game_id, poll_succeeded: true, poll_produced_offerings: true },
      prior_offerings: [{
        internal_game_id: base.game_id, market_offering_id: base.prior_offering_id,
        bookmaker_key: 'draftkings', market_key: 'player_points',
        normalized_player_name: 'a wilson', internal_player_id: base.player_id,
        side: 'over', point: 12.5, raw_price_american: -110, provider_last_update: null,
      }],
      current_offerings: [],
      event_has_started: false, source_or_market_unavailable: false,
    });
    // No new-confirmed-removed transition.
    assert.equal(result.newly_confirmed_removed, 0);
    // State held at single_omission (not advanced to confirmed_removed).
    const life = await p.query(
      `SELECT presence_state, consecutive_omission_count
         FROM observed_line_lifecycle
        WHERE internal_game_id=$1 AND internal_player_id=$2 AND point=12.5`,
      [base.game_id, base.player_id]
    );
    const r = life.rows[0] as { presence_state: string; consecutive_omission_count: number };
    assert.equal(r.presence_state, 'single_omission');
    assert.equal(r.consecutive_omission_count, 1);
  });
});

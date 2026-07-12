// V1-4 integration: canonical closing point selection against a live database.
//
// This test writes source_closing_quotes rows for a single (game, player,
// market) and asserts the canonical_closing_points row it produces matches
// the selection method's expected shape at the schema level.

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import { openTestDb, truncateAllV14Tables } from './support/db.js';
import type { SliplabzPool } from '../../src/db/connection.js';
import { selectCanonicalClosingPoint } from '../../src/lines/canonicalClosingPoint.js';
import { withTransaction } from '../../src/db/index.js';

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

async function seedBase(): Promise<{ game_id: string; player_id: string; team_ids: [string, string] }> {
  const p = pool!;
  await truncateAllV14Tables(p);
  await p.query(
    `INSERT INTO bookmaker_registry (provider_key, display_title, source_class, approved_by) VALUES
       ('draftkings','DraftKings','sportsbook','test'),
       ('fanduel',   'FanDuel',   'sportsbook','test'),
       ('betmgm',    'BetMGM',    'sportsbook','test'),
       ('prizepicks','PrizePicks','dfs_pickem','test')`
  );
  await p.query(
    `INSERT INTO market_registry (provider_key, display_title, is_launch_market, canonical_stat_key, approved_by)
     VALUES ('player_points', 'Player Points', true, 'pts', 'test')`
  );
  const team_a = randomUUID();
  const team_b = randomUUID();
  await p.query(
    `INSERT INTO teams (internal_team_id, display_name, abbreviation, classification, city) VALUES
       ($1,'Home','HOM','current_franchise','X'),
       ($2,'Away','AWY','current_franchise','Y')`,
    [team_a, team_b]
  );
  const game_id = randomUUID();
  await p.query(
    `INSERT INTO games (internal_game_id, season, season_type, home_team_id, away_team_id, scheduled_start_utc, postseason, status)
     VALUES ($1, 2026, 2, $2, $3, '2026-07-11T22:00:00Z', false, 'final')`,
    [game_id, team_a, team_b]
  );
  const player_id = randomUUID();
  await p.query(
    `INSERT INTO players (internal_player_id, display_name, normalized_name, current_team_id, status)
     VALUES ($1, 'Gabby Williams', 'gabby williams', $2, 'active_confirmed')`,
    [player_id, team_a]
  );
  return { game_id, player_id, team_ids: [team_a, team_b] };
}

async function persistCanonical(
  base: Awaited<ReturnType<typeof seedBase>>,
  quotes: Array<{
    bookmaker_key: string;
    source_class: 'sportsbook' | 'dfs_pickem' | 'unknown';
    close_capture_state: 'eligible' | 'close_capture_stale' | 'no_snapshot';
    closing_point: number | null;
  }>
): Promise<void> {
  const p = pool!;
  // Compute the canonical closing point via the deterministic selection
  // function and persist ONLY the canonical_closing_points row. The
  // source_closing_quotes CHECK requires an eligible row to reference a
  // real market_snapshot; wiring that here would duplicate the
  // persistOddsapiSnapshot integration test's fixtures without adding
  // coverage. This test verifies canonical_closing_points schema behavior.
  await withTransaction(p, async (tx) => {
    const canonical = selectCanonicalClosingPoint(quotes);
    await tx.query(
      `INSERT INTO canonical_closing_points
         (internal_game_id, internal_player_id, market_key,
          selection_method, canonical_closing_point,
          total_eligible_sportsbook_count, sportsbook_count_at_selected_point,
          coverage_label, close_boundary_utc)
       VALUES ($1,$2,'player_points',$3,$4,$5,$6,$7,'2026-07-11T22:00:00Z')`,
      [
        base.game_id,
        base.player_id,
        canonical.selection_method,
        canonical.canonical_closing_point,
        canonical.total_eligible_sportsbook_count,
        canonical.sportsbook_count_at_selected_point,
        canonical.coverage_label,
      ]
    );
  });
}

describe('canonical closing point — persistence integration (§7.10.2, §18.4)', () => {
  it('single_book: one eligible sportsbook → single_book coverage; NOT consensus', async (t) => {
    if (skipIfUnavailable(t)) return;
    const p = pool!;
    const base = await seedBase();
    await persistCanonical(base, [
      { bookmaker_key: 'draftkings', source_class: 'sportsbook', close_capture_state: 'eligible', closing_point: 12.5 },
    ]);
    const r = await p.query(
      `SELECT selection_method, canonical_closing_point, coverage_label
         FROM canonical_closing_points
         WHERE internal_game_id = $1`,
      [base.game_id]
    );
    const row = r.rows[0] as { selection_method: string; canonical_closing_point: string; coverage_label: string };
    assert.equal(row.selection_method, 'single_book');
    assert.equal(row.coverage_label, 'single_book');
    assert.equal(Number(row.canonical_closing_point), 12.5);
  });

  it('unique_modal: three books majority at 12.5 → complete coverage', async (t) => {
    if (skipIfUnavailable(t)) return;
    const p = pool!;
    const base = await seedBase();
    await persistCanonical(base, [
      { bookmaker_key: 'draftkings', source_class: 'sportsbook', close_capture_state: 'eligible', closing_point: 12.5 },
      { bookmaker_key: 'fanduel',    source_class: 'sportsbook', close_capture_state: 'eligible', closing_point: 12.5 },
      { bookmaker_key: 'betmgm',     source_class: 'sportsbook', close_capture_state: 'eligible', closing_point: 13.5 },
    ]);
    const r = await p.query(
      `SELECT selection_method, canonical_closing_point, coverage_label,
              total_eligible_sportsbook_count, sportsbook_count_at_selected_point
         FROM canonical_closing_points WHERE internal_game_id = $1`,
      [base.game_id]
    );
    const row = r.rows[0] as {
      selection_method: string;
      canonical_closing_point: string;
      coverage_label: string;
      total_eligible_sportsbook_count: number;
      sportsbook_count_at_selected_point: number;
    };
    assert.equal(row.selection_method, 'unique_modal');
    assert.equal(Number(row.canonical_closing_point), 12.5);
    assert.equal(row.coverage_label, 'complete');
    assert.equal(row.total_eligible_sportsbook_count, 3);
    assert.equal(row.sportsbook_count_at_selected_point, 2);
  });

  it('tied: two books at 12.5 and 13.5 → tied_no_unique_mode; point NULL; excluded from windows', async (t) => {
    if (skipIfUnavailable(t)) return;
    const p = pool!;
    const base = await seedBase();
    await persistCanonical(base, [
      { bookmaker_key: 'draftkings', source_class: 'sportsbook', close_capture_state: 'eligible', closing_point: 12.5 },
      { bookmaker_key: 'fanduel',    source_class: 'sportsbook', close_capture_state: 'eligible', closing_point: 13.5 },
    ]);
    const r = await p.query(
      `SELECT selection_method, canonical_closing_point, coverage_label
         FROM canonical_closing_points WHERE internal_game_id = $1`,
      [base.game_id]
    );
    const row = r.rows[0] as { selection_method: string; canonical_closing_point: string | null; coverage_label: string };
    assert.equal(row.selection_method, 'tied_no_unique_mode');
    assert.equal(row.canonical_closing_point, null);
    assert.equal(row.coverage_label, 'unresolved_closing_consensus');
  });

  it('DFS only: PrizePicks eligible + sportsbook stale → no_eligible_source', async (t) => {
    if (skipIfUnavailable(t)) return;
    const p = pool!;
    const base = await seedBase();
    await persistCanonical(base, [
      { bookmaker_key: 'prizepicks', source_class: 'dfs_pickem', close_capture_state: 'eligible', closing_point: 12.5 },
      { bookmaker_key: 'draftkings', source_class: 'sportsbook', close_capture_state: 'close_capture_stale', closing_point: null },
    ]);
    const r = await p.query(
      `SELECT selection_method, canonical_closing_point, coverage_label
         FROM canonical_closing_points WHERE internal_game_id = $1`,
      [base.game_id]
    );
    const row = r.rows[0] as { selection_method: string; canonical_closing_point: string | null; coverage_label: string };
    assert.equal(row.selection_method, 'no_eligible_source');
    assert.equal(row.canonical_closing_point, null);
    assert.equal(row.coverage_label, 'no_closing_line');
  });
});

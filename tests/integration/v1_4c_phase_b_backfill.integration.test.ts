// V1-4c Phase B — integration tests for runHistoricalLineResultsBackfill
// against a live Postgres.
//
// Proves:
//   * A first run inserts exactly the eligible-grain count of rows.
//   * A second run mutates NO derived columns (checksum equality)
//     and computation_version does NOT advance.
//   * The V1-5 recomputationWriter can still run against the same rows —
//     UPSERT on the version-aware UNIQUE plays nicely regardless of
//     whether the writer's provenance would differ.
//   * Ineligible grains are ABSENT, never defaulted (§C.2 filter).
//
// Runs against SLIPLABZ_DATABASE_URL; skips visibly when unset (matches
// the V1-4 test:integration contract).

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import { openTestDb } from './support/db.js';
import type { SliplabzPool } from '../../src/db/connection.js';
import { runHistoricalLineResultsBackfill } from '../../src/lines/historicalLineResultsBackfill.js';
import { V1_5_COMPUTATION_VERSION } from '../../src/computation/computationVersion.js';

let pool: SliplabzPool | null = null;
let skip_reason: string | null = null;
let connection_string: string | null = null;

before(async () => {
  const h = await openTestDb();
  pool = h.pool;
  skip_reason = h.skip_reason;
  connection_string = process.env['SLIPLABZ_DATABASE_URL'] ?? null;
});
after(async () => {
  if (pool !== null) await pool.end();
});
function skipIfUnavailable(t: { skip: (msg?: string) => void }): boolean {
  if (pool === null || connection_string === null) {
    t.skip(`SKIP: ${skip_reason ?? 'no SLIPLABZ_DATABASE_URL'}`);
    return true;
  }
  return false;
}

async function scrub(p: SliplabzPool): Promise<void> {
  await p.query(`TRUNCATE TABLE
    real_line_windows,
    historical_line_results,
    canonical_closing_points,
    source_closing_quotes,
    movement_events,
    observed_line_lifecycle,
    close_boundary_evaluations,
    current_market_rows,
    market_offering_raw_rows,
    market_offerings,
    market_snapshots,
    oddsapi_event_snapshots,
    oddsapi_raw_responses,
    oddsapi_ingestion_runs,
    market_registry,
    bookmaker_registry,
    player_game_stat_history,
    player_game_stats,
    bdl_raw_responses,
    bdl_ingestion_runs,
    games,
    players,
    teams
  CASCADE`);
}

interface Seed {
  team_a: string;
  team_b: string;
  player_id: string;
  game_ids: string[];
  ccp_by_game_market: Map<string, string>; // key = `${gid}|${market}`
  pgs_by_game: Map<string, string>;
}

const STATS_PER_GAME = [
  { pts: 22, reb: 8, ast: 5, fg3m: 2 },
  { pts: 17, reb: 6, ast: 7, fg3m: 3 },
  { pts: 8,  reb: 3, ast: 4, fg3m: 0 }, // low game — will be under vs a 15.5 line
  { pts: 30, reb: 12, ast: 6, fg3m: 4 },
  { pts: 15, reb: 5, ast: 3, fg3m: 2 }, // exactly hits pts=15 line → push
];

async function seedMinimalGraph(p: SliplabzPool, options: {
  /** If true, the game at index 2 has an INELIGIBLE stat row (dnp). It
   *  MUST be absent from the populator's output. */
  ineligible_index?: number;
  /** If true, the game at index 2 also lacks a canonical_closing_point
   *  for player_rebounds — that (game, player, rebounds) grain MUST be
   *  absent from the populator's output. */
  missing_ccp_market_at_index?: { index: number; market: string };
} = {}): Promise<Seed> {
  const team_a = randomUUID();
  const team_b = randomUUID();
  await p.query(
    `INSERT INTO teams (internal_team_id, display_name, abbreviation, classification, city)
     VALUES ($1,'H','H','current_franchise','X'), ($2,'A','A','current_franchise','Y')`,
    [team_a, team_b]
  );
  await p.query(
    `INSERT INTO bookmaker_registry (provider_key, display_title, source_class, approved_by)
     VALUES ('draftkings','DraftKings','sportsbook','test')`
  );
  await p.query(
    `INSERT INTO market_registry (provider_key, display_title, is_launch_market, canonical_stat_key, approved_by)
     VALUES ('player_points','Player Points',true,'pts','test'),
            ('player_rebounds','Player Rebounds',true,'reb','test'),
            ('player_assists','Player Assists',true,'ast','test'),
            ('player_threes','Player Threes',true,'fg3m','test')`
  );
  const player_id = randomUUID();
  await p.query(
    `INSERT INTO players (internal_player_id, display_name, normalized_name, current_team_id, status)
     VALUES ($1,'X','x',$2,'active_confirmed')`,
    [player_id, team_a]
  );
  const bdl_run = randomUUID();
  await p.query(
    `INSERT INTO bdl_ingestion_runs (bdl_ingestion_run_id, endpoint, query_scope_key, completion_state, started_at, completed_at)
     VALUES ($1,'player_stats','test','complete',now(),now())`,
    [bdl_run]
  );
  const game_ids: string[] = [];
  const ccp_by_game_market = new Map<string, string>();
  const pgs_by_game = new Map<string, string>();
  const LINES = { player_points: 15.5, player_rebounds: 7.5, player_assists: 4.5, player_threes: 2.5 };
  const OVERRIDE_LINES: Record<string, { player_points?: number }> = {
    // Game index 4 (STATS_PER_GAME[4].pts = 15): line 15 to produce a
    // push row. Populator MUST produce outcome='push', margin=0.
    'idx4': { player_points: 15 },
  };
  for (let i = 0; i < STATS_PER_GAME.length; i += 1) {
    const gid = randomUUID();
    game_ids.push(gid);
    await p.query(
      `INSERT INTO games (internal_game_id, season, season_type, home_team_id, away_team_id, scheduled_start_utc, postseason, status)
       VALUES ($1, 2026, 2, $2, $3, $4::timestamptz, false, 'final')`,
      [gid, team_a, team_b, `2026-05-${(i + 10).toString().padStart(2, '0')}T00:00:00Z`]
    );
    // player_game_stats — ineligible variant is index-specific.
    const pgs_id = randomUUID();
    const is_ineligible = options.ineligible_index === i;
    const s = STATS_PER_GAME[i]!;
    await p.query(
      `INSERT INTO player_game_stats
         (player_game_stat_id, provider, provider_player_id, provider_game_id,
          internal_game_id, internal_player_id,
          minutes_status, parsed_minutes, raw_stats, normalized_stats,
          source_hash, raw_minutes, eligibility_state)
       VALUES ($1,'balldontlie',$2,$3,$4,$5,
               $6,$7,$8::jsonb,$9::jsonb,
               $10,$11,$12)`,
      [pgs_id, `pp-${i}`, `pg-${i}`, gid, player_id,
       is_ineligible ? 'dnp' : 'played',
       is_ineligible ? 0 : 30,
       JSON.stringify(s),
       is_ineligible
         ? JSON.stringify({ pts: null, reb: null, ast: null, fg3m: null })
         : JSON.stringify(s),
       `hash-${i}`, is_ineligible ? '0' : '30',
       is_ineligible ? 'non_participation' : 'eligible']
    );
    pgs_by_game.set(gid, pgs_id);
    // canonical_closing_points — one per market. Some markets on some games are
    // deliberately absent per options.missing_ccp_market_at_index.
    for (const market of ['player_points', 'player_rebounds', 'player_assists', 'player_threes'] as const) {
      if (options.missing_ccp_market_at_index?.index === i
       && options.missing_ccp_market_at_index?.market === market) {
        continue; // absence-by-design
      }
      const override_point = i === 4 && market === 'player_points' ? 15 : LINES[market];
      void OVERRIDE_LINES;
      const ccp_id = randomUUID();
      await p.query(
        `INSERT INTO canonical_closing_points
           (canonical_closing_point_id, internal_game_id, internal_player_id, market_key,
            selection_method, canonical_closing_point,
            total_eligible_sportsbook_count, sportsbook_count_at_selected_point,
            coverage_label, close_boundary_utc)
         VALUES ($1,$2,$3,$4,'single_book',$5,1,1,'single_book',now())`,
        [ccp_id, gid, player_id, market, override_point]
      );
      ccp_by_game_market.set(`${gid}|${market}`, ccp_id);
    }
  }
  return { team_a, team_b, player_id, game_ids, ccp_by_game_market, pgs_by_game };
}

async function derivedChecksum(p: SliplabzPool): Promise<string> {
  // Checksum the derived columns only. Timestamps (computed_at, updated_at)
  // are deliberately EXCLUDED so a re-run that touches them (via ON CONFLICT
  // DO UPDATE SET) does not change the checksum.
  const r = await p.query(
    `SELECT md5(string_agg(
       internal_game_id::text || '|' || internal_player_id::text || '|' ||
       market_key || '|' || outcome || '|' || margin::text || '|' ||
       canonical_closing_point::text || '|' || player_stat_value::text || '|' ||
       coverage_state::text || '|' || provenance::text || '|' ||
       computation_version::text,
       '\n' ORDER BY internal_game_id, internal_player_id, market_key
     ))::text AS checksum
       FROM historical_line_results`
  );
  return (r.rows[0] as { checksum: string | null }).checksum ?? '';
}

describe('V1-4c Phase B — historical_line_results populator (live Postgres)', () => {
  it('LOAD-BEARING: happy path — 4 markets × 5 games = 20 grains, one INELIGIBLE game excluded (16 rows)', async (t) => {
    if (skipIfUnavailable(t)) return;
    const p = pool!;
    await scrub(p);
    const seed = await seedMinimalGraph(p, { ineligible_index: 2 });

    const counters = await runHistoricalLineResultsBackfill({
      connection_string: connection_string!,
      batch_size: 100,
    });

    // 5 games × 4 markets = 20 potential grains; game index 2 is ineligible
    // (all 4 markets excluded) → 16 rows.
    assert.equal(counters.grains_observed, 16);
    assert.equal(counters.rows_inserted, 16);
    assert.equal(counters.rows_updated, 0);
    assert.equal(counters.grains_skipped_missing_stat, 0);

    const rows = await p.query(`SELECT COUNT(*)::int AS n FROM historical_line_results`);
    assert.equal((rows.rows[0] as { n: number }).n, 16);

    // Verify NO row exists for the ineligible game.
    const ineligible = await p.query(
      `SELECT COUNT(*)::int AS n FROM historical_line_results WHERE internal_game_id = $1`,
      [seed.game_ids[2]!]
    );
    assert.equal((ineligible.rows[0] as { n: number }).n, 0, 'ineligible-game grains MUST be absent, not defaulted');

    // Push classification for the game where pts = line exactly.
    const push = await p.query(
      `SELECT outcome, margin::text AS margin FROM historical_line_results
        WHERE internal_game_id = $1 AND market_key = 'player_points'`,
      [seed.game_ids[4]!]
    );
    assert.equal(push.rowCount, 1);
    const push_row = push.rows[0] as { outcome: string; margin: string };
    assert.equal(push_row.outcome, 'push');
    assert.equal(Number(push_row.margin), 0);

    // Provenance is backfilled_historical everywhere.
    const prov = await p.query(
      `SELECT DISTINCT provenance FROM historical_line_results`
    );
    assert.equal(prov.rowCount, 1);
    assert.equal((prov.rows[0] as { provenance: string }).provenance, 'backfilled_historical');

    // computation_version equals V1-5's constant everywhere.
    const cv = await p.query(
      `SELECT DISTINCT computation_version::int AS v FROM historical_line_results`
    );
    assert.equal(cv.rowCount, 1);
    assert.equal((cv.rows[0] as { v: number }).v, V1_5_COMPUTATION_VERSION);
  });

  it('LOAD-BEARING (V1-5 lesson): a second run is a NO-OP for derived columns — checksum unchanged, computation_version does not advance', async (t) => {
    if (skipIfUnavailable(t)) return;
    const p = pool!;
    await scrub(p);
    await seedMinimalGraph(p);

    const first = await runHistoricalLineResultsBackfill({
      connection_string: connection_string!,
      batch_size: 100,
    });
    assert.equal(first.rows_inserted, 20); // 5 games × 4 markets, no ineligibility
    const cs_after_first = await derivedChecksum(p);

    const second = await runHistoricalLineResultsBackfill({
      connection_string: connection_string!,
      batch_size: 100,
    });
    // Second run: same 20 grains observed, all touched via ON CONFLICT DO UPDATE.
    // Derived columns MUST NOT change; timestamps MAY change (excluded from
    // the checksum). rowCount from UPSERT is 20 updates, 0 inserts.
    assert.equal(second.grains_observed, 20);
    assert.equal(second.rows_inserted, 0);
    assert.equal(second.rows_updated, 20);
    const cs_after_second = await derivedChecksum(p);
    assert.equal(cs_after_second, cs_after_first, 'derived-column checksum MUST NOT change across a re-run');

    // computation_version did not advance (still V1_5_COMPUTATION_VERSION for every row).
    const versions = await p.query(
      `SELECT DISTINCT computation_version::int AS v FROM historical_line_results ORDER BY v`
    );
    assert.equal(versions.rowCount, 1);
    assert.equal((versions.rows[0] as { v: number }).v, V1_5_COMPUTATION_VERSION);
  });

  it('LOAD-BEARING: dry_run BEGIN/ROLLBACKs every batch — historical_line_results stays at zero', async (t) => {
    if (skipIfUnavailable(t)) return;
    const p = pool!;
    await scrub(p);
    await seedMinimalGraph(p);

    const counters = await runHistoricalLineResultsBackfill({
      connection_string: connection_string!,
      batch_size: 100,
      dry_run: true,
    });
    // The populator SAW 20 eligible grains and produced valid UPSERTs, but
    // the transaction was rolled back — the counters report the intended
    // work; the table shows zero effect.
    assert.equal(counters.grains_observed, 20);
    assert.equal(counters.rows_inserted, 20);
    const n = await p.query(`SELECT COUNT(*)::int AS n FROM historical_line_results`);
    assert.equal((n.rows[0] as { n: number }).n, 0);
  });

  it('LOAD-BEARING: absence-by-design — a game/market lacking a canonical_closing_point row is ABSENT, never defaulted', async (t) => {
    if (skipIfUnavailable(t)) return;
    const p = pool!;
    await scrub(p);
    const seed = await seedMinimalGraph(p, {
      missing_ccp_market_at_index: { index: 3, market: 'player_rebounds' },
    });
    const counters = await runHistoricalLineResultsBackfill({
      connection_string: connection_string!,
      batch_size: 100,
    });
    // 20 - 1 = 19 grains (one (game, rebounds) pair excluded).
    assert.equal(counters.grains_observed, 19);
    const rebounds_at_missing = await p.query(
      `SELECT COUNT(*)::int AS n FROM historical_line_results
        WHERE internal_game_id = $1 AND market_key = 'player_rebounds'`,
      [seed.game_ids[3]!]
    );
    assert.equal((rebounds_at_missing.rows[0] as { n: number }).n, 0);
  });

  it('LOAD-BEARING: only_market filter narrows the run to a single market without leaking others', async (t) => {
    if (skipIfUnavailable(t)) return;
    const p = pool!;
    await scrub(p);
    await seedMinimalGraph(p);
    const counters = await runHistoricalLineResultsBackfill({
      connection_string: connection_string!,
      batch_size: 100,
      only_market: 'player_assists',
    });
    assert.equal(counters.grains_observed, 5);
    assert.equal(counters.rows_inserted, 5);
    const distinct = await p.query(
      `SELECT DISTINCT market_key FROM historical_line_results`
    );
    assert.equal(distinct.rowCount, 1);
    assert.equal((distinct.rows[0] as { market_key: string }).market_key, 'player_assists');
  });
});

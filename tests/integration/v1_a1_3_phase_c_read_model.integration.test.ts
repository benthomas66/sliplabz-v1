// V1-A1-3 Phase C — real-read-model integration proofs.
//
// Phase B's integration tests fed FABRICATED inputs to prove the writer's
// contracts. This suite feeds REAL read-model source rows: we insert into
// the underlying V1-1 / V1-2 / V1-3 / V1-4 / V1-5 tables the read-model
// composer READS, then run driver → builder → engine → writer end to end
// and assert on the persisted profile.
//
// Container / port declared in the report §7: `sliplabz-v1-a1-3-phase-c-postgres`
// on host port 55448 (image postgres:16).

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import { openTestDb } from './support/db.js';
import type { SliplabzPool } from '../../src/db/connection.js';
import { withTransaction } from '../../src/db/transaction.js';
import { runEvidencePopulator } from '../../src/evidence/driver/populate.js';
import { makeReadModelInputBuilder } from '../../src/evidence/driver/readModelInputBuilder.js';
import type { EvidenceGrain } from '../../src/evidence/driver/populate.js';

let pool: SliplabzPool | null = null;
let skip_reason: string | null = null;
let connection_string: string | null = null;

before(async () => {
  const h = await openTestDb();
  pool = h.pool;
  skip_reason = h.skip_reason;
  connection_string = process.env['SLIPLABZ_DATABASE_URL'] ?? null;
});
after(async () => { if (pool !== null) await pool.end(); });

function skipIfUnavailable(t: { skip: (msg?: string) => void }): boolean {
  if (pool === null || connection_string === null) {
    t.skip(`SKIP: ${skip_reason ?? 'no SLIPLABZ_DATABASE_URL'}`);
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Fixture seeding for the SOURCE tables the read-model composer reads.
// ---------------------------------------------------------------------------

interface SeededGrain {
  team_a: string; team_b: string;
  game_id: string; player_id: string;
  cmr_id: string;
}

async function scrubEverything(p: SliplabzPool): Promise<void> {
  await p.query(`TRUNCATE TABLE
    evidence_profile_reasons, evidence_profiles,
    historical_line_results, canonical_closing_points, source_closing_quotes,
    market_offering_raw_rows, market_offerings, market_snapshots,
    close_boundary_evaluations, current_market_rows,
    oddsapi_ingestion_runs, oddsapi_event_snapshots, oddsapi_raw_responses,
    market_registry, bookmaker_registry,
    player_reconciliation_queue, event_reconciliation_queue,
    provider_players, provider_games, provider_teams,
    player_game_stats, bdl_ingestion_runs,
    players, games, teams
  CASCADE`);
}

async function seedMarketRegistry(p: SliplabzPool): Promise<void> {
  await p.query(
    `INSERT INTO market_registry (provider_key, display_title, is_launch_market, canonical_stat_key, approved_by)
     VALUES ('player_points', 'Player Points', true, 'pts', 'test')
     ON CONFLICT (provider_key) DO NOTHING`
  );
}

async function seedBookmakers(p: SliplabzPool, keys: readonly string[]): Promise<void> {
  for (const k of keys) {
    await p.query(
      `INSERT INTO bookmaker_registry (provider_key, display_title, source_class, approved_by)
       VALUES ($1, $1, 'sportsbook', 'test')
       ON CONFLICT (provider_key) DO NOTHING`,
      [k]
    );
  }
}

async function seedTeamsGamePlayer(
  p: SliplabzPool,
  opts: { game_status: 'scheduled' | 'final' | 'postponed' | 'canceled' } = { game_status: 'scheduled' }
): Promise<{ team_a: string; team_b: string; game_id: string; player_id: string }> {
  const team_a = randomUUID();
  const team_b = randomUUID();
  await p.query(
    `INSERT INTO teams (internal_team_id, display_name, abbreviation, classification, city)
     VALUES ($1,'H','H','current_franchise','X'), ($2,'A','A','current_franchise','Y')`,
    [team_a, team_b]
  );
  const game_id = randomUUID();
  await p.query(
    `INSERT INTO games (internal_game_id, season, season_type, home_team_id, away_team_id,
                       scheduled_start_utc, postseason, status)
     VALUES ($1, 2026, 2, $2, $3, '2026-07-20T00:00:00Z', false, $4)`,
    [game_id, team_a, team_b, opts.game_status]
  );
  const player_id = randomUUID();
  await p.query(
    `INSERT INTO players (internal_player_id, display_name, normalized_name, current_team_id, status)
     VALUES ($1, 'X', 'x', $2, 'active_confirmed')`,
    [player_id, team_a]
  );
  return { team_a, team_b, game_id, player_id };
}

/** Approve identity so §C.9 does NOT force Unavailable via mapping. */
async function approveIdentity(
  p: SliplabzPool,
  seed: { player_id: string; game_id: string; team_a: string; team_b: string }
): Promise<void> {
  await p.query(
    `INSERT INTO provider_teams (internal_team_id, provider, provider_team_id, mapping_state, raw_full_name)
     VALUES ($1, 'balldontlie', 'bt-h', 'approved', 'H'),
            ($2, 'balldontlie', 'bt-a', 'approved', 'A')`,
    [seed.team_a, seed.team_b]
  );
  await p.query(
    `INSERT INTO provider_players (internal_player_id, provider, provider_player_id, mapping_state, normalized_name)
     VALUES ($1, 'balldontlie', 'bp-1', 'approved', 'x')`,
    [seed.player_id]
  );
  await p.query(
    `INSERT INTO provider_games (internal_game_id, provider, provider_game_id, mapping_state, raw_home_team, raw_away_team)
     VALUES ($1, 'balldontlie', 'bg-1', 'approved', 'H', 'A')`,
    [seed.game_id]
  );
}

async function seedOddsRun(p: SliplabzPool): Promise<{ run_id: string }> {
  const run_id = randomUUID();
  await p.query(
    `INSERT INTO oddsapi_ingestion_runs
       (oddsapi_ingestion_run_id, request_kind, endpoint, result_state, started_at, completed_at, request_params)
     VALUES ($1, 'current_poll', 'event_odds', 'complete', now(), now(), '{}'::jsonb)`,
    [run_id]
  );
  return { run_id };
}

async function insertMarketOffering(
  p: SliplabzPool,
  args: {
    game_id: string; player_id: string; market_key: string;
    run_id: string; bookmaker_key: string;
    point: number;
    observed_at: string; last_update: string;
  }
): Promise<void> {
  const snap_id = randomUUID();
  await p.query(
    `INSERT INTO market_snapshots
       (market_snapshot_id, oddsapi_ingestion_run_id, provider_event_id,
        linked_internal_game_id, market_key, schema_state,
        bookmaker_key, bookmaker_title, source_class,
        request_kind, provenance,
        provider_last_update, observed_at, freshness_state,
        raw_outcome_row_count, duplicate_group_count, conflict_group_count)
     VALUES ($1, $2, $3::text,
             $4::uuid, $5::text, 'valid',
             $6, $6, 'sportsbook',
             'current_poll', 'self_observed',
             $7::timestamptz, $8::timestamptz, 'fresh',
             1, 0, 0)`,
    [snap_id, args.run_id, `evt-${args.game_id.slice(0, 6)}`,
     args.game_id, args.market_key,
     args.bookmaker_key,
     args.last_update, args.observed_at]
  );
  for (const side of ['over', 'under'] as const) {
    await p.query(
      `INSERT INTO market_offerings
         (market_offering_id, market_snapshot_id,
          raw_player_description, normalized_player_name,
          internal_player_id,
          side, point, raw_price_american,
          price_semantic, promotion_type,
          offering_state, duplicate_count,
          source_hash)
       VALUES ($1, $2,
               'x', 'x',
               $3::uuid,
               $4::outcome_side, $5::numeric, -110,
               'sportsbook_american', 'unknown',
               'two_sided_complete', 1,
               $6)`,
      [randomUUID(), snap_id, args.player_id, side, args.point, `srchash-${randomUUID()}`]
    );
  }
}

async function seedCurrentMarketRow(
  p: SliplabzPool,
  args: {
    game_id: string; player_id: string; market_key: string;
    line_consensus_point: number | null; eligible_sportsbook_count: number;
    freshness_state: 'fresh' | 'aging' | 'stale' | 'unavailable' | 'failed_latest_poll';
    point_distribution: ReadonlyArray<{ point: number; book_count: number }>;
  }
): Promise<string> {
  const cmr_id = randomUUID();
  await p.query(
    `INSERT INTO current_market_rows
       (current_market_row_id, internal_game_id, internal_player_id, market_key,
        line_consensus_point, line_min_point, line_max_point,
        eligible_sportsbook_count, point_distribution,
        freshness_state, provenance, computation_version)
     VALUES ($1, $2, $3, $4,
             $5, $6, $7,
             $8, $9::jsonb,
             $10, 'self_observed', 3)`,
    [
      cmr_id, args.game_id, args.player_id, args.market_key,
      args.line_consensus_point,
      args.point_distribution.length > 0 ? Math.min(...args.point_distribution.map((c) => c.point)) : null,
      args.point_distribution.length > 0 ? Math.max(...args.point_distribution.map((c) => c.point)) : null,
      args.eligible_sportsbook_count,
      JSON.stringify(args.point_distribution),
      args.freshness_state,
    ]
  );
  return cmr_id;
}

/**
 * Seed a historical_line_results grain against a per-game canonical
 * closing point. Simplified: canonical_closing_points is inserted for
 * schema-completeness but the threshold-window compute only reads
 * historical_line_results.player_stat_value + games.scheduled_start_utc.
 */
async function seedHistoricalGame(
  p: SliplabzPool,
  args: {
    player_id: string; team_a: string; team_b: string;
    market_key: string; canonical_stat_key: string;
    game_date_utc: string;
    canonical_closing_point: number;
    player_stat_value: number;
    provenance?: 'self_observed' | 'backfilled_historical';
  }
): Promise<string> {
  const game_id = randomUUID();
  await p.query(
    `INSERT INTO games (internal_game_id, season, season_type, home_team_id, away_team_id,
                       scheduled_start_utc, postseason, status)
     VALUES ($1, 2026, 2, $2, $3, $4::timestamptz, false, 'final')`,
    [game_id, args.team_a, args.team_b, args.game_date_utc]
  );
  const pgs_id = randomUUID();
  await p.query(
    `INSERT INTO player_game_stats
       (player_game_stat_id, provider, provider_player_id, provider_game_id,
        internal_game_id, internal_player_id,
        minutes_status, parsed_minutes, raw_stats, normalized_stats,
        source_hash, raw_minutes, eligibility_state)
     VALUES ($1, 'balldontlie', $2, $3, $4, $5,
             'played', 30, $6::jsonb, $7::jsonb,
             $8, '30', 'eligible')`,
    [pgs_id, `pp-${game_id.slice(0, 6)}`, `pg-${game_id.slice(0, 6)}`, game_id, args.player_id,
     JSON.stringify({ [args.canonical_stat_key]: args.player_stat_value }),
     JSON.stringify({ [args.canonical_stat_key]: args.player_stat_value, pts: 0, reb: 0, ast: 0, fg3m: 0 }),
     `hash-${game_id}-${args.market_key}`]
  );
  const ccp_id = randomUUID();
  await p.query(
    `INSERT INTO canonical_closing_points
       (canonical_closing_point_id, internal_game_id, internal_player_id, market_key,
        selection_method, canonical_closing_point,
        total_eligible_sportsbook_count, sportsbook_count_at_selected_point,
        coverage_label, close_boundary_utc)
     VALUES ($1, $2, $3, $4, 'single_book', $5, 1, 1, 'single_book', $6::timestamptz)`,
    [ccp_id, game_id, args.player_id, args.market_key,
     args.canonical_closing_point, args.game_date_utc]
  );
  const margin = args.player_stat_value - args.canonical_closing_point;
  const outcome = margin > 0 ? 'over' : margin < 0 ? 'under' : 'push';
  await p.query(
    `INSERT INTO historical_line_results
       (internal_game_id, internal_player_id, market_key,
        canonical_closing_point_id, canonical_closing_point,
        player_game_stat_id, player_stat_key, player_stat_value,
        outcome, margin, coverage_state, provenance, computation_version)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'single_book', $11, 3)`,
    [game_id, args.player_id, args.market_key,
     ccp_id, args.canonical_closing_point,
     pgs_id, args.canonical_stat_key, args.player_stat_value,
     outcome, margin, args.provenance ?? 'self_observed']
  );
  return game_id;
}

// ---------------------------------------------------------------------------
// The suite
// ---------------------------------------------------------------------------

describe('V1-A1-3 Phase C — read-model → engine → writer, end to end', () => {
  beforeEach(async () => { if (pool !== null) await scrubEverything(pool); });

  // -------------------------------------------------------------------------
  // Proof 1 — unique modal consensus assembled from real read-model rows
  // -------------------------------------------------------------------------
  it('1: a unique modal consensus, assembled from real read-model rows, produces a persisted profile at that consensus point with the expected classification and reasons', async (t) => {
    if (skipIfUnavailable(t)) return;
    const p = pool!;
    await seedMarketRegistry(p);
    await seedBookmakers(p, ['draftkings', 'fanduel', 'betmgm']);
    const seed = await seedTeamsGamePlayer(p);
    await approveIdentity(p, seed);
    const { run_id } = await seedOddsRun(p);

    // Three sportsbooks quoting at the SAME point 19.5 → unique_modal 19.5.
    const now = new Date().toISOString();
    for (const bk of ['draftkings', 'fanduel', 'betmgm']) {
      await insertMarketOffering(p, {
        game_id: seed.game_id, player_id: seed.player_id, market_key: 'player_points',
        run_id, bookmaker_key: bk, point: 19.5,
        observed_at: now, last_update: now,
      });
    }
    const cmr_id = await seedCurrentMarketRow(p, {
      game_id: seed.game_id, player_id: seed.player_id, market_key: 'player_points',
      line_consensus_point: 19.5, eligible_sportsbook_count: 3,
      freshness_state: 'fresh',
      point_distribution: [{ point: 19.5, book_count: 3 }],
    });

    // Seed enough historical games to clear §C.1 (L10 ≥ 5, season ≥ 10, DR-25 30 days).
    for (let i = 0; i < 15; i += 1) {
      await seedHistoricalGame(p, {
        player_id: seed.player_id, team_a: seed.team_a, team_b: seed.team_b,
        market_key: 'player_points', canonical_stat_key: 'pts',
        game_date_utc: `2026-05-${(i + 1).toString().padStart(2, '0')}T00:00:00Z`,
        canonical_closing_point: 19.5,
        player_stat_value: 22, // consistently above 19.5 → Over-leaning
      });
    }

    // Run the populator with the DEFAULT read-model builder.
    const counters = await runEvidencePopulator({
      connection_string: connection_string!,
      today_utc_date: '2026-07-15',
      reference_date: '2026-07-15',
    });
    assert.equal(counters.grains_observed, 1);
    assert.equal(counters.profiles_inserted, 1);

    const persisted = await p.query(
      `SELECT classification::text, direction::text, evaluated_line::text,
              method_version, computation_version
         FROM evidence_profiles`
    );
    assert.equal(persisted.rowCount, 1);
    const row = persisted.rows[0] as {
      classification: string; direction: string;
      evaluated_line: string;
      method_version: string; computation_version: number;
    };
    // Consistent 22-vs-19.5 pattern with 15 games and a fresh 3-book market
    // yields Over-leaning evidence. Whether it clears the Strong threshold
    // (|score| ≥ 0.55) depends on how the specific inputs align with §C.10
    // clauses; both Strong Over and Moderate Over are legitimate outcomes
    // for this fixture. What matters for this proof is (a) direction = over
    // and (b) the evidence is classified — not Unavailable / Insufficient.
    assert.ok(
      row.classification === 'strong_over_evidence' || row.classification === 'moderate_over_evidence',
      `expected Strong or Moderate Over; got ${row.classification}`
    );
    assert.equal(row.direction, 'over');
    assert.equal(Number(row.evaluated_line), 19.5, 'evaluated line MUST equal the consensus point');
    assert.equal(row.method_version, 'evidence_method_v1');
    assert.equal(row.computation_version, 1);

    // Reasons: at least window_agreement_support (all windows agree).
    const codes = new Set((await p.query(
      `SELECT reason_code::text FROM evidence_profile_reasons`
    )).rows.map((r) => (r as { reason_code: string }).reason_code));
    assert.ok(codes.has('window_agreement_support'));

    // Audit: current_market_row_id anchors the profile to the seeded row.
    const anchor = await p.query(
      `SELECT current_market_row_id::text FROM evidence_profiles`
    );
    assert.equal((anchor.rows[0] as { current_market_row_id: string }).current_market_row_id, cmr_id);
  });

  // -------------------------------------------------------------------------
  // Proof 2 — threshold windows are AT the consensus line (ordering test)
  // -------------------------------------------------------------------------
  it('2: threshold windows are computed AT the consensus line — a fixture where consensus vs. some other line yields DIFFERENT counts, and the consensus-line answer is the one stored', async (t) => {
    if (skipIfUnavailable(t)) return;
    const p = pool!;
    await seedMarketRegistry(p);
    await seedBookmakers(p, ['draftkings', 'fanduel', 'betmgm']);
    const seed = await seedTeamsGamePlayer(p);
    await approveIdentity(p, seed);
    const { run_id } = await seedOddsRun(p);

    // Consensus at 25.5 (deliberately DIFFERENT from the "obvious" line 20.5).
    const now = new Date().toISOString();
    for (const bk of ['draftkings', 'fanduel', 'betmgm']) {
      await insertMarketOffering(p, {
        game_id: seed.game_id, player_id: seed.player_id, market_key: 'player_points',
        run_id, bookmaker_key: bk, point: 25.5,
        observed_at: now, last_update: now,
      });
    }
    await seedCurrentMarketRow(p, {
      game_id: seed.game_id, player_id: seed.player_id, market_key: 'player_points',
      line_consensus_point: 25.5, eligible_sportsbook_count: 3,
      freshness_state: 'fresh',
      point_distribution: [{ point: 25.5, book_count: 3 }],
    });

    // Twelve games with stat values in [20, 22]. Against consensus=25.5,
    // every game is BELOW → strongly Under. Against a hypothetical line
    // of 20.5, most games are AT/ABOVE → the opposite direction. The
    // ordering test proves the engine used 25.5.
    for (let i = 0; i < 12; i += 1) {
      await seedHistoricalGame(p, {
        player_id: seed.player_id, team_a: seed.team_a, team_b: seed.team_b,
        market_key: 'player_points', canonical_stat_key: 'pts',
        game_date_utc: `2026-05-${(i + 1).toString().padStart(2, '0')}T00:00:00Z`,
        canonical_closing_point: 25.5,
        player_stat_value: 20 + (i % 3), // 20, 21, 22 rotating
      });
    }

    await runEvidencePopulator({
      connection_string: connection_string!,
      today_utc_date: '2026-07-15',
      reference_date: '2026-07-15',
    });

    // Assert on the persisted row.
    const persisted = await p.query(
      `SELECT classification::text, direction::text, evaluated_line::text,
              composite_score::text
         FROM evidence_profiles`
    );
    assert.equal(persisted.rowCount, 1);
    const row = persisted.rows[0] as {
      classification: string; direction: string;
      evaluated_line: string; composite_score: string;
    };
    // At line 25.5, every game (stat 20-22) is under → strong under signal.
    assert.equal(Number(row.evaluated_line), 25.5);
    assert.equal(row.direction, 'under',
      'direction MUST be under when windows are computed AT 25.5 (every game below 25.5)');
    // Composite must be negative (Under-signed).
    assert.ok(Number(row.composite_score) < 0,
      `composite MUST be negative at line 25.5; got ${row.composite_score}`);
  });

  // -------------------------------------------------------------------------
  // Proof 3 — tied consensus, assembled from real rows, → Unavailable
  // -------------------------------------------------------------------------
  it('3: tied consensus, assembled from real rows, reaches Unavailable + no_unique_consensus_line with no invented line', async (t) => {
    if (skipIfUnavailable(t)) return;
    const p = pool!;
    await seedMarketRegistry(p);
    await seedBookmakers(p, ['draftkings', 'fanduel', 'betmgm', 'williamhill_us']);
    const seed = await seedTeamsGamePlayer(p);
    await approveIdentity(p, seed);
    const { run_id } = await seedOddsRun(p);

    const now = new Date().toISOString();
    // Two books at 12.5, two at 13.5 → tied 2-2 → tied_no_unique_mode.
    for (const bk of ['draftkings', 'fanduel']) {
      await insertMarketOffering(p, {
        game_id: seed.game_id, player_id: seed.player_id, market_key: 'player_points',
        run_id, bookmaker_key: bk, point: 12.5,
        observed_at: now, last_update: now,
      });
    }
    for (const bk of ['betmgm', 'williamhill_us']) {
      await insertMarketOffering(p, {
        game_id: seed.game_id, player_id: seed.player_id, market_key: 'player_points',
        run_id, bookmaker_key: bk, point: 13.5,
        observed_at: now, last_update: now,
      });
    }
    await seedCurrentMarketRow(p, {
      game_id: seed.game_id, player_id: seed.player_id, market_key: 'player_points',
      line_consensus_point: null, eligible_sportsbook_count: 4,
      freshness_state: 'fresh',
      point_distribution: [
        { point: 12.5, book_count: 2 },
        { point: 13.5, book_count: 2 },
      ],
    });
    // Historical rows to clear §C.1 (would otherwise mask the DR-28 outcome).
    for (let i = 0; i < 15; i += 1) {
      await seedHistoricalGame(p, {
        player_id: seed.player_id, team_a: seed.team_a, team_b: seed.team_b,
        market_key: 'player_points', canonical_stat_key: 'pts',
        game_date_utc: `2026-05-${(i + 1).toString().padStart(2, '0')}T00:00:00Z`,
        canonical_closing_point: 13.0,
        player_stat_value: 15,
      });
    }

    const counters = await runEvidencePopulator({
      connection_string: connection_string!,
      today_utc_date: '2026-07-15',
      reference_date: '2026-07-15',
    });
    assert.equal(counters.profiles_inserted, 1);

    const persisted = await p.query(
      `SELECT classification::text, evaluated_line
         FROM evidence_profiles`
    );
    const row = persisted.rows[0] as { classification: string; evaluated_line: string | null };
    assert.equal(row.classification, 'unavailable');
    assert.equal(row.evaluated_line, null, 'MUST be null — no tiebreak invented');

    const codes = new Set((await p.query(
      `SELECT reason_code::text FROM evidence_profile_reasons`
    )).rows.map((r) => (r as { reason_code: string }).reason_code));
    assert.ok(codes.has('no_unique_consensus_line'));
    assert.ok(!codes.has('no_current_market'), 'tied WITH books MUST NOT emit no_current_market');
  });

  // -------------------------------------------------------------------------
  // Proof 4 — unresolved mapping (real state, no fabricated flag)
  // -------------------------------------------------------------------------
  it('4: a grain whose mapping is unresolved reaches the §C.9 outcome from real mapping state (not a fabricated flag)', async (t) => {
    if (skipIfUnavailable(t)) return;
    const p = pool!;
    await seedMarketRegistry(p);
    await seedBookmakers(p, ['draftkings']);
    const seed = await seedTeamsGamePlayer(p);
    // Deliberately DO NOT approve identity: no provider_players / provider_games rows.
    const { run_id } = await seedOddsRun(p);
    const now = new Date().toISOString();
    await insertMarketOffering(p, {
      game_id: seed.game_id, player_id: seed.player_id, market_key: 'player_points',
      run_id, bookmaker_key: 'draftkings', point: 19.5,
      observed_at: now, last_update: now,
    });
    await seedCurrentMarketRow(p, {
      game_id: seed.game_id, player_id: seed.player_id, market_key: 'player_points',
      line_consensus_point: 19.5, eligible_sportsbook_count: 1,
      freshness_state: 'fresh',
      point_distribution: [{ point: 19.5, book_count: 1 }],
    });
    // No approved mapping ⇒ mappingResolution returns resolved=false for both.

    await runEvidencePopulator({
      connection_string: connection_string!,
      today_utc_date: '2026-07-15',
      reference_date: '2026-07-15',
    });
    const persisted = await p.query(
      `SELECT classification::text FROM evidence_profiles`
    );
    assert.equal(persisted.rowCount, 1);
    assert.equal((persisted.rows[0] as { classification: string }).classification, 'unavailable');
    const codes = new Set((await p.query(
      `SELECT reason_code::text FROM evidence_profile_reasons`
    )).rows.map((r) => (r as { reason_code: string }).reason_code));
    // The §D.1 first-match order for Unavailable causes prefers postponed/canceled →
    // unresolved player → unresolved event → no current market → tied. Since neither
    // mapping is approved, unresolved_player_mapping fires first per Phase A ordering.
    assert.ok(codes.has('unresolved_player_mapping'),
      'unresolved mapping MUST fire from real provider_players state, not from a fabricated flag');
  });

  // -------------------------------------------------------------------------
  // Proof 5 — includes_backfilled_historical is derived from real provenance
  // -------------------------------------------------------------------------
  it('5: includes_backfilled_historical is computed from actual row provenance and reaches the persisted profile intact', async (t) => {
    if (skipIfUnavailable(t)) return;
    const p = pool!;
    await seedMarketRegistry(p);
    await seedBookmakers(p, ['draftkings', 'fanduel', 'betmgm']);
    const seed = await seedTeamsGamePlayer(p);
    await approveIdentity(p, seed);
    const { run_id } = await seedOddsRun(p);
    const now = new Date().toISOString();
    for (const bk of ['draftkings', 'fanduel', 'betmgm']) {
      await insertMarketOffering(p, {
        game_id: seed.game_id, player_id: seed.player_id, market_key: 'player_points',
        run_id, bookmaker_key: bk, point: 19.5,
        observed_at: now, last_update: now,
      });
    }
    await seedCurrentMarketRow(p, {
      game_id: seed.game_id, player_id: seed.player_id, market_key: 'player_points',
      line_consensus_point: 19.5, eligible_sportsbook_count: 3,
      freshness_state: 'fresh',
      point_distribution: [{ point: 19.5, book_count: 3 }],
    });
    // Seed historical: mix of self_observed and backfilled_historical.
    for (let i = 0; i < 15; i += 1) {
      await seedHistoricalGame(p, {
        player_id: seed.player_id, team_a: seed.team_a, team_b: seed.team_b,
        market_key: 'player_points', canonical_stat_key: 'pts',
        game_date_utc: `2026-05-${(i + 1).toString().padStart(2, '0')}T00:00:00Z`,
        canonical_closing_point: 19.5,
        player_stat_value: 22,
        provenance: i === 0 ? 'backfilled_historical' : 'self_observed',
      });
    }

    await runEvidencePopulator({
      connection_string: connection_string!,
      today_utc_date: '2026-07-15',
      reference_date: '2026-07-15',
    });
    const persisted = await p.query(
      `SELECT includes_backfilled_historical FROM evidence_profiles`
    );
    assert.equal(persisted.rowCount, 1);
    assert.equal(
      (persisted.rows[0] as { includes_backfilled_historical: boolean }).includes_backfilled_historical,
      true,
      'includes_backfilled_historical MUST be true when at least one input carries backfilled provenance'
    );
  });

  // -------------------------------------------------------------------------
  // Proof 6 — re-running the driver is idempotent
  // -------------------------------------------------------------------------
  it('6: re-running the driver over the same fixture set is idempotent — checksum over derived columns unchanged', async (t) => {
    if (skipIfUnavailable(t)) return;
    const p = pool!;
    await seedMarketRegistry(p);
    await seedBookmakers(p, ['draftkings', 'fanduel', 'betmgm']);
    const seed = await seedTeamsGamePlayer(p);
    await approveIdentity(p, seed);
    const { run_id } = await seedOddsRun(p);
    const now = new Date().toISOString();
    for (const bk of ['draftkings', 'fanduel', 'betmgm']) {
      await insertMarketOffering(p, {
        game_id: seed.game_id, player_id: seed.player_id, market_key: 'player_points',
        run_id, bookmaker_key: bk, point: 19.5,
        observed_at: now, last_update: now,
      });
    }
    await seedCurrentMarketRow(p, {
      game_id: seed.game_id, player_id: seed.player_id, market_key: 'player_points',
      line_consensus_point: 19.5, eligible_sportsbook_count: 3,
      freshness_state: 'fresh',
      point_distribution: [{ point: 19.5, book_count: 3 }],
    });
    for (let i = 0; i < 15; i += 1) {
      await seedHistoricalGame(p, {
        player_id: seed.player_id, team_a: seed.team_a, team_b: seed.team_b,
        market_key: 'player_points', canonical_stat_key: 'pts',
        game_date_utc: `2026-05-${(i + 1).toString().padStart(2, '0')}T00:00:00Z`,
        canonical_closing_point: 19.5,
        player_stat_value: 22,
      });
    }

    const first = await runEvidencePopulator({
      connection_string: connection_string!,
      today_utc_date: '2026-07-15',
      reference_date: '2026-07-15',
    });
    assert.equal(first.profiles_inserted, 1);

    const cs1 = await p.query(
      `SELECT md5(string_agg(
         classification::text || coalesce(composite_score::text, '') || coalesce(evaluated_line::text, ''),
         ',' ORDER BY evidence_profile_id
       )) AS h FROM evidence_profiles`
    );
    const second = await runEvidencePopulator({
      connection_string: connection_string!,
      today_utc_date: '2026-07-15',
      reference_date: '2026-07-15',
    });
    assert.equal(second.profiles_inserted, 0);
    assert.equal(second.profiles_updated, 1, 'second run must UPDATE (idempotent), not INSERT a duplicate');
    const cs2 = await p.query(
      `SELECT md5(string_agg(
         classification::text || coalesce(composite_score::text, '') || coalesce(evaluated_line::text, ''),
         ',' ORDER BY evidence_profile_id
       )) AS h FROM evidence_profiles`
    );
    assert.equal(
      (cs2.rows[0] as { h: string }).h,
      (cs1.rows[0] as { h: string }).h,
      'derived-column checksum MUST NOT change across a re-run'
    );
  });

  // -------------------------------------------------------------------------
  // Sanity: the builder factory + closure shape (dev ergonomics)
  // -------------------------------------------------------------------------
  it('sanity: makeReadModelInputBuilder returns null for a non-launch market_key (four-market scope lock per GD-9)', async (t) => {
    if (skipIfUnavailable(t)) return;
    const p = pool!;
    // No fixtures needed for this pure-code-path smoke test.
    const builder = makeReadModelInputBuilder({
      today_utc_date: '2026-07-15',
      reference_date: '2026-07-15',
    });
    await withTransaction(p, async (tx) => {
      const grain: EvidenceGrain = {
        internal_game_id: randomUUID(),
        internal_player_id: randomUUID(),
        market_key: 'player_steals', // not in DR-14 locked set
        current_market_row_id: randomUUID(),
        source_read_model_computation_version: 3,
      };
      const r = await builder(grain, tx);
      assert.equal(r, null);
    });
  });
});

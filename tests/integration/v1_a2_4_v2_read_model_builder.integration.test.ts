// V1-A2-4 — v2 read-model input builder (line_observed_at) integration proofs.
//
// These proofs drive the PRODUCTION v2 wiring end to end against local
// Docker fixtures — NO hardcoded literals in the input path:
//   listAllGrains → makeV2ReadModelInputBuilder → runEvidencePopulatorV2.
//
// Proof 2 — line_observed_at CORRECTNESS: offerings at KNOWN differing
//           observed_at → the builder surfaces the FRESHEST, never the
//           oldest / first / a clock read.
// Proof 3 — NULL HONESTY: a grain with zero eligible offerings →
//           line_observed_at = null → v2 routes via book_count to
//           absent → Unavailable + NO_CURRENT_MARKET. No fabricated ts.
// Proof 4 — END TO END: the v2 populator, wired through the production
//           builder, persists v2 profiles with BOTH timing columns
//           non-null and ONE shared evaluation_reference_time.
// Proof 5 — BEYOND-HORIZON still persists NO row when driven through the
//           real builder (line_observed_at from data, not a literal).

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import { openTestDb } from './support/db.js';
import type { SliplabzPool } from '../../src/db/connection.js';
import { withTransaction } from '../../src/db/transaction.js';
import { listAllGrains } from '../../src/evidence/driver/populate.js';
import type { EvidenceGrain } from '../../src/evidence/driver/populate.js';
import { runEvidencePopulatorV2 } from '../../src/evidence/v2/populateV2.js';
import { makeV2ReadModelInputBuilder } from '../../src/evidence/v2/readModelInputBuilderV2.js';

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
// Fixture seeding (same source tables the read-model composer reads).
// Copied verbatim in shape from the V1-A1-3 Phase C suite.
// ---------------------------------------------------------------------------

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
  p: SliplabzPool
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
     VALUES ($1, 2026, 2, $2, $3, '2026-07-20T00:00:00Z', false, 'scheduled')`,
    [game_id, team_a, team_b]
  );
  const player_id = randomUUID();
  await p.query(
    `INSERT INTO players (internal_player_id, display_name, normalized_name, current_team_id, status)
     VALUES ($1, 'X', 'x', $2, 'active_confirmed')`,
    [player_id, team_a]
  );
  return { team_a, team_b, game_id, player_id };
}

async function approveIdentity(
  p: SliplabzPool,
  seed: { player_id: string; game_id: string; team_a: string; team_b: string }
): Promise<void> {
  await p.query(
    `INSERT INTO provider_teams (internal_team_id, provider, provider_team_id, mapping_state, raw_full_name)
     VALUES ($1, 'balldontlie', $3, 'approved', 'H'),
            ($2, 'balldontlie', $4, 'approved', 'A')`,
    [seed.team_a, seed.team_b, `bt-h-${seed.team_a.slice(0, 6)}`, `bt-a-${seed.team_b.slice(0, 6)}`]
  );
  await p.query(
    `INSERT INTO provider_players (internal_player_id, provider, provider_player_id, mapping_state, normalized_name)
     VALUES ($1, 'balldontlie', $2, 'approved', 'x')`,
    [seed.player_id, `bp-${seed.player_id.slice(0, 6)}`]
  );
  await p.query(
    `INSERT INTO provider_games (internal_game_id, provider, provider_game_id, mapping_state, raw_home_team, raw_away_team)
     VALUES ($1, 'balldontlie', $2, 'approved', 'H', 'A')`,
    [seed.game_id, `bg-${seed.game_id.slice(0, 6)}`]
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
       VALUES ($1, $2, 'x', 'x', $3::uuid,
               $4::outcome_side, $5::numeric, -110,
               'sportsbook_american', 'unknown',
               'two_sided_complete', 1, $6)`,
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
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, 'self_observed', 3)`,
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

async function seedHistoricalGame(
  p: SliplabzPool,
  args: {
    player_id: string; team_a: string; team_b: string;
    market_key: string; canonical_stat_key: string;
    game_date_utc: string;
    canonical_closing_point: number;
    player_stat_value: number;
  }
): Promise<void> {
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
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'single_book', 'self_observed', 3)`,
    [game_id, args.player_id, args.market_key,
     ccp_id, args.canonical_closing_point,
     pgs_id, args.canonical_stat_key, args.player_stat_value,
     outcome, margin]
  );
}

/** Seed a fully-classifiable Over-leaning grain with fresh offerings at `point`. */
async function seedOverGrain(
  p: SliplabzPool,
  args: { point: number; observed_at_iso: readonly string[]; books: readonly string[] }
): Promise<{ grain_game: string; grain_player: string; cmr_id: string }> {
  await seedMarketRegistry(p);
  await seedBookmakers(p, args.books);
  const seed = await seedTeamsGamePlayer(p);
  await approveIdentity(p, seed);
  const { run_id } = await seedOddsRun(p);
  args.books.forEach(() => { /* books seeded above */ });
  for (let i = 0; i < args.books.length; i += 1) {
    await insertMarketOffering(p, {
      game_id: seed.game_id, player_id: seed.player_id, market_key: 'player_points',
      run_id, bookmaker_key: args.books[i]!, point: args.point,
      observed_at: args.observed_at_iso[i]!, last_update: args.observed_at_iso[i]!,
    });
  }
  const cmr_id = await seedCurrentMarketRow(p, {
    game_id: seed.game_id, player_id: seed.player_id, market_key: 'player_points',
    line_consensus_point: args.point, eligible_sportsbook_count: args.books.length,
    freshness_state: 'fresh',
    point_distribution: [{ point: args.point, book_count: args.books.length }],
  });
  for (let i = 0; i < 15; i += 1) {
    await seedHistoricalGame(p, {
      player_id: seed.player_id, team_a: seed.team_a, team_b: seed.team_b,
      market_key: 'player_points', canonical_stat_key: 'pts',
      game_date_utc: `2026-05-${(i + 1).toString().padStart(2, '0')}T00:00:00Z`,
      canonical_closing_point: args.point,
      player_stat_value: args.point + 2.5, // consistently above → Over-leaning
    });
  }
  return { grain_game: seed.game_id, grain_player: seed.player_id, cmr_id };
}

// A whole-second base so observed_at values round-trip exactly through
// Postgres timestamptz → JS Date → toISOString().
function isoAt(baseMs: number, offsetSecondsAgo: number): string {
  return new Date(baseMs - offsetSecondsAgo * 1000).toISOString();
}

const CTX = { today_utc_date: '2026-07-15', reference_date: '2026-07-15' };

// ---------------------------------------------------------------------------
describe('V1-A2-4 — v2 read-model builder (line_observed_at), production wiring', () => {
  beforeEach(async () => { if (pool !== null) await scrubEverything(pool); });

  // -------------------------------------------------------------------------
  it('PROOF 2 — builder surfaces the FRESHEST observed_at across the grain\'s offerings (not oldest/first/clock)', async (t) => {
    if (skipIfUnavailable(t)) return;
    const p = pool!;
    const base = Math.floor(Date.now() / 1000) * 1000;
    // Three books at the SAME point, DISTINCT observed_at, all within the
    // composer fresh window (<90s). Freshest is base-10s; a wrong choice
    // (oldest base-40s / first-inserted) yields a visibly different value.
    const obs_oldest = isoAt(base, 40);
    const obs_middle = isoAt(base, 25);
    const obs_freshest = isoAt(base, 10);
    const g = await seedOverGrain(p, {
      point: 19.5,
      books: ['draftkings', 'fanduel', 'betmgm'],
      observed_at_iso: [obs_oldest, obs_middle, obs_freshest], // insertion order != freshness order
    });

    const grain: EvidenceGrain = {
      internal_game_id: g.grain_game, internal_player_id: g.grain_player,
      market_key: 'player_points', current_market_row_id: g.cmr_id,
      source_read_model_computation_version: 3,
    };
    const builder = makeV2ReadModelInputBuilder(CTX);
    const built = await withTransaction(p, async (tx) => builder(grain, tx));

    assert.ok(built !== null, 'builder must return a result for a populated grain');
    assert.equal(built!.line_observed_at, obs_freshest, 'line_observed_at MUST be the freshest observed_at');
    assert.notEqual(built!.line_observed_at, obs_oldest, 'must NOT be the oldest');
    assert.notEqual(built!.line_observed_at, obs_middle, 'must NOT be the middle');
    // And it is an OBSERVATION time from the data, not a clock read: the
    // value is strictly in the past of `now` by ~10s and is one of the three
    // seeded literals.
    assert.ok([obs_oldest, obs_middle, obs_freshest].includes(built!.line_observed_at!),
      'line_observed_at must be one of the seeded observation timestamps');
  });

  // -------------------------------------------------------------------------
  it('PROOF 3 — zero eligible offerings → line_observed_at null → v2 routes via book_count to Unavailable + NO_CURRENT_MARKET (no fabricated ts)', async (t) => {
    if (skipIfUnavailable(t)) return;
    const p = pool!;
    // A grain with a current_market_rows anchor but ZERO market_offerings.
    await seedMarketRegistry(p);
    const seed = await seedTeamsGamePlayer(p);
    await approveIdentity(p, seed);
    const cmr_id = await seedCurrentMarketRow(p, {
      game_id: seed.game_id, player_id: seed.player_id, market_key: 'player_points',
      line_consensus_point: null, eligible_sportsbook_count: 0,
      freshness_state: 'unavailable', point_distribution: [],
    });
    const grain: EvidenceGrain = {
      internal_game_id: seed.game_id, internal_player_id: seed.player_id,
      market_key: 'player_points', current_market_row_id: cmr_id,
      source_read_model_computation_version: 3,
    };

    // (a) direct builder: line_observed_at is null; book_count is 0.
    const builder = makeV2ReadModelInputBuilder(CTX);
    const built = await withTransaction(p, async (tx) => builder(grain, tx));
    assert.ok(built !== null, 'builder returns a result even with no offerings');
    assert.equal(built!.line_observed_at, null, 'line_observed_at MUST be null with zero offerings');
    assert.equal(built!.input.current_market_row.eligible_book_count.count, 0, 'book_count must be 0');

    // (b) end to end: v2 routes book_count=0 → absent → Unavailable + NO_CURRENT_MARKET.
    const counters = await runEvidencePopulatorV2({
      grains: [grain], build_profile_input: builder,
      connection_string: connection_string!,
    });
    assert.equal(counters.profiles_inserted, 1);
    assert.equal(counters.grains_skipped_beyond_horizon, 0);

    const row = (await p.query(
      `SELECT classification::text, evaluated_line, method_version FROM evidence_profiles`
    )).rows[0] as { classification: string; evaluated_line: string | null; method_version: string };
    assert.equal(row.classification, 'unavailable');
    assert.equal(row.method_version, 'evidence_method_v2');
    assert.equal(row.evaluated_line, null, 'no fabricated line on an Unavailable v2 row');
    const reasons = (await p.query(
      `SELECT reason_code::text FROM evidence_profile_reasons`
    )).rows.map((r) => (r as { reason_code: string }).reason_code);
    assert.ok(reasons.includes('no_current_market'), `expected NO_CURRENT_MARKET; got ${reasons.join(',')}`);
  });

  // -------------------------------------------------------------------------
  it('PROOF 4 — end to end via production wiring: v2 profiles persist with both timing columns non-null and ONE shared evaluation_reference_time', async (t) => {
    if (skipIfUnavailable(t)) return;
    const p = pool!;
    const base = Math.floor(Date.now() / 1000) * 1000;
    const fresh = [isoAt(base, 12), isoAt(base, 11), isoAt(base, 10)];
    // Two independent fully-classifiable grains (two games/players).
    await seedOverGrain(p, { point: 19.5, books: ['draftkings', 'fanduel', 'betmgm'], observed_at_iso: fresh });
    await seedOverGrain(p, { point: 22.5, books: ['draftkings', 'fanduel', 'betmgm'], observed_at_iso: fresh });

    const grains = await listAllGrains(connection_string!);
    assert.equal(grains.length, 2, 'listAllGrains must enumerate both seeded grains');

    const builder = makeV2ReadModelInputBuilder(CTX);
    const counters = await runEvidencePopulatorV2({
      grains, build_profile_input: builder,
      connection_string: connection_string!,
      // No explicit evaluation_reference_time: the populator captures ONE at
      // batch start and shares it (owner R4). offerings ~10s old → fresh.
    });
    assert.equal(counters.profiles_inserted, 2, 'both grains persist a v2 profile');
    assert.equal(counters.grains_skipped_beyond_horizon, 0);

    const rows = (await p.query(
      `SELECT evaluation_reference_time::text AS ert, profile_generated_at::text AS pga,
              method_version, classification::text
         FROM evidence_profiles`
    )).rows as ReadonlyArray<{ ert: string | null; pga: string | null; method_version: string; classification: string }>;
    assert.equal(rows.length, 2);
    for (const r of rows) {
      assert.equal(r.method_version, 'evidence_method_v2');
      assert.ok(r.ert !== null && r.ert.length > 0, 'evaluation_reference_time non-null');
      assert.ok(r.pga !== null && r.pga.length > 0, 'profile_generated_at non-null');
    }
    const distinct = new Set(rows.map((r) => r.ert));
    assert.equal(distinct.size, 1, 'every v2 row in the batch shares ONE evaluation_reference_time');
    // Same INSTANT (Postgres ::text renders differently from JS ISO-8601).
    assert.equal(
      Date.parse([...distinct][0]!),
      Date.parse(counters.evaluation_reference_time),
      'counter ERT matches persisted ERT (same instant)'
    );
  });

  // -------------------------------------------------------------------------
  it('PROOF 5 — beyond-horizon (classification_age > 3600) through the real builder persists NO row', async (t) => {
    if (skipIfUnavailable(t)) return;
    const p = pool!;
    const base = Math.floor(Date.now() / 1000) * 1000;
    const obs = isoAt(base, 10); // ~10s old → composer keeps it fresh (book_count>=1)
    const g = await seedOverGrain(p, {
      point: 19.5, books: ['draftkings', 'fanduel', 'betmgm'],
      observed_at_iso: [isoAt(base, 12), isoAt(base, 11), obs],
    });
    const grains = await listAllGrains(connection_string!);
    assert.equal(grains.length, 1);

    // line_observed_at from the builder = `obs` (freshest). Set the batch
    // reference 4000s AFTER it → classification_age 4000s > 3600 →
    // beyond-horizon. The age is driven by REAL data, not a literal.
    const ert = new Date(Date.parse(obs) + 4000 * 1000).toISOString();
    const builder = makeV2ReadModelInputBuilder(CTX);
    const counters = await runEvidencePopulatorV2({
      grains, build_profile_input: builder,
      connection_string: connection_string!,
      evaluation_reference_time: ert,
    });
    assert.equal(counters.grains_skipped_beyond_horizon, 1, 'grain classified beyond-horizon');
    assert.equal(counters.profiles_inserted, 0, 'beyond-horizon inserts NO row');

    const n = (await p.query(
      `SELECT count(*)::int AS n FROM evidence_profiles
        WHERE internal_game_id = $1 AND internal_player_id = $2`,
      [g.grain_game, g.grain_player]
    )).rows[0] as { n: number };
    assert.equal(n.n, 0, 'zero evidence_profiles rows exist for the beyond-horizon grain');
  });
});

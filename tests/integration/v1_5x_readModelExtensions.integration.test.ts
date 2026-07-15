// V1-5x integration test — RME-1, RME-2, RME-3 against a live Postgres.
//
// Authority: docs/product/EVIDENCE_PROFILE_METHOD_V1.md §I.2 read-model
// extensions ruling. This suite proves the three extensions materialize
// correctly end-to-end so V1-A1-3 can consume them directly without
// deriving a parallel version.

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import { openTestDb, truncateAllV14Tables } from './support/db.js';
import type { SliplabzPool } from '../../src/db/connection.js';
import {
  readHistoricalCoverageForPlayerMarket,
  satisfiesDR25ThirtyDayCoverage,
} from '../../src/computation/historicalCoverage.js';
import { readMappingResolutionForGrain } from '../../src/computation/mappingResolution.js';
import { composeCurrentMarketRow } from '../../src/computation/currentMarketRow.js';
import type { CurrentOffering } from '../../src/computation/types.js';

let pool: SliplabzPool | null = null;
let skip_reason: string | null = null;

before(async () => { const h = await openTestDb(); pool = h.pool; skip_reason = h.skip_reason; });
after(async () => { if (pool !== null) await pool.end(); });
function skipIfUnavailable(t: { skip: (msg?: string) => void }): boolean {
  if (pool === null) { t.skip(`SKIP: ${skip_reason}`); return true; }
  return false;
}

async function seedTeamsGamePlayer(): Promise<{
  team_a: string; team_b: string; game_id: string; player_id: string;
}> {
  const p = pool!;
  const team_a = randomUUID();
  const team_b = randomUUID();
  await p.query(
    `INSERT INTO teams (internal_team_id, display_name, abbreviation, classification, city)
     VALUES ($1,'H','H','current_franchise','X'), ($2,'A','A','current_franchise','Y')`,
    [team_a, team_b]
  );
  const game_id = randomUUID();
  await p.query(
    `INSERT INTO games (internal_game_id, season, season_type, home_team_id, away_team_id, scheduled_start_utc, postseason, status)
     VALUES ($1, 2026, 2, $2, $3, '2026-07-13T00:00:00Z', false, 'final')`,
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

async function seedRegistries(): Promise<void> {
  const p = pool!;
  await p.query(
    `INSERT INTO bookmaker_registry (provider_key, display_title, source_class, approved_by)
     VALUES ('draftkings','DraftKings','sportsbook','test'),
            ('fanduel',   'FanDuel',   'sportsbook','test')`
  );
  await p.query(
    `INSERT INTO market_registry (provider_key, display_title, is_launch_market, canonical_stat_key, approved_by)
     VALUES ('player_points',   'Player Points',   true, 'pts',  'test'),
            ('player_rebounds', 'Player Rebounds', true, 'reb',  'test'),
            ('player_assists',  'Player Assists',  true, 'ast',  'test'),
            ('player_threes',   'Player Threes',   true, 'fg3m', 'test')`
  );
}

/** Insert one historical_line_results row for the (game, player, market) grain.
 *  Requires: an eligible player_game_stats row and a canonical_closing_points row.
 *  Uses provenance = 'backfilled_historical' if `backfilled` is true. */
async function insertHistoricalGrain(
  game_date_utc: string,
  player_id: string,
  team_a: string,
  team_b: string,
  market_key: 'player_points' | 'player_rebounds' | 'player_assists' | 'player_threes',
  canon_point: number,
  stat_value: number,
  backfilled: boolean
): Promise<string> {
  const p = pool!;
  const stat_key = ({
    player_points: 'pts', player_rebounds: 'reb', player_assists: 'ast', player_threes: 'fg3m',
  } as const)[market_key];
  const game_id = randomUUID();
  await p.query(
    `INSERT INTO games (internal_game_id, season, season_type, home_team_id, away_team_id, scheduled_start_utc, postseason, status)
     VALUES ($1, 2026, 2, $2, $3, $4::timestamptz, false, 'final')`,
    [game_id, team_a, team_b, game_date_utc]
  );
  const pgs_id = randomUUID();
  await p.query(
    `INSERT INTO player_game_stats
       (player_game_stat_id, provider, provider_player_id, provider_game_id,
        internal_game_id, internal_player_id,
        minutes_status, parsed_minutes, raw_stats, normalized_stats,
        source_hash, raw_minutes, eligibility_state)
     VALUES ($1, 'balldontlie', $2, $3, $4, $5, 'played', 30,
             $6::jsonb, $7::jsonb, $8, '30', 'eligible')`,
    [pgs_id, `pp-${game_id}`, `pg-${game_id}`, game_id, player_id,
     JSON.stringify({ [stat_key]: stat_value }),
     JSON.stringify({ [stat_key]: stat_value, pts: 0, reb: 0, ast: 0, fg3m: 0 }),
     `hash-${game_id}-${market_key}`]
  );
  const ccp_id = randomUUID();
  await p.query(
    `INSERT INTO canonical_closing_points
       (canonical_closing_point_id, internal_game_id, internal_player_id,
        market_key, selection_method, canonical_closing_point,
        total_eligible_sportsbook_count, sportsbook_count_at_selected_point,
        coverage_label, close_boundary_utc)
     VALUES ($1,$2,$3,$4,'single_book',$5,1,1,'single_book',$6::timestamptz)`,
    [ccp_id, game_id, player_id, market_key, canon_point, game_date_utc]
  );
  const margin = stat_value - canon_point;
  const outcome = margin > 0 ? 'over' : margin < 0 ? 'under' : 'push';
  await p.query(
    `INSERT INTO historical_line_results
       (internal_game_id, internal_player_id, market_key,
        canonical_closing_point_id, canonical_closing_point,
        player_game_stat_id, player_stat_key, player_stat_value,
        outcome, margin, coverage_state, provenance, computation_version)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'single_book',$11,3)`,
    [game_id, player_id, market_key, ccp_id, canon_point, pgs_id, stat_key,
     stat_value, outcome, margin, backfilled ? 'backfilled_historical' : 'self_observed']
  );
  return game_id;
}

// ---------------------------------------------------------------------------
// RME-1 — HistoricalCoverageResult
// ---------------------------------------------------------------------------
describe('V1-5x RME-1 — HistoricalCoverageResult (live Postgres)', () => {
  it('LOAD-BEARING: coverage_start_date is MIN(games.scheduled_start_utc::date) across eligible historical_line_results at the (player, market) grain', async (t) => {
    if (skipIfUnavailable(t)) return;
    const p = pool!;
    await truncateAllV14Tables(p);
    await seedRegistries();
    const base = await seedTeamsGamePlayer();
    // Three games with historical_line_results at player_points:
    //   * 2026-05-10 (self_observed)
    //   * 2026-03-20 (backfilled)
    //   * 2026-06-01 (self_observed)
    // Earliest = 2026-03-20 (backfilled); includes_backfilled_historical = true.
    await insertHistoricalGrain('2026-05-10T00:00:00Z', base.player_id, base.team_a, base.team_b, 'player_points', 18.5, 22, false);
    await insertHistoricalGrain('2026-03-20T00:00:00Z', base.player_id, base.team_a, base.team_b, 'player_points', 18.5, 15, true);
    await insertHistoricalGrain('2026-06-01T00:00:00Z', base.player_id, base.team_a, base.team_b, 'player_points', 18.5, 20, false);
    // A row on a DIFFERENT market (player_rebounds) MUST NOT leak into the query.
    await insertHistoricalGrain('2025-11-01T00:00:00Z', base.player_id, base.team_a, base.team_b, 'player_rebounds', 8.5, 7, false);

    const coverage = await readHistoricalCoverageForPlayerMarket(p, base.player_id, 'player_points');
    assert.equal(coverage.internal_player_id, base.player_id);
    assert.equal(coverage.market_key, 'player_points');
    assert.equal(coverage.coverage_start_date, '2026-03-20');
    assert.equal(coverage.eligible_game_count, 3);
    // DR-23 stance visible on returned shape.
    assert.equal(coverage.includes_backfilled_historical, true);
    // DR-25 predicate: 2026-03-20 → 2026-07-14 is 116 days, satisfies.
    assert.equal(satisfiesDR25ThirtyDayCoverage(coverage, '2026-07-14'), true);

    // Cross-market isolation: rebounds coverage starts at 2025-11-01.
    const rebounds = await readHistoricalCoverageForPlayerMarket(p, base.player_id, 'player_rebounds');
    assert.equal(rebounds.coverage_start_date, '2025-11-01');
    assert.equal(rebounds.eligible_game_count, 1);
    assert.equal(rebounds.includes_backfilled_historical, false);
  });

  it('LOAD-BEARING (DR-25): 29 days apart → predicate returns false; 30 days apart → true', async (t) => {
    if (skipIfUnavailable(t)) return;
    const p = pool!;
    await truncateAllV14Tables(p);
    await seedRegistries();
    const base = await seedTeamsGamePlayer();
    // One eligible row on 2026-06-15 → 29 days before 2026-07-14.
    await insertHistoricalGrain('2026-06-15T12:00:00Z', base.player_id, base.team_a, base.team_b, 'player_points', 18.5, 20, false);
    const c = await readHistoricalCoverageForPlayerMarket(p, base.player_id, 'player_points');
    assert.equal(c.coverage_start_date, '2026-06-15');
    assert.equal(satisfiesDR25ThirtyDayCoverage(c, '2026-07-14'), false);
    // As of 2026-07-15, exactly 30 days → true.
    assert.equal(satisfiesDR25ThirtyDayCoverage(c, '2026-07-15'), true);
  });

  it('no eligible rows → coverage_start_date null, count 0, DR-25 predicate false', async (t) => {
    if (skipIfUnavailable(t)) return;
    const p = pool!;
    await truncateAllV14Tables(p);
    await seedRegistries();
    const base = await seedTeamsGamePlayer();
    const c = await readHistoricalCoverageForPlayerMarket(p, base.player_id, 'player_points');
    assert.equal(c.coverage_start_date, null);
    assert.equal(c.eligible_game_count, 0);
    assert.equal(satisfiesDR25ThirtyDayCoverage(c, '2026-07-14'), false);
  });
});

// ---------------------------------------------------------------------------
// RME-2 — MappingResolutionResult
// ---------------------------------------------------------------------------
/** Insert an approved provider_players row pointing at internal_player_id.
 *  Positive mapping per V1-1 identity contract §§1, 6, 8. */
async function approvePlayerMapping(
  provider_player_id: string,
  internal_player_id: string
): Promise<void> {
  const p = pool!;
  await p.query(
    `INSERT INTO provider_players
       (provider, provider_player_id, internal_player_id,
        raw_first_name, raw_last_name, raw_full_name, normalized_name,
        mapping_state)
     VALUES ('balldontlie', $1, $2::uuid, 'X', 'Y', 'X Y', 'x y', 'approved')`,
    [provider_player_id, internal_player_id]
  );
}

/** Insert a quarantined provider_players row (mapping_state = 'quarantined').
 *  internal_player_id may be null — the CHECK only forces non-null on 'approved'. */
async function quarantinePlayerMapping(
  provider_player_id: string,
  internal_player_id: string | null
): Promise<void> {
  const p = pool!;
  await p.query(
    `INSERT INTO provider_players
       (provider, provider_player_id, internal_player_id,
        raw_first_name, raw_last_name, raw_full_name, normalized_name,
        mapping_state)
     VALUES ('balldontlie', $1, $2::uuid, 'X', 'Y', 'X Y', 'x y', 'quarantined')`,
    [provider_player_id, internal_player_id]
  );
}

async function approveGameMapping(
  provider_game_id: string,
  internal_game_id: string
): Promise<void> {
  const p = pool!;
  await p.query(
    `INSERT INTO provider_games
       (provider, provider_game_id, internal_game_id,
        raw_home_team, raw_away_team, raw_sport_key, raw_sport_title,
        mapping_state)
     VALUES ('odds_api', $1, $2::uuid, 'H', 'A', 'basketball_wnba', 'WNBA', 'approved')`,
    [provider_game_id, internal_game_id]
  );
}

describe('V1-5x RME-2 — MappingResolutionResult (live Postgres, POSITIVE predicate)', () => {
  it('LOAD-BEARING (CORRECTION): APPROVED provider mappings for both grains → resolved=true, queue_reason=null', async (t) => {
    if (skipIfUnavailable(t)) return;
    const p = pool!;
    await truncateAllV14Tables(p);
    await seedRegistries();
    const base = await seedTeamsGamePlayer();
    await approvePlayerMapping('pp-approved', base.player_id);
    await approveGameMapping('evt-approved', base.game_id);
    const r = await readMappingResolutionForGrain(p, base.player_id, base.game_id);
    assert.equal(r.player_resolved, true);
    assert.equal(r.event_resolved, true);
    assert.equal(r.queue_reason, null);
  });

  it("LOAD-BEARING (CORRECTION): NO provider mapping at all → resolved=false; queue silent → queue_reason='unmatched' (V1-1 vocabulary, not invented)", async (t) => {
    if (skipIfUnavailable(t)) return;
    const p = pool!;
    await truncateAllV14Tables(p);
    await seedRegistries();
    const base = await seedTeamsGamePlayer();
    // No provider_players row, no provider_games row, no queue rows.
    const r = await readMappingResolutionForGrain(p, base.player_id, base.game_id);
    assert.equal(r.player_resolved, false);
    assert.equal(r.event_resolved, false);
    // Player-side fallback wins per §C.9; both fall back to 'unmatched'.
    assert.equal(r.queue_reason, 'unmatched');
  });

  it("LOAD-BEARING (CORRECTION): QUARANTINED player mapping → player_resolved=false even without any open queue row", async (t) => {
    if (skipIfUnavailable(t)) return;
    const p = pool!;
    await truncateAllV14Tables(p);
    await seedRegistries();
    const base = await seedTeamsGamePlayer();
    // A quarantined provider mapping is NOT an approved mapping.
    await quarantinePlayerMapping('pp-quar', base.player_id);
    // Event still approved so we isolate the player-side signal.
    await approveGameMapping('evt-x', base.game_id);
    const r = await readMappingResolutionForGrain(p, base.player_id, base.game_id);
    assert.equal(r.player_resolved, false);
    assert.equal(r.event_resolved, true);
    // No queue row → falls back to the vocabulary's 'unmatched' shape.
    assert.equal(r.queue_reason, 'unmatched');
  });

  it("LOAD-BEARING (CORRECTION): QUARANTINED player mapping WITH a non-open queue row → queue_reason reflects the queue's recorded reason", async (t) => {
    if (skipIfUnavailable(t)) return;
    const p = pool!;
    await truncateAllV14Tables(p);
    await seedRegistries();
    const base = await seedTeamsGamePlayer();
    await quarantinePlayerMapping('pp-quar', base.player_id);
    await approveGameMapping('evt-x', base.game_id);
    // A quarantined queue row recording the operator's reason.
    await p.query(
      `INSERT INTO player_reconciliation_queue
         (provider, provider_player_id, raw_full_name, normalized_name,
          candidate_internal_player_ids, reason, resolution)
       VALUES ('balldontlie', 'pp-quar', 'X Y', 'x y',
               ARRAY[$1::uuid], 'ambiguous_alias_conflict', 'quarantined')`,
      [base.player_id]
    );
    const r = await readMappingResolutionForGrain(p, base.player_id, base.game_id);
    assert.equal(r.player_resolved, false);
    // The queue row is not open, but its recorded reason is truthful and
    // preferred over the 'unmatched' generic fallback.
    assert.equal(r.queue_reason, 'ambiguous_alias_conflict');
  });

  it('LOAD-BEARING (CORRECTION): approved mapping + open queue row that still lists this internal id as a candidate → RESOLVED wins (positive predicate authoritative; queue noise does not un-resolve)', async (t) => {
    if (skipIfUnavailable(t)) return;
    const p = pool!;
    await truncateAllV14Tables(p);
    await seedRegistries();
    const base = await seedTeamsGamePlayer();
    // Positive: internal_player_id has an approved provider mapping.
    await approvePlayerMapping('pp-approved', base.player_id);
    await approveGameMapping('evt-approved', base.game_id);
    // Also: an open queue row for a DIFFERENT provider_player_id that
    // ambiguously lists this same internal id as one of its candidates.
    // Per the corrected contract this MUST NOT un-resolve the player.
    await p.query(
      `INSERT INTO player_reconciliation_queue
         (provider, provider_player_id, raw_full_name, normalized_name,
          candidate_internal_player_ids, reason, resolution)
       VALUES ('balldontlie', 'pp-ambig', 'X Y', 'x y',
               ARRAY[$1::uuid], 'ambiguous_multiple_candidates', 'open')`,
      [base.player_id]
    );
    const r = await readMappingResolutionForGrain(p, base.player_id, base.game_id);
    assert.equal(r.player_resolved, true);
    assert.equal(r.event_resolved, true);
    // Because resolved, the reader MUST NOT emit a queue reason — the
    // approved mapping is authoritative and the assembler asserts this.
    assert.equal(r.queue_reason, null);
  });

  it("LOAD-BEARING: player unresolved with open queue row → queue_reason = raw V1-1 enum value from the queue", async (t) => {
    if (skipIfUnavailable(t)) return;
    const p = pool!;
    await truncateAllV14Tables(p);
    await seedRegistries();
    const base = await seedTeamsGamePlayer();
    await approveGameMapping('evt-x', base.game_id); // isolate the player-side signal
    // No approved player mapping; an open queue row records the identity issue.
    await p.query(
      `INSERT INTO player_reconciliation_queue
         (provider, provider_player_id, raw_full_name, normalized_name,
          candidate_internal_player_ids, reason, resolution)
       VALUES ('balldontlie', 'pp-x', 'X Y', 'x y',
               ARRAY[$1::uuid], 'missing_team_context', 'open')`,
      [base.player_id]
    );
    const r = await readMappingResolutionForGrain(p, base.player_id, base.game_id);
    assert.equal(r.player_resolved, false);
    assert.equal(r.event_resolved, true);
    assert.equal(r.queue_reason, 'missing_team_context');
  });

  it("LOAD-BEARING: event unresolved with open queue row → queue_reason = event_queue_reason", async (t) => {
    if (skipIfUnavailable(t)) return;
    const p = pool!;
    await truncateAllV14Tables(p);
    await seedRegistries();
    const base = await seedTeamsGamePlayer();
    await approvePlayerMapping('pp-x', base.player_id); // isolate the event-side signal
    await p.query(
      `INSERT INTO event_reconciliation_queue
         (provider, provider_game_id, raw_home_team, raw_away_team,
          candidate_internal_game_ids, reason, resolution)
       VALUES ('odds_api', 'evt-x', 'H', 'A',
               ARRAY[$1::uuid], 'time_window_exceeded', 'open')`,
      [base.game_id]
    );
    const r = await readMappingResolutionForGrain(p, base.player_id, base.game_id);
    assert.equal(r.player_resolved, true);
    assert.equal(r.event_resolved, false);
    assert.equal(r.queue_reason, 'time_window_exceeded');
  });

  it('LOAD-BEARING (§C.9 order): BOTH unresolved with open queue rows → player queue reason wins', async (t) => {
    if (skipIfUnavailable(t)) return;
    const p = pool!;
    await truncateAllV14Tables(p);
    await seedRegistries();
    const base = await seedTeamsGamePlayer();
    await p.query(
      `INSERT INTO player_reconciliation_queue
         (provider, provider_player_id, raw_full_name, normalized_name,
          candidate_internal_player_ids, reason, resolution)
       VALUES ('balldontlie', 'pp-x', 'X Y', 'x y',
               ARRAY[$1::uuid], 'missing_team_context', 'open')`,
      [base.player_id]
    );
    await p.query(
      `INSERT INTO event_reconciliation_queue
         (provider, provider_game_id, raw_home_team, raw_away_team,
          candidate_internal_game_ids, reason, resolution)
       VALUES ('odds_api', 'evt-x', 'H', 'A',
               ARRAY[$1::uuid], 'unmatched', 'open')`,
      [base.game_id]
    );
    const r = await readMappingResolutionForGrain(p, base.player_id, base.game_id);
    assert.equal(r.player_resolved, false);
    assert.equal(r.event_resolved, false);
    assert.equal(r.queue_reason, 'missing_team_context');
  });

  it('read-only: repeated calls make no writes to identity tables', async (t) => {
    if (skipIfUnavailable(t)) return;
    const p = pool!;
    await truncateAllV14Tables(p);
    await seedRegistries();
    const base = await seedTeamsGamePlayer();
    async function counts(): Promise<[number, number, number, number, number]> {
      const [q1, q2, mh, pp, pg] = await Promise.all([
        p.query(`SELECT count(*)::int AS n FROM player_reconciliation_queue`),
        p.query(`SELECT count(*)::int AS n FROM event_reconciliation_queue`),
        p.query(`SELECT count(*)::int AS n FROM mapping_history`),
        p.query(`SELECT count(*)::int AS n FROM provider_players`),
        p.query(`SELECT count(*)::int AS n FROM provider_games`),
      ]);
      return [
        (q1.rows[0] as { n: number }).n,
        (q2.rows[0] as { n: number }).n,
        (mh.rows[0] as { n: number }).n,
        (pp.rows[0] as { n: number }).n,
        (pg.rows[0] as { n: number }).n,
      ];
    }
    const before = await counts();
    await readMappingResolutionForGrain(p, base.player_id, base.game_id);
    await readMappingResolutionForGrain(p, base.player_id, base.game_id);
    await readMappingResolutionForGrain(p, base.player_id, base.game_id);
    const after = await counts();
    assert.deepEqual(before, after);
  });
});

// ---------------------------------------------------------------------------
// RME-3 — CurrentMarketRow.book_detail.one_sided
// ---------------------------------------------------------------------------
describe('V1-5x RME-3 — CurrentMarketRow.book_detail.one_sided (composer wiring)', () => {
  function makeOff(bm: string, point: number, over: number | null, under: number | null): CurrentOffering {
    return Object.freeze({
      bookmaker_key: bm, display_title: bm, point,
      over_price: over, under_price: under,
      provider_last_update: null, observed_at: '2026-07-14T20:00:00Z',
      source_snapshot_id: 'snap-x', market_offering_id: `off-${bm}-${point}`,
    });
  }

  it('LOAD-BEARING: composed row carries book_detail.one_sided derived from CurrentOffering[]', async (t) => {
    if (skipIfUnavailable(t)) return;
    // Two-sided grain.
    const twoSided = composeCurrentMarketRow({
      internal_game_id: randomUUID(),
      internal_player_id: randomUUID(),
      market_key: 'player_points',
      current_offerings: [
        makeOff('draftkings', 12.5, -110, -110),
        makeOff('fanduel',    12.5, -108, -112),
      ],
      earliest_observations: [],
      movement_events: [],
      freshness: {
        last_observed_at: '2026-07-14T20:00:00Z',
        now: '2026-07-14T20:00:15Z',
        last_poll_succeeded: true,
        source_unavailable: false,
      },
      availability: null,
    });
    assert.equal(twoSided.book_detail.one_sided, 'neither');

    // Over-only grain.
    const overOnly = composeCurrentMarketRow({
      internal_game_id: randomUUID(),
      internal_player_id: randomUUID(),
      market_key: 'player_points',
      current_offerings: [
        makeOff('draftkings', 22.5, -110, null),
        makeOff('fanduel',    22.5, -108, null),
      ],
      earliest_observations: [],
      movement_events: [],
      freshness: {
        last_observed_at: '2026-07-14T20:00:00Z',
        now: '2026-07-14T20:00:15Z',
        last_poll_succeeded: true,
        source_unavailable: false,
      },
      availability: null,
    });
    // DR-18 branch is now satisfiable directly from this field.
    assert.equal(overOnly.book_detail.one_sided, 'over_only');

    // No offerings → one_sided null.
    const noOfferings = composeCurrentMarketRow({
      internal_game_id: randomUUID(),
      internal_player_id: randomUUID(),
      market_key: 'player_points',
      current_offerings: [],
      earliest_observations: [],
      movement_events: [],
      freshness: {
        last_observed_at: null,
        now: '2026-07-14T20:00:15Z',
        last_poll_succeeded: false,
        source_unavailable: true,
      },
      availability: null,
    });
    assert.equal(noOfferings.book_detail.one_sided, null);
  });
});

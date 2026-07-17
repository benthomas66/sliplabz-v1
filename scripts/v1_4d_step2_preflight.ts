// V1-4d STEP 2 preflight — hosted DB survey (READ-ONLY).
//
// Checks: which of the 5 upcoming provider_event_ids have a resolvable
// internal_game_id, what player identity coverage we have, and whether the
// aggregator's isolation invariant + baseline counts match ticket expectations.

import { Client } from 'pg';

const HOSTED_URL = process.env['SLIPLABZ_HOSTED_DATABASE_URL'];
if (HOSTED_URL === undefined || HOSTED_URL === '') {
  console.error('# ERROR: SLIPLABZ_HOSTED_DATABASE_URL not set.');
  process.exit(2);
}

// Provider event IDs discovered in STEP 1.
const UPCOMING = [
  { pid: '00a997433337939ebda3beb882a1e2db', commence: '2026-07-16T23:10:00Z', home: 'Washington Mystics', away: 'Portland Fire' },
  { pid: '571b28ddb7c28b45b2925d493d2085c8', commence: '2026-07-17T23:30:00Z', home: 'Toronto Tempo', away: 'Atlanta Dream' },
  { pid: '4a1af047b50cc335d69665ae9b499206', commence: '2026-07-17T23:30:00Z', home: 'Chicago Sky', away: 'Los Angeles Sparks' },
  { pid: '034012f210532a879b3d1ab5de8306e6', commence: '2026-07-17T23:40:00Z', home: 'Indiana Fever', away: 'Seattle Storm' },
  { pid: '02c8aae5b168305c60aa6f9c66f443d1', commence: '2026-07-18T02:00:00Z', home: 'Phoenix Mercury', away: 'Connecticut Sun' },
] as const;

async function main(): Promise<void> {
  const c = new Client({ connectionString: HOSTED_URL });
  await c.connect();
  try {
    // Baseline counts the ticket expects to remain unchanged.
    const hist = await c.query(`SELECT count(*)::int AS n FROM historical_line_results`);
    const pgs = await c.query(`SELECT count(*)::int AS n FROM player_game_stats`);
    console.log(JSON.stringify({
      kind: 'baseline_counts',
      historical_line_results: (hist.rows[0] as { n: number }).n,
      player_game_stats: (pgs.rows[0] as { n: number }).n,
    }, null, 2));

    // provider_games mappings for upcoming events (already resolved?).
    const pids = UPCOMING.map((e) => e.pid);
    const pg = await c.query(
      `SELECT provider_game_id, internal_game_id, mapping_state, time_delta_seconds
         FROM provider_games
        WHERE provider = 'odds_api' AND provider_game_id = ANY($1::text[])`,
      [pids]
    );
    console.log(JSON.stringify({
      kind: 'provider_games_existing',
      count: pg.rowCount,
      rows: pg.rows,
    }, null, 2));

    // Candidate internal games in the commence-time window (±60 minutes).
    for (const ev of UPCOMING) {
      const wm = 60 * 60 * 1000;
      const cms = Date.parse(ev.commence);
      const s = new Date(cms - wm).toISOString();
      const e_ = new Date(cms + wm).toISOString();
      const g = await c.query(
        `SELECT internal_game_id, scheduled_start_utc, home_team_id, away_team_id, status
           FROM games
          WHERE scheduled_start_utc >= $1 AND scheduled_start_utc <= $2`,
        [s, e_]
      );
      console.log(JSON.stringify({
        kind: 'candidate_games',
        provider_event_id: ev.pid,
        home_v_away: `${ev.home} vs ${ev.away}`,
        commence: ev.commence,
        candidate_count: g.rowCount,
        rows: g.rows,
      }, null, 2));
    }

    // Approved provider_teams for odds_api (should be all 12 WNBA teams).
    const pt = await c.query(
      `SELECT count(*)::int AS n FROM provider_teams WHERE provider = 'odds_api' AND mapping_state = 'approved'`
    );
    console.log(JSON.stringify({
      kind: 'provider_teams_approved',
      n: (pt.rows[0] as { n: number }).n,
    }, null, 2));

    // Approved provider_players for odds_api (may be sparse).
    const pp = await c.query(
      `SELECT count(*)::int AS n FROM provider_players WHERE provider = 'odds_api' AND mapping_state = 'approved'`
    );
    console.log(JSON.stringify({
      kind: 'provider_players_approved_odds_api',
      n: (pp.rows[0] as { n: number }).n,
    }, null, 2));

    // Total players table.
    const p = await c.query(`SELECT count(*)::int AS n FROM players`);
    console.log(JSON.stringify({
      kind: 'players_total',
      n: (p.rows[0] as { n: number }).n,
    }, null, 2));

    // current_market_rows count (must be 0 before poll).
    const cmr = await c.query(`SELECT count(*)::int AS n FROM current_market_rows`);
    console.log(JSON.stringify({
      kind: 'current_market_rows_before',
      n: (cmr.rows[0] as { n: number }).n,
    }, null, 2));

    // market_snapshots count (should be 0 for current_poll before this ticket).
    const ms = await c.query(
      `SELECT request_kind, count(*)::int AS n FROM market_snapshots GROUP BY request_kind ORDER BY request_kind`
    );
    console.log(JSON.stringify({
      kind: 'market_snapshots_by_kind_before',
      rows: ms.rows,
    }, null, 2));

    // evidence_profiles count (must be 0 before engine runs).
    const ep = await c.query(`SELECT count(*)::int AS n FROM evidence_profiles`);
    console.log(JSON.stringify({
      kind: 'evidence_profiles_before',
      n: (ep.rows[0] as { n: number }).n,
    }, null, 2));
  } finally {
    await c.end();
  }
}

main().catch((err: unknown) => {
  console.error('# ERROR:', err instanceof Error ? err.stack ?? err.message : String(err));
  process.exit(1);
});

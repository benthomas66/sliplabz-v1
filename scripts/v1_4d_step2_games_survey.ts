// Diagnostic: games date-range coverage.
import { Client } from 'pg';
const c = new Client({ connectionString: process.env['SLIPLABZ_HOSTED_DATABASE_URL']! });
await c.connect();
try {
  const q1 = await c.query(
    `SELECT min(scheduled_start_utc) AS min_start,
            max(scheduled_start_utc) AS max_start,
            count(*)::int AS n_total,
            count(*) FILTER (WHERE scheduled_start_utc >= '2026-07-16T00:00:00Z') AS n_from_jul16,
            count(*) FILTER (WHERE scheduled_start_utc >= '2026-07-16T00:00:00Z' AND scheduled_start_utc <= '2026-07-19T00:00:00Z') AS n_jul16_to_19,
            count(DISTINCT season) AS n_seasons,
            min(season) AS min_season,
            max(season) AS max_season
       FROM games`
  );
  console.log(JSON.stringify(q1.rows[0], null, 2));

  const q2 = await c.query(
    `SELECT internal_game_id, scheduled_start_utc, status, home_team_id, away_team_id
       FROM games WHERE scheduled_start_utc >= '2026-07-16T00:00:00Z'
        ORDER BY scheduled_start_utc LIMIT 10`
  );
  console.log('Games on/after Jul 16:');
  console.log(JSON.stringify(q2.rows, null, 2));

  // Provider_teams for context.
  const q3 = await c.query(
    `SELECT provider_team_id, raw_full_name, internal_team_id
       FROM provider_teams WHERE provider = 'odds_api' AND mapping_state = 'approved'
        ORDER BY raw_full_name`
  );
  console.log(`Approved odds_api provider_teams (n=${q3.rowCount}):`);
  for (const r of q3.rows) console.log(`  ${r.raw_full_name}`);
} finally { await c.end(); }

// V1-4e STEP 1 survey — hosted DB read-only.
// Answers the back-link questions and checks watermark state.
import { Client } from 'pg';
const c = new Client({ connectionString: process.env['SLIPLABZ_HOSTED_DATABASE_URL']! });
await c.connect();
try {
  // Games watermark(s).
  const wm = await c.query(`SELECT endpoint, query_scope_key, completed_at, completed_row_count, completed_page_count
                              FROM bdl_import_watermarks WHERE endpoint = 'games' ORDER BY query_scope_key`);
  console.log('games watermarks:', wm.rows);

  // Games date range.
  const g = await c.query(`SELECT min(scheduled_start_utc) AS min_start, max(scheduled_start_utc) AS max_start,
                                  count(*)::int AS n, count(*) FILTER (WHERE status='scheduled') AS n_scheduled,
                                  count(*) FILTER (WHERE status='final') AS n_final,
                                  count(*) FILTER (WHERE status='live') AS n_live,
                                  count(*) FILTER (WHERE status='unresolved') AS n_unresolved
                             FROM games`);
  console.log('games summary:', g.rows[0]);

  // Provider_games count for odds_api (should include the 5 queued from V1-4d).
  const pg1 = await c.query(`SELECT count(*)::int AS n FROM provider_games WHERE provider='odds_api'`);
  console.log('provider_games (odds_api):', pg1.rows[0]);
  const pg2 = await c.query(`SELECT count(*)::int AS n FROM provider_games WHERE provider='balldontlie'`);
  console.log('provider_games (balldontlie):', pg2.rows[0]);

  // Open odds_api reconciliation queue rows.
  const rq = await c.query(`SELECT queue_row_id, provider_game_id, raw_home_team, raw_away_team, raw_commence_time, reason, resolution
                              FROM event_reconciliation_queue
                             WHERE provider='odds_api' AND resolution='open'
                             ORDER BY raw_commence_time`);
  console.log(`open odds_api queue rows: ${rq.rowCount}`);
  for (const r of rq.rows) console.log('  ', r);

  // Snapshots for those queued events currently NULL-linked.
  const sn = await c.query(`SELECT provider_event_id, count(*)::int AS n
                              FROM market_snapshots
                             WHERE request_kind='current_poll' AND linked_internal_game_id IS NULL
                             GROUP BY provider_event_id ORDER BY provider_event_id`);
  console.log('NULL-linked current_poll snapshots by provider_event:', sn.rows);
} finally { await c.end(); }

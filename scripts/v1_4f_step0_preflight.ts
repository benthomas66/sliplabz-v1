// V1-4f STEP 0 — preflight: env, DB state, upcoming games, credit balance.
// Zero cost (DB reads only, Odds discovery endpoint is free).

import { openPool } from '../src/db/connection.js';
import { buildLiveOddsapiConfig } from '../src/lines/liveInvokeGate.js';
import { oddsapiRequest } from '../src/odds/httpClient.js';

const SPORT_KEY = 'basketball_wnba';

async function main(): Promise<void> {
  const api_key = process.env['ODDS_API_KEY'];
  const hosted_url = process.env['SLIPLABZ_HOSTED_DATABASE_URL'];
  if (!api_key || !hosted_url) { console.error('# ERROR: env missing'); process.exit(2); }

  const pool = openPool({
    connectionString: hosted_url, max: 1, statement_timeout_ms: 30_000,
    ssl: hosted_url.includes('supabase.') ? 'require' : 'disable',
  });
  try {
    const now = await pool.query(`SELECT (now() AT TIME ZONE 'UTC')::text AS now_utc`);
    console.log('DB now_utc:', now.rows[0]!.now_utc);

    const g48 = await pool.query(`
      SELECT internal_game_id::text AS gid, scheduled_start_utc::text AS start, status,
             home_team_id::text AS ht, away_team_id::text AS at
        FROM games
       WHERE scheduled_start_utc >= now()
         AND scheduled_start_utc < now() + interval '48 hours'
       ORDER BY scheduled_start_utc ASC LIMIT 25`);
    console.log('upcoming games (next 48h):', g48.rowCount);
    for (const r of g48.rows) console.log('  ', (r as any).gid.slice(0,8) + '…', (r as any).start, (r as any).status);

    const cmr = await pool.query(`SELECT count(*)::int AS n FROM current_market_rows`);
    const cmr_fresh = await pool.query(`SELECT freshness_state, count(*)::int AS n FROM current_market_rows GROUP BY freshness_state ORDER BY freshness_state`);
    const ep_cls = await pool.query(`SELECT classification, count(*)::int AS n FROM evidence_profiles GROUP BY classification ORDER BY classification`);
    const ms_ct = await pool.query(`SELECT count(*)::int AS n FROM market_snapshots WHERE request_kind='current_poll' AND provenance='self_observed'`);
    console.log('current_market_rows total:', (cmr.rows[0] as any).n);
    console.log('cmr freshness:', cmr_fresh.rows);
    console.log('evidence_profiles:', ep_cls.rows);
    console.log('current-poll snapshots total:', (ms_ct.rows[0] as any).n);
  } finally { await pool.end(); }

  const http_cfg = buildLiveOddsapiConfig({ allow_live_invoke: true });
  const disc = await oddsapiRequest(http_cfg, {
    path: `/v4/sports/${SPORT_KEY}/events`, query: {}, api_key,
  });
  const x_used = disc.headers['x-requests-used'];
  const x_rem  = disc.headers['x-requests-remaining'];
  const x_last = disc.headers['x-requests-last'];
  console.log('discovery: HTTP', disc.status, 'x-used=', x_used, 'x-rem=', x_rem, 'x-last=', x_last);
  const now_ms = Date.now();
  if (Array.isArray(disc.body_json)) {
    const upcoming = (disc.body_json as any[])
      .filter((e) => Date.parse(String(e.commence_time)) >= now_ms)
      .sort((a, b) => Date.parse(String(a.commence_time)) - Date.parse(String(b.commence_time)));
    console.log('upcoming odds-api events:', upcoming.length);
    for (const e of upcoming.slice(0, 10)) {
      console.log('  ', String((e as any).id).slice(0,8) + '…', (e as any).commence_time, '|', (e as any).away_team, '@', (e as any).home_team);
    }
  }
}

main().catch((err) => { console.error('# ERROR:', err instanceof Error ? err.stack ?? err.message : String(err)); process.exit(1); });

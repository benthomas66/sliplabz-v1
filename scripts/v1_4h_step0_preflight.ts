// V1-4h STEP 0 — preflight: verify env, DB state, upcoming events, credit balance.
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
    const g = await pool.query(`
      SELECT internal_game_id::text AS gid, scheduled_start_utc::text AS start_utc, status
        FROM games
       WHERE scheduled_start_utc > now()
         AND scheduled_start_utc < now() + interval '5 hours'
       ORDER BY scheduled_start_utc LIMIT 15`);
    console.log('Games in next 5h:', g.rowCount);
    for (const r of g.rows) console.log('  ', (r as any).gid.slice(0,8), (r as any).start_utc, (r as any).status);
    const cmr = await pool.query('SELECT count(*)::int AS n FROM current_market_rows');
    console.log('current_market_rows:', (cmr.rows[0] as any).n);
    const ep_ct = await pool.query('SELECT count(*)::int AS n FROM evidence_profiles');
    console.log('evidence_profiles (immutable during ticket):', (ep_ct.rows[0] as any).n);
    const ms_ct = await pool.query(`SELECT count(*)::int AS n FROM market_snapshots WHERE request_kind='current_poll' AND provenance='self_observed'`);
    console.log('existing current-poll snapshots:', (ms_ct.rows[0] as any).n);
  } finally { await pool.end(); }

  const http_cfg = buildLiveOddsapiConfig({ allow_live_invoke: true });
  const disc = await oddsapiRequest(http_cfg, {
    path: `/v4/sports/${SPORT_KEY}/events`, query: {}, api_key,
  });
  const x_used = disc.headers['x-requests-used'];
  const x_rem = disc.headers['x-requests-remaining'];
  const x_last = disc.headers['x-requests-last'];
  console.log('discovery HTTP', disc.status, 'x-used=', x_used, 'x-rem=', x_rem, 'x-last=', x_last);
  const now_ms = Date.now();
  if (Array.isArray(disc.body_json)) {
    const upcoming = (disc.body_json as any[])
      .filter((e) => Date.parse(String(e.commence_time)) >= now_ms)
      .sort((a, b) => Date.parse(String(a.commence_time)) - Date.parse(String(b.commence_time)));
    console.log('upcoming odds-api events:', upcoming.length);
    for (const e of upcoming) {
      const commence = Date.parse(String((e as any).commence_time));
      const min_to_tipoff = Math.round((commence - now_ms) / 60000);
      console.log('  ', String((e as any).id).slice(0,8), (e as any).commence_time, `[${min_to_tipoff} min to tipoff]`, '|', (e as any).away_team, '@', (e as any).home_team);
    }
  }
}
main().catch((err) => { console.error('# ERROR:', err instanceof Error ? err.stack ?? err.message : String(err)); process.exit(1); });

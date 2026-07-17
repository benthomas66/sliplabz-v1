// V1-4f cadence arithmetic input — survey the actual game slate.
import { openPool } from '../src/db/connection.js';

async function main(): Promise<void> {
  const url = process.env['SLIPLABZ_HOSTED_DATABASE_URL']!;
  const pool = openPool({
    connectionString: url, max: 1, statement_timeout_ms: 30_000,
    ssl: url.includes('supabase.') ? 'require' : 'disable',
  });
  try {
    const total = await pool.query(`SELECT count(*)::int AS n FROM games`);
    console.log('games_total:', (total.rows[0] as any).n);
    const upcoming = await pool.query(`SELECT count(*)::int AS n FROM games WHERE scheduled_start_utc >= now()`);
    console.log('games_upcoming:', (upcoming.rows[0] as any).n);
    const rng = await pool.query(`SELECT min(scheduled_start_utc)::text AS lo, max(scheduled_start_utc)::text AS hi FROM games`);
    console.log('games_range:', rng.rows[0]);
    // Per-day slate for the next 60 days
    const by_day = await pool.query(`
      SELECT (scheduled_start_utc AT TIME ZONE 'UTC')::date AS day, count(*)::int AS n
        FROM games
       WHERE scheduled_start_utc >= now()
         AND scheduled_start_utc < now() + interval '60 days'
       GROUP BY 1 ORDER BY 1`);
    console.log('by_day:', by_day.rows);
    // Compute avg / p50 / p95 / max for days with at least one game
    const arr = (by_day.rows as Array<{ day: string; n: number }>).map((r) => r.n).sort((a,b) => a - b);
    if (arr.length > 0) {
      const avg = arr.reduce((a,b) => a+b, 0) / arr.length;
      const p50 = arr[Math.floor(arr.length * 0.5)];
      const p95 = arr[Math.min(arr.length - 1, Math.floor(arr.length * 0.95))];
      const mx = arr[arr.length - 1];
      console.log('per_game_day_stats:', { games_day_count: arr.length, avg, p50, p95, max: mx });
    }
    // Slate window: typical WNBA game duration for polling window is ~2.5-3 hours (pregame + game).
    // A game commences and the last betting-line change is typically ~5-10 min before tipoff.
    // Report: window_estimate — from earliest tipoff-day-start to latest tipoff-day-end.
    const window_est = await pool.query(`
      SELECT (scheduled_start_utc AT TIME ZONE 'UTC')::date AS day,
             extract(epoch from (max(scheduled_start_utc) - min(scheduled_start_utc)))::int AS spread_sec
        FROM games
       WHERE scheduled_start_utc >= now()
         AND scheduled_start_utc < now() + interval '60 days'
       GROUP BY 1
       ORDER BY 1`);
    console.log('spread_seconds_per_day:', window_est.rows);
  } finally { await pool.end(); }
}
main().catch((err) => { console.error(err); process.exit(1); });

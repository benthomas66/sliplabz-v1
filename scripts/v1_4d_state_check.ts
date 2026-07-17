import { Client } from 'pg';
const c = new Client({ connectionString: process.env['SLIPLABZ_HOSTED_DATABASE_URL']! });
await c.connect();
try {
  const r1 = await c.query(`SELECT provider, provider_game_id, resolution, reason, created_at FROM event_reconciliation_queue ORDER BY created_at DESC LIMIT 20`);
  console.log('event_reconciliation_queue (recent):'); console.log(r1.rows);
  const r2 = await c.query(`SELECT count(*)::int AS n FROM event_reconciliation_queue WHERE provider='odds_api' AND resolution='open'`);
  console.log('open odds_api queue count:', r2.rows[0]);
} finally { await c.end(); }

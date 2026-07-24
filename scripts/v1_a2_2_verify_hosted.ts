// V1-A2-2 hosted verification — after `npx supabase db push` completes.
// Confirms the two v2 timing columns + CHECK constraint exist on hosted.
// READ-ONLY. Does NOT persist any v2 profile.

import { openPool } from '../src/db/index.js';

async function main(): Promise<void> {
  const url = process.env['SLIPLABZ_HOSTED_DATABASE_URL'];
  if (!url) { console.error('# ERROR: SLIPLABZ_HOSTED_DATABASE_URL missing'); process.exit(2); }
  const pool = openPool({
    connectionString: url, max: 1, statement_timeout_ms: 30_000,
    ssl: url.includes('supabase.') ? 'require' : 'disable',
  });
  try {
    const cols = await pool.query(`
      SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
       WHERE table_name = 'evidence_profiles'
         AND column_name IN ('evaluation_reference_time', 'profile_generated_at')
       ORDER BY column_name`);
    console.log('# hosted evidence_profiles v2 timing columns:', JSON.stringify(cols.rows, null, 2));
    const cc = await pool.query(`
      SELECT conname, pg_get_constraintdef(oid) AS def
        FROM pg_constraint
       WHERE conname = 'evidence_profiles_v2_timing_check'`);
    console.log('# hosted CHECK:', JSON.stringify(cc.rows, null, 2));

    // Also confirm no v2 profile rows have been persisted (this ticket is
    // schema-only for hosted).
    const v2_count = await pool.query(
      `SELECT count(*)::int AS n FROM evidence_profiles WHERE method_version = 'evidence_method_v2'`
    );
    const v1_count = await pool.query(
      `SELECT count(*)::int AS n FROM evidence_profiles WHERE method_version = 'evidence_method_v1'`
    );
    console.log('# hosted v1 evidence_profile rows:', (v1_count.rows[0] as any).n);
    console.log('# hosted v2 evidence_profile rows:', (v2_count.rows[0] as any).n,
      '(MUST be 0 — this ticket does not persist v2 to hosted)');

    const ok = cols.rowCount === 2 && cc.rowCount === 1 && (v2_count.rows[0] as any).n === 0;
    console.log(`# verification: ${ok ? 'PASS' : 'FAIL'}`);
    if (!ok) process.exit(1);
  } finally { await pool.end(); }
}
main().catch((err) => { console.error('# ERROR:', err instanceof Error ? err.stack ?? err.message : String(err)); process.exit(1); });

// V1-A1-3 Phase B — thin operator script.
//
// Every load-bearing decision lives in src/evidence/driver/populate.ts.
// This script:
//   * Loads SLIPLABZ_HOSTED_DATABASE_URL from the environment (never
//     printed).
//   * Prints a preflight showing the current_market_rows grain count
//     (expected: 0 — hosted has never polled live markets and seeded
//     games are all final/past).
//   * Reports counters as JSON at the end.
//
// Governor gates:
//   * ZERO provider calls (no src/odds/*, no src/bdl/httpClient imported).
//   * Writes go to the HOSTED database only via SLIPLABZ_HOSTED_DATABASE_URL.
//   * Scheduling is NOT this ticket's concern; this script runs once
//     when invoked and exits.

import { countGrains, runEvidencePopulator } from '../src/evidence/driver/populate.js';

function redactUrl(u: string): string {
  return u.replace(/:[^:@]+@/, ':REDACTED@');
}

async function main(): Promise<void> {
  const url = process.env['SLIPLABZ_HOSTED_DATABASE_URL'];
  if (url === undefined || url === '') {
    console.error(
      'ERROR: SLIPLABZ_HOSTED_DATABASE_URL is required. `set -a && source .env && set +a` first.'
    );
    process.exit(2);
  }
  console.log(JSON.stringify({
    kind: 'preflight',
    hosted_db_host_redacted: redactUrl(url),
    governor_notes:
      'Zero provider calls. Reads/writes are hosted-Supabase-only. Grain source: current_market_rows (V1-5 read-model summary).',
  }, null, 2));

  const grains = await countGrains(url);
  console.log(JSON.stringify({
    kind: 'preflight_grains',
    current_market_rows_distinct_grains: grains,
    expected_hosted_result:
      'zero grains → zero profiles. current_market_rows is empty (no live polling has ever run; seeded games are all final/past).',
  }, null, 2));

  if (grains === 0) {
    console.log(JSON.stringify({
      kind: 'complete',
      counters: {
        grains_observed: 0,
        grains_skipped_no_input: 0,
        profiles_inserted: 0,
        profiles_updated: 0,
        batches_ok: 0,
        batches_retried: 0,
      },
      dr29_note:
        'Zero profiles persisted. The DR-29 pre-first-profile exception REMAINS ACTIVE. No operative first-profile event occurred; the record obligation carries forward to the first ticket that persists an operative profile against live current-market data.',
    }, null, 2));
    return;
  }

  // Hosted has grains: run the populator with V1-A1-3 Phase C's default
  // read-model input builder. `today_utc_date` + `reference_date` are
  // required by the default builder (DR-25 predicate + §H reproducibility);
  // both are computed from the current UTC calendar day at invocation.
  const today = new Date().toISOString().slice(0, 10);
  const counters = await runEvidencePopulator({
    connection_string: url,
    today_utc_date: today,
    reference_date: today,
  });
  console.log(JSON.stringify({
    kind: 'complete',
    counters,
    dr29_note:
      counters.profiles_inserted === 0 && counters.profiles_updated === 0
        ? 'Zero profiles persisted. The DR-29 pre-first-profile exception REMAINS ACTIVE.'
        : 'Profiles persisted. The DR-29 event obligation applies — see docs/product/EVIDENCE_PROFILE_METHOD_V1.md §I.3 for the required first-profile record.',
  }, null, 2));
}

main().catch((err: unknown) => {
  console.error('# ERROR:', err instanceof Error ? err.stack ?? err.message : String(err));
  process.exit(1);
});

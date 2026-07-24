// V1-A2-4 — v2 populator operator script.
//
// Thin operator, mirroring scripts/v1_a1_3_populate.ts. Every load-bearing
// decision lives in library code:
//   * grain enumeration  → src/evidence/driver/populate.ts `listAllGrains`
//   * input assembly     → src/evidence/driver/readModelInputBuilder.ts
//                          (the ONE read-model builder), adapted for v2 by
//                          src/evidence/v2/readModelInputBuilderV2.ts
//   * classify + persist → src/evidence/v2/populateV2.ts
//                          `runEvidencePopulatorV2`
//
// This script:
//   * Loads the connection URL from SLIPLABZ_HOSTED_DATABASE_URL (never
//     printed; host is redacted in the preflight line).
//   * Accepts `--dry-run` (BEGIN/ROLLBACK per the populator; no persisted
//     effect).
//   * Captures NOTHING itself: `runEvidencePopulatorV2` captures ONE
//     `evaluation_reference_time` at batch start and shares it across the
//     batch (owner R4). There are NO hardcoded literals in the input path.
//   * Reports counters as JSON at the end.
//
// Governor gates:
//   * ZERO provider calls (no src/odds/*, no src/bdl/httpClient imported).
//   * Scheduling is NOT this script's concern; it runs once and exits.
//   * V1-A2-4 does NOT run this against hosted — the hosted credential and
//     GAP-3 are separate blockers. Point the env at local Docker to run.

import { listAllGrains } from '../src/evidence/driver/populate.js';
import { runEvidencePopulatorV2 } from '../src/evidence/v2/populateV2.js';
import { makeV2ReadModelInputBuilder } from '../src/evidence/v2/readModelInputBuilderV2.js';

function redactUrl(u: string): string {
  return u.replace(/:[^:@]+@/, ':REDACTED@');
}

async function main(): Promise<void> {
  const url = process.env['SLIPLABZ_HOSTED_DATABASE_URL'];
  if (url === undefined || url === '') {
    console.error(
      'ERROR: SLIPLABZ_HOSTED_DATABASE_URL is required. `set -a && source .env && set +a` first ' +
      '(or export it to a LOCAL Docker URL — this ticket does NOT run against hosted).'
    );
    process.exit(2);
  }
  const dry_run = process.argv.includes('--dry-run');

  console.log(JSON.stringify({
    kind: 'preflight',
    db_host_redacted: redactUrl(url),
    dry_run,
    governor_notes:
      'Zero provider calls. Grain source: current_market_rows (V1-5 read-model). ' +
      'Input assembly: the single v1 read-model builder, adapted for v2. ' +
      'line_observed_at is an OBSERVATION time surfaced by the builder, never a clock read.',
  }, null, 2));

  const grains = await listAllGrains(url);
  console.log(JSON.stringify({
    kind: 'preflight_grains',
    current_market_rows_distinct_grains: grains.length,
  }, null, 2));

  if (grains.length === 0) {
    console.log(JSON.stringify({
      kind: 'complete',
      counters: {
        grains_observed: 0, grains_skipped_no_input: 0,
        grains_skipped_beyond_horizon: 0,
        profiles_inserted: 0, profiles_updated: 0,
      },
      note: 'Zero grains → zero v2 profiles. Nothing to classify.',
    }, null, 2));
    return;
  }

  // The v1 read-model builder needs today_utc_date + reference_date
  // (DR-25 coverage predicate + §H reproducibility); both from the current
  // UTC calendar day at invocation.
  const today = new Date().toISOString().slice(0, 10);
  const build_profile_input = makeV2ReadModelInputBuilder({
    today_utc_date: today,
    reference_date: today,
  });

  const counters = await runEvidencePopulatorV2({
    grains,
    build_profile_input,
    connection_string: url,
    dry_run,
  });

  console.log(JSON.stringify({ kind: 'complete', counters }, null, 2));
}

main().catch((err: unknown) => {
  console.error('# ERROR:', err instanceof Error ? err.stack ?? err.message : String(err));
  process.exit(1);
});

// V1-OP-1 — DURABLE production operator for the scheduled polling loop.
//
// This is a PRODUCTION entry point (not a throwaway): the GitHub Actions
// workflow (.github/workflows/poll-cycle.yml) invokes it every 15 minutes.
// It reads its secrets from the environment (set by the founder as GitHub
// Actions secrets), composes the real committed primitives via
// makeProductionCycleDeps, runs ONE cycle, prints the cycle summary as JSON,
// and exits nonzero ONLY on outcome 'failed'.
//
// The slate gate makes idle wakes FREE (zero API calls when no game is inside
// the 3h window), so this can fire all day and only spend during game windows.
//
// --dry-run : the populate stage runs BEGIN/ROLLBACK (persists nothing); the
//             slate gate / discovery are still real but zero-cost.
//
// NEVER prints a credential. Only the env var NAMES and cycle metrics appear
// in output.

import { runScheduledCycle } from '../src/ops/scheduledCycle.js';
import { makeProductionCycleDeps } from '../src/ops/productionCycleDeps.js';

async function main(): Promise<void> {
  const connection_string = process.env['SLIPLABZ_HOSTED_DATABASE_URL'];
  const api_key = process.env['ODDS_API_KEY'];
  const dry_run = process.argv.includes('--dry-run');

  if (connection_string === undefined || connection_string === '') {
    console.error('ERROR: SLIPLABZ_HOSTED_DATABASE_URL is required (session pooler / 5432).');
    process.exit(2);
  }
  if (api_key === undefined || api_key === '') {
    console.error('ERROR: ODDS_API_KEY is required.');
    process.exit(2);
  }

  const deps = makeProductionCycleDeps({ connection_string, api_key, dry_run });
  const result = await runScheduledCycle(deps);

  // Print the ledger row summary (no secret, no key, no URL).
  console.log(JSON.stringify({
    outcome: result.outcome,
    poll_cycle_id: result.poll_cycle_id,
    dry_run,
    events_polled: result.events_polled,
    credits_spent: result.credits_spent,
    credits_remaining_after: result.credits_remaining_after,
    grains_aggregated: result.grains_aggregated,
    profiles_persisted: result.profiles_persisted,
    profiles_updated: result.profiles_updated,
    beyond_horizon_skipped: result.beyond_horizon_skipped,
    evaluation_reference_time: result.evaluation_reference_time,
    error_summary: result.error_summary,
  }, null, 2));

  // Exit nonzero ONLY on a real failure. skipped_no_slate / skipped_budget_floor
  // / blocked are healthy operational outcomes (exit 0).
  if (result.outcome === 'failed') process.exit(1);
}

main().catch((err: unknown) => {
  console.error('# FATAL:', err instanceof Error ? (err.stack ?? err.message) : String(err));
  process.exit(1);
});

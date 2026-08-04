// V1-OP-8b Gate (c) — thin operator entry for the bounded bulk repair.
//
// Composition only. Every load-bearing decision lives in the committed
// `src/lines/bulkHistoricalRepair.ts` (`7a9371f`) and the Path C primitives it
// composes. This script wires seams and nothing else:
//
//   retrieveGame   -> the committed V1-OP-8a scoped owner (PAID; --apply only)
//   persistTripleInTx / canonicalInTx / hlrInTx
//                  -> the committed `…InTx` forms, run inside ONE game-level
//                     transaction by `persistGameAtomically`
//   alreadyRepaired-> read-only usable-hlr check (skip, no fetch, no spend)
//
// SAFETY (binding for Gate (c)):
//   * DRY-RUN IS THE DEFAULT and is structurally spend-incapable: the dry-run
//     dependency object's fetch and persist seams THROW, so no code path can
//     reach the provider or a write without --apply.
//   * DOUBLE-GATED --apply: effectful deps are constructed ONLY when --apply
//     is given AND ODDSAPI_LIVE_INVOKE=1. --apply without live-invoke refuses
//     BEFORE any provider call.
//   * The manifest is an EXPLICIT frozen literal list (id + event id pairs).
//     An empty manifest is a hard error in the committed runner — never "all".
//     This script performs NO selector query; it cannot absorb newly-tipped
//     games.
//   * Neither start-time field is ever written (this path writes no `games`
//     row); attribution is ownership-scoped by target game / provider event.
//   * Hard `--ceiling` with halt-before-ceiling; no blind retry.

import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

import {
  runBoundedBatch,
  type BatchRunnerDeps,
  type ManifestEntry,
} from '../src/lines/bulkHistoricalRepair.js';
import { buildBatchApplyDeps } from '../src/lines/bulkRepairWiring.js';
import { buildLiveOddsapiConfig } from '../src/lines/liveInvokeGate.js';
import { openPool } from '../src/db/connection.js';
import { withTransaction } from '../src/db/transaction.js';

const DB_URL = process.env['SLIPLABZ_HOSTED_DATABASE_URL'];
if (DB_URL === undefined || DB_URL === '') {
  console.error('# V1-OP-8b: SLIPLABZ_HOSTED_DATABASE_URL required (hosted DB only). Aborting.');
  process.exit(1);
}
const db_url: string = DB_URL;

const argv = process.argv.slice(2);
function flag(name: string): string | null {
  const i = argv.indexOf(name);
  if (i < 0 || i === argv.length - 1) return null;
  return argv[i + 1] ?? null;
}
const CLI = {
  manifest: flag('--manifest'),
  ceiling: Number(flag('--ceiling') ?? '440'),
  apply: argv.includes('--apply'),
};

/** Frozen manifest file: one `<internal_game_id> <provider_event_id>` per line. */
function readManifest(path: string): ManifestEntry[] {
  return readFileSync(path, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '' && !l.startsWith('#'))
    .map((l) => {
      const [internal_game_id, provider_event_id] = l.split(/\s+/);
      if (!internal_game_id || !provider_event_id) {
        throw new Error(`# V1-OP-8b: malformed manifest line: ${JSON.stringify(l)}`);
      }
      return { internal_game_id, provider_event_id };
    });
}

const pool = openPool({ connectionString: db_url, max: 2, statement_timeout_ms: 60_000, ssl: 'require' });

/** Read-only: does this game already have usable hlr? (skip → no fetch, no spend) */
async function alreadyRepaired(entry: ManifestEntry): Promise<boolean> {
  const r = await pool.query(
    `SELECT count(*)::int AS n FROM historical_line_results
      WHERE internal_game_id = $1::uuid AND coverage_state IN ('complete','single_book')`,
    [entry.internal_game_id],
  );
  return ((r.rows[0] as { n: number }).n ?? 0) > 0;
}

/**
 * DRY-RUN deps: structurally spend-incapable. Every effectful seam throws, so
 * no path can reach the provider or a write. Used unless --apply is given.
 */
const dryRunDeps: BatchRunnerDeps = {
  alreadyRepaired,
  retrieveGame: async () => { throw new Error('# V1-OP-8b: the paid fetch is not reachable on a dry-run.'); },
  runInGameTransaction: async () => { throw new Error('# V1-OP-8b: persistence is not reachable on a dry-run.'); },
  persistTripleInTx: async () => { throw new Error('# V1-OP-8b: persistence is not reachable on a dry-run.'); },
  canonicalInTx: async () => { throw new Error('# V1-OP-8b: persistence is not reachable on a dry-run.'); },
  hlrInTx: async () => { throw new Error('# V1-OP-8b: persistence is not reachable on a dry-run.'); },
};

/**
 * Gate (c) APPLY deps — V1-OP-8c: delegates to the COMMITTED assembly in
 * `src/lines/bulkRepairWiring.ts`, which is the exact function the
 * positive-persistence test exercises (standing rule 5b). The script no longer
 * owns any effectful wiring of its own.
 */
async function buildApplyDeps(): Promise<BatchRunnerDeps> {
  const api_key = process.env['ODDS_API_KEY'];
  if (api_key === undefined || api_key === '') throw new Error('# V1-OP-8b: ODDS_API_KEY required for --apply.');
  return buildBatchApplyDeps({
    pool,
    connection_string: db_url,
    oddsapi_config: buildLiveOddsapiConfig({ allow_live_invoke: true }),
    api_key,
    seed_run_id_factory: () => randomUUID(),
    now: () => new Date().toISOString(),
    runInGameTransaction: (body) => withTransaction(pool, body),
    on_quota_trail: (entry, t) => {
      console.log(
        `#   quota ${entry.internal_game_id.slice(0, 8)}  forecast=${t.forecast} observed=${t.observed ?? '-'} ` +
          `flag=${t.delta_flag} last=${t.x_requests_last ?? '-'} remaining=${t.x_requests_remaining ?? '-'} ` +
          `used=${t.x_requests_used ?? '-'} cumulative_batch=${t.cumulative_batch_spend}`,
      );
    },
  });
}

async function main(): Promise<void> {
  try {
    if (CLI.manifest === null) {
      console.error('# V1-OP-8b: --manifest <file> is required (explicit frozen list; never a selector).');
      process.exitCode = 2;
      return;
    }
    // DOUBLE GATE.
    if (CLI.apply && process.env['ODDSAPI_LIVE_INVOKE'] !== '1') {
      console.error('# V1-OP-8b: --apply requires ODDSAPI_LIVE_INVOKE=1. Aborting before any provider call or write.');
      process.exitCode = 2;
      return;
    }
    const manifest = readManifest(CLI.manifest);
    const deps = CLI.apply ? await buildApplyDeps() : dryRunDeps;

    console.log(CLI.apply ? '# V1-OP-8b BATCH APPLY' : '# V1-OP-8b DRY-RUN (zero credits, zero writes)');
    console.log(`# manifest        : ${CLI.manifest} (${manifest.length} games, frozen literal list)`);
    console.log(`# ceiling         : ${CLI.ceiling} cr   forecast: ${manifest.length * 40} cr (${manifest.length} x 40, no discovery)`);

    const report = await runBoundedBatch(deps, {
      manifest,
      max_total_credits: CLI.ceiling,
      dry_run: !CLI.apply,
    });

    console.log(`# ---- per-game ledger ----`);
    for (const l of report.ledger) {
      console.log(
        `#   ${l.internal_game_id} ${l.outcome.padEnd(19)} ` +
          `scq=${String(l.grains.source_closing_quotes).padStart(3)} ccp=${String(l.grains.canonical_closing_points).padStart(3)} hlr=${String(l.grains.historical_line_results).padStart(3)} ` +
          `age=${l.snapshot_age_seconds_before_boundary ?? '-'}s fc=${l.credits_forecast} obs=${l.credits_observed ?? '-'}  ${l.detail}`,
      );
    }
    const c = report.ledger.reduce((a, l) => { a[l.outcome] = (a[l.outcome] ?? 0) + 1; return a; }, {} as Record<string, number>);
    console.log(`# ---- summary ----`);
    console.log(`#   outcomes        : ${JSON.stringify(c)}`);
    console.log(`#   calls billed    : ${report.spend.calls_billed}`);
    console.log(`#   credits forecast: ${report.spend.credits_forecast_total}   observed: ${report.spend.credits_observed_total}`);
    console.log(`#   x-requests-remaining (last call): ${report.spend.x_requests_remaining_last ?? '-'}`);
    const eligible = report.ledger.filter((l) => l.outcome === 'eligible').length;
    const stale = report.ledger.filter((l) => l.outcome === 'close_capture_stale').length;
    if (eligible + stale > 0) {
      console.log(`#   MEASURED close_capture_stale rate: ${stale}/${eligible + stale} = ${(stale / (eligible + stale)).toFixed(3)}`);
    }
    if (report.halt_reason !== null) {
      console.log(`# HALT: ${report.halt_reason}`);
      process.exitCode = 3;
    }
  } finally {
    await pool.end();
  }
}

void main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});

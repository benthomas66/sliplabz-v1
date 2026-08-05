// V1-OP-8b §0.4 — unmapped-tail discovery sample operator entry.
//
// Issues ONE historical events-discovery call per date on a FROZEN date plan
// (1 credit each) and classifies the unmapped backlog into (b) discovery-
// recoverable vs (c) unrecoverable. The 40cr event-odds seam is unreachable
// from `unmappedDiscoverySample.ts` by construction (asserted by test).
//
// DOUBLE-GATED. A call is issued only when BOTH `--apply` is passed AND
// `ODDSAPI_LIVE_INVOKE=1` is set. Without both, the run is a dry-run that
// issues no request and spends nothing.
//
//   npx tsx scripts/v1_op_8b_discovery_sample.ts --plan <path>            # dry-run
//   ODDSAPI_LIVE_INVOKE=1 npx tsx scripts/v1_op_8b_discovery_sample.ts \
//     --plan <path> --expect-sha256 <hash> --max-credits 20 --apply
//
// The plan file is required and its SHA-256 must match `--expect-sha256`: the
// sample never re-runs a selector, and an empty plan is a hard error.

import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

import { withTransaction } from '../src/db/transaction.js';
import { openPool } from '../src/db/connection.js';
import {
  runDiscoverySample,
  buildProbePlan,
  type UnmappedGame,
  type SampleReport,
} from '../src/lines/unmappedDiscoverySample.js';
import { recordDiscoveryLedgerInTx } from '../src/lines/discoverySampleLedger.js';
import { buildLiveOddsapiConfig } from '../src/lines/liveInvokeGate.js';

interface Args {
  readonly plan_path: string;
  readonly expect_sha256: string | null;
  readonly max_credits: number;
  readonly apply: boolean;
}

export function parseArgs(argv: ReadonlyArray<string>): Args {
  let plan_path: string | null = null;
  let expect_sha256: string | null = null;
  let max_credits = 20;
  let apply = false;
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--plan') {
      const v = argv[i + 1];
      if (v === undefined || v.trim() === '') throw new Error('--plan requires a path');
      plan_path = v.trim();
      i += 1;
    } else if (a === '--expect-sha256') {
      const v = argv[i + 1];
      if (v === undefined || v.trim() === '') throw new Error('--expect-sha256 requires a value');
      expect_sha256 = v.trim();
      i += 1;
    } else if (a === '--max-credits') {
      const v = Number(argv[i + 1]);
      if (!Number.isFinite(v) || v <= 0) throw new Error('--max-credits requires a positive number');
      max_credits = v;
      i += 1;
    } else if (a === '--apply') {
      apply = true;
    }
  }
  if (plan_path === null) throw new Error('--plan is required; the sample never re-runs a selector');
  return { plan_path, expect_sha256, max_credits, apply };
}

/** The frozen plan file: one JSON object per line, ordered by date then game. */
export function parsePlan(text: string): {
  readonly games: UnmappedGame[];
  readonly dates: string[];
} {
  const games: UnmappedGame[] = [];
  for (const line of text.split('\n')) {
    if (line.trim() === '' || line.trimStart().startsWith('#')) continue;
    games.push(JSON.parse(line) as UnmappedGame);
  }
  if (games.length === 0) throw new Error('empty plan: an explicit frozen plan is required; never an implicit scan');
  return { games, dates: [...new Set(games.map((g) => g.slate_date))].sort() };
}

/** sha256 over the ascending dates, "\n"-joined, no trailing newline, UTF-8. */
export function planHash(dates: ReadonlyArray<string>): string {
  return createHash('sha256').update([...dates].sort().join('\n'), 'utf8').digest('hex');
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const parsed = parsePlan(readFileSync(args.plan_path, 'utf8'));
  const hash = planHash(parsed.dates);
  // GAP-42: probes are anchored to each game's close boundary, so the paid unit
  // is a distinct BOUNDARY INSTANT, not a slate date.
  const { groups, no_boundary } = buildProbePlan(parsed.games);

  if (args.expect_sha256 !== null && args.expect_sha256 !== hash) {
    throw new Error(`plan hash mismatch: expected ${args.expect_sha256}, got ${hash} — refusing to run`);
  }

  const live = process.env.ODDSAPI_LIVE_INVOKE === '1';
  const dry_run = !(args.apply && live);

  console.log('=== V1-OP-8b §0.4 DISCOVERY SAMPLE ===');
  console.log(`  plan:          ${args.plan_path}`);
  console.log(`  games:         ${parsed.games.length}   slate dates: ${parsed.dates.length}`);
  console.log(`  probes:        ${groups.length} distinct close boundaries (GAP-42)   unprobed (no boundary): ${no_boundary.length}`);
  console.log(`  sha256(dates): ${hash}`);
  console.log(`  forecast:      ${groups.length} × 1cr = ${groups.length} credits`);
  console.log(`  ceiling:       ${args.max_credits} credits`);
  console.log(`  --apply:       ${args.apply}    ODDSAPI_LIVE_INVOKE=1: ${live}`);
  console.log(`  MODE:          ${dry_run ? 'DRY-RUN (no call, no spend)' : 'LIVE (paid discovery calls)'}`);
  console.log('');

  const api_key = process.env.ODDS_API_KEY ?? '';
  if (!dry_run && api_key === '') throw new Error('ODDS_API_KEY is required for a live run');

  // Structurally spend-incapable on a dry-run: the effectful seam THROWS
  // rather than being merely unused (the committed live-invoke gate).
  const db_url = process.env.SLIPLABZ_HOSTED_DATABASE_URL ?? '';
  if (db_url === '') throw new Error('SLIPLABZ_HOSTED_DATABASE_URL is required');
  const pool = openPool({ connectionString: db_url, max: 2, statement_timeout_ms: 60_000, ssl: 'require' });
  const report: SampleReport = await runDiscoverySample(
    {
      // The live config is BUILT ONLY when both gates are open — the committed
      // `buildLiveOddsapiConfig` refuses to construct one otherwise.
      oddsapi_config: dry_run ? ({} as never) : buildLiveOddsapiConfig({ allow_live_invoke: true }),
      api_key,
      // Spend-incapable at the FETCH seam on a dry-run: a call does not merely
      // go un-issued, it THROWS. Left undefined when live, so the committed
      // `fetchHistoricalEvents` is the only reachable path.
      ...(dry_run
        ? { fetchEvents: ((): never => { throw new Error('dry-run: the discovery seam is unreachable without --apply and ODDSAPI_LIVE_INVOKE=1'); }) as never }
        : {}),
      recordLedger: async (row, ctx) => {
        await withTransaction(pool, async (tx) => {
          const id = await recordDiscoveryLedgerInTx(tx, {
            row,
            at_timestamp: ctx.at_timestamp,
            redacted_request_url: ctx.redacted_request_url,
            response_headers: ctx.response_headers,
            retrieved_at: ctx.retrieved_at,
          });
          console.log(`  [ledger] ${row.slate_date}  1cr  cum=${row.cumulative_sample_spend}  remaining=${row.x_requests_remaining}  run_id=${id}`);
        });
      },
      on_probe: (probe_at, events, games) => {
        console.log(`  [discovery] probe=${probe_at}  events=${events}  serves ${games} game(s)`);
      },
    },
    { games: parsed.games, max_total_credits: args.max_credits, dry_run },
  );

  console.log('\n=== CLASSIFICATION ===');
  for (const r of report.rows) {
    const tag = r.population === 'b_discovery_recoverable' ? '(b)' : '(c)';
    console.log(`  ${tag} ${r.slate_date}  ${r.internal_game_id.slice(0, 8)}  ${r.matchup.padEnd(9)} recentN=${r.in_recent_n ? 'YES' : 'no '}  ${r.detail}`);
  }

  const t = report.totals;
  console.log('\n=== TOTALS ===');
  console.log(`  games:                ${t.games_attempted}`);
  console.log(`  (b) recoverable:      ${t.n_b}`);
  console.log(`  (c) unrecoverable:    ${t.n_c}`);
  console.log(`  recovery rate:        ${(t.recovery_rate * 100).toFixed(1)}%`);
  console.log(`  (c) INSIDE recent-N:  ${t.c_within_recent_n}   <-- the suppression floor`);
  console.log(`  credits forecast:     ${t.credits_forecast}`);
  console.log(`  credits observed:     ${t.credits_observed}`);
  if (report.halt_reason !== null) console.log(`  HALT: ${report.halt_reason}`);
  await pool.end();
}

if (process.argv[1]?.endsWith('v1_op_8b_discovery_sample.ts') === true) {
  main().catch((e: unknown) => {
    console.error(e);
    process.exit(1);
  });
}

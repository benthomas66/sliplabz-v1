// V1-OP-8a — thin operator entry for the scoped historical retrieval owner.
//
// Composition-only. Every load-bearing decision lives in
// src/lines/scopedHistoricalRetrieval.ts and the committed Path C primitives
// it composes. This script only wires the injected seams:
//
//   readCloseBoundary   -> committed evaluateCloseBoundary over stored inputs
//   loadFixtureSnapshot -> a committed fixture (DRY-RUN ONLY; 0 credits)
//   fetchSnapshot       -> committed fetchHistoricalEventOdds (PAID; --apply)
//   processSnapshot     -> committed processHistoricalSnapshot
//   persistTriple       -> committed persistHistoricalSnapshot (per triple)
//   runCanonicalForGame -> committed deleteAndReplaceCanonicalClosingPointsFromDb
//                          with restrict_to_internal_game_ids = [target]
//   runHlrForGame       -> committed runHistoricalLineResultsBackfill with
//                          restrict_to_internal_game_ids = [target]
//
// SAFETY DEFAULTS (binding for V1-OP-8a):
//   * DRY-RUN IS THE DEFAULT and is credit-free + write-free. The paid fetch
//     and every persist seam are unreachable without `--apply`.
//   * Requires EXPLICIT --game and --event. A missing selector is a hard
//     error, never an implicit broad scan.
//   * Never scans the leg-2 discovery cache; never performs discovery.
//   * Never writes either start-time field (this path writes no `games` row).
//   * `--apply` is NOT authorized by the V1-OP-8a ticket; it exists so the
//     later founder-authorized one-game validation has a reviewed code path,
//     and it refuses to run without ODDSAPI_LIVE_INVOKE=1.
//
// Usage (dry-run; the only mode this ticket authorizes):
//   set -a && source .env && set +a
//   node --import tsx scripts/v1_op_8a_retrieve.ts \
//     --game <internal_game_id> --event <provider_event_id> \
//     --at 2026-07-17T23:15:00Z --ceiling 60

import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

import {
  executeScopedRetrieval,
  type ScopedRetrievalDeps,
  type ScopedRetrievalRequest,
} from '../src/lines/scopedHistoricalRetrieval.js';
import { processHistoricalSnapshot } from '../src/seed/historicalEventOdds.js';
import { buildScopedRetrievalDeps } from '../src/lines/scopedHistoricalRetrievalDeps.js';
import { recordPaidCallBillingInTx } from '../src/lines/paidCallBilling.js';
import { withTransaction } from '../src/db/transaction.js';
import { buildLiveOddsapiConfig } from '../src/lines/liveInvokeGate.js';
import { openPool } from '../src/db/connection.js';
import { evaluateCloseBoundary } from '../src/lines/closeBoundary.js';
import { LAUNCH_MARKET_KEYS } from '../src/odds/marketKeys.js';
import { V1_BOOKMAKER_ALLOWLIST } from '../src/odds/bookmakerAllowlist.js';
import type { HistoricalEventOddsResponse } from '../src/seed/types.js';

const DB_URL = process.env['SLIPLABZ_HOSTED_DATABASE_URL'];
if (DB_URL === undefined || DB_URL === '') {
  console.error('# V1-OP-8a: SLIPLABZ_HOSTED_DATABASE_URL required (hosted DB only). Aborting.');
  process.exit(1);
}

const argv = process.argv.slice(2);
function flag(name: string): string | null {
  const i = argv.indexOf(name);
  if (i < 0 || i === argv.length - 1) return null;
  return argv[i + 1] ?? null;
}
const CLI = {
  game: flag('--game'),
  event: flag('--event'),
  at: flag('--at'),
  ceiling: Number(flag('--ceiling') ?? '60'),
  apply: argv.includes('--apply'),
  fixture: flag('--fixture') ?? 'tests/fixtures/seed/historical-event-odds-clean.json',
};

// Sportsbook allowlist only — DFS pickem never enters sportsbook consensus.
const BOOKS = V1_BOOKMAKER_ALLOWLIST.filter((b) => b.source_class === 'sportsbook').map((b) => b.provider_key);

const pool = new pg.Pool({
  connectionString: DB_URL,
  max: 2,
  ssl: DB_URL.includes('supabase.') ? { rejectUnauthorized: false } : undefined,
});

const deps: ScopedRetrievalDeps = {
  // Read-only. The boundary comes ONLY from the committed primitive over the
  // STORED start-time fields — never synthesized, never from a date-only field.
  readCloseBoundary: async (internal_game_id) => {
    const r = await pool.query(
      `SELECT internal_game_id::text AS id, status::text AS status,
              scheduled_start_utc, actual_start_utc
         FROM games WHERE internal_game_id = $1::uuid`,
      [internal_game_id],
    );
    if (r.rowCount !== 1) return { close_boundary_utc: null, boundary_source: null };
    const g = r.rows[0] as { id: string; status: string; scheduled_start_utc: Date | null; actual_start_utc: Date | null };
    const b = evaluateCloseBoundary({
      internal_game_id: g.id,
      status: g.status as never,
      scheduled_start_utc: g.scheduled_start_utc ? g.scheduled_start_utc.toISOString() : null,
      actual_start_utc: g.actual_start_utc ? g.actual_start_utc.toISOString() : null,
    } as never);
    return { close_boundary_utc: b.close_boundary_utc, boundary_source: b.boundary_source };
  },

  // DRY-RUN snapshot source. A committed fixture with documented provenance.
  // Spends ZERO credits and touches no provider.
  loadFixtureSnapshot: async () => {
    const raw = JSON.parse(readFileSync(CLI.fixture, 'utf8')) as {
      response_body?: HistoricalEventOddsResponse;
    } & HistoricalEventOddsResponse;
    return (raw.response_body ?? raw) as HistoricalEventOddsResponse;
  },

  // DRY-RUN path keeps every effectful seam unreachable. The real seams are
  // built ONLY on --apply (see buildApplyDeps) so a dry-run can never fetch or
  // persist even by mistake.
  fetchSnapshot: async () => {
    throw new Error('# V1-OP-8: the paid fetch is not reachable on a dry-run.');
  },
  processSnapshot: (input) => processHistoricalSnapshot(input as never) as never,
  persistTriple: async () => {
    throw new Error('# V1-OP-8: persistence is not reachable on a dry-run.');
  },
  runCanonicalForGame: async () => {
    throw new Error('# V1-OP-8: canonical persistence is not reachable on a dry-run.');
  },
  runHlrForGame: async () => {
    throw new Error('# V1-OP-8: hlr persistence is not reachable on a dry-run.');
  },
};

/**
 * V1-OP-8 PART 2 guard-lift. Builds the REAL seams from the committed wiring
 * (`src/lines/scopedHistoricalRetrievalDeps.ts`, `ae2e159`). Reached ONLY on
 * --apply, and only with ODDSAPI_LIVE_INVOKE=1. Nothing else about the bounded
 * contract changes: still one explicit game + event, the owner's gates still
 * run before the paid call, forbidden tables stay unreachable, neither
 * start-time field is written, attribution stays ownership-scoped, and the
 * wiring performs no blind retry.
 */
async function buildApplyDeps(): Promise<ScopedRetrievalDeps> {
  const db_url: string = DB_URL as string; // env-gated non-empty at module load
  const api_key = process.env['ODDS_API_KEY'];
  if (api_key === undefined || api_key === '') throw new Error('# V1-OP-8: ODDS_API_KEY required for --apply.');
  // Refuses unless ODDSAPI_LIVE_INVOKE=1 (committed live-invoke gate).
  const oddsapi_config = buildLiveOddsapiConfig({ allow_live_invoke: true });
  const sliplabzPool = openPool({ connectionString: db_url, max: 2, statement_timeout_ms: 30_000, ssl: 'require' });
  // Player identity map for persistHistoricalSnapshot (read-only).
  const pr = await sliplabzPool.query('SELECT internal_player_id::text AS id, normalized_name FROM players');
  const players = new Map<string, string>();
  for (const row of pr.rows as Array<{ id: string; normalized_name: string }>) {
    if (row.normalized_name !== '') players.set(row.normalized_name, row.id);
  }
  return buildScopedRetrievalDeps(
    {
      // GAP-47 (class-closed): the charge record commits in its OWN short
      // transaction at fetch-return, before the persist opens — identical to
      // the bulk path. The operator supplies the target game id by closure.
      recordBilling: async (input) => {
        await withTransaction(sliplabzPool, async (tx) => {
          await recordPaidCallBillingInTx(tx, { ...input, internal_game_id: CLI.game ?? '' });
        });
      },
      pool: sliplabzPool,
      connection_string: db_url,
      oddsapi_config,
      api_key,
      seed_run_id: randomUUID(),
      player_ids_by_normalized_name: players,
    },
    { processSnapshot: deps.processSnapshot, loadFixtureSnapshot: deps.loadFixtureSnapshot },
  );
}

async function main(): Promise<void> {
  try {
    // GUARD-LIFT (V1-OP-8 PART 2): --apply is permitted, but ONLY with an
    // explicit live-invoke opt-in. Without it we refuse before any provider call.
    if (CLI.apply && process.env['ODDSAPI_LIVE_INVOKE'] !== '1') {
      console.error('# V1-OP-8: --apply requires ODDSAPI_LIVE_INVOKE=1. Aborting before any provider call or write.');
      process.exitCode = 2;
      return;
    }
    const activeDeps = CLI.apply ? await buildApplyDeps() : deps;

    // The snapshot timestamp is DERIVED from the committed evaluateCloseBoundary
    // over stored fields — never the hand-typed --at. A supplied --at is only
    // cross-checked and reported; it is not used as the request value.
    const derived = await activeDeps.readCloseBoundary(CLI.game ?? '');
    if (CLI.game !== null && derived.close_boundary_utc === null) {
      console.error('# V1-OP-8: no close boundary for the target game. Aborting before any provider call.');
      process.exitCode = 3;
      return;
    }
    if (CLI.at !== null && derived.close_boundary_utc !== null && new Date(CLI.at).getTime() !== new Date(derived.close_boundary_utc).getTime()) {
      console.log(`# NOTE: supplied --at ${CLI.at} IGNORED; using derived boundary ${derived.close_boundary_utc}`);
    }
    const req: ScopedRetrievalRequest = {
      internal_game_id: CLI.game ?? '',
      provider_event_id: CLI.event ?? '',
      at_timestamp: derived.close_boundary_utc ?? '',
      market_keys: [...LAUNCH_MARKET_KEYS],
      bookmaker_keys: BOOKS,
      max_credit_ceiling: Number.isFinite(CLI.ceiling) ? CLI.ceiling : 0,
      requires_discovery: false,
    };
    const report = await executeScopedRetrieval(activeDeps, req, { dry_run: !CLI.apply });

    console.log(CLI.apply ? '# V1-OP-8 APPLY (one paid event; persists for the target game only)' : '# V1-OP-8a DRY-RUN (zero credits, zero writes)');
    console.log(`# target game      : ${report.plan.internal_game_id || '(none)'}`);
    console.log(`# provider event   : ${report.plan.provider_event_id || '(none)'}`);
    console.log(`# requested markets: ${report.plan.market_keys.join(', ') || '(none)'}`);
    console.log(`# books            : ${report.plan.bookmaker_keys.length} sportsbooks`);
    console.log(`# forecast cost    : ${report.plan.forecast_total_credits} cr (odds ${report.plan.forecast_odds_credits} + discovery ${report.plan.forecast_discovery_credits}) vs ceiling ${report.plan.max_credit_ceiling}`);
    console.log(`# credits spent    : ${report.credits_spent}`);
    if (report.halt_reason !== null) {
      console.log(`# HALT: ${report.halt_reason} — ${report.detail}`);
      process.exitCode = 3;
      return;
    }
    console.log(`# close boundary   : ${report.close_boundary_utc} (source=${report.boundary_source})`);
    console.log(`# snapshot ts      : ${report.snapshot_timestamp}`);
    console.log(`# close capture    : ${JSON.stringify(report.close_capture)}`);
    console.log(`# offerings        : accepted=${report.candidates_accepted} rejected=${report.offerings_rejected}`);
    console.log(`# proposed triples : ${report.triples.length}`);
    for (const t of report.triples) console.log(`#   ${t.market_key} | ${t.bookmaker_key} | quotes=${t.candidates.length}`);
    console.log(`# would-write keys : ${report.would_write.length}`);
    for (const w of report.would_write) console.log(`#   ${w.table}  ${w.key}`);
    console.log('# nothing was written and no provider call was made.');
  } finally {
    await pool.end();
  }
}

void main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});

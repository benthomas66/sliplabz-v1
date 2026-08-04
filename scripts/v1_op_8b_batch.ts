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
import {
  persistHistoricalSnapshotInTx,
} from '../src/seed/orchestrator/persistHistoricalSnapshot.js';
import { deleteAndReplaceCanonicalClosingPointsInTx } from '../src/seed/orchestrator/canonicalClosingPointsForSeed.js';
import { runHistoricalLineResultsBackfillInTx } from '../src/lines/historicalLineResultsBackfill.js';
import { CANONICAL_COMPUTATION_VERSION } from '../src/lines/scopedHistoricalRetrievalDeps.js';
import { groupCandidatesByTriple } from '../src/lines/scopedHistoricalRetrieval.js';
import { processHistoricalSnapshot } from '../src/seed/historicalEventOdds.js';
import { evaluateCloseBoundary } from '../src/lines/closeBoundary.js';
import { fetchHistoricalEventOdds } from '../src/seed/httpClient.js';
import { reconcileQuota } from '../src/odds/quotaForecast.js';
import { buildLiveOddsapiConfig } from '../src/lines/liveInvokeGate.js';
import { openPool } from '../src/db/connection.js';
import { withTransaction } from '../src/db/transaction.js';
import { LAUNCH_MARKET_KEYS } from '../src/odds/marketKeys.js';
import { V1_BOOKMAKER_ALLOWLIST } from '../src/odds/bookmakerAllowlist.js';
import type { HistoricalEventOddsResponse } from '../src/seed/types.js';

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

const BOOKS = V1_BOOKMAKER_ALLOWLIST.filter((b) => b.source_class === 'sportsbook').map((b) => b.provider_key);

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
 * Gate (c) APPLY deps. Constructed ONLY on --apply + ODDSAPI_LIVE_INVOKE=1.
 * Reuses the committed atomic path — no new persistence math here.
 */
async function buildApplyDeps(): Promise<BatchRunnerDeps> {
  const api_key = process.env['ODDS_API_KEY'];
  if (api_key === undefined || api_key === '') throw new Error('# V1-OP-8b: ODDS_API_KEY required for --apply.');
  const oddsapi_config = buildLiveOddsapiConfig({ allow_live_invoke: true });

  const pr = await pool.query('SELECT internal_player_id::text AS id, normalized_name FROM players');
  const players = new Map<string, string>();
  for (const row of pr.rows as Array<{ id: string; normalized_name: string }>) {
    if (row.normalized_name !== '') players.set(row.normalized_name, row.id);
  }

  // Per-call reconciliation captured at the paid seam, persisted to the ledger.
  let quota: { forecast: number; observed: number | null; delta_flag: never; x_requests_last: number | null } | undefined;
  let seed_run_id = randomUUID();
  let currentEvent = '';
  let currentBoundary = '';
  let snapshotTs: string | null = null;

  return {
    alreadyRepaired,

    // PAID. Completes and RETURNS before any transaction opens.
    retrieveGame: async (entry) => {
      seed_run_id = randomUUID();
      currentEvent = entry.provider_event_id;

      const g = await pool.query(
        `SELECT internal_game_id::text AS id, status::text AS status, scheduled_start_utc, actual_start_utc
           FROM games WHERE internal_game_id = $1::uuid`,
        [entry.internal_game_id],
      );
      const row = g.rows[0] as { id: string; status: string; scheduled_start_utc: Date | null; actual_start_utc: Date | null };
      const b = evaluateCloseBoundary({
        internal_game_id: row.id,
        status: row.status,
        scheduled_start_utc: row.scheduled_start_utc === null ? null : row.scheduled_start_utc.toISOString(),
        actual_start_utc: row.actual_start_utc === null ? null : row.actual_start_utc.toISOString(),
      } as never);
      if (b.close_boundary_utc === null) throw new Error(`no close boundary for ${entry.internal_game_id}`);
      currentBoundary = b.close_boundary_utc;

      const forecast = 40; // GAP-29-corrected: 4 markets x ceil(8/10) x 10 x 1 event
      const res = await fetchHistoricalEventOdds(oddsapi_config, {
        api_key,
        at_timestamp: b.close_boundary_utc, // normalized to second precision at the HTTP owner
        provider_event_id: entry.provider_event_id,
        market_keys: [...LAUNCH_MARKET_KEYS],
        bookmaker_keys: BOOKS,
        odds_format: 'american',
      });
      if (res.status !== 200 || res.body_json === null) {
        throw new Error(`historical fetch failed (status=${res.status}); no retry attempted, no rows written`);
      }
      const lastRaw = res.headers['x-requests-last'];
      const remRaw = res.headers['x-requests-remaining'];
      const observed = typeof lastRaw === 'number' ? lastRaw : Number(lastRaw);
      const remaining = typeof remRaw === 'number' ? remRaw : Number(remRaw);
      const x_requests_last = Number.isFinite(observed) ? observed : null;
      const rq = reconcileQuota({ forecast, observed_x_requests_last: x_requests_last });
      quota = { forecast: rq.forecast, observed: rq.observed, delta_flag: rq.delta_flag as never, x_requests_last };

      const response = res.body_json as HistoricalEventOddsResponse;
      snapshotTs = response.timestamp ?? null;
      const processed = processHistoricalSnapshot({
        requested_close_boundary_utc: b.close_boundary_utc,
        response,
      } as never);

      return {
        close_capture_state: processed.close_capture.close_capture_state as 'eligible' | 'close_capture_stale' | 'no_snapshot',
        snapshot_age_seconds_before_boundary: processed.close_capture.age_seconds_before_boundary ?? null,
        triples: groupCandidatesByTriple(processed.candidates),
        credits_forecast: forecast,
        credits_observed: x_requests_last,
        x_requests_remaining: Number.isFinite(remaining) ? remaining : null,
      };
    },

    // ONE game-level transaction — the committed atomic path.
    runInGameTransaction: (body) => withTransaction(pool, body),

    persistTripleInTx: async (tx, group) => {
      const r = await persistHistoricalSnapshotInTx(tx, {
        seed_run_id,
        provider_event_id: currentEvent,
        linked_internal_game_id: null,
        linked_internal_player_ids_by_normalized_name: players,
        market_key: group.market_key,
        bookmaker_key: group.bookmaker_key,
        bookmaker_title: group.bookmaker_key,
        requested_close_boundary_utc: currentBoundary,
        provider_snapshot_time: snapshotTs,
        retrieved_at: new Date().toISOString(),
        close_capture: { close_capture_state: 'eligible' } as never,
        redacted_request_url:
          `https://api.the-odds-api.com/v4/historical/sports/basketball_wnba/events/${currentEvent}/odds?apiKey=REDACTED&date=${currentBoundary}`,
        request_params: { date: currentBoundary, markets: [group.market_key], bookmakers: [group.bookmaker_key], oddsFormat: 'american' },
        response_headers: {},
        raw_response_body: null,
        raw_response_body_text: null,
        candidates: group.candidates,
        ...(quota !== undefined ? { quota_reconciliation: quota } : {}),
      });
      return { source_closing_quote_ids: r.source_closing_quote_ids };
    },

    canonicalInTx: async (tx, internal_game_id) => {
      const r = await deleteAndReplaceCanonicalClosingPointsInTx(tx, {
        restrict_to_internal_game_ids: [internal_game_id],
        computation_version: CANONICAL_COMPUTATION_VERSION,
      });
      return { inserted: r.inserted };
    },

    hlrInTx: async (tx, internal_game_id) => {
      const c = await runHistoricalLineResultsBackfillInTx(tx, {
        restrict_to_internal_game_ids: [internal_game_id],
      });
      return { rows_inserted: c.rows_inserted, rows_updated: c.rows_updated };
    },
  };
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

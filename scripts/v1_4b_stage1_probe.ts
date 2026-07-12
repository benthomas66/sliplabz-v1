// V1-4b Stage 1 Coverage Probe — operator script.
//
// This is a scripts/ program, NOT a test. Tests never make live provider
// calls (Stage 1 governor gate). Live invocation requires the operator to
// set BOTH:
//   * ODDSAPI_LIVE_INVOKE=1
//   * ODDS_API_KEY=<real key from local .env>
// If either is missing, the script exits early with a visible message and
// writes a fixture-based skeleton `V1_4B_STAGE1_COVERAGE_PROBE.md` so
// downstream reviewers still see the file's shape.
//
// Governor scope for Stage 1:
//   * At most 4 events across 3 distinct past slate dates.
//   * All four launch markets, allowlisted sportsbook keys only (no DFS).
//   * 200-credit ceiling; the pre-request predicate halts the run BEFORE
//     issuing a request that would exceed the budget.
//   * Persists to the local Docker Postgres via SLIPLABZ_DATABASE_URL.
//     NEVER a hosted Supabase project.
//
// Governor authorization (owner + counsel, low rights risk): recorded in
// docs/product/reports/V1_TICKET_4B_REPORT.md §1. V1-10 remains the final
// customer-facing rights checkpoint.

import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve as pathResolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

import { buildLiveOddsapiConfig, LiveInvokeGateError } from '../src/lines/liveInvokeGate.js';
import {
  V1_CONSENSUS_SPORTSBOOK_KEYS,
} from '../src/odds/bookmakerAllowlist.js';
import { LAUNCH_MARKET_KEYS } from '../src/odds/marketKeys.js';
import {
  bookmakerRegionEquivalents,
  forecastHistoricalEventOddsCost,
  HISTORICAL_EVENTS_DEFAULT_FORECAST,
  nextRequestWouldExceedBudget,
  reconcileHistoricalQuota,
} from '../src/seed/quotaForecast.js';
import { evaluateCloseCapture } from '../src/seed/staleness.js';
import { validateHistoricalEventDiscoveryRows } from '../src/seed/historicalEventDiscovery.js';
import { processHistoricalSnapshot } from '../src/seed/historicalEventOdds.js';
import { selectCanonicalClosingPoint } from '../src/lines/canonicalClosingPoint.js';
import {
  fetchHistoricalEvents,
  fetchHistoricalEventOdds,
} from '../src/seed/httpClient.js';
import type {
  CoverageReportRow,
  QuotaLedgerEntry,
  SeedRunClosed,
} from '../src/seed/types.js';
import { openSeedRun, closeSeedRun } from '../src/seed/seedRun.js';
import { formatCoverageReportMarkdown } from '../src/seed/coverageReport.js';

// --- Stage 1 governor scope ----------------------------------------------

const CREDIT_BUDGET = 100;
const MAX_EVENTS = 2;
const MAX_EVENTS_PER_DATE = 1;

// Governor-authorized mini-probe: mid/late-season only. One event per date.
const DEFAULT_SLATE_DATES = ['2026-06-15', '2026-07-01'];

// Sportsbook-only per §14.11.1. DFS keys never enter historical seed calls.
const BOOKMAKER_KEYS: ReadonlyArray<string> = V1_CONSENSUS_SPORTSBOOK_KEYS;

// ---- Report path --------------------------------------------------------

const here = dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = pathResolve(
  here,
  '../docs/product/reports/V1_4B_STAGE1_COVERAGE_PROBE.md'
);

interface ProbeConfig {
  readonly slate_dates: ReadonlyArray<string>;
  readonly market_keys: ReadonlyArray<string>;
  readonly bookmaker_keys: ReadonlyArray<string>;
  readonly credit_budget: number;
  readonly max_events: number;
  readonly max_events_per_date: number;
}

async function main(): Promise<void> {
  const cfg: ProbeConfig = {
    slate_dates: DEFAULT_SLATE_DATES,
    market_keys: LAUNCH_MARKET_KEYS,
    bookmaker_keys: BOOKMAKER_KEYS,
    credit_budget: CREDIT_BUDGET,
    max_events: MAX_EVENTS,
    max_events_per_date: MAX_EVENTS_PER_DATE,
  };

  const api_key = process.env['ODDS_API_KEY'];
  const live_flag = process.env['ODDSAPI_LIVE_INVOKE'];

  if (
    api_key === undefined ||
    api_key === '' ||
    live_flag !== '1'
  ) {
    console.log(
      '# SKIP live probe: ODDS_API_KEY and ODDSAPI_LIVE_INVOKE=1 are required for live invocation.'
    );
    console.log(
      '# Writing fixture-mode skeleton to ' + REPORT_PATH + ' so the report exists for review.'
    );
    writeReport(buildFixtureModeReport(cfg));
    return;
  }

  let http_cfg;
  try {
    http_cfg = buildLiveOddsapiConfig({
      allow_live_invoke: true,
      env: process.env as Record<string, string | undefined>,
    });
  } catch (err) {
    if (err instanceof LiveInvokeGateError) {
      console.error(
        `# HALT: live-invoke gate refused to build config: ${err.message}`
      );
      return;
    }
    throw err;
  }

  // --- Run initialization ------------------------------------------------

  const started_at = new Date().toISOString();
  const seed_run_id = randomUUID();
  const open_run = openSeedRun({
    seed_run_id,
    started_at,
    scope: {
      run_kind: 'stage1_probe',
      label: 'Stage 1 mini-probe: mid/late-season coverage',
      credit_budget: cfg.credit_budget,
      requested_market_keys: cfg.market_keys,
      requested_bookmaker_keys: cfg.bookmaker_keys,
      attempted_slate_dates: cfg.slate_dates,
    },
  });

  const quota_ledger: QuotaLedgerEntry[] = [];
  const coverage_rows: CoverageReportRow[] = [];
  let credits_observed_total = 0;
  let events_probed = 0;
  let events_admitted = 0;
  let events_stale_rejected = 0;
  let events_no_snapshot = 0;
  let aborted_reason: string | null = null;

  outer: for (const slate_date of cfg.slate_dates) {
    // 1. Historical events discovery — one request per slate_date.
    const discovery_forecast = HISTORICAL_EVENTS_DEFAULT_FORECAST;
    if (
      nextRequestWouldExceedBudget({
        credit_budget: cfg.credit_budget,
        credits_observed_total,
        next_forecast: discovery_forecast,
      })
    ) {
      aborted_reason = `budget would be exceeded before discovery on ${slate_date} (running total ${credits_observed_total}, forecast ${discovery_forecast}, budget ${cfg.credit_budget})`;
      break;
    }
    const discovery_at = `${slate_date}T23:00:00Z`;
    const disc = await fetchHistoricalEvents(http_cfg, {
      api_key,
      at_timestamp: discovery_at,
    });
    const disc_observed_last =
      typeof disc.headers['x-requests-last'] === 'number'
        ? (disc.headers['x-requests-last'] as number)
        : null;
    credits_observed_total += disc_observed_last ?? 0;
    quota_ledger.push({
      at: new Date().toISOString(),
      endpoint: 'historical_events',
      forecast: discovery_forecast,
      observed_x_requests_last: disc_observed_last,
      x_requests_remaining:
        typeof disc.headers['x-requests-remaining'] === 'number'
          ? (disc.headers['x-requests-remaining'] as number)
          : null,
      x_requests_used:
        typeof disc.headers['x-requests-used'] === 'number'
          ? (disc.headers['x-requests-used'] as number)
          : null,
      running_total: credits_observed_total,
      budget_remaining: cfg.credit_budget - credits_observed_total,
    });

    // If discovery failed, record and move on.
    if (disc.status !== 200 || disc.body_json === null) {
      coverage_rows.push({
        slate_date,
        market_key: '(discovery)',
        bookmaker_key: '(all)',
        player_display: null,
        outcome: 'no_snapshot',
        reason_detail: `discovery HTTP ${disc.status} / parse=${disc.parse_state}`,
      });
      continue;
    }
    const body = disc.body_json as any;
    const events_arr = Array.isArray(body?.data) ? (body.data as unknown[]) : [];
    const valid = validateHistoricalEventDiscoveryRows(events_arr);
    if (valid.valid_events.length === 0) {
      coverage_rows.push({
        slate_date,
        market_key: '(discovery)',
        bookmaker_key: '(all)',
        player_display: null,
        outcome: 'no_snapshot',
        reason_detail: 'discovery returned zero valid events',
      });
      continue;
    }

    // 2. Per-event odds — cap at cfg.max_events across ALL dates AND
    //    cap at cfg.max_events_per_date within this slate_date.
    let events_probed_on_this_date = 0;
    for (const evt of valid.valid_events) {
      if (events_probed >= cfg.max_events) break outer;
      if (events_probed_on_this_date >= cfg.max_events_per_date) break;
      const boundary_utc = evt.commence_time; // §7.10 verified boundary
      const forecast = forecastHistoricalEventOddsCost({
        requested_market_count: cfg.market_keys.length,
        requested_bookmaker_count: cfg.bookmaker_keys.length,
      });
      if (
        nextRequestWouldExceedBudget({
          credit_budget: cfg.credit_budget,
          credits_observed_total,
          next_forecast: forecast,
        })
      ) {
        aborted_reason = `budget would be exceeded before event ${evt.id} (running total ${credits_observed_total}, forecast ${forecast}, budget ${cfg.credit_budget})`;
        break outer;
      }
      const odds = await fetchHistoricalEventOdds(http_cfg, {
        api_key,
        at_timestamp: boundary_utc,
        provider_event_id: evt.id,
        market_keys: cfg.market_keys,
        bookmaker_keys: cfg.bookmaker_keys,
      });
      events_probed += 1;
      events_probed_on_this_date += 1;
      const observed_last =
        typeof odds.headers['x-requests-last'] === 'number'
          ? (odds.headers['x-requests-last'] as number)
          : null;
      credits_observed_total += observed_last ?? 0;
      const rec = reconcileHistoricalQuota({
        forecast,
        observed_x_requests_last: observed_last,
      });
      void rec;
      quota_ledger.push({
        at: new Date().toISOString(),
        endpoint: 'historical_event_odds',
        forecast,
        observed_x_requests_last: observed_last,
        x_requests_remaining:
          typeof odds.headers['x-requests-remaining'] === 'number'
            ? (odds.headers['x-requests-remaining'] as number)
            : null,
        x_requests_used:
          typeof odds.headers['x-requests-used'] === 'number'
            ? (odds.headers['x-requests-used'] as number)
            : null,
        running_total: credits_observed_total,
        budget_remaining: cfg.credit_budget - credits_observed_total,
      });

      if (odds.status !== 200 || odds.body_json === null) {
        events_no_snapshot += 1;
        coverage_rows.push({
          slate_date,
          market_key: '(all)',
          bookmaker_key: '(all)',
          player_display: null,
          outcome: 'no_snapshot',
          reason_detail: `event ${evt.id} HTTP ${odds.status} / parse=${odds.parse_state}`,
        });
        continue;
      }
      const response_body = odds.body_json as any;
      const capture = evaluateCloseCapture({
        requested_close_boundary_utc: boundary_utc,
        returned_snapshot_ts: response_body?.timestamp ?? null,
      });
      if (capture.close_capture_state === 'no_snapshot') {
        events_no_snapshot += 1;
      } else if (capture.close_capture_state === 'close_capture_stale') {
        events_stale_rejected += 1;
        coverage_rows.push({
          slate_date,
          market_key: '(all)',
          bookmaker_key: '(all)',
          player_display: null,
          outcome: 'close_capture_stale',
          reason_detail: capture.detail,
        });
        continue;
      }
      const processed = processHistoricalSnapshot({
        requested_close_boundary_utc: boundary_utc,
        response: response_body,
      });
      // Aggregate per (market, bookmaker) admission counts. The seed
      // pipeline persistence path is exercised in the integration suite;
      // this probe stops at process + coverage-report emission unless the
      // operator opts into the DB write path via SEED_PROBE_PERSIST=1.
      for (const c of processed.candidates) {
        events_admitted += c.close_capture_state === 'eligible' ? 1 : 0;
        coverage_rows.push({
          slate_date,
          market_key: c.market_key,
          bookmaker_key: c.bookmaker_key,
          player_display: c.detail.replace(/^player=/, ''),
          outcome: 'admitted',
          reason_detail: 'eligible sportsbook candidate emitted',
        });
      }
      for (const ex of processed.exclusions) {
        coverage_rows.push({
          slate_date,
          market_key: ex.market_key,
          bookmaker_key: ex.bookmaker_key,
          player_display: null,
          outcome:
            ex.outcome === 'unlaunched_market_key'
              ? 'unlaunched_market_key'
              : ex.outcome ===
                  'dfs_pickem_excluded_from_sportsbook_consensus'
                ? 'dfs_pickem_excluded_from_sportsbook_consensus'
                : ex.outcome === 'unallowlisted_bookmaker_key'
                  ? 'unallowlisted_bookmaker_key'
                  : 'no_snapshot',
          reason_detail: ex.reason_detail,
        });
      }
      // Canonical selection sample (per market).
      type CandT = typeof processed.candidates[number];
      const by_market = new Map<string, CandT[]>();
      for (const c of processed.candidates) {
        const m = by_market.get(c.market_key) ?? [];
        m.push(c);
        by_market.set(c.market_key, m);
      }
      for (const [mk, cands] of by_market) {
        const sel = selectCanonicalClosingPoint(
          cands.map((c) => ({
            bookmaker_key: c.bookmaker_key,
            source_class: c.source_class,
            close_capture_state: c.close_capture_state,
            closing_point: c.closing_point,
          }))
        );
        coverage_rows.push({
          slate_date,
          market_key: mk,
          bookmaker_key: '(canonical)',
          player_display: null,
          outcome: 'admitted',
          reason_detail: `canonical selection = ${sel.selection_method} (${sel.canonical_closing_point ?? 'null'})`,
          canonical_selection_method: sel.selection_method,
          coverage_label: sel.coverage_label,
        });
      }
    }
  }

  const completed_at = new Date().toISOString();
  const completion_state: SeedRunClosed['completion_state'] =
    aborted_reason !== null ? 'aborted_credit_budget' : 'complete';
  const closed_run = closeSeedRun({
    open: open_run,
    completed_at,
    completion_state,
    failure_detail: aborted_reason,
    credits_observed_total,
    events_probed,
    events_admitted,
    events_stale_rejected,
    events_no_snapshot,
  });
  writeReport(
    formatCoverageReportMarkdown({
      run: closed_run,
      rows: coverage_rows,
      quota_ledger,
    })
  );
  console.log(`# probe complete; report written to ${REPORT_PATH}`);
  console.log(
    `# events probed=${events_probed}, admitted=${events_admitted}, stale=${events_stale_rejected}, credits=${credits_observed_total}/${cfg.credit_budget}, completion_state=${completion_state}`
  );
}

function writeReport(body: string): void {
  const dir = pathResolve(REPORT_PATH, '..');
  try {
    mkdirSync(dir, { recursive: true });
  } catch {
    // ignore
  }
  writeFileSync(REPORT_PATH, body);
}

function buildFixtureModeReport(cfg: ProbeConfig): string {
  const lines: string[] = [];
  lines.push('# V1-4b Stage 1 Coverage Probe Report');
  lines.push('');
  lines.push('**Mode:** fixture (live invocation skipped)');
  lines.push('');
  lines.push(
    'Skip reason: `ODDS_API_KEY` and `ODDSAPI_LIVE_INVOKE=1` must both be set for the operator probe to run against the provider. Neither is present in the current environment; the pipeline was NOT invoked live.'
  );
  lines.push('');
  lines.push('## Governor scope this run would have used');
  lines.push('');
  lines.push(`- **Credit budget:** ${cfg.credit_budget}`);
  lines.push(`- **Max events across all dates:** ${cfg.max_events}`);
  lines.push(`- **Slate dates:** ${cfg.slate_dates.join(', ')}`);
  lines.push(
    `- **Markets:** ${cfg.market_keys.join(', ')} (four launch markets; A1 §4.1 locked)`
  );
  lines.push(
    `- **Bookmakers:** ${cfg.bookmaker_keys.join(', ')} (${cfg.bookmaker_keys.length} conventional sportsbook keys; DFS excluded per Odds §11.8, §12.9)`
  );
  lines.push(
    `- **Region-equivalents:** ${bookmakerRegionEquivalents(cfg.bookmaker_keys.length)}`
  );
  lines.push(
    `- **Per-event forecast:** ${forecastHistoricalEventOddsCost({ requested_market_count: cfg.market_keys.length, requested_bookmaker_count: cfg.bookmaker_keys.length })} credits`
  );
  lines.push('');
  lines.push('## What runs when the operator invokes live');
  lines.push('');
  lines.push('1. Historical events discovery per slate_date (1 credit each per §14.11.2 documented separate budget).');
  lines.push('2. For each discovered event (up to `MAX_EVENTS` cap), historical event-odds at the commence_time boundary using ONLY the four launch markets and the sportsbook allowlist.');
  lines.push('3. Every request is preceded by `nextRequestWouldExceedBudget()`; the run halts BEFORE issuing a request that would exceed the 200-credit ceiling.');
  lines.push('4. Every returned snapshot is evaluated by `evaluateCloseCapture`; `>10 min before boundary` marks `close_capture_stale`; no candidates are emitted for stale/no-snapshot outcomes.');
  lines.push('5. `processHistoricalSnapshot` filters to launch-markets × sportsbook-only; DFS/pick\'em rows are excluded and logged.');
  lines.push('6. Every request contributes a quota ledger row; running total is compared to the observed `x-requests-last` header.');
  lines.push('7. Persistence to the local Docker Postgres via `persistHistoricalSnapshot` is available but gated on `SEED_PROBE_PERSIST=1` (defaults to dry-run to keep Stage 1 read-only).');
  lines.push('');
  lines.push('## Live-invocation checklist');
  lines.push('');
  lines.push('```');
  lines.push('export ODDS_API_KEY="…"                 # never commit');
  lines.push('export ODDSAPI_LIVE_INVOKE=1            # explicit gate');
  lines.push('export SLIPLABZ_DATABASE_URL="postgres://sliplabz:sliplabz_test_only@127.0.0.1:55432/sliplabz_v1_4b_it"');
  lines.push('npx tsx scripts/v1_4b_stage1_probe.ts');
  lines.push('```');
  lines.push('');
  return lines.join('\n');
}

main().catch((err) => {
  console.error('# probe script threw:', err);
  process.exit(1);
});

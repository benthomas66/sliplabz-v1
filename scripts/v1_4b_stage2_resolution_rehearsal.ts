// V1-4b Stage 2 Phase A supplement — resolution rehearsal.
//
// What this does (governor-authorized scope):
//   * Enumerates season-to-date slate dates with FINAL games from the
//     HOSTED database.
//   * Runs historical event DISCOVERY per date through the live-invoke gate.
//     No event-odds requests are issued. Discovery costs 1 credit per date.
//   * Hard credit ceiling: 80. The pre-request predicate halts BEFORE
//     issuing any request that would exceed the ceiling.
//   * For every discovered event, invokes the newly wired
//     `resolveOddsapiEventForSeed` path against the hosted DB context.
//   * Reports actual counts (resolved_exact / resolved_tolerance / queued
//     by V1-1 reason) plus a per-date breakdown, a credit ledger, and the
//     projected Phase B forecast.
//   * Additionally reports a WHAT-IF projection: if `odds_api` provider_teams
//     were populated by exact case-insensitive raw_full_name match against
//     the approved BDL provider_teams, how many discovered events would then
//     resolve. This is a projection, NOT an action — no odds_api mapping
//     rows are written by this rehearsal.
//   * Persists NOTHING to the hosted DB from event-odds (no event-odds calls
//     are made) AND persists NOTHING from the resolution outcomes themselves
//     (no provider_games, no event_reconciliation_queue writes). The
//     rehearsal is DRY-RUN — its job is to produce evidence for the governor.
//   * Caches each discovery response body to
//     `docs/product/reports/_stage2_discovery_cache/YYYY-MM-DD.json` so Phase
//     B can replay without re-spending discovery credits.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve as pathResolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

import { buildLiveOddsapiConfig, LiveInvokeGateError } from '../src/lines/liveInvokeGate.js';
import type { OddsapiHttpConfig } from '../src/odds/httpClient.js';
import { fetchHistoricalEvents } from '../src/seed/httpClient.js';
import type { SliplabzPool } from '../src/db/connection.js';
import { validateHistoricalEventDiscoveryRows } from '../src/seed/historicalEventDiscovery.js';
import { HISTORICAL_EVENTS_DEFAULT_FORECAST, nextRequestWouldExceedBudget } from '../src/seed/quotaForecast.js';
import {
  loadSeedResolutionContext,
  resolveOddsapiEventForSeed,
  type SeedEventResolutionOutcome,
} from '../src/seed/orchestrator/eventResolutionForSeed.js';
import type { EventReconciliationInput, InternalGame, ProviderTeam } from '../src/identity/types.js';

// -- Config -----------------------------------------------------------------

const CREDIT_CEILING = 80;
const SPORTSBOOK_EVENT_ODDS_FORECAST = 40; // Phase B per-event forecast

const here = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = pathResolve(here, '../docs/product/reports/_stage2_discovery_cache');
const REPORT_PATH = pathResolve(
  here,
  '../docs/product/reports/V1_4B_STAGE2_RESOLUTION_REHEARSAL.md'
);

// -- Gates ------------------------------------------------------------------

const DB_URL = process.env['SLIPLABZ_HOSTED_DATABASE_URL'];
if (DB_URL === undefined || DB_URL === '') {
  console.error('SLIPLABZ_HOSTED_DATABASE_URL required (hosted DB only)');
  process.exit(1);
}
const api_key = process.env['ODDS_API_KEY'];
const live_flag = process.env['ODDSAPI_LIVE_INVOKE'];
if (api_key === undefined || api_key === '' || live_flag !== '1') {
  console.error('ODDSAPI_LIVE_INVOKE=1 and ODDS_API_KEY are both required. Aborting before any network or DB write.');
  process.exit(1);
}
let http_cfg: OddsapiHttpConfig;
try {
  http_cfg = buildLiveOddsapiConfig({
    allow_live_invoke: true,
    env: process.env as Record<string, string | undefined>,
  });
} catch (err) {
  if (err instanceof LiveInvokeGateError) {
    console.error('# HALT: live-invoke gate refused to build config:', err.message);
    process.exit(1);
  }
  throw err;
}

const rawPool = new pg.Pool({ connectionString: DB_URL, max: 4 });
const pool: SliplabzPool = Object.freeze({
  raw: rawPool,
  query: (sql: string, params?: unknown[]) =>
    params === undefined ? rawPool.query(sql) : rawPool.query(sql, params),
  connect: () => rawPool.connect(),
  end: () => rawPool.end(),
});

// -- Types ------------------------------------------------------------------

interface LedgerEntry {
  readonly at: string;
  readonly slate_date: string;
  readonly discovery_forecast: 1;
  readonly observed_x_requests_last: number | null;
  readonly x_requests_remaining: number | null;
  readonly running_total: number;
  readonly budget_remaining: number;
  readonly status: number;
}

interface DateResult {
  readonly slate_date: string;
  readonly final_games_in_hosted_db: number;
  readonly discovery_status: number;
  readonly events_discovered: number;
  readonly events_quarantined_by_validator: number;
  readonly resolved_exact: number;
  readonly resolved_tolerance: number;
  readonly queued_by_reason: Readonly<Record<string, number>>;
  readonly what_if_resolved_exact: number;
  readonly what_if_resolved_tolerance: number;
  readonly what_if_queued_by_reason: Readonly<Record<string, number>>;
}

// -- Slate-date enumeration -------------------------------------------------

async function enumerateSlateDatesWithFinalGames(): Promise<ReadonlyArray<string>> {
  const r = await pool.query(
    `SELECT DISTINCT to_char(scheduled_start_utc AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS d
       FROM games
       WHERE status = 'final'
       ORDER BY d`
  );
  return (r.rows as Array<{ d: string }>).map((row) => row.d);
}

async function countFinalGamesOnDate(slate: string): Promise<number> {
  const r = await pool.query(
    `SELECT count(*)::int AS n FROM games
       WHERE status = 'final'
         AND to_char(scheduled_start_utc AT TIME ZONE 'UTC', 'YYYY-MM-DD') = $1`,
    [slate]
  );
  return (r.rows[0] as { n: number }).n;
}

// -- What-if: cross-provider exact-name projection --------------------------

interface WhatIfMappingCache {
  readonly by_lowercase_raw_full_name: Map<string, string>; // → internal_team_id
}

async function buildWhatIfMappingCache(): Promise<WhatIfMappingCache> {
  const r = await pool.query(
    `SELECT internal_team_id, raw_full_name
       FROM provider_teams
       WHERE provider = 'balldontlie' AND mapping_state = 'approved' AND internal_team_id IS NOT NULL`
  );
  const m = new Map<string, string>();
  for (const row of r.rows as Array<{ internal_team_id: string; raw_full_name: string }>) {
    if (row.raw_full_name.trim() === '') continue;
    m.set(row.raw_full_name.toLowerCase().trim(), row.internal_team_id);
  }
  return { by_lowercase_raw_full_name: m };
}

/** Projected outcome under the "odds_api teams auto-mapped by exact BDL
 *  full-name match" hypothesis. */
function whatIfResolve(
  ev: { home_team: string; away_team: string; commence_time: string },
  whatIf: WhatIfMappingCache,
  candidateGames: ReadonlyArray<InternalGame>
): { kind: 'resolved_exact' | 'resolved_tolerance' | 'queued'; reason: string } {
  const home = whatIf.by_lowercase_raw_full_name.get(ev.home_team.toLowerCase().trim()) ?? null;
  const away = whatIf.by_lowercase_raw_full_name.get(ev.away_team.toLowerCase().trim()) ?? null;
  if (home === null || away === null) {
    return { kind: 'queued', reason: 'unresolved_provider_team' };
  }
  if (home === away) {
    return { kind: 'queued', reason: 'self_match_invalid' };
  }
  const commenceMs = new Date(ev.commence_time).getTime();
  const ordered = candidateGames.filter((g) => g.home_team_id === home && g.away_team_id === away);
  if (ordered.length === 0) {
    const reversed = candidateGames.filter((g) => g.home_team_id === away && g.away_team_id === home);
    if (reversed.length > 0) return { kind: 'queued', reason: 'ordered_teams_disagree' };
    return { kind: 'queued', reason: 'unmatched' };
  }
  const with_delta = ordered.map((g) => ({
    game: g,
    delta_seconds: Math.round((new Date(g.scheduled_start_utc).getTime() - commenceMs) / 1000),
  }));
  const exact = with_delta.filter((c) => c.delta_seconds === 0);
  if (exact.length === 1) return { kind: 'resolved_exact', reason: '' };
  if (exact.length > 1) return { kind: 'queued', reason: 'ambiguous_multiple_candidates' };
  const within = with_delta.filter((c) => Math.abs(c.delta_seconds) <= 15 * 60);
  if (within.length === 1) return { kind: 'resolved_tolerance', reason: '' };
  if (within.length > 1) return { kind: 'queued', reason: 'ambiguous_multiple_candidates' };
  return { kind: 'queued', reason: 'time_window_exceeded' };
}

// -- Rehearsal --------------------------------------------------------------

function increment<K extends string>(rec: Record<K, number>, k: K): void {
  rec[k] = (rec[k] ?? 0) + 1;
}

async function main(): Promise<void> {
  console.log('# V1-4b Stage 2 resolution rehearsal starting');
  console.log(`#   hosted DB: ${DB_URL!.replace(/:[^:@]+@/, ':REDACTED@')}`);
  console.log(`#   credit ceiling: ${CREDIT_CEILING}`);

  const slates = await enumerateSlateDatesWithFinalGames();
  console.log(`# ${slates.length} slate date(s) with FINAL games in hosted DB`);
  if (slates.length === 0) {
    console.log('# nothing to rehearse.');
    return;
  }

  // Forecast total discovery cost.
  const projected = slates.length * HISTORICAL_EVENTS_DEFAULT_FORECAST;
  console.log(`# forecast total discovery credits: ${projected} (each date = ${HISTORICAL_EVENTS_DEFAULT_FORECAST} credit)`);
  if (projected > CREDIT_CEILING) {
    console.log(
      `# HALT: forecast ${projected} would exceed ceiling ${CREDIT_CEILING}. Aborting before any network call.`
    );
    return;
  }

  mkdirSync(CACHE_DIR, { recursive: true });
  const whatIfCache = await buildWhatIfMappingCache();
  console.log(`# what-if cache: ${whatIfCache.by_lowercase_raw_full_name.size} lowercase BDL raw_full_name → internal_team_id entries`);

  const ledger: LedgerEntry[] = [];
  const perDate: DateResult[] = [];
  let running_total = 0;
  let aborted_reason: string | null = null;

  for (const slate of slates) {
    if (
      nextRequestWouldExceedBudget({
        credit_budget: CREDIT_CEILING,
        credits_observed_total: running_total,
        next_forecast: HISTORICAL_EVENTS_DEFAULT_FORECAST,
      })
    ) {
      aborted_reason = `budget would be exceeded before discovery on ${slate} (running ${running_total}, forecast ${HISTORICAL_EVENTS_DEFAULT_FORECAST}, budget ${CREDIT_CEILING})`;
      break;
    }
    const at = `${slate}T23:00:00Z`;
    const disc = await fetchHistoricalEvents(http_cfg, {
      api_key: api_key!,
      at_timestamp: at,
    });
    const observed_last = typeof disc.headers['x-requests-last'] === 'number'
      ? (disc.headers['x-requests-last'] as number)
      : null;
    const remaining = typeof disc.headers['x-requests-remaining'] === 'number'
      ? (disc.headers['x-requests-remaining'] as number)
      : null;
    running_total += observed_last ?? 0;
    ledger.push(Object.freeze({
      at: new Date().toISOString(),
      slate_date: slate,
      discovery_forecast: 1 as const,
      observed_x_requests_last: observed_last,
      x_requests_remaining: remaining,
      running_total,
      budget_remaining: CREDIT_CEILING - running_total,
      status: disc.status,
    }));

    const finalGames = await countFinalGamesOnDate(slate);
    if (disc.status !== 200 || disc.body_json === null) {
      perDate.push(Object.freeze({
        slate_date: slate,
        final_games_in_hosted_db: finalGames,
        discovery_status: disc.status,
        events_discovered: 0,
        events_quarantined_by_validator: 0,
        resolved_exact: 0,
        resolved_tolerance: 0,
        queued_by_reason: {},
        what_if_resolved_exact: 0,
        what_if_resolved_tolerance: 0,
        what_if_queued_by_reason: {},
      }));
      continue;
    }
    const body = disc.body_json as { data?: unknown[] };
    const raw_events = Array.isArray(body.data) ? body.data : [];

    // Cache discovery response body to disk (governor-authorized) so Phase B
    // can replay without re-spending discovery credits.
    writeFileSync(
      pathResolve(CACHE_DIR, `${slate}.json`),
      JSON.stringify({
        slate_date: slate,
        at_timestamp: at,
        retrieved_at: new Date().toISOString(),
        http_status: disc.status,
        headers: disc.headers,
        body: body,
      }, null, 2)
    );

    const valid = validateHistoricalEventDiscoveryRows(raw_events);
    const queued_by_reason: Record<string, number> = {};
    const what_if_queued_by_reason: Record<string, number> = {};
    let resolved_exact = 0;
    let resolved_tolerance = 0;
    let what_if_resolved_exact = 0;
    let what_if_resolved_tolerance = 0;

    for (const ev of valid.valid_events) {
      // Actual resolution via the wired path.
      const ctx = await loadSeedResolutionContext(pool, {
        provider: 'odds_api',
        raw_commence_time_utc: ev.commence_time,
      });
      const input: EventReconciliationInput = {
        provider: 'odds_api',
        provider_game_id: ev.id,
        raw_home_team: ev.home_team,
        raw_away_team: ev.away_team,
        raw_commence_time: ev.commence_time,
      };
      const outcome: SeedEventResolutionOutcome = resolveOddsapiEventForSeed(input, ctx);
      if (outcome.kind === 'resolved_exact') resolved_exact += 1;
      else if (outcome.kind === 'resolved_tolerance') resolved_tolerance += 1;
      else increment(queued_by_reason, outcome.reason);

      // What-if projection using the SAME candidate-game context (which is
      // provider-agnostic — it's just internal games in the window).
      const wf = whatIfResolve(ev, whatIfCache, ctx.internal_games);
      if (wf.kind === 'resolved_exact') what_if_resolved_exact += 1;
      else if (wf.kind === 'resolved_tolerance') what_if_resolved_tolerance += 1;
      else increment(what_if_queued_by_reason, wf.reason);
    }

    perDate.push(Object.freeze({
      slate_date: slate,
      final_games_in_hosted_db: finalGames,
      discovery_status: disc.status,
      events_discovered: valid.valid_events.length,
      events_quarantined_by_validator: valid.quarantined.length,
      resolved_exact,
      resolved_tolerance,
      queued_by_reason,
      what_if_resolved_exact,
      what_if_resolved_tolerance,
      what_if_queued_by_reason,
    }));
  }

  // -- Aggregate + report --------------------------------------------------

  const total_events = perDate.reduce((n, d) => n + d.events_discovered, 0);
  const total_resolved_exact = perDate.reduce((n, d) => n + d.resolved_exact, 0);
  const total_resolved_tolerance = perDate.reduce((n, d) => n + d.resolved_tolerance, 0);
  const total_queued = total_events - total_resolved_exact - total_resolved_tolerance;
  const total_what_if_resolved = perDate.reduce(
    (n, d) => n + d.what_if_resolved_exact + d.what_if_resolved_tolerance,
    0
  );
  const total_what_if_queued = total_events - total_what_if_resolved;

  const discoverySpent = running_total;
  const phaseBForecastActual = (total_resolved_exact + total_resolved_tolerance) * SPORTSBOOK_EVENT_ODDS_FORECAST + discoverySpent;
  const phaseBForecastWhatIf = total_what_if_resolved * SPORTSBOOK_EVENT_ODDS_FORECAST + discoverySpent;

  console.log('\n===== SUMMARY (actual, current wiring) =====');
  console.log(JSON.stringify({
    slate_dates_enumerated: slates.length,
    events_discovered: total_events,
    resolved_exact: total_resolved_exact,
    resolved_tolerance: total_resolved_tolerance,
    queued: total_queued,
    discovery_credits_spent: discoverySpent,
    phase_b_forecast_credits: phaseBForecastActual,
    aborted_reason,
  }, null, 2));

  console.log('\n===== WHAT-IF (odds_api teams auto-mapped by exact BDL raw_full_name match) =====');
  console.log(JSON.stringify({
    events_discovered: total_events,
    what_if_resolved: total_what_if_resolved,
    what_if_queued: total_what_if_queued,
    phase_b_forecast_credits_if_authorized: phaseBForecastWhatIf,
  }, null, 2));

  // Emit a machine-readable + human-readable report file.
  const md: string[] = [];
  md.push('# V1-4b Stage 2 Resolution Rehearsal');
  md.push('');
  md.push('**Kind:** DRY-RUN. No provider_games or event_reconciliation_queue writes to the hosted DB.');
  md.push('**Credit ceiling (this rehearsal):** ' + CREDIT_CEILING);
  md.push('**Discovery credits spent (observed via headers):** ' + discoverySpent);
  md.push('**Aborted-reason:** ' + (aborted_reason ?? 'none — rehearsal completed all enumerated dates'));
  md.push('');
  md.push('## Aggregates');
  md.push('');
  md.push('| metric | value |');
  md.push('|---|---:|');
  md.push(`| slate dates enumerated | ${slates.length} |`);
  md.push(`| events discovered (total) | ${total_events} |`);
  md.push(`| resolved_exact (actual) | ${total_resolved_exact} |`);
  md.push(`| resolved_tolerance (actual) | ${total_resolved_tolerance} |`);
  md.push(`| queued (actual) | ${total_queued} |`);
  md.push(`| WHAT-IF resolved (exact + tolerance) | ${total_what_if_resolved} |`);
  md.push(`| WHAT-IF queued | ${total_what_if_queued} |`);
  md.push(`| Phase B forecast credits (actual wiring) | ${phaseBForecastActual} |`);
  md.push(`| Phase B forecast credits (what-if) | ${phaseBForecastWhatIf} |`);
  md.push('');
  md.push('## Per-date breakdown');
  md.push('');
  md.push('| slate | final games (hosted) | events discovered | resolved_exact | resolved_tolerance | queued | what-if resolved |');
  md.push('|---|---:|---:|---:|---:|---:|---:|');
  for (const d of perDate) {
    const queued = d.events_discovered - d.resolved_exact - d.resolved_tolerance;
    const whatIfResolved = d.what_if_resolved_exact + d.what_if_resolved_tolerance;
    md.push(`| ${d.slate_date} | ${d.final_games_in_hosted_db} | ${d.events_discovered} | ${d.resolved_exact} | ${d.resolved_tolerance} | ${queued} | ${whatIfResolved} |`);
  }
  md.push('');
  md.push('## Per-date queued reasons');
  md.push('');
  md.push('| slate | queue reason | count | what-if reason | what-if count |');
  md.push('|---|---|---:|---|---:|');
  for (const d of perDate) {
    const actualReasons = Object.keys(d.queued_by_reason);
    const whatIfReasons = Object.keys(d.what_if_queued_by_reason);
    const maxRows = Math.max(actualReasons.length, whatIfReasons.length, 1);
    for (let i = 0; i < maxRows; i += 1) {
      const ar = actualReasons[i] ?? '';
      const ac = ar === '' ? '' : String(d.queued_by_reason[ar]);
      const wr = whatIfReasons[i] ?? '';
      const wc = wr === '' ? '' : String(d.what_if_queued_by_reason[wr]);
      md.push(`| ${d.slate_date} | ${ar} | ${ac} | ${wr} | ${wc} |`);
    }
  }
  md.push('');
  md.push('## Credit ledger');
  md.push('');
  md.push('| # | at | slate | forecast | observed x-requests-last | remaining | running | budget remaining | http |');
  md.push('|---:|---|---|---:|---:|---:|---:|---:|---:|');
  ledger.forEach((e, i) => {
    md.push(`| ${i + 1} | ${e.at} | ${e.slate_date} | ${e.discovery_forecast} | ${e.observed_x_requests_last ?? 'null'} | ${e.x_requests_remaining ?? 'null'} | ${e.running_total} | ${e.budget_remaining} | ${e.status} |`);
  });
  md.push('');
  md.push('## Discovery cache');
  md.push('');
  md.push('Every 200-OK discovery response body is cached at');
  md.push('`docs/product/reports/_stage2_discovery_cache/<YYYY-MM-DD>.json` so Phase B can');
  md.push('replay without re-spending discovery credits. Cache file count: ' + perDate.filter((d) => d.discovery_status === 200).length + '.');
  md.push('');
  writeFileSync(REPORT_PATH, md.join('\n'));
  console.log(`\n# rehearsal report written to ${REPORT_PATH}`);
}

main()
  .catch((e) => {
    console.error('# rehearsal failed:', e);
    process.exitCode = 1;
  })
  .finally(() => pool.end());

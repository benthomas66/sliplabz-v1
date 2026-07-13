// V1-4b Stage 2 Phase B — seed run driver.
//
// What this does:
//   * Loads cached discovery responses (from Phase A supplement 1) —
//     zero new discovery credits.
//   * Resolves every unique discovered event via the wired path
//     (persistSeedEventResolution → writes provider_games or
//     event_reconciliation_queue rows).
//   * For every RESOLVED event, issues one historical_event_odds request
//     via the live-invoke gate, processes it via processHistoricalSnapshot,
//     and persists via persistHistoricalSnapshot (which writes the
//     historical seed lineage: oddsapi_ingestion_runs, oddsapi_raw_responses,
//     market_snapshots(historical_query, backfilled_historical),
//     market_offerings, source_closing_quotes, canonical_closing_points).
//   * Enforces the 12,000-credit ceiling with a pre-request halt check;
//     appends to a per-request quota ledger.
//   * Maintains per-slice watermarks in seed_slice_watermarks via V1-4b's
//     advanceSliceWatermark primitive.
//   * Records coverage exclusions for the queued events (unresolved event
//     mapping) at the slate/market/bookmaker slice level.
//   * Closes the seed_run_records row with the appropriate completion_state.
//   * Persistence never touches observed_line_lifecycle, movement_events,
//     current_market_rows (schema CHECKs already reject any such attempt).

import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve as pathResolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

import { buildLiveOddsapiConfig, LiveInvokeGateError } from '../src/lines/liveInvokeGate.js';
import type { OddsapiHttpConfig } from '../src/odds/httpClient.js';
import { fetchHistoricalEventOdds } from '../src/seed/httpClient.js';
import { validateHistoricalEventDiscoveryRows } from '../src/seed/historicalEventDiscovery.js';
import { processHistoricalSnapshot } from '../src/seed/historicalEventOdds.js';
import { persistHistoricalSnapshot } from '../src/seed/orchestrator/persistHistoricalSnapshot.js';
import {
  forecastHistoricalEventOddsCost,
  nextRequestWouldExceedBudget,
} from '../src/seed/quotaForecast.js';
import { openSeedRun, closeSeedRun } from '../src/seed/seedRun.js';
import {
  advanceSliceWatermark,
  type SliceWatermarkView,
  type SliceAttemptDelta,
  type SliceCoverageState,
} from '../src/seed/watermarks.js';
import {
  loadSeedResolutionContext,
  persistSeedEventResolution,
  resolveOddsapiEventForSeed,
  type SeedEventResolutionOutcome,
} from '../src/seed/orchestrator/eventResolutionForSeed.js';
import { LAUNCH_MARKET_KEYS } from '../src/odds/marketKeys.js';
import { V1_CONSENSUS_SPORTSBOOK_KEYS } from '../src/odds/bookmakerAllowlist.js';
import type { EventReconciliationInput } from '../src/identity/types.js';
import type { HistoricalEventOddsResponse, QuotaLedgerEntry } from '../src/seed/types.js';
import type { SliplabzPool } from '../src/db/connection.js';

// -- Config -----------------------------------------------------------------

const CREDIT_CEILING = 12_000;
const RUN_LABEL = 'V1-4b Stage 2 Phase B seed';
const here = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = pathResolve(here, '../docs/product/reports/_stage2_discovery_cache');
const COVERAGE_REPORT_PATH = pathResolve(here, '../docs/product/reports/V1_4B_STAGE2_SEED_COVERAGE.md');

// -- Gates ------------------------------------------------------------------

const DB_URL = process.env['SLIPLABZ_HOSTED_DATABASE_URL'];
if (DB_URL === undefined || DB_URL === '') { console.error('SLIPLABZ_HOSTED_DATABASE_URL required'); process.exit(1); }
const api_key = process.env['ODDS_API_KEY'];
const live_flag = process.env['ODDSAPI_LIVE_INVOKE'];
if (api_key === undefined || api_key === '' || live_flag !== '1') {
  console.error('ODDSAPI_LIVE_INVOKE=1 and ODDS_API_KEY are both required.'); process.exit(1);
}
let http_cfg: OddsapiHttpConfig;
try {
  http_cfg = buildLiveOddsapiConfig({ allow_live_invoke: true, env: process.env as Record<string, string | undefined> });
} catch (err) {
  if (err instanceof LiveInvokeGateError) { console.error('# HALT: live-invoke gate refused:', err.message); process.exit(1); }
  throw err;
}
// Connection architecture (per governor direction 2026-07-13):
//
//   * READ-SIDE POOL — used only for the resolve phase (loadSeedResolutionContext,
//     provider-team lookups, etc.) and short reads between events. Never held
//     across an Odds API HTTP call. `allowExitOnIdle: true` so the pool
//     evacuates cleanly at process end without keeping the event loop alive.
//
//   * PER-EVENT FRESH CLIENT for the write path. Each event's persistence
//     acquires a brand-new pg.Client just BEFORE the first persist call and
//     ends it immediately after the last. There is no idle window while the
//     ~0.5–2s Odds API HTTP call is outstanding, so Supabase's pooler cannot
//     kill a checked-out socket mid-flight.
//
//   * PER-EVENT RETRY on connection-class errors only. persistHistoricalSnapshot
//     is idempotent per (game, player, market, book) via ON CONFLICT DO
//     NOTHING on source_closing_quotes and canonical_closing_points, so retry
//     is safe by design. Never retry on constraint violations or other
//     application errors — the resume-check + slice watermark handles those
//     correctly.
const rawPool = new pg.Pool({
  connectionString: DB_URL,
  max: 2,
  idleTimeoutMillis: 10_000,
  allowExitOnIdle: true,
  keepAlive: true,
});
const pool: SliplabzPool = Object.freeze({
  raw: rawPool,
  query: (sql: string, params?: unknown[]) => (params === undefined ? rawPool.query(sql) : rawPool.query(sql, params)),
  connect: () => rawPool.connect(),
  end: () => rawPool.end(),
});

const CONNECTION_ERROR_RE = /Connection terminated|Connection lost|ECONNRESET|ECONNREFUSED|socket hang up|EAUTHTIMEOUT|57P01|Client has encountered/i;

function isConnectionClassError(e: unknown): boolean {
  const msg = (e as Error)?.message ?? '';
  const code = (e as { code?: string })?.code ?? '';
  return CONNECTION_ERROR_RE.test(msg) || code === '57P01' || code === 'ECONNRESET';
}

/**
 * Run `body` with a fresh pg.Client wrapped as a SliplabzPool. The client is
 * connected before the callback and ended in a finally block. Retries on
 * connection-class errors ONLY (up to 2 retries after the first attempt).
 */
async function withFreshClientAsPool<T>(body: (writePool: SliplabzPool) => Promise<T>): Promise<T> {
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const client = new pg.Client({
      connectionString: DB_URL,
      keepAlive: true,
      connectionTimeoutMillis: 15_000,
    });
    // Attach an error listener SPECIFICALLY on this Client. This prevents
    // any transient async socket errors from bubbling to the process, and
    // records them for retry classification.
    let clientAsyncErr: Error | null = null;
    client.on('error', (e) => { clientAsyncErr = e; });
    try {
      await client.connect();
      const writePool: SliplabzPool = Object.freeze({
        raw: rawPool, // read-only handle; write path won't use it
        query: (sql: string, params?: unknown[]) => (params === undefined ? client.query(sql) : client.query(sql, params)),
        connect: async () => client as unknown as pg.PoolClient,
        end: async () => { /* no-op — parent owns lifecycle */ },
      });
      // `client` is a plain Client; monkey-patch a no-op release so
      // withTransaction's finally { client.release() } does not throw.
      (client as unknown as { release: () => void }).release = () => {};
      const result = await body(writePool);
      if (clientAsyncErr !== null) throw clientAsyncErr;
      return result;
    } catch (e) {
      lastErr = e;
      const retriable = isConnectionClassError(e) || (clientAsyncErr !== null && isConnectionClassError(clientAsyncErr));
      if (!retriable || attempt === 2) throw e;
      const backoffMs = 300 * (attempt + 1);
      console.log(`# per-event write retry ${attempt + 1}/2 after connection error (${(e as Error).message}); backoff ${backoffMs}ms`);
      await new Promise((res) => setTimeout(res, backoffMs));
    } finally {
      try { await client.end(); } catch { /* ignore */ }
    }
  }
  throw lastErr ?? new Error('withFreshClientAsPool: unreachable');
}

// -- Types ------------------------------------------------------------------

interface CachedDiscovery { slate_date: string; body: { data?: unknown[] } }
interface CachedEvent { id: string; home_team: string; away_team: string; commence_time: string }

interface ResolvedEventPlan {
  provider_event_id: string;
  home_team: string;
  away_team: string;
  commence_time: string;
  slate_date: string;
  linked_internal_game_id: string;
  match_method: 'exact_time' | 'time_tolerance';
  time_delta_seconds: number;
}
interface QueuedEventRecord {
  provider_event_id: string;
  home_team: string;
  away_team: string;
  commence_time: string;
  slate_date: string;
  reason: string;
  reason_detail: string;
}

// -- Registries --------------------------------------------------------------

async function ensureRegistries(): Promise<void> {
  // bookmaker_registry: sportsbooks + source_class=sportsbook.
  for (const k of V1_CONSENSUS_SPORTSBOOK_KEYS) {
    await pool.query(
      `INSERT INTO bookmaker_registry (provider_key, display_title, source_class, approved_by)
       VALUES ($1, $1, 'sportsbook', 'v1_4b_phase_b_seed')
       ON CONFLICT DO NOTHING`,
      [k]
    );
  }
  // market_registry: four launch markets.
  const canonical: Record<string, string> = {
    player_points: 'pts',
    player_rebounds: 'reb',
    player_assists: 'ast',
    player_threes: 'fg3m',
  };
  for (const mk of LAUNCH_MARKET_KEYS) {
    await pool.query(
      `INSERT INTO market_registry (provider_key, display_title, is_launch_market, canonical_stat_key, approved_by)
       VALUES ($1, $1, true, $2, 'v1_4b_phase_b_seed')
       ON CONFLICT DO NOTHING`,
      [mk, canonical[mk] ?? 'pts']
    );
  }
}

// -- Player map ---------------------------------------------------------------

/** Build a map of normalized_name → internal_player_id for ALL BDL-mapped
 *  players. The persist path calls its own internal `normalizeName`, and this
 *  loader mirrors that normalization so the map lookups agree. */
function normalizeName(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[’'‘′\-‐‑‒–—_.,]+/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
async function loadAllPlayerNormMap(): Promise<Map<string, string>> {
  const r = await pool.query(`SELECT internal_player_id, normalized_name, display_name FROM players`);
  const m = new Map<string, string>();
  for (const row of r.rows as Array<{ internal_player_id: string; normalized_name: string; display_name: string }>) {
    // Prefer the persist-path normalizer on display_name so lookups agree
    // exactly with what persistHistoricalSnapshot computes internally.
    m.set(normalizeName(row.display_name), row.internal_player_id);
    // Also index by the stored normalized_name (V1-1 normalization) as a
    // second-chance key.
    if (row.normalized_name !== '') m.set(row.normalized_name, row.internal_player_id);
  }
  return m;
}

// -- Cache loading ----------------------------------------------------------

function loadUniqueEvents(): Array<{ first_seen_on_slate: string; event: CachedEvent }> {
  const files = readdirSync(CACHE_DIR).filter((f) => f.endsWith('.json')).sort();
  const byId = new Map<string, { first_seen_on_slate: string; event: CachedEvent }>();
  for (const f of files) {
    const raw = readFileSync(pathResolve(CACHE_DIR, f), 'utf-8');
    const d = JSON.parse(raw) as CachedDiscovery & { slate_date: string };
    for (const e of (d.body.data ?? []) as CachedEvent[]) {
      if (typeof e?.id !== 'string' || typeof e?.home_team !== 'string' || typeof e?.away_team !== 'string' || typeof e?.commence_time !== 'string') continue;
      if (!byId.has(e.id)) byId.set(e.id, { first_seen_on_slate: d.slate_date, event: e });
    }
  }
  return Array.from(byId.values());
}

function slateDateOfCommence(commence: string): string { return commence.slice(0, 10); }

// -- Resolution phase (writes provider_games or event_reconciliation_queue) --

async function resolveAllEvents(events: Array<{ event: CachedEvent }>): Promise<{
  resolved: ResolvedEventPlan[];
  queued: QueuedEventRecord[];
}> {
  const resolved: ResolvedEventPlan[] = [];
  const queued: QueuedEventRecord[] = [];
  for (const { event: ev } of events) {
    const ctx = await loadSeedResolutionContext(pool, { provider: 'odds_api', raw_commence_time_utc: ev.commence_time });
    const input: EventReconciliationInput = {
      provider: 'odds_api',
      provider_game_id: ev.id,
      raw_home_team: ev.home_team,
      raw_away_team: ev.away_team,
      raw_commence_time: ev.commence_time,
    };
    const outcome: SeedEventResolutionOutcome = resolveOddsapiEventForSeed(input, ctx);
    await persistSeedEventResolution(pool, input, outcome);
    const slate_date = slateDateOfCommence(ev.commence_time);
    if (outcome.kind === 'resolved_exact' || outcome.kind === 'resolved_tolerance') {
      resolved.push({
        provider_event_id: ev.id,
        home_team: ev.home_team,
        away_team: ev.away_team,
        commence_time: ev.commence_time,
        slate_date,
        linked_internal_game_id: outcome.internal_game_id,
        match_method: outcome.kind === 'resolved_exact' ? 'exact_time' : 'time_tolerance',
        time_delta_seconds: outcome.time_delta_seconds,
      });
    } else {
      queued.push({
        provider_event_id: ev.id,
        home_team: ev.home_team,
        away_team: ev.away_team,
        commence_time: ev.commence_time,
        slate_date,
        reason: outcome.reason,
        reason_detail: outcome.reason_detail,
      });
    }
  }
  return { resolved, queued };
}

// -- Per-request wrapper ----------------------------------------------------

interface SliceCounters {
  events_attempted: number;
  events_admitted: number;
  events_stale_rejected: number;
  events_no_snapshot: number;
}

async function main(): Promise<void> {
  console.log('# V1-4b Stage 2 Phase B seed starting');
  console.log(`#   hosted DB: ${DB_URL!.replace(/:[^:@]+@/, ':REDACTED@')}`);
  console.log(`#   credit ceiling: ${CREDIT_CEILING}`);
  console.log(`#   run label: ${RUN_LABEL}`);

  await ensureRegistries();
  const playerMap = await loadAllPlayerNormMap();
  console.log(`# players map (norm→internal): ${playerMap.size} entries`);

  const events = loadUniqueEvents();
  console.log(`# unique events from cache: ${events.length}`);

  // -- B1: resolve + forecast --
  console.log('\n===== B1: resolve every event + forecast credits =====');
  const { resolved, queued } = await resolveAllEvents(events);
  console.log(`# resolved: ${resolved.length} events; queued: ${queued.length} events`);

  const per_event_forecast = forecastHistoricalEventOddsCost({
    requested_market_count: LAUNCH_MARKET_KEYS.length,
    requested_bookmaker_count: V1_CONSENSUS_SPORTSBOOK_KEYS.length,
  });
  const total_event_odds_forecast = resolved.length * per_event_forecast;
  console.log(`# per-event forecast: ${per_event_forecast} credits`);
  console.log(`# total event-odds forecast: ${resolved.length} × ${per_event_forecast} = ${total_event_odds_forecast}`);
  console.log(`# discovery credits: 0 (using cached responses)`);
  console.log(`# ceiling: ${CREDIT_CEILING}; ${total_event_odds_forecast <= CREDIT_CEILING ? 'UNDER by ' + (CREDIT_CEILING - total_event_odds_forecast) : 'OVER by ' + (total_event_odds_forecast - CREDIT_CEILING)}`);
  if (total_event_odds_forecast > CREDIT_CEILING) {
    console.log('# HALT: forecast exceeds ceiling. No event-odds requests issued.');
    process.exitCode = 2;
    return;
  }

  // -- Seed run open --
  const seed_run_id = randomUUID();
  const started_at = new Date().toISOString();
  const attempted_slate_dates = Array.from(new Set(resolved.map((r) => r.slate_date).concat(queued.map((q) => q.slate_date)))).sort();
  await pool.query(
    `INSERT INTO seed_run_records
       (seed_run_id, run_kind, label, started_at, credit_budget,
        requested_market_keys, requested_bookmaker_keys, attempted_slate_dates,
        completion_state, operator_note)
     VALUES ($1,'seed',$2,$3,$4,$5::jsonb,$6::jsonb,$7::jsonb,'running',$8)`,
    [
      seed_run_id,
      RUN_LABEL,
      started_at,
      CREDIT_CEILING,
      JSON.stringify(LAUNCH_MARKET_KEYS),
      JSON.stringify(V1_CONSENSUS_SPORTSBOOK_KEYS),
      JSON.stringify(attempted_slate_dates),
      `resolved=${resolved.length}; queued=${queued.length}; ceiling=${CREDIT_CEILING}`,
    ]
  );
  const openRun = openSeedRun({
    seed_run_id,
    scope: {
      run_kind: 'stage1_probe' as const, // reused type; DB row records 'seed'
      label: RUN_LABEL,
      credit_budget: CREDIT_CEILING,
      requested_market_keys: LAUNCH_MARKET_KEYS,
      requested_bookmaker_keys: V1_CONSENSUS_SPORTSBOOK_KEYS,
      attempted_slate_dates,
    },
    started_at,
  });

  // -- B2: per-event historical_event_odds --
  console.log('\n===== B2: execute event-odds requests =====');
  const ledger: QuotaLedgerEntry[] = [];
  let credits_observed_total = 0;
  let events_admitted = 0;
  let events_stale_rejected = 0;
  let events_no_snapshot = 0;
  let aborted_reason: string | null = null;
  const perSliceCounters = new Map<string, SliceCounters>(); // key: slate|market|book
  const sliceKey = (d: string, m: string, b: string) => `${d}|${m}|${b}`;
  const bumpSlice = (d: string, m: string, b: string, k: keyof SliceCounters) => {
    const key = sliceKey(d, m, b);
    const c = perSliceCounters.get(key) ?? { events_attempted: 0, events_admitted: 0, events_stale_rejected: 0, events_no_snapshot: 0 };
    c[k] += 1;
    perSliceCounters.set(key, c);
  };

  // Resume support: any event whose provider_event_id already has a
  // historical_query market_snapshot row has been seeded by a prior
  // partially-completed run. Fold those counts in and skip them.
  const alreadySeeded = new Set<string>();
  {
    const r = await pool.query(
      `SELECT DISTINCT provider_event_id FROM market_snapshots WHERE request_kind='historical_query'`
    );
    for (const row of r.rows as Array<{ provider_event_id: string }>) alreadySeeded.add(row.provider_event_id);
  }
  console.log(`# resume: ${alreadySeeded.size} event(s) already seeded (prior run(s)); will skip them`);
  // Include already-seeded events in this run's slice-attempt counters so
  // the watermark reflects their coverage as well.
  for (const r of resolved) {
    if (alreadySeeded.has(r.provider_event_id)) {
      events_admitted += 1;
      for (const mk of LAUNCH_MARKET_KEYS) for (const bk of V1_CONSENSUS_SPORTSBOOK_KEYS) {
        bumpSlice(r.slate_date, mk, bk, 'events_attempted');
        // events_admitted at slice grain requires knowing per-(evt,mk,bk)
        // admittance. Query at slice grain from source_closing_quotes for
        // idempotency.
      }
    }
  }
  // Backfill per-slice events_admitted for already-seeded events by
  // asking the DB which (game, market, book) triples have at least one
  // source_closing_quote from those events.
  if (alreadySeeded.size > 0) {
    const gameIds = resolved
      .filter((r) => alreadySeeded.has(r.provider_event_id))
      .map((r) => r.linked_internal_game_id);
    if (gameIds.length > 0) {
      const rows = await pool.query(
        `SELECT DISTINCT g.internal_game_id, scq.market_key, scq.bookmaker_key
           FROM source_closing_quotes scq
           JOIN games g ON g.internal_game_id = scq.internal_game_id
           WHERE g.internal_game_id = ANY($1::uuid[])`,
        [gameIds]
      );
      const byGame = new Map<string, string>();
      for (const r of resolved) if (alreadySeeded.has(r.provider_event_id)) byGame.set(r.linked_internal_game_id, r.slate_date);
      for (const row of rows.rows as Array<{ internal_game_id: string; market_key: string; bookmaker_key: string }>) {
        const slate = byGame.get(row.internal_game_id);
        if (slate === undefined) continue;
        bumpSlice(slate, row.market_key, row.bookmaker_key, 'events_admitted');
      }
    }
  }

  for (let i = 0; i < resolved.length; i += 1) {
    const r = resolved[i]!;
    if (alreadySeeded.has(r.provider_event_id)) continue; // skipped-and-counted above
    // Pre-request budget guard.
    if (nextRequestWouldExceedBudget({
      credit_budget: CREDIT_CEILING,
      credits_observed_total,
      next_forecast: per_event_forecast,
    })) {
      aborted_reason = `budget would be exceeded at event ${i + 1}/${resolved.length} (running ${credits_observed_total}, forecast ${per_event_forecast}, budget ${CREDIT_CEILING})`;
      console.log(`# HALT: ${aborted_reason}`);
      break;
    }
    // Fetch historical event-odds — with one retry on transport-like errors
    // (AbortError, ECONNRESET, socket hangups, 429/500/502/503).
    let odds: Awaited<ReturnType<typeof fetchHistoricalEventOdds>> | null = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        odds = await fetchHistoricalEventOdds(http_cfg, {
          api_key: api_key!,
          at_timestamp: r.commence_time,
          provider_event_id: r.provider_event_id,
          market_keys: LAUNCH_MARKET_KEYS,
          bookmaker_keys: V1_CONSENSUS_SPORTSBOOK_KEYS,
        });
        break;
      } catch (e) {
        const msg = (e as Error).message ?? '';
        const transient = /abort|econnreset|econnrefused|socket hang up|network|timeout/i.test(msg);
        if (!transient || attempt === 1) {
          console.log(`# evt ${i + 1}/${resolved.length} fetch error (${attempt === 1 ? 'final' : 'first'}): ${msg}`);
        }
        if (attempt === 1 || !transient) {
          odds = null;
          break;
        }
        await new Promise((res) => setTimeout(res, 500));
      }
    }
    if (odds === null) {
      events_no_snapshot += 1;
      for (const mk of LAUNCH_MARKET_KEYS) for (const bk of V1_CONSENSUS_SPORTSBOOK_KEYS) {
        bumpSlice(r.slate_date, mk, bk, 'events_attempted');
        bumpSlice(r.slate_date, mk, bk, 'events_no_snapshot');
      }
      continue;
    }
    const observed_last = typeof odds.headers['x-requests-last'] === 'number' ? (odds.headers['x-requests-last'] as number) : null;
    credits_observed_total += observed_last ?? 0;
    ledger.push(Object.freeze({
      at: new Date().toISOString(),
      endpoint: 'historical_event_odds',
      forecast: per_event_forecast,
      observed_x_requests_last: observed_last,
      x_requests_remaining: typeof odds.headers['x-requests-remaining'] === 'number' ? (odds.headers['x-requests-remaining'] as number) : null,
      x_requests_used: typeof odds.headers['x-requests-used'] === 'number' ? (odds.headers['x-requests-used'] as number) : null,
      running_total: credits_observed_total,
      budget_remaining: CREDIT_CEILING - credits_observed_total,
    }));

    // Every event attempted counts once per (market, book) slice at this date.
    for (const mk of LAUNCH_MARKET_KEYS) for (const bk of V1_CONSENSUS_SPORTSBOOK_KEYS) {
      bumpSlice(r.slate_date, mk, bk, 'events_attempted');
    }

    if (odds.status !== 200 || odds.body_json === null) {
      events_no_snapshot += 1;
      for (const mk of LAUNCH_MARKET_KEYS) for (const bk of V1_CONSENSUS_SPORTSBOOK_KEYS) {
        bumpSlice(r.slate_date, mk, bk, 'events_no_snapshot');
      }
      console.log(`# evt ${i + 1}/${resolved.length} id=${r.provider_event_id.slice(0, 8)} HTTP ${odds.status} → no_snapshot`);
      continue;
    }
    // Process the snapshot into candidates.
    const processed = processHistoricalSnapshot({
      requested_close_boundary_utc: r.commence_time,
      response: odds.body_json as HistoricalEventOddsResponse,
    });
    if (processed.close_capture.close_capture_state === 'no_snapshot') {
      events_no_snapshot += 1;
      for (const mk of LAUNCH_MARKET_KEYS) for (const bk of V1_CONSENSUS_SPORTSBOOK_KEYS) {
        bumpSlice(r.slate_date, mk, bk, 'events_no_snapshot');
      }
      continue;
    }
    if (processed.close_capture.close_capture_state === 'close_capture_stale') {
      events_stale_rejected += 1;
      for (const mk of LAUNCH_MARKET_KEYS) for (const bk of V1_CONSENSUS_SPORTSBOOK_KEYS) {
        bumpSlice(r.slate_date, mk, bk, 'events_stale_rejected');
      }
      continue;
    }

    // Build the per-event player subset map from candidates.
    const playerSubset = new Map<string, string>();
    for (const c of processed.candidates) {
      const norm = normalizeName(c.detail.replace(/^player=/, ''));
      const pid = playerMap.get(norm);
      if (pid !== undefined) playerSubset.set(norm, pid);
    }

    // Group candidates by (bookmaker_key, market_key) so each
    // persistHistoricalSnapshot call writes one snapshot row per (evt, bm, mk).
    const groups = new Map<string, typeof processed.candidates[number][]>();
    for (const c of processed.candidates) {
      const k = `${c.bookmaker_key}|${c.market_key}`;
      const arr = groups.get(k) ?? [];
      arr.push(c); groups.set(k, arr);
    }
    // Per-governor architecture: acquire a fresh Client for THIS event's
    // persistence, run all groups against it, then end it. No idle window
    // spans the Odds API HTTP call (which already completed above).
    let any_admitted_this_event = false;
    try {
      await withFreshClientAsPool(async (writePool) => {
        for (const [key, cs] of groups) {
          const [bkey, mkey] = key.split('|') as [string, string];
          try {
            const result = await persistHistoricalSnapshot(writePool, {
              seed_run_id,
              provider_event_id: r.provider_event_id,
              linked_internal_game_id: r.linked_internal_game_id,
              linked_internal_player_ids_by_normalized_name: playerSubset,
              market_key: mkey,
              bookmaker_key: bkey,
              bookmaker_title: bkey,
              requested_close_boundary_utc: r.commence_time,
              provider_snapshot_time: (odds.body_json as HistoricalEventOddsResponse).timestamp ?? null,
              retrieved_at: new Date().toISOString(),
              close_capture: processed.close_capture,
              redacted_request_url: `https://api.the-odds-api.com/v4/historical/sports/basketball_wnba/events/${r.provider_event_id}/odds?apiKey=REDACTED&date=${r.commence_time}`,
              request_params: {
                date: r.commence_time,
                markets: [mkey],
                bookmakers: [bkey],
                oddsFormat: 'american',
              },
              response_headers: odds.headers,
              raw_response_body: odds.body_json,
              raw_response_body_text: null,
              candidates: cs,
              persist_canonical_when_possible: true,
            });
            if (result.source_closing_quote_ids.length > 0) {
              any_admitted_this_event = true;
              bumpSlice(r.slate_date, mkey, bkey, 'events_admitted');
            }
          } catch (e) {
            // A per-(bm, mk) constraint-class error should not derail the
            // rest of the groups for this event. Re-throw connection-class
            // errors so the outer withFreshClientAsPool retry can handle
            // them across a fresh client.
            if (isConnectionClassError(e)) throw e;
            console.log(`# persist error evt=${r.provider_event_id.slice(0, 8)} ${bkey}/${mkey}: ${(e as Error).message}`);
          }
        }
      });
    } catch (e) {
      // All three attempts failed. Log and mark as no_snapshot for this
      // event so the slice watermarks stay honest.
      console.log(`# ABANDON evt=${r.provider_event_id.slice(0, 8)} after 3 write attempts: ${(e as Error).message}`);
      events_no_snapshot += 1;
      for (const mk of LAUNCH_MARKET_KEYS) for (const bk of V1_CONSENSUS_SPORTSBOOK_KEYS) {
        bumpSlice(r.slate_date, mk, bk, 'events_no_snapshot');
      }
      continue;
    }
    if (any_admitted_this_event) events_admitted += 1;
    if ((i + 1) % 25 === 0 || i === resolved.length - 1) {
      console.log(`# progress ${i + 1}/${resolved.length} credits=${credits_observed_total}/${CREDIT_CEILING} admitted=${events_admitted}`);
    }
  }

  // -- Seed run close --
  const completed_at = new Date().toISOString();
  const completion_state = aborted_reason !== null ? 'aborted_credit_budget' : 'complete';
  await pool.query(
    `UPDATE seed_run_records SET
       completed_at=$2, completion_state=$3, failure_detail=$4,
       credits_observed_total=$5, events_probed=$6, events_admitted=$7,
       events_stale_rejected=$8, events_no_snapshot=$9, updated_at=now()
     WHERE seed_run_id=$1`,
    [
      seed_run_id, completed_at, completion_state, aborted_reason,
      credits_observed_total, resolved.length, events_admitted,
      events_stale_rejected, events_no_snapshot,
    ]
  );
  const closedRun = closeSeedRun({
    open: openRun, completed_at,
    completion_state: completion_state as any,
    failure_detail: aborted_reason,
    credits_observed_total,
    events_probed: resolved.length,
    events_admitted, events_stale_rejected, events_no_snapshot,
  });

  console.log(`\n# seed run closed: completion_state=${completion_state}; ` +
    `admitted=${events_admitted}/${resolved.length} events; ` +
    `credits=${credits_observed_total}/${CREDIT_CEILING}; ` +
    `queued=${queued.length} events routed to event_reconciliation_queue.`);

  // -- Advance per-slice watermarks --
  console.log('\n===== advance per-slice watermarks =====');
  for (const [key, c] of perSliceCounters) {
    const [d, mk, bk] = key.split('|') as [string, string, string];
    const proposedState: SliceCoverageState =
      completion_state === 'complete'
        ? (c.events_admitted > 0 ? 'complete' : (c.events_attempted > 0 ? 'complete' : 'no_coverage_available'))
        : 'partial_in_progress';
    const delta: SliceAttemptDelta = {
      slate_date: d, market_key: mk, bookmaker_key: bk,
      events_attempted: c.events_attempted,
      events_admitted: c.events_admitted,
      events_stale_rejected: c.events_stale_rejected,
      events_no_snapshot: c.events_no_snapshot,
      resume_cursor: {},
      attempted_at: completed_at,
      proposed_state: proposedState,
    };
    // Load existing prior (if any).
    const existing = await pool.query(
      `SELECT slate_date, market_key, bookmaker_key, slice_coverage_state,
              events_attempted, events_admitted, events_stale_rejected,
              events_no_snapshot, resume_cursor, first_attempted_at,
              last_attempted_at, completed_at, completed_by_run_id
         FROM seed_slice_watermarks
         WHERE slate_date = $1::date AND market_key = $2 AND bookmaker_key = $3`,
      [d, mk, bk]
    );
    let prior: SliceWatermarkView | null = null;
    if ((existing.rowCount ?? 0) > 0) {
      const row = existing.rows[0] as any;
      prior = {
        slate_date: (row.slate_date instanceof Date ? row.slate_date.toISOString().slice(0, 10) : row.slate_date),
        market_key: row.market_key,
        bookmaker_key: row.bookmaker_key,
        slice_coverage_state: row.slice_coverage_state,
        events_attempted: row.events_attempted,
        events_admitted: row.events_admitted,
        events_stale_rejected: row.events_stale_rejected,
        events_no_snapshot: row.events_no_snapshot,
        resume_cursor: row.resume_cursor ?? {},
        first_attempted_at: row.first_attempted_at instanceof Date ? row.first_attempted_at.toISOString() : row.first_attempted_at,
        last_attempted_at: row.last_attempted_at instanceof Date ? row.last_attempted_at.toISOString() : row.last_attempted_at,
        completed_at: row.completed_at instanceof Date ? row.completed_at.toISOString() : row.completed_at,
        completed_by_run_id: row.completed_by_run_id,
      };
    }
    const result = advanceSliceWatermark(prior, delta, closedRun);
    const next = result.next;
    if (prior === null) {
      await pool.query(
        `INSERT INTO seed_slice_watermarks
           (slate_date, market_key, bookmaker_key, slice_coverage_state,
            events_attempted, events_admitted, events_stale_rejected,
            events_no_snapshot, resume_cursor, first_attempted_at,
            last_attempted_at, completed_at, completed_by_run_id)
         VALUES ($1::date,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,$13)`,
        [
          d, mk, bk, next.slice_coverage_state,
          next.events_attempted, next.events_admitted,
          next.events_stale_rejected, next.events_no_snapshot,
          JSON.stringify(next.resume_cursor),
          next.first_attempted_at, next.last_attempted_at,
          next.completed_at, next.completed_by_run_id,
        ]
      );
    } else {
      await pool.query(
        `UPDATE seed_slice_watermarks SET
           slice_coverage_state=$4,
           events_attempted=$5, events_admitted=$6,
           events_stale_rejected=$7, events_no_snapshot=$8,
           resume_cursor=$9::jsonb,
           first_attempted_at=$10,
           last_attempted_at=$11,
           completed_at=$12,
           completed_by_run_id=$13,
           updated_at=now()
         WHERE slate_date=$1::date AND market_key=$2 AND bookmaker_key=$3`,
        [
          d, mk, bk, next.slice_coverage_state,
          next.events_attempted, next.events_admitted,
          next.events_stale_rejected, next.events_no_snapshot,
          JSON.stringify(next.resume_cursor),
          next.first_attempted_at, next.last_attempted_at,
          next.completed_at, next.completed_by_run_id,
        ]
      );
    }
  }
  console.log(`# advanced ${perSliceCounters.size} slice watermarks`);

  // -- Emit coverage report + ledger to disk for B4 --
  const summary = {
    seed_run_id, completion_state, credits_observed_total,
    events_resolved: resolved.length, events_admitted,
    events_stale_rejected, events_no_snapshot,
    events_queued: queued.length,
    per_slice_count: perSliceCounters.size,
    ledger_entries: ledger.length,
  };
  console.log('\n===== SUMMARY =====');
  console.log(JSON.stringify(summary, null, 2));

  // Emit a temporary machine-readable seed-state file used by the coverage
  // report generator (B4). Kept next to the report so the generator runs
  // deterministically from disk.
  mkdirSync(dirname(COVERAGE_REPORT_PATH), { recursive: true });
  writeFileSync(
    pathResolve(COVERAGE_REPORT_PATH, '..', '_stage2_seed_state.json'),
    JSON.stringify({
      seed_run_id, completion_state, started_at, completed_at,
      credit_ceiling: CREDIT_CEILING, credits_observed_total,
      resolved_events: resolved,
      queued_events: queued,
      ledger,
      per_slice_counters: Array.from(perSliceCounters.entries()).map(([k, v]) => ({ key: k, ...v })),
      events_admitted, events_stale_rejected, events_no_snapshot,
      aborted_reason,
    }, null, 2)
  );
}

main()
  .catch((e) => { console.error('# seed failed:', e); process.exitCode = 1; })
  .finally(() => pool.end());

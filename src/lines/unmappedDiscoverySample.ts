// V1-OP-8b §0.4 — bounded unmapped-tail discovery sample.
//
// Classifies the unmapped backlog into the three governed populations by
// issuing ONE historical events-discovery call per date (1 credit each). It
// answers the question the founder most wants: how much of the backlog is
// permanently unrecoverable, and how much of THAT sits inside the recent-N
// window — i.e. whether repair alone can ever clear the gate.
//
// DISCOVERY-ONLY BY CONSTRUCTION. This module imports `fetchHistoricalEvents`
// (`/v4/historical/sports/{sport}/events`, 1cr) and does NOT import
// `fetchHistoricalEventOdds` (`/events/{id}/odds`, 40cr). The 40cr seam is
// therefore unreachable from here — not merely unused. Asserted by test.
//
// REPORT-ONLY on classification. It writes NO `provider_games` mapping, even
// for a confident (b) match: `seed/orchestrator/eventResolutionForSeed.ts` is
// the committed owner of odds_api mapping creation and carries the governed
// approval path (resolved -> approved mapping; ambiguous -> the
// event_reconciliation_queue). A matcher here must not bypass that. The (b)
// games each still need a separate ~40cr retrieval, at which point the mapping
// is created through the governed path. The ONLY write this sample makes is
// the per-call billing ledger row, so spend stays DB-reconcilable (the
// GAP-38/GAP-40 discipline, extended to discovery).

import { fetchHistoricalEvents } from '../seed/httpClient.js';
import { forecastHistoricalEventDiscoveryCost, reconcileQuota } from '../odds/quotaForecast.js';
import { normalizeName } from '../identity/nameNormalization.js';
import type { OddsapiHttpConfig } from '../odds/httpClient.js';

/** The three governed populations (V1-OP-8b §0.4). */
export type Population = 'b_discovery_recoverable' | 'c_unrecoverable';

/** One unmapped game awaiting classification. */
export interface UnmappedGame {
  readonly internal_game_id: string;
  /** UTC date of the scheduled tip, `YYYY-MM-DD` — the discovery key. */
  readonly slate_date: string;
  readonly home_abbr: string | null;
  readonly away_abbr: string | null;
  readonly home_name: string | null;
  readonly away_name: string | null;
  /** Whether the game sits inside the gate's recent-N window. */
  readonly in_recent_n: boolean;
}

/** A discovered provider event, as returned by the discovery endpoint. */
export interface DiscoveredEvent {
  readonly id: string;
  readonly commence_time?: string;
  readonly home_team?: string;
  readonly away_team?: string;
}

export interface GameClassification {
  readonly internal_game_id: string;
  readonly slate_date: string;
  readonly matchup: string;
  readonly in_recent_n: boolean;
  readonly population: Population;
  /** Set only for (b): the deterministically matched provider event. */
  readonly matched_event_id: string | null;
  readonly detail: string;
}

/**
 * PURE. Match one unmapped game against the events discovered for its date.
 *
 * A match requires BOTH team names to resolve, so a single-side or ambiguous
 * hit is NOT promoted — it stays (c). Deliberately conservative: over-calling
 * (b) would inflate the budget with games that then fail at retrieval, and the
 * whole point of the sample is an honest floor.
 */
export function classifyGame(
  game: UnmappedGame,
  events: ReadonlyArray<DiscoveredEvent>,
): GameClassification {
  const matchup = `${game.away_abbr ?? '?'}@${game.home_abbr ?? '?'}`;
  const base = {
    internal_game_id: game.internal_game_id,
    slate_date: game.slate_date,
    matchup,
    in_recent_n: game.in_recent_n,
  };
  const unrecoverable = (detail: string): GameClassification =>
    Object.freeze({ ...base, population: 'c_unrecoverable' as const, matched_event_id: null, detail });

  // A game with no resolvable team identity can never be matched by name.
  if (game.home_name === null || game.away_name === null) {
    return unrecoverable('no internal team identity — cannot match by name');
  }
  const wantHome = normalizeName(game.home_name);
  const wantAway = normalizeName(game.away_name);

  const hits = events.filter((e) => {
    if (e.home_team === undefined || e.away_team === undefined) return false;
    return normalizeName(e.home_team) === wantHome && normalizeName(e.away_team) === wantAway;
  });

  if (hits.length === 1) {
    return Object.freeze({
      ...base,
      population: 'b_discovery_recoverable' as const,
      matched_event_id: hits[0]!.id,
      detail: 'exact_match on both teams',
    });
  }
  if (hits.length > 1) return unrecoverable(`ambiguous — ${hits.length} events match both teams`);
  return unrecoverable('no_match on this date');
}

export interface SampleTotals {
  readonly games_attempted: number;
  readonly n_b: number;
  readonly n_c: number;
  readonly recovery_rate: number;
  /** THE headline number: unrecoverable games inside the gate's window. */
  readonly c_within_recent_n: number;
  readonly dates_called: number;
  readonly credits_forecast: number;
  readonly credits_observed: number;
}

/** PURE. Roll classifications up, including the suppression floor. */
export function summarize(
  rows: ReadonlyArray<GameClassification>,
  dates_called: number,
  credits_observed: number,
): SampleTotals {
  const n_b = rows.filter((r) => r.population === 'b_discovery_recoverable').length;
  const n_c = rows.filter((r) => r.population === 'c_unrecoverable').length;
  return Object.freeze({
    games_attempted: rows.length,
    n_b,
    n_c,
    recovery_rate: rows.length === 0 ? 0 : n_b / rows.length,
    c_within_recent_n: rows.filter((r) => r.population === 'c_unrecoverable' && r.in_recent_n).length,
    dates_called,
    credits_forecast: dates_called * forecastHistoricalEventDiscoveryCost(),
    credits_observed,
  });
}

/** Per-date billing, recorded so spend is reconstructable from the DB. */
export interface DiscoveryLedgerRow {
  readonly slate_date: string;
  readonly forecast: number;
  readonly observed: number | null;
  readonly delta_flag: string;
  readonly x_requests_last: number | null;
  readonly x_requests_remaining: number | null;
  readonly x_requests_used: number | null;
  readonly cumulative_sample_spend: number;
}

/** Request/response evidence handed to the ledger writer. */
export interface DiscoveryCallContext {
  readonly at_timestamp: string;
  readonly redacted_request_url: string;
  readonly response_headers: Readonly<Record<string, unknown>>;
  readonly retrieved_at: string;
}

export interface DiscoveryDeps {
  readonly oddsapi_config: OddsapiHttpConfig;
  readonly api_key: string;
  /** Injected so tests drive the real path with fixtures and zero HTTP. */
  readonly fetchEvents?: typeof fetchHistoricalEvents;
  /**
   * Persists the per-call billing ledger row. The sample's ONLY write.
   * `ctx` carries the request/response evidence the ledger row needs; keeping
   * the SQL out of this module is what makes the report-only property testable.
   */
  readonly recordLedger?: (row: DiscoveryLedgerRow, ctx: DiscoveryCallContext) => Promise<void>;
  readonly on_date?: (slate_date: string, events: number, row: DiscoveryLedgerRow) => void;
}

export interface SampleReport {
  readonly dry_run: boolean;
  readonly rows: ReadonlyArray<GameClassification>;
  readonly totals: SampleTotals;
  readonly ledger: ReadonlyArray<DiscoveryLedgerRow>;
  readonly halt_reason: string | null;
}

/**
 * Run the bounded sample over an EXPLICIT frozen plan.
 *
 *   * `dry_run` issues NO call and spends nothing.
 *   * The ceiling is checked BEFORE each date's call (halt-before-ceiling).
 *   * No blind retry: a failed date is recorded and the run stops.
 */
export async function runDiscoverySample(
  deps: DiscoveryDeps,
  opts: {
    /** Frozen plan: date -> the unmapped games on that date. */
    readonly plan: ReadonlyMap<string, ReadonlyArray<UnmappedGame>>;
    readonly max_total_credits: number;
    readonly dry_run: boolean;
  },
): Promise<SampleReport> {
  const dates = [...opts.plan.keys()].sort();
  if (dates.length === 0) {
    return Object.freeze({
      dry_run: opts.dry_run, rows: Object.freeze([]),
      totals: summarize([], 0, 0), ledger: Object.freeze([]),
      halt_reason: 'empty_plan: an explicit frozen date plan is required; never an implicit scan',
    });
  }

  const doFetch = deps.fetchEvents ?? fetchHistoricalEvents;
  const rows: GameClassification[] = [];
  const ledger: DiscoveryLedgerRow[] = [];
  let cumulative = 0;
  let halt_reason: string | null = null;

  for (const slate_date of dates) {
    const games = opts.plan.get(slate_date) ?? [];

    if (opts.dry_run) {
      for (const g of games) {
        rows.push(Object.freeze({
          internal_game_id: g.internal_game_id, slate_date, matchup: `${g.away_abbr ?? '?'}@${g.home_abbr ?? '?'}`,
          in_recent_n: g.in_recent_n, population: 'c_unrecoverable' as const, matched_event_id: null,
          detail: 'dry-run: no discovery call issued',
        }));
      }
      continue;
    }

    const forecast = forecastHistoricalEventDiscoveryCost();
    if (cumulative + forecast > opts.max_total_credits) {
      halt_reason = `ceiling: projected ${cumulative + forecast} would exceed ${opts.max_total_credits}; halted before the call`;
      break;
    }

    // THE PAID CALL — discovery only, 1 credit.
    const at_timestamp = `${slate_date}T23:59:59Z`;
    const retrieved_at = new Date().toISOString();
    const res = await doFetch(deps.oddsapi_config, {
      api_key: deps.api_key,
      at_timestamp,
    });
    if (res.status !== 200 || res.body_json === null) {
      halt_reason = `discovery failed for ${slate_date} (status=${res.status}); no retry attempted`;
      break;
    }

    const num = (k: string): number | null => {
      const v = res.headers[k];
      const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
      return Number.isFinite(n) ? n : null;
    };
    const x_requests_last = num('x-requests-last');
    const rq = reconcileQuota({ forecast, observed_x_requests_last: x_requests_last });
    cumulative += x_requests_last ?? forecast;
    const row: DiscoveryLedgerRow = Object.freeze({
      slate_date, forecast, observed: rq.observed, delta_flag: rq.delta_flag,
      x_requests_last, x_requests_remaining: num('x-requests-remaining'),
      x_requests_used: num('x-requests-used'), cumulative_sample_spend: cumulative,
    });
    ledger.push(row);
    await deps.recordLedger?.(row, {
      at_timestamp,
      redacted_request_url: res.redacted_request_url,
      response_headers: res.headers,
      retrieved_at,
    });

    const body = res.body_json as { data?: ReadonlyArray<DiscoveredEvent> } & ReadonlyArray<DiscoveredEvent>;
    const events: ReadonlyArray<DiscoveredEvent> = Array.isArray(body) ? body : (body.data ?? []);
    deps.on_date?.(slate_date, events.length, row);
    for (const g of games) rows.push(classifyGame(g, events));
  }

  return Object.freeze({
    dry_run: opts.dry_run,
    rows: Object.freeze(rows),
    totals: summarize(rows, ledger.length, cumulative),
    ledger: Object.freeze(ledger),
    halt_reason,
  });
}

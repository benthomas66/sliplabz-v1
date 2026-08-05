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
import { matchTeamName } from './discoveryTeamMatch.js';
import { evaluateCloseBoundary } from './closeBoundary.js';
import type { GameStatus } from '../shared/enums.js';
import type { OddsapiHttpConfig } from '../odds/httpClient.js';

/** The three governed populations (V1-OP-8b §0.4). */
export type Population = 'b_discovery_recoverable' | 'c_unrecoverable';

/** One unmapped game awaiting classification. */
export interface UnmappedGame {
  readonly internal_game_id: string;
  /** UTC date of the scheduled tip, `YYYY-MM-DD`. Reporting only — NOT the
   *  probe key. GAP-42: the probe is anchored to the close boundary. */
  readonly slate_date: string;
  /** GAP-42 boundary inputs, passed straight to `evaluateCloseBoundary`. */
  readonly scheduled_start_utc: string;
  readonly actual_start_utc: string | null;
  readonly status: GameStatus;
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
  /** GAP-44: the instant probed, used only to break a multi-match tie. */
  probe_at?: string,
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
  // GAP-41: containment-tolerant on BOTH sides, so a city-less display name
  // ("Tempo" vs "Toronto Tempo") no longer forces an artificial (c). The
  // conservative posture is unchanged — both teams must still match, and the
  // uniqueness check below still sends any ambiguity to (c).
  const hits = events.filter((e) => {
    if (e.home_team === undefined || e.away_team === undefined) return false;
    return matchTeamName(game.home_name!, e.home_team) !== 'none'
      && matchTeamName(game.away_name!, e.away_team) !== 'none';
  });

  if (hits.length === 1) {
    return Object.freeze({
      ...base,
      population: 'b_discovery_recoverable' as const,
      matched_event_id: hits[0]!.id,
      detail: `matched on both teams (home=${matchTeamName(game.home_name, hits[0]!.home_team!)}, away=${matchTeamName(game.away_name, hits[0]!.away_team!)})`,
    });
  }
  if (hits.length > 1) {
    // GAP-44. A same-matchup two-game series lists BOTH legs at a shared probe
    // (MIN@SEA on 2026-07-21 and 07-22). That is disambiguable, not
    // unrecoverable: the correct event is the one commencing nearest THIS
    // game's close boundary. Still conservative — a tie, a missing
    // `commence_time`, or no probe anchor all stay (c).
    const anchor = probe_at === undefined ? NaN : new Date(probe_at).getTime();
    if (Number.isFinite(anchor) && hits.every((h) => h.commence_time !== undefined)) {
      const scored = hits
        .map((h) => ({ h, d: Math.abs(new Date(h.commence_time!).getTime() - anchor) }))
        .filter((x) => Number.isFinite(x.d))
        .sort((a, b) => a.d - b.d);
      if (scored.length === hits.length && scored.length > 1 && scored[0]!.d < scored[1]!.d) {
        return Object.freeze({
          ...base,
          population: 'b_discovery_recoverable' as const,
          matched_event_id: scored[0]!.h.id,
          detail: `matched on both teams; disambiguated by commence_time (${hits.length} candidates, nearest ${Math.round(scored[0]!.d / 1000)}s vs ${Math.round(scored[1]!.d / 1000)}s from the boundary)`,
        });
      }
    }
    return unrecoverable(`ambiguous — ${hits.length} events match both teams`);
  }
  return unrecoverable('no_match at the close boundary');
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

/** Per-CALL billing, recorded so spend is reconstructable from the DB. */
export interface DiscoveryLedgerRow {
  /** GAP-42: the close-boundary instant probed, not an end-of-day stamp. */
  readonly probe_at: string;
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
  readonly on_probe?: (probe_at: string, events: number, games: number, row: DiscoveryLedgerRow) => void;
}

export interface SampleReport {
  readonly dry_run: boolean;
  readonly rows: ReadonlyArray<GameClassification>;
  readonly totals: SampleTotals;
  readonly ledger: ReadonlyArray<DiscoveryLedgerRow>;
  readonly halt_reason: string | null;
}

/** One deduplicated probe: a close-boundary instant + the games it serves. */
export interface ProbeGroup {
  readonly probe_at: string;
  readonly games: ReadonlyArray<UnmappedGame>;
}

/**
 * PURE. GAP-42. Build the probe plan by anchoring EVERY game to the committed
 * `evaluateCloseBoundary` — the same boundary the paid 40cr repair uses — and
 * grouping games that share an instant so each is paid for once.
 *
 * The original sample probed `${slate_date}T23:59:59Z`, which fired a mean of
 * 13.7h after tip (max 24h). "Absent from the listing a day later" is a much
 * weaker claim than "unretrievable at the boundary the repair queries", and
 * only the latter bears on the budget.
 *
 * A game with no close boundary (postponed/canceled) is returned separately —
 * it can never be repaired, so paying to discover it would be waste.
 */
export function buildProbePlan(games: ReadonlyArray<UnmappedGame>): {
  readonly groups: ReadonlyArray<ProbeGroup>;
  readonly no_boundary: ReadonlyArray<UnmappedGame>;
} {
  const byInstant = new Map<string, UnmappedGame[]>();
  const no_boundary: UnmappedGame[] = [];
  for (const g of games) {
    const b = evaluateCloseBoundary({
      internal_game_id: g.internal_game_id,
      scheduled_start_utc: g.scheduled_start_utc,
      actual_start_utc: g.actual_start_utc,
      status: g.status,
    });
    if (b.close_boundary_utc === null) {
      no_boundary.push(g);
      continue;
    }
    // Second precision — the historical endpoint rejects fractional seconds
    // (the committed `toHistoricalDateParam` invariant).
    const at = `${new Date(b.close_boundary_utc).toISOString().slice(0, 19)}Z`;
    const list = byInstant.get(at) ?? [];
    list.push(g);
    byInstant.set(at, list);
  }
  const groups = [...byInstant.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([probe_at, gs]) => Object.freeze({ probe_at, games: Object.freeze(gs) }));
  return Object.freeze({ groups: Object.freeze(groups), no_boundary: Object.freeze(no_boundary) });
}

/**
 * Run the bounded sample over an EXPLICIT frozen plan.
 *
 *   * `dry_run` issues NO call and spends nothing.
 *   * The ceiling is checked BEFORE each probe's call (halt-before-ceiling).
 *   * No blind retry: a failed probe is recorded and the run stops.
 */
export async function runDiscoverySample(
  deps: DiscoveryDeps,
  opts: {
    /** Frozen plan: the explicit games to classify. GAP-42 anchors the probes. */
    readonly games: ReadonlyArray<UnmappedGame>;
    readonly max_total_credits: number;
    readonly dry_run: boolean;
  },
): Promise<SampleReport> {
  if (opts.games.length === 0) {
    return Object.freeze({
      dry_run: opts.dry_run, rows: Object.freeze([]),
      totals: summarize([], 0, 0), ledger: Object.freeze([]),
      halt_reason: 'empty_plan: an explicit frozen game plan is required; never an implicit scan',
    });
  }

  const { groups, no_boundary } = buildProbePlan(opts.games);
  const doFetch = deps.fetchEvents ?? fetchHistoricalEvents;
  const rows: GameClassification[] = [];
  const ledger: DiscoveryLedgerRow[] = [];
  let cumulative = 0;
  let halt_reason: string | null = null;

  const stub = (g: UnmappedGame, detail: string): GameClassification => Object.freeze({
    internal_game_id: g.internal_game_id, slate_date: g.slate_date,
    matchup: `${g.away_abbr ?? '?'}@${g.home_abbr ?? '?'}`, in_recent_n: g.in_recent_n,
    population: 'c_unrecoverable' as const, matched_event_id: null, detail,
  });

  // Postponed/canceled games have no close boundary, so no snapshot can exist
  // and no credit is spent looking for one.
  for (const g of no_boundary) rows.push(stub(g, 'no close boundary (postponed/canceled) — unrepairable, not probed'));

  for (const group of groups) {
    if (opts.dry_run) {
      for (const g of group.games) rows.push(stub(g, `dry-run: no discovery call issued (would probe ${group.probe_at})`));
      continue;
    }

    const forecast = forecastHistoricalEventDiscoveryCost();
    if (cumulative + forecast > opts.max_total_credits) {
      halt_reason = `ceiling: projected ${cumulative + forecast} would exceed ${opts.max_total_credits}; halted before the call`;
      break;
    }

    // THE PAID CALL — discovery only, 1 credit, AT THE CLOSE BOUNDARY (GAP-42).
    const at_timestamp = group.probe_at;
    const retrieved_at = new Date().toISOString();
    const res = await doFetch(deps.oddsapi_config, { api_key: deps.api_key, at_timestamp });
    if (res.status !== 200 || res.body_json === null) {
      halt_reason = `discovery failed at ${at_timestamp} (status=${res.status}); no retry attempted`;
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
      probe_at: at_timestamp, slate_date: group.games[0]!.slate_date,
      forecast, observed: rq.observed, delta_flag: rq.delta_flag,
      x_requests_last, x_requests_remaining: num('x-requests-remaining'),
      x_requests_used: num('x-requests-used'), cumulative_sample_spend: cumulative,
    });
    ledger.push(row);
    await deps.recordLedger?.(row, {
      at_timestamp, redacted_request_url: res.redacted_request_url,
      response_headers: res.headers, retrieved_at,
    });

    const body = res.body_json as { data?: ReadonlyArray<DiscoveredEvent> } & ReadonlyArray<DiscoveredEvent>;
    const events: ReadonlyArray<DiscoveredEvent> = Array.isArray(body) ? body : (body.data ?? []);
    deps.on_probe?.(at_timestamp, events.length, group.games.length, row);
    for (const g of group.games) rows.push(classifyGame(g, events, group.probe_at));
  }

  return Object.freeze({
    dry_run: opts.dry_run,
    rows: Object.freeze(rows),
    totals: summarize(rows, ledger.length, cumulative),
    ledger: Object.freeze(ledger),
    halt_reason,
  });
}

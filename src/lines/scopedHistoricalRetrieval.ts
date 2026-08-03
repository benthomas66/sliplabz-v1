// V1-OP-8a — scoped historical closing-line retrieval + persistence owner.
//
// The SINGLE bounded caller for Path C one-game historical retrieval. Given an
// EXPLICIT internal game id + an EXPLICIT approved Odds API provider event id,
// it drives the COMMITTED Path C primitives end-to-end for that one game:
//
//     fetchHistoricalEventOdds        (paid; gated, injected)
//       -> processHistoricalSnapshot  (committed, pure; close-capture + candidates)
//       -> persistHistoricalSnapshot  (committed; per (event, market, book) triple)
//       -> canonical closing points   (committed; restricted to the one game)
//       -> historical_line_results    (committed; restricted to the one game)
//
// This module contributes NO historical-line selection, canonicalization,
// margin, eligibility, or hlr math. Every load-bearing decision stays in the
// committed primitive that already owns it (GAP-36: the missing object was the
// bounded ORCHESTRATION layer, not the math).
//
// HARD INVARIANTS
//   * Requires an EXPLICIT game id + event id. A missing/empty selector is a
//     hard error or an explicit no-op — NEVER an implicit broad scan.
//   * NEVER scans the leg-2 discovery cache; never performs provider discovery;
//     never processes a season/slate; never runs a global hlr population.
//   * NEVER writes or synthesizes `actual_start_utc` or `scheduled_start_utc`,
//     and never derives a timestamp from a date-only field (GAP-31). The close
//     boundary comes ONLY from the committed `evaluateCloseBoundary`.
//   * dry_run performs ZERO writes of every kind AND spends ZERO credits — the
//     paid fetch is never invoked.
//   * The paid fetch is structurally unreachable unless the forecast + reserve
//     + ceiling gates all pass first.
//   * Creates no game or provider-mapping row; writes no evidence profile.

import { LAUNCH_MARKET_KEYS } from '../odds/marketKeys.js';
import {
  forecastHistoricalEventOddsCost,
  forecastHistoricalEventDiscoveryCost,
} from '../odds/quotaForecast.js';
import type {
  HistoricalEventOddsResponse,
  HistoricalSourceClosingQuoteCandidate,
  CloseCaptureEvaluation,
} from '../seed/types.js';

/** Tables this bounded path may EVER write, via the committed owners only. */
export const OP8A_WRITABLE_TABLES = Object.freeze([
  'oddsapi_ingestion_runs',
  'oddsapi_raw_responses',
  'market_snapshots',
  'market_offerings',
  'source_closing_quotes',
  'canonical_closing_points',
  'historical_line_results',
] as const);

/** Tables this bounded path must NEVER write. Asserted by test. */
export const OP8A_FORBIDDEN_TABLES = Object.freeze([
  'games',
  'provider_games',
  'players',
  'player_game_stats',
  'evidence_profiles',
  'evidence_profile_window_aggregates',
  'poll_cycles',
  'current_market_rows',
  'observed_line_lifecycle',
  'movement_events',
  'real_line_windows',
  'market_registry',
] as const);

export type ScopedHaltReason =
  | 'missing_internal_game_id'
  | 'missing_provider_event_id'
  | 'missing_snapshot_timestamp'
  | 'missing_market_keys'
  | 'unauthorized_market_key'
  | 'missing_bookmaker_allowlist'
  | 'missing_credit_ceiling'
  | 'forecast_exceeds_ceiling'
  | 'reserve_floor_breach'
  | 'no_close_boundary';

/** The explicit, fully-bounded request. Every field is REQUIRED. */
export interface ScopedRetrievalRequest {
  readonly internal_game_id: string;
  readonly provider_event_id: string;
  /** Historical snapshot timestamp to request (ISO). Never derived here. */
  readonly at_timestamp: string;
  /** Governed market-key set. Must be a subset of LAUNCH_MARKET_KEYS. */
  readonly market_keys: ReadonlyArray<string>;
  /** Authorized sportsbook allowlist (provider keys). */
  readonly bookmaker_keys: ReadonlyArray<string>;
  /** Hard credit ceiling for this invocation. */
  readonly max_credit_ceiling: number;
  /** Whether a discovery call is additionally required (mapped events: false). */
  readonly requires_discovery?: boolean;
}

export interface ScopedRetrievalPlan {
  readonly internal_game_id: string;
  readonly provider_event_id: string;
  readonly at_timestamp: string;
  readonly market_keys: ReadonlyArray<string>;
  readonly bookmaker_keys: ReadonlyArray<string>;
  /** GAP-29-corrected forecast: per-event odds cost x 1 event + discovery. */
  readonly forecast_odds_credits: number;
  readonly forecast_discovery_credits: number;
  readonly forecast_total_credits: number;
  readonly max_credit_ceiling: number;
}

export type ScopedValidation =
  | { readonly ok: true; readonly plan: ScopedRetrievalPlan }
  | { readonly ok: false; readonly halt_reason: ScopedHaltReason; readonly detail: string };

/**
 * PURE. Validate the bounding contract and compute the GAP-29-corrected
 * forecast. Rejects every unbounded/implicit form. Called BEFORE any fetch —
 * a failed validation makes the paid request structurally unreachable.
 *
 * `credits_remaining` + `reserve_floor_credits`, when supplied, additionally
 * enforce the reserve floor.
 */
export function validateScopedRequest(
  req: ScopedRetrievalRequest,
  quota?: { readonly credits_remaining: number | null; readonly reserve_floor_credits: number },
): ScopedValidation {
  const fail = (halt_reason: ScopedHaltReason, detail: string): ScopedValidation =>
    Object.freeze({ ok: false as const, halt_reason, detail });

  if (typeof req.internal_game_id !== 'string' || req.internal_game_id.trim() === '') {
    return fail('missing_internal_game_id', 'an explicit internal_game_id is required; an empty selector is never "all"');
  }
  if (typeof req.provider_event_id !== 'string' || req.provider_event_id.trim() === '') {
    return fail('missing_provider_event_id', 'an explicit approved provider_event_id is required; implicit discovery is forbidden');
  }
  if (typeof req.at_timestamp !== 'string' || req.at_timestamp.trim() === '') {
    return fail('missing_snapshot_timestamp', 'an explicit historical snapshot timestamp is required');
  }
  if (!Array.isArray(req.market_keys) || req.market_keys.length === 0) {
    return fail('missing_market_keys', 'an explicit governed market-key set is required');
  }
  for (const m of req.market_keys) {
    if (!(LAUNCH_MARKET_KEYS as ReadonlyArray<string>).includes(m)) {
      return fail('unauthorized_market_key', `market_key ${JSON.stringify(m)} is not a governed launch market`);
    }
  }
  if (!Array.isArray(req.bookmaker_keys) || req.bookmaker_keys.length === 0) {
    return fail('missing_bookmaker_allowlist', 'an explicit authorized sportsbook allowlist is required');
  }
  if (!Number.isFinite(req.max_credit_ceiling) || req.max_credit_ceiling <= 0) {
    return fail('missing_credit_ceiling', 'an explicit positive max_credit_ceiling is required');
  }

  // GAP-29-corrected historical forecast. ONE event => x1; discovery only when
  // the event is not already mapped.
  const perEvent = forecastHistoricalEventOddsCost({
    requested_market_count: req.market_keys.length,
    requested_bookmaker_count: req.bookmaker_keys.length,
  });
  const EVENT_COUNT = 1;
  const forecast_odds_credits = perEvent * EVENT_COUNT;
  const forecast_discovery_credits = req.requires_discovery === true ? forecastHistoricalEventDiscoveryCost() : 0;
  const forecast_total_credits = forecast_odds_credits + forecast_discovery_credits;

  if (forecast_total_credits > req.max_credit_ceiling) {
    return fail('forecast_exceeds_ceiling', `forecast ${forecast_total_credits} exceeds ceiling ${req.max_credit_ceiling}`);
  }
  if (quota !== undefined && quota.credits_remaining !== null) {
    if (quota.credits_remaining - forecast_total_credits < quota.reserve_floor_credits) {
      return fail('reserve_floor_breach', `remaining ${quota.credits_remaining} - forecast ${forecast_total_credits} < reserve floor ${quota.reserve_floor_credits}`);
    }
  }

  return Object.freeze({
    ok: true as const,
    plan: Object.freeze({
      internal_game_id: req.internal_game_id,
      provider_event_id: req.provider_event_id,
      at_timestamp: req.at_timestamp,
      market_keys: Object.freeze([...req.market_keys]),
      bookmaker_keys: Object.freeze([...req.bookmaker_keys]),
      forecast_odds_credits,
      forecast_discovery_credits,
      forecast_total_credits,
      max_credit_ceiling: req.max_credit_ceiling,
    }),
  });
}

/** One (market, bookmaker) triple's candidates — the persist grain. */
export interface TripleGroup {
  readonly market_key: string;
  readonly bookmaker_key: string;
  readonly candidates: ReadonlyArray<HistoricalSourceClosingQuoteCandidate>;
}

/**
 * PURE. Group candidates into the (event, market, bookmaker) triples that the
 * committed `persistHistoricalSnapshot` expects — it persists ONE triple per
 * call. Ordering is deterministic (market, then bookmaker).
 */
export function groupCandidatesByTriple(
  candidates: ReadonlyArray<HistoricalSourceClosingQuoteCandidate>,
): ReadonlyArray<TripleGroup> {
  const byKey = new Map<string, HistoricalSourceClosingQuoteCandidate[]>();
  for (const c of candidates) {
    const k = `${c.market_key} ${c.bookmaker_key}`;
    const list = byKey.get(k);
    if (list === undefined) byKey.set(k, [c]);
    else list.push(c);
  }
  return Object.freeze(
    [...byKey.entries()]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, list]) => {
        const [market_key, bookmaker_key] = k.split(' ') as [string, string];
        return Object.freeze({ market_key, bookmaker_key, candidates: Object.freeze([...list]) });
      }),
  );
}

/** A would-write key, so a dry-run can enumerate exactly what WOULD land. */
export interface WouldWriteKey {
  readonly table: string;
  readonly key: string;
}

export interface ScopedRetrievalReport {
  readonly dry_run: boolean;
  readonly plan: ScopedRetrievalPlan;
  /** Credits actually spent. ALWAYS 0 on a dry-run. */
  readonly credits_spent: number;
  /** Committed close-boundary decision for the target game. */
  readonly close_boundary_utc: string | null;
  readonly boundary_source: string | null;
  /** Committed close-capture evaluation for the returned snapshot. */
  readonly close_capture: CloseCaptureEvaluation | null;
  readonly snapshot_timestamp: string | null;
  readonly candidates_accepted: number;
  readonly offerings_rejected: number;
  readonly triples: ReadonlyArray<TripleGroup>;
  readonly would_write: ReadonlyArray<WouldWriteKey>;
  /** Populated only on a live run. */
  readonly persisted: {
    readonly source_closing_quote_ids: ReadonlyArray<string>;
    readonly canonical_inserted: number;
    readonly hlr_rows_inserted: number;
    readonly hlr_rows_updated: number;
  } | null;
  readonly halt_reason: ScopedHaltReason | null;
  readonly detail: string;
}

/**
 * Injected dependencies. Every provider/DB effect is behind this seam so the
 * owner is fully testable with zero network and zero database.
 */
export interface ScopedRetrievalDeps {
  /** Committed close-boundary primitive for the target game (read-only). */
  readonly readCloseBoundary: (internal_game_id: string) => Promise<{
    readonly close_boundary_utc: string | null;
    readonly boundary_source: string | null;
  }>;
  /** The PAID historical fetch. Invoked ONLY on a live run, ONLY after gates pass. */
  readonly fetchSnapshot: (plan: ScopedRetrievalPlan) => Promise<{
    readonly response: HistoricalEventOddsResponse;
    readonly observed_x_requests_last: number | null;
  }>;
  /** A pre-captured/fixture snapshot for dry-runs. NEVER spends credits. */
  readonly loadFixtureSnapshot: (plan: ScopedRetrievalPlan) => Promise<HistoricalEventOddsResponse>;
  /** Committed processing primitive (processHistoricalSnapshot). */
  readonly processSnapshot: (input: {
    readonly requested_close_boundary_utc: string;
    readonly response: HistoricalEventOddsResponse;
  }) => {
    readonly close_capture: CloseCaptureEvaluation;
    readonly candidates: ReadonlyArray<HistoricalSourceClosingQuoteCandidate>;
    readonly exclusions: ReadonlyArray<unknown>;
  };
  /** Committed per-triple persistence. Live runs only. */
  readonly persistTriple: (group: TripleGroup, ctx: {
    readonly plan: ScopedRetrievalPlan;
    readonly close_capture: CloseCaptureEvaluation;
    readonly snapshot_timestamp: string | null;
  }) => Promise<{ readonly source_closing_quote_ids: ReadonlyArray<string> }>;
  /** Committed canonical owner, RESTRICTED to the one game. Live runs only. */
  readonly runCanonicalForGame: (internal_game_id: string) => Promise<{ readonly inserted: number }>;
  /** Committed hlr populator, RESTRICTED to the one game. Live runs only. */
  readonly runHlrForGame: (internal_game_id: string) => Promise<{
    readonly rows_inserted: number;
    readonly rows_updated: number;
  }>;
}

/**
 * Drive ONE explicit game + event through the committed Path C pipeline.
 *
 *   * dry_run === true  -> gates + fixture processing only. ZERO credits,
 *                          ZERO writes. `fetchSnapshot` is never called.
 *   * dry_run === false -> gates, then the paid fetch, then per-triple
 *                          persistence, then game-restricted canonical + hlr.
 *
 * Any gate failure returns a halt report BEFORE `fetchSnapshot` is reachable.
 */
export async function executeScopedRetrieval(
  deps: ScopedRetrievalDeps,
  req: ScopedRetrievalRequest,
  opts: {
    readonly dry_run: boolean;
    readonly quota?: { readonly credits_remaining: number | null; readonly reserve_floor_credits: number };
  },
): Promise<ScopedRetrievalReport> {
  const emptyPlan: ScopedRetrievalPlan = {
    internal_game_id: req.internal_game_id ?? '',
    provider_event_id: req.provider_event_id ?? '',
    at_timestamp: req.at_timestamp ?? '',
    market_keys: Object.freeze([...(req.market_keys ?? [])]),
    bookmaker_keys: Object.freeze([...(req.bookmaker_keys ?? [])]),
    forecast_odds_credits: 0,
    forecast_discovery_credits: 0,
    forecast_total_credits: 0,
    max_credit_ceiling: req.max_credit_ceiling ?? 0,
  };
  const halt = (plan: ScopedRetrievalPlan, halt_reason: ScopedHaltReason, detail: string): ScopedRetrievalReport =>
    Object.freeze({
      dry_run: opts.dry_run, plan, credits_spent: 0,
      close_boundary_utc: null, boundary_source: null, close_capture: null, snapshot_timestamp: null,
      candidates_accepted: 0, offerings_rejected: 0,
      triples: Object.freeze([]), would_write: Object.freeze([]), persisted: null,
      halt_reason, detail,
    });

  // GATE 1 — bounding + forecast + ceiling + reserve floor. Before any fetch.
  const v = validateScopedRequest(req, opts.quota);
  if (!v.ok) return halt(emptyPlan, v.halt_reason, v.detail);
  const plan = v.plan;

  // GATE 2 — the close boundary comes ONLY from the committed primitive.
  const boundary = await deps.readCloseBoundary(plan.internal_game_id);
  if (boundary.close_boundary_utc === null) {
    return halt(plan, 'no_close_boundary', 'evaluateCloseBoundary produced no close boundary for the target game');
  }

  // Snapshot source: fixture on a dry-run (0 credits, fetchSnapshot untouched);
  // the PAID fetch only on a live run, and only past both gates above.
  let response: HistoricalEventOddsResponse;
  let credits_spent = 0;
  if (opts.dry_run) {
    response = await deps.loadFixtureSnapshot(plan);
  } else {
    const fetched = await deps.fetchSnapshot(plan);
    response = fetched.response;
    // Reconcile forecast vs the provider's own accounting (x-requests-last).
    credits_spent = fetched.observed_x_requests_last ?? plan.forecast_total_credits;
  }

  // Committed processing — close-capture eligibility + candidate extraction.
  const processed = deps.processSnapshot({
    requested_close_boundary_utc: boundary.close_boundary_utc,
    response,
  });
  const triples = groupCandidatesByTriple(processed.candidates);

  const would_write: WouldWriteKey[] = [];
  for (const t of triples) {
    would_write.push({ table: 'market_snapshots', key: `${plan.provider_event_id}|${t.market_key}|${t.bookmaker_key}` });
    for (const c of t.candidates) {
      would_write.push({ table: 'source_closing_quotes', key: `${plan.provider_event_id}|${t.market_key}|${t.bookmaker_key}|${c.closing_point ?? 'null'}` });
    }
  }
  if (triples.length > 0) {
    would_write.push({ table: 'canonical_closing_points', key: `game:${plan.internal_game_id}` });
    would_write.push({ table: 'historical_line_results', key: `game:${plan.internal_game_id}` });
  }

  const base = {
    dry_run: opts.dry_run,
    plan,
    close_boundary_utc: boundary.close_boundary_utc,
    boundary_source: boundary.boundary_source,
    close_capture: processed.close_capture,
    snapshot_timestamp: response.timestamp ?? null,
    candidates_accepted: processed.candidates.length,
    offerings_rejected: processed.exclusions.length,
    triples,
    would_write: Object.freeze(would_write),
  };

  if (opts.dry_run) {
    // ZERO writes, ZERO credits — nothing below this line is reached.
    return Object.freeze({ ...base, credits_spent: 0, persisted: null, halt_reason: null, detail: 'dry-run: no credits spent, no rows written' });
  }

  const quote_ids: string[] = [];
  for (const t of triples) {
    const r = await deps.persistTriple(t, {
      plan, close_capture: processed.close_capture, snapshot_timestamp: response.timestamp ?? null,
    });
    quote_ids.push(...r.source_closing_quote_ids);
  }
  // Canonical + hlr, each RESTRICTED to the single target game.
  const canonical = await deps.runCanonicalForGame(plan.internal_game_id);
  const hlr = await deps.runHlrForGame(plan.internal_game_id);

  return Object.freeze({
    ...base,
    credits_spent,
    persisted: Object.freeze({
      source_closing_quote_ids: Object.freeze(quote_ids),
      canonical_inserted: canonical.inserted,
      hlr_rows_inserted: hlr.rows_inserted,
      hlr_rows_updated: hlr.rows_updated,
    }),
    halt_reason: null,
    detail: 'live run complete',
  });
}

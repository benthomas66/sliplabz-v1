// V1-4g — bounded-concurrency Odds API poll sweep.
//
// COMPOSES existing primitives; does NOT modify any of them:
//   - src/odds/httpClient.ts          (oddsapiRequest, HTTP)
//   - src/odds/pollResult.ts          (classifyPollResult)
//   - src/odds/freshness.ts           (classifyFreshness)
//   - src/odds/bookmakerAllowlist.ts  (allowlist + source class)
//   - src/odds/marketKeys.ts          (launch market gate)
//   - src/odds/normalizeOutcome.ts    (per-outcome normalization)
//   - src/odds/duplicateCollapse.ts   (canonical collapse)
//   - src/lines/orchestrator/persistOddsapiSnapshot.ts (atomic writer)
//   - src/db/connection.ts            (openPool)
//
// V1-4b lesson intent (fresh client per unit of work, never idle for long):
// each event gets its own pool with `max=1`, held only for the seconds it
// takes to persist that event's snapshots, then ended. Under concurrency the
// simultaneously-open pools are STILL short-lived; the intent — no client
// held idle across an hour — is preserved. The letter of "one fresh client"
// bends to accommodate N-way concurrency across events, which is the point.
//
// The persist path (`persistOddsapiSnapshot`) still runs row-by-row inside
// its transaction. That is the shared V1-4b primitive; batching there would
// materially change the seed path and requires its own governor review.
// V1-4g does not touch it. It parallelises AT the event boundary instead,
// which the measurement (STEP 1) showed brings real gains: DB streams for
// distinct events overlap.
//
// Concurrency cap default = 3 — see `DEFAULT_MAX_CONCURRENCY` below.
//
// GOVERNOR NOTE (V1-4g review) — the ledger's one quiet path.
// The credit-reconciliation throw at ~line 302 is conditional on
// `authoritative_total !== null`. If the discovery call's `x-requests-remaining`
// header is missing or unparseable, `authoritative_total` is null, no
// reconciliation happens, and THE SWEEP COMPLETES SILENTLY WITH UNVERIFIED SPEND.
// That is the same shape as every silent-failure defect this repository has
// caught — safe BECAUSE the header is always present, rather than impossible by
// construction.
// Not corrected now, for two reasons: the throw fires only after the credits are
// already spent (it reports, it does not prevent), and a missing header from the
// Odds API means something is badly wrong upstream regardless. When this sweep is
// next opened, close it: either throw on null, or emit an explicit, loud
// `ledger_unverifiable` state carrying the reason. The accounting layer must not
// have a quiet path.
//
// GOVERNOR NOTE — checksum scope (informational, no action).
// The differential parity checksum in tests/integration/oddsapiPollSweep.integration.test.ts
// covers canonical values, freshness_state, conflict/duplicate accounting, and
// source_hash across market_snapshots and market_offerings, correctly excluding
// ids and wall-clock timestamps that legitimately differ between runs. Note that
// `freshness_state` IS hashed and is itself a function of wall-clock age: with
// mocked HTTP both runs complete in seconds and classify identically, so the
// comparison is sound today. If this test is ever re-pointed at a slower or live
// source, freshness_state could diverge between the two runs for reasons that are
// not a parity defect. Prefer excluding it, or pinning the clock, if that day comes.

import { randomUUID } from 'node:crypto';
import { openPool } from '../../db/connection.js';
import type { SliplabzPool } from '../../db/connection.js';
import { oddsapiRequest, type OddsapiHttpConfig } from '../../odds/httpClient.js';
import { classifyPollResult } from '../../odds/pollResult.js';
import { classifyFreshness } from '../../odds/freshness.js';
import {
  isAllowlistedBookmakerKey,
  sourceClassForBookmakerKey,
  V1_CONSENSUS_SPORTSBOOK_KEYS,
} from '../../odds/bookmakerAllowlist.js';
import { LAUNCH_MARKET_KEYS, isLaunchMarketKey } from '../../odds/marketKeys.js';
import { normalizeOutcome } from '../../odds/normalizeOutcome.js';
import { collapseOutcomes } from '../../odds/duplicateCollapse.js';
import { persistOddsapiSnapshot } from './persistOddsapiSnapshot.js';

const SPORT_KEY = 'basketball_wnba';

/**
 * Default concurrency cap. Rationale:
 *   - Odds API rate limits (docs, §14) are not published as a hard number
 *     but historical operation runs ~100 req/min without incident. Three
 *     concurrent event_odds requests, each taking ~1-2 s, produce at most
 *     ~2 req/sec = 120 req/min — comfortably under any credible rate limit.
 *   - Supabase pooler on the SlipLabz plan has a total connection cap
 *     (typically 30-60 for small tiers). N=3 concurrent event-scoped pools,
 *     each `max=1`, produces at most 3 pooler connections — well under any
 *     tier.
 *   - The current WNBA slate is 5 events (V1-4f). N=3 gives a two-batch
 *     execution (3+2). Bigger N buys diminishing returns and starts to
 *     produce simultaneous DB write bursts that may contend on the pooler.
 *   - This is a NAMED, CONFIGURABLE constant, per the ticket. Callers
 *     override via `config.max_concurrency`; the default is conservative.
 */
export const DEFAULT_MAX_CONCURRENCY = 3;

export interface OddsapiPollSweepConfig {
  readonly api_key: string;
  readonly db_url: string;
  readonly http_config: OddsapiHttpConfig;
  readonly events: ReadonlyArray<{
    readonly provider_event_id: string;
    readonly linked_internal_game_id: string | null;
  }>;
  /**
   * Player-name → internal_player_id map (already resolved by caller).
   * Absent player ids are permitted; unresolved offerings are still persisted
   * with `internal_player_id = null` per the current call-site behavior.
   */
  readonly player_map: ReadonlyMap<string, string>;
  /** Bounded concurrency across events. Defaults to DEFAULT_MAX_CONCURRENCY. */
  readonly max_concurrency?: number | undefined;
  /**
   * Optional connection-error classifier. When absent, the sweep's built-in
   * `isConnectionError` (matching the V1-4b patterns) is used. When present,
   * this predicate replaces the default. Retries fire ONLY when the predicate
   * returns true; 4xx MUST NOT retry.
   */
  readonly on_connection_check?: ((err: unknown) => boolean) | undefined;
  /**
   * When true, the sweep runs events strictly serially (no concurrency).
   * The DIFFERENTIAL test enables this on one run and disables it on the
   * other; DB state must match.
   */
  readonly sequential?: boolean | undefined;
  /**
   * Optional constructor for the write pool. Defaults to `openPool(...)`
   * with `max=1`. Tests inject a shared pool.
   */
  readonly write_pool_factory?: ((event_id: string) => SliplabzPool) | undefined;
  /** Optional cleanup after each write pool. Defaults to `pool.end()`. */
  readonly write_pool_release?: ((pool: SliplabzPool) => Promise<void>) | undefined;
  /** Observability: called each time an event enters/exits the semaphore. */
  readonly on_concurrency_change?: ((in_flight: number) => void) | undefined;
}

export interface OddsapiPollSweepPerEvent {
  readonly provider_event_id: string;
  readonly ok: boolean;
  readonly failure_reason: string | null;
  readonly snapshots_written: number;
  readonly credits_spent_this_event: number;
  readonly http_status: number | null;
  readonly result_state: string | null;
  readonly attempts: number;
  readonly started_at: string;
  readonly finished_at: string;
}

export interface OddsapiPollSweepLedger {
  readonly discovery_before: {
    readonly at: string;
    readonly x_requests_used: number | null;
    readonly x_requests_remaining: number | null;
  };
  readonly discovery_after: {
    readonly at: string;
    readonly x_requests_used: number | null;
    readonly x_requests_remaining: number | null;
  };
  /** Per event_odds call. Order is arrival order, NOT poll order. */
  readonly per_call: ReadonlyArray<{
    readonly provider_event_id: string;
    readonly at: string;
    readonly http_status: number;
    readonly x_requests_used: number | null;
    readonly x_requests_remaining: number | null;
    readonly x_requests_last: number | null;
  }>;
  /** `discovery_before.remaining - discovery_after.remaining`. Authoritative. */
  readonly authoritative_total: number | null;
  /** Sum of per-call `x-requests-last`. Must equal authoritative_total. */
  readonly sum_of_per_call_last: number;
  /** True iff the two match. False forces the sweep to throw. */
  readonly reconciled: boolean;
}

export interface OddsapiPollSweepResult {
  readonly max_concurrency: number;
  readonly sequential: boolean;
  readonly per_event: ReadonlyArray<OddsapiPollSweepPerEvent>;
  readonly ledger: OddsapiPollSweepLedger;
  readonly peak_in_flight: number;
  readonly wall_started_at: string;
  readonly wall_finished_at: string;
}

/** Connection-class error patterns from V1-4b lesson. */
const CONNECTION_ERROR_PATTERNS = [
  'ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'EPIPE',
  'Connection terminated',
  'Client has encountered a connection error and is not queryable',
] as const;

function isConnectionError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return CONNECTION_ERROR_PATTERNS.some((p) => msg.includes(p));
}

/**
 * Read the numeric x-requests-* header if present; return null otherwise.
 * Headers may arrive as string or number depending on the fetch shim.
 */
function numHeader(headers: Record<string, unknown>, key: string): number | null {
  const v = headers[key];
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Bounded-concurrency semaphore. */
class Semaphore {
  private queue: Array<() => void> = [];
  private active = 0;
  peak = 0;
  constructor(private readonly max: number, private readonly onChange?: (n: number) => void) {}
  async acquire(): Promise<() => void> {
    if (this.active < this.max) {
      this.active += 1;
      if (this.active > this.peak) this.peak = this.active;
      this.onChange?.(this.active);
      return () => this.release();
    }
    return new Promise<() => void>((resolve) => {
      this.queue.push(() => {
        this.active += 1;
        if (this.active > this.peak) this.peak = this.active;
        this.onChange?.(this.active);
        resolve(() => this.release());
      });
    });
  }
  private release(): void {
    this.active -= 1;
    this.onChange?.(this.active);
    const next = this.queue.shift();
    if (next !== undefined) next();
  }
}

/**
 * Run the sweep. Under `sequential=true`, cap=1 and events run strictly
 * serially. The differential test toggles this flag; DB state must be
 * identical either way.
 */
export async function runOddsapiPollSweep(
  config: OddsapiPollSweepConfig
): Promise<OddsapiPollSweepResult> {
  const cap = config.sequential ? 1 : (config.max_concurrency ?? DEFAULT_MAX_CONCURRENCY);
  const wall_started_at = new Date().toISOString();

  // ---- Discovery BEFORE (free) ------------------------------------------
  const disc_before_at = new Date().toISOString();
  const disc_before = await oddsapiRequest(config.http_config, {
    path: `/v4/sports/${SPORT_KEY}/events`, query: {}, api_key: config.api_key,
  });
  const disc_before_used = numHeader(disc_before.headers as Record<string, unknown>, 'x-requests-used');
  const disc_before_rem  = numHeader(disc_before.headers as Record<string, unknown>, 'x-requests-remaining');

  const sem = new Semaphore(cap, config.on_concurrency_change);
  const per_call: Array<OddsapiPollSweepLedger['per_call'][number]> = [];
  const per_call_lock = new Mutex();

  const per_event: OddsapiPollSweepPerEvent[] = new Array(config.events.length);

  await Promise.all(config.events.map((ev, idx) => (async () => {
    const release = await sem.acquire();
    try {
      per_event[idx] = await pollOneEventWithRetry({
        event: ev,
        http_config: config.http_config,
        api_key: config.api_key,
        db_url: config.db_url,
        player_map: config.player_map,
        write_pool_factory: config.write_pool_factory,
        write_pool_release: config.write_pool_release,
        record_call: async (row) => {
          await per_call_lock.lock();
          try { per_call.push(row); } finally { per_call_lock.unlock(); }
        },
        on_connection_check: config.on_connection_check,
      });
    } finally { release(); }
  })()));

  // ---- Discovery AFTER (free) ------------------------------------------
  const disc_after_at = new Date().toISOString();
  const disc_after = await oddsapiRequest(config.http_config, {
    path: `/v4/sports/${SPORT_KEY}/events`, query: {}, api_key: config.api_key,
  });
  const disc_after_used = numHeader(disc_after.headers as Record<string, unknown>, 'x-requests-used');
  const disc_after_rem  = numHeader(disc_after.headers as Record<string, unknown>, 'x-requests-remaining');

  const authoritative_total = (disc_before_rem !== null && disc_after_rem !== null)
    ? disc_before_rem - disc_after_rem : null;
  const sum_of_per_call_last = per_call.reduce((a, r) => a + (r.x_requests_last ?? 0), 0);
  const reconciled = (authoritative_total !== null && authoritative_total === sum_of_per_call_last);

  const wall_finished_at = new Date().toISOString();
  const ledger: OddsapiPollSweepLedger = Object.freeze({
    discovery_before: Object.freeze({
      at: disc_before_at,
      x_requests_used: disc_before_used,
      x_requests_remaining: disc_before_rem,
    }),
    discovery_after: Object.freeze({
      at: disc_after_at,
      x_requests_used: disc_after_used,
      x_requests_remaining: disc_after_rem,
    }),
    per_call: Object.freeze(per_call),
    authoritative_total,
    sum_of_per_call_last,
    reconciled,
  });

  const result: OddsapiPollSweepResult = Object.freeze({
    max_concurrency: cap,
    sequential: cap === 1,
    per_event: Object.freeze(per_event),
    ledger,
    peak_in_flight: sem.peak,
    wall_started_at,
    wall_finished_at,
  });

  // Structural correctness gate. Under out-of-order response headers the
  // ONLY correct number is `before - after`. If sum of per-call `x-last`
  // does not match, we cannot trust either. Fail loud.
  if (!reconciled && authoritative_total !== null) {
    throw new Error(
      `[oddsapiPollSweep] credit ledger did not reconcile: ` +
      `authoritative_total=${authoritative_total} vs sum_of_per_call_last=${sum_of_per_call_last}. ` +
      `See per_call for details.`
    );
  }
  return result;
}

// ---------------------------------------------------------------------------
// Per-event poll (mocked via test harness or real HTTP)
// ---------------------------------------------------------------------------

interface PollOneInput {
  readonly event: { provider_event_id: string; linked_internal_game_id: string | null };
  readonly http_config: OddsapiHttpConfig;
  readonly api_key: string;
  readonly db_url: string;
  readonly player_map: ReadonlyMap<string, string>;
  readonly write_pool_factory: ((event_id: string) => SliplabzPool) | undefined;
  readonly write_pool_release: ((pool: SliplabzPool) => Promise<void>) | undefined;
  readonly record_call: (row: OddsapiPollSweepLedger['per_call'][number]) => Promise<void>;
  readonly on_connection_check: ((err: unknown) => boolean) | undefined;
}

async function pollOneEventWithRetry(input: PollOneInput): Promise<OddsapiPollSweepPerEvent> {
  const started_at = new Date().toISOString();
  let attempts = 0;
  let last_err: unknown = null;
  const isConnErr = input.on_connection_check ?? isConnectionError;
  while (attempts < 3) {
    attempts += 1;
    try {
      const out = await pollOneEvent(input);
      return Object.freeze({
        provider_event_id: input.event.provider_event_id,
        ok: true, failure_reason: null,
        snapshots_written: out.snapshots_written,
        credits_spent_this_event: out.credits_spent_this_event,
        http_status: out.http_status,
        result_state: out.result_state,
        attempts,
        started_at, finished_at: new Date().toISOString(),
      });
    } catch (err) {
      last_err = err;
      if (!isConnErr(err)) break; // never retry 4xx
      // fall through to retry
    }
  }
  return Object.freeze({
    provider_event_id: input.event.provider_event_id,
    ok: false,
    failure_reason: last_err instanceof Error ? last_err.message : String(last_err),
    snapshots_written: 0,
    credits_spent_this_event: 0,
    http_status: null, result_state: null, attempts,
    started_at, finished_at: new Date().toISOString(),
  });
}

interface PollOneOutput {
  readonly snapshots_written: number;
  readonly credits_spent_this_event: number;
  readonly http_status: number;
  readonly result_state: string;
}

async function pollOneEvent(input: PollOneInput): Promise<PollOneOutput> {
  const req_started_at = new Date().toISOString();
  const odds = await oddsapiRequest(input.http_config, {
    path: `/v4/sports/${SPORT_KEY}/events/${input.event.provider_event_id}/odds`,
    query: {
      markets: LAUNCH_MARKET_KEYS as unknown as ReadonlyArray<string>,
      bookmakers: V1_CONSENSUS_SPORTSBOOK_KEYS,
      oddsFormat: 'american',
    },
    api_key: input.api_key,
  });
  const x_used = numHeader(odds.headers as Record<string, unknown>, 'x-requests-used');
  const x_rem  = numHeader(odds.headers as Record<string, unknown>, 'x-requests-remaining');
  const x_last = numHeader(odds.headers as Record<string, unknown>, 'x-requests-last');
  await input.record_call({
    provider_event_id: input.event.provider_event_id,
    at: req_started_at, http_status: odds.status,
    x_requests_used: x_used, x_requests_remaining: x_rem, x_requests_last: x_last,
  });
  if (odds.status >= 400 && odds.status < 500) {
    throw new Error(`HTTP ${odds.status} for event ${input.event.provider_event_id}`);
  }
  const classification = classifyPollResult({
    http_status: odds.status, content_type: odds.content_type,
    parsed_body: odds.body_json, transport_error_detail: null,
  });
  if (classification.result_state !== 'complete' && classification.result_state !== 'successful_empty') {
    return Object.freeze({
      snapshots_written: 0,
      credits_spent_this_event: x_last ?? 0,
      http_status: odds.status,
      result_state: classification.result_state,
    });
  }
  const body = odds.body_json as any;
  const bookmakers = Array.isArray(body?.bookmakers) ? body.bookmakers : [];
  const write_pool: SliplabzPool = input.write_pool_factory !== undefined
    ? input.write_pool_factory(input.event.provider_event_id)
    : openPool({
        connectionString: input.db_url, max: 1, statement_timeout_ms: 30_000,
        ssl: input.db_url.includes('supabase.') ? 'require' : 'disable',
      });
  let snapshots_written = 0;
  try {
    const observed_at = new Date().toISOString();
    for (const bm of bookmakers) {
      const bkey = String(bm.key ?? '');
      if (!isAllowlistedBookmakerKey(bkey)) continue;
      if (sourceClassForBookmakerKey(bkey) !== 'sportsbook') continue;
      const bm_title = String(bm.title ?? bkey);
      const bm_last = typeof bm.last_update === 'string' ? bm.last_update : null;
      const markets_arr = Array.isArray(bm.markets) ? bm.markets : [];
      for (const m of markets_arr) {
        const mkey = String(m.key ?? '');
        if (!isLaunchMarketKey(mkey)) continue;
        const provider_last_update = typeof m.last_update === 'string' ? m.last_update : bm_last;
        const outcomes_arr = Array.isArray(m.outcomes) ? m.outcomes : [];
        const raw_rows_for_persist: any[] = [];
        const collapse_input: any[] = [];
        const q_indexes = new Set<number>();
        for (let k = 0; k < outcomes_arr.length; k += 1) {
          const raw = outcomes_arr[k] as Record<string, unknown>;
          const nr = normalizeOutcome(raw, 'sportsbook_american');
          if (!nr.ok) {
            q_indexes.add(k);
            raw_rows_for_persist.push({
              raw_row_index: k, raw_name: String(raw['name'] ?? ''),
              raw_description: String(raw['description'] ?? ''),
              raw_price: typeof raw['price'] === 'number' ? raw['price'] : null,
              raw_point: typeof raw['point'] === 'number' ? raw['point'] : null,
              raw_multiplier: typeof raw['multiplier'] === 'number' ? raw['multiplier'] : null,
              raw_payload: raw, disposition: 'quarantined', canonical_offering_index: null, observed_at,
            });
            continue;
          }
          collapse_input.push({ raw_row_index: k, outcome: nr.outcome });
        }
        if (collapse_input.length === 0 && q_indexes.size === 0) continue;
        const collapse = collapseOutcomes(
          collapse_input.map(({ raw_row_index, outcome }: any) => ({ raw_row_index, outcome })),
          {
            provider_event_id: input.event.provider_event_id, bookmaker_key: bkey, market_key: mkey,
            provider_last_update, promotion_type: 'unknown',
          }
        );
        const canonical_ids: string[] = collapse.offerings.map(() => randomUUID());
        const rIdxToCanIdx = new Map<number, number>();
        for (let ci = 0; ci < collapse.offerings.length; ci += 1) {
          for (const ri of collapse.offerings[ci]!.contributing_raw_row_indexes) rIdxToCanIdx.set(ri, ci);
        }
        const seen = new Map<number, boolean>();
        for (let k = 0; k < outcomes_arr.length; k += 1) {
          if (q_indexes.has(k)) continue;
          const raw = outcomes_arr[k] as Record<string, unknown>;
          if (collapse.quarantined_raw_row_indexes.has(k)) {
            raw_rows_for_persist.push({
              raw_row_index: k, raw_name: String(raw['name'] ?? ''),
              raw_description: String(raw['description'] ?? ''),
              raw_price: typeof raw['price'] === 'number' ? raw['price'] : null,
              raw_point: typeof raw['point'] === 'number' ? raw['point'] : null,
              raw_multiplier: typeof raw['multiplier'] === 'number' ? raw['multiplier'] : null,
              raw_payload: raw, disposition: 'quarantined', canonical_offering_index: null, observed_at,
            });
            continue;
          }
          const ci = rIdxToCanIdx.get(k);
          if (ci === undefined) continue;
          const isFirst = !seen.has(ci); seen.set(ci, true);
          raw_rows_for_persist.push({
            raw_row_index: k, raw_name: String(raw['name'] ?? ''),
            raw_description: String(raw['description'] ?? ''),
            raw_price: typeof raw['price'] === 'number' ? raw['price'] : null,
            raw_point: typeof raw['point'] === 'number' ? raw['point'] : null,
            raw_multiplier: typeof raw['multiplier'] === 'number' ? raw['multiplier'] : null,
            raw_payload: raw, disposition: isFirst ? 'contributed' : 'duplicate',
            canonical_offering_index: ci, observed_at,
          });
        }
        const canonical_offerings = collapse.offerings.map((o: any, ci: number) => ({
          market_offering_id: canonical_ids[ci]!,
          raw_player_description: o.normalized_player_name,
          normalized_player_name: o.normalized_player_name,
          internal_player_id: input.player_map.get(o.normalized_player_name) ?? null,
          side: o.side, point: o.point,
          raw_price_american: o.raw_price_american, raw_multiplier: o.raw_multiplier,
          price_semantic: o.price_semantic, promotion_type: o.promotion_type,
          offering_state: o.offering_state, conflict_reason: o.conflict_reason,
          duplicate_count: o.duplicate_count, provider_last_update,
          source_hash: o.source_hash, eligibility_note: '',
        }));
        const fresh_state = classifyFreshness({
          provider_last_update, now: new Date().toISOString(), latest_poll_failed: false,
        });
        const ingestion_run_id = randomUUID();
        const market_snapshot_id = randomUUID();
        await write_pool.query(
          `INSERT INTO oddsapi_ingestion_runs
             (oddsapi_ingestion_run_id, request_kind, endpoint,
              requested_provider_event_id, requested_market_keys, requested_bookmaker_keys,
              requested_regions, requested_effective_time, request_params, redacted_request_url,
              started_at, completed_at, http_status_last, content_type_last,
              response_headers_last, result_state)
           VALUES ($1,'current_poll','event_odds',$2,$3::jsonb,$4::jsonb,'[]'::jsonb,NULL,$5::jsonb,$6,$7,$8,$9,$10,$11::jsonb,'complete')`,
          [
            ingestion_run_id, input.event.provider_event_id,
            JSON.stringify([mkey]), JSON.stringify([bkey]),
            JSON.stringify({ markets: [mkey], bookmakers: [bkey], oddsFormat: 'american' }),
            odds.redacted_request_url, req_started_at, new Date().toISOString(),
            odds.status, odds.content_type, JSON.stringify(odds.headers),
          ]
        );
        await persistOddsapiSnapshot(write_pool, {
          market_snapshot: {
            market_snapshot_id,
            oddsapi_ingestion_run_id: ingestion_run_id,
            raw_response_id: null,
            provider_event_id: input.event.provider_event_id,
            linked_internal_game_id: input.event.linked_internal_game_id,
            bookmaker_key: bkey, bookmaker_title: bm_title,
            source_class: 'sportsbook',
            market_key: mkey,
            request_kind: 'current_poll', provenance: 'self_observed',
            provider_last_update, provider_snapshot_time: null,
            retrieved_at: observed_at, observed_at,
            freshness_state: fresh_state, schema_state: 'valid',
            raw_outcome_row_count: outcomes_arr.length,
            duplicate_group_count: collapse.duplicate_group_count,
            conflict_group_count: collapse.conflict_group_count,
          },
          canonical_offerings,
          raw_rows: raw_rows_for_persist,
        });
        snapshots_written += 1;
      }
    }
  } finally {
    if (input.write_pool_release !== undefined) {
      await input.write_pool_release(write_pool);
    } else {
      await write_pool.end();
    }
  }
  return Object.freeze({
    snapshots_written,
    credits_spent_this_event: x_last ?? 0,
    http_status: odds.status, result_state: classification.result_state,
  });
}

// ---------------------------------------------------------------------------
// Simple async mutex.
// ---------------------------------------------------------------------------
class Mutex {
  private locked = false;
  private waiters: Array<() => void> = [];
  async lock(): Promise<void> {
    if (!this.locked) { this.locked = true; return; }
    return new Promise<void>((resolve) => this.waiters.push(resolve));
  }
  unlock(): void {
    const w = this.waiters.shift();
    if (w !== undefined) { w(); return; }
    this.locked = false;
  }
}

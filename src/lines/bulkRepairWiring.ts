// V1-OP-8c — the batch APPLY dependency assembly (GAP-39 corrective).
//
// This is THE effectful wiring that `scripts/v1_op_8b_batch.ts --apply` fires.
// It lives in src/ (not inside the script) for one governance reason: standing
// rule 5b requires a positive-persistence test to exercise "the same dependency
// assembly and call path as the operator entry", not a lower-level function
// called with hand-corrected arguments. While the assembly was module-private
// inside the script it was unreachable from tests — which is exactly how the
// GAP-39 defect (`linked_internal_game_id: null`) reached a paid run unproven.
//
// Every provider/DB effect is behind an injected seam, so the test drives THIS
// function with a recorded fixture + controlled DB and asserts rows land.
//
// CORRECTIVES CARRIED (GAP-39):
//   A — `linked_internal_game_id` is threaded from the manifest entry, matching
//       the working one-game caller (`scopedHistoricalRetrievalDeps.ts:165`).
//       It is IMPOSSIBLE to construct a persist input with a null linked id
//       here: the value comes from `ManifestEntry.internal_game_id`, which the
//       runner requires, and `assertLinkedGameId` fails loudly if it is empty.
//   C — the COMPLETE quota trail is threaded per paid request: forecast,
//       observed, x_requests_last, x_requests_remaining, x_requests_used,
//       reconciliation verdict, and the cumulative batch-attributed spend.
//   D — the null-linked-id regression is structurally unrepresentable (see A)
//       and pinned by test.

import { fetchHistoricalEventOdds } from '../seed/httpClient.js';
import { persistHistoricalSnapshotInTx } from '../seed/orchestrator/persistHistoricalSnapshot.js';
import { deleteAndReplaceCanonicalClosingPointsInTx } from '../seed/orchestrator/canonicalClosingPointsForSeed.js';
import { runHistoricalLineResultsBackfillInTx } from './historicalLineResultsBackfill.js';
import { groupCandidatesByTriple } from './scopedHistoricalRetrieval.js';
import { processHistoricalSnapshot } from '../seed/historicalEventOdds.js';
import { evaluateCloseBoundary } from './closeBoundary.js';
import { reconcileQuota } from '../odds/quotaForecast.js';
import { forecastHistoricalEventOddsCost } from '../odds/quotaForecast.js';
import { LAUNCH_MARKET_KEYS } from '../odds/marketKeys.js';
import { V1_BOOKMAKER_ALLOWLIST } from '../odds/bookmakerAllowlist.js';
import { CANONICAL_COMPUTATION_VERSION } from './scopedHistoricalRetrievalDeps.js';
import type { OddsapiHttpConfig, OddsapiRequestResult } from '../odds/httpClient.js';
import type { SliplabzPool } from '../db/connection.js';
import type { Tx } from '../db/transaction.js';
import type { HistoricalEventOddsResponse } from '../seed/types.js';
import type { BatchRunnerDeps, ManifestEntry } from './bulkHistoricalRepair.js';

export const BATCH_SPORTSBOOK_KEYS: ReadonlyArray<string> = Object.freeze(
  V1_BOOKMAKER_ALLOWLIST.filter((b) => b.source_class === 'sportsbook').map((b) => b.provider_key),
);

/** The complete per-request quota trail persisted to the ledger (corrective C). */
export interface BatchQuotaTrail {
  readonly forecast: number;
  readonly observed: number | null;
  readonly delta_flag: 'exact_match' | 'observed_lower_than_forecast' | 'observed_higher_than_forecast' | 'observed_missing';
  readonly x_requests_last: number | null;
  readonly x_requests_remaining: number | null;
  readonly x_requests_used: number | null;
  /** Cumulative credits attributed to THIS batch, after this request. */
  readonly cumulative_batch_spend: number;
}

/**
 * GAP-39 corrective A/D. The linked game id is required and non-empty by
 * construction; a null/blank value can never reach the persist input.
 */
export function assertLinkedGameId(entry: ManifestEntry): string {
  const id = entry.internal_game_id;
  if (typeof id !== 'string' || id.trim() === '') {
    throw new Error(
      'V1-OP-8c: refusing to persist with an empty internal_game_id — ' +
        'a null linked id silently skips every candidate (GAP-39).',
    );
  }
  return id;
}

export interface BatchWiringConfig {
  readonly pool: SliplabzPool;
  readonly connection_string: string;
  readonly oddsapi_config: OddsapiHttpConfig;
  readonly api_key: string;
  readonly seed_run_id_factory: () => string;
  readonly now: () => string;
  readonly runInGameTransaction: <T>(body: (tx: Tx) => Promise<T>) => Promise<T>;
  /** Injected so a test can supply a recorded response with zero HTTP. */
  readonly fetchHistorical?: typeof fetchHistoricalEventOdds;
  /** Observability hook: the quota trail actually persisted, per request. */
  readonly on_quota_trail?: (entry: ManifestEntry, trail: BatchQuotaTrail) => void;
}

function headerNum(headers: Readonly<Record<string, string | number>>, key: string): number | null {
  const raw = headers[key];
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN;
  return Number.isFinite(n) ? n : null;
}

/**
 * Build the batch APPLY dependencies. THIS is what `--apply` runs, and what the
 * positive-persistence test drives.
 */
export function buildBatchApplyDeps(cfg: BatchWiringConfig): BatchRunnerDeps {
  const doFetch = cfg.fetchHistorical ?? fetchHistoricalEventOdds;

  // Per-game state captured at the paid seam, consumed by the persist seams.
  let seed_run_id = cfg.seed_run_id_factory();
  let linked_game_id = '';
  let provider_event_id = '';
  let boundary_utc = '';
  let snapshot_ts: string | null = null;
  let quota: BatchQuotaTrail | undefined;
  let cumulative_batch_spend = 0;
  let players: ReadonlyMap<string, string> = new Map();
  let playersLoaded = false;

  async function loadPlayers(): Promise<ReadonlyMap<string, string>> {
    if (playersLoaded) return players;
    const r = await cfg.pool.query('SELECT internal_player_id::text AS id, normalized_name FROM players');
    const m = new Map<string, string>();
    for (const row of r.rows as Array<{ id: string; normalized_name: string }>) {
      if (row.normalized_name !== '') m.set(row.normalized_name, row.id);
    }
    players = m;
    playersLoaded = true;
    return players;
  }

  return {
    alreadyRepaired: async (entry) => {
      const r = await cfg.pool.query(
        `SELECT count(*)::int AS n FROM historical_line_results
          WHERE internal_game_id = $1::uuid AND coverage_state IN ('complete','single_book')`,
        [entry.internal_game_id],
      );
      return ((r.rows[0] as { n: number } | undefined)?.n ?? 0) > 0;
    },

    // PAID seam. Completes and RETURNS before any transaction opens.
    retrieveGame: async (entry) => {
      // Corrective A/D: the linked id is established HERE, from the manifest.
      linked_game_id = assertLinkedGameId(entry);
      provider_event_id = entry.provider_event_id;
      seed_run_id = cfg.seed_run_id_factory();
      await loadPlayers();

      const g = await cfg.pool.query(
        `SELECT internal_game_id::text AS id, status::text AS status,
                scheduled_start_utc, actual_start_utc
           FROM games WHERE internal_game_id = $1::uuid`,
        [linked_game_id],
      );
      const row = g.rows[0] as {
        id: string; status: string;
        scheduled_start_utc: Date | string | null; actual_start_utc: Date | string | null;
      } | undefined;
      if (row === undefined) throw new Error(`V1-OP-8c: game ${linked_game_id} not found`);
      const iso = (v: Date | string | null) => (v === null ? null : v instanceof Date ? v.toISOString() : v);
      const b = evaluateCloseBoundary({
        internal_game_id: row.id,
        status: row.status,
        scheduled_start_utc: iso(row.scheduled_start_utc),
        actual_start_utc: iso(row.actual_start_utc),
      } as never);
      if (b.close_boundary_utc === null) throw new Error(`V1-OP-8c: no close boundary for ${linked_game_id}`);
      boundary_utc = b.close_boundary_utc;

      const forecast = forecastHistoricalEventOddsCost({
        requested_market_count: LAUNCH_MARKET_KEYS.length,
        requested_bookmaker_count: BATCH_SPORTSBOOK_KEYS.length,
      });

      const res: OddsapiRequestResult = await doFetch(cfg.oddsapi_config, {
        api_key: cfg.api_key,
        at_timestamp: boundary_utc, // normalized to second precision at the HTTP owner
        provider_event_id,
        market_keys: [...LAUNCH_MARKET_KEYS],
        bookmaker_keys: [...BATCH_SPORTSBOOK_KEYS],
        odds_format: 'american',
      });
      if (res.status !== 200 || res.body_json === null) {
        throw new Error(
          `V1-OP-8c: historical fetch failed (status=${res.status}); no retry attempted, no rows written`,
        );
      }

      // Corrective C — the COMPLETE quota trail, batch-attributed.
      const x_requests_last = headerNum(res.headers, 'x-requests-last');
      const rq = reconcileQuota({ forecast, observed_x_requests_last: x_requests_last });
      cumulative_batch_spend += x_requests_last ?? forecast;
      quota = Object.freeze({
        forecast: rq.forecast,
        observed: rq.observed,
        delta_flag: rq.delta_flag as BatchQuotaTrail['delta_flag'],
        x_requests_last,
        x_requests_remaining: headerNum(res.headers, 'x-requests-remaining'),
        x_requests_used: headerNum(res.headers, 'x-requests-used'),
        cumulative_batch_spend,
      });
      cfg.on_quota_trail?.(entry, quota);

      const response = res.body_json as HistoricalEventOddsResponse;
      snapshot_ts = response.timestamp ?? null;
      const processed = processHistoricalSnapshot({
        requested_close_boundary_utc: boundary_utc,
        response,
      } as never);

      return {
        close_capture_state: processed.close_capture.close_capture_state as
          'eligible' | 'close_capture_stale' | 'no_snapshot',
        snapshot_age_seconds_before_boundary:
          (processed.close_capture as { age_seconds_before_boundary?: number | null }).age_seconds_before_boundary ?? null,
        triples: groupCandidatesByTriple(processed.candidates),
        credits_forecast: forecast,
        credits_observed: x_requests_last,
        x_requests_remaining: quota.x_requests_remaining,
      };
    },

    runInGameTransaction: cfg.runInGameTransaction,

    persistTripleInTx: async (tx, group, carries_quota_trail) => {
      // Corrective A: NON-NULL by construction. Never `null`.
      if (linked_game_id === '') throw new Error('V1-OP-8c: persist attempted before a game was selected');
      const r = await persistHistoricalSnapshotInTx(tx, {
        seed_run_id,
        provider_event_id,
        linked_internal_game_id: linked_game_id,
        linked_internal_player_ids_by_normalized_name: players,
        market_key: group.market_key,
        bookmaker_key: group.bookmaker_key,
        bookmaker_title: group.bookmaker_key,
        requested_close_boundary_utc: boundary_utc,
        provider_snapshot_time: snapshot_ts,
        retrieved_at: cfg.now(),
        close_capture: { close_capture_state: 'eligible' } as never,
        redacted_request_url:
          `https://api.the-odds-api.com/v4/historical/sports/basketball_wnba/events/${provider_event_id}/odds?apiKey=REDACTED&date=${boundary_utc}`,
        request_params: {
          date: boundary_utc,
          markets: [group.market_key],
          bookmakers: [group.bookmaker_key],
          oddsFormat: 'american',
        },
        response_headers: {},
        raw_response_body: null,
        raw_response_body_text: null,
        candidates: group.candidates,
        // GAP-46: only the FIRST triple of a paid call carries the billed
        // trail. Each triple writes its own ledger row, so replicating it
        // made SUM(quota_observed) report calls x triples x 40.
        ...(quota !== undefined && carries_quota_trail
          ? {
              quota_reconciliation: {
                forecast: quota.forecast,
                observed: quota.observed,
                delta_flag: quota.delta_flag,
                x_requests_last: quota.x_requests_last,
                // GAP-40: route the balance-curve fields to the ledger.
                x_requests_remaining: quota.x_requests_remaining,
                x_requests_used: quota.x_requests_used,
              },
            }
          : {}),
      });
      return { source_closing_quote_ids: r.source_closing_quote_ids };
    },

    // GAP-40 §5: authoritative persisted-row counts, read inside the same tx.
    countPersistedGrains: async (tx, internal_game_id) => {
      const one = async (sql: string) => {
        const r = await tx.query(sql, [internal_game_id]);
        return Number((r.rows[0] as { n: number } | undefined)?.n ?? 0);
      };
      return {
        source_closing_quotes: await one('SELECT count(*)::int AS n FROM source_closing_quotes WHERE internal_game_id = $1::uuid'),
        canonical_closing_points: await one('SELECT count(*)::int AS n FROM canonical_closing_points WHERE internal_game_id = $1::uuid'),
        historical_line_results: await one('SELECT count(*)::int AS n FROM historical_line_results WHERE internal_game_id = $1::uuid'),
      };
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

// V1-OP-8 one-game validation — real-seam wiring for the V1-OP-8a owner.
//
// Composes the COMMITTED Path C primitives into the `ScopedRetrievalDeps`
// seam that `src/lines/scopedHistoricalRetrieval.ts` (committed `54c346d`)
// drives. This file is ORCHESTRATION ONLY:
//
//   fetchSnapshot       -> fetchHistoricalEventOdds        (src/seed/httpClient.ts)
//   persistTriple       -> persistHistoricalSnapshot       (per (event, market, book) triple)
//   runCanonicalForGame -> deleteAndReplaceCanonicalClosingPointsFromDb
//                          with restrict_to_internal_game_ids = [target]
//   runHlrForGame       -> runHistoricalLineResultsBackfill
//                          with restrict_to_internal_game_ids = [target]
//   readCloseBoundary   -> evaluateCloseBoundary over STORED start-time fields
//
// It introduces NO historical-line selection, canonicalization, margin,
// eligibility, or hlr math of its own — every load-bearing decision stays in
// the primitive that already owns it.
//
// HARD INVARIANTS (inherited + re-asserted here)
//   * Writes ONLY through the committed owners, and only to
//     OP8A_WRITABLE_TABLES. Never touches OP8A_FORBIDDEN_TABLES — in
//     particular never `games` / `provider_games`, so neither
//     `actual_start_utc` nor `scheduled_start_utc` can be written, and no
//     timestamp is ever derived from a date-only field (GAP-31).
//   * The close boundary is READ from the committed `evaluateCloseBoundary`
//     over stored inputs; the snapshot timestamp is never hand-specified.
//   * Attribution is ownership-scoped: every write names the target
//     `provider_event_id` or the target game id. Never a global count delta.
//   * The paid fetch is reachable only after the owner's bounding + forecast
//     + ceiling + reserve gates pass (enforced in the owner, before this seam
//     is called).
//   * GAP-37 is inherited, not fixed here: `persistHistoricalSnapshot` is
//     atomic per triple. A mid-game failure leaves partial
//     `source_closing_quotes` with no canonical point and no hlr row —
//     safe-by-incompleteness (the grain is unserved) and resumable.

import { fetchHistoricalEventOdds } from '../seed/httpClient.js';
import { persistHistoricalSnapshot } from '../seed/orchestrator/persistHistoricalSnapshot.js';
import { deleteAndReplaceCanonicalClosingPointsFromDb } from '../seed/orchestrator/canonicalClosingPointsForSeed.js';
import { runHistoricalLineResultsBackfill } from './historicalLineResultsBackfill.js';
import { reconcileQuota } from '../odds/quotaForecast.js';
import { evaluateCloseBoundary } from './closeBoundary.js';
import type { OddsapiHttpConfig } from '../odds/httpClient.js';
import type { SliplabzPool } from '../db/connection.js';
import type { HistoricalEventOddsResponse } from '../seed/types.js';
import type { ScopedRetrievalDeps, TripleGroup, ScopedRetrievalPlan } from './scopedHistoricalRetrieval.js';

/** V1-4b Phase B used computation_version=2 for the corrected canonical pass. */
export const CANONICAL_COMPUTATION_VERSION = 2;

/** GAP-38 ledger payload threaded from the paid seam into the persist. */
type PersistQuotaReconciliation = NonNullable<
  Parameters<typeof persistHistoricalSnapshot>[1]['quota_reconciliation']
>;

export interface WiringConfig {
  readonly pool: SliplabzPool;
  readonly connection_string: string;
  readonly oddsapi_config: OddsapiHttpConfig;
  readonly api_key: string;
  readonly seed_run_id: string;
  /** normalized_name -> internal_player_id, for the target game's players. */
  readonly player_ids_by_normalized_name: ReadonlyMap<string, string>;
  /** Optional fault injection for the GAP-37 resume proof (test-only). */
  readonly on_before_persist_triple?: (group: TripleGroup, index: number) => void;
}

/** Redacted URL shape persisted alongside the raw response. Never the key. */
export function redactedHistoricalUrl(provider_event_id: string, at_timestamp: string): string {
  return (
    `https://api.the-odds-api.com/v4/historical/sports/basketball_wnba/events/` +
    `${provider_event_id}/odds?apiKey=REDACTED&date=${at_timestamp}`
  );
}

/**
 * Build the real dependency set. Nothing here fetches or writes on its own —
 * each seam runs only when the owner calls it, and the owner never calls the
 * paid or persisting seams on a dry-run.
 */
export function buildScopedRetrievalDeps(
  cfg: WiringConfig,
  base: Pick<ScopedRetrievalDeps, 'processSnapshot' | 'loadFixtureSnapshot'>,
): ScopedRetrievalDeps {
  let persistIndex = 0;
  // GAP-38: the reconciliation for THIS paid call, captured at the fetch seam
  // and persisted to the ledger by every triple of the same request.
  let quota_reconciliation: PersistQuotaReconciliation | undefined;

  return {
    // READ-ONLY. Boundary from the committed primitive over STORED fields.
    readCloseBoundary: async (internal_game_id: string) => {
      const r = await cfg.pool.query(
        `SELECT internal_game_id::text AS id, status::text AS status,
                scheduled_start_utc, actual_start_utc
           FROM games WHERE internal_game_id = $1::uuid`,
        [internal_game_id],
      );
      if (r.rowCount !== 1) return { close_boundary_utc: null, boundary_source: null };
      const g = r.rows[0] as {
        id: string; status: string;
        scheduled_start_utc: Date | null; actual_start_utc: Date | null;
      };
      const b = evaluateCloseBoundary({
        internal_game_id: g.id,
        status: g.status,
        scheduled_start_utc: g.scheduled_start_utc === null ? null : g.scheduled_start_utc.toISOString(),
        actual_start_utc: g.actual_start_utc === null ? null : g.actual_start_utc.toISOString(),
      } as never);
      return { close_boundary_utc: b.close_boundary_utc, boundary_source: b.boundary_source };
    },

    // THE PAID SEAM. Reached only after the owner's gates pass. One event.
    fetchSnapshot: async (plan: ScopedRetrievalPlan) => {
      const res = await fetchHistoricalEventOdds(cfg.oddsapi_config, {
        api_key: cfg.api_key,
        at_timestamp: plan.at_timestamp,
        provider_event_id: plan.provider_event_id,
        market_keys: [...plan.market_keys],
        bookmaker_keys: [...plan.bookmaker_keys],
        odds_format: 'american',
      });
      if (res.status !== 200 || res.body_json === null) {
        // No blind retry: surface and stop.
        throw new Error(
          `V1-OP-8: historical fetch failed (status=${res.status}, parse=${res.parse_state}). ` +
            `No retry attempted; no rows written.`,
        );
      }
      // Provider's own accounting for reconciliation against the forecast.
      const raw = res.headers['x-requests-last'];
      const observed = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN;
      const observed_x_requests_last = Number.isFinite(observed) ? observed : null;
      // GAP-38: reconcile forecast vs the provider's own accounting and hold
      // the verdict so the persist writes it to the ledger.
      const rq = reconcileQuota({
        forecast: plan.forecast_total_credits,
        observed_x_requests_last,
      });
      quota_reconciliation = {
        forecast: rq.forecast,
        observed: rq.observed,
        delta_flag: rq.delta_flag,
        x_requests_last: observed_x_requests_last,
      };
      return {
        response: res.body_json as HistoricalEventOddsResponse,
        observed_x_requests_last,
        // carried for persistence lineage
        __headers: res.headers,
        __redacted_url: res.redacted_request_url,
      } as never;
    },

    loadFixtureSnapshot: base.loadFixtureSnapshot,
    processSnapshot: base.processSnapshot,

    // COMMITTED per-triple persistence. GAP-37: one transaction per triple.
    persistTriple: async (group: TripleGroup, ctx) => {
      cfg.on_before_persist_triple?.(group, persistIndex);
      persistIndex += 1;
      const r = await persistHistoricalSnapshot(cfg.pool, {
        seed_run_id: cfg.seed_run_id,
        provider_event_id: ctx.plan.provider_event_id,
        linked_internal_game_id: ctx.plan.internal_game_id,
        linked_internal_player_ids_by_normalized_name: cfg.player_ids_by_normalized_name,
        market_key: group.market_key,
        bookmaker_key: group.bookmaker_key,
        bookmaker_title: group.bookmaker_key,
        requested_close_boundary_utc: ctx.plan.at_timestamp,
        provider_snapshot_time: ctx.snapshot_timestamp,
        retrieved_at: new Date().toISOString(),
        close_capture: ctx.close_capture,
        redacted_request_url: redactedHistoricalUrl(ctx.plan.provider_event_id, ctx.plan.at_timestamp),
        request_params: {
          date: ctx.plan.at_timestamp,
          markets: [group.market_key],
          bookmakers: [group.bookmaker_key],
          oddsFormat: 'american',
        },
        response_headers: {},
        raw_response_body: null,
        raw_response_body_text: null,
        candidates: group.candidates,
        // GAP-38: present only on a live (paid) run; undefined otherwise, so
        // the persist keeps its historical null-column behavior.
        ...(quota_reconciliation !== undefined ? { quota_reconciliation } : {}),
      });
      return { source_closing_quote_ids: r.source_closing_quote_ids };
    },

    // COMMITTED canonical owner, RESTRICTED to the one target game.
    runCanonicalForGame: async (internal_game_id: string) => {
      const r = await deleteAndReplaceCanonicalClosingPointsFromDb(cfg.pool, {
        restrict_to_internal_game_ids: [internal_game_id],
        computation_version: CANONICAL_COMPUTATION_VERSION,
      });
      return { inserted: r.inserted };
    },

    // COMMITTED hlr populator, RESTRICTED to the one target game (54c346d).
    runHlrForGame: async (internal_game_id: string) => {
      const c = await runHistoricalLineResultsBackfill({
        connection_string: cfg.connection_string,
        restrict_to_internal_game_ids: [internal_game_id],
      });
      return { rows_inserted: c.rows_inserted, rows_updated: c.rows_updated };
    },
  };
}

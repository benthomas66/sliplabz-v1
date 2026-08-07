// GAP-47 — the billing record must survive a persistence rollback.
//
// THE DEFECT THIS FIXES. `persistHistoricalSnapshotInTx` wrote the
// `oddsapi_ingestion_runs` row carrying the quota trail INSIDE the game-level
// transaction (the GAP-37 Option-A design). The provider charges the moment it
// responds — before that transaction opens — so when a game rolled back, the
// billing evidence for an already-consumed credit rolled back with it. Measured
// live in tranche-1: balance fell 120cr while the ledger recorded 80cr; the
// 40cr spent on the interrupted game left no trace in the database at all.
//
// THE PRINCIPLE. Persistence SHOULD be atomic; billing SHOULD NOT. They have
// different truth conditions: a quote is true only if the whole game landed, but
// a charge is true the instant the provider answered, regardless of what we then
// managed to store. Entangling them makes the ledger lie in exactly the case it
// most needs to be honest — a failed run.
//
// So this writer commits ONE row per paid call in its OWN short transaction, at
// fetch-return, before the game transaction is opened. It composes with GAP-46:
// GAP-46 made the trail appear exactly once, this makes that once durable.

import type { Tx } from '../db/transaction.js';
import type { QuotaDeltaFlag } from '../shared/enums.js';

/**
 * A billing-only ingestion-run row. Carries the charge and its reconciliation;
 * it deliberately records no candidates, offerings or snapshot — those belong to
 * the persistence transaction and may legitimately never exist.
 */
export const PAID_CALL_BILLING_INSERT_SQL = `INSERT INTO oddsapi_ingestion_runs (
     request_kind,
     endpoint,
     requested_provider_event_id,
     requested_market_keys,
     requested_bookmaker_keys,
     requested_effective_time,
     request_params,
     redacted_request_url,
     started_at,
     completed_at,
     http_status_last,
     content_type_last,
     response_headers_last,
     result_state,
     quota_forecast,
     quota_observed,
     quota_delta_flag,
     x_requests_last,
     x_requests_remaining,
     x_requests_used
   ) VALUES ('historical_query','historical_event_odds',$1,$2::jsonb,$3::jsonb,$4::timestamptz,$5::jsonb,$6,$7::timestamptz,$8::timestamptz,$9,$10,$11::jsonb,'complete',$12,$13,$14::quota_delta_flag,$15,$16,$17)
   RETURNING oddsapi_ingestion_run_id`;

export interface PaidCallBillingInput {
  readonly provider_event_id: string;
  readonly internal_game_id: string;
  readonly close_boundary_utc: string;
  readonly market_keys: ReadonlyArray<string>;
  readonly bookmaker_keys: ReadonlyArray<string>;
  readonly redacted_request_url: string;
  readonly http_status: number;
  readonly retrieved_at: string;
  readonly response_headers: Readonly<Record<string, unknown>>;
  readonly quota: {
    readonly forecast: number;
    readonly observed: number | null;
    readonly delta_flag: QuotaDeltaFlag;
    readonly x_requests_last: number | null;
    readonly x_requests_remaining: number | null;
    readonly x_requests_used: number | null;
  };
}

/**
 * Persist the billing record for ONE paid call.
 *
 * MUST be called in its own short transaction, immediately after the fetch
 * returns and BEFORE the game transaction opens — that ordering is the whole
 * point, and it is asserted by fault-injection test.
 */
export async function recordPaidCallBillingInTx(
  tx: Tx,
  input: PaidCallBillingInput,
): Promise<string> {
  const res = await tx.query(PAID_CALL_BILLING_INSERT_SQL, [
    input.provider_event_id,
    JSON.stringify(input.market_keys),
    JSON.stringify(input.bookmaker_keys),
    input.close_boundary_utc,
    JSON.stringify({
      billing_only: true,
      internal_game_id: input.internal_game_id,
      close_boundary_utc: input.close_boundary_utc,
      note: 'GAP-47: durable charge record, committed independently of persistence',
    }),
    input.redacted_request_url,
    input.retrieved_at,
    input.retrieved_at,
    input.http_status,
    'application/json',
    JSON.stringify(input.response_headers),
    input.quota.forecast,
    input.quota.observed,
    input.quota.delta_flag,
    input.quota.x_requests_last,
    input.quota.x_requests_remaining,
    input.quota.x_requests_used,
  ]);
  return (res.rows[0] as { oddsapi_ingestion_run_id: string }).oddsapi_ingestion_run_id;
}

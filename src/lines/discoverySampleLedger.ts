// V1-OP-8b §0.4 — discovery-call billing ledger writer.
//
// ADDITIVE. STEP 0 established that the committed discovery path
// (`fetchHistoricalEvents`) persists NO ledger row: `persistHistoricalSnapshot`
// hardcodes `'historical_query'`/`'historical_event_odds'` and is not reusable
// for a 1cr discovery call. The enums already carry the right labels
// (`oddsapi_request_kind.event_discovery`, `oddsapi_endpoint.historical_events`),
// so this writer fills the gap WITHOUT touching the 40cr persist contract.
//
// One row per paid discovery call, so the sample's spend is reconstructable
// from the database alone — the GAP-38/GAP-40 discipline extended to discovery.
// This is the discovery sample's ONLY write.

import type { Tx } from '../db/transaction.js';
import type { DiscoveryLedgerRow } from './unmappedDiscoverySample.js';

/**
 * The ledger INSERT for ONE discovery call.
 *
 * Terminal by construction (`result_state='complete'`): the caller only reaches
 * here after a 200, and a failed date halts the run rather than writing a row.
 * Every quota column the trail carries is bound — a null here would repeat
 * GAP-40, where the contract silently dropped the balance curve.
 */
export const DISCOVERY_LEDGER_INSERT_SQL = `INSERT INTO oddsapi_ingestion_runs (
     request_kind,
     endpoint,
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
   ) VALUES ('event_discovery','historical_events',$1,$2::jsonb,$3,$4,$5,200,'application/json',$6::jsonb,'complete',$7,$8,$9::quota_delta_flag,$10,$11,$12)
   RETURNING oddsapi_ingestion_run_id`;

export interface DiscoveryLedgerInput {
  readonly row: DiscoveryLedgerRow;
  readonly at_timestamp: string;
  readonly redacted_request_url: string;
  readonly response_headers: Readonly<Record<string, unknown>>;
  readonly retrieved_at: string;
}

/** Persist one discovery call's billing row. Returns the ledger row id. */
export async function recordDiscoveryLedgerInTx(
  tx: Tx,
  input: DiscoveryLedgerInput,
): Promise<string> {
  const r = input.row;
  const res = await tx.query(DISCOVERY_LEDGER_INSERT_SQL, [
    input.at_timestamp,
    JSON.stringify({
      slate_date: r.slate_date,
      at_timestamp: input.at_timestamp,
      sample: 'V1-OP-8b-0.4-unmapped-tail-discovery',
      cumulative_sample_spend: r.cumulative_sample_spend,
    }),
    input.redacted_request_url,
    input.retrieved_at,
    input.retrieved_at,
    JSON.stringify(input.response_headers),
    r.forecast,
    r.observed,
    r.delta_flag,
    r.x_requests_last,
    r.x_requests_remaining,
    r.x_requests_used,
  ]);
  return (res.rows[0] as { oddsapi_ingestion_run_id: string }).oddsapi_ingestion_run_id;
}

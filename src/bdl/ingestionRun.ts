// Ingestion-run lifecycle helpers.
//
// Authority:
//   BDL sub-spec §19.1 (run fields + completion state)
//   BDL sub-spec §14 (retention of endpoint, params, retrieved_at,
//     page count, row count, cursor chain, success/failure)
//   BDL sub-spec §15A.4 (rate-limit headers retained from both success and
//     failure responses when present)
//   Complete spec §9.2 (partial traversal cannot advance watermark)
//
// The functions here build the run objects that the persistence layer will
// insert. Persistence is deliberately not wired up in V1-2; the ticket does
// not authorize a database client library and expressly requires idempotent
// upserts and correction-safe writes, which the schema now supports.

import type {
  BdlEndpoint,
  BdlRunState,
} from '../shared/enums.js';
import type {
  IngestionRunClosed,
  IngestionRunOpen,
} from './types.js';

export interface OpenRunInput {
  readonly bdl_ingestion_run_id: string;
  readonly endpoint: BdlEndpoint;
  readonly request_params?: Readonly<Record<string, unknown>>;
  readonly query_scope_key: string;
  readonly started_at: string; // ISO-8601 UTC
}

/**
 * Compose an in-flight run record. `completion_state` is fixed to
 * 'running'; only `closeRun` may set a terminal state.
 */
export function openRun(input: OpenRunInput): IngestionRunOpen {
  return Object.freeze({
    bdl_ingestion_run_id: input.bdl_ingestion_run_id,
    endpoint: input.endpoint,
    request_params: Object.freeze({ ...(input.request_params ?? {}) }),
    query_scope_key: input.query_scope_key,
    started_at: input.started_at,
    completion_state: 'running' as const,
  });
}

export interface CloseRunInput {
  readonly open: IngestionRunOpen;
  readonly completed_at: string;
  readonly page_count: number;
  readonly row_count: number;
  readonly cursor_chain_sent: ReadonlyArray<string | null>;
  readonly cursor_chain_returned: ReadonlyArray<string | null>;
  readonly http_status_last: number | null;
  readonly content_type_last: string | null;
  readonly response_headers_last: Readonly<Record<string, string | number>>;
  readonly completion_state: BdlRunState;
  readonly failure_detail: string | null;
  readonly normalization_version?: number;
}

/**
 * Close a run with a terminal state. Only `completion_state === 'complete'`
 * is eligible for advancing a watermark; that decision lives in watermark.ts.
 *
 * Invariants preserved:
 *   * completion_state must not be 'running'
 *   * completed_at required
 *   * cursor_chain_sent length equals page_count for successful runs; may
 *     be one longer than pages recorded for a failed page (the failed
 *     attempt still counts as a "sent" cursor)
 */
export function closeRun(input: CloseRunInput): IngestionRunClosed {
  if (input.completion_state === 'running') {
    throw new Error(
      `closeRun called with completion_state='running'; use openRun to build in-flight state`
    );
  }
  if (input.completed_at === '') {
    throw new Error(`closeRun requires a completed_at timestamp`);
  }
  return Object.freeze({
    bdl_ingestion_run_id: input.open.bdl_ingestion_run_id,
    endpoint: input.open.endpoint,
    request_params: input.open.request_params,
    query_scope_key: input.open.query_scope_key,
    started_at: input.open.started_at,
    completed_at: input.completed_at,
    page_count: input.page_count,
    row_count: input.row_count,
    cursor_chain_sent: Object.freeze(
      input.cursor_chain_sent.slice()
    ) as ReadonlyArray<string | null>,
    cursor_chain_returned: Object.freeze(
      input.cursor_chain_returned.slice()
    ) as ReadonlyArray<string | null>,
    http_status_last: input.http_status_last,
    content_type_last: input.content_type_last,
    response_headers_last: Object.freeze({
      ...input.response_headers_last,
    }) as Readonly<Record<string, string | number>>,
    completion_state: input.completion_state,
    failure_detail: input.failure_detail,
    normalization_version: input.normalization_version ?? 1,
  });
}

/**
 * True iff this run may advance a completeness watermark. The single
 * canonical predicate; every watermark-advancement code path must consult
 * this — not check the state directly — so a future change of the rule
 * (should one ever land via an authority amendment) lives in one place.
 */
export function runMayAdvanceWatermark(run: IngestionRunClosed): boolean {
  return run.completion_state === 'complete';
}

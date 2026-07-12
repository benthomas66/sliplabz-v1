// Import-watermark advancement.
//
// Authority:
//   BDL sub-spec §19.4 (watermarks maintained separately per endpoint +
//     query scope)
//   BDL sub-spec §19.1 last paragraph (partial or failed run may not
//     advance a complete-import watermark)
//   Complete spec §9.2 (partial traversal cannot advance watermark)
//   Ticket V1-2 hard invariant: partial imports never advance completeness
//
// This module is the single canonical decision point for advancing an
// ingestion watermark. Two rules:
//   1. The run's completion_state must be exactly 'complete'.
//   2. The run's endpoint must match the watermark's endpoint AND the
//      run's query_scope_key must match the watermark's query_scope_key.
//
// If both hold, the watermark advances to the run's completed_at and the
// prior state is preserved for audit.

import type {
  ImportWatermark,
  IngestionRunClosed,
} from './types.js';
import { runMayAdvanceWatermark } from './ingestionRun.js';

export interface WatermarkAdvancement {
  readonly advanced: boolean;
  readonly next: ImportWatermark;
  readonly refusal_reason: string | null;
}

/**
 * Compute the next watermark state given a closed run and the current
 * watermark. Returns `advanced: false` when the run is ineligible; in
 * that case `next` is byte-identical to `current`.
 */
export function advanceWatermark(
  current: ImportWatermark,
  run: IngestionRunClosed
): WatermarkAdvancement {
  if (!runMayAdvanceWatermark(run)) {
    return {
      advanced: false,
      next: current,
      refusal_reason: `run completion_state = ${run.completion_state}; only 'complete' may advance watermark`,
    };
  }
  if (current.endpoint !== run.endpoint) {
    return {
      advanced: false,
      next: current,
      refusal_reason: `endpoint mismatch: watermark=${current.endpoint} vs run=${run.endpoint}`,
    };
  }
  if (current.query_scope_key !== run.query_scope_key) {
    return {
      advanced: false,
      next: current,
      refusal_reason: `query_scope_key mismatch: watermark='${current.query_scope_key}' vs run='${run.query_scope_key}'`,
    };
  }
  // Never rewind.
  if (
    current.completed_at !== null &&
    new Date(run.completed_at).getTime() <
      new Date(current.completed_at).getTime()
  ) {
    return {
      advanced: false,
      next: current,
      refusal_reason: `run.completed_at=${run.completed_at} predates current watermark completed_at=${current.completed_at}`,
    };
  }
  return {
    advanced: true,
    next: Object.freeze({
      endpoint: current.endpoint,
      query_scope_key: current.query_scope_key,
      completed_at: run.completed_at,
      completed_by_run_id: run.bdl_ingestion_run_id,
      completed_row_count: run.row_count,
      completed_page_count: run.page_count,
      previous_completed_at: current.completed_at,
      previous_completed_by_run_id: current.completed_by_run_id,
    }),
    refusal_reason: null,
  };
}

/**
 * Build an empty watermark for (endpoint, scope_key). Used at first-time
 * setup and by tests as a clean starting state.
 */
export function emptyWatermark(
  endpoint: ImportWatermark['endpoint'],
  query_scope_key: string
): ImportWatermark {
  return Object.freeze({
    endpoint,
    query_scope_key,
    completed_at: null,
    completed_by_run_id: null,
    completed_row_count: null,
    completed_page_count: null,
    previous_completed_at: null,
    previous_completed_by_run_id: null,
  });
}

// Distinguishing successful-empty polls from failed polls.
//
// Authority:
//   Odds sub-spec §10.14 (successful empty bookmaker list is a valid
//     zero-coverage observation only after a successful schema-valid response)
//   Odds sub-spec §16.1 (a failed poll does NOT overwrite the last valid
//     snapshot; a successful schema-valid empty response is stored as a
//     new zero-coverage observation)
//   Odds sub-spec §19.3 (failure behavior)
//   Odds sub-spec §20 (successful empty vs failed poll: distinct storage)
//   Ticket V1-3 hard invariant: empty success and failed poll produce
//     distinguishable stored states; freshness semantics differ.

import type { OddsapiRunState } from '../shared/enums.js';
import { validateEventOddsResponseShape } from './schemaValidation.js';

export interface PollClassificationInput {
  readonly http_status: number;
  readonly content_type: string | null;
  readonly parsed_body: unknown;
  readonly transport_error_detail: string | null;
}

export interface PollClassification {
  readonly result_state: OddsapiRunState;
  readonly overwrites_last_valid_snapshot: boolean;
  readonly detail: string;
}

/**
 * Classify a single event-odds poll's result.
 *
 * Precedence:
 *   1. transport error (no HTTP response) → `failed_transport`
 *   2. 400/422                            → `failed_invalid_request`
 *   3. 401                                → `failed_authentication_or_access`
 *   4. 403                                → `failed_forbidden_or_subscription`
 *   5. 404                                → `failed_not_found`
 *   6. 429                                → `failed_rate_limited`
 *   7. 5xx                                → `failed_transport`
 *   8. 2xx + valid_empty                  → `successful_empty` (OVERWRITES current)
 *   9. 2xx + schema_drift                 → `failed_schema_drift`
 *  10. 2xx + valid                        → `complete`
 *
 * `overwrites_last_valid_snapshot` is true ONLY for `complete` and
 * `successful_empty` — §16.1 explicit.
 */
export function classifyPollResult(
  input: PollClassificationInput
): PollClassification {
  if (input.transport_error_detail !== null) {
    return {
      result_state: 'failed_transport',
      overwrites_last_valid_snapshot: false,
      detail: input.transport_error_detail,
    };
  }
  const s = input.http_status;
  if (s === 400 || s === 422) {
    return {
      result_state: 'failed_invalid_request',
      overwrites_last_valid_snapshot: false,
      detail: `HTTP ${s}`,
    };
  }
  if (s === 401) {
    return {
      result_state: 'failed_authentication_or_access',
      overwrites_last_valid_snapshot: false,
      detail: 'HTTP 401',
    };
  }
  if (s === 403) {
    return {
      result_state: 'failed_forbidden_or_subscription',
      overwrites_last_valid_snapshot: false,
      detail: 'HTTP 403',
    };
  }
  if (s === 404) {
    return {
      result_state: 'failed_not_found',
      overwrites_last_valid_snapshot: false,
      detail: 'HTTP 404',
    };
  }
  if (s === 429) {
    return {
      result_state: 'failed_rate_limited',
      overwrites_last_valid_snapshot: false,
      detail: 'HTTP 429',
    };
  }
  if (s >= 500 && s < 600) {
    return {
      result_state: 'failed_transport',
      overwrites_last_valid_snapshot: false,
      detail: `HTTP ${s}`,
    };
  }
  if (s < 200 || s >= 300) {
    return {
      result_state: 'failed_transport',
      overwrites_last_valid_snapshot: false,
      detail: `HTTP ${s} not in success range`,
    };
  }
  // 2xx path.
  const shape = validateEventOddsResponseShape(input.parsed_body);
  if (shape.kind === 'schema_drift') {
    return {
      result_state: 'failed_schema_drift',
      overwrites_last_valid_snapshot: false,
      detail: `schema drift: ${shape.detail}`,
    };
  }
  if (shape.kind === 'valid_empty') {
    return {
      result_state: 'successful_empty',
      overwrites_last_valid_snapshot: true,
      detail: shape.detail,
    };
  }
  return {
    result_state: 'complete',
    overwrites_last_valid_snapshot: true,
    detail: shape.detail,
  };
}

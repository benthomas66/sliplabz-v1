// V1-5 server-side read path.
//
// Single canonical read-path function consumed by both product surfaces
// and Brief. Takes a request (identifiers + capability) and returns a
// filtered, capability-safe payload.
//
// The read path is a pure composition over the metric owners:
//   1. Compose the row via `composeCurrentMarketRow` (metric owners fire).
//   2. Filter by capability via `filterCurrentMarketRow`.
//   3. The result is JSON-serializable and safe to send to the client.
//
// Load-bearing invariant: paid-only fields are STRIPPED before
// serialization (§16.7). The unauthorized-client test proves this by
// requesting a row with `CAPABILITY_ANONYMOUS` and asserting the payload
// contains no `book_detail.offerings` and no `availability_context`
// beyond the redaction marker.

import { composeCurrentMarketRow, type CurrentMarketRowInput } from './currentMarketRow.js';
import { filterCurrentMarketRow, type FilteredCurrentMarketRow } from './capabilityFilter.js';
import type { Capability } from './capability.js';

export interface ReadCurrentMarketRowInput {
  readonly row: CurrentMarketRowInput;
  readonly capability: Capability;
}

/**
 * Read the current market row for a caller. Deterministic on identical
 * inputs — the Brief/app equality test asserts this.
 */
export function readCurrentMarketRow(
  input: ReadCurrentMarketRowInput
): FilteredCurrentMarketRow {
  const composed = composeCurrentMarketRow(input.row);
  return filterCurrentMarketRow(composed, input.capability);
}

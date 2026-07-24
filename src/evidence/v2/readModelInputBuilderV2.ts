// V1-A2-4 — v2 read-model input builder (production wiring).
//
// This is the production path that supplies a `V2BuildProfileInput` to
// `runEvidencePopulatorV2`. It is a THIN adapter over v1's canonical
// read-model builder (`makeReadModelInputBuilder`), which — as of
// V1-A2-4 — returns `line_observed_at` alongside `{ input, audit }`.
//
// WHY AN ADAPTER, NOT A SECOND BUILDER (governor-directed design):
//   There is ONE owner of read-model input assembly: v1's
//   `readModelInputBuilder.ts`. v2 does NOT fork that logic and does NOT
//   run a second query for the observation timestamp. It consumes the
//   extended v1 result verbatim. The only thing this file adds is the
//   grain-type bridge (`V2EvidenceGrain` → `EvidenceGrain`, structurally
//   identical) and a named entry point so the v2 populator can be wired
//   in production with NO hardcoded literals in its input path.
//
// `line_observed_at` semantics (unchanged from the v1 builder):
//   the freshest `market_snapshots.observed_at` across the grain's
//   current-poll, self-observed offerings — an OBSERVATION time, never a
//   processing/clock time — or `null` when the grain has no such offering.

import type { Tx } from '../../db/transaction.js';
import type { EvidenceGrain } from '../driver/populate.js';
import {
  makeReadModelInputBuilderV2Core,
  type ReadModelBuilderContext,
} from '../driver/readModelInputBuilder.js';
import type { V2BuildProfileInput, V2EvidenceGrain } from './populateV2.js';

/**
 * Construct the production `V2BuildProfileInput` for `runEvidencePopulatorV2`.
 *
 * `ctx` carries `today_utc_date` + `reference_date` exactly as the v1
 * default builder requires (DR-25 coverage predicate + §H reproducibility).
 * Both are injected by the caller (operator); this factory reads no clock.
 */
export function makeV2ReadModelInputBuilder(
  ctx: ReadModelBuilderContext
): V2BuildProfileInput {
  // V1-A2-5: the v2 builder core assembles the current market row via the
  // FRESHNESS-NEUTRAL v2 composer wrapper (no wall-clock gate, no clock).
  // Before V1-A2-5 this wrapped the v1 wall-clock builder, which was the
  // GAP-12 blocker: the v1 gate zeroed book_count for grains > ~300s old, so
  // v2 mis-classified them `absent`. The v2 path is now clock-free.
  const v2CoreBuilder = makeReadModelInputBuilderV2Core(ctx);
  return async (grain: V2EvidenceGrain, tx: Tx) => {
    // V2EvidenceGrain and EvidenceGrain are structurally identical (same
    // five fields); the bridge is a type-narrowing pass-through, not a
    // reshape. The v2 core builder returns exactly
    // `{ input, line_observed_at, audit } | null` — the V2BuildProfileInput
    // contract — so its result flows straight through.
    const v1Grain: EvidenceGrain = {
      internal_game_id: grain.internal_game_id,
      internal_player_id: grain.internal_player_id,
      market_key: grain.market_key,
      current_market_row_id: grain.current_market_row_id,
      source_read_model_computation_version: grain.source_read_model_computation_version,
    };
    return v2CoreBuilder(v1Grain, tx);
  };
}

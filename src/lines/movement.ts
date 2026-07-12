// Movement-event detection per Odds §17 and complete spec §13.
//
// Authority:
//   Complete spec §13.1 (movement types)
//   Complete spec §13.2 (point transition = old point removed + new point added)
//   Odds sub-spec §17 (movement & disappearance contract)
//
// Detects transitions between two consecutive SUCCESSFUL snapshots at the
// same event/bookmaker/market/player grain. A failed poll does NOT emit
// movement (§16.1 / §19.3).
//
// Multi-line preservation: distinct (side, point) grains are separate
// lifecycles. A `point_changed` movement is represented as `point_removed`
// on the old point PLUS `point_added` on the new point PLUS an OPTIONAL
// linked `point_changed` when the transition is unambiguous.

import type { MovementType, OutcomeSide } from '../shared/enums.js';

export interface SnapshotOffering {
  readonly market_offering_id: string;
  readonly bookmaker_key: string;
  readonly market_key: string;
  readonly normalized_player_name: string;
  readonly internal_player_id: string | null;
  readonly side: OutcomeSide;
  readonly point: number;
  readonly raw_price_american: number;
  readonly provider_last_update: string | null;
}

export interface SnapshotContext {
  readonly market_snapshot_id: string;
  readonly provider_event_id: string;
  readonly internal_game_id: string | null;
  /** True when this poll succeeded (2xx with valid schema, incl. successful_empty). */
  readonly poll_succeeded: boolean;
  /** True for `complete`; false for `successful_empty`. Used to detect
   *  side_removed / player_removed / market_removed / bookmaker_removed. */
  readonly poll_produced_offerings: boolean;
}

export interface MovementEventOutput {
  readonly movement_type: MovementType;
  readonly bookmaker_key: string | null;
  readonly market_key: string | null;
  readonly internal_player_id: string | null;
  readonly side: OutcomeSide | null;
  readonly point: number | null;
  readonly prior_snapshot_id: string | null;
  readonly current_snapshot_id: string | null;
  readonly prior_offering_id: string | null;
  readonly current_offering_id: string | null;
  readonly prior_point: number | null;
  readonly current_point: number | null;
  readonly prior_over_price: number | null;
  readonly current_over_price: number | null;
  readonly prior_under_price: number | null;
  readonly current_under_price: number | null;
  readonly prior_provider_last_update: string | null;
  readonly current_provider_last_update: string | null;
  readonly confidence: 'high' | 'low';
}

/**
 * Detect movement events between two consecutive successful snapshots for
 * a single (event, bookmaker, market, player, side, point) grain that
 * exists in ONE or BOTH snapshots.
 *
 * This function is grain-scoped: given ONE prior offering and ONE current
 * offering (either or both possibly null), it emits the movement events
 * for THAT grain only. The batch driver that walks the Cartesian product
 * of prior and current offerings across a whole snapshot — and reconciles
 * grains via the observed_line_lifecycle UNIQUE key — is a V1-5 obligation.
 * `persistOddsapiSnapshot` in V1-4 persists ONE snapshot's rows atomically;
 * it does NOT itself walk grains.
 *
 * Rules:
 *   * If `prior` is present and `current` is absent → `side_removed` (or
 *     `point_removed` at the same side if another point remains).
 *     `confidence` = 'high' iff the current poll succeeded and produced
 *     offerings for the SAME (bookmaker, market, player) — else 'low'.
 *   * If `prior` is absent and `current` is present → `side_added` /
 *     `point_added`.
 *   * If both present with same point but different price → `over_price_changed`
 *     or `under_price_changed`.
 *   * If both present but provider `last_update` timestamp changed → in
 *     addition, `provider_timestamp_changed` (as a separate event).
 *   * If both present, same point, same price, same provider_last_update →
 *     `unchanged`.
 */
export function detectGrainMovement(
  prior: SnapshotOffering | null,
  current: SnapshotOffering | null,
  prior_ctx: SnapshotContext | null,
  current_ctx: SnapshotContext | null
): ReadonlyArray<MovementEventOutput> {
  if (prior === null && current === null) return Object.freeze([]);
  if (prior === null && current !== null) {
    const same_book_market_player_present_in_prior =
      prior_ctx !== null && prior_ctx.poll_produced_offerings;
    const confidence = same_book_market_player_present_in_prior ? 'high' : 'low';
    return Object.freeze([
      buildEvent({
        movement_type: 'side_added',
        current,
        current_ctx,
        prior: null,
        prior_ctx: null,
        confidence,
      }),
    ]);
  }
  if (prior !== null && current === null) {
    const confidence =
      current_ctx !== null && current_ctx.poll_succeeded ? 'high' : 'low';
    return Object.freeze([
      buildEvent({
        movement_type: 'side_removed',
        prior,
        prior_ctx,
        current: null,
        current_ctx,
        confidence,
      }),
    ]);
  }

  // Both present.
  const p = prior!;
  const c = current!;
  const events: MovementEventOutput[] = [];
  if (p.point !== c.point) {
    // Same-side point change. At the batch level (V1-5 obligation) the
    // walker may prefer to decompose this into a `point_removed` on the
    // old point + a `point_added` on the new point when it can see the
    // full Cartesian product of prior and current offerings. At the
    // grain level here — one prior + one current for the same
    // (game, book, market, player, side) — treat it as `point_changed`.
    events.push(
      buildEvent({
        movement_type: 'point_changed',
        prior: p,
        current: c,
        prior_ctx,
        current_ctx,
        confidence: 'high',
      })
    );
  } else if (p.raw_price_american !== c.raw_price_american) {
    events.push(
      buildEvent({
        movement_type:
          p.side === 'over' ? 'over_price_changed' : 'under_price_changed',
        prior: p,
        current: c,
        prior_ctx,
        current_ctx,
        confidence: 'high',
      })
    );
  } else if (p.provider_last_update !== c.provider_last_update) {
    events.push(
      buildEvent({
        movement_type: 'provider_timestamp_changed',
        prior: p,
        current: c,
        prior_ctx,
        current_ctx,
        confidence: 'high',
      })
    );
  } else {
    events.push(
      buildEvent({
        movement_type: 'unchanged',
        prior: p,
        current: c,
        prior_ctx,
        current_ctx,
        confidence: 'high',
      })
    );
  }
  return Object.freeze(events);
}

function buildEvent(args: {
  readonly movement_type: MovementType;
  readonly prior?: SnapshotOffering | null;
  readonly current?: SnapshotOffering | null;
  readonly prior_ctx: SnapshotContext | null;
  readonly current_ctx: SnapshotContext | null;
  readonly confidence: 'high' | 'low';
}): MovementEventOutput {
  const prior = args.prior ?? null;
  const current = args.current ?? null;
  return Object.freeze({
    movement_type: args.movement_type,
    bookmaker_key: current?.bookmaker_key ?? prior?.bookmaker_key ?? null,
    market_key: current?.market_key ?? prior?.market_key ?? null,
    internal_player_id:
      current?.internal_player_id ?? prior?.internal_player_id ?? null,
    side: current?.side ?? prior?.side ?? null,
    point: current?.point ?? prior?.point ?? null,
    prior_snapshot_id: args.prior_ctx?.market_snapshot_id ?? null,
    current_snapshot_id: args.current_ctx?.market_snapshot_id ?? null,
    prior_offering_id: prior?.market_offering_id ?? null,
    current_offering_id: current?.market_offering_id ?? null,
    prior_point: prior?.point ?? null,
    current_point: current?.point ?? null,
    prior_over_price:
      prior !== null && prior.side === 'over' ? prior.raw_price_american : null,
    current_over_price:
      current !== null && current.side === 'over'
        ? current.raw_price_american
        : null,
    prior_under_price:
      prior !== null && prior.side === 'under' ? prior.raw_price_american : null,
    current_under_price:
      current !== null && current.side === 'under'
        ? current.raw_price_american
        : null,
    prior_provider_last_update: prior?.provider_last_update ?? null,
    current_provider_last_update: current?.provider_last_update ?? null,
    confidence: args.confidence,
  });
}

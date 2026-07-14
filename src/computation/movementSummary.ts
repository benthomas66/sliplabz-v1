// V1-5 movement summary per §13.
//
// Rolls up movement_events for a (game, player, market) grain into a compact
// summary. The full walk-back-able detail lives in movement_events.
//
// This is a pure aggregator over movement_events + first-observed +
// current-consensus inputs. The batch driver that WRITES movement_events
// (V1-5 obligation #1) lives in `driver/movementLifecycleBatch.ts`.

import { methodVersionOf } from './computationVersion.js';
import type { MovementSummaryResult } from './types.js';

export interface MovementEventForSummary {
  readonly movement_type:
    | 'point_changed'
    | 'over_price_changed'
    | 'under_price_changed'
    | 'side_added'
    | 'side_removed'
    | 'point_added'
    | 'point_removed'
    | 'player_added'
    | 'player_removed'
    | 'market_added'
    | 'market_removed'
    | 'source_added'
    | 'source_removed'
    | 'duplicate_state_changed'
    | 'provider_timestamp_changed'
    | 'unchanged';
  readonly bookmaker_key: string | null;
  readonly prior_point: number | null;
  readonly current_point: number | null;
}

export function computeMovementSummary(
  events: ReadonlyArray<MovementEventForSummary>,
  first_observed_point: number | null,
  current_point: number | null
): MovementSummaryResult {
  let point_changes_observed = 0;
  let over_price_changes = 0;
  let under_price_changes = 0;
  let side_removed_count = 0;
  let side_added_count = 0;
  for (const e of events) {
    switch (e.movement_type) {
      case 'point_changed': point_changes_observed += 1; break;
      case 'over_price_changed': over_price_changes += 1; break;
      case 'under_price_changed': under_price_changes += 1; break;
      case 'side_removed': side_removed_count += 1; break;
      case 'side_added': side_added_count += 1; break;
      default: break;
    }
  }
  const net =
    first_observed_point !== null && current_point !== null
      ? Math.round((current_point - first_observed_point) * 100) / 100
      : null;
  return Object.freeze({
    first_observed_point,
    current_point,
    net_point_movement: net,
    point_changes_observed,
    over_price_changes,
    under_price_changes,
    side_removed_count,
    side_added_count,
    method_version: methodVersionOf('movement_summary'),
  });
}

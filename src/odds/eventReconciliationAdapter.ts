// Odds API → V1-1 event-reconciliation adapter.
//
// Authority:
//   Odds sub-spec §6 (BALLDONTLIE event reconciliation policy)
//   Odds sub-spec §6.1 (ordered team + time tolerance)
//   Odds sub-spec §14.6, §14.7 (mapping table stores time delta + alias version)
//   Odds sub-spec §25 (cross-provider integration handoff)
//   Complete spec §7.2 (event mapping)
//   V1_IDENTITY_CONTRACT.md (consume V1-1 reconcileEvent; NEVER reimplement)
//   Ticket V1-3: consuming (never modifying) the V1-1 identity modules and
//     reconciliation queues for all identity resolution.

import {
  reconcileEvent,
  type EventReconciliationContext,
} from '../identity/eventReconciliation.js';
import type {
  EventReconciliationInput,
  EventReconciliationOutcome,
} from '../identity/types.js';
import type { ValidatedEvent } from './eventDiscovery.js';

/**
 * Adapter that turns a validated Odds API event snapshot into the input the
 * V1-1 `reconcileEvent` module expects.
 *
 * The provider is fixed to `'odds_api'`; the V1-1 module uses that to look
 * up the correct approved provider_teams mappings.
 */
export function odsApiEventToReconciliationInput(
  event: ValidatedEvent
): EventReconciliationInput {
  return {
    provider: 'odds_api',
    provider_game_id: event.provider_event_id,
    raw_home_team: event.raw_home_team,
    raw_away_team: event.raw_away_team,
    raw_commence_time: event.raw_commence_time,
  };
}

/**
 * Reconcile one Odds API event via the V1-1 event-reconciliation module.
 */
export function reconcileOddsApiEvent(
  event: ValidatedEvent,
  ctx: EventReconciliationContext
): EventReconciliationOutcome {
  return reconcileEvent(odsApiEventToReconciliationInput(event), ctx);
}

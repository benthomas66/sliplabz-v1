// BDL game-status → canonical GameStatus mapping.
//
// Authority:
//   BDL sub-spec §10 (game-state authority; BDL `status` is authoritative)
//   BDL sub-spec §10 (unknown status values are quarantined)
//   Complete spec §9.6 (final status)
//   Ticket V1-2 hard invariant: finality comes only from the mapped game
//     status; never inferred from clock / period.
//   Ticket V1-2 hard invariant: unknown statuses quarantine (never guess).

import type { GameStatus } from '../shared/enums.js';
import type { GameStatusMappingResult } from './types.js';

/**
 * BDL WNBA provider status strings observed in the audit + documentation:
 *   - "Final"                     → final
 *   - "Scheduled"                 → scheduled
 *   - "InProgress" / "Live"       → live
 *   - "Postponed"                 → postponed
 *   - "Canceled" / "Cancelled"    → canceled
 *
 * The provider clock format may attach to non-terminal games as a trailing
 * time; e.g. "  4:35 4Q " strings appear as `time` but are never independent
 * status. This module never inspects clock/period.
 *
 * The map is intentionally small and conservative. Anything not in the map
 * canonicalizes to `unresolved` and `is_unknown: true`, quarantining the
 * game per BDL §10.
 */
const STATUS_MAP: ReadonlyMap<string, GameStatus> = new Map([
  ['final', 'final'],
  ['scheduled', 'scheduled'],
  ['inprogress', 'live'],
  ['in progress', 'live'],
  ['live', 'live'],
  ['postponed', 'postponed'],
  ['canceled', 'canceled'],
  ['cancelled', 'canceled'],
]);

/**
 * Map a BDL raw status string to a canonical SlipLabz GameStatus.
 *
 * NEVER falls back to any other GameStatus for unknown strings.
 * `is_unknown` = true indicates the caller must quarantine the game
 * and NOT admit dependent player-stat rows for that game.
 */
export function mapBdlGameStatus(
  raw_status: string | null | undefined
): GameStatusMappingResult {
  const raw = (raw_status ?? '').toString();
  const key = raw.trim().toLowerCase();
  if (key === '') {
    return { canonical_status: 'unresolved', raw_status: raw, is_unknown: true };
  }
  const mapped = STATUS_MAP.get(key);
  if (mapped !== undefined) {
    return { canonical_status: mapped, raw_status: raw, is_unknown: false };
  }
  return { canonical_status: 'unresolved', raw_status: raw, is_unknown: true };
}

/**
 * True only when the observed BDL row's canonical status is `final`.
 * Never derived from clock or period fields (spec §9.6, BDL §10).
 */
export function isFinal(raw_status: string | null | undefined): boolean {
  return mapBdlGameStatus(raw_status).canonical_status === 'final';
}

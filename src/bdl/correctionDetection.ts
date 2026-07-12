// Source-correction detection for player_game_stats.
//
// Authority:
//   BDL sub-spec §12C.2 (identical repeat captures produce identical
//     per-row hashes — no logical change)
//   BDL sub-spec §12C.4 (compare canonical source-field hash; record
//     changed fields; preserve prior raw representation)
//   BDL sub-spec §12C.5 (correction semantics — participation, minutes,
//     counting stats, team, presence)
//   Ticket V1-2 hard invariants:
//     - Source corrections detected, recorded, and trigger invalidation
//       hooks; never silent overwrites
//     - Historical player-game rows are stable and correction-safe
//
// This module is the sole authority on:
//   * whether two normalized player_game_stats represent the same
//     material observation;
//   * which fields changed materially;
//   * whether the change was a minutes-state transition.

import type {
  NormalizedPlayerGameStat,
  PlayerGameStatDiff,
} from './types.js';
import { COUNTING_STAT_FIELDS } from './countingStats.js';

/**
 * Compare a proposed incoming stat row against the prior canonical row (if
 * any). Returns a diff describing the change kind and which fields changed.
 *
 * `initial_observation` — no prior row existed.
 * `material_correction` — a material field changed (minutes, minutes_status,
 *   any counting stat, team assignment). Never a silent overwrite: the
 *   downstream writer creates a history row AND appends invalidations.
 * `metadata_change` — no material field changed but the source_hash still
 *   differs. Kept as its own category so V1-5 does not recompute needlessly.
 */
export function detectCorrection(
  incoming: NormalizedPlayerGameStat,
  prior: NormalizedPlayerGameStat | null
): PlayerGameStatDiff {
  if (prior === null) {
    return Object.freeze({
      change_kind: 'initial_observation' as const,
      prior_source_hash: null,
      new_source_hash: incoming.source_hash,
      changed_fields: Object.freeze([]) as ReadonlyArray<string>,
      minutes_state_changed: false,
    });
  }

  // Identical canonical hash — nothing material changed.
  if (prior.source_hash === incoming.source_hash) {
    return Object.freeze({
      change_kind: 'metadata_change' as const,
      prior_source_hash: prior.source_hash,
      new_source_hash: incoming.source_hash,
      changed_fields: Object.freeze([]) as ReadonlyArray<string>,
      minutes_state_changed: false,
    });
  }

  const changed: string[] = [];

  if (prior.minutes_status !== incoming.minutes_status) {
    changed.push('minutes_status');
  }
  if (
    prior.parsed_minutes !== incoming.parsed_minutes ||
    prior.raw_minutes !== incoming.raw_minutes
  ) {
    changed.push('minutes');
  }
  if (prior.provider_team_id !== incoming.provider_team_id) {
    changed.push('provider_team_id');
  }
  // Raw counting stats — use raw, not normalized, so a null→0 flip does
  // not falsely register when the row just became eligible for the first
  // time. Correction is about the observed provider fact.
  for (const field of COUNTING_STAT_FIELDS) {
    if (prior.raw_stats[field] !== incoming.raw_stats[field]) {
      changed.push(field);
    }
  }

  if (changed.length === 0) {
    // Hashes differ but no material field changed. Treat as metadata_change
    // rather than material_correction — protects downstream recomputation.
    return Object.freeze({
      change_kind: 'metadata_change' as const,
      prior_source_hash: prior.source_hash,
      new_source_hash: incoming.source_hash,
      changed_fields: Object.freeze([]) as ReadonlyArray<string>,
      minutes_state_changed: false,
    });
  }

  return Object.freeze({
    change_kind: 'material_correction' as const,
    prior_source_hash: prior.source_hash,
    new_source_hash: incoming.source_hash,
    changed_fields: Object.freeze(changed) as ReadonlyArray<string>,
    minutes_state_changed: prior.minutes_status !== incoming.minutes_status,
  });
}

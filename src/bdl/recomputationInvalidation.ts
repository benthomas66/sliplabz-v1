// Recomputation invalidation event builder.
//
// Authority:
//   BDL sub-spec §12C.5 (material corrections trigger recomputation of
//     L5/L10/L20 windows, averages, medians, exact-line results, hit rates,
//     streaks, cached player research views)
//   BDL sub-spec §14 (repeated pulls trigger dependent recomputation)
//   Complete spec §12 computation ownership
//   Ticket V1-2 requirement: recomputation invalidation hooks are wired at
//     material change; V1-5 will consume the queue.
//
// This module never writes to a database and never invokes computation.
// It produces the invalidation event structs the persistence layer will
// insert into `recomputation_invalidations`.

import type {
  NormalizedPlayerGameStat,
  PlayerGameStatDiff,
  RecomputationInvalidationInput,
} from './types.js';
import type {
  InvalidationEntityKind,
  InvalidationReason,
} from '../shared/enums.js';

export interface BuildInvalidationsInput {
  readonly diff: PlayerGameStatDiff;
  readonly incoming: NormalizedPlayerGameStat;
  readonly internal_player_id: string | null;
  readonly internal_game_id: string | null;
  readonly player_game_stat_id: string;
  readonly triggering_history_id: string | null;
  readonly triggering_observation_id: string | null;
  readonly observed_at: string;
}

/**
 * Build the invalidation events that must be emitted for a given diff.
 *
 * Rules:
 *   * `initial_observation`: no invalidations. First observation cannot
 *     invalidate downstream computation because there is no downstream
 *     computation yet.
 *   * `metadata_change`: no invalidations. By definition, no material
 *     field changed.
 *   * `material_correction`: one invalidation per affected entity_kind:
 *       - always: `player_game_stat` with reason `material_stat_change`
 *       - when `minutes_status` changed: additional
 *         `player_game_stat` invalidation with reason `minutes_state_change`
 *       - when the internal_player_id is known: `internal_player` with
 *         reason `material_stat_change`
 *       - when the internal_game_id is known: `internal_game` with
 *         reason `material_stat_change`
 *   * All events reference the source diff's triggering history/observation
 *     row so V1-5 can walk back to raw evidence.
 */
export function buildStatCorrectionInvalidations(
  input: BuildInvalidationsInput
): ReadonlyArray<RecomputationInvalidationInput> {
  if (input.diff.change_kind !== 'material_correction') return Object.freeze([]);

  const invalidations: RecomputationInvalidationInput[] = [];

  const pushOne = (
    entity_kind: InvalidationEntityKind,
    entity_id: string,
    reason: InvalidationReason
  ): void => {
    invalidations.push(
      Object.freeze({
        entity_kind,
        entity_id,
        reason,
        triggering_history_id: input.triggering_history_id,
        triggering_observation_id: input.triggering_observation_id,
        provider: 'balldontlie' as const,
        provider_player_id: input.incoming.provider_player_id,
        provider_game_id: input.incoming.provider_game_id,
        changed_fields: Object.freeze(
          input.diff.changed_fields.slice()
        ) as ReadonlyArray<string>,
        observed_at: input.observed_at,
      })
    );
  };

  pushOne(
    'player_game_stat',
    input.player_game_stat_id,
    'material_stat_change'
  );

  if (input.diff.minutes_state_changed) {
    pushOne(
      'player_game_stat',
      input.player_game_stat_id,
      'minutes_state_change'
    );
  }

  if (input.internal_player_id !== null) {
    pushOne(
      'internal_player',
      input.internal_player_id,
      'material_stat_change'
    );
  }
  if (input.internal_game_id !== null) {
    pushOne('internal_game', input.internal_game_id, 'material_stat_change');
  }

  return Object.freeze(invalidations);
}

/**
 * Build the invalidation event that fires when a game canonical status
 * transitions to `final` (post-final reconciliation is now due).
 */
export function buildGameStatusFinalInvalidation(input: {
  readonly internal_game_id: string;
  readonly provider_game_id: string;
  readonly triggering_observation_id: string;
  readonly observed_at: string;
}): RecomputationInvalidationInput {
  return Object.freeze({
    entity_kind: 'internal_game' as const,
    entity_id: input.internal_game_id,
    reason: 'game_status_transition_to_final' as const,
    triggering_history_id: null,
    triggering_observation_id: input.triggering_observation_id,
    provider: 'balldontlie' as const,
    provider_player_id: null,
    provider_game_id: input.provider_game_id,
    changed_fields: Object.freeze(['canonical_status']) as ReadonlyArray<string>,
    observed_at: input.observed_at,
  });
}

/**
 * Build the invalidation event that fires when a game leaves `final`
 * (an operator correction removed a prior final; every dependent stat
 * row is now non-final again and downstream metrics must recompute).
 */
export function buildGameStatusFromFinalInvalidation(input: {
  readonly internal_game_id: string;
  readonly provider_game_id: string;
  readonly triggering_observation_id: string;
  readonly observed_at: string;
}): RecomputationInvalidationInput {
  return Object.freeze({
    entity_kind: 'internal_game' as const,
    entity_id: input.internal_game_id,
    reason: 'game_status_transition_from_final' as const,
    triggering_history_id: null,
    triggering_observation_id: input.triggering_observation_id,
    provider: 'balldontlie' as const,
    provider_player_id: null,
    provider_game_id: input.provider_game_id,
    changed_fields: Object.freeze(['canonical_status']) as ReadonlyArray<string>,
    observed_at: input.observed_at,
  });
}

// Mapping-history helpers.
//
// mapping_history is append-only (see migration 11). This module produces
// well-formed history events; the caller is responsible for INSERTing them.
// Never returns a mutable object.

import type { MappingHistoryEvent } from './types.js';
import type { MappingAction, Provider } from '../shared/enums.js';

export interface RecordMappingChangeInput {
  readonly provider: Provider;
  readonly entity_kind: MappingHistoryEvent['entity_kind'];
  readonly provider_entity_id: string;
  readonly action: MappingAction;
  readonly internal_entity_id?: string;
  readonly prior_internal_entity_id?: string;
  readonly reason?: string;
  readonly mapping_version?: number;
  readonly alias_version?: number;
  readonly actor?: string;
  readonly actor_note?: string;
  readonly at?: Date;
}

export function buildMappingHistoryEvent(
  input: RecordMappingChangeInput
): MappingHistoryEvent {
  const at = input.at ?? new Date();
  return Object.freeze({
    provider: input.provider,
    entity_kind: input.entity_kind,
    provider_entity_id: input.provider_entity_id,
    internal_entity_id: input.internal_entity_id ?? null,
    prior_internal_entity_id: input.prior_internal_entity_id ?? null,
    action: input.action,
    reason: input.reason ?? '',
    mapping_version: input.mapping_version ?? null,
    alias_version: input.alias_version ?? null,
    actor: input.actor ?? 'system',
    actor_note: input.actor_note ?? null,
    created_at: at.toISOString(),
  });
}

/**
 * Compose the history events that must be emitted when a prior approved
 * mapping is replaced by a new approved mapping. The append-only invariant
 * is enforced by returning two events: one 'superseded' on the prior and
 * one 'approved' on the new mapping. Neither event overwrites data.
 */
export function buildSupersessionEvents(args: {
  readonly provider: Provider;
  readonly entity_kind: MappingHistoryEvent['entity_kind'];
  readonly provider_entity_id: string;
  readonly prior_internal_entity_id: string;
  readonly new_internal_entity_id: string;
  readonly prior_mapping_version: number;
  readonly new_mapping_version: number;
  readonly reason: string;
  readonly actor?: string;
  readonly actor_note?: string;
  readonly at?: Date;
}): ReadonlyArray<MappingHistoryEvent> {
  const supersede = buildMappingHistoryEvent({
    provider: args.provider,
    entity_kind: args.entity_kind,
    provider_entity_id: args.provider_entity_id,
    action: 'superseded',
    internal_entity_id: args.prior_internal_entity_id,
    prior_internal_entity_id: args.prior_internal_entity_id,
    reason: args.reason,
    mapping_version: args.prior_mapping_version,
    ...(args.actor !== undefined ? { actor: args.actor } : {}),
    ...(args.actor_note !== undefined ? { actor_note: args.actor_note } : {}),
    ...(args.at !== undefined ? { at: args.at } : {}),
  });
  const approve = buildMappingHistoryEvent({
    provider: args.provider,
    entity_kind: args.entity_kind,
    provider_entity_id: args.provider_entity_id,
    action: 'approved',
    internal_entity_id: args.new_internal_entity_id,
    prior_internal_entity_id: args.prior_internal_entity_id,
    reason: args.reason,
    mapping_version: args.new_mapping_version,
    ...(args.actor !== undefined ? { actor: args.actor } : {}),
    ...(args.actor_note !== undefined ? { actor_note: args.actor_note } : {}),
    ...(args.at !== undefined ? { at: args.at } : {}),
  });
  return Object.freeze([supersede, approve]);
}

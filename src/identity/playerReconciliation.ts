// Player reconciliation.
//
// Authority anchors:
//   Complete spec §7.3 (mapping order)
//   BALLDONTLIE sub-spec §12A.6 (name-matching implications)
//   Odds API sub-spec §10.11 (player reconciliation)
//
// Precedence:
//   1. Existing reviewed provider mapping (approved provider_players row).
//   2. Approved alias where the scope matches the input provider.
//   3. Normalized-name candidate PLUS event/team context.
//        - Exactly one candidate whose current_team_id agrees with the
//          provider-reported team context → propose_for_review (not
//          auto-approve; §7.3 requires reviewed action).
//   4. Otherwise queue or quarantine with a specific reason.
//
// Non-negotiable rules:
//   * Normalization alone can never create a permanent approved mapping.
//   * A single valid candidate with required event/team context is
//     `proposed_for_review`, not auto-approved.
//   * Ambiguous candidates queue; alias conflicts quarantine.
//   * Raw provider strings are never mutated (caller keeps raw fields).

import { normalizeName } from './nameNormalization.js';
import type {
  Alias,
  InternalPlayer,
  PlayerReconciliationInput,
  PlayerReconciliationOutcome,
  ProviderPlayer,
} from './types.js';

export interface PlayerReconciliationContext {
  readonly provider_players: ReadonlyArray<ProviderPlayer>;
  readonly internal_players: ReadonlyArray<InternalPlayer>;
  readonly player_aliases: ReadonlyArray<Alias>;
  /**
   * For team-context validation. Maps (provider, provider_team_id) →
   * internal_team_id (as of last-seen). Only approved mappings should
   * appear here; unresolved provider teams cannot supply context.
   */
  readonly team_context: ReadonlyMap<string, string>;
}

/**
 * Look up an approved provider mapping for this exact (provider, provider_player_id).
 * Precedence step 1.
 */
function tryReviewedProviderMapping(
  input: PlayerReconciliationInput,
  ctx: PlayerReconciliationContext
): PlayerReconciliationOutcome | null {
  for (const pp of ctx.provider_players) {
    if (
      pp.provider === input.provider &&
      pp.provider_player_id === input.provider_player_id &&
      pp.mapping_state === 'approved' &&
      pp.internal_player_id !== null
    ) {
      return {
        kind: 'approved',
        internal_player_id: pp.internal_player_id,
        match_method: 'reviewed_provider_mapping',
        candidate_internal_player_ids: [pp.internal_player_id],
        alias_version_at_mapping: pp.alias_version_at_mapping,
        action: 'approved',
      };
    }
  }
  return null;
}

/**
 * Look up an approved alias covering the input's scope AND normalized name.
 * Aliases MAY carry a permanent-approve authority (`display` or
 * `match_candidate` on the reviewed scope) provided event/team context
 * agrees. Alias-only match without agreeing team context queues.
 * Precedence step 2.
 */
function tryReviewedAlias(
  input: PlayerReconciliationInput,
  normalized: string,
  ctx: PlayerReconciliationContext
): PlayerReconciliationOutcome | null {
  const active_matching_aliases = ctx.player_aliases.filter(
    (a) =>
      a.is_active &&
      (a.scope_kind === input.provider || a.scope_kind === 'internal') &&
      a.normalized_alias === normalized
  );
  if (active_matching_aliases.length === 0) return null;

  const owning_player_ids = Array.from(
    new Set(active_matching_aliases.map((a) => a.internal_entity_id))
  );

  // If aliases point to multiple internal players → alias conflict, quarantine.
  if (owning_player_ids.length > 1) {
    return {
      kind: 'quarantined',
      reason: 'ambiguous_alias_conflict',
      reason_detail: `alias '${input.raw_full_name}' active on ${owning_player_ids.length} internal players`,
      candidate_internal_player_ids: owning_player_ids,
      resolution: 'quarantined',
    };
  }

  const chosen = owning_player_ids[0]!;

  // Validate team context if we have it.
  if (input.provider_team_id_seen !== null) {
    const contextInternalTeam = ctx.team_context.get(
      `${input.provider}:${input.provider_team_id_seen}`
    );
    if (contextInternalTeam === undefined) {
      // Team context provided but not resolved. Queue with missing context.
      return {
        kind: 'queued',
        reason: 'missing_team_context',
        reason_detail: `provider team ${input.provider_team_id_seen} not approved-mapped`,
        candidate_internal_player_ids: [chosen],
        resolution: 'open',
      };
    }
    const internal = ctx.internal_players.find(
      (p) => p.internal_player_id === chosen
    );
    if (
      internal !== undefined &&
      internal.current_team_id !== null &&
      internal.current_team_id !== contextInternalTeam
    ) {
      // Alias exists but team context disagrees. Queue for review — do
      // not auto-approve, and do not mint a new player identity.
      return {
        kind: 'queued',
        reason: 'missing_team_context',
        reason_detail: `alias points to player whose current team differs from provider-reported team ${input.provider_team_id_seen}`,
        candidate_internal_player_ids: [chosen],
        resolution: 'open',
      };
    }
  }

  // Approved-alias path uses the alias's highest active version.
  const alias_version_at_mapping = Math.max(
    ...active_matching_aliases.map((a) => a.alias_version)
  );

  return {
    kind: 'approved',
    internal_player_id: chosen,
    match_method: 'reviewed_alias',
    candidate_internal_player_ids: [chosen],
    alias_version_at_mapping,
    action: 'approved',
  };
}

/**
 * Attempt normalized-name plus event/team context, but do not auto-approve;
 * propose for review. Precedence step 3.
 */
function tryNormalizedPlusContext(
  input: PlayerReconciliationInput,
  normalized: string,
  ctx: PlayerReconciliationContext
): PlayerReconciliationOutcome {
  if (normalized === '') {
    return {
      kind: 'queued',
      reason: 'unmatched',
      reason_detail: 'raw_full_name normalized to empty string',
      candidate_internal_player_ids: [],
      resolution: 'open',
    };
  }

  const name_candidates = ctx.internal_players.filter(
    (p) => p.normalized_name === normalized
  );

  if (name_candidates.length === 0) {
    return {
      kind: 'queued',
      reason: 'unmatched',
      reason_detail: `no internal player with normalized_name='${normalized}'`,
      candidate_internal_player_ids: [],
      resolution: 'open',
    };
  }

  // Multiple internal players share this normalized name → ambiguous.
  if (name_candidates.length > 1) {
    return {
      kind: 'queued',
      reason: 'ambiguous_multiple_candidates',
      reason_detail: `${name_candidates.length} internal players share normalized_name='${normalized}'`,
      candidate_internal_player_ids: name_candidates.map(
        (p) => p.internal_player_id
      ),
      resolution: 'open',
    };
  }

  const only = name_candidates[0]!;

  // Require event/team context for the propose-for-review path.
  if (input.provider_team_id_seen === null) {
    return {
      kind: 'queued',
      reason: 'missing_team_context',
      reason_detail: `single normalized-name candidate ${only.internal_player_id} present but no provider team context`,
      candidate_internal_player_ids: [only.internal_player_id],
      resolution: 'open',
    };
  }

  const contextInternalTeam = ctx.team_context.get(
    `${input.provider}:${input.provider_team_id_seen}`
  );
  if (contextInternalTeam === undefined) {
    return {
      kind: 'queued',
      reason: 'missing_team_context',
      reason_detail: `provider team ${input.provider_team_id_seen} not approved-mapped`,
      candidate_internal_player_ids: [only.internal_player_id],
      resolution: 'open',
    };
  }

  if (only.current_team_id !== null && only.current_team_id !== contextInternalTeam) {
    // A team change is possible; the player may have just been traded.
    // Rather than auto-approve, propose for review so a human confirms
    // (§7.3 forbids normalization-driven permanent match).
    return {
      kind: 'proposed_for_review',
      internal_player_id: only.internal_player_id,
      match_method: 'normalized_name_plus_context',
      candidate_internal_player_ids: [only.internal_player_id],
      reason_detail: `single normalized-name candidate; internal current_team_id differs from provider-reported team (possible trade)`,
    };
  }

  // Team context agrees. §7.3 still requires reviewed action for
  // normalization-based matches; return propose_for_review so a downstream
  // reviewer or reviewed process may promote it.
  return {
    kind: 'proposed_for_review',
    internal_player_id: only.internal_player_id,
    match_method: 'normalized_name_plus_context',
    candidate_internal_player_ids: [only.internal_player_id],
    reason_detail:
      'single normalized-name candidate; team context agrees; awaiting reviewed approval',
  };
}

export function reconcilePlayer(
  input: PlayerReconciliationInput,
  ctx: PlayerReconciliationContext
): PlayerReconciliationOutcome {
  // Reject empty provider_player_id up front (spec §7.1 — provider IDs
  // are external identities but must be non-empty to store).
  if (input.provider_player_id.trim() === '') {
    return {
      kind: 'quarantined',
      reason: 'unmatched',
      reason_detail: 'empty provider_player_id',
      candidate_internal_player_ids: [],
      resolution: 'quarantined',
    };
  }

  // Step 1: existing reviewed provider mapping.
  const step1 = tryReviewedProviderMapping(input, ctx);
  if (step1 !== null) return step1;

  const normalized = normalizeName(input.raw_full_name);

  // Step 2: approved alias covering the provider scope.
  const step2 = tryReviewedAlias(input, normalized, ctx);
  if (step2 !== null) return step2;

  // Step 3: normalized-name plus event/team context → propose_for_review.
  return tryNormalizedPlusContext(input, normalized, ctx);
}

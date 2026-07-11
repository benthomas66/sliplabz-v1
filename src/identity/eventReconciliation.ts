// Event (game) reconciliation.
//
// Authority anchors:
//   Complete spec §7.2 (event mapping)
//   Odds API sub-spec §6, §6.1 (mapping policy)
//   BALLDONTLIE sub-spec §10, §11 (game & team identity)
//
// Precedence (spec §7.2):
//   1. Resolve provider home & away teams to internal team IDs.
//   2. Require ordered home/away agreement with a candidate internal game.
//   3. Exact scheduled-start match → approve immediately.
//   4. Unique candidate within ≤15 minutes → approve with time_tolerance.
//   5. Zero candidates → queue as unmatched.
//   6. Multiple candidates → queue as ambiguous.
//   7. Never map on team-string similarity, unordered teams, or nearest-time.
//   8. Same input → same outcome (idempotent).

import type {
  EventReconciliationInput,
  EventReconciliationOutcome,
  InternalGame,
  ProviderTeam,
} from './types.js';

// 15 minutes, per complete spec §7.2 "up to 15 minutes when matchup is
// unique". Not configurable in V1-1 — a change requires methodology review.
const TIME_TOLERANCE_SECONDS = 15 * 60;

export interface EventReconciliationContext {
  readonly provider_teams: ReadonlyArray<ProviderTeam>;
  readonly internal_games: ReadonlyArray<InternalGame>;
}

/**
 * Resolve a provider team string to an internal team ID by consulting
 * the approved provider_teams entries only. Aliases are consulted by
 * playerReconciliation for player names; team resolution here uses the
 * reviewed provider_team mapping, which is the strongest evidence.
 */
function resolveTeam(
  provider: EventReconciliationInput['provider'],
  raw: string,
  ctx: EventReconciliationContext
): string | null {
  const target = raw.trim();
  if (target === '') return null;
  const targetLower = target.toLowerCase();

  for (const pt of ctx.provider_teams) {
    if (pt.provider !== provider) continue;
    if (pt.mapping_state !== 'approved') continue;
    if (pt.internal_team_id === null) continue;
    if (
      pt.raw_full_name.toLowerCase() === targetLower ||
      pt.raw_name.toLowerCase() === targetLower ||
      pt.raw_abbreviation.toLowerCase() === targetLower
    ) {
      return pt.internal_team_id;
    }
  }
  return null;
}

export function reconcileEvent(
  input: EventReconciliationInput,
  ctx: EventReconciliationContext
): EventReconciliationOutcome {
  const homeInternalId = resolveTeam(input.provider, input.raw_home_team, ctx);
  const awayInternalId = resolveTeam(input.provider, input.raw_away_team, ctx);

  // Step 1: provider teams must resolve first.
  if (homeInternalId === null || awayInternalId === null) {
    return {
      kind: 'queued',
      reason: 'unresolved_provider_team',
      reason_detail: `home=${homeInternalId === null ? 'unresolved' : 'ok'}; away=${awayInternalId === null ? 'unresolved' : 'ok'}`,
      candidate_internal_game_ids: [],
      resolution: 'open',
    };
  }

  // Reject the degenerate self-match up front. Schema also enforces this
  // via CHECK; this branch keeps the queue explicit.
  if (homeInternalId === awayInternalId) {
    return {
      kind: 'quarantined',
      reason: 'self_match_invalid',
      reason_detail: `home_team_id and away_team_id resolved to the same internal team ${homeInternalId}`,
      candidate_internal_game_ids: [],
      resolution: 'quarantined',
    };
  }

  const providerCommenceMs = new Date(input.raw_commence_time).getTime();
  if (!Number.isFinite(providerCommenceMs)) {
    return {
      kind: 'quarantined',
      reason: 'ordered_teams_disagree',
      // "ordered_teams_disagree" is not the perfect reason here, but the
      // enum authority does not include a generic invalid_input value.
      // Quarantine + explanatory detail preserves the audit trail.
      reason_detail: `raw_commence_time is not a valid ISO-8601 timestamp: ${input.raw_commence_time}`,
      candidate_internal_game_ids: [],
      resolution: 'quarantined',
    };
  }

  // Step 2: gather candidates that agree on ordered home/away.
  const ordered_candidates = ctx.internal_games.filter(
    (g) => g.home_team_id === homeInternalId && g.away_team_id === awayInternalId
  );

  if (ordered_candidates.length === 0) {
    // Check whether a reverse-ordered pair exists — a common data-entry
    // error. We DO NOT auto-swap; we quarantine with a specific reason.
    const reversed = ctx.internal_games.filter(
      (g) => g.home_team_id === awayInternalId && g.away_team_id === homeInternalId
    );
    if (reversed.length > 0) {
      return {
        kind: 'quarantined',
        reason: 'ordered_teams_disagree',
        reason_detail: `provider home=${input.raw_home_team} vs internal away; ${reversed.length} reversed candidate(s)`,
        candidate_internal_game_ids: reversed.map((g) => g.internal_game_id),
        resolution: 'quarantined',
      };
    }
    return {
      kind: 'queued',
      reason: 'unmatched',
      reason_detail: `no internal game with home=${homeInternalId} away=${awayInternalId}`,
      candidate_internal_game_ids: [],
      resolution: 'open',
    };
  }

  // Step 3 / 4: pick exact-time match first, then unique tolerance match.
  const with_delta = ordered_candidates.map((g) => ({
    game: g,
    delta_seconds: Math.round(
      (new Date(g.scheduled_start_utc).getTime() - providerCommenceMs) / 1000
    ),
  }));

  const exact = with_delta.filter((c) => c.delta_seconds === 0);
  if (exact.length === 1) {
    const only = exact[0]!;
    return {
      kind: 'approved',
      internal_game_id: only.game.internal_game_id,
      match_method: 'exact_time',
      time_delta_seconds: 0,
      candidate_internal_game_ids: [only.game.internal_game_id],
      action: 'approved',
    };
  }
  if (exact.length > 1) {
    return {
      kind: 'queued',
      reason: 'ambiguous_multiple_candidates',
      reason_detail: `${exact.length} candidates with exact commence-time match`,
      candidate_internal_game_ids: exact.map((c) => c.game.internal_game_id),
      resolution: 'open',
    };
  }

  const within_tolerance = with_delta.filter(
    (c) => Math.abs(c.delta_seconds) <= TIME_TOLERANCE_SECONDS
  );
  if (within_tolerance.length === 1) {
    const only = within_tolerance[0]!;
    return {
      kind: 'approved',
      internal_game_id: only.game.internal_game_id,
      match_method: 'time_tolerance',
      time_delta_seconds: only.delta_seconds,
      candidate_internal_game_ids: [only.game.internal_game_id],
      action: 'approved',
    };
  }
  if (within_tolerance.length > 1) {
    return {
      kind: 'queued',
      reason: 'ambiguous_multiple_candidates',
      reason_detail: `${within_tolerance.length} candidates within ${TIME_TOLERANCE_SECONDS}s tolerance`,
      candidate_internal_game_ids: within_tolerance.map((c) => c.game.internal_game_id),
      resolution: 'open',
    };
  }

  // Ordered teams matched candidates exist but every candidate exceeded
  // the tolerance window. This is quarantine-worthy: we found a plausible
  // matchup but no candidate is close enough in time.
  return {
    kind: 'quarantined',
    reason: 'time_window_exceeded',
    reason_detail: `${ordered_candidates.length} ordered-team candidate(s) exceeded ${TIME_TOLERANCE_SECONDS}s tolerance`,
    candidate_internal_game_ids: ordered_candidates.map((g) => g.internal_game_id),
    resolution: 'quarantined',
  };
}

export const EVENT_RECONCILIATION_TIME_TOLERANCE_SECONDS =
  TIME_TOLERANCE_SECONDS;

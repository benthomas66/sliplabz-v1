// Player-stat eligibility per BDL §8 and §11A.
//
// Authority:
//   BDL sub-spec §8 (eligibility: final + IDs present + minutes > 0 + not
//     quarantined + normalizable)
//   BDL sub-spec §11A (referential-integrity checks + reason codes)
//   Complete spec §14.1 played-game eligibility
//   Ticket V1-2 hard invariants:
//     - unknown game statuses quarantine
//     - DNP does not enter historical windows
//     - unresolved-minute rows excluded from calculations pending resolution
//     - null-to-zero applies only to eligible played rows
//
// A row's eligibility is computed from the joined game's canonical status
// AND the row's minutes state AND referential-integrity checks.

import type {
  BdlMinutesStatus,
  GameStatus,
  PlayerStatEligibility,
  PlayerStatQuarantineReason,
} from '../shared/enums.js';

export interface EligibilityInputs {
  readonly provider_player_id: string;
  readonly provider_game_id: string;
  readonly minutes_status: BdlMinutesStatus;
  /** BDL canonical status for the joined game. Unknown → 'unresolved'. */
  readonly joined_game_canonical_status: GameStatus;
  /** True when raw canonical status was not a recognized BDL string. */
  readonly joined_game_status_is_unknown: boolean;
  /** Referential-integrity: internal_player_id resolved by V1-1 reconciler. */
  readonly internal_player_id: string | null;
  /** Referential-integrity: internal_game_id resolved by V1-1 reconciler. */
  readonly internal_game_id: string | null;
  /**
   * True when the row's team ID matches EITHER the joined game's home_team_id
   * or away_team_id. False when neither matches (team_not_in_game).
   */
  readonly team_matches_game_side: boolean;
  /**
   * True when season and season_type on the row agree with the joined game.
   */
  readonly season_agrees_with_game: boolean;
  /**
   * True when the row is not a duplicate source key with an earlier ingested
   * row. Callers detect this by the UNIQUE constraint in the DB; V1-2 code
   * short-circuits when it observes the DB error.
   */
  readonly duplicate_source_key: boolean;
  /**
   * True when the joined team's classification is `current_franchise` or
   * `historical_franchise` — i.e., an approved WNBA competition team.
   * False when the game involves an all-star / national / placeholder /
   * exhibition team (BDL §12B.9): quarantine as unsupported_competition_team.
   */
  readonly supported_competition_team: boolean;
}

export interface EligibilityResult {
  readonly eligibility_state: PlayerStatEligibility;
  readonly quarantine_reason: PlayerStatQuarantineReason | null;
  readonly detail: string;
}

/**
 * Compute the eligibility of a normalized player_game_stat row.
 *
 * The precedence — which reason wins when multiple apply — is deliberately:
 *   1. Duplicate source key (schema-level; short-circuit).
 *   2. Missing player identity.
 *   3. Missing game identity.
 *   4. Unknown game status (row cannot resolve until game status resolves).
 *   5. Unresolved minutes (`"--"`, null, empty).
 *   6. Team not in game.
 *   7. Season mismatch.
 *   8. Unsupported competition team.
 *   9. Non-final game (live/scheduled/postponed/canceled) → `live_or_non_final`.
 *  10. DNP minutes → `non_participation`.
 *  11. Everything else → `eligible`.
 *
 * The distinct labels (as opposed to a single "not eligible" flag) are
 * required so V1-5's shared computation service can distinguish DNP from
 * unresolved without re-reading raw rows.
 */
export function computeEligibility(x: EligibilityInputs): EligibilityResult {
  if (x.duplicate_source_key) {
    return {
      eligibility_state: 'quarantined',
      quarantine_reason: 'duplicate_source_key',
      detail: `duplicate provider source key`,
    };
  }
  if (x.internal_player_id === null) {
    return {
      eligibility_state: 'quarantined',
      quarantine_reason: 'missing_player',
      detail: `provider_player_id ${x.provider_player_id} unresolved`,
    };
  }
  if (x.internal_game_id === null) {
    return {
      eligibility_state: 'quarantined',
      quarantine_reason: 'missing_game',
      detail: `provider_game_id ${x.provider_game_id} unresolved`,
    };
  }
  if (x.joined_game_status_is_unknown) {
    return {
      eligibility_state: 'quarantined',
      quarantine_reason: 'unknown_game_status',
      detail: `joined game canonical status is unknown (quarantined per BDL §10)`,
    };
  }
  if (x.minutes_status === 'unresolved_non_numeric') {
    // BDL §7.3: excluded from calculations pending resolution.
    return {
      eligibility_state: 'unresolved_minutes',
      quarantine_reason: null,
      detail: 'unresolved minutes ("--", null, empty)',
    };
  }
  if (!x.team_matches_game_side) {
    return {
      eligibility_state: 'quarantined',
      quarantine_reason: 'team_not_in_game',
      detail: 'row team does not match either home or away of joined game',
    };
  }
  if (!x.season_agrees_with_game) {
    return {
      eligibility_state: 'quarantined',
      quarantine_reason: 'season_mismatch',
      detail: 'row season disagrees with joined game season',
    };
  }
  if (!x.supported_competition_team) {
    return {
      eligibility_state: 'quarantined',
      quarantine_reason: 'unsupported_competition_team',
      detail: 'joined game involves a non-current-franchise team',
    };
  }
  if (x.joined_game_canonical_status !== 'final') {
    // Not finalized yet, or postponed/canceled. Never eligible for historical
    // calculations; spec §9.6 forbids inferring finality from clock.
    return {
      eligibility_state: 'live_or_non_final',
      quarantine_reason: null,
      detail: `joined game canonical status is ${x.joined_game_canonical_status}`,
    };
  }
  if (x.minutes_status === 'dnp') {
    // DNP is a valid observation but excludes the row from historical windows
    // per BDL §8 and complete spec §14.1.
    return {
      eligibility_state: 'non_participation',
      quarantine_reason: null,
      detail: 'zero-minute non-participation',
    };
  }
  // played + final + resolved identities + integrity checks pass.
  return {
    eligibility_state: 'eligible',
    quarantine_reason: null,
    detail: 'eligible',
  };
}

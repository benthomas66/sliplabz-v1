// Ticket §6 required tests / acceptance criteria covered here:
//   - unknown game status → quarantined
//   - dnp does not enter historical windows
//   - "--" is not DNP and excluded until resolved

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  computeEligibility,
  type EligibilityInputs,
} from '../../src/bdl/eligibility.js';

function baseline(): EligibilityInputs {
  return {
    provider_player_id: '65001',
    provider_game_id: '24752',
    minutes_status: 'played',
    joined_game_canonical_status: 'final',
    joined_game_status_is_unknown: false,
    internal_player_id: 'p001',
    internal_game_id: 'g001',
    team_matches_game_side: true,
    season_agrees_with_game: true,
    duplicate_source_key: false,
    supported_competition_team: true,
  };
}

describe('player-stat eligibility (BDL §8, §11A)', () => {
  it('happy path: played + final + integrity ok → eligible', () => {
    const r = computeEligibility(baseline());
    assert.equal(r.eligibility_state, 'eligible');
    assert.equal(r.quarantine_reason, null);
  });

  it('LOAD-BEARING: dnp on final game → non_participation (NOT eligible for historical)', () => {
    const r = computeEligibility({ ...baseline(), minutes_status: 'dnp' });
    assert.equal(r.eligibility_state, 'non_participation');
    assert.equal(r.quarantine_reason, null);
    assert.notEqual(r.eligibility_state, 'eligible');
  });

  it('LOAD-BEARING: unresolved_non_numeric minutes → unresolved_minutes (never DNP-treated)', () => {
    const r = computeEligibility({
      ...baseline(),
      minutes_status: 'unresolved_non_numeric',
    });
    assert.equal(r.eligibility_state, 'unresolved_minutes');
    assert.equal(r.quarantine_reason, null);
    assert.notEqual(r.eligibility_state, 'non_participation');
  });

  it('LOAD-BEARING: unknown game status → quarantined (unknown_game_status)', () => {
    const r = computeEligibility({
      ...baseline(),
      joined_game_canonical_status: 'unresolved',
      joined_game_status_is_unknown: true,
    });
    assert.equal(r.eligibility_state, 'quarantined');
    assert.equal(r.quarantine_reason, 'unknown_game_status');
  });

  it('live game → live_or_non_final (never eligible, no clock inference)', () => {
    const r = computeEligibility({
      ...baseline(),
      joined_game_canonical_status: 'live',
    });
    assert.equal(r.eligibility_state, 'live_or_non_final');
  });

  it('missing internal_player_id → quarantined missing_player', () => {
    const r = computeEligibility({
      ...baseline(),
      internal_player_id: null,
    });
    assert.equal(r.eligibility_state, 'quarantined');
    assert.equal(r.quarantine_reason, 'missing_player');
  });

  it('missing internal_game_id → quarantined missing_game', () => {
    const r = computeEligibility({
      ...baseline(),
      internal_game_id: null,
    });
    assert.equal(r.eligibility_state, 'quarantined');
    assert.equal(r.quarantine_reason, 'missing_game');
  });

  it('team not in game → quarantined team_not_in_game', () => {
    const r = computeEligibility({
      ...baseline(),
      team_matches_game_side: false,
    });
    assert.equal(r.eligibility_state, 'quarantined');
    assert.equal(r.quarantine_reason, 'team_not_in_game');
  });

  it('season mismatch → quarantined season_mismatch', () => {
    const r = computeEligibility({
      ...baseline(),
      season_agrees_with_game: false,
    });
    assert.equal(r.eligibility_state, 'quarantined');
    assert.equal(r.quarantine_reason, 'season_mismatch');
  });

  it('all-star / national / placeholder team → unsupported_competition_team', () => {
    const r = computeEligibility({
      ...baseline(),
      supported_competition_team: false,
    });
    assert.equal(r.eligibility_state, 'quarantined');
    assert.equal(r.quarantine_reason, 'unsupported_competition_team');
  });

  it('duplicate source key → quarantined duplicate_source_key', () => {
    const r = computeEligibility({
      ...baseline(),
      duplicate_source_key: true,
    });
    assert.equal(r.eligibility_state, 'quarantined');
    assert.equal(r.quarantine_reason, 'duplicate_source_key');
  });

  it('precedence: missing_player wins over dnp', () => {
    const r = computeEligibility({
      ...baseline(),
      internal_player_id: null,
      minutes_status: 'dnp',
    });
    assert.equal(r.quarantine_reason, 'missing_player');
  });
});

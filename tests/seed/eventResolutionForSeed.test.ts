// V1-4b Stage 2 Phase A supplement — unit tests for the seed pipeline's
// event→game resolution wiring. The wiring delegates to V1-1's
// reconcileEvent; these tests exercise the four load-bearing outcomes:
//   * resolved-exact (commence_time exact match, unique ordered pair)
//   * resolved-tolerance (unique within ±15-minute window)
//   * ambiguous → queued (multiple candidates share the window)
//   * unknown team → queued (provider team not in the approved mapping)
//
// The context is passed statically so no DB access is needed. Persistence
// is tested in the integration test that lands alongside Phase B.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { resolveOddsapiEventForSeed } from '../../src/seed/orchestrator/eventResolutionForSeed.js';
import type { EventReconciliationContext } from '../../src/identity/eventReconciliation.js';
import type {
  EventReconciliationInput,
  InternalGame,
  ProviderTeam,
} from '../../src/identity/types.js';

const AT_TEAM = 'team_A_internal';
const HOME_TEAM = 'team_H_internal';
const OTHER_TEAM = 'team_O_internal';

const providerTeams: ReadonlyArray<ProviderTeam> = [
  {
    provider: 'odds_api',
    provider_team_id: 'oa-1',
    internal_team_id: HOME_TEAM,
    raw_full_name: 'Home Franchise',
    raw_name: 'Home',
    raw_abbreviation: 'HOM',
    raw_city: 'Homecity',
    raw_conference: null,
    classification: 'current_franchise',
    mapping_state: 'approved',
  },
  {
    provider: 'odds_api',
    provider_team_id: 'oa-2',
    internal_team_id: AT_TEAM,
    raw_full_name: 'Away Franchise',
    raw_name: 'Away',
    raw_abbreviation: 'AWY',
    raw_city: 'Awaycity',
    raw_conference: null,
    classification: 'current_franchise',
    mapping_state: 'approved',
  },
  {
    provider: 'odds_api',
    provider_team_id: 'oa-3',
    internal_team_id: OTHER_TEAM,
    raw_full_name: 'Other Franchise',
    raw_name: 'Other',
    raw_abbreviation: 'OTH',
    raw_city: 'Othercity',
    raw_conference: null,
    classification: 'current_franchise',
    mapping_state: 'approved',
  },
];

function makeGame(id: string, home: string, away: string, scheduled: string): InternalGame {
  return {
    internal_game_id: id,
    season: 2026,
    season_type: 2,
    home_team_id: home,
    away_team_id: away,
    scheduled_start_utc: scheduled,
    actual_start_utc: null,
    status: 'final',
    postseason: false,
  };
}

describe('resolveOddsapiEventForSeed — V1-4b seed pipeline event→game wiring', () => {
  it('LOAD-BEARING: exact-time match with unique ordered pair → resolved_exact', () => {
    const games = [
      makeGame('game-1', HOME_TEAM, AT_TEAM, '2026-05-08T23:00:00Z'),
      makeGame('game-2', OTHER_TEAM, HOME_TEAM, '2026-05-08T22:00:00Z'),
    ];
    const ctx: EventReconciliationContext = { provider_teams: providerTeams, internal_games: games };
    const input: EventReconciliationInput = {
      provider: 'odds_api',
      provider_game_id: 'oa-evt-1',
      raw_home_team: 'Home Franchise',
      raw_away_team: 'Away Franchise',
      raw_commence_time: '2026-05-08T23:00:00Z',
    };
    const outcome = resolveOddsapiEventForSeed(input, ctx);
    assert.equal(outcome.kind, 'resolved_exact');
    if (outcome.kind === 'resolved_exact') {
      assert.equal(outcome.internal_game_id, 'game-1');
      assert.equal(outcome.time_delta_seconds, 0);
      assert.deepEqual([...outcome.candidate_internal_game_ids], ['game-1']);
    }
  });

  it('LOAD-BEARING: 8-minute skew with unique ordered pair → resolved_tolerance', () => {
    const games = [
      makeGame('game-1', HOME_TEAM, AT_TEAM, '2026-05-08T23:00:00Z'),
    ];
    const ctx: EventReconciliationContext = { provider_teams: providerTeams, internal_games: games };
    const input: EventReconciliationInput = {
      provider: 'odds_api',
      provider_game_id: 'oa-evt-2',
      raw_home_team: 'Home Franchise',
      raw_away_team: 'Away Franchise',
      // 8 minutes AFTER the internal scheduled tip; delta = internal - provider = -480s
      raw_commence_time: '2026-05-08T23:08:00Z',
    };
    const outcome = resolveOddsapiEventForSeed(input, ctx);
    assert.equal(outcome.kind, 'resolved_tolerance');
    if (outcome.kind === 'resolved_tolerance') {
      assert.equal(outcome.internal_game_id, 'game-1');
      assert.equal(outcome.time_delta_seconds, -480);
    }
  });

  it('LOAD-BEARING: two ordered candidates within tolerance → queued (ambiguous)', () => {
    const games = [
      makeGame('game-1', HOME_TEAM, AT_TEAM, '2026-05-08T23:00:00Z'),
      makeGame('game-2', HOME_TEAM, AT_TEAM, '2026-05-08T23:07:30Z'),
    ];
    const ctx: EventReconciliationContext = { provider_teams: providerTeams, internal_games: games };
    const input: EventReconciliationInput = {
      provider: 'odds_api',
      provider_game_id: 'oa-evt-3',
      raw_home_team: 'Home Franchise',
      raw_away_team: 'Away Franchise',
      raw_commence_time: '2026-05-08T23:05:00Z',
    };
    const outcome = resolveOddsapiEventForSeed(input, ctx);
    assert.equal(outcome.kind, 'queued');
    if (outcome.kind === 'queued') {
      assert.equal(outcome.reason, 'ambiguous_multiple_candidates');
      assert.equal(outcome.source_kind, 'queued');
      assert.equal(outcome.candidate_internal_game_ids.length, 2);
      // Detail should surface the count.
      assert.match(outcome.reason_detail, /2 candidates within/);
    }
  });

  it('LOAD-BEARING: unknown provider team → queued (unresolved_provider_team)', () => {
    const games = [
      makeGame('game-1', HOME_TEAM, AT_TEAM, '2026-05-08T23:00:00Z'),
    ];
    const ctx: EventReconciliationContext = { provider_teams: providerTeams, internal_games: games };
    const input: EventReconciliationInput = {
      provider: 'odds_api',
      provider_game_id: 'oa-evt-4',
      raw_home_team: 'Home Franchise',
      raw_away_team: 'Mystery Team From The Ether', // no provider_teams row matches
      raw_commence_time: '2026-05-08T23:00:00Z',
    };
    const outcome = resolveOddsapiEventForSeed(input, ctx);
    assert.equal(outcome.kind, 'queued');
    if (outcome.kind === 'queued') {
      assert.equal(outcome.reason, 'unresolved_provider_team');
      assert.equal(outcome.source_kind, 'queued');
      // No candidates when team resolution fails.
      assert.equal(outcome.candidate_internal_game_ids.length, 0);
    }
  });

  it('exact match wins over tolerance match when both exist for the same ordered pair', () => {
    const games = [
      makeGame('game-exact', HOME_TEAM, AT_TEAM, '2026-05-08T23:00:00Z'),
      makeGame('game-close', HOME_TEAM, AT_TEAM, '2026-05-08T23:05:00Z'),
    ];
    const ctx: EventReconciliationContext = { provider_teams: providerTeams, internal_games: games };
    const input: EventReconciliationInput = {
      provider: 'odds_api',
      provider_game_id: 'oa-evt-5',
      raw_home_team: 'Home Franchise',
      raw_away_team: 'Away Franchise',
      raw_commence_time: '2026-05-08T23:00:00Z',
    };
    const outcome = resolveOddsapiEventForSeed(input, ctx);
    assert.equal(outcome.kind, 'resolved_exact');
    if (outcome.kind === 'resolved_exact') {
      assert.equal(outcome.internal_game_id, 'game-exact');
    }
  });

  it('reversed home/away with no forward match → queued (ordered_teams_disagree via V1-1)', () => {
    const games = [
      // Internal games has HOME on the away side (data-entry reversal).
      makeGame('game-reversed', AT_TEAM, HOME_TEAM, '2026-05-08T23:00:00Z'),
    ];
    const ctx: EventReconciliationContext = { provider_teams: providerTeams, internal_games: games };
    const input: EventReconciliationInput = {
      provider: 'odds_api',
      provider_game_id: 'oa-evt-6',
      raw_home_team: 'Home Franchise',
      raw_away_team: 'Away Franchise',
      raw_commence_time: '2026-05-08T23:00:00Z',
    };
    const outcome = resolveOddsapiEventForSeed(input, ctx);
    assert.equal(outcome.kind, 'queued');
    if (outcome.kind === 'queued') {
      assert.equal(outcome.reason, 'ordered_teams_disagree');
      assert.equal(outcome.source_kind, 'quarantined');
    }
  });
});

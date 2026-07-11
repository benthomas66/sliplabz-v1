// Complete-fixture determinism: run every reconciliation input twice and
// assert that the map-or-quarantine outcomes match bit-for-bit. This is
// the acceptance-criterion test for "complete fixture inputs map or
// quarantine deterministically".

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
  reconcileEvent,
  type EventReconciliationContext,
} from '../../src/identity/eventReconciliation.js';
import {
  reconcilePlayer,
  type PlayerReconciliationContext,
} from '../../src/identity/playerReconciliation.js';
import type {
  Alias,
  InternalGame,
  InternalPlayer,
  ProviderPlayer,
  ProviderTeam,
} from '../../src/identity/types.js';

const here = dirname(fileURLToPath(import.meta.url));
const teamsFixture   = JSON.parse(readFileSync(resolve(here, '../fixtures/teams.json'),                'utf8'));
const eventsFixture  = JSON.parse(readFileSync(resolve(here, '../fixtures/current-slate-events.json'), 'utf8'));
const playersFixture = JSON.parse(readFileSync(resolve(here, '../fixtures/current-slate-players.json'),'utf8'));
const aliasesFixture = JSON.parse(readFileSync(resolve(here, '../fixtures/aliases.json'),              'utf8'));

const provider_teams: ProviderTeam[]     = teamsFixture.provider_teams;
const internal_games: InternalGame[]     = eventsFixture.internal_games;
const internal_players: InternalPlayer[] = playersFixture.internal_players;
const provider_players: ProviderPlayer[] = playersFixture.provider_players_pre_approved;
const player_aliases:   Alias[]          = aliasesFixture.player_aliases;

const team_context = new Map<string, string>();
for (const pt of provider_teams) {
  if (pt.mapping_state === 'approved' && pt.internal_team_id) {
    team_context.set(`${pt.provider}:${pt.provider_team_id}`, pt.internal_team_id);
  }
}

const eventCtx: EventReconciliationContext = { provider_teams, internal_games };
const playerCtx: PlayerReconciliationContext = {
  provider_players,
  internal_players,
  player_aliases,
  team_context,
};

describe('complete-slate determinism', () => {
  it('every audit-derived odds_api event yields a deterministic outcome across two runs', () => {
    const first  = eventsFixture.odds_api_events.map((e: any) => reconcileEvent(
      { provider: 'odds_api', provider_game_id: e.provider_game_id, raw_home_team: e.raw_home_team, raw_away_team: e.raw_away_team, raw_commence_time: e.raw_commence_time },
      eventCtx
    ));
    const second = eventsFixture.odds_api_events.map((e: any) => reconcileEvent(
      { provider: 'odds_api', provider_game_id: e.provider_game_id, raw_home_team: e.raw_home_team, raw_away_team: e.raw_away_team, raw_commence_time: e.raw_commence_time },
      eventCtx
    ));
    assert.deepStrictEqual(first, second);
    // Every audit event should be approved on the reference slate.
    for (const outcome of first) {
      assert.equal(outcome.kind, 'approved');
    }
  });

  it('every synthetic edge-case event yields the fixture-declared expected outcome', () => {
    for (const c of eventsFixture.synthetic_edge_cases) {
      const ctx: EventReconciliationContext = c.extra_internal_game
        ? { provider_teams, internal_games: [...internal_games, c.extra_internal_game] }
        : eventCtx;
      const outcome = reconcileEvent(
        {
          provider: 'odds_api',
          provider_game_id: c.provider_game_id,
          raw_home_team: c.raw_home_team,
          raw_away_team: c.raw_away_team,
          raw_commence_time: c.raw_commence_time,
        },
        ctx
      );
      switch (c.expected_outcome) {
        case 'approved_exact':
          assert.equal(outcome.kind, 'approved');
          break;
        case 'approved_tolerance':
          assert.equal(outcome.kind, 'approved');
          if (outcome.kind === 'approved') {
            assert.equal(outcome.match_method, 'time_tolerance');
          }
          break;
        case 'quarantined_time_window_exceeded':
          assert.equal(outcome.kind, 'quarantined');
          if (outcome.kind === 'quarantined') assert.equal(outcome.reason, 'time_window_exceeded');
          break;
        case 'queued_unmatched':
          assert.equal(outcome.kind, 'queued');
          if (outcome.kind === 'queued') assert.equal(outcome.reason, 'unmatched');
          break;
        case 'quarantined_ordered_teams_disagree':
          assert.equal(outcome.kind, 'quarantined');
          if (outcome.kind === 'quarantined') assert.equal(outcome.reason, 'ordered_teams_disagree');
          break;
        case 'queued_unresolved_provider_team':
          assert.equal(outcome.kind, 'queued');
          if (outcome.kind === 'queued') assert.equal(outcome.reason, 'unresolved_provider_team');
          break;
        case 'queued_ambiguous_multiple_candidates':
          assert.equal(outcome.kind, 'queued');
          if (outcome.kind === 'queued') assert.equal(outcome.reason, 'ambiguous_multiple_candidates');
          break;
        case 'quarantined_self_match_invalid':
          assert.equal(outcome.kind, 'quarantined');
          if (outcome.kind === 'quarantined') assert.equal(outcome.reason, 'self_match_invalid');
          break;
        default:
          throw new Error(`unhandled expected_outcome: ${c.expected_outcome}`);
      }
    }
  });

  it('every declared player reconciliation input yields the fixture-declared expected outcome', () => {
    const outcomes = playersFixture.reconciliation_inputs.map((c: any) =>
      reconcilePlayer(c.input, playerCtx)
    );
    // Second run must equal first (idempotence at the slate level).
    const outcomes2 = playersFixture.reconciliation_inputs.map((c: any) =>
      reconcilePlayer(c.input, playerCtx)
    );
    assert.deepStrictEqual(outcomes, outcomes2);

    outcomes.forEach((outcome: any, idx: number) => {
      const expected = playersFixture.reconciliation_inputs[idx].expected_outcome;
      switch (expected) {
        case 'approved_reviewed_provider_mapping':
          assert.equal(outcome.kind, 'approved');
          assert.equal(outcome.match_method, 'reviewed_provider_mapping');
          break;
        case 'approved_reviewed_alias':
          assert.equal(outcome.kind, 'approved');
          assert.equal(outcome.match_method, 'reviewed_alias');
          break;
        case 'proposed_for_review':
          assert.equal(outcome.kind, 'proposed_for_review');
          break;
        case 'queued_ambiguous_multiple_candidates':
          assert.equal(outcome.kind, 'queued');
          assert.equal(outcome.reason, 'ambiguous_multiple_candidates');
          break;
        case 'queued_unmatched':
          assert.equal(outcome.kind, 'queued');
          assert.equal(outcome.reason, 'unmatched');
          break;
        case 'quarantined_ambiguous_alias_conflict':
          assert.equal(outcome.kind, 'quarantined');
          assert.equal(outcome.reason, 'ambiguous_alias_conflict');
          break;
        case 'quarantined_unmatched':
          assert.equal(outcome.kind, 'quarantined');
          break;
        default:
          throw new Error(`unhandled expected_outcome: ${expected}`);
      }
    });
  });
});

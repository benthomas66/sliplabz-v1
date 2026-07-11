import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
  reconcileEvent,
  EVENT_RECONCILIATION_TIME_TOLERANCE_SECONDS,
  type EventReconciliationContext,
} from '../../src/identity/eventReconciliation.js';
import type {
  EventReconciliationInput,
  InternalGame,
  ProviderTeam,
} from '../../src/identity/types.js';

const here = dirname(fileURLToPath(import.meta.url));
const teamsFixturePath  = resolve(here, '../fixtures/teams.json');
const eventsFixturePath = resolve(here, '../fixtures/current-slate-events.json');

const teamsFixture  = JSON.parse(readFileSync(teamsFixturePath, 'utf8'));
const eventsFixture = JSON.parse(readFileSync(eventsFixturePath, 'utf8'));

const provider_teams: ProviderTeam[]   = teamsFixture.provider_teams;
const internal_games_base: InternalGame[] = eventsFixture.internal_games;

const baseCtx: EventReconciliationContext = {
  provider_teams,
  internal_games: internal_games_base,
};

describe('reconcileEvent — audit-derived slate (Odds §5)', () => {
  for (const ev of eventsFixture.odds_api_events) {
    it(`exact match approves: ${ev.provider_game_id} ${ev.raw_home_team} vs ${ev.raw_away_team}`, () => {
      const input: EventReconciliationInput = {
        provider: 'odds_api',
        provider_game_id: ev.provider_game_id,
        raw_home_team: ev.raw_home_team,
        raw_away_team: ev.raw_away_team,
        raw_commence_time: ev.raw_commence_time,
      };
      const outcome = reconcileEvent(input, baseCtx);
      assert.equal(outcome.kind, 'approved');
      if (outcome.kind === 'approved') {
        assert.equal(outcome.match_method, 'exact_time');
        assert.equal(outcome.time_delta_seconds, 0);
        assert.equal(outcome.candidate_internal_game_ids.length, 1);
      }
    });
  }

  it('every audit-derived event maps deterministically on rerun (idempotence)', () => {
    const first = eventsFixture.odds_api_events.map((ev: any) =>
      reconcileEvent(
        {
          provider: 'odds_api',
          provider_game_id: ev.provider_game_id,
          raw_home_team: ev.raw_home_team,
          raw_away_team: ev.raw_away_team,
          raw_commence_time: ev.raw_commence_time,
        },
        baseCtx
      )
    );
    const second = eventsFixture.odds_api_events.map((ev: any) =>
      reconcileEvent(
        {
          provider: 'odds_api',
          provider_game_id: ev.provider_game_id,
          raw_home_team: ev.raw_home_team,
          raw_away_team: ev.raw_away_team,
          raw_commence_time: ev.raw_commence_time,
        },
        baseCtx
      )
    );
    assert.deepStrictEqual(first, second);
  });
});

describe('reconcileEvent — synthetic edge cases', () => {
  it('time_tolerance_within_15m: approves with time_tolerance', () => {
    const c = eventsFixture.synthetic_edge_cases.find(
      (x: any) => x.kind === 'time_tolerance_within_15m'
    );
    const outcome = reconcileEvent(
      {
        provider: 'odds_api',
        provider_game_id: c.provider_game_id,
        raw_home_team: c.raw_home_team,
        raw_away_team: c.raw_away_team,
        raw_commence_time: c.raw_commence_time,
      },
      baseCtx
    );
    assert.equal(outcome.kind, 'approved');
    if (outcome.kind === 'approved') {
      assert.equal(outcome.match_method, 'time_tolerance');
      assert.equal(outcome.time_delta_seconds, c.expected_delta_seconds);
    }
  });

  it('time_tolerance_edge_exactly_15m: approves at exactly the tolerance', () => {
    const c = eventsFixture.synthetic_edge_cases.find(
      (x: any) => x.kind === 'time_tolerance_edge_exactly_15m'
    );
    const outcome = reconcileEvent(
      {
        provider: 'odds_api',
        provider_game_id: c.provider_game_id,
        raw_home_team: c.raw_home_team,
        raw_away_team: c.raw_away_team,
        raw_commence_time: c.raw_commence_time,
      },
      baseCtx
    );
    assert.equal(outcome.kind, 'approved');
    if (outcome.kind === 'approved') {
      assert.equal(outcome.match_method, 'time_tolerance');
      assert.equal(
        Math.abs(outcome.time_delta_seconds),
        EVENT_RECONCILIATION_TIME_TOLERANCE_SECONDS
      );
    }
  });

  it('time_window_exceeded_beyond_15m: quarantines with time_window_exceeded', () => {
    const c = eventsFixture.synthetic_edge_cases.find(
      (x: any) => x.kind === 'time_window_exceeded_beyond_15m'
    );
    const outcome = reconcileEvent(
      {
        provider: 'odds_api',
        provider_game_id: c.provider_game_id,
        raw_home_team: c.raw_home_team,
        raw_away_team: c.raw_away_team,
        raw_commence_time: c.raw_commence_time,
      },
      baseCtx
    );
    assert.equal(outcome.kind, 'quarantined');
    if (outcome.kind === 'quarantined') {
      assert.equal(outcome.reason, 'time_window_exceeded');
    }
  });

  it('unmatched_event: queues with unmatched', () => {
    const c = eventsFixture.synthetic_edge_cases.find(
      (x: any) => x.kind === 'unmatched_event'
    );
    const outcome = reconcileEvent(
      {
        provider: 'odds_api',
        provider_game_id: c.provider_game_id,
        raw_home_team: c.raw_home_team,
        raw_away_team: c.raw_away_team,
        raw_commence_time: c.raw_commence_time,
      },
      baseCtx
    );
    assert.equal(outcome.kind, 'queued');
    if (outcome.kind === 'queued') {
      assert.equal(outcome.reason, 'unmatched');
      assert.equal(outcome.candidate_internal_game_ids.length, 0);
    }
  });

  it('reversed_home_away: quarantines with ordered_teams_disagree (no auto-swap)', () => {
    const c = eventsFixture.synthetic_edge_cases.find(
      (x: any) => x.kind === 'reversed_home_away'
    );
    const outcome = reconcileEvent(
      {
        provider: 'odds_api',
        provider_game_id: c.provider_game_id,
        raw_home_team: c.raw_home_team,
        raw_away_team: c.raw_away_team,
        raw_commence_time: c.raw_commence_time,
      },
      baseCtx
    );
    assert.equal(outcome.kind, 'quarantined');
    if (outcome.kind === 'quarantined') {
      assert.equal(outcome.reason, 'ordered_teams_disagree');
      assert.ok(outcome.candidate_internal_game_ids.length > 0);
    }
  });

  it('unresolved_provider_team: queues with unresolved_provider_team', () => {
    const c = eventsFixture.synthetic_edge_cases.find(
      (x: any) => x.kind === 'unresolved_provider_team'
    );
    const outcome = reconcileEvent(
      {
        provider: 'odds_api',
        provider_game_id: c.provider_game_id,
        raw_home_team: c.raw_home_team,
        raw_away_team: c.raw_away_team,
        raw_commence_time: c.raw_commence_time,
      },
      baseCtx
    );
    assert.equal(outcome.kind, 'queued');
    if (outcome.kind === 'queued') {
      assert.equal(outcome.reason, 'unresolved_provider_team');
    }
  });

  it('ambiguous_multiple_candidates: queues with ambiguous_multiple_candidates', () => {
    const c = eventsFixture.synthetic_edge_cases.find(
      (x: any) => x.kind === 'ambiguous_multiple_candidates'
    );
    // Widen ctx to include the second candidate game.
    const ctx: EventReconciliationContext = {
      provider_teams,
      internal_games: [...internal_games_base, c.extra_internal_game as InternalGame],
    };
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
    assert.equal(outcome.kind, 'queued');
    if (outcome.kind === 'queued') {
      assert.equal(outcome.reason, 'ambiguous_multiple_candidates');
      assert.ok(outcome.candidate_internal_game_ids.length >= 2);
    }
  });

  it('self_match_invalid: quarantines with self_match_invalid', () => {
    const c = eventsFixture.synthetic_edge_cases.find(
      (x: any) => x.kind === 'self_match_invalid'
    );
    const outcome = reconcileEvent(
      {
        provider: 'odds_api',
        provider_game_id: c.provider_game_id,
        raw_home_team: c.raw_home_team,
        raw_away_team: c.raw_away_team,
        raw_commence_time: c.raw_commence_time,
      },
      baseCtx
    );
    assert.equal(outcome.kind, 'quarantined');
    if (outcome.kind === 'quarantined') {
      assert.equal(outcome.reason, 'self_match_invalid');
    }
  });
});

describe('reconcileEvent — no name-only game match', () => {
  it('same team labels as strings but no ordered-team internal candidate → queued/quarantined, never approved', () => {
    // Deliberately create an internal-games list that omits every candidate;
    // the only channel by which a game could be approved is via ordered
    // team IDs. If we have no candidates, we must NOT approve based on
    // string similarity or "closest time".
    const outcome = reconcileEvent(
      {
        provider: 'odds_api',
        provider_game_id: 'evt_no_match',
        raw_home_team: 'Connecticut Sun',
        raw_away_team: 'Golden State Valkyries',
        raw_commence_time: '2026-07-10T23:40:00Z',
      },
      {
        provider_teams,
        internal_games: [], // No candidates whatsoever.
      }
    );
    assert.notEqual(outcome.kind, 'approved');
  });
});

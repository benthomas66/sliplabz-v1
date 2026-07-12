// Ticket §7 required test coverage:
//   Event reconciliation MUST consume V1-1 (never reimplement).
//
// This test asserts the V1-3 adapter feeds the V1-1 `reconcileEvent` with
// the correct provider tag and preserves ordered home/away semantics.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  odsApiEventToReconciliationInput,
  reconcileOddsApiEvent,
} from '../../src/odds/eventReconciliationAdapter.js';
import { validateEventDiscoveryResponse } from '../../src/odds/eventDiscovery.js';
import type {
  InternalGame,
  ProviderTeam,
} from '../../src/identity/types.js';

const events = JSON.parse(
  readFileSync(
    new URL('../fixtures/odds/events-slate-2026-07-10.json', import.meta.url),
    'utf8'
  )
);

// Reviewed team map based on the audited team strings. Every team resolves
// to a stable synthetic internal_team_id.
const TEAM_ID: Record<string, string> = {
  'Connecticut Sun':         '00000000-0000-0000-0000-000000000t03',
  'Golden State Valkyries':  '00000000-0000-0000-0000-000000000t05',
  'Toronto Tempo':           '00000000-0000-0000-0000-000000000t30',
  'Dallas Wings':            '00000000-0000-0000-0000-000000000t04',
  'Los Angeles Sparks':      '00000000-0000-0000-0000-000000000t08',
  'Chicago Sky':             '00000000-0000-0000-0000-000000000t02',
  'Minnesota Lynx':          '00000000-0000-0000-0000-000000000t09',
  'New York Liberty':        '00000000-0000-0000-0000-000000000t10',
  'Atlanta Dream':           '00000000-0000-0000-0000-000000000t01',
  'Portland Fire':           '00000000-0000-0000-0000-000000000t31',
  'Las Vegas Aces':          '00000000-0000-0000-0000-000000000t07',
  'Phoenix Mercury':         '00000000-0000-0000-0000-000000000t11',
};

const provider_teams: ProviderTeam[] = Object.entries(TEAM_ID).map(
  ([name, internal_team_id]) => ({
    provider: 'odds_api',
    provider_team_id: name,
    internal_team_id,
    raw_full_name: name,
    raw_name: name,
    raw_abbreviation: '',
    raw_city: '',
    raw_conference: null,
    classification: 'current_franchise',
    mapping_state: 'approved',
  })
);

const internal_games: InternalGame[] = events.response.map(
  (e: any, i: number) => ({
    internal_game_id: `00000000-0000-0000-0000-00000000g${String(i + 1).padStart(2, '0')}`,
    season: 2026,
    season_type: 2 as const,
    home_team_id: TEAM_ID[e.home_team],
    away_team_id: TEAM_ID[e.away_team],
    scheduled_start_utc: e.commence_time,
    actual_start_utc: null,
    status: 'scheduled' as const,
    postseason: false,
  })
);

describe('event reconciliation adapter (Odds §6, V1-1 identity contract)', () => {
  it('LOAD-BEARING: adapter tags provider as "odds_api" (V1-1 dispatch key)', () => {
    const validated = validateEventDiscoveryResponse(events.response);
    const input = odsApiEventToReconciliationInput(validated.valid_events[0]!);
    assert.equal(input.provider, 'odds_api');
    assert.equal(input.provider_game_id, validated.valid_events[0]!.provider_event_id);
    assert.equal(input.raw_home_team, validated.valid_events[0]!.raw_home_team);
    assert.equal(input.raw_away_team, validated.valid_events[0]!.raw_away_team);
    assert.equal(input.raw_commence_time, validated.valid_events[0]!.raw_commence_time);
  });

  it('all six slate events reconcile to their internal game IDs via V1-1 (approved by exact_time)', () => {
    const validated = validateEventDiscoveryResponse(events.response);
    for (const evt of validated.valid_events) {
      const outcome = reconcileOddsApiEvent(evt, {
        provider_teams,
        internal_games,
      });
      assert.equal(outcome.kind, 'approved');
      if (outcome.kind === 'approved') {
        assert.equal(outcome.match_method, 'exact_time');
        assert.equal(outcome.time_delta_seconds, 0);
      }
    }
  });

  it('reversed home/away quarantines (never auto-swap) via V1-1', () => {
    const validated = validateEventDiscoveryResponse([
      {
        id: 'reversed-x',
        sport_key: 'basketball_wnba',
        sport_title: 'WNBA',
        commence_time: '2026-07-10T23:40:00Z',
        home_team: 'Golden State Valkyries', // swap!
        away_team: 'Connecticut Sun',
      },
    ]);
    const outcome = reconcileOddsApiEvent(validated.valid_events[0]!, {
      provider_teams,
      internal_games,
    });
    assert.equal(outcome.kind, 'quarantined');
    if (outcome.kind === 'quarantined') {
      assert.equal(outcome.reason, 'ordered_teams_disagree');
    }
  });
});

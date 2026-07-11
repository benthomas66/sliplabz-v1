import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
  reconcilePlayer,
  type PlayerReconciliationContext,
} from '../../src/identity/playerReconciliation.js';
import type {
  Alias,
  InternalPlayer,
  PlayerReconciliationInput,
  ProviderPlayer,
} from '../../src/identity/types.js';

const here = dirname(fileURLToPath(import.meta.url));
const teamsFixturePath   = resolve(here, '../fixtures/teams.json');
const playersFixturePath = resolve(here, '../fixtures/current-slate-players.json');
const aliasesFixturePath = resolve(here, '../fixtures/aliases.json');

const teamsFixture   = JSON.parse(readFileSync(teamsFixturePath,   'utf8'));
const playersFixture = JSON.parse(readFileSync(playersFixturePath, 'utf8'));
const aliasesFixture = JSON.parse(readFileSync(aliasesFixturePath, 'utf8'));

// Build a team-context map: (provider:provider_team_id) -> internal_team_id
// derived from approved provider_teams entries.
const team_context = new Map<string, string>();
for (const pt of teamsFixture.provider_teams) {
  if (pt.mapping_state === 'approved' && pt.internal_team_id) {
    team_context.set(`${pt.provider}:${pt.provider_team_id}`, pt.internal_team_id);
  }
}

const internal_players: InternalPlayer[] = playersFixture.internal_players;
const provider_players: ProviderPlayer[] = playersFixture.provider_players_pre_approved;
const player_aliases:   Alias[]          = aliasesFixture.player_aliases;

const baseCtx: PlayerReconciliationContext = {
  provider_players,
  internal_players,
  player_aliases,
  team_context,
};

function runCase(kind: string): { input: PlayerReconciliationInput; expected: string } {
  const c = playersFixture.reconciliation_inputs.find((x: any) => x.kind === kind);
  if (!c) throw new Error(`fixture case not found: ${kind}`);
  return { input: c.input, expected: c.expected_outcome };
}

describe('reconcilePlayer — precedence', () => {
  it('exact reviewed provider mapping → approved (reviewed_provider_mapping)', () => {
    const { input } = runCase('exact_reviewed_provider_mapping');
    const outcome = reconcilePlayer(input, baseCtx);
    assert.equal(outcome.kind, 'approved');
    if (outcome.kind === 'approved') {
      assert.equal(outcome.match_method, 'reviewed_provider_mapping');
    }
  });

  it('diacritic alias via reviewed alias → approved (reviewed_alias)', () => {
    const { input } = runCase('diacritic_alias_odds_api');
    const outcome = reconcilePlayer(input, baseCtx);
    assert.equal(outcome.kind, 'approved');
    if (outcome.kind === 'approved') {
      assert.equal(outcome.match_method, 'reviewed_alias');
      assert.equal(outcome.alias_version_at_mapping, 1);
    }
  });

  it('apostrophe alias via reviewed alias → approved (reviewed_alias)', () => {
    const { input } = runCase('apostrophe_alias_odds_api');
    const outcome = reconcilePlayer(input, baseCtx);
    assert.equal(outcome.kind, 'approved');
    if (outcome.kind === 'approved') {
      assert.equal(outcome.match_method, 'reviewed_alias');
    }
  });

  it('ambiguous normalized name → queued (ambiguous_multiple_candidates)', () => {
    const { input } = runCase('ambiguous_normalized_name');
    const outcome = reconcilePlayer(input, baseCtx);
    assert.equal(outcome.kind, 'queued');
    if (outcome.kind === 'queued') {
      assert.equal(outcome.reason, 'ambiguous_multiple_candidates');
      assert.ok(outcome.candidate_internal_player_ids.length >= 2);
    }
  });

  it('team change: normalized single candidate with disagreeing team → proposed_for_review, NOT approved, NOT new identity', () => {
    const { input } = runCase('player_team_change_propose_for_review');
    const outcome = reconcilePlayer(input, baseCtx);
    assert.equal(outcome.kind, 'proposed_for_review');
    if (outcome.kind === 'proposed_for_review') {
      // Same internal identity, not a new one.
      assert.equal(
        outcome.internal_player_id,
        '00000000-0000-0000-0000-00000000p007'
      );
    }
  });

  it('missing team context but alias hit → approved (alias skips team check when provider_team_id_seen is null)', () => {
    const { input, expected } = runCase('missing_team_context');
    const outcome = reconcilePlayer(input, baseCtx);
    assert.equal(outcome.kind, 'approved');
    assert.equal(expected, 'approved_reviewed_alias');
  });

  it('unmatched no candidates → queued (unmatched)', () => {
    const { input } = runCase('unmatched_no_candidates');
    const outcome = reconcilePlayer(input, baseCtx);
    assert.equal(outcome.kind, 'queued');
    if (outcome.kind === 'queued') {
      assert.equal(outcome.reason, 'unmatched');
      assert.equal(outcome.candidate_internal_player_ids.length, 0);
    }
  });

  it('alias conflict → quarantined (ambiguous_alias_conflict)', () => {
    const { input } = runCase('alias_conflict_quarantine');
    const outcome = reconcilePlayer(input, baseCtx);
    assert.equal(outcome.kind, 'quarantined');
    if (outcome.kind === 'quarantined') {
      assert.equal(outcome.reason, 'ambiguous_alias_conflict');
      assert.ok(outcome.candidate_internal_player_ids.length >= 2);
    }
  });

  it('empty provider_player_id → quarantined (unmatched)', () => {
    const { input } = runCase('empty_provider_player_id');
    const outcome = reconcilePlayer(input, baseCtx);
    assert.equal(outcome.kind, 'quarantined');
  });
});

describe('reconcilePlayer — no name-only permanent mapping', () => {
  it('normalized name alone (no alias, no reviewed mapping) never returns `approved`; returns proposed_for_review or queued', () => {
    // Kammerér case, but strip aliases from the context to force the
    // normalization+context path.
    const ctxNoAlias: PlayerReconciliationContext = {
      ...baseCtx,
      player_aliases: [],
    };
    const outcome = reconcilePlayer(
      {
        provider: 'odds_api',
        provider_player_id: 'odds_p_kammerer_no_alias',
        raw_first_name: 'Anastasiia',
        raw_last_name: 'Kammerer',
        raw_full_name: 'Anastasiia Kammerer',
        provider_team_id_seen: 'wnba:ny',
        provider_game_id_seen: null,
      },
      ctxNoAlias
    );
    // Even with a valid single normalized-name candidate and agreeing
    // team context, we must NOT return `approved`.
    assert.notEqual(outcome.kind, 'approved');
    // Because the team context agrees, this is `proposed_for_review`,
    // not `queued`.
    assert.equal(outcome.kind, 'proposed_for_review');
  });
});

describe('reconcilePlayer — provider ID stability', () => {
  it('reruns of the same input on the same fixture context produce the same outcome (idempotence)', () => {
    for (const c of playersFixture.reconciliation_inputs) {
      const a = reconcilePlayer(c.input, baseCtx);
      const b = reconcilePlayer(c.input, baseCtx);
      assert.deepStrictEqual(a, b);
    }
  });

  it('provider_player_id is preserved from input; reconciliation never mutates raw fields', () => {
    // Structural invariant: the input is a `readonly` record. This test
    // just re-asserts we produced a new object rather than mutating.
    const input = playersFixture.reconciliation_inputs[0].input as PlayerReconciliationInput;
    const before = JSON.stringify(input);
    reconcilePlayer(input, baseCtx);
    assert.equal(JSON.stringify(input), before);
  });
});

// Ticket §6 required tests covered here:
//   - active-player disappearance after complete snapshot
//   - failed active-player snapshot cannot mark anyone not_seen_active
//
// Ticket hard invariant: active-player disappearance is only meaningful after
// a COMPLETE active-player snapshot; a failed snapshot must not mark anyone
// not_seen_active.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { closeRun, openRun } from '../../src/bdl/ingestionRun.js';
import { reconcileActivePlayerPresence } from '../../src/bdl/rosterSnapshot.js';
import type { ActivePlayerPresence, IngestionRunClosed } from '../../src/bdl/types.js';

const fx = JSON.parse(
  readFileSync(
    new URL('../fixtures/bdl/active-player-runs.json', import.meta.url),
    'utf8'
  )
);

function runFromFixture(section: any): IngestionRunClosed {
  const open = openRun({
    bdl_ingestion_run_id: section.run.bdl_ingestion_run_id,
    endpoint: section.run.endpoint,
    query_scope_key: section.run.query_scope_key,
    started_at: section.run.completed_at, // synthetic
  });
  return closeRun({
    open,
    completed_at: section.run.completed_at,
    page_count: 1,
    row_count: section.observed_players.length,
    cursor_chain_sent: [null],
    cursor_chain_returned: [null],
    http_status_last: section.run.completion_state === 'complete' ? 200 : 500,
    content_type_last: 'application/json',
    response_headers_last: {},
    completion_state: section.run.completion_state,
    failure_detail:
      section.run.completion_state === 'complete' ? null : 'fixture failure',
  });
}

describe('active-player disappearance after complete snapshot (BDL §12A.4)', () => {
  it('run A (complete) records first-seen presence for all 3 players', () => {
    const runA = runFromFixture(fx.run_A_complete);
    const observed = fx.run_A_complete.observed_players.map(
      (p: any) => p.provider_player_id
    );
    const teams = fx.run_A_complete.observed_players.map(
      (p: any) => p.provider_team_id
    );
    const rec = reconcileActivePlayerPresence({
      run: runA,
      observed_provider_player_ids: observed,
      observed_provider_team_ids: teams,
      current_presence: [],
    });
    assert.equal(rec.advanced, true);
    assert.equal(rec.next_presence.length, 3);
    assert.equal(rec.newly_marked_not_seen.length, 0);
    for (const p of rec.next_presence) {
      assert.equal(p.present_in_latest_complete, true);
      assert.equal(p.last_marked_not_seen_at, null);
    }
  });

  it('LOAD-BEARING: run B (complete) with player 700002 missing → newly_marked_not_seen=[700002]', () => {
    const runA = runFromFixture(fx.run_A_complete);
    const runB = runFromFixture(fx.run_B_complete_p2_missing_p3_traded);

    const observedA = fx.run_A_complete.observed_players.map(
      (p: any) => p.provider_player_id
    );
    const teamsA = fx.run_A_complete.observed_players.map(
      (p: any) => p.provider_team_id
    );
    const recA = reconcileActivePlayerPresence({
      run: runA,
      observed_provider_player_ids: observedA,
      observed_provider_team_ids: teamsA,
      current_presence: [],
    });

    const observedB = fx.run_B_complete_p2_missing_p3_traded.observed_players.map(
      (p: any) => p.provider_player_id
    );
    const teamsB = fx.run_B_complete_p2_missing_p3_traded.observed_players.map(
      (p: any) => p.provider_team_id
    );
    const recB = reconcileActivePlayerPresence({
      run: runB,
      observed_provider_player_ids: observedB,
      observed_provider_team_ids: teamsB,
      current_presence: recA.next_presence,
    });
    assert.equal(recB.advanced, true);
    assert.deepEqual(recB.newly_marked_not_seen, ['700002']);
    const p700002 = recB.next_presence.find(
      (p: ActivePlayerPresence) => p.provider_player_id === '700002'
    )!;
    assert.equal(p700002.present_in_latest_complete, false);
    assert.equal(p700002.last_marked_not_seen_at, runB.completed_at);
    // Player 700003 changed teams from 5→6.
    const teamChange = recB.team_changes.find(
      (t) => t.provider_player_id === '700003'
    );
    assert.ok(teamChange !== undefined);
    assert.equal(teamChange!.prior_provider_team_id, '5');
    assert.equal(teamChange!.new_provider_team_id, '6');
  });

  it('LOAD-BEARING: failed pull (run C partial_pagination) does NOT mark anyone not_seen_active and does NOT rewrite presence', () => {
    const runA = runFromFixture(fx.run_A_complete);
    const observedA = fx.run_A_complete.observed_players.map(
      (p: any) => p.provider_player_id
    );
    const teamsA = fx.run_A_complete.observed_players.map(
      (p: any) => p.provider_team_id
    );
    const recA = reconcileActivePlayerPresence({
      run: runA,
      observed_provider_player_ids: observedA,
      observed_provider_team_ids: teamsA,
      current_presence: [],
    });

    const runC = runFromFixture(fx.run_C_failed_partial);
    const observedC = fx.run_C_failed_partial.observed_players.map(
      (p: any) => p.provider_player_id
    );
    const teamsC = fx.run_C_failed_partial.observed_players.map(
      (p: any) => p.provider_team_id
    );
    const recC = reconcileActivePlayerPresence({
      run: runC,
      observed_provider_player_ids: observedC,
      observed_provider_team_ids: teamsC,
      current_presence: recA.next_presence,
    });
    assert.equal(recC.advanced, false);
    assert.notEqual(recC.refusal_reason, null);
    assert.equal(recC.newly_marked_not_seen.length, 0);
    assert.equal(recC.team_changes.length, 0);
    // Presence retained exactly.
    assert.deepEqual(recC.next_presence, recA.next_presence);
  });
});

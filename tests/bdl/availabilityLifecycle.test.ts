// Ticket §6 required test covered here:
//   - current availability disappearance
//
// Ticket hard invariant: absence from an availability feed never becomes
// "healthy"; it is its own lifecycle state.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { closeRun, openRun } from '../../src/bdl/ingestionRun.js';
import {
  reconcileAvailability,
  type AvailabilityObservation,
} from '../../src/bdl/availabilityLifecycle.js';
import type {
  AvailabilityCurrentState,
  IngestionRunClosed,
} from '../../src/bdl/types.js';

const fx = JSON.parse(
  readFileSync(
    new URL('../fixtures/bdl/availability-snapshots.json', import.meta.url),
    'utf8'
  )
);

function runFromFixture(section: any): IngestionRunClosed {
  const open = openRun({
    bdl_ingestion_run_id: section.run.bdl_ingestion_run_id,
    endpoint: section.run.endpoint,
    query_scope_key: section.run.query_scope_key,
    started_at: section.run.completed_at,
  });
  return closeRun({
    open,
    completed_at: section.run.completed_at,
    page_count: 1,
    row_count: section.observations.length,
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

describe('availability lifecycle (BDL §20)', () => {
  it('snapshot 1 (complete) → both players currently_reported', () => {
    const run1 = runFromFixture(fx.snapshot_1_complete);
    const obs1: AvailabilityObservation[] = fx.snapshot_1_complete.observations.map(
      (o: any) => ({
        provider_player_id: o.provider_player_id,
        internal_player_id: o.internal_player_id,
        source_status: o.source_status,
        source_comment: o.source_comment,
        source_return_date_text: o.source_return_date_text,
        latest_snapshot_id: o.latest_snapshot_id,
        observed_at: o.observed_at,
      })
    );
    const rec = reconcileAvailability({
      run: run1,
      observations: obs1,
      current_states: [],
    });
    assert.equal(rec.advanced, true);
    for (const s of rec.next_states) {
      assert.equal(s.interpretation_state, 'currently_reported');
      assert.equal(s.last_absent_at, null);
    }
  });

  it('LOAD-BEARING: snapshot 2 (complete, one disappears) → absent player → not_returned_latest_complete_snapshot, NEVER "healthy"', () => {
    const run1 = runFromFixture(fx.snapshot_1_complete);
    const obs1: AvailabilityObservation[] = fx.snapshot_1_complete.observations.map(
      (o: any) => ({
        provider_player_id: o.provider_player_id,
        internal_player_id: o.internal_player_id,
        source_status: o.source_status,
        source_comment: o.source_comment,
        source_return_date_text: o.source_return_date_text,
        latest_snapshot_id: o.latest_snapshot_id,
        observed_at: o.observed_at,
      })
    );
    const rec1 = reconcileAvailability({
      run: run1,
      observations: obs1,
      current_states: [],
    });

    const run2 = runFromFixture(fx.snapshot_2_complete_p2_disappears);
    const obs2: AvailabilityObservation[] = fx.snapshot_2_complete_p2_disappears.observations.map(
      (o: any) => ({
        provider_player_id: o.provider_player_id,
        internal_player_id: o.internal_player_id,
        source_status: o.source_status,
        source_comment: o.source_comment,
        source_return_date_text: o.source_return_date_text,
        latest_snapshot_id: o.latest_snapshot_id,
        observed_at: o.observed_at,
      })
    );
    const rec2 = reconcileAvailability({
      run: run2,
      observations: obs2,
      current_states: rec1.next_states,
    });
    assert.equal(rec2.advanced, true);
    assert.deepEqual(rec2.newly_absent, ['600002']);
    const p600002 = rec2.next_states.find(
      (s: AvailabilityCurrentState) => s.provider_player_id === '600002'
    );
    assert.ok(p600002 !== undefined);
    assert.equal(
      p600002!.interpretation_state,
      'not_returned_latest_complete_snapshot'
    );
    assert.equal(p600002!.last_absent_at, run2.completed_at);
    // Never a "healthy" state.
    assert.notEqual(p600002!.interpretation_state, 'currently_reported' as any);
  });

  it('LOAD-BEARING: failed pull does NOT change availability presence', () => {
    const run1 = runFromFixture(fx.snapshot_1_complete);
    const obs1: AvailabilityObservation[] = fx.snapshot_1_complete.observations.map(
      (o: any) => ({
        provider_player_id: o.provider_player_id,
        internal_player_id: o.internal_player_id,
        source_status: o.source_status,
        source_comment: o.source_comment,
        source_return_date_text: o.source_return_date_text,
        latest_snapshot_id: o.latest_snapshot_id,
        observed_at: o.observed_at,
      })
    );
    const rec1 = reconcileAvailability({
      run: run1,
      observations: obs1,
      current_states: [],
    });
    const run3 = runFromFixture(fx.snapshot_3_failed);
    const rec3 = reconcileAvailability({
      run: run3,
      observations: [],
      current_states: rec1.next_states,
    });
    assert.equal(rec3.advanced, false);
    assert.notEqual(rec3.refusal_reason, null);
    assert.equal(rec3.newly_absent.length, 0);
    assert.deepEqual(rec3.next_states, rec1.next_states);
  });
});

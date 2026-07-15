// V1-5x RME-2 unit tests — MappingResolutionResult (post governor REVISE).
//
// Anchors:
//   EVIDENCE_PROFILE_METHOD_V1.md §A.4 binding, §C.9,
//   V1_IDENTITY_CONTRACT.md §§1, 6, 8 (positive resolution: approved provider
//   mapping is authoritative; queue is diagnostic-only for reasons).

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { assembleMappingResolution } from '../../src/computation/mappingResolution.js';

const PID = '00000000-0000-0000-0000-0000000000A1';
const GID = '00000000-0000-0000-0000-0000000000B1';

describe('MappingResolutionResult (RME-2) — pure assembly', () => {
  it('LOAD-BEARING: both resolved → both booleans true, queue_reason null', () => {
    const r = assembleMappingResolution(PID, GID, {
      player_resolved: true,
      event_resolved: true,
      player_queue_reason_candidate: null,
      event_queue_reason_candidate: null,
    });
    assert.equal(r.player_resolved, true);
    assert.equal(r.event_resolved, true);
    assert.equal(r.queue_reason, null);
    assert.equal(r.internal_player_id, PID);
    assert.equal(r.internal_game_id, GID);
  });

  it('player unresolved only, open queue row present → reason = player queue reason (verbatim V1-1 enum value)', () => {
    const r = assembleMappingResolution(PID, GID, {
      player_resolved: false,
      event_resolved: true,
      player_queue_reason_candidate: 'ambiguous_multiple_candidates',
      event_queue_reason_candidate: null,
    });
    assert.equal(r.player_resolved, false);
    assert.equal(r.event_resolved, true);
    assert.equal(r.queue_reason, 'ambiguous_multiple_candidates');
  });

  it('event unresolved only, open queue row present → reason = event queue reason', () => {
    const r = assembleMappingResolution(PID, GID, {
      player_resolved: true,
      event_resolved: false,
      player_queue_reason_candidate: null,
      event_queue_reason_candidate: 'time_window_exceeded',
    });
    assert.equal(r.queue_reason, 'time_window_exceeded');
  });

  it('LOAD-BEARING (§C.9 order): both unresolved → player queue reason wins', () => {
    const r = assembleMappingResolution(PID, GID, {
      player_resolved: false,
      event_resolved: false,
      player_queue_reason_candidate: 'missing_team_context',
      event_queue_reason_candidate: 'unmatched',
    });
    assert.equal(r.player_resolved, false);
    assert.equal(r.event_resolved, false);
    assert.equal(r.queue_reason, 'missing_team_context');
  });

  it("LOAD-BEARING (correction): player unresolved with NO queue row → queue_reason = 'unmatched' (V1-1 vocabulary; NOT invented)", () => {
    const r = assembleMappingResolution(PID, GID, {
      player_resolved: false,
      event_resolved: true,
      player_queue_reason_candidate: null,
      event_queue_reason_candidate: null,
    });
    assert.equal(r.player_resolved, false);
    assert.equal(r.queue_reason, 'unmatched');
  });

  it("LOAD-BEARING (correction): event unresolved with NO queue row → queue_reason = 'unmatched'", () => {
    const r = assembleMappingResolution(PID, GID, {
      player_resolved: true,
      event_resolved: false,
      player_queue_reason_candidate: null,
      event_queue_reason_candidate: null,
    });
    assert.equal(r.queue_reason, 'unmatched');
  });

  it("LOAD-BEARING (correction): both unresolved with NO queue rows anywhere → 'unmatched' (player-side fallback wins per §C.9)", () => {
    const r = assembleMappingResolution(PID, GID, {
      player_resolved: false,
      event_resolved: false,
      player_queue_reason_candidate: null,
      event_queue_reason_candidate: null,
    });
    assert.equal(r.queue_reason, 'unmatched');
  });

  it('assembler REFUSES incoherent input: resolved=true with a non-null queue reason candidate throws', () => {
    assert.throws(
      () => assembleMappingResolution(PID, GID, {
        player_resolved: true,
        event_resolved: true,
        player_queue_reason_candidate: 'unmatched',
        event_queue_reason_candidate: null,
      }),
      /positive resolution overrides queue state/
    );
    assert.throws(
      () => assembleMappingResolution(PID, GID, {
        player_resolved: true,
        event_resolved: true,
        player_queue_reason_candidate: null,
        event_queue_reason_candidate: 'unmatched',
      }),
      /positive resolution overrides queue state/
    );
  });

  it('reuses V1-1 vocabulary verbatim — no parallel reason strings invented', () => {
    // Raw enum values from player_queue_reason / event_queue_reason
    // (migration 20260710190000_enums.sql lines 74–92). Pass-through only.
    const playerReasons = [
      'unmatched', 'ambiguous_multiple_candidates', 'ambiguous_alias_conflict',
      'missing_event_context', 'missing_team_context', 'normalized_name_only',
    ];
    for (const reason of playerReasons) {
      const r = assembleMappingResolution(PID, GID, {
        player_resolved: false,
        event_resolved: true,
        player_queue_reason_candidate: reason,
        event_queue_reason_candidate: null,
      });
      assert.equal(r.queue_reason, reason);
    }
    const eventReasons = [
      'unmatched', 'ambiguous_multiple_candidates', 'unresolved_provider_team',
      'time_window_exceeded', 'ordered_teams_disagree', 'self_match_invalid',
    ];
    for (const reason of eventReasons) {
      const r = assembleMappingResolution(PID, GID, {
        player_resolved: true,
        event_resolved: false,
        player_queue_reason_candidate: null,
        event_queue_reason_candidate: reason,
      });
      assert.equal(r.queue_reason, reason);
    }
  });

  it('result is frozen (immutable read-model shape)', () => {
    const r = assembleMappingResolution(PID, GID, {
      player_resolved: true,
      event_resolved: true,
      player_queue_reason_candidate: null,
      event_queue_reason_candidate: null,
    });
    assert.equal(Object.isFrozen(r), true);
  });
});

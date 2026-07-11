import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMappingHistoryEvent,
  buildSupersessionEvents,
} from '../../src/identity/mappingHistory.js';

describe('mapping history', () => {
  it('emits an `approved` event with the correct fields', () => {
    const evt = buildMappingHistoryEvent({
      provider: 'odds_api',
      entity_kind: 'player',
      provider_entity_id: 'odds_p_100',
      internal_entity_id: '00000000-0000-0000-0000-00000000p001',
      action: 'approved',
      reason: 'reviewed provider mapping',
      mapping_version: 1,
      actor: 'reviewer:v1-1',
      at: new Date('2026-07-10T00:00:00Z'),
    });
    assert.equal(evt.action, 'approved');
    assert.equal(evt.mapping_version, 1);
    assert.equal(evt.created_at, '2026-07-10T00:00:00.000Z');
    assert.equal(evt.prior_internal_entity_id, null);
  });

  it('preserves prior mapping in a supersession event pair', () => {
    const [supersede, approve] = buildSupersessionEvents({
      provider: 'balldontlie',
      entity_kind: 'player',
      provider_entity_id: 'bdl_p_101',
      prior_internal_entity_id: '00000000-0000-0000-0000-0000000000aa',
      new_internal_entity_id:   '00000000-0000-0000-0000-0000000000bb',
      prior_mapping_version: 1,
      new_mapping_version:   2,
      reason: 'reviewed correction',
      actor: 'reviewer:test',
      at: new Date('2026-07-10T00:00:00Z'),
    });
    assert.ok(supersede);
    assert.ok(approve);
    assert.equal(supersede.action, 'superseded');
    assert.equal(approve.action, 'approved');
    assert.equal(supersede.internal_entity_id, '00000000-0000-0000-0000-0000000000aa');
    assert.equal(approve.internal_entity_id,   '00000000-0000-0000-0000-0000000000bb');
    // The append-only invariant: both events reference the prior entity
    // so history reconstruction can walk backwards.
    assert.equal(approve.prior_internal_entity_id, '00000000-0000-0000-0000-0000000000aa');
    assert.equal(supersede.prior_internal_entity_id, '00000000-0000-0000-0000-0000000000aa');
  });

  it('produces frozen (readonly) events', () => {
    const evt = buildMappingHistoryEvent({
      provider: 'odds_api',
      entity_kind: 'team',
      provider_entity_id: 'wnba:phx',
      action: 'proposed',
    });
    assert.ok(Object.isFrozen(evt));
    assert.throws(() => {
      // @ts-expect-error — deliberately mutating a frozen object.
      evt.reason = 'x';
    });
  });
});

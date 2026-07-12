// Ticket §6 required test covered here:
//   - unknown game status (BDL §10) → quarantine
//
// Ticket hard invariants:
//   - Finality comes only from the mapped game status
//   - Unknown game statuses quarantine; never guess

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { mapBdlGameStatus, isFinal } from '../../src/bdl/gameStatus.js';

const unknownFixture = JSON.parse(
  readFileSync(
    new URL('../fixtures/bdl/unknown-game-status.json', import.meta.url),
    'utf8'
  )
);

describe('BDL game-status mapping (§10)', () => {
  it('"Final" → final; is_final=true', () => {
    const r = mapBdlGameStatus('Final');
    assert.equal(r.canonical_status, 'final');
    assert.equal(r.is_unknown, false);
    assert.equal(isFinal('Final'), true);
  });

  it('"Scheduled" → scheduled', () => {
    const r = mapBdlGameStatus('Scheduled');
    assert.equal(r.canonical_status, 'scheduled');
    assert.equal(r.is_unknown, false);
    assert.equal(isFinal('Scheduled'), false);
  });

  it('"InProgress" and "In Progress" and "Live" → live', () => {
    assert.equal(mapBdlGameStatus('InProgress').canonical_status, 'live');
    assert.equal(mapBdlGameStatus('In Progress').canonical_status, 'live');
    assert.equal(mapBdlGameStatus('Live').canonical_status, 'live');
  });

  it('"Postponed" → postponed; "Canceled"/"Cancelled" → canceled', () => {
    assert.equal(mapBdlGameStatus('Postponed').canonical_status, 'postponed');
    assert.equal(mapBdlGameStatus('Canceled').canonical_status, 'canceled');
    assert.equal(mapBdlGameStatus('Cancelled').canonical_status, 'canceled');
  });

  it('LOAD-BEARING: fixture "Delayed" is unknown → unresolved + is_unknown', () => {
    const raw = unknownFixture.game.status as string;
    const r = mapBdlGameStatus(raw);
    assert.equal(r.canonical_status, 'unresolved');
    assert.equal(r.is_unknown, true);
    assert.equal(r.raw_status, 'Delayed');
    assert.equal(isFinal(raw), false);
  });

  it('empty status → unresolved + is_unknown', () => {
    const r = mapBdlGameStatus('');
    assert.equal(r.canonical_status, 'unresolved');
    assert.equal(r.is_unknown, true);
  });

  it('null status → unresolved + is_unknown', () => {
    const r = mapBdlGameStatus(null);
    assert.equal(r.canonical_status, 'unresolved');
    assert.equal(r.is_unknown, true);
  });

  it('FORBIDDEN: never derive finality from clock/period (only the mapping decides)', () => {
    // Even a game with `time="0:00 4Q"` must not be final unless status is
    // "Final". This test is a documenting assertion: this module never
    // inspects clock/period — the input signature has only raw_status.
    assert.equal(isFinal('Live'), false);
    assert.equal(isFinal('InProgress'), false);
  });
});

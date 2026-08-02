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

describe('BDL game-status mapping — GAP-33 WNBA short forms (post/pre)', () => {
  it('GAP-33 #1: "post" → exactly final; is_final=true', () => {
    const r = mapBdlGameStatus('post');
    assert.equal(r.canonical_status, 'final');
    assert.equal(r.is_unknown, false);
    assert.equal(isFinal('post'), true);
  });

  it('GAP-33 #2: case-normalized variants of post map consistently (existing trim/lower contract)', () => {
    for (const v of ['post', 'POST', 'Post', '  post  ', 'pOsT']) {
      const r = mapBdlGameStatus(v);
      assert.equal(r.canonical_status, 'final', `variant ${JSON.stringify(v)}`);
      assert.equal(r.is_unknown, false);
    }
  });

  it('GAP-33 #3: "pre" → exactly scheduled; is_final=false', () => {
    const r = mapBdlGameStatus('pre');
    assert.equal(r.canonical_status, 'scheduled');
    assert.equal(r.is_unknown, false);
    assert.equal(isFinal('pre'), false);
    // and case-normalized variants
    for (const v of ['PRE', 'Pre', '  pre  ']) {
      assert.equal(mapBdlGameStatus(v).canonical_status, 'scheduled', `variant ${JSON.stringify(v)}`);
    }
  });

  it('GAP-33 #4: existing documented tokens are unchanged by the extension', () => {
    assert.equal(mapBdlGameStatus('Final').canonical_status, 'final');
    assert.equal(mapBdlGameStatus('Scheduled').canonical_status, 'scheduled');
    assert.equal(mapBdlGameStatus('InProgress').canonical_status, 'live');
    assert.equal(mapBdlGameStatus('In Progress').canonical_status, 'live');
    assert.equal(mapBdlGameStatus('Live').canonical_status, 'live');
    assert.equal(mapBdlGameStatus('Postponed').canonical_status, 'postponed');
    assert.equal(mapBdlGameStatus('Canceled').canonical_status, 'canceled');
    assert.equal(mapBdlGameStatus('Cancelled').canonical_status, 'canceled');
  });

  it('GAP-33 #5: a genuinely unknown status → unresolved', () => {
    assert.equal(mapBdlGameStatus('Delayed').canonical_status, 'unresolved');
    assert.equal(mapBdlGameStatus('halftime').canonical_status, 'unresolved');
  });

  it('GAP-33 #6: unknown status retains is_unknown: true (quarantine preserved)', () => {
    assert.equal(mapBdlGameStatus('Delayed').is_unknown, true);
    assert.equal(mapBdlGameStatus('halftime').is_unknown, true);
  });

  it('GAP-33 #7: no fuzzy/substring token is accepted (only exact post/pre)', () => {
    // Strings that CONTAIN post/pre as a substring must NOT map — exact-token only.
    for (const v of ['posted', 'postgame', 'postponed-x', 'prelim', 'pregame', 'president', 'preseason', 'repost']) {
      const r = mapBdlGameStatus(v);
      assert.notEqual(r.canonical_status, 'final', `${JSON.stringify(v)} must not be final via substring`);
      // (note: "postponed-x" is unknown, not the exact "postponed" token)
    }
    // "pregame"/"prelim"/"preseason" must NOT become scheduled via prefix.
    for (const v of ['pregame', 'prelim', 'preseason']) {
      assert.equal(mapBdlGameStatus(v).canonical_status, 'unresolved', `${JSON.stringify(v)} must be unresolved`);
      assert.equal(mapBdlGameStatus(v).is_unknown, true);
    }
  });

  it('GAP-33 #8: digits / clock-like / arbitrary text imply neither finality nor scheduling', () => {
    // Explicitly reject the v1_4b `/\d/ → scheduled` heuristic and any clock inference.
    for (const v of ['0:00 4Q', '4:35 4Q', '12', '2026-07-16', '00:00', 'Q4', '7:30 ET']) {
      const r = mapBdlGameStatus(v);
      assert.equal(r.canonical_status, 'unresolved', `${JSON.stringify(v)} must be unresolved`);
      assert.equal(r.is_unknown, true);
      assert.equal(isFinal(v), false);
    }
  });
});

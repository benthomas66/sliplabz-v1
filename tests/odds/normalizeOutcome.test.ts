// Ticket §7 acceptance criterion G: all provider strings, prices, points,
// and timestamps remain auditable verbatim.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { normalizeOutcome } from '../../src/odds/normalizeOutcome.js';

describe('outcome normalization (Odds §10.7, §10.14)', () => {
  it('happy path: sportsbook Over row normalizes with sportsbook_american', () => {
    const r = normalizeOutcome(
      { name: 'Over', description: 'Gabby Williams', price: -115, point: 12.5 },
      'sportsbook_american'
    );
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.outcome.side, 'over');
      assert.equal(r.outcome.raw_description, 'Gabby Williams');
      assert.equal(r.outcome.normalized_player_name, 'gabby williams');
      assert.equal(r.outcome.raw_price, -115);
      assert.equal(r.outcome.raw_point, 12.5);
      assert.equal(r.outcome.price_semantic, 'sportsbook_american');
      assert.equal(r.outcome.raw_multiplier, null);
    }
  });

  it('missing description quarantines (§10.14)', () => {
    const r = normalizeOutcome(
      { name: 'Over', description: '', price: -110, point: 10 },
      'sportsbook_american'
    );
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.quarantine.reason, 'missing_player_description');
  });

  it('missing point quarantines', () => {
    const r = normalizeOutcome(
      { name: 'Over', description: 'X', price: -110 },
      'sportsbook_american'
    );
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.quarantine.reason, 'missing_point');
  });

  it('missing price quarantines', () => {
    const r = normalizeOutcome(
      { name: 'Over', description: 'X', point: 10 },
      'sportsbook_american'
    );
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.quarantine.reason, 'missing_price');
  });

  it('name not in (Over,Under) quarantines with missing_side', () => {
    const r = normalizeOutcome(
      { name: 'Push', description: 'X', price: -110, point: 10 },
      'sportsbook_american'
    );
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.quarantine.reason, 'missing_side');
  });

  it('LOAD-BEARING: raw fields preserved verbatim (audit trail)', () => {
    const r = normalizeOutcome(
      { name: 'Under', description: "O'Neal, Alicia", price: -125, point: 20.5 },
      'sportsbook_american'
    );
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.outcome.raw_description, "O'Neal, Alicia");
      assert.equal(r.outcome.raw_price, -125);
      assert.equal(r.outcome.raw_point, 20.5);
    }
  });

  it('DFS row normalizes with provider_synthetic_or_display_price', () => {
    const r = normalizeOutcome(
      { name: 'Over', description: 'Gabby Williams', price: -137, point: 12.5, multiplier: null },
      'provider_synthetic_or_display_price'
    );
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.outcome.price_semantic, 'provider_synthetic_or_display_price');
      assert.equal(r.outcome.raw_multiplier, null);
    }
  });
});

// Ticket §7 acceptance criterion G: raw provider strings, prices, points,
// and timestamps remain auditable verbatim.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  canonicalOfferingHash,
  contentHash,
} from '../../src/odds/sourceHash.js';

describe('offering source hash & traceability (Odds §10.5, §15.3)', () => {
  it('deterministic across two invocations with identical inputs', () => {
    const inputs = {
      provider_event_id: '1547b39904db439304af0dfdacaa469d',
      bookmaker_key: 'draftkings',
      market_key: 'player_points',
      normalized_player_name: 'gabby williams',
      side: 'over' as const,
      point: 12.5,
      raw_price_american: -115,
      raw_multiplier: null,
      price_semantic: 'sportsbook_american' as const,
      provider_last_update: '2026-07-10T21:34:00Z',
    };
    assert.equal(canonicalOfferingHash(inputs), canonicalOfferingHash(inputs));
  });

  it('LOAD-BEARING: same price at same key with different price_semantic → DIFFERENT hash', () => {
    const base = {
      provider_event_id: 'e',
      bookmaker_key: 'draftkings',
      market_key: 'player_points',
      normalized_player_name: 'p',
      side: 'over' as const,
      point: 12.5,
      raw_price_american: -137,
      raw_multiplier: null,
      provider_last_update: null,
    };
    const sportsbook = canonicalOfferingHash({
      ...base,
      price_semantic: 'sportsbook_american',
    });
    const dfs = canonicalOfferingHash({
      ...base,
      price_semantic: 'provider_synthetic_or_display_price',
    });
    assert.notEqual(sportsbook, dfs);
  });

  it('LOAD-BEARING: point change flips the hash', () => {
    const base = {
      provider_event_id: 'e',
      bookmaker_key: 'draftkings',
      market_key: 'player_points',
      normalized_player_name: 'p',
      side: 'over' as const,
      point: 12.5,
      raw_price_american: -110,
      raw_multiplier: null,
      price_semantic: 'sportsbook_american' as const,
      provider_last_update: null,
    };
    const a = canonicalOfferingHash(base);
    const b = canonicalOfferingHash({ ...base, point: 13.5 });
    assert.notEqual(a, b);
  });

  it('contentHash is order-stable across equivalent object key orderings', () => {
    const a = { z: 1, a: 2, m: { q: 'x', p: 'y' } };
    const b = { a: 2, m: { p: 'y', q: 'x' }, z: 1 };
    assert.equal(contentHash(a), contentHash(b));
  });
});

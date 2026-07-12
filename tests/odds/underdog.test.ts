// Ticket §7 required tests covered here:
//   Test #9:  Underdog multiplier 1.0 remains uninterpreted.
//   Test #10: Underdog over-only offering preserved (Kayla Thornton 8.5 player_points).
//
// Ticket §7 acceptance criterion A: sportsbook and DFS never mix.
// Ticket §7 acceptance criterion F: missing side NEVER fabricated.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  UNDERDOG_KEY,
  UNDERDOG_PRICE_SEMANTIC,
  isUnderdogBookmakerKey,
  resolveUnderdogPromotionType,
  underdogMultiplierIsInterpreted,
} from '../../src/odds/underdog.js';
import { isConsensusEligibleBookmakerKey } from '../../src/odds/bookmakerAllowlist.js';
import { normalizeOutcome } from '../../src/odds/normalizeOutcome.js';
import { collapseOutcomes } from '../../src/odds/duplicateCollapse.js';

const fx = JSON.parse(
  readFileSync(
    new URL('../fixtures/odds/underdog-1547.json', import.meta.url),
    'utf8'
  )
);

describe('Underdog treatment (Odds §12)', () => {
  it('LOAD-BEARING: excluded from sportsbook consensus (§12.9)', () => {
    assert.equal(isConsensusEligibleBookmakerKey(UNDERDOG_KEY), false);
    assert.equal(UNDERDOG_PRICE_SEMANTIC, 'provider_synthetic_or_display_price');
  });

  it('bookmaker key predicate', () => {
    assert.equal(isUnderdogBookmakerKey('underdog'), true);
    assert.equal(isUnderdogBookmakerKey('draftkings'), false);
  });

  it('LOAD-BEARING: multiplier 1.0 is NEVER interpreted (§12.5)', () => {
    assert.equal(underdogMultiplierIsInterpreted(1.0), false);
    assert.equal(underdogMultiplierIsInterpreted(2.0), false);
    assert.equal(underdogMultiplierIsInterpreted(null), false);
    assert.equal(resolveUnderdogPromotionType({ multiplier: 1.0 }), 'unknown');
  });

  it('LOAD-BEARING: fixture invariants — 11 rows, all price=-137, all multiplier=1.0', () => {
    const bookmaker = fx.response.bookmakers[0];
    let total = 0;
    for (const market of bookmaker.markets) {
      for (const outcome of market.outcomes) {
        total += 1;
        assert.equal(outcome.price, -137);
        assert.equal(outcome.multiplier, 1.0);
      }
    }
    assert.equal(total, 11);
  });

  it('LOAD-BEARING: Kayla Thornton 8.5 player_points is over_only; Under NEVER fabricated', () => {
    const bookmaker = fx.response.bookmakers[0];
    const points = bookmaker.markets.find((m: any) => m.key === 'player_points');
    const rows = points.outcomes.map((raw: any, idx: number) => {
      const r = normalizeOutcome(raw, UNDERDOG_PRICE_SEMANTIC);
      assert.equal(r.ok, true);
      if (!r.ok) throw new Error('unreachable');
      return { raw_row_index: idx, outcome: r.outcome };
    });
    const collapsed = collapseOutcomes(rows, {
      provider_event_id: fx.response.id,
      bookmaker_key: UNDERDOG_KEY,
      market_key: 'player_points',
      provider_last_update: points.last_update,
      promotion_type: 'unknown',
    });
    const thornton = collapsed.offerings.filter(
      (o) => o.normalized_player_name === 'kayla thornton'
    );
    assert.equal(thornton.length, 1);
    assert.equal(thornton[0]!.side, 'over');
    assert.equal(thornton[0]!.point, 8.5);
    assert.equal(thornton[0]!.offering_state, 'over_only');
    // No fabricated Under row for Kayla Thornton.
    const under = collapsed.offerings.filter(
      (o) => o.normalized_player_name === 'kayla thornton' && o.side === 'under'
    );
    assert.equal(under.length, 0);
  });

  it('assists market absent for Underdog (§12.7) — coverage evaluated per (event, market)', () => {
    const bookmaker = fx.response.bookmakers[0];
    const marketKeys = bookmaker.markets.map((m: any) => m.key);
    assert.equal(marketKeys.includes('player_assists'), false);
    // The other three markets are present.
    assert.ok(marketKeys.includes('player_points'));
    assert.ok(marketKeys.includes('player_rebounds'));
    assert.ok(marketKeys.includes('player_threes'));
  });
});

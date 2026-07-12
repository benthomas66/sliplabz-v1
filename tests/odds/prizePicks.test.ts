// Ticket §7 required tests covered here:
//   Test #7: PrizePicks symmetric display prices (all rows -137).
//   Test #8: PrizePicks null multiplier (all rows null, promotion_type=unknown).
//
// Ticket §7 acceptance criterion A: sportsbook and DFS never mix in consensus.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  PRIZEPICKS_KEY,
  PRIZEPICKS_PRICE_SEMANTIC,
  isPrizePicksBookmakerKey,
  resolvePrizePicksPromotionType,
} from '../../src/odds/prizePicks.js';
import { isConsensusEligibleBookmakerKey } from '../../src/odds/bookmakerAllowlist.js';
import { normalizeOutcome } from '../../src/odds/normalizeOutcome.js';
import { collapseOutcomes } from '../../src/odds/duplicateCollapse.js';

const fx = JSON.parse(
  readFileSync(
    new URL('../fixtures/odds/prizepicks-1547.json', import.meta.url),
    'utf8'
  )
);

describe('PrizePicks treatment (Odds §11)', () => {
  it('LOAD-BEARING: excluded from sportsbook consensus (§11.8)', () => {
    assert.equal(isConsensusEligibleBookmakerKey(PRIZEPICKS_KEY), false);
    assert.equal(PRIZEPICKS_PRICE_SEMANTIC, 'provider_synthetic_or_display_price');
  });

  it('bookmaker key predicate', () => {
    assert.equal(isPrizePicksBookmakerKey('prizepicks'), true);
    assert.equal(isPrizePicksBookmakerKey('draftkings'), false);
  });

  it('promotion type is ALWAYS `unknown` in V1-3 (§11.7)', () => {
    assert.equal(resolvePrizePicksPromotionType({ multiplier: null }), 'unknown');
    assert.equal(resolvePrizePicksPromotionType({ multiplier: 2.0 }), 'unknown');
    assert.equal(resolvePrizePicksPromotionType({}), 'unknown');
  });

  it('LOAD-BEARING: fixture invariants — 26 rows, ALL price=-137, ALL multiplier=null', () => {
    const bookmaker = fx.response.bookmakers[0];
    let total = 0;
    for (const market of bookmaker.markets) {
      for (const outcome of market.outcomes) {
        total += 1;
        assert.equal(outcome.price, -137);
        assert.equal(outcome.multiplier, null);
      }
    }
    assert.equal(total, 26);
  });

  it('normalized rows carry provider_synthetic_or_display_price semantic', () => {
    const bookmaker = fx.response.bookmakers[0];
    const points = bookmaker.markets.find((m: any) => m.key === 'player_points');
    const rows = points.outcomes.map((raw: any, idx: number) => {
      const r = normalizeOutcome(raw, PRIZEPICKS_PRICE_SEMANTIC);
      assert.equal(r.ok, true);
      if (r.ok) {
        return { raw_row_index: idx, outcome: r.outcome };
      }
      throw new Error('unreachable');
    });
    const collapsed = collapseOutcomes(rows, {
      provider_event_id: fx.response.id,
      bookmaker_key: PRIZEPICKS_KEY,
      market_key: 'player_points',
      provider_last_update: points.last_update,
      promotion_type: 'unknown',
    });
    for (const o of collapsed.offerings) {
      assert.equal(o.price_semantic, 'provider_synthetic_or_display_price');
      assert.equal(o.raw_multiplier, null);
      assert.equal(o.promotion_type, 'unknown');
    }
    // 8 Over + 8 Under = 16 offerings for the points market.
    assert.equal(collapsed.offerings.length, 16);
    assert.equal(collapsed.duplicate_group_count, 0);
  });
});

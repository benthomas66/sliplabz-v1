// Ticket §7 required tests covered here:
//   Test #3: source sparsity — sparse event yields one canonical per outcome.
//   Test #4: zero books — no offerings; not-an-error.
//   Test #5: duplicate BetRivers-style outcomes → collapse with duplicate_count=2.
//   Test #6: conflicting duplicates → quarantine both raw rows; NO canonical.
//   Test #10: Underdog over-only offering preserved as `over_only`.
//   (multi-line preservation is tested inline.)
//
// Ticket §7 acceptance criteria B & C & F.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  collapseOutcomes,
  type CollapseInputRow,
} from '../../src/odds/duplicateCollapse.js';
import { normalizeOutcome } from '../../src/odds/normalizeOutcome.js';
import type { PriceSemantic } from '../../src/shared/enums.js';

function load(name: string) {
  return JSON.parse(
    readFileSync(new URL(`../fixtures/odds/${name}`, import.meta.url), 'utf8')
  );
}

const fxFull = load('event-odds-1547-full.json');
const fxConflict = load('event-odds-1547-conflicting-duplicates.json');
const fxSparse = load('event-odds-93c-partial.json');
const fxUnderdog = load('underdog-1547.json');

function extractInputs(
  outcomes: ReadonlyArray<unknown>,
  price_semantic: PriceSemantic
): CollapseInputRow[] {
  const rows: CollapseInputRow[] = [];
  outcomes.forEach((raw, idx) => {
    const r = normalizeOutcome(raw as any, price_semantic);
    if (r.ok) rows.push({ raw_row_index: idx, outcome: r.outcome });
  });
  return rows;
}

describe('duplicate collapse & conflict quarantine (Odds §10.5, §10.6, §10.9)', () => {
  it('LOAD-BEARING: BetRivers duplicate group collapses (2 Over → 1 canonical duplicate_count=2; 2 Under → same)', () => {
    const betrivers = fxFull.response.bookmakers.find(
      (b: any) => b.key === 'betrivers'
    );
    const market = betrivers.markets[0];
    const rows = extractInputs(market.outcomes, 'sportsbook_american');
    const collapsed = collapseOutcomes(rows, {
      provider_event_id: fxFull.response.id,
      bookmaker_key: 'betrivers',
      market_key: 'player_threes',
      provider_last_update: market.last_update,
      promotion_type: 'unknown',
    });
    assert.equal(collapsed.offerings.length, 2); // one Over, one Under
    assert.equal(collapsed.duplicate_group_count, 2);
    assert.equal(collapsed.conflict_group_count, 0);
    for (const o of collapsed.offerings) {
      assert.equal(o.duplicate_count, 2);
      assert.equal(o.offering_state, 'two_sided_complete');
      assert.equal(o.contributing_raw_row_indexes.length, 2);
    }
  });

  it('LOAD-BEARING: conflicting duplicates quarantine both raw rows; NO canonical offering emitted', () => {
    const bookmaker = fxConflict.response.bookmakers[0];
    const market = bookmaker.markets[0];
    const rows = extractInputs(market.outcomes, 'sportsbook_american');
    const collapsed = collapseOutcomes(rows, {
      provider_event_id: fxConflict.response.id,
      bookmaker_key: bookmaker.key,
      market_key: market.key,
      provider_last_update: market.last_update,
      promotion_type: 'unknown',
    });
    assert.equal(collapsed.conflict_group_count, 1);
    assert.equal(collapsed.duplicate_group_count, 0);
    assert.equal(collapsed.offerings.length, 0);
    assert.equal(collapsed.quarantined_raw_row_indexes.size, 2);
    assert.ok(collapsed.quarantined_raw_row_indexes.has(0));
    assert.ok(collapsed.quarantined_raw_row_indexes.has(1));
  });

  it('LOAD-BEARING: Underdog over-only offering preserved as `over_only`; missing Under NEVER fabricated', () => {
    const bookmaker = fxUnderdog.response.bookmakers[0];
    const market = bookmaker.markets[0]; // player_points
    const rows = extractInputs(market.outcomes, 'provider_synthetic_or_display_price');
    const collapsed = collapseOutcomes(rows, {
      provider_event_id: fxUnderdog.response.id,
      bookmaker_key: 'underdog',
      market_key: 'player_points',
      provider_last_update: market.last_update,
      promotion_type: 'unknown',
    });
    const thornton = collapsed.offerings.filter(
      (o) => o.normalized_player_name === 'kayla thornton'
    );
    // Only ONE offering for Kayla Thornton — the Over at 8.5.
    assert.equal(thornton.length, 1);
    assert.equal(thornton[0]!.side, 'over');
    assert.equal(thornton[0]!.point, 8.5);
    assert.equal(thornton[0]!.offering_state, 'over_only');
    // And nothing was fabricated for the Under side.
    const under = collapsed.offerings.filter(
      (o) => o.normalized_player_name === 'kayla thornton' && o.side === 'under'
    );
    assert.equal(under.length, 0);
  });

  it('source sparsity: sparse event produces canonical rows for each outcome; no duplicates; no conflicts', () => {
    // DraftKings player_points from the sparse event: 2 sides at 18.5.
    const dk = fxSparse.response.bookmakers.find((b: any) => b.key === 'draftkings');
    const market = dk.markets[0];
    const rows = extractInputs(market.outcomes, 'sportsbook_american');
    const collapsed = collapseOutcomes(rows, {
      provider_event_id: fxSparse.response.id,
      bookmaker_key: 'draftkings',
      market_key: 'player_points',
      provider_last_update: market.last_update,
      promotion_type: 'unknown',
    });
    assert.equal(collapsed.offerings.length, 2);
    assert.equal(collapsed.duplicate_group_count, 0);
    assert.equal(collapsed.conflict_group_count, 0);
    for (const o of collapsed.offerings) {
      assert.equal(o.duplicate_count, 1);
      assert.equal(o.offering_state, 'two_sided_complete');
    }
  });

  it('zero books: empty outcomes array yields zero offerings — NOT an error', () => {
    const collapsed = collapseOutcomes([], {
      provider_event_id: 'x',
      bookmaker_key: 'draftkings',
      market_key: 'player_points',
      provider_last_update: null,
      promotion_type: 'unknown',
    });
    assert.equal(collapsed.offerings.length, 0);
    assert.equal(collapsed.duplicate_group_count, 0);
    assert.equal(collapsed.conflict_group_count, 0);
    assert.equal(collapsed.quarantined_raw_row_indexes.size, 0);
  });

  it('multi-line preservation: same player+side at TWO points → both offerings marked `multi_line`', () => {
    const rows: CollapseInputRow[] = [
      {
        raw_row_index: 0,
        outcome: {
          raw_name: 'Over',
          raw_description: 'Player X',
          raw_price: -115,
          raw_point: 12.5,
          raw_multiplier: null,
          side: 'over',
          normalized_player_name: 'player x',
          price_semantic: 'sportsbook_american',
        },
      },
      {
        raw_row_index: 1,
        outcome: {
          raw_name: 'Over',
          raw_description: 'Player X',
          raw_price: -110,
          raw_point: 14.5,
          raw_multiplier: null,
          side: 'over',
          normalized_player_name: 'player x',
          price_semantic: 'sportsbook_american',
        },
      },
    ];
    const collapsed = collapseOutcomes(rows, {
      provider_event_id: 'x',
      bookmaker_key: 'draftkings',
      market_key: 'player_points',
      provider_last_update: null,
      promotion_type: 'unknown',
    });
    assert.equal(collapsed.offerings.length, 2);
    for (const o of collapsed.offerings) {
      assert.equal(o.offering_state, 'multi_line');
    }
  });
});

// V1-5 ticket §9 required tests — consensus, price at exact point/side,
// DFS exclusion, cross-book grouping regression (ledger #7).

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  computeEligibleBookCount,
  computeLineConsensus,
  computeLineRange,
  computePointDistribution,
} from '../../src/computation/consensus.js';
import { bestPriceAtExactPointSide } from '../../src/computation/priceComparison.js';
import { offering } from './support/fixtures.js';

describe('line consensus — sportsbook-only, cross-book', () => {
  it('REQUIRED: consensus across different sportsbook points → unique_modal at the majority point', () => {
    // 5 sportsbooks: 3 at 12.5, 2 at 13.5. Modal = 12.5.
    const offerings = [
      offering({ bookmaker_key: 'draftkings', point: 12.5 }),
      offering({ bookmaker_key: 'fanduel', point: 12.5 }),
      offering({ bookmaker_key: 'betmgm', point: 12.5 }),
      offering({ bookmaker_key: 'williamhill_us', point: 13.5 }),
      offering({ bookmaker_key: 'betrivers', point: 13.5 }),
    ];
    const r = computeLineConsensus(offerings);
    assert.equal(r.selection_method, 'unique_modal');
    assert.equal(r.consensus_point, 12.5);
    assert.equal(r.total_eligible_sportsbook_count, 5);
    assert.equal(r.sportsbook_count_at_selected_point, 3);
    assert.equal(r.coverage_label, 'complete');
  });

  it('REQUIRED: DFS exclusion — PrizePicks and Underdog never contribute', () => {
    const offerings = [
      offering({ bookmaker_key: 'draftkings', point: 12.5 }),
      offering({ bookmaker_key: 'fanduel', point: 12.5 }),
      // DFS: NEVER counted in consensus.
      offering({ bookmaker_key: 'prizepicks', point: 8.5 }),
      offering({ bookmaker_key: 'underdog', point: 8.5 }),
    ];
    const r = computeLineConsensus(offerings);
    assert.equal(r.selection_method, 'unique_modal');
    assert.equal(r.consensus_point, 12.5);
    assert.equal(r.total_eligible_sportsbook_count, 2);
    // point 8.5 is NOT in the distribution at all.
    const dist = computePointDistribution(offerings);
    assert.equal(dist.counts.some((c) => c.point === 8.5), false);
    // eligible_book_count also excludes DFS.
    const cnt = computeEligibleBookCount(offerings);
    assert.equal(cnt.count, 2);
  });

  it('LOAD-BEARING (ledger #7): cross-book grouping — 4 books tied 2-2 → tied_no_unique_mode (per-book impl would incorrectly write single_book at whichever book was first)', () => {
    // Per-book grouping would have written single_book (either at the
    // first book's point or none at all — depending on the impl's ordering).
    // Cross-book grouping produces the correct tied outcome.
    const offerings = [
      offering({ bookmaker_key: 'draftkings', point: 12.5 }),
      offering({ bookmaker_key: 'fanduel', point: 12.5 }),
      offering({ bookmaker_key: 'betmgm', point: 13.5 }),
      offering({ bookmaker_key: 'williamhill_us', point: 13.5 }),
    ];
    const r = computeLineConsensus(offerings);
    assert.equal(r.selection_method, 'tied_no_unique_mode');
    assert.equal(r.consensus_point, null);
    assert.equal(r.total_eligible_sportsbook_count, 4);
    assert.equal(r.coverage_label, 'unresolved_consensus');
  });

  it('single_book: exactly one eligible sportsbook → single_book coverage', () => {
    const r = computeLineConsensus([offering({ point: 12.5 })]);
    assert.equal(r.selection_method, 'single_book');
    assert.equal(r.consensus_point, 12.5);
    assert.equal(r.coverage_label, 'single_book');
  });

  it('no_eligible_source: empty offering set', () => {
    const r = computeLineConsensus([]);
    assert.equal(r.selection_method, 'no_eligible_source');
    assert.equal(r.consensus_point, null);
    assert.equal(r.coverage_label, 'no_line');
  });

  it('line range: min/max across eligible sportsbook offerings only', () => {
    const offerings = [
      offering({ bookmaker_key: 'draftkings', point: 12.5 }),
      offering({ bookmaker_key: 'fanduel', point: 14.5 }),
      offering({ bookmaker_key: 'prizepicks', point: 5.0 }), // DFS excluded
    ];
    const r = computeLineRange(offerings);
    assert.equal(r.min_point, 12.5);
    assert.equal(r.max_point, 14.5);
  });
});

describe('price comparison at exact point/side only (§7.7)', () => {
  it('REQUIRED: best price at (12.5, over) never consults 13.5 or the Under side', () => {
    const offerings = [
      offering({ bookmaker_key: 'draftkings', point: 12.5, over_price: -115, under_price: -105 }),
      offering({ bookmaker_key: 'fanduel', point: 12.5, over_price: -108, under_price: -112 }),
      // Different point — must NOT contribute to (12.5, over) best.
      offering({ bookmaker_key: 'betmgm', point: 13.5, over_price: +105, under_price: -125 }),
      // Same point, opposite side — must NOT contribute.
      offering({ bookmaker_key: 'williamhill_us', point: 12.5, over_price: -110, under_price: -110 }),
      // DFS at same point — must NOT contribute.
      offering({ bookmaker_key: 'prizepicks', point: 12.5, over_price: +200, under_price: null }),
    ];
    const r = bestPriceAtExactPointSide({ offerings, point: 12.5, side: 'over' });
    // -108 (from fanduel) is the highest (best) American price at 12.5-Over.
    assert.equal(r.best_american, -108);
    assert.equal(r.book_at_best, 'fanduel');
    assert.equal(r.eligible_book_count_at_point_side, 3); // dk, fd, whill
    assert.deepEqual([...r.all_books_at_point_side], ['draftkings', 'fanduel', 'williamhill_us']);
  });

  it('best price at (13.5, under) — never consults 12.5', () => {
    const offerings = [
      offering({ bookmaker_key: 'draftkings', point: 12.5, over_price: -110, under_price: -110 }),
      offering({ bookmaker_key: 'betmgm', point: 13.5, over_price: +105, under_price: -125 }),
      offering({ bookmaker_key: 'williamhill_us', point: 13.5, over_price: +100, under_price: -130 }),
    ];
    const r = bestPriceAtExactPointSide({ offerings, point: 13.5, side: 'under' });
    // -125 > -130 in American semantics.
    assert.equal(r.best_american, -125);
    assert.equal(r.book_at_best, 'betmgm');
  });
});

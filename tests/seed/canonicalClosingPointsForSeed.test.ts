// V1-4b Phase B correction — regression tests for canonical closing-point
// grouping.
//
// LOAD-BEARING: `computeCanonicalRows` MUST group source_closing_quotes by
// (internal_game_id, internal_player_id, market_key) and pass all books'
// quotes for that grain to selectCanonicalClosingPoint. The previous
// implementation embedded canonical selection inside
// persistHistoricalSnapshot (per (event, bookmaker, market) transaction),
// which meant the selector ran over quotes from a SINGLE book — a
// materially different (and, in the multi-book case, WRONG) computation.
//
// The scenarios in this file are constructed so that the correct outcome is
// only obtainable when the books are grouped together.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  computeCanonicalRows,
  type CanonicalInputQuote,
} from '../../src/seed/orchestrator/canonicalClosingPointsForSeed.js';
import { selectCanonicalClosingPoint } from '../../src/lines/canonicalClosingPoint.js';

// Fixtures ------------------------------------------------------------------
const G1 = 'game-1';
const P_ALICE = 'player-alice';
const P_BOB = 'player-bob';
const M_PTS = 'player_points';
const M_REB = 'player_rebounds';
const CLOSE_BOUNDARY = '2026-05-08T23:00:00Z';

function q(
  book: string,
  point: number,
  overrides: Partial<CanonicalInputQuote> = {}
): CanonicalInputQuote {
  return {
    internal_game_id: G1,
    internal_player_id: P_ALICE,
    market_key: M_PTS,
    bookmaker_key: book,
    source_class: 'sportsbook',
    close_capture_state: 'eligible',
    closing_point: point,
    close_boundary_utc: CLOSE_BOUNDARY,
    ...overrides,
  };
}

describe('computeCanonicalRows — cross-book grouping (V1-4b Phase B correction)', () => {
  it('LOAD-BEARING: 3 books at 2 distinct points collapse to unique_modal only when grouped cross-book', () => {
    // Scenario: (game, player=Alice, market=points) has three eligible
    // sportsbook quotes:
    //   DraftKings @ 5.5
    //   FanDuel    @ 5.5
    //   BetMGM     @ 4.5
    // The correct canonical selection (cross-book) is:
    //   selection_method  = unique_modal
    //   canonical_closing_point = 5.5
    //   total_eligible_sportsbook_count = 3
    //   sportsbook_count_at_selected_point = 2
    //   coverage_label = 'complete'
    const quotes: CanonicalInputQuote[] = [
      q('draftkings', 5.5),
      q('fanduel', 5.5),
      q('betmgm', 4.5),
    ];
    const rows = computeCanonicalRows(quotes);
    assert.equal(rows.length, 1);
    const r = rows[0]!;
    assert.equal(r.internal_game_id, G1);
    assert.equal(r.internal_player_id, P_ALICE);
    assert.equal(r.market_key, M_PTS);
    assert.equal(r.selection.selection_method, 'unique_modal');
    assert.equal(r.selection.canonical_closing_point, 5.5);
    assert.equal(r.selection.total_eligible_sportsbook_count, 3);
    assert.equal(r.selection.sportsbook_count_at_selected_point, 2);
    assert.equal(r.selection.coverage_label, 'complete');

    // Regression witness: the previous per-book impl would have called
    // selectCanonicalClosingPoint SEPARATELY with each single-book subset,
    // producing three independent single_book selections and racing them
    // via ON CONFLICT DO NOTHING. Whichever book was persisted first would
    // have won — a wrong result whose selection_method is single_book
    // regardless of whether the correct answer was unique_modal.
    for (const book of ['draftkings', 'fanduel', 'betmgm']) {
      const perBookSelection = selectCanonicalClosingPoint(
        quotes.filter((qq) => qq.bookmaker_key === book).map((qq) => ({
          bookmaker_key: qq.bookmaker_key,
          source_class: qq.source_class,
          close_capture_state: qq.close_capture_state,
          closing_point: qq.closing_point,
        }))
      );
      assert.equal(
        perBookSelection.selection_method,
        'single_book',
        `per-book selection for ${book} must be single_book, proving the previous impl would have written the wrong selection_method`
      );
      assert.notEqual(perBookSelection.selection_method, 'unique_modal');
    }
  });

  it('LOAD-BEARING: 4 books tied 2-2 produce tied_no_unique_mode cross-book (excluded from windows); per-book would have written single_book', () => {
    // Scenario chosen so per-book impl would have selected single_book at
    // whichever point the first-committed book had, while the correct
    // cross-book selection MUST be tied_no_unique_mode with canonical NULL.
    const quotes: CanonicalInputQuote[] = [
      q('draftkings', 7.5),
      q('fanduel',    7.5),
      q('betmgm',     6.5),
      q('williamhill_us', 6.5),
    ];
    const rows = computeCanonicalRows(quotes);
    assert.equal(rows.length, 1);
    const r = rows[0]!;
    assert.equal(r.selection.selection_method, 'tied_no_unique_mode');
    assert.equal(r.selection.canonical_closing_point, null);
    assert.equal(r.selection.coverage_label, 'unresolved_closing_consensus');
    assert.equal(r.selection.total_eligible_sportsbook_count, 4);

    // Regression witness: per-book would have written single_book at 7.5
    // (or 6.5, depending on book order), NEVER tied_no_unique_mode.
    const firstBookSelection = selectCanonicalClosingPoint(
      quotes.filter((qq) => qq.bookmaker_key === 'draftkings').map((qq) => ({
        bookmaker_key: qq.bookmaker_key,
        source_class: qq.source_class,
        close_capture_state: qq.close_capture_state,
        closing_point: qq.closing_point,
      }))
    );
    assert.equal(firstBookSelection.selection_method, 'single_book');
    assert.equal(firstBookSelection.canonical_closing_point, 7.5);
    // A downstream aggregation would have INCORRECTLY included this game
    // in historical windows under the previous impl. It is CORRECTLY
    // excluded (canonical=NULL) under the new impl.
  });

  it('groups by (game, player, market): different players in the same book do NOT contribute to each other\'s modal', () => {
    // Regression against the deepest failure mode of the previous impl:
    // it called selectCanonicalClosingPoint over `input.candidates`, which
    // included ALL players' candidates for a single (event, bm, mk). The
    // resulting modal was the modal point across DIFFERENT PLAYERS —
    // meaningless as a canonical closing point for any single player.
    const quotes: CanonicalInputQuote[] = [
      q('draftkings', 5.5),
      q('draftkings', 4.5, { internal_player_id: P_BOB }),
      q('fanduel',   4.5, { internal_player_id: P_BOB }),
      q('fanduel',   5.5),
    ];
    const rows = computeCanonicalRows(quotes);
    assert.equal(rows.length, 2);
    const alice = rows.find((r) => r.internal_player_id === P_ALICE)!;
    const bob = rows.find((r) => r.internal_player_id === P_BOB)!;
    // Alice: two books both @ 5.5.
    assert.equal(alice.selection.selection_method, 'unique_modal');
    assert.equal(alice.selection.canonical_closing_point, 5.5);
    assert.equal(alice.selection.sportsbook_count_at_selected_point, 2);
    // Bob: two books both @ 4.5.
    assert.equal(bob.selection.selection_method, 'unique_modal');
    assert.equal(bob.selection.canonical_closing_point, 4.5);
    assert.equal(bob.selection.sportsbook_count_at_selected_point, 2);
  });

  it('groups by (game, player, market): different markets never mix', () => {
    const quotes: CanonicalInputQuote[] = [
      q('draftkings', 5.5),
      q('fanduel',   5.5),
      q('draftkings', 8.5, { market_key: M_REB }),
      q('fanduel',   8.5, { market_key: M_REB }),
    ];
    const rows = computeCanonicalRows(quotes);
    assert.equal(rows.length, 2);
    const pts = rows.find((r) => r.market_key === M_PTS)!;
    const reb = rows.find((r) => r.market_key === M_REB)!;
    assert.equal(pts.selection.selection_method, 'unique_modal');
    assert.equal(pts.selection.canonical_closing_point, 5.5);
    assert.equal(reb.selection.selection_method, 'unique_modal');
    assert.equal(reb.selection.canonical_closing_point, 8.5);
  });

  it('a single-book grain is correctly labeled single_book', () => {
    const quotes: CanonicalInputQuote[] = [q('draftkings', 5.5)];
    const rows = computeCanonicalRows(quotes);
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.selection.selection_method, 'single_book');
    assert.equal(rows[0]!.selection.total_eligible_sportsbook_count, 1);
    assert.equal(rows[0]!.selection.coverage_label, 'single_book');
  });

  it('emits nothing for an empty quote input', () => {
    const rows = computeCanonicalRows([]);
    assert.equal(rows.length, 0);
  });
});

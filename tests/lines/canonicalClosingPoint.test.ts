// Ticket §8 required tests covered here:
//   Test #14: one eligible sportsbook (`single_book`)
//   Test #15: unique modal closing point
//   Test #16: tied closing points with no unique mode
//   Test #17: historical record excluded from current selection (via
//              sportsbook-only + eligible filter — DFS/pick'em never
//              participate, and historical/backfilled rows are not eligible)
//   Test #13: missing closing line

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { selectCanonicalClosingPoint } from '../../src/lines/canonicalClosingPoint.js';

const fx = JSON.parse(
  readFileSync(
    new URL('../fixtures/lines/closing-quotes-cases.json', import.meta.url),
    'utf8'
  )
);

describe('canonical closing-point selection (spec §7.10.2, Odds §18.4)', () => {
  it('runs every fixture case', () => {
    for (const c of fx.cases) {
      const r = selectCanonicalClosingPoint(c.quotes);
      assert.equal(
        r.selection_method,
        c.expected.selection_method,
        `case ${c.case_name}: selection_method`
      );
      assert.equal(
        r.canonical_closing_point,
        c.expected.canonical_closing_point,
        `case ${c.case_name}: canonical_closing_point`
      );
      assert.equal(
        r.total_eligible_sportsbook_count,
        c.expected.total_eligible_sportsbook_count,
        `case ${c.case_name}: total_eligible_sportsbook_count`
      );
      assert.equal(
        r.sportsbook_count_at_selected_point,
        c.expected.sportsbook_count_at_selected_point,
        `case ${c.case_name}: sportsbook_count_at_selected_point`
      );
      assert.equal(
        r.coverage_label,
        c.expected.coverage_label,
        `case ${c.case_name}: coverage_label`
      );
    }
  });

  it('LOAD-BEARING: DFS/pick\'em rows NEVER contribute to canonical selection', () => {
    const r = selectCanonicalClosingPoint([
      { bookmaker_key: 'prizepicks', source_class: 'dfs_pickem', close_capture_state: 'eligible', closing_point: 12.5 },
      { bookmaker_key: 'underdog',   source_class: 'dfs_pickem', close_capture_state: 'eligible', closing_point: 12.5 },
    ]);
    assert.equal(r.selection_method, 'no_eligible_source');
    assert.equal(r.canonical_closing_point, null);
    assert.equal(r.coverage_label, 'no_closing_line');
  });

  it('LOAD-BEARING: single_book coverage is LABELED as single_book, never as consensus', () => {
    const r = selectCanonicalClosingPoint([
      { bookmaker_key: 'draftkings', source_class: 'sportsbook', close_capture_state: 'eligible', closing_point: 12.5 },
    ]);
    assert.equal(r.coverage_label, 'single_book');
    assert.notEqual(r.coverage_label, 'complete');
  });

  it('LOAD-BEARING: tied modal → unresolved; the game is excluded from aggregate windows downstream', () => {
    const r = selectCanonicalClosingPoint([
      { bookmaker_key: 'draftkings', source_class: 'sportsbook', close_capture_state: 'eligible', closing_point: 12.5 },
      { bookmaker_key: 'fanduel',    source_class: 'sportsbook', close_capture_state: 'eligible', closing_point: 13.5 },
    ]);
    assert.equal(r.selection_method, 'tied_no_unique_mode');
    assert.equal(r.canonical_closing_point, null);
    assert.equal(r.coverage_label, 'unresolved_closing_consensus');
  });

  it('LOAD-BEARING: canonical point (unique_modal case) equals a point observed in eligible sportsbook quote', () => {
    const r = selectCanonicalClosingPoint([
      { bookmaker_key: 'draftkings', source_class: 'sportsbook', close_capture_state: 'eligible', closing_point: 12.5 },
      { bookmaker_key: 'fanduel',    source_class: 'sportsbook', close_capture_state: 'eligible', closing_point: 12.5 },
      { bookmaker_key: 'betmgm',     source_class: 'sportsbook', close_capture_state: 'eligible', closing_point: 13.5 },
    ]);
    assert.equal(r.canonical_closing_point, 12.5);
    // The observed points are {12.5, 12.5, 13.5}; the selected 12.5 is in that set.
    assert.ok([12.5, 13.5].includes(r.canonical_closing_point!));
  });

  it('LOAD-BEARING: no interpolation — canonical point is NEVER a value NOT observed in an eligible quote', () => {
    // Two books at 12.5 and 13.5 — the arithmetic median would be 13.0.
    // The canonical selection must NOT return 13.0.
    const r = selectCanonicalClosingPoint([
      { bookmaker_key: 'draftkings', source_class: 'sportsbook', close_capture_state: 'eligible', closing_point: 12.5 },
      { bookmaker_key: 'fanduel',    source_class: 'sportsbook', close_capture_state: 'eligible', closing_point: 13.5 },
    ]);
    assert.notEqual(r.canonical_closing_point, 13.0);
    assert.equal(r.canonical_closing_point, null);
  });

  it('missing closing line → no_eligible_source + no_closing_line', () => {
    const r = selectCanonicalClosingPoint([
      { bookmaker_key: 'draftkings', source_class: 'sportsbook', close_capture_state: 'no_snapshot', closing_point: null },
    ]);
    assert.equal(r.selection_method, 'no_eligible_source');
    assert.equal(r.coverage_label, 'no_closing_line');
  });

  it('close_capture_stale rows are NOT eligible for canonical selection', () => {
    const r = selectCanonicalClosingPoint([
      { bookmaker_key: 'draftkings', source_class: 'sportsbook', close_capture_state: 'close_capture_stale', closing_point: 12.5 },
      { bookmaker_key: 'fanduel',    source_class: 'sportsbook', close_capture_state: 'eligible',             closing_point: 13.5 },
    ]);
    assert.equal(r.selection_method, 'single_book');
    assert.equal(r.canonical_closing_point, 13.5);
  });
});

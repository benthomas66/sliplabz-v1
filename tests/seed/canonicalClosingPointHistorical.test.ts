// Ticket §8b required tests covered here:
//   #6: single-book canonical close
//   #7: unique modal canonical close
//   #8: tied points with no unique mode
//
// The seed pipeline reuses V1-4's selectCanonicalClosingPoint to compute
// canonical historical points. Every canonical point must equal a point
// actually offered by an eligible sportsbook.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { processHistoricalSnapshot } from '../../src/seed/historicalEventOdds.js';
import { selectCanonicalClosingPoint } from '../../src/lines/canonicalClosingPoint.js';

function load(name: string) {
  return JSON.parse(
    readFileSync(new URL(`../fixtures/seed/${name}`, import.meta.url), 'utf8')
  );
}

function candidatesToSelectionInput(candidates: ReadonlyArray<{
  bookmaker_key: string;
  source_class: 'sportsbook' | 'dfs_pickem' | 'unknown';
  close_capture_state: 'eligible' | 'close_capture_stale' | 'no_snapshot';
  closing_point: number | null;
}>) {
  return candidates.map((c) => ({
    bookmaker_key: c.bookmaker_key,
    source_class: c.source_class,
    close_capture_state: c.close_capture_state,
    closing_point: c.closing_point,
  }));
}

describe('historical canonical closing-point selection (§7.10.2, §18.4)', () => {
  it('LOAD-BEARING #6: single-book eligible sportsbook → single_book coverage; canonical = observed point', () => {
    const fx = load('historical-event-odds-single-book.json');
    const r = processHistoricalSnapshot({
      requested_close_boundary_utc: fx.requested_close_boundary_utc,
      response: fx.response_body,
    });
    const selection = selectCanonicalClosingPoint(candidatesToSelectionInput(r.candidates));
    assert.equal(selection.selection_method, 'single_book');
    assert.equal(selection.canonical_closing_point, 15.5);
    assert.equal(selection.coverage_label, 'single_book');
    // Governor invariant: canonical point equals a point in an eligible quote.
    assert.ok(r.candidates.some((c) => c.closing_point === selection.canonical_closing_point));
  });

  it('LOAD-BEARING #7: unique modal (2 books at 12.5, 1 at 13.5) → canonical = 12.5; coverage complete', () => {
    const fx = load('historical-event-odds-unique-modal.json');
    const r = processHistoricalSnapshot({
      requested_close_boundary_utc: fx.requested_close_boundary_utc,
      response: fx.response_body,
    });
    const selection = selectCanonicalClosingPoint(candidatesToSelectionInput(r.candidates));
    assert.equal(selection.selection_method, 'unique_modal');
    assert.equal(selection.canonical_closing_point, 12.5);
    assert.equal(selection.coverage_label, 'complete');
    assert.equal(selection.total_eligible_sportsbook_count, 3);
    assert.equal(selection.sportsbook_count_at_selected_point, 2);
    assert.ok(r.candidates.some((c) => c.closing_point === 12.5));
  });

  it('LOAD-BEARING #8: tied 12.5 vs 13.5 → tied_no_unique_mode; NULL canonical; unresolved coverage', () => {
    const fx = load('historical-event-odds-tied.json');
    const r = processHistoricalSnapshot({
      requested_close_boundary_utc: fx.requested_close_boundary_utc,
      response: fx.response_body,
    });
    const selection = selectCanonicalClosingPoint(candidatesToSelectionInput(r.candidates));
    assert.equal(selection.selection_method, 'tied_no_unique_mode');
    assert.equal(selection.canonical_closing_point, null);
    assert.equal(selection.coverage_label, 'unresolved_closing_consensus');
  });

  it('LOAD-BEARING no-interpolation: canonical point is NEVER a synthetic value between offered points', () => {
    const fx = load('historical-event-odds-tied.json');
    const r = processHistoricalSnapshot({
      requested_close_boundary_utc: fx.requested_close_boundary_utc,
      response: fx.response_body,
    });
    const selection = selectCanonicalClosingPoint(candidatesToSelectionInput(r.candidates));
    // Arithmetic median of 12.5 & 13.5 would be 13.0 — must NOT be selected.
    assert.notEqual(selection.canonical_closing_point, 13.0);
    assert.equal(selection.canonical_closing_point, null);
  });
});

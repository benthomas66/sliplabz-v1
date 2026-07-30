// V1-8a2 — pure server-side band-helper tests (no client JS, no browser).
// Covers test groups 2 (strip spans) and 9 (fallback determinism) plus the
// glyph mapping and freshness view. DOM/served-HTML groups run in the audit.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  stripSpan, spanEligibleTally, cellGlyph, fallbackAvatar, freshnessView,
} from '../src/lib/board/bandView.js';
import type { SeriesCell } from '../src/lib/boardProjection.js';

function cell(ordinal: number, kind: 'eligible' | 'ineligible', outcome: 'above' | 'below' | 'equal' | null, dnp = false): SeriesCell {
  return {
    ordinal, game_date_utc: `2026-06-${String(ordinal + 1).padStart(2, '0')}`,
    opponent_label: `Opp${ordinal}`, is_home: ordinal % 2 === 0,
    stat_value: kind === 'eligible' ? 20 : null, evaluated_line: 24.5,
    position_kind: kind, outcome,
    eligibility_state: kind === 'eligible' ? 'eligible' : (dnp ? 'non_participation' : 'eligible'),
    minutes_status: dnp ? 'dnp' : 'played', includes_backfilled_historical: false,
  };
}

// oldest→newest; a DNP at ordinal 3 is INTERLEAVED (eligible before and after).
const SERIES: SeriesCell[] = [
  cell(0, 'eligible', 'above'), cell(1, 'eligible', 'below'), cell(2, 'eligible', 'above'),
  cell(3, 'ineligible', null, true), // interleaved DNP
  cell(4, 'eligible', 'above'), cell(5, 'eligible', 'below'), cell(6, 'eligible', 'above'),
  cell(7, 'eligible', 'below'), cell(8, 'eligible', 'above'), cell(9, 'eligible', 'below'),
  cell(10, 'eligible', 'above'), cell(11, 'eligible', 'above'),
];

test('G2: L10 span INCLUDES the interleaved DNP; cell count exceeds 10; eligible tally reconciles', () => {
  // 11 eligible total; L10 uses the 10 most-recent eligible (drops ordinal 0).
  const span = stripSpan(SERIES, 10);
  // span from the 10th-most-recent eligible (ordinal 1) through 11, inclusive of the DNP at 3.
  assert.equal(span[0]!.ordinal, 1);
  assert.equal(span[span.length - 1]!.ordinal, 11);
  assert.ok(span.length > 10, `L10 strip must render >10 cells with an interleaved DNP (got ${span.length})`);
  const dnp = span.find((c) => c.position_kind === 'ineligible');
  assert.ok(dnp !== undefined && dnp.ordinal === 3, 'the interleaved DNP holds its chronological place inside the span');
  assert.equal(dnp!.outcome, null, 'the DNP carries no verdict');
  // eligible tally within the span reconciles to a 10-eligible window.
  const t = spanEligibleTally(span);
  assert.equal(t.above + t.below + t.equal, 10, 'exactly 10 eligible cells in the L10 span');
});

test('G2: season span is the full requested chronology; L5 span is the 5 most-recent eligible + interleaved', () => {
  const season = stripSpan(SERIES, 11); // all eligible
  assert.equal(season.length, SERIES.length, 'season strip spans every requested position');
  const l5 = stripSpan(SERIES, 5);
  assert.equal(spanEligibleTally(l5).above + spanEligibleTally(l5).below + spanEligibleTally(l5).equal, 5);
});

test('glyph mapping: filled=above, hollow=below, dash=push, ghost=ineligible', () => {
  assert.equal(cellGlyph(cell(0, 'eligible', 'above')), 'filled');
  assert.equal(cellGlyph(cell(0, 'eligible', 'below')), 'hollow');
  assert.equal(cellGlyph(cell(0, 'eligible', 'equal')), 'dash');
  assert.equal(cellGlyph(cell(0, 'ineligible', null, true)), 'ghost');
});

test('G9: fallback avatar is DETERMINISTIC — same player → same initials + shade; no randomness', () => {
  const a1 = fallbackAvatar('Sabrina Ionescu');
  const a2 = fallbackAvatar('Sabrina Ionescu');
  assert.deepEqual(a1, a2);
  assert.equal(a1.initials, 'SI');
  // different players generally differ; at least the initials do here
  assert.notEqual(fallbackAvatar('Aja Wilson').initials, a1.initials);
});

test('§2.6 freshness view: state + elapsed duration; desaturates toward the horizon (never below 0.45)', () => {
  const fresh = freshnessView('fresh', 60);
  assert.equal(fresh.label, 'fresh');
  assert.match(fresh.elapsed, /ago/);
  assert.ok(fresh.opacity > 0.9, 'a fresh row is near full opacity');
  const old = freshnessView('aging', 3600);
  assert.ok(old.opacity >= 0.45 && old.opacity < fresh.opacity, 'older desaturates (lower opacity) but not below 0.45');
});

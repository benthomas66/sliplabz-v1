// V1-8b — deterministic presentation-translation unit tests for the Research
// View terminology layer. Pure functions only: NO rendering, NO evidence
// computation, NO persistence. Proves every internal value maps to approved
// plain language, that an UNKNOWN value fails SAFE (never leaks the raw token),
// and that the window display-membership rule is honoured.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  SAFE_FALLBACK, marketLabel, findingSummary, reasonLabel,
  selectionMethodLabel, consensusCoverageLabel, oneSidedLabel, movementLabel,
  displayStatusLabel, outcomeLabel, windowSpan,
} from '../src/lib/research/terminology.js';
import { EVIDENCE_REASON_CODES } from '../../../src/shared/enums.js';

// -------------------- markets --------------------

test('marketLabel maps the four consumer markets and fails safe on the unknown', () => {
  assert.equal(marketLabel('player_points'), 'Points');
  assert.equal(marketLabel('player_rebounds'), 'Rebounds');
  assert.equal(marketLabel('player_assists'), 'Assists');
  assert.equal(marketLabel('player_threes'), '3-Pointers');
  assert.equal(marketLabel('player_blocks_and_steals'), SAFE_FALLBACK);
  assert.equal(marketLabel(''), SAFE_FALLBACK);
  // Raw enum token never leaks through.
  assert.ok(!marketLabel('player_points').includes('player_'));
});

// -------------------- finding summary (R2) --------------------

test('findingSummary is a quiet factual direction, never probabilistic, unknown fails safe', () => {
  assert.equal(findingSummary('strong_over_evidence'), 'Evidence leans over');
  assert.equal(findingSummary('moderate_over_evidence'), 'Evidence leans over');
  assert.equal(findingSummary('strong_under_evidence'), 'Evidence leans under');
  assert.equal(findingSummary('moderate_under_evidence'), 'Evidence leans under');
  assert.equal(findingSummary('mixed_evidence'), 'Evidence is mixed');
  assert.equal(findingSummary('insufficient_evidence'), 'Insufficient evidence');
  assert.equal(findingSummary('unavailable'), 'Evidence unavailable');
  assert.equal(findingSummary('some_future_class'), SAFE_FALLBACK);
  // No probabilistic / pick / hit-rate framing in any produced string.
  for (const c of ['strong_over_evidence', 'moderate_under_evidence', 'mixed_evidence', 'insufficient_evidence', 'unavailable', 'zzz']) {
    assert.ok(!/probabilit|percent|%|hit rate|\bpick\b|confidence|guarantee/i.test(findingSummary(c)), `finding "${c}" carries forbidden framing`);
  }
});

// -------------------- reasons (R8): EVERY emitted code mapped, deterministic --------------------

test('reasonLabel maps EVERY currently-emitted reason code to plain language (deterministic)', () => {
  for (const code of EVIDENCE_REASON_CODES) {
    const a = reasonLabel(code);
    const b = reasonLabel(code);
    assert.equal(a, b, `reasonLabel(${code}) not deterministic`);
    assert.notEqual(a, SAFE_FALLBACK, `reason code ${code} is not mapped (fell through to SAFE_FALLBACK)`);
    // The plain-language text never echoes the raw code and reads as a sentence.
    assert.ok(!a.includes(code), `plain reason for ${code} echoes the raw code`);
    assert.ok(!/_/.test(a), `plain reason for ${code} contains an underscore (raw-token leak)`);
    assert.ok(a.length > 0);
  }
});

test('an UNKNOWN reason code fails safe — the raw code never leaks', () => {
  assert.equal(reasonLabel('totally_made_up_reason'), SAFE_FALLBACK);
  assert.equal(reasonLabel(''), SAFE_FALLBACK);
  assert.ok(!reasonLabel('totally_made_up_reason').includes('totally_made_up_reason'));
});

// -------------------- market-context enums (R7) --------------------

test('market-context enum labels are plain language and fail safe on unknowns', () => {
  assert.equal(selectionMethodLabel('single_book'), 'from a single book');
  assert.equal(selectionMethodLabel('unique_modal'), 'the most common line');
  assert.equal(selectionMethodLabel('mystery'), SAFE_FALLBACK);
  assert.equal(consensusCoverageLabel('complete'), 'across the full book set');
  assert.equal(consensusCoverageLabel('mystery'), SAFE_FALLBACK);
  // no raw enum tokens leak
  for (const raw of ['unique_modal', 'complete', 'no_line', 'no_eligible_source']) {
    assert.ok(!selectionMethodLabel(raw).includes('_') || selectionMethodLabel(raw) === SAFE_FALLBACK);
  }
  // one-sided: both null and 'neither' read as "both sides offered"; unknown fails safe
  assert.equal(oneSidedLabel(null), 'both sides offered');
  assert.equal(oneSidedLabel('neither'), 'both sides offered');
  assert.equal(oneSidedLabel('over_only'), 'only the over side was offered');
  assert.equal(oneSidedLabel('weird'), SAFE_FALLBACK);
});

test('movementLabel renders persisted net movement as plain direction, never a raw number key', () => {
  assert.equal(movementLabel(null), 'not observed');
  assert.equal(movementLabel(0), 'none observed');
  assert.equal(movementLabel(1.5), 'up 1.5');
  assert.equal(movementLabel(-2), 'down 2');
});

// -------------------- per-game display (R5/R6) --------------------

test('displayStatusLabel and outcomeLabel translate status/outcome enums, unknown fails safe', () => {
  assert.equal(displayStatusLabel('eligible'), 'Counted');
  assert.equal(displayStatusLabel('did_not_play'), 'Did not play');
  assert.equal(displayStatusLabel('ineligible'), 'Ineligible');
  assert.equal(displayStatusLabel('quarantined'), SAFE_FALLBACK);
  assert.equal(outcomeLabel('above'), 'Above line');
  assert.equal(outcomeLabel('below'), 'Below line');
  assert.equal(outcomeLabel('equal'), 'On line');
  assert.equal(outcomeLabel(null), '—');
  assert.equal(outcomeLabel('sideways'), SAFE_FALLBACK);
});

// -------------------- window span (R3/R4) display membership --------------------

test('windowSpan returns the Nth-most-recent COUNTED entry through the newest, INCLUSIVE of interleaved ineligibles', () => {
  // oldest -> newest; ghost = not counted (DNP/ineligible)
  const s = [
    { counted: true, id: 'g1' },   // 0 oldest
    { counted: false, id: 'x1' },  // 1 ghost
    { counted: true, id: 'g2' },   // 2
    { counted: true, id: 'g3' },   // 3
    { counted: false, id: 'x2' },  // 4 ghost
    { counted: true, id: 'g4' },   // 5 newest counted
  ];
  // eligible_n = 2 -> from the 2nd-most-recent counted (g3 at idx 3) through newest,
  // INCLUDING the interleaved ghost x2. Two counted, one ghost => length 3.
  const two = windowSpan(s, 2);
  assert.deepEqual(two.map((e) => e.id), ['g3', 'x2', 'g4']);
  assert.equal(two.filter((e) => e.counted).length, 2);
  // eligible_n = 3 spans g2..g4 and swallows x2 (one ghost inside the span).
  const three = windowSpan(s, 3);
  assert.deepEqual(three.map((e) => e.id), ['g2', 'g3', 'x2', 'g4']);
  assert.equal(three.length, 4, 'L10-style: counted target may be exceeded by ghosts inside the span');
  // eligible_n larger than the counted total returns the whole series (from the oldest counted).
  const all = windowSpan(s, 99);
  assert.deepEqual(all.map((e) => e.id), ['g1', 'x1', 'g2', 'g3', 'x2', 'g4']);
  // zero / negative windows are empty (no computation, no throw).
  assert.deepEqual(windowSpan(s, 0), []);
  assert.deepEqual(windowSpan(s, -1), []);
});

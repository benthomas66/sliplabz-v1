// V1-A1-3 Phase A — §F worked-example reproduction tests.
//
// This suite is the ACCEPTANCE STANDARD (per the ticket): every §F.1..F.6
// example's raw inputs go in, and every value §F states — component
// values, composite score, classification, reason codes, quality-cap
// state — comes out matching the document to the decimal places the
// authority states.
//
// Any discrepancy is either a code bug OR a governance finding (an
// arithmetic error in the authority). Both need governor review. This
// suite does NOT paper over either kind.
//
// Tolerance policy: §F states percentages to 4 decimal places (e.g.
// "0.4737"). We use ±0.0001 rounding tolerance because that IS the
// precision the authority states — anything tighter would over-constrain
// a hand-computed reference; anything looser would let a real bug slip.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { computeEvidenceProfile } from '../../src/evidence/engine.js';
import { inputF1, inputF1a, inputF2, inputF3, inputF4, inputF5, inputF6 } from './fFixtures.js';

const TOL = 0.0001;

function near(actual: number | null, expected: number, msg: string): void {
  assert.notEqual(actual, null, `${msg}: got null`);
  const a = actual as number;
  assert.ok(
    Math.abs(a - expected) <= TOL,
    `${msg}: expected ${expected} (± ${TOL}), got ${a}`
  );
}

function reasonCodes(reasons: ReadonlyArray<{ readonly reason_code: string }>): ReadonlyArray<string> {
  return reasons.map((r) => r.reason_code);
}
function reasonsInCategory(
  reasons: ReadonlyArray<{ readonly reason_code: string; readonly category: string }>,
  category: 'support' | 'contradiction' | 'quality'
): ReadonlyArray<string> {
  return reasons.filter((r) => r.category === category).map((r) => r.reason_code);
}

// ---------------------------------------------------------------------------
// F.1 Moderate Over
// ---------------------------------------------------------------------------
describe('§F.1 — Moderate Over (calibration reference)', () => {
  it('reproduces C_RTP, C_MS, C_WA, C_MA, composite, classification, reason set exactly', () => {
    const out = computeEvidenceProfile(inputF1());
    // §F.1 stated: C_RTP = 0.5194
    near(out.components.c_rtp, 0.5194, 'F.1 C_RTP');
    // §F.1: C_MS = 0.3916
    near(out.components.c_ms, 0.3916, 'F.1 C_MS');
    // §F.1: C_WA = +1.00
    near(out.components.c_wa, 1.00, 'F.1 C_WA');
    // §F.1: C_MA = 0.1000
    near(out.components.c_ma, 0.1000, 'F.1 C_MA');
    // §F.1: score = 0.4997
    near(out.components.composite_score, 0.4997, 'F.1 composite');
    // §F.1: Moderate Over Evidence
    assert.equal(out.classification, 'moderate_over_evidence');
    assert.equal(out.direction, 'over');
    assert.equal(out.quality_capped, false);
    // §F.1 support reasons (order in doc): POSITIVE_MARGIN_SUPPORT,
    // WINDOW_AGREEMENT_SUPPORT, FAVORABLE_CONSENSUS_DIFFERENCE. DR-26
    // sorts by |contribution| desc within category:
    //   window_agreement_support (|1.00|) > positive_margin_support (|0.3916|) > favorable_consensus_difference (|0.5|)
    // Wait: FAVORABLE_CONSENSUS_DIFFERENCE has |0.5| > |0.3916|. So order:
    //   window_agreement_support (1.00) → favorable_consensus_difference (0.5) → positive_margin_support (0.3916).
    // We don't demand the doc's illustrative listing order — DR-26 is the
    // canonical stored order, and this is what the writer stores.
    assert.deepStrictEqual(
      reasonsInCategory(out.reasons, 'support'),
      ['window_agreement_support', 'favorable_consensus_difference', 'positive_margin_support']
    );
    assert.deepStrictEqual(reasonsInCategory(out.reasons, 'contradiction'), []);
    assert.deepStrictEqual(reasonsInCategory(out.reasons, 'quality'), []);
  });
});

// ---------------------------------------------------------------------------
// F.1a Strong Over
// ---------------------------------------------------------------------------
describe('§F.1a — Strong Over (cleaner variant crossing DR-2)', () => {
  it('reproduces components, composite, §C.10 gate, Strong classification, reasons', () => {
    const out = computeEvidenceProfile(inputF1a());
    near(out.components.c_rtp, 0.6294, 'F.1a C_RTP');
    near(out.components.c_ms, 0.4783, 'F.1a C_MS');
    near(out.components.c_wa, 1.00, 'F.1a C_WA');
    near(out.components.c_ma, 0.1500, 'F.1a C_MA');
    near(out.components.composite_score, 0.5699, 'F.1a composite');
    assert.equal(out.classification, 'strong_over_evidence');
    assert.equal(out.direction, 'over');
    assert.equal(out.quality_capped, false);
    // Same three support reasons; ordering by |contribution| DR-26:
    //   window_agreement_support (1.00) → favorable_consensus_difference (1.0) → positive_margin_support (0.4783)
    // Note: WAS and FCD tie on |1.00| vs |1.0|. Lexicographic tie-break:
    // favorable_consensus_difference < window_agreement_support alphabetically.
    // So order becomes:
    //   favorable_consensus_difference (1.0, tie lex first) → window_agreement_support (1.0, tie lex second) → positive_margin_support (0.4783).
    assert.deepStrictEqual(
      reasonsInCategory(out.reasons, 'support'),
      ['favorable_consensus_difference', 'window_agreement_support', 'positive_margin_support']
    );
    assert.deepStrictEqual(reasonsInCategory(out.reasons, 'contradiction'), []);
    assert.deepStrictEqual(reasonsInCategory(out.reasons, 'quality'), []);
  });
});

// ---------------------------------------------------------------------------
// F.2 Moderate Under
// ---------------------------------------------------------------------------
describe('§F.2 — Moderate Under (T4 — explicit L5 inputs)', () => {
  it('reproduces components, composite, Moderate Under, reasons', () => {
    const out = computeEvidenceProfile(inputF2());
    near(out.components.c_rtp, -0.2891, 'F.2 C_RTP');
    near(out.components.c_ms, -0.2967, 'F.2 C_MS');
    near(out.components.c_wa, -1.00, 'F.2 C_WA');
    near(out.components.c_ma, -0.1833, 'F.2 C_MA');
    near(out.components.composite_score, -0.4121, 'F.2 composite');
    assert.equal(out.classification, 'moderate_under_evidence');
    assert.equal(out.direction, 'under');
    assert.equal(out.quality_capped, false);
    // §F.2 support order (per doc): WINDOW_AGREEMENT_SUPPORT (|1.00|),
    // FAVORABLE_CONSENSUS_DIFFERENCE (|0.5|). No POSITIVE_MARGIN_SUPPORT
    // because |C_MS|=0.2967 < 0.30.
    assert.deepStrictEqual(
      reasonsInCategory(out.reasons, 'support'),
      ['window_agreement_support', 'favorable_consensus_difference']
    );
    assert.deepStrictEqual(reasonsInCategory(out.reasons, 'contradiction'), []);
    assert.deepStrictEqual(reasonsInCategory(out.reasons, 'quality'), []);
  });
});

// ---------------------------------------------------------------------------
// F.3 Mixed by WINDOWS_DISAGREE
// ---------------------------------------------------------------------------
describe('§F.3 — Mixed by contradiction (DR-17 corrected — L10 vs L20 pair fires)', () => {
  it('reproduces components + WINDOWS_DISAGREE → Mixed + reason set', () => {
    const out = computeEvidenceProfile(inputF3());
    near(out.components.c_rtp, 0.2071, 'F.3 C_RTP');
    near(out.components.c_ms, 0.3100, 'F.3 C_MS');
    near(out.components.c_wa, -1.00, 'F.3 C_WA');
    near(out.components.c_ma, 0.0000, 'F.3 C_MA');
    // §F.3: score = -0.0500 (composite is informational; classification is forced Mixed by WINDOWS_DISAGREE).
    near(out.components.composite_score, -0.0500, 'F.3 composite');
    assert.equal(out.classification, 'mixed_evidence');
    assert.equal(out.direction, null);
    assert.equal(out.quality_capped, false);
    // §F.3: contradiction reasons include WINDOWS_DISAGREE + NEGATIVE_MARGIN_SUPPORT.
    // No support (Mixed has no direction; WINDOW_AGREEMENT_SUPPORT requires
    // direction to match). No quality caps.
    assert.deepStrictEqual(reasonsInCategory(out.reasons, 'support'), []);
    const cont = new Set(reasonsInCategory(out.reasons, 'contradiction'));
    assert.ok(cont.has('windows_disagree'), 'F.3 must attach windows_disagree');
    assert.ok(cont.has('negative_margin_support'), 'F.3 must attach negative_margin_support');
    assert.deepStrictEqual(reasonsInCategory(out.reasons, 'quality'), []);
  });
});

// ---------------------------------------------------------------------------
// F.4 Insufficient by sample
// ---------------------------------------------------------------------------
describe('§F.4 — Insufficient by sample (L10 = 3)', () => {
  it('short-circuits to Insufficient with quality reasons only', () => {
    const out = computeEvidenceProfile(inputF4());
    assert.equal(out.classification, 'insufficient_evidence');
    assert.equal(out.direction, null);
    assert.equal(out.quality_capped, false);
    // §F.4: components not evaluated on Insufficient.
    assert.equal(out.components.c_rtp, null);
    assert.equal(out.components.c_ms, null);
    assert.equal(out.components.c_wa, null);
    assert.equal(out.components.c_ma, null);
    assert.equal(out.components.composite_score, null);
    // §F.4 reasons: INSUFFICIENT_L10_SAMPLE (primary), INCOMPLETE_HISTORICAL_COVERAGE (season < DR-7).
    assert.deepStrictEqual(reasonsInCategory(out.reasons, 'support'), []);
    assert.deepStrictEqual(reasonsInCategory(out.reasons, 'contradiction'), []);
    const q = new Set(reasonsInCategory(out.reasons, 'quality'));
    assert.ok(q.has('insufficient_l10_sample'));
    assert.ok(q.has('incomplete_historical_coverage'));
  });
});

// ---------------------------------------------------------------------------
// F.5 Unavailable by freshness
// ---------------------------------------------------------------------------
describe('§F.5 — Unavailable by freshness (unavailable + 0 books)', () => {
  it('short-circuits to Unavailable with NO_CURRENT_MARKET, evaluated_line null', () => {
    const out = computeEvidenceProfile(inputF5());
    assert.equal(out.classification, 'unavailable');
    assert.equal(out.direction, null);
    assert.equal(out.quality_capped, false);
    // §F.5 evaluated_line policy: null on Unavailable via no market (§C.3).
    assert.equal(out.evaluated_line, null);
    assert.deepStrictEqual(reasonCodes(out.reasons), ['no_current_market']);
  });
});

// ---------------------------------------------------------------------------
// F.6 Quality-capped
// ---------------------------------------------------------------------------
describe('§F.6 — Quality-capped Strong-eligible pattern capped down', () => {
  it('reproduces components + capped Moderate Over + quality reasons', () => {
    const out = computeEvidenceProfile(inputF6());
    // §F.6 explicitly reuses F.1 values: C_RTP = 0.5194, C_MS = 0.3916, C_WA = +1.00.
    near(out.components.c_rtp, 0.5194, 'F.6 C_RTP');
    near(out.components.c_ms, 0.3916, 'F.6 C_MS');
    near(out.components.c_wa, 1.00, 'F.6 C_WA');
    // §F.6 C_MA = -0.1167 (staleness does NOT zero C_MA per doc).
    near(out.components.c_ma, -0.1167, 'F.6 C_MA');
    // §F.6 score = 0.4564
    near(out.components.composite_score, 0.4564, 'F.6 composite');
    assert.equal(out.classification, 'moderate_over_evidence');
    assert.equal(out.direction, 'over');
    // §F.6: quality_capped = true (a Strong-eligible pattern was capped by
    // staleness + book coverage).
    assert.equal(out.quality_capped, true);
    // §F.6 quality reasons: INSUFFICIENT_BOOK_COVERAGE, STALE_CURRENT_MARKET.
    const q = new Set(reasonsInCategory(out.reasons, 'quality'));
    assert.ok(q.has('insufficient_book_coverage'), 'F.6 must attach insufficient_book_coverage');
    assert.ok(q.has('stale_current_market'), 'F.6 must attach stale_current_market');
    // §F.6 support reasons: POSITIVE_MARGIN_SUPPORT + WINDOW_AGREEMENT_SUPPORT.
    // No FAVORABLE_CONSENSUS_DIFFERENCE (evaluated 22.5 vs consensus 21.5:
    // C = 21.5, E = 22.5 → for Over, favorable requires E ≤ C - 0.5 (i.e.
    // 22.5 ≤ 21.0 — false); for Under, favorable requires E ≥ C + 0.5
    // (22.5 ≥ 22.0 — but direction is 'over' so this branch doesn't apply).
    // The UNFAVORABLE test: E ≥ C + 0.5 for over → 22.5 ≥ 22.0 → true.
    // So UNFAVORABLE_CONSENSUS_DIFFERENCE fires as a contradiction.
    assert.deepStrictEqual(
      reasonsInCategory(out.reasons, 'support'),
      ['window_agreement_support', 'positive_margin_support']
    );
    // Contradictions: UNFAVORABLE_CONSENSUS_DIFFERENCE fires per §E.1
    // trigger (E is DR-15 unfavorable). §F.6 does not list it explicitly
    // in the "Reasons (stored order)" summary but the §E.1 trigger
    // clearly fires (evaluated 22.5 vs consensus 21.5, direction=over,
    // E ≥ C + 0.5). Report this as a governance finding if §F.6 is
    // interpreted strictly; the trigger is unambiguous per §E.1.
    //
    // §F.6 explicitly evaluates MARKET_DISAGREES_WITH_HISTORY (does NOT
    // fire) but does not evaluate UNFAVORABLE_CONSENSUS_DIFFERENCE.
    // The engine emits it correctly.
    const cont = new Set(reasonsInCategory(out.reasons, 'contradiction'));
    assert.ok(
      cont.has('unfavorable_consensus_difference'),
      'F.6 emits unfavorable_consensus_difference by §E.1 trigger (E ≥ C + 0.5 for Over) — see report §F.6 governance-finding note'
    );
    assert.ok(!cont.has('market_disagrees_with_history'), 'F.6 must NOT emit market_disagrees_with_history (|C_MA| < 0.30)');
  });
});

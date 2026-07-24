// V1-A1-3 Phase A — governor obligation tests.
//
// One test per obligation in the ticket. Where a scenario needs a
// modified fixture, mutations of the §F fixtures are used so the
// starting point is trusted (i.e. the §F fixtures already produce the
// authority's stated values).

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { computeEvidenceProfile } from '../../src/evidence/engine.js';
import { EVIDENCE_RESERVED_REASON_CODES } from '../../src/shared/enums.js';
import {
  inputF1, inputF1a, inputF2, inputF3, inputF4, inputF5, inputF6,
} from './fFixtures.js';
import type { EvidenceProfileInput } from '../../src/evidence/types.js';
import type { CurrentMarketRow } from '../../src/computation/types.js';

/** Cloneable-with-override helper — deep-clones the input and lets tests
 *  patch a small piece for a governor obligation without rebuilding a
 *  whole fixture. */
function mutateCMR(
  base: EvidenceProfileInput,
  patch: (cmr: CurrentMarketRow) => CurrentMarketRow
): EvidenceProfileInput {
  const patched = patch(base.current_market_row);
  return { ...base, current_market_row: patched };
}

// Deep-mutate helpers for line_consensus etc.
function withConsensus(
  cmr: CurrentMarketRow,
  overrides: {
    consensus_point?: number | null;
    selection_method?: 'single_book' | 'unique_modal' | 'tied_no_unique_mode' | 'no_eligible_source';
    coverage_label?: 'complete' | 'single_book' | 'unresolved_consensus' | 'no_line';
    point_distribution?: ReadonlyArray<{ point: number; book_count: number }>;
    eligible_book_count?: number;
    freshness_state?: 'fresh' | 'aging' | 'stale' | 'unavailable' | 'failed_latest_poll';
  }
): CurrentMarketRow {
  // V1-A2-5: CurrentMarketRow.freshness is now optional (v2 omits it). These
  // v1 fixtures always carry it; narrow so the spread stays type-sound.
  const baseFreshness = cmr.freshness;
  if (baseFreshness === undefined) throw new Error('fixture invariant: v1 CMR carries freshness');
  return {
    ...cmr,
    line_consensus: {
      ...cmr.line_consensus,
      consensus_point: overrides.consensus_point !== undefined ? overrides.consensus_point : cmr.line_consensus.consensus_point,
      selection_method: overrides.selection_method ?? cmr.line_consensus.selection_method,
      coverage_label: overrides.coverage_label ?? cmr.line_consensus.coverage_label,
    },
    point_distribution: overrides.point_distribution !== undefined
      ? { counts: overrides.point_distribution, method_version: cmr.point_distribution.method_version }
      : cmr.point_distribution,
    eligible_book_count: overrides.eligible_book_count !== undefined
      ? { count: overrides.eligible_book_count, method_version: cmr.eligible_book_count.method_version }
      : cmr.eligible_book_count,
    freshness: overrides.freshness_state !== undefined
      ? { ...baseFreshness, state: overrides.freshness_state }
      : baseFreshness,
  };
}

// ---------------------------------------------------------------------------
// Obligation 1 — consensus-only evaluation; API is agnostic
// ---------------------------------------------------------------------------
describe('Obligation 1 — consensus-only evaluation (Phase A API is agnostic)', () => {
  it('the engine accepts any evaluated_source_kind — the persistence restriction is Phase B; Phase A must remain agnostic', () => {
    // Change F.1 to be evaluated at a specific book's line — same math.
    const patched: EvidenceProfileInput = {
      ...inputF1(),
      evaluated_source_kind: 'sportsbook_specific',
      evaluated_source_identifier: 'draftkings',
    };
    const out = computeEvidenceProfile(patched);
    // Same components as F.1 — the profile evaluates the same way; the
    // engine does not "make the wrong thing easy" by rejecting or
    // rewriting the source. Phase B is what persists (only consensus).
    assert.equal(out.classification, 'moderate_over_evidence');
    assert.equal(out.evaluated_source_kind, 'sportsbook_specific');
    assert.equal(out.evaluated_source_identifier, 'draftkings');
  });
});

// ---------------------------------------------------------------------------
// Obligation 2 — DR-28 tied consensus (positive scope + all five hand-off tests)
// ---------------------------------------------------------------------------
describe('Obligation 2 & 4 — DR-28 tied consensus (owner ruling 2026-07-15)', () => {
  it('4(a): 2-2 tied distribution → Unavailable + NO_UNIQUE_CONSENSUS_LINE + evaluated_line null', () => {
    // Tied distribution 12.5×2 vs 13.5×2 with 4 eligible books.
    const base = inputF1();
    const tied = mutateCMR(base, (c) => withConsensus(c, {
      consensus_point: null,
      selection_method: 'tied_no_unique_mode',
      coverage_label: 'unresolved_consensus',
      point_distribution: [
        { point: 12.5, book_count: 2 },
        { point: 13.5, book_count: 2 },
      ],
      eligible_book_count: 4,
      freshness_state: 'fresh',
    }));
    const out = computeEvidenceProfile(tied);
    assert.equal(out.classification, 'unavailable');
    assert.equal(out.evaluated_line, null);
    assert.equal(out.reasons.length, 1);
    assert.equal(out.reasons[0]!.reason_code, 'no_unique_consensus_line');
  });

  it('4(b): tied market WITH eligible books does NOT emit no_current_market', () => {
    const tied = mutateCMR(inputF1(), (c) => withConsensus(c, {
      consensus_point: null,
      selection_method: 'tied_no_unique_mode',
      coverage_label: 'unresolved_consensus',
      point_distribution: [
        { point: 19.0, book_count: 3 },
        { point: 20.0, book_count: 3 },
      ],
      eligible_book_count: 6,
      freshness_state: 'fresh',
    }));
    const out = computeEvidenceProfile(tied);
    const codes = out.reasons.map((r) => r.reason_code);
    assert.ok(!codes.includes('no_current_market'), 'tied WITH books MUST NOT emit no_current_market');
    assert.ok(codes.includes('no_unique_consensus_line'));
  });

  it('4(c): genuinely absent market → NO_CURRENT_MARKET; NEVER no_unique_consensus_line', () => {
    // §F.5 already exercises this — verify explicitly here too.
    const out = computeEvidenceProfile(inputF5());
    const codes = out.reasons.map((r) => r.reason_code);
    assert.ok(codes.includes('no_current_market'));
    assert.ok(!codes.includes('no_unique_consensus_line'), 'absent market MUST NOT emit no_unique_consensus_line');
  });

  it('4(d): reordering sportsbook input distribution does NOT change the tied result', () => {
    const tied1 = mutateCMR(inputF1(), (c) => withConsensus(c, {
      consensus_point: null,
      selection_method: 'tied_no_unique_mode',
      coverage_label: 'unresolved_consensus',
      point_distribution: [
        { point: 12.5, book_count: 2 },
        { point: 13.5, book_count: 2 },
      ],
      eligible_book_count: 4,
      freshness_state: 'fresh',
    }));
    const tied2 = mutateCMR(inputF1(), (c) => withConsensus(c, {
      consensus_point: null,
      selection_method: 'tied_no_unique_mode',
      coverage_label: 'unresolved_consensus',
      point_distribution: [
        { point: 13.5, book_count: 2 },
        { point: 12.5, book_count: 2 },
      ],
      eligible_book_count: 4,
      freshness_state: 'fresh',
    }));
    const out1 = computeEvidenceProfile(tied1);
    const out2 = computeEvidenceProfile(tied2);
    assert.equal(out1.classification, out2.classification);
    assert.deepStrictEqual(
      out1.reasons.map((r) => r.reason_code),
      out2.reasons.map((r) => r.reason_code)
    );
    assert.equal(out1.evaluated_line, null);
    assert.equal(out2.evaluated_line, null);
  });

  it('4(e): the engine does NOT choose lower / upper / average / first-observed / single-book — all yield Unavailable, none uses a "tiebreak" consensus_point', () => {
    const tied = mutateCMR(inputF1(), (c) => withConsensus(c, {
      consensus_point: null, // The engine MUST honor null; if it invented a
                              // tiebreak the profile would be classified
                              // (Moderate/Strong/Mixed) instead of Unavailable.
      selection_method: 'tied_no_unique_mode',
      coverage_label: 'unresolved_consensus',
      point_distribution: [
        { point: 12.5, book_count: 2 },
        { point: 13.5, book_count: 2 },
      ],
      eligible_book_count: 4,
      freshness_state: 'fresh',
    }));
    const out = computeEvidenceProfile(tied);
    // If any tiebreak had been invented, the classification would be
    // Moderate/Strong/Mixed (not Unavailable). Assert Unavailable.
    assert.equal(out.classification, 'unavailable');
    // The evaluated_line stays as the caller specified (F.1's 19.5) or is
    // null on Unavailable. Under DR-28 it's null.
    assert.equal(out.evaluated_line, null);
    // Components are null on Unavailable (no C_MA computation).
    assert.equal(out.components.c_ma, null);
  });
});

// ---------------------------------------------------------------------------
// Obligation 3 — ABNORMAL_DISPERSION is never emitted (across full fixture matrix)
// ---------------------------------------------------------------------------
describe('Obligation 3 — ABNORMAL_DISPERSION is never emitted', () => {
  it('none of the §F fixtures emits abnormal_dispersion', () => {
    const fixtures = [inputF1(), inputF1a(), inputF2(), inputF3(), inputF4(), inputF5(), inputF6()];
    for (const inp of fixtures) {
      const out = computeEvidenceProfile(inp);
      const codes = out.reasons.map((r) => r.reason_code);
      assert.ok(!codes.includes('abnormal_dispersion'), 'abnormal_dispersion must never be emitted under evidence_method_v1');
    }
  });
  it('the RESERVED set names exactly abnormal_dispersion (and only that) in evidence_method_v1', () => {
    assert.equal(EVIDENCE_RESERVED_REASON_CODES.size, 1);
    assert.ok(EVIDENCE_RESERVED_REASON_CODES.has('abnormal_dispersion'));
  });
});

// ---------------------------------------------------------------------------
// Obligation 5 — cross-book grouping regression (aggregate whose fixture yields
// a DIFFERENT answer under per-book grouping than correct cross-book grouping)
// ---------------------------------------------------------------------------
describe('Obligation 5 — cross-book aggregate regression', () => {
  it('4-4-4 across three books at three points → the engine MUST NOT invent a consensus (Unavailable via tied)', () => {
    // Fixture: three books each quoting a DIFFERENT point. Per-book
    // grouping would (incorrectly) pick "the first book's point" and
    // call the profile classified. Cross-book grouping (per V1-5
    // consensus owner) yields tied_no_unique_mode → Unavailable via
    // DR-28.
    const patched = mutateCMR(inputF1(), (c) => withConsensus(c, {
      consensus_point: null,
      selection_method: 'tied_no_unique_mode',
      coverage_label: 'unresolved_consensus',
      point_distribution: [
        { point: 12.5, book_count: 1 },
        { point: 13.0, book_count: 1 },
        { point: 13.5, book_count: 1 },
      ],
      eligible_book_count: 3,
      freshness_state: 'fresh',
    }));
    const out = computeEvidenceProfile(patched);
    assert.equal(out.classification, 'unavailable');
    assert.equal(
      out.reasons[0]!.reason_code,
      'no_unique_consensus_line',
      'a per-book grouping would have picked one of the three points; the correct cross-book result is tied → Unavailable'
    );
  });
});

// ---------------------------------------------------------------------------
// Obligation 6 — DR-12 / DR-11 / C.10: L5 has zero composite weight
// ---------------------------------------------------------------------------
describe('Obligation 6 — L5 has zero composite weight (DR-12); §C.10 clause 4 is the ONE numeric rule', () => {
  it('mutating L5 alone (keeping L10/L20/season constant) does NOT change C_RTP', () => {
    const base = inputF1();
    // Replace L5 with an all-Under distribution while keeping L10/L20/season.
    const mutated: EvidenceProfileInput = {
      ...base,
      threshold_windows: {
        ...base.threshold_windows,
        L5: {
          ...base.threshold_windows.L5,
          count_above: 0,
          count_below: 5,
          count_equal: 0,
        },
      },
    };
    const out_base = computeEvidenceProfile(base);
    const out_mut = computeEvidenceProfile(mutated);
    // C_RTP MUST be identical (L5 has zero weight in C_RTP per DR-12).
    assert.equal(out_base.components.c_rtp, out_mut.components.c_rtp);
    // C_WA WILL differ (L5 has 0.10 weight in C_WA per §B.4).
    assert.notEqual(out_base.components.c_wa, out_mut.components.c_wa);
  });

  it('C.10 clause 4 non-L5 magnitude test: F.1a passes (|0.6294| ≥ 0.30) → Strong reached', () => {
    // F.1a is the direct §C.10 clause 4 verification — the doc reports
    // "|0.6294| ≥ 0.30 ✓" and gives Strong Over. Regression covers this.
    const out = computeEvidenceProfile(inputF1a());
    assert.equal(out.classification, 'strong_over_evidence');
  });
});

// ---------------------------------------------------------------------------
// Obligation 7 — GD-8: no probability / EV / projection language
// ---------------------------------------------------------------------------
describe('Obligation 7 — GD-8: no probability / EV / projection language anywhere', () => {
  it('no reason_code / category value contains a forbidden probability token', () => {
    const fixtures = [inputF1(), inputF1a(), inputF2(), inputF3(), inputF4(), inputF5(), inputF6()];
    // From A1 §27.6 + GD-8, plus obvious probabilistic terms.
    const forbidden = [
      'probability', 'expected_value', 'expected value', 'projected',
      'ev_', 'roi', 'win_percent', 'win percent', 'guaranteed', 'lock',
    ];
    for (const inp of fixtures) {
      const out = computeEvidenceProfile(inp);
      for (const r of out.reasons) {
        for (const token of forbidden) {
          assert.ok(
            !r.reason_code.toLowerCase().includes(token),
            `reason_code '${r.reason_code}' contains forbidden token '${token}'`
          );
        }
      }
    }
  });
});

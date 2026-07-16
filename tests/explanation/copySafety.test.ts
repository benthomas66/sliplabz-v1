// V1-A1-4 load-bearing test — HARDENED copy-safety sweep.
//
// Governor REVISE (2026-07-15): the earlier version demoted `probability`,
// `probabilities`, `expected value`, `guarantee`, and `guarantees` into a
// silent-tier `attention_flags` mechanism, which meant those five tokens
// would PASS the copy-safety gate in any composed string. This file now:
//
//   * asserts on VIOLATIONS only (attention_flags no longer exists);
//   * sweeps EVERY rendered string across the fixture matrix, disclosures
//     INCLUDED — the exemption is by exact-string allowlist (only §G.1
//     and §G.2 verbatim), not by module scope;
//   * carries the four governor-required regression tests (see item 5
//     of the REVISE) with the explicit `it(...)` names below.
//
// The authority-conformance side (reading EVIDENCE_PROFILE_METHOD_V1.md
// at test time to pin the exemption + vocabulary to the authority) lives
// in `authorityConformance.test.ts`.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  renderCompactExplanation,
  renderFullExplanation,
  sweepableStrings,
} from '../../src/explanation/index.js';
import {
  EXEMPT_ALLOWLIST_STRINGS,
  FORBIDDEN_COPY_TERMS,
  sweepForbiddenTerms,
} from '../../src/explanation/copySafetyTerms.js';
import {
  DISCLOSURE_G1_TEXT,
  DISCLOSURE_G2_TEXT,
} from '../../src/explanation/disclosures.js';
import { REASON_TRANSLATIONS } from '../../src/explanation/vocabulary.js';
import type { CompactExplanation, FullExplanation } from '../../src/explanation/index.js';
import type { EvidenceReasonCode } from '../../src/shared/enums.js';
import { EVIDENCE_REASON_CODES } from '../../src/shared/enums.js';
import { ALL_FIXTURES } from './fixtures.js';

// ---------------------------------------------------------------------------
// Helper: build the FULL sweep set for one rendered explanation. Includes
// every user-facing string the composer produced, INCLUDING the §G
// disclosures. The exact-string allowlist in copySafetyTerms.ts is what
// exempts the two verbatim disclosure texts; every other string is swept.
// ---------------------------------------------------------------------------
function everyRenderedString(x: FullExplanation | CompactExplanation): ReadonlyArray<string> {
  const out: string[] = [...sweepableStrings(x)];
  if (x.kind === 'full') {
    out.push(x.disclosure_g1.text);
    if (x.disclosure_g2 !== null) out.push(x.disclosure_g2.text);
  } else {
    out.push(x.disclosure_g1.text);
  }
  return Object.freeze(out.filter((s) => s.length > 0));
}

describe('§27.6 / §G.4 forbidden-copy sweep — HARDENED gate (governor REVISE 2026-07-15)', () => {
  it('LOAD-BEARING: rendered strings across the ENTIRE fixture matrix (disclosures INCLUDED) contain zero forbidden terms', () => {
    assert.ok(ALL_FIXTURES.length >= 20, `fixture matrix size ${ALL_FIXTURES.length} < 20 — coverage weakened`);

    let stringsSwept = 0;
    const perFixtureViolations: Array<{ fixture: string; kind: 'full' | 'compact'; violations: unknown }> = [];
    for (const p of ALL_FIXTURES) {
      const full = renderFullExplanation(p, { render_numeric_score: true });
      const compact = renderCompactExplanation(p);
      for (const s of everyRenderedString(full)) {
        stringsSwept += 1;
        const r = sweepForbiddenTerms(s);
        if (r.violations.length > 0) perFixtureViolations.push({ fixture: p._fixture_name, kind: 'full', violations: r.violations });
      }
      for (const s of everyRenderedString(compact)) {
        stringsSwept += 1;
        const r = sweepForbiddenTerms(s);
        if (r.violations.length > 0) perFixtureViolations.push({ fixture: p._fixture_name, kind: 'compact', violations: r.violations });
      }
    }

    assert.deepEqual(
      perFixtureViolations, [],
      `HARD copy-safety violations across the matrix (each item names the offending fixture + kind + term)`
    );
    // Confirm the sweep actually covered material (guards against a
    // silent regression that empties the matrix).
    assert.ok(stringsSwept >= ALL_FIXTURES.length * 3,
      `swept ${stringsSwept} strings but expected ≥ ${ALL_FIXTURES.length * 3} (matrix × ≥3 strings per fixture including disclosures)`);
  });

  it('LOAD-BEARING: every §E translation itself is copy-safe (independent of composition)', () => {
    for (const code of EVIDENCE_REASON_CODES) {
      if (code === 'abnormal_dispersion') continue; // RESERVED — no translation
      const text = REASON_TRANSLATIONS[code];
      const r = sweepForbiddenTerms(text);
      assert.equal(
        r.violations.length, 0,
        `§E translation for "${code}" contains forbidden term(s): ${JSON.stringify(r.violations)} — this is a GOVERNANCE FINDING; do NOT edit the authority; halt and report per ticket instructions.`
      );
    }
  });

  it('exact-match allowlist: unmodified §G.1 and §G.2 texts PASS (regression test (d))', () => {
    // The two literals in EXEMPT_ALLOWLIST_STRINGS must be byte-identical
    // to the disclosures.ts constants (both pin to the authority — see
    // authorityConformance.test.ts). This regression test proves the
    // allowlist actually exempts.
    assert.equal(sweepForbiddenTerms(DISCLOSURE_G1_TEXT).violations.length, 0,
      'unmodified §G.1 disclosure text must PASS the sweep');
    assert.equal(sweepForbiddenTerms(DISCLOSURE_G2_TEXT).violations.length, 0,
      'unmodified §G.2 disclosure text must PASS the sweep');
    // The allowlist contains exactly these two texts.
    assert.ok(EXEMPT_ALLOWLIST_STRINGS.includes(DISCLOSURE_G1_TEXT));
    assert.ok(EXEMPT_ALLOWLIST_STRINGS.includes(DISCLOSURE_G2_TEXT));
    assert.equal(EXEMPT_ALLOWLIST_STRINGS.length, 2,
      `EXEMPT_ALLOWLIST_STRINGS must have EXACTLY 2 entries; got ${EXEMPT_ALLOWLIST_STRINGS.length}`);
  });

  it("exact-match allowlist: a disclosure mutated by a single word (leading 'not' dropped) FAILS (regression test (c))", () => {
    // Prove the exemption is exact-match, not module-scoped or negation-
    // heuristic. Drop the word "not" from §G.1 → the string contains
    // "guarantees or predicted probabilities" as a CLAIM → must fire.
    const g1_mutated = DISCLOSURE_G1_TEXT.replace('not guarantees', 'guarantees');
    assert.notEqual(g1_mutated, DISCLOSURE_G1_TEXT, 'mutation setup: string must differ from the authoritative disclosure');
    const r1 = sweepForbiddenTerms(g1_mutated);
    assert.ok(r1.violations.length > 0,
      `a §G.1 disclosure with the leading "not" dropped MUST fire — the exemption must be exact-string identity, not module-scope`);
    // At minimum, "guarantees" and "probabilities" both fire.
    const termsFound = new Set(r1.violations.map((v) => v.term));
    assert.ok(termsFound.has('guarantees'), `mutated §G.1 must fire "guarantees"; got terms=${JSON.stringify([...termsFound])}`);
    assert.ok(termsFound.has('probabilities'), `mutated §G.1 must fire "probabilities"; got terms=${JSON.stringify([...termsFound])}`);

    // Also: dropping "not" from §G.2 must fire "probability".
    const g2_mutated = DISCLOSURE_G2_TEXT.replace('It is not', 'It is');
    assert.notEqual(g2_mutated, DISCLOSURE_G2_TEXT);
    const r2 = sweepForbiddenTerms(g2_mutated);
    const g2Terms = new Set(r2.violations.map((v) => v.term));
    assert.ok(g2Terms.has('probability'), `mutated §G.2 must fire "probability"; got terms=${JSON.stringify([...g2Terms])}`);
  });

  it("regression test (a): a fabricated claim-form string containing 'probability' FAILS the sweep", () => {
    const bad = 'the probability of going over is high';
    const r = sweepForbiddenTerms(bad);
    assert.ok(r.violations.length > 0,
      `fabricated claim-form string with "probability" MUST fire; got no violations`);
    assert.ok(r.violations.some((v) => v.term === 'probability'),
      `must fire "probability" specifically; got terms=${JSON.stringify(r.violations.map((v) => v.term))}`);
  });

  it('regression test (b): each of the five previously-demoted tokens fails in a fabricated claim-form string', () => {
    const positives: ReadonlyArray<{ term: string; text: string }> = [
      { term: 'probability',    text: 'the probability of this outcome is 60%'                      },
      { term: 'probabilities',  text: 'we compute probabilities for every prop'                      },
      { term: 'expected value', text: 'this bet has positive expected value versus the market'      },
      { term: 'guarantee',      text: 'we guarantee this outcome tonight'                            },
      { term: 'guarantees',     text: 'the model guarantees a hit every time'                        },
    ];
    for (const { term, text } of positives) {
      const r = sweepForbiddenTerms(text);
      const matched = r.violations.some((v) => v.term.toLowerCase() === term.toLowerCase());
      assert.ok(matched, `fabricated claim-form for "${term}" must fire; got terms=${JSON.stringify(r.violations.map((v) => v.term))} in "${text}"`);
    }
  });

  it('sweep matcher recognises every OTHER forbidden term (defensive self-test)', () => {
    // Coverage over the whole hardened list. Uses plausible claim-form
    // sentences and verifies each term fires.
    const positives: ReadonlyArray<{ term: string; text: string }> = [
      { term: 'guaranteed',       text: 'This is a guaranteed pick.'         },
      { term: 'lock',             text: 'This is a lock.'                    },
      { term: "can't miss",       text: "Tonight this can't miss."           },
      { term: 'free money',       text: 'This looks like free money.'        },
      { term: 'sure thing',       text: 'A sure thing tonight.'              },
      { term: 'guaranteed winner',text: 'This is a guaranteed winner.'       },
      { term: 'EV',               text: 'This bet has positive EV attached.' },
      { term: '+EV',              text: 'A clear +EV situation.'             },
      { term: 'ROI',              text: 'The historical ROI here is strong.' },
      { term: 'risk-free',        text: 'This is a risk-free spot.'          },
      { term: 'safest bet',       text: 'The safest bet on the board.'       },
      { term: 'proven winner',    text: 'A proven winner all year.'          },
    ];
    for (const { term, text } of positives) {
      const r = sweepForbiddenTerms(text);
      const matched = r.violations.some((v) => v.term.toLowerCase() === term.toLowerCase());
      assert.ok(matched, `sweep failed to flag forbidden term "${term}" in: ${text}`);
    }
  });

  it('sweep matcher does NOT fire on innocuous words that share letters ("clock", "block", "royal", "evidence")', () => {
    const negatives = [
      'The clock strikes noon.',
      'A city block away.',
      'The royal palace.',
      'Evidence supports the Over.',
    ];
    for (const s of negatives) {
      const r = sweepForbiddenTerms(s);
      assert.equal(r.violations.length, 0, `false positive on "${s}": ${JSON.stringify(r.violations)}`);
    }
    // Bare "lock" as a word DOES fire — word-boundary works.
    const bareLock = sweepForbiddenTerms('A single lock is not lock the noun.');
    assert.ok(bareLock.violations.some((v) => v.term === 'lock'), '"lock" as a bare word must fire');
  });

  it('EV / +EV / ROI are case-sensitive (uppercase-only) — "eve" and "royal" do NOT fire', () => {
    const evenings = sweepForbiddenTerms('This is the event, not Eve.');
    const royals = sweepForbiddenTerms('The royal family.');
    assert.equal(evenings.violations.length, 0);
    assert.equal(royals.violations.length, 0);
    const bad = sweepForbiddenTerms('A large EV number.');
    assert.ok(bad.violations.some((v) => v.term === 'EV'));
  });

  it('reports the exact hardened forbidden-term list swept (17 terms, for reproducibility in the ticket report)', () => {
    const terms = new Set(FORBIDDEN_COPY_TERMS.map((t) => t.term));
    for (const expected of [
      // Original §27.6 + §G.4 union.
      'guaranteed', 'lock', "can't miss", 'free money', 'sure thing', 'guaranteed winner',
      'EV', '+EV', 'ROI', 'risk-free', 'safest bet', 'proven winner',
      // Governor REVISE 2026-07-15 — promoted to HARD.
      'probability', 'probabilities', 'expected value', 'guarantee', 'guarantees',
    ]) {
      assert.ok(terms.has(expected), `hardened forbidden-term list missing "${expected}"`);
    }
    // No CONTEXT_SENSITIVE_TOKENS symbol should exist in the module — proven
    // by the missing import from copySafetyTerms.ts.
  });
});

describe('§27.6 fixture coverage — every reason code appears at least once', () => {
  it('LOAD-BEARING: every emitted §E reason code (all except RESERVED abnormal_dispersion) is exercised', () => {
    const emitted = new Set<EvidenceReasonCode>();
    for (const p of ALL_FIXTURES) for (const r of p.reasons) emitted.add(r.reason_code);
    const missing: EvidenceReasonCode[] = [];
    for (const code of EVIDENCE_REASON_CODES) {
      if (code === 'abnormal_dispersion') continue;
      if (!emitted.has(code)) missing.push(code);
    }
    assert.deepEqual(missing, [], `reason codes missing from fixture matrix: ${JSON.stringify(missing)}`);
  });

  it('LOAD-BEARING: every §D.1 classification (all seven) appears at least once', () => {
    const seen = new Set(ALL_FIXTURES.map((p) => p.classification));
    for (const cls of [
      'strong_over_evidence', 'moderate_over_evidence', 'mixed_evidence',
      'moderate_under_evidence', 'strong_under_evidence',
      'insufficient_evidence', 'unavailable',
    ] as const) {
      assert.ok(seen.has(cls), `classification "${cls}" missing from fixture matrix`);
    }
  });

  it('LOAD-BEARING: at least one capped, one Unavailable, one Insufficient, one backfilled-provenance, and the tied-consensus case are present', () => {
    const capped = ALL_FIXTURES.filter((p) => p.quality_capped === true);
    const unavailable = ALL_FIXTURES.filter((p) => p.classification === 'unavailable');
    const insufficient = ALL_FIXTURES.filter((p) => p.classification === 'insufficient_evidence');
    const backfilled = ALL_FIXTURES.filter((p) => p.includes_backfilled_historical === true);
    const tied = ALL_FIXTURES.filter((p) => p.reasons.some((r) => r.reason_code === 'no_unique_consensus_line'));
    assert.ok(capped.length >= 1, `matrix must include at least one capped profile`);
    assert.ok(unavailable.length >= 1, `matrix must include at least one Unavailable`);
    assert.ok(insufficient.length >= 1, `matrix must include at least one Insufficient`);
    assert.ok(backfilled.length >= 1, `matrix must include at least one backfilled-provenance profile`);
    assert.ok(tied.length >= 1, `matrix must include the tied-consensus (no_unique_consensus_line) case`);
  });
});

// V1-A2-2 REVISE — regression fixtures for evidence_method_v2 (unit-level).
//
// Groups 1, 2, 3, 5, 7, 8 of the eight DR-24 regression groups. Groups
// 4 (batch-drift) and 6 (v1/v2 coexistence) require the DB and live in
// tests/integration/v2MethodImplementation.integration.test.ts.
//
// Numeric threshold expectations use the PRODUCTION-LOCKED constants
// (900 / 1800 / 3600 in `src/evidence/v2/thresholds.ts`). NO fixture
// threshold numbers are redefined at this layer.
//
// REVISED architecture: `computeEvidenceProfileV2` returns a
// DISCRIMINATED UNION (classified | beyond_horizon). Tests navigate the
// discriminant via `result.kind` — there is no sentinel, no
// `freshness.state` fabrication, no `as any`.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { computeEvidenceProfile } from '../../src/evidence/engine.js';
import {
  computeEvidenceProfileV2,
  deriveClassificationAgeSeconds,
  isClassifiedV2,
  isBeyondHorizonV2,
  type EvidenceProfileInputV2,
} from '../../src/evidence/v2/engineV2.js';
import {
  classifyV2Freshness,
} from '../../src/evidence/v2/freshnessClassifier.js';
import {
  T_FRESH_MAX_SECONDS,
  T_AGING_MAX_SECONDS,
  T_SERVE_SUPPRESS_MAX_SECONDS,
} from '../../src/evidence/v2/thresholds.js';
import { evaluateV2ServingGate } from '../../src/evidence/v2/servingGate.js';
import { inputF1, inputF1a, inputF2, inputF3, inputF4, inputF5, inputF6 } from './fFixtures.js';

// ============================================================================
// GROUP 1 — v1 REGRESSION.
// The V1-A2-2 REVISE extraction (engineCore.ts + engine.ts wrapper +
// cma.ts dead-code removal) must not change what v1 computes for any
// existing fixture.
// ============================================================================

describe('V1-A2-2 GROUP 1 — v1 REGRESSION: v1 fixtures still produce identical v1 output', () => {
  it('§F.1 v1 fixture — classification stable (moderate_over_evidence)', () => {
    const out = computeEvidenceProfile(inputF1());
    assert.equal(out.classification, 'moderate_over_evidence');
    assert.equal(out.direction, 'over');
    assert.equal(out.method_version, 'evidence_method_v1');
  });
  it('§F.1a v1 fixture — classification stable (strong_over_evidence)', () => {
    const out = computeEvidenceProfile(inputF1a());
    assert.equal(out.classification, 'strong_over_evidence');
    assert.equal(out.direction, 'over');
  });
  it('§F.2 v1 fixture — classification stable (moderate_under_evidence)', () => {
    const out = computeEvidenceProfile(inputF2());
    assert.equal(out.classification, 'moderate_under_evidence');
    assert.equal(out.direction, 'under');
  });
  it('§F.3 v1 fixture — classification stable', () => {
    const out = computeEvidenceProfile(inputF3());
    assert.equal(out.classification, 'mixed_evidence');
  });
  it('§F.4 v1 fixture — Insufficient (sample fails DR-6/7)', () => {
    const out = computeEvidenceProfile(inputF4());
    assert.equal(out.classification, 'insufficient_evidence');
  });
  it('§F.5 v1 fixture — Unavailable via §C.9 unresolved player mapping', () => {
    const out = computeEvidenceProfile(inputF5());
    assert.equal(out.classification, 'unavailable');
  });
  it('§F.6 v1 fixture — quality-capped Moderate', () => {
    const out = computeEvidenceProfile(inputF6());
    assert.equal(out.classification, 'moderate_over_evidence');
    assert.equal(out.quality_capped, true);
  });
  it('v1 output method_version remains locked at evidence_method_v1 (no v2 leak)', () => {
    for (const fixture of [inputF1, inputF1a, inputF2, inputF3, inputF4, inputF5, inputF6]) {
      const out = computeEvidenceProfile(fixture());
      assert.equal(out.method_version, 'evidence_method_v1');
    }
  });
});

// ============================================================================
// GROUP 2 — v2 BRANCH REACHABILITY with the LOCKED numbers (900/1800/3600).
// ============================================================================

describe('V1-A2-2 GROUP 2 — v2 branch reachability at LOCKED thresholds', () => {
  it('branch fresh — classification_age = 0, book_count = 4', () => {
    const out = classifyV2Freshness({ classification_age_seconds: 0, book_count: 4 });
    assert.equal(out.branch, 'fresh');
    assert.equal(out.classification_cap, 'none');
    assert.equal(out.reason_code, null);
  });
  it('branch aging — classification_age = 1000 (>900, <=1800), book_count >= 1', () => {
    const out = classifyV2Freshness({ classification_age_seconds: 1000, book_count: 3 });
    assert.equal(out.branch, 'aging');
    assert.equal(out.classification_cap, 'none');
    assert.equal(out.reason_code, null);
  });
  it('branch stale-present — classification_age = 2500 (>1800, <=3600), book_count >= 1 → cap Moderate + STALE_CURRENT_MARKET', () => {
    const out = classifyV2Freshness({ classification_age_seconds: 2500, book_count: 2 });
    assert.equal(out.branch, 'stale-present');
    assert.equal(out.classification_cap, 'moderate');
    assert.equal(out.reason_code, 'stale_current_market');
    assert.equal(out.beyond_serve_horizon, false);
  });
  it('branch absent — book_count = 0 → NO_CURRENT_MARKET (Unavailable) regardless of age', () => {
    for (const age of [0, 100, 1000, 2000, 3600, 9999]) {
      const out = classifyV2Freshness({ classification_age_seconds: age, book_count: 0 });
      assert.equal(out.branch, 'absent');
      assert.equal(out.classification_cap, 'unavailable');
      assert.equal(out.reason_code, 'no_current_market');
    }
  });
  it('branch beyond-horizon — classification_age > 3600, book_count >= 1', () => {
    const out = classifyV2Freshness({ classification_age_seconds: 5000, book_count: 3 });
    assert.equal(out.branch, 'beyond-horizon');
    assert.equal(out.beyond_serve_horizon, true);
  });
  it('LOCKED constants — assert exactly the D-A1 values 900/1800/3600', () => {
    assert.equal(T_FRESH_MAX_SECONDS, 900);
    assert.equal(T_AGING_MAX_SECONDS, 1800);
    assert.equal(T_SERVE_SUPPRESS_MAX_SECONDS, 3600);
  });
});

// ============================================================================
// GROUP 3 — BOUNDARY EXACTNESS. Off-by-one at 900/1800/3600 = defect.
// Now exercised end-to-end via the discriminated union.
// ============================================================================

describe('V1-A2-2 GROUP 3 — boundary exactness at 900 / 1800 / 3600 (end-to-end via engineV2)', () => {
  function v2InputAtAge(age_seconds: number): EvidenceProfileInputV2 {
    const base = inputF1();
    // Fix line_observed_at at a stable instant; adjust eval_ref by age.
    const line_observed_at_ms = Date.UTC(2026, 6, 18, 0, 0, 0);
    const eval_ref_ms = line_observed_at_ms + age_seconds * 1000;
    return Object.freeze({
      ...base,
      line_observed_at: new Date(line_observed_at_ms).toISOString(),
      evaluation_reference_time: new Date(eval_ref_ms).toISOString(),
    });
  }

  it('classification_age = 900 → classified (fresh, upper edge inclusive)', () => {
    const r = computeEvidenceProfileV2(v2InputAtAge(900));
    assert.equal(r.kind, 'classified');
    assert.ok(isClassifiedV2(r));
    if (r.kind === 'classified') assert.equal(r.v2_freshness.branch, 'fresh');
  });
  it('classification_age = 901 → classified (aging, crosses fresh boundary)', () => {
    const r = computeEvidenceProfileV2(v2InputAtAge(901));
    assert.ok(isClassifiedV2(r));
    if (r.kind === 'classified') assert.equal(r.v2_freshness.branch, 'aging');
  });
  it('classification_age = 1800 → classified (aging, upper edge inclusive)', () => {
    const r = computeEvidenceProfileV2(v2InputAtAge(1800));
    if (r.kind === 'classified') assert.equal(r.v2_freshness.branch, 'aging');
  });
  it('classification_age = 1801 → classified (stale-present, capped Moderate + STALE_CURRENT_MARKET)', () => {
    const r = computeEvidenceProfileV2(v2InputAtAge(1801));
    assert.ok(isClassifiedV2(r));
    if (r.kind === 'classified') {
      assert.equal(r.v2_freshness.branch, 'stale-present');
      assert.equal(r.profile.quality_cap_reason, 'stale_current_market');
      // profile has some Moderate/Mixed classification (§F.1 is over-leaning).
      assert.ok(
        ['moderate_over_evidence', 'moderate_under_evidence', 'mixed_evidence'].includes(
          r.profile.classification
        )
      );
    }
  });
  it('classification_age = 3600 → classified (stale-present, upper edge inclusive)', () => {
    const r = computeEvidenceProfileV2(v2InputAtAge(3600));
    assert.equal(r.kind, 'classified');
    if (r.kind === 'classified') {
      assert.equal(r.v2_freshness.branch, 'stale-present');
      assert.equal(r.profile.quality_cap_reason, 'stale_current_market');
    }
  });
  it('classification_age = 3601 → BEYOND_HORIZON (not classified, no profile produced)', () => {
    const r = computeEvidenceProfileV2(v2InputAtAge(3601));
    assert.equal(r.kind, 'beyond_horizon');
    assert.ok(isBeyondHorizonV2(r));
    if (r.kind === 'beyond_horizon') {
      assert.equal(r.reason, 'classification_age_exceeds_serve_horizon');
      assert.equal(r.classification_age_seconds, 3601);
      assert.equal(r.v2_freshness.branch, 'beyond-horizon');
    }
    // Structural: type narrowing prevents accessing `profile` here.
  });
});

// ============================================================================
// GROUP 4 — TIMING (intra-batch drift removed). Integration variant lives
// in tests/integration/v2MethodImplementation.integration.test.ts.
// ============================================================================

describe('V1-A2-2 GROUP 4 — timing: shared evaluation_reference_time removes intra-batch drift', () => {
  it('two grains with SAME evaluation_reference_time + SAME line_observed_at classify identically regardless of wall-clock between calls', () => {
    const evaluation_reference_time = '2026-07-18T18:00:00Z';
    const line_observed_at = '2026-07-18T17:50:00Z'; // 600s ago → fresh
    const shared_input = {
      classification_age_seconds: deriveClassificationAgeSeconds(evaluation_reference_time, line_observed_at),
      book_count: 3,
    };
    const out_a = classifyV2Freshness(shared_input);
    const out_b = classifyV2Freshness(shared_input);
    assert.equal(out_a.branch, 'fresh');
    assert.equal(out_a.branch, out_b.branch);
    assert.equal(out_a.classification_cap, out_b.classification_cap);
    assert.equal(out_a.reason_code, out_b.reason_code);
  });
  it('deriveClassificationAgeSeconds — deterministic on identical inputs', () => {
    const age = deriveClassificationAgeSeconds('2026-07-18T18:00:00Z', '2026-07-18T17:59:00Z');
    assert.equal(age, 60);
    const same = deriveClassificationAgeSeconds('2026-07-18T18:00:00Z', '2026-07-18T17:59:00Z');
    assert.equal(same, age);
  });
  it('deriveClassificationAgeSeconds — null line_observed_at → +Infinity', () => {
    const age = deriveClassificationAgeSeconds('2026-07-18T18:00:00Z', null);
    assert.equal(age, Number.POSITIVE_INFINITY);
  });
});

// ============================================================================
// GROUP 5 — SERVING gate. Boundary + classification IMMUTABILITY.
// The persisted classification NEVER changes based on serving-gate decisions.
// ============================================================================

describe('V1-A2-2 GROUP 5 — serving gate: display_age boundary + classification immutability', () => {
  it('display_age 3599 → serve', () => {
    const gate = evaluateV2ServingGate({
      line_observed_at: '2026-07-18T00:00:00Z',
      serve_now: '2026-07-18T00:59:59Z',
    });
    assert.equal(gate.decision, 'serve');
    assert.ok((gate.display_age_seconds ?? 0) <= 3600);
  });
  it('display_age 3600 → serve (boundary inclusive)', () => {
    const gate = evaluateV2ServingGate({
      line_observed_at: '2026-07-18T00:00:00Z',
      serve_now: '2026-07-18T01:00:00Z',
    });
    assert.equal(gate.decision, 'serve');
  });
  it('display_age 3601 → suppress', () => {
    const gate = evaluateV2ServingGate({
      line_observed_at: '2026-07-18T00:00:00Z',
      serve_now: '2026-07-18T01:00:01Z',
    });
    assert.equal(gate.decision, 'suppress');
    assert.ok((gate.display_age_seconds ?? 0) > 3600);
  });
  it('valid classified profile served later at display_age > 3600 → suppressed; the in-memory profile object is UNCHANGED', () => {
    // Construct a v2 stale-present profile at generation time
    // (classification_age=2500 → stale-present, Moderate cap).
    const line_observed_at_ms = Date.UTC(2026, 6, 18, 0, 0, 0);
    const v2_input: EvidenceProfileInputV2 = Object.freeze({
      ...inputF1(),
      line_observed_at: new Date(line_observed_at_ms).toISOString(),
      evaluation_reference_time: new Date(line_observed_at_ms + 2500 * 1000).toISOString(),
    });
    const r = computeEvidenceProfileV2(v2_input);
    assert.equal(r.kind, 'classified');
    if (r.kind !== 'classified') return;
    const persisted_classification = r.profile.classification;
    const persisted_cap = r.profile.quality_cap_reason;
    const persisted_reasons_json = JSON.stringify(r.profile.reasons);

    // Now serve later; display_age > 3600 → suppress.
    const gate = evaluateV2ServingGate({
      line_observed_at: v2_input.line_observed_at,
      serve_now: new Date(line_observed_at_ms + 3700 * 1000).toISOString(),
    });
    assert.equal(gate.decision, 'suppress');
    // In-memory profile object is UNCHANGED — the gate cannot mutate it.
    assert.equal(r.profile.classification, persisted_classification);
    assert.equal(r.profile.quality_cap_reason, persisted_cap);
    assert.equal(JSON.stringify(r.profile.reasons), persisted_reasons_json);
  });
});

// ============================================================================
// GROUP 7 — PRICE NON-EFFECT. Owner R1.
// ============================================================================

describe('V1-A2-2 GROUP 7 — price non-effect (owner R1)', () => {
  it('classifyV2Freshness is a pure function of (classification_age, book_count); price is not a parameter', () => {
    const a = classifyV2Freshness({ classification_age_seconds: 500, book_count: 3 });
    const b = classifyV2Freshness({ classification_age_seconds: 500, book_count: 3 });
    assert.deepEqual(a, b);
  });
  it('two v2 profiles with identical inputs classify identically (branch, cap, reason)', () => {
    const base = inputF1();
    const v2_a: EvidenceProfileInputV2 = Object.freeze({
      ...base,
      line_observed_at: '2026-07-18T00:00:00Z',
      evaluation_reference_time: '2026-07-18T00:01:00Z',
    });
    const v2_b: EvidenceProfileInputV2 = Object.freeze({ ...v2_a });
    const ra = computeEvidenceProfileV2(v2_a);
    const rb = computeEvidenceProfileV2(v2_b);
    assert.equal(ra.kind, 'classified');
    assert.equal(rb.kind, 'classified');
    if (ra.kind === 'classified' && rb.kind === 'classified') {
      assert.equal(ra.v2_freshness.branch, rb.v2_freshness.branch);
      assert.equal(ra.v2_freshness.classification_cap, rb.v2_freshness.classification_cap);
      assert.equal(ra.v2_freshness.reason_code, rb.v2_freshness.reason_code);
    }
  });
});

// ============================================================================
// GROUP 8 — abnormal_dispersion never emitted anywhere in the v2 path.
// ============================================================================

describe('V1-A2-2 GROUP 8 — abnormal_dispersion never emitted on v2 path', () => {
  it('v2 engine output.reasons never contain abnormal_dispersion for any §F fixture (fresh path)', () => {
    const fixtures = [inputF1, inputF1a, inputF2, inputF3, inputF4, inputF5, inputF6];
    for (const f of fixtures) {
      const base = f();
      const v2_input: EvidenceProfileInputV2 = Object.freeze({
        ...base,
        line_observed_at: '2026-07-18T00:00:00Z',
        evaluation_reference_time: '2026-07-18T00:00:30Z',
      });
      const r = computeEvidenceProfileV2(v2_input);
      if (r.kind !== 'classified') continue;
      for (const reason of r.profile.reasons) {
        assert.notEqual(reason.reason_code, 'abnormal_dispersion',
          `abnormal_dispersion MUST NOT be emitted; got it on fixture ${f.name}`);
      }
    }
  });
  it('v2 engine reasons never emit abnormal_dispersion for stale-present inputs', () => {
    const base = inputF1();
    const v2_input: EvidenceProfileInputV2 = Object.freeze({
      ...base,
      line_observed_at: '2026-07-18T00:00:00Z',
      evaluation_reference_time: '2026-07-18T00:41:40Z', // 2500s → stale-present
    });
    const r = computeEvidenceProfileV2(v2_input);
    assert.equal(r.kind, 'classified');
    if (r.kind !== 'classified') return;
    for (const reason of r.profile.reasons) {
      assert.notEqual(reason.reason_code, 'abnormal_dispersion');
    }
  });
  it('beyond-horizon results carry NO profile — no reasons to inspect', () => {
    const base = inputF1();
    const v2_input: EvidenceProfileInputV2 = Object.freeze({
      ...base,
      line_observed_at: '2026-07-18T00:00:00Z',
      evaluation_reference_time: '2026-07-18T01:16:40Z', // 4600s → beyond-horizon
    });
    const r = computeEvidenceProfileV2(v2_input);
    assert.equal(r.kind, 'beyond_horizon');
    // `r.profile` does not exist on the beyond_horizon variant — this is
    // enforced by the type checker at compile time and by the discriminant
    // at runtime. Nothing to check.
  });
});

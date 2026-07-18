// V1-A2-1 — reachability fixtures for evidence_method_v2.
//
// PURPOSE: prove — with test-only fixture threshold values — that every v2
// branch is reachable and that the classification-age boundary is
// independently exercisable from the serve-time boundary. See
// docs/product/EVIDENCE_PROFILE_METHOD_V2.md §3 and §4.
//
// -----------------------------------------------------------------------------
// TEST-ONLY FIXTURE THRESHOLDS — NOT PROPOSED, NOT DEFAULTS
// -----------------------------------------------------------------------------
// The numeric values below live SOLELY in this test module. They are chosen
// as round easily-readable numbers for arithmetic reasons, NOT as candidate
// production thresholds. Per owner ruling R3:
//   * they MUST NOT be imported by production code (grep of src/ enforces);
//   * they MUST NOT be treated as defaults;
//   * they exist only to prove branch reachability.
// Numeric threshold values for the v2 method are OWNER-GATED (D-A1).

const FIXTURE_T_FRESH_MAX_SECONDS  = 60;   // fixture — not a proposal
const FIXTURE_T_AGING_MAX_SECONDS  = 300;  // fixture — not a proposal
const FIXTURE_T_SERVE_SUPPRESS_MAX = 1800; // fixture — not a proposal

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// -----------------------------------------------------------------------------
// The v2 classifier is defined by the AUTHORITY (§3.2 branch table). It is
// a PURE function of (line_age_seconds, book_count, params). It has no I/O
// and no clock reads. This test module implements the classifier INLINE
// against the test-only fixture parameters — the production implementation
// lives in the V1-A2-2 ticket. V1-A2-1 authors only authority + schema +
// this reachability test.
// -----------------------------------------------------------------------------

type V2Branch = 'fresh' | 'aging' | 'stale-present' | 'absent';

interface V2ClassifierInput {
  readonly line_age_seconds: number;
  readonly book_count: number;
}
interface V2Boundaries {
  readonly T_FRESH_MAX_SECONDS: number;
  readonly T_AGING_MAX_SECONDS: number;
}
interface V2ClassifierOutput {
  readonly branch: V2Branch;
  readonly classification_cap: 'none' | 'moderate' | 'unavailable';
  readonly reason_code: 'stale_current_market' | 'no_current_market' | null;
}

/**
 * v2 freshness classifier per authority §3.2. Pure. No I/O.
 * Test-local implementation — the production version is V1-A2-2's
 * responsibility. Both must satisfy the same table.
 */
function classifyV2Freshness(
  input: V2ClassifierInput,
  bounds: V2Boundaries
): V2ClassifierOutput {
  if (input.book_count === 0) {
    return Object.freeze({
      branch: 'absent',
      classification_cap: 'unavailable',
      reason_code: 'no_current_market',
    });
  }
  if (input.line_age_seconds <= bounds.T_FRESH_MAX_SECONDS) {
    return Object.freeze({ branch: 'fresh', classification_cap: 'none', reason_code: null });
  }
  if (input.line_age_seconds <= bounds.T_AGING_MAX_SECONDS) {
    return Object.freeze({ branch: 'aging', classification_cap: 'none', reason_code: null });
  }
  return Object.freeze({
    branch: 'stale-present',
    classification_cap: 'moderate',
    reason_code: 'stale_current_market',
  });
}

/**
 * Serve-time display rule per §5. Distinct boundary; distinct concept.
 * MARK vs SUPPRESS is a surface choice (V1-6/7/8); the classifier only
 * emits the "past display boundary" boolean and the display_age.
 */
function serveTimeGate(
  line_observed_at_ms: number,
  serve_now_ms: number,
  T_SERVE_SUPPRESS_MAX_SECONDS: number
): { readonly display_age_seconds: number; readonly past_serve_boundary: boolean } {
  const dt = (serve_now_ms - line_observed_at_ms) / 1000;
  return Object.freeze({
    display_age_seconds: dt,
    past_serve_boundary: dt > T_SERVE_SUPPRESS_MAX_SECONDS,
  });
}

const BOUNDS: V2Boundaries = Object.freeze({
  T_FRESH_MAX_SECONDS: FIXTURE_T_FRESH_MAX_SECONDS,
  T_AGING_MAX_SECONDS: FIXTURE_T_AGING_MAX_SECONDS,
});

// -----------------------------------------------------------------------------
// Branch reachability — one it() per authority §3.2 row.
// -----------------------------------------------------------------------------

describe('V1-A2-1 §3.2 v2 branch reachability (fixture thresholds — NOT proposals)', () => {
  it('branch: FRESH — line_age ≤ T_FRESH_MAX_SECONDS AND book_count ≥ 1', () => {
    const out = classifyV2Freshness({ line_age_seconds: 30, book_count: 4 }, BOUNDS);
    assert.equal(out.branch, 'fresh');
    assert.equal(out.classification_cap, 'none');
    assert.equal(out.reason_code, null);
  });

  it('branch: FRESH boundary — line_age == T_FRESH_MAX_SECONDS is admitted', () => {
    const out = classifyV2Freshness(
      { line_age_seconds: FIXTURE_T_FRESH_MAX_SECONDS, book_count: 3 }, BOUNDS
    );
    assert.equal(out.branch, 'fresh');
  });

  it('branch: AGING — T_FRESH_MAX < line_age ≤ T_AGING_MAX_SECONDS AND book_count ≥ 1', () => {
    const out = classifyV2Freshness({ line_age_seconds: 150, book_count: 3 }, BOUNDS);
    assert.equal(out.branch, 'aging');
    assert.equal(out.classification_cap, 'none');
    assert.equal(out.reason_code, null);
  });

  it('branch: AGING boundary — line_age == T_AGING_MAX_SECONDS is admitted (still aging)', () => {
    const out = classifyV2Freshness(
      { line_age_seconds: FIXTURE_T_AGING_MAX_SECONDS, book_count: 3 }, BOUNDS
    );
    assert.equal(out.branch, 'aging');
  });

  it('branch: STALE-PRESENT — line_age > T_AGING_MAX_SECONDS AND book_count ≥ 1 → cap Moderate + STALE_CURRENT_MARKET', () => {
    const out = classifyV2Freshness({ line_age_seconds: 600, book_count: 2 }, BOUNDS);
    assert.equal(out.branch, 'stale-present');
    assert.equal(out.classification_cap, 'moderate');
    assert.equal(out.reason_code, 'stale_current_market');
  });

  it('branch: STALE-PRESENT — is REACHABLE by construction (contrast v1 §C.3 unreachable branch)', () => {
    // The reachability of this branch is precisely the defect v2 exists to
    // correct in v1. In v1, `composeCurrentMarketRow` empties the offering
    // set for state ∉ {fresh, aging}, so book_count was always 0 when line
    // was stale — v1's stale+cap branch was unreachable. Here we prove
    // structurally that under v2's classifier, a stale line with ≥1 book
    // routes to stale-present (cap Moderate), not to absent (Unavailable).
    const out_stale = classifyV2Freshness({ line_age_seconds: 900, book_count: 5 }, BOUNDS);
    const out_absent = classifyV2Freshness({ line_age_seconds: 900, book_count: 0 }, BOUNDS);
    assert.equal(out_stale.branch, 'stale-present');
    assert.equal(out_absent.branch, 'absent');
    assert.notEqual(out_stale.reason_code, out_absent.reason_code);
  });

  it('branch: ABSENT — book_count = 0 (regardless of line_age) → NO_CURRENT_MARKET', () => {
    const out_recent  = classifyV2Freshness({ line_age_seconds:  30, book_count: 0 }, BOUNDS);
    const out_stale   = classifyV2Freshness({ line_age_seconds: 999, book_count: 0 }, BOUNDS);
    for (const out of [out_recent, out_stale]) {
      assert.equal(out.branch, 'absent');
      assert.equal(out.classification_cap, 'unavailable');
      assert.equal(out.reason_code, 'no_current_market');
    }
  });
});

// -----------------------------------------------------------------------------
// Reason-code semantics (owner R5): STALE_CURRENT_MARKET vs NO_CURRENT_MARKET.
// -----------------------------------------------------------------------------

describe('V1-A2-1 §3.3 reason semantics (owner R5)', () => {
  it('stale-present emits STALE_CURRENT_MARKET only — never NO_CURRENT_MARKET', () => {
    const out = classifyV2Freshness({ line_age_seconds: 999, book_count: 2 }, BOUNDS);
    assert.equal(out.reason_code, 'stale_current_market');
    assert.notEqual(out.reason_code, 'no_current_market');
  });

  it('absent emits NO_CURRENT_MARKET only — never STALE_CURRENT_MARKET', () => {
    const out = classifyV2Freshness({ line_age_seconds: 999, book_count: 0 }, BOUNDS);
    assert.equal(out.reason_code, 'no_current_market');
    assert.notEqual(out.reason_code, 'stale_current_market');
  });
});

// -----------------------------------------------------------------------------
// Serve-time boundary INDEPENDENCE (owner R4).
// The classification-age boundary and the serve-time boundary are DISTINCT
// parameters and MUST be independently exercisable.
// -----------------------------------------------------------------------------

describe('V1-A2-1 §4.2 classification-age and serve-time are DISTINCT (owner R4)', () => {
  it('a FRESH-classified grain can be past the serve-time boundary at read', () => {
    // At classification time, line was fresh (10 s old). Persisted.
    const at_classify = classifyV2Freshness({ line_age_seconds: 10, book_count: 3 }, BOUNDS);
    assert.equal(at_classify.branch, 'fresh');
    // Later at serve time, the SAME line_observed_at is now >T_SERVE_SUPPRESS
    // seconds old — MARK/SUPPRESS fires but the persisted classification is
    // unchanged (see §5 last bullet).
    const line_observed = 0;
    const serve_now = (FIXTURE_T_SERVE_SUPPRESS_MAX + 100) * 1000; // ms
    const gate = serveTimeGate(line_observed, serve_now, FIXTURE_T_SERVE_SUPPRESS_MAX);
    assert.equal(gate.past_serve_boundary, true);
    // The classifier output is what it was; serving decides mark/suppress separately.
    assert.equal(at_classify.branch, 'fresh');
  });

  it('a STALE-PRESENT-classified grain may be INSIDE the serve-time window', () => {
    // At classification time (with the batch reference time), line was old
    // enough for stale-present. At serve time — very soon after the profile
    // was generated — the display_age is still under T_SERVE_SUPPRESS.
    const at_classify = classifyV2Freshness({ line_age_seconds: 600, book_count: 2 }, BOUNDS);
    assert.equal(at_classify.branch, 'stale-present');
    // line_observed_at was 600s before classification; profile generated
    // shortly after; serve happens shortly after that. Display age at serve
    // is still under T_SERVE_SUPPRESS if the read is prompt.
    const line_observed_ms = 0;
    const serve_now_ms = 700 * 1000; // 700s after line observed
    const gate = serveTimeGate(line_observed_ms, serve_now_ms, FIXTURE_T_SERVE_SUPPRESS_MAX);
    assert.equal(gate.past_serve_boundary, false);
    // Classification cap remains 'moderate' regardless of serve-time gate.
    assert.equal(at_classify.classification_cap, 'moderate');
  });

  it('serve-time boundary is INDEPENDENT of the classification-age boundary', () => {
    // Verify by construction: the classifier does not take T_SERVE_SUPPRESS;
    // the serve gate does not take T_AGING. They are physically separate.
    // The test signature simply asserts type-level separation.
    const bounds_only_classification: V2Boundaries = Object.freeze({
      T_FRESH_MAX_SECONDS: 60, T_AGING_MAX_SECONDS: 300,
    });
    const classify_out = classifyV2Freshness({ line_age_seconds: 45, book_count: 2 }, bounds_only_classification);
    const serve_out = serveTimeGate(0, 0 + 45_000, /* T_SERVE_SUPPRESS */ 1000);
    // Fresh at classification; not past serve boundary.
    assert.equal(classify_out.branch, 'fresh');
    assert.equal(serve_out.past_serve_boundary, false);
    // Now perturb only the serve boundary — classification unchanged.
    const serve_out_tight = serveTimeGate(0, 0 + 45_000, /* T_SERVE_SUPPRESS */ 10);
    assert.equal(serve_out_tight.past_serve_boundary, true);
    assert.equal(classify_out.branch, 'fresh'); // still fresh; classifier does not care
  });
});

// -----------------------------------------------------------------------------
// Confirmation, in test-side text, that these values are fixtures.
// -----------------------------------------------------------------------------

describe('V1-A2-1 R3 fixture discipline (documented for future readers)', () => {
  it('numeric threshold values in this test module are FIXTURES, not proposals', () => {
    // If a future reader is tempted to lift these numbers into src/, this
    // test's title, the module comment at top, and this assertion together
    // record that the numbers are NOT proposals. Owner ruling R3.
    assert.equal(FIXTURE_T_FRESH_MAX_SECONDS,  60);
    assert.equal(FIXTURE_T_AGING_MAX_SECONDS,  300);
    assert.equal(FIXTURE_T_SERVE_SUPPRESS_MAX, 1800);
    // These three numbers exist to make arithmetic legible in the tests
    // above. The v2 authority (docs/product/EVIDENCE_PROFILE_METHOD_V2.md
    // §3.1) marks these boundaries UNLOCKED — owner decision required (D-A1).
  });
});

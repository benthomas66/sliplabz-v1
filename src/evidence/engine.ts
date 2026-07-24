// V1-A1-3 Phase A — top-level pure engine (v1 wrapper post-V1-A2-2 REVISE).
//
// Authority: docs/product/EVIDENCE_PROFILE_METHOD_V1.md (whole document).
//
// This file was 315 lines pre-REVISE. It bundled §B/§C/§D/§E in one
// function. V1-A2-2 REVISE extracted the freshness-neutral core to
// `src/evidence/engineCore.ts` (see that file's header for the
// rationale). This module is now the v1 wrapper: it computes §C.3 the
// v1 way — from `cmr.freshness.state` via `evaluateC3Freshness` — and
// delegates to the core with the resulting typed verdict.
//
// v1's public behaviour is preserved BYTE-FOR-BYTE (proof A in the
// V1-A2-2 report). This module contains no formula.
//
// Pure function. No I/O. No clock. No persistence.
//
// Given identical inputs, identical outputs, forever.

import type { EvidenceProfileInput, EvidenceProfileOutput } from './types.js';
import { evaluateC3Freshness } from './quality.js';
import { computeCoreEvidenceProfile } from './engineCore.js';

/**
 * Compute the Evidence Profile for the input, per evidence_method_v1.
 *
 * Public shape UNCHANGED from before V1-A2-2 REVISE. Internally this
 * function computes the §C.3 verdict from the CMR's v1 freshness state
 * and delegates to `computeCoreEvidenceProfile`; every existing v1
 * regression fixture (F.1 .. F.6 and all others) is byte-identical.
 */
export function computeEvidenceProfile(
  input: EvidenceProfileInput
): EvidenceProfileOutput {
  const cmr = input.current_market_row;
  const bc = cmr.eligible_book_count.count;
  const c3_verdict = evaluateC3Freshness(cmr.freshness.state, bc);
  return computeCoreEvidenceProfile(input, c3_verdict);
}

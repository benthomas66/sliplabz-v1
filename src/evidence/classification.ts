// V1-A1-3 Phase A — §D classification + §D.2 compact + §D.3 caps + DR-20 sort.
//
// Authority: docs/product/EVIDENCE_PROFILE_METHOD_V1.md §D.1 (first-match
// ordering), §D.2 (compact-display mapping), §D.3 (caps), DR-20 (tie-
// breaking for deterministic sorting).
//
// GD-15: the seven-value taxonomy is fixed; no rearrangement allowed.
//
// Pure functions.

import type { EvidenceClassification, EvidenceDirection } from '../shared/enums.js';
import { DR2_STRONG_ABS, DR3_MODERATE_LOWER_ABS } from './quality.js';
import { NEUTRAL_ZONE_ABS } from './components/composite.js';

/**
 * §D.1 first-match classification. Inputs are already the outcomes of
 * §C (Unavailable / Insufficient predicates), §B (score), and §C.10 gate
 * evaluation. Order is critical — Unavailable wins over Insufficient
 * wins over WINDOWS_DISAGREE wins over Mixed wins over Strong wins over
 * Moderate wins over "else Mixed".
 */
export interface ClassifyInputs {
  readonly any_unavailable: boolean;
  readonly any_insufficient: boolean;
  readonly windows_disagree: boolean;
  readonly composite_score: number | null;
  readonly c10_all_pass: boolean;
  /**
   * §D.1 step 5 / §D.3 "quality_capped" predicate isolate — TRUE iff at
   * least one §C.10 clause-5 cap fired (§C.2 / §C.3 / §C.5 T2 / §C.6 /
   * §C.7). §F.1 explicitly says the profile is Moderate purely on
   * magnitude with no cap → quality_capped = false; §F.6 says caps fired
   * → quality_capped = true even though |score| < 0.55. So the correct
   * predicate is "a §C.10 clause-5 cap fired," not "§C.10 failed
   * anywhere."
   */
  readonly any_c10_clause5_cap_fired: boolean;
}

export interface ClassifyResult {
  readonly classification: EvidenceClassification;
  readonly direction: EvidenceDirection | null;
  /** True when a §C.10-passing Strong-eligible score was capped down. */
  readonly quality_capped: boolean;
}

export function classify(input: ClassifyInputs): ClassifyResult {
  // Step 1: Unavailable.
  if (input.any_unavailable) {
    return Object.freeze({
      classification: 'unavailable' as const,
      direction: null,
      quality_capped: false,
    });
  }
  // Step 2: Insufficient.
  if (input.any_insufficient) {
    return Object.freeze({
      classification: 'insufficient_evidence' as const,
      direction: null,
      quality_capped: false,
    });
  }
  // Step 3: WINDOWS_DISAGREE → force Mixed (composite is informational).
  if (input.windows_disagree) {
    return Object.freeze({
      classification: 'mixed_evidence' as const,
      direction: null,
      quality_capped: false,
    });
  }
  // Steps 4-7 all consult |composite_score|. If we somehow got here with
  // a null score, that's a bug in the caller; refuse to guess.
  const score = input.composite_score;
  if (score === null) {
    throw new Error(
      'V1-A1-3 classify: composite_score is null on a path that expects a scored profile. ' +
      'Unavailable and Insufficient should have short-circuited earlier.'
    );
  }
  // Step 4: |score| < DR-5 (0.05) → Mixed (no directional evidence).
  if (Math.abs(score) < NEUTRAL_ZONE_ABS) {
    return Object.freeze({
      classification: 'mixed_evidence' as const,
      direction: null,
      quality_capped: false,
    });
  }
  const direction: EvidenceDirection = score > 0 ? 'over' : 'under';
  // Step 5: Strong if all six §C.10 clauses pass AND |score| ≥ DR-2 (0.55).
  if (input.c10_all_pass && Math.abs(score) >= DR2_STRONG_ABS) {
    return Object.freeze({
      classification: direction === 'over' ? 'strong_over_evidence' as const : 'strong_under_evidence' as const,
      direction,
      quality_capped: false,
    });
  }
  // §D.1 step 5's cap-clear clause is what §C.10 clauses 2-6 enforce; if
  // |score| ≥ 0.55 but §C.10 fails, that's a "quality capped" Moderate.
  // §D.3: "quality_capped = true when a Strong-eligible score was
  // capped down." §F.6 shows quality_capped=true when the |score| < 0.55
  // path is entered but §C.10's cap-clear failed. Interpretation
  // (against §F.6 explicit): quality_capped = true iff the composite
  // magnitude WOULD HAVE been Strong-eligible (|score| ≥ 0.55 OR
  // otherwise interpreted from §D.3 "Strong is unreachable when any of
  // §C.10 conditions 2-6 fails") AND §C.10 blocked it.
  //
  // §F.6 explicitly: |score| = 0.4564 < 0.55 → does NOT reach Strong on
  // magnitude alone. Additionally §C.10 clause 5 would fail. quality_capped
  // = true because §D.1 step 5's cap-clear clause fails via §C.2 and §C.3.
  //
  // Reading: quality_capped is true whenever a cap in §C.10 clause 5 fires
  // (regardless of whether the score would have made it), because the
  // profile is Moderate-only because a cap bound it. So quality_capped =
  // !c10_all_pass when the profile is Moderate.
  //
  // Step 6: |score| ≥ 0.30 → Moderate.
  if (Math.abs(score) >= DR3_MODERATE_LOWER_ABS) {
    return Object.freeze({
      classification: direction === 'over' ? 'moderate_over_evidence' as const : 'moderate_under_evidence' as const,
      direction,
      quality_capped: input.any_c10_clause5_cap_fired,
    });
  }
  // Step 7: else Mixed.
  return Object.freeze({
    classification: 'mixed_evidence' as const,
    direction: null,
    quality_capped: false,
  });
}

// ---------------------------------------------------------------------------
// §D.2 compact-display mapping (DR-21). GD-15: Unavailable is NEVER
// collapsed into Insufficient.
// ---------------------------------------------------------------------------

export type CompactLabel =
  | 'Over-leaning'
  | 'Mixed'
  | 'Under-leaning'
  | 'Insufficient Evidence'
  | 'Unavailable';

export function compactLabel(c: EvidenceClassification): CompactLabel {
  switch (c) {
    case 'strong_over_evidence':
    case 'moderate_over_evidence':
      return 'Over-leaning';
    case 'strong_under_evidence':
    case 'moderate_under_evidence':
      return 'Under-leaning';
    case 'mixed_evidence':
      return 'Mixed';
    case 'insufficient_evidence':
      return 'Insufficient Evidence';
    case 'unavailable':
      return 'Unavailable';
  }
}

/**
 * §D.2 Discover-card / Research-View label (verbatim). GD-15 (d): Strong
 * vs Moderate is NEVER discarded on those surfaces.
 */
export function fullLabel(c: EvidenceClassification): string {
  switch (c) {
    case 'strong_over_evidence': return 'Strong Over Evidence';
    case 'moderate_over_evidence': return 'Moderate Over Evidence';
    case 'mixed_evidence': return 'Mixed Evidence';
    case 'moderate_under_evidence': return 'Moderate Under Evidence';
    case 'strong_under_evidence': return 'Strong Under Evidence';
    case 'insufficient_evidence': return 'Insufficient Evidence';
    case 'unavailable': return 'Unavailable';
  }
}

// ---------------------------------------------------------------------------
// DR-20 tie-break comparator for deterministic sorting (ranking-only).
// ---------------------------------------------------------------------------

export interface DR20SortInput {
  readonly composite_score: number | null;
  readonly l10_eligible_n: number;
  readonly eligible_sportsbook_count: number;
  readonly internal_game_id: string;
}

/**
 * DR-20: (1) |score| descending, (2) L10 eligible_n descending,
 * (3) eligible_sportsbook_count descending, (4) internal_game_id ascending.
 *
 * "RANKING USES THE FULL-PRECISION STORED SCORE, NOT THE ROUNDED DR-19
 * DISPLAY VALUE." — so this comparator MUST NEVER round.
 *
 * Returns negative if `a` should sort BEFORE `b` (higher-ranked).
 */
export function dr20Compare(a: DR20SortInput, b: DR20SortInput): number {
  const absA = a.composite_score === null ? -Infinity : Math.abs(a.composite_score);
  const absB = b.composite_score === null ? -Infinity : Math.abs(b.composite_score);
  if (absA !== absB) return absB - absA;
  if (a.l10_eligible_n !== b.l10_eligible_n) return b.l10_eligible_n - a.l10_eligible_n;
  if (a.eligible_sportsbook_count !== b.eligible_sportsbook_count) return b.eligible_sportsbook_count - a.eligible_sportsbook_count;
  if (a.internal_game_id < b.internal_game_id) return -1;
  if (a.internal_game_id > b.internal_game_id) return 1;
  return 0;
}

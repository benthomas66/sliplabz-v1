// Canonical closing-point selection per complete spec §7.10.2 / Odds §18.4.
//
// Authority:
//   Complete spec §7.10.2 (single_book | unique_modal | tied → unresolved)
//   Complete spec §11.5 canonical_closing_point fields
//   Odds sub-spec §18.4 (unique modal only; no synthetic point between
//     sportsbook points; tied → unresolved)
//   Ticket V1-4 hard invariants:
//     - Sportsbook-only inputs;
//     - DFS/pick'em never participate;
//     - Unique modal selected; documented deterministic tie handling
//       (tied_no_unique_mode → NULL point, exclude from windows);
//     - single_book coverage labeled as such, never presented as consensus;
//     - No pseudo-lines / no interpolation / no averaging.

import type {
  ClosingSelectionMethod,
  CoverageLabel,
  SourceClass,
  CloseCaptureState,
} from '../shared/enums.js';

export interface SourceClosingQuoteInput {
  readonly bookmaker_key: string;
  readonly source_class: SourceClass;
  readonly close_capture_state: CloseCaptureState;
  readonly closing_point: number | null;
}

export interface CanonicalClosingPointResult {
  readonly selection_method: ClosingSelectionMethod;
  readonly canonical_closing_point: number | null;
  readonly total_eligible_sportsbook_count: number;
  readonly sportsbook_count_at_selected_point: number | null;
  readonly coverage_label: CoverageLabel;
  readonly eligible_sportsbook_keys: ReadonlyArray<string>;
  readonly detail: string;
}

/**
 * Select the canonical closing point from a set of source_closing_quotes.
 *
 * Rules:
 *   1. Filter to `source_class = 'sportsbook'` AND `close_capture_state =
 *      'eligible'` AND `closing_point !== null`. DFS/pick'em NEVER participate.
 *   2. If zero eligible sportsbooks → `no_eligible_source`, point NULL,
 *      coverage `no_closing_line`.
 *   3. If exactly one eligible sportsbook → `single_book`, use that point,
 *      coverage `single_book`.
 *   4. If two or more:
 *        * Count occurrences of each observed point.
 *        * If exactly ONE point has the strict maximum count → `unique_modal`,
 *          coverage `complete`.
 *        * Otherwise → `tied_no_unique_mode`, point NULL, coverage
 *          `unresolved_closing_consensus`. This game is excluded from
 *          aggregate historical windows.
 *
 * The selected point is GUARANTEED to be a point observed in at least one
 * eligible sportsbook source quote. Never synthetic. Deterministic: same
 * input → same output.
 */
export function selectCanonicalClosingPoint(
  quotes: ReadonlyArray<SourceClosingQuoteInput>
): CanonicalClosingPointResult {
  // Step 1: filter to eligible sportsbook quotes with non-null closing_point.
  const eligible = quotes.filter(
    (q) =>
      q.source_class === 'sportsbook' &&
      q.close_capture_state === 'eligible' &&
      q.closing_point !== null
  );
  const eligible_keys = Object.freeze(
    eligible.map((q) => q.bookmaker_key).sort()
  );

  if (eligible.length === 0) {
    return Object.freeze({
      selection_method: 'no_eligible_source' as const,
      canonical_closing_point: null,
      total_eligible_sportsbook_count: 0,
      sportsbook_count_at_selected_point: null,
      coverage_label: 'no_closing_line' as const,
      eligible_sportsbook_keys: eligible_keys,
      detail: 'no eligible sportsbook closing quote',
    });
  }
  if (eligible.length === 1) {
    const only = eligible[0]!;
    return Object.freeze({
      selection_method: 'single_book' as const,
      canonical_closing_point: only.closing_point,
      total_eligible_sportsbook_count: 1,
      sportsbook_count_at_selected_point: 1,
      coverage_label: 'single_book' as const,
      eligible_sportsbook_keys: eligible_keys,
      detail: `single eligible sportsbook: ${only.bookmaker_key}`,
    });
  }

  // Step 4: multi-book. Compute point → count.
  const counts = new Map<number, number>();
  for (const q of eligible) {
    const p = q.closing_point!;
    counts.set(p, (counts.get(p) ?? 0) + 1);
  }
  let max_count = 0;
  for (const c of counts.values()) if (c > max_count) max_count = c;
  const at_max: number[] = [];
  for (const [point, count] of counts) if (count === max_count) at_max.push(point);
  at_max.sort((a, b) => a - b);
  if (at_max.length === 1) {
    const selected = at_max[0]!;
    return Object.freeze({
      selection_method: 'unique_modal' as const,
      canonical_closing_point: selected,
      total_eligible_sportsbook_count: eligible.length,
      sportsbook_count_at_selected_point: max_count,
      coverage_label: 'complete' as const,
      eligible_sportsbook_keys: eligible_keys,
      detail: `unique modal point ${selected} at ${max_count} sportsbook(s)`,
    });
  }
  return Object.freeze({
    selection_method: 'tied_no_unique_mode' as const,
    canonical_closing_point: null,
    total_eligible_sportsbook_count: eligible.length,
    sportsbook_count_at_selected_point: null,
    coverage_label: 'unresolved_closing_consensus' as const,
    eligible_sportsbook_keys: eligible_keys,
    detail: `${at_max.length} points tied at max count ${max_count}: ${at_max.join(', ')}`,
  });
}

// V1-6a Scope B — the Board-surface projection (allowlist CONSTRUCTION).
//
// The projection TYPE cannot carry the composite score, paid offering
// detail, or a raw evidence row — those fields are simply absent from the
// type, so they cannot be carried at all. The constructor returns a NEWLY
// CONSTRUCTED allowlisted object; it does not spread the raw row, does not
// spread-then-delete, uses no `omit` helper, does not rely on JSON
// serialization, and uses no cast to claim extra runtime fields are absent.
//
// The explanation surface is produced by the COMMITTED compact renderer
// (`src/explanation` `renderCompactExplanation`), which already bakes
// `must_never_expose_numeric_score: true` into its type. This ticket does
// not duplicate or modify it.

import { renderCompactExplanation } from '../../../../src/explanation/index.js';
import type { RankedCandidate } from './rankedCandidate.js';

/** Keys ALWAYS present on a Board projection. */
export const BOARD_PROJECTION_BASE_KEYS = [
  'player',
  'team',
  'market',
  'evaluated_line',
  'classification_label',
  'compact_display_line',
  'disclosure_g1',
] as const;

/** Optional keys — present ONLY when they apply (see constructor). */
export const BOARD_PROJECTION_OPTIONAL_KEYS = ['cap_tag', 'provenance_marker'] as const;

/** Keys that must NEVER appear on a Board projection (defence in depth). */
export const BOARD_PROJECTION_FORBIDDEN_KEYS = [
  'composite_score', 'components', 'score', 'book_detail', 'offerings',
  'paid_book_offerings', 'profile_output', 'reasons', 'method_version',
  'l10_eligible_n', 'eligible_sportsbook_count', 'internal_game_id',
] as const;

export interface BoardProjectionBase {
  readonly player: string;
  readonly team: string;
  readonly market: string;
  /** Present per Scope B. Null only for an Unavailable row (authority admits null). */
  readonly evaluated_line: number | null;
  /** §D.2 compact classification label — exact taxonomy (GD-15: Unavailable
   *  is NEVER collapsed into Insufficient). From the committed renderer. */
  readonly classification_label: string;
  /** Combined label [+ binding cap tag], composed by the committed renderer. */
  readonly compact_display_line: string;
  /** §G.1 disclosure text (verbatim authority copy). */
  readonly disclosure_g1: string;
}

export interface BoardProjection extends BoardProjectionBase {
  /** §D.4 rule 6 binding quality-cap short tag — present ONLY when a cap fires. */
  readonly cap_tag?: string;
  /** §D.4 rule 7 provenance marker — present ONLY when includes_backfilled_historical
   *  is true. NOT hover-only: the surface renders it as persistent text. */
  readonly provenance_marker?: string;
}

/** Which conditional fields a given candidate should carry. */
export interface ProjectionApplicability {
  readonly cap: boolean;
  readonly provenance: boolean;
}

/**
 * Construct a Board projection from an internal ranked candidate. Returns a
 * NEW object literal with an explicit allowlist of keys; the optional keys
 * are attached ONLY when they apply (conditional key construction, never a
 * raw-row spread + delete). Self-checks the key set before returning.
 */
export function constructBoardProjection(candidate: RankedCandidate): BoardProjection {
  const compact = renderCompactExplanation(candidate.profile_output);

  const cap = compact.binding_cap !== null && compact.binding_cap.cap_summary_short !== '';
  const provenance = compact.provenance_marker !== null;

  const projection: BoardProjection = {
    player: candidate.player,
    team: candidate.team,
    market: candidate.market,
    evaluated_line: candidate.evaluated_line,
    classification_label: compact.compact_label,
    compact_display_line: compact.compact_display_line,
    disclosure_g1: compact.disclosure_g1.text,
    ...(cap ? { cap_tag: compact.binding_cap!.cap_summary_short } : {}),
    ...(provenance ? { provenance_marker: compact.provenance_marker!.text } : {}),
  };

  assertBoardProjectionKeySet(projection, { cap, provenance });
  return Object.freeze(projection);
}

/**
 * RUNTIME KEY-SET ASSERTION. Proves a projection contains EXACTLY its allowed
 * keys given the applicability flags — base keys always, `cap_tag` iff a cap
 * applies, `provenance_marker` iff provenance applies — and NONE of the
 * forbidden keys. Throws on any mismatch.
 */
export function assertBoardProjectionKeySet(
  p: BoardProjection,
  applies: ProjectionApplicability
): void {
  const expected = new Set<string>(BOARD_PROJECTION_BASE_KEYS);
  if (applies.cap) expected.add('cap_tag');
  if (applies.provenance) expected.add('provenance_marker');

  const actual = Object.keys(p);

  for (const k of actual) {
    if (!expected.has(k)) {
      throw new Error(
        `V1-6a board projection carries an unexpected key "${k}" ` +
        `(allowed for this row: ${[...expected].sort().join(', ')}).`
      );
    }
  }
  for (const k of expected) {
    if (!actual.includes(k)) {
      throw new Error(`V1-6a board projection is MISSING required key "${k}".`);
    }
  }
  // Defence in depth: forbidden keys must never appear regardless of the set math.
  for (const forbidden of BOARD_PROJECTION_FORBIDDEN_KEYS) {
    if (Object.prototype.hasOwnProperty.call(p, forbidden)) {
      throw new Error(`V1-6a board projection carries FORBIDDEN key "${forbidden}".`);
    }
  }
  // Conditional correctness: an optional key present without applicability, or
  // absent despite applicability, is a leak/omission bug.
  if (applies.cap !== Object.prototype.hasOwnProperty.call(p, 'cap_tag')) {
    throw new Error('V1-6a board projection cap_tag presence disagrees with applicability.');
  }
  if (applies.provenance !== Object.prototype.hasOwnProperty.call(p, 'provenance_marker')) {
    throw new Error('V1-6a board projection provenance_marker presence disagrees with applicability.');
  }
}

// V1-A1-4 Explanation Templates — reason-code vocabulary (verbatim §E).
//
// Authority: docs/product/EVIDENCE_PROFILE_METHOD_V1.md §E.1 (closed
// vocabulary). Every translation string in this file is the authority's
// exact words — never paraphrased, never shortened, never "improved."
// If a translation reads awkwardly when composed with another, the finding
// is reported in the ticket report; it is NOT rewritten here.
//
// The `EvidenceReasonCode` enum values are lowercase snake_case per
// src/shared/enums.ts; the §E table names them in SCREAMING_SNAKE. Both
// forms refer to the same reason; the enum is the operative key.
//
// `abnormal_dispersion` is RESERVED per DR-27 / §I.3. Its translation is
// deliberately empty and the composer throws when asked to render it
// (mirror of the reasons.ts guard in Phase A).

import type { EvidenceReasonCode } from '../shared/enums.js';

/**
 * The authority's §E.1 user-facing translation for each reason code.
 * Strings copied verbatim from `docs/product/EVIDENCE_PROFILE_METHOD_V1.md`
 * §E.1 table, "User-facing translation" column.
 */
export const REASON_TRANSLATIONS: Readonly<Record<EvidenceReasonCode, string>> = Object.freeze({
  // -- Support (§E.1) --
  window_agreement_support:
    'Recent and longer-window results point in the same direction.',
  favorable_consensus_difference:
    'The selected line is more favorable than sportsbook consensus for this direction.',
  positive_margin_support:
    'Recent average and/or median margin support this direction.',

  // -- Contradiction (§E.1) --
  unfavorable_consensus_difference:
    'The selected line is less favorable than sportsbook consensus for this direction.',
  negative_margin_support:
    'Margin evidence works against this direction.',
  margin_measures_disagree:
    'Recent average and median results fall on opposite sides of the selected line.',
  market_disagrees_with_history:
    'Current market context points in a different direction from the historical results.',
  windows_disagree:
    'Recent and longer-window evidence point in different directions.',

  // -- Quality / coverage (§E.1) --
  stale_current_market:
    'The current market snapshot is stale. Line and price context may not reflect the current market.',
  insufficient_book_coverage:
    'Fewer than 3 eligible sportsbooks offer this market. Cross-book confirmation is limited.',
  push_heavy_sample:
    'A large share of recent games landed exactly on the line. Direction is less clear.',
  one_sided_offering:
    "Only one side is offered across eligible sportsbooks. Cross-side comparison isn't available.",
  source_unavailable:
    'The availability feed is currently unavailable. Availability context is limited.',
  insufficient_l10_sample:
    'Fewer than 5 eligible recent games. Sample is too small to grade evidence.',
  incomplete_historical_coverage:
    'Historical coverage is incomplete for this player. Longer-term evidence limited.',
  unresolved_player_mapping:
    'Player identity is under review. Evidence cannot be graded yet.',
  unresolved_event_mapping:
    'Game identity is under review. Evidence cannot be graded yet.',
  no_current_market:
    'No current market is available. Evidence cannot be graded.',
  postponed_game:
    'Game postponed. Evidence not applicable to this scheduled slot.',
  canceled_game: 'Game canceled.',
  no_unique_consensus_line:
    'Eligible sportsbooks are evenly split on this line, so no single consensus line can be established.',

  // -- RESERVED (§I.3 clause 2) --
  // ABNORMAL_DISPERSION is RESERVED in evidence_method_v1. No user-facing
  // translation is emitted; the composer throws if a profile carries this
  // code. Empty string is a marker, NEVER a fallback that gets rendered.
  abnormal_dispersion: '',
});

/**
 * Translation lookup. Throws when the code is reserved (never emitted in
 * `evidence_method_v1`) — mirrors src/evidence/reasons.ts's guard for
 * defense-in-depth.
 */
export function translateReasonCode(code: EvidenceReasonCode): string {
  if (code === 'abnormal_dispersion') {
    throw new Error(
      `explanation/vocabulary: abnormal_dispersion is RESERVED in evidence_method_v1 ` +
      `(§I.3 clause 2) and MUST NOT be rendered. Activation requires DR-24 + regression fixtures.`
    );
  }
  const translation = REASON_TRANSLATIONS[code];
  if (translation === '') {
    // Defense-in-depth: any code whose translation is empty is treated as
    // a coding error rather than a silent fallback.
    throw new Error(
      `explanation/vocabulary: reason code "${code}" has no translation.`
    );
  }
  return translation;
}

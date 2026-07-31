// V1-8b — DETERMINISTIC presentation translation for the Research View. Pure,
// testable, no LLM, no embellishment, no invented causation. Every mapping is a
// static lookup from an already-emitted internal value to approved plain language.
// An UNKNOWN internal value NEVER leaks: it renders a safe typed fallback.
//
// This module changes NO evidence semantics — it only renames values for display.

export const SAFE_FALLBACK = 'Technical detail unavailable';

// --- markets (consumer-facing) — reused rule from the Board (V1-8a3) ---
export function marketLabel(market_key: string): string {
  switch (market_key) {
    case 'player_points': return 'Points';
    case 'player_rebounds': return 'Rebounds';
    case 'player_assists': return 'Assists';
    case 'player_threes': return '3-Pointers';
    default: return SAFE_FALLBACK;
  }
}

// --- the finding summary (R2): a quiet factual direction, from the classification.
//     Strength / cap distinctions are carried by the Finding Mark, not this copy. ---
export function findingSummary(classification: string): string {
  switch (classification) {
    case 'strong_over_evidence':
    case 'moderate_over_evidence': return 'Evidence leans over';
    case 'strong_under_evidence':
    case 'moderate_under_evidence': return 'Evidence leans under';
    case 'mixed_evidence': return 'Evidence is mixed';
    case 'insufficient_evidence': return 'Insufficient evidence';
    case 'unavailable': return 'Evidence unavailable';
    default: return SAFE_FALLBACK;
  }
}

// --- market-context enums → plain language (R7) ---
export function selectionMethodLabel(m: string): string {
  switch (m) {
    case 'single_book': return 'from a single book';
    case 'unique_modal': return 'the most common line';
    case 'tied_no_unique_mode': return 'no single most-common line';
    case 'no_eligible_source': return 'no eligible source';
    default: return SAFE_FALLBACK;
  }
}
export function consensusCoverageLabel(c: string): string {
  switch (c) {
    case 'complete': return 'across the full book set';
    case 'single_book': return 'from one book';
    case 'unresolved_consensus': return 'no settled consensus';
    case 'no_line': return 'no line observed';
    default: return SAFE_FALLBACK;
  }
}
export function oneSidedLabel(o: string | null): string {
  switch (o) {
    case 'over_only': return 'only the over side was offered';
    case 'under_only': return 'only the under side was offered';
    case 'neither': return 'both sides offered';
    case null: return 'both sides offered';
    default: return SAFE_FALLBACK;
  }
}
/** Line movement in plain language, from the persisted net point movement. */
export function movementLabel(net_point_movement: number | null): string {
  if (net_point_movement === null) return 'not observed';
  if (net_point_movement === 0) return 'none observed';
  const dir = net_point_movement > 0 ? 'up' : 'down';
  return `${dir} ${Math.abs(net_point_movement)}`;
}

// --- reasons → plain language (R8). Every currently-emitted code is mapped; an
//     unknown code renders SAFE_FALLBACK (never the raw code). Factual only. ---
const REASON_TEXT: Record<string, string> = {
  window_agreement_support: 'Recent windows point in the same direction.',
  favorable_consensus_difference: 'The evaluated line sits favorably versus recent history.',
  positive_margin_support: 'Recent results cleared the line.',
  unfavorable_consensus_difference: 'The evaluated line sits unfavorably versus recent history.',
  negative_margin_support: 'Recent results fell short of the line.',
  margin_measures_disagree: 'Different margin measures point in different directions.',
  market_disagrees_with_history: 'The current market differs from the historical pattern.',
  windows_disagree: 'The evidence windows point in different directions.',
  stale_current_market: 'The current market reading is stale.',
  insufficient_book_coverage: 'The available evidence is limited by book coverage.',
  push_heavy_sample: 'Many recent games landed on the line.',
  one_sided_offering: 'Only one side of the market was observed.',
  source_unavailable: 'No current market source was available.',
  insufficient_l10_sample: 'There are too few recent eligible games.',
  incomplete_historical_coverage: 'The historical record is incomplete.',
  unresolved_player_mapping: 'The player could not be matched to the market.',
  unresolved_event_mapping: 'The game could not be matched to the market.',
  no_current_market: 'No current market line was available.',
  postponed_game: 'The game is postponed.',
  canceled_game: 'The game is canceled.',
  abnormal_dispersion: 'The market showed an unusual spread across books.',
  no_unique_consensus_line: 'No single consensus line could be determined.',
};
export function reasonLabel(reason_code: string): string {
  return REASON_TEXT[reason_code] ?? SAFE_FALLBACK;
}

// --- per-game display status (R6) → plain language ---
export function displayStatusLabel(s: string): string {
  switch (s) {
    case 'eligible': return 'Counted';
    case 'did_not_play': return 'Did not play';
    case 'ineligible': return 'Ineligible';
    default: return SAFE_FALLBACK;
  }
}
// --- window span (R3/R4): the display-membership rule applied to the research
//     series — from the Nth-most-recent COUNTED entry through the most recent,
//     inclusive of interleaved ineligible positions. No computation, no sampling. ---
export function windowSpan<T extends { counted: boolean }>(series: ReadonlyArray<T>, eligible_n: number): ReadonlyArray<T> {
  if (eligible_n <= 0) return [];
  let seen = 0;
  let start = series.length;
  for (let i = series.length - 1; i >= 0; i -= 1) {
    start = i;
    if (series[i]!.counted) { seen += 1; if (seen === eligible_n) break; }
  }
  return series.slice(start);
}

export function outcomeLabel(o: string | null): string {
  switch (o) {
    case 'above': return 'Above line';
    case 'below': return 'Below line';
    case 'equal': return 'On line';
    case null: return '—';
    default: return SAFE_FALLBACK;
  }
}

// Current / historical isolation predicate.
//
// Authority:
//   Complete spec §11.4 (historical_query is structurally isolated from current)
//   Odds sub-spec §16.1 (current snapshot: request_kind=current_poll AND
//     provenance=self_observed)
//   Ticket V1-4 hard invariant: every current-selection, first-observed, and
//     movement computation reads ONLY rows with request_kind=current_poll AND
//     provenance=self_observed. Rows marked historical_query/backfilled_historical
//     are structurally excluded (enforced in query predicates AND covered by
//     the "historical record excluded from current selection" test).
//
// This module is the single canonical predicate. Every SQL fragment that
// selects from `market_snapshots` or its descendants MUST use this string.

/**
 * SQL WHERE-clause fragment. Callers concatenate it into their query and
 * pass parameters starting at `param_offset`. The fragment declares no
 * placeholders itself — it is a pure string constant.
 */
export const CURRENT_ONLY_WHERE_CLAUSE =
  `request_kind = 'current_poll' AND provenance = 'self_observed'`;

/**
 * TypeScript predicate mirroring the SQL clause. Used by fixture-pure unit
 * tests and by any in-memory selection that mirrors the SQL side.
 */
export function isCurrentSelfObserved(row: {
  readonly request_kind: string;
  readonly provenance: string;
}): boolean {
  return row.request_kind === 'current_poll' && row.provenance === 'self_observed';
}

/**
 * Negative predicate: identifies rows that MUST be excluded from every
 * current / first-observed / movement path.
 */
export function isHistoricalOrBackfilled(row: {
  readonly request_kind: string;
  readonly provenance: string;
}): boolean {
  return row.request_kind === 'historical_query' ||
    row.provenance === 'backfilled_historical';
}

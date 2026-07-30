// V1-8a3 — PURE board filter logic (client-safe, testable). No evidence data,
// no computation: it decides row VISIBILITY from allowlisted DISPLAY meta only
// (player name, market bucket, direction bucket). DR-20 order is preserved by
// the caller applying this as a filter over the already-ranked array.

import type { MarketBucket, DirectionBucket } from './bandView.js';

/** The allowlisted per-row meta the client filter reads — NEVER series/score/id. */
export interface RowFilterMeta {
  readonly player: string;
  readonly marketBucket: MarketBucket;
  readonly direction: DirectionBucket;
}

export interface BoardFilterState {
  readonly market: 'all' | MarketBucket;
  readonly direction: 'all' | 'over' | 'under';
  readonly search: string;
}

export const DEFAULT_FILTER: BoardFilterState = Object.freeze({ market: 'all', direction: 'all', search: '' });

/** The consumer-facing market filter options (labels + buckets). No internal keys. */
export const MARKET_FILTERS: ReadonlyArray<{ label: string; value: 'all' | MarketBucket }> = [
  { label: 'All', value: 'all' },
  { label: 'Points', value: 'points' },
  { label: 'Rebounds', value: 'rebounds' },
  { label: 'Assists', value: 'assists' },
  { label: '3-Pointers', value: 'threes' },
];
export const DIRECTION_FILTERS: ReadonlyArray<{ label: string; value: 'all' | 'over' | 'under' }> = [
  { label: 'All', value: 'all' },
  { label: 'Over', value: 'over' },
  { label: 'Under', value: 'under' },
];

export function matchesFilters(m: RowFilterMeta, f: BoardFilterState): boolean {
  if (f.market !== 'all' && m.marketBucket !== f.market) return false;
  if (f.direction !== 'all' && m.direction !== f.direction) return false;
  const q = f.search.trim().toLowerCase();
  if (q !== '' && !m.player.toLowerCase().includes(q)) return false;
  return true;
}

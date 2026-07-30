'use client';
// V1-8a3 — the ONLY client component on the Board. It controls FILTER state
// (market · direction · player search) and toggles ROW VISIBILITY. It receives
// each row as a PRE-RENDERED SERVER NODE plus allowlisted DISPLAY meta only
// (player name, market bucket, direction bucket) — never band/series data,
// never internal_game_id/line_observed_at/score. No evidence computation runs
// here; DR-20 order is preserved (items arrive ranked; visibility is toggled,
// never reordered). Per-row evidence-cell selection is pure CSS (no JS here).

import { useState } from 'react';
import type { ReactNode } from 'react';
import { PREVIEW_HUES } from '../../src/lib/previewVariantStyle';
import {
  matchesFilters, MARKET_FILTERS, DIRECTION_FILTERS, DEFAULT_FILTER,
  type BoardFilterState, type RowFilterMeta,
} from '../../src/lib/board/filter';

const H = PREVIEW_HUES;

export interface BoardControlItem {
  readonly key: string;
  readonly meta: RowFilterMeta;
  readonly node: ReactNode;
}

function chip(active: boolean): React.CSSProperties {
  return {
    padding: '6px 11px', borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: 'pointer',
    border: `1px solid ${active ? H.over : H.border}`,
    background: active ? H.over : 'transparent',
    color: active ? H.bg : H.quiet, whiteSpace: 'nowrap',
  };
}

export function BoardControls({ items }: { items: ReadonlyArray<BoardControlItem> }): React.ReactElement {
  const [filter, setFilter] = useState<BoardFilterState>(DEFAULT_FILTER);
  const visibleCount = items.reduce((n, it) => n + (matchesFilters(it.meta, filter) ? 1 : 0), 0);

  return (
    <div>
      <div data-testid="board-controls" style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
        <input
          type="search"
          data-testid="player-search"
          value={filter.search}
          onChange={(e) => setFilter((f) => ({ ...f, search: e.target.value }))}
          placeholder="Search players"
          aria-label="Search players"
          style={{
            width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 10,
            border: `1px solid ${H.border}`, background: H.panel, color: H.text, fontSize: 14,
          }}
        />
        <div role="group" aria-label="Market filter" style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
          {MARKET_FILTERS.map((m) => (
            <button key={m.value} type="button" data-testid={`market-${m.value}`}
              aria-pressed={filter.market === m.value}
              onClick={() => setFilter((f) => ({ ...f, market: m.value }))}
              style={chip(filter.market === m.value)}>{m.label}</button>
          ))}
        </div>
        {/* R2-8: compact SEGMENTED direction control (All | Over | Under). */}
        <div role="group" aria-label="Direction filter" style={{ display: 'inline-flex', alignSelf: 'flex-start', border: `1px solid ${H.border}`, borderRadius: 999, overflow: 'hidden' }}>
          {DIRECTION_FILTERS.map((d, i) => {
            const on = filter.direction === d.value;
            return (
              <button key={d.value} type="button" data-testid={`direction-${d.value}`}
                aria-pressed={on}
                onClick={() => setFilter((f) => ({ ...f, direction: d.value }))}
                style={{ padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', border: 'none', borderLeft: i === 0 ? 'none' : `1px solid ${H.border}`, background: on ? H.over : 'transparent', color: on ? H.bg : H.quiet }}>
                {d.label}
              </button>
            );
          })}
        </div>
      </div>

      <div data-testid="board-rows" data-row-count={items.length} data-visible-count={visibleCount}>
        {items.map((it) => {
          const show = matchesFilters(it.meta, filter);
          // Hide (not unmount) so per-row CSS cell-selection state survives
          // filter changes; DR-20 order is the array order, unchanged.
          return <div key={it.key} style={show ? undefined : { display: 'none' }}>{it.node}</div>;
        })}
        {visibleCount === 0 ? (
          <p data-testid="no-matches" style={{ color: H.quiet, fontSize: 13, padding: '8px 2px' }}>
            No profiles match these filters.
          </p>
        ) : null}
      </div>
    </div>
  );
}

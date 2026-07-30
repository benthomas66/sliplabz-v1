// V1-8a2 / V1-8a3 (R1 + R2) — the mobile Props Board surface. SERVER COMPONENTS
// ONLY (the sole client component is BoardControls, filters). The eight-cell
// evidence selector + one detail panel are driven by PURE CSS radios (L10
// default); all eight panels render server-side, so the series payload never
// crosses the client boundary. R2 polish: compact header disclosure + collapsible
// help, matchup + human tipoff (R2-3), market/line primary with a quieter
// direction, a FLAT instrument-panel selector, explicitly-labelled panels, an
// explicit "Open full research" action, tighter metadata, and intentional
// L20/SZN Strip scrolling. Colours ONLY from the committed PREVIEW_HUES.

import Link from 'next/link';
import type { CSSProperties } from 'react';
import { PREVIEW_HUES, pillKindForLabel, capChipStyle } from '../../src/lib/previewVariantStyle';
import type { BoardBand, WindowCell, SeriesCell } from '../../src/lib/boardProjection';
import type { BoardRow as BoardRowData } from '../../src/lib/server/boardService';
import {
  cellGlyph, cellStyle, stripSpan, freshnessView, fallbackAvatar,
  marketLabel, consolidatedMeta,
} from '../../src/lib/board/bandView';

const H = PREVIEW_HUES;
const CELLS = ['L5', 'L10', 'L20', 'H2H', 'STRK', 'AVG', 'DIFF', 'SZN'] as const;
type Cell = (typeof CELLS)[number];
const PANEL_HEADING: Record<Cell, string> = {
  L5: 'Last 5 eligible games', L10: 'Last 10 eligible games', L20: 'Last 20 eligible games',
  SZN: 'Season evidence', STRK: 'Current streak', AVG: 'Average value', DIFF: 'Difference from line', H2H: 'Head-to-head',
};

function fmtNum(n: number | null): string { return n === null ? '—' : String(Number(n.toFixed(2))); }
function fmtStreak(dir: 'above' | 'below' | 'equal' | null, len: number | null): string {
  if (dir === null || len === null || len === 0) return '—';
  return `${len} ${dir}`;
}

// FINDING MARK (§2.1): discrete filled/outlined + cap notch. Never a number.
function FindingMark({ label, capped }: { label: string; capped: boolean }): React.ReactElement {
  const kind = pillKindForLabel(label);
  const filled = kind === 'over' || kind === 'under';
  const hue = kind === 'over' ? H.over : kind === 'under' ? H.under : H.neutral;
  return (
    <span data-testid="finding-mark" aria-label={`finding: ${label}`} style={{ display: 'inline-flex', alignItems: 'center' }}>
      <span style={{ width: 10, height: 10, borderRadius: 2, boxSizing: 'border-box', background: filled ? hue : 'transparent', border: `2px solid ${hue}`, boxShadow: capped ? `inset -3px -3px 0 0 ${H.bg}` : 'none' }} />
    </span>
  );
}

// R2-9 — the FULL authorized Strip in the panel, oldest→newest, single-row with
// INTENTIONAL horizontal scrolling (edge fade; no prominent scrollbar). Complete
// span preserved incl. interleaved ghost positions — no grouping/sampling.
function FullStrip({ w, series }: { w: WindowCell; series: ReadonlyArray<SeriesCell> }): React.ReactElement {
  const span = stripSpan(series, w.sample.eligible_n);
  return (
    <div>
      <div style={{ position: 'relative' }}>
        <div className="strip-scroll" data-testid="detail-strip" style={{ display: 'flex', flexWrap: 'nowrap', gap: 3, overflowX: 'auto', alignItems: 'center', paddingBottom: 2 }}>
          {span.length === 0
            ? <span style={{ fontSize: 12, color: H.quiet }}>No eligible observations</span>
            : span.map((c) => (
                <span key={c.ordinal} data-kind={c.position_kind} style={{ ...(cellStyle(cellGlyph(c)) as CSSProperties), width: 14, height: 14, flex: '0 0 auto' }} />
              ))}
        </div>
        {span.length > 12 ? <div aria-hidden style={{ position: 'absolute', top: 0, right: 0, bottom: 2, width: 20, pointerEvents: 'none', background: `linear-gradient(to right, transparent, ${H.panel})` }} /> : null}
      </div>
      <div style={{ marginTop: 6, fontSize: 13, color: H.text }}>
        <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{w.compact_counts}</span>
        <span style={{ color: H.quiet, marginLeft: 8, fontSize: 12 }}>{w.sample.eligible_n} eligible · {w.sample.coverage}</span>
        {span.length > 12 ? <span style={{ color: H.quiet, marginLeft: 8, fontSize: 11 }}>· scroll for older →</span> : null}
      </div>
    </div>
  );
}

// R2-6 — the selected detail panel, with an EXPLICIT heading naming what it shows.
function DetailPanel({ cell, band }: { cell: Cell; band: Extract<BoardBand, { status: 'available' }> }): React.ReactElement {
  const w = band.windows; const l10 = w.L10;
  const line = band.series.length > 0 ? band.series[band.series.length - 1]!.evaluated_line : null;
  let body: React.ReactElement;
  switch (cell) {
    case 'L5': body = <FullStrip w={w.L5} series={band.series} />; break;
    case 'L10': body = <FullStrip w={w.L10} series={band.series} />; break;
    case 'L20': body = <FullStrip w={w.L20} series={band.series} />; break;
    case 'SZN': body = <FullStrip w={w.season} series={band.series} />; break;
    case 'STRK': body = <div style={{ fontSize: 14, color: H.text }}><b>{fmtStreak(l10.streak.direction, l10.streak.length)}</b><div style={{ fontSize: 11, color: H.quiet, marginTop: 3 }}>over the last 10 eligible games</div></div>; break;
    case 'AVG': body = <div style={{ fontSize: 14, color: H.text }}><b style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtNum(l10.average)}</b><div style={{ fontSize: 11, color: H.quiet, marginTop: 3 }}>evaluated line {line === null ? '—' : line} · last 10 eligible</div></div>; break;
    case 'DIFF': body = <div style={{ fontSize: 14, color: H.text }}><b style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtNum(l10.difference)}</b><div style={{ fontSize: 11, color: H.quiet, marginTop: 3 }}>persisted factual difference · last 10 eligible</div></div>; break;
    case 'H2H': body = <div data-testid="h2h-unavailable" style={{ fontSize: 13, color: H.quiet, fontStyle: 'italic' }}>Head-to-head evidence is not yet available.</div>; break;
  }
  return (
    <div>
      <div data-testid={`panel-heading-${cell}`} style={{ fontSize: 11, fontWeight: 700, color: H.text, letterSpacing: 0.2, marginBottom: 6 }}>{PANEL_HEADING[cell]}</div>
      {body}
    </div>
  );
}

function cellDominant(cell: Cell, band: Extract<BoardBand, { status: 'available' }>): string {
  const w = band.windows; const l10 = w.L10;
  switch (cell) {
    case 'L5': return w.L5.compact_counts;
    case 'L10': return w.L10.compact_counts;
    case 'L20': return w.L20.compact_counts;
    case 'SZN': return w.season.compact_counts;
    case 'H2H': return '—';
    case 'STRK': return fmtStreak(l10.streak.direction, l10.streak.length);
    case 'AVG': return fmtNum(l10.average);
    case 'DIFF': return fmtNum(l10.difference);
  }
}

// R2-5 — the FLAT eight-cell instrument panel + one detail panel (CSS radios).
function EvidenceSelector({ rowId, band }: { rowId: string; band: BoardBand }): React.ReactElement {
  if (band.status !== 'available') {
    return <div data-testid="band-unavailable" style={{ fontSize: 12, color: H.quiet, padding: '8px 0' }}>Window evidence not available for this profile.</div>;
  }
  return (
    <div className="evc" data-testid="evidence-selector">
      {CELLS.map((cell) => (
        <input key={cell} type="radio" name={`ev-${rowId}`} id={`ev-${rowId}-${cell}`} className={`evc-radio r-${cell}`} defaultChecked={cell === 'L10'} />
      ))}
      <div className="evc-grid" role="tablist" aria-label="Evidence windows">
        {CELLS.map((cell) => (
          <label key={cell} htmlFor={`ev-${rowId}-${cell}`} className={`evc-cell c-${cell}`} data-cell={cell} data-testid={`cell-${cell}`}>
            <span className="evc-label">{cell}</span>
            <span className="evc-value">{cellDominant(cell, band)}</span>
          </label>
        ))}
      </div>
      <div className="evc-panels">
        {CELLS.map((cell) => (
          <div key={cell} className={`evc-panel p-${cell}`} data-testid={`panel-${cell}`} role="tabpanel">
            <DetailPanel cell={cell} band={band} />
          </div>
        ))}
      </div>
    </div>
  );
}

// THE ROW — non-navigational card (R2-7). Cells select; the explicit "Open full
// research" action navigates, so selection and navigation never conflict.
export function BoardRow({ row, rowId }: { row: BoardRowData; rowId: string }): React.ReactElement {
  const p = row.projection;
  const capped = p.cap_tag !== undefined;
  const dirKind = pillKindForLabel(p.classification_label);
  const dirHue = dirKind === 'over' ? H.over : dirKind === 'under' ? H.under : H.neutral;
  const fresh = p.band.status === 'available' ? freshnessView(p.band.freshness.state, p.band.freshness.display_age_seconds) : null;
  const meta = p.band.status === 'available'
    ? consolidatedMeta(fresh, p.band.consensus.book_count, p.band.windows.season.sample.eligible_n)
    : '';
  return (
    <div className="board-row" data-testid="board-row" style={rowStyle}>
      {/* 1 identity + game context */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <Avatar player={p.player} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <FindingMark label={p.classification_label} capped={capped || p.provenance_marker !== undefined} />
            <span style={{ fontWeight: 700, fontSize: 16, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.player}</span>
          </div>
          {p.game !== undefined ? (
            <div data-testid="row-matchup" style={{ fontSize: 11.5, color: H.quiet, marginTop: 1 }}>{p.game.matchup} · {p.game.tipoff}</div>
          ) : null}
        </div>
      </div>

      {/* 2 market + line PRIMARY · 3 direction SECONDARY (quieter) — R2-4 */}
      <div style={{ marginTop: 8 }}>
        <div data-testid="row-market" style={{ fontSize: 17, fontWeight: 800, color: H.text, fontVariantNumeric: 'tabular-nums' }}>
          {marketLabel(p.market)} {p.evaluated_line === null ? '—' : p.evaluated_line}
        </div>
        <div data-testid="row-direction" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 3, fontSize: 12, color: dirHue, fontWeight: 600 }}>
          <span style={{ width: 7, height: 7, borderRadius: 2, background: dirKind === 'over' || dirKind === 'under' ? dirHue : 'transparent', border: `1.5px solid ${dirHue}` }} />
          {p.classification_label}
          {p.cap_tag !== undefined ? <span data-testid="cap-tag" style={capChipStyle() as CSSProperties}>{p.cap_tag}</span> : null}
        </div>
      </div>

      {/* 4 selected evidence window */}
      <div style={{ marginTop: 10 }}><EvidenceSelector rowId={rowId} band={p.band} /></div>

      {/* 5 freshness + coverage (one line) · quieter provenance — R2-10 */}
      {meta !== '' ? <div data-testid="row-meta" style={{ fontSize: 11, color: H.quiet, marginTop: 8 }}>{meta}</div> : null}
      {p.provenance_marker !== undefined ? (
        <div data-testid="provenance-badge" style={{ fontSize: 10, color: H.quiet, opacity: 0.85, marginTop: 3 }}>{p.provenance_marker}</div>
      ) : null}

      {/* 6 explicit path to Research — R2-7 (the ONLY navigational control) */}
      <Link href={row.research_href} className="open-research" data-testid="open-research" style={openResearchStyle}>
        <span>Open full research</span>
        <span aria-hidden style={{ fontSize: 18 }}>›</span>
      </Link>
    </div>
  );
}

function Avatar({ player }: { player: string }): React.ReactElement {
  const fb = fallbackAvatar(player);
  return (
    <div data-testid="avatar-fallback" aria-hidden style={{ width: 38, height: 38, borderRadius: 8, flex: '0 0 auto', background: fb.background, color: H.text, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14, border: `1px solid ${H.border}` }}>{fb.initials}</div>
  );
}

// ---------------------------------------------------------------------------
// R2-1 compact disclosure + R2-2 collapsible help (server-rendered <details>).
// ---------------------------------------------------------------------------
export function BoardDisclosure(): React.ReactElement {
  return (
    <div style={{ marginBottom: 10 }}>
      <p data-testid="board-disclosure-g1" style={{ fontSize: 11.5, color: H.quiet, margin: '0 0 6px' }}>
        Historical evidence and market context — not a predicted probability.
      </p>
      <details data-testid="board-help" style={{ fontSize: 12, color: H.quiet }}>
        <summary style={{ cursor: 'pointer', color: H.text, fontWeight: 600, listStyle: 'none' }}>How to read the Board</summary>
        <div style={{ marginTop: 8, lineHeight: 1.5, display: 'flex', flexDirection: 'column', gap: 5 }}>
          <Legend glyph="filled" label="Filled (azure) — above the evaluated line" />
          <Legend glyph="hollow" label="Outlined (violet) — below the evaluated line" />
          <Legend glyph="dash" label="Slate dash — on the line" />
          <Legend glyph="ghost" label="Dashed ghost — did not play / ineligible; keeps its chronological position" />
          <span style={{ marginTop: 4 }}>Counts exclude ineligible positions. The Board presents historical evidence, not a predicted probability.</span>
        </div>
      </details>
    </div>
  );
}
function Legend({ glyph, label }: { glyph: 'filled' | 'hollow' | 'dash' | 'ghost'; label: string }): React.ReactElement {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span style={{ ...(cellStyle(glyph) as CSSProperties), width: 11, height: 11, flex: '0 0 auto' }} />{label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// CHROME + CSS
// ---------------------------------------------------------------------------
const BOARD_CSS = `
.board-row-head:active, .open-research:active { background: ${H.panelHover}; }
.strip-scroll::-webkit-scrollbar { height: 0; }
.strip-scroll { scrollbar-width: none; }
.evc-radio { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
.evc-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1px; background: ${H.border}; border: 1px solid ${H.border}; border-radius: 8px; overflow: hidden; }
.evc-cell { display: flex; flex-direction: column; align-items: flex-start; justify-content: center; gap: 1px; min-height: 46px; padding: 6px 8px; background: ${H.bg}; cursor: pointer; }
.evc-cell .evc-label { font-size: 9.5px; font-weight: 700; letter-spacing: 0.4px; color: ${H.quiet}; }
.evc-cell .evc-value { font-size: 15px; font-weight: 700; color: ${H.text}; font-variant-numeric: tabular-nums; }
.evc-panel { display: none; }
.evc-panels { margin-top: 8px; background: ${H.bg}; border: 1px solid ${H.border}; border-radius: 8px; padding: 10px; }
.evc-panels:empty { display: none; }
${CELLS.map((c) => `.evc-radio.r-${c}:checked ~ .evc-panels .p-${c} { display: block; }`).join('\n')}
${CELLS.map((c) => `.evc-radio.r-${c}:checked ~ .evc-grid .c-${c} { background: ${H.panelHover}; box-shadow: inset 0 -3px 0 ${H.over}; }`).join('\n')}
${CELLS.map((c) => `.evc-radio.r-${c}:checked ~ .evc-grid .c-${c} .evc-value { color: ${H.text}; }`).join('\n')}
${CELLS.map((c) => `.evc-radio.r-${c}:focus-visible ~ .evc-grid .c-${c} { outline: 2px solid ${H.over}; outline-offset: -2px; }`).join('\n')}
`;

export function BoardChrome({ children, title = 'Board', subtitle = 'WNBA player props', active = 'Board' }: { children: React.ReactNode; title?: string; subtitle?: string; active?: 'Board' | 'Players' | 'Methodology' }): React.ReactElement {
  return (
    <div style={{ minHeight: '100vh', background: H.bg, color: H.text, maxWidth: 480, margin: '0 auto', paddingBottom: 60 }}>
      <style>{BOARD_CSS}</style>
      <header style={{ position: 'sticky', top: 0, zIndex: 2, background: H.bg, borderBottom: `1px solid ${H.border}`, padding: '10px 14px' }}>
        <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: 0.3 }}>{title}</div>
        <div style={{ fontSize: 11, color: H.quiet }}>{subtitle}</div>
      </header>
      <main style={{ padding: '10px 12px' }}>{children}</main>
      <BottomNav active={active} />
    </div>
  );
}

function BottomNav({ active }: { active: 'Board' | 'Players' | 'Methodology' }): React.ReactElement {
  const items: ReadonlyArray<{ label: 'Board' | 'Players' | 'Methodology'; href: string }> = [
    { label: 'Board', href: '/board' }, { label: 'Players', href: '/players' }, { label: 'Methodology', href: '/methodology' },
  ];
  return (
    <nav style={{ position: 'fixed', bottom: 0, left: 0, right: 0, maxWidth: 480, margin: '0 auto', background: H.panel, borderTop: `1px solid ${H.border}`, display: 'flex' }}>
      {items.map((it) => {
        const on = it.label === active;
        return (
          <Link key={it.label} href={it.href} data-testid="nav-item" aria-current={on ? 'page' : undefined}
            style={{ flex: 1, textAlign: 'center', padding: '11px 0', fontSize: 12, fontWeight: on ? 700 : 500, color: on ? H.text : H.quiet, textDecoration: 'none' }}>
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function BoardSkeleton(): React.ReactElement {
  return (
    <div data-testid="board-skeleton" aria-hidden>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} style={{ ...rowStyle }}>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ width: 38, height: 38, borderRadius: 8, background: H.border }} />
            <div style={{ flex: 1 }}>
              <div style={{ height: 14, width: '55%', background: H.border, borderRadius: 4 }} />
              <div style={{ height: 11, width: '40%', background: H.border, borderRadius: 4, marginTop: 6 }} />
            </div>
          </div>
          <div style={{ height: 84, background: H.border, borderRadius: 8, marginTop: 10, opacity: 0.55 }} />
        </div>
      ))}
    </div>
  );
}

export function LockedContinuation(): React.ReactElement {
  return (
    <section data-testid="locked-continuation" aria-hidden style={{ position: 'relative', marginTop: 16 }}>
      <div style={{ filter: 'blur(3px)', opacity: 0.5, pointerEvents: 'none', userSelect: 'none' }}>
        {[0, 1].map((i) => (
          <div key={i} style={{ ...rowStyle }}>
            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ width: 38, height: 38, borderRadius: 8, background: H.border }} />
              <div style={{ flex: 1 }}>
                <div style={{ height: 14, width: '50%', background: H.border, borderRadius: 4 }} />
                <div style={{ height: 52, background: H.border, borderRadius: 8, marginTop: 10 }} />
              </div>
            </div>
          </div>
        ))}
      </div>
      <div data-testid="lock-panel" style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, textAlign: 'center', padding: 16 }}>
        <span aria-hidden style={{ fontSize: 22 }}>🔒</span>
        <div style={{ fontSize: 13, color: H.text, fontWeight: 600 }}>More rows continue here</div>
        <button type="button" disabled data-testid="locked-cta" aria-disabled="true" style={{ padding: '8px 14px', borderRadius: 8, border: `1px solid ${H.border}`, background: H.panel, color: H.quiet, fontSize: 12, fontWeight: 600, cursor: 'not-allowed' }}>Membership coming later</button>
      </div>
    </section>
  );
}

const rowStyle: CSSProperties = { background: H.panel, border: `1px solid ${H.border}`, borderRadius: 12, padding: 12, marginBottom: 10, color: H.text };
const openResearchStyle: CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, padding: '11px 12px', minHeight: 44, boxSizing: 'border-box', borderRadius: 8, border: `1px solid ${H.border}`, background: H.bg, color: H.text, textDecoration: 'none', fontSize: 13, fontWeight: 600 };

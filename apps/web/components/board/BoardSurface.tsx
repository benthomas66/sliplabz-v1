// V1-8a2 — the mobile Props Board surface. SERVER COMPONENTS ONLY (no
// 'use client' anywhere in this tree): every Strip, badge, count, and the whole
// information band are rendered to HTML server-side, so the series payload NEVER
// crosses to a client component (GAP-21 closed by construction). Navigation is a
// server <Link>; the press state is pure CSS (:active, in globals.css); the §G.1
// disclosure is always present (never hover-only, Grammar §1).
//
// Colours come ONLY from the committed valence-neutral hue module
// (PREVIEW_HUES): azure=over · violet=under · slate=neutral/push/ineligible.
// No green/red, any theme (Grammar §5). Dark only.

import Link from 'next/link';
import type { CSSProperties } from 'react';
import { PREVIEW_HUES, pillKindForLabel, pillStyle, capChipStyle } from '../../src/lib/previewVariantStyle';
import type { BoardProjection, BoardBand, WindowCell, SeriesCell } from '../../src/lib/boardProjection';
import type { BoardRow as BoardRowData } from '../../src/lib/server/boardService';
import {
  cellGlyph, cellStyle, stripSpan, freshnessView, fallbackAvatar,
} from '../../src/lib/board/bandView';

const H = PREVIEW_HUES;

// ---------------------------------------------------------------------------
// FINDING MARK (§2.1): discrete states, filled/outlined strength, cap notch.
// Never a gradient, never a number, never sized by score.
// ---------------------------------------------------------------------------
function FindingMark({ label, capped }: { label: string; capped: boolean }): React.ReactElement {
  const kind = pillKindForLabel(label);
  const filled = kind === 'over' || kind === 'under';
  const hue = kind === 'over' ? H.over : kind === 'under' ? H.under : H.neutral;
  return (
    <span data-testid="finding-mark" aria-label={`finding: ${label}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <span style={{
        width: 12, height: 12, borderRadius: 3, boxSizing: 'border-box',
        background: filled ? hue : 'transparent',
        border: `2px solid ${hue}`,
        // cap notch: a small corner cut expressed as an inset shadow tick
        boxShadow: capped ? `inset -3px -3px 0 0 ${H.bg}` : 'none',
      }} />
    </span>
  );
}

// ---------------------------------------------------------------------------
// EVIDENCE STRIP (§2.2) + compact counts (§7) + Sample (§2.8), server-rendered.
// ---------------------------------------------------------------------------
function EvidenceStrip({ title, window: w, series }: { title: string; window: WindowCell; series: ReadonlyArray<SeriesCell> }): React.ReactElement {
  const span = stripSpan(series, w.sample.eligible_n);
  return (
    <div data-testid={`window-${title}`} data-window={title} style={windowCellStyle}>
      <div style={{ fontSize: 11, color: H.quiet, fontWeight: 700, letterSpacing: 0.4 }}>{title}</div>
      <div data-testid={`strip-${title}`} style={{ display: 'flex', gap: 2, marginTop: 4, minHeight: 13, alignItems: 'center' }}>
        {span.length === 0
          ? <span style={{ fontSize: 11, color: H.quiet }}>—</span>
          : span.map((c) => (
              <span key={c.ordinal} data-kind={c.position_kind} style={cellStyle(cellGlyph(c)) as CSSProperties} />
            ))}
      </div>
      <div style={{ marginTop: 4, fontSize: 12, color: H.text }}>
        {/* Grammar §7: A-B or A-B-P. Never %, slash, or "rate". */}
        <span data-testid={`counts-${title}`} style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{w.compact_counts}</span>
        <span data-testid={`eligible-${title}`} style={{ color: H.quiet, marginLeft: 6, fontSize: 11 }}>n={w.sample.eligible_n}</span>
      </div>
      <div style={{ fontSize: 10, color: H.quiet, marginTop: 1 }}>{w.sample.coverage}</div>
    </div>
  );
}

// STRK / AVG / DIFF — explicit factual values (persisted; never derived here).
function ScalarCell({ title, value, testid }: { title: string; value: string; testid: string }): React.ReactElement {
  return (
    <div style={windowCellStyle}>
      <div style={{ fontSize: 11, color: H.quiet, fontWeight: 700, letterSpacing: 0.4 }}>{title}</div>
      <div data-testid={testid} style={{ marginTop: 6, fontSize: 14, color: H.text, fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{value}</div>
    </div>
  );
}

function H2HCell(): React.ReactElement {
  // Authorized typed-unavailable state — not a number, not a blank cell.
  return (
    <div style={windowCellStyle}>
      <div style={{ fontSize: 11, color: H.quiet, fontWeight: 700, letterSpacing: 0.4 }}>H2H</div>
      <div data-testid="h2h-unavailable" style={{ marginTop: 6, fontSize: 11, color: H.quiet, fontStyle: 'italic' }}>not yet available</div>
    </div>
  );
}

function fmtNum(n: number | null): string { return n === null ? '—' : String(Number(n.toFixed(2))); }
function fmtStreak(dir: 'above' | 'below' | 'equal' | null, len: number | null): string {
  if (dir === null || len === null || len === 0) return '—';
  return `${len} ${dir}`;
}

// ---------------------------------------------------------------------------
// THE INFORMATION BAND — horizontal scroll container (§overflow at 390px).
// Order (Parity §1.3): L5 · L10 · L20 · H2H · STRK · AVG · DIFF · SZN.
// No field dropped/collapsed; scroll-snap + right-edge peek reveals more.
// ---------------------------------------------------------------------------
function InformationBand({ band }: { band: BoardBand }): React.ReactElement {
  if (band.status !== 'available') {
    return <div data-testid="band-unavailable" style={{ fontSize: 12, color: H.quiet, padding: '4px 0' }}>Window evidence not available for this profile.</div>;
  }
  const w = band.windows;
  // STRK/AVG/DIFF headline the L10 window (a representative recent window); every
  // window's persisted scalars are also present on its own cell above.
  const l10 = w.L10;
  return (
    <div style={{ position: 'relative' }}>
      <div data-testid="info-band" className="board-band-scroll" style={{
        display: 'flex', gap: 8, overflowX: 'auto', scrollSnapType: 'x proximity',
        paddingBottom: 4, WebkitOverflowScrolling: 'touch',
      }}>
        <EvidenceStrip title="L5" window={w.L5} series={band.series} />
        <EvidenceStrip title="L10" window={w.L10} series={band.series} />
        <EvidenceStrip title="L20" window={w.L20} series={band.series} />
        <H2HCell />
        <ScalarCell title="STRK" testid="strk" value={fmtStreak(l10.streak.direction, l10.streak.length)} />
        <ScalarCell title="AVG" testid="avg" value={fmtNum(l10.average)} />
        <ScalarCell title="DIFF" testid="diff" value={fmtNum(l10.difference)} />
        <EvidenceStrip title="SZN" window={w.season} series={band.series} />
      </div>
      {/* right-edge fade: signals there is more to the right (discovery affordance) */}
      <div aria-hidden style={{ position: 'absolute', top: 0, right: 0, bottom: 4, width: 24, pointerEvents: 'none', background: `linear-gradient(to right, transparent, ${H.panel})` }} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// CONSENSUS BAR (§2.4) micro form. No prices, no book logos, no promo.
// ---------------------------------------------------------------------------
function ConsensusBar({ band }: { band: BoardBand }): React.ReactElement | null {
  if (band.status !== 'available') return null;
  const c = band.consensus;
  return (
    <div data-testid="consensus-bar" style={{ marginTop: 6 }}>
      <div style={{ display: 'flex', height: 4, borderRadius: 2, overflow: 'hidden', background: H.border }}>
        {c.distribution.map((d) => (
          // flex-grow proportional to book count — NO percentage value anywhere.
          <span key={d.point} title={`${d.point}`} style={{ flexGrow: d.count, flexBasis: 0, background: H.neutral }} />
        ))}
      </div>
      <div style={{ fontSize: 10, color: H.quiet, marginTop: 2 }}>
        {c.min_point ?? '—'}–{c.max_point ?? '—'} · {c.book_count} book{c.book_count === 1 ? '' : 's'}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Badges — freshness (§2.6 state + elapsed, desaturating), provenance (§2.7),
// sample (§2.8). None hover-only.
// ---------------------------------------------------------------------------
function Badges({ p }: { p: BoardProjection }): React.ReactElement {
  const fresh = p.band.status === 'available' ? freshnessView(p.band.freshness.state, p.band.freshness.display_age_seconds) : null;
  const seasonSample = p.band.status === 'available' ? p.band.windows.season.sample : null;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
      {fresh !== null ? (
        <span data-testid="freshness-badge" style={{ ...badge, color: H.text, opacity: fresh.opacity }}>
          {fresh.label} · {fresh.elapsed}
        </span>
      ) : null}
      {p.provenance_marker !== undefined ? (
        <span data-testid="provenance-badge" style={{ ...badge, color: H.quiet }}>{p.provenance_marker}</span>
      ) : null}
      {seasonSample !== null ? (
        <span data-testid="sample-badge" style={{ ...badge, color: H.quiet }}>SZN n={seasonSample.eligible_n} · {seasonSample.coverage}</span>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// AVATAR — image slot + DETERMINISTIC fallback. Same player → same fallback.
// ---------------------------------------------------------------------------
function Avatar({ player }: { player: string }): React.ReactElement {
  const fb = fallbackAvatar(player);
  // Production headshots blocked on rights (G8): always render the deterministic
  // fallback so the row looks intentional with or without a photograph.
  return (
    <div data-testid="avatar-fallback" aria-hidden style={{
      width: 40, height: 40, borderRadius: 8, flex: '0 0 auto',
      background: fb.background, color: H.text, display: 'flex', alignItems: 'center',
      justifyContent: 'center', fontWeight: 700, fontSize: 14, border: `1px solid ${H.border}`,
    }}>{fb.initials}</div>
  );
}

// ---------------------------------------------------------------------------
// THE ROW — full-row press target to Research, server <Link>, CSS press state.
// ---------------------------------------------------------------------------
export function BoardRow({ row }: { row: BoardRowData }): React.ReactElement {
  const p = row.projection;
  const capKind = p.cap_tag !== undefined;
  return (
    <Link href={row.research_href} className="board-row" data-testid="board-row" style={rowStyle}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <Avatar player={p.player} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <FindingMark label={p.classification_label} capped={p.provenance_marker !== undefined || capKind} />
            <span style={{ fontWeight: 700, fontSize: 15, color: H.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.player}</span>
            <span style={{ fontSize: 12, color: H.quiet }}>{p.team}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
            <span style={{ ...pillStyle(pillKindForLabel(p.classification_label)) as CSSProperties }}>{p.classification_label}</span>
            {p.cap_tag !== undefined ? <span style={capChipStyle() as CSSProperties}>{p.cap_tag}</span> : null}
            <span style={{ fontSize: 13, color: H.text, marginLeft: 'auto', fontVariantNumeric: 'tabular-nums' }}>
              {p.market.replace('player_', '')} {p.evaluated_line === null ? '—' : p.evaluated_line}
            </span>
          </div>
          <div style={{ marginTop: 8 }}><InformationBand band={p.band} /></div>
          <ConsensusBar band={p.band} />
          <Badges p={p} />
          {/* §G.1 disclosure — always present, never hover-only. */}
          <p data-testid="disclosure-g1" style={{ fontSize: 10, color: H.quiet, marginTop: 6, marginBottom: 0, lineHeight: 1.35 }}>{p.disclosure_g1}</p>
        </div>
        <span aria-hidden style={{ color: H.quiet, fontSize: 20, alignSelf: 'center', flex: '0 0 auto' }}>›</span>
      </div>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// CHROME — header (title + sport context + reserved, NON-functional chrome
// positions) and bottom nav (Board · Players · Methodology, no dead controls).
// ---------------------------------------------------------------------------
// Server-rendered <style>: CSS press state (:active) + scrollbar chrome. No
// client JavaScript — the press feedback is pure CSS.
const BOARD_CSS = `
.board-row { transition: background 120ms ease; }
.board-row:active { background: ${H.panelHover}; }
.board-band-scroll::-webkit-scrollbar { height: 6px; }
.board-band-scroll::-webkit-scrollbar-thumb { background: ${H.border}; border-radius: 3px; }
`;

export function BoardChrome({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <div style={{ minHeight: '100vh', background: H.bg, color: H.text, maxWidth: 480, margin: '0 auto', paddingBottom: 64 }}>
      <style>{BOARD_CSS}</style>
      <header style={{ position: 'sticky', top: 0, zIndex: 2, background: H.bg, borderBottom: `1px solid ${H.border}`, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: 0.3 }}>Board</div>
          <div style={{ fontSize: 11, color: H.quiet }}>WNBA player props</div>
        </div>
        {/* reserved, NON-functional chrome positions (spec top-chrome allowance) */}
        <span aria-hidden data-testid="chrome-reserved" style={{ width: 22, height: 22, borderRadius: 6, background: H.panel, border: `1px solid ${H.border}` }} />
        <span aria-hidden data-testid="chrome-reserved" style={{ width: 22, height: 22, borderRadius: 999, background: H.panel, border: `1px solid ${H.border}` }} />
      </header>
      <main style={{ padding: '10px 12px' }}>{children}</main>
      <nav style={{ position: 'fixed', bottom: 0, left: 0, right: 0, maxWidth: 480, margin: '0 auto', background: H.panel, borderTop: `1px solid ${H.border}`, display: 'flex' }}>
        {[['Board', true], ['Players', false], ['Methodology', false]].map(([label, active]) => (
          <span key={String(label)} data-testid="nav-item" aria-current={active ? 'page' : undefined} style={{ flex: 1, textAlign: 'center', padding: '12px 0', fontSize: 12, fontWeight: active ? 700 : 500, color: active ? H.text : H.quiet }}>{label}</span>
        ))}
      </nav>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SKELETON — matches the real row geometry.
// ---------------------------------------------------------------------------
export function BoardSkeleton(): React.ReactElement {
  return (
    <div data-testid="board-skeleton" aria-hidden>
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} style={{ ...rowStyle, cursor: 'default' }}>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ width: 40, height: 40, borderRadius: 8, background: H.border }} />
            <div style={{ flex: 1 }}>
              <div style={{ height: 14, width: '55%', background: H.border, borderRadius: 4 }} />
              <div style={{ height: 12, width: '35%', background: H.border, borderRadius: 4, marginTop: 8 }} />
              <div style={{ height: 24, width: '100%', background: H.border, borderRadius: 4, marginTop: 10 }} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// LOCKED CONTINUATION (Parity §1.4 #34-35) — APPROVED UI ARCHITECTURE ONLY.
// It gates NOTHING: every available row renders above. No entitlement logic,
// no billing, no gating, no row withholding, NO functional CTA. The CTA is an
// EXPLICIT NON-ACTIONABLE control ("Membership coming later", disabled).
// ---------------------------------------------------------------------------
export function LockedContinuation(): React.ReactElement {
  return (
    <section data-testid="locked-continuation" aria-hidden style={{ position: 'relative', marginTop: 18 }}>
      <div style={{ filter: 'blur(3px)', opacity: 0.5, pointerEvents: 'none', userSelect: 'none' }}>
        {[0, 1, 2].map((i) => (
          <div key={i} style={{ ...rowStyle, cursor: 'default' }}>
            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ width: 40, height: 40, borderRadius: 8, background: H.border }} />
              <div style={{ flex: 1 }}>
                <div style={{ height: 14, width: '50%', background: H.border, borderRadius: 4 }} />
                <div style={{ height: 24, width: '100%', background: H.border, borderRadius: 4, marginTop: 10 }} />
              </div>
            </div>
          </div>
        ))}
      </div>
      <div data-testid="lock-panel" style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, textAlign: 'center', padding: 16 }}>
        <span aria-hidden style={{ fontSize: 22 }}>🔒</span>
        <div style={{ fontSize: 13, color: H.text, fontWeight: 600 }}>More rows continue here</div>
        {/* EXPLICIT NON-ACTIONABLE CTA — a disabled control, reserves the future
            V1-9 CTA location. NOT an enabled-looking button; performs no action. */}
        <button type="button" disabled data-testid="locked-cta" aria-disabled="true" style={{
          padding: '8px 14px', borderRadius: 8, border: `1px solid ${H.border}`, background: H.panel,
          color: H.quiet, fontSize: 12, fontWeight: 600, cursor: 'not-allowed',
        }}>Membership coming later</button>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// styles
// ---------------------------------------------------------------------------
const rowStyle: CSSProperties = {
  display: 'block', background: H.panel, border: `1px solid ${H.border}`, borderRadius: 12,
  padding: 12, marginBottom: 10, textDecoration: 'none', color: H.text,
};
const windowCellStyle: CSSProperties = {
  flex: '0 0 auto', minWidth: 66, scrollSnapAlign: 'start', background: H.bg,
  border: `1px solid ${H.border}`, borderRadius: 8, padding: '6px 8px',
};
const badge: CSSProperties = {
  fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 999,
  background: H.bg, border: `1px solid ${H.border}`,
};

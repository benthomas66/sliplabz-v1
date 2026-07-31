// V1-8b — the Research View: the INSPECTION surface. Server component (no client
// JS, no client-side evidence calculation). Progressive disclosure via CSS radios
// (window selection) and native <details> (game inspection + technical sections).
// Every internal value is TRANSLATED to plain language server-side; raw enums,
// raw ISO timestamps, reason codes, and internal ids never render.
//
// Section order (R11): 1 header · 2 evidence summary · 3 window selector ·
// 4 historical visualization · 5 game history · 6 market context · 7 why it
// ranked · 8 technical scoring (collapsed) · 9 methodology disclosure.

import Link from 'next/link';
import type { CSSProperties } from 'react';
import type { ResearchProjection, ResearchWindow } from '../../src/lib/researchProjection';
import { PREVIEW_HUES, pillKindForLabel } from '../../src/lib/previewVariantStyle';
import { fallbackAvatar } from '../../src/lib/board/bandView';
import { computeResearchFreshness, humanizeAge } from '../../src/lib/researchFreshness';
import {
  marketLabel, findingSummary, reasonLabel, selectionMethodLabel, consensusCoverageLabel,
  oneSidedLabel, movementLabel, windowSpan,
} from '../../src/lib/research/terminology';
import { EvidenceChart } from './EvidenceChart';
import { GameHistory } from './GameHistory';

const H = PREVIEW_HUES;
const CARD: CSSProperties = { border: `1px solid ${H.border}`, borderRadius: 10, padding: '12px 14px', background: H.panel };
const H2: CSSProperties = { fontSize: 13, fontWeight: 700, margin: '0 0 8px', color: H.text, letterSpacing: 0.2 };
const QUIET: CSSProperties = { color: H.quiet, fontSize: 12 };
const SECTION: CSSProperties = { marginBottom: 16 };
const WINDOWS = ['L5', 'L10', 'L20', 'season'] as const;
const WINDOW_TITLE: Record<string, string> = { L5: 'Last 5 eligible games', L10: 'Last 10 eligible games', L20: 'Last 20 eligible games', season: 'Season evidence' };
const WINDOW_CHIP: Record<string, string> = { L5: 'L5', L10: 'L10', L20: 'L20', season: 'Season' };

function fmt(n: number | null): string { return n === null ? '—' : String(n); }

const RV_CSS = `
.rv-radio { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
.rv-chips { display: flex; gap: 6px; margin-bottom: 10px; }
.rv-chip { flex: 1; text-align: center; padding: 8px 0; min-height: 40px; border: 1px solid ${H.border}; border-radius: 8px; background: ${H.bg}; color: ${H.quiet}; font-size: 12px; font-weight: 600; cursor: pointer; }
.rv-block { display: none; }
${WINDOWS.map((w) => `.rv-r-${w}:checked ~ .rv-blocks .rv-block-${w} { display: block; }`).join('\n')}
${WINDOWS.map((w) => `.rv-r-${w}:checked ~ .rv-chips .rv-chip-${w} { background: ${H.over}; color: ${H.bg}; border-color: ${H.over}; }`).join('\n')}
${WINDOWS.map((w) => `.rv-r-${w}:focus-visible ~ .rv-chips .rv-chip-${w} { outline: 2px solid ${H.over}; }`).join('\n')}
`;

function FindingMark({ label }: { label: string }): React.ReactElement {
  const kind = pillKindForLabel(label);
  const filled = kind === 'over' || kind === 'under';
  const hue = kind === 'over' ? H.over : kind === 'under' ? H.under : H.neutral;
  return <span aria-hidden style={{ width: 11, height: 11, borderRadius: 3, background: filled ? hue : 'transparent', border: `2px solid ${hue}`, flex: '0 0 auto' }} />;
}

function WindowSummary({ w }: { w: ResearchWindow }): React.ReactElement {
  return (
    <div style={{ ...CARD, marginBottom: 10 }} data-testid={`window-summary-${w.window_type}`}>
      <div style={{ fontSize: 12, fontWeight: 700, color: H.text }} data-testid={`window-heading-${w.window_type}`}>{WINDOW_TITLE[w.window_type]}</div>
      <div style={{ fontSize: 13, color: H.text, marginTop: 6 }}>
        above <b>{w.count_above}</b> · below <b>{w.count_below}</b> · on the line <b>{w.count_equal}</b>
      </div>
      <div style={{ ...QUIET, marginTop: 4 }}>{w.eligible_n} eligible {w.eligible_n === 1 ? 'game' : 'games'} · {w.coverage_label === 'no_data' ? 'no data' : w.coverage_label}</div>
      <div style={{ ...QUIET, marginTop: 2 }}>
        average {fmt(w.avg_stat_value)} · vs line {fmt(w.avg_minus_threshold)}
        {w.current_streak_direction !== null ? ` · streak ${w.current_streak_length} ${w.current_streak_direction}` : ''}
      </div>
    </div>
  );
}

export function ResearchView({ projection, isPreview, serveNow }: { projection: ResearchProjection; isPreview: boolean; serveNow: string }): React.ReactElement {
  const p = projection;
  const fresh = computeResearchFreshness(p.line_observed_at, serveNow);
  const mc = p.market_context;
  const fb = fallbackAvatar(p.player);

  return (
    <main style={{ background: H.bg, color: H.text, minHeight: '100vh', padding: '14px 12px 40px', maxWidth: 420, margin: '0 auto', fontSize: 14 }}>
      <style>{RV_CSS}</style>
      {isPreview ? (
        <div data-testid="design-preview-banner" role="alert" style={{ background: '#7a1020', color: '#fff', padding: '10px 14px', borderRadius: 6, fontWeight: 700, marginBottom: 12 }}>
          DESIGN PREVIEW — FIXTURE DATA. Not live market information.
        </div>
      ) : null}

      {/* 1 PROFILE HEADER (R1) */}
      <section style={SECTION} data-testid="section-identity">
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <div data-testid="avatar-fallback" aria-hidden style={{ width: 46, height: 46, borderRadius: 10, flex: '0 0 auto', background: fb.background, color: H.text, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 16, border: `1px solid ${H.border}` }}>{fb.initials}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 20, lineHeight: 1.15 }} data-testid="rv-player">{p.player}</div>
            {p.matchup !== null || p.tipoff !== null ? (
              <div style={{ ...QUIET, marginTop: 2 }} data-testid="rv-matchup">{[p.matchup, p.tipoff].filter((x) => x !== null).join(' · ')}</div>
            ) : null}
          </div>
        </div>
        <div style={{ marginTop: 10, fontSize: 18, fontWeight: 800 }} data-testid="rv-market">{marketLabel(p.market)} · Line {p.evaluated_line === null ? '—' : p.evaluated_line}</div>
        {/* 2 EVIDENCE SUMMARY (R2) — quiet factual direction + Finding Mark */}
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 4, fontSize: 14, fontWeight: 600 }} data-testid="rv-finding">
          <FindingMark label={p.classification_label_compact} />{findingSummary(p.classification)}
        </div>
        <div style={{ ...QUIET, marginTop: 6 }} data-testid="rv-meta">
          {fresh.state === 'unknown' ? 'Freshness unknown' : `${fresh.state === 'fresh' ? 'Fresh' : 'Aged'} ${humanizeAge(fresh.age_seconds)}`} · {mc.eligible_book_count} {mc.eligible_book_count === 1 ? 'book' : 'books'}
        </div>
        {p.quality_capped && p.binding_cap_tag !== null ? <div data-testid="cap-tag" style={{ marginTop: 4, fontSize: 12, color: H.text }}>{p.binding_cap_tag}</div> : null}
        {p.provenance_marker !== null ? <div data-testid="provenance" style={{ marginTop: 3, fontSize: 11, color: H.quiet, opacity: 0.85 }}>{p.provenance_marker}</div> : null}
        {fresh.beyond_horizon ? (
          <div data-testid="aged-marker" style={{ marginTop: 8, padding: '8px 10px', border: `1px solid ${H.under}`, borderRadius: 6, fontWeight: 600, fontSize: 12 }}>
            Aged historical evidence — beyond the current-market window. Shown for inspection only; this is not current market analysis.
          </div>
        ) : null}
        <p data-testid="disclosure-g1" style={{ ...QUIET, marginTop: 8, marginBottom: 0 }}>Historical evidence and current market context — not a prediction.</p>
      </section>

      {/* 3 WINDOW SELECTOR + 4 HISTORICAL VISUALIZATION (CSS radios; L10 default) */}
      <section style={SECTION} data-testid="section-windows">
        <h2 style={H2}>Evidence by window</h2>
        <div className="rv-windows">
          {WINDOWS.map((w) => (
            <input key={w} type="radio" name="rv-window" id={`rv-w-${w}`} className={`rv-radio rv-r-${w}`} defaultChecked={w === 'L10'} />
          ))}
          <div className="rv-chips" role="tablist" aria-label="Evidence window">
            {WINDOWS.map((w) => (
              <label key={w} htmlFor={`rv-w-${w}`} className={`rv-chip rv-chip-${w}`} data-testid={`window-chip-${w}`}>{WINDOW_CHIP[w]}</label>
            ))}
          </div>
          <div className="rv-blocks">
            {WINDOWS.map((w) => {
              const win = p.windows[w];
              const span = windowSpan(p.series, win.eligible_n);
              return (
                <div key={w} className={`rv-block rv-block-${w}`} data-testid={`window-block-${w}`} role="tabpanel">
                  <WindowSummary w={win} />
                  <EvidenceChart series={span.length > 0 ? span : p.series} evaluatedLine={p.evaluated_line} />
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* 5 GAME HISTORY (R6 + R5 inspection) */}
      <section style={SECTION} data-testid="section-history">
        <h2 style={H2}>Game history</h2>
        <p style={{ ...QUIET, margin: '0 0 8px' }}>Tap a game for detail. Did-not-play and ineligible games are excluded from the counts.</p>
        <GameHistory series={p.series} />
      </section>

      {/* 6 MARKET CONTEXT (R7) — plain language, no prices/offerings */}
      <section style={SECTION} data-testid="section-market">
        <h2 style={H2}>Market context</h2>
        <div style={CARD}>
          <div>Consensus line: <b data-testid="mc-consensus">{fmt(mc.consensus_point)}</b></div>
          <div style={{ ...QUIET, marginTop: 4 }}>Observed at {mc.eligible_book_count} {mc.eligible_book_count === 1 ? 'book' : 'books'} · {consensusCoverageLabel(mc.consensus_coverage_label)}</div>
          <div style={{ ...QUIET, marginTop: 2 }}>Observed range: {fmt(mc.line_range_min)}–{fmt(mc.line_range_max)}</div>
          <div style={{ ...QUIET, marginTop: 2 }}>Line movement: {movementLabel(mc.net_point_movement)} · Point changes: {mc.point_changes_observed}</div>
          <div style={{ ...QUIET, marginTop: 2 }}>{oneSidedLabel(mc.one_sided)}</div>
          <details style={{ marginTop: 8 }} data-testid="market-technical">
            <summary style={{ cursor: 'pointer', color: H.text, fontSize: 12, fontWeight: 600 }}>Technical details</summary>
            <div style={{ ...QUIET, marginTop: 6, lineHeight: 1.5 }}>
              <div>Selection: {selectionMethodLabel(mc.selection_method)}</div>
              <div>Distribution: {mc.point_distribution.map((d) => `${d.point} (${d.book_count})`).join(', ') || '—'}</div>
            </div>
          </details>
        </div>
      </section>

      {/* 7 WHY THIS PROFILE RANKED HERE (R9) — plain-language reasons (R8) */}
      <section style={SECTION} data-testid="section-reasons">
        <h2 style={H2}>Why this profile ranked here</h2>
        <div style={CARD}>
          <ul style={{ margin: 0, paddingLeft: 18 }} data-testid="reasons-plain">
            {p.reasons.map((r, i) => <li key={i} style={{ fontSize: 13, marginBottom: 4 }}>{reasonLabel(r.reason_code)}</li>)}
            {p.reasons.length === 0 ? <li style={QUIET}>No specific reasons were recorded.</li> : null}
          </ul>
          {p.reasons.length > 0 ? (
            <details style={{ marginTop: 8 }} data-testid="reasons-technical">
              <summary style={{ cursor: 'pointer', color: H.text, fontSize: 12, fontWeight: 600 }}>Technical reason codes</summary>
              <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                {p.reasons.map((r, i) => <li key={i} style={{ ...QUIET, marginBottom: 2 }}>{r.reason_code} — {r.category}, rank {r.intra_category_rank}</li>)}
              </ul>
            </details>
          ) : null}
        </div>
      </section>

      {/* 8 TECHNICAL SCORING (R9) — collapsed by default; score is non-probabilistic */}
      <section style={SECTION} data-testid="section-grade-detail">
        <details data-testid="technical-scoring">
          <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 700, color: H.text }}>Technical scoring details</summary>
          <div style={{ ...CARD, marginTop: 8 }}>
            <div data-testid="classification-full" style={{ fontSize: 12, color: H.text, marginBottom: 6 }}>Classification: {p.classification_label_full}</div>
            <div data-testid="composite-score" style={{ fontSize: 14 }}>Evidence Strength score: <b>{p.composite_score === null ? 'not scored' : p.composite_score.toFixed(2)}</b></div>
            <div data-testid="disclosure-g2" style={{ ...QUIET, marginTop: 4 }}>{p.disclosure_g2}</div>
            <div style={{ marginTop: 8, fontSize: 12 }}>components — c_rtp {fmt(p.components.c_rtp)} · c_ms {fmt(p.components.c_ms)} · c_wa {fmt(p.components.c_wa)} · c_ma {fmt(p.components.c_ma)}</div>
            <div style={{ ...QUIET, marginTop: 4 }} data-testid="versions">method {p.method_version} · computation v{p.computation_version}</div>
          </div>
        </details>
      </section>

      {/* 9 METHODOLOGY DISCLOSURE (R10) */}
      <section data-testid="section-methodology">
        <p data-testid="disclosure-g1-full" style={{ ...QUIET, borderTop: `1px solid ${H.border}`, paddingTop: 10, lineHeight: 1.5 }}>{p.disclosure_g1}</p>
        <Link href="/methodology" data-testid="methodology-link" style={{ color: H.over, fontSize: 12, textDecoration: 'none', fontWeight: 600 }}>Read the methodology ›</Link>
      </section>
    </main>
  );
}

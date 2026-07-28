// V1-7b — the Research View (Path A: the persisted default). Server component.
//
// The first surface that shows the WORK. Mobile-first (390px), DARK, reusing the
// committed valence-neutral hue pair (previewVariantStyle). Displays the persisted
// evaluation with FULL disclosure per the founder ruling: exact line + source,
// visible age + freshness state (with an unmissable aged marker beyond the
// horizon — never worded as current), full §D.2 label, window counts, the
// per-game chart, market context, reasons, and the DR-19 grade detail with §G.2
// adjacent to the score. Renders nothing that isn't on the projection.

import type { ResearchProjection, ResearchWindow } from '../../src/lib/researchProjection';
import { PREVIEW_HUES } from '../../src/lib/previewVariantStyle';
import { computeResearchFreshness, humanizeAge } from '../../src/lib/researchFreshness';
import { EvidenceChart } from './EvidenceChart';

const H2: React.CSSProperties = { fontSize: 15, margin: '0 0 8px', color: PREVIEW_HUES.text };
const CARD: React.CSSProperties = { border: `1px solid ${PREVIEW_HUES.border}`, borderRadius: 8, padding: '10px 12px', background: PREVIEW_HUES.panel };
const QUIET: React.CSSProperties = { color: PREVIEW_HUES.quiet, fontSize: 12 };
const SECTION: React.CSSProperties = { marginBottom: 18 };

function fmt(n: number | null): string { return n === null ? '—' : String(n); }

function WindowCard({ label, w }: { label: string; w: ResearchWindow }) {
  return (
    <div style={CARD} data-testid={`window-${label}`}>
      <div style={{ fontWeight: 700, fontSize: 13, color: PREVIEW_HUES.text }}>{label}</div>
      <div style={{ fontSize: 12, color: PREVIEW_HUES.text, marginTop: 4 }}>
        above <b>{w.count_above}</b> · below <b>{w.count_below}</b> · on the line <b>{w.count_equal}</b>
      </div>
      <div style={{ ...QUIET, marginTop: 4 }}>
        eligible games {w.eligible_n} · coverage {w.coverage_label}
      </div>
      <div style={{ ...QUIET, marginTop: 2 }}>
        avg {fmt(w.avg_stat_value)} · median {fmt(w.median_stat_value)} · avg vs line {fmt(w.avg_minus_threshold)}
      </div>
      <div style={{ ...QUIET, marginTop: 2 }}>
        streak {w.current_streak_direction ?? '—'} {w.current_streak_length ?? ''}
      </div>
    </div>
  );
}

export function ResearchView({ projection, isPreview, serveNow }: { projection: ResearchProjection; isPreview: boolean; serveNow: string }) {
  const p = projection;
  const fresh = computeResearchFreshness(p.line_observed_at, serveNow);

  return (
    <main style={{ background: PREVIEW_HUES.bg, color: PREVIEW_HUES.text, minHeight: '100vh', padding: '1rem', maxWidth: 390, margin: '0 auto', fontSize: 14 }}>
      {isPreview ? (
        <div data-testid="design-preview-banner" role="alert" style={{ background: '#7a1020', color: '#fff', padding: '10px 14px', borderRadius: 6, fontWeight: 700, marginBottom: '0.9rem' }}>
          DESIGN PREVIEW — FIXTURE DATA. Not live market information.
        </div>
      ) : null}

      {/* 1. IDENTITY + CONTEXT */}
      <section style={SECTION} data-testid="section-identity">
        <div style={{ fontWeight: 700, fontSize: 18 }}>{p.player}</div>
        <div style={QUIET}>{p.team} · {p.market}{p.tipoff_utc !== null ? ` · tipoff ${p.tipoff_utc}` : ''}</div>
        <div style={{ marginTop: 6 }}>
          Evaluated line: <b>{p.evaluated_line === null ? '—' : p.evaluated_line}</b>
          <span style={QUIET}> ({p.evaluated_source_kind ?? 'no source'})</span>
        </div>
      </section>

      {/* 2. THE FINDING — FULL §D.2 label, strength never discarded */}
      <section style={SECTION} data-testid="section-finding">
        <h2 style={H2}>The finding</h2>
        <div style={{ ...CARD }}>
          <div data-testid="classification-full" style={{ fontSize: 16, fontWeight: 700 }}>{p.classification_label_full}</div>
          <div style={QUIET}>direction {p.direction ?? '—'}</div>
          {p.quality_capped && p.binding_cap_tag !== null ? (
            <div data-testid="cap-tag" style={{ marginTop: 4, fontSize: 12 }}>Quality cap: {p.binding_cap_tag}</div>
          ) : null}
          {p.provenance_marker !== null ? (
            <div data-testid="provenance" style={{ marginTop: 4, ...QUIET }}>{p.provenance_marker}</div>
          ) : null}
        </div>
      </section>

      {/* 3. FRESHNESS DISCLOSURE (founder ruling) — visible, never hover-only */}
      <section style={SECTION} data-testid="section-freshness">
        <h2 style={H2}>Freshness</h2>
        <div style={CARD}>
          <div style={QUIET}>Line observed: {p.line_observed_at ?? 'unknown'}</div>
          <div style={{ marginTop: 2 }}>Evaluated about <b>{humanizeAge(fresh.age_seconds)}</b> ago · state: {fresh.state}</div>
          {fresh.beyond_horizon ? (
            <div data-testid="aged-marker" style={{ marginTop: 8, padding: '8px 10px', border: `1px solid ${PREVIEW_HUES.under}`, borderRadius: 6, color: PREVIEW_HUES.text, fontWeight: 600 }}>
              Aged historical evidence — beyond the current-market window. Shown for inspection only; this is not current market analysis.
            </div>
          ) : null}
        </div>
      </section>

      {/* 4. WINDOW EVIDENCE — counts only */}
      <section style={SECTION} data-testid="section-windows">
        <h2 style={H2}>Window evidence</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <WindowCard label="L5" w={p.windows.L5} />
          <WindowCard label="L10" w={p.windows.L10} />
          <WindowCard label="L20" w={p.windows.L20} />
          <WindowCard label="season" w={p.windows.season} />
        </div>
      </section>

      {/* 5. THE CHART */}
      <section style={SECTION} data-testid="section-chart">
        <h2 style={H2}>Per-game history</h2>
        <EvidenceChart series={p.series} evaluatedLine={p.evaluated_line} />
      </section>

      {/* 6. MARKET CONTEXT — no per-book offerings */}
      <section style={SECTION} data-testid="section-market">
        <h2 style={H2}>Market context</h2>
        <div style={CARD}>
          <div>Consensus point: <b>{fmt(p.market_context.consensus_point)}</b> <span style={QUIET}>({p.market_context.selection_method}, {p.market_context.consensus_coverage_label})</span></div>
          <div style={{ ...QUIET, marginTop: 4 }}>eligible books {p.market_context.eligible_book_count} · range {fmt(p.market_context.line_range_min)}–{fmt(p.market_context.line_range_max)} · first observed {fmt(p.market_context.first_observed_point)}</div>
          <div style={{ ...QUIET, marginTop: 2 }}>net movement {fmt(p.market_context.net_point_movement)} · point changes {p.market_context.point_changes_observed} · one-sided {p.market_context.one_sided ?? 'no'}</div>
          <div style={{ ...QUIET, marginTop: 2 }}>point distribution: {p.market_context.point_distribution.map((d) => `${d.point}×${d.book_count}`).join('  ') || '—'}</div>
        </div>
      </section>

      {/* 7. REASONS — as the engine emits them, in emitted order */}
      <section style={SECTION} data-testid="section-reasons">
        <h2 style={H2}>Reasons</h2>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          {p.reasons.map((r, i) => (
            <li key={i} style={{ fontSize: 12, marginBottom: 3 }}>
              <span style={{ color: PREVIEW_HUES.text }}>{r.reason_code}</span>
              <span style={QUIET}> — {r.category}, rank {r.intra_category_rank}</span>
            </li>
          ))}
          {p.reasons.length === 0 ? <li style={QUIET}>none</li> : null}
        </ul>
      </section>

      {/* 8. GRADE DETAIL (DR-19) — score + components + versions; §G.2 ADJACENT */}
      <section style={SECTION} data-testid="section-grade-detail">
        <h2 style={H2}>How this was graded</h2>
        <div style={CARD}>
          <div data-testid="composite-score" style={{ fontSize: 15 }}>
            Evidence Strength score: <b>{p.composite_score === null ? 'not scored' : p.composite_score.toFixed(2)}</b>
          </div>
          {/* §G.2 disclosure IMMEDIATELY adjacent to the score (DR-19(b)). */}
          <div data-testid="disclosure-g2" style={{ ...QUIET, marginTop: 4 }}>{p.disclosure_g2}</div>
          <div style={{ marginTop: 8, fontSize: 12 }}>
            components — c_rtp {fmt(p.components.c_rtp)} · c_ms {fmt(p.components.c_ms)} · c_wa {fmt(p.components.c_wa)} · c_ma {fmt(p.components.c_ma)}
          </div>
          <div style={{ ...QUIET, marginTop: 4 }} data-testid="versions">
            method {p.method_version} · computation v{p.computation_version}
          </div>
        </div>
      </section>

      {/* 9. §G.1 disclosure — page level */}
      <p data-testid="disclosure-g1" style={{ ...QUIET, borderTop: `1px solid ${PREVIEW_HUES.border}`, paddingTop: 10 }}>{p.disclosure_g1}</p>
    </main>
  );
}

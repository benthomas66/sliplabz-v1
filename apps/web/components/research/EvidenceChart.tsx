// V1-8b — the per-game evidence chart, rebuilt for MOBILE READABILITY (server
// component, no client JS, no client-side calculation). CHARTS ARE COPY: past
// stat values relative to the evaluated line, oldest→newest — no prediction, no
// trend arrows, no confidence, no good/bad valence.
//
// R4 fixes: ONE compact bar per position with ONE short date label beneath it (no
// overlapping opponent names, no repeated "ineligible" prose inside the graph);
// ineligible/DNP positions are GHOST bars holding their chronological place; wide
// spans (L20/Season) SCROLL horizontally rather than compressing into illegibility.
//
// Valence-neutral hues (committed): above→azure, below→violet, on-line→slate,
// ghost→dashed slate outline. Bar height encodes the STAT VALUE, never the score.

import type { ResearchSeriesEntry } from '../../src/lib/researchProjection';
import { PREVIEW_HUES } from '../../src/lib/previewVariantStyle';

const H = PREVIEW_HUES;

function barColor(o: ResearchSeriesEntry['outcome']): string {
  switch (o) {
    case 'above': return H.over;
    case 'below': return H.under;
    case 'equal': return H.neutral;
    default: return 'transparent';
  }
}

/** One short date label — "6/28" — never the opponent (which would overlap). The
 *  opponent lives in the game-history rows below, one per line. */
function shortDate(iso: string): string {
  const m = /\d{4}-(\d{2})-(\d{2})/.exec(iso);
  return m === null ? '' : `${Number(m[1])}/${Number(m[2])}`;
}

export function EvidenceChart({ series, evaluatedLine }: { series: ReadonlyArray<ResearchSeriesEntry>; evaluatedLine: number | null }): React.ReactElement {
  const PLOT_H = 128;
  const COL = 34; // fixed per-column width → wide spans scroll instead of squeezing
  const statMax = Math.max(evaluatedLine ?? 0, ...series.map((s) => s.stat_value ?? 0), 1);
  const linePct = evaluatedLine === null ? null : (evaluatedLine / statMax) * PLOT_H;

  return (
    <figure style={{ margin: 0 }} data-testid="evidence-chart">
      <div data-testid="chart-scroll" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'flex-end', gap: 0, height: PLOT_H + 26, paddingTop: 14, minWidth: '100%' }}>
          {/* evaluated (threshold) line across the plot */}
          {linePct !== null ? (
            <div aria-hidden style={{ position: 'absolute', left: 0, right: 0, bottom: 26 + linePct, borderTop: `1px dashed ${H.text}`, opacity: 0.6 }} />
          ) : null}
          {series.map((s, i) => {
            const ghost = s.stat_value === null || !s.counted;
            const h = ghost ? 22 : Math.max(4, (s.stat_value! / statMax) * PLOT_H);
            return (
              <div key={i} data-testid="chart-col" data-kind={ghost ? 'ineligible' : 'eligible'} style={{ width: COL, flex: '0 0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}>
                {!ghost ? <span style={{ fontSize: 8, color: H.text, marginBottom: 2 }}>{s.stat_value}</span> : null}
                <div style={ghost
                  ? { width: 16, height: h, border: `1px dashed ${H.neutral}`, borderRadius: 2, opacity: 0.6 }
                  : { width: 16, height: h, background: barColor(s.outcome), borderRadius: 2 }} />
                <span style={{ fontSize: 8, color: H.quiet, marginTop: 4, whiteSpace: 'nowrap' }}>{shortDate(s.game_date_utc)}</span>
              </div>
            );
          })}
        </div>
      </div>
      <figcaption style={{ fontSize: 10.5, color: H.quiet, marginTop: 6, lineHeight: 1.4 }} data-testid="chart-legend">
        Bars are past stat values, oldest→newest; the dashed line is the evaluated line.
        Above is azure, below is violet, on the line is slate. Dashed ghosts are games the
        player did not play or was ineligible — they hold their place but are not counted.
      </figcaption>
    </figure>
  );
}

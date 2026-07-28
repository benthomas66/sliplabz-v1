// V1-7b — the per-game evidence chart (server component, SVG).
//
// CHARTS ARE COPY. This shows historical performance RELATIVE TO THE EVALUATED
// LINE as fact, including the games that fell below (the "misses"). It implies
// NO prediction: no trend arrows, no confidence encodings, no good/bad valence.
//
// COLOR SCALE (documented in-place, valence-neutral — NOT green/red; neither
// hue reads as good/bad; reused from V1-6f previewVariantStyle):
//   above the line  → azure  (#57A6D9)
//   below the line  → violet (#B58AD6)
//   on the line     → slate  (#8B929B)
//   did not play / ineligible → GHOST: no fill, dashed slate outline
// Bar length encodes the STAT VALUE (a historical count), NEVER the composite score.

import type { ResearchSeriesEntry } from '../../src/lib/researchProjection';
import { PREVIEW_HUES } from '../../src/lib/previewVariantStyle';

function barColor(o: ResearchSeriesEntry['outcome']): string {
  switch (o) {
    case 'above': return PREVIEW_HUES.over;
    case 'below': return PREVIEW_HUES.under;
    case 'equal': return PREVIEW_HUES.neutral;
    default: return 'transparent';
  }
}

export function EvidenceChart({ series, evaluatedLine }: { series: ReadonlyArray<ResearchSeriesEntry>; evaluatedLine: number | null }) {
  const W = 358, H = 210, padL = 8, padR = 8, padTop = 18, padBottom = 46;
  const plotW = W - padL - padR;
  const plotH = H - padTop - padBottom;
  const n = Math.max(series.length, 1);
  const slot = plotW / n;
  const barW = Math.min(22, slot * 0.6);

  const statMax = Math.max(
    evaluatedLine ?? 0,
    ...series.map((s) => s.stat_value ?? 0),
    1,
  );
  const yFor = (v: number) => padTop + plotH - (v / statMax) * plotH;
  const baseline = padTop + plotH;
  const lineY = evaluatedLine === null ? null : yFor(evaluatedLine);

  return (
    <figure style={{ margin: 0 }} data-testid="evidence-chart">
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Per-game stat values against the evaluated line, oldest to newest">
        {/* threshold (evaluated) line */}
        {lineY !== null ? (
          <g>
            <line x1={padL} y1={lineY} x2={W - padR} y2={lineY} stroke={PREVIEW_HUES.text} strokeDasharray="4 3" strokeWidth={1} />
            <text x={W - padR} y={lineY - 3} textAnchor="end" fontSize={9} fill={PREVIEW_HUES.quiet}>line {evaluatedLine}</text>
          </g>
        ) : null}
        {series.map((s, i) => {
          const cx = padL + slot * i + slot / 2;
          const x = cx - barW / 2;
          const ghost = s.stat_value === null || !s.counted;
          const label = s.is_home === null ? s.opponent_label : `${s.is_home ? 'vs' : '@'} ${s.opponent_label}`;
          if (ghost) {
            // DNP / ineligible — a distinct ghost placeholder, never a valued bar.
            const gh = 20;
            return (
              <g key={i}>
                <rect x={x} y={baseline - gh} width={barW} height={gh} fill="none" stroke={PREVIEW_HUES.neutral} strokeDasharray="3 2" strokeWidth={1} opacity={0.7} />
                <text x={cx} y={baseline - gh - 3} textAnchor="middle" fontSize={8} fill={PREVIEW_HUES.quiet}>
                  {s.display_status === 'did_not_play' ? 'DNP' : 'inelig.'}
                </text>
                <text x={cx} y={baseline + 12} textAnchor="middle" fontSize={7} fill={PREVIEW_HUES.quiet}>{label}</text>
              </g>
            );
          }
          const y = yFor(s.stat_value!);
          return (
            <g key={i}>
              <rect x={x} y={y} width={barW} height={baseline - y} fill={barColor(s.outcome)} rx={2} />
              <text x={cx} y={y - 3} textAnchor="middle" fontSize={8} fill={PREVIEW_HUES.text}>{s.stat_value}</text>
              <text x={cx} y={baseline + 12} textAnchor="middle" fontSize={7} fill={PREVIEW_HUES.quiet}>{label}</text>
            </g>
          );
        })}
      </svg>
      <figcaption style={{ fontSize: 11, color: PREVIEW_HUES.quiet, marginTop: 6 }} data-testid="chart-legend">
        Bars are past stat values, oldest to newest; the dashed line is the evaluated line.
        Above the line is azure, below is violet, on the line is slate — a neutral pair, not a good/bad scale.
        Did-not-play and ineligible games are dashed ghosts, not evidence in the counts. This is historical fact, not a prediction.
      </figcaption>
    </figure>
  );
}

// V1-6f — VARIANT A "compact exact" (server component).
//
// Single-line scan row: [identity · team] [market + line] -> right-anchored
// §D.2 pill with cap chip + chevron. NO counts (none are projectable; §D.2
// sanctions no short "N/M" form). Provenance, where present, renders as a small
// persistent sub-line (the §D.4 rule 7 copy is verbatim and may not be
// abbreviated, so it cannot share the scan line). Density target: >=6 full rows
// above the fold at 390px (row core ~46px).
//
// One row (index 0) is rendered in a FAKED pressed/hover state so the founder
// feels the interaction without live JS.

import type { BoardProjection } from '../../src/lib/boardProjection';
import { PreviewPill } from './PreviewPill';
import { PREVIEW_HUES } from '../../src/lib/previewVariantStyle';

export function DesignVariantA({ projections }: { projections: ReadonlyArray<BoardProjection> }) {
  return (
    <ul data-testid="variant-a-rows" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
      {projections.map((p, i) => {
        const faked = i === 0;
        return (
          <li
            key={`${p.player}-${p.market}-${i}`}
            data-testid="variant-row"
            data-faked-hover={faked ? 'true' : undefined}
            style={{
              padding: '7px 10px',
              borderBottom: `1px solid ${PREVIEW_HUES.border}`,
              background: faked ? PREVIEW_HUES.panelHover : 'transparent',
              boxShadow: faked ? `inset 2px 0 0 ${PREVIEW_HUES.over}` : 'none',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ flex: '1 1 auto', minWidth: 0, overflow: 'hidden' }}>
                <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  <span style={{ fontWeight: 700, color: PREVIEW_HUES.text, fontSize: 14 }}>{p.player}</span>
                  <span style={{ color: PREVIEW_HUES.quiet, fontSize: 12 }}> · {p.team}</span>
                  <span style={{ color: PREVIEW_HUES.quiet, fontSize: 12 }}>
                    {'  '}{p.market} {p.evaluated_line === null ? '—' : p.evaluated_line}
                  </span>
                </div>
              </div>
              <PreviewPill label={p.classification_label} capTag={p.cap_tag} />
              <span data-testid="chevron" aria-hidden="true" style={{ color: PREVIEW_HUES.quiet, fontSize: 18, flex: '0 0 auto' }}>
                ›
              </span>
            </div>
            {p.provenance_marker !== undefined ? (
              <div data-testid="provenance" style={{ color: PREVIEW_HUES.quiet, fontSize: 11, marginTop: 2 }}>
                {p.provenance_marker}
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

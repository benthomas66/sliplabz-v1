// V1-6f — VARIANT B "two-line evidence" (server component).
//
// Line 1 (loud): identity + team ............ right-anchored §D.2 pill (+cap
//                chip) + chevron.
// Line 2 (quiet): market + evaluated_line, plus the persistent provenance
//                marker where present. NO counts — the projection carries none
//                and §D.2 sanctions no short "N/M" form (recorded for the design
//                review as a separate data-plumbing question).
//
// One row (index 0) is rendered in a FAKED pressed/hover state.

import type { BoardProjection } from '../../src/lib/boardProjection';
import { PreviewPill } from './PreviewPill';
import { PREVIEW_HUES } from '../../src/lib/previewVariantStyle';

export function DesignVariantB({ projections }: { projections: ReadonlyArray<BoardProjection> }) {
  return (
    <ul data-testid="variant-b-rows" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
      {projections.map((p, i) => {
        const faked = i === 0;
        return (
          <li
            key={`${p.player}-${p.market}-${i}`}
            data-testid="variant-row"
            data-faked-hover={faked ? 'true' : undefined}
            style={{
              padding: '9px 10px',
              borderBottom: `1px solid ${PREVIEW_HUES.border}`,
              background: faked ? PREVIEW_HUES.panelHover : 'transparent',
              boxShadow: faked ? `inset 2px 0 0 ${PREVIEW_HUES.over}` : 'none',
            }}
          >
            {/* Line 1 — loud: identity + pill. */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ flex: '1 1 auto', minWidth: 0, overflow: 'hidden' }}>
                <span style={{ fontWeight: 700, color: PREVIEW_HUES.text, fontSize: 15 }}>{p.player}</span>
                <span style={{ color: PREVIEW_HUES.quiet, fontSize: 12 }}> · {p.team}</span>
              </div>
              <PreviewPill label={p.classification_label} capTag={p.cap_tag} />
              <span data-testid="chevron" aria-hidden="true" style={{ color: PREVIEW_HUES.quiet, fontSize: 18, flex: '0 0 auto' }}>
                ›
              </span>
            </div>
            {/* Line 2 — quiet: market + line (+ provenance). */}
            <div style={{ color: PREVIEW_HUES.quiet, fontSize: 12, marginTop: 3 }}>
              <span>{p.market} {p.evaluated_line === null ? '—' : p.evaluated_line}</span>
              {p.provenance_marker !== undefined ? (
                <span data-testid="provenance" style={{ marginLeft: 10 }}>· {p.provenance_marker}</span>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

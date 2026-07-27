// V1-6e Scope B — the DESIGN-PREVIEW route (server component).
//
// A POPULATED Board for the design review and the UX working chat: 23 synthetic
// fixtures → the REAL boardService (ranking via dr20Compare + the committed
// serving gate) → the REAL projection → the REAL BoardTable → plus every
// profile's committed compact explanation below, so the review sees every
// sentence the product can currently say.
//
// ISOLATION (hard boundary #2): the fixture source is selected HERE, by ROUTE,
// entirely server-side. There is no query param, cookie, header, or env flag
// that routes fixture data onto /board. /board imports none of this.
//
// The serving gate runs with an INJECTED serve_now so the near-boundary
// fixtures (age 3300–3400s) render rather than vanish — the review needs to see
// aged rows, and the fixtures are built relative to this same instant.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { getBoardData } from '../../src/lib/server/boardService';
import { FixtureBoardRepository } from '../../src/lib/server/fixtureRepository';
import {
  designFixtureCandidates,
  DESIGN_PREVIEW_BANNER,
  DESIGN_PREVIEW_HEADING,
  DESIGN_PREVIEW_SUBHEADING,
} from '../../src/lib/server/designFixtures';
import { BoardTable } from '../../components/BoardTable';
import { renderCompactExplanation } from '../../../../src/explanation/index';

export default async function DesignPreviewPage() {
  // ONE serve_now for the request; fixtures + gate share it (V1-6d principle).
  const serve_now = new Date().toISOString();
  const candidates = designFixtureCandidates(serve_now);
  const { projections } = await getBoardData(new FixtureBoardRepository(candidates), serve_now);

  // The committed compact explanation for EVERY fixture (rendered from the same
  // real profile_output the projection consumes) — honesty furniture in full.
  const explanations = candidates.map((c) => ({
    player: c.player,
    market: c.market,
    compact: renderCompactExplanation(c.profile_output),
  }));

  return (
    <main style={{ padding: '2rem', maxWidth: 960 }}>
      {/* Persistent, non-dismissible, server-rendered banner (hard boundary #3). */}
      <div
        data-testid="design-preview-banner"
        role="alert"
        style={{
          background: '#7a1020',
          color: '#fff',
          padding: '10px 14px',
          borderRadius: 6,
          fontWeight: 700,
          marginBottom: '1.25rem',
        }}
      >
        {DESIGN_PREVIEW_BANNER}
      </div>

      <h1>{DESIGN_PREVIEW_HEADING}</h1>
      <p style={{ color: '#555', marginTop: 0 }}>{DESIGN_PREVIEW_SUBHEADING}</p>

      <BoardTable projections={projections} />

      <section style={{ marginTop: '2.5rem' }}>
        <h2>Compact explanations (all {explanations.length} fixtures)</h2>
        <p style={{ color: '#555' }}>
          Every sentence the committed renderer currently emits, per profile.
        </p>
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {explanations.map((e, i) => (
            <li key={`${e.player}-${e.market}-${i}`} style={{ borderTop: '1px solid #eee', padding: '10px 0' }}>
              <div style={{ fontWeight: 600 }}>
                {e.player} — {e.market}
              </div>
              <div>{e.compact.compact_display_line}</div>
              {e.compact.provenance_marker !== null ? (
                <div style={{ fontSize: '0.9em', color: '#555' }}>{e.compact.provenance_marker.text}</div>
              ) : null}
              {/* §G.1 disclosure — honesty furniture, rendered server-side (not stripped). */}
              <div style={{ fontSize: '0.85em', color: '#333', marginTop: 4 }}>{e.compact.disclosure_g1.text}</div>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}

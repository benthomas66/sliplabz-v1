// V1-7b — PREVIEW Research View INDEX (design-review artifact). Server component.
//
// Driven by the SEVEN fixture grains (fixtureResearchRepository). Source is
// selected by ROUTE — this preview NEVER reaches hosted. Banner + links to each
// grain's Research View.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { RESEARCH_FIXTURE_GRAINS } from '../../../src/lib/server/fixtureResearchRepository';
import { PREVIEW_HUES } from '../../../src/lib/previewVariantStyle';

export default function ResearchPreviewIndex() {
  return (
    <main style={{ background: PREVIEW_HUES.bg, color: PREVIEW_HUES.text, minHeight: '100vh', padding: '1rem', maxWidth: 390, margin: '0 auto' }}>
      <div data-testid="design-preview-banner" role="alert" style={{ background: '#7a1020', color: '#fff', padding: '10px 14px', borderRadius: 6, fontWeight: 700, marginBottom: '0.9rem' }}>
        DESIGN PREVIEW — FIXTURE DATA. Not live market information.
      </div>
      <h1 style={{ fontSize: 18 }}>Research View — fixture grains</h1>
      <p style={{ color: PREVIEW_HUES.quiet, marginTop: 0 }}>Seven synthetic grains spanning every classification. Tap one to inspect the evidence.</p>
      <ul style={{ listStyle: 'none', padding: 0 }} data-testid="research-index">
        {RESEARCH_FIXTURE_GRAINS.map((g, i) => (
          <li key={i} style={{ borderTop: `1px solid ${PREVIEW_HUES.border}`, padding: '10px 0' }}>
            <a href={`/design-preview/research/${i}`} style={{ color: PREVIEW_HUES.over, textDecoration: 'underline' }}>{g.label}</a>
          </li>
        ))}
      </ul>
    </main>
  );
}

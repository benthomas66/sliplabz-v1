// V1-6f — shared chrome for the design-preview variant pages (server component).
//
// Renders the unchanged DESIGN PREVIEW banner, a small variant label, the
// §G.1 disclosure PAGE-LEVEL (per its placement rule — persistent, adjacent to
// the classification content, never hover-only), and plain navigation links
// between the two variants and back to /design-preview.

import { DESIGN_PREVIEW_BANNER } from '../../src/lib/server/designFixtures';
import { DISCLOSURE_G1_TEXT } from '../../../../src/explanation/index';
import { PREVIEW_HUES } from '../../src/lib/previewVariantStyle';

const linkStyle: React.CSSProperties = { color: PREVIEW_HUES.over, textDecoration: 'underline' };

export function PreviewChrome({ variant }: { variant: 'A' | 'B' }) {
  const other = variant === 'A' ? 'B' : 'A';
  return (
    <header>
      {/* Persistent, non-dismissible, server-rendered banner (unchanged from V1-6e). */}
      <div
        data-testid="design-preview-banner"
        role="alert"
        style={{
          background: '#7a1020', color: '#fff', padding: '10px 14px',
          borderRadius: 6, fontWeight: 700, marginBottom: '0.75rem',
        }}
      >
        {DESIGN_PREVIEW_BANNER}
      </div>

      <div data-testid="variant-label" style={{ fontSize: 13, color: PREVIEW_HUES.quiet, marginBottom: 6 }}>
        Variant {variant}
      </div>

      {/* Plain navigation between the two variants and back to the baseline. */}
      <nav style={{ display: 'flex', gap: 14, fontSize: 13, marginBottom: '0.9rem' }}>
        <a href={`/design-preview/${other.toLowerCase()}`} style={linkStyle}>See Variant {other}</a>
        <a href="/design-preview" style={linkStyle}>Back to baseline</a>
      </nav>

      {/* §G.1 disclosure — PAGE-LEVEL, persistent, not hover-only. */}
      <p
        data-testid="disclosure-g1"
        style={{ fontSize: 12, color: PREVIEW_HUES.quiet, borderTop: `1px solid ${PREVIEW_HUES.border}`, paddingTop: 8, marginTop: 0 }}
      >
        {DISCLOSURE_G1_TEXT}
      </p>
    </header>
  );
}

// V1-6f — /design-preview/b (server component). Variant B "two-line evidence".
//
// Same fixture source and REAL boardService path as /design-preview (fixtures
// selected SERVER-SIDE by route; /board never reaches this). Differs ONLY in
// row presentation. Mobile-first (390px), DARK only.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { getBoardData } from '../../../src/lib/server/boardService';
import { FixtureBoardRepository } from '../../../src/lib/server/fixtureRepository';
import { designFixtureCandidates } from '../../../src/lib/server/designFixtures';
import { PreviewChrome } from '../../../components/preview/PreviewChrome';
import { DesignVariantB } from '../../../components/preview/DesignVariantB';
import { PREVIEW_HUES } from '../../../src/lib/previewVariantStyle';

export default async function DesignPreviewVariantBPage() {
  const serve_now = new Date().toISOString();
  const candidates = designFixtureCandidates(serve_now);
  const { projections } = await getBoardData(new FixtureBoardRepository(candidates), serve_now);

  return (
    <main style={{ background: PREVIEW_HUES.bg, color: PREVIEW_HUES.text, minHeight: '100vh', padding: '1rem', maxWidth: 390, margin: '0 auto' }}>
      <PreviewChrome variant="B" />
      <DesignVariantB projections={projections} />
    </main>
  );
}

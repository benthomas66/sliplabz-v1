// V1-6f — /design-preview/a (server component). Variant A "compact exact".
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
import { DesignVariantA } from '../../../components/preview/DesignVariantA';
import { PREVIEW_HUES } from '../../../src/lib/previewVariantStyle';

export default async function DesignPreviewVariantAPage() {
  const serve_now = new Date().toISOString();
  const candidates = designFixtureCandidates(serve_now);
  const { projections } = await getBoardData(new FixtureBoardRepository(candidates), serve_now);

  return (
    <main style={{ background: PREVIEW_HUES.bg, color: PREVIEW_HUES.text, minHeight: '100vh', padding: '1rem', maxWidth: 390, margin: '0 auto' }}>
      <PreviewChrome variant="A" />
      <DesignVariantA projections={projections} />
    </main>
  );
}

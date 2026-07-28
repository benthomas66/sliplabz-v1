// V1-7b — PRODUCTION Research View route (server component).
//
// Reads HOSTED via PostgresResearchRepository (server-only, transaction pooler).
// Source is selected by ROUTE — this route NEVER reaches fixture data. Method
// selection is the committed server-side constant (fail-loud on unknown).
// Path A only in Phase 1 (no line selector).

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { PostgresResearchRepository } from '../../../../../src/lib/server/researchRepository';
import { constructResearchProjection } from '../../../../../src/lib/researchProjection';
import { ACTIVE_BOARD_METHOD_VERSION } from '../../../../../src/lib/method';
import { ResearchView } from '../../../../../components/research/ResearchView';
import { PREVIEW_HUES } from '../../../../../src/lib/previewVariantStyle';

export default async function ResearchPage({ params }: {
  params: Promise<{ internal_game_id: string; internal_player_id: string; market_key: string }>;
}) {
  const { internal_game_id, internal_player_id, market_key } = await params;
  const serve_now = new Date().toISOString();

  const repo = new PostgresResearchRepository();
  const candidate = await repo.queryResearchGrain(ACTIVE_BOARD_METHOD_VERSION, internal_game_id, internal_player_id, market_key);

  if (candidate === null) {
    // No persisted evidence profile for this grain — the authorized Unavailable
    // state (never a fabricated or approximated evaluation).
    return (
      <main style={{ background: PREVIEW_HUES.bg, color: PREVIEW_HUES.text, minHeight: '100vh', padding: '1rem', maxWidth: 390, margin: '0 auto' }}>
        <h1 style={{ fontSize: 18 }}>Unavailable</h1>
        <p style={{ color: PREVIEW_HUES.quiet }} data-testid="research-unavailable">
          No evidence profile is available for this grain.
        </p>
      </main>
    );
  }

  const projection = constructResearchProjection(candidate);
  return <ResearchView projection={projection} isPreview={false} serveNow={serve_now} />;
}

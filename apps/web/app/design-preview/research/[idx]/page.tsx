// V1-7b — PREVIEW Research View for ONE fixture grain (design-review artifact).
//
// Fixture-driven (fixtureResearchRepository), source selected by ROUTE — NEVER
// reaches hosted. Renders the SAME ResearchView as production, with the banner.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { notFound } from 'next/navigation';
import { FixtureResearchRepository, RESEARCH_FIXTURE_GRAINS } from '../../../../src/lib/server/fixtureResearchRepository';
import { constructResearchProjection } from '../../../../src/lib/researchProjection';
import { ACTIVE_BOARD_METHOD_VERSION } from '../../../../src/lib/method';
import { ResearchView } from '../../../../components/research/ResearchView';

export default async function ResearchPreviewGrain({ params }: { params: Promise<{ idx: string }> }) {
  const { idx } = await params;
  const i = Number.parseInt(idx, 10);
  const grain = Number.isInteger(i) ? RESEARCH_FIXTURE_GRAINS[i] : undefined;
  if (grain === undefined) notFound();

  const serve_now = new Date().toISOString();
  const repo = new FixtureResearchRepository();
  const candidate = await repo.queryResearchGrain(ACTIVE_BOARD_METHOD_VERSION, grain.internal_game_id, grain.internal_player_id, grain.market_key);
  if (candidate === null) notFound();

  const projection = constructResearchProjection(candidate);
  return <ResearchView projection={projection} isPreview={true} serveNow={serve_now} />;
}

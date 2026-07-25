import 'server-only';
// V1-6a Scope C/D — the Board service. Selects the active method, ranks on
// the FULL-PRECISION stored score (reusing the committed `dr20Compare`)
// BEFORE projection, then projects to the allowlisted surface.
//
// After projection the score is gone: the client boundary receives only
// `BoardProjection[]`.

import { dr20Compare } from '../../../../../src/evidence/classification.js';
import { ACTIVE_BOARD_METHOD_VERSION, assertKnownMethodVersion } from '../method.js';
import { constructBoardProjection, type BoardProjection } from '../boardProjection.js';
import type { RankedCandidate } from '../rankedCandidate.js';
import type { BoardRepository } from './boardRepository.js';
import { PostgresBoardRepository } from './boardRepository.js';
import { FixtureBoardRepository } from './fixtureRepository.js';

/**
 * Server-side repository selection. Reads a NON-PUBLIC env var so a fixture
 * data source can be chosen for tests / the serialization audit. This is a
 * DATA-SOURCE choice, never a METHOD-VERSION choice, and is NOT
 * client-controllable (no request/header/cookie/query input). Production and
 * preview leave it unset -> Postgres.
 */
export function chooseBoardRepository(): BoardRepository {
  const source = process.env['BOARD_DATA_SOURCE'];
  if (source === 'fixture') return new FixtureBoardRepository();
  // Empty fixture: demonstrates the EMPTY STATE (today's authoritative v2
  // result) without a hosted connection. The production path reaches the same
  // 0-row empty state via Postgres once the 6543 env is provisioned.
  if (source === 'fixture_empty') return new FixtureBoardRepository([]);
  return new PostgresBoardRepository();
}

export interface BoardData {
  readonly method_version: string;
  readonly projections: ReadonlyArray<BoardProjection>;
}

/**
 * Produce the Board data for the ACTIVE method version. Ranking happens
 * BEFORE projection; the comparator is the committed `dr20Compare` (one
 * owner per metric). A NULL stored score sorts LAST (never treated as zero).
 */
export async function getBoardData(repo: BoardRepository = chooseBoardRepository()): Promise<BoardData> {
  // Fail-loud if the active method were ever mis-configured (v2 authority §7).
  assertKnownMethodVersion(ACTIVE_BOARD_METHOD_VERSION);

  const candidates = await repo.queryRankedCandidates(ACTIVE_BOARD_METHOD_VERSION);

  // Rank on full-precision stored score BEFORE projection. Copy before sort
  // (do not mutate the repository's array).
  const ranked: RankedCandidate[] = [...candidates].sort(dr20Compare);

  // Project AFTER sorting. The score is gone from here on.
  const projections = ranked.map(constructBoardProjection);

  return { method_version: ACTIVE_BOARD_METHOD_VERSION, projections };
}

import 'server-only';
// V1-6a Scope C/D — the Board service. Selects the active method, ranks on
// the FULL-PRECISION stored score (reusing the committed `dr20Compare`)
// BEFORE projection, then projects to the allowlisted surface.
//
// After projection the score is gone: the client boundary receives only
// `BoardProjection[]`.

import { dr20Compare } from '../../../../../src/evidence/classification.js';
import { evaluateV2ServingGate } from '../../../../../src/evidence/v2/servingGate.js';
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

/** One Board row: the allowlisted projection PLUS a server-built research href.
 *  The href carries the grain ids for the SHIPPED research route
 *  (/research/[internal_game_id]/[internal_player_id]/[market_key]) — navigation
 *  context, built server-side; the grain ids are NEVER projection data fields. */
export interface BoardRow {
  readonly projection: BoardProjection;
  readonly research_href: string;
}

export interface BoardData {
  readonly method_version: string;
  readonly projections: ReadonlyArray<BoardProjection>;
  readonly rows: ReadonlyArray<BoardRow>;
}

/**
 * Produce the Board data for the ACTIVE method version.
 *
 * Pipeline (V1-6d): fetch → SERVE-GATE → rank → project.
 *
 *   * SERVE GATE (§5 + D-A1): capture ONE `serve_now` for the whole request
 *     and apply the committed `evaluateV2ServingGate` to every candidate with
 *     that single timestamp — mirroring the one-evaluation_reference_time-per-
 *     batch principle at serve time, so a slow request cannot strand one row
 *     on each side of the 3600s boundary by re-reading the clock. Rows past
 *     the horizon (decision !== 'serve') are DROPPED here, before projection.
 *     The gate is pure and never mutates the persisted classification; this
 *     path only chooses whether to display a row.
 *   * RANK happens BEFORE projection; the comparator is the committed
 *     `dr20Compare` (one owner per metric). A NULL stored score sorts LAST.
 *   * When every fetched row is suppressed, `projections` is empty and the
 *     page renders the approved empty state — identical to zero fetched rows.
 *
 * `serve_now` is injectable for tests (boundary determinism without waiting);
 * production leaves it defaulted to the request instant.
 */
export async function getBoardData(
  repo: BoardRepository = chooseBoardRepository(),
  serve_now: string = new Date().toISOString(),
): Promise<BoardData> {
  // Fail-loud if the active method were ever mis-configured (v2 authority §7).
  assertKnownMethodVersion(ACTIVE_BOARD_METHOD_VERSION);

  const candidates = await repo.queryRankedCandidates(ACTIVE_BOARD_METHOD_VERSION);

  // SERVE GATE: one serve_now, applied to every candidate via the committed
  // gate. Suppressed rows are dropped before ranking/projection. The gate's
  // BOUNDED display_age (≤ the serve horizon for a served row) is captured and
  // carried to the freshness cell (Grammar §2.6) — the DURATION only; the raw
  // line_observed_at stays server-side and is never projected.
  const served = candidates
    .map((c) => ({ candidate: c, gate: evaluateV2ServingGate({ line_observed_at: c.line_observed_at, serve_now }) }))
    .filter((x) => x.gate.decision === 'serve');

  // Rank on full-precision stored score BEFORE projection. Copy before sort
  // (do not mutate the repository's array).
  const ranked = [...served].sort((a, b) => dr20Compare(a.candidate, b.candidate));

  // Project AFTER sorting. The score — and line_observed_at — are gone from here on.
  // The research href is built server-side from the candidate's grain ids (never
  // placed on the projection); it carries navigation context for the shipped
  // research route, distinct from the forbidden evidence-data fields.
  const rows: ReadonlyArray<BoardRow> = ranked.map((x) => ({
    projection: constructBoardProjection(x.candidate, x.gate.display_age_seconds),
    research_href: `/research/${encodeURIComponent(x.candidate.internal_game_id)}/${encodeURIComponent(x.candidate.internal_player_id)}/${encodeURIComponent(x.candidate.market)}`,
  }));

  return { method_version: ACTIVE_BOARD_METHOD_VERSION, projections: rows.map((r) => r.projection), rows };
}

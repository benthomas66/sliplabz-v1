import 'server-only';
// V1-6a Scope C/E — the server-side Board repository.
//
// ONE production Postgres implementation behind an INJECTED interface, so
// tests supply fixture rows without a second production query. Method
// selection is explicit and server-side; an unknown method fails loud.
//
// Ranking (DR-20) is NOT done in SQL: it reuses the committed comparator
// `dr20Compare` on the full-precision stored score, in the service layer,
// BEFORE projection. This module only fetches candidates for one method.

import { getBoardPool } from './db.js';
import { assertKnownMethodVersion, type MethodVersion } from '../method.js';
import type { RankedCandidate } from '../rankedCandidate.js';
import { readEvidenceInputBundlesBatched } from '../../../../../src/evidence/v2/readEvidenceInputs.js';
import type { IngestionLagMetric } from '../../../../../src/ops/ingestionGate.js';
import {
  INGESTION_LAG_GRACE_SECONDS,
  INGESTION_LAG_SUPPRESS_SECONDS,
  USABLE_HLR_COVERAGE_STATES,
  INGESTION_COVERAGE_RECENT_GAMES_N,
} from '../../../../../src/ops/constants.js';
import type { Tx } from '../../../../../src/db/transaction.js';
import type {
  EvidenceProfileOutput,
  ComponentValues,
} from '../../../../../src/evidence/types.js';
import type {
  EvidenceClassification,
  EvidenceDirection,
  EvidenceQualityCapReason,
  EvidenceEvaluatedSourceKind,
} from '../../../../../src/shared/enums.js';

/**
 * The injected boundary. Production wires `PostgresBoardRepository`; tests
 * wire an in-memory fixture implementing the SAME interface.
 */
export interface BoardRepository {
  /** Fetch ranked candidates for EXACTLY one method version. */
  queryRankedCandidates(method: MethodVersion): Promise<ReadonlyArray<RankedCandidate>>;

  /**
   * V1-OP-4 / V1-OP-4c — read-only ingestion-lag probe. Reports TWO metrics
   * against the request's single `serve_now`: Metric A (past-tip games with NO
   * usable `historical_line_results` coverage — the engine's table, DRIVES
   * suppression) and Metric B (past-tip games with NO `player_game_stats` row —
   * REPORTED only). The FIXTURE source is EXEMPT (no live ingestion → reports
   * "current"). Read-only; it NEVER references game status or the newest-final
   * game, and it writes nothing.
   */
  probeIngestionLag(serve_now: string): Promise<IngestionLagMetric>;
}

/**
 * PURE, testable query construction. Filters EXPLICITLY to the given method
 * via a bound parameter — never string-interpolated, never defaulted.
 */
export function buildBoardQuery(method: MethodVersion): { text: string; values: readonly string[] } {
  assertKnownMethodVersion(method); // fail-loud before any query is built
  const text = `
    SELECT ep.evidence_profile_id::text     AS evidence_profile_id,
           ep.internal_game_id::text        AS internal_game_id,
           ep.internal_player_id::text      AS internal_player_id,
           ep.market_key                    AS market_key,
           ep.classification::text          AS classification,
           ep.direction::text               AS direction,
           ep.quality_capped                AS quality_capped,
           ep.quality_cap_reason::text      AS quality_cap_reason,
           ep.includes_backfilled_historical AS includes_backfilled_historical,
           ep.evaluated_line::float8        AS evaluated_line,
           ep.evaluated_source_kind::text   AS evaluated_source_kind,
           ep.evaluated_source_identifier   AS evaluated_source_identifier,
           ep.composite_score::float8       AS composite_score,
           ep.c_rtp::float8                 AS c_rtp,
           ep.c_ms::float8                  AS c_ms,
           ep.c_wa::float8                  AS c_wa,
           ep.c_ma::float8                  AS c_ma,
           p.display_name                   AS player,
           COALESCE(t.display_name, '')     AS team,
           -- R2-3 (GAP-22): ALREADY-KNOWN game context (no lookup/inference).
           g.scheduled_start_utc            AS scheduled_start_utc,
           (g.home_team_id = p.current_team_id) AS is_home,
           COALESCE(t.city, t.display_name) AS player_team_city,
           COALESCE(opp.city, opp.display_name) AS opponent_city,
           COALESCE(cmr.eligible_sportsbook_count, 0)::int AS eligible_sportsbook_count,
           cmr.line_consensus_point::float8 AS consensus_point,
           cmr.line_min_point::float8       AS min_point,
           cmr.line_max_point::float8       AS max_point,
           cmr.point_distribution           AS point_distribution,
           cmr.freshness_state::text        AS freshness_state,
           lo.line_observed_at              AS line_observed_at
      FROM evidence_profiles ep
      JOIN players p            ON p.internal_player_id = ep.internal_player_id
      LEFT JOIN teams t         ON t.internal_team_id = p.current_team_id
      LEFT JOIN games g         ON g.internal_game_id = ep.internal_game_id
      LEFT JOIN teams opp       ON opp.internal_team_id =
        CASE WHEN g.home_team_id = p.current_team_id THEN g.away_team_id ELSE g.home_team_id END
      LEFT JOIN LATERAL (
        SELECT c.eligible_sportsbook_count, c.line_consensus_point, c.line_min_point,
               c.line_max_point, c.point_distribution, c.freshness_state
          FROM current_market_rows c
         WHERE c.internal_game_id = ep.internal_game_id
           AND c.internal_player_id = ep.internal_player_id
           AND c.market_key = ep.market_key
         ORDER BY c.computation_version DESC
         LIMIT 1
      ) cmr ON true
      -- V1-6d serve-gate input, PROFILE-BOUNDED (V1-6d REVISE). The freshest
      -- self-observed current_poll observation for this grain, but bounded by
      -- THIS profile's own evaluation_reference_time: only observations at or
      -- before the instant the profile was classified are eligible. A newer
      -- successful poll whose populate did NOT produce a fresh profile (e.g. a
      -- failed populate after a successful poll) therefore CANNOT rejuvenate
      -- this older profile at serve time — the row stays as stale as the data
      -- that actually backs it. Read-only; it re-reads persisted facts and does
      -- NOT recompute the gate decision (that is the committed
      -- evaluateV2ServingGate, called once in boardService). The observed_at
      -- bound is the profile's timing anchor, NOT a second suppression threshold.
      LEFT JOIN LATERAL (
        SELECT max(ms.observed_at) AS line_observed_at
          FROM market_offerings mo
          JOIN market_snapshots ms ON ms.market_snapshot_id = mo.market_snapshot_id
         WHERE ms.linked_internal_game_id = ep.internal_game_id
           AND mo.internal_player_id = ep.internal_player_id
           AND ms.market_key = ep.market_key
           AND ms.request_kind = 'current_poll'
           AND ms.provenance = 'self_observed'
           AND ms.observed_at <= ep.evaluation_reference_time
      ) lo ON true
     WHERE ep.method_version = $1`;
  return { text, values: [method] };
}

interface PointDistEntry { point: number; book_count?: number; count?: number }
interface BoardQueryRow {
  evidence_profile_id: string;
  internal_game_id: string;
  internal_player_id: string;
  market_key: string;
  classification: EvidenceClassification;
  direction: EvidenceDirection | null;
  quality_capped: boolean;
  quality_cap_reason: EvidenceQualityCapReason;
  includes_backfilled_historical: boolean;
  evaluated_line: number | null;
  evaluated_source_kind: EvidenceEvaluatedSourceKind | null;
  evaluated_source_identifier: string | null;
  composite_score: number | null;
  c_rtp: number | null;
  c_ms: number | null;
  c_wa: number | null;
  c_ma: number | null;
  player: string;
  team: string;
  scheduled_start_utc: string | Date | null;
  is_home: boolean | null;
  player_team_city: string | null;
  opponent_city: string | null;
  eligible_sportsbook_count: number;
  consensus_point: number | null;
  min_point: number | null;
  max_point: number | null;
  point_distribution: ReadonlyArray<PointDistEntry> | null;
  freshness_state: string | null;
  line_observed_at: string | Date | null;
}

/**
 * Map a raw DB row -> internal ranked candidate.
 *
 * The compact Board surface is driven by COLUMNS (classification,
 * quality_cap_reason, includes_backfilled_historical) — NOT by the reasons
 * list — so `profile_output.reasons` is left empty here; that is correct
 * for the compact renderer (whose only use of `reasons` is the
 * abnormal_dispersion guard, which v2 rows can never trip). A Research View
 * would hydrate reasons; that is out of this slice.
 *
 * DEVIATION (reported): `l10_eligible_n` is not persisted on the evidence
 * row, so it is set to 0 here. This is INERT: hosted holds 0 v2 rows so no
 * hosted ranking runs this ticket, and the DR-20 L10 tie-break is consulted
 * only on an exact composite-score tie. The tie-break logic itself is the
 * committed `dr20Compare`, fully exercised by fixtures.
 */
function rowToCandidate(row: BoardQueryRow, method: MethodVersion): RankedCandidate {
  const components: ComponentValues = {
    c_rtp: row.c_rtp,
    c_ms: row.c_ms,
    c_wa: row.c_wa,
    c_ma: row.c_ma,
    composite_score: row.composite_score,
    direction: row.direction,
    c_rtp_non_l5_magnitude: null,
    longer_window_choice: null,
  };
  const profile_output: EvidenceProfileOutput = {
    classification: row.classification,
    direction: row.direction,
    components,
    quality_capped: row.quality_capped,
    quality_cap_reason: row.quality_cap_reason,
    includes_backfilled_historical: row.includes_backfilled_historical,
    evaluated_line: row.evaluated_line,
    evaluated_source_kind: row.evaluated_source_kind,
    evaluated_source_identifier: row.evaluated_source_identifier,
    reasons: [],
    method_version: 'evidence_method_v1',
  };
  return {
    composite_score: row.composite_score,
    l10_eligible_n: 0,
    eligible_sportsbook_count: row.eligible_sportsbook_count,
    internal_game_id: row.internal_game_id,
    internal_player_id: row.internal_player_id,
    evidence_profile_id: row.evidence_profile_id,
    // R2-3: build game context ONLY when all already-known fields are present;
    // never fabricate a matchup/tipoff.
    game_context: (row.scheduled_start_utc !== null && row.is_home !== null && row.opponent_city !== null && row.player_team_city !== null)
      ? {
          player_team: row.player_team_city,
          opponent: row.opponent_city,
          is_home: row.is_home,
          scheduled_start_utc: row.scheduled_start_utc instanceof Date ? row.scheduled_start_utc.toISOString() : row.scheduled_start_utc,
        }
      : undefined,
    // V1-8a1 SERVER-SIDE band context (consensus distribution/range/count +
    // freshness state) from the persisted current_market_row. Distribution is
    // point→count (non-economic); no paid per-book handle.
    consensus: {
      consensus_point: row.consensus_point,
      min_point: row.min_point,
      max_point: row.max_point,
      book_count: row.eligible_sportsbook_count,
      distribution: (row.point_distribution ?? []).map((d) => ({
        point: d.point, count: d.count ?? d.book_count ?? 0,
      })),
      freshness_state: row.freshness_state,
    },
    method_version: method,
    // Normalise the audit-chain observation time to ISO; null stays null
    // (grain with no self_observed current_poll offering → gate suppresses).
    line_observed_at:
      row.line_observed_at instanceof Date
        ? row.line_observed_at.toISOString()
        : row.line_observed_at,
    player: row.player,
    team: row.team,
    market: row.market_key,
    evaluated_line: row.evaluated_line,
    profile_output,
    paid_book_offerings: [], // free-tier Board never fetches paid offering detail
  };
}

/**
 * The `coverage_state IN (...)` SQL fragment, rendered from the ops constant
 * `USABLE_HLR_COVERAGE_STATES` so the gate has ONE source of truth for the
 * engine's usable-coverage set. These values are compile-time constants (never
 * user input), so string-building the IN list carries no injection risk. The
 * drift-tripwire test binds this set to the engine readers' inline predicate.
 */
const USABLE_HLR_COVERAGE_IN_LIST = USABLE_HLR_COVERAGE_STATES.map((s) => `'${s}'`).join(', ');

/**
 * V1-OP-4 / V1-OP-4c — PURE, testable construction of the read-only
 * ingestion-lag probe query. Computes TWO metrics against one `serve_now`
 * (future games excluded from both; NEVER references game `status` or a
 * newest-final game — finalization is itself broken, so a status gate would
 * never fire). Grace (48h) and suppress (96h) seconds are BOUND parameters from
 * the ops constants, so the SQL counts and the pure decision share one source
 * of truth. Read-only.
 *
 *   METRIC A — engine coverage (DRIVES suppression). `coverage_unresolved(g)` =
 *   `games.scheduled_start_utc < serve_now` AND NOT EXISTS a
 *   `historical_line_results` row for that `internal_game_id` with a
 *   `coverage_state` in `USABLE_HLR_COVERAGE_STATES` — the exact table+predicate
 *   the engine's threshold windows read (GAP-26 re-anchor). A restored box score
 *   with no usable closing line therefore CANNOT lift suppression.
 *
 *   METRIC B — box-score absence (REPORTED only). `pgs_absent(g)` =
 *   `games.scheduled_start_utc < serve_now` AND NOT EXISTS a `player_game_stats`
 *   row (the original V1-OP-4 metric, retained verbatim as a distinct
 *   diagnostic). It does NOT drive the decision.
 */
export function buildIngestionLagQuery(serve_now: string): {
  text: string;
  values: readonly (string | number)[];
} {
  const text = `
    WITH recent_games AS (
      -- V1-OP-4c LOWER BOUND: both metrics are measured over only the N most
      -- recent past-tip games league-wide (game-count, never calendar — a
      -- calendar window would scroll a live stall out of view). This excludes
      -- ancient permanent holes so the gate can LIFT once recent ingestion is
      -- healthy, while a live stall stays inside the window by construction.
      SELECT g.internal_game_id, g.scheduled_start_utc
        FROM games g
       WHERE g.scheduled_start_utc < $1::timestamptz
       ORDER BY g.scheduled_start_utc DESC, g.internal_game_id DESC
       LIMIT $4
    ),
    coverage_unresolved AS (
      SELECT rg.scheduled_start_utc AS tip
        FROM recent_games rg
       WHERE NOT EXISTS (
           SELECT 1 FROM historical_line_results hlr
            WHERE hlr.internal_game_id = rg.internal_game_id
              AND hlr.coverage_state IN (${USABLE_HLR_COVERAGE_IN_LIST})
         )
    ),
    pgs_absent AS (
      SELECT rg.scheduled_start_utc AS tip
        FROM recent_games rg
       WHERE NOT EXISTS (
           SELECT 1 FROM player_game_stats pgs
            WHERE pgs.internal_game_id = rg.internal_game_id
         )
    )
    SELECT
      -- Metric A — engine coverage (DRIVES suppression)
      (SELECT count(*) FILTER (
         WHERE tip < ($1::timestamptz - make_interval(secs => $2))
       )::int FROM coverage_unresolved) AS coverage_unresolved_past_grace_48h,
      (SELECT count(*) FILTER (
         WHERE tip < ($1::timestamptz - make_interval(secs => $3))
       )::int FROM coverage_unresolved) AS coverage_unresolved_past_fire_96h,
      (SELECT min(tip) FROM coverage_unresolved) AS oldest_coverage_unresolved_tip,
      (
        SELECT max(g2.scheduled_start_utc) FROM games g2
         WHERE EXISTS (
           SELECT 1 FROM historical_line_results h2
            WHERE h2.internal_game_id = g2.internal_game_id
              AND h2.coverage_state IN (${USABLE_HLR_COVERAGE_IN_LIST})
         )
      ) AS newest_usable_coverage_game,
      -- Metric B — box-score absence (REPORTED only)
      (SELECT count(*) FILTER (
         WHERE tip < ($1::timestamptz - make_interval(secs => $2))
       )::int FROM pgs_absent) AS pgs_absent_past_grace_48h,
      (SELECT count(*) FILTER (
         WHERE tip < ($1::timestamptz - make_interval(secs => $3))
       )::int FROM pgs_absent) AS pgs_absent_past_fire_96h,
      (SELECT min(tip) FROM pgs_absent) AS oldest_pgs_absent_tip`;
  return { text, values: [serve_now, INGESTION_LAG_GRACE_SECONDS, INGESTION_LAG_SUPPRESS_SECONDS, INGESTION_COVERAGE_RECENT_GAMES_N] };
}

interface IngestionLagRow {
  coverage_unresolved_past_grace_48h: number;
  coverage_unresolved_past_fire_96h: number;
  oldest_coverage_unresolved_tip: string | Date | null;
  newest_usable_coverage_game: string | Date | null;
  pgs_absent_past_grace_48h: number;
  pgs_absent_past_fire_96h: number;
  oldest_pgs_absent_tip: string | Date | null;
}

function toIso(v: string | Date | null): string | null {
  if (v === null) return null;
  return v instanceof Date ? v.toISOString() : v;
}

export class PostgresBoardRepository implements BoardRepository {
  async probeIngestionLag(serve_now: string): Promise<IngestionLagMetric> {
    const { text, values } = buildIngestionLagQuery(serve_now);
    const pool = getBoardPool();
    const res = await pool.query(text, values as unknown[]);
    const row = (res.rows[0] ?? {
      coverage_unresolved_past_grace_48h: 0,
      coverage_unresolved_past_fire_96h: 0,
      oldest_coverage_unresolved_tip: null,
      newest_usable_coverage_game: null,
      pgs_absent_past_grace_48h: 0,
      pgs_absent_past_fire_96h: 0,
      oldest_pgs_absent_tip: null,
    }) as IngestionLagRow;
    return {
      source_kind: 'postgres',
      coverage_unresolved_past_grace_48h: row.coverage_unresolved_past_grace_48h,
      coverage_unresolved_past_fire_96h: row.coverage_unresolved_past_fire_96h,
      oldest_coverage_unresolved_tip: toIso(row.oldest_coverage_unresolved_tip),
      newest_usable_coverage_game: toIso(row.newest_usable_coverage_game),
      pgs_absent_past_grace_48h: row.pgs_absent_past_grace_48h,
      pgs_absent_past_fire_96h: row.pgs_absent_past_fire_96h,
      oldest_pgs_absent_tip: toIso(row.oldest_pgs_absent_tip),
    };
  }

  async queryRankedCandidates(method: MethodVersion): Promise<ReadonlyArray<RankedCandidate>> {
    assertKnownMethodVersion(method);
    const { text, values } = buildBoardQuery(method);
    const pool = getBoardPool();
    // QUERY SHAPE (V1-8a1, no N+1): 1 base query + 3 bounded bundle queries
    // (window aggregates + source identities + series, each ANY($ids)) via the
    // committed V1-8a0 batched reader — 4 total for ANY row count. Join key is
    // evidence_profile_id (server-side). The pool satisfies the `Tx` interface.
    const res = await pool.query(text, values as unknown[]);
    const base = (res.rows as BoardQueryRow[]).map((r) => rowToCandidate(r, method));
    const ids = base.map((c) => c.evidence_profile_id!).filter((id): id is string => typeof id === 'string');
    const bundles = await readEvidenceInputBundlesBatched(pool as unknown as Tx, ids);
    return base.map((c) => ({ ...c, bundle: bundles.get(c.evidence_profile_id!) }));
  }
}

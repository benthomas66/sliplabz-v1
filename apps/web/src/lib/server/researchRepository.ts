import 'server-only';
// V1-7a — the server-side RESEARCH repository (sibling of BoardRepository).
//
// REPOSITORY CHOICE (justified): a SIBLING interface, NOT an extension of
// `BoardRepository`. Extending BoardRepository would edit `boardRepository.ts`,
// a production /board file, breaking this ticket's byte-identical Board rail.
// A sibling keeps the Board path untouched and gives research its own,
// single-grain query shape.
//
// Assembly (NO new computation, NO engine change):
//   * the AUTHORITATIVE graded output (classification, direction, components incl.
//     composite score, caps, and the DR-26 reason set) is READ from the persisted
//     `evidence_profiles` + `evidence_profile_reasons` — the durable result the
//     system decided. (Re-running the engine is rejected: for an aged grain the
//     committed v2 engine returns `beyond_horizon` with NO profile.)
//   * the evidence CONTEXT (four threshold windows + composed current-market row +
//     line_observed_at) is REBUILT by the COMMITTED read-model builder core
//     `makeReadModelInputBuilderV2Core`. Same owner the populator uses; no fork.
//
// Server-only, transaction pooler, no browser-reachable path. Method selection is
// explicit, server-side, fail-loud on unknown (ACTIVE_BOARD_METHOD_VERSION discipline).
//
// GOVERNOR NOTE (V1-8a0b, 2026-07-28): the per-game historical-series reader was
// PROMOTED out of this app repository into the shared, src-owned owner
// `src/computation/historicalSeriesRead.ts` (`readHistoricalSeries`). The
// Research View now CONSUMES it; it no longer owns the SQL or the semantics. The
// eligibility/DNP semantics remain the persisted output of the committed
// `src/bdl/eligibility.ts computeEligibility`, borrowed inside the shared reader.

import type { SliplabzPool } from '../../../../../src/db/connection.js';
import { withTransaction } from '../../../../../src/db/transaction.js';
import { getBoardPool } from './db.js';
import { makeReadModelInputBuilderV2Core } from '../../../../../src/evidence/driver/readModelInputBuilder.js';
import { readHistoricalSeries } from '../../../../../src/computation/historicalSeriesRead.js';
import type { EvidenceGrain } from '../../../../../src/evidence/driver/populate.js';
import type { EvidenceProfileOutput, ComponentValues, AttachedReason } from '../../../../../src/evidence/types.js';
import type {
  EvidenceClassification, EvidenceDirection, EvidenceQualityCapReason,
  EvidenceEvaluatedSourceKind, EvidenceReasonCode, EvidenceReasonCategory,
} from '../../../../../src/shared/enums.js';
import { assertKnownMethodVersion, type MethodVersion } from '../method.js';
import type { ResearchCandidate } from '../researchCandidate.js';

/** The injected boundary. Production wires `PostgresResearchRepository`; tests
 *  wire an in-memory fixture implementing the SAME interface. */
export interface ResearchRepository {
  /** Assemble the research candidate for EXACTLY one grain + method version,
   *  or null when no persisted profile exists for it. */
  queryResearchGrain(
    method: MethodVersion,
    internal_game_id: string,
    internal_player_id: string,
    market_key: string,
  ): Promise<ResearchCandidate | null>;
}

interface ProfileRow {
  id: string;
  classification: EvidenceClassification;
  direction: EvidenceDirection | null;
  evaluated_line: number | null;
  evaluated_source_kind: EvidenceEvaluatedSourceKind | null;
  evaluated_source_identifier: string | null;
  quality_capped: boolean;
  quality_cap_reason: EvidenceQualityCapReason;
  includes_backfilled_historical: boolean;
  composite_score: number | null;
  c_rtp: number | null; c_ms: number | null; c_wa: number | null; c_ma: number | null;
  srmcv: number;
  method_version: string;
  computation_version: number;
}

export class PostgresResearchRepository implements ResearchRepository {
  async queryResearchGrain(
    method: MethodVersion,
    internal_game_id: string,
    internal_player_id: string,
    market_key: string,
  ): Promise<ResearchCandidate | null> {
    assertKnownMethodVersion(method); // fail-loud before any query

    // App-local pool (transaction pooler, `SLIPLABZ_BOARD_DATABASE_URL`) — the
    // SAME one-owner pg wiring the Board uses. This deliberately avoids importing
    // the root `openPool` (which value-imports `pg` and is unresolvable from the
    // repo-root path in the app build). `withTransaction` is pg-free (type-only).
    const pgPool = getBoardPool();
    const pool: SliplabzPool = {
      raw: pgPool,
      query: (sql, params) => (params === undefined ? pgPool.query(sql) : pgPool.query(sql, params)),
      connect: () => pgPool.connect(),
      end: () => pgPool.end(),
    };
    {
      return await withTransaction(pool, async (tx) => {
        // 1) AUTHORITATIVE graded output — persisted profile (latest computation_version).
        const pr = await tx.query(
          `SELECT ep.evidence_profile_id::text AS id,
                  ep.classification::text AS classification,
                  ep.direction::text AS direction,
                  ep.evaluated_line::float8 AS evaluated_line,
                  ep.evaluated_source_kind::text AS evaluated_source_kind,
                  ep.evaluated_source_identifier AS evaluated_source_identifier,
                  ep.quality_capped AS quality_capped,
                  ep.quality_cap_reason::text AS quality_cap_reason,
                  ep.includes_backfilled_historical AS includes_backfilled_historical,
                  ep.composite_score::float8 AS composite_score,
                  ep.c_rtp::float8 AS c_rtp, ep.c_ms::float8 AS c_ms,
                  ep.c_wa::float8 AS c_wa, ep.c_ma::float8 AS c_ma,
                  ep.source_read_model_computation_version AS srmcv,
                  ep.method_version AS method_version,
                  ep.computation_version AS computation_version
             FROM evidence_profiles ep
            WHERE ep.method_version = $1
              AND ep.internal_game_id = $2::uuid
              AND ep.internal_player_id = $3::uuid
              AND ep.market_key = $4
            ORDER BY ep.computation_version DESC
            LIMIT 1`,
          [method, internal_game_id, internal_player_id, market_key],
        );
        if (pr.rowCount === 0) return null;
        const row = pr.rows[0] as ProfileRow;

        const rs = await tx.query(
          `SELECT reason_code::text AS reason_code, category::text AS category,
                  intra_category_rank AS intra_category_rank,
                  contribution_magnitude::float8 AS contribution_magnitude
             FROM evidence_profile_reasons
            WHERE evidence_profile_id = $1::uuid
            ORDER BY category, intra_category_rank`,
          [row.id],
        );
        const reasons: ReadonlyArray<AttachedReason> = (rs.rows as ReadonlyArray<{
          reason_code: EvidenceReasonCode; category: EvidenceReasonCategory;
          intra_category_rank: number; contribution_magnitude: number | null;
        }>).map((r) => ({
          reason_code: r.reason_code, category: r.category,
          intra_category_rank: r.intra_category_rank,
          contribution_magnitude: r.contribution_magnitude,
        }));

        // 2) evidence CONTEXT — committed builder core (windows + market + line_observed_at).
        const grain: EvidenceGrain = {
          internal_game_id, internal_player_id, market_key,
          current_market_row_id: '', // audit-only in the builder; research reads windows/market/line, not audit
          source_read_model_computation_version: row.srmcv,
        };
        const today = new Date().toISOString().slice(0, 10);
        const built = await makeReadModelInputBuilderV2Core({ today_utc_date: today, reference_date: today })(grain, tx);
        if (built === null) return null; // market_key outside the launch set

        // 3) identity + game context (tipoff + matchup opponent; V1-8b). No new
        //    computation — an ALREADY-KNOWN game-context read for display.
        const idr = await tx.query(
          `SELECT p.display_name AS player, COALESCE(t.display_name, '') AS team,
                  g.scheduled_start_utc AS tipoff,
                  (g.home_team_id = p.current_team_id) AS is_home,
                  COALESCE(t.city, t.display_name) AS player_team_city,
                  COALESCE(opp.city, opp.display_name) AS opponent_city
             FROM players p
             LEFT JOIN teams t ON t.internal_team_id = p.current_team_id
             JOIN games g ON g.internal_game_id = $1::uuid
             LEFT JOIN teams opp ON opp.internal_team_id =
               CASE WHEN g.home_team_id = p.current_team_id THEN g.away_team_id ELSE g.home_team_id END
            WHERE p.internal_player_id = $2::uuid`,
          [internal_game_id, internal_player_id],
        );
        const idrow = (idr.rows[0] ?? { player: '', team: '', tipoff: null, is_home: null, player_team_city: null, opponent_city: null }) as { player: string; team: string; tipoff: string | Date | null; is_home: boolean | null; player_team_city: string | null; opponent_city: string | null };
        const tipoff_utc = idrow.tipoff instanceof Date ? idrow.tipoff.toISOString() : idrow.tipoff;

        const components: ComponentValues = {
          c_rtp: row.c_rtp, c_ms: row.c_ms, c_wa: row.c_wa, c_ma: row.c_ma,
          composite_score: row.composite_score, direction: row.direction,
          c_rtp_non_l5_magnitude: null, longer_window_choice: null,
        };
        const profile_output: EvidenceProfileOutput = {
          classification: row.classification, direction: row.direction, components,
          quality_capped: row.quality_capped, quality_cap_reason: row.quality_cap_reason,
          includes_backfilled_historical: row.includes_backfilled_historical,
          evaluated_line: row.evaluated_line, evaluated_source_kind: row.evaluated_source_kind,
          evaluated_source_identifier: row.evaluated_source_identifier,
          reasons, method_version: 'evidence_method_v1',
        };

        // DR-19(c) — source the method + computation version from the PERSISTED
        // row (not the input param), fail-loud if the stored value is unknown.
        assertKnownMethodVersion(row.method_version);
        const series = await readHistoricalSeries(tx, internal_game_id, internal_player_id, market_key);

        return {
          method_version: row.method_version,
          computation_version: row.computation_version,
          player: idrow.player, team: idrow.team, market: market_key,
          evaluated_line: row.evaluated_line, tipoff_utc,
          opponent_city: idrow.opponent_city, player_team_city: idrow.player_team_city, is_home: idrow.is_home,
          profile_output,
          windows: built.input.threshold_windows,
          series,
          current_market_row: built.input.current_market_row,
          line_observed_at: built.line_observed_at,
        };
      });
    }
  }
}

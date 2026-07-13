// V1-4b Stage 2 — event→game resolution for the historical seed pipeline.
//
// Authority anchors:
//   Complete spec §7.2 (event mapping — ordered home/away resolution,
//     exact-time match, unique within 15-minute tolerance, else queue)
//   Odds API sub-spec §6, §6.1 (mapping policy — mapping table + queue,
//     auto-approval requires uniqueness)
//   docs/product/reports/V1_4B_STAGE2_PHASE_A_REPORT.md §A2 (the wiring
//     gap identified in Phase A — the Stage 1 probe never resolved events,
//     the integration test fixture-seeded them, no code path bridged
//     OddsAPI event ids into internal games).
//
// This module is the wiring for Phase B. It:
//   1. Loads the reconciliation context (approved provider_teams for the
//      given provider + candidate internal games in the commence-time window)
//      from the hosted DB.
//   2. Delegates to V1-1's `reconcileEvent` (never reimplemented).
//   3. Flattens `approved` into `resolved_exact | resolved_tolerance` for
//      the seed layer, and flattens both `queued` and `quarantined` into a
//      single `queued` outcome carrying the V1-1 reason. Both outcomes are
//      audit-preserving.
//   4. Persists the decision:
//        - resolved → provider_games (mapping_state='approved',
//          internal_game_id set, time_delta_seconds populated),
//          plus a mapping_history row.
//        - queued   → event_reconciliation_queue row with the V1-1 reason
//          and detail. Idempotent: if an OPEN row already exists for
//          (provider, provider_game_id), the queue insert is skipped.
//
// The seed pipeline's coverage report treats `queued` events as
// excluded-with-reason at the SLICE level: no event-odds request is
// issued for a queued event; every affected (slate_date, market, book)
// slice records the exclusion with the queue reason.

import { randomUUID } from 'node:crypto';
import type { SliplabzPool } from '../../db/connection.js';
import { reconcileEvent, type EventReconciliationContext } from '../../identity/eventReconciliation.js';
import type {
  EventReconciliationInput,
  InternalGame,
  ProviderTeam,
} from '../../identity/types.js';
import type { Provider } from '../../shared/enums.js';

/** Widen the tolerance window when loading candidate internal games from
 *  the DB. reconcileEvent enforces the ±15-minute rule; loading a wider
 *  window ensures we don't miss a candidate that reconcileEvent would
 *  then evaluate. 60 minutes is a comfortable superset. */
const CANDIDATE_LOAD_WINDOW_MINUTES = 60;

// -- Seed-layer outcome (flattened from V1-1's tagged union) ----------------

export type SeedEventResolutionOutcome =
  | {
      readonly kind: 'resolved_exact';
      readonly internal_game_id: string;
      readonly time_delta_seconds: 0;
      readonly candidate_internal_game_ids: readonly string[];
    }
  | {
      readonly kind: 'resolved_tolerance';
      readonly internal_game_id: string;
      readonly time_delta_seconds: number;
      readonly candidate_internal_game_ids: readonly string[];
    }
  | {
      readonly kind: 'queued';
      /** The V1-1 event-queue reason, preserved verbatim. */
      readonly reason:
        | 'unmatched'
        | 'ambiguous_multiple_candidates'
        | 'unresolved_provider_team'
        | 'time_window_exceeded'
        | 'ordered_teams_disagree'
        | 'self_match_invalid';
      readonly reason_detail: string;
      readonly candidate_internal_game_ids: readonly string[];
      /** Whether the underlying V1-1 outcome was 'queued' (still open in
       *  the review sense) or 'quarantined' (evidence-strong exclusion).
       *  Used only for logging / audit; both map to a queue-side row. */
      readonly source_kind: 'queued' | 'quarantined';
    };

/**
 * Wire the seed pipeline's event→game resolution through V1-1's
 * `reconcileEvent`. Pure: no I/O. Takes a fully-formed context so tests
 * can assert exact behavior.
 */
export function resolveOddsapiEventForSeed(
  input: EventReconciliationInput,
  ctx: EventReconciliationContext
): SeedEventResolutionOutcome {
  const outcome = reconcileEvent(input, ctx);
  if (outcome.kind === 'approved') {
    if (outcome.match_method === 'exact_time') {
      return Object.freeze({
        kind: 'resolved_exact' as const,
        internal_game_id: outcome.internal_game_id,
        time_delta_seconds: 0 as const,
        candidate_internal_game_ids: outcome.candidate_internal_game_ids,
      });
    }
    return Object.freeze({
      kind: 'resolved_tolerance' as const,
      internal_game_id: outcome.internal_game_id,
      time_delta_seconds: outcome.time_delta_seconds,
      candidate_internal_game_ids: outcome.candidate_internal_game_ids,
    });
  }
  // queued OR quarantined — both go to the event_reconciliation_queue.
  return Object.freeze({
    kind: 'queued' as const,
    reason: outcome.reason,
    reason_detail: outcome.reason_detail,
    candidate_internal_game_ids: outcome.candidate_internal_game_ids,
    source_kind: outcome.kind,
  });
}

// -- DB context loader ------------------------------------------------------

export interface LoadSeedResolutionContextInput {
  readonly provider: Provider;
  readonly raw_commence_time_utc: string; // ISO-8601
}

export async function loadSeedResolutionContext(
  pool: SliplabzPool,
  input: LoadSeedResolutionContextInput
): Promise<EventReconciliationContext> {
  // Approved provider_teams for the given provider — the only rows
  // reconcileEvent uses for team resolution.
  const teamRes = await pool.query(
    `SELECT provider, provider_team_id, internal_team_id,
            raw_full_name, raw_name, raw_abbreviation, raw_city, raw_conference,
            classification, mapping_state
       FROM provider_teams
       WHERE provider = $1 AND mapping_state = 'approved'`,
    [input.provider]
  );
  const provider_teams: ReadonlyArray<ProviderTeam> = Object.freeze(
    teamRes.rows.map((r) => Object.freeze({
      provider: (r as { provider: Provider }).provider,
      provider_team_id: (r as { provider_team_id: string }).provider_team_id,
      internal_team_id: (r as { internal_team_id: string | null }).internal_team_id,
      raw_full_name: (r as { raw_full_name: string }).raw_full_name,
      raw_name: (r as { raw_name: string }).raw_name,
      raw_abbreviation: (r as { raw_abbreviation: string }).raw_abbreviation,
      raw_city: (r as { raw_city: string }).raw_city,
      raw_conference: (r as { raw_conference: string | null }).raw_conference,
      classification: (r as { classification: ProviderTeam['classification'] }).classification,
      mapping_state: (r as { mapping_state: ProviderTeam['mapping_state'] }).mapping_state,
    }))
  );

  // Candidate internal games — a comfortable window around commence_time.
  const commenceMs = new Date(input.raw_commence_time_utc).getTime();
  const windowMs = CANDIDATE_LOAD_WINDOW_MINUTES * 60 * 1000;
  const windowStart = new Date(commenceMs - windowMs).toISOString();
  const windowEnd = new Date(commenceMs + windowMs).toISOString();
  const gameRes = await pool.query(
    `SELECT internal_game_id, season, season_type, home_team_id, away_team_id,
            scheduled_start_utc, actual_start_utc, status, postseason
       FROM games
       WHERE scheduled_start_utc >= $1 AND scheduled_start_utc <= $2`,
    [windowStart, windowEnd]
  );
  const internal_games: ReadonlyArray<InternalGame> = Object.freeze(
    gameRes.rows.map((r) => {
      const row = r as {
        internal_game_id: string;
        season: number;
        season_type: number;
        home_team_id: string;
        away_team_id: string;
        scheduled_start_utc: Date | string;
        actual_start_utc: Date | string | null;
        status: InternalGame['status'];
        postseason: boolean;
      };
      const scheduled = row.scheduled_start_utc instanceof Date
        ? row.scheduled_start_utc.toISOString()
        : row.scheduled_start_utc;
      const actual = row.actual_start_utc === null
        ? null
        : row.actual_start_utc instanceof Date
          ? row.actual_start_utc.toISOString()
          : row.actual_start_utc;
      return Object.freeze({
        internal_game_id: row.internal_game_id,
        season: row.season,
        season_type: (row.season_type === 3 ? 3 : 2) as 2 | 3,
        home_team_id: row.home_team_id,
        away_team_id: row.away_team_id,
        scheduled_start_utc: scheduled,
        actual_start_utc: actual,
        status: row.status,
        postseason: row.postseason,
      });
    })
  );

  return Object.freeze({ provider_teams, internal_games });
}

// -- DB persistence ---------------------------------------------------------

export interface PersistSeedEventResolutionResult {
  readonly kind: 'wrote_provider_games' | 'wrote_queue' | 'skipped_queue_duplicate';
  readonly provider_games_row_id: string | null;
  readonly queue_row_id: string | null;
}

/**
 * Persist a seed event resolution decision. Idempotent:
 *   * On resolved outcomes: upserts provider_games by
 *     (provider, provider_game_id). Never regresses a mapping_state.
 *   * On queued outcomes: refuses to insert a duplicate open queue row for
 *     the same (provider, provider_game_id).
 */
export async function persistSeedEventResolution(
  pool: SliplabzPool,
  input: EventReconciliationInput,
  outcome: SeedEventResolutionOutcome
): Promise<PersistSeedEventResolutionResult> {
  if (outcome.kind === 'resolved_exact' || outcome.kind === 'resolved_tolerance') {
    // Upsert provider_games.
    const existing = await pool.query(
      `SELECT provider_game_row_id, internal_game_id, mapping_state
         FROM provider_games
         WHERE provider = $1 AND provider_game_id = $2`,
      [input.provider, input.provider_game_id]
    );
    if (existing.rowCount === 0) {
      const rowId = randomUUID();
      await pool.query(
        `INSERT INTO provider_games
           (provider_game_row_id, provider, provider_game_id, internal_game_id,
            raw_home_team, raw_away_team, raw_sport_key, raw_sport_title,
            raw_commence_time, time_delta_seconds, mapping_state)
         VALUES ($1,$2,$3,$4,$5,$6,'','',$7,$8,'approved')`,
        [
          rowId,
          input.provider,
          input.provider_game_id,
          outcome.internal_game_id,
          input.raw_home_team,
          input.raw_away_team,
          input.raw_commence_time,
          outcome.time_delta_seconds,
        ]
      );
      await pool.query(
        `INSERT INTO mapping_history
           (provider, entity_kind, provider_entity_id, internal_entity_id,
            prior_internal_entity_id, action, reason, actor)
         VALUES ($1,'game',$2,$3,NULL,'approved',$4,'v1_4b_seed_event_resolution')`,
        [
          input.provider,
          input.provider_game_id,
          outcome.internal_game_id,
          outcome.kind === 'resolved_exact'
            ? 'exact_time_match'
            : `time_tolerance_match delta_seconds=${outcome.time_delta_seconds}`,
        ]
      );
      return Object.freeze({
        kind: 'wrote_provider_games' as const,
        provider_games_row_id: rowId,
        queue_row_id: null,
      });
    }
    // Row exists. If it's approved with a different internal id, that's a
    // conflict — do not overwrite; return the existing state. Callers can
    // reconcile separately.
    const row = existing.rows[0] as {
      provider_game_row_id: string;
      internal_game_id: string | null;
      mapping_state: ProviderTeam['mapping_state'];
    };
    if (row.internal_game_id === outcome.internal_game_id && row.mapping_state === 'approved') {
      return Object.freeze({
        kind: 'wrote_provider_games' as const,
        provider_games_row_id: row.provider_game_row_id,
        queue_row_id: null,
      });
    }
    // Non-conflicting update path: raw fields refreshed, mapping_state not weakened.
    await pool.query(
      `UPDATE provider_games SET
         raw_home_team = $2,
         raw_away_team = $3,
         raw_commence_time = $4,
         time_delta_seconds = COALESCE($5, time_delta_seconds),
         internal_game_id = COALESCE(internal_game_id, $6),
         mapping_state = CASE WHEN mapping_state = 'unresolved' THEN 'approved' ELSE mapping_state END,
         last_seen_at = now(),
         updated_at = now()
       WHERE provider_game_row_id = $1`,
      [
        row.provider_game_row_id,
        input.raw_home_team,
        input.raw_away_team,
        input.raw_commence_time,
        outcome.time_delta_seconds,
        outcome.internal_game_id,
      ]
    );
    return Object.freeze({
      kind: 'wrote_provider_games' as const,
      provider_games_row_id: row.provider_game_row_id,
      queue_row_id: null,
    });
  }

  // Queued outcome. Idempotency: refuse to insert a duplicate open row.
  const dup = await pool.query(
    `SELECT queue_row_id FROM event_reconciliation_queue
       WHERE provider = $1 AND provider_game_id = $2 AND resolution = 'open'`,
    [input.provider, input.provider_game_id]
  );
  if ((dup.rowCount ?? 0) > 0) {
    return Object.freeze({
      kind: 'skipped_queue_duplicate' as const,
      provider_games_row_id: null,
      queue_row_id: (dup.rows[0] as { queue_row_id: string }).queue_row_id,
    });
  }
  const queueId = randomUUID();
  await pool.query(
    `INSERT INTO event_reconciliation_queue
       (queue_row_id, provider, provider_game_id, provider_game_row_id,
        raw_home_team, raw_away_team, raw_commence_time,
        candidate_internal_game_ids, reason, reason_detail)
     VALUES ($1,$2,$3,NULL,$4,$5,$6,$7::uuid[],$8,$9)`,
    [
      queueId,
      input.provider,
      input.provider_game_id,
      input.raw_home_team,
      input.raw_away_team,
      input.raw_commence_time,
      outcome.candidate_internal_game_ids,
      outcome.reason,
      outcome.reason_detail,
    ]
  );
  return Object.freeze({
    kind: 'wrote_queue' as const,
    provider_games_row_id: null,
    queue_row_id: queueId,
  });
}

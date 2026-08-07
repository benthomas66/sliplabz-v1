// Transactional historical-snapshot persistence for V1-4b seed pipeline.
//
// Authority:
//   Odds sub-spec §14.11 (historical seed policy)
//   Odds sub-spec §14.11.3 (provenance & time; historical rows NEVER
//     populate current-line selection / first-observed / movement)
//   Complete spec §7.10.1, §7.10.2, §11.4, §11.5
//   docs/architecture/V1_PERSISTENCE_CONTRACT.md §4 (transaction policy)
//   Ticket §8b hard invariants:
//     - seeded rows are structurally incapable of entering current selection,
//       first-observed, or movement
//     - every canonical historical point equals a point actually offered by
//       an eligible sportsbook in the final snapshot
//     - DFS/pick'em rows never enter sportsbook historical metrics
//     - coverage gaps remain missing and reported
//
// This module writes the four seed-side rows atomically inside a single
// transaction, mirroring the V1-4 atomicity obligation:
//
//   1. oddsapi_ingestion_runs (kind='historical_query')
//   2. oddsapi_raw_responses (immutable)
//   3. market_snapshots (kind='historical_query', provenance='backfilled_historical')
//   4. source_closing_quotes rows (one per sportsbook × market for THIS event)
//      + optionally a canonical_closing_points row when a canonical point
//        can be selected under §7.10.2
//
// The seed pipeline NEVER writes to:
//   * observed_line_lifecycle (CHECK provenance = 'self_observed')
//   * movement_events (append-only current-poll log)
//   * current_market_rows (CHECK provenance = 'self_observed')
//
// Those three tables' V1-4 CHECKs are the structural gate that makes
// "historical record cannot become current / first_observed / movement"
// a schema fact rather than a code convention.

import { randomUUID } from 'node:crypto';

import { withTransaction, type Tx } from '../../db/transaction.js';
import type { SliplabzPool } from '../../db/connection.js';
import type {
  CloseCaptureEvaluation,
  HistoricalSourceClosingQuoteCandidate,
} from '../types.js';
import type { QuotaDeltaFlag } from '../../shared/enums.js';

export interface PersistHistoricalSnapshotInput {
  /**
   * COMPLETENESS SWEEP (2026-08-04): accepted for caller symmetry with the
   * seed pipeline but INTENTIONALLY NOT PERSISTED here — `oddsapi_ingestion_runs`
   * has no `seed_run_id` column. Recorded explicitly so the sweep matrix has no
   * unexplained (a)-without-(b) cell.
   */
  readonly seed_run_id: string;
  readonly provider_event_id: string;
  readonly linked_internal_game_id: string | null;
  readonly linked_internal_player_ids_by_normalized_name: ReadonlyMap<string, string>;
  readonly market_key: string;
  readonly bookmaker_key: string;
  readonly bookmaker_title: string;
  /** Requested close boundary — what SlipLabz asked for. */
  readonly requested_close_boundary_utc: string;
  /** Provider snapshot timestamp actually returned. */
  readonly provider_snapshot_time: string | null;
  /** SlipLabz retrieval time. */
  readonly retrieved_at: string;
  readonly close_capture: CloseCaptureEvaluation;
  /** Redacted request URL (apiKey replaced with REDACTED). */
  readonly redacted_request_url: string;
  /** Sanitized request params (never the API key). */
  readonly request_params: Readonly<Record<string, unknown>>;
  /** Retained response headers (Odds §15A.4). */
  readonly response_headers: Readonly<Record<string, string | number>>;
  /** Raw response body (jsonb-serializable) OR null when non-JSON. */
  readonly raw_response_body: unknown | null;
  readonly raw_response_body_text: string | null;
  /** Candidate closing quotes for THIS (event, market, bookmaker) triple. */
  readonly candidates: ReadonlyArray<HistoricalSourceClosingQuoteCandidate>;
  /**
   * GAP-38 (V1-OP-8). OPTIONAL quota reconciliation for this paid request —
   * the `reconcileQuota` verdict plus the provider's own `x-requests-last`.
   * When supplied, it is persisted to the `oddsapi_ingestion_runs` ledger so
   * every paid call is reconstructable from the DB rather than from a session
   * transcript.
   *
   * ADDITIVE + BACKWARD-COMPATIBLE: when omitted (the seed path and every
   * pre-existing caller), the four quota columns stay NULL and the INSERT is
   * otherwise byte-identical to its previous behavior.
   */
  /**
   * @deprecated (V1-4b Phase B correction). Ignored. The per-(event,
   * bookmaker, market) transaction is the WRONG grain for canonical
   * selection; canonical writing lives in
   * src/seed/orchestrator/canonicalClosingPointsForSeed.ts and MUST be
   * invoked once all per-event persists for a game are complete.
   */
  readonly persist_canonical_when_possible?: boolean;
}

export interface PersistHistoricalSnapshotResult {
  readonly oddsapi_ingestion_run_id: string;
  readonly oddsapi_raw_response_id: string;
  readonly market_snapshot_id: string;
  readonly source_closing_quote_ids: ReadonlyArray<string>;
  readonly canonical_closing_point_id: string | null;
}

/**
 * Persist the historical snapshot rows for a single (event, market, book)
 * probe result inside one transaction.
 *
 * On any failure the transaction rolls back — no partial state ever
 * becomes visible.
 */
export async function persistHistoricalSnapshot(
  pool: SliplabzPool,
  input: PersistHistoricalSnapshotInput,
  hooks?: {
    /** Test-only fault point AFTER snapshot + before quotes. */
    readonly on_after_snapshot?: (tx: Tx) => Promise<void>;
  }
): Promise<PersistHistoricalSnapshotResult> {
  // V1-OP-8b Option A: this entry point is now a THIN withTransaction wrapper
  // over the extracted in-transaction body. Behavior for every existing caller
  // (the seed pipeline especially) is unchanged — one transaction per triple,
  // committed on success, rolled back on error.
  return withTransaction(pool, (tx) => persistHistoricalSnapshotInTx(tx, input, hooks));
}

/**
 * V1-OP-8b (Option A). The in-transaction body of the historical persist.
 *
 * Runs entirely on a CALLER-SUPPLIED `Tx` and opens NO transaction of its own,
 * so a bulk caller can enclose many triples plus the canonical + hlr stages in
 * ONE game-level transaction: a failure at any stage rolls the whole game back
 * together, leaving no orphan `source_closing_quotes` (GAP-37).
 *
 * The statements, their order, their parameters, and the returned ids are
 * IDENTICAL to the pre-extraction body — only the transaction OWNERSHIP moves
 * to the caller.
 */
export async function persistHistoricalSnapshotInTx(
  tx: Tx,
  input: PersistHistoricalSnapshotInput,
  hooks?: {
    /** Test-only fault point AFTER snapshot + before quotes. */
    readonly on_after_snapshot?: (tx: Tx) => Promise<void>;
  }
): Promise<PersistHistoricalSnapshotResult> {
  const ingestion_run_id = randomUUID();
  const raw_response_id = randomUUID();
  const market_snapshot_id = randomUUID();

  {
    // 1. Ingestion run (kind=historical_query, terminal state=complete).
    await tx.query(
      `INSERT INTO oddsapi_ingestion_runs (
         oddsapi_ingestion_run_id,
         request_kind,
         endpoint,
         requested_provider_event_id,
         requested_market_keys,
         requested_bookmaker_keys,
         requested_regions,
         requested_effective_time,
         request_params,
         redacted_request_url,
         started_at,
         completed_at,
         http_status_last,
         content_type_last,
         response_headers_last,
         result_state,
         quota_forecast,
         quota_observed,
         quota_delta_flag,
         x_requests_last,
         x_requests_remaining,
         x_requests_used
       ) VALUES ($1,'historical_query','historical_event_odds',$2,$3::jsonb,$4::jsonb,'[]'::jsonb,$5,$6::jsonb,$7,$8,$9,$10,$11,$12::jsonb,'complete',$13,$14,$15::quota_delta_flag,$16,$17,$18)`,
      [
        ingestion_run_id,
        input.provider_event_id,
        JSON.stringify([input.market_key]),
        JSON.stringify([input.bookmaker_key]),
        input.requested_close_boundary_utc,
        JSON.stringify(input.request_params),
        input.redacted_request_url,
        input.retrieved_at,
        input.retrieved_at,
        200,
        'application/json',
        JSON.stringify(input.response_headers),
        // GAP-38: null for callers that supply no reconciliation (seed path).
        null, // GAP-47: billing never rides the persist lineage row
        null,
        null,
        null,
        // GAP-40: the balance-curve columns. Null when absent, so every
        // pre-existing caller (incl. the seed path) is byte-identical.
        null,
        null,
      ]
    );

    // 2. Raw response (immutable in intent).
    await tx.query(
      `INSERT INTO oddsapi_raw_responses (
         oddsapi_raw_response_id,
         oddsapi_ingestion_run_id,
         retrieved_at,
         http_status,
         content_type,
         response_headers,
         response_body,
         response_body_text,
         response_body_bytes
       ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,$9)`,
      [
        raw_response_id,
        ingestion_run_id,
        input.retrieved_at,
        200,
        'application/json',
        JSON.stringify(input.response_headers),
        input.raw_response_body === null
          ? null
          : JSON.stringify(input.raw_response_body),
        input.raw_response_body_text,
        input.raw_response_body_text?.length ?? null,
      ]
    );

    // 3. Market snapshot — historical_query + backfilled_historical.
    //    provider_last_update taken from first eligible candidate when present.
    const provider_last_update =
      input.candidates.find((c) => c.provider_last_update !== null)
        ?.provider_last_update ?? null;
    await tx.query(
      `INSERT INTO market_snapshots (
         market_snapshot_id,
         oddsapi_ingestion_run_id,
         raw_response_id,
         provider_event_id,
         linked_internal_game_id,
         bookmaker_key,
         bookmaker_title,
         source_class,
         market_key,
         request_kind,
         provenance,
         provider_last_update,
         provider_snapshot_time,
         retrieved_at,
         observed_at,
         freshness_state,
         schema_state,
         raw_outcome_row_count,
         duplicate_group_count,
         conflict_group_count
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,'sportsbook',$8,'historical_query','backfilled_historical',$9,$10,$11,NULL,'unavailable',$12,$13,0,0)`,
      [
        market_snapshot_id,
        ingestion_run_id,
        raw_response_id,
        input.provider_event_id,
        input.linked_internal_game_id,
        input.bookmaker_key,
        input.bookmaker_title,
        input.market_key,
        provider_last_update,
        input.provider_snapshot_time,
        input.retrieved_at,
        input.close_capture.close_capture_state === 'eligible'
          ? 'valid'
          : input.close_capture.close_capture_state === 'no_snapshot'
          ? 'valid_empty'
          : 'unresolved',
        input.candidates.length,
      ]
    );

    if (hooks?.on_after_snapshot !== undefined) {
      await hooks.on_after_snapshot(tx);
    }

    // 4. For every eligible candidate, insert:
    //    (a) a market_offerings row on the historical snapshot (needed by
    //        source_closing_quotes.source_offering_id CHECK on eligible);
    //    (b) the source_closing_quotes row referencing (a).
    //    Non-eligible states skip the offering.
    //    Player mapping is required; unresolved players are logged in the
    //    coverage report by the caller (§3.6 — missing stays missing).
    const source_closing_quote_ids: string[] = [];
    const inserted_offering_hashes = new Set<string>(); // guard multi-line dedupe
    for (const c of input.candidates) {
      if (input.linked_internal_game_id === null) continue;
      const norm = normalizeName(c.detail.replace(/^player=/, ''));
      const player_id =
        input.linked_internal_player_ids_by_normalized_name.get(norm) ?? null;
      if (player_id === null) continue;

      let offering_id: string | null = null;
      if (c.close_capture_state === 'eligible' && c.closing_point !== null) {
        offering_id = randomUUID();
        // The market_offerings UNIQUE is (snapshot, normalized_player, point,
        // side). For a historical close snapshot we store ONE representative
        // canonical offering — Over side at the closing point — carrying
        // the two prices as raw fields when present. This is sufficient for
        // the CHECK and preserves audit walk-back.
        const side_hash_key = `${norm}|${c.closing_point}|over`;
        if (inserted_offering_hashes.has(side_hash_key)) {
          // Should never happen in one snapshot per (game, player, market,
          // book) but the guard keeps the transaction safe.
          continue;
        }
        inserted_offering_hashes.add(side_hash_key);
        await tx.query(
          `INSERT INTO market_offerings (
             market_offering_id,
             market_snapshot_id,
             raw_player_description,
             normalized_player_name,
             internal_player_id,
             side,
             point,
             raw_price_american,
             raw_multiplier,
             price_semantic,
             promotion_type,
             offering_state,
             conflict_reason,
             duplicate_count,
             provider_last_update,
             source_hash,
             eligibility_note
           ) VALUES ($1,$2,$3,$4,$5,'over',$6,$7,NULL,'sportsbook_american','unknown','two_sided_complete',NULL,1,$8,$9,'backfilled_historical seed')`,
          [
            offering_id,
            market_snapshot_id,
            norm,
            norm,
            player_id,
            c.closing_point,
            c.closing_over_price ?? 0,
            c.provider_last_update,
            `hist_${input.provider_event_id}_${input.bookmaker_key}_${input.market_key}_${norm}_${c.closing_point}`,
          ]
        );
      }

      const scq_id = randomUUID();
      await tx.query(
        `INSERT INTO source_closing_quotes (
           source_closing_quote_id,
           internal_game_id,
           internal_player_id,
           market_key,
           bookmaker_key,
           source_class,
           closing_point,
           closing_over_price,
           closing_under_price,
           provider_last_update,
           source_snapshot_id,
           source_offering_id,
           close_capture_state,
           close_boundary_utc
         ) VALUES ($1,$2,$3,$4,$5,'sportsbook',$6,$7,$8,$9,$10,$11,$12,$13)
         ON CONFLICT (internal_game_id, internal_player_id, market_key, bookmaker_key) DO NOTHING`,
        [
          scq_id,
          input.linked_internal_game_id,
          player_id,
          input.market_key,
          input.bookmaker_key,
          c.closing_point,
          c.closing_over_price,
          c.closing_under_price,
          c.provider_last_update,
          c.close_capture_state !== 'no_snapshot' ? market_snapshot_id : null,
          offering_id,
          c.close_capture_state,
          input.requested_close_boundary_utc,
        ]
      );
      source_closing_quote_ids.push(scq_id);
    }

    // 5. Canonical closing points are NOT written from this per-(event,
    //    bookmaker, market) transaction. The correct grain for
    //    selectCanonicalClosingPoint is (internal_game_id, internal_player_id,
    //    market_key) with quotes from ALL eligible bookmakers grouped
    //    together. Computing canonical here would either (a) run modal
    //    detection across DIFFERENT players' points within one book (which
    //    returns a nonsensical result), or (b) run over a single quote
    //    yielding single_book — even when other books have identical quotes
    //    that would form a unique_modal cross-book.
    //    See src/seed/orchestrator/canonicalClosingPointsForSeed.ts for the
    //    correct writer; the caller must invoke it once all per-event persist
    //    calls for a game are complete.

    return Object.freeze({
      oddsapi_ingestion_run_id: ingestion_run_id,
      oddsapi_raw_response_id: raw_response_id,
      market_snapshot_id,
      source_closing_quote_ids: Object.freeze(source_closing_quote_ids),
      canonical_closing_point_id: null,
    });
  }
}

function normalizeName(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[’'‘′\-‐‑‒–—_.,]+/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

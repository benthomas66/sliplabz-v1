// Transactional Odds API snapshot persistence.
//
// Authority:
//   V1-4 governor obligation (transactional raw completeness):
//     "The persistence orchestration must guarantee that canonical
//     market_offerings rows are never durably persisted without their
//     corresponding market_offering_raw_rows; snapshot header, raw rows,
//     and canonical offerings commit atomically within one transaction or
//     not at all. This is the executable form of 'raw retention before
//     collapse' (the FK direction means raw rows may carry
//     canonical_offering_id pointers set in the same transaction;
//     atomicity, not literal write order, is the guarantee)."
//   docs/architecture/V1_PERSISTENCE_CONTRACT.md §4.
//
// This module implements the atomicity guarantee for the Odds API snapshot
// path. It is intentionally the ONLY code path that persists market
// snapshots + offerings + raw rows together; V1-5 must reuse it, not
// duplicate it.

import type { SliplabzPool } from '../../db/connection.js';
import { withTransaction, type Tx } from '../../db/transaction.js';
import type {
  FreshnessState,
  OddsapiProvenance,
  OddsapiRequestKind,
  OutcomeSide,
  PriceSemantic,
  DfsPromotionType,
  OfferingConflictReason,
  OfferingState,
  SnapshotSchemaState,
  SourceClass,
} from '../../shared/enums.js';

export interface PersistSnapshotInput {
  readonly market_snapshot: {
    readonly market_snapshot_id: string;
    readonly oddsapi_ingestion_run_id: string;
    readonly raw_response_id: string | null;
    readonly provider_event_id: string;
    readonly linked_internal_game_id: string | null;
    readonly bookmaker_key: string;
    readonly bookmaker_title: string;
    readonly source_class: SourceClass;
    readonly market_key: string;
    readonly request_kind: OddsapiRequestKind;
    readonly provenance: OddsapiProvenance;
    readonly provider_last_update: string | null;
    readonly provider_snapshot_time: string | null;
    readonly retrieved_at: string;
    readonly observed_at: string | null;
    readonly freshness_state: FreshnessState;
    readonly schema_state: SnapshotSchemaState;
    readonly raw_outcome_row_count: number;
    readonly duplicate_group_count: number;
    readonly conflict_group_count: number;
  };
  /** Raw rows BEFORE duplicate collapse. Each raw row records its
   *  disposition and — after this write — its canonical_offering_id when
   *  it contributed to one. */
  readonly raw_rows: ReadonlyArray<{
    readonly raw_row_index: number;
    readonly raw_name: string;
    readonly raw_description: string;
    readonly raw_price: number | null;
    readonly raw_point: number | null;
    readonly raw_multiplier: number | null;
    readonly raw_payload: unknown;
    readonly disposition: 'contributed' | 'duplicate' | 'quarantined';
    /**
     * Index into `canonical_offerings` this raw row collapsed into. `null`
     * for `quarantined` rows.
     */
    readonly canonical_offering_index: number | null;
    readonly observed_at: string;
  }>;
  readonly canonical_offerings: ReadonlyArray<{
    readonly market_offering_id: string;
    readonly raw_player_description: string;
    readonly normalized_player_name: string;
    readonly internal_player_id: string | null;
    readonly side: OutcomeSide;
    readonly point: number;
    readonly raw_price_american: number;
    readonly raw_multiplier: number | null;
    readonly price_semantic: PriceSemantic;
    readonly promotion_type: DfsPromotionType;
    readonly offering_state: OfferingState;
    readonly conflict_reason: OfferingConflictReason | null;
    readonly duplicate_count: number;
    readonly provider_last_update: string | null;
    readonly source_hash: string;
    readonly eligibility_note: string;
  }>;
}

export interface PersistSnapshotResult {
  readonly market_snapshot_id: string;
  readonly canonical_offering_ids: ReadonlyArray<string>;
  readonly raw_row_ids: ReadonlyArray<string>;
}

/**
 * Persist a snapshot header, all raw outcome rows, and all canonical
 * offerings inside ONE transaction.
 *
 * Behavior:
 *   1. Insert the market_snapshot header.
 *   2. Insert every canonical_offerings row (needed first because raw_rows
 *      may reference `canonical_offering_id`).
 *   3. Insert every raw_row, setting `canonical_offering_id` to the
 *      corresponding canonical offering ID (indexed by `canonical_offering_index`).
 *   4. Return the assigned IDs.
 *
 * On ANY failure — including a caller-injected failure — the entire
 * transaction rolls back. Neither the canonical offerings nor the raw rows
 * (nor the snapshot header) persist. Governor's atomicity guarantee is
 * demonstrated by `tests/integration/persistOddsapiSnapshot.integration.test.ts`.
 */
export async function persistOddsapiSnapshot(
  pool: SliplabzPool,
  input: PersistSnapshotInput,
  hooks?: {
    /**
     * Injected fault point (test-only). Called after canonical offerings
     * insert and BEFORE raw rows insert. If it throws, the transaction MUST
     * roll back and neither offerings nor raw rows nor the snapshot persist.
     */
    readonly on_after_offerings?: (tx: Tx) => Promise<void>;
  }
): Promise<PersistSnapshotResult> {
  return withTransaction(pool, async (tx) => {
    // 1. Snapshot header.
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
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)`,
      [
        input.market_snapshot.market_snapshot_id,
        input.market_snapshot.oddsapi_ingestion_run_id,
        input.market_snapshot.raw_response_id,
        input.market_snapshot.provider_event_id,
        input.market_snapshot.linked_internal_game_id,
        input.market_snapshot.bookmaker_key,
        input.market_snapshot.bookmaker_title,
        input.market_snapshot.source_class,
        input.market_snapshot.market_key,
        input.market_snapshot.request_kind,
        input.market_snapshot.provenance,
        input.market_snapshot.provider_last_update,
        input.market_snapshot.provider_snapshot_time,
        input.market_snapshot.retrieved_at,
        input.market_snapshot.observed_at,
        input.market_snapshot.freshness_state,
        input.market_snapshot.schema_state,
        input.market_snapshot.raw_outcome_row_count,
        input.market_snapshot.duplicate_group_count,
        input.market_snapshot.conflict_group_count,
      ]
    );

    // 2. Canonical offerings — needed first so raw rows can reference them.
    const canonical_ids: string[] = [];
    for (const o of input.canonical_offerings) {
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
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
        [
          o.market_offering_id,
          input.market_snapshot.market_snapshot_id,
          o.raw_player_description,
          o.normalized_player_name,
          o.internal_player_id,
          o.side,
          o.point,
          o.raw_price_american,
          o.raw_multiplier,
          o.price_semantic,
          o.promotion_type,
          o.offering_state,
          o.conflict_reason,
          o.duplicate_count,
          o.provider_last_update,
          o.source_hash,
          o.eligibility_note,
        ]
      );
      canonical_ids.push(o.market_offering_id);
    }

    // 2.5. Optional injected fault (test-only). Between offerings and raw rows.
    if (hooks?.on_after_offerings !== undefined) {
      await hooks.on_after_offerings(tx);
    }

    // 3. Raw rows, with canonical_offering_id back-references.
    const raw_row_ids: string[] = [];
    for (const r of input.raw_rows) {
      const canonical_id =
        r.canonical_offering_index === null
          ? null
          : canonical_ids[r.canonical_offering_index] ?? null;
      const res = await tx.query(
        `INSERT INTO market_offering_raw_rows (
           market_snapshot_id,
           raw_row_index,
           raw_name,
           raw_description,
           raw_price,
           raw_point,
           raw_multiplier,
           raw_payload,
           canonical_offering_id,
           disposition,
           observed_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11)
         RETURNING market_offering_raw_row_id`,
        [
          input.market_snapshot.market_snapshot_id,
          r.raw_row_index,
          r.raw_name,
          r.raw_description,
          r.raw_price,
          r.raw_point,
          r.raw_multiplier,
          JSON.stringify(r.raw_payload),
          canonical_id,
          r.disposition,
          r.observed_at,
        ]
      );
      const row = res.rows[0] as { market_offering_raw_row_id: string };
      raw_row_ids.push(row.market_offering_raw_row_id);
    }

    return Object.freeze({
      market_snapshot_id: input.market_snapshot.market_snapshot_id,
      canonical_offering_ids: Object.freeze(canonical_ids),
      raw_row_ids: Object.freeze(raw_row_ids),
    });
  });
}

// V1-OP-8b §0.4 — durable capture of the discovered event id (GAP-43, identifier side).
//
// The re-probe resolved 21 games to provider event ids and then discarded every
// one of them: the run printed classifications, retained no raw payload, and
// persisted no row carrying the id. Authoring a repair tranche therefore meant
// RE-PROBING at 1 credit per boundary. This writer makes the identifier durable.
//
// NOT A MAPPING. `seed/orchestrator/eventResolutionForSeed.ts` remains the sole
// governed owner of `provider_games` / `event_reconciliation_queue` creation —
// and that path also writes `actual_start_utc`, which the (b) repair must never
// disturb. This module writes ONLY `discovery_results`, which has no start-time
// column at all, so the two-field invariant holds STRUCTURALLY here rather than
// by discipline.

import type { Tx } from '../db/transaction.js';
import type { GameClassification } from './unmappedDiscoverySample.js';

/** UPSERT on (internal_game_id, probe_at) so a re-probe updates in place. */
export const DISCOVERY_RESULT_UPSERT_SQL = `INSERT INTO discovery_results (
     oddsapi_ingestion_run_id,
     internal_game_id,
     probe_at,
     population,
     matched_event_id,
     match_kind,
     provider_commence_time,
     detail
   ) VALUES ($1::uuid,$2::uuid,$3::timestamptz,$4,$5,$6,$7::timestamptz,$8)
   ON CONFLICT (internal_game_id, probe_at) DO UPDATE SET
     oddsapi_ingestion_run_id = EXCLUDED.oddsapi_ingestion_run_id,
     population               = EXCLUDED.population,
     matched_event_id         = EXCLUDED.matched_event_id,
     match_kind               = EXCLUDED.match_kind,
     provider_commence_time   = EXCLUDED.provider_commence_time,
     detail                   = EXCLUDED.detail
   RETURNING discovery_result_id`;

export interface DiscoveryResultInput {
  readonly oddsapi_ingestion_run_id: string;
  readonly probe_at: string;
  readonly classification: GameClassification;
  /** The provider's own commence_time for the matched event, when it gave one. */
  readonly provider_commence_time: string | null;
}

/**
 * Derive the recorded `match_kind` from the classifier's detail string, which
 * is the classifier's own account of HOW it matched. Kept as a read of the
 * committed detail rather than a second classification, so the two can never
 * drift into disagreeing about the same row.
 */
export function matchKindOf(c: GameClassification): string | null {
  if (c.population !== 'b_discovery_recoverable') return null;
  if (/disambiguated by commence_time/.test(c.detail)) return 'disambiguated';
  if (/token_containment/.test(c.detail)) return 'token_containment';
  return 'exact';
}

/** Persist one game's discovery observation. Returns the row id. */
export async function recordDiscoveryResultInTx(
  tx: Tx,
  input: DiscoveryResultInput,
): Promise<string> {
  const c = input.classification;
  const res = await tx.query(DISCOVERY_RESULT_UPSERT_SQL, [
    input.oddsapi_ingestion_run_id,
    c.internal_game_id,
    input.probe_at,
    c.population,
    c.matched_event_id,
    matchKindOf(c),
    input.provider_commence_time,
    c.detail,
  ]);
  return (res.rows[0] as { discovery_result_id: string }).discovery_result_id;
}

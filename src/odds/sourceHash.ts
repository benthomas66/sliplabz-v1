// Canonical source hash for market offerings.
//
// Authority:
//   Odds sub-spec §15.3 (no source row is silently discarded; duplicate
//     collapse must be deterministic)
//   Ticket V1-3 hard invariant: exact duplicates collapse only after raw
//     retention; the hash is what distinguishes "equal" from "different".

import { createHash } from 'node:crypto';

import type { OutcomeSide, PriceSemantic } from '../shared/enums.js';

export interface OfferingSourceHashInputs {
  readonly provider_event_id: string;
  readonly bookmaker_key: string;
  readonly market_key: string;
  readonly normalized_player_name: string;
  readonly side: OutcomeSide;
  readonly point: number;
  readonly raw_price_american: number;
  readonly raw_multiplier: number | null;
  readonly price_semantic: PriceSemantic;
  readonly provider_last_update: string | null;
}

export const OFFERING_SOURCE_HASH_VERSION = 1;

/**
 * Compose a deterministic hash of the fields Odds §10.5 rule 1 identifies
 * as the exact-duplicate grouping key, plus `price_semantic` so a sportsbook
 * price at a given point is never accidentally hashed identically to a
 * PrizePicks/Underdog display price.
 */
export function canonicalOfferingHash(
  inputs: OfferingSourceHashInputs
): string {
  const preimage = {
    v: OFFERING_SOURCE_HASH_VERSION,
    provider_event_id: inputs.provider_event_id,
    bookmaker_key: inputs.bookmaker_key,
    market_key: inputs.market_key,
    normalized_player_name: inputs.normalized_player_name,
    side: inputs.side,
    point: inputs.point,
    raw_price_american: inputs.raw_price_american,
    raw_multiplier: inputs.raw_multiplier,
    price_semantic: inputs.price_semantic,
    provider_last_update: inputs.provider_last_update,
  };
  return createHash('sha256').update(JSON.stringify(preimage)).digest('hex');
}

/**
 * Cheap content hash of an arbitrary raw payload — used by event snapshots
 * and market snapshots to detect metadata drift without hand-picking fields.
 */
export function contentHash(obj: unknown): string {
  return createHash('sha256').update(stableStringify(obj)).digest('hex');
}

function stableStringify(v: unknown): string {
  if (v === null) return 'null';
  if (typeof v === 'number')
    return Number.isFinite(v) ? String(v) : 'null';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'string') return JSON.stringify(v);
  if (Array.isArray(v)) {
    return '[' + v.map((it) => stableStringify(it)).join(',') + ']';
  }
  if (typeof v === 'object') {
    const keys = Object.keys(v as Record<string, unknown>).sort();
    return (
      '{' +
      keys
        .map(
          (k) =>
            JSON.stringify(k) +
            ':' +
            stableStringify((v as Record<string, unknown>)[k])
        )
        .join(',') +
      '}'
    );
  }
  return 'null';
}

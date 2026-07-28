// V1-8a0 — source-identity set (the one approved offering-context exception).
//
// Built INSIDE the trusted server (population) boundary from the population-time
// offering context (`current_market_row.book_detail.offerings`), and persisted
// as identity-only metadata alongside the profile. Founder ruling.
//
// AUTHORIZED to carry: normalized source identifier (bookmaker_key) · authorized
// public display name · factual membership · count (= array length) · FIXED
// NON-ECONOMIC ordering (alphabetical by canonical identifier).
//
// FORBIDDEN and structurally impossible here (this function reads ONLY the two
// identity fields): source-specific point · price/juice · side · promotional
// value · per-source offer timestamp · ranking by price/value/quality · original
// paid-offering row order · adjacency of a source to its point/price · any handle
// (market_offering_id, source_snapshot_id) permitting retrieval of the paid
// offering row · duplicates revealing the number of offers/sides from one source.
//
// This is NOT a free-tier read path: it runs at population time. No free-tier
// reader ever reopens `book_detail.offerings`.

import type { CurrentOffering } from '../../computation/types.js';

/** A persisted source identity — names/IDs only. Exactly these keys, ever. */
export interface SourceIdentity {
  readonly normalized_source_id: string;
  readonly display_name: string;
}

/** The exact allowed key set for a SourceIdentity (nested allowlist owner). */
export const SOURCE_IDENTITY_KEYS = ['normalized_source_id', 'display_name'] as const;

/** Keys that must NEVER appear on a source identity (paid / reconstructive). */
export const SOURCE_IDENTITY_FORBIDDEN_KEYS = [
  'point', 'price', 'over_price', 'under_price', 'raw_price_american', 'side',
  'observed_at', 'provider_last_update', 'promotion_type', 'raw_price',
  'source_snapshot_id', 'market_offering_id', 'offer_count', 'count', 'ordinal_hint',
] as const;

/**
 * Derive the deduplicated, alphabetically-ordered set of source identities that
 * supplied at least one eligible offering for the grain. Reads ONLY
 * `bookmaker_key` (canonical id) and `display_title` (display name) off each
 * offering; every economic field is left untouched. Dedup by canonical id means
 * the set can never reveal how many offers or sides a source contributed.
 */
export function deriveSourceIdentitySet(
  offerings: ReadonlyArray<CurrentOffering>,
): ReadonlyArray<SourceIdentity> {
  const byKey = new Map<string, string>(); // canonical id -> first-seen display name
  for (const o of offerings) {
    if (!byKey.has(o.bookmaker_key)) byKey.set(o.bookmaker_key, o.display_title);
  }
  return Array.from(byKey.entries())
    // FIXED NON-ECONOMIC ordering: alphabetical by canonical id, NOT offering order.
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([normalized_source_id, display_name]) =>
      Object.freeze({ normalized_source_id, display_name }));
}

/**
 * RUNTIME nested key-set assertion for a source-identity object. Throws if it
 * carries an unexpected key or any forbidden paid/reconstructive key.
 */
export function assertSourceIdentityKeySet(s: SourceIdentity): void {
  const expected = new Set<string>(SOURCE_IDENTITY_KEYS);
  for (const k of Object.keys(s)) {
    if (!expected.has(k)) {
      throw new Error(`V1-8a0 source identity carries unexpected key "${k}" (allowed: ${SOURCE_IDENTITY_KEYS.join(', ')}).`);
    }
  }
  for (const k of expected) {
    if (!Object.prototype.hasOwnProperty.call(s, k)) {
      throw new Error(`V1-8a0 source identity is MISSING required key "${k}".`);
    }
  }
  for (const forbidden of SOURCE_IDENTITY_FORBIDDEN_KEYS) {
    if (Object.prototype.hasOwnProperty.call(s, forbidden)) {
      throw new Error(`V1-8a0 source identity carries FORBIDDEN paid/handle key "${forbidden}".`);
    }
  }
}

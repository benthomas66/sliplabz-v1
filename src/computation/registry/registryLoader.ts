// V1-5 registry loader (governor ledger #6).
//
// Idempotent seeding of `bookmaker_registry` + `market_registry` FROM the
// frozen code constants `V1_BOOKMAKER_ALLOWLIST` and `LAUNCH_MARKET_KEYS`.
//
// Load-bearing rules:
//   * Refuses any key NOT in the constants. An out-of-band provider key
//     must go through a spec amendment (GD-9), not this loader.
//   * Idempotent: rerunning is safe. Uses INSERT ... ON CONFLICT DO UPDATE
//     on display_title / source_class / is_launch_market so a corrected
//     display or class flows through, but the row is never deleted or
//     downgraded silently.
//   * The `approved_by` value marks the seed source. Production may later
//     upgrade `approved_by` to a specific reviewer id.

import type { SliplabzPool } from '../../db/connection.js';
import {
  V1_BOOKMAKER_ALLOWLIST,
  isAllowlistedBookmakerKey,
} from '../../odds/bookmakerAllowlist.js';
import {
  LAUNCH_MARKET_KEYS,
  CANONICAL_STAT_BY_MARKET,
  isLaunchMarketKey,
  type LaunchMarketKey,
} from '../../odds/marketKeys.js';

const APPROVED_BY = 'v1_5_registry_loader';

export interface RegistryLoadResult {
  readonly bookmakers_inserted: number;
  readonly bookmakers_updated: number;
  readonly markets_inserted: number;
  readonly markets_updated: number;
}

export interface RegistryLoadInput {
  readonly bookmaker_keys?: ReadonlyArray<string>;
  readonly market_keys?: ReadonlyArray<string>;
}

/**
 * Load the frozen registries into the DB. `input` optionally scopes the
 * load to a subset of the constants (test uses this). Every key MUST be
 * present in the corresponding constant; any key outside the constant
 * causes the loader to throw before any DB writes.
 */
export async function loadRegistries(
  pool: SliplabzPool,
  input: RegistryLoadInput = {}
): Promise<RegistryLoadResult> {
  const requestedBookmakers = input.bookmaker_keys ??
    V1_BOOKMAKER_ALLOWLIST.map((e) => e.provider_key);
  const requestedMarkets = input.market_keys ?? [...LAUNCH_MARKET_KEYS];

  // Refuse any out-of-allowlist key. Structural — not a warning.
  for (const key of requestedBookmakers) {
    if (!isAllowlistedBookmakerKey(key)) {
      throw new Error(
        `V1-5 registry loader refused bookmaker_key='${key}': not in V1_BOOKMAKER_ALLOWLIST. ` +
        `Additions require a spec amendment (GD-9); the loader never invents entries.`
      );
    }
  }
  for (const key of requestedMarkets) {
    if (!isLaunchMarketKey(key)) {
      throw new Error(
        `V1-5 registry loader refused market_key='${key}': not in LAUNCH_MARKET_KEYS. ` +
        `Additions require a spec amendment (A1 §4.1); the loader never invents entries.`
      );
    }
  }

  let bookmakers_inserted = 0;
  let bookmakers_updated = 0;
  let markets_inserted = 0;
  let markets_updated = 0;

  for (const key of requestedBookmakers) {
    const entry = V1_BOOKMAKER_ALLOWLIST.find((e) => e.provider_key === key)!;
    const res = await pool.query(
      `INSERT INTO bookmaker_registry
         (provider_key, display_title, source_class, allowlist_status,
          reviewed_note, approved_by)
       VALUES ($1, $2, $3, 'active', $4, $5)
       ON CONFLICT (provider_key) DO UPDATE
         SET display_title = EXCLUDED.display_title,
             source_class = EXCLUDED.source_class,
             reviewed_note = EXCLUDED.reviewed_note,
             last_seen_at = now(),
             updated_at = now()
       RETURNING (xmax = 0) AS was_insert`,
      [entry.provider_key, entry.display_title, entry.source_class, entry.note, APPROVED_BY]
    );
    if ((res.rows[0] as { was_insert: boolean }).was_insert) bookmakers_inserted += 1;
    else bookmakers_updated += 1;
  }

  for (const key of requestedMarkets) {
    const canonicalStatKey = CANONICAL_STAT_BY_MARKET[key as LaunchMarketKey];
    const res = await pool.query(
      `INSERT INTO market_registry
         (provider_key, display_title, is_launch_market, canonical_stat_key,
          reviewed_note, approved_by)
       VALUES ($1, $1, true, $2, '', $3)
       ON CONFLICT (provider_key) DO UPDATE
         SET display_title = EXCLUDED.display_title,
             is_launch_market = EXCLUDED.is_launch_market,
             canonical_stat_key = EXCLUDED.canonical_stat_key,
             last_seen_at = now(),
             updated_at = now()
       RETURNING (xmax = 0) AS was_insert`,
      [key, canonicalStatKey, APPROVED_BY]
    );
    if ((res.rows[0] as { was_insert: boolean }).was_insert) markets_inserted += 1;
    else markets_updated += 1;
  }

  return Object.freeze({
    bookmakers_inserted, bookmakers_updated,
    markets_inserted, markets_updated,
  });
}

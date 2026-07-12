// Historical event-odds snapshot processing.
//
// Authority:
//   Complete spec §7.10.1 (source closing quote definition)
//   Complete spec §10.13 (historical seed requests)
//   Odds sub-spec §14.11.1 (V1 seed policy — retain only offerings present
//     in the returned final snapshot; do NOT walk backward)
//   Odds sub-spec §14.11.3 (provenance and time)
//   Ticket §8b required tests:
//     - clean final pre-tip snapshot
//     - offering absent from final snapshot but present earlier (must remain excluded)
//     - unsupported market slice
//
// This module converts a returned historical event-odds snapshot into
// closing-quote candidates. It:
//   * filters to the four launch markets;
//   * filters to allowlisted bookmakers with source_class = 'sportsbook';
//   * captures the LAST-eligible offering per (bookmaker, market, player,
//     side, point) as the source closing quote;
//   * NEVER walks backward to resurrect an offering absent from the final
//     snapshot.

import { isLaunchMarketKey } from '../odds/marketKeys.js';
import {
  isAllowlistedBookmakerKey,
  sourceClassForBookmakerKey,
} from '../odds/bookmakerAllowlist.js';
import { evaluateCloseCapture } from './staleness.js';
import type {
  CloseCaptureEvaluation,
  HistoricalEventOddsResponse,
  HistoricalSourceClosingQuoteCandidate,
} from './types.js';

export interface HistoricalSnapshotProcessingInput {
  readonly requested_close_boundary_utc: string;
  readonly response: HistoricalEventOddsResponse;
}

export interface HistoricalSnapshotProcessingResult {
  readonly close_capture: CloseCaptureEvaluation;
  /**
   * Aggregate closing-quote candidates.
   *   * When close_capture.close_capture_state = 'eligible', candidates are
   *     produced from the final snapshot.
   *   * When 'close_capture_stale' or 'no_snapshot', candidates array is
   *     empty (ineligible snapshot → no historical result).
   */
  readonly candidates: ReadonlyArray<HistoricalSourceClosingQuoteCandidate>;
  /**
   * Per-outcome exclusion log so the coverage report can enumerate reasons.
   */
  readonly exclusions: ReadonlyArray<{
    readonly bookmaker_key: string;
    readonly market_key: string;
    readonly outcome:
      | 'unlaunched_market_key'
      | 'unallowlisted_bookmaker_key'
      | 'dfs_pickem_excluded_from_sportsbook_consensus'
      | 'missing_point'
      | 'missing_player_description'
      | 'missing_side';
    readonly reason_detail: string;
  }>;
}

/**
 * Process one historical event-odds snapshot. §14.11.1 policy rules:
 *
 *  * If the snapshot is stale (>10 min before boundary) or missing, emit
 *    no candidates. The exclusions list stays empty at the offering level
 *    because the snapshot itself is ineligible.
 *  * Otherwise, walk the final snapshot's `bookmakers[].markets[].outcomes[]`
 *    and emit one candidate per (bookmaker, market, player, side, point)
 *    that survives:
 *      - launch-market filter (only points / rebounds / assists / made threes);
 *      - allowlist + sportsbook source-class filter (DFS excluded);
 *      - non-null player description + numeric price + numeric point + side.
 *  * NEVER consults `previous_timestamp` — absent-from-final offerings stay
 *    excluded.
 */
export function processHistoricalSnapshot(
  input: HistoricalSnapshotProcessingInput
): HistoricalSnapshotProcessingResult {
  const close_capture = evaluateCloseCapture({
    requested_close_boundary_utc: input.requested_close_boundary_utc,
    returned_snapshot_ts: input.response.timestamp ?? null,
  });

  if (close_capture.close_capture_state !== 'eligible') {
    return Object.freeze({
      close_capture,
      candidates: Object.freeze([]) as ReadonlyArray<
        HistoricalSourceClosingQuoteCandidate
      >,
      exclusions: Object.freeze([]) as ReadonlyArray<any>,
    });
  }

  const data = input.response.data;
  if (data === undefined || data === null) {
    return Object.freeze({
      close_capture,
      candidates: Object.freeze([]) as ReadonlyArray<
        HistoricalSourceClosingQuoteCandidate
      >,
      exclusions: Object.freeze([]) as ReadonlyArray<any>,
    });
  }

  const provider_event_id = data.id;
  const bookmakers = data.bookmakers ?? [];

  // Group outcomes by (bookmaker, market, normalized_player, side, point)
  // and materialize the LAST occurrence in the final snapshot's outcomes array
  // as the closing quote. Provider returns outcomes in market order; the
  // final snapshot's outcomes list IS the "still offered at close" set.
  interface Key {
    bookmaker: string;
    market: string;
    player: string;
    side: string;
    point: number;
    price: number;
    provider_last_update: string | null;
  }
  const per_pair = new Map<string, { over: Key | null; under: Key | null }>();
  const exclusions: HistoricalSnapshotProcessingResult['exclusions'] = [] as any;

  for (const bm of bookmakers) {
    const bkey = bm.key;
    if (!isAllowlistedBookmakerKey(bkey)) {
      (exclusions as any).push({
        bookmaker_key: bkey,
        market_key: '',
        outcome: 'unallowlisted_bookmaker_key' as const,
        reason_detail: `bookmaker key ${bkey} is not in the V1 allowlist`,
      });
      continue;
    }
    const sclass = sourceClassForBookmakerKey(bkey);
    if (sclass !== 'sportsbook') {
      (exclusions as any).push({
        bookmaker_key: bkey,
        market_key: '',
        outcome: 'dfs_pickem_excluded_from_sportsbook_consensus' as const,
        reason_detail: `bookmaker key ${bkey} is source_class=${sclass}; sportsbook-only for historical seed`,
      });
      continue;
    }
    const markets = bm.markets ?? [];
    for (const m of markets) {
      const mkey = m.key;
      if (!isLaunchMarketKey(mkey)) {
        (exclusions as any).push({
          bookmaker_key: bkey,
          market_key: mkey,
          outcome: 'unlaunched_market_key' as const,
          reason_detail: `market ${mkey} is not one of the four launch markets`,
        });
        continue;
      }
      const provider_last_update = m.last_update ?? null;
      const outcomes = m.outcomes ?? [];
      for (const o of outcomes) {
        const description = typeof o.description === 'string' ? o.description : '';
        if (description.trim() === '') {
          (exclusions as any).push({
            bookmaker_key: bkey,
            market_key: mkey,
            outcome: 'missing_player_description' as const,
            reason_detail: 'outcome has no description',
          });
          continue;
        }
        const point_val = o.point;
        if (typeof point_val !== 'number' || !Number.isFinite(point_val)) {
          (exclusions as any).push({
            bookmaker_key: bkey,
            market_key: mkey,
            outcome: 'missing_point' as const,
            reason_detail: `outcome for ${description} has no numeric point`,
          });
          continue;
        }
        const name_lower = (o.name ?? '').trim().toLowerCase();
        if (name_lower !== 'over' && name_lower !== 'under') {
          (exclusions as any).push({
            bookmaker_key: bkey,
            market_key: mkey,
            outcome: 'missing_side' as const,
            reason_detail: `outcome name ${o.name} is not Over or Under`,
          });
          continue;
        }
        const price_val = o.price;
        if (typeof price_val !== 'number' || !Number.isFinite(price_val)) {
          // Point/side/description present but no price — retain the point
          // as a candidate anyway (§7.10.1 requires the point; price is
          // optional for closing-line seed metrics). Continue.
        }
        const pair_key = `${bkey}|${mkey}|${normalizeName(description)}|${point_val}`;
        const bucket = per_pair.get(pair_key) ?? { over: null, under: null };
        const side_key: 'over' | 'under' = name_lower as 'over' | 'under';
        bucket[side_key] = {
          bookmaker: bkey,
          market: mkey,
          player: description,
          side: side_key,
          point: point_val,
          price:
            typeof price_val === 'number' && Number.isFinite(price_val)
              ? Math.trunc(price_val)
              : 0,
          provider_last_update,
        };
        per_pair.set(pair_key, bucket);
      }
    }
  }

  const candidates: HistoricalSourceClosingQuoteCandidate[] = [];
  for (const [, bucket] of per_pair) {
    const any_key = bucket.over ?? bucket.under;
    if (any_key === null) continue;
    const closing_over_price = bucket.over !== null ? bucket.over.price : null;
    const closing_under_price =
      bucket.under !== null ? bucket.under.price : null;
    candidates.push(
      Object.freeze({
        provider_event_id,
        bookmaker_key: any_key.bookmaker,
        market_key: any_key.market,
        source_class: 'sportsbook' as const,
        closing_point: any_key.point,
        closing_over_price,
        closing_under_price,
        provider_last_update: any_key.provider_last_update,
        close_capture_state: 'eligible' as const,
        detail: `player=${any_key.player}`,
      })
    );
  }

  return Object.freeze({
    close_capture,
    candidates: Object.freeze(candidates),
    exclusions: Object.freeze(exclusions),
  });
}

/** Minimal-scope normalizer for grouping keys inside this module. */
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

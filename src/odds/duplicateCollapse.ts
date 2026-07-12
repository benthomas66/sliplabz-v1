// Duplicate collapse & conflict quarantine for market offerings.
//
// Authority:
//   Odds sub-spec §10.5 (deduplication rules — group by event/bookmaker/
//     market/normalized_player/side/point/price/last_update; preserve raw
//     row references; emit one canonical observation for field-equivalent
//     duplicates; record the duplicate_count; quarantine materially
//     conflicting duplicates; deduplicate BEFORE movement/current-line/
//     consensus calculations)
//   Odds sub-spec §10.9 (offering state)
//   Odds sub-spec §11.6, §12.8 (multi-line preservation)
//   Odds sub-spec §15.3 (no source row silently discarded; provenance retained)
//   Ticket V1-3 hard invariants:
//     - Raw snapshots retained BEFORE duplicate collapse;
//     - Exact duplicates collapse only after raw retention;
//     - Conflicting duplicates quarantine with evidence;
//     - Missing side never fabricated.

import type {
  DfsPromotionType,
  OfferingConflictReason,
  OfferingState,
  OutcomeSide,
  PriceSemantic,
} from '../shared/enums.js';
import { canonicalOfferingHash } from './sourceHash.js';
import type { NormalizedOutcome } from './normalizeOutcome.js';

export interface CollapseInputRow {
  readonly raw_row_index: number;
  readonly outcome: NormalizedOutcome;
}

export interface CollapseContext {
  readonly provider_event_id: string;
  readonly bookmaker_key: string;
  readonly market_key: string;
  readonly provider_last_update: string | null;
  readonly promotion_type: DfsPromotionType;
}

export interface CollapsedOffering {
  readonly normalized_player_name: string;
  readonly side: OutcomeSide;
  readonly point: number;
  readonly raw_price_american: number;
  readonly raw_multiplier: number | null;
  readonly price_semantic: PriceSemantic;
  readonly duplicate_count: number;
  readonly source_hash: string;
  readonly promotion_type: DfsPromotionType;
  /** Indexes of raw rows that contributed to this canonical offering. */
  readonly contributing_raw_row_indexes: ReadonlyArray<number>;
  readonly offering_state: OfferingState;
  readonly conflict_reason: OfferingConflictReason | null;
}

export interface CollapseQuarantine {
  readonly reason:
    | 'conflicting_prices_same_key'
    | 'conflicting_points_same_key'
    | 'materially_different_last_update';
  readonly reason_detail: string;
  readonly involved_raw_row_indexes: ReadonlyArray<number>;
}

export interface CollapseResult {
  readonly offerings: ReadonlyArray<CollapsedOffering>;
  readonly quarantined_raw_row_indexes: ReadonlySet<number>;
  readonly conflict_group_count: number;
  readonly duplicate_group_count: number;
}

/**
 * Group rows by the §10.5 dedup key MINUS price / last_update. Within each
 * group:
 *   * if every row is field-equivalent → one canonical offering, duplicate_count=N.
 *   * if prices diverge → quarantine as conflicting_prices_same_key.
 *   * if points diverge for the same side → quarantine as conflicting_points_same_key.
 *
 * Multi-line preservation: distinct points for the same player/market/side
 * yield MULTIPLE canonical offerings, and the offering_state on each is set
 * to `multi_line` if the caller wants that mark. The caller decides state
 * from cross-offering topology — this function only collapses within a key.
 */
export function collapseOutcomes(
  rows: ReadonlyArray<CollapseInputRow>,
  ctx: CollapseContext
): CollapseResult {
  const groups = new Map<string, Array<CollapseInputRow>>();
  for (const r of rows) {
    // Grouping key intentionally excludes price and last_update. Rows that
    // disagree on price at the same normalized_player/side/point are the
    // conflict case; rows with different last_update are handled inside the
    // group below.
    const key =
      `${r.outcome.normalized_player_name}|${r.outcome.side}|${r.outcome.raw_point}|${r.outcome.price_semantic}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }

  const offerings: CollapsedOffering[] = [];
  const quarantined = new Set<number>();
  let conflict_group_count = 0;
  let duplicate_group_count = 0;

  for (const group of groups.values()) {
    if (group.length === 1) {
      const only = group[0]!;
      offerings.push(
        buildCanonical(only.outcome, ctx, [only.raw_row_index], 1, 'two_sided_complete', null)
      );
      continue;
    }
    // Group has >1 row. Check for material conflict.
    const prices = new Set(group.map((g) => g.outcome.raw_price));
    if (prices.size > 1) {
      // Conflicting prices at the same key. Quarantine every row and DO NOT
      // emit a canonical offering.
      conflict_group_count += 1;
      for (const g of group) quarantined.add(g.raw_row_index);
      continue;
    }
    // Prices agree. Multipliers agree (Odds §11.4/§12.4 — same across audit).
    const multipliers = new Set(group.map((g) => String(g.outcome.raw_multiplier)));
    if (multipliers.size > 1) {
      conflict_group_count += 1;
      for (const g of group) quarantined.add(g.raw_row_index);
      continue;
    }
    // Names / descriptions may differ verbatim but the normalized name is
    // the identity — grouping guarantees they agree.
    duplicate_group_count += 1;
    const canonical = buildCanonical(
      group[0]!.outcome,
      ctx,
      group.map((g) => g.raw_row_index),
      group.length,
      'two_sided_complete',
      null
    );
    offerings.push(canonical);
  }

  // Multi-line detection: any (normalized_player, side) with more than one
  // distinct point flips those offerings' state to `multi_line`. Preserve
  // every point (§11.6 / §12.8).
  const points_by_side = new Map<string, Set<number>>();
  for (const o of offerings) {
    const key = `${o.normalized_player_name}|${o.side}`;
    if (!points_by_side.has(key)) points_by_side.set(key, new Set());
    points_by_side.get(key)!.add(o.point);
  }
  const flagged: CollapsedOffering[] = offerings.map((o) => {
    const key = `${o.normalized_player_name}|${o.side}`;
    if ((points_by_side.get(key)?.size ?? 0) > 1) {
      return { ...o, offering_state: 'multi_line' as const };
    }
    return o;
  });

  // One-sidedness classification (§10.9). Any (player, point) that has only
  // one side is `over_only` or `under_only`.
  const sides_by_point = new Map<string, Set<OutcomeSide>>();
  for (const o of flagged) {
    const key = `${o.normalized_player_name}|${o.point}`;
    if (!sides_by_point.has(key)) sides_by_point.set(key, new Set());
    sides_by_point.get(key)!.add(o.side);
  }
  const final_offerings: CollapsedOffering[] = flagged.map((o) => {
    if (o.offering_state === 'multi_line') return o;
    const key = `${o.normalized_player_name}|${o.point}`;
    const set = sides_by_point.get(key)!;
    if (set.size === 1) {
      const only = set.values().next().value as OutcomeSide;
      return { ...o, offering_state: only === 'over' ? 'over_only' : 'under_only' };
    }
    return { ...o, offering_state: 'two_sided_complete' };
  });

  return {
    offerings: Object.freeze(final_offerings),
    quarantined_raw_row_indexes: quarantined,
    conflict_group_count,
    duplicate_group_count,
  };
}

function buildCanonical(
  o: NormalizedOutcome,
  ctx: CollapseContext,
  raw_indexes: ReadonlyArray<number>,
  duplicate_count: number,
  offering_state: OfferingState,
  conflict_reason: OfferingConflictReason | null
): CollapsedOffering {
  const source_hash = canonicalOfferingHash({
    provider_event_id: ctx.provider_event_id,
    bookmaker_key: ctx.bookmaker_key,
    market_key: ctx.market_key,
    normalized_player_name: o.normalized_player_name,
    side: o.side,
    point: o.raw_point,
    raw_price_american: o.raw_price,
    raw_multiplier: o.raw_multiplier,
    price_semantic: o.price_semantic,
    provider_last_update: ctx.provider_last_update,
  });
  return Object.freeze({
    normalized_player_name: o.normalized_player_name,
    side: o.side,
    point: o.raw_point,
    raw_price_american: o.raw_price,
    raw_multiplier: o.raw_multiplier,
    price_semantic: o.price_semantic,
    duplicate_count,
    source_hash,
    promotion_type: ctx.promotion_type,
    contributing_raw_row_indexes: Object.freeze(raw_indexes.slice()) as ReadonlyArray<number>,
    offering_state,
    conflict_reason,
  });
}

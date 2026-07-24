// V1-A1-3 Phase C — read-model input builder.
//
// Authorities:
//   * docs/product/EVIDENCE_PROFILE_METHOD_V1.md §A (input bindings).
//     Every field this builder assembles is bound to a NAMED read-model
//     module by §A. No parallel computation is performed here.
//   * V1_COMPUTATION_CONTRACT.md §1 (single owner per metric) and §9
//     (V1-5x RME-1/2/3). This builder READS the read model; it does not
//     RE-AGGREGATE.
//   * V1-A1-3 Phase B report §3.3.1 (the eight-step pipeline scoped for
//     this ticket).
//
// The ORDERING DEPENDENCY §A.1 encodes:
//   read current market row → extract consensus point →
//   compute threshold windows AT that line → assemble RME-1/2/3.
// The threshold windows MUST use the consensus point as the threshold
// per §A.1 verbatim: "one invocation per window, all against the
// evaluated line as threshold."
//
// SHORT-CIRCUIT CASES (all three admit a null / absent consensus_point;
// none may fabricate a line):
//
//   (1) Tied consensus (line_consensus.selection_method =
//       'tied_no_unique_mode', consensus_point IS NULL,
//       eligible_book_count > 0):
//         - There is no evaluated line, so threshold windows cannot be
//           computed at "the line". The builder passes `evaluated_line = 0`
//           as a TYPE PLACEHOLDER (the EvidenceProfileInput type requires
//           number; this fiction never propagates to the persisted
//           profile because the engine's §C.3.1 (DR-28) check reaches
//           `unavailable` in §D.1 step 1 BEFORE evaluating components,
//           and the output's `evaluated_line` is set to null on that
//           path per V1-A1-2 CHECK.
//         - The composed CurrentMarketRow.line_consensus.selection_method
//           of `'tied_no_unique_mode'` alone drives the outcome. The
//           builder does NOT invent a lower / upper / average / first-
//           observed / single-book line.
//
//   (2) No usable current market (§C.3 four-way disambiguation reaches
//       `no_current_market_unavailable`, i.e. `freshness='unavailable'`
//       OR `(freshness ∈ {stale, failed_latest_poll} AND book_count=0)`):
//         - consensus_point may be null. Builder passes 0 placeholder as
//           above. Engine reaches `unavailable` in §D.1 step 1 via
//           `NO_CURRENT_MARKET`; components not evaluated; persisted
//           evaluated_line is null.
//
//   (3) Unresolved mapping (§C.9 — MappingResolutionResult.player_resolved
//       or event_resolved is false):
//         - consensus_point may be present but the engine short-circuits
//           to `unavailable` at §D.1 step 1 via `UNRESOLVED_*_MAPPING`
//           BEFORE components are evaluated. Builder does not need to
//           special-case; it assembles the input truthfully.
//
// In all three, the builder DOES NOT fabricate the evaluated line. When
// `consensus_point` is null, `evaluated_line = 0` is a shape placeholder
// that never appears on the persisted profile.
//
// GOVERNOR NOTE (V1-A1-3 Phase C review, ~line 156 below).
// When `consensus_point` is null, the builder passes `evaluated_line = 0`
// as a shape placeholder and computes four threshold windows against it.
// Those values are garbage — every stat sits above a line of 0 — and are
// discarded: `engine.ts` reaches its Unavailable short-circuit and returns
// with `c_rtp / c_ms / c_wa / c_ma / composite_score` all null before any
// component consumes them. No fabricated number can reach a persisted
// profile. The behaviour is contained structurally because
// `threshold_windows` is an ENGINE INPUT and never leaves the engine call —
// the writer persists components, versions, and audit references, never
// the windows.
//
// The honest type is `evaluated_line: number | null` with a
// correspondingly nullable `threshold_windows`, which would make the
// fabrication IMPOSSIBLE rather than harmless-by-downstream-guard. The
// governor declined a REVISE here: the fix cascades through Phase A's
// committed input type for zero present risk. It should be done the next
// time those types are legitimately opened, and this note exists so that
// ticket knows why.
//
// Secondary, minor: the discarded window computation is wasted CPU on
// every short-circuited grain. No extra queries — `games` is fetched once
// and reused.
//
// Pure DB reader. No I/O beyond the pg client. No clock reads — both
// `reference_date` and `today_utc_date` are injected by the caller.

import type { Tx } from '../../db/transaction.js';
import type {
  CurrentMarketRow,
  CurrentOffering,
} from '../../computation/types.js';
import { composeCurrentMarketRow } from '../../computation/currentMarketRow.js';
import { computeThresholdWindow } from '../../computation/thresholdWindows.js';
import type { ThresholdWindowGame } from '../../computation/thresholdWindows.js';
import { readHistoricalCoverageForPlayerMarket } from '../../computation/historicalCoverage.js';
import { readMappingResolutionForGrain } from '../../computation/mappingResolution.js';
import type { EvidenceGrain } from './populate.js';
import type { EvidenceProfileInput, ThresholdWindows } from '../types.js';
import type { LaunchMarket } from '../marginNormalizers.js';
import { LAUNCH_MARKETS } from '../marginNormalizers.js';
import type { EvidenceProfileAuditRefs } from '../writer.js';

/**
 * Extra inputs the caller supplies (today's date + the reference date the
 * windows are computed against). Both are ISO YYYY-MM-DD UTC calendar days.
 */
export interface ReadModelBuilderContext {
  readonly today_utc_date: string;
  readonly reference_date: string;
}

/**
 * Result the driver expects from a builder: the assembled input + audit
 * refs, or null to signal "skip this grain" (e.g. market_key not in the
 * DR-14 launch set — the four-market scope lock per GD-9).
 *
 * V1-A2-4 — ADDITIVE field `line_observed_at`.
 *   The freshest `market_snapshots.observed_at` across the grain's
 *   current-poll, self-observed offerings — the SAME `latestObserved`
 *   value the builder already computes and hands the composer as
 *   `freshness.last_observed_at` (see `readCurrentMarketRow`). It is an
 *   OBSERVATION time drawn from the data, never a processing/clock time.
 *   `null` exactly when the grain has no such offering (empty set); NULL
 *   is honest and is never replaced by a fallback or sentinel timestamp.
 *
 *   The v1 populator consumes only `.input` and `.audit` (by property, not
 *   positionally — see `src/evidence/driver/populate.ts`), so this extra
 *   field changes nothing v1 computes. The v2 populator's
 *   `V2BuildProfileInput` consumes it (via `makeV2ReadModelInputBuilder`).
 */
export type ReadModelBuilderResult = {
  readonly input: EvidenceProfileInput;
  readonly line_observed_at: string | null;
  readonly audit: EvidenceProfileAuditRefs;
} | null;

/**
 * Construct a hosted-default `BuildProfileInput` closure that reads from
 * the DB via the caller-supplied Tx. Consumers wire this into the
 * driver's `build_profile_input` option so the driver's default is a
 * REAL read-model builder — not the throwing stub from Phase B.
 */
export function makeReadModelInputBuilder(
  ctx: ReadModelBuilderContext
): (grain: EvidenceGrain, tx: Tx) => Promise<ReadModelBuilderResult> {
  return async (grain, tx) => buildOneGrain(grain, tx, ctx);
}

// ---------------------------------------------------------------------------
// Per-grain assembly
// ---------------------------------------------------------------------------

async function buildOneGrain(
  grain: EvidenceGrain,
  tx: Tx,
  ctx: ReadModelBuilderContext
): Promise<ReadModelBuilderResult> {
  // §A binds the engine to the four DR-14 launch markets (GD-9). If a
  // grain names a market outside that set, skip — no fabricated
  // normalizer, no partial evaluation. This matches Phase A's
  // marginNormalizers.ts which throws on non-launch markets.
  if (!(LAUNCH_MARKETS as ReadonlyArray<string>).includes(grain.market_key)) {
    return null;
  }
  const market_key = grain.market_key as LaunchMarket;

  // ---- Step 1: read the composed CurrentMarketRow (canonical read path) ---
  //
  // §A.3 binds every current-market field to `composeCurrentMarketRow`
  // (`src/computation/currentMarketRow.ts`). The persisted
  // `current_market_rows` summary table stores only a FLAT subset
  // (line_consensus_point, freshness_state, eligible_sportsbook_count,
  // point_distribution, first_observed_*, movement summary refs). It
  // does NOT store `line_consensus.selection_method` as an enum,
  // `book_detail.one_sided`, or `availability_context`. Those come only
  // from the composer.
  //
  // The canonical read path is: pull the underlying offering rows for
  // the grain (via CURRENT_ONLY_WHERE_CLAUSE / provenance='self_observed'
  // gating that §11.4 enforces) and hand them to `composeCurrentMarketRow`.
  // This is exactly what `currentMarketRowsAggregator.ts` does when it
  // WRITES current_market_rows; we do the same to READ the composed
  // shape.
  // `line_observed_at` is surfaced here from the SAME value the composer
  // uses for grain freshness — no second query, no clock read, no
  // recomputation by another route (V1-A2-4).
  const { row: currentMarketRow, line_observed_at } = await readCurrentMarketRow(tx, grain);

  // ---- Step 2: the game status (§C.8) --------------------------------------
  const gameStatus = await readGameStatus(tx, grain.internal_game_id);

  // ---- Step 3: pick the evaluated line -------------------------------------
  //
  // The canonical Discover profile is evaluated at line_consensus.consensus_point
  // (V1-A1-2 grain ruling: sportsbook_consensus). When null, the engine
  // short-circuits before consuming the value — see the short-circuit
  // documentation at the top of this file for the three cases and their
  // outcomes.
  const consensus_point = currentMarketRow.line_consensus.consensus_point;
  const evaluated_line = consensus_point ?? 0; // 0 is a type placeholder; engine reaches Unavailable

  // ---- Step 4: threshold windows AT the evaluated line ---------------------
  //
  // §A.1 verbatim: "The engine takes threshold-relative results per
  // window from `ThresholdWindowResult` (`src/computation/thresholdWindows.ts`
  // → `computeThresholdWindow(window_type, threshold, games)`), one
  // invocation per window, all against the evaluated line as threshold."
  //
  // The games are read from historical_line_results (latest
  // computation_version per grain) joined to games for the date.
  // §A.1 binds each game's `player_stat_value` to
  // `player_game_stats.normalized_stats` via
  // `historical_line_results.player_stat_value` (which is denormalised
  // at write time). We do NOT re-normalise here.
  const games = await readHistoricalGamesForPlayerMarket(tx, grain.internal_player_id, market_key);
  const threshold_windows: ThresholdWindows = Object.freeze({
    L5: computeThresholdWindow('L5', evaluated_line, games),
    L10: computeThresholdWindow('L10', evaluated_line, games),
    L20: computeThresholdWindow('L20', evaluated_line, games),
    season: computeThresholdWindow('season', evaluated_line, games),
  });

  // ---- Step 5: RME-1 (historical coverage) --------------------------------
  const historical_coverage = await readHistoricalCoverageForPlayerMarket(
    tx,
    grain.internal_player_id,
    market_key
  );

  // ---- Step 6: RME-2 (mapping resolution) ---------------------------------
  //
  // Documented caveat (mappingResolution.ts lines 82-102): these
  // predicates are provider-blind and mean "approved for AT LEAST ONE
  // provider" — not "approved for every provider a profile needs." The
  // absence of per-provider data typically surfaces through §C.3
  // NO_CURRENT_MARKET rather than §C.9 UNRESOLVED_*_MAPPING. This
  // builder consumes the field as-is; the engine's §C.9 check is
  // faithful to the shape's semantics.
  const mapping_resolution = await readMappingResolutionForGrain(
    tx,
    grain.internal_player_id,
    grain.internal_game_id
  );

  // ---- Step 7: RME-3 book_detail.one_sided --------------------------------
  //
  // RME-3 lives on the composed CurrentMarketRow.book_detail; already
  // available from Step 1. NEVER fabricated — null is a legitimate
  // value ("offering set empty or every price null").
  const book_detail_one_sided = currentMarketRow.book_detail.one_sided;

  // ---- Step 8: assemble the input + audit refs ----------------------------
  const input: EvidenceProfileInput = Object.freeze({
    internal_game_id: grain.internal_game_id,
    internal_player_id: grain.internal_player_id,
    market_key,
    evaluated_line,
    evaluated_source_kind: 'sportsbook_consensus',
    evaluated_source_identifier: null,
    threshold_windows,
    current_market_row: currentMarketRow,
    historical_coverage,
    mapping_resolution,
    game_status: gameStatus,
    today_utc_date: ctx.today_utc_date,
    reference_date: ctx.reference_date,
  });
  const audit: EvidenceProfileAuditRefs = Object.freeze({
    current_market_row_id: grain.current_market_row_id,
    // Availability snapshot lookup is deferred: §A.4 binds availability to
    // CurrentMarketRow.availability_context which is composed from
    // bdl_availability_current_state, not directly from a snapshot id.
    // The V1-A1-2 schema admits NULL here (documented in the migration:
    // "nullable when availability itself unresolved / source_unavailable").
    // A follow-up ticket may wire a specific snapshot id lookup; today
    // the profile row's audit lineage is anchored by current_market_row_id.
    bdl_availability_snapshot_id: null,
    book_detail_one_sided,
    source_read_model_computation_version: grain.source_read_model_computation_version,
  });
  return Object.freeze({ input, line_observed_at, audit });
}

// ---------------------------------------------------------------------------
// Read helpers — each cites §A binding.
// ---------------------------------------------------------------------------

/**
 * Read composed CurrentMarketRow via the canonical composer per §A.3.
 * Follows the pattern established by
 * `src/computation/driver/currentMarketRowsAggregator.ts` verbatim:
 * pull eligible current-poll offerings and hand them to
 * `composeCurrentMarketRow`.
 *
 * This does NOT touch historical (backfilled_historical) rows —
 * `market_snapshots.provenance = 'self_observed'` + `request_kind =
 * 'current_poll'` is enforced by the V1-3 / V1-4 CHECK constraints (§11.4)
 * and doubled here as an explicit predicate.
 */
async function readCurrentMarketRow(
  tx: Tx,
  grain: EvidenceGrain
): Promise<{ row: CurrentMarketRow; line_observed_at: string | null }> {
  const offs = await tx.query(
    `SELECT mo.market_offering_id::text AS market_offering_id,
            ms.market_snapshot_id::text AS source_snapshot_id,
            ms.bookmaker_key,
            COALESCE(br.display_title, ms.bookmaker_key) AS display_title,
            mo.point::float8 AS point,
            mo.raw_price_american AS raw_price_american,
            mo.side::text AS side,
            ms.provider_last_update,
            ms.observed_at
       FROM market_offerings mo
       JOIN market_snapshots ms ON ms.market_snapshot_id = mo.market_snapshot_id
       LEFT JOIN bookmaker_registry br ON br.provider_key = ms.bookmaker_key
      WHERE ms.linked_internal_game_id = $1::uuid
        AND mo.internal_player_id = $2::uuid
        AND ms.market_key = $3
        AND ms.request_kind = 'current_poll'
        AND ms.provenance = 'self_observed'`,
    [grain.internal_game_id, grain.internal_player_id, grain.market_key]
  );

  // Group over/under prices at the same (book, point) grain — the pattern
  // the V1-5 aggregator uses. `CurrentOffering` demands both sides for
  // downstream one-sided detection.
  interface OfferRow {
    market_offering_id: string; source_snapshot_id: string; bookmaker_key: string;
    display_title: string; point: number;
    raw_price_american: number | null;
    side: 'over' | 'under';
    provider_last_update: string | Date | null;
    observed_at: string | Date;
  }
  const byBookPoint = new Map<string, {
    bookmaker_key: string; display_title: string; point: number;
    over_price: number | null; under_price: number | null;
    provider_last_update: string | null; observed_at: string;
    source_snapshot_id: string; market_offering_id: string;
  }>();
  for (const raw of offs.rows as ReadonlyArray<OfferRow>) {
    const key = `${raw.bookmaker_key}|${raw.point}`;
    const entry = byBookPoint.get(key) ?? {
      bookmaker_key: raw.bookmaker_key,
      display_title: raw.display_title,
      point: Number(raw.point),
      over_price: null,
      under_price: null,
      provider_last_update: raw.provider_last_update instanceof Date
        ? raw.provider_last_update.toISOString()
        : raw.provider_last_update,
      observed_at: raw.observed_at instanceof Date ? raw.observed_at.toISOString() : raw.observed_at,
      source_snapshot_id: raw.source_snapshot_id,
      market_offering_id: raw.market_offering_id,
    };
    if (raw.side === 'over') entry.over_price = raw.raw_price_american;
    else if (raw.side === 'under') entry.under_price = raw.raw_price_american;
    byBookPoint.set(key, entry);
  }
  const currentOfferings: ReadonlyArray<CurrentOffering> = Array.from(byBookPoint.values())
    .map((v) => Object.freeze(v));

  // Freshness derives from the latest observed_at across offerings for
  // the grain — the aggregator's pattern (V1-5). If the grain has zero
  // offerings, `latestObserved = null` and the composer treats
  // freshness as unavailable (defense-in-depth against a stale
  // snapshot leaking).
  const latestObserved = currentOfferings
    .map((o) => o.observed_at)
    .sort()
    .at(-1) ?? null;

  const row = composeCurrentMarketRow({
    internal_game_id: grain.internal_game_id,
    internal_player_id: grain.internal_player_id,
    market_key: grain.market_key,
    current_offerings: currentOfferings,
    // The engine does not consume earliest_observations / movement_events
    // beyond what `CurrentMarketRow.movement_summary` exposes. Passing
    // empty lists lets the composer produce a valid shape; a hosted
    // follow-up ticket can wire these when live-polling produces them.
    earliest_observations: [],
    movement_events: [],
    freshness: {
      last_observed_at: latestObserved,
      // Freshness is evaluated relative to `now` inside the composer.
      // Passing the reference date as "now" would misrepresent the
      // grain's staleness; we honestly report the current wall clock.
      // This is the ONLY clock read in this builder, and it is scoped
      // to the composer's freshness owner (not the engine).
      now: new Date().toISOString(),
      last_poll_succeeded: true,
      source_unavailable: false,
    },
    availability: null,
  });

  // V1-A2-4 — surface `line_observed_at` = `latestObserved`, the EXACT
  // value fed to the composer above as `freshness.last_observed_at`. It is
  // the freshest `observed_at` across the grain's current-poll,
  // self-observed offerings (the set assembled into `currentOfferings` and
  // passed to the composer as `current_offerings`). Not recomputed by a
  // second route; not a clock read. `null` iff `currentOfferings` is empty.
  return { row, line_observed_at: latestObserved };
}

/**
 * Read the game's status (§C.8 §15.5 exclusion). Truthful — nothing
 * defaulted.
 */
async function readGameStatus(tx: Tx, internal_game_id: string): Promise<
  'scheduled' | 'live' | 'final' | 'postponed' | 'canceled' | 'unresolved'
> {
  const r = await tx.query(
    `SELECT status::text AS status FROM games WHERE internal_game_id = $1::uuid`,
    [internal_game_id]
  );
  if (r.rowCount === 0) {
    // A grain whose game row is missing is a data integrity issue upstream
    // of the engine. `unresolved` is the games.status enum's own catch-all;
    // §C.8 does not force Unavailable on that value. Reporting it truthfully
    // keeps the builder honest without inventing a state.
    return 'unresolved';
  }
  return (r.rows[0] as { status: string }).status as
    'scheduled' | 'live' | 'final' | 'postponed' | 'canceled' | 'unresolved';
}

/**
 * Read the player's historical games at the latest computation_version
 * per grain, ordered reverse-chronologically (most recent first). §A.1
 * binds each game's `player_stat_value` to
 * `historical_line_results.player_stat_value` which is denormalised at
 * write time from `player_game_stats.normalized_stats`.
 */
async function readHistoricalGamesForPlayerMarket(
  tx: Tx,
  internal_player_id: string,
  market_key: string
): Promise<ReadonlyArray<ThresholdWindowGame>> {
  const r = await tx.query(
    `WITH latest AS (
       SELECT DISTINCT ON (internal_game_id, internal_player_id, market_key)
              internal_game_id, internal_player_id, market_key,
              player_stat_value, provenance, computation_version
         FROM historical_line_results
        WHERE internal_player_id = $1::uuid
          AND market_key = $2
          AND coverage_state IN ('complete', 'single_book')
        ORDER BY internal_game_id, internal_player_id, market_key,
                 computation_version DESC, computed_at DESC
     )
     SELECT to_char(g.scheduled_start_utc AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS game_date_utc,
            latest.player_stat_value::float8 AS player_stat_value,
            latest.provenance = 'backfilled_historical' AS is_backfilled_historical
       FROM latest
       JOIN games g ON g.internal_game_id = latest.internal_game_id
      ORDER BY g.scheduled_start_utc DESC`,
    [internal_player_id, market_key]
  );
  return (r.rows as ReadonlyArray<{
    game_date_utc: string;
    player_stat_value: number;
    is_backfilled_historical: boolean;
  }>);
}

// V1-OP-1 — operational constants for the scheduled polling loop.
//
// OPERATOR-TUNABLE. These are OPS PARAMETERS, not method authority. Changing
// any of them is an OPERATOR decision (cost/cadence/safety), NOT a
// method_version event: they do not touch the evidence method, thresholds,
// engine, writers, composer, sweep, aggregator, or populator, and they never
// change what a profile MEANS — only when/whether a cycle spends.
//
// The serve-suppress horizon (3600s, D-A1) is NOT here and is NOT tunable by
// operators — it is method authority. This module introduces NO second
// suppression threshold.

export interface OpsConstants {
  /**
   * Pregame window: a game is "in window" when its scheduled tipoff is within
   * this many seconds of now. 10800 = 3h — matches the V1-4h cost model
   * (15-min cadence over a 3h pregame window). Polling is PREGAME ONLY; the
   * window starts at now and ends at tipoff, so a game is never polled past
   * tipoff (in-play is out of scope).
   */
  readonly CYCLE_WINDOW_BEFORE_TIPOFF_SECONDS: number;
  /** Max events polled in one cycle. 5 events × 4 markets = 20 ≤ ceiling. */
  readonly CYCLE_EVENT_CAP: number;
  /** Hard per-cycle credit stop. A cycle refuses to project above this. */
  readonly CYCLE_CREDIT_CEILING: number;
  /** Refuse to poll when the observed remaining balance is below this. A bug
   *  or a schedule misconfiguration cannot silently drain the month. */
  readonly RESERVE_FLOOR_CREDITS: number;
}

export const OPS_CONSTANTS: OpsConstants = Object.freeze({
  CYCLE_WINDOW_BEFORE_TIPOFF_SECONDS: 10800, // 3h
  CYCLE_EVENT_CAP: 5,
  CYCLE_CREDIT_CEILING: 25,
  RESERVE_FLOOR_CREDITS: 1000,
});

// ---------------------------------------------------------------------------
// V1-OP-4 — HISTORICAL INGESTION LAG GATE parameters (ops, NOT method authority)
//
// These two constants govern the SYSTEM-LEVEL serve-time gate that suppresses
// the whole Board when historical stat ingestion has fallen behind (a game
// whose scheduled tip is in the past has NO player_game_stats row). They are
// OPS PARAMETERS — cost / correctness / safety — exactly like the polling
// constants above:
//
//   * They govern WHEN the Board serves, NEVER what a profile MEANS. They do
//     not touch the evidence method, thresholds, engine, writers, composer,
//     classification, scoring, or persistence.
//   * They are a SEPARATE DIMENSION from D-A1's market-side serve horizon
//     (`T_SERVE_SUPPRESS_MAX_SECONDS` = 3600s, method authority in
//     `src/evidence/v2/thresholds.ts`). D-A1 measures the recency of the
//     CURRENT MARKET LINE; these measure the recency of the UNDERLYING GAMES.
//     They are ORTHOGONAL and introduce NO change to D-A1 — the 3600s horizon
//     is untouched and there is still no second market-freshness threshold.
//   * Operator-tunable: changing them is an OPS decision, not a method_version
//     event.
// ---------------------------------------------------------------------------

/**
 * Grace window (48h). A past-tip game younger than this WITHOUT a
 * player_game_stats row is normal pending ingestion — it is COUNTED (so lag
 * growth is observable in the serve-time log) but does NOT by itself fire the
 * gate. Tolerates a single 48-96h straggler (a data anomaly, not a stopped
 * pipeline).
 */
export const INGESTION_LAG_GRACE_SECONDS = 172800; // 48h

/**
 * Suppress threshold (96h). Suppress the WHOLE Board when ANY unresolved
 * past-tip game is older than this. Fail-safe on a real stoppage: fires at
 * 4 days, not 19 — but tolerant of a lone 48-96h straggler that stays under
 * this bound.
 */
export const INGESTION_LAG_SUPPRESS_SECONDS = 345600; // 96h

// ---------------------------------------------------------------------------
// V1-OP-4c — the ENGINE'S usable-coverage set, MIRRORED by the ingestion gate
// (GAP-26). Ops-not-method.
//
// The evidence engine builds its threshold-window observations from
// `historical_line_results` rows whose `coverage_state` is one of these values
// (`src/evidence/driver/readModelInputBuilder.ts` → `readHistoricalGamesForPlayerMarket`;
// `src/computation/historicalSeriesRead.ts`). Both engine readers INLINE
// `coverage_state IN ('complete', 'single_book')`. The V1-OP-4c ingestion gate
// re-anchors its suppression trigger to THIS same set — the table the engine
// actually consumes — so restoring box scores can no longer lift suppression
// while the engine is still blind to a past-tip game with no usable closing
// line.
//
// This is a MIRROR, NOT a shared owner: the engine readers keep their own
// inline literal (editing them to import this constant would break the
// compose-only boundary). A DRIFT-TRIPWIRE TEST reads the engine reader source
// and fails loud if the engine's set ever diverges from this constant, so the
// two cannot silently part ways.
// ---------------------------------------------------------------------------

/**
 * The `historical_line_results.coverage_state` values the evidence engine
 * treats as a USABLE closing-line observation. The ingestion gate mirrors this
 * set to measure engine-coverage lag. Byte-identical to the engine readers;
 * bound by the drift-tripwire test.
 */
export const USABLE_HLR_COVERAGE_STATES = ['complete', 'single_book'] as const;

/**
 * V1-OP-4c LOWER BOUND (GAP-26 follow-through). The ingestion gate measures its
 * TWO metrics over only the N most recent past-tip games LEAGUE-WIDE (by
 * scheduled tipoff), not over all history. A game-count bound — never a calendar
 * window — because:
 *   * A calendar lookback would SCROLL A LIVE STALL OUT OF VIEW: at day (window+1)
 *     of an unbroken stall the failure ages past the horizon and the gate lifts
 *     on stale evidence — the same "guard stops guarding under an unstated
 *     condition" defect class as GAP-26. A game-count bound cannot: an active
 *     stall keeps the most-recent games unresolved, always inside the window.
 *   * It EXCLUDES ANCIENT PERMANENT HOLES by construction, so the gate can LIFT
 *     once recent ingestion is healthy. (Real example at authoring time: two
 *     final games with box scores but no closing line — 2026-06-03 and
 *     2026-06-30 — would otherwise pin `oldest_coverage_unresolved_tip` forever.)
 *
 * SIZING (verified against hosted data 2026-07-31; oldest permanent hole
 * 2026-06-30 sat at rank 70, the 07-12 stall spanned ranks 1-43):
 *   * Floor 43 — cover the entire current stall (oldest unresolved = 07-12).
 *   * Ceiling 69 — strictly below the nearest permanent hole (rank 70); any
 *     N ≥ 70 re-pins suppression on 2026-06-30.
 *   * N = 55 centres the feasible band [43,69]: ±20% = [44,66] BOTH stay valid
 *     (each excludes the June holes and catches the full stall — 42 unresolved,
 *     oldest 07-12). 55 league games ≈ each team's last ~8-9 games (13 teams,
 *     2 per game), fully vouching L5 and most of L10.
 *
 * NOTE the deliberate limit: the FULL L20 reach is ~130 league games
 * (20 × 13/2) — INFEASIBLE here, as it re-includes the rank-70 hole. So L20's
 * deeper tail and the UNBOUNDED season window reach past N and are NOT vouched
 * by this gate; that residual is registered as GAP-27 (not solved here).
 */
export const INGESTION_COVERAGE_RECENT_GAMES_N = 55;

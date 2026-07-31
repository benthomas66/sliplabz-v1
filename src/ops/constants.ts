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

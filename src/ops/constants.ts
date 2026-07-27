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

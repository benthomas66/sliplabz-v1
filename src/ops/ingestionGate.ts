// V1-OP-4 / V1-OP-4c — HISTORICAL INGESTION SERVING GATE (pure decision + log).
//
// A SYSTEM-LEVEL, serve-time suppression gate. The market-side serve gate
// (D-A1, `src/evidence/v2/servingGate.ts`) keys ENTIRELY off the current
// market line and so reports a profile "fresh" even when the ten games behind
// it are weeks stale. This gate is the missing historical-side analogue: it
// measures the recency of the UNDERLYING GAMES and suppresses the whole Board
// when ingestion has fallen behind — honest-empty beats confidently-wrong.
//
// This module is the SERVING/OPS layer. It carries NO method authority. It
// does not touch the evidence method, thresholds, engine, writers,
// classification, scoring, projection, or persistence. It reads no clocks:
// the single `serve_now` for the request is caller-supplied, mirroring
// `servingGate.ts`.
//
// V1-OP-4c — RE-ANCHOR TO THE ENGINE'S COVERAGE TABLE (GAP-26).
//   The gate now measures TWO metrics against one `serve_now`, and keys
//   suppression on the one the evidence engine actually consumes:
//
//     * Metric A — engine coverage (DRIVES suppression): past-tip games with
//       NO usable `historical_line_results` row (coverage_state in the engine's
//       USABLE_HLR_COVERAGE_STATES). This is what the threshold windows read;
//       a game without a usable closing line is invisible to the engine, so the
//       Board must not serve a window built behind it.
//     * Metric B — box-score absence (REPORTED only): past-tip games with NO
//       `player_game_stats` row (the original V1-OP-4 metric). A real, distinct
//       failure worth logging — but NOT the suppression trigger.
//
//   Metric A STRICTLY DOMINATES Metric B: usable hlr denormalises its stat
//   value from a pgs row, so hlr-resolved ⟹ pgs-present; Metric A already
//   covers every pgs-absent game PLUS the pgs-present-but-no-usable-line games.
//   Suppressing on A is the correct, more-conservative guard. The two metrics
//   are NEVER collapsed into one number — each keeps its own counts and its own
//   oldest tip, distinguishable in the log.
//
// SEPARATION OF CONCERNS (STEP 0.4):
//   * The IMPURE probe (a read-only two-metric query over games vs
//     historical_line_results and player_game_stats) lives in the Board
//     repository and produces an `IngestionLagMetric`.
//   * The PURE decision below consumes (metric, serve_now, constants) and is
//     unit-testable with NO database.

import {
  INGESTION_LAG_GRACE_SECONDS,
  INGESTION_LAG_SUPPRESS_SECONDS,
} from './constants.js';

/**
 * The source kind behind a metric. The FIXTURE/preview path has no live
 * ingestion (it is design data, not a live pipeline), so it is EXEMPT: it
 * never suppresses and never emits the serve-time ingestion log.
 */
export type IngestionSourceKind = 'postgres' | 'fixture';

/**
 * Read-only ingestion-lag metric. Produced by the repository probe. Carries
 * TWO independent metrics measured against the SAME `serve_now`; future games
 * are excluded from both. Neither metric references game status or the
 * newest-final game (finalization is itself broken; a status-based gate would
 * never fire).
 *
 * V1-OP-4c LOWER BOUND: both metrics are computed over ONLY the
 * `INGESTION_COVERAGE_RECENT_GAMES_N` most recent past-tip games league-wide
 * (applied in the probe SQL). A game-count bound — never calendar — so a live
 * stall cannot scroll out of view, while ancient permanent holes are excluded
 * by construction and the gate can LIFT once recent ingestion is healthy. The
 * pure decision below is unchanged: it still keys on `oldest_coverage_unresolved_tip`,
 * which the probe now reports within that recent-N window.
 *
 * METRIC A — engine coverage (DRIVES suppression). `coverage_unresolved(g)` =
 * `games.scheduled_start_utc < serve_now` AND there is NO
 * `historical_line_results` row for that `internal_game_id` with a
 * `coverage_state` in `USABLE_HLR_COVERAGE_STATES`. Game-level existence proxy
 * (matches the pgs gate's granularity).
 *
 * METRIC B — box-score absence (REPORTED only). `pgs_absent(g)` =
 * `games.scheduled_start_utc < serve_now` AND there is NO `player_game_stats`
 * row for that `internal_game_id`.
 */
export interface IngestionLagMetric {
  /** `postgres` = live source (gate active). `fixture` = design/preview (exempt). */
  readonly source_kind: IngestionSourceKind;

  // ---- Metric A — engine coverage (DRIVES suppression) --------------------
  /** Count of coverage-unresolved past-tip games older than the 48h grace window. */
  readonly coverage_unresolved_past_grace_48h: number;
  /** Count of coverage-unresolved past-tip games older than the 96h suppress threshold. */
  readonly coverage_unresolved_past_fire_96h: number;
  /** Oldest coverage-unresolved past-tip (ISO 8601), or null when none. DRIVES suppression. */
  readonly oldest_coverage_unresolved_tip: string | null;
  /** Newest game WITH a usable-coverage hlr row (ISO 8601), or null. Log context only. */
  readonly newest_usable_coverage_game: string | null;

  // ---- Metric B — box-score absence (REPORTED only) -----------------------
  /** Count of pgs-absent past-tip games older than the 48h grace window. */
  readonly pgs_absent_past_grace_48h: number;
  /** Count of pgs-absent past-tip games older than the 96h suppress threshold. */
  readonly pgs_absent_past_fire_96h: number;
  /** Oldest pgs-absent past-tip (ISO 8601), or null when none. Diagnostic only. */
  readonly oldest_pgs_absent_tip: string | null;
}

/** The pure serving decision produced from a metric + serve_now. */
export interface IngestionCurrencyDecision {
  /** True → suppress the whole Board to the approved empty state. */
  readonly ingestion_behind: boolean;
  /**
   * True for the FIXTURE/preview source: no live ingestion, so the gate is
   * inert (never suppresses) AND the serve-time log is NOT emitted.
   */
  readonly exempt: boolean;
}

/** An exempt metric for sources with no live ingestion (fixture / preview). */
export const FIXTURE_INGESTION_METRIC: IngestionLagMetric = Object.freeze({
  source_kind: 'fixture',
  coverage_unresolved_past_grace_48h: 0,
  coverage_unresolved_past_fire_96h: 0,
  oldest_coverage_unresolved_tip: null,
  newest_usable_coverage_game: null,
  pgs_absent_past_grace_48h: 0,
  pgs_absent_past_fire_96h: 0,
  oldest_pgs_absent_tip: null,
});

/**
 * PURE decision. No clock read; `serve_now` is caller-supplied and is the
 * SAME single instant used everywhere in the request. A function of only
 * (metric, serve_now, constants).
 *
 *   ingestion_behind = the oldest COVERAGE-UNRESOLVED past-tip game (Metric A)
 *                      is older than serve_now − INGESTION_LAG_SUPPRESS_SECONDS
 *                      (96h).
 *
 * Suppression keys on METRIC A ONLY (engine coverage). Metric B (pgs absence)
 * is diagnostic and NEVER changes the decision — a game with a box score but no
 * usable closing line is still invisible to the engine, so it must still
 * suppress (the GAP-26 fix). Because Metric A strictly dominates Metric B, this
 * is the more-conservative guard.
 *
 * The fixture/preview source is EXEMPT: it is design data, not a live
 * pipeline, so it can never be "behind".
 *
 * NOTE the two-threshold behaviour (Metric A): a lone straggler in the 48-96h
 * band (`coverage_unresolved_past_grace_48h >= 1`,
 * `coverage_unresolved_past_fire_96h = 0`, `oldest_coverage_unresolved_tip`
 * younger than 96h) is TOLERATED — the Board still serves. Only a game past 96h
 * fires the gate.
 */
export function decideIngestionCurrency(
  metric: IngestionLagMetric,
  serve_now: string,
): IngestionCurrencyDecision {
  if (metric.source_kind === 'fixture') {
    return Object.freeze({ ingestion_behind: false, exempt: true });
  }
  if (metric.oldest_coverage_unresolved_tip === null) {
    return Object.freeze({ ingestion_behind: false, exempt: false });
  }
  const serve_ms = Date.parse(serve_now);
  const oldest_ms = Date.parse(metric.oldest_coverage_unresolved_tip);
  if (!Number.isFinite(serve_ms) || !Number.isFinite(oldest_ms)) {
    // Data-integrity failure on a LIVE source: fail safe by suppressing.
    // Better honest-empty than serving on an uncomputable lag. (Applied to
    // Metric A. GAP-25 — a distinct log reason for this fail-safe — is
    // assigned to V1-OP-4b and is NOT folded in here.)
    return Object.freeze({ ingestion_behind: true, exempt: false });
  }
  const oldest_age_seconds = (serve_ms - oldest_ms) / 1000;
  const ingestion_behind = oldest_age_seconds > INGESTION_LAG_SUPPRESS_SECONDS;
  return Object.freeze({ ingestion_behind, exempt: false });
}

/** Grace/suppress seconds a probe should count against, exposed for the
 *  repository so the SQL and the pure decision agree on one source of truth. */
export const INGESTION_GATE_PARAMS = Object.freeze({
  INGESTION_LAG_GRACE_SECONDS,
  INGESTION_LAG_SUPPRESS_SECONDS,
});

/** ISO timestamp → `YYYY-MM-DD`, or `none` when null. Log formatting only. */
function toDateStamp(iso: string | null): string {
  if (iso === null) return 'none';
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return 'none';
  return new Date(ms).toISOString().slice(0, 10);
}

/** Distinct greppable prefixes: pass and suppress paths grep separately. */
export const BOARD_SUPPRESSED_PREFIX = 'BOARD_SUPPRESSED';
export const BOARD_SERVE_OK_PREFIX = 'BOARD_SERVE_OK';

/**
 * Build the ONE serve-time structured log line for a serve decision on the
 * LIVE (postgres) source. An INSTRUMENT, not just a tripwire: it emits BOTH
 * metric blocks on BOTH paths so lag growth (0 → 20 → 34 games) is visible
 * BEFORE it crosses 96h.
 *
 * Two greppable axes:
 *   * Distinct PREFIX per path (`BOARD_SUPPRESSED` / `BOARD_SERVE_OK`) so
 *     pass and suppress grep separately.
 *   * The two metric blocks are separated by ` || ` so the `coverage_*`
 *     (Metric A, drives suppression) and `pgs_*` (Metric B, diagnostic)
 *     numbers grep separately and are never confused for one another.
 *
 * The fixture/preview path emits neither and must NOT call this.
 */
export function buildIngestionServeLogLine(
  metric: IngestionLagMetric,
  ingestion_behind: boolean,
): string {
  const coverageBlock =
    `coverage_unresolved_past_grace_48h=${metric.coverage_unresolved_past_grace_48h}` +
    ` · coverage_unresolved_past_fire_96h=${metric.coverage_unresolved_past_fire_96h}` +
    ` · oldest_coverage_unresolved_tip=${toDateStamp(metric.oldest_coverage_unresolved_tip)}` +
    ` · newest_usable_coverage=${toDateStamp(metric.newest_usable_coverage_game)}`;
  const pgsBlock =
    `pgs_absent_past_grace_48h=${metric.pgs_absent_past_grace_48h}` +
    ` · pgs_absent_past_fire_96h=${metric.pgs_absent_past_fire_96h}` +
    ` · oldest_pgs_absent_tip=${toDateStamp(metric.oldest_pgs_absent_tip)}`;
  const shape = `${coverageBlock} || ${pgsBlock}`;
  return ingestion_behind
    ? `${BOARD_SUPPRESSED_PREFIX} coverage_behind: ${shape}`
    : `${BOARD_SERVE_OK_PREFIX} coverage_ok: ${shape}`;
}

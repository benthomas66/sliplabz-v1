// V1-OP-4 — HISTORICAL INGESTION SERVING GATE (pure decision + log format).
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
// SEPARATION OF CONCERNS (STEP 0.4):
//   * The IMPURE probe (a read-only games-vs-player_game_stats query) lives in
//     the Board repository and produces an `IngestionLagMetric`.
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
 * Read-only ingestion-lag metric. Produced by the repository probe.
 *
 * `unresolved(g)` = `games.scheduled_start_utc < serve_now` AND there is NO
 * `player_game_stats` row for that `internal_game_id`. Future games are
 * excluded. The metric NEVER references game status or the newest-final game
 * (finalization is itself broken; a status-based gate would never fire).
 */
export interface IngestionLagMetric {
  /** `postgres` = live source (gate active). `fixture` = design/preview (exempt). */
  readonly source_kind: IngestionSourceKind;
  /** Count of unresolved past-tip games older than the 48h grace window. */
  readonly unresolved_past_grace_48h: number;
  /** Count of unresolved past-tip games older than the 96h suppress threshold. */
  readonly unresolved_past_fire_96h: number;
  /** Oldest unresolved past-tip (ISO 8601), or null when none are unresolved. */
  readonly oldest_unresolved_tip: string | null;
  /** Newest game that HAS ingested stats (ISO 8601), or null. Log context only. */
  readonly newest_ingested_game: string | null;
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
  unresolved_past_grace_48h: 0,
  unresolved_past_fire_96h: 0,
  oldest_unresolved_tip: null,
  newest_ingested_game: null,
});

/**
 * PURE decision. No clock read; `serve_now` is caller-supplied and is the
 * SAME single instant used everywhere in the request. A function of only
 * (metric, serve_now, constants).
 *
 *   ingestion_behind = the oldest unresolved past-tip game is older than
 *                      serve_now − INGESTION_LAG_SUPPRESS_SECONDS (96h).
 *
 * The fixture/preview source is EXEMPT: it is design data, not a live
 * pipeline, so it can never be "behind".
 *
 * NOTE the two-threshold behaviour: a lone straggler in the 48-96h band
 * (`unresolved_past_grace_48h >= 1`, `unresolved_past_fire_96h = 0`,
 * `oldest_unresolved_tip` younger than 96h) is TOLERATED — the Board still
 * serves. Only a game past 96h fires the gate.
 */
export function decideIngestionCurrency(
  metric: IngestionLagMetric,
  serve_now: string,
): IngestionCurrencyDecision {
  if (metric.source_kind === 'fixture') {
    return Object.freeze({ ingestion_behind: false, exempt: true });
  }
  if (metric.oldest_unresolved_tip === null) {
    return Object.freeze({ ingestion_behind: false, exempt: false });
  }
  const serve_ms = Date.parse(serve_now);
  const oldest_ms = Date.parse(metric.oldest_unresolved_tip);
  if (!Number.isFinite(serve_ms) || !Number.isFinite(oldest_ms)) {
    // Data-integrity failure on a LIVE source: fail safe by suppressing.
    // Better honest-empty than serving on an uncomputable lag.
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
 * LIVE (postgres) source. An INSTRUMENT, not just a tripwire: it emits the
 * three-number shape on BOTH paths so lag growth (0 → 20 → 34 games) is
 * visible BEFORE it crosses 96h. Distinct prefix per path so pass and
 * suppress grep separately. The fixture/preview path emits neither and must
 * NOT call this.
 */
export function buildIngestionServeLogLine(
  metric: IngestionLagMetric,
  ingestion_behind: boolean,
): string {
  const shape =
    `unresolved_past_grace_48h=${metric.unresolved_past_grace_48h}` +
    ` · unresolved_past_fire_96h=${metric.unresolved_past_fire_96h}` +
    ` · oldest_unresolved_tip=${toDateStamp(metric.oldest_unresolved_tip)}` +
    ` · newest_ingested_game=${toDateStamp(metric.newest_ingested_game)}`;
  return ingestion_behind
    ? `${BOARD_SUPPRESSED_PREFIX} ingestion_behind: ${shape}`
    : `${BOARD_SERVE_OK_PREFIX} ingestion_ok: ${shape}`;
}

// V1-4c Phase B — historical_line_results first-pass populator.
//
// Purpose: scan (canonical_closing_points ⋈ player_game_stats) at the
// (game, player, market) grain and insert one historical_line_results row
// per eligible grain. Consumed by scripts/v1_4c_phase_b_populate.ts.
//
// Why this exists at all — the "gap" identified by V1-4c Phase A §A:
//   The V1-5 recomputationWriter is CORRECTION-DRIVEN. A NEW player_game_stats
//   row emits change_kind='initial_observation' and buildStatCorrectionInvalidations
//   returns []. No `recomputation_invalidations` row is enqueued, so the
//   writer never fires against initial landings. The only INSERT INTO
//   historical_line_results in src/ is inside recomputationWriter, gated
//   by an invalidation. That is the gap this populator closes for the
//   seeded historical data.
//
// Governor ruling carried from Phase A: Option B (retro-emitting
// invalidations for initial stat landings) is REJECTED. Option A — a
// dedicated first-pass populator reusing computeHistoricalLineResult — is
// APPROVED. This module is Option A.
//
// Hard requirements observed:
//   * Reuse src/lines/historicalLineResult.ts::computeHistoricalLineResult.
//     No parallel margin, outcome, push, or coverage math is written here.
//   * Version-aware UPSERT on historical_line_results_grain_version_unique
//     with DO UPDATE SET restricted to the exact recomputable columns —
//     mirrors recomputationWriter's shape line-for-line so a re-run is
//     safe and the V1-5 "ON CONFLICT DO NOTHING silently preserved stale
//     rows" anti-pattern is impossible here.
//   * Every INSERT verifies rowCount === 1 and throws on mismatch. Batch
//     rolls back on any mismatch.
//   * Batched transactions; a failure leaves NO partial batch.
//   * Fresh pg.Client per batch (V1-4b lesson). No pooled client held idle.
//     Retry only on connection-class errors.
//   * Idempotent + resumable: a second run's derived-column checksum
//     matches the first; computation_version does not advance.
//   * Eligibility filter identical to V1-4c Phase A §C.2 AND to
//     recomputationWriter::recomputeHistoricalForGamePlayer: canonical
//     point IS NOT NULL AND player_game_stats.eligibility_state = 'eligible'.
//     Ineligible grains are ABSENT, never defaulted.
//   * Provenance: 'backfilled_historical'. The seeded closing points came
//     from the V1-4b historical-snapshot pipeline (market_snapshots.provenance
//     = 'backfilled_historical' at the lineage root). The V1-4b CHECK-
//     widening migration 20260711150000 admits this value. No CHECK is
//     weakened.
//   * Coverage labels are the canonical_closing_points value verbatim
//     ('single_book' or 'complete'). The V1-4 CHECK on
//     historical_line_results.coverage_state admits exactly those two;
//     other selection_method rows ('tied_no_unique_mode', 'no_eligible_source')
//     are filtered out at query time. No relabel-to-dodge-constraint (V1-5
//     D3 lesson).
//   * Pushes are a distinct outcome — computeHistoricalLineResult owns
//     that classification; this module never touches it.

import { randomUUID } from 'node:crypto';
import pg from 'pg';

import {
  computeHistoricalLineResult,
  type HistoricalLineResultInput,
} from './historicalLineResult.js';
import { V1_5_COMPUTATION_VERSION } from '../computation/computationVersion.js';

/**
 * The eligibility filter this module applies at query time. Held here as a
 * named constant so the operator script (and the report) can quote it
 * verbatim without a stringifying mistake.
 */
export const HISTORICAL_LINE_RESULTS_BACKFILL_ELIGIBILITY_SQL = `
  ccp.canonical_closing_point IS NOT NULL
  AND ccp.selection_method IN ('single_book', 'unique_modal')
  AND ccp.coverage_label   IN ('single_book', 'complete')
  AND pgs.eligibility_state = 'eligible'
`.trim();

/** The provenance value written for every seeded row. */
export const BACKFILL_PROVENANCE = 'backfilled_historical' as const;

/** How many grains a single batch pulls + UPSERTs inside one transaction. */
export const DEFAULT_BATCH_SIZE = 500;

/** Retry classification: transient connection errors only. */
const CONNECTION_ERROR_PATTERNS = [
  'ECONNRESET',
  'ETIMEDOUT',
  'ECONNREFUSED',
  'EPIPE',
  'Connection terminated',
  'Client has encountered a connection error and is not queryable',
] as const;

function isConnectionError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return CONNECTION_ERROR_PATTERNS.some((p) => msg.includes(p));
}

/**
 * Map canonical market_key → the normalized_stats key on player_game_stats.
 * Mirrors the recomputationWriter join: recomputationWriter reads it from
 * market_registry.canonical_stat_key. We do the same — no hard-coded map.
 */
export interface MarketStatKeyRow {
  readonly market_key: string;
  readonly canonical_stat_key: string;
}

export interface GrainRow {
  readonly ccp_id: string;
  readonly internal_game_id: string;
  readonly internal_player_id: string;
  readonly market_key: string;
  readonly canonical_closing_point: string; // pg NUMERIC → string
  readonly coverage_label: 'single_book' | 'complete';
  readonly canonical_stat_key: string;
  readonly pgs_id: string;
  readonly normalized_stats: Record<string, unknown>;
}

export interface BackfillCounters {
  /** Grains observed from the eligibility scan (over the whole run). */
  readonly grains_observed: number;
  /** Grains skipped because the normalized stat value was null / non-finite. */
  readonly grains_skipped_missing_stat: number;
  /** Rows the UPSERT actually inserted (xmax = 0). */
  readonly rows_inserted: number;
  /** Rows the UPSERT actually updated (xmax <> 0). */
  readonly rows_updated: number;
  /** Batches that ran end-to-end without a retry. */
  readonly batches_ok: number;
  /** Batches that retried at least once and eventually succeeded. */
  readonly batches_retried: number;
  /** Rows written per market (INSERT + UPDATE combined). */
  readonly rows_per_market: Readonly<Record<string, number>>;
  /** UUID assigned to this run for correlation. */
  readonly run_id: string;
  /** ISO timestamps bookending the run. */
  readonly started_at: string;
  readonly finished_at: string;
}

export interface BackfillOptions {
  /** Postgres connection string (SLIPLABZ_HOSTED_DATABASE_URL). */
  readonly connection_string: string;
  /** Grains per batch. Defaults to DEFAULT_BATCH_SIZE. */
  readonly batch_size?: number;
  /** If true, run BEGIN/ROLLBACK per batch — no persistent effect. */
  readonly dry_run?: boolean;
  /**
   * Restrict to a single market (e.g. 'player_points'). Optional; used by
   * spot-check operator flows. Not authorized to widen scope.
   */
  readonly only_market?: string;
  /**
   * V1-OP-8a (GAP-36). Restrict the run to an EXPLICIT set of internal game
   * ids. This is a SCOPE NARROWING ONLY: it appends one conjunct to the batch
   * query alongside the existing `cursor` / `only_market` narrowings and does
   * NOT alter `HISTORICAL_LINE_RESULTS_BACKFILL_ELIGIBILITY_SQL`, the grain
   * definition, the stat extraction, or the UPSERT — a grain processed under
   * this restriction produces byte-identical output to the same grain in an
   * unrestricted run. Mirrors the sibling canonical owner's committed
   * `restrict_to_internal_game_ids` parameter
   * (`seed/orchestrator/canonicalClosingPointsForSeed.ts`).
   *
   * Omit (or pass null) for the historical global behavior. Like
   * `only_market`, this is NOT authorized to widen scope.
   */
  readonly restrict_to_internal_game_ids?: ReadonlyArray<string> | null;
  /**
   * Callback invoked after each successful batch commit with cumulative
   * counters. Operator script uses it for progress logging.
   */
  readonly on_batch?: (progress: BackfillCounters) => void;
}

/**
 * V1-OP-8b (Option A). The minimal query surface the batch work needs. Both
 * `pg.Client` (the standalone path) and `Tx` (a caller-supplied game-level
 * transaction) satisfy it, so widening `fetchBatch` / `upsertGrain` to this
 * type is a PURE WIDENING — no statement, parameter, or behavior changes.
 */
export interface GrainQueryRunner {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[]; rowCount: number | null }>;
}

/** V1-4b lesson: fresh pg.Client per batch. No pooled client held idle. */
async function openFreshClient(connection_string: string): Promise<pg.Client> {
  // Supabase hosted requires TLS; the driver auto-detects sslmode from the
  // URL but we keep it explicit to match src/db/connection.ts's behavior
  // for a hosted `supabase.` host.
  const ssl = connection_string.includes('supabase.')
    ? { rejectUnauthorized: false }
    : undefined;
  const client = new pg.Client({
    connectionString: connection_string,
    ...(ssl !== undefined ? { ssl } : {}),
    // Belt-and-braces: prevent a runaway UPSERT from hanging the batch.
    statement_timeout: 30_000,
  });
  await client.connect();
  return client;
}

async function withFreshClientRetry<T>(
  connection_string: string,
  body: (c: pg.Client) => Promise<T>
): Promise<{ result: T; retried: boolean }> {
  let attempts = 0;
  let last_err: unknown = null;
  while (attempts < 3) {
    attempts += 1;
    const client = await openFreshClient(connection_string);
    try {
      const result = await body(client);
      return { result, retried: attempts > 1 };
    } catch (err) {
      last_err = err;
      if (!isConnectionError(err)) {
        throw err;
      }
      // Fall through: try again with a fresh client.
    } finally {
      try {
        await client.end();
      } catch {
        // Ignore end() errors — the caller has the meaningful error.
      }
    }
  }
  throw last_err;
}

/**
 * Load every (market_key, canonical_stat_key) pair the market_registry
 * declares. The map is used to select the correct normalized_stats field
 * for each grain — mirrors recomputationWriter's join on the same field.
 */
export async function loadMarketStatKeys(
  c: pg.Client
): Promise<ReadonlyMap<string, string>> {
  const r = await c.query(
    `SELECT provider_key AS market_key, canonical_stat_key
       FROM market_registry
      WHERE is_launch_market = true
        AND canonical_stat_key <> ''`
  );
  const m = new Map<string, string>();
  for (const row of r.rows as Array<{ market_key: string; canonical_stat_key: string }>) {
    m.set(row.market_key, row.canonical_stat_key);
  }
  return m;
}

/**
 * Fetch the next batch of eligible grains after the given cursor.
 * `cursor` is a `(internal_game_id, internal_player_id, market_key)` tuple —
 * pass null to start from the first row. The ORDER BY exactly matches the
 * DISTINCT ON key so pagination is stable.
 */
async function fetchBatch(
  c: GrainQueryRunner,
  cursor: { game: string; player: string; market: string } | null,
  batch_size: number,
  only_market: string | null,
  restrict_to_internal_game_ids: ReadonlyArray<string> | null = null
): Promise<GrainRow[]> {
  // The eligibility SQL is embedded here to keep the batch query in one
  // place; the exported constant above is the same string, quoted so the
  // operator script + report can reference it verbatim.
  const params: unknown[] = [batch_size];
  const conds: string[] = [
    HISTORICAL_LINE_RESULTS_BACKFILL_ELIGIBILITY_SQL,
  ];
  if (cursor !== null) {
    conds.push(
      `(ccp.internal_game_id, ccp.internal_player_id, ccp.market_key)
       > ($${params.length + 1}::uuid, $${params.length + 2}::uuid, $${params.length + 3}::text)`
    );
    params.push(cursor.game, cursor.player, cursor.market);
  }
  if (only_market !== null) {
    conds.push(`ccp.market_key = $${params.length + 1}::text`);
    params.push(only_market);
  }
  // V1-OP-8a (GAP-36): explicit game-ownership narrowing. Same conjunct
  // pattern as `cursor` / `only_market`; the eligibility predicate above is
  // untouched, so per-grain output is unchanged.
  if (restrict_to_internal_game_ids !== null && restrict_to_internal_game_ids.length > 0) {
    conds.push(`ccp.internal_game_id = ANY($${params.length + 1}::uuid[])`);
    params.push([...restrict_to_internal_game_ids]);
  }
  const sql = `
    SELECT ccp.canonical_closing_point_id::text  AS ccp_id,
           ccp.internal_game_id::text            AS internal_game_id,
           ccp.internal_player_id::text          AS internal_player_id,
           ccp.market_key                        AS market_key,
           ccp.canonical_closing_point::text     AS canonical_closing_point,
           ccp.coverage_label                    AS coverage_label,
           mr.canonical_stat_key                 AS canonical_stat_key,
           pgs.player_game_stat_id::text         AS pgs_id,
           pgs.normalized_stats                  AS normalized_stats
      FROM canonical_closing_points ccp
      JOIN market_registry mr
        ON mr.provider_key = ccp.market_key
      JOIN player_game_stats pgs
        ON pgs.internal_game_id   = ccp.internal_game_id
       AND pgs.internal_player_id = ccp.internal_player_id
     WHERE ${conds.join('\n       AND ')}
     ORDER BY ccp.internal_game_id, ccp.internal_player_id, ccp.market_key
     LIMIT $1
  `;
  const r = await c.query(sql, params);
  return r.rows as GrainRow[];
}

/**
 * Run the UPSERT for a single grain inside an open transaction. Returns
 * whether the row was newly INSERTed (xmax = 0) versus UPDATEd (xmax <> 0).
 */
async function upsertGrain(
  c: GrainQueryRunner,
  row: GrainRow,
  stat_value: number
): Promise<'inserted' | 'updated'> {
  const canon_point = Number(row.canonical_closing_point);
  const result = computeHistoricalLineResult({
    canonical_closing_point: canon_point,
    player_stat_value: stat_value,
    coverage_label: row.coverage_label,
  } satisfies HistoricalLineResultInput);
  // `xmax = 0` inside the same statement distinguishes newly-inserted rows
  // from ON-CONFLICT-updated rows without a second SELECT.
  const w = await c.query(
    `INSERT INTO historical_line_results
       (internal_game_id, internal_player_id, market_key,
        canonical_closing_point_id, canonical_closing_point,
        player_game_stat_id, player_stat_key, player_stat_value,
        outcome, margin, coverage_state, provenance,
        computation_version, computed_at)
     VALUES ($1::uuid, $2::uuid, $3::text,
             $4::uuid, $5,
             $6::uuid, $7::text, $8,
             $9, $10, $11, $12,
             $13, now())
     ON CONFLICT ON CONSTRAINT historical_line_results_grain_version_unique
     DO UPDATE SET
       canonical_closing_point_id = EXCLUDED.canonical_closing_point_id,
       canonical_closing_point    = EXCLUDED.canonical_closing_point,
       player_game_stat_id        = EXCLUDED.player_game_stat_id,
       player_stat_key            = EXCLUDED.player_stat_key,
       player_stat_value          = EXCLUDED.player_stat_value,
       outcome                    = EXCLUDED.outcome,
       margin                     = EXCLUDED.margin,
       coverage_state             = EXCLUDED.coverage_state,
       computed_at                = now(),
       updated_at                 = now()
     RETURNING (xmax = 0) AS inserted`,
    [
      row.internal_game_id,
      row.internal_player_id,
      row.market_key,
      row.ccp_id,
      canon_point,
      row.pgs_id,
      row.canonical_stat_key,
      stat_value,
      result.outcome,
      result.margin,
      result.coverage_label,
      BACKFILL_PROVENANCE,
      V1_5_COMPUTATION_VERSION,
    ]
  );
  if ((w.rowCount ?? 0) !== 1) {
    // Deliberately verbose — the failure signature is what a future
    // operator will read in the log.
    throw new Error(
      `V1-4c populator: historical_line_results UPSERT affected ${w.rowCount ?? 0} rows for ` +
      `grain=(game=${row.internal_game_id}, player=${row.internal_player_id}, ` +
      `market=${row.market_key}, computation_version=${V1_5_COMPUTATION_VERSION}); expected 1. ` +
      `Rolling back the whole batch.`
    );
  }
  const inserted = (w.rows[0] as { inserted: boolean }).inserted;
  return inserted ? 'inserted' : 'updated';
}

/**
 * Extract the numeric stat value for the grain, or null if the
 * normalized_stats field is absent / non-finite (V1-2 null-to-zero is
 * applied on eligible played rows so a legitimate value is always present
 * — but the populator refuses to fabricate one if the read model has
 * genuinely omitted it, per the ticket's "absence is absence" rule).
 */
export function extractStatValue(
  normalized_stats: Record<string, unknown>,
  canonical_stat_key: string
): number | null {
  const v = normalized_stats[canonical_stat_key];
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  return v;
}

/**
 * Run one batch inside a transaction. Rolls back on any error.
 * Returns the batch's local counters + the last cursor consumed.
 */
async function runOneBatch(
  c: GrainQueryRunner,
  cursor: { game: string; player: string; market: string } | null,
  batch_size: number,
  only_market: string | null,
  dry_run: boolean,
  restrict_to_internal_game_ids: ReadonlyArray<string> | null = null,
  /**
   * V1-OP-8b: when false the CALLER owns the transaction (a game-level tx), so
   * this batch issues no BEGIN/COMMIT/ROLLBACK of its own. Defaults to true —
   * the standalone path's behavior is unchanged.
   */
  owns_transaction: boolean = true
): Promise<{
  local: {
    grains_observed: number;
    grains_skipped_missing_stat: number;
    rows_inserted: number;
    rows_updated: number;
    rows_per_market: Record<string, number>;
  };
  last_cursor: { game: string; player: string; market: string } | null;
}> {
  const rows = await fetchBatch(c, cursor, batch_size, only_market, restrict_to_internal_game_ids);
  if (rows.length === 0) {
    return {
      local: {
        grains_observed: 0,
        grains_skipped_missing_stat: 0,
        rows_inserted: 0,
        rows_updated: 0,
        rows_per_market: {},
      },
      last_cursor: cursor,
    };
  }
  const local = {
    grains_observed: rows.length,
    grains_skipped_missing_stat: 0,
    rows_inserted: 0,
    rows_updated: 0,
    rows_per_market: {} as Record<string, number>,
  };
  if (owns_transaction) await c.query('BEGIN');
  try {
    for (const row of rows) {
      const stat_value = extractStatValue(row.normalized_stats, row.canonical_stat_key);
      if (stat_value === null) {
        local.grains_skipped_missing_stat += 1;
        continue;
      }
      const outcome = await upsertGrain(c, row, stat_value);
      if (outcome === 'inserted') local.rows_inserted += 1;
      else local.rows_updated += 1;
      local.rows_per_market[row.market_key] =
        (local.rows_per_market[row.market_key] ?? 0) + 1;
    }
    if (owns_transaction) {
      if (dry_run) {
        await c.query('ROLLBACK');
      } else {
        await c.query('COMMIT');
      }
    }
  } catch (err) {
    // Only roll back a transaction we opened. Inside a caller-owned tx the
    // error propagates and the OUTER transaction rolls the whole game back.
    if (owns_transaction) await c.query('ROLLBACK').catch(() => undefined);
    throw err;
  }
  const last = rows[rows.length - 1]!;
  return {
    local,
    last_cursor: {
      game: last.internal_game_id,
      player: last.internal_player_id,
      market: last.market_key,
    },
  };
}

/**
 * Run the full populator. Batches until fetchBatch returns 0 rows.
 * Fresh pg.Client per batch. Retries connection-class errors up to 3 times.
 */
/**
 * V1-OP-8b (Option A). Populate hlr on a CALLER-SUPPLIED transaction.
 *
 * Same eligibility SQL, same (game, player, market) grain, same cursor
 * traversal, same version-aware UPSERT, same counters as the standalone
 * runner — only transaction ownership moves to the caller, so a bulk caller
 * can roll `source_closing_quotes` + `canonical_closing_points` + hlr back
 * TOGETHER for a game (GAP-37).
 *
 * Two DELIBERATE differences from the standalone form, both forced by running
 * inside someone else's transaction (neither changes the standalone path):
 *   * No BEGIN/COMMIT per batch — the caller's transaction spans every batch.
 *   * No fresh-client connection retry. A retry is meaningless inside an
 *     aborted transaction; the error propagates so the OUTER transaction rolls
 *     the whole game back. `batches_retried` is therefore always 0 here.
 */
export async function runHistoricalLineResultsBackfillInTx(
  tx: GrainQueryRunner,
  options: Pick<BackfillOptions, 'batch_size' | 'only_market' | 'restrict_to_internal_game_ids' | 'on_batch'>
): Promise<BackfillCounters> {
  const batch_size = options.batch_size ?? DEFAULT_BATCH_SIZE;
  const only_market = options.only_market ?? null;
  const restrict_to_internal_game_ids = options.restrict_to_internal_game_ids ?? null;
  const run_id = randomUUID();
  const started_at = new Date().toISOString();

  const cumulative = {
    grains_observed: 0,
    grains_skipped_missing_stat: 0,
    rows_inserted: 0,
    rows_updated: 0,
    batches_ok: 0,
    batches_retried: 0,
    rows_per_market: {} as Record<string, number>,
  };

  type BatchCursor = { game: string; player: string; market: string } | null;
  let cursor: BatchCursor = null;
  let previous_cursor: BatchCursor = null;
  for (;;) {
    const result = await runOneBatch(
      tx, cursor, batch_size, only_market, /* dry_run */ false,
      restrict_to_internal_game_ids, /* owns_transaction */ false,
    );
    cumulative.grains_observed += result.local.grains_observed;
    cumulative.grains_skipped_missing_stat += result.local.grains_skipped_missing_stat;
    cumulative.rows_inserted += result.local.rows_inserted;
    cumulative.rows_updated += result.local.rows_updated;
    for (const [m, n] of Object.entries(result.local.rows_per_market)) {
      cumulative.rows_per_market[m] = (cumulative.rows_per_market[m] ?? 0) + n;
    }
    if (result.local.grains_observed === 0) break;
    cumulative.batches_ok += 1;
    if (
      result.last_cursor === null ||
      (previous_cursor !== null &&
        previous_cursor.game === result.last_cursor.game &&
        previous_cursor.player === result.last_cursor.player &&
        previous_cursor.market === result.last_cursor.market)
    ) {
      break;
    }
    previous_cursor = cursor;
    cursor = result.last_cursor;
    options.on_batch?.(Object.freeze({ ...cumulative, run_id, started_at, finished_at: new Date().toISOString() }) as BackfillCounters);
  }

  return Object.freeze({
    ...cumulative,
    rows_per_market: Object.freeze(cumulative.rows_per_market),
    run_id,
    started_at,
    finished_at: new Date().toISOString(),
  });
}

export async function runHistoricalLineResultsBackfill(
  options: BackfillOptions
): Promise<BackfillCounters> {
  const batch_size = options.batch_size ?? DEFAULT_BATCH_SIZE;
  const only_market = options.only_market ?? null;
  const restrict_to_internal_game_ids = options.restrict_to_internal_game_ids ?? null;
  const dry_run = options.dry_run ?? false;

  const run_id = randomUUID();
  const started_at = new Date().toISOString();

  const cumulative = {
    grains_observed: 0,
    grains_skipped_missing_stat: 0,
    rows_inserted: 0,
    rows_updated: 0,
    batches_ok: 0,
    batches_retried: 0,
    rows_per_market: {} as Record<string, number>,
  };

  type Cursor = { game: string; player: string; market: string } | null;
  let cursor: Cursor = null;
  // Preflight validation: at least one eligible grain must exist — otherwise
  // Phase A did not populate player_game_stats and the run is a no-op.
  // Rather than silently succeed with zero rows, log the emptiness so the
  // operator has to read the report.
  let previous_cursor: Cursor = null;
  while (true) {
    const before = { ...cumulative };
    const { result, retried } = await withFreshClientRetry(
      options.connection_string,
      (c) => runOneBatch(c, cursor, batch_size, only_market, dry_run, restrict_to_internal_game_ids)
    );
    if (result.local.grains_observed === 0) break;
    cumulative.grains_observed += result.local.grains_observed;
    cumulative.grains_skipped_missing_stat += result.local.grains_skipped_missing_stat;
    cumulative.rows_inserted += result.local.rows_inserted;
    cumulative.rows_updated += result.local.rows_updated;
    for (const [mk, n] of Object.entries(result.local.rows_per_market)) {
      cumulative.rows_per_market[mk] = (cumulative.rows_per_market[mk] ?? 0) + n;
    }
    if (retried) cumulative.batches_retried += 1;
    else cumulative.batches_ok += 1;

    if (options.on_batch) {
      options.on_batch(
        Object.freeze({
          ...cumulative,
          rows_per_market: Object.freeze({ ...cumulative.rows_per_market }),
          run_id,
          started_at,
          finished_at: new Date().toISOString(),
        })
      );
    }

    // Sanity: if the cursor did not advance, we would loop forever. That
    // indicates the ORDER BY / cursor tuple lost a row. Throw defensively.
    if (
      result.last_cursor === previous_cursor ||
      (previous_cursor !== null &&
        result.last_cursor !== null &&
        previous_cursor.game === result.last_cursor.game &&
        previous_cursor.player === result.last_cursor.player &&
        previous_cursor.market === result.last_cursor.market &&
        result.local.grains_observed >= batch_size)
    ) {
      throw new Error(
        `V1-4c populator: batch cursor did not advance — potential infinite loop. ` +
        `Consumed ${result.local.grains_observed} rows but cursor is still ` +
        `(${previous_cursor?.game ?? 'null'}, ${previous_cursor?.player ?? 'null'}, ${previous_cursor?.market ?? 'null'}). ` +
        `Before-run counters: ${JSON.stringify(before)}.`
      );
    }
    previous_cursor = cursor;
    cursor = result.last_cursor;
  }

  return Object.freeze({
    grains_observed: cumulative.grains_observed,
    grains_skipped_missing_stat: cumulative.grains_skipped_missing_stat,
    rows_inserted: cumulative.rows_inserted,
    rows_updated: cumulative.rows_updated,
    batches_ok: cumulative.batches_ok,
    batches_retried: cumulative.batches_retried,
    rows_per_market: Object.freeze({ ...cumulative.rows_per_market }),
    run_id,
    started_at,
    finished_at: new Date().toISOString(),
  });
}

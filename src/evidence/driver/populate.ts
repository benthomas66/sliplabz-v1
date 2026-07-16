// V1-A1-3 Phase B — evidence-profile population driver.
//
// GRAIN SOURCE (declared per ticket rubric):
//
//   `current_market_rows` — the V1-5 read-model summary table that
//   materialises one row per `(internal_game_id, internal_player_id,
//   market_key, computation_version)` grain (per V1-A1-2 UNIQUE + V1-4
//   migration line 78). This driver scans the LATEST computation_version
//   per grain and drives one evidence-profile computation per grain.
//
// Why current_market_rows is the right source (with §C.3 citation):
//
//   1. §C.3 (four-way freshness disambiguation) presupposes the engine
//      "consults `CurrentMarketRow.freshness.state` and
//      `CurrentMarketRow.eligible_book_count.count`" — that consultation
//      only makes sense if a CurrentMarketRow EXISTS for the grain. When
//      no CurrentMarketRow exists at all, the grain is not in the
//      product's view; there is no §C.3 branch to evaluate against.
//   2. §C.3 row `unavailable | any book_count` DOES emit Unavailable +
//      NO_CURRENT_MARKET — but only when the CurrentMarketRow's freshness
//      state is `'unavailable'` AND the read model produced a row at all.
//      A total absence of the row is a stronger state than a row that
//      says "market unavailable."
//   3. V1_COMPUTATION_CONTRACT.md §7 ("driver contracts") lists the
//      `current_market_rows aggregator` as the driver that "upserts one
//      row per (game, player, market, computation_version)". That table
//      is therefore the authoritative product-slate grain source; every
//      grain in the product's view has a row there, and no grain outside
//      the product's view does.
//
// This driver DOES NOT poll live sources, DOES NOT compose CurrentMarketRow
// from raw offerings (that's V1-5's owner), and DOES NOT schedule itself.
// Scheduling belongs to a separate operational ticket. This driver is
// safe to call repeatedly.
//
// Idempotence + resumability: version-aware UPSERT in the writer means a
// second run at the same (method_version, computation_version) UPDATES
// rows in place; derived-column checksums do not change (only the
// timestamp columns move). No advancing of `computation_version` happens
// here.
//
// Fresh connection per batch, retry on connection-class errors ONLY
// (V1-4b lesson). No pooled client held idle across long-running work.
// No global uncaughtException handler.
//
// CURRENT HOSTED STATE: current_market_rows is empty. Nothing has ever
// polled live markets, and the seeded games are all final and past. The
// operator script's expected outcome against hosted is ZERO PROFILES
// WRITTEN — reported truthfully, not a failure. The DR-29 pre-first-
// profile exception remains active until the FIRST OPERATIVE PROFILE is
// persisted (§I.3 — test / fixture / migration-probe rows do NOT
// trigger expiry).

import { randomUUID } from 'node:crypto';
import pg from 'pg';

import type { Tx } from '../../db/transaction.js';
import { withTransaction } from '../../db/transaction.js';
import type { SliplabzPool } from '../../db/connection.js';
import { openPool } from '../../db/connection.js';
import type { EvidenceProfileInput } from '../types.js';
import { computeEvidenceProfile } from '../engine.js';
import type { EvidenceProfileAuditRefs } from '../writer.js';
import { writeEvidenceProfile } from '../writer.js';

/** V1-4b lesson pattern. Retries only on connection-class errors. */
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
 * One grain the driver visits: (game, player, market, current_market_row_id).
 * `current_market_row_id` is the id of the latest-computation_version row
 * that anchors the grain (audited on the resulting evidence_profile row).
 */
export interface EvidenceGrain {
  readonly internal_game_id: string;
  readonly internal_player_id: string;
  readonly market_key: string;
  readonly current_market_row_id: string;
  readonly source_read_model_computation_version: number;
}

/**
 * Callback the driver invokes to assemble the full `EvidenceProfileInput`
 * for a grain. The default hosted implementation reads from the tables;
 * tests supply their own callback so fixture inputs go straight through.
 *
 * Returning `null` signals "skip this grain" (e.g. read model incomplete
 * for the grain right now); it is NOT a failure.
 */
export type BuildProfileInput = (
  grain: EvidenceGrain,
  tx: Tx
) => Promise<{
  readonly input: EvidenceProfileInput;
  readonly audit: EvidenceProfileAuditRefs;
} | null>;

export interface PopulatorCounters {
  readonly grains_observed: number;
  readonly grains_skipped_no_input: number;
  readonly profiles_inserted: number;
  readonly profiles_updated: number;
  readonly batches_ok: number;
  readonly batches_retried: number;
  readonly run_id: string;
  readonly started_at: string;
  readonly finished_at: string;
}

export interface PopulatorOptions {
  /** Postgres connection URL. */
  readonly connection_string: string;
  /** Grains per batch. Default 50 (the compute is heavier than a plain
   *  UPSERT; smaller batches give more predictable timing). */
  readonly batch_size?: number;
  /** BEGIN/ROLLBACK per batch when true — no persistent effect. */
  readonly dry_run?: boolean;
  /** Injected profile-input builder. Tests override. Defaults to the
   *  hosted reader below. */
  readonly build_profile_input?: BuildProfileInput;
  /** Called after each successful batch commit with cumulative counters. */
  readonly on_batch?: (progress: PopulatorCounters) => void;
}

export const DEFAULT_BATCH_SIZE = 50;

/**
 * Fresh pg.Client per batch (V1-4b lesson). Wrapping openPool() in a
 * one-per-batch factory keeps the pool tiny (max=1) so it behaves like a
 * fresh client even though we use the pool's transaction helper.
 */
async function withFreshBatchClientRetry<T>(
  connection_string: string,
  body: (pool: SliplabzPool) => Promise<T>
): Promise<{ result: T; retried: boolean }> {
  let attempts = 0;
  let last_err: unknown = null;
  while (attempts < 3) {
    attempts += 1;
    const pool = openPool({
      connectionString: connection_string,
      max: 1,
      statement_timeout_ms: 30_000,
      ssl: connection_string.includes('supabase.') ? 'require' : 'disable',
    });
    try {
      const result = await body(pool);
      return { result, retried: attempts > 1 };
    } catch (err) {
      last_err = err;
      if (!isConnectionError(err)) throw err;
      // else fall through and retry with a fresh pool
    } finally {
      try { await pool.end(); } catch { /* ignore */ }
    }
  }
  throw last_err;
}

/**
 * List candidate grains from current_market_rows — latest
 * computation_version per (game, player, market). We only pass the
 * grain IDs + the anchor row; the callback fetches whatever else it
 * needs from the tx.
 */
async function listGrainsAfterCursor(
  pool: SliplabzPool,
  cursor: {
    readonly last_game: string;
    readonly last_player: string;
    readonly last_market: string;
  } | null,
  batch_size: number
): Promise<ReadonlyArray<EvidenceGrain>> {
  const params: unknown[] = [batch_size];
  let cursor_clause = '';
  if (cursor !== null) {
    cursor_clause = ` WHERE (internal_game_id, internal_player_id, market_key)
                         > ($${params.length + 1}::uuid, $${params.length + 2}::uuid, $${params.length + 3}::text)`;
    params.push(cursor.last_game, cursor.last_player, cursor.last_market);
  }
  const r = await pool.query(
    `WITH latest AS (
       SELECT DISTINCT ON (internal_game_id, internal_player_id, market_key)
              internal_game_id, internal_player_id, market_key,
              current_market_row_id,
              computation_version
         FROM current_market_rows
        ORDER BY internal_game_id, internal_player_id, market_key,
                 computation_version DESC, computed_at DESC
     )
     SELECT internal_game_id::text  AS internal_game_id,
            internal_player_id::text AS internal_player_id,
            market_key               AS market_key,
            current_market_row_id::text AS current_market_row_id,
            computation_version::int AS source_read_model_computation_version
       FROM latest
       ${cursor_clause}
      ORDER BY internal_game_id, internal_player_id, market_key
      LIMIT $1`,
    params
  );
  return (r.rows as ReadonlyArray<EvidenceGrain>);
}

/**
 * Run the populator to completion.
 *
 * Zero grains observed → zero profiles written → not a failure.
 * That is the expected outcome against the current hosted database
 * where current_market_rows is empty (no live polling has ever run,
 * seeded games are all final/past).
 */
export async function runEvidencePopulator(
  options: PopulatorOptions
): Promise<PopulatorCounters> {
  const batch_size = options.batch_size ?? DEFAULT_BATCH_SIZE;
  const dry_run = options.dry_run ?? false;
  const builder: BuildProfileInput | null = options.build_profile_input ?? null;
  if (builder === null) {
    throw new Error(
      'V1-A1-3 populator: no build_profile_input supplied. The hosted default builder is not implemented in Phase B ' +
      '(current_market_rows is empty, so no builder is needed against hosted; tests supply their own). ' +
      'A hosted builder is a follow-up ticket once live-market polling exists.'
    );
  }

  const run_id = randomUUID();
  const started_at = new Date().toISOString();
  const cumulative = {
    grains_observed: 0,
    grains_skipped_no_input: 0,
    profiles_inserted: 0,
    profiles_updated: 0,
    batches_ok: 0,
    batches_retried: 0,
  };
  let cursor: { last_game: string; last_player: string; last_market: string } | null = null;

  while (true) {
    const { result, retried } = await withFreshBatchClientRetry(
      options.connection_string,
      async (pool) => runOneBatch(pool, cursor, batch_size, dry_run, builder)
    );
    if (result.grains_in_batch === 0) break;
    cumulative.grains_observed += result.grains_in_batch;
    cumulative.grains_skipped_no_input += result.grains_skipped_no_input;
    cumulative.profiles_inserted += result.profiles_inserted;
    cumulative.profiles_updated += result.profiles_updated;
    if (retried) cumulative.batches_retried += 1;
    else cumulative.batches_ok += 1;

    if (options.on_batch) {
      options.on_batch(Object.freeze({
        ...cumulative,
        run_id,
        started_at,
        finished_at: new Date().toISOString(),
      }));
    }
    cursor = result.last_cursor;
    if (result.grains_in_batch < batch_size) break; // shortcut: no more to scan
  }

  return Object.freeze({
    ...cumulative,
    run_id,
    started_at,
    finished_at: new Date().toISOString(),
  });
}

async function runOneBatch(
  pool: SliplabzPool,
  cursor: { last_game: string; last_player: string; last_market: string } | null,
  batch_size: number,
  dry_run: boolean,
  builder: BuildProfileInput
): Promise<{
  grains_in_batch: number;
  grains_skipped_no_input: number;
  profiles_inserted: number;
  profiles_updated: number;
  last_cursor: { last_game: string; last_player: string; last_market: string } | null;
}> {
  const grains = await listGrainsAfterCursor(pool, cursor, batch_size);
  if (grains.length === 0) {
    return { grains_in_batch: 0, grains_skipped_no_input: 0, profiles_inserted: 0, profiles_updated: 0, last_cursor: cursor };
  }

  // A single transaction wraps the whole batch: all-or-nothing.
  const per_batch = { profiles_inserted: 0, profiles_updated: 0, grains_skipped_no_input: 0 };
  await withTransaction(pool, async (tx) => {
    for (const grain of grains) {
      const built = await builder(grain, tx);
      if (built === null) {
        per_batch.grains_skipped_no_input += 1;
        continue;
      }
      const output = computeEvidenceProfile(built.input);
      // Consensus-only PERSISTENCE guard is inside the writer. Only
      // sportsbook_consensus profiles are written; other kinds throw at
      // the writer boundary. The DRIVER's grain source (current_market_rows)
      // is inherently the consensus source; a builder that returns a
      // non-consensus kind for a driver grain is a bug in the builder,
      // and the writer will surface it as a rollback.
      const w = await writeEvidenceProfile(tx, built.input, output, built.audit);
      if (w.inserted) per_batch.profiles_inserted += 1;
      else per_batch.profiles_updated += 1;
    }
    if (dry_run) throw new DryRunRollback();
  }).catch((err) => {
    if (err instanceof DryRunRollback) return;
    throw err;
  });

  const last = grains[grains.length - 1]!;
  return {
    grains_in_batch: grains.length,
    grains_skipped_no_input: per_batch.grains_skipped_no_input,
    profiles_inserted: per_batch.profiles_inserted,
    profiles_updated: per_batch.profiles_updated,
    last_cursor: { last_game: last.internal_game_id, last_player: last.internal_player_id, last_market: last.market_key },
  };
}

class DryRunRollback extends Error {
  constructor() { super('dry-run rollback'); }
}

/**
 * Read-only preflight: how many grains does current_market_rows expose?
 * The operator script uses this to report the "expected zero" state
 * BEFORE running the populator.
 */
export async function countGrains(connection_string: string): Promise<number> {
  const client = new pg.Client({
    connectionString: connection_string,
    ssl: connection_string.includes('supabase.') ? { rejectUnauthorized: false } : undefined,
    statement_timeout: 15_000,
  });
  await client.connect();
  try {
    await client.query('BEGIN READ ONLY');
    const r = await client.query(
      `SELECT COUNT(*)::int AS n
         FROM (SELECT DISTINCT internal_game_id, internal_player_id, market_key
                 FROM current_market_rows) g`
    );
    await client.query('ROLLBACK');
    return (r.rows[0] as { n: number }).n;
  } finally {
    await client.end();
  }
}

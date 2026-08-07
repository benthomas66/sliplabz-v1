// V1-OP-8b Gate (b) — atomic per-game repair + bounded batch runner.
//
// Composes the committed Path C primitives in their V1-OP-8b `…InTx` forms so
// that ONE 40cr fetch either FULLY LANDS or FULLY ROLLS BACK for a game:
//
//   fetch (PAID, OUTSIDE any transaction)
//     └─ then ONE game-level transaction:
//          persistHistoricalSnapshotInTx        × N (market, bookmaker) triples
//          deleteAndReplaceCanonicalClosingPointsInTx   (restricted to the game)
//          runHistoricalLineResultsBackfillInTx         (restricted to the game)
//
// GAP-37 resolved BY CONSTRUCTION: a failure at ANY database stage rolls back
// `source_closing_quotes` + `canonical_closing_points` + `historical_line_results`
// TOGETHER for that game. No orphan quotes survive an interrupted call, so a
// retry is one clean re-fetch (+40cr) rather than a resume over partial state.
//
// ORDERING INVARIANT (proven by test): the paid fetch completes and RETURNS
// before `runInGameTransaction` is called. No DB client is ever held across
// provider latency — the transaction spans DB work only.
//
// This module adds NO selection, canonicalization, margin, eligibility, or hlr
// math. Every load-bearing decision stays in the primitive that owns it.

import type { Tx } from '../db/transaction.js';
import type { TripleGroup } from './scopedHistoricalRetrieval.js';

/** Per-game outcome in the batch ledger. */
export type GameOutcome = 'eligible' | 'close_capture_stale' | 'failed' | 'skipped';

/** One row of the per-game completion ledger — the batch's real deliverable. */
export interface GameLedgerRow {
  readonly internal_game_id: string;
  readonly provider_event_id: string;
  readonly outcome: GameOutcome;
  /** Snapshot age before the close boundary, seconds (null when no snapshot). */
  readonly snapshot_age_seconds_before_boundary: number | null;
  readonly grains: {
    readonly source_closing_quotes: number;
    readonly canonical_closing_points: number;
    readonly historical_line_results: number;
  };
  readonly credits_forecast: number;
  readonly credits_observed: number | null;
  readonly detail: string;
}

/** Cumulative, batch-attributed spend — never a global balance delta. */
export interface BatchSpend {
  readonly calls_billed: number;
  readonly credits_forecast_total: number;
  readonly credits_observed_total: number;
  /** Provider balance seen on the LAST call of this batch (a curve point). */
  readonly x_requests_remaining_last: number | null;
}

export interface BatchReport {
  readonly dry_run: boolean;
  readonly manifest_count: number;
  readonly ledger: ReadonlyArray<GameLedgerRow>;
  readonly spend: BatchSpend;
  readonly halt_reason: string | null;
}

/** What one game's atomic persistence needs. Injected for testability. */
export interface AtomicGamePersistDeps {
  /** Runs `body` inside ONE game-level transaction (production: withTransaction). */
  readonly runInGameTransaction: <T>(body: (tx: Tx) => Promise<T>) => Promise<T>;
  /**
   * Committed persist, in-transaction form. Called once per triple.
   *
   * GAP-46 + GAP-47: these rows carry NO quota trail. Replicating the whole-call
   * trail onto every triple made `SUM(quota_observed)` report `calls x triples
   * x 40`; and because these rows live inside the game transaction, a rollback
   * erased the charge record entirely. The durable billing row is now written
   * once per paid call in its own transaction at fetch-return.
   */
  readonly persistTripleInTx: (tx: Tx, group: TripleGroup) => Promise<{ readonly source_closing_quote_ids: ReadonlyArray<string> }>;
  /**
   * GAP-40 §5. Read back the ACTUAL persisted row counts for the game, inside
   * the same transaction. The ledger is the attribution source of truth for
   * spend and repair across the remainder and full backlog, so it must report
   * persisted-row actuals — NOT returned ids, which over-count by the number of
   * rows the `(player, market, book)` UNIQUE collapses on upsert (the canary
   * reported scq=165 against 156 actual).
   */
  readonly countPersistedGrains?: (tx: Tx, internal_game_id: string) => Promise<{
    readonly source_closing_quotes: number;
    readonly canonical_closing_points: number;
    readonly historical_line_results: number;
  }>;
  /** Committed canonical owner, in-transaction, restricted to this game. */
  readonly canonicalInTx: (tx: Tx, internal_game_id: string) => Promise<{ readonly inserted: number }>;
  /** Committed hlr populator, in-transaction, restricted to this game. */
  readonly hlrInTx: (tx: Tx, internal_game_id: string) => Promise<{ readonly rows_inserted: number; readonly rows_updated: number }>;
}

export interface AtomicGameResult {
  readonly source_closing_quotes: number;
  readonly canonical_closing_points: number;
  readonly historical_line_results: number;
}

/**
 * Persist ONE game atomically. Every write happens on a single `Tx`; if any
 * stage throws, the caller's transaction wrapper rolls the whole game back.
 *
 * MUST be called only AFTER the paid fetch has returned — this function never
 * performs I/O against the provider, which is what keeps the DB client off the
 * network path.
 */
export async function persistGameAtomically(
  deps: AtomicGamePersistDeps,
  internal_game_id: string,
  triples: ReadonlyArray<TripleGroup>,
): Promise<AtomicGameResult> {
  return deps.runInGameTransaction(async (tx) => {
    let scq = 0;
    for (const group of triples) {
      const r = await deps.persistTripleInTx(tx, group);
      scq += r.source_closing_quote_ids.length;
    }
    const canonical = await deps.canonicalInTx(tx, internal_game_id);
    const hlr = await deps.hlrInTx(tx, internal_game_id);
    // GAP-40 §5: prefer PERSISTED-ROW actuals over returned-id counts.
    if (deps.countPersistedGrains !== undefined) {
      const actual = await deps.countPersistedGrains(tx, internal_game_id);
      return Object.freeze({
        source_closing_quotes: actual.source_closing_quotes,
        canonical_closing_points: actual.canonical_closing_points,
        historical_line_results: actual.historical_line_results,
      });
    }
    return Object.freeze({
      source_closing_quotes: scq,
      canonical_closing_points: canonical.inserted,
      historical_line_results: hlr.rows_inserted + hlr.rows_updated,
    });
  });
}

/** One frozen manifest entry — an explicit game + its approved event id. */
export interface ManifestEntry {
  readonly internal_game_id: string;
  readonly provider_event_id: string;
}

export interface BatchRunnerDeps extends AtomicGamePersistDeps {
  /**
   * Retrieve + process ONE game. Returns the triples to persist plus billing.
   * The PAID call lives entirely inside this seam and completes before
   * `persistGameAtomically` opens a transaction.
   */
  readonly retrieveGame: (entry: ManifestEntry) => Promise<{
    readonly close_capture_state: 'eligible' | 'close_capture_stale' | 'no_snapshot';
    readonly snapshot_age_seconds_before_boundary: number | null;
    readonly triples: ReadonlyArray<TripleGroup>;
    readonly credits_forecast: number;
    readonly credits_observed: number | null;
    readonly x_requests_remaining: number | null;
  }>;
  /** True when the game already has usable hlr → skipped, no fetch, no spend. */
  readonly alreadyRepaired: (entry: ManifestEntry) => Promise<boolean>;
}

/**
 * Run the bounded batch over an EXPLICIT frozen manifest.
 *
 *   * An empty manifest is a hard error — NEVER an implicit "all".
 *   * Cumulative ceiling is checked BEFORE each game's paid call; exceeding it
 *     halts the batch (halt-before-ceiling). No blind retry: a failed game is
 *     recorded and the batch moves on, never re-fetched automatically.
 *   * `dry_run` performs no fetch and no write at all.
 */
export async function runBoundedBatch(
  deps: BatchRunnerDeps,
  opts: {
    readonly manifest: ReadonlyArray<ManifestEntry>;
    readonly max_total_credits: number;
    readonly dry_run: boolean;
  },
): Promise<BatchReport> {
  if (opts.manifest.length === 0) {
    return Object.freeze({
      dry_run: opts.dry_run, manifest_count: 0, ledger: Object.freeze([]),
      spend: Object.freeze({ calls_billed: 0, credits_forecast_total: 0, credits_observed_total: 0, x_requests_remaining_last: null }),
      halt_reason: 'empty_manifest: an explicit frozen manifest is required; an empty selector is never "all"',
    });
  }

  const ledger: GameLedgerRow[] = [];
  let calls_billed = 0;
  let credits_forecast_total = 0;
  let credits_observed_total = 0;
  let x_requests_remaining_last: number | null = null;
  let halt_reason: string | null = null;

  for (const entry of opts.manifest) {
    if (await deps.alreadyRepaired(entry)) {
      ledger.push(Object.freeze({
        internal_game_id: entry.internal_game_id, provider_event_id: entry.provider_event_id,
        outcome: 'skipped', snapshot_age_seconds_before_boundary: null,
        grains: { source_closing_quotes: 0, canonical_closing_points: 0, historical_line_results: 0 },
        credits_forecast: 0, credits_observed: 0,
        detail: 'already has usable hlr — no fetch, no spend',
      }));
      continue;
    }

    if (opts.dry_run) {
      ledger.push(Object.freeze({
        internal_game_id: entry.internal_game_id, provider_event_id: entry.provider_event_id,
        outcome: 'skipped', snapshot_age_seconds_before_boundary: null,
        grains: { source_closing_quotes: 0, canonical_closing_points: 0, historical_line_results: 0 },
        credits_forecast: 0, credits_observed: 0,
        detail: 'dry-run: no fetch, no write',
      }));
      continue;
    }

    // HALT-BEFORE-CEILING: checked before the paid call, never after.
    const projected = credits_observed_total + 40;
    if (projected > opts.max_total_credits) {
      halt_reason = `ceiling: projected ${projected} would exceed max_total_credits ${opts.max_total_credits}; halted before the call`;
      break;
    }

    try {
      const r = await deps.retrieveGame(entry); // PAID — completes before any tx
      calls_billed += 1;
      credits_forecast_total += r.credits_forecast;
      credits_observed_total += r.credits_observed ?? r.credits_forecast;
      if (r.x_requests_remaining !== null) x_requests_remaining_last = r.x_requests_remaining;

      if (r.close_capture_state !== 'eligible') {
        ledger.push(Object.freeze({
          internal_game_id: entry.internal_game_id, provider_event_id: entry.provider_event_id,
          outcome: 'close_capture_stale', snapshot_age_seconds_before_boundary: r.snapshot_age_seconds_before_boundary,
          grains: { source_closing_quotes: 0, canonical_closing_points: 0, historical_line_results: 0 },
          credits_forecast: r.credits_forecast, credits_observed: r.credits_observed,
          detail: `snapshot ${r.close_capture_state} — billed with no rows written`,
        }));
        continue;
      }

      const g = await persistGameAtomically(deps, entry.internal_game_id, r.triples);
      ledger.push(Object.freeze({
        internal_game_id: entry.internal_game_id, provider_event_id: entry.provider_event_id,
        outcome: 'eligible', snapshot_age_seconds_before_boundary: r.snapshot_age_seconds_before_boundary,
        grains: g, credits_forecast: r.credits_forecast, credits_observed: r.credits_observed,
        detail: 'persisted atomically',
      }));
    } catch (err) {
      // No blind retry. The game-level transaction has already rolled back, so
      // no partial state survives; the batch records and moves on.
      ledger.push(Object.freeze({
        internal_game_id: entry.internal_game_id, provider_event_id: entry.provider_event_id,
        outcome: 'failed', snapshot_age_seconds_before_boundary: null,
        grains: { source_closing_quotes: 0, canonical_closing_points: 0, historical_line_results: 0 },
        credits_forecast: 40, credits_observed: null,
        detail: `rolled back: ${err instanceof Error ? err.message : String(err)}`,
      }));
    }
  }

  return Object.freeze({
    dry_run: opts.dry_run,
    manifest_count: opts.manifest.length,
    ledger: Object.freeze(ledger),
    spend: Object.freeze({ calls_billed, credits_forecast_total, credits_observed_total, x_requests_remaining_last }),
    halt_reason,
  });
}

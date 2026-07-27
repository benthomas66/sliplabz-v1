// V1-OP-1 — the scheduled-cycle orchestrator.
//
// COMPOSES the committed, live-proven primitives (V1-A2-3) into one
// operational cycle: slate gate → budget floor → poll → aggregate →
// populate → record. It REIMPLEMENTS NONE of them — the sweep, aggregator,
// and populator are injected as `deps` (production wires the real committed
// functions; tests wire mocks for the HTTP stages and the real functions for
// the DB stages). If a stage fails mid-way, the cycle still writes its
// poll_cycles row (outcome='failed') so the ledger never has silent holes.
//
// OVERLAP PROTECTION: a session-scoped Postgres advisory lock
// (`pg_try_advisory_lock`) held on a DEDICATED connection for the whole
// cycle. A second cycle that cannot acquire the lock returns `blocked`
// WITHOUT polling and WITHOUT writing a row (it never ran). This is the
// belt; the workflow concurrency group (Scope D) is the suspenders.
//
// Advisory locks are SESSION-scoped, so this connection uses the SESSION
// pooler (5432) — never named prepared statements / session state through the
// transaction pooler (6543). The operator supplies SLIPLABZ_HOSTED_DATABASE_URL
// (session pooler) per docs/architecture/V1_APP_CONNECTION_RULES.md.

import pg from 'pg';
import { openPool } from '../db/connection.js';
import type { SliplabzPool } from '../db/connection.js';
import type { OddsapiPollSweepResult } from '../lines/orchestrator/oddsapiPollSweep.js';
import type { AggregateCurrentMarketRowsResult } from '../computation/driver/currentMarketRowsAggregator.js';
import type { V2EvidenceGrain, V2PopulatorCounters } from '../evidence/v2/populateV2.js';
import { OPS_CONSTANTS, type OpsConstants } from './constants.js';

/** Fixed advisory-lock key for the single scheduled-poll cycle. Exported so
 *  the overlap test can hold it on a separate session. */
export const CYCLE_ADVISORY_LOCK_KEY = 4271990311;

export interface DiscoveredEvent {
  readonly provider_event_id: string;
  readonly commence_time: string;
  readonly home_team: string;
  readonly away_team: string;
}
export interface DiscoveryResult {
  readonly events: ReadonlyArray<DiscoveredEvent>;
  /** From the discovery response's `x-requests-remaining` header; null if absent. */
  readonly credits_remaining: number | null;
}
export interface SweepEvent {
  readonly provider_event_id: string;
  readonly linked_internal_game_id: string | null;
}

export type CycleOutcome =
  | 'completed' | 'skipped_no_slate' | 'skipped_budget_floor' | 'failed' | 'blocked';

export interface ScheduledCycleDeps {
  readonly connection_string: string;
  readonly now?: () => Date;
  readonly dry_run?: boolean;
  readonly constants?: OpsConstants;

  // --- HTTP-dependent stages (mocked in tests) ---
  /** Free discovery: upcoming provider events + remaining-credit header. */
  readonly discover: () => Promise<DiscoveryResult>;
  /** Resolve discovered events to internal games, keep those whose game is in
   *  the window, cap the count, and build the player map. */
  readonly prepareEvents: (a: {
    readonly pool: SliplabzPool;
    readonly events: ReadonlyArray<DiscoveredEvent>;
    readonly windowGameIds: ReadonlySet<string>;
    readonly cap: number;
  }) => Promise<{ readonly sweep_events: ReadonlyArray<SweepEvent>; readonly player_map: ReadonlyMap<string, string> }>;
  /** The committed sweep (bounded concurrency, reconciled ledger). */
  readonly runPollSweep: (a: {
    readonly sweep_events: ReadonlyArray<SweepEvent>;
    readonly player_map: ReadonlyMap<string, string>;
  }) => Promise<OddsapiPollSweepResult>;

  // --- DB-dependent stages (real in tests) ---
  readonly aggregate: (pool: SliplabzPool, internal_game_id: string) => Promise<AggregateCurrentMarketRowsResult>;
  readonly listGrainsForGames: (connection_string: string, gameIds: ReadonlyArray<string>) => Promise<ReadonlyArray<V2EvidenceGrain>>;
  readonly populate: (a: {
    readonly grains: ReadonlyArray<V2EvidenceGrain>;
    readonly evaluation_reference_time: string;
    readonly dry_run: boolean;
  }) => Promise<V2PopulatorCounters>;
}

export interface ScheduledCycleResult {
  readonly outcome: CycleOutcome;
  readonly poll_cycle_id: string | null;
  readonly started_at: string;
  readonly finished_at: string | null;
  readonly evaluation_reference_time: string | null;
  readonly events_polled: number;
  readonly credits_spent: number;
  readonly credits_remaining_after: number | null;
  readonly grains_aggregated: number;
  readonly profiles_persisted: number;
  readonly profiles_updated: number;
  readonly beyond_horizon_skipped: number;
  readonly error_summary: string | null;
}

export async function runScheduledCycle(deps: ScheduledCycleDeps): Promise<ScheduledCycleResult> {
  const nowFn = deps.now ?? (() => new Date());
  const c = deps.constants ?? OPS_CONSTANTS;
  const dry_run = deps.dry_run ?? false;
  const started_at = nowFn().toISOString();
  const ssl: 'require' | 'disable' = deps.connection_string.includes('supabase.') ? 'require' : 'disable';

  // Dedicated session for the advisory lock (held for the whole cycle).
  const lockClient = new pg.Client({
    connectionString: deps.connection_string,
    ssl: ssl === 'require' ? { rejectUnauthorized: false } : undefined,
    statement_timeout: 30_000,
  });
  await lockClient.connect();
  const locked = (await lockClient.query('SELECT pg_try_advisory_lock($1) AS ok', [CYCLE_ADVISORY_LOCK_KEY])).rows[0].ok as boolean;
  if (!locked) {
    await lockClient.end();
    // A cycle is already running; this wake never ran → no row written.
    return blockedResult(started_at);
  }

  const pool = openPool({ connectionString: deps.connection_string, max: 2, statement_timeout_ms: 60_000, ssl });
  const m = {
    outcome: 'failed' as CycleOutcome,
    evaluation_reference_time: null as string | null,
    events_polled: 0, credits_spent: 0, credits_remaining_after: null as number | null,
    grains_aggregated: 0, profiles_persisted: 0, profiles_updated: 0, beyond_horizon_skipped: 0,
    error_summary: null as string | null,
  };

  try {
    // ---- Stage 1: SLATE GATE (DB only, zero API calls) ----
    const win = (await pool.query(
      `SELECT internal_game_id::text AS id FROM games
        WHERE status = 'scheduled'
          AND scheduled_start_utc >= $1::timestamptz
          AND scheduled_start_utc <= $1::timestamptz + make_interval(secs => $2)`,
      [started_at, c.CYCLE_WINDOW_BEFORE_TIPOFF_SECONDS]
    )).rows as ReadonlyArray<{ id: string }>;
    if (win.length === 0) {
      m.outcome = 'skipped_no_slate';
    } else {
      const windowGameIds = new Set(win.map((r) => r.id));

      // ---- Stage 2: BUDGET FLOOR (discovery is free) ----
      const disc = await deps.discover();
      m.credits_remaining_after = disc.credits_remaining;
      if (disc.credits_remaining !== null && disc.credits_remaining < c.RESERVE_FLOOR_CREDITS) {
        m.outcome = 'skipped_budget_floor';
      } else {
        const { sweep_events, player_map } = await deps.prepareEvents({
          pool, events: disc.events, windowGameIds, cap: c.CYCLE_EVENT_CAP,
        });
        if (sweep_events.length === 0) {
          // Games in window but no pollable provider event resolved to them.
          m.outcome = 'skipped_no_slate';
        } else {
          const projected = 4 * sweep_events.length;
          if (projected > c.CYCLE_CREDIT_CEILING) {
            throw new Error(`per-cycle ceiling: projected ${projected} > ${c.CYCLE_CREDIT_CEILING}`);
          }

          // ---- Stage 3: POLL (committed sweep; reconciled ledger) ----
          const sweep = await deps.runPollSweep({ sweep_events, player_map });
          if (!sweep.ledger.reconciled) {
            throw new Error('poll ledger did not reconcile (authoritative_total !== sum_of_per_call_last)');
          }
          m.events_polled = sweep.per_event.length;
          m.credits_spent = sweep.per_event.reduce((a, e) => a + e.credits_spent_this_event, 0);
          if (sweep.ledger.discovery_after.x_requests_remaining !== null) {
            m.credits_remaining_after = sweep.ledger.discovery_after.x_requests_remaining;
          }

          // ---- Stage 4: AGGREGATE polled linked games ----
          const polledGames = [...new Set(sweep_events.map((e) => e.linked_internal_game_id).filter((x): x is string => x !== null))];
          for (const gid of polledGames) {
            const r = await deps.aggregate(pool, gid);
            m.grains_aggregated += r.grains_processed;
          }

          // ---- Stage 5: POPULATE (ONE evaluation_reference_time) ----
          const ert = nowFn().toISOString();
          const grains = await deps.listGrainsForGames(deps.connection_string, polledGames);
          const counters = await deps.populate({ grains, evaluation_reference_time: ert, dry_run });
          m.evaluation_reference_time = ert;
          m.profiles_persisted = counters.profiles_inserted;
          m.profiles_updated = counters.profiles_updated;
          m.beyond_horizon_skipped = counters.grains_skipped_beyond_horizon;
          m.outcome = 'completed';
        }
      }
    }
  } catch (err) {
    m.outcome = 'failed';
    m.error_summary = (err instanceof Error ? (err.message ?? 'error') : String(err)).slice(0, 1000);
  }

  // ---- Stage 6: RECORD (always writes a row for a cycle that ran) ----
  const finished_at = nowFn().toISOString();
  let poll_cycle_id: string | null = null;
  try {
    const ins = await pool.query(
      `INSERT INTO poll_cycles
         (started_at, finished_at, outcome, evaluation_reference_time,
          events_polled, credits_spent, credits_remaining_after,
          grains_aggregated, profiles_persisted, profiles_updated,
          beyond_horizon_skipped, error_summary)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING poll_cycle_id::text AS id`,
      [started_at, finished_at, m.outcome, m.evaluation_reference_time,
       m.events_polled, m.credits_spent, m.credits_remaining_after,
       m.grains_aggregated, m.profiles_persisted, m.profiles_updated,
       m.beyond_horizon_skipped, m.error_summary]
    );
    poll_cycle_id = (ins.rows[0] as { id: string }).id;
  } finally {
    try { await lockClient.query('SELECT pg_advisory_unlock($1)', [CYCLE_ADVISORY_LOCK_KEY]); } catch { /* ignore */ }
    try { await lockClient.end(); } catch { /* ignore */ }
    try { await pool.end(); } catch { /* ignore */ }
  }

  return {
    outcome: m.outcome, poll_cycle_id, started_at, finished_at,
    evaluation_reference_time: m.evaluation_reference_time,
    events_polled: m.events_polled, credits_spent: m.credits_spent,
    credits_remaining_after: m.credits_remaining_after,
    grains_aggregated: m.grains_aggregated, profiles_persisted: m.profiles_persisted,
    profiles_updated: m.profiles_updated, beyond_horizon_skipped: m.beyond_horizon_skipped,
    error_summary: m.error_summary,
  };
}

function blockedResult(started_at: string): ScheduledCycleResult {
  return {
    outcome: 'blocked', poll_cycle_id: null, started_at, finished_at: null,
    evaluation_reference_time: null, events_polled: 0, credits_spent: 0,
    credits_remaining_after: null, grains_aggregated: 0, profiles_persisted: 0,
    profiles_updated: 0, beyond_horizon_skipped: 0, error_summary: null,
  };
}

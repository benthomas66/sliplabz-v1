// V1-OP-5D — operator entry for the scoped status-only game finalizer.
//
// This is the THIN operator wiring around the reusable `src/` owner
// (`src/bdl/gameFinalizer.ts`). It contributes NO finalization semantics of
// its own — all decisions come from the owner's pure `planGameFinalization`
// and all writes from the owner's `applyGameFinalization` (status + updated_at
// ONLY). V1-OP-5C later invokes THAT SAME owner on a schedule.
//
// What this script does:
//   * `listSelected`   — read-only DB resolution of an EXPLICIT bounded id set
//                        to {internal_game_id, provider_game_id, current_status}
//                        via APPROVED balldontlie mappings only.
//   * `fetchBdlStatus` — read-only BDL `/games?game_ids[]=` observation
//                        (0 Odds credits; BDL is free). The Authorization
//                        header is inline-only, never printed or persisted.
//   * `runInTransaction` — production `withTransaction` (only on --apply).
//
// SAFETY DEFAULTS (binding for V1-OP-5D):
//   * DRY-RUN IS THE DEFAULT. A DB write happens ONLY when `--apply` is given.
//   * There is NO implicit season scan. You must pass explicit `--game <uuid>`
//     ids (repeatable). An empty set is an explicit no-op.
//   * `--list-backlog <YYYY-MM-DD>` is read-only: it prints the stuck-scheduled
//     backlog id set (the owner's STUCK_SCHEDULED_BACKLOG_SELECTOR_SQL) and
//     exits WITHOUT finalizing anything. Use it to review, then pass specific
//     `--game` ids to act.
//   * NEVER writes/synthesizes `scheduled_start_utc` or `actual_start_utc`
//     (the owner's UPDATE names neither column). NEVER an Odds API call.
//   * The legacy `scripts/v1_4e_step2_forward_games.ts` is PROHIBITED (GAP-31);
//     this script is its scoped, status-only replacement.
//
// Env gates:
//   * SLIPLABZ_HOSTED_DATABASE_URL — required (hosted DB only).
//   * BDL_LIVE_INVOKE=1 and BALLDONTLIE_API_KEY — required (a live BDL status
//     read is made even on a dry-run, to observe truthfully). Free of credits.

import pg from 'pg';

import {
  DEFAULT_BDL_CONFIG,
  type BdlHttpConfig,
  type HttpResponseLike,
} from '../src/bdl/httpClient.js';
import type { BdlGame } from '../src/bdl/types.js';
import { openPool, type SliplabzPool } from '../src/db/connection.js';
import { withTransaction } from '../src/db/transaction.js';
import {
  finalizeSelectedGames,
  STUCK_SCHEDULED_BACKLOG_SELECTOR_SQL,
  type GameFinalizerDeps,
} from '../src/bdl/gameFinalizer.js';
import type { GameStatus } from '../src/shared/enums.js';

// ---------------------------------------------------------------------------
// Env gates.
// ---------------------------------------------------------------------------

const DB_URL = process.env['SLIPLABZ_HOSTED_DATABASE_URL'];
if (DB_URL === undefined || DB_URL === '') {
  console.error('# V1-OP-5D: SLIPLABZ_HOSTED_DATABASE_URL required (hosted DB only). Aborting before any DB access.');
  process.exit(1);
}
const API_KEY = process.env['BALLDONTLIE_API_KEY'];
const LIVE_FLAG = process.env['BDL_LIVE_INVOKE'];
if (API_KEY === undefined || API_KEY === '' || LIVE_FLAG !== '1') {
  console.error('# V1-OP-5D: BDL_LIVE_INVOKE=1 and BALLDONTLIE_API_KEY are BOTH required (read-only status observation). Aborting before any network or DB access.');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// CLI flags.
// ---------------------------------------------------------------------------

const argv = process.argv.slice(2);
function multiFlag(name: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === name && i + 1 < argv.length) out.push(argv[i + 1]!);
  }
  return out;
}
function stringFlag(name: string): string | null {
  const i = argv.indexOf(name);
  if (i < 0 || i === argv.length - 1) return null;
  return argv[i + 1] ?? null;
}
const CLI = {
  gameIds: multiFlag('--game'),
  listBacklogFrom: stringFlag('--list-backlog'),
  apply: argv.includes('--apply'),
};

// ---------------------------------------------------------------------------
// DB pool (hosted). openPool wants a DbConfig; build it explicitly from the
// hosted URL rather than readEnvConfig (which reads SLIPLABZ_DATABASE_URL).
// ---------------------------------------------------------------------------

const pool: SliplabzPool = openPool({
  connectionString: DB_URL,
  max: 4,
  statement_timeout_ms: 15_000,
  ssl: 'require',
});

// ---------------------------------------------------------------------------
// BDL HTTP config — live invoke; native fetch; Authorization inline-only.
// ---------------------------------------------------------------------------

const httpConfig: BdlHttpConfig = {
  ...DEFAULT_BDL_CONFIG,
  allow_live_invoke: true,
  fetch: async (
    url: string,
    init?: { method?: string; headers?: Readonly<Record<string, string>>; signal?: AbortSignal | undefined }
  ): Promise<HttpResponseLike> => {
    const requestInit: RequestInit = {};
    if (init?.method !== undefined) requestInit.method = init.method;
    if (init?.headers !== undefined) requestInit.headers = init.headers as Record<string, string>;
    if (init?.signal !== undefined) requestInit.signal = init.signal;
    const nativeRes = await fetch(url, requestInit);
    return {
      status: nativeRes.status,
      headers: { get: (name: string) => nativeRes.headers.get(name) },
      text: () => nativeRes.text(),
    };
  },
};
const AUTH_HEADERS: Readonly<Record<string, string>> = Object.freeze({ Authorization: API_KEY });

// ---------------------------------------------------------------------------
// Owner dependencies (read-only DB + read-only BDL + tx).
// ---------------------------------------------------------------------------

const deps: GameFinalizerDeps = {
  // Read-only. Resolves ONLY the explicit ids that carry an approved
  // balldontlie mapping; ids without one are simply absent from the result
  // (the owner reports them as unresolved — never silently finalized).
  listSelected: async (ids) => {
    if (ids.length === 0) return [];
    const res = await pool.query(
      `SELECT g.internal_game_id::text        AS internal_game_id,
              pv.provider_game_id             AS provider_game_id,
              g.status::text                  AS current_status
         FROM games g
         JOIN provider_games pv
           ON pv.internal_game_id = g.internal_game_id
          AND pv.provider = 'balldontlie'
          AND pv.mapping_state = 'approved'
        WHERE g.internal_game_id = ANY($1::uuid[])`,
      [ids],
    );
    return res.rows.map((r) => {
      const row = r as { internal_game_id: string; provider_game_id: string; current_status: GameStatus };
      return { internal_game_id: row.internal_game_id, provider_game_id: row.provider_game_id, current_status: row.current_status };
    });
  },

  // Read-only BDL observation. The BDL WNBA `/games` COLLECTION endpoint does
  // NOT honor a `game_ids[]` filter (it silently returns page 1 of all games),
  // so we read each game via its single-resource path `/games/{id}` (the
  // balldontlie provider_game_id IS the BDL numeric game id). Auth is inline
  // only, never printed/persisted. Returns provider_game_id → raw status
  // string (null if BDL omitted a status). Read-only; 0 Odds credits.
  fetchBdlStatus: async (providerGameIds) => {
    const out = new Map<string, string | null>();
    const base = httpConfig.base_url;
    const prefix = httpConfig.wnba_prefix;
    for (const pid of providerGameIds) {
      const url = new URL(`${prefix}/games/${encodeURIComponent(pid)}`, base).toString();
      const res = await httpConfig.fetch(url, { method: 'GET', headers: AUTH_HEADERS });
      if (res.status !== 200) {
        throw new Error(`# V1-OP-5D: BDL /games/${pid} observation failed (status=${res.status}). Aborting; no write attempted.`);
      }
      const parsed = JSON.parse(await res.text()) as { data?: BdlGame } | BdlGame;
      const g = (parsed as { data?: BdlGame }).data ?? (parsed as BdlGame);
      out.set(String(g.id ?? pid), g.status ?? null);
    }
    return out;
  },

  runInTransaction: (fn) => withTransaction(pool, fn),
};

// ---------------------------------------------------------------------------
// Main.
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  try {
    // Read-only backlog listing mode: print the stuck-scheduled id set and exit.
    if (CLI.listBacklogFrom !== null) {
      const res = await pool.query(STUCK_SCHEDULED_BACKLOG_SELECTOR_SQL, [CLI.listBacklogFrom]);
      const rows = res.rows as Array<{ internal_game_id: string }>;
      console.log(`# V1-OP-5D backlog (stuck status='scheduled', past-tip, approved BDL mapping) since ${CLI.listBacklogFrom}: ${rows.length} game(s)`);
      for (const r of rows) console.log(r.internal_game_id);
      console.log('# read-only listing — nothing finalized. Pass explicit --game <uuid> ids to act.');
      return;
    }

    const dryRun = !CLI.apply;
    const report = await finalizeSelectedGames(deps, { internal_game_ids: CLI.gameIds, dry_run: dryRun });

    console.log(`# V1-OP-5D ${dryRun ? 'DRY-RUN (no DB writes)' : 'APPLY (writes status + updated_at only)'}`);
    console.log(`# requested=${report.requested_ids} resolved=${report.resolved} unresolved=${report.unresolved_ids.length}`);
    if (report.unresolved_ids.length > 0) {
      console.log(`# UNRESOLVED (no approved balldontlie mapping — NOT finalized): ${report.unresolved_ids.join(', ')}`);
    }
    for (const d of report.decisions) {
      console.log(`#   ${d.internal_game_id}  ${d.current_status} → action=${d.action}${d.action === 'update' ? ` (to ${d.to_status})` : ''}${d.is_unknown ? ' [BDL status UNKNOWN → quarantine, never guessed]' : ''}`);
    }
    if (report.applied !== null) {
      console.log(`# APPLIED updated=${report.applied.updated} noops=${report.applied.noops} quarantined=${report.applied.quarantined} failures=${report.applied.failures.length}`);
      for (const f of report.applied.failures) console.log(`#   FAILURE ${f.internal_game_id}: ${f.reason}`);
      if (report.applied.failures.length > 0) process.exitCode = 2;
    } else if (CLI.gameIds.length === 0) {
      console.log('# no --game ids given → explicit no-op (never an implicit season scan).');
    }
  } finally {
    await pool.end();
  }
}

void main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});

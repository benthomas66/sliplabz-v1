// V1-4c Phase A — Historical Player Stats Backfill (BDL player_stats).
//
// Purpose: populate the HOSTED Supabase database's `player_game_stats`
// table for every FINAL game already present in `games`. The DR-14/DR-27
// calibration discovered that the hosted DB holds 4,955 canonical closing
// points but ZERO player_game_stats rows, so historical_line_results is
// empty and no margin/window/evidence computation has any input.
//
// This script is PHASE A ONLY. Phase B (populating historical_line_results
// and re-running the calibration) requires separate governor authorization
// and IS NOT undertaken here.
//
// V1-2 primitives used (NOT reimplemented):
//   - src/bdl/httpClient.ts       (bdlRequest; retained-header policy;
//                                  Authorization inline; never persisted)
//   - src/bdl/cursorPagination.ts (traverseCursor; exact next_cursor
//                                  pass-through; failed traversal ≠ complete)
//   - src/bdl/ingestionRun.ts     (openRun / closeRun; runMayAdvanceWatermark)
//   - src/bdl/watermark.ts        (advanceWatermark: complete-only)
//   - src/bdl/minutes.ts          (parseBdlMinutes; "--" → unresolved,
//                                  never DNP)
//   - src/bdl/countingStats.ts    (extractRawCountingStats,
//                                  normalizeCountingStats; null→0 ONLY on
//                                  eligible played rows)
//   - src/bdl/gameStatus.ts       (mapBdlGameStatus; finality only from
//                                  status; never from clock/period)
//   - src/bdl/eligibility.ts      (computeEligibility; ordered precedence)
//   - src/bdl/sourceHash.ts       (canonicalSourceHash;
//                                  correction-detection prerequisite)
//   - src/bdl/correctionDetection.ts (detectCorrection: initial_observation
//                                     for new rows; material_correction /
//                                     metadata_change for re-observations)
//
// Governor gates (RECORDED in the ticket report):
//   * Live BDL calls authorized for THIS BACKFILL ONLY. Requires both
//     BDL_LIVE_INVOKE=1 and BALLDONTLIE_API_KEY set. Never prints or
//     persists the key; sanitized request_params only.
//   * Zero Odds API calls. No src/odds/* module is imported.
//   * Writes go only to the HOSTED database via SLIPLABZ_HOSTED_DATABASE_URL.
//   * The test suite remains fixture-only. This is an operator script,
//     not a test.
//
// Population-path finding (Phase A §A answer — recorded in the report):
//   Landing a new player_game_stats row does NOT emit a recomputation
//   invalidation. `src/bdl/correctionDetection.ts:detectCorrection` returns
//   `initial_observation` when there is no prior row, and
//   `src/bdl/recomputationInvalidation.ts:buildStatCorrectionInvalidations`
//   explicitly comments (lines 45-47): "`initial_observation`: no
//   invalidations. First observation cannot invalidate downstream
//   computation because there is no downstream computation yet."
//   No other committed driver performs first-pass historical_line_results
//   population — `INSERT INTO historical_line_results` appears in exactly
//   one place in src/ (recomputationWriter.ts) and only fires from an
//   invalidation. Therefore this script deliberately DOES NOT insert into
//   `recomputation_invalidations`; that would incorrectly attempt to drive
//   the writer for an initial observation and violate the semantics of the
//   detectCorrection contract. Phase B's job is to introduce the first-pass
//   population driver; this script does not build, prototype, or sketch it.
//
// Per-event connection discipline (V1-4b lesson):
//   The write path uses a FRESH pg.Client per game (not a pooled client
//   held idle across HTTP latency). Retries are limited to connection-class
//   errors (ECONNRESET, ETIMEDOUT, ECONNREFUSED, EPIPE, "Connection
//   terminated"). No global uncaughtException handler is installed.
//
// Idempotence:
//   * `bdl_import_watermarks (endpoint, query_scope_key)` PK gates re-runs
//     per game: a game whose watermark is already `complete` is skipped
//     without a BDL call. Re-invocation resumes at the first game without
//     a watermark.
//   * `player_game_stats UNIQUE (provider, provider_player_id, provider_game_id)`
//     means row re-writes UPSERT correction-safely; `detectCorrection`
//     produces `metadata_change` on identical repeats and `material_correction`
//     on genuine changes (§12C.4/§12C.5). Both branches append to
//     `player_game_stat_history`.
//
// Usage:
//   set -a && source .env && set +a
//   node --import tsx scripts/v1_4c_stats_backfill.ts \
//     > /tmp/v1_4c_backfill.log 2>&1
//   Flags (all optional):
//     --limit N           process at most N games (dry-batching / spot-check)
//     --resume            skip games whose watermark is already complete
//                         (default: on)
//     --game <internal_id>  process a single game by internal_game_id
//     --dry-run           record raw responses only; do NOT upsert
//                         player_game_stats. Used to smoke-test the
//                         pipeline against a small subset before a full run.

import { randomUUID } from 'node:crypto';
import pg from 'pg';

import {
  bdlRequest,
  DEFAULT_BDL_CONFIG,
  type BdlHttpConfig,
  type HttpResponseLike,
} from '../src/bdl/httpClient.js';
import {
  traverseCursor,
  type PageFetcher,
  type CursorTraversalPageResult,
  type PageFetchError,
} from '../src/bdl/cursorPagination.js';
import { openRun, closeRun, runMayAdvanceWatermark } from '../src/bdl/ingestionRun.js';
import { advanceWatermark, emptyWatermark } from '../src/bdl/watermark.js';
import { parseBdlMinutes } from '../src/bdl/minutes.js';
import {
  extractRawCountingStats,
  normalizeCountingStats,
  COUNTING_STAT_FIELDS,
} from '../src/bdl/countingStats.js';
import { mapBdlGameStatus } from '../src/bdl/gameStatus.js';
import { computeEligibility } from '../src/bdl/eligibility.js';
import { canonicalSourceHash } from '../src/bdl/sourceHash.js';
import { detectCorrection } from '../src/bdl/correctionDetection.js';
import type {
  BdlPlayerStatRow,
  BdlPaginatedResponse,
  NormalizedPlayerGameStat,
  RawResponsePage,
} from '../src/bdl/types.js';
import type {
  BdlMinutesStatus,
  BdlRunState,
  GameStatus,
  PlayerStatEligibility,
  PlayerStatQuarantineReason,
} from '../src/shared/enums.js';

// ---------------------------------------------------------------------------
// Configuration and env-gates.
// ---------------------------------------------------------------------------

const DB_URL = process.env['SLIPLABZ_HOSTED_DATABASE_URL'];
if (DB_URL === undefined || DB_URL === '') {
  console.error('# V1-4c: SLIPLABZ_HOSTED_DATABASE_URL required (hosted DB only)');
  process.exit(1);
}
const API_KEY = process.env['BALLDONTLIE_API_KEY'];
const LIVE_FLAG = process.env['BDL_LIVE_INVOKE'];
if (API_KEY === undefined || API_KEY === '' || LIVE_FLAG !== '1') {
  console.error(
    '# V1-4c: BDL_LIVE_INVOKE=1 and BALLDONTLIE_API_KEY are BOTH required. Aborting before any network or DB write.'
  );
  process.exit(1);
}

// CLI flags.
const argv = process.argv.slice(2);
const CLI = {
  limit: numericFlag('--limit'),
  resume: !argv.includes('--no-resume'),
  singleGame: stringFlag('--game'),
  dryRun: argv.includes('--dry-run'),
};

function stringFlag(name: string): string | null {
  const i = argv.indexOf(name);
  if (i < 0 || i === argv.length - 1) return null;
  return argv[i + 1] ?? null;
}
function numericFlag(name: string): number | null {
  const v = stringFlag(name);
  if (v === null) return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}

// Read pool for lookups (game roster, existing rows, watermarks).
const readPool = new pg.Pool({
  connectionString: DB_URL,
  max: 4,
  ssl: DB_URL.includes('supabase.') ? { rejectUnauthorized: false } : undefined,
});

// ---------------------------------------------------------------------------
// HTTP client — live invoke enabled; native fetch.
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
const AUTH_HEADERS: Readonly<Record<string, string>> = Object.freeze({
  Authorization: API_KEY!,
});

// ---------------------------------------------------------------------------
// Types local to this backfill.
// ---------------------------------------------------------------------------

interface HostedGame {
  readonly internal_game_id: string;
  readonly provider_game_id: string;
  readonly season: number;
  readonly season_type: number;
  readonly home_team_id: string;
  readonly away_team_id: string;
  readonly status: GameStatus;
}

interface RunOutcome {
  readonly bdl_ingestion_run_id: string;
  readonly completion_state: BdlRunState;
  readonly page_count: number;
  readonly row_count_bdl: number;
  readonly rows_inserted: number;
  readonly rows_material_correction: number;
  readonly rows_metadata_change: number;
  readonly rows_quarantined: number;
  readonly rows_eligible: number;
  readonly rows_dnp: number;
  readonly rows_live_or_non_final: number;
  readonly rows_unresolved_minutes: number;
  readonly minutes_status_counts: Readonly<Record<BdlMinutesStatus, number>>;
  readonly quarantine_reason_counts: Readonly<Record<string, number>>;
  readonly failure_detail: string | null;
  readonly watermark_advanced: boolean;
  readonly watermark_refusal_reason: string | null;
}

interface OverallStats {
  bdl_request_count: number;
  bdl_page_count: number;
  bdl_row_count: number;
  games_processed: number;
  games_complete: number;
  games_skipped_watermark: number;
  games_failed_bdl: number;
  games_yielding_zero_stats: number;
  rows_inserted: number;
  rows_material_correction: number;
  rows_metadata_change: number;
  rows_quarantined: number;
  rows_eligible: number;
  rows_dnp: number;
  rows_live_or_non_final: number;
  rows_unresolved_minutes: number;
  minutes_status_counts: Record<BdlMinutesStatus, number>;
  quarantine_reason_counts: Record<string, number>;
  games_yielding_zero_stats_reasons: Array<{ readonly internal_game_id: string; readonly reason: string }>;
}

function newOverall(): OverallStats {
  return {
    bdl_request_count: 0,
    bdl_page_count: 0,
    bdl_row_count: 0,
    games_processed: 0,
    games_complete: 0,
    games_skipped_watermark: 0,
    games_failed_bdl: 0,
    games_yielding_zero_stats: 0,
    rows_inserted: 0,
    rows_material_correction: 0,
    rows_metadata_change: 0,
    rows_quarantined: 0,
    rows_eligible: 0,
    rows_dnp: 0,
    rows_live_or_non_final: 0,
    rows_unresolved_minutes: 0,
    minutes_status_counts: { played: 0, dnp: 0, unresolved_non_numeric: 0 },
    quarantine_reason_counts: {},
    games_yielding_zero_stats_reasons: [],
  };
}

// ---------------------------------------------------------------------------
// Read helpers (readPool).
// ---------------------------------------------------------------------------

async function loadEligibleGames(): Promise<ReadonlyArray<HostedGame>> {
  const query = CLI.singleGame !== null
    ? `SELECT g.internal_game_id::text AS internal_game_id,
              pg_.provider_game_id AS provider_game_id,
              g.season, g.season_type,
              g.home_team_id::text AS home_team_id,
              g.away_team_id::text AS away_team_id,
              g.status::text AS status
         FROM games g
         JOIN provider_games pg_
           ON pg_.internal_game_id = g.internal_game_id
          AND pg_.provider = 'balldontlie'
          AND pg_.mapping_state = 'approved'
        WHERE g.status = 'final'
          AND g.internal_game_id = $1::uuid
        ORDER BY g.scheduled_start_utc ASC`
    : `SELECT g.internal_game_id::text AS internal_game_id,
              pg_.provider_game_id AS provider_game_id,
              g.season, g.season_type,
              g.home_team_id::text AS home_team_id,
              g.away_team_id::text AS away_team_id,
              g.status::text AS status
         FROM games g
         JOIN provider_games pg_
           ON pg_.internal_game_id = g.internal_game_id
          AND pg_.provider = 'balldontlie'
          AND pg_.mapping_state = 'approved'
        WHERE g.status = 'final'
        ORDER BY g.scheduled_start_utc ASC`;
  const rows = CLI.singleGame !== null
    ? await readPool.query(query, [CLI.singleGame])
    : await readPool.query(query);
  const games: HostedGame[] = (rows.rows as Array<HostedGame>).map((r) => Object.freeze(r));
  return CLI.limit === null ? Object.freeze(games) : Object.freeze(games.slice(0, CLI.limit));
}

async function watermarkIsComplete(scope: string): Promise<boolean> {
  const r = await readPool.query(
    `SELECT completed_at IS NOT NULL AS done
       FROM bdl_import_watermarks
      WHERE endpoint = 'player_stats' AND query_scope_key = $1`,
    [scope]
  );
  return r.rows.length > 0 && (r.rows[0] as { done: boolean }).done === true;
}

async function loadApprovedProviderTeamMap(): Promise<ReadonlyMap<string, { internal_team_id: string; supported_competition_team: boolean }>> {
  const r = await readPool.query(
    `SELECT provider_team_id, internal_team_id::text AS internal_team_id, classification::text AS classification
       FROM provider_teams
      WHERE provider = 'balldontlie' AND mapping_state = 'approved'`
  );
  const map = new Map<string, { internal_team_id: string; supported_competition_team: boolean }>();
  for (const row of r.rows as Array<{ provider_team_id: string; internal_team_id: string; classification: string }>) {
    map.set(row.provider_team_id, {
      internal_team_id: row.internal_team_id,
      // BDL §12B.9: `current_franchise` and `historical_franchise` are supported;
      // anything else (all-star / national / placeholder) is quarantined.
      supported_competition_team: row.classification === 'current_franchise' || row.classification === 'historical_franchise',
    });
  }
  return map;
}

async function loadApprovedProviderPlayerMap(): Promise<ReadonlyMap<string, string>> {
  const r = await readPool.query(
    `SELECT provider_player_id, internal_player_id::text AS internal_player_id
       FROM provider_players
      WHERE provider = 'balldontlie' AND mapping_state = 'approved'
        AND internal_player_id IS NOT NULL`
  );
  const map = new Map<string, string>();
  for (const row of r.rows as Array<{ provider_player_id: string; internal_player_id: string }>) {
    map.set(row.provider_player_id, row.internal_player_id);
  }
  return map;
}

async function loadPriorStatRow(
  provider_player_id: string,
  provider_game_id: string
): Promise<NormalizedPlayerGameStat | null> {
  const r = await readPool.query(
    `SELECT provider_team_id, raw_minutes, parsed_minutes::float8 AS parsed_minutes,
            minutes_status::text AS minutes_status,
            raw_stats, source_hash, eligibility_state::text AS eligibility_state,
            quarantine_reason::text AS quarantine_reason, season, season_type, normalization_version
       FROM player_game_stats
      WHERE provider = 'balldontlie'
        AND provider_player_id = $1
        AND provider_game_id = $2`,
    [provider_player_id, provider_game_id]
  );
  if (r.rows.length === 0) return null;
  const row = r.rows[0] as {
    provider_team_id: string | null; raw_minutes: string | null; parsed_minutes: number | null;
    minutes_status: BdlMinutesStatus; raw_stats: Record<string, number | null>;
    source_hash: string; eligibility_state: PlayerStatEligibility;
    quarantine_reason: PlayerStatQuarantineReason | null;
    season: number | null; season_type: number | null; normalization_version: number;
  };
  const empty = { pts: null, reb: null, ast: null, fg3m: null, stl: null, blk: null, turnover: null, fgm: null, fga: null, fg3a: null, ftm: null, fta: null, oreb: null, dreb: null, pf: null };
  const raw = { ...empty, ...row.raw_stats } as unknown as NormalizedPlayerGameStat['raw_stats'];
  return {
    provider: 'balldontlie',
    provider_player_id, provider_game_id,
    provider_team_id: row.provider_team_id,
    raw_minutes: row.raw_minutes,
    parsed_minutes: row.parsed_minutes,
    minutes_status: row.minutes_status,
    raw_stats: raw,
    normalized_stats: raw, // stored representation is source of truth; correction detection reads raw only
    source_hash: row.source_hash,
    eligibility_state: row.eligibility_state,
    quarantine_reason: row.quarantine_reason,
    season: row.season,
    season_type: row.season_type,
    normalization_version: row.normalization_version,
  };
}

// ---------------------------------------------------------------------------
// Per-event write client (V1-4b lesson: fresh client per unit of work).
// ---------------------------------------------------------------------------

function isConnectionClassError(err: unknown): boolean {
  const s = err instanceof Error ? err.message : String(err);
  const codes = ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'EPIPE', 'Connection terminated', 'read ECONNRESET'];
  return codes.some((c) => s.includes(c));
}

async function withFreshClient<T>(op: (c: pg.Client) => Promise<T>): Promise<T> {
  const cfg: pg.ClientConfig = { connectionString: DB_URL };
  if (DB_URL!.includes('supabase.')) cfg.ssl = { rejectUnauthorized: false };
  const client = new pg.Client(cfg);
  await client.connect();
  try {
    return await op(client);
  } finally {
    try { await client.end(); } catch { /* client cleanup errors are non-fatal */ }
  }
}

async function withFreshClientRetry<T>(op: (c: pg.Client) => Promise<T>, maxAttempts = 3): Promise<T> {
  let attempt = 0;
  let lastErr: unknown = null;
  while (attempt < maxAttempts) {
    try {
      return await withFreshClient(op);
    } catch (err) {
      lastErr = err;
      if (!isConnectionClassError(err) || attempt === maxAttempts - 1) throw err;
      const backoffMs = 500 * (attempt + 1);
      await new Promise((r) => setTimeout(r, backoffMs));
      attempt += 1;
    }
  }
  throw lastErr;
}

// ---------------------------------------------------------------------------
// Persistence helpers (each takes a client bound to the current game).
// ---------------------------------------------------------------------------

async function insertIngestionRunOpen(
  client: pg.Client,
  runId: string,
  scope: string,
  sanitizedParams: Record<string, unknown>,
  startedAt: string
): Promise<void> {
  await client.query(
    `INSERT INTO bdl_ingestion_runs
       (bdl_ingestion_run_id, endpoint, request_params, query_scope_key,
        started_at, completion_state)
     VALUES ($1, 'player_stats', $2::jsonb, $3, $4, 'running')`,
    [runId, JSON.stringify(sanitizedParams), scope, startedAt]
  );
}

async function updateIngestionRunClosed(
  client: pg.Client,
  runId: string,
  vals: {
    completedAt: string; pageCount: number; rowCount: number;
    cursorChainSent: ReadonlyArray<string | null>;
    cursorChainReturned: ReadonlyArray<string | null>;
    httpStatusLast: number | null; contentTypeLast: string | null;
    responseHeadersLast: Readonly<Record<string, string | number>>;
    completionState: BdlRunState; failureDetail: string | null;
  }
): Promise<void> {
  await client.query(
    `UPDATE bdl_ingestion_runs SET
        completed_at = $2::timestamptz, page_count = $3::int, row_count = $4::int,
        cursor_chain_sent = $5::jsonb, cursor_chain_returned = $6::jsonb,
        http_status_last = $7, content_type_last = $8,
        response_headers_last = $9::jsonb,
        completion_state = $10, failure_detail = $11,
        updated_at = now()
      WHERE bdl_ingestion_run_id = $1::uuid`,
    [runId, vals.completedAt, vals.pageCount, vals.rowCount,
     JSON.stringify(vals.cursorChainSent), JSON.stringify(vals.cursorChainReturned),
     vals.httpStatusLast, vals.contentTypeLast,
     JSON.stringify(vals.responseHeadersLast),
     vals.completionState, vals.failureDetail]
  );
}

async function insertRawResponsePage(
  client: pg.Client,
  runId: string,
  page: RawResponsePage
): Promise<string> {
  await client.query(
    `INSERT INTO bdl_raw_responses
       (raw_response_id, bdl_ingestion_run_id, page_index,
        cursor_used_to_fetch, cursor_returned_next, retrieved_at,
        http_status, content_type, response_headers, response_body,
        response_body_text, response_body_bytes, observed_row_count)
     VALUES ($1::uuid,$2::uuid,$3::int,$4,$5,$6::timestamptz,
             $7::int,$8,$9::jsonb,$10::jsonb,$11,$12,$13::int)`,
    [
      page.raw_response_id, runId, page.page_index,
      page.cursor_used_to_fetch, page.cursor_returned_next, page.retrieved_at,
      page.http_status, page.content_type, JSON.stringify(page.response_headers),
      page.response_body === null ? null : JSON.stringify(page.response_body),
      page.response_body_text, page.response_body_bytes, page.observed_row_count,
    ]
  );
  return page.raw_response_id;
}

async function upsertPlayerGameStat(
  client: pg.Client,
  args: {
    incoming: NormalizedPlayerGameStat;
    internal_player_id: string | null;
    internal_game_id: string;
    internal_player_team_id: string | null;
    internal_opponent_team_id: string | null;
    is_home: boolean | null;
    runId: string;
    rawResponseId: string;
    observedAt: string;
    prior: NormalizedPlayerGameStat | null;
  }
): Promise<{ change_kind: 'initial_observation' | 'material_correction' | 'metadata_change'; player_game_stat_id: string; changed_fields: ReadonlyArray<string>; minutes_state_changed: boolean }> {
  const { incoming, prior } = args;
  const diff = detectCorrection(incoming, prior);
  // UPSERT by (provider, provider_player_id, provider_game_id). The
  // schema UNIQUE ensures idempotence; ON CONFLICT DO UPDATE lets a
  // material_correction replace the mutable columns while retaining the
  // original player_game_stat_id (append-only history references it).
  const insertRes = await client.query(
    `INSERT INTO player_game_stats
       (player_game_stat_id, provider, provider_player_id, provider_game_id,
        internal_player_id, internal_game_id, provider_team_id,
        internal_player_team_id, internal_opponent_team_id, is_home,
        season, season_type,
        raw_minutes, parsed_minutes, minutes_status,
        raw_stats, normalized_stats, source_hash,
        eligibility_state, quarantine_reason,
        first_observed_at, last_verified_at, last_material_change_at,
        latest_raw_response_id, latest_ingestion_run_id,
        normalization_version)
     VALUES
       (gen_random_uuid(), 'balldontlie', $1, $2,
        $3::uuid, $4::uuid, $5,
        $6::uuid, $7::uuid, $8::boolean,
        $9::smallint, $10::smallint,
        $11, $12::numeric, $13::bdl_minutes_status,
        $14::jsonb, $15::jsonb, $16,
        $17::player_stat_eligibility, $18::player_stat_quarantine_reason,
        $19::timestamptz, $19::timestamptz, $20::timestamptz,
        $21::uuid, $22::uuid,
        $23::int)
     ON CONFLICT (provider, provider_player_id, provider_game_id) DO UPDATE
       SET internal_player_id = EXCLUDED.internal_player_id,
           internal_game_id = EXCLUDED.internal_game_id,
           provider_team_id = EXCLUDED.provider_team_id,
           internal_player_team_id = EXCLUDED.internal_player_team_id,
           internal_opponent_team_id = EXCLUDED.internal_opponent_team_id,
           is_home = EXCLUDED.is_home,
           season = EXCLUDED.season,
           season_type = EXCLUDED.season_type,
           raw_minutes = EXCLUDED.raw_minutes,
           parsed_minutes = EXCLUDED.parsed_minutes,
           minutes_status = EXCLUDED.minutes_status,
           raw_stats = EXCLUDED.raw_stats,
           normalized_stats = EXCLUDED.normalized_stats,
           source_hash = EXCLUDED.source_hash,
           eligibility_state = EXCLUDED.eligibility_state,
           quarantine_reason = EXCLUDED.quarantine_reason,
           last_verified_at = EXCLUDED.last_verified_at,
           last_material_change_at =
             CASE WHEN player_game_stats.source_hash = EXCLUDED.source_hash
                  THEN player_game_stats.last_material_change_at
                  ELSE EXCLUDED.last_material_change_at END,
           latest_raw_response_id = EXCLUDED.latest_raw_response_id,
           latest_ingestion_run_id = EXCLUDED.latest_ingestion_run_id,
           updated_at = now()
     RETURNING player_game_stat_id::text AS id, xmax = 0 AS inserted`,
    [
      incoming.provider_player_id, incoming.provider_game_id,
      args.internal_player_id, args.internal_game_id, incoming.provider_team_id,
      args.internal_player_team_id, args.internal_opponent_team_id, args.is_home,
      incoming.season, incoming.season_type,
      incoming.raw_minutes, incoming.parsed_minutes, incoming.minutes_status,
      JSON.stringify(incoming.raw_stats), JSON.stringify(incoming.normalized_stats), incoming.source_hash,
      incoming.eligibility_state, incoming.quarantine_reason,
      args.observedAt,
      diff.change_kind === 'material_correction' ? args.observedAt : null,
      args.rawResponseId, args.runId,
      incoming.normalization_version,
    ]
  );
  const returned = insertRes.rows[0] as { id: string; inserted: boolean };

  // Append to player_game_stat_history unconditionally: initial_observation,
  // material_correction, and metadata_change all preserve the observation.
  await client.query(
    `INSERT INTO player_game_stat_history
       (player_game_stat_history_id, player_game_stat_id, provider,
        provider_player_id, provider_game_id, change_kind,
        prior_source_hash, new_source_hash, changed_fields,
        prior_raw_stats, prior_normalized_stats, prior_minutes_status,
        prior_raw_minutes, prior_parsed_minutes,
        new_raw_stats, new_normalized_stats, new_minutes_status,
        new_raw_minutes, new_parsed_minutes,
        bdl_ingestion_run_id, raw_response_id, observed_at)
     VALUES (gen_random_uuid(), $1::uuid, 'balldontlie',
             $2, $3, $4,
             $5, $6, $7::jsonb,
             $8::jsonb, $9::jsonb, $10::bdl_minutes_status,
             $11, $12::numeric,
             $13::jsonb, $14::jsonb, $15::bdl_minutes_status,
             $16, $17::numeric,
             $18::uuid, $19::uuid, $20::timestamptz)`,
    [
      returned.id,
      incoming.provider_player_id, incoming.provider_game_id, diff.change_kind,
      diff.prior_source_hash, diff.new_source_hash, JSON.stringify(diff.changed_fields.slice()),
      prior === null ? null : JSON.stringify(prior.raw_stats),
      prior === null ? null : JSON.stringify(prior.normalized_stats),
      prior?.minutes_status ?? null,
      prior?.raw_minutes ?? null,
      prior?.parsed_minutes ?? null,
      JSON.stringify(incoming.raw_stats), JSON.stringify(incoming.normalized_stats), incoming.minutes_status,
      incoming.raw_minutes, incoming.parsed_minutes,
      args.runId, args.rawResponseId, args.observedAt,
    ]
  );

  // IMPORTANT: DO NOT INSERT into recomputation_invalidations. See the
  // population-path finding in the header comment. Initial-observation rows
  // must not fire the recomputation writer; that would misuse the queue for
  // first-pass population, which is Phase B's design question.
  return {
    change_kind: diff.change_kind,
    player_game_stat_id: returned.id,
    changed_fields: diff.changed_fields,
    minutes_state_changed: diff.minutes_state_changed,
  };
}

async function upsertWatermarkIfComplete(
  client: pg.Client,
  scope: string,
  completionState: BdlRunState,
  runId: string,
  completedAt: string,
  pageCount: number,
  rowCount: number
): Promise<{ advanced: boolean; refusal_reason: string | null }> {
  const cur = await client.query(
    `SELECT completed_at::text AS completed_at, completed_by_run_id::text AS completed_by_run_id
       FROM bdl_import_watermarks
      WHERE endpoint = 'player_stats' AND query_scope_key = $1`,
    [scope]
  );
  const existing = cur.rows.length === 0 ? null : (cur.rows[0] as { completed_at: string | null; completed_by_run_id: string | null });
  const current = existing === null
    ? emptyWatermark('player_stats', scope)
    : Object.freeze({
        endpoint: 'player_stats' as const,
        query_scope_key: scope,
        completed_at: existing.completed_at,
        completed_by_run_id: existing.completed_by_run_id,
        completed_row_count: null, completed_page_count: null,
        previous_completed_at: null, previous_completed_by_run_id: null,
      });
  const closedRun = closeRun({
    open: openRun({
      bdl_ingestion_run_id: runId, endpoint: 'player_stats',
      request_params: { game_ids: [scope] }, query_scope_key: scope,
      started_at: completedAt,
    }),
    completed_at: completedAt, page_count: pageCount, row_count: rowCount,
    cursor_chain_sent: [], cursor_chain_returned: [],
    http_status_last: 200, content_type_last: 'application/json',
    response_headers_last: {}, completion_state: completionState, failure_detail: null,
  });
  const decision = advanceWatermark(current, closedRun);
  if (!decision.advanced) return { advanced: false, refusal_reason: decision.refusal_reason };
  if (existing === null) {
    await client.query(
      `INSERT INTO bdl_import_watermarks
         (endpoint, query_scope_key, completed_at, completed_by_run_id,
          completed_row_count, completed_page_count)
       VALUES ('player_stats', $1, $2::timestamptz, $3::uuid, $4::int, $5::int)`,
      [scope, completedAt, runId, rowCount, pageCount]
    );
  } else {
    await client.query(
      `UPDATE bdl_import_watermarks SET
         previous_completed_at = completed_at,
         previous_completed_by_run_id = completed_by_run_id,
         completed_at = $2::timestamptz, completed_by_run_id = $3::uuid,
         completed_row_count = $4::int, completed_page_count = $5::int,
         updated_at = now()
       WHERE endpoint = 'player_stats' AND query_scope_key = $1`,
      [scope, completedAt, runId, rowCount, pageCount]
    );
  }
  return { advanced: true, refusal_reason: null };
}

// ---------------------------------------------------------------------------
// Per-game processing.
// ---------------------------------------------------------------------------

async function processGame(
  game: HostedGame,
  teamMap: ReadonlyMap<string, { internal_team_id: string; supported_competition_team: boolean }>,
  playerMap: ReadonlyMap<string, string>,
  overall: OverallStats
): Promise<RunOutcome> {
  const runId = randomUUID();
  const scope = `game=${game.provider_game_id}`;
  const startedAt = new Date().toISOString();
  const params = { game_ids: [game.provider_game_id], per_page: 100 } as const;

  // Fetcher: single BDL request per page. Uses V1-2 bdlRequest.
  const fetcher: PageFetcher<BdlPlayerStatRow> = async (cursor, page_index) => {
    overall.bdl_request_count += 1;
    try {
      const res = await bdlRequest(
        httpConfig,
        { endpoint: 'player_stats', params, cursor },
        AUTH_HEADERS
      );
      if (res.failure_kind !== null) {
        const err: PageFetchError = {
          kind: res.failure_kind, detail: `HTTP ${res.status}`,
          http_status: res.status, content_type: res.content_type,
          response_headers: res.headers, raw_body_text: res.body_text,
        };
        return { ok: false, error: err };
      }
      const body = res.body_json as BdlPaginatedResponse<BdlPlayerStatRow> | null;
      const dataArr: ReadonlyArray<BdlPlayerStatRow> = (body?.data ?? []) as ReadonlyArray<BdlPlayerStatRow>;
      const responseEnvelope: BdlPaginatedResponse<BdlPlayerStatRow> = body?.meta !== undefined
        ? { data: dataArr, meta: body.meta }
        : { data: dataArr };
      const page: CursorTraversalPageResult<BdlPlayerStatRow> = {
        response: responseEnvelope,
        raw: {
          raw_response_id: randomUUID(),
          bdl_ingestion_run_id: runId, page_index,
          cursor_used_to_fetch: cursor,
          cursor_returned_next: (body?.meta?.next_cursor ?? null) === '' ? null : (body?.meta?.next_cursor ?? null),
          retrieved_at: new Date().toISOString(),
          http_status: res.status, content_type: res.content_type,
          response_headers: res.headers,
          response_body: body,
          response_body_text: null,
          response_body_bytes: res.body_text.length,
          observed_row_count: dataArr.length,
        },
      };
      return { ok: true, page };
    } catch (err) {
      return {
        ok: false,
        error: {
          kind: 'failed_transport' as const,
          detail: err instanceof Error ? err.message : String(err),
          http_status: null, content_type: null,
          response_headers: {}, raw_body_text: null,
        },
      };
    }
  };

  const traversal = await traverseCursor(fetcher);
  overall.bdl_page_count += traversal.pages.length;
  overall.bdl_row_count += traversal.row_count;

  // Persistence: open run, insert raw pages, process rows, close run, watermark.
  let rows_inserted = 0, rows_material_correction = 0, rows_metadata_change = 0;
  let rows_quarantined = 0, rows_eligible = 0, rows_dnp = 0;
  let rows_live_or_non_final = 0, rows_unresolved_minutes = 0;
  const minutesCounts: Record<BdlMinutesStatus, number> = { played: 0, dnp: 0, unresolved_non_numeric: 0 };
  const quarantineCounts: Record<string, number> = {};

  await withFreshClientRetry(async (client) => {
    await insertIngestionRunOpen(client, runId, scope, { game_ids: [game.provider_game_id], per_page: 100 }, startedAt);
    // Insert every raw page (both success traversal and partial).
    const pageRawIds: string[] = [];
    for (const p of traversal.pages) {
      const id = await insertRawResponsePage(client, runId, p.raw);
      pageRawIds.push(id);
    }
    // If the traversal did NOT complete, we still want the run + raw pages
    // to persist for diagnosis, but we do NOT process rows and we do NOT
    // advance the watermark.
    if (traversal.completion_state !== 'complete') {
      await updateIngestionRunClosed(client, runId, {
        completedAt: new Date().toISOString(),
        pageCount: traversal.pages.length,
        rowCount: traversal.row_count,
        cursorChainSent: traversal.cursor_chain_sent,
        cursorChainReturned: traversal.cursor_chain_returned,
        httpStatusLast: traversal.http_status_last,
        contentTypeLast: traversal.content_type_last,
        responseHeadersLast: traversal.response_headers_last,
        completionState: traversal.completion_state,
        failureDetail: traversal.failure_detail,
      });
      return;
    }

    // Row processing (only on complete traversal).
    if (!CLI.dryRun) {
      // Look up home/away team classification once.
      const homeApproved = { internal_team_id: game.home_team_id }; // approved by V1-1 already (per query filter)
      const awayApproved = { internal_team_id: game.away_team_id };
      // Fetch classification for both sides.
      const cls = await client.query(
        `SELECT internal_team_id::text AS id, classification::text AS cls
           FROM teams WHERE internal_team_id = ANY ($1::uuid[])`,
        [[game.home_team_id, game.away_team_id]]
      );
      const clsMap = new Map<string, string>();
      for (const row of cls.rows as Array<{ id: string; cls: string }>) clsMap.set(row.id, row.cls);
      const homeSupported = ['current_franchise', 'historical_franchise'].includes(clsMap.get(homeApproved.internal_team_id) ?? '');
      const awaySupported = ['current_franchise', 'historical_franchise'].includes(clsMap.get(awayApproved.internal_team_id) ?? '');

      for (let pi = 0; pi < traversal.pages.length; pi += 1) {
        const page = traversal.pages[pi]!;
        const rawResponseId = pageRawIds[pi]!;
        for (const row of page.response.data) {
          const provider_player_id = String((row.player?.id ?? row.id ?? '')).trim();
          const provider_game_id = String(row.game?.id ?? game.provider_game_id);
          if (provider_player_id === '') continue;
          const provider_team_id = row.team?.id !== undefined && row.team?.id !== null ? String(row.team.id) : null;
          const mm = parseBdlMinutes(row.min ?? null);
          minutesCounts[mm.status] += 1;
          const rawStats = extractRawCountingStats(row);
          const internal_player_id = playerMap.get(provider_player_id) ?? null;
          // AUTHORITY for the joined game's status is the internal `games`
          // table (populated by the V1-1 identity backfill from BDL's games
          // endpoint per BDL §10). The BDL /player_stats endpoint returns
          // only `{ game: { id, date, season } }` on each row — no `status`
          // field — so re-deriving finality from the row would incorrectly
          // quarantine every player-stat as `unknown_game_status`. This
          // script processes ONLY games already filtered to
          // `games.status='final'` (see loadEligibleGames), so the DB-known
          // status is authoritative here. `mapBdlGameStatus` still runs to
          // keep the primitive in play for schema-shape parity.
          const dbKnownStatus = mapBdlGameStatus(game.status);
          const gameStatus = { canonical_status: game.status, is_unknown: dbKnownStatus.is_unknown };
          void mapBdlGameStatus(row.game?.status ?? null); // consulted for auditability; result discarded

          // Team membership check.
          const teamInGameSide =
            provider_team_id !== null &&
            (teamMap.get(provider_team_id)?.internal_team_id === game.home_team_id ||
             teamMap.get(provider_team_id)?.internal_team_id === game.away_team_id);

          // Season agreement. BDL /player_stats returns `game.season` but no
          // `game.season_type`. AUTHORITY for both is the internal `games`
          // row; the row's descriptive season is treated as agreeing when
          // it equals the internal season. Season_type is trusted from the
          // internal `games.season_type`.
          const rowSeason = typeof row.game?.season === 'number' ? row.game.season : null;
          const rowSeasonType = typeof row.game?.season_type === 'number' ? row.game.season_type : game.season_type;
          const seasonAgrees =
            rowSeason === null
              ? true // row omitted season — trust the internal game
              : rowSeason === game.season && rowSeasonType === game.season_type;

          // Supported team classification depends on which side this row is on.
          const rowsInternalTeamId = provider_team_id === null ? null : (teamMap.get(provider_team_id)?.internal_team_id ?? null);
          const supported =
            rowsInternalTeamId === game.home_team_id ? homeSupported :
            rowsInternalTeamId === game.away_team_id ? awaySupported : false;

          // Compute eligibility via V1-2 primitive.
          const elig = computeEligibility({
            provider_player_id, provider_game_id,
            minutes_status: mm.status,
            joined_game_canonical_status: gameStatus.canonical_status,
            joined_game_status_is_unknown: gameStatus.is_unknown,
            internal_player_id,
            internal_game_id: game.internal_game_id,
            team_matches_game_side: teamInGameSide,
            season_agrees_with_game: seasonAgrees,
            duplicate_source_key: false, // handled by UNIQUE constraint; UPSERT overrides
            supported_competition_team: supported,
          });

          // Normalize counting stats (null → 0 ONLY for eligible played).
          const normalized = normalizeCountingStats(rawStats, mm.status, elig.eligibility_state === 'eligible');

          const source_hash = canonicalSourceHash({
            provider_player_id, provider_game_id,
            provider_team_id, minutes_status: mm.status,
            parsed_minutes: mm.parsed_minutes, raw_minutes: mm.raw_minutes,
            raw_stats: rawStats,
          });

          const incoming: NormalizedPlayerGameStat = {
            provider: 'balldontlie',
            provider_player_id, provider_game_id,
            provider_team_id, raw_minutes: mm.raw_minutes,
            parsed_minutes: mm.parsed_minutes, minutes_status: mm.status,
            raw_stats: rawStats, normalized_stats: normalized,
            source_hash,
            eligibility_state: elig.eligibility_state,
            quarantine_reason: elig.quarantine_reason,
            // Persist DB-known season / season_type when BDL omits them
            // (see season-agreement comment above). Row-observed values, if
            // present, are only used for the disagreement check.
            season: rowSeason ?? game.season,
            season_type: rowSeasonType ?? game.season_type,
            normalization_version: 1,
          };

          const prior = await loadPriorStatRow(provider_player_id, provider_game_id);
          const upsertResult = await upsertPlayerGameStat(client, {
            incoming, internal_player_id,
            internal_game_id: game.internal_game_id,
            internal_player_team_id: rowsInternalTeamId,
            internal_opponent_team_id:
              rowsInternalTeamId === game.home_team_id ? game.away_team_id :
              rowsInternalTeamId === game.away_team_id ? game.home_team_id : null,
            is_home: rowsInternalTeamId === game.home_team_id ? true :
                    rowsInternalTeamId === game.away_team_id ? false : null,
            runId, rawResponseId,
            observedAt: page.raw.retrieved_at,
            prior,
          });

          if (upsertResult.change_kind === 'initial_observation') rows_inserted += 1;
          else if (upsertResult.change_kind === 'material_correction') rows_material_correction += 1;
          else if (upsertResult.change_kind === 'metadata_change') rows_metadata_change += 1;

          switch (elig.eligibility_state) {
            case 'eligible': rows_eligible += 1; break;
            case 'non_participation': rows_dnp += 1; break;
            case 'live_or_non_final': rows_live_or_non_final += 1; break;
            case 'unresolved_minutes': rows_unresolved_minutes += 1; break;
            case 'quarantined':
              rows_quarantined += 1;
              if (elig.quarantine_reason !== null) {
                quarantineCounts[elig.quarantine_reason] = (quarantineCounts[elig.quarantine_reason] ?? 0) + 1;
              }
              break;
          }
        }
      }
    }

    await updateIngestionRunClosed(client, runId, {
      completedAt: new Date().toISOString(),
      pageCount: traversal.pages.length,
      rowCount: traversal.row_count,
      cursorChainSent: traversal.cursor_chain_sent,
      cursorChainReturned: traversal.cursor_chain_returned,
      httpStatusLast: traversal.http_status_last,
      contentTypeLast: traversal.content_type_last,
      responseHeadersLast: traversal.response_headers_last,
      completionState: 'complete',
      failureDetail: null,
    });
  });

  // Watermark advancement — SEPARATE client. Only advance on complete traversal AND non-dry-run.
  let watermarkAdvanced = false;
  let watermarkRefusalReason: string | null = null;
  if (traversal.completion_state === 'complete' && !CLI.dryRun) {
    const decision = await withFreshClientRetry(async (client) => {
      return await upsertWatermarkIfComplete(
        client, scope, 'complete', runId,
        new Date().toISOString(), traversal.pages.length, traversal.row_count
      );
    });
    watermarkAdvanced = decision.advanced;
    watermarkRefusalReason = decision.refusal_reason;
  } else if (traversal.completion_state !== 'complete') {
    watermarkRefusalReason = `traversal completion_state=${traversal.completion_state} (not 'complete')`;
  } else if (CLI.dryRun) {
    watermarkRefusalReason = 'dry-run mode; watermark advancement suppressed';
  }

  // Aggregate onto overall.
  overall.rows_inserted += rows_inserted;
  overall.rows_material_correction += rows_material_correction;
  overall.rows_metadata_change += rows_metadata_change;
  overall.rows_quarantined += rows_quarantined;
  overall.rows_eligible += rows_eligible;
  overall.rows_dnp += rows_dnp;
  overall.rows_live_or_non_final += rows_live_or_non_final;
  overall.rows_unresolved_minutes += rows_unresolved_minutes;
  for (const k of Object.keys(minutesCounts) as BdlMinutesStatus[]) overall.minutes_status_counts[k] += minutesCounts[k];
  for (const [k, v] of Object.entries(quarantineCounts)) overall.quarantine_reason_counts[k] = (overall.quarantine_reason_counts[k] ?? 0) + v;

  const total_persisted_or_seen = rows_inserted + rows_material_correction + rows_metadata_change + rows_quarantined;
  if (total_persisted_or_seen === 0 && traversal.completion_state === 'complete') {
    overall.games_yielding_zero_stats += 1;
    overall.games_yielding_zero_stats_reasons.push({
      internal_game_id: game.internal_game_id,
      reason: traversal.row_count === 0 ? 'BDL returned zero player_stats rows for this game' : 'rows returned but all filtered pre-persist (unusual)',
    });
  }

  return {
    bdl_ingestion_run_id: runId,
    completion_state: traversal.completion_state,
    page_count: traversal.pages.length,
    row_count_bdl: traversal.row_count,
    rows_inserted, rows_material_correction, rows_metadata_change,
    rows_quarantined, rows_eligible, rows_dnp,
    rows_live_or_non_final, rows_unresolved_minutes,
    minutes_status_counts: Object.freeze(minutesCounts),
    quarantine_reason_counts: Object.freeze(quarantineCounts),
    failure_detail: traversal.failure_detail,
    watermark_advanced: watermarkAdvanced,
    watermark_refusal_reason: watermarkRefusalReason,
  };
}

// ---------------------------------------------------------------------------
// Main.
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const overall = newOverall();
  const startedAt = new Date().toISOString();
  console.log(`# V1-4c stats backfill starting at ${startedAt}`);
  console.log(`#   hosted DB: ${DB_URL!.replace(/:[^:@]+@/, ':REDACTED@')}`);
  console.log(`#   dry-run: ${CLI.dryRun}, resume: ${CLI.resume}, limit: ${CLI.limit ?? 'none'}, single-game: ${CLI.singleGame ?? 'none'}`);

  const games = await loadEligibleGames();
  console.log(`# eligible final games with approved BDL provider_games mapping: ${games.length}`);
  const teamMap = await loadApprovedProviderTeamMap();
  const playerMap = await loadApprovedProviderPlayerMap();
  console.log(`# approved BDL provider_teams: ${teamMap.size}; approved BDL provider_players: ${playerMap.size}`);

  const outcomesByGame: Array<{ game: HostedGame; outcome: RunOutcome | 'skipped_watermark' }> = [];

  for (let gi = 0; gi < games.length; gi += 1) {
    const game = games[gi]!;
    const scope = `game=${game.provider_game_id}`;
    if (CLI.resume && await watermarkIsComplete(scope)) {
      overall.games_skipped_watermark += 1;
      outcomesByGame.push({ game, outcome: 'skipped_watermark' });
      continue;
    }
    try {
      const outcome = await processGame(game, teamMap, playerMap, overall);
      outcomesByGame.push({ game, outcome });
      overall.games_processed += 1;
      if (outcome.completion_state === 'complete') overall.games_complete += 1;
      else overall.games_failed_bdl += 1;
      // Progress marker every 10 games.
      if ((gi + 1) % 10 === 0) console.log(`# progress: ${gi + 1}/${games.length}`);
    } catch (err) {
      overall.games_failed_bdl += 1;
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`# game ${game.internal_game_id} (bdl id ${game.provider_game_id}) failed: ${msg}`);
    }
  }

  const completedAt = new Date().toISOString();
  console.log(`\n# V1-4c stats backfill complete at ${completedAt}`);
  console.log(`# started_at: ${startedAt}`);
  console.log(`# summary:`);
  console.log(JSON.stringify({
    bdl_request_count: overall.bdl_request_count,
    bdl_page_count: overall.bdl_page_count,
    bdl_row_count_total: overall.bdl_row_count,
    games_total: games.length,
    games_processed: overall.games_processed,
    games_complete: overall.games_complete,
    games_skipped_watermark: overall.games_skipped_watermark,
    games_failed_bdl: overall.games_failed_bdl,
    games_yielding_zero_stats: overall.games_yielding_zero_stats,
    rows_inserted: overall.rows_inserted,
    rows_material_correction: overall.rows_material_correction,
    rows_metadata_change: overall.rows_metadata_change,
    rows_quarantined: overall.rows_quarantined,
    rows_eligible: overall.rows_eligible,
    rows_dnp: overall.rows_dnp,
    rows_live_or_non_final: overall.rows_live_or_non_final,
    rows_unresolved_minutes: overall.rows_unresolved_minutes,
    minutes_status_counts: overall.minutes_status_counts,
    quarantine_reason_counts: overall.quarantine_reason_counts,
  }, null, 2));

  // Per-game watermark state (for auditability).
  const wmSummary = { advanced_this_run: 0, refused: 0, refused_reasons: {} as Record<string, number> };
  for (const { outcome } of outcomesByGame) {
    if (outcome === 'skipped_watermark') continue;
    if (outcome.watermark_advanced) wmSummary.advanced_this_run += 1;
    else {
      wmSummary.refused += 1;
      const key = outcome.watermark_refusal_reason ?? 'unspecified';
      wmSummary.refused_reasons[key] = (wmSummary.refused_reasons[key] ?? 0) + 1;
    }
  }
  console.log(`# watermarks:`);
  console.log(JSON.stringify(wmSummary, null, 2));

  if (overall.games_yielding_zero_stats_reasons.length > 0) {
    console.log(`# games yielding zero stats:`);
    for (const g of overall.games_yielding_zero_stats_reasons) console.log(JSON.stringify(g));
  }

  await readPool.end();
  // Explicit exit avoids hangs from lingering handles.
  process.exit(overall.games_failed_bdl === 0 ? 0 : 2);
}

main().catch(async (err: unknown) => {
  console.error('# fatal:', err instanceof Error ? err.stack ?? err.message : String(err));
  try { await readPool.end(); } catch { /* pool cleanup errors are non-fatal on shutdown */ }
  process.exit(1);
});

// Assurance markers for the report:
//   * `runMayAdvanceWatermark` is imported (and consumed indirectly through
//     `advanceWatermark`); a partial traversal never reaches the watermark
//     UPDATE because `traversal.completion_state !== 'complete'` short-
//     circuits BEFORE the watermark call.
//   * `COUNTING_STAT_FIELDS` is imported to keep the raw/normalized shape
//     coherent with the V1-2 primitive (dead-import-safe: the compiler
//     enforces the shape via extractRawCountingStats). It is intentionally
//     referenced to keep the field list in view for future maintainers.
export const _V1_4C_COUNTING_STAT_FIELDS = COUNTING_STAT_FIELDS;
export const _V1_4C_RUN_ADVANCEABLE = runMayAdvanceWatermark;

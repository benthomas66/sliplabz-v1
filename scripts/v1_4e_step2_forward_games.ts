// V1-4e STEP 2 — forward BDL game ingestion.
//
// Consumes V1-2 primitives (NO reimplementation):
//   - src/bdl/httpClient.ts     (bdlRequest)
//   - src/bdl/cursorPagination.ts (traverseCursor)
//   - src/bdl/ingestionRun.ts   (openRun / closeRun)
//   - src/bdl/watermark.ts      (advanceWatermark: complete runs only)
//
// Scope: `endpoint='games' query_scope_key='season=2026'`. This is the SAME
// scope V1-4b used, so this run is a top-up that supersedes the prior
// completed_at. Idempotent: existing (provider='balldontlie', provider_game_id)
// rows update in place; new ones create both `games` and approved
// `provider_games` mappings.
//
// Differences from V1-4b's `upsertGamesFromBdl`:
//   * NO `if (g_ymd > TODAY_YMD) skip` clause. Upcoming games ARE the point.
//   * Everything else is the same pattern: BDL team-id lookup via approved
//     provider_teams, insert games + provider_games + mapping_history, or
//     queue when teams don't resolve. No back-link across `market_snapshots`.
//
// Env / gates:
//   * SLIPLABZ_HOSTED_DATABASE_URL       required (hosted only).
//   * BALLDONTLIE_API_KEY                required.
//   * BDL_LIVE_INVOKE=1                  required (live-invoke gate).
//   * The API key is never printed, never persisted.

import { createHash, randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import pg from 'pg';

import {
  bdlRequest,
  DEFAULT_BDL_CONFIG,
  type BdlHttpConfig,
  type HttpResponseLike,
} from '../src/bdl/httpClient.js';
import { traverseCursor, type PageFetcher } from '../src/bdl/cursorPagination.js';
import { openRun, closeRun } from '../src/bdl/ingestionRun.js';
import { advanceWatermark } from '../src/bdl/watermark.js';
import type { BdlEndpoint } from '../src/shared/enums.js';

const CURRENT_SEASON = 2026;
const DB_URL = process.env['SLIPLABZ_HOSTED_DATABASE_URL'];
if (DB_URL === undefined || DB_URL === '') {
  console.error('SLIPLABZ_HOSTED_DATABASE_URL required');
  process.exit(1);
}
const API_KEY = process.env['BALLDONTLIE_API_KEY'];
const LIVE_FLAG = process.env['BDL_LIVE_INVOKE'];
if (API_KEY === undefined || API_KEY === '' || LIVE_FLAG !== '1') {
  console.error('BDL_LIVE_INVOKE=1 and BALLDONTLIE_API_KEY are both required.');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: DB_URL, max: 4 });

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
      headers: { get: (name: string): string | null => nativeRes.headers.get(name) },
      text: async () => await nativeRes.text(),
    };
  },
};

const authHeaders: Readonly<Record<string, string>> = Object.freeze({
  Authorization: API_KEY,
});

interface BdlTeam { readonly id: number; readonly full_name?: string; readonly name?: string; }
interface BdlGame {
  readonly id: number;
  readonly date?: string;
  readonly datetime?: string | null;
  readonly season: number;
  readonly postseason?: boolean;
  readonly status?: string;
  readonly home_team?: BdlTeam;
  readonly visitor_team?: BdlTeam;
}

// Same status mapping V1-4b uses (script-level).
function bdlStatusToInternal(s: string | undefined): 'scheduled' | 'live' | 'final' | 'unresolved' {
  if (s === undefined) return 'unresolved';
  const low = s.toLowerCase();
  if (low === 'post' || low === 'final' || low.startsWith('final')) return 'final';
  if (low === 'in progress' || low === 'live') return 'live';
  if (low === 'pre' || low === 'scheduled') return 'scheduled';
  if (/\d/.test(low)) return 'scheduled';
  return 'unresolved';
}

function hashRow(o: unknown): string {
  return createHash('sha256').update(JSON.stringify(o)).digest('hex');
}

interface WatermarkPre {
  endpoint: string;
  query_scope_key: string;
  completed_at: string | null;
  completed_row_count: number | null;
  completed_page_count: number | null;
}
async function readWatermark(scope: string): Promise<WatermarkPre> {
  const r = await pool.query(
    `SELECT endpoint, query_scope_key, completed_at, completed_row_count, completed_page_count
       FROM bdl_import_watermarks WHERE endpoint = 'games' AND query_scope_key = $1`,
    [scope]
  );
  const row = (r.rows[0] ?? null) as any;
  return {
    endpoint: 'games',
    query_scope_key: scope,
    completed_at: row?.completed_at ?? null,
    completed_row_count: row?.completed_row_count ?? null,
    completed_page_count: row?.completed_page_count ?? null,
  };
}

async function upsertWatermarkIfComplete(
  endpoint: BdlEndpoint, scope: string, completionState: string, runId: string,
  completedAt: string, pageCount: number, rowCount: number
): Promise<{ advanced: boolean; refusalReason: string | null }> {
  const cur = await pool.query(
    `SELECT completed_at, completed_by_run_id FROM bdl_import_watermarks
      WHERE endpoint = $1 AND query_scope_key = $2`,
    [endpoint, scope]
  );
  const existing = (cur.rows[0] ?? null) as { completed_at: string | null; completed_by_run_id: string | null } | null;
  const currentWatermark = {
    endpoint, query_scope_key: scope,
    completed_at: existing?.completed_at ?? null,
    completed_by_run_id: existing?.completed_by_run_id ?? null,
    completed_row_count: null, completed_page_count: null,
    previous_completed_at: null, previous_completed_by_run_id: null,
  };
  const closedRun = {
    bdl_ingestion_run_id: runId, endpoint,
    request_params: {}, query_scope_key: scope,
    started_at: completedAt, completed_at: completedAt,
    page_count: pageCount, row_count: rowCount,
    cursor_chain_sent: [] as ReadonlyArray<string | null>,
    cursor_chain_returned: [] as ReadonlyArray<string | null>,
    http_status_last: 200, content_type_last: 'application/json',
    response_headers_last: {}, completion_state: completionState as any,
    failure_detail: null, normalization_version: 1,
  } as const;
  const decision = advanceWatermark(currentWatermark, closedRun);
  if (!decision.advanced) return { advanced: false, refusalReason: decision.refusal_reason };
  if (existing === null) {
    await pool.query(
      `INSERT INTO bdl_import_watermarks
         (endpoint, query_scope_key, completed_at, completed_by_run_id,
          completed_row_count, completed_page_count)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [endpoint, scope, completedAt, runId, rowCount, pageCount]
    );
  } else {
    await pool.query(
      `UPDATE bdl_import_watermarks SET
         previous_completed_at = completed_at,
         previous_completed_by_run_id = completed_by_run_id,
         completed_at = $3, completed_by_run_id = $4,
         completed_row_count = $5, completed_page_count = $6, updated_at = now()
       WHERE endpoint = $1 AND query_scope_key = $2`,
      [endpoint, scope, completedAt, runId, rowCount, pageCount]
    );
  }
  return { advanced: true, refusalReason: null };
}

// Ingestion-run persistence (mirrors V1-4b patterns).
async function insertRunOpen(runId: string, endpoint: BdlEndpoint, scope: string, sanitizedParams: Record<string, unknown>, startedAt: string): Promise<void> {
  await pool.query(
    `INSERT INTO bdl_ingestion_runs
       (bdl_ingestion_run_id, endpoint, request_params, query_scope_key, started_at, completion_state)
     VALUES ($1, $2, $3::jsonb, $4, $5, 'running')`,
    [runId, endpoint, JSON.stringify(sanitizedParams), scope, startedAt]
  );
}
async function closeRunRow(runId: string, vals: {
  completedAt: string; pageCount: number; rowCount: number;
  cursorChainSent: ReadonlyArray<string | null>; cursorChainReturned: ReadonlyArray<string | null>;
  httpStatusLast: number | null; contentTypeLast: string | null;
  responseHeadersLast: Readonly<Record<string, string | number>>;
  completionState: string; failureDetail: string | null;
}): Promise<void> {
  await pool.query(
    `UPDATE bdl_ingestion_runs SET
        completed_at = $2, page_count = $3, row_count = $4,
        cursor_chain_sent = $5::jsonb, cursor_chain_returned = $6::jsonb,
        http_status_last = $7, content_type_last = $8, response_headers_last = $9::jsonb,
        completion_state = $10, failure_detail = $11, updated_at = now()
      WHERE bdl_ingestion_run_id = $1`,
    [runId, vals.completedAt, vals.pageCount, vals.rowCount, JSON.stringify(vals.cursorChainSent), JSON.stringify(vals.cursorChainReturned), vals.httpStatusLast, vals.contentTypeLast, JSON.stringify(vals.responseHeadersLast), vals.completionState, vals.failureDetail]
  );
}
async function insertRawResponsePage(runId: string, pageIndex: number, cursorUsed: string | null, cursorReturned: string | null, status: number, contentType: string | null, headers: Readonly<Record<string, string | number>>, body: unknown | null, observedRowCount: number): Promise<string> {
  const rid = randomUUID();
  await pool.query(
    `INSERT INTO bdl_raw_responses
       (raw_response_id, bdl_ingestion_run_id, page_index, cursor_used_to_fetch, cursor_returned_next,
        retrieved_at, http_status, content_type, response_headers, response_body, response_body_text, response_body_bytes, observed_row_count)
     VALUES ($1,$2,$3,$4,$5, now(), $6,$7,$8::jsonb,$9::jsonb,NULL,NULL,$10)`,
    [rid, runId, pageIndex, cursorUsed, cursorReturned, status, contentType, JSON.stringify(headers), body === null ? null : JSON.stringify(body), observedRowCount]
  );
  return rid;
}

async function appendMappingHistory(providerEntityId: string, internalEntityId: string | null, action: 'proposed' | 'approved', reason: string): Promise<void> {
  await pool.query(
    `INSERT INTO mapping_history
       (provider, entity_kind, provider_entity_id, internal_entity_id,
        prior_internal_entity_id, action, reason, actor)
     VALUES ('balldontlie','game',$1,$2,NULL,$3,$4,'v1_4e_forward_games')`,
    [providerEntityId, internalEntityId, action, reason]
  );
}

interface Counters {
  fetched: number; created: number; updated: number;
  provider_mappings_created: number; queued: number;
  scheduled: number; live: number; final: number; unresolved: number;
}

async function upsertGames(rows: ReadonlyArray<BdlGame>): Promise<Counters> {
  const c: Counters = { fetched: rows.length, created: 0, updated: 0, provider_mappings_created: 0, queued: 0, scheduled: 0, live: 0, final: 0, unresolved: 0 };
  const client = await pool.connect();
  try {
    for (const g of rows) {
      await client.query('BEGIN');
      const providerGameId = String(g.id);
      const homeProvId = g.home_team?.id !== undefined ? String(g.home_team.id) : null;
      const awayProvId = g.visitor_team?.id !== undefined ? String(g.visitor_team.id) : null;
      const rawHome = g.home_team?.full_name ?? g.home_team?.name ?? '';
      const rawAway = g.visitor_team?.full_name ?? g.visitor_team?.name ?? '';
      const rawCommence = g.datetime ?? g.date ?? null;

      let homeInternal: string | null = null, awayInternal: string | null = null;
      if (homeProvId !== null) {
        const r = await client.query(`SELECT internal_team_id FROM provider_teams WHERE provider = 'balldontlie' AND provider_team_id = $1 AND mapping_state = 'approved'`, [homeProvId]);
        homeInternal = (r.rows[0] as { internal_team_id: string } | undefined)?.internal_team_id ?? null;
      }
      if (awayProvId !== null) {
        const r = await client.query(`SELECT internal_team_id FROM provider_teams WHERE provider = 'balldontlie' AND provider_team_id = $1 AND mapping_state = 'approved'`, [awayProvId]);
        awayInternal = (r.rows[0] as { internal_team_id: string } | undefined)?.internal_team_id ?? null;
      }
      const existing = await client.query(
        `SELECT provider_game_row_id, internal_game_id FROM provider_games
           WHERE provider = 'balldontlie' AND provider_game_id = $1`,
        [providerGameId]
      );

      if (homeInternal === null || awayInternal === null || homeInternal === awayInternal) {
        const dupQ = await client.query(
          `SELECT 1 FROM event_reconciliation_queue
             WHERE provider = 'balldontlie' AND provider_game_id = $1 AND resolution = 'open'`,
          [providerGameId]
        );
        if (dupQ.rowCount === 0) {
          await client.query(
            `INSERT INTO event_reconciliation_queue
               (provider, provider_game_id, provider_game_row_id,
                raw_home_team, raw_away_team, raw_commence_time,
                candidate_internal_game_ids, reason, reason_detail)
             VALUES ('balldontlie',$1,NULL,$2,$3,$4, ARRAY[]::uuid[],
                     'unresolved_provider_team',$5)`,
            [providerGameId, rawHome, rawAway, rawCommence, `home_provider_team=${homeProvId ?? 'null'} away_provider_team=${awayProvId ?? 'null'} self_match=${homeInternal !== null && homeInternal === awayInternal}`]
          );
          c.queued += 1;
        }
        await client.query('COMMIT');
        continue;
      }

      const status = bdlStatusToInternal(g.status);
      if (status === 'scheduled') c.scheduled += 1;
      else if (status === 'live') c.live += 1;
      else if (status === 'final') c.final += 1;
      else c.unresolved += 1;

      if (existing.rowCount === 0) {
        const internalGameId = randomUUID();
        const seasonType = g.postseason === true ? 3 : 2;
        const scheduledStartUtc = g.datetime ?? g.date ?? null;
        if (scheduledStartUtc === null) {
          // Cannot mint a games row without a scheduled_start_utc — queue.
          await client.query(
            `INSERT INTO event_reconciliation_queue
               (provider, provider_game_id, provider_game_row_id,
                raw_home_team, raw_away_team, raw_commence_time,
                candidate_internal_game_ids, reason, reason_detail)
             VALUES ('balldontlie',$1,NULL,$2,$3,NULL, ARRAY[]::uuid[],
                     'unresolved_provider_team','bdl returned no datetime/date')`,
            [providerGameId, rawHome, rawAway]
          );
          c.queued += 1;
          await client.query('COMMIT');
          continue;
        }
        await client.query(
          `INSERT INTO games
             (internal_game_id, season, season_type, home_team_id, away_team_id,
              scheduled_start_utc, postseason, status)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [internalGameId, g.season, seasonType, homeInternal, awayInternal, scheduledStartUtc, g.postseason === true, status]
        );
        await client.query(
          `INSERT INTO provider_games
             (provider, provider_game_id, internal_game_id,
              raw_home_team, raw_away_team, raw_sport_key, raw_sport_title,
              raw_commence_time, time_delta_seconds, mapping_state, content_hash)
           VALUES ('balldontlie',$1,$2,$3,$4,'','',$5,0,'approved',$6)`,
          [providerGameId, internalGameId, rawHome, rawAway, rawCommence, hashRow(g)]
        );
        await appendMappingHistory(providerGameId, internalGameId, 'approved', 'v1_4e_forward_import_from_bdl');
        c.created += 1;
        c.provider_mappings_created += 1;
      } else {
        const row = existing.rows[0] as { provider_game_row_id: string; internal_game_id: string | null };
        await client.query(
          `UPDATE provider_games SET raw_home_team = $2, raw_away_team = $3,
             raw_commence_time = $4, last_seen_at = now(), content_hash = $5, updated_at = now()
           WHERE provider_game_row_id = $1`,
          [row.provider_game_row_id, rawHome, rawAway, rawCommence, hashRow(g)]
        );
        if (row.internal_game_id !== null) {
          const scheduledStartUtc = g.datetime ?? g.date ?? null;
          await client.query(
            `UPDATE games SET status = $2,
               scheduled_start_utc = COALESCE($3::timestamptz, scheduled_start_utc),
               updated_at = now() WHERE internal_game_id = $1`,
            [row.internal_game_id, status, scheduledStartUtc]
          );
        }
        c.updated += 1;
      }
      await client.query('COMMIT');
    }
  } finally {
    client.release();
  }
  return c;
}

async function main(): Promise<void> {
  const scope = `season=${CURRENT_SEASON}`;
  const before_wm = await readWatermark(scope);
  console.log('# watermark BEFORE:', before_wm);

  const runId = randomUUID();
  const started_at = new Date().toISOString();
  await insertRunOpen(runId, 'games', scope, { 'seasons[]': [CURRENT_SEASON] }, started_at);

  const collectedRows: BdlGame[] = [];
  const fetcher: PageFetcher<BdlGame> = async (cursor, pageIndex) => {
    const result = await bdlRequest(httpConfig, {
      endpoint: 'games',
      params: { 'seasons[]': [CURRENT_SEASON] },
      cursor: cursor ?? null,
    }, authHeaders);
    if (result.parse_state === 'json_parse_error' || (result.status !== 200 && result.failure_kind !== null)) {
      const errKind = result.failure_kind ?? 'failed_transport';
      return { ok: false as const, error: { kind: errKind, detail: `HTTP ${result.status}`, http_status: result.status, content_type: result.content_type, response_headers: result.headers, raw_body_text: result.body_text } };
    }
    const bodyJson = result.body_json as any;
    const meta = (bodyJson?.meta ?? {}) as { next_cursor?: string | null };
    const data = (bodyJson?.data ?? []) as BdlGame[];
    const rawResponseId = await insertRawResponsePage(
      runId, pageIndex, cursor ?? null, meta.next_cursor ?? null,
      result.status, result.content_type, result.headers, bodyJson, data.length
    );
    collectedRows.push(...data);
    return {
      ok: true as const,
      page: {
        response: { data, meta: { next_cursor: meta.next_cursor ?? null } },
        raw: {
          raw_response_id: rawResponseId,
          bdl_ingestion_run_id: runId,
          page_index: pageIndex,
          cursor_used_to_fetch: cursor ?? null,
          cursor_returned_next: meta.next_cursor ?? null,
          retrieved_at: new Date().toISOString(),
          http_status: result.status,
          content_type: result.content_type,
          response_headers: result.headers,
          response_body: bodyJson,
          response_body_text: null,
          response_body_bytes: 0,
          observed_row_count: data.length,
        },
      },
    };
  };

  const traversal = await traverseCursor<BdlGame>(fetcher);
  const completed_at = new Date().toISOString();
  const closedRunState = closeRun({
    open: openRun({ bdl_ingestion_run_id: runId, endpoint: 'games', query_scope_key: scope, started_at, request_params: { 'seasons[]': [CURRENT_SEASON] } }),
    completed_at,
    page_count: traversal.pages.length,
    row_count: traversal.row_count,
    cursor_chain_sent: traversal.cursor_chain_sent,
    cursor_chain_returned: traversal.cursor_chain_returned,
    http_status_last: traversal.http_status_last,
    content_type_last: traversal.content_type_last,
    response_headers_last: traversal.response_headers_last,
    completion_state: traversal.completion_state,
    failure_detail: traversal.failure_detail,
    normalization_version: 1,
  });
  await closeRunRow(runId, {
    completedAt: closedRunState.completed_at, pageCount: closedRunState.page_count, rowCount: closedRunState.row_count,
    cursorChainSent: closedRunState.cursor_chain_sent, cursorChainReturned: closedRunState.cursor_chain_returned,
    httpStatusLast: closedRunState.http_status_last, contentTypeLast: closedRunState.content_type_last,
    responseHeadersLast: closedRunState.response_headers_last,
    completionState: closedRunState.completion_state, failureDetail: closedRunState.failure_detail,
  });

  const persistCounts = closedRunState.completion_state === 'complete'
    ? await upsertGames(collectedRows)
    : { fetched: 0, created: 0, updated: 0, provider_mappings_created: 0, queued: 0, scheduled: 0, live: 0, final: 0, unresolved: 0 };

  const wmResult = await upsertWatermarkIfComplete('games', scope, closedRunState.completion_state, runId, closedRunState.completed_at, closedRunState.page_count, closedRunState.row_count);
  const after_wm = await readWatermark(scope);

  const games_summary = await pool.query(
    `SELECT count(*)::int AS n_total,
            count(*) FILTER (WHERE status='scheduled') AS n_scheduled,
            count(*) FILTER (WHERE status='live') AS n_live,
            count(*) FILTER (WHERE status='final') AS n_final,
            count(*) FILTER (WHERE status='unresolved') AS n_unresolved,
            min(scheduled_start_utc) AS min_start, max(scheduled_start_utc) AS max_start
       FROM games`
  );

  const artifact = {
    ticket: 'V1-4e', step: 2,
    started_at, completed_at,
    endpoint: 'games', scope,
    bdl_request_page_count: closedRunState.page_count,
    bdl_row_count_returned: closedRunState.row_count,
    completion_state: closedRunState.completion_state,
    persist_counts: persistCounts,
    watermark: {
      before: before_wm,
      advanced: wmResult.advanced,
      refusal_reason: wmResult.refusalReason,
      after: after_wm,
    },
    games_summary_after: games_summary.rows[0],
  };
  console.log(JSON.stringify(artifact, null, 2));
  writeFileSync('/tmp/v14d/step2_v4e_artifact.json', JSON.stringify(artifact, null, 2));
  console.log('# artifact: /tmp/v14d/step2_v4e_artifact.json');
}

main()
  .catch((err) => { console.error('# ERROR:', err instanceof Error ? err.stack ?? err.message : String(err)); process.exit(1); })
  .finally(async () => { await pool.end(); });

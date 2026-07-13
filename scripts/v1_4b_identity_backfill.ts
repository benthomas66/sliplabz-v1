// V1-4b Stage 2 Phase A step A4 — season-to-date BDL identity backfill.
//
// Purpose: populate the HOSTED Supabase database with the WNBA identity
// records V1-4b Stage 2 Phase B will need in order to resolve provider
// events to internal games (see V1_4B_STAGE2_PHASE_A_REPORT.md §A2):
//
//   * teams + provider_teams (BDL)
//   * players + provider_players (BDL)
//   * games + provider_games (BDL, current season through today)
//   * bdl_ingestion_runs / bdl_raw_responses / bdl_import_watermarks
//   * event_reconciliation_queue / player_reconciliation_queue for
//     anything unresolvable through the V1-1 mapping layer
//
// V1-2 primitives used (NOT reimplemented):
//   - src/bdl/httpClient.ts   (bdlRequest + retained-headers policy)
//   - src/bdl/cursorPagination.ts (traverseCursor with exact cursor pass-through)
//   - src/bdl/ingestionRun.ts (openRun / closeRun)
//   - src/bdl/watermark.ts    (advanceWatermark: complete runs only)
//   - src/identity/nameNormalization.ts (normalizeName)
//
// Governor gates:
//   - Live BDL calls require BDL_LIVE_INVOKE=1 AND BALLDONTLIE_API_KEY set;
//     without both, the script exits early without touching the network or
//     the database.
//   - Writes go only to the HOSTED database via SLIPLABZ_HOSTED_DATABASE_URL.
//     No fallback to local for this script.
//   - Never prints the API key. Sanitized request params are stored in
//     bdl_ingestion_runs; the Authorization header is passed inline to
//     bdlRequest and never persisted anywhere.
//
// Cold-start policy (documented for the governor):
//   The internal identity tables (teams / players / games) are empty in a
//   fresh hosted project. V1-1 reconcileEvent (src/identity/eventReconciliation.ts)
//   presumes internal games ALREADY exist to reconcile against; it cannot
//   populate them. Per BDL sub-spec §10 (game-state authority) and §11
//   (team identity), BDL is authoritative for WNBA identity. This script
//   therefore creates internal identity rows directly from complete-run BDL
//   observations AND writes an `approved` provider_* mapping alongside,
//   with an audit row in mapping_history. When a BDL row is unresolvable
//   (missing required teams for a game, missing team-id-seen for a player,
//   etc.), a reconciliation-queue row is written instead — nothing is
//   guessed. Idempotent rerun is safe because:
//     * provider_* tables have UNIQUE (provider, provider_*_id);
//     * mapping_history is append-only per its migration;
//     * teams/players/games are keyed on provider IDs via provider_* mapping,
//       so re-observing a BDL row updates the existing internal identity's
//       raw_* + last_seen_at rather than minting a new row.
//   Partial traversals (any non-complete cursor result) NEVER touch teams /
//   players / games; only bdl_ingestion_runs + bdl_raw_responses record the
//   attempt. Only complete runs advance watermarks.

import { randomUUID } from 'node:crypto';
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
import { normalizeName } from '../src/identity/nameNormalization.js';
import type { BdlEndpoint } from '../src/shared/enums.js';

// --- Config ----------------------------------------------------------------

const CURRENT_SEASON = 2026;
const TODAY_YMD = new Date().toISOString().slice(0, 10);

const DB_URL = process.env['SLIPLABZ_HOSTED_DATABASE_URL'];
if (DB_URL === undefined || DB_URL === '') {
  console.error('SLIPLABZ_HOSTED_DATABASE_URL required (hosted DB only for A4)');
  process.exit(1);
}
const API_KEY = process.env['BALLDONTLIE_API_KEY'];
const LIVE_FLAG = process.env['BDL_LIVE_INVOKE'];
if (API_KEY === undefined || API_KEY === '' || LIVE_FLAG !== '1') {
  console.error(
    'BDL_LIVE_INVOKE=1 and BALLDONTLIE_API_KEY are both required. Aborting before any network or DB write.'
  );
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: DB_URL, max: 4 });

// --- HTTP config -----------------------------------------------------------

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

// --- BDL row shapes (only the fields we need) ------------------------------

interface BdlTeam {
  readonly id: number;
  readonly full_name?: string;
  readonly name?: string;
  readonly abbreviation?: string;
  readonly city?: string;
  readonly conference?: string | null;
}

interface BdlPlayer {
  readonly id: number;
  readonly first_name?: string;
  readonly last_name?: string;
  readonly team?: { readonly id: number } | null;
}

interface BdlGame {
  readonly id: number;
  /** BDL returns this as a full ISO-8601 UTC timestamp (e.g.
   *  "2026-05-08T23:30:00.000Z"), NOT a YYYY-MM-DD date. */
  readonly date?: string;
  readonly datetime?: string | null;
  readonly season: number;
  readonly postseason?: boolean;
  readonly status?: string;
  readonly home_team?: BdlTeam;
  readonly visitor_team?: BdlTeam;
}

// --- Auth header pass-through ---------------------------------------------

const authHeaders: Readonly<Record<string, string>> = Object.freeze({
  Authorization: API_KEY,
});

// --- Persistence helpers ---------------------------------------------------

async function insertBdlIngestionRunOpen(
  runId: string,
  endpoint: BdlEndpoint,
  scope: string,
  sanitizedParams: Record<string, unknown>,
  startedAt: string
): Promise<void> {
  await pool.query(
    `INSERT INTO bdl_ingestion_runs
       (bdl_ingestion_run_id, endpoint, request_params, query_scope_key,
        started_at, completion_state)
     VALUES ($1, $2, $3::jsonb, $4, $5, 'running')`,
    [runId, endpoint, JSON.stringify(sanitizedParams), scope, startedAt]
  );
}

async function closeBdlIngestionRun(
  runId: string,
  vals: {
    completedAt: string;
    pageCount: number;
    rowCount: number;
    cursorChainSent: ReadonlyArray<string | null>;
    cursorChainReturned: ReadonlyArray<string | null>;
    httpStatusLast: number | null;
    contentTypeLast: string | null;
    responseHeadersLast: Readonly<Record<string, string | number>>;
    completionState: string;
    failureDetail: string | null;
  }
): Promise<void> {
  await pool.query(
    `UPDATE bdl_ingestion_runs SET
        completed_at = $2,
        page_count = $3,
        row_count = $4,
        cursor_chain_sent = $5::jsonb,
        cursor_chain_returned = $6::jsonb,
        http_status_last = $7,
        content_type_last = $8,
        response_headers_last = $9::jsonb,
        completion_state = $10,
        failure_detail = $11,
        updated_at = now()
      WHERE bdl_ingestion_run_id = $1`,
    [
      runId,
      vals.completedAt,
      vals.pageCount,
      vals.rowCount,
      JSON.stringify(vals.cursorChainSent),
      JSON.stringify(vals.cursorChainReturned),
      vals.httpStatusLast,
      vals.contentTypeLast,
      JSON.stringify(vals.responseHeadersLast),
      vals.completionState,
      vals.failureDetail,
    ]
  );
}

async function insertRawResponsePage(
  runId: string,
  pageIndex: number,
  cursorUsed: string | null,
  cursorReturned: string | null,
  status: number,
  contentType: string | null,
  headers: Readonly<Record<string, string | number>>,
  body: unknown | null,
  bodyText: string | null,
  observedRowCount: number
): Promise<string> {
  const rid = randomUUID();
  await pool.query(
    `INSERT INTO bdl_raw_responses
       (raw_response_id, bdl_ingestion_run_id, page_index,
        cursor_used_to_fetch, cursor_returned_next, retrieved_at,
        http_status, content_type, response_headers, response_body,
        response_body_text, response_body_bytes, observed_row_count)
     VALUES ($1,$2,$3,$4,$5, now(), $6,$7,$8::jsonb,$9::jsonb,$10,$11,$12)`,
    [
      rid,
      runId,
      pageIndex,
      cursorUsed,
      cursorReturned,
      status,
      contentType,
      JSON.stringify(headers),
      body === null ? null : JSON.stringify(body),
      bodyText,
      bodyText?.length ?? null,
      observedRowCount,
    ]
  );
  return rid;
}

async function upsertWatermarkIfComplete(
  endpoint: BdlEndpoint,
  scope: string,
  completionState: string,
  runId: string,
  completedAt: string,
  pageCount: number,
  rowCount: number
): Promise<{ advanced: boolean; refusalReason: string | null }> {
  // Load current row (may be missing).
  const cur = await pool.query(
    `SELECT completed_at, completed_by_run_id, completed_row_count, completed_page_count
       FROM bdl_import_watermarks WHERE endpoint = $1 AND query_scope_key = $2`,
    [endpoint, scope]
  );
  const existing = (cur.rows[0] ?? null) as {
    completed_at: string | null;
    completed_by_run_id: string | null;
  } | null;
  const currentWatermark = {
    endpoint,
    query_scope_key: scope,
    completed_at: existing?.completed_at ?? null,
    completed_by_run_id: existing?.completed_by_run_id ?? null,
    completed_row_count: null,
    completed_page_count: null,
    previous_completed_at: null,
    previous_completed_by_run_id: null,
  };
  const closedRun = {
    bdl_ingestion_run_id: runId,
    endpoint,
    request_params: {},
    query_scope_key: scope,
    started_at: completedAt,
    completed_at: completedAt,
    page_count: pageCount,
    row_count: rowCount,
    cursor_chain_sent: [],
    cursor_chain_returned: [],
    http_status_last: 200,
    content_type_last: 'application/json',
    response_headers_last: {},
    completion_state: completionState as 'complete' | 'partial_pagination',
    failure_detail: null,
    normalization_version: 1,
  } as const;
  const decision = advanceWatermark(currentWatermark, closedRun);
  if (!decision.advanced) {
    return { advanced: false, refusalReason: decision.refusal_reason };
  }
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
         completed_at = $3,
         completed_by_run_id = $4,
         completed_row_count = $5,
         completed_page_count = $6,
         updated_at = now()
       WHERE endpoint = $1 AND query_scope_key = $2`,
      [endpoint, scope, completedAt, runId, rowCount, pageCount]
    );
  }
  return { advanced: true, refusalReason: null };
}

async function appendMappingHistory(
  provider: 'balldontlie',
  entityKind: 'team' | 'player' | 'game',
  providerEntityId: string,
  internalEntityId: string | null,
  priorInternalEntityId: string | null,
  action: 'proposed' | 'approved',
  reason: string
): Promise<void> {
  await pool.query(
    `INSERT INTO mapping_history
       (provider, entity_kind, provider_entity_id, internal_entity_id,
        prior_internal_entity_id, action, reason, actor)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'v1_4b_identity_backfill')`,
    [provider, entityKind, providerEntityId, internalEntityId, priorInternalEntityId, action, reason]
  );
}

// --- Team upsert -----------------------------------------------------------

interface TeamUpsertResult {
  readonly created: number;
  readonly updated: number;
  readonly providerMappingsCreated: number;
  readonly pendingReview: number;
}

async function upsertTeamsFromBdl(rows: ReadonlyArray<BdlTeam>): Promise<TeamUpsertResult> {
  let created = 0;
  let updated = 0;
  let providerMappingsCreated = 0;
  let pendingReview = 0;

  const client = await pool.connect();
  try {
    for (const t of rows) {
      await client.query('BEGIN');
      const providerTeamId = String(t.id);
      const existing = await client.query(
        `SELECT provider_team_row_id, internal_team_id, mapping_state
           FROM provider_teams WHERE provider = 'balldontlie' AND provider_team_id = $1`,
        [providerTeamId]
      );
      if (existing.rowCount === 0) {
        // The internal teams table CHECKs abbreviation length BETWEEN 1 AND 6.
        // Some BDL teams (WNBA All-Stars, national teams) exceed that limit.
        // Rather than truncate (fidelity loss) or relax the CHECK (migration
        // scope creep + governor-forbidden), register the provider row with
        // mapping_state='pending_review' and no internal team. A governor can
        // approve later; the raw payload is retained.
        const abbr = t.abbreviation ?? '';
        const canAutoApprove = abbr.length >= 1 && abbr.length <= 6;
        if (!canAutoApprove) {
          await client.query(
            `INSERT INTO provider_teams
               (provider, provider_team_id, internal_team_id,
                raw_full_name, raw_name, raw_abbreviation, raw_city, raw_conference,
                classification, mapping_state, content_hash)
             VALUES ('balldontlie',$1,NULL,$2,$3,$4,$5,$6,'unknown','pending_review',$7)`,
            [
              providerTeamId,
              t.full_name ?? '',
              t.name ?? '',
              abbr,
              t.city ?? '',
              t.conference ?? null,
              hashRow(t),
            ]
          );
          await appendMappingHistoryTx(
            client,
            'balldontlie',
            'team',
            providerTeamId,
            null,
            null,
            'proposed',
            `bdl_abbreviation_len=${abbr.length}_exceeds_internal_max`
          );
          pendingReview += 1;
          providerMappingsCreated += 1;
          await client.query('COMMIT');
          continue;
        }
        // Cold-start: create internal team + approved provider mapping.
        const internalId = randomUUID();
        await client.query(
          `INSERT INTO teams
             (internal_team_id, display_name, abbreviation, classification, city, conference)
           VALUES ($1,$2,$3,'current_franchise',$4,$5)`,
          [
            internalId,
            t.full_name ?? t.name ?? `bdl_team_${providerTeamId}`,
            abbr,
            t.city ?? '',
            t.conference ?? null,
          ]
        );
        await client.query(
          `INSERT INTO provider_teams
             (provider, provider_team_id, internal_team_id,
              raw_full_name, raw_name, raw_abbreviation, raw_city, raw_conference,
              classification, mapping_state, content_hash)
           VALUES ('balldontlie',$1,$2,$3,$4,$5,$6,$7,'current_franchise','approved',$8)`,
          [
            providerTeamId,
            internalId,
            t.full_name ?? '',
            t.name ?? '',
            abbr,
            t.city ?? '',
            t.conference ?? null,
            hashRow(t),
          ]
        );
        await appendMappingHistoryTx(
          client,
          'balldontlie',
          'team',
          providerTeamId,
          internalId,
          null,
          'approved',
          'cold_start_from_bdl_authoritative_source'
        );
        created += 1;
        providerMappingsCreated += 1;
      } else {
        const row = existing.rows[0] as {
          provider_team_row_id: string;
          internal_team_id: string | null;
          mapping_state: string;
        };
        await client.query(
          `UPDATE provider_teams SET
             raw_full_name = $2,
             raw_name = $3,
             raw_abbreviation = $4,
             raw_city = $5,
             raw_conference = $6,
             last_seen_at = now(),
             content_hash = $7,
             updated_at = now()
           WHERE provider_team_row_id = $1`,
          [
            row.provider_team_row_id,
            t.full_name ?? '',
            t.name ?? '',
            t.abbreviation ?? '',
            t.city ?? '',
            t.conference ?? null,
            hashRow(t),
          ]
        );
        if (row.internal_team_id !== null) {
          await client.query(
            `UPDATE teams SET
               display_name = $2,
               abbreviation = $3,
               city = $4,
               conference = $5,
               updated_at = now()
             WHERE internal_team_id = $1`,
            [
              row.internal_team_id,
              t.full_name ?? t.name ?? `bdl_team_${providerTeamId}`,
              t.abbreviation ?? '',
              t.city ?? '',
              t.conference ?? null,
            ]
          );
        }
        updated += 1;
      }
      await client.query('COMMIT');
    }
  } finally {
    client.release();
  }
  return { created, updated, providerMappingsCreated, pendingReview };
}

async function appendMappingHistoryTx(
  client: pg.PoolClient,
  provider: 'balldontlie',
  entityKind: 'team' | 'player' | 'game',
  providerEntityId: string,
  internalEntityId: string | null,
  priorInternalEntityId: string | null,
  action: 'proposed' | 'approved',
  reason: string
): Promise<void> {
  await client.query(
    `INSERT INTO mapping_history
       (provider, entity_kind, provider_entity_id, internal_entity_id,
        prior_internal_entity_id, action, reason, actor)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'v1_4b_identity_backfill')`,
    [provider, entityKind, providerEntityId, internalEntityId, priorInternalEntityId, action, reason]
  );
}

// --- Player upsert ---------------------------------------------------------

interface PlayerUpsertResult {
  readonly created: number;
  readonly updated: number;
  readonly providerMappingsCreated: number;
  readonly queued: number;
}

async function upsertPlayersFromBdl(rows: ReadonlyArray<BdlPlayer>): Promise<PlayerUpsertResult> {
  let created = 0;
  let updated = 0;
  let providerMappingsCreated = 0;
  let queued = 0;

  const client = await pool.connect();
  try {
    for (const p of rows) {
      await client.query('BEGIN');
      const providerPlayerId = String(p.id);
      const fullName = `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim();
      const norm = normalizeName(fullName);
      const providerTeamIdSeen = p.team?.id !== undefined ? String(p.team.id) : null;

      // Resolve provider_team_id -> internal_team_id.
      let internalTeamId: string | null = null;
      if (providerTeamIdSeen !== null) {
        const teamMap = await client.query(
          `SELECT internal_team_id FROM provider_teams
             WHERE provider = 'balldontlie' AND provider_team_id = $1 AND mapping_state = 'approved'`,
          [providerTeamIdSeen]
        );
        internalTeamId = (teamMap.rows[0] as { internal_team_id: string } | undefined)?.internal_team_id ?? null;
      }

      const existing = await client.query(
        `SELECT provider_player_row_id, internal_player_id
           FROM provider_players WHERE provider = 'balldontlie' AND provider_player_id = $1`,
        [providerPlayerId]
      );

      if (existing.rowCount === 0) {
        if (fullName === '' || norm === '') {
          // Cannot construct even a candidate — queue.
          await client.query(
            `INSERT INTO player_reconciliation_queue
               (provider, provider_player_id, raw_first_name, raw_last_name,
                raw_full_name, normalized_name, provider_team_id_seen,
                candidate_internal_player_ids, reason, reason_detail)
             VALUES ('balldontlie',$1,$2,$3,$4,$5,$6, ARRAY[]::uuid[],
                     'normalized_name_only',
                     'empty display name from BDL row')`,
            [providerPlayerId, p.first_name ?? '', p.last_name ?? '', fullName, norm, providerTeamIdSeen]
          );
          queued += 1;
          await client.query('COMMIT');
          continue;
        }
        if (providerTeamIdSeen !== null && internalTeamId === null) {
          // Team not mapped (should not happen because team upsert ran first,
          // but a BDL player might reference an unknown-to-us team id). Queue.
          await client.query(
            `INSERT INTO player_reconciliation_queue
               (provider, provider_player_id, raw_first_name, raw_last_name,
                raw_full_name, normalized_name, provider_team_id_seen,
                candidate_internal_player_ids, reason, reason_detail)
             VALUES ('balldontlie',$1,$2,$3,$4,$5,$6, ARRAY[]::uuid[],
                     'missing_team_context',
                     'BDL provider_team_id not mapped to any internal team')`,
            [providerPlayerId, p.first_name ?? '', p.last_name ?? '', fullName, norm, providerTeamIdSeen]
          );
          queued += 1;
          await client.query('COMMIT');
          continue;
        }
        const internalPlayerId = randomUUID();
        await client.query(
          `INSERT INTO players
             (internal_player_id, display_name, normalized_name, current_team_id, status)
           VALUES ($1,$2,$3,$4,'active_confirmed')`,
          [internalPlayerId, fullName, norm, internalTeamId]
        );
        await client.query(
          `INSERT INTO provider_players
             (provider, provider_player_id, internal_player_id,
              raw_first_name, raw_last_name, raw_full_name, normalized_name,
              provider_team_id_seen, mapping_state, content_hash)
           VALUES ('balldontlie',$1,$2,$3,$4,$5,$6,$7,'approved',$8)`,
          [
            providerPlayerId,
            internalPlayerId,
            p.first_name ?? '',
            p.last_name ?? '',
            fullName,
            norm,
            providerTeamIdSeen,
            hashRow(p),
          ]
        );
        await appendMappingHistoryTx(
          client,
          'balldontlie',
          'player',
          providerPlayerId,
          internalPlayerId,
          null,
          'approved',
          'cold_start_from_bdl_authoritative_source'
        );
        created += 1;
        providerMappingsCreated += 1;
      } else {
        const row = existing.rows[0] as {
          provider_player_row_id: string;
          internal_player_id: string | null;
        };
        await client.query(
          `UPDATE provider_players SET
             raw_first_name = $2,
             raw_last_name = $3,
             raw_full_name = $4,
             normalized_name = $5,
             provider_team_id_seen = $6,
             last_seen_at = now(),
             content_hash = $7,
             updated_at = now()
           WHERE provider_player_row_id = $1`,
          [
            row.provider_player_row_id,
            p.first_name ?? '',
            p.last_name ?? '',
            fullName,
            norm,
            providerTeamIdSeen,
            hashRow(p),
          ]
        );
        if (row.internal_player_id !== null) {
          await client.query(
            `UPDATE players SET
               display_name = $2,
               normalized_name = $3,
               current_team_id = COALESCE($4, current_team_id),
               updated_at = now()
             WHERE internal_player_id = $1`,
            [row.internal_player_id, fullName, norm, internalTeamId]
          );
        }
        updated += 1;
      }
      await client.query('COMMIT');
    }
  } finally {
    client.release();
  }
  return { created, updated, providerMappingsCreated, queued };
}

// --- Game upsert -----------------------------------------------------------

interface GameUpsertResult {
  readonly created: number;
  readonly updated: number;
  readonly providerMappingsCreated: number;
  readonly queued: number;
  readonly skippedFutureDated: number;
}

function bdlStatusToInternal(s: string | undefined): 'scheduled' | 'live' | 'final' | 'unresolved' {
  if (s === undefined) return 'unresolved';
  const low = s.toLowerCase();
  // BDL WNBA game.status observed values: 'post' (played through) and 'pre'
  // (pregame). Older code paths and other sports use 'Final' / 'scheduled';
  // handle both for defensive robustness.
  if (low === 'post' || low === 'final' || low.startsWith('final')) return 'final';
  if (low === 'in progress' || low === 'live') return 'live';
  if (low === 'pre' || low === 'scheduled') return 'scheduled';
  if (/\d/.test(low)) return 'scheduled'; // pregame tipoff time as status string
  return 'unresolved';
}

async function upsertGamesFromBdl(rows: ReadonlyArray<BdlGame>): Promise<GameUpsertResult> {
  let created = 0;
  let updated = 0;
  let providerMappingsCreated = 0;
  let queued = 0;
  let skippedFutureDated = 0;

  const client = await pool.connect();
  try {
    for (const g of rows) {
      // "Season to date" — skip games whose date is strictly after today.
      // BDL's `date` is a full ISO UTC timestamp; extract the YYYY-MM-DD
      // prefix for the comparison.
      const g_ymd = g.date !== undefined ? g.date.slice(0, 10) : null;
      if (g_ymd !== null && g_ymd > TODAY_YMD) {
        skippedFutureDated += 1;
        continue;
      }
      await client.query('BEGIN');
      const providerGameId = String(g.id);
      const homeProvId = g.home_team?.id !== undefined ? String(g.home_team.id) : null;
      const awayProvId = g.visitor_team?.id !== undefined ? String(g.visitor_team.id) : null;
      const rawHome = g.home_team?.full_name ?? g.home_team?.name ?? '';
      const rawAway = g.visitor_team?.full_name ?? g.visitor_team?.name ?? '';
      // BDL's `date` is already a full ISO UTC timestamp. Use it directly.
      const rawCommence = g.datetime ?? g.date ?? null;

      // Resolve teams.
      let homeInternal: string | null = null;
      let awayInternal: string | null = null;
      if (homeProvId !== null) {
        const r = await client.query(
          `SELECT internal_team_id FROM provider_teams
             WHERE provider = 'balldontlie' AND provider_team_id = $1 AND mapping_state = 'approved'`,
          [homeProvId]
        );
        homeInternal = (r.rows[0] as { internal_team_id: string } | undefined)?.internal_team_id ?? null;
      }
      if (awayProvId !== null) {
        const r = await client.query(
          `SELECT internal_team_id FROM provider_teams
             WHERE provider = 'balldontlie' AND provider_team_id = $1 AND mapping_state = 'approved'`,
          [awayProvId]
        );
        awayInternal = (r.rows[0] as { internal_team_id: string } | undefined)?.internal_team_id ?? null;
      }

      const existing = await client.query(
        `SELECT provider_game_row_id, internal_game_id
           FROM provider_games WHERE provider = 'balldontlie' AND provider_game_id = $1`,
        [providerGameId]
      );

      if (homeInternal === null || awayInternal === null || homeInternal === awayInternal) {
        // Cannot mint a games row without both team FKs — queue.
        // Idempotency: if this provider_game_id already queued as unmatched, skip re-queue.
        const dupQueue = await client.query(
          `SELECT 1 FROM event_reconciliation_queue
             WHERE provider = 'balldontlie' AND provider_game_id = $1 AND resolution = 'open'`,
          [providerGameId]
        );
        if (dupQueue.rowCount === 0) {
          await client.query(
            `INSERT INTO event_reconciliation_queue
               (provider, provider_game_id, provider_game_row_id,
                raw_home_team, raw_away_team, raw_commence_time,
                candidate_internal_game_ids, reason, reason_detail)
             VALUES ('balldontlie',$1,NULL,$2,$3,$4, ARRAY[]::uuid[],
                     'unresolved_provider_team',
                     $5)`,
            [
              providerGameId,
              rawHome,
              rawAway,
              rawCommence,
              `home_provider_team=${homeProvId ?? 'null'}(internal=${homeInternal ?? 'null'}) away_provider_team=${awayProvId ?? 'null'}(internal=${awayInternal ?? 'null'}) self_match=${homeInternal !== null && homeInternal === awayInternal}`,
            ]
          );
          queued += 1;
        }
        await client.query('COMMIT');
        continue;
      }

      if (existing.rowCount === 0) {
        const internalGameId = randomUUID();
        const seasonType = g.postseason === true ? 3 : 2;
        const scheduledStartUtc = g.datetime ?? g.date ?? `${TODAY_YMD}T00:00:00Z`;
        const status = bdlStatusToInternal(g.status);
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
        await appendMappingHistoryTx(
          client,
          'balldontlie',
          'game',
          providerGameId,
          internalGameId,
          null,
          'approved',
          'cold_start_from_bdl_authoritative_source'
        );
        created += 1;
        providerMappingsCreated += 1;
      } else {
        const row = existing.rows[0] as {
          provider_game_row_id: string;
          internal_game_id: string | null;
        };
        await client.query(
          `UPDATE provider_games SET
             raw_home_team = $2,
             raw_away_team = $3,
             raw_commence_time = $4,
             last_seen_at = now(),
             content_hash = $5,
             updated_at = now()
           WHERE provider_game_row_id = $1`,
          [row.provider_game_row_id, rawHome, rawAway, rawCommence, hashRow(g)]
        );
        if (row.internal_game_id !== null) {
          const status = bdlStatusToInternal(g.status);
          const scheduledStartUtc = g.datetime ?? g.date ?? null;
          await client.query(
            `UPDATE games SET
               status = $2,
               scheduled_start_utc = COALESCE($3::timestamptz, scheduled_start_utc),
               updated_at = now()
             WHERE internal_game_id = $1`,
            [row.internal_game_id, status, scheduledStartUtc]
          );
        }
        updated += 1;
      }
      await client.query('COMMIT');
    }
  } finally {
    client.release();
  }
  return { created, updated, providerMappingsCreated, queued, skippedFutureDated };
}

function hashRow(v: unknown): string {
  // Simple stable content hash; sufficient for change-detection.
  const json = JSON.stringify(v);
  let h = 0;
  for (let i = 0; i < json.length; i += 1) h = (h * 31 + json.charCodeAt(i)) | 0;
  return `bdl_${h.toString(16)}`;
}

// --- Per-endpoint driver ---------------------------------------------------

async function runEndpoint<T>(args: {
  endpoint: BdlEndpoint;
  scope: string;
  sanitizedParams: Record<string, unknown>;
  extraQueryParams?: Record<string, string | number | ReadonlyArray<string | number>>;
  parseRows: (body: unknown) => ReadonlyArray<T>;
  persist: (rows: ReadonlyArray<T>) => Promise<Record<string, number>>;
}): Promise<{
  runId: string;
  completionState: string;
  rowCount: number;
  pageCount: number;
  watermark: { advanced: boolean; refusalReason: string | null };
  persistCounts: Record<string, number>;
}> {
  const runId = randomUUID();
  const startedAt = new Date().toISOString();
  await insertBdlIngestionRunOpen(runId, args.endpoint, args.scope, args.sanitizedParams, startedAt);
  const openRunState = openRun({
    bdl_ingestion_run_id: runId,
    endpoint: args.endpoint,
    request_params: args.sanitizedParams,
    query_scope_key: args.scope,
    started_at: startedAt,
  });

  const collectedRows: T[] = [];

  const fetcher: PageFetcher<T> = async (cursor, pageIndex) => {
    const result = await bdlRequest(
      httpConfig,
      {
        endpoint: args.endpoint,
        params: {
          per_page: 100,
          ...(args.extraQueryParams ?? {}),
        },
        cursor,
      },
      authHeaders
    );
    const bodyJson = result.body_json;
    if (result.status < 200 || result.status >= 300 || result.parse_state !== 'json_ok' || bodyJson === null) {
      const detail = `HTTP ${result.status} parse=${result.parse_state}`;
      await insertRawResponsePage(
        runId, pageIndex, cursor, null,
        result.status, result.content_type, result.headers, null, result.body_text, 0
      );
      const errKind = result.failure_kind ?? 'failed_transport';
      return {
        ok: false as const,
        error: {
          kind: errKind,
          detail,
          http_status: result.status,
          content_type: result.content_type,
          response_headers: result.headers,
          raw_body_text: result.body_text,
        },
      };
    }
    const meta = ((bodyJson as { meta?: { next_cursor?: string | null } }).meta ?? {}) as {
      next_cursor?: string | null;
    };
    const data = args.parseRows(bodyJson);
    const rawResponseId = await insertRawResponsePage(
      runId, pageIndex, cursor,
      meta.next_cursor ?? null,
      result.status, result.content_type, result.headers,
      bodyJson, null, data.length
    );
    collectedRows.push(...data);
    return {
      ok: true as const,
      page: {
        response: {
          data,
          meta: { next_cursor: meta.next_cursor ?? null },
        },
        raw: {
          raw_response_id: rawResponseId,
          bdl_ingestion_run_id: runId,
          page_index: pageIndex,
          cursor_used_to_fetch: cursor,
          cursor_returned_next: meta.next_cursor ?? null,
          retrieved_at: new Date().toISOString(),
          http_status: result.status,
          content_type: result.content_type,
          response_headers: result.headers,
          response_body: bodyJson,
          response_body_text: null,
          response_body_bytes: result.body_text.length,
          observed_row_count: data.length,
        },
      },
    };
  };

  const traversal = await traverseCursor<T>(fetcher);
  const completedAt = new Date().toISOString();
  const closedRunState = closeRun({
    open: openRunState,
    completed_at: completedAt,
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
  await closeBdlIngestionRun(runId, {
    completedAt: closedRunState.completed_at,
    pageCount: closedRunState.page_count,
    rowCount: closedRunState.row_count,
    cursorChainSent: closedRunState.cursor_chain_sent,
    cursorChainReturned: closedRunState.cursor_chain_returned,
    httpStatusLast: closedRunState.http_status_last,
    contentTypeLast: closedRunState.content_type_last,
    responseHeadersLast: closedRunState.response_headers_last,
    completionState: closedRunState.completion_state,
    failureDetail: closedRunState.failure_detail,
  });

  const persistCounts = closedRunState.completion_state === 'complete'
    ? await args.persist(collectedRows)
    : {};

  const wmResult = await upsertWatermarkIfComplete(
    args.endpoint,
    args.scope,
    closedRunState.completion_state,
    runId,
    closedRunState.completed_at,
    closedRunState.page_count,
    closedRunState.row_count
  );

  return {
    runId,
    completionState: closedRunState.completion_state,
    rowCount: closedRunState.row_count,
    pageCount: closedRunState.page_count,
    watermark: { advanced: wmResult.advanced, refusalReason: wmResult.refusalReason },
    persistCounts,
  };
}

function parseTeams(body: unknown): ReadonlyArray<BdlTeam> {
  const arr = (body as { data?: unknown[] }).data ?? [];
  return arr as BdlTeam[];
}
function parsePlayers(body: unknown): ReadonlyArray<BdlPlayer> {
  const arr = (body as { data?: unknown[] }).data ?? [];
  return arr as BdlPlayer[];
}
function parseGames(body: unknown): ReadonlyArray<BdlGame> {
  const arr = (body as { data?: unknown[] }).data ?? [];
  return arr as BdlGame[];
}

// --- Orchestration ---------------------------------------------------------

async function main(): Promise<void> {
  console.log(`# V1-4b identity backfill starting`);
  console.log(`#   hosted DB target: ${DB_URL!.replace(/:[^:@]+@/, ':REDACTED@')}`);
  console.log(`#   current season:  ${CURRENT_SEASON}`);
  console.log(`#   today (UTC ymd): ${TODAY_YMD}`);

  const teamsResult = await runEndpoint<BdlTeam>({
    endpoint: 'teams',
    scope: 'all',
    sanitizedParams: {},
    parseRows: parseTeams,
    persist: async (rows) => {
      const r = await upsertTeamsFromBdl(rows);
      return {
        created: r.created,
        updated: r.updated,
        provider_mappings_created: r.providerMappingsCreated,
        pending_review: r.pendingReview,
      };
    },
  });
  console.log(`teams:   ${JSON.stringify(teamsResult, null, 0)}`);

  const playersResult = await runEndpoint<BdlPlayer>({
    endpoint: 'players',
    scope: 'all',
    sanitizedParams: {},
    parseRows: parsePlayers,
    persist: async (rows) => {
      const r = await upsertPlayersFromBdl(rows);
      return {
        created: r.created,
        updated: r.updated,
        provider_mappings_created: r.providerMappingsCreated,
        queued: r.queued,
      };
    },
  });
  console.log(`players: ${JSON.stringify(playersResult, null, 0)}`);

  const gamesResult = await runEndpoint<BdlGame>({
    endpoint: 'games',
    scope: `season=${CURRENT_SEASON}`,
    sanitizedParams: { 'seasons[]': [CURRENT_SEASON] },
    extraQueryParams: { 'seasons[]': [CURRENT_SEASON] },
    parseRows: parseGames,
    persist: async (rows) => {
      const r = await upsertGamesFromBdl(rows);
      return {
        created: r.created,
        updated: r.updated,
        provider_mappings_created: r.providerMappingsCreated,
        queued: r.queued,
        skipped_future_dated: r.skippedFutureDated,
      };
    },
  });
  console.log(`games:   ${JSON.stringify(gamesResult, null, 0)}`);

  // Aggregate summary.
  const [teamCount, playerCount, gameCount, providerTeamCount, providerPlayerCount, providerGameCount, eventQueue, playerQueue] = await Promise.all([
    pool.query(`SELECT count(*)::int AS n FROM teams`),
    pool.query(`SELECT count(*)::int AS n FROM players`),
    pool.query(`SELECT count(*)::int AS n FROM games`),
    pool.query(`SELECT count(*)::int AS n FROM provider_teams WHERE provider='balldontlie'`),
    pool.query(`SELECT count(*)::int AS n FROM provider_players WHERE provider='balldontlie'`),
    pool.query(`SELECT count(*)::int AS n FROM provider_games WHERE provider='balldontlie'`),
    pool.query(`SELECT count(*)::int AS n FROM event_reconciliation_queue WHERE resolution='open'`),
    pool.query(`SELECT count(*)::int AS n FROM player_reconciliation_queue WHERE resolution='open'`),
  ]);
  const watermarks = await pool.query(`SELECT endpoint, query_scope_key, completed_at, completed_row_count, completed_page_count FROM bdl_import_watermarks ORDER BY endpoint`);

  console.log('\n===== SUMMARY =====');
  console.log(JSON.stringify({
    teams: (teamCount.rows[0] as { n: number }).n,
    players: (playerCount.rows[0] as { n: number }).n,
    games: (gameCount.rows[0] as { n: number }).n,
    provider_teams_bdl: (providerTeamCount.rows[0] as { n: number }).n,
    provider_players_bdl: (providerPlayerCount.rows[0] as { n: number }).n,
    provider_games_bdl: (providerGameCount.rows[0] as { n: number }).n,
    event_queue_open: (eventQueue.rows[0] as { n: number }).n,
    player_queue_open: (playerQueue.rows[0] as { n: number }).n,
  }, null, 2));
  console.log('\n===== WATERMARKS =====');
  console.log(JSON.stringify(watermarks.rows, null, 2));
}

main()
  .catch((e) => {
    console.error('# backfill failed:', e);
    process.exitCode = 1;
  })
  .finally(() => pool.end());

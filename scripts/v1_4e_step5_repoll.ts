// V1-4e STEP 5 — bounded re-poll of the 5 (now-resolvable) upcoming events.
//
// Owner-authorized single bounded poll. HARD ceiling: 25 credits.
// Uses V1-4d Step-2's CORRECTED patterns:
//   * openPool (not bare pg.Client)  — fixes persistOddsapiSnapshot's pool contract.
//   * market.last_update with bookmaker.last_update fallback — fixes freshness.

import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { openPool } from '../src/db/connection.js';
import type { SliplabzPool } from '../src/db/connection.js';
import { buildLiveOddsapiConfig } from '../src/lines/liveInvokeGate.js';
import { oddsapiRequest } from '../src/odds/httpClient.js';
import { validateEventDiscoveryResponse } from '../src/odds/eventDiscovery.js';
import { classifyPollResult } from '../src/odds/pollResult.js';
import { classifyFreshness } from '../src/odds/freshness.js';
import {
  V1_CONSENSUS_SPORTSBOOK_KEYS,
  isAllowlistedBookmakerKey,
  sourceClassForBookmakerKey,
} from '../src/odds/bookmakerAllowlist.js';
import { LAUNCH_MARKET_KEYS, isLaunchMarketKey } from '../src/odds/marketKeys.js';
import { normalizeOutcome } from '../src/odds/normalizeOutcome.js';
import { collapseOutcomes } from '../src/odds/duplicateCollapse.js';
import {
  loadSeedResolutionContext,
  resolveOddsapiEventForSeed,
  persistSeedEventResolution,
} from '../src/seed/orchestrator/eventResolutionForSeed.js';
import { persistOddsapiSnapshot } from '../src/lines/orchestrator/persistOddsapiSnapshot.js';
import type { EventReconciliationInput } from '../src/identity/types.js';

const SPORT_KEY = 'basketball_wnba';
const HARD_CREDIT_CEILING = 25;
const MAX_EVENTS = 5;

function normName(s: string): string {
  return s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[’'‘′\-‐‑‒–—_.,]+/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

async function main(): Promise<void> {
  const api_key = process.env['ODDS_API_KEY'];
  const hosted_url = process.env['SLIPLABZ_HOSTED_DATABASE_URL'];
  if (!api_key || !hosted_url) { console.error('# ERROR: env missing'); process.exit(2); }

  const http_cfg = buildLiveOddsapiConfig({ allow_live_invoke: true });

  // Free events discovery.
  const disc_started = new Date().toISOString();
  const disc = await oddsapiRequest(http_cfg, {
    path: `/v4/sports/${SPORT_KEY}/events`, query: {}, api_key,
  });
  const disc_x_used = typeof disc.headers['x-requests-used'] === 'number' ? disc.headers['x-requests-used'] as number : null;
  const disc_x_rem  = typeof disc.headers['x-requests-remaining'] === 'number' ? disc.headers['x-requests-remaining'] as number : null;
  const disc_x_last = typeof disc.headers['x-requests-last'] === 'number' ? disc.headers['x-requests-last'] as number : 0;
  const ledger: any[] = [{
    at: disc_started, endpoint: 'events', provider_event_id: null, http_status: disc.status,
    x_requests_used_before: null, x_requests_used_after: disc_x_used,
    x_requests_remaining_after: disc_x_rem, x_requests_last: disc_x_last,
    running_total_this_call: 0,
  }];
  if (disc.status !== 200 || disc.body_json === null) { console.error('# HALT: discovery failed'); process.exit(3); }
  const validation = validateEventDiscoveryResponse(disc.body_json as any[]);
  const now_ms = Date.now();
  const events = validation.valid_events
    .map((e) => ({
      provider_event_id: e.provider_event_id,
      commence_time: e.raw_commence_time,
      home_team: e.raw_home_team,
      away_team: e.raw_away_team,
    }))
    .filter((e) => Date.parse(e.commence_time) >= now_ms)
    .sort((a, b) => Date.parse(a.commence_time) - Date.parse(b.commence_time))
    .slice(0, MAX_EVENTS);
  console.log(`# events to re-poll: ${events.length}`);

  // Resolve (should all succeed now via STEP 2 + STEP 3).
  const resolve_pool = openPool({
    connectionString: hosted_url, max: 1, statement_timeout_ms: 30_000,
    ssl: hosted_url.includes('supabase.') ? 'require' : 'disable',
  });
  const resolutions = new Map<string, string | null>();
  const player_map = new Map<string, string>();
  try {
    for (const ev of events) {
      const ctx = await loadSeedResolutionContext(resolve_pool, {
        provider: 'odds_api', raw_commence_time_utc: ev.commence_time,
      });
      const input: EventReconciliationInput = {
        provider: 'odds_api', provider_game_id: ev.provider_event_id,
        raw_home_team: ev.home_team, raw_away_team: ev.away_team, raw_commence_time: ev.commence_time,
      };
      const outcome = resolveOddsapiEventForSeed(input, ctx);
      await persistSeedEventResolution(resolve_pool, input, outcome);
      resolutions.set(ev.provider_event_id, outcome.kind === 'queued' ? null : outcome.internal_game_id);
      console.log(`  ${ev.provider_event_id.slice(0,8)}… → ${outcome.kind}${outcome.kind !== 'queued' ? ` → ${outcome.internal_game_id.slice(0,8)}…` : ''}`);
    }
    const r = await resolve_pool.query(`SELECT internal_player_id, display_name, normalized_name FROM players`);
    for (const row of r.rows as Array<{ internal_player_id: string; display_name: string; normalized_name: string }>) {
      player_map.set(normName(row.display_name), row.internal_player_id);
      if (row.normalized_name !== '') player_map.set(row.normalized_name, row.internal_player_id);
    }
  } finally { await resolve_pool.end(); }
  console.log(`# player_map size: ${player_map.size}`);

  // Bounded per-event polling.
  const per_event: any[] = [];
  let ticket_running = 0;
  for (let i = 0; i < events.length; i += 1) {
    const ev = events[i]!;
    const gid = resolutions.get(ev.provider_event_id) ?? null;
    if (ticket_running + 4 > HARD_CREDIT_CEILING) {
      console.error(`# HALT: ceiling would be exceeded before event ${i+1}`);
      break;
    }
    const req_started_at = new Date().toISOString();
    const odds = await oddsapiRequest(http_cfg, {
      path: `/v4/sports/${SPORT_KEY}/events/${ev.provider_event_id}/odds`,
      query: {
        markets: LAUNCH_MARKET_KEYS as unknown as ReadonlyArray<string>,
        bookmakers: V1_CONSENSUS_SPORTSBOOK_KEYS,
        oddsFormat: 'american',
      },
      api_key,
    });
    const x_used = typeof odds.headers['x-requests-used'] === 'number' ? odds.headers['x-requests-used'] as number : null;
    const x_rem  = typeof odds.headers['x-requests-remaining'] === 'number' ? odds.headers['x-requests-remaining'] as number : null;
    const x_last = typeof odds.headers['x-requests-last'] === 'number' ? odds.headers['x-requests-last'] as number : 0;
    ticket_running += x_last;
    ledger.push({
      at: req_started_at, endpoint: 'event_odds', provider_event_id: ev.provider_event_id,
      http_status: odds.status, x_requests_used_before: ledger[ledger.length-1].x_requests_used_after,
      x_requests_used_after: x_used, x_requests_remaining_after: x_rem, x_requests_last: x_last,
      running_total_this_call: ticket_running,
    });
    console.log(`# evt ${i+1}/${events.length} ${ev.provider_event_id.slice(0,8)}… HTTP ${odds.status} x-last=${x_last} running=${ticket_running}`);

    const classification = classifyPollResult({
      http_status: odds.status, content_type: odds.content_type,
      parsed_body: odds.body_json, transport_error_detail: null,
    });
    const report: any = {
      provider_event_id: ev.provider_event_id,
      matchup: `${ev.away_team} @ ${ev.home_team}`,
      linked_internal_game_id: gid,
      poll_result_state: classification.result_state,
      snapshots_written: 0,
      offerings_summary: [],
    };
    if (classification.result_state !== 'complete' && classification.result_state !== 'successful_empty') {
      per_event.push(report);
      continue;
    }

    const body = odds.body_json as any;
    const bookmakers = Array.isArray(body?.bookmakers) ? body.bookmakers : [];
    const write_pool: SliplabzPool = openPool({
      connectionString: hosted_url, max: 1, statement_timeout_ms: 30_000,
      ssl: hosted_url.includes('supabase.') ? 'require' : 'disable',
    });
    try {
      const observed_at = new Date().toISOString();
      for (const bm of bookmakers) {
        const bkey = String(bm.key ?? '');
        if (!isAllowlistedBookmakerKey(bkey)) continue;
        if (sourceClassForBookmakerKey(bkey) !== 'sportsbook') continue;
        const bm_title = String(bm.title ?? bkey);
        const bm_last = typeof bm.last_update === 'string' ? bm.last_update : null;
        const markets_arr = Array.isArray(bm.markets) ? bm.markets : [];
        for (const m of markets_arr) {
          const mkey = String(m.key ?? '');
          if (!isLaunchMarketKey(mkey)) continue;
          const provider_last_update = typeof m.last_update === 'string' ? m.last_update : bm_last;
          const outcomes_arr = Array.isArray(m.outcomes) ? m.outcomes : [];

          const raw_rows_for_persist: any[] = [];
          const collapse_input: any[] = [];
          const q_indexes = new Set<number>();
          for (let k = 0; k < outcomes_arr.length; k += 1) {
            const raw = outcomes_arr[k] as Record<string, unknown>;
            const nr = normalizeOutcome(raw, 'sportsbook_american');
            if (!nr.ok) {
              q_indexes.add(k);
              raw_rows_for_persist.push({
                raw_row_index: k,
                raw_name: String(raw['name'] ?? ''),
                raw_description: String(raw['description'] ?? ''),
                raw_price: typeof raw['price'] === 'number' ? raw['price'] as number : null,
                raw_point: typeof raw['point'] === 'number' ? raw['point'] as number : null,
                raw_multiplier: typeof raw['multiplier'] === 'number' ? raw['multiplier'] as number : null,
                raw_payload: raw, disposition: 'quarantined', canonical_offering_index: null, observed_at,
              });
              continue;
            }
            collapse_input.push({ raw_row_index: k, outcome: nr.outcome });
          }
          if (collapse_input.length === 0 && q_indexes.size === 0) continue;

          const collapse = collapseOutcomes(
            collapse_input.map(({ raw_row_index, outcome }: any) => ({ raw_row_index, outcome })),
            {
              provider_event_id: ev.provider_event_id, bookmaker_key: bkey, market_key: mkey,
              provider_last_update, promotion_type: 'unknown',
            }
          );
          const canonical_ids: string[] = collapse.offerings.map(() => randomUUID());
          const rIdxToCanIdx = new Map<number, number>();
          for (let ci = 0; ci < collapse.offerings.length; ci += 1) {
            for (const ri of collapse.offerings[ci]!.contributing_raw_row_indexes) rIdxToCanIdx.set(ri, ci);
          }
          const seen = new Map<number, boolean>();
          for (let k = 0; k < outcomes_arr.length; k += 1) {
            if (q_indexes.has(k)) continue;
            const raw = outcomes_arr[k] as Record<string, unknown>;
            if (collapse.quarantined_raw_row_indexes.has(k)) {
              raw_rows_for_persist.push({
                raw_row_index: k, raw_name: String(raw['name'] ?? ''),
                raw_description: String(raw['description'] ?? ''),
                raw_price: typeof raw['price'] === 'number' ? raw['price'] as number : null,
                raw_point: typeof raw['point'] === 'number' ? raw['point'] as number : null,
                raw_multiplier: typeof raw['multiplier'] === 'number' ? raw['multiplier'] as number : null,
                raw_payload: raw, disposition: 'quarantined', canonical_offering_index: null, observed_at,
              });
              continue;
            }
            const ci = rIdxToCanIdx.get(k);
            if (ci === undefined) continue;
            const isFirst = !seen.has(ci); seen.set(ci, true);
            raw_rows_for_persist.push({
              raw_row_index: k, raw_name: String(raw['name'] ?? ''),
              raw_description: String(raw['description'] ?? ''),
              raw_price: typeof raw['price'] === 'number' ? raw['price'] as number : null,
              raw_point: typeof raw['point'] === 'number' ? raw['point'] as number : null,
              raw_multiplier: typeof raw['multiplier'] === 'number' ? raw['multiplier'] as number : null,
              raw_payload: raw, disposition: isFirst ? 'contributed' : 'duplicate',
              canonical_offering_index: ci, observed_at,
            });
          }
          const canonical_offerings = collapse.offerings.map((o, ci) => {
            const pid = player_map.get(o.normalized_player_name) ?? null;
            return {
              market_offering_id: canonical_ids[ci]!,
              raw_player_description: o.normalized_player_name,
              normalized_player_name: o.normalized_player_name,
              internal_player_id: pid,
              side: o.side, point: o.point,
              raw_price_american: o.raw_price_american, raw_multiplier: o.raw_multiplier,
              price_semantic: o.price_semantic, promotion_type: o.promotion_type,
              offering_state: o.offering_state, conflict_reason: o.conflict_reason,
              duplicate_count: o.duplicate_count, provider_last_update,
              source_hash: o.source_hash, eligibility_note: '',
            };
          });
          const fresh_state = classifyFreshness({
            provider_last_update, now: new Date().toISOString(), latest_poll_failed: false,
          });
          const ingestion_run_id = randomUUID();
          const market_snapshot_id = randomUUID();
          await write_pool.query(
            `INSERT INTO oddsapi_ingestion_runs
               (oddsapi_ingestion_run_id, request_kind, endpoint,
                requested_provider_event_id, requested_market_keys, requested_bookmaker_keys,
                requested_regions, requested_effective_time, request_params, redacted_request_url,
                started_at, completed_at, http_status_last, content_type_last,
                response_headers_last, result_state)
             VALUES ($1,'current_poll','event_odds',$2,$3::jsonb,$4::jsonb,'[]'::jsonb,NULL,$5::jsonb,$6,$7,$8,$9,$10,$11::jsonb,'complete')`,
            [
              ingestion_run_id, ev.provider_event_id,
              JSON.stringify([mkey]), JSON.stringify([bkey]),
              JSON.stringify({ markets: [mkey], bookmakers: [bkey], oddsFormat: 'american' }),
              odds.redacted_request_url, req_started_at, new Date().toISOString(),
              odds.status, odds.content_type, JSON.stringify(odds.headers),
            ]
          );
          try {
            await persistOddsapiSnapshot(write_pool, {
              market_snapshot: {
                market_snapshot_id,
                oddsapi_ingestion_run_id: ingestion_run_id,
                raw_response_id: null,
                provider_event_id: ev.provider_event_id,
                linked_internal_game_id: gid,   // ← NOW POPULATED via STEP 3
                bookmaker_key: bkey, bookmaker_title: bm_title,
                source_class: 'sportsbook',
                market_key: mkey,
                request_kind: 'current_poll', provenance: 'self_observed',
                provider_last_update, provider_snapshot_time: null,
                retrieved_at: observed_at, observed_at,
                freshness_state: fresh_state, schema_state: 'valid',
                raw_outcome_row_count: outcomes_arr.length,
                duplicate_group_count: collapse.duplicate_group_count,
                conflict_group_count: collapse.conflict_group_count,
              },
              canonical_offerings,
              raw_rows: raw_rows_for_persist,
            });
            report.snapshots_written += 1;
            report.offerings_summary.push({
              bookmaker: bkey, market: mkey,
              canonical: canonical_offerings.length,
              missing_pid: canonical_offerings.filter((o: any) => o.internal_player_id === null).length,
            });
          } catch (e) {
            console.log(`# persist ERR ${ev.provider_event_id.slice(0,8)}… ${bkey}/${mkey}: ${(e as Error).message}`);
          }
        }
      }
    } finally { await write_pool.end(); }
    per_event.push(report);
  }

  const artifact = {
    ticket: 'V1-4e', step: 5,
    hard_ceiling: HARD_CREDIT_CEILING, credits_this_call: ticket_running,
    credit_ledger: ledger,
    per_event,
  };
  console.log(JSON.stringify({ credits: ticket_running, snapshots_total: per_event.reduce((a, e) => a + e.snapshots_written, 0) }, null, 2));
  writeFileSync('/tmp/v14d/step5_v4e_artifact.json', JSON.stringify(artifact, null, 2));
  console.log('# artifact: /tmp/v14d/step5_v4e_artifact.json');
}

main().catch((err) => { console.error('# ERROR:', err instanceof Error ? err.stack ?? err.message : String(err)); process.exit(1); });

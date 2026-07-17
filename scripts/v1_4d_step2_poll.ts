// V1-4d STEP 2 — bounded live current_poll.
//
// Composes existing V1-3 + V1-4 primitives; does not reimplement any:
//   - liveInvokeGate.buildLiveOddsapiConfig     (live-invoke gate)
//   - oddsapiRequest                             (HTTP primitive)
//   - validateEventOddsResponseShape             (schema validation)
//   - classifyPollResult                         (result classification)
//   - classifyFreshness                          (freshness classifier)
//   - isAllowlistedBookmakerKey / sourceClassForBookmakerKey  (GD-9)
//   - isLaunchMarketKey                          (launch-market filter)
//   - normalizeOutcome                           (raw row normalization)
//   - collapseOutcomes                           (duplicate collapse)
//   - reconcileEvent + resolveOddsapiEventForSeed + persistSeedEventResolution
//   - persistOddsapiSnapshot                     (atomic snapshot writer)
//
// Governor gates:
//   * Hard credit ceiling for THIS TICKET: 100.
//   * ≤ 8 events; 4 launch markets; 8 sportsbook keys; US region-equivalent.
//   * NO DFS/pickem. NO scheduler. NO cron.
//   * Fresh Client per event's write path.
//   * All writes to HOSTED Supabase.

import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';

import { openPool } from '../src/db/connection.js';
import type { SliplabzPool } from '../src/db/connection.js';
import { buildLiveOddsapiConfig } from '../src/lines/liveInvokeGate.js';
import { oddsapiRequest } from '../src/odds/httpClient.js';
import { validateEventOddsResponseShape } from '../src/odds/schemaValidation.js';
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
  type SeedEventResolutionOutcome,
} from '../src/seed/orchestrator/eventResolutionForSeed.js';
import { persistOddsapiSnapshot } from '../src/lines/orchestrator/persistOddsapiSnapshot.js';
import type { EventReconciliationInput } from '../src/identity/types.js';
import { validateEventDiscoveryResponse } from '../src/odds/eventDiscovery.js';

const SPORT_KEY = 'basketball_wnba';
const HARD_CREDIT_CEILING = 100;
const MAX_EVENTS = 8;

// Local normalization identical to the seed-loader's (matches the persist
// path's normalizer semantics). Consumed for the players-table lookup only.
function normalizeNameForLookup(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[’'‘′\-‐‑‒–—_.,]+/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

interface OpenEvent {
  readonly provider_event_id: string;
  readonly commence_time: string;
  readonly home_team: string;
  readonly away_team: string;
}

interface CreditLedgerEntry {
  readonly at: string;
  readonly endpoint: string;
  readonly provider_event_id: string | null;
  readonly http_status: number;
  readonly x_requests_used_before: number | null;
  readonly x_requests_used_after: number | null;
  readonly x_requests_remaining_after: number | null;
  readonly x_requests_last: number | null;
  readonly running_total_this_ticket: number;
}

interface ResolutionRecord {
  readonly provider_event_id: string;
  readonly outcome_kind: SeedEventResolutionOutcome['kind'];
  readonly internal_game_id: string | null;
  readonly reason: string | null;
  readonly reason_detail: string | null;
}

interface OfferingCounter {
  bookmaker_key: string;
  market_key: string;
  canonical_offerings: number;
  raw_rows_contributed: number;
  raw_rows_duplicate: number;
  raw_rows_quarantined: number;
  conflict_groups: number;
  duplicate_groups: number;
  outcomes_missing_player_id: number;
}

interface EventReport {
  provider_event_id: string;
  commence_time: string;
  matchup: string;
  linked_internal_game_id: string | null;
  http_status: number;
  poll_result_state: string;
  poll_reason_detail: string;
  snapshots_written: number;
  offerings_by_bookmaker_market: OfferingCounter[];
  bookmakers_in_response: string[];
  bookmakers_out_of_allowlist: string[];
  no_props_reason: string | null;
}

async function main(): Promise<void> {
  const api_key = process.env['ODDS_API_KEY'];
  const hosted_url = process.env['SLIPLABZ_HOSTED_DATABASE_URL'];
  if (api_key === undefined || api_key === '' || hosted_url === undefined || hosted_url === '') {
    console.error('# ERROR: ODDS_API_KEY or SLIPLABZ_HOSTED_DATABASE_URL not set.');
    process.exit(2);
  }
  const http_cfg = buildLiveOddsapiConfig({ allow_live_invoke: true });

  // --- 1. Re-discover events (free) so we're operating on current data ---
  console.log('# fetching upcoming events (free endpoint)…');
  const disc_started = new Date().toISOString();
  const disc = await oddsapiRequest(http_cfg, {
    path: `/v4/sports/${SPORT_KEY}/events`,
    query: {},
    api_key,
  });
  const disc_x_used_after = typeof disc.headers['x-requests-used'] === 'number' ? (disc.headers['x-requests-used'] as number) : null;
  const disc_x_rem_after = typeof disc.headers['x-requests-remaining'] === 'number' ? (disc.headers['x-requests-remaining'] as number) : null;
  const disc_x_last = typeof disc.headers['x-requests-last'] === 'number' ? (disc.headers['x-requests-last'] as number) : 0;
  const ledger: CreditLedgerEntry[] = [{
    at: disc_started,
    endpoint: 'events',
    provider_event_id: null,
    http_status: disc.status,
    x_requests_used_before: null,
    x_requests_used_after: disc_x_used_after,
    x_requests_remaining_after: disc_x_rem_after,
    x_requests_last: disc_x_last,
    running_total_this_ticket: 0,
  }];
  const provider_used_baseline = (disc_x_used_after ?? 0) - (disc_x_last ?? 0);

  if (disc.status !== 200 || disc.body_json === null) {
    console.error(`# HALT: events discovery failed (HTTP ${disc.status}).`);
    process.exit(3);
  }
  const validation = validateEventDiscoveryResponse(disc.body_json as any[]);
  const now_ms = Date.now();
  const events: OpenEvent[] = validation.valid_events
    .map((e) => ({
      provider_event_id: e.provider_event_id,
      commence_time: e.raw_commence_time,
      home_team: e.raw_home_team,
      away_team: e.raw_away_team,
    }))
    .filter((e) => Date.parse(e.commence_time) >= now_ms)
    .sort((a, b) => Date.parse(a.commence_time) - Date.parse(b.commence_time))
    .slice(0, MAX_EVENTS);
  console.log(`# ${events.length} upcoming events to poll (nearest-first, ≤${MAX_EVENTS}).`);

  if (events.length === 0) {
    console.error('# HALT: zero upcoming events at poll time.');
    process.exit(4);
  }

  // --- 2. Event → game resolution (writes provider_games or queue rows) ---
  const resolve_pool = openPool({
    connectionString: hosted_url,
    max: 1,
    statement_timeout_ms: 30_000,
    ssl: hosted_url.includes('supabase.') ? 'require' : 'disable',
  });
  const resolutions: ResolutionRecord[] = [];
  const player_map = new Map<string, string>();
  try {
    for (const ev of events) {
      const ctx = await loadSeedResolutionContext(resolve_pool, {
        provider: 'odds_api',
        raw_commence_time_utc: ev.commence_time,
      });
      const input: EventReconciliationInput = {
        provider: 'odds_api',
        provider_game_id: ev.provider_event_id,
        raw_home_team: ev.home_team,
        raw_away_team: ev.away_team,
        raw_commence_time: ev.commence_time,
      };
      const outcome = resolveOddsapiEventForSeed(input, ctx);
      await persistSeedEventResolution(resolve_pool, input, outcome);
      resolutions.push({
        provider_event_id: ev.provider_event_id,
        outcome_kind: outcome.kind,
        internal_game_id: outcome.kind === 'queued' ? null : outcome.internal_game_id,
        reason: outcome.kind === 'queued' ? outcome.reason : null,
        reason_detail: outcome.kind === 'queued' ? outcome.reason_detail : null,
      });
    }
    // Load a normalized-name → internal_player_id map (best-effort).
    const r = await resolve_pool.query(`SELECT internal_player_id, display_name, normalized_name FROM players`);
    for (const row of r.rows as Array<{ internal_player_id: string; display_name: string; normalized_name: string }>) {
      player_map.set(normalizeNameForLookup(row.display_name), row.internal_player_id);
      if (row.normalized_name !== '') player_map.set(row.normalized_name, row.internal_player_id);
    }
  } finally {
    await resolve_pool.end();
  }
  console.log('# event resolution done:');
  for (const r of resolutions) console.log(`  ${r.provider_event_id.slice(0, 8)}… → ${r.outcome_kind}${r.reason ? ` (${r.reason})` : ''}`);
  console.log(`# player lookup map: ${player_map.size} entries`);

  // --- 3. Poll per-event and persist ---
  const event_reports: EventReport[] = [];
  let ticket_credits_running = 0;

  for (let idx = 0; idx < events.length; idx += 1) {
    const ev = events[idx]!;
    const res = resolutions.find((r) => r.provider_event_id === ev.provider_event_id)!;

    // Predictive check before spending: markets × regions_equivalent = 4 × 1 = 4 credits per event.
    if (ticket_credits_running + 4 > HARD_CREDIT_CEILING) {
      console.error(`# HALT: credit ceiling would be exceeded at event ${idx + 1}.`);
      break;
    }

    const req_started_at = new Date().toISOString();
    const req_x_used_before = ledger[ledger.length - 1]?.x_requests_used_after ?? null;

    // The Odds API accepts either `regions=us` OR explicit `bookmakers=<csv>`.
    // We pass explicit V1 sportsbook allowlist keys per §13.5 (never regions).
    const odds = await oddsapiRequest(http_cfg, {
      path: `/v4/sports/${SPORT_KEY}/events/${ev.provider_event_id}/odds`,
      query: {
        markets: LAUNCH_MARKET_KEYS as unknown as ReadonlyArray<string>,
        bookmakers: V1_CONSENSUS_SPORTSBOOK_KEYS,
        oddsFormat: 'american',
      },
      api_key,
    });
    const x_used_after = typeof odds.headers['x-requests-used'] === 'number' ? (odds.headers['x-requests-used'] as number) : null;
    const x_rem_after = typeof odds.headers['x-requests-remaining'] === 'number' ? (odds.headers['x-requests-remaining'] as number) : null;
    const x_last = typeof odds.headers['x-requests-last'] === 'number' ? (odds.headers['x-requests-last'] as number) : 0;
    ticket_credits_running += x_last;
    ledger.push({
      at: req_started_at,
      endpoint: 'event_odds',
      provider_event_id: ev.provider_event_id,
      http_status: odds.status,
      x_requests_used_before: req_x_used_before,
      x_requests_used_after: x_used_after,
      x_requests_remaining_after: x_rem_after,
      x_requests_last: x_last,
      running_total_this_ticket: ticket_credits_running,
    });
    console.log(`# evt ${idx + 1}/${events.length} ${ev.provider_event_id.slice(0, 8)}… HTTP ${odds.status} x-last=${x_last} running=${ticket_credits_running}`);

    const classification = classifyPollResult({
      http_status: odds.status,
      content_type: odds.content_type,
      parsed_body: odds.body_json,
      transport_error_detail: null,
    });

    const report: EventReport = {
      provider_event_id: ev.provider_event_id,
      commence_time: ev.commence_time,
      matchup: `${ev.away_team} @ ${ev.home_team}`,
      linked_internal_game_id: res.internal_game_id,
      http_status: odds.status,
      poll_result_state: classification.result_state,
      poll_reason_detail: classification.detail,
      snapshots_written: 0,
      offerings_by_bookmaker_market: [],
      bookmakers_in_response: [],
      bookmakers_out_of_allowlist: [],
      no_props_reason: null,
    };

    if (classification.result_state !== 'complete' && classification.result_state !== 'successful_empty') {
      report.no_props_reason = `poll classification ${classification.result_state}: ${classification.detail}`;
      event_reports.push(report);
      continue;
    }

    // Parse the body and iterate bookmakers × markets.
    const body = odds.body_json as any;
    const bookmakers = Array.isArray(body?.bookmakers) ? body.bookmakers : [];
    report.bookmakers_in_response = bookmakers.map((b: any) => String(b?.key ?? ''));
    if (bookmakers.length === 0) {
      report.no_props_reason = 'schema-valid but zero bookmakers returned';
      event_reports.push(report);
      continue;
    }

    // Fresh SliplabzPool (max=1 → behaves as fresh client) for this event's writes.
    const write_pool: SliplabzPool = openPool({
      connectionString: hosted_url,
      max: 1,
      statement_timeout_ms: 30_000,
      ssl: hosted_url.includes('supabase.') ? 'require' : 'disable',
    });
    try {
      for (const bm of bookmakers) {
        const bkey = String(bm.key ?? '');
        if (!isAllowlistedBookmakerKey(bkey)) {
          report.bookmakers_out_of_allowlist.push(bkey);
          continue;
        }
        const source_class = sourceClassForBookmakerKey(bkey);
        if (source_class !== 'sportsbook') continue; // DFS never in consensus / never enrolled here
        const bm_title = String(bm.title ?? bkey);
        // Fallback: some responses put last_update on the bookmaker.
        const bm_last_update = typeof bm.last_update === 'string' ? bm.last_update : null;
        const markets_arr = Array.isArray(bm.markets) ? bm.markets : [];
        for (const m of markets_arr) {
          const mkey = String(m.key ?? '');
          if (!isLaunchMarketKey(mkey)) continue;
          // Odds API v4: `last_update` is at the MARKET level (see
          // src/seed/historicalEventOdds.ts:163). Fall back to the
          // bookmaker-level field when the market's is absent.
          const provider_last_update =
            typeof m.last_update === 'string' ? m.last_update : bm_last_update;
          const outcomes_arr = Array.isArray(m.outcomes) ? m.outcomes : [];

          // Normalize each outcome row; track quarantines.
          const raw_rows_for_persist: Parameters<typeof persistOddsapiSnapshot>[1]['raw_rows'][number][] = [];
          const collapse_input: Array<{ raw_row_index: number; outcome: any }> = [];
          const quarantine_indexes = new Set<number>();
          let missing_side = 0, missing_point = 0, missing_price = 0, missing_desc = 0, other_q = 0;
          const observed_at = new Date().toISOString();
          for (let i = 0; i < outcomes_arr.length; i += 1) {
            const raw = outcomes_arr[i] as Record<string, unknown>;
            const nr = normalizeOutcome(raw, 'sportsbook_american');
            if (!nr.ok) {
              quarantine_indexes.add(i);
              if (nr.quarantine.reason === 'missing_side') missing_side += 1;
              else if (nr.quarantine.reason === 'missing_point') missing_point += 1;
              else if (nr.quarantine.reason === 'missing_price') missing_price += 1;
              else if (nr.quarantine.reason === 'missing_player_description') missing_desc += 1;
              else other_q += 1;
              // Preserve the raw row with disposition=quarantined; index into
              // canonical will be null.
              raw_rows_for_persist.push({
                raw_row_index: i,
                raw_name: String(raw['name'] ?? ''),
                raw_description: String(raw['description'] ?? ''),
                raw_price: typeof raw['price'] === 'number' ? (raw['price'] as number) : null,
                raw_point: typeof raw['point'] === 'number' ? (raw['point'] as number) : null,
                raw_multiplier: typeof raw['multiplier'] === 'number' ? (raw['multiplier'] as number) : null,
                raw_payload: raw,
                disposition: 'quarantined',
                canonical_offering_index: null,
                observed_at,
              });
              continue;
            }
            collapse_input.push({ raw_row_index: i, outcome: nr.outcome as any });
          }
          if (collapse_input.length === 0 && quarantine_indexes.size === 0) continue;

          const collapse = collapseOutcomes(
            collapse_input.map(({ raw_row_index, outcome }) => ({ raw_row_index, outcome: outcome as any })),
            {
              provider_event_id: ev.provider_event_id,
              bookmaker_key: bkey,
              market_key: mkey,
              provider_last_update,
              promotion_type: 'unknown',
            }
          );

          // Build a map: canonical index → contributing raw indexes (already
          // exposed by collapse.offerings[].contributing_raw_row_indexes).
          const canonical_offering_ids: string[] = [];
          for (let ci = 0; ci < collapse.offerings.length; ci += 1) canonical_offering_ids.push(randomUUID());
          const raw_index_to_canonical_index = new Map<number, number>();
          for (let ci = 0; ci < collapse.offerings.length; ci += 1) {
            for (const ri of collapse.offerings[ci]!.contributing_raw_row_indexes) {
              raw_index_to_canonical_index.set(ri, ci);
            }
          }
          // Now stream the raw rows again, in original index order, and
          // classify each into contributed | duplicate | quarantined.
          const canonical_first_seen = new Map<number, boolean>();
          for (let i = 0; i < outcomes_arr.length; i += 1) {
            if (quarantine_indexes.has(i)) continue; // already emitted above
            const raw = outcomes_arr[i] as Record<string, unknown>;
            if (collapse.quarantined_raw_row_indexes.has(i)) {
              raw_rows_for_persist.push({
                raw_row_index: i,
                raw_name: String(raw['name'] ?? ''),
                raw_description: String(raw['description'] ?? ''),
                raw_price: typeof raw['price'] === 'number' ? (raw['price'] as number) : null,
                raw_point: typeof raw['point'] === 'number' ? (raw['point'] as number) : null,
                raw_multiplier: typeof raw['multiplier'] === 'number' ? (raw['multiplier'] as number) : null,
                raw_payload: raw,
                disposition: 'quarantined',
                canonical_offering_index: null,
                observed_at,
              });
              continue;
            }
            const ci = raw_index_to_canonical_index.get(i);
            if (ci === undefined) continue;
            const is_first = !canonical_first_seen.has(ci);
            canonical_first_seen.set(ci, true);
            raw_rows_for_persist.push({
              raw_row_index: i,
              raw_name: String(raw['name'] ?? ''),
              raw_description: String(raw['description'] ?? ''),
              raw_price: typeof raw['price'] === 'number' ? (raw['price'] as number) : null,
              raw_point: typeof raw['point'] === 'number' ? (raw['point'] as number) : null,
              raw_multiplier: typeof raw['multiplier'] === 'number' ? (raw['multiplier'] as number) : null,
              raw_payload: raw,
              disposition: is_first ? 'contributed' : 'duplicate',
              canonical_offering_index: ci,
              observed_at,
            });
          }

          // Build canonical_offerings for persist.
          const canonical_offerings: Parameters<typeof persistOddsapiSnapshot>[1]['canonical_offerings'][number][] =
            collapse.offerings.map((o, ci) => {
              const player_id = player_map.get(o.normalized_player_name) ?? null;
              return {
                market_offering_id: canonical_offering_ids[ci]!,
                raw_player_description: o.normalized_player_name,
                normalized_player_name: o.normalized_player_name,
                internal_player_id: player_id,
                side: o.side,
                point: o.point,
                raw_price_american: o.raw_price_american,
                raw_multiplier: o.raw_multiplier,
                price_semantic: o.price_semantic,
                promotion_type: o.promotion_type,
                offering_state: o.offering_state,
                conflict_reason: o.conflict_reason,
                duplicate_count: o.duplicate_count,
                provider_last_update,
                source_hash: o.source_hash,
                eligibility_note: '',
              };
            });

          // Freshness classification for the snapshot header.
          const fresh_state = classifyFreshness({
            provider_last_update,
            now: new Date().toISOString(),
            latest_poll_failed: false,
          });

          // Insert oddsapi_ingestion_runs row so market_snapshots FK resolves.
          const ingestion_run_id = randomUUID();
          const market_snapshot_id = randomUUID();
          const retrieved_at = observed_at;
          await write_pool.query(
            `INSERT INTO oddsapi_ingestion_runs (
               oddsapi_ingestion_run_id, request_kind, endpoint,
               requested_provider_event_id, requested_market_keys,
               requested_bookmaker_keys, requested_regions,
               requested_effective_time, request_params, redacted_request_url,
               started_at, completed_at, http_status_last, content_type_last,
               response_headers_last, result_state
             ) VALUES ($1,'current_poll','event_odds',$2,$3::jsonb,$4::jsonb,'[]'::jsonb,NULL,$5::jsonb,$6,$7,$8,$9,$10,$11::jsonb,'complete')`,
            [
              ingestion_run_id, ev.provider_event_id,
              JSON.stringify([mkey]), JSON.stringify([bkey]),
              JSON.stringify({ markets: [mkey], bookmakers: [bkey], oddsFormat: 'american' }),
              odds.redacted_request_url, req_started_at, new Date().toISOString(),
              odds.status, odds.content_type, JSON.stringify(odds.headers),
            ]
          );

          // Fully-typed persistOddsapiSnapshot input.
          const persist_input: Parameters<typeof persistOddsapiSnapshot>[1] = {
            market_snapshot: {
              market_snapshot_id,
              oddsapi_ingestion_run_id: ingestion_run_id,
              raw_response_id: null,
              provider_event_id: ev.provider_event_id,
              linked_internal_game_id: res.internal_game_id,
              bookmaker_key: bkey,
              bookmaker_title: bm_title,
              source_class: 'sportsbook',
              market_key: mkey,
              request_kind: 'current_poll',
              provenance: 'self_observed',
              provider_last_update,
              provider_snapshot_time: null,
              retrieved_at,
              observed_at: retrieved_at,
              freshness_state: fresh_state,
              schema_state: 'valid',
              raw_outcome_row_count: outcomes_arr.length,
              duplicate_group_count: collapse.duplicate_group_count,
              conflict_group_count: collapse.conflict_group_count,
            },
            canonical_offerings,
            raw_rows: raw_rows_for_persist,
          };

          // Wrap the persist in a per-call try so a single (bm, mk) failure
          // doesn't derail the event.
          try {
            await persistOddsapiSnapshot(write_pool, persist_input);
            report.snapshots_written += 1;
          } catch (e) {
            console.log(`# persist error evt=${ev.provider_event_id.slice(0, 8)}… ${bkey}/${mkey}: ${(e as Error).message}`);
          }
          const contributed = raw_rows_for_persist.filter((r) => r.disposition === 'contributed').length;
          const duplicate = raw_rows_for_persist.filter((r) => r.disposition === 'duplicate').length;
          const quarantined = raw_rows_for_persist.filter((r) => r.disposition === 'quarantined').length;
          const missing_pid = canonical_offerings.filter((o) => o.internal_player_id === null).length;
          report.offerings_by_bookmaker_market.push({
            bookmaker_key: bkey,
            market_key: mkey,
            canonical_offerings: canonical_offerings.length,
            raw_rows_contributed: contributed,
            raw_rows_duplicate: duplicate,
            raw_rows_quarantined: quarantined,
            conflict_groups: collapse.conflict_group_count,
            duplicate_groups: collapse.duplicate_group_count,
            outcomes_missing_player_id: missing_pid,
          });
          if (missing_side + missing_point + missing_price + missing_desc + other_q > 0) {
            console.log(`  quarantine for ${bkey}/${mkey}: side=${missing_side} point=${missing_point} price=${missing_price} desc=${missing_desc} other=${other_q}`);
          }
        }
      }
    } finally {
      await write_pool.end();
    }

    if (report.snapshots_written === 0 && report.no_props_reason === null) {
      report.no_props_reason = `zero snapshots persisted (in-response bookmakers=${report.bookmakers_in_response.length}, out-of-allowlist=${report.bookmakers_out_of_allowlist.length})`;
    }
    event_reports.push(report);
  }

  // Full accounting artifact.
  const artifact = {
    ticket: 'V1-4d',
    step: 2,
    poll_started_at: disc_started,
    poll_completed_at: new Date().toISOString(),
    provider_used_baseline_before_ticket: provider_used_baseline,
    credit_ledger: ledger,
    ticket_credits_running_total: ticket_credits_running,
    hard_ceiling: HARD_CREDIT_CEILING,
    resolutions,
    event_reports,
  };
  writeFileSync('/tmp/v14d/step2_artifact.json', JSON.stringify(artifact, null, 2));
  console.log('\n# STEP 2 complete');
  console.log(`# credits (this ticket): ${ticket_credits_running}/${HARD_CREDIT_CEILING}`);
  console.log(`# events polled: ${event_reports.length}`);
  console.log(`# snapshots persisted total: ${event_reports.reduce((a, e) => a + e.snapshots_written, 0)}`);
  console.log(`# artifact: /tmp/v14d/step2_artifact.json`);
}

main().catch((err: unknown) => {
  console.error('# ERROR:', err instanceof Error ? err.stack ?? err.message : String(err));
  process.exit(1);
});

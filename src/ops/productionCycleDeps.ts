// V1-OP-1 — production wiring of the scheduled-cycle deps.
//
// Binds the injected `ScheduledCycleDeps` seams to the REAL committed
// primitives (the V1-4g sweep, the current_market_rows aggregator, the v2
// populator + builder, the seed identity resolution). Nothing here
// reimplements a primitive; it only composes them. Tests use their own mock
// deps instead of this module.

import { buildLiveOddsapiConfig } from '../lines/liveInvokeGate.js';
import { oddsapiRequest } from '../odds/httpClient.js';
import { validateEventDiscoveryResponse } from '../odds/eventDiscovery.js';
import {
  loadSeedResolutionContext, resolveOddsapiEventForSeed, persistSeedEventResolution,
} from '../seed/orchestrator/eventResolutionForSeed.js';
import type { EventReconciliationInput } from '../identity/types.js';
import { runOddsapiPollSweep, DEFAULT_MAX_CONCURRENCY } from '../lines/orchestrator/oddsapiPollSweep.js';
import { aggregateCurrentMarketRowsForGame } from '../computation/driver/currentMarketRowsAggregator.js';
import { listAllGrains } from '../evidence/driver/populate.js';
import { runEvidencePopulatorV2 } from '../evidence/v2/populateV2.js';
import { makeV2ReadModelInputBuilder } from '../evidence/v2/readModelInputBuilderV2.js';
import type { ScheduledCycleDeps } from './scheduledCycle.js';

const SPORT_KEY = 'basketball_wnba';

function numHeader(headers: Record<string, unknown>, name: string): number | null {
  const raw = headers[name];
  if (raw === undefined || raw === null) return null;
  const n = Number(Array.isArray(raw) ? raw[0] : raw);
  return Number.isFinite(n) ? n : null;
}

function normName(s: string): string {
  return s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[’'‘′\-‐‑‒–—_.,]+/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Build the production deps for `runScheduledCycle`. `connection_string` must
 * be the SESSION-pooler hosted URL (5432) — the advisory lock is session
 * scoped. The Odds key is passed explicitly and is NEVER logged.
 */
export function makeProductionCycleDeps(args: {
  readonly connection_string: string;
  readonly api_key: string;
  readonly dry_run?: boolean;
}): ScheduledCycleDeps {
  const http_config = buildLiveOddsapiConfig({ allow_live_invoke: true });
  return {
    connection_string: args.connection_string,
    dry_run: args.dry_run ?? false,

    discover: async () => {
      const disc = await oddsapiRequest(http_config, { path: `/v4/sports/${SPORT_KEY}/events`, query: {}, api_key: args.api_key });
      if (disc.status !== 200 || disc.body_json === null) {
        throw new Error(`discovery failed: status ${disc.status}`);
      }
      const credits_remaining = numHeader(disc.headers as Record<string, unknown>, 'x-requests-remaining');
      const validated = validateEventDiscoveryResponse(disc.body_json as unknown as unknown[]);
      const events = validated.valid_events.map((e) => ({
        provider_event_id: e.provider_event_id,
        commence_time: e.raw_commence_time,
        home_team: e.raw_home_team,
        away_team: e.raw_away_team,
      }));
      return { events, credits_remaining };
    },

    prepareEvents: async ({ pool, events, windowGameIds, cap }) => {
      const sweep_events: Array<{ provider_event_id: string; linked_internal_game_id: string | null }> = [];
      for (const ev of events) {
        const ctx = await loadSeedResolutionContext(pool, { provider: 'odds_api', raw_commence_time_utc: ev.commence_time });
        const input: EventReconciliationInput = {
          provider: 'odds_api', provider_game_id: ev.provider_event_id,
          raw_home_team: ev.home_team, raw_away_team: ev.away_team, raw_commence_time: ev.commence_time,
        };
        const outcome = resolveOddsapiEventForSeed(input, ctx);
        await persistSeedEventResolution(pool, input, outcome);
        const linked = outcome.kind === 'queued' ? null : outcome.internal_game_id;
        if (linked !== null && windowGameIds.has(linked)) {
          sweep_events.push({ provider_event_id: ev.provider_event_id, linked_internal_game_id: linked });
        }
        if (sweep_events.length >= cap) break;
      }
      const player_map = new Map<string, string>();
      for (const row of (await pool.query('SELECT internal_player_id, display_name, normalized_name FROM players')).rows as Array<{ internal_player_id: string; display_name: string; normalized_name: string }>) {
        player_map.set(normName(row.display_name), row.internal_player_id);
        if (row.normalized_name !== '') player_map.set(row.normalized_name, row.internal_player_id);
      }
      return { sweep_events, player_map };
    },

    runPollSweep: ({ sweep_events, player_map }) => runOddsapiPollSweep({
      api_key: args.api_key, db_url: args.connection_string, http_config,
      events: sweep_events, player_map, max_concurrency: DEFAULT_MAX_CONCURRENCY,
      sequential: false, on_connection_check: undefined,
      write_pool_factory: undefined, write_pool_release: undefined, on_concurrency_change: undefined,
    }),

    aggregate: (pool, internal_game_id) => aggregateCurrentMarketRowsForGame(pool, { internal_game_id }),

    listGrainsForGames: async (connection_string, gameIds) => {
      const idset = new Set(gameIds);
      const all = await listAllGrains(connection_string);
      return all.filter((g) => idset.has(g.internal_game_id));
    },

    populate: ({ grains, evaluation_reference_time, dry_run }) => {
      const today = new Date().toISOString().slice(0, 10);
      return runEvidencePopulatorV2({
        grains, build_profile_input: makeV2ReadModelInputBuilder({ today_utc_date: today, reference_date: today }),
        connection_string: args.connection_string, evaluation_reference_time, dry_run,
      });
    },
  };
}

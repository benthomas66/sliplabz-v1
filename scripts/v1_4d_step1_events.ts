// V1-4d STEP 1 — free events discovery.
//
// Consumes: buildLiveOddsapiConfig (live-invoke gate), oddsapiRequest (HTTP
// primitive), validateEventDiscoveryResponse (Odds §4.4 shape check).
// Endpoint: /v4/sports/basketball_wnba/events. Odds §14.2 — the events
// endpoint does not count against the quota; every response's
// x-requests-used / x-requests-remaining are captured for cross-check.
//
// Governor gates:
//   * ODDSAPI_LIVE_INVOKE=1 + ODDS_API_KEY required.
//   * No writes. No credit spend expected.
//   * Reports upcoming events + 72-hour horizon. HALT signalled to the
//     operator by exiting nonzero when 0 events fall in the horizon.

import { buildLiveOddsapiConfig } from '../src/lines/liveInvokeGate.js';
import { oddsapiRequest } from '../src/odds/httpClient.js';
import { validateEventDiscoveryResponse } from '../src/odds/eventDiscovery.js';

const SPORT_KEY = 'basketball_wnba';
const HORIZON_HOURS = 72;

async function main(): Promise<void> {
  const api_key = process.env['ODDS_API_KEY'];
  if (api_key === undefined || api_key === '') {
    console.error('# ERROR: ODDS_API_KEY not set.');
    process.exit(2);
  }
  const http_cfg = buildLiveOddsapiConfig({ allow_live_invoke: true });

  const started_at = new Date().toISOString();
  const result = await oddsapiRequest(http_cfg, {
    path: `/v4/sports/${SPORT_KEY}/events`,
    query: {},
    api_key,
  });
  const completed_at = new Date().toISOString();

  const preflight = {
    kind: 'step1_preflight',
    started_at,
    completed_at,
    redacted_request_url: result.redacted_request_url,
    http_status: result.status,
    x_requests_used: result.headers['x-requests-used'] ?? null,
    x_requests_remaining: result.headers['x-requests-remaining'] ?? null,
    x_requests_last: result.headers['x-requests-last'] ?? null,
  };
  console.log(JSON.stringify(preflight, null, 2));

  if (result.status !== 200 || result.body_json === null) {
    console.error(`# ERROR: events discovery failed (HTTP ${result.status}, parse=${result.parse_state}).`);
    console.error(result.body_text.slice(0, 500));
    process.exit(3);
  }
  const body = result.body_json;
  const rows = Array.isArray(body) ? body : [];
  const validation = validateEventDiscoveryResponse(rows);

  const now_ms = Date.parse(completed_at);
  const horizon_ms = now_ms + HORIZON_HOURS * 3600 * 1000;
  const upcoming = validation.valid_events
    .map((e) => ({
      provider_event_id: e.provider_event_id,
      commence_time: e.raw_commence_time,
      home_team: e.raw_home_team,
      away_team: e.raw_away_team,
      commence_ms: Date.parse(e.raw_commence_time),
    }))
    .filter((e) => Number.isFinite(e.commence_ms) && e.commence_ms >= now_ms)
    .sort((a, b) => a.commence_ms - b.commence_ms);
  const within_48h = upcoming.filter((e) => e.commence_ms <= now_ms + 48 * 3600 * 1000);
  const within_horizon = upcoming.filter((e) => e.commence_ms <= horizon_ms);

  const summary = {
    kind: 'step1_summary',
    events_returned_by_provider: rows.length,
    validated: validation.valid_events.length,
    quarantined: validation.quarantined.length,
    quarantine_details: validation.quarantined.map((q) => ({
      reason: q.reason,
      reason_detail: q.reason_detail,
    })),
    upcoming_total: upcoming.length,
    upcoming_within_48h: within_48h.length,
    upcoming_within_72h: within_horizon.length,
    upcoming_events: upcoming.map((e) => ({
      provider_event_id: e.provider_event_id,
      commence_time: e.commence_time,
      away_at_home: `${e.away_team} @ ${e.home_team}`,
      hours_until_tipoff: ((e.commence_ms - now_ms) / (3600 * 1000)).toFixed(2),
    })),
  };
  console.log(JSON.stringify(summary, null, 2));

  if (within_horizon.length === 0) {
    console.error(`# HALT: zero upcoming WNBA events within ${HORIZON_HOURS} hours.`);
    process.exit(4);
  }
  console.log(`# STEP 1 OK: ${within_horizon.length} events within ${HORIZON_HOURS}h; ${within_48h.length} within 48h.`);
}

main().catch((err: unknown) => {
  console.error('# ERROR:', err instanceof Error ? err.stack ?? err.message : String(err));
  process.exit(1);
});

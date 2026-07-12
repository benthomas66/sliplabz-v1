// Ticket §7: current-poll snapshots carry provenance suitable for V1-4;
// self_observed only in V1-3. `successful_empty` and `complete` overwrite
// current; every failure state does NOT (§16.1).

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  closeRun,
  openRun,
  redactApiKey,
  runOverwritesLastValidSnapshot,
} from '../../src/odds/ingestionRun.js';
import type { OddsapiRunState } from '../../src/shared/enums.js';

function make(state: OddsapiRunState) {
  const open = openRun({
    oddsapi_ingestion_run_id: `run-${state}`,
    request_kind: 'current_poll',
    endpoint: 'event_odds',
    requested_provider_event_id: 'evt-1',
    requested_market_keys: ['player_points'],
    requested_bookmaker_keys: ['draftkings'],
    requested_regions: [],
    started_at: '2026-07-11T12:00:00Z',
  });
  return closeRun({
    open,
    completed_at: '2026-07-11T12:00:03Z',
    http_status_last: 200,
    content_type_last: 'application/json',
    response_headers_last: { 'x-requests-last': 4 },
    result_state: state,
    failure_detail: state === 'complete' || state === 'successful_empty' ? null : 'x',
    quota_forecast: 4,
    quota_observed: 4,
    quota_delta_flag: 'exact_match',
    x_requests_used: 40719,
    x_requests_remaining: 40711,
    x_requests_last: 4,
  });
}

describe('Odds API ingestion run lifecycle (Odds §15.1, §16.1)', () => {
  it('openRun freezes params and stamps result_state=running', () => {
    const open = openRun({
      oddsapi_ingestion_run_id: 'r',
      request_kind: 'event_discovery',
      endpoint: 'events',
      started_at: '2026-07-11T12:00:00Z',
    });
    assert.equal(open.result_state, 'running');
    assert.equal(open.requested_provider_event_id, null);
    assert.equal(open.requested_market_keys.length, 0);
  });

  it('closeRun rejects result_state="running"', () => {
    const open = openRun({
      oddsapi_ingestion_run_id: 'r',
      request_kind: 'event_discovery',
      endpoint: 'events',
      started_at: '2026-07-11T12:00:00Z',
    });
    assert.throws(() =>
      closeRun({
        open,
        completed_at: '2026-07-11T12:00:03Z',
        http_status_last: 200,
        content_type_last: 'application/json',
        response_headers_last: {},
        result_state: 'running' as OddsapiRunState,
        failure_detail: null,
        quota_forecast: null,
        quota_observed: null,
        quota_delta_flag: null,
        x_requests_used: null,
        x_requests_remaining: null,
        x_requests_last: null,
      })
    );
  });

  it('LOAD-BEARING: only complete and successful_empty overwrite last valid snapshot (§16.1)', () => {
    const states: OddsapiRunState[] = [
      'complete',
      'successful_empty',
      'partial',
      'failed_transport',
      'failed_authentication_or_access',
      'failed_forbidden_or_subscription',
      'failed_not_found',
      'failed_rate_limited',
      'failed_invalid_request',
      'failed_schema_drift',
      'failed_parse',
    ];
    for (const s of states) {
      const run = make(s);
      const expected = s === 'complete' || s === 'successful_empty';
      assert.equal(
        runOverwritesLastValidSnapshot(run),
        expected,
        `state ${s}`
      );
    }
  });

  it('LOAD-BEARING: redactApiKey rewrites the apiKey query param', () => {
    const before = 'https://api.the-odds-api.com/v4/sports/basketball_wnba/events?apiKey=xyz&dateFormat=iso';
    const after = redactApiKey(before);
    assert.ok(after.includes('apiKey=REDACTED'));
    assert.ok(!after.includes('xyz'));
    assert.ok(after.includes('dateFormat=iso'));
  });

  it('openRun redacts the request URL BEFORE persistence', () => {
    const open = openRun({
      oddsapi_ingestion_run_id: 'r',
      request_kind: 'event_discovery',
      endpoint: 'events',
      redacted_request_url:
        'https://api.the-odds-api.com/v4/sports/basketball_wnba/events?apiKey=hunter2&dateFormat=iso',
      started_at: '2026-07-11T12:00:00Z',
    });
    assert.ok(open.redacted_request_url !== null);
    assert.ok(!open.redacted_request_url!.includes('hunter2'));
    assert.ok(open.redacted_request_url!.includes('apiKey=REDACTED'));
  });
});

// Ticket §7 hard invariant covered here:
//   NO live provider call anywhere in the test suite. HTTP client may exist,
//   but any live invocation path requires an API key from env AND must not
//   execute during this ticket. No key committed; .env.example placeholders only.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
  buildOddsapiUrl,
  DEFAULT_ODDSAPI_CONFIG,
  oddsapiRequest,
  type FetchLike,
  type HttpResponseLike,
} from '../../src/odds/httpClient.js';
import { redactApiKey } from '../../src/odds/ingestionRun.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../..');

describe('Odds API HTTP client — safety invariants', () => {
  it('no live-invocation env flags leak into tests', () => {
    assert.notEqual(
      process.env['ODDSAPI_LIVE_INVOKE'],
      '1',
      'ODDSAPI_LIVE_INVOKE=1 in test environment — never permitted'
    );
  });

  it('no Odds API key is available to tests', () => {
    const key = process.env['ODDS_API_KEY'];
    assert.ok(
      key === undefined || key === '',
      'ODDS_API_KEY set in test env — could enable a live call'
    );
  });

  it('.env.example contains ODDS_API_KEY placeholder (empty value)', () => {
    const p = resolve(repoRoot, '.env.example');
    assert.ok(existsSync(p), '.env.example missing');
    const s = readFileSync(p, 'utf8');
    assert.match(s, /^ODDS_API_KEY=\s*$/m);
    assert.match(s, /^ODDSAPI_LIVE_INVOKE=\s*$/m);
  });

  it('buildOddsapiUrl sets apiKey and comma-joins array params', () => {
    const url = buildOddsapiUrl(DEFAULT_ODDSAPI_CONFIG, {
      path: '/v4/sports/basketball_wnba/events/xyz/odds',
      query: {
        markets: ['player_points', 'player_rebounds'],
        bookmakers: ['draftkings', 'fanduel'],
        oddsFormat: 'american',
      },
      api_key: 'test-key-abc',
    });
    // apiKey present and equal to the passed-in test key.
    assert.ok(url.includes('apiKey=test-key-abc'));
    // Comma joined.
    assert.ok(url.includes('markets=player_points%2Cplayer_rebounds'));
    assert.ok(url.includes('bookmakers=draftkings%2Cfanduel'));
    assert.ok(url.includes('oddsFormat=american'));
  });

  it('LOAD-BEARING: redactApiKey replaces apiKey with REDACTED, preserving other query params', () => {
    const before = 'https://api.the-odds-api.com/v4/sports/basketball_wnba/events?apiKey=SECRET&dateFormat=iso';
    const after = redactApiKey(before);
    assert.ok(after.includes('apiKey=REDACTED'));
    assert.ok(!after.includes('SECRET'));
    assert.ok(after.includes('dateFormat=iso'));
  });

  it('oddsapiRequest with content-type=application/json parses body_json (Odds §14.9)', async () => {
    const fake_fetch: FetchLike = async () => {
      const res: HttpResponseLike = {
        status: 200,
        headers: {
          get: (name: string) => {
            const map: Record<string, string> = {
              'content-type': 'application/json',
              'x-requests-last': '4',
              'x-requests-remaining': '40711',
              'x-requests-used': '40719',
            };
            return map[name.toLowerCase()] ?? null;
          },
        },
        text: async () => '{"id":"evt","bookmakers":[]}',
      };
      return res;
    };
    const res = await oddsapiRequest(
      { ...DEFAULT_ODDSAPI_CONFIG, fetch: fake_fetch },
      {
        path: '/v4/sports/basketball_wnba/events/evt/odds',
        query: {},
        api_key: 'test',
      }
    );
    assert.equal(res.status, 200);
    assert.equal(res.parse_state, 'json_ok');
    assert.equal(res.failure_kind, null);
    // Quota headers retained.
    assert.equal(res.headers['x-requests-last'], 4);
    assert.equal(res.headers['x-requests-remaining'], 40711);
    // redacted_request_url does NOT contain the key.
    assert.ok(!res.redacted_request_url.includes('test'));
    assert.ok(res.redacted_request_url.includes('apiKey=REDACTED'));
  });

  it('oddsapiRequest classifies 422 as failed_invalid_request (Odds §13.7)', async () => {
    const fake_fetch: FetchLike = async () => ({
      status: 422,
      headers: {
        get: (name: string) =>
          name.toLowerCase() === 'content-type' ? 'application/json' : null,
      },
      text: async () => '{"error_code":"UNKNOWN_MARKET"}',
    });
    const res = await oddsapiRequest(
      { ...DEFAULT_ODDSAPI_CONFIG, fetch: fake_fetch },
      { path: '/v4/sports/basketball_wnba/events/x/odds', query: {}, api_key: 't' }
    );
    assert.equal(res.status, 422);
    assert.equal(res.failure_kind, 'failed_invalid_request');
  });

  it('oddsapiRequest handles non-JSON body without calling json() (§20)', async () => {
    const fake_fetch: FetchLike = async () => ({
      status: 500,
      headers: {
        get: (name: string) =>
          name.toLowerCase() === 'content-type' ? 'text/plain' : null,
      },
      text: async () => 'Internal Server Error',
    });
    const res = await oddsapiRequest(
      { ...DEFAULT_ODDSAPI_CONFIG, fetch: fake_fetch },
      { path: '/v4/sports/basketball_wnba/events/x/odds', query: {}, api_key: 't' }
    );
    assert.equal(res.status, 500);
    assert.equal(res.parse_state, 'plain_text');
    assert.equal(res.body_text, 'Internal Server Error');
    assert.equal(res.body_json, null);
    assert.equal(res.failure_kind, 'failed_transport');
  });
});

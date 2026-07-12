// Ticket §6 hard invariant covered here:
//   - NO live provider call anywhere in the test suite. The HTTP client may
//     exist, but any live invocation path requires an API key from env and
//     must not execute during this ticket. Do not commit any key;
//     .env.example placeholders only.
//
// This test asserts:
//   * The client uses an injected fetch — nothing forces the platform fetch.
//   * BDL_LIVE_INVOKE is not set during test runs.
//   * BALLDONTLIE_API_KEY is not set during test runs.
//   * The .env.example placeholder file exists and contains empty values.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { bdlRequest, buildBdlUrl, DEFAULT_BDL_CONFIG } from '../../src/bdl/httpClient.js';
import type { FetchLike, HttpResponseLike } from '../../src/bdl/httpClient.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../..');

describe('BDL HTTP client — safety invariants', () => {
  it('no live-invocation env flags leak into tests', () => {
    assert.notEqual(
      process.env['BDL_LIVE_INVOKE'],
      '1',
      'BDL_LIVE_INVOKE=1 in test environment — never permitted'
    );
  });

  it('no API key is available to tests (fixture-only invocation)', () => {
    // Absent OR empty is acceptable; a real key is not.
    const key = process.env['BALLDONTLIE_API_KEY'];
    assert.ok(
      key === undefined || key === '',
      'BALLDONTLIE_API_KEY set in test env — could enable a live call'
    );
  });

  it('.env.example exists and contains empty placeholder values', () => {
    const p = resolve(repoRoot, '.env.example');
    assert.ok(existsSync(p), '.env.example missing');
    const s = readFileSync(p, 'utf8');
    assert.match(s, /^BALLDONTLIE_API_KEY=\s*$/m);
    assert.match(s, /^BDL_LIVE_INVOKE=\s*$/m);
  });

  it('buildBdlUrl serializes array params using repeated bracketed keys (BDL §3B)', () => {
    const url = buildBdlUrl(DEFAULT_BDL_CONFIG, {
      endpoint: 'player_stats',
      params: {
        'seasons[]': [2026],
        'team_ids[]': [1, 2, 3],
        per_page: 100,
      },
    });
    assert.ok(url.includes('team_ids%5B%5D%5B%5D=1'));
    assert.ok(url.includes('team_ids%5B%5D%5B%5D=2'));
    assert.ok(url.includes('team_ids%5B%5D%5B%5D=3'));
    assert.ok(url.includes('per_page=100'));
  });

  it('bdlRequest with content-type=application/json parses JSON body_json (BDL §15A.3)', async () => {
    const fakeFetch: FetchLike = async () => {
      const res: HttpResponseLike = {
        status: 200,
        headers: {
          get: (name: string) => {
            const map: Record<string, string> = {
              'content-type': 'application/json',
              'x-ratelimit-remaining': '599',
            };
            return map[name.toLowerCase()] ?? null;
          },
        },
        text: async () => JSON.stringify({ data: [], meta: { next_cursor: null } }),
      };
      return res;
    };
    const res = await bdlRequest(
      { ...DEFAULT_BDL_CONFIG, fetch: fakeFetch },
      { endpoint: 'player_stats' },
      { Authorization: 'test-key' }
    );
    assert.equal(res.status, 200);
    assert.equal(res.parse_state, 'json_ok');
    assert.ok(res.body_json !== null);
    assert.equal(res.failure_kind, null);
    assert.equal(res.headers['x-ratelimit-remaining'], 599);
  });

  it('bdlRequest with content-type=text/plain does NOT call json(); body_text retained (BDL §15A.2 401)', async () => {
    const fakeFetch: FetchLike = async () => {
      const res: HttpResponseLike = {
        status: 401,
        headers: {
          get: (name: string) => {
            const map: Record<string, string> = { 'content-type': 'text/plain; charset=utf-8' };
            return map[name.toLowerCase()] ?? null;
          },
        },
        text: async () => 'Unauthorized',
        // Deliberately omit json() to prove it's never called.
      };
      return res;
    };
    const res = await bdlRequest(
      { ...DEFAULT_BDL_CONFIG, fetch: fakeFetch },
      { endpoint: 'teams' },
      { Authorization: 'bad-key' }
    );
    assert.equal(res.status, 401);
    assert.equal(res.parse_state, 'plain_text');
    assert.equal(res.body_text, 'Unauthorized');
    assert.equal(res.body_json, null);
    assert.equal(res.failure_kind, 'failed_authentication_or_access');
  });

  it('bdlRequest classifies 400 as failed_invalid_request (BDL §15A.1)', async () => {
    const fakeFetch: FetchLike = async () => ({
      status: 400,
      headers: {
        get: (name: string) => (name.toLowerCase() === 'content-type' ? 'application/json' : null),
      },
      text: async () => JSON.stringify({ errors: [{ param: 'per_page', error: 'invalid' }] }),
    });
    const res = await bdlRequest(
      { ...DEFAULT_BDL_CONFIG, fetch: fakeFetch },
      { endpoint: 'player_stats' },
      { Authorization: 'test-key' }
    );
    assert.equal(res.status, 400);
    assert.equal(res.failure_kind, 'failed_invalid_request');
    assert.equal(res.parse_state, 'json_ok');
  });
});

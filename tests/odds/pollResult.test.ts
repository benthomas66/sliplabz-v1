// Ticket §7 required tests covered here:
//   Test #13: invalid-market 422 → failed_invalid_request.
//   Test #14: successful empty → distinct from failed.
//   Test #15: failed response (500) → failed_transport; last valid not overwritten.
//   Test #17: schema drift (200 with invalid body) → failed_schema_drift.
//
// Ticket §7 acceptance criterion E: empty success and failed poll produce
//                                    different states.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { classifyPollResult } from '../../src/odds/pollResult.js';

function load(name: string) {
  return JSON.parse(
    readFileSync(
      new URL(`../fixtures/odds/${name}`, import.meta.url),
      'utf8'
    )
  );
}

const invalid422 = load('quota-invalid-market-422.json');
const empty200 = load('successful-empty-response.json');
const failed500 = load('failed-response-500.json');
const drift200 = load('schema-drift-200.json');
const full200 = load('event-odds-1547-full.json');

describe('poll result classification (Odds §16.1, §19.3, §20)', () => {
  it('invalid-market 422 → failed_invalid_request; does NOT overwrite current', () => {
    const cls = classifyPollResult({
      http_status: invalid422.http_status,
      content_type: invalid422.headers['content-type'],
      parsed_body: invalid422.response,
      transport_error_detail: null,
    });
    assert.equal(cls.result_state, 'failed_invalid_request');
    assert.equal(cls.overwrites_last_valid_snapshot, false);
  });

  it('LOAD-BEARING: 200 with empty bookmakers → successful_empty; DOES overwrite current (§16.1)', () => {
    const cls = classifyPollResult({
      http_status: empty200.http_status,
      content_type: empty200.headers['content-type'],
      parsed_body: empty200.response,
      transport_error_detail: null,
    });
    assert.equal(cls.result_state, 'successful_empty');
    assert.equal(cls.overwrites_last_valid_snapshot, true);
  });

  it('LOAD-BEARING: 500 failed poll → failed_transport; NEVER overwrites current', () => {
    const cls = classifyPollResult({
      http_status: failed500.http_status,
      content_type: failed500.headers['content-type'],
      parsed_body: null,
      transport_error_detail: null,
    });
    assert.equal(cls.result_state, 'failed_transport');
    assert.equal(cls.overwrites_last_valid_snapshot, false);
    // Distinct from successful_empty.
    assert.notEqual(cls.result_state, 'successful_empty');
  });

  it('transport error (no HTTP response) → failed_transport', () => {
    const cls = classifyPollResult({
      http_status: 0,
      content_type: null,
      parsed_body: null,
      transport_error_detail: 'ETIMEDOUT',
    });
    assert.equal(cls.result_state, 'failed_transport');
    assert.equal(cls.overwrites_last_valid_snapshot, false);
  });

  it('LOAD-BEARING: 200 with invalid body (schema drift) → failed_schema_drift; raw preserved by caller', () => {
    const cls = classifyPollResult({
      http_status: drift200.http_status,
      content_type: drift200.headers['content-type'],
      parsed_body: drift200.response,
      transport_error_detail: null,
    });
    assert.equal(cls.result_state, 'failed_schema_drift');
    assert.equal(cls.overwrites_last_valid_snapshot, false);
    assert.match(cls.detail, /schema drift/i);
  });

  it('200 with a valid schema → complete', () => {
    const cls = classifyPollResult({
      http_status: full200.http_status,
      content_type: full200.headers['content-type'],
      parsed_body: full200.response,
      transport_error_detail: null,
    });
    assert.equal(cls.result_state, 'complete');
    assert.equal(cls.overwrites_last_valid_snapshot, true);
  });

  it('401 vs 403 vs 404 vs 429 map to distinct failure states', () => {
    for (const [status, expected] of [
      [401, 'failed_authentication_or_access'],
      [403, 'failed_forbidden_or_subscription'],
      [404, 'failed_not_found'],
      [429, 'failed_rate_limited'],
      [502, 'failed_transport'],
      [503, 'failed_transport'],
    ] as const) {
      const cls = classifyPollResult({
        http_status: status,
        content_type: null,
        parsed_body: null,
        transport_error_detail: null,
      });
      assert.equal(cls.result_state, expected, `status ${status}`);
      assert.equal(cls.overwrites_last_valid_snapshot, false);
    }
  });
});

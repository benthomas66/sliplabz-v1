// V1-4 governor obligation: live-invoke gate MUST refuse to build a
// live-fetch config unless BOTH allow_live_invoke=true AND the env opt-in
// is present. This test proves tests cannot reach a live config.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  LiveInvokeGateError,
  buildLiveBdlConfig,
  buildLiveOddsapiConfig,
} from '../../src/lines/liveInvokeGate.js';

describe('live-invoke gate (V1-4 review obligation)', () => {
  it('Odds: refuses when allow_live_invoke is false, even with env=1', () => {
    assert.throws(
      () =>
        buildLiveOddsapiConfig({
          allow_live_invoke: false,
          env: { ODDSAPI_LIVE_INVOKE: '1' },
        }),
      LiveInvokeGateError
    );
  });

  it('Odds: refuses when env is missing, even with allow_live_invoke=true', () => {
    assert.throws(
      () =>
        buildLiveOddsapiConfig({
          allow_live_invoke: true,
          env: {},
        }),
      LiveInvokeGateError
    );
  });

  it('Odds: refuses when env is any value OTHER than "1"', () => {
    for (const v of ['0', 'true', 'yes', 'ON', '']) {
      assert.throws(
        () =>
          buildLiveOddsapiConfig({
            allow_live_invoke: true,
            env: { ODDSAPI_LIVE_INVOKE: v },
          }),
        LiveInvokeGateError,
        `env=${v}`
      );
    }
  });

  it('LOAD-BEARING: Odds refuses in the current test environment even when allow_live_invoke=true (env not opted in)', () => {
    assert.throws(
      () =>
        buildLiveOddsapiConfig({
          allow_live_invoke: true,
          // env argument omitted → reads process.env, which does not set
          // ODDSAPI_LIVE_INVOKE=1 in the test runner.
        }),
      LiveInvokeGateError
    );
  });

  it('BDL: same gate, same rules', () => {
    assert.throws(
      () =>
        buildLiveBdlConfig({
          allow_live_invoke: false,
          env: { BDL_LIVE_INVOKE: '1' },
        }),
      LiveInvokeGateError
    );
    assert.throws(
      () => buildLiveBdlConfig({ allow_live_invoke: true, env: {} }),
      LiveInvokeGateError
    );
  });

  it('LOAD-BEARING: the gate returns a config ONLY when BOTH conditions align AND a fetch is injected', () => {
    // Even the fully-opted-in case requires that the caller supplies a real
    // fetch. This test injects a stub `fetch` and both opt-ins, then verifies
    // the config carries the fetch.
    const stub_fetch = () =>
      Promise.resolve({
        status: 200,
        headers: { get: () => null },
        text: () => Promise.resolve(''),
      });
    const cfg = buildLiveOddsapiConfig({
      allow_live_invoke: true,
      fetch: stub_fetch as any,
      env: { ODDSAPI_LIVE_INVOKE: '1' },
    });
    assert.ok(cfg.fetch === stub_fetch);
    assert.equal(cfg.allow_live_invoke, true);
  });
});

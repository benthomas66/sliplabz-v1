// V1-4c Phase B — unit tests for the pure helpers in
// src/lines/historicalLineResultsBackfill.ts.
//
// The integration behaviour (batching, UPSERT, idempotency, rollback) is
// exercised by tests/integration/v1_4c_phase_b_backfill.integration.test.ts
// against a live Postgres.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  BACKFILL_PROVENANCE,
  DEFAULT_BATCH_SIZE,
  HISTORICAL_LINE_RESULTS_BACKFILL_ELIGIBILITY_SQL,
  extractStatValue,
} from '../../src/lines/historicalLineResultsBackfill.js';

describe('V1-4c Phase B populator — pure helpers', () => {
  it('BACKFILL_PROVENANCE is exactly "backfilled_historical" per the V1-4b CHECK-widening migration', () => {
    assert.equal(BACKFILL_PROVENANCE, 'backfilled_historical');
  });

  it('DEFAULT_BATCH_SIZE is a small positive integer suitable for hosted UPSERT batches', () => {
    assert.ok(Number.isInteger(DEFAULT_BATCH_SIZE));
    assert.ok(DEFAULT_BATCH_SIZE > 0);
    assert.ok(DEFAULT_BATCH_SIZE <= 1000);
  });

  it('the exported eligibility SQL mirrors the recomputationWriter + Phase A §C.2 filter — no relabel-to-dodge', () => {
    const s = HISTORICAL_LINE_RESULTS_BACKFILL_ELIGIBILITY_SQL;
    assert.match(s, /ccp\.canonical_closing_point\s+IS\s+NOT\s+NULL/i);
    assert.match(s, /pgs\.eligibility_state\s*=\s*'eligible'/i);
    // Excludes selection_method values that produce a NULL canonical point
    // by construction (schema pairing on canonical_closing_points).
    assert.match(s, /ccp\.selection_method\s+IN\s*\(\s*'single_book'\s*,\s*'unique_modal'\s*\)/i);
    assert.match(s, /ccp\.coverage_label\s+IN\s*\(\s*'single_book'\s*,\s*'complete'\s*\)/i);
  });

  it('extractStatValue returns the numeric value when normalized_stats has a finite number', () => {
    assert.equal(extractStatValue({ pts: 21 }, 'pts'), 21);
    assert.equal(extractStatValue({ pts: 0 }, 'pts'), 0);
    assert.equal(extractStatValue({ fg3m: 2.5 }, 'fg3m'), 2.5);
  });

  it('extractStatValue returns null on missing / null / non-finite / non-numeric — absence is absence', () => {
    assert.equal(extractStatValue({}, 'pts'), null);
    assert.equal(extractStatValue({ pts: null }, 'pts'), null);
    assert.equal(extractStatValue({ pts: '21' }, 'pts'), null);
    assert.equal(extractStatValue({ pts: NaN }, 'pts'), null);
    assert.equal(extractStatValue({ pts: Infinity }, 'pts'), null);
    assert.equal(extractStatValue({ pts: -Infinity }, 'pts'), null);
  });
});

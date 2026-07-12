// Ticket §6 required test covered here:
//   - null counting stat on played row → normalized to zero
//
// Ticket hard invariant: null-to-zero applies ONLY to eligible played rows.
// Null on non-played rows never normalizes.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  extractRawCountingStats,
  normalizeCountingStats,
  COUNTING_STAT_FIELDS,
} from '../../src/bdl/countingStats.js';

const raw_all_null = {
  pts: null,
  reb: null,
  ast: null,
  fg3m: null,
  stl: null,
  blk: null,
  turnover: null,
  fgm: null,
  fga: null,
  fg3a: null,
  ftm: null,
  fta: null,
  oreb: null,
  dreb: null,
  pf: null,
};

describe('counting-stat normalization (BDL §9)', () => {
  it('extractRawCountingStats preserves null-vs-number distinction on all 15 fields', () => {
    const row = { pts: 12, reb: null, ast: 3 } as any;
    const raw = extractRawCountingStats(row);
    assert.equal(raw.pts, 12);
    assert.equal(raw.reb, null);
    assert.equal(raw.ast, 3);
    for (const field of COUNTING_STAT_FIELDS) {
      const v = raw[field];
      assert.ok(v === null || typeof v === 'number');
    }
  });

  it('LOAD-BEARING: eligible played row with null pts/reb → normalized 0/0', () => {
    const raw = { ...raw_all_null, pts: null, reb: null } as any;
    const normalized = normalizeCountingStats(raw, 'played', true);
    assert.equal(normalized.pts, 0);
    assert.equal(normalized.reb, 0);
    for (const field of COUNTING_STAT_FIELDS) {
      assert.equal(normalized[field], 0, `field ${field} should have been null-to-zero`);
    }
  });

  it('LOAD-BEARING: non-played row (dnp) with null counting stats → nulls RETAINED', () => {
    const raw = raw_all_null as any;
    const normalized = normalizeCountingStats(raw, 'dnp', false);
    for (const field of COUNTING_STAT_FIELDS) {
      assert.equal(
        normalized[field],
        null,
        `dnp row must not receive played-row normalization; ${field} coerced`
      );
    }
  });

  it('unresolved-minutes row with null counting stats → nulls RETAINED', () => {
    const raw = raw_all_null as any;
    const normalized = normalizeCountingStats(raw, 'unresolved_non_numeric', false);
    for (const field of COUNTING_STAT_FIELDS) {
      assert.equal(normalized[field], null);
    }
  });

  it('played row that is NOT eligible (missing referential integrity) → nulls RETAINED', () => {
    const raw = raw_all_null as any;
    const normalized = normalizeCountingStats(raw, 'played', false);
    for (const field of COUNTING_STAT_FIELDS) {
      assert.equal(normalized[field], null);
    }
  });

  it('mixed played row: null pts + real reb → pts becomes 0, reb unchanged', () => {
    const raw = { ...raw_all_null, pts: null, reb: 7 } as any;
    const normalized = normalizeCountingStats(raw, 'played', true);
    assert.equal(normalized.pts, 0);
    assert.equal(normalized.reb, 7);
  });
});

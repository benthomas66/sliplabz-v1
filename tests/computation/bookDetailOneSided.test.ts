// V1-5x RME-3 unit tests — BookDetailResult.one_sided classification.
//
// Anchors:
//   EVIDENCE_PROFILE_METHOD_V1.md §A.4 binding, §C.7 / DR-18.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { classifyOneSided, computeBookDetail } from '../../src/computation/bookDetail.js';
import type { CurrentOffering } from '../../src/computation/types.js';

function off(bm: string, point: number, over: number | null, under: number | null): CurrentOffering {
  return Object.freeze({
    bookmaker_key: bm,
    display_title: bm,
    point,
    over_price: over,
    under_price: under,
    provider_last_update: null,
    observed_at: '2026-07-14T20:00:00Z',
    source_snapshot_id: 'snap-1',
    market_offering_id: `off-${bm}-${point}-${over ?? 'n'}-${under ?? 'n'}`,
  });
}

describe('classifyOneSided (RME-3)', () => {
  it('LOAD-BEARING: empty offering set → null (no eligible sportsbook offerings)', () => {
    assert.equal(classifyOneSided([]), null);
  });

  it('all books quote both sides → "neither" (grain is NOT one-sided)', () => {
    const offs = [off('draftkings', 12.5, -110, -110), off('fanduel', 12.5, -108, -112)];
    assert.equal(classifyOneSided(offs), 'neither');
  });

  it('LOAD-BEARING (DR-18): every book quotes Over only, no Under anywhere → "over_only"', () => {
    const offs = [off('draftkings', 12.5, -110, null), off('fanduel', 12.5, -108, null)];
    assert.equal(classifyOneSided(offs), 'over_only');
  });

  it('LOAD-BEARING (DR-18): every book quotes Under only, no Over anywhere → "under_only"', () => {
    const offs = [off('draftkings', 8.5, null, -110), off('fanduel', 8.5, null, -110)];
    assert.equal(classifyOneSided(offs), 'under_only');
  });

  it('mixed: some books over-only, some books two-sided → "neither" (grain has both sides)', () => {
    const offs = [off('draftkings', 12.5, -110, null), off('fanduel', 12.5, -110, -110)];
    assert.equal(classifyOneSided(offs), 'neither');
  });

  it('rows present but every price null → null (no side is quoted at all)', () => {
    const offs = [off('draftkings', 12.5, null, null)];
    assert.equal(classifyOneSided(offs), null);
  });

  it('non-fabrication: classification derives strictly from over_price / under_price null bits', () => {
    // Prove the classification never inspects book identity or point;
    // any offering set that is missing the Under price everywhere is
    // over_only regardless of book count or point spread.
    const offs = [
      off('draftkings', 10.5, -105, null),
      off('fanduel',    11.0, -110, null),
      off('betmgm',     11.5, -120, null),
    ];
    assert.equal(classifyOneSided(offs), 'over_only');
  });
});

describe('computeBookDetail — RME-3 field wired through owning composer', () => {
  it('two-sided → one_sided = "neither", offerings sorted, method_version = 2', () => {
    const offs = [off('fanduel', 12.5, -110, -110), off('draftkings', 12.5, -108, -112)];
    const r = computeBookDetail(offs);
    assert.equal(r.one_sided, 'neither');
    assert.equal(r.offerings.length, 2);
    // Deterministic order: bookmaker_key ASC.
    assert.equal(r.offerings[0]!.bookmaker_key, 'draftkings');
    assert.equal(r.offerings[1]!.bookmaker_key, 'fanduel');
    assert.equal(r.method_version, 2);
  });

  it('empty offerings → one_sided null, offerings empty, method_version present', () => {
    const r = computeBookDetail([]);
    assert.equal(r.one_sided, null);
    assert.equal(r.offerings.length, 0);
    assert.equal(r.method_version, 2);
  });

  it('LOAD-BEARING (DR-18): one_sided "over_only" is consumable directly by V1-A1-3 §C.7', () => {
    const offs = [off('draftkings', 22.5, -110, null), off('fanduel', 22.5, -108, null)];
    const r = computeBookDetail(offs);
    // The engine reads this field verbatim — no evaluated-point context
    // required at the composer boundary.
    assert.equal(r.one_sided, 'over_only');
  });
});

// V1-8a0 — source-identity helper unit tests (pure; no DB).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveSourceIdentitySet, assertSourceIdentityKeySet,
  SOURCE_IDENTITY_KEYS, SOURCE_IDENTITY_FORBIDDEN_KEYS,
} from '../../src/evidence/v2/sourceIdentity.js';
import type { CurrentOffering } from '../../src/computation/types.js';

// DISTINCTIVE paid canary values that must NEVER survive into the identity set.
const CANARY_POINT = 24.5;
const CANARY_OVER = -137137;
const CANARY_UNDER = 424242;

function offering(book: string, title: string, point: number): CurrentOffering {
  return Object.freeze({
    bookmaker_key: book, display_title: title, point,
    over_price: CANARY_OVER, under_price: CANARY_UNDER,
    provider_last_update: '2026-07-28T00:00:00Z', observed_at: '2026-07-28T00:00:00Z',
    source_snapshot_id: `snap-${book}-HANDLE`, market_offering_id: `off-${book}-HANDLE`,
  });
}

test('deriveSourceIdentitySet: dedup by canonical id, alphabetical, names/IDs only', () => {
  const offerings = [
    offering('zeta_books', 'Zeta', 25.5),
    offering('alpha_books', 'Alpha', 24.5),
    offering('alpha_books', 'Alpha', 23.5),   // duplicate source, different point/side
    offering('mid_books', 'Mid', 24.5),
    offering('alpha_books', 'Alpha', 24.0),   // duplicate again
  ];
  const set = deriveSourceIdentitySet(offerings);
  // Dedup: 3 distinct sources (the 3 alpha offerings collapse to one).
  assert.deepEqual(set.map((s) => s.normalized_source_id), ['alpha_books', 'mid_books', 'zeta_books']);
  assert.deepEqual(set.map((s) => s.display_name), ['Alpha', 'Mid', 'Zeta']);
  // Each object carries EXACTLY the two identity keys — nothing else.
  for (const s of set) {
    assert.deepEqual(Object.keys(s).sort(), [...SOURCE_IDENTITY_KEYS].sort());
  }
  // No paid canary value anywhere in the serialized set.
  const blob = JSON.stringify(set);
  assert.ok(!blob.includes(String(CANARY_POINT)), 'point leaked');
  assert.ok(!blob.includes(String(CANARY_OVER)), 'over price leaked');
  assert.ok(!blob.includes(String(CANARY_UNDER)), 'under price leaked');
  assert.ok(!blob.includes('HANDLE'), 'a paid offering handle (snapshot/offering id) leaked');
});

test('dedup can never reveal how many offers or sides a source contributed', () => {
  // One source with FIVE offerings (both sides, many points) → exactly ONE identity.
  const many = [1, 2, 3, 4, 5].map((i) => offering('solo_book', 'Solo', 20 + i));
  const set = deriveSourceIdentitySet(many);
  assert.equal(set.length, 1);
  assert.equal(set[0]!.normalized_source_id, 'solo_book');
});

test('assertSourceIdentityKeySet accepts the exact allowlist and throws on any forbidden/extra key', () => {
  assert.doesNotThrow(() => assertSourceIdentityKeySet({ normalized_source_id: 'a', display_name: 'A' }));
  for (const bad of ['point', 'price', 'over_price', 'side', 'market_offering_id', 'source_snapshot_id']) {
    const smuggled = { normalized_source_id: 'a', display_name: 'A', [bad]: 1 } as never;
    assert.throws(() => assertSourceIdentityKeySet(smuggled), /FORBIDDEN|unexpected/i);
    assert.ok((SOURCE_IDENTITY_FORBIDDEN_KEYS as readonly string[]).includes(bad));
  }
  // A random unexpected key also throws.
  assert.throws(() => assertSourceIdentityKeySet({ normalized_source_id: 'a', display_name: 'A', surprise: 1 } as never), /unexpected/i);
});

test('empty offering set yields an empty identity set (genuine no-sources, not a fabricated value)', () => {
  assert.deepEqual(deriveSourceIdentitySet([]), []);
});

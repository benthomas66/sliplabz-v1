// V1-5 unit-test fixture builders.
//
// Each helper returns a deep-frozen `CurrentOffering` (or list thereof)
// so tests cannot accidentally mutate shared state between assertions.

import type { CurrentOffering } from '../../../src/computation/types.js';

export function offering(overrides: Partial<CurrentOffering> = {}): CurrentOffering {
  return Object.freeze({
    bookmaker_key: 'draftkings',
    display_title: 'DraftKings',
    point: 12.5,
    over_price: -110,
    under_price: -110,
    provider_last_update: '2026-07-13T22:00:00Z',
    observed_at: '2026-07-13T22:00:00Z',
    source_snapshot_id: 'snap-1',
    market_offering_id: 'off-1',
    ...overrides,
  });
}

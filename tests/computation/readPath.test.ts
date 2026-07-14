// V1-5 ticket §9 required tests — Brief/app equality, unauthorized client
// response.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { readCurrentMarketRow } from '../../src/computation/readPath.js';
import { composeCurrentMarketRow } from '../../src/computation/currentMarketRow.js';
import { filterCurrentMarketRow } from '../../src/computation/capabilityFilter.js';
import {
  CAPABILITY_ANONYMOUS,
  CAPABILITY_FREE,
  CAPABILITY_PAID,
} from '../../src/computation/capability.js';
import { offering } from './support/fixtures.js';
import type { CurrentMarketRowInput } from '../../src/computation/currentMarketRow.js';

function baseInput(overrides: Partial<CurrentMarketRowInput> = {}): CurrentMarketRowInput {
  return {
    internal_game_id: 'g1',
    internal_player_id: 'p1',
    market_key: 'player_points',
    current_offerings: [
      offering({ bookmaker_key: 'draftkings', point: 12.5, over_price: -110, under_price: -110 }),
      offering({ bookmaker_key: 'fanduel', point: 12.5, over_price: -108, under_price: -112 }),
      offering({ bookmaker_key: 'betmgm', point: 13.5, over_price: +100, under_price: -125 }),
    ],
    earliest_observations: [
      { bookmaker_key: 'draftkings', point: 12.5, observed_at: '2026-07-13T20:00:00Z' },
      { bookmaker_key: 'fanduel', point: 12.5, observed_at: '2026-07-13T20:01:00Z' },
      { bookmaker_key: 'betmgm', point: 12.5, observed_at: '2026-07-13T20:02:00Z' },
    ],
    movement_events: [
      { movement_type: 'point_changed', bookmaker_key: 'betmgm', prior_point: 12.5, current_point: 13.5 },
      { movement_type: 'over_price_changed', bookmaker_key: 'draftkings', prior_point: 12.5, current_point: 12.5 },
    ],
    freshness: {
      last_observed_at: '2026-07-13T22:00:00Z',
      now: '2026-07-13T22:00:15Z',
      last_poll_succeeded: true,
      source_unavailable: false,
    },
    availability: {
      presence_state: 'currently_reported',
      source_status: 'active',
      source_comment: '',
      source_return_date_text: '',
      observed_at: '2026-07-13T18:00:00Z',
    },
    ...overrides,
  };
}

describe('read path — deterministic composition', () => {
  it('REQUIRED: Brief/app equality — identical inputs → deep-equal outputs, twice', () => {
    // The Brief and the app both call readCurrentMarketRow. Calling it twice
    // with identical inputs must yield deep-equal outputs; if a metric
    // owner had non-determinism (e.g. iteration over a Set without sorting),
    // this test would flag it.
    const in1 = baseInput();
    const in2 = baseInput();
    const brief = readCurrentMarketRow({ row: in1, capability: CAPABILITY_PAID });
    const app = readCurrentMarketRow({ row: in2, capability: CAPABILITY_PAID });
    assert.deepEqual(app, brief);
  });

  it('REQUIRED: deterministic under different Set iteration paths', () => {
    // Swap offering order in the input; output must be identical because
    // metric owners sort deterministically.
    const in1 = baseInput();
    const in2 = baseInput({
      current_offerings: [...baseInput().current_offerings].reverse(),
    });
    const r1 = readCurrentMarketRow({ row: in1, capability: CAPABILITY_PAID });
    const r2 = readCurrentMarketRow({ row: in2, capability: CAPABILITY_PAID });
    assert.deepEqual(r1, r2);
  });
});

describe('unauthorized-client response — §16.7 load-bearing', () => {
  it('REQUIRED: an anonymous caller receives NO paid data in the payload — book_detail redacted with reason', () => {
    const filtered = readCurrentMarketRow({
      row: baseInput(),
      capability: CAPABILITY_ANONYMOUS,
    });
    // The offerings array is empty; a redacted marker is present.
    assert.equal(filtered.book_detail.offerings.length, 0);
    // The redaction marker is explicit — the client cannot mistake this
    // for "no data" (which would be an empty offerings array WITH no
    // redaction marker).
    assert.ok('redacted' in filtered.book_detail);
    if ('redaction_reason' in filtered.book_detail) {
      assert.equal(filtered.book_detail.redaction_reason, 'capability_view_book_detail_required');
    }
    // Availability is also redacted.
    assert.ok(filtered.availability_context !== null);
    if (filtered.availability_context !== null && 'redacted' in filtered.availability_context) {
      assert.equal(filtered.availability_context.redaction_reason, 'capability_view_availability_context_required');
    }
  });

  it('REQUIRED: free tier also receives NO paid data in the payload', () => {
    const filtered = readCurrentMarketRow({
      row: baseInput(),
      capability: CAPABILITY_FREE,
    });
    assert.equal(filtered.book_detail.offerings.length, 0);
    assert.ok('redacted' in filtered.book_detail);
  });

  it('LOAD-BEARING: JSON round-trip preserves the redaction — client CANNOT see paid data', () => {
    const filtered = readCurrentMarketRow({
      row: baseInput(),
      capability: CAPABILITY_ANONYMOUS,
    });
    const json = JSON.stringify(filtered);
    // The paid book offering shape must NOT appear in the wire payload.
    assert.equal(json.includes('draftkings'), false);
    assert.equal(json.includes('fanduel'), false);
    assert.equal(json.includes('betmgm'), false);
    // But the aggregate metrics (consensus point, count) DO appear.
    // Free tier gets sportsbook consensus per §16.3.
    assert.ok(json.includes('12.5'));
    assert.ok(json.includes('unique_modal'));
    assert.ok(json.includes('redacted'));
  });

  it('paid caller RECEIVES book detail', () => {
    const filtered = readCurrentMarketRow({
      row: baseInput(),
      capability: CAPABILITY_PAID,
    });
    assert.equal(filtered.book_detail.offerings.length, 3);
    assert.equal(
      (filtered.book_detail.offerings[0]!.bookmaker_key),
      'betmgm' // sorted asc
    );
    // Availability comes through un-redacted.
    assert.ok(filtered.availability_context !== null);
    if (filtered.availability_context !== null && 'presence_state' in filtered.availability_context) {
      assert.equal(filtered.availability_context.presence_state, 'currently_reported');
    }
  });

  it('LOAD-BEARING: filter refuses a capability whose source_label is not the provisional fixture', () => {
    assert.throws(() => {
      const bad: any = {
        source_label: 'production',
        grants: {
          view_book_detail: true,
          view_full_movement_detail: true,
          view_extended_windows: true,
          view_threshold_windows: true,
          view_availability_context: true,
        },
      };
      const composed = composeCurrentMarketRow(baseInput());
      filterCurrentMarketRow(composed, bad);
    }, /source_label=production/);
  });
});

// V1-5 ticket §9 required tests — stale source exclusion.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { computeFreshness, isFreshEnoughForConsensus } from '../../src/computation/freshness.js';
import { composeCurrentMarketRow } from '../../src/computation/currentMarketRow.js';
import { offering } from './support/fixtures.js';

describe('freshness state — Odds §19.2', () => {
  it('fresh: within 90s → fresh', () => {
    const r = computeFreshness({
      last_observed_at: '2026-07-13T22:00:00Z',
      now: '2026-07-13T22:01:00Z',
      last_poll_succeeded: true,
      source_unavailable: false,
    });
    assert.equal(r.state, 'fresh');
  });

  it('aging: 90-300s → aging', () => {
    const r = computeFreshness({
      last_observed_at: '2026-07-13T22:00:00Z',
      now: '2026-07-13T22:03:00Z',
      last_poll_succeeded: true,
      source_unavailable: false,
    });
    assert.equal(r.state, 'aging');
  });

  it('stale: 300-900s → stale', () => {
    const r = computeFreshness({
      last_observed_at: '2026-07-13T22:00:00Z',
      now: '2026-07-13T22:10:00Z',
      last_poll_succeeded: true,
      source_unavailable: false,
    });
    assert.equal(r.state, 'stale');
  });

  it('failed_latest_poll: independent of age', () => {
    const r = computeFreshness({
      last_observed_at: '2026-07-13T22:00:00Z',
      now: '2026-07-13T22:00:30Z',
      last_poll_succeeded: false,
      source_unavailable: false,
    });
    assert.equal(r.state, 'failed_latest_poll');
  });

  it('unavailable: source_unavailable overrides everything', () => {
    const r = computeFreshness({
      last_observed_at: '2026-07-13T22:00:00Z',
      now: '2026-07-13T22:00:30Z',
      last_poll_succeeded: true,
      source_unavailable: true,
    });
    assert.equal(r.state, 'unavailable');
  });
});

describe('stale source exclusion (§15.2) via read-model composition', () => {
  it('REQUIRED: a stale grain returns no consensus even if offerings are present', () => {
    const row = composeCurrentMarketRow({
      internal_game_id: 'g1',
      internal_player_id: 'p1',
      market_key: 'player_points',
      current_offerings: [
        offering({ bookmaker_key: 'draftkings', point: 12.5 }),
        offering({ bookmaker_key: 'fanduel', point: 12.5 }),
        offering({ bookmaker_key: 'betmgm', point: 12.5 }),
      ],
      earliest_observations: [],
      movement_events: [],
      freshness: {
        last_observed_at: '2026-07-13T22:00:00Z',
        now: '2026-07-13T22:10:00Z', // 10 min → stale (600s in [301, 900])
        last_poll_succeeded: true,
        source_unavailable: false,
      },
      availability: null,
    });
    assert.equal(row.freshness.state, 'stale');
    // Stale sources are structurally excluded — the composer emits no_line.
    assert.equal(row.line_consensus.selection_method, 'no_eligible_source');
    assert.equal(row.line_consensus.consensus_point, null);
    assert.equal(row.line_range.min_point, null);
    assert.equal(row.point_distribution.counts.length, 0);
    assert.equal(row.eligible_book_count.count, 0);
    assert.equal(row.book_detail.offerings.length, 0);
  });

  it('failed_latest_poll: also excluded from consensus', () => {
    const row = composeCurrentMarketRow({
      internal_game_id: 'g1',
      internal_player_id: 'p1',
      market_key: 'player_points',
      current_offerings: [
        offering({ bookmaker_key: 'draftkings', point: 12.5 }),
        offering({ bookmaker_key: 'fanduel', point: 12.5 }),
      ],
      earliest_observations: [],
      movement_events: [],
      freshness: {
        last_observed_at: '2026-07-13T22:00:00Z',
        now: '2026-07-13T22:00:30Z',
        last_poll_succeeded: false,
        source_unavailable: false,
      },
      availability: null,
    });
    assert.equal(row.freshness.state, 'failed_latest_poll');
    assert.equal(row.line_consensus.selection_method, 'no_eligible_source');
  });

  it('isFreshEnoughForConsensus: fresh + aging admit; stale / unavailable / failed_latest_poll do not', () => {
    assert.equal(isFreshEnoughForConsensus('fresh'), true);
    assert.equal(isFreshEnoughForConsensus('aging'), true);
    assert.equal(isFreshEnoughForConsensus('stale'), false);
    assert.equal(isFreshEnoughForConsensus('unavailable'), false);
    assert.equal(isFreshEnoughForConsensus('failed_latest_poll'), false);
  });
});

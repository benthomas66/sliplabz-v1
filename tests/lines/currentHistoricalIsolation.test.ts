// Ticket §8 required test covered here:
//   Test #17: historical record excluded from current selection
//
// Ticket §8 acceptance criterion: current and historical snapshots cannot mix.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  CURRENT_ONLY_WHERE_CLAUSE,
  isCurrentSelfObserved,
  isHistoricalOrBackfilled,
} from '../../src/lines/currentHistoricalIsolation.js';

describe('current/historical isolation (Odds §16.1, spec §11.4)', () => {
  it('CURRENT_ONLY_WHERE_CLAUSE is the canonical SQL fragment', () => {
    assert.equal(
      CURRENT_ONLY_WHERE_CLAUSE,
      `request_kind = 'current_poll' AND provenance = 'self_observed'`
    );
  });

  it('LOAD-BEARING: (current_poll, self_observed) → eligible', () => {
    assert.equal(
      isCurrentSelfObserved({
        request_kind: 'current_poll',
        provenance: 'self_observed',
      }),
      true
    );
  });

  it('LOAD-BEARING: (historical_query, backfilled_historical) → EXCLUDED', () => {
    const row = {
      request_kind: 'historical_query',
      provenance: 'backfilled_historical',
    };
    assert.equal(isCurrentSelfObserved(row), false);
    assert.equal(isHistoricalOrBackfilled(row), true);
  });

  it('LOAD-BEARING: (historical_query, self_observed) still excluded — request_kind alone disqualifies', () => {
    const row = {
      request_kind: 'historical_query',
      provenance: 'self_observed',
    };
    assert.equal(isCurrentSelfObserved(row), false);
    assert.equal(isHistoricalOrBackfilled(row), true);
  });

  it('LOAD-BEARING: (current_poll, backfilled_historical) also excluded — provenance alone disqualifies', () => {
    const row = {
      request_kind: 'current_poll',
      provenance: 'backfilled_historical',
    };
    assert.equal(isCurrentSelfObserved(row), false);
    assert.equal(isHistoricalOrBackfilled(row), true);
  });

  it('(event_discovery, self_observed) is not eligible for current-line selection but is not "historical"', () => {
    const row = {
      request_kind: 'event_discovery',
      provenance: 'self_observed',
    };
    assert.equal(isCurrentSelfObserved(row), false);
    assert.equal(isHistoricalOrBackfilled(row), false);
  });
});

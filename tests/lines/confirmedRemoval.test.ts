// Ticket §8 required tests covered here:
//   Test #6: source removed once (single_omission)
//   Test #7: source removed twice (confirmed_removed)
//   Test #8: failed poll between valid polls (state unchanged)
//
// V1-4 correction (governor review): reappearance after confirmed_removed
// MUST hold state and signal `requires_new_lifecycle_row = true`. The write
// layer inserts a new observed_line_lifecycle row at generation + 1 rather
// than mutating the frozen prior generation.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { transitionPresence } from '../../src/lines/confirmedRemoval.js';

describe('confirmed-removal state machine (Odds §17, spec §13.3)', () => {
  it('Test #6: source removed ONCE from `present` → `single_omission`, count=1', () => {
    const r = transitionPresence({
      prior_state: 'present',
      prior_consecutive_omission_count: 0,
      current_poll_succeeded: true,
      present_in_current_poll: false,
      event_has_started: false,
      source_or_market_unavailable: false,
    });
    assert.equal(r.next_state, 'single_omission');
    assert.equal(r.next_consecutive_omission_count, 1);
    assert.equal(r.newly_confirmed_removed, false);
    assert.equal(r.requires_new_lifecycle_row, false);
  });

  it('Test #7: source removed TWICE (single_omission + another successful omission) → `confirmed_removed`, count=2', () => {
    const r = transitionPresence({
      prior_state: 'single_omission',
      prior_consecutive_omission_count: 1,
      current_poll_succeeded: true,
      present_in_current_poll: false,
      event_has_started: false,
      source_or_market_unavailable: false,
    });
    assert.equal(r.next_state, 'confirmed_removed');
    assert.equal(r.next_consecutive_omission_count, 2);
    assert.equal(r.newly_confirmed_removed, true);
    assert.equal(r.requires_new_lifecycle_row, false);
  });

  it('LOAD-BEARING Test #8: FAILED poll between valid polls holds state; count does NOT increment', () => {
    const r = transitionPresence({
      prior_state: 'single_omission',
      prior_consecutive_omission_count: 1,
      current_poll_succeeded: false,
      present_in_current_poll: false,
      event_has_started: false,
      source_or_market_unavailable: false,
    });
    assert.equal(r.next_state, 'single_omission');
    assert.equal(r.next_consecutive_omission_count, 1);
    assert.equal(r.newly_confirmed_removed, false);
    assert.equal(r.requires_new_lifecycle_row, false);
  });

  it('LOAD-BEARING: source_or_market_unavailable poll holds state; count does NOT increment', () => {
    const r = transitionPresence({
      prior_state: 'single_omission',
      prior_consecutive_omission_count: 1,
      current_poll_succeeded: true,
      present_in_current_poll: false,
      event_has_started: false,
      source_or_market_unavailable: true,
    });
    assert.equal(r.next_state, 'single_omission');
    assert.equal(r.next_consecutive_omission_count, 1);
    assert.equal(r.requires_new_lifecycle_row, false);
  });

  it('presence resets count to 0 and returns to `present` (from single_omission)', () => {
    const r = transitionPresence({
      prior_state: 'single_omission',
      prior_consecutive_omission_count: 1,
      current_poll_succeeded: true,
      present_in_current_poll: true,
      event_has_started: false,
      source_or_market_unavailable: false,
    });
    assert.equal(r.next_state, 'present');
    assert.equal(r.next_consecutive_omission_count, 0);
    assert.equal(r.requires_new_lifecycle_row, false);
  });

  it('presence stays `present` with count 0 when observed and prior was already present', () => {
    const r = transitionPresence({
      prior_state: 'present',
      prior_consecutive_omission_count: 0,
      current_poll_succeeded: true,
      present_in_current_poll: true,
      event_has_started: false,
      source_or_market_unavailable: false,
    });
    assert.equal(r.next_state, 'present');
    assert.equal(r.next_consecutive_omission_count, 0);
    assert.equal(r.requires_new_lifecycle_row, false);
  });

  it('LOAD-BEARING: REAPPEARANCE after confirmed_removed HOLDS state (confirmed_removed/2) and sets requires_new_lifecycle_row=true — NEVER present/0', () => {
    const r = transitionPresence({
      prior_state: 'confirmed_removed',
      prior_consecutive_omission_count: 2,
      current_poll_succeeded: true,
      present_in_current_poll: true,
      event_has_started: false,
      source_or_market_unavailable: false,
    });
    // Prior generation is frozen at confirmed_removed/2.
    assert.equal(r.next_state, 'confirmed_removed');
    assert.equal(r.next_consecutive_omission_count, 2);
    // Not "newly" confirmed — the removal already happened earlier.
    assert.equal(r.newly_confirmed_removed, false);
    // The write layer MUST insert a NEW lifecycle row at generation + 1.
    assert.equal(r.requires_new_lifecycle_row, true);
    // Explicitly assert we never walked backward.
    assert.notEqual(r.next_state, 'present');
    assert.notEqual(r.next_consecutive_omission_count, 0);
  });

  it('LOAD-BEARING: absence after confirmed_removed HOLDS state; requires_new_lifecycle_row stays false', () => {
    const r = transitionPresence({
      prior_state: 'confirmed_removed',
      prior_consecutive_omission_count: 2,
      current_poll_succeeded: true,
      present_in_current_poll: false,
      event_has_started: false,
      source_or_market_unavailable: false,
    });
    assert.equal(r.next_state, 'confirmed_removed');
    assert.equal(r.next_consecutive_omission_count, 2);
    assert.equal(r.newly_confirmed_removed, false);
    assert.equal(r.requires_new_lifecycle_row, false);
  });

  it('LOAD-BEARING: FAILED poll after confirmed_removed HOLDS state; no new-row signal even if the offering would have been present', () => {
    const r = transitionPresence({
      prior_state: 'confirmed_removed',
      prior_consecutive_omission_count: 2,
      current_poll_succeeded: false, // failed poll cannot be an observation
      present_in_current_poll: true,
      event_has_started: false,
      source_or_market_unavailable: false,
    });
    assert.equal(r.next_state, 'confirmed_removed');
    assert.equal(r.next_consecutive_omission_count, 2);
    assert.equal(r.requires_new_lifecycle_row, false);
  });

  it('event_has_started freezes disappearance state (§17)', () => {
    const r = transitionPresence({
      prior_state: 'single_omission',
      prior_consecutive_omission_count: 1,
      current_poll_succeeded: true,
      present_in_current_poll: false,
      event_has_started: true,
      source_or_market_unavailable: false,
    });
    assert.equal(r.next_state, 'single_omission');
    assert.equal(r.next_consecutive_omission_count, 1);
    assert.equal(r.requires_new_lifecycle_row, false);
  });
});

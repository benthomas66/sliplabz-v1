// Ticket §8b required tests covered here:
//   #2:  clean final pre-tip snapshot (eligible)
//   #5:  offering absent from final snapshot but present earlier — must remain excluded
//   #9:  unsupported market slice (filtered)
//
// Ticket §8b hard invariants (structural checks):
//   * DFS/pick'em rows NEVER enter sportsbook historical metrics
//   * Every returned candidate has close_capture_state = 'eligible' — no
//     candidate is created when snapshot is stale or absent

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { processHistoricalSnapshot } from '../../src/seed/historicalEventOdds.js';

function load(name: string) {
  return JSON.parse(
    readFileSync(new URL(`../fixtures/seed/${name}`, import.meta.url), 'utf8')
  );
}

describe('historical snapshot processing (§7.10.1, §14.11.1)', () => {
  it('LOAD-BEARING #2: clean final pre-tip snapshot → eligible; sportsbook candidates only (PrizePicks filtered)', () => {
    const fx = load('historical-event-odds-clean.json');
    const r = processHistoricalSnapshot({
      requested_close_boundary_utc: fx.requested_close_boundary_utc,
      response: fx.response_body,
    });
    assert.equal(r.close_capture.close_capture_state, 'eligible');
    // Two sportsbooks × player_points × Gabby Williams at 12.5 = 2 candidates.
    assert.equal(r.candidates.length, 2);
    const keys = r.candidates.map((c) => c.bookmaker_key).sort();
    assert.deepEqual(keys, ['draftkings', 'fanduel']);
    for (const c of r.candidates) {
      assert.equal(c.source_class, 'sportsbook');
      assert.equal(c.market_key, 'player_points');
      assert.equal(c.closing_point, 12.5);
      assert.equal(c.close_capture_state, 'eligible');
    }
    // PrizePicks exclusion recorded.
    const excl = r.exclusions.filter(
      (e) => e.outcome === 'dfs_pickem_excluded_from_sportsbook_consensus'
    );
    assert.equal(excl.length, 1);
    assert.equal(excl[0]!.bookmaker_key, 'prizepicks');
  });

  it('stale snapshot → close_capture_stale; NO candidates emitted', () => {
    const fx = load('historical-event-odds-stale.json');
    const r = processHistoricalSnapshot({
      requested_close_boundary_utc: fx.requested_close_boundary_utc,
      response: fx.response_body,
    });
    assert.equal(r.close_capture.close_capture_state, 'close_capture_stale');
    assert.equal(r.candidates.length, 0);
    assert.equal(r.exclusions.length, 0);
  });

  it('within-tolerance snapshot → eligible with one sportsbook candidate', () => {
    const fx = load('historical-event-odds-within-tolerance.json');
    const r = processHistoricalSnapshot({
      requested_close_boundary_utc: fx.requested_close_boundary_utc,
      response: fx.response_body,
    });
    assert.equal(r.close_capture.close_capture_state, 'eligible');
    assert.equal(r.candidates.length, 1);
    assert.equal(r.candidates[0]!.bookmaker_key, 'draftkings');
  });

  it('LOAD-BEARING #5: offering absent from FINAL snapshot is NOT resurrected from earlier snapshot', () => {
    const fx = load('historical-event-odds-final-vs-earlier.json');
    // Only the FINAL snapshot may drive candidates.
    const r_final = processHistoricalSnapshot({
      requested_close_boundary_utc: fx.requested_close_boundary_utc,
      response: fx.final_body,
    });
    // Final snapshot has player_points only, NOT player_threes.
    const markets = new Set(r_final.candidates.map((c) => c.market_key));
    assert.equal(markets.size, 1);
    assert.ok(markets.has('player_points'));
    assert.ok(!markets.has('player_threes'));

    // Also confirm that if we passed the EARLIER snapshot (for illustration
    // only), the pipeline would classify it — but the seed pipeline never
    // walks backward. This is the design invariant.
    const r_earlier = processHistoricalSnapshot({
      requested_close_boundary_utc: fx.requested_close_boundary_utc,
      response: fx.earlier_body,
    });
    // Earlier snapshot (10 min before boundary) is exactly at the boundary
    // condition: still eligible per §14.11.1, but callers of the seed
    // pipeline pass the FINAL snapshot only. The point of this test is
    // that both markets exist in earlier + only player_points in final,
    // and the seed pipeline consumes final.
    const earlier_markets = new Set(
      r_earlier.candidates.map((c) => c.market_key)
    );
    assert.ok(earlier_markets.has('player_threes'));
  });

  it('LOAD-BEARING #9: unsupported market key (player_steals) filtered; only launch markets survive', () => {
    const fx = load('historical-event-odds-unsupported-market.json');
    const r = processHistoricalSnapshot({
      requested_close_boundary_utc: fx.requested_close_boundary_utc,
      response: fx.response_body,
    });
    // Only player_points candidates should remain; player_steals excluded.
    for (const c of r.candidates) {
      assert.equal(c.market_key, 'player_points');
    }
    const steals_excl = r.exclusions.filter(
      (e) => e.market_key === 'player_steals'
    );
    assert.equal(steals_excl.length, 1);
    assert.equal(steals_excl[0]!.outcome, 'unlaunched_market_key');
  });
});

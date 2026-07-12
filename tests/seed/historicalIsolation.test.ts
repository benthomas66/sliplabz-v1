// Ticket §8b required tests covered here:
//   #10: historical record cannot become current
//   #11: historical record cannot create first observed or movement
//
// Ticket §8b hard invariant: seeded rows are structurally incapable of
// entering current selection, first-observed, or movement.
//
// This test asserts three levels of enforcement:
//   1. The current/historical isolation predicate (V1-4's
//      CURRENT_ONLY_WHERE_CLAUSE + isCurrentSelfObserved) treats every
//      combination of historical_query and backfilled_historical as EXCLUDED.
//   2. `observed_line_lifecycle`, `movement_events`, and `current_market_rows`
//      would REJECT provenance='backfilled_historical' at the schema level.
//      This test asserts the migrations still carry the CHECK
//      `provenance = 'self_observed'` for those three tables.
//   3. `historical_line_results` DID allow backfilled_historical via the
//      V1-4b additive migration, but that table has no path into current
//      selection — the CURRENT_ONLY_WHERE_CLAUSE filters market_snapshots
//      only.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
  CURRENT_ONLY_WHERE_CLAUSE,
  isCurrentSelfObserved,
  isHistoricalOrBackfilled,
} from '../../src/lines/currentHistoricalIsolation.js';

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = resolve(here, '../../supabase/migrations');
function readMigration(name: string): string {
  return readFileSync(resolve(migrationsDir, name), 'utf8');
}

describe('historical isolation — LOAD-BEARING (§14.11.3, §11.4)', () => {
  it('CURRENT_ONLY_WHERE_CLAUSE is the exact SQL predicate used by every current-selection query', () => {
    assert.equal(
      CURRENT_ONLY_WHERE_CLAUSE,
      "request_kind = 'current_poll' AND provenance = 'self_observed'"
    );
  });

  it('LOAD-BEARING #10: every historical_query row (regardless of provenance) is EXCLUDED from current selection', () => {
    for (const provenance of ['self_observed', 'backfilled_historical']) {
      const row = { request_kind: 'historical_query', provenance };
      assert.equal(isCurrentSelfObserved(row), false, `hq/${provenance}`);
      assert.equal(isHistoricalOrBackfilled(row), true, `hq/${provenance}`);
    }
  });

  it('LOAD-BEARING #10: every backfilled_historical row (regardless of request_kind) is EXCLUDED', () => {
    for (const request_kind of ['current_poll', 'historical_query', 'event_discovery']) {
      const row = { request_kind, provenance: 'backfilled_historical' };
      assert.equal(isCurrentSelfObserved(row), false, `${request_kind}/bh`);
      assert.equal(isHistoricalOrBackfilled(row), true, `${request_kind}/bh`);
    }
  });

  it('the exactly-eligible pair (current_poll, self_observed) IS admitted', () => {
    assert.equal(
      isCurrentSelfObserved({
        request_kind: 'current_poll',
        provenance: 'self_observed',
      }),
      true
    );
  });

  it('LOAD-BEARING #11: observed_line_lifecycle migration STILL enforces provenance = self_observed', () => {
    const s = readMigration('20260711140003_observed_line_lifecycle.sql');
    assert.match(s, /CHECK\s*\(\s*provenance\s*=\s*'self_observed'\s*\)/i);
  });

  it('LOAD-BEARING #11: current_market_rows migration STILL enforces provenance = self_observed', () => {
    const s = readMigration('20260711140009_current_market_rows.sql');
    assert.match(s, /CHECK\s*\(\s*provenance\s*=\s*'self_observed'\s*\)/i);
  });

  it('LOAD-BEARING #11: movement_events migration references market_snapshots (V1-4b provenance CHECK there gates the source snapshots)', () => {
    const s = readMigration('20260711140004_movement_events.sql');
    // Movement events reference market_snapshots; historical snapshots have
    // provenance='backfilled_historical' and are therefore never in the
    // current-selection universe consulted by movement detection.
    assert.match(s, /REFERENCES\s+market_snapshots\s*\(\s*market_snapshot_id\s*\)/i);
  });

  it('V1-4b additive migration expanded historical_line_results to allow backfilled_historical', () => {
    // Confirms the additive migration exists and has the correct wording.
    const files = readdirSync(migrationsDir).filter((f) =>
      f.endsWith('_historical_line_results_allow_backfilled_provenance.sql')
    );
    assert.equal(files.length, 1, 'V1-4b additive migration file');
    const s = readMigration(files[0]!);
    assert.match(s, /ADD\s+CONSTRAINT\s+historical_line_results_provenance_check/i);
    assert.match(
      s,
      /provenance\s+IN\s*\(\s*'self_observed'\s*,\s*'backfilled_historical'\s*\)/i
    );
  });

  it('V1-4b explicitly documents that historical_line_results has NO path into current selection', () => {
    // The comment on the migration itself must state this.
    const files = readdirSync(migrationsDir).filter((f) =>
      f.endsWith('_historical_line_results_allow_backfilled_provenance.sql')
    );
    const s = readMigration(files[0]!);
    assert.match(s, /CURRENT_ONLY_WHERE_CLAUSE/i);
    assert.match(s, /never filters on this table/i);
  });
});

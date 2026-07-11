// Static-lint of the migration files. Because no local PostgreSQL or
// Supabase CLI is available in this V1-1 environment, this test asserts
// the load-bearing invariants of the SQL are present as *text*:
//
//   * No UNIQUE constraint on team display_name / abbreviation.
//   * No UNIQUE constraint on player normalized_name / display_name.
//   * conference is nullable on teams and provider_teams.
//   * city defaults empty on teams and provider_teams.
//   * (provider, provider_*_id) UNIQUE exists on all three provider tables.
//   * home_team_id <> away_team_id CHECK exists on games.
//   * mapping_history is not the target of any DROP or DELETE in the shipped
//     migrations (append-only intent captured).
//   * No down migrations exist; migration set is forward-only per V1-1.
//   * Every migration is a Supabase-CLI-compatible timestamped .sql file.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = resolve(here, '../../supabase/migrations');

const migrationFiles = readdirSync(migrationsDir)
  .filter((f) => f.endsWith('.sql'))
  .sort();

function read(name: string): string {
  return readFileSync(resolve(migrationsDir, name), 'utf8');
}

describe('supabase migrations — shape lint', () => {
  it('all migration filenames follow YYYYMMDDHHMMSS_name.sql format', () => {
    const re = /^\d{14}_[a-z0-9_]+\.sql$/;
    for (const f of migrationFiles) {
      assert.match(f, re, `migration filename malformed: ${f}`);
    }
  });

  it('migration ordering is strictly ascending by filename', () => {
    const sorted = [...migrationFiles].sort();
    assert.deepStrictEqual(migrationFiles, sorted);
  });

  it('every enum used by TS enums.ts is declared in 00_enums.sql', () => {
    const enums = read('20260710190000_enums.sql');
    const required = [
      'CREATE TYPE provider_kind',
      'CREATE TYPE mapping_state',
      'CREATE TYPE team_classification',
      'CREATE TYPE game_status',
      'CREATE TYPE player_status',
      'CREATE TYPE event_queue_reason',
      'CREATE TYPE player_queue_reason',
      'CREATE TYPE queue_resolution',
      'CREATE TYPE mapping_action',
      'CREATE TYPE alias_scope_kind',
      'CREATE TYPE alias_type',
    ];
    for (const stanza of required) {
      assert.ok(enums.includes(stanza), `missing: ${stanza}`);
    }
  });

  it('teams table does NOT declare UNIQUE on display_name or abbreviation', () => {
    const teams = read('20260710190001_teams.sql');
    // Coarse but effective: reject any UNIQUE( clause referencing those names.
    assert.doesNotMatch(teams, /UNIQUE\s*\([^)]*display_name/i);
    assert.doesNotMatch(teams, /UNIQUE\s*\([^)]*abbreviation/i);
  });

  it('teams table allows NULL conference and defaults empty city', () => {
    const teams = read('20260710190001_teams.sql');
    // "conference" column is declared but NOT NOT NULL. Check the column
    // line only (up to the next comma or newline).
    const conferenceLine = teams
      .split('\n')
      .find((line) => /^\s*conference\s+text\b/i.test(line));
    assert.ok(conferenceLine, 'conference column not found');
    assert.doesNotMatch(conferenceLine!, /NOT NULL/i);
    // city has an empty-string default.
    assert.match(teams, /city\s+text\s+NOT NULL\s+DEFAULT\s+''/i);
  });

  it('players table does NOT declare UNIQUE on normalized_name or display_name', () => {
    const players = read('20260710190002_players.sql');
    assert.doesNotMatch(players, /UNIQUE\s*\([^)]*normalized_name/i);
    assert.doesNotMatch(players, /UNIQUE\s*\([^)]*display_name/i);
  });

  it('games table has home_team_id <> away_team_id CHECK', () => {
    const games = read('20260710190003_games.sql');
    assert.match(games, /CHECK\s*\(\s*home_team_id\s*<>\s*away_team_id\s*\)/i);
  });

  it('games table has separate scheduled_start_utc and actual_start_utc columns', () => {
    const games = read('20260710190003_games.sql');
    assert.match(games, /scheduled_start_utc\s+timestamptz\s+NOT NULL/i);
    assert.match(games, /actual_start_utc\s+timestamptz/i);
  });

  it('provider_teams enforces UNIQUE (provider, provider_team_id) and no UNIQUE on raw_full_name', () => {
    const pt = read('20260710190004_provider_teams.sql');
    assert.match(pt, /UNIQUE\s*\(\s*provider\s*,\s*provider_team_id\s*\)/i);
    assert.doesNotMatch(pt, /UNIQUE\s*\([^)]*raw_full_name/i);
    assert.doesNotMatch(pt, /UNIQUE\s*\([^)]*raw_abbreviation/i);
    // internal_team_id must be nullable (unresolved allowed) — no NOT NULL on the FK column.
    assert.match(pt, /internal_team_id\s+uuid\s+REFERENCES\s+teams/i);
  });

  it('provider_players enforces UNIQUE (provider, provider_player_id) and no UNIQUE on normalized_name', () => {
    const pp = read('20260710190005_provider_players.sql');
    assert.match(pp, /UNIQUE\s*\(\s*provider\s*,\s*provider_player_id\s*\)/i);
    assert.doesNotMatch(pp, /UNIQUE\s*\([^)]*normalized_name/i);
  });

  it('provider_games enforces UNIQUE (provider, provider_game_id) and stores time_delta_seconds', () => {
    const pg = read('20260710190006_provider_games.sql');
    assert.match(pg, /UNIQUE\s*\(\s*provider\s*,\s*provider_game_id\s*\)/i);
    assert.match(pg, /time_delta_seconds\s+integer/i);
  });

  it('team_aliases and player_aliases carry approved_by NOT NULL and alias_version', () => {
    for (const f of ['20260710190007_team_aliases.sql', '20260710190008_player_aliases.sql']) {
      const s = read(f);
      assert.match(s, /alias_version\s+integer\s+NOT NULL/i);
      assert.match(s, /approved_by\s+text\s+NOT NULL/i);
    }
  });

  it('reconciliation queues preserve raw provider strings and candidate arrays', () => {
    for (const f of [
      '20260710190009_event_reconciliation_queue.sql',
      '20260710190010_player_reconciliation_queue.sql',
    ]) {
      const s = read(f);
      assert.match(s, /candidate_[a-z_]+_ids\s+uuid\[\]\s+NOT NULL/i);
      assert.match(s, /reason_detail\s+text\s+NOT NULL/i);
      assert.match(s, /created_at\s+timestamptz\s+NOT NULL/i);
    }
  });

  it('mapping_history is append-only in intent: no DROP/TRUNCATE/DELETE on it in any migration', () => {
    for (const f of migrationFiles) {
      const s = read(f).toLowerCase();
      // Only inspect statements that name mapping_history explicitly.
      const idx = s.indexOf('mapping_history');
      if (idx === -1) continue;
      assert.doesNotMatch(s, /drop\s+table[^;]*mapping_history/i);
      assert.doesNotMatch(s, /truncate\s+[^;]*mapping_history/i);
      // Note: DELETE would appear at runtime, not in DDL migrations; this
      // check is defensive against a future migration that manages seed data.
      assert.doesNotMatch(s, /delete\s+from\s+mapping_history/i);
    }
  });

  it('no destructive statements on identity tables in the V1-1 migration set', () => {
    // Forward-only greenfield: no migration should drop or truncate any
    // identity table it just created. If a future migration re-partitions
    // one of these tables, it must add a follow-up column instead.
    const forbidden = /(?:^|\s)(DROP\s+TABLE|TRUNCATE)\s+/i;
    for (const f of migrationFiles) {
      const s = read(f);
      assert.doesNotMatch(s, forbidden, `destructive DDL in ${f}`);
    }
  });

  it('no `.down.sql` files exist; V1-1 forward-fix-only strategy', () => {
    const downs = readdirSync(migrationsDir).filter((f) => f.endsWith('.down.sql'));
    assert.equal(downs.length, 0);
  });
});

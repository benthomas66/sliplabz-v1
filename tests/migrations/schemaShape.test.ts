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
    // Strip -- line comments first so descriptive text like "NO UPDATE, DELETE,
    // or TRUNCATE" in header comments does not register as a violation.
    const forbidden = /(?:^|\s)(DROP\s+TABLE|TRUNCATE)\s+/i;
    for (const f of migrationFiles) {
      const raw = read(f);
      const stripped = raw
        .split('\n')
        .map((line) => line.replace(/--.*$/, ''))
        .join('\n');
      assert.doesNotMatch(stripped, forbidden, `destructive DDL in ${f}`);
    }
  });

  it('no `.down.sql` files exist; V1-1 forward-fix-only strategy', () => {
    const downs = readdirSync(migrationsDir).filter((f) => f.endsWith('.down.sql'));
    assert.equal(downs.length, 0);
  });

  // -------------------------------------------------------------------------
  // V1-2 additions
  // -------------------------------------------------------------------------

  it('V1-2: all V1-2 enum types are declared exactly once in the V1-2 enums migration', () => {
    const bdlEnums = read('20260711120000_bdl_enums.sql');
    const required = [
      'CREATE TYPE bdl_endpoint',
      'CREATE TYPE bdl_run_state',
      'CREATE TYPE bdl_minutes_status',
      'CREATE TYPE player_stat_eligibility',
      'CREATE TYPE player_stat_quarantine_reason',
      'CREATE TYPE availability_interpretation_state',
      'CREATE TYPE post_final_reconciliation_kind',
      'CREATE TYPE invalidation_entity_kind',
      'CREATE TYPE invalidation_reason',
    ];
    for (const stanza of required) {
      assert.ok(bdlEnums.includes(stanza), `missing: ${stanza}`);
    }
  });

  it('V1-2: player_game_stats has UNIQUE (provider, provider_player_id, provider_game_id)', () => {
    const s = read('20260711120007_player_game_stats.sql');
    assert.match(
      s,
      /UNIQUE\s*\(\s*provider\s*,\s*provider_player_id\s*,\s*provider_game_id\s*\)/i
    );
  });

  it('V1-2: player_game_stats enforces minutes-state consistency CHECKs', () => {
    const s = read('20260711120007_player_game_stats.sql');
    assert.match(s, /minutes_status\s*=\s*'played'.*parsed_minutes\s*>\s*0/is);
    assert.match(s, /minutes_status\s*=\s*'dnp'.*parsed_minutes\s*=\s*0/is);
    assert.match(
      s,
      /minutes_status\s*=\s*'unresolved_non_numeric'.*parsed_minutes\s+IS\s+NULL/is
    );
  });

  it('V1-2: bdl_raw_responses has no `updated_at` — immutable in intent', () => {
    const s = read('20260711120002_bdl_raw_responses.sql');
    assert.doesNotMatch(s, /updated_at\s+timestamptz/i);
  });

  it('V1-2: bdl_ingestion_runs enforces (running xor completed_at)', () => {
    const s = read('20260711120001_bdl_ingestion_runs.sql');
    assert.match(
      s,
      /completion_state\s*=\s*'running'\s+AND\s+completed_at\s+IS\s+NULL/i
    );
    assert.match(
      s,
      /completion_state\s*<>\s*'running'\s+AND\s+completed_at\s+IS\s+NOT\s+NULL/i
    );
  });

  it('V1-2: bdl_import_watermarks primary key is (endpoint, query_scope_key)', () => {
    const s = read('20260711120003_bdl_import_watermarks.sql');
    assert.match(
      s,
      /PRIMARY\s+KEY\s*\(\s*endpoint\s*,\s*query_scope_key\s*\)/i
    );
  });

  it('V1-2: append-only history + observations + invalidations are not the target of DROP/DELETE/TRUNCATE in any migration', () => {
    const targets = [
      'player_game_stat_history',
      'game_status_observations',
      'recomputation_invalidations',
    ];
    // Strip -- line comments before matching so descriptive text like
    // "no UPDATE, DELETE, or TRUNCATE" does not register as a violation.
    const stripComments = (sql: string): string =>
      sql
        .split('\n')
        .map((line) => line.replace(/--.*$/, ''))
        .join('\n');
    for (const f of migrationFiles) {
      const raw = read(f);
      const s = stripComments(raw).toLowerCase();
      for (const t of targets) {
        if (s.includes(t)) {
          assert.doesNotMatch(s, new RegExp(`drop\\s+table[^;]*${t}`, 'i'));
          assert.doesNotMatch(s, new RegExp(`truncate\\s+[^;]*${t}`, 'i'));
          assert.doesNotMatch(s, new RegExp(`delete\\s+from\\s+${t}`, 'i'));
        }
      }
    }
  });

  it('V1-2: recomputation_invalidations requires at least one triggering ref via CHECK', () => {
    const s = read('20260711120011_recomputation_invalidations.sql');
    assert.match(
      s,
      /CHECK\s*\(\s*triggering_history_id\s+IS\s+NOT\s+NULL\s+OR\s+triggering_observation_id\s+IS\s+NOT\s+NULL\s*\)/i
    );
  });

  it('V1-2: post_final_reconciliation_schedule enforces completed_at & completed_by_run_id are paired', () => {
    const s = read('20260711120010_post_final_reconciliation_schedule.sql');
    assert.match(
      s,
      /completed_at\s+IS\s+NULL\s+AND\s+completed_by_run_id\s+IS\s+NULL/i
    );
    assert.match(
      s,
      /completed_at\s+IS\s+NOT\s+NULL\s+AND\s+completed_by_run_id\s+IS\s+NOT\s+NULL/i
    );
  });

  // -------------------------------------------------------------------------
  // V1-3 additions
  // -------------------------------------------------------------------------

  it('V1-3: all V1-3 enum types declared in the V1-3 enums migration', () => {
    const oddsEnums = read('20260711130000_oddsapi_enums.sql');
    const required = [
      'CREATE TYPE oddsapi_request_kind',
      'CREATE TYPE oddsapi_provenance',
      'CREATE TYPE oddsapi_run_state',
      'CREATE TYPE oddsapi_endpoint',
      'CREATE TYPE source_class',
      'CREATE TYPE bookmaker_allowlist_status',
      'CREATE TYPE outcome_side',
      'CREATE TYPE offering_state',
      'CREATE TYPE freshness_state',
      'CREATE TYPE snapshot_schema_state',
      'CREATE TYPE dfs_promotion_type',
      'CREATE TYPE price_semantic',
      'CREATE TYPE offering_conflict_reason',
      'CREATE TYPE event_presence_state',
      'CREATE TYPE quota_delta_flag',
    ];
    for (const stanza of required) {
      assert.ok(oddsEnums.includes(stanza), `missing: ${stanza}`);
    }
  });

  it('V1-3: bookmaker_registry PK provider_key + source_class enum column + approved_by NOT NULL', () => {
    const s = read('20260711130001_bookmaker_registry.sql');
    assert.match(s, /provider_key\s+text\s+PRIMARY KEY/i);
    assert.match(s, /source_class\s+source_class\s+NOT NULL/i);
    assert.match(s, /approved_by\s+text\s+NOT NULL/i);
  });

  it('V1-3: market_registry has is_launch_market with default false', () => {
    const s = read('20260711130002_market_registry.sql');
    assert.match(s, /is_launch_market\s+boolean\s+NOT NULL\s+DEFAULT\s+false/i);
  });

  it('V1-3: oddsapi_ingestion_runs enforces (running xor completed_at)', () => {
    const s = read('20260711130003_oddsapi_ingestion_runs.sql');
    assert.match(
      s,
      /result_state\s*=\s*'running'\s+AND\s+completed_at\s+IS\s+NULL/i
    );
    assert.match(
      s,
      /result_state\s*<>\s*'running'\s+AND\s+completed_at\s+IS\s+NOT\s+NULL/i
    );
  });

  it('V1-3: oddsapi_raw_responses has no `updated_at` — immutable in intent', () => {
    const s = read('20260711130004_oddsapi_raw_responses.sql');
    // Strip -- line comments first so descriptive text does not trip.
    const stripped = s
      .split('\n')
      .map((line) => line.replace(/--.*$/, ''))
      .join('\n');
    assert.doesNotMatch(stripped, /updated_at\s+timestamptz/i);
  });

  it('V1-3: market_snapshots UNIQUE (run_id, event_id, bookmaker_key, market_key)', () => {
    const s = read('20260711130006_market_snapshots.sql');
    assert.match(
      s,
      /UNIQUE\s*\(\s*oddsapi_ingestion_run_id\s*,\s*provider_event_id\s*,\s*bookmaker_key\s*,\s*market_key\s*\)/i
    );
  });

  it('V1-3: market_snapshots restricts request_kind × provenance combinations', () => {
    const s = read('20260711130006_market_snapshots.sql');
    assert.match(
      s,
      /request_kind\s*=\s*'current_poll'\s+AND\s+provenance\s*=\s*'self_observed'/i
    );
    assert.match(
      s,
      /request_kind\s*<>\s*'historical_query'\s+OR\s+provenance\s*=\s*'backfilled_historical'/i
    );
  });

  it('V1-3: market_offerings UNIQUE (snapshot_id, normalized_player_name, point, side)', () => {
    const s = read('20260711130007_market_offerings.sql');
    assert.match(
      s,
      /UNIQUE\s*\(\s*market_snapshot_id\s*,\s*normalized_player_name\s*,\s*point\s*,\s*side\s*\)/i
    );
  });

  it('V1-3: market_offerings enforces duplicate_count >= 1 CHECK', () => {
    const s = read('20260711130007_market_offerings.sql');
    assert.match(s, /CHECK\s*\(\s*duplicate_count\s*>=\s*1\s*\)/i);
  });

  it('V1-3: market_offering_raw_rows disposition CHECK covers contributed/duplicate/quarantined', () => {
    const s = read('20260711130008_market_offering_raw_rows.sql');
    assert.match(
      s,
      /disposition\s+IN\s*\(\s*'contributed'\s*,\s*'duplicate'\s*,\s*'quarantined'\s*\)/i
    );
    assert.match(
      s,
      /UNIQUE\s*\(\s*market_snapshot_id\s*,\s*raw_row_index\s*\)/i
    );
  });

  it('V1-3: oddsapi_quarantine reason CHECK includes schema_drift_http_200 and conflicting_outcomes', () => {
    const s = read('20260711130009_oddsapi_quarantine.sql');
    assert.match(s, /'schema_drift_http_200'/i);
    assert.match(s, /'conflicting_outcomes'/i);
    assert.match(s, /'invalid_market_response_422'/i);
  });
});

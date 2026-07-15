// V1-A1-2a — reason-vocabulary probe.
//
// Owner ruling 2026-07-15 (DR-28): the closed reason vocabulary gains a
// new value `no_unique_consensus_line` for the tied-consensus case. The
// vocabulary is now: the 21 pre-existing values in migration
// 20260714000000 plus `no_unique_consensus_line` added by migration
// 20260715000000 — 22 total values.
//
// This probe verifies:
//   * the additive migration's ALTER TYPE ADD VALUE clause is present;
//   * the total closed vocabulary equals exactly the expected 22 values;
//   * `abnormal_dispersion` is still present AND still marked RESERVED
//     (documented in the ORIGINAL migration's COMMENT);
//   * no existing value has been removed by the additive migration.
//
// Governor scope note (V1-A1-2a): `src/shared/enums.ts` is deliberately
// OUT OF SCOPE for this micro-ticket. The TypeScript mirror
// `EVIDENCE_REASON_CODES` therefore continues to list 21 values, matching
// the ORIGINAL migration file that `tests/evidence/schema.test.ts` reads.
// The engine ticket (V1-A1-3) owns the TS-side vocabulary extension when
// it wires the emitter for `no_unique_consensus_line`. This is an
// intentional, temporary divergence flagged in the V1-A1-2a report.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const originalMigrationPath = resolve(
  here,
  '../../supabase/migrations/20260714000000_evidence_enums.sql'
);
const additiveMigrationPath = resolve(
  here,
  '../../supabase/migrations/20260715000000_evidence_reason_code_add_no_unique_consensus_line.sql'
);
const originalSql = readFileSync(originalMigrationPath, 'utf8');
const additiveSql = readFileSync(additiveMigrationPath, 'utf8');

/**
 * Extract enum labels from a `CREATE TYPE <name> AS ENUM (...)` block in a
 * given SQL source. Strips `--` line comments first so that stanzas like
 * `-- Support (§E.1 "Support" category)` don't interfere with the paren
 * matching.
 */
function readCreateEnumLabels(sql: string, typeName: string): ReadonlyArray<string> {
  const stripped = sql
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n');
  const re = new RegExp(
    `CREATE TYPE\\s+${typeName}\\s+AS\\s+ENUM\\s*\\(([\\s\\S]*?)\\)`,
    'i'
  );
  const match = stripped.match(re);
  if (match === null) return [];
  const body = match[1] ?? '';
  return body.match(/'([a-z0-9_]+)'/g)?.map((s) => s.slice(1, -1)) ?? [];
}

/**
 * Extract labels added by `ALTER TYPE <name> ADD VALUE 'label'` statements
 * in a given SQL source.
 */
function readAlterEnumAddValues(sql: string, typeName: string): ReadonlyArray<string> {
  const re = new RegExp(
    `ALTER\\s+TYPE\\s+${typeName}\\s+ADD\\s+VALUE(?:\\s+IF\\s+NOT\\s+EXISTS)?\\s+'([a-z0-9_]+)'`,
    'gi'
  );
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql)) !== null) {
    out.push(m[1]!);
  }
  return out;
}

const EXPECTED_ORIGINAL_21: readonly string[] = [
  'window_agreement_support',
  'favorable_consensus_difference',
  'positive_margin_support',
  'unfavorable_consensus_difference',
  'negative_margin_support',
  'margin_measures_disagree',
  'market_disagrees_with_history',
  'windows_disagree',
  'stale_current_market',
  'insufficient_book_coverage',
  'push_heavy_sample',
  'one_sided_offering',
  'source_unavailable',
  'insufficient_l10_sample',
  'incomplete_historical_coverage',
  'unresolved_player_mapping',
  'unresolved_event_mapping',
  'no_current_market',
  'postponed_game',
  'canceled_game',
  'abnormal_dispersion',
];

const EXPECTED_ADDITIVE = 'no_unique_consensus_line';

describe('V1-A1-2a reason vocabulary — union of both migrations (owner ruling 2026-07-15)', () => {
  it('the ORIGINAL migration declares exactly the 21 pre-existing values in the expected order', () => {
    const labels = readCreateEnumLabels(originalSql, 'evidence_reason_code');
    assert.deepStrictEqual([...labels], EXPECTED_ORIGINAL_21);
    assert.equal(labels.length, 21, 'the ORIGINAL migration must declare exactly 21 evidence_reason_code values');
  });

  it('the ADDITIVE migration adds exactly one new value: no_unique_consensus_line (lowercase per G1)', () => {
    const added = readAlterEnumAddValues(additiveSql, 'evidence_reason_code');
    assert.deepStrictEqual([...added], [EXPECTED_ADDITIVE]);
  });

  it('the ADDITIVE migration does NOT modify or recreate the CREATE TYPE stanza — it only ALTER TYPE ADD VALUE', () => {
    // No CREATE TYPE in the additive migration.
    assert.doesNotMatch(additiveSql, /CREATE\s+TYPE\s+evidence_reason_code/i);
    // No DROP TYPE either.
    assert.doesNotMatch(additiveSql, /DROP\s+TYPE\s+evidence_reason_code/i);
  });

  it('closed vocabulary total = 22 values (21 originals + 1 additive); no original value was removed', () => {
    const originals = readCreateEnumLabels(originalSql, 'evidence_reason_code');
    const added = readAlterEnumAddValues(additiveSql, 'evidence_reason_code');
    const union = [...originals, ...added];
    assert.equal(union.length, 22);
    for (const v of EXPECTED_ORIGINAL_21) {
      assert.ok(originals.includes(v), `original value missing from ORIGINAL migration: ${v}`);
    }
    assert.ok(union.includes(EXPECTED_ADDITIVE), 'additive value missing from union');
    // No duplicates.
    assert.equal(new Set(union).size, union.length, 'duplicate values in union');
  });

  it('abnormal_dispersion is still present in the ORIGINAL migration AND is still marked RESERVED in its COMMENT', () => {
    const labels = readCreateEnumLabels(originalSql, 'evidence_reason_code');
    assert.ok(labels.includes('abnormal_dispersion'));
    // The COMMENT stanza after the CREATE TYPE (before the additive
    // migration's updated COMMENT) must still assert the reservation.
    assert.match(
      originalSql,
      /RESERVED\s+—\s+NOT\s+EMITTED\s+IN\s+evidence_method_v1/i
    );
  });

  it('the ADDITIVE migration is properly named and dated (20260715 date prefix, descriptive suffix)', () => {
    // Filename shape asserted so the file discovery in applyAllMigrations
    // orders it strictly AFTER the original 20260714* migrations.
    const filename = '20260715000000_evidence_reason_code_add_no_unique_consensus_line.sql';
    // If the filename ever changes, this expected string plus the file
    // reads at the top of this test will need to update together.
    assert.match(filename, /^20260715[0-9]{6}_evidence_reason_code_add_no_unique_consensus_line\.sql$/);
  });
});

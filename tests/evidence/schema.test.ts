// V1-A1-2 unit tests: assert the TypeScript enums / types mirror the SQL
// migrations exactly, and the method-version constant is locked to
// `evidence_method_v1` per DR-24.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
  EVIDENCE_CLASSIFICATIONS,
  EVIDENCE_DIRECTIONS,
  EVIDENCE_EVALUATED_SOURCE_KINDS,
  EVIDENCE_ONE_SIDED_STATES,
  EVIDENCE_QUALITY_CAP_REASONS,
  EVIDENCE_REASON_CATEGORIES,
  EVIDENCE_REASON_CODES,
  EVIDENCE_RESERVED_REASON_CODES,
} from '../../src/shared/enums.js';
import { EVIDENCE_METHOD_VERSION } from '../../src/evidence/schema.js';

const here = dirname(fileURLToPath(import.meta.url));
const enumsSqlPath = resolve(
  here,
  '../../supabase/migrations/20260714000000_evidence_enums.sql'
);
const enumsSql = readFileSync(enumsSqlPath, 'utf8');

/**
 * Extract the parenthesized enum body for a given `CREATE TYPE <name> AS
 * ENUM (...)` block, then pull out every single-quoted label in the order
 * declared. Preserves declaration order — Postgres enum ordering matters
 * only for sort operations, but preserving it here keeps the assertion
 * strict.
 *
 * Notes:
 *   * The enum body may contain SQL `--` comments that themselves contain
 *     parentheses (e.g. "§E.1 (Support) category"). We strip line comments
 *     BEFORE walking so the closing `)` we find really is the enum's close.
 *   * We then use a non-greedy match to consume everything up to the first
 *     unbalanced `)` after comment stripping.
 */
function readSqlEnumLabels(typeName: string): ReadonlyArray<string> {
  const stripped = enumsSql
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n');
  const re = new RegExp(
    `CREATE TYPE\\s+${typeName}\\s+AS\\s+ENUM\\s*\\(([\\s\\S]*?)\\)`,
    'i'
  );
  const match = stripped.match(re);
  if (match === null) {
    throw new Error(`SQL enum ${typeName} not found`);
  }
  const body = match[1] ?? '';
  return body.match(/'([a-z0-9_]+)'/g)?.map((s) => s.slice(1, -1)) ?? [];
}

describe('V1-A1-2 evidence enums: TypeScript ⇔ Postgres identity', () => {
  it('EVIDENCE_METHOD_VERSION is locked to `evidence_method_v1` per DR-24', () => {
    assert.equal(EVIDENCE_METHOD_VERSION, 'evidence_method_v1');
  });

  it('EVIDENCE_CLASSIFICATIONS mirrors the SQL enum exactly (GD-15 seven values, same order)', () => {
    const sql = readSqlEnumLabels('evidence_classification');
    assert.deepStrictEqual(
      [...EVIDENCE_CLASSIFICATIONS],
      sql,
      'TypeScript classifications drifted from the SQL enum'
    );
    assert.equal(EVIDENCE_CLASSIFICATIONS.length, 7, 'GD-15 taxonomy is seven values');
  });

  it('EVIDENCE_DIRECTIONS mirrors the SQL enum exactly', () => {
    assert.deepStrictEqual(
      [...EVIDENCE_DIRECTIONS],
      readSqlEnumLabels('evidence_direction')
    );
  });

  it('EVIDENCE_EVALUATED_SOURCE_KINDS mirrors the SQL enum exactly', () => {
    assert.deepStrictEqual(
      [...EVIDENCE_EVALUATED_SOURCE_KINDS],
      readSqlEnumLabels('evidence_evaluated_source_kind')
    );
  });

  it('EVIDENCE_QUALITY_CAP_REASONS mirrors the SQL enum exactly', () => {
    assert.deepStrictEqual(
      [...EVIDENCE_QUALITY_CAP_REASONS],
      readSqlEnumLabels('evidence_quality_cap_reason')
    );
  });

  it('EVIDENCE_ONE_SIDED_STATES mirrors the SQL enum exactly (RME-3)', () => {
    assert.deepStrictEqual(
      [...EVIDENCE_ONE_SIDED_STATES],
      readSqlEnumLabels('evidence_one_sided_state')
    );
  });

  it('EVIDENCE_REASON_CODES mirrors the §E.1 closed-vocabulary SQL enum exactly', () => {
    assert.deepStrictEqual(
      [...EVIDENCE_REASON_CODES],
      readSqlEnumLabels('evidence_reason_code')
    );
  });

  it('EVIDENCE_REASON_CATEGORIES mirrors the SQL enum exactly (DR-26)', () => {
    assert.deepStrictEqual(
      [...EVIDENCE_REASON_CATEGORIES],
      readSqlEnumLabels('evidence_reason_category')
    );
  });

  it('EVIDENCE_RESERVED_REASON_CODES contains abnormal_dispersion (DR-27 / §I.3)', () => {
    assert.ok(
      EVIDENCE_RESERVED_REASON_CODES.has('abnormal_dispersion'),
      'DR-27 reservation must be represented — abnormal_dispersion is RESERVED and NOT EMITTED IN evidence_method_v1'
    );
    // No OTHER reason code is reserved in `evidence_method_v1`.
    assert.equal(EVIDENCE_RESERVED_REASON_CODES.size, 1);
  });

  it('every EVIDENCE_RESERVED_REASON_CODES value is a member of the closed vocabulary', () => {
    for (const code of EVIDENCE_RESERVED_REASON_CODES) {
      assert.ok(
        (EVIDENCE_REASON_CODES as ReadonlyArray<string>).includes(code),
        `reserved code ${code} is not in EVIDENCE_REASON_CODES`
      );
    }
  });
});

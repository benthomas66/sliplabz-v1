// V1-4 test-only migration applier.
//
// Reads `supabase/migrations/*.sql` in filename order and applies each
// against a supplied database. Used ONLY from integration tests to
// establish a fresh schema in a disposable database; production
// deployments continue to use `supabase db push` per GD-1.

import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import type { SliplabzPool } from './connection.js';

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = resolve(here, '../../supabase/migrations');

export function listMigrationFiles(): string[] {
  return readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
}

export async function applyAllMigrations(pool: SliplabzPool): Promise<{
  readonly applied: ReadonlyArray<string>;
}> {
  const files = listMigrationFiles();
  const applied: string[] = [];
  for (const f of files) {
    const sql = readFileSync(resolve(migrationsDir, f), 'utf8');
    await pool.query(sql);
    applied.push(f);
  }
  return { applied: Object.freeze(applied) };
}

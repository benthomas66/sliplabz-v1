// V1-4 transaction wrapper.
//
// Authority: docs/architecture/V1_PERSISTENCE_CONTRACT.md §4.
// V1-4 governor obligation: every ingest / compute path that spans two or
// more tables MUST route through this helper.

import type { PoolClient } from 'pg';
import type { SliplabzPool } from './connection.js';

export interface Tx {
  /**
   * Parameterized query. `$1` / `$2` placeholders only; never string-interpolate.
   */
  query: (sql: string, params?: unknown[]) => Promise<{
    rows: unknown[];
    rowCount: number | null;
  }>;
}

/**
 * Run `body` inside a single BEGIN/COMMIT block. On any thrown error,
 * ROLLBACK and re-throw. On success, COMMIT.
 *
 * Isolation level is PostgreSQL default (READ COMMITTED). Nothing in V1-4
 * requires stronger; when a later ticket does, it should either pass an
 * explicit isolation via a new overload or wrap this helper.
 */
export async function withTransaction<T>(
  pool: SliplabzPool,
  body: (tx: Tx) => Promise<T>
): Promise<T> {
  const client: PoolClient = await pool.connect();
  const tx: Tx = {
    query: async (sql, params) => {
      const res =
        params === undefined
          ? await client.query(sql)
          : await client.query(sql, params);
      return { rows: res.rows, rowCount: res.rowCount };
    },
  };
  try {
    await client.query('BEGIN');
    const result = await body(tx);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // If ROLLBACK fails, we still want the original error propagated.
    }
    throw err;
  } finally {
    client.release();
  }
}

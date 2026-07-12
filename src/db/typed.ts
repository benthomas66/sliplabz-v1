// V1-4 typed query helpers.
//
// Authority: docs/architecture/V1_PERSISTENCE_CONTRACT.md §5.
//
// These helpers cast pg's `rows` array to a caller-supplied type. They do
// NOT verify the shape — the caller MUST supply an SQL query whose column
// list matches the type. That is the price of "no ORM / no generated types."

import type { SliplabzPool } from './connection.js';
import type { Tx } from './transaction.js';

export type Queryable = SliplabzPool | Tx;

export async function queryRows<T>(
  db: Queryable,
  sql: string,
  params?: unknown[]
): Promise<T[]> {
  const res = await db.query(sql, params);
  return res.rows as T[];
}

export async function queryOne<T>(
  db: Queryable,
  sql: string,
  params?: unknown[]
): Promise<T> {
  const rows = await queryRows<T>(db, sql, params);
  if (rows.length !== 1) {
    throw new Error(
      `queryOne expected exactly 1 row, got ${rows.length} (sql=${sql.slice(0, 80)})`
    );
  }
  return rows[0]!;
}

export async function queryOptional<T>(
  db: Queryable,
  sql: string,
  params?: unknown[]
): Promise<T | null> {
  const rows = await queryRows<T>(db, sql, params);
  if (rows.length === 0) return null;
  if (rows.length > 1) {
    throw new Error(
      `queryOptional expected 0 or 1 rows, got ${rows.length} (sql=${sql.slice(0, 80)})`
    );
  }
  return rows[0]!;
}

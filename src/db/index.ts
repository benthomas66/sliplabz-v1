// V1-4 persistence surface.
//
// The only module import path outside src/db/ should be from this file,
// so future refactors can move internal files without changing consumers.

export { readEnvConfig, openPool } from './connection.js';
export type { DbConfig, SliplabzPool } from './connection.js';
export { withTransaction } from './transaction.js';
export type { Tx } from './transaction.js';
export { queryRows, queryOne, queryOptional } from './typed.js';
export type { Queryable } from './typed.js';
export { applyAllMigrations, listMigrationFiles } from './applyMigrations.js';

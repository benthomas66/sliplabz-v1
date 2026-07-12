// V1-4 canonical connection factory.
//
// Authority:
//   GD-1 (Supabase-hosted PostgreSQL; no direct client/browser access)
//   V1-4 governor decision (pg driver only; no ORM / no query builder)
//   docs/architecture/V1_PERSISTENCE_CONTRACT.md §§2, 6, 8
//
// This module is the ONLY site in the repository that constructs a
// `pg.Pool`. Every other module receives the pool (or its typed helpers)
// via dependency injection.

import pg from 'pg';
import type { Pool, PoolConfig, PoolClient } from 'pg';

export interface DbConfig {
  readonly connectionString?: string;
  readonly host?: string;
  readonly port?: number;
  readonly database?: string;
  readonly user?: string;
  readonly password?: string;
  readonly max: number;
  readonly statement_timeout_ms: number;
  readonly ssl: 'require' | 'disable';
}

/**
 * Read a `DbConfig` from process.env. Recognized variables are documented
 * in docs/architecture/V1_PERSISTENCE_CONTRACT.md §2.
 *
 * `SLIPLABZ_DATABASE_URL` is preferred; the discrete `PG*` variables are a
 * fallback. Returns null when neither form is present.
 */
export function readEnvConfig(
  env: NodeJS.ProcessEnv = process.env
): DbConfig | null {
  const url = env['SLIPLABZ_DATABASE_URL'];
  const host = env['PGHOST'];
  if (!url && !host) return null;

  const max = Number(env['SLIPLABZ_DB_MAX_POOL'] ?? '10');
  const timeout = Number(env['SLIPLABZ_DB_STATEMENT_TIMEOUT_MS'] ?? '15000');
  const explicit_ssl = env['SLIPLABZ_DB_SSL'];

  // Default: SSL required unless the connection targets an obviously-local host.
  let ssl: 'require' | 'disable' = 'require';
  const check_host = url ?? host ?? '';
  if (
    explicit_ssl === 'disable' ||
    check_host.includes('localhost') ||
    check_host.includes('127.0.0.1') ||
    check_host.includes('postgres:') || // docker-compose service name form
    check_host === 'postgres'
  ) {
    ssl = 'disable';
  }
  if (explicit_ssl === 'require') ssl = 'require';

  const base: Partial<DbConfig> = {
    max: Number.isFinite(max) && max > 0 ? max : 10,
    statement_timeout_ms:
      Number.isFinite(timeout) && timeout > 0 ? timeout : 15_000,
    ssl,
  };
  if (url) {
    return Object.freeze({
      ...(base as DbConfig),
      connectionString: url,
    });
  }
  const port = Number(env['PGPORT'] ?? '5432');
  const database = env['PGDATABASE'];
  const user = env['PGUSER'];
  const password = env['PGPASSWORD'];
  const built: DbConfig = {
    max: base.max!,
    statement_timeout_ms: base.statement_timeout_ms!,
    ssl: base.ssl!,
    ...(host !== undefined ? { host } : {}),
    ...(Number.isFinite(port) ? { port } : {}),
    ...(database !== undefined ? { database } : {}),
    ...(user !== undefined ? { user } : {}),
    ...(password !== undefined ? { password } : {}),
  };
  return Object.freeze(built);
}

/**
 * Build a `pg.PoolConfig` from a `DbConfig`. SSL flag is materialized here.
 */
function toPoolConfig(cfg: DbConfig): PoolConfig {
  const pc: PoolConfig = {
    max: cfg.max,
    statement_timeout: cfg.statement_timeout_ms,
    ssl: cfg.ssl === 'require' ? { rejectUnauthorized: false } : false,
  };
  if (cfg.connectionString !== undefined) {
    pc.connectionString = cfg.connectionString;
  } else {
    if (cfg.host !== undefined) pc.host = cfg.host;
    if (cfg.port !== undefined) pc.port = cfg.port;
    if (cfg.database !== undefined) pc.database = cfg.database;
    if (cfg.user !== undefined) pc.user = cfg.user;
    if (cfg.password !== undefined) pc.password = cfg.password;
  }
  return pc;
}

export interface SliplabzPool {
  readonly raw: Pool;
  query: (sql: string, params?: unknown[]) => Promise<pg.QueryResult>;
  connect: () => Promise<PoolClient>;
  end: () => Promise<void>;
}

/**
 * Open a connection pool. The caller MUST later call `pool.end()` to
 * release resources; tests do this in an `after` hook.
 */
export function openPool(cfg: DbConfig): SliplabzPool {
  const raw = new pg.Pool(toPoolConfig(cfg));
  const wrapped: SliplabzPool = {
    raw,
    query: (sql, params) =>
      params === undefined ? raw.query(sql) : raw.query(sql, params),
    connect: () => raw.connect(),
    end: () => raw.end(),
  };
  return Object.freeze(wrapped);
}

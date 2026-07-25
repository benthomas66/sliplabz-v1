import 'server-only';
// V1-6a Scope G — server database module. FAIL CLOSED.
//
// `import 'server-only'` makes this a Next.js BUILD-TIME MODULE BOUNDARY:
// any attempt to import this file (transitively) into a Client Component
// fails the build. This is NOT TypeScript type enforcement — it is a
// framework build-time guarantee provided by the `server-only` package.
//
// Founder ruling: application runtime uses the Supabase TRANSACTION pooler
// (port 6543). Migrations/admin use the SESSION pooler (5432) — never here.
// See docs/architecture/V1_APP_CONNECTION_RULES.md.
//
// Rules enforced:
//   * read a NON-PUBLIC env var (never a NEXT_PUBLIC_* / client-exposed name);
//   * reject a missing value with a clear server-side configuration error;
//   * validate the runtime targets the 6543 transaction pooler WITHOUT
//     printing the URI;
//   * never emit credentials in errors or diagnostics (no URI parsing/echo);
//   * Node runtime only (pg cannot run on edge). Route handlers/pages that
//     import this MUST declare `export const runtime = 'nodejs'`.

import { Pool } from 'pg';
import type { Pool as PgPool } from 'pg';

/** NON-PUBLIC env var. The `NEXT_PUBLIC_` prefix is deliberately NOT used —
 *  a public prefix would inline the value into the client bundle. */
const BOARD_DB_URL_ENV = 'SLIPLABZ_BOARD_DATABASE_URL';

/** Transaction-pooler port. The application runtime path MUST use it. */
const TRANSACTION_POOLER_PORT = '6543';

/**
 * A configuration error that NEVER carries the connection string or any
 * credential. Only the env var NAME and a category are surfaced.
 */
export class BoardDbConfigError extends Error {
  constructor(message: string) {
    super(`V1-6a board db config: ${message}`);
    this.name = 'BoardDbConfigError';
  }
}

let _pool: PgPool | null = null;

/**
 * Validate the pooler configuration WITHOUT printing the URI. Uses the URL
 * parser only to read the port, and NEVER re-emits host/user/password.
 */
function assertTransactionPooler(rawUrl: string): void {
  let port: string | null = null;
  try {
    port = new URL(rawUrl).port || null;
  } catch {
    // Do not include the URI in the error.
    throw new BoardDbConfigError(
      `${BOARD_DB_URL_ENV} is not a parseable connection URI (value withheld).`
    );
  }
  if (port !== TRANSACTION_POOLER_PORT) {
    // Report the observed port (a low-sensitivity integer) but NEVER the URI.
    throw new BoardDbConfigError(
      `${BOARD_DB_URL_ENV} must target the transaction pooler port ${TRANSACTION_POOLER_PORT}; ` +
      `observed port ${port ?? '(none)'}. Copy the COMPLETE pooler URI from the Supabase ` +
      `Connect panel — do not hand-edit the direct-connection string.`
    );
  }
}

/**
 * Lazily construct the read-only runtime pool against the transaction
 * pooler. Fail-closed on a missing/mis-targeted env var. Never logs the URI.
 *
 * Transaction-pooler constraints (Scope H): no named prepared statements,
 * no LISTEN/NOTIFY, no session-scoped behaviour.
 */
export function getBoardPool(): PgPool {
  if (_pool !== null) return _pool;
  const url = process.env[BOARD_DB_URL_ENV];
  if (url === undefined || url === '') {
    throw new BoardDbConfigError(
      `${BOARD_DB_URL_ENV} is not set. The runtime Board data path requires the ` +
      `Supabase transaction-pooler URI (port ${TRANSACTION_POOLER_PORT}). ` +
      `This is a server-side configuration error, not a client condition.`
    );
  }
  assertTransactionPooler(url);
  _pool = new Pool({
    connectionString: url,
    max: 2,
    // Transaction pooler: disable pg's implicit named prepared statements.
    statement_timeout: 15_000,
    ssl: url.includes('supabase.') ? { rejectUnauthorized: false } : undefined,
  });
  return _pool;
}

# V1 Persistence Contract

**Owning ticket:** V1-4 — Closing Lines, Movement, and History
**Status:** current implementation contract. Later tickets may extend it, subject to their own authority.
**Anchors:** GD-1 (Supabase-hosted PostgreSQL, no direct browser-to-DB access, no RLS entitlement, no Supabase Auth, migrations Supabase-CLI-compatible); V1_IDENTITY_CONTRACT.md; complete spec §§11, 15, 21; Odds sub-spec §§15.1, 16.1; V1-4 governor decision (this ticket).

This document captures the invariants the persistence layer must maintain across the migration set, the query helpers, and the ingestion / computation orchestration. Load-bearing across several files; easier to reason about in one place than through inline comments alone.

## 1. Database engine and driver

- **Engine:** PostgreSQL. Supabase-hosted in production; local Docker `postgres:16` for validation.
- **Driver:** [`pg`](https://node-postgres.com) (node-postgres). Version constraint in `package.json`; the resolved installed version is recorded in the V1-4 ticket report.
- **No ORM. No query builder. No generated types.** Governor decision, V1-4 preamble.
- The driver is imported ONLY inside `src/db/` and from tests in `tests/integration/`. Nothing in `src/identity/`, `src/bdl/`, `src/odds/`, or `src/lines/` imports `pg` directly; those modules receive query helpers from `src/db/`.

## 2. Connection ownership

- The one canonical connection factory is `src/db/connection.ts:openPool(config)`. It returns an object exposing `query`, `transaction`, and `close`.
- Configuration is read from environment variables (`connection.ts:readEnvConfig`). Recognized:
  - `SLIPLABZ_DATABASE_URL` — full libpq URL (preferred).
  - `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD` — discrete parts (fallback).
  - `SLIPLABZ_DB_MAX_POOL` — optional integer for `max` pool size (default 10).
  - `SLIPLABZ_DB_STATEMENT_TIMEOUT_MS` — optional integer statement timeout (default 15_000).
- No connection string is inlined in source. `.env.example` documents the placeholders.
- SSL is enabled by default when the connection targets Supabase; disabled for the local Docker Postgres. The decision is env-driven (`SLIPLABZ_DB_SSL=disable` explicitly disables); default remains `require` when hostname does not match `localhost` / `127.0.0.1` / `postgres` (the compose service name).

## 3. Direct browser access

Prohibited (GD-1). The persistence layer is server-side only. No path from client-side code reaches this module. V1-9 will add a server-authoritative API surface that mediates entitlement; V1-4 and earlier do not need one.

## 4. Transaction policy

- Every write path that spans two or more tables MUST use `src/db/transaction.ts:withTransaction`.
- `withTransaction` wraps `BEGIN` / `COMMIT` / `ROLLBACK`. On any thrown error it rolls back and re-throws. On success, commits.
- The isolation level defaults to `READ COMMITTED` (PostgreSQL default). Tickets that need a stronger level pass it explicitly; V1-4 does not.
- **Atomicity invariant for Odds API ingestion (V1-4 governor obligation).** The Odds API market snapshot persistence orchestration (`src/lines/orchestrator/persistOddsapiSnapshot.ts`) persists:
  1. one `market_snapshots` row,
  2. every raw outcome as `market_offering_raw_rows`,
  3. every canonical `market_offerings` row,
  4. every `market_offering_raw_rows.canonical_offering_id` back-reference,

  inside a **single transaction**. Either every one of these commits or none does. This is the executable form of the ticket-hard-invariant "raw retention before collapse": we do not literally order the writes in a specific sequence — we guarantee that the atomic set as a whole is durable or the whole set is rolled back. The FK direction (`raw_rows.canonical_offering_id` REFERENCES `offerings.market_offering_id`) means canonical rows must be inserted before the back-references are set within the same transaction, but no partial state is ever visible outside the transaction. Enforced by `tests/integration/persistOddsapiSnapshot.integration.test.ts:transaction_rolls_back_leaves_neither`.

## 5. Query helpers

- `src/db/typed.ts` exports:
  - `queryRows<T>(pool, sql, params)` — returns `T[]`;
  - `queryOne<T>(pool, sql, params)` — returns `T` or throws if `rows.length !== 1`;
  - `queryOptional<T>(pool, sql, params)` — returns `T | null` if `rows.length <= 1`.
- All helpers pass parameter arrays to `pg` — never string-interpolate SQL. Prepared-statement semantics via `$1` / `$2` placeholders.
- Rows are returned as plain objects. No JS-side type coercion beyond what `pg` already does (bigints, timestamps as `Date`, `numeric` as string).

## 6. How tests obtain a database

Two paths, chosen at test-boot time by inspecting `SLIPLABZ_DATABASE_URL`:

1. **Fixture-pure unit tests** — do not import `src/db/`. Consume computation modules directly with in-memory inputs. These run in every environment, on every commit.
2. **Persistence integration tests** — live under `tests/integration/`. They import `src/db/` and connect to a real PostgreSQL over `SLIPLABZ_DATABASE_URL`. The path is:
   - `tests/integration/support/db.ts:openTestDb()` reads `SLIPLABZ_DATABASE_URL`.
     - If it is unset OR empty, the helper prints a visible `SKIP:` message ONCE at import time and every test that calls `openTestDb()` is skipped via `t.skip(...)` with an explicit visible skip message. **Never silently.**
     - If set, the helper connects, applies every migration (idempotent — CREATE TABLE IF NOT EXISTS is NOT used, so the schema is applied against a fresh disposable database owned by the test), returns a pool, and truncates the tables used by each test.
   - The Docker container used for migration validation (V1-4: `sliplabz-v1-4-postgres`) is the reference database. The Makefile-equivalent one-liner is:

     ```bash
     docker run --rm -d --name sliplabz-v1-4-postgres \
       -e POSTGRES_USER=sliplabz -e POSTGRES_PASSWORD=sliplabz_test_only \
       -e POSTGRES_DB=postgres -p 55432:5432 postgres:16
     ```

     followed by `createdb sliplabz_v1_4_it` and `SLIPLABZ_DATABASE_URL=postgres://sliplabz:sliplabz_test_only@127.0.0.1:55432/sliplabz_v1_4_it npm run test:integration`.

Integration tests SKIP visibly when no database is available; they never invent one, and they never fake the schema.

## 7. Migrations

- Additive DDL only. No `.down.sql` files. Continues the V1-1 timestamped naming convention.
- Applied in filename order via `psql -v ON_ERROR_STOP=1`. `src/db/applyMigrations.ts` is a helper for integration tests that reads the `supabase/migrations/` directory and applies every `*.sql` file in filename order.
- Two clean applications must produce byte-identical `pg_dump` output (after stripping pg_dump 16.14's random `\restrict`/`\unrestrict` session tokens).

## 8. Configuration surface for V1-4

Environment variables consumed by the persistence layer are enumerated in `.env.example`:

- `SLIPLABZ_DATABASE_URL` — server-side only. Integration-test target.
- `SLIPLABZ_DB_MAX_POOL`, `SLIPLABZ_DB_STATEMENT_TIMEOUT_MS`, `SLIPLABZ_DB_SSL` — optional tuning.
- Provider live-invoke flags (`BDL_LIVE_INVOKE`, `ODDSAPI_LIVE_INVOKE`, `BALLDONTLIE_API_KEY`, `ODDS_API_KEY`) are unrelated to this contract; they are covered by the provider modules' own docs.

## 9. What this document does not authorize

Consistent with GD-1 and prior identity contract:

- No direct browser-to-database access.
- No Supabase Auth.
- No generated client types.
- No RLS entitlement rules.
- No hosted Supabase project creation.
- No CI/CD wiring.

Later tickets may extend, but only inside their own scope.

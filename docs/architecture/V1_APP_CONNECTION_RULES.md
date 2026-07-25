# V1 application connection rules (founder-approved)

Referenced from `apps/web/next.config.mjs` and `apps/web/src/lib/server/db.ts`.
These rules govern how the Next.js Board application (and future app surfaces)
connect to the Supabase Postgres database.

## Pooler selection

- **Application runtime** uses the Supabase **transaction pooler, port 6543**.
  The runtime Board data path (`apps/web/src/lib/server/db.ts`) reads
  `SLIPLABZ_BOARD_DATABASE_URL` and fails closed unless that URI targets port
  6543.
- **Migrations and deliberate administrative operations** use the Supabase
  **session pooler, port 5432**. The application NEVER runs migrations, and
  application deployment MUST NEVER trigger a migration automatically.

## Copy the complete pooler URI — never hand-edit

- ALWAYS copy the **complete** pooler URI from the Supabase **Connect** panel.
- NEVER construct a pooler URI by editing the direct-connection string. The
  pooler username format is `postgres.<project_ref>`; hand-editing produces a
  `28P01` (password authentication failed) that is **indistinguishable from a
  wrong password**, so the mistake is very hard to diagnose.
- The direct-connection route required IPv6 and was **unusable from this
  project's execution environment** (an observed, environment-specific
  failure). Use the pooler URIs. (This is an environment-specific observation,
  not a claim that the direct hostname universally fails to resolve.)

## Transaction-pooler constraints

Through the transaction pooler (6543), do **NOT** use:

- named prepared statements;
- `LISTEN` / `NOTIFY`;
- any session-scoped database behaviour.

The runtime pool is configured accordingly (short statement timeout, small
pool, no session state).

## Runtime & secrecy

- The Postgres path runs on the **Node runtime** (never edge). Any future
  Stripe-sensitive path must also avoid edge.
- The connection URI is read from a **non-public** environment variable
  (`SLIPLABZ_BOARD_DATABASE_URL`) — never a `NEXT_PUBLIC_*` name — so it is
  never inlined into a client bundle.
- Configuration errors NEVER print or re-emit the URI or any credential; only
  the env var name and low-sensitivity facts (e.g. the observed port integer)
  are surfaced.

## Provisioning status (as of V1-6a)

- `SLIPLABZ_BOARD_DATABASE_URL` (the 6543 transaction-pooler URI) is **not yet
  provisioned** in this environment. Local V1-6a validation therefore uses an
  injected in-memory fixture repository; the Postgres path is build-,
  typecheck-, and unit-verified and awaits the 6543 env var (and a Vercel
  preview) to run against hosted. Today's hosted `evidence_method_v2` count is
  0, so the authoritative Board result is the empty state regardless.

# SlipLabz Board — V1-6a vertical slice (`apps/web`)

Isolated Next.js App Router application. It does not alter the root backend
toolchain (own `package.json`, `package-lock.json`, `node_modules`, `tsconfig`).

Connection rules: `../../docs/architecture/V1_APP_CONNECTION_RULES.md`.

## Scripts (run from `apps/web/`)

| Script | What it does |
|---|---|
| `npm test` | **Fast** unit suite (`test/**`): projection allowlist, key-set assertion, method selection, DR-20 ordering, copy-safety. No build, no server, no hosted dependency. |
| `npm run typecheck` | `tsc --noEmit`. |
| `npm run build` | Production build. |
| `npm run audit` | **Slow, self-contained audits** (`test-audit/**`): builds the app, then runs the two committed proofs below. Requires no hosted connectivity — it serves the in-memory FIXTURE data source. |

## The audits — `npm run audit`

Runs `next build --webpack` and then, serially:

1. **`test-audit/serialization.test.ts` — browser-visible serialization audit.**
   Serves the app against the fixture data source, requests the Board route,
   captures the **complete** response bodies (initial HTML including
   `<script>` and the RSC flight, plus the `RSC: 1` navigation response) and
   asserts every distinctive prohibited fixture value is absent. It also scans
   the built client bundles and the server log. Two guards stop it passing
   vacuously: it asserts the RSC flight marker (`__next_f`) IS present in the
   captured body, and that known-allowed content (a cap tag, the provenance
   text) IS present. It also asserts the empty state renders for zero rows.
   Captured bodies/logs are held in memory; nothing is left on disk.

2. **`test-audit/negativeBoundary.test.ts` — negative server-only proof.**
   Generates a temporary client component importing the server-only database
   module, builds it as a subprocess EXPECTING failure, and asserts both a
   non-zero exit AND the `server-only` diagnostic naming the offending client
   file. The fixture is removed in `finally`; afterward the valid app must
   still build.

Both are HTTP-/subprocess-level and deterministic; no browser-testing stack is
required because the slice emits no client fetch and no route handler.

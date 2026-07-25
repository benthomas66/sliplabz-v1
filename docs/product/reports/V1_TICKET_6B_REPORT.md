# V1-6b — BUILDER PARITY AND PREVIEW DEPLOYMENT — REPORT

**Outcome: Scopes A–C and E COMPLETE and validated locally. Scope D (preview deploy)
HALTED on precondition 1** — the Vercel project is misconfigured (Root Directory `.`,
Framework `Vite`), so no deployment was attempted. Precise founder instructions below.
GAP-13 remains open pending that fix; GAP-15 registered. Nothing committed.

## Starting state — HEAD matches; one benign, explained discrepancy
```
git rev-parse HEAD : 2b01248914d948967823101fb6ee01777673b1e9   ✓ (expected)
git log --oneline -3: 2b01248 / 4c5b3e3 / bf203a5
git status --short  :  M apps/web/.gitignore
                      ?? docs/product/reports/V1_TICKET_A2_3_REPORT.md
```
HEAD is exact; no committed **source** file changed. The one deviation from the expected
clean tree is **`apps/web/.gitignore` (modified)** — it gained `.vercel` and `.env*`. This
is the Vercel CLI's standard side-effect when a project is **linked**: a `.vercel/` dir now
exists (`projectId prj_nY1Pyzci1CroQS6DsrgHe8MpGOR6`, `orgId team_MbPtyvkFcXJWFjrQxTVrBfqm`,
`projectName "web"` — IDs, not secrets), and `.vercel` is now git-ignored. This is **founder
Vercel provisioning** — exactly the Scope D precondition-1 setup this ticket presupposes
("the first Vercel deployment attempt"). It is not a code/base-integrity change. I left it
untouched (did not revert, did not commit) and proceeded, recording it here transparently.
The only **untracked** file remains the A2-3 report, as expected.

---

## SCOPE A — BUILDER PIN (`--webpack`)

### Builder-invocation inventory — every `next build`, with its flag
| # | Location | Invocation | Builder flag | Action |
|---|---|---|---|---|
| 1 | `apps/web/package.json` → `build` | `next build` | **none → Turbopack default** | **CHANGED → `next build --webpack`** |
| 2 | `apps/web/package.json` → `audit` | `next build --webpack && …` | `--webpack` | already correct |
| 3 | `apps/web/test-audit/negativeBoundary.test.ts` `build()` (called ×2: line 43 invalid-fixture build, line 59 valid rebuild) | dynamic — quoted below | `--webpack` | already correct |
| 4 | `apps/web/test-audit/serialization.test.ts` | **no build**; asserts `.next` exists (produced by #2's `next build --webpack`) | n/a | correct by construction |
| — | `apps/web/test-audit/deployedResponse.test.ts` (Scope E, new) | **no build**; fetches a URL | n/a | n/a |

Dynamic construction in #3 (quoted verbatim):
```ts
const NEXT_BIN = join(APP_DIR, 'node_modules', 'next', 'dist', 'bin', 'next');
function build() {
  const r = spawnSync(process.execPath, [NEXT_BIN, 'build', '--webpack'], { cwd: APP_DIR, encoding: 'utf8', env: { ...process.env } });
  return { status: r.status, output: `${r.stdout ?? ''}\n${r.stderr ?? ''}` };
}
```
The audit RUN therefore issues 3 webpack builds total (1 from the `audit` script + 2 from
the negative test). **Every `next build` in the app now uses `--webpack`.** The only
invocation missing it was the `build` script — the exact command Vercel runs — which was the
deployment failure's root cause.

### `next.config.mjs` comment — WHY the pin exists (updated)
The header comment now records: (1) Next 16 defaults to Turbopack, which does not honour the
webpack `extensionAlias`; (2) that `.js`→`.ts` extensionAlias is the **load-bearing
mechanism** by which the app consumes committed backend modules (`dr20Compare`, the compact
renderer) without duplicating them; (3) **parity** — the committed serialization audit's
bundle scan must run against the same builder that produces the deployed artifact; and that
removal requires the separate **Turbopack-migration ticket (GAP-15)** — never removed
piecemeal.

---

## SCOPE B — REPRODUCE VERCEL'S BUILD LOCALLY (clean state)
```
rm -rf .next && npm run build      # = `next build --webpack`
→ ✓ Compiled successfully; Running TypeScript … Finished; Generating static pages (3/3)
   Route: ○ /   ○ /_not-found   ƒ /board          build exit 0
```
No Turbopack warning, no `WorkerError`. It completed for no reason beyond the builder flag.

- `npm run audit` → **7 pass / 0 fail** (build + serialization 5 + negative 2); no lingering
  server, no leftover `audit_negproof` fixture.
- `npm test` (fast) → **14 pass / 0 fail**. App `tsc --noEmit` → exit 0.
- Root (UNTOUCHED): `tsc --noEmit` → exit 0; unit → **573 pass / 0 fail**; full serial
  integration → **124 pass / 0 fail**. No committed backend file, authority, or explanation
  template changed.

---

## SCOPE C — GAP-15 REGISTERED
`docs/product/V1_OPEN_GAPS.md` gains **GAP-15** ("apps/web is pinned to the deprecated-path
webpack builder", found: first Vercel deployment attempt, 2026-07-25 — Turbopack default
warning then WorkerError; deliberate deferral; migration requires a Turbopack-verified
resolution mechanism + all invocations switched together + the full serialization audit
re-run under the new builder; webpack is on a deprecation path so the pin has a shelf life)
plus the traceability-index line for `V1_TICKET_6B_REPORT.md`.

---

## SCOPE D — PREVIEW DEPLOYMENT — HALTED ON PRECONDITION 1

Verified via the Vercel CLI **without any credential in chat** — the CLI is already
authenticated by a stored founder session (`npx vercel whoami` → `benfthomas6-7330`; no
token printed, none in env or `.env`).

**Precondition 2 (DB env var) — MET.** The exact name the server db module reads, quoted
from `apps/web/src/lib/server/db.ts`:
```ts
const BOARD_DB_URL_ENV = 'SLIPLABZ_BOARD_DATABASE_URL';   // used at: process.env[BOARD_DB_URL_ENV]
```
`vercel env ls` shows `SLIPLABZ_BOARD_DATABASE_URL` set for **Preview** (Encrypted; value
never printed). Correct name, correct environment.

**Precondition 1 (Root Directory = `apps/web`) — NOT MET.** `vercel project inspect web`:
```
Root Directory     .            ← must be apps/web
Framework Preset   Vite         ← must be Next.js
Build Command      npm run build
Output Directory   dist         ← Vite output; Next uses .next
Created            22 June 2026 (33d ago)
```
This "web" project is configured as a **Vite app at the repository root** — a leftover
scaffold, not set up for the Next.js app in `apps/web/`. Additionally there is **no git
remote** (`git remote -v` empty), so a Git-integration deploy is impossible, and (separately)
would build the committed code, which does not contain this ticket's uncommitted builder fix.

Per Scope D I completed Scopes A–C, **committed nothing, attempted no deployment, and halt**.
Deploying against this configuration would fail confusingly (Vite/root vs Next/apps-web) and
is not authorized before the precondition is satisfied.

### FOUNDER ACTIONS REQUIRED (to unblock GAP-13 / Scope D re-run)
In the Vercel **"web"** project settings:
1. **Root Directory** → `apps/web` (currently `.`). This makes Vercel build the app in
   `apps/web/` while the whole repo is present, so the app's `../../src` imports (the
   committed backend modules) resolve.
2. **Framework Preset** → **Next.js** (currently `Vite`).
3. **Output Directory** → default/auto for Next.js (currently `dist`).
4. **Build Command** → leave as `npm run build` (which, under Root Directory `apps/web`, runs
   this app's `build` = `next build --webpack` once this ticket is committed) — or set it
   explicitly to `next build --webpack`.
5. **Deploy topology / the uncommitted-fix problem.** There is no git remote, and this
   ticket's builder fix is uncommitted. So the deploy must either: (a) commit + land this
   ticket (a governor action) and then a CLI/Git deploy builds the fixed `build` script; or
   (b) a **CLI preview deploy from the local working tree** (`vercel deploy`, never `--prod`)
   that uploads the working tree including the fix. Because the app imports files **outside**
   `apps/web/` (`../../src`), a CLI deploy must include the repo root with Root Directory
   `apps/web` — confirm the intended topology before deploying.
6. `SLIPLABZ_BOARD_DATABASE_URL` for Preview is already set (precondition 2) — no action.

Once (1)–(3) are set and (5) is decided, re-run Scope D + E: `vercel deploy` (preview only)
then the committed deployed-response audit below against the returned URL.

---

## SCOPE E — DEPLOYED-RESPONSE AUDIT (committed script; run pending deploy)

Written as a committed, re-runnable, URL-driven test:
**`apps/web/test-audit/deployedResponse.test.ts`** — takes the preview URL via
`DEPLOY_BOARD_URL` and, against the LIVE deployed body:
- fetches `${URL}/board` complete raw HTML (incl. `<script>`);
- **POSITIVE CONTROL** — asserts the approved empty-state copy renders (today's honest
  deployed result, hosted holding 0 v2 rows). If a config-error page shows instead → the
  env var is wrong/absent → the test FAILS loudly (assertion not weakened);
- **ANTI-VACUOUS GUARD** — asserts the RSC flight marker `__next_f` is present in what was
  fetched;
- asserts none of the distinctive prohibited fixture values, and no connection-string /
  credential material (`postgres://`, `postgresql://`, `SLIPLABZ_BOARD_DATABASE_URL=` value)
  — the env var NAME may appear in error text; its VALUE never;
- extracts `/_next/static/**.js` bundle URLs from the page and scans each for db code,
  secrets, and prohibited values.

It **skips** (does not fail) when `DEPLOY_BOARD_URL` is unset, and is NOT collected by
`npm test` (`test/**`) or the `audit` script (which lists only `serialization` +
`negativeBoundary`) — so it never runs vacuously in the normal suites.

**Functionality smoke test (NOT deployment evidence):** run against a LOCAL empty-state
server (`BOARD_DATA_SOURCE=fixture_empty next start`) it passes **2/2** (empty-state
positive control found, `__next_f` present, no prohibited values, bundles clean); pointed at
a non-empty/error page it correctly FAILS the positive control — proving it is not vacuous.
The real acceptance run against the deployed URL is **PENDING the Scope D deploy**.

**What CANNOT run against a deployed URL (documented, not dropped):** the **server-log
scan** (no access to the deployed server's stdout) and the **fixture-driven populated-Board
case** (the deployed app reads hosted, where 0 v2 rows exist → the honest deployed result is
the empty state). Those remain covered by the committed LOCAL audit (`serialization.test.ts`)
under the **same webpack builder** — which is exactly what Scope A's pin guarantees (the
audited artifact and the deployed artifact are now products of the same builder).

---

## FINAL `git status --short --untracked-files=all` — every path classified
```
 M apps/web/.gitignore                                  → PRE-EXISTING (founder Vercel-CLI link side-effect; not my edit; not committed)
 M apps/web/next.config.mjs                             → V1-6b Scope A (builder-pin rationale comment)
 M apps/web/package.json                                → V1-6b Scope A (build script → next build --webpack)
 M docs/product/V1_OPEN_GAPS.md                         → V1-6b Scope C (GAP-15 + traceability line)
?? apps/web/test-audit/deployedResponse.test.ts         → V1-6b Scope E (deployed-response audit script)
?? docs/product/reports/V1_TICKET_6B_REPORT.md          → V1-6b (this report)
?? docs/product/reports/V1_TICKET_A2_3_REPORT.md        → PRE-EXISTING (not mine; untouched, not staged)
```
Git-ignored and NOT shown/committed: `apps/web/.vercel/` (founder project link), `.next/`,
`node_modules/`, `*.tsbuildinfo`, `next-env.d.ts`. No captured audit artifact, no
`audit_negproof` fixture, no logs, no token/credential anywhere.

Nothing committed. No deployment. No `--prod`. No Turbopack migration. No migration. No
hosted write. No token/credential/env value printed.

## COMMIT / PENDING STATE (governor commit authorization, 2026-07-25)
Scopes **A, B, C, and E are complete and committed** in this ticket. **Scope D (the deploy
itself) is HALTED** on Vercel project misconfiguration (Root Directory `.`, Framework `Vite`
— see Scope D above). Committing the completed scopes does not block the deploy; the deploy
DEPENDS on the pinned webpack builder being present in the artifact, which this commit
provides. The **deployed-response audit (Scope E against a live URL) runs in the follow-up**
once the founder fixes the project settings (Root Directory → `apps/web`, Framework →
Next.js). **GAP-13 remains OPEN** until that deployed-response audit has run against a live
preview.

The `apps/web/.gitignore` change (ignoring `.vercel/` and `.env*`) is the founder's
Vercel-CLI provisioning side-effect. It is **real configuration that must persist** (so the
`.vercel/` project link is never committed), and therefore **rides in this V1-6b commit** —
it is not a stray edit.

*Report generated 2026-07-25. No commit performed per ticket instruction (commit performed
under the subsequent governor commit authorization).*

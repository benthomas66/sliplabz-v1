# V1-6c — PREVIEW DEPLOY AND DEPLOYED-RESPONSE AUDIT — REPORT

**Outcome: HALTED at STEP 2.** The remote build **compiled successfully** (validating the
committed webpack pin and the `../../src` cross-package resolution on Vercel), but the
**deployment failed at the output stage** because the Vercel project's **Output Directory is
still `dist`** (a leftover Vite setting) instead of automatic for Next.js. This is a
founder project-setting fix, not a code fix. No preview URL was produced, so the
deployed-response audit (STEP 3) could not run. **GAP-13 remains OPEN.**

I chose a separate `V1_TICKET_6C_REPORT.md` (not an append to 6B) because 6B is committed
and closed, and this is a distinct halted ticket with its own founder action item.

## Starting state (verified — exact match)
```
HEAD          : d75ad0b2d5ab2dbc0eab8fb8bb06beea1e61888f   ✓
git log -3    : d75ad0b / 2b01248 / 4c5b3e3
git status    : ?? docs/product/reports/V1_TICKET_A2_3_REPORT.md   (only untracked; left alone)
apps/web/.vercel : present, git-ignored ✓
```

## STEP 1 — PREFLIGHT (passed)
- Clean build at the pinned builder: `rm -rf apps/web/.next && (cd apps/web && npm run build)`
  → **exit 0** (`next build --webpack`; Route `ƒ /board` dynamic).
- Deployed-response audit exists with its URL-input contract (quoted from
  `apps/web/test-audit/deployedResponse.test.ts`):
  ```ts
  const BASE = process.env['DEPLOY_BOARD_URL'];
  const skip = BASE === undefined || BASE === '' ? 'DEPLOY_BOARD_URL not set' : false;
  function boardUrl(): string { return `${BASE!.replace(/\/$/, '')}/board`; }
  ```
- Vercel CLI is authenticated non-interactively (`npx vercel whoami` → `benfthomas6-7330`;
  no token printed/stored). No interactive login was required.

## TOPOLOGY RESOLUTION (exact commands, no secrets)
The project link lives at `apps/web/.vercel`, but the app imports `../../src`, so a deploy
from inside `apps/web` would upload only that subtree and the parent imports would be absent
remotely. Per the governor topology ruling I deployed from the **repository root** with the
whole tree, using a root link to the **same existing project** (a portable pointer copy — no
new project, no source moved):
```
cp -r apps/web/.vercel ./.vercel        # root link → SAME project prj_nY1Pyzci1CroQS6DsrgHe8MpGOR6 ("web")
npx vercel deploy --yes                  # PREVIEW only (no --prod), run from repo root
rm -rf ./.vercel                         # removed the transient root link afterward
```
`apps/web/.vercel` was left intact; nothing under `.vercel/` was staged.

## STEP 2 — DEPLOY (PREVIEW) — remote build OK, deploy FAILED on output directory
The remote build ran and **compiled successfully**:
```
▲ Next.js 16.2.11 (webpack)
Creating an optimized production build ...
✓ Compiled successfully in 5.6s
Running TypeScript ... Finished TypeScript in 2.9s ...
✓ Generating static pages (3/3)
```
This confirms two things remotely: (1) the **webpack builder pin is honoured** on Vercel
(no Turbopack default, no WorkerError — the V1-6b fix works in the deployed pipeline), and
(2) the app's `../../src` imports **resolve** because the whole tree was uploaded from the
repo root with Root Directory `apps/web`.

The deploy then **failed at the output stage**:
```
{ "status": "error", "reason": "deploy_failed",
  "message": "The Next.js output directory \"dist\" was not found at
              \"/vercel/path0/apps/web/dist\". ..." }
```
Root cause — the current Vercel project settings (`vercel project inspect web`):
```
Root Directory     apps/web      ✓ (founder-fixed)
Framework Preset   Next.js       ✓ (founder-fixed)
Build Command      npm run build ✓ (runs apps/web's build = next build --webpack)
Output Directory   dist          ✗ leftover Vite value — Next.js emits to .next
```
The explicit `dist` Output Directory override makes Vercel look for `apps/web/dist`, which a
Next.js build never produces. Per STEP 2 I captured the log and halted; I did NOT retry, and
I did NOT add a `vercel.json`/code workaround to chase a remote-only, settings-caused
failure. Changing the Output Directory is a project setting (founder provisioning) I am
forbidden to perform.

### FOUNDER ACTION REQUIRED (to unblock STEP 3 / GAP-13)
In the Vercel **"web"** project → Settings → **Build & Development Settings** →
**Output Directory**: **clear the `dist` override** (leave it blank / "automatic") so the
Next.js preset uses `.next`. Root Directory (`apps/web`), Framework Preset (Next.js),
Build Command (`npm run build`), and the Preview `SLIPLABZ_BOARD_DATABASE_URL` env var are
already correct. After that single change, re-run V1-6c: the deploy will produce a preview
URL and the committed `deployedResponse.test.ts` runs against it.

## STEP 3 — DEPLOYED-RESPONSE AUDIT — NOT RUN
No preview URL was produced (the deploy failed before publishing), so there was no live
artifact to audit. The committed URL-driven audit remains ready and runs unchanged once the
Output Directory is fixed.

## STEP 4 — GAP-13 — REMAINS OPEN
Not marked resolved: resolution requires the deployed-response audit green against a live
preview, which is blocked by the Output Directory setting. The register is left unchanged
(GAP-13 stays OPEN); this report records the progress (remote build validated; deploy
blocked on a single project setting).

## Compliance
No production deployment, no `--prod`. No deployment protection disabled. No Vercel project
created; the existing project was linked, not duplicated. No env value set; no token,
credential, or env value printed/stored. No application source, audit-test logic, backend
file, authority, or explanation template modified. No migration, no hosted write. Nothing
staged (nothing under `.vercel/`), nothing committed.

## FINAL `git status --short --untracked-files=all` — every path classified
```
?? docs/product/reports/V1_TICKET_6C_REPORT.md   → V1-6c (this report; uncommitted deliverable)
?? docs/product/reports/V1_TICKET_A2_3_REPORT.md → PRE-EXISTING (not mine; untouched)
```
`apps/web/.vercel/` remains git-ignored (founder link, intact); the transient root `.vercel`
was removed. No `.next/`, `node_modules/`, captured deploy log, or token anywhere in the tree.

*Run-1 section generated 2026-07-25. No commit performed per ticket instruction.*

═══════════════════════════════════════════════════════════════════════════════

# V1-6c — RUN 2 (governor amendment: scoped code change authorized, 2026-07-25)

**Outcome: the DEPLOY now SUCCEEDS; the deployed-response AUDIT is BLOCKED by Vercel
Deployment Protection (auth-gated preview).** The founder's Output-Directory fix is in
place, the authorized `outputFileTracingRoot` change resolved the ENOENT, and a preview
deployment is live and `READY`. But anonymous fetches of the preview redirect to Vercel SSO,
so the committed audit cannot reach the app. I did NOT disable protection and had no
automation-bypass secret. **GAP-13 remains OPEN** pending one founder setting.

## The authorized code change (exact diff — the ONLY change)
`apps/web/next.config.mjs`:
```diff
+import path from 'node:path';
-  outputFileTracingRoot: import.meta.dirname,
+  outputFileTracingRoot: path.join(import.meta.dirname, '../../'),
```
(plus the adjacent comment rewritten to record: tracing root = repo root because the app
consumes `../../src`; pointing it at the app dir caused Vercel to look for `.next` at the
upload root — the RUN-1/attempt ENOENT; and the explicit root also covers the original
lockfile-inference warning.) The value resolves to the repository root
(`path.join(import.meta.dirname, '../../')`, where `import.meta.dirname` = `apps/web`).
Nothing else in any file changed.

## Local revalidation (mandatory — the config change alters the emitted artifact)
- Clean build `rm -rf apps/web/.next && (cd apps/web && npm run build)` → **success**, still
  `Next.js 16.2.11 (webpack)`, no Turbopack warning, no lockfile-inference warning.
- **Full committed audit `npm run audit` → 7 pass / 0 fail** (build + serialization 5 +
  negative 2). The bundle-scan target moved with the config; it is green under the same
  builder — the precondition for trusting the deploy.
- App fast `npm test` → **14 pass / 0 fail**; app `tsc --noEmit` → exit 0.
- Root (UNTOUCHED): `tsc --noEmit` → 0; unit → **573 pass / 0 fail**; full serial integration
  → **124 pass / 0 fail**. Only `apps/web/next.config.mjs` changed.

## STEP 2 — DEPLOY (PREVIEW) — SUCCESS
Topology (exact commands, no secrets): `cp -r apps/web/.vercel ./.vercel` (root link → same
project `prj_nY1Pyzci1CroQS6DsrgHe8MpGOR6`), `npx vercel deploy --yes` (preview; **no
`--prod`**) from the repo root, then `rm -rf ./.vercel`.
```
status: ok   readyState: READY   target: null (= PREVIEW, not production)
Preview URL: https://web-d6bk2hzqa-bens-projects-593972b9.vercel.app
Build: ✓ Compiled successfully (webpack) → Build Completed in /vercel/output [27s] → Deploying outputs… ✓
```
The `outputFileTracingRoot` fix **resolved the ENOENT** — "Deploying outputs…" completed and
the deployment is live. This validates remotely: the webpack pin, the `../../src`
whole-tree resolution, and the corrected tracing root.

## STEP 3 — DEPLOYED-RESPONSE AUDIT — BLOCKED BY DEPLOYMENT PROTECTION
Anonymous `GET {preview}/board` returns:
```
HTTP/2 302
location: https://vercel.com/sso-api?url=…%2Fboard&nonce=…
```
i.e. **Vercel Deployment Protection (Vercel Authentication)** is enabled for previews;
anonymous requests are bounced to SSO before reaching the app. I checked for a documented
automation bypass: **no Protection-Bypass-for-Automation secret is exposed to me** (none in
`vercel env ls`), and creating/handling such a secret or disabling protection is forbidden
(founder territory). I did NOT disable protection and did NOT weaken any assertion.

The committed `deployedResponse.test.ts` run against the live URL behaved honestly — its
anti-vacuous **positive control correctly FAILED** because it received the SSO wall, not the
app:
```
✖ deployed Board HTML … empty-state positive control
  AssertionError: deployed page did not render the approved empty state
  ("No current Board profiles are available."). …
```
This proves the audit does not pass vacuously against a non-app response; it simply cannot
reach the app while protection gates anonymous access.

### FOUNDER ACTION REQUIRED (to unblock STEP 3 / close GAP-13)
Choose ONE (I must not do either):
1. **Preferred:** Vercel "web" project → Settings → **Deployment Protection** → set **Vercel
   Authentication** to **off for the Preview environment** (or "Only Production"), so preview
   URLs are anonymously fetchable. Then re-run V1-6c STEP 3.
2. **Or:** Settings → Deployment Protection → **Protection Bypass for Automation** → generate
   the secret and provide it to the execution environment through a secure channel (NOT
   chat) as an env var; the audit can then send `x-vercel-protection-bypass` without
   weakening protection. (This requires a small, separately-authorized tweak to pass the
   header — the committed test currently does a plain `fetch`.)

Either way the deployment, builder, and config are already proven correct; only the access
gate remains.

## STEP 4 — GAP-13 — REMAINS OPEN
Not marked resolved: closure requires the deployed-response audit green against a live,
fetchable preview, which is blocked by Deployment Protection. The register is left unchanged.

## Compliance (RUN 2)
Single authorized code change (`next.config.mjs` `outputFileTracingRoot`) — nothing else. No
`--prod`, no production deployment (`target: null`). Deployment protection **NOT** disabled.
No Vercel project created; existing project linked, not duplicated. No env value set; no
token/credential/env value printed, echoed, or stored. No source/audit-logic/backend/
authority/template change beyond the authorized line. No migration, no hosted write. Nothing
staged (nothing under `.vercel/`); nothing committed. Transient root `.vercel` removed;
`apps/web/.vercel/` intact and ignored; captured deploy logs removed from `/tmp`.

## FINAL `git status --short --untracked-files=all` — every path classified
```
 M apps/web/next.config.mjs                        → V1-6c RUN 2 (authorized outputFileTracingRoot → repo root)
?? docs/product/reports/V1_TICKET_6C_REPORT.md     → V1-6c (this report; uncommitted deliverable, updated RUN 1 + RUN 2)
?? docs/product/reports/V1_TICKET_A2_3_REPORT.md   → PRE-EXISTING (not mine; untouched)
```

*Run-2 section generated 2026-07-25. No commit performed per ticket instruction.*

═══════════════════════════════════════════════════════════════════════════════

# V1-6c — RUN 3 (resume STEP 3 after founder disabled preview protection, 2026-07-25)

**Outcome: COMPLETE. Deployed-response audit GREEN against the live preview. GAP-13 CLOSED.**

The founder disabled Deployment Protection for previews. No code, deploy, or settings change
by me this run — resumed STEP 3 against the SAME existing preview
`https://web-d6bk2hzqa-bens-projects-593972b9.vercel.app`.

## STEP 3 — DEPLOYED-RESPONSE AUDIT — GREEN
Anonymous access restored: `GET {preview}/board` → **HTTP 200** (no SSO redirect); the raw
HTML carries the approved empty-state copy and the `__next_f` flight marker.

The committed `deployedResponse.test.ts` (unchanged; no assertion weakened) against the LIVE
URL:
```
✔ deployed Board HTML: prohibited values + secrets absent; flight present; empty-state positive control
✔ deployed client bundles: no db code, no secrets, no prohibited values
tests 2 · pass 2 · fail 0
```
- **Complete raw HTML (incl. `<script>`/RSC):** none of the distinctive prohibited fixture
  values, no credential material, no server-only env-var VALUE.
- **Anti-vacuous flight guard:** `__next_f` present in the fetched body.
- **POSITIVE CONTROL observed = the approved EMPTY STATE** ("No current Board profiles are
  available."). This is the expected honest deployed result — hosted holds **zero v2
  profiles** (V1-A2-3 has not persisted any). Not a config-error page.
- **Client bundles** (`/_next/static/**.js`) fetched from the deployed host and scanned:
  no database code, no secrets, no prohibited values.

Differences from local behaviour observed: none material — the deployed empty-state response
matches the local empty-state response the committed local audit covers under the same
webpack builder (Scope A parity), which is exactly the guarantee that made the deployed
result trustworthy.

## STEP 4 — CLOSE THE LOOP
- `docs/product/V1_OPEN_GAPS.md`: **GAP-13 marked RESOLVED by V1-6c** (2026-07-25; preview
  URL recorded; deployed-response audit green). Row kept per register discipline; traceability
  line for `V1_TICKET_6C_REPORT.md` added.
- This report records the full arc: RUN 1 (Output-Directory halt) → RUN 2 (authorized
  `outputFileTracingRoot` fix; deploy success; protection block) → RUN 3 (protection off;
  audit green; closure).

## Compliance (RUN 3)
No code/deploy/settings change by me this run. No `--prod`, no production. No env value set.
No token/credential/env value printed or stored. No source/audit-logic/backend/authority/
template change. No migration, no hosted write. Only docs updated (register + this report);
nothing staged, nothing committed.

## FINAL `git status --short --untracked-files=all` — every path classified
```
 M apps/web/next.config.mjs                        → V1-6c (RUN 2 authorized outputFileTracingRoot → repo root)
 M docs/product/V1_OPEN_GAPS.md                     → V1-6c STEP 4 (GAP-13 → RESOLVED + traceability)
?? docs/product/reports/V1_TICKET_6C_REPORT.md     → V1-6c (this report; uncommitted deliverable)
?? docs/product/reports/V1_TICKET_A2_3_REPORT.md   → PRE-EXISTING (not mine; untouched)
```

*Run-3 section generated 2026-07-25. No commit performed per ticket instruction.*

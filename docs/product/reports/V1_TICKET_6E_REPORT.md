# V1-6e — Fixture Preview Mode — Report

**Date:** 2026-07-27
**Status:** COMPLETE — nothing committed. Production route untouched.

Gives the design review and the UX working chat a POPULATED Board — 23 synthetic
profiles spanning every classification, rendered through the REAL projection,
ranking, serving gate, and renderer — without game windows, credits, or any path
by which fixture data reaches production. The preview route selects its fixtures
SERVER-SIDE by route; there is no query/cookie/header/env switch on `/board`.

Starting state (verified): branch `main`, HEAD
`67c0679b81929fb46067988c07f04e566b4a4713`, worktree clean, `origin` present.

---

## Path mapping (stated, per ticket instruction)

The ticket named `apps/web/src/app/design-preview/page.tsx`. This app's Next.js
App Router lives at **`apps/web/app`** (the production route is
`apps/web/app/board/page.tsx`), so the preview route was created at
**`apps/web/app/design-preview/page.tsx`** — the only location Next will route.
No `apps/web/src/app` directory exists.

## Scope C — component reuse: NO MOVE NEEDED

`BoardTable` is already a shared component at `apps/web/components/BoardTable.tsx`,
imported by the production route via `../../components/BoardTable`. The preview
route imports the SAME component by the same path. Nothing moved, so the
production route's rendered output is byte-identical by construction (its five
server files are untouched — see the git-diff evidence below). Scope D#5
(byte-identity after a move) is therefore N/A.

---

## Scope A — the 23-fixture matrix (`apps/web/src/lib/server/designFixtures.ts`)

All rows built through the REAL types (`EvidenceProfileOutput` / `ComponentValues`
/ `RankedCandidate`) — no `as any`, no partial casts. `line_observed_at` is set
relative to an injected `serve_now` (age spread 0–3400s, all inside the 3600s
serve window so every row renders). Every row carries the DISTINCTIVE canary
values (composite score `…9182736455`, paid book `ZZQXFIXTUREBOOK7788`, price
`424242`) server-side so the audit's grep is meaningful.

| # | classification | dir | line | cap tag | prov | age s | books |
|---|---|---|---|---|---|---|---|
| 1 | strong_over | over | 24.5 | — | | 0 | 6 |
| 2 | moderate_over | over | 9.5 | — | | 300 | 5 |
| 3 | mixed | — | 5.5 | — | | 700 | 4 |
| 4 | moderate_under | under | 18.5 | — | | 1100 | 5 |
| 5 | strong_under | under | 2.5 | — | | 1500 | 6 |
| 6 | insufficient | — | 7.5 | — | | 1900 | 3 |
| 7 | unavailable | — | null | — | | 2300 | 0 |
| 8 | moderate_over | over | 21.5 | stale market | | **3400** | 5 |
| 9 | moderate_under | under | 8.5 | limited book coverage | | 250 | 2 |
| 10 | strong_over | over | 3.5 | push-heavy recent sample | | 2600 | 6 |
| 11 | moderate_over | over | 6.5 | market disagrees with history | | 2900 | 5 |
| 12 | strong_under | under | 15.5 | one-sided offering | | 3100 | 4 |
| 13 | strong_over | over | 11.5 | — | ✓ | 150 | 6 |
| 14 | moderate_under | under | 4.5 | — | ✓ | **3300** | 5 |
| 15 | moderate_over | over | 22.5 | stale market | ✓ | 1000 | 5 |
| 16 | mixed | — | 1.5 | — | ✓ | 500 | 4 |
| 17 | strong_over | over | 7.5 | — | | **3400** | 6 |
| 18 | moderate_over | over | 10.5 | — | | 1300 | 5 |
| 19 | insufficient | — | null | — | | 2000 | 2 |
| 20 | unavailable | — | null | — | | 2800 | 0 |
| 21 | strong_under | under | 6.5 | — | ✓ | 850 | 6 |
| 22 | moderate_under | under | 3.5 | push-heavy recent sample | ✓ | 1450 | 4 |
| 23 | moderate_over | over | 19.5 | one-sided offering | | 2150 | 3 |

Coverage: all **7 classifications**; all **5 owner-ratified cap tags** (stale
market, limited book coverage, push-heavy recent sample, market disagrees with
history, one-sided offering); `includes_backfilled_historical` on **6** rows
(≥2); the **stale-present-capped** profile (Moderate + STALE_CURRENT_MARKET) on
rows 8 and 15; `evaluated_line: null` on the Unavailable/Insufficient rows; and
all four projection field-combinations — {cap?}×{provenance?}: none/none (1–7,
17–20), cap/none (8–12, 23), none/prov (13, 14, 16, 21), cap/prov (15, 22).

### What could NOT be honestly constructed (finding, not forced)

Quality caps are placed ONLY on scored classifications (strong_/moderate_). A
quality cap presupposes a score to downgrade, so a cap tag on **Unavailable,
Insufficient, or Mixed** is type-constructible (the compact renderer imposes no
classification/cap consistency guard) but **semantically incoherent**. Per the
ticket's "do not force it" instruction those combinations were omitted, not
fabricated. Every combination that IS honest is present.

## Scope B — the preview route (`apps/web/app/design-preview/page.tsx`)

Server component: `designFixtureCandidates(serve_now)` → `new FixtureBoardRepository(candidates)`
→ the REAL `getBoardData(repo, serve_now)` (ranking via `dr20Compare` + the
committed serving gate, one injected `serve_now`) → the REAL `constructBoardProjection`
→ the REAL `BoardTable`. Below the board it renders the committed
`renderCompactExplanation` for all 23 fixtures (compact display line, provenance
marker, and the §G.1 disclosure — honesty furniture, server-rendered, not
stripped). The persistent, non-dismissible banner is server-rendered at the top:

> **DESIGN PREVIEW — FIXTURE DATA. Not live market information.**

---

## Route-isolation proof (hard boundary #1 & #2)

- **Source-graph assertion** (`designPreview.test.ts`): the production server
  files — `app/board/page.tsx`, `boardService.ts`, `boardRepository.ts`,
  `boardProjection.ts`, `rankedCandidate.ts` — contain neither `designFixtures`
  nor `design-preview`. The preview route wires `designFixtureCandidates` and
  selects the source unconditionally: it references no `searchParams`,
  `cookies(`, `headers(`, or `process.env`.
- **Production git-diff is EMPTY:** `git diff HEAD -- apps/web/app/board/
  apps/web/components/ apps/web/src/lib/server/boardService.ts
  apps/web/src/lib/server/boardRepository.ts apps/web/src/lib/boardProjection.ts
  apps/web/src/lib/rankedCandidate.ts apps/web/src/lib/boardService*.ts` →
  no output. The production route is untouched.
- **Served-HTML isolation** (serialization audit + deployed audit): the banner
  string `DESIGN PREVIEW` appears in the `/design-preview` response and NEVER in
  the `/board` response, local and deployed.

## Banner proof

- Constant asserted exactly: `DESIGN PREVIEW — FIXTURE DATA. Not live market information.`
- Rendered server-side (`data-testid="design-preview-banner"`, `role="alert"`),
  present in the raw HTML of `/design-preview` (local audit + deployed audit),
  absent from `/board`.
- Copy safety: the banner, heading, subheading, and every fixture player/team
  name pass the committed `sweepForbiddenTerms`. Names are obviously synthetic
  ("Fixture Guard A" … "Fixture Guard W"; teams "Preview City", "Test Town",
  "Mock Bay", "Sample Falls", "Preview Park", "Synthetic Springs") — no real
  WNBA player or team.

---

## Scope E — deployed preview (PREVIEW only, no `--prod`)

Topology per V1-6c: `cp -r apps/web/.vercel ./.vercel` (transient root link →
the SAME existing project `prj_nY1Pyzci1CroQS6DsrgHe8MpGOR6`, "web"),
`npx vercel deploy --yes` from the repo root, then `rm -rf ./.vercel`. No
`--prod`, no secret set, no env value changed, no credit spent. The founder link
`apps/web/.vercel/` is intact and git-ignored; no `.vercel` path appears in git
status.

**Preview URL (design review's working artifact):**
`https://web-nn2m8fu8x-bens-projects-593972b9.vercel.app`
(inspector: `https://vercel.com/bens-projects-593972b9/web/9hqBdEfxjqsCbcWRjD3gHKWTmYc1`)

**Deployed-response checks (`deployedResponse.test.ts`, `DEPLOY_BOARD_URL` set) — 4/4 pass:**

| Route | Result |
|---|---|
| `/board` | 200, unchanged behaviour — approved **empty state** (hosted's 99 v2 rows are now aged past 3600s → the serving gate suppresses them), `__next_f` present, prohibited values + secrets absent, **no banner** |
| `/design-preview` | 200, **banner present**, POPULATED board (cap + provenance furniture present), `__next_f` present, prohibited values + secrets absent |
| isolation | deployed `/board` carries no preview banner |
| client bundles | no db code, no secrets, no prohibited values |

---

## Tests & validation (Scope D) — all green, none weakened

| Suite | Result |
|---|---|
| App fast tests (`apps/web` `npm test`) | **30 / 30** (22 prior + 8 new design-preview) |
| App typecheck | exit 0 |
| Serialization audit (`npm run audit`) | **9 / 9** (7 prior + 2 new: `/design-preview` populated+clean, `/board` banner-free) |
| Root typecheck | exit 0 |
| Root unit | **573 / 573** |
| Full serial integration | **130 / 130** |
| Deployed-response audit (both routes) | **4 / 4** |

Scope D mapping: #1 route isolation ✓; #2 banner on preview / never on board ✓;
#3 all 23 render, every classification label, GD-15 (Unavailable ≠ Insufficient) ✓;
#4 serialization audit extended to `/design-preview` ✓; #5 byte-identity N/A (no
component moved) — production diff empty ✓; #6 full battery green ✓.

---

## Forbidden-list compliance

Production route data source untouched; no query/cookie/env switch on `/board`;
fixture names synthetic; banner + §G.1 disclosure + provenance furniture all
present in the preview; no new visual design (current components only); no
`src/evidence`/authority/threshold/gate/template change; no migration; no hosted
write; no credit spend; no `--prod`; no `git add`, commit, or push.

## Files (nothing committed)

New:
- `apps/web/src/lib/server/designFixtures.ts` — the 23-fixture matrix + preview copy
- `apps/web/app/design-preview/page.tsx` — the preview route
- `apps/web/test/designPreview.test.ts` — isolation / banner / 23-render / GD-15 / copy safety
- `docs/product/reports/V1_TICKET_6E_REPORT.md` — this report

Modified (test-only, additive):
- `apps/web/test-audit/serialization.test.ts` — `/design-preview` populated+clean; `/board` banner-free
- `apps/web/test-audit/deployedResponse.test.ts` — deployed `/design-preview` + `/board` isolation checks

The production route's five server files are unchanged.

# V1-6a — BOARD VERTICAL SLICE — REPORT

**Outcome: Scopes A–H COMPLETE and locally validated. Scope I (Vercel preview) is
PENDING EXTERNAL PROVISIONING** (no Vercel CLI/project/credentials exist in this
environment; per Scope I I did not create an account or request credentials). The
authoritative Board result today is the **approved empty state** — hosted holds **0**
`evidence_method_v2` profiles. v1's 145 rows remain hosted and untouched and are
intentionally excluded from the user-facing Board.

## Starting state (verified)
```
HEAD 4c5b3e392607b50c073bf7865ccf05b76bcc2a15  ("...v1/v2 wrappers (V1-A2-5)")
git log -4: 4c5b3e3 / bf203a5 / aaf6e8e / 7eebe57
git status --short (start): ?? docs/product/reports/V1_TICKET_A2_3_REPORT.md   (not mine; untouched)
```
No mismatch.

---

## PREFLIGHT — REPOSITORY STRUCTURE DECISION

**Decision: a fully self-contained `apps/web/` Next.js App Router application with its
OWN package manifest, lockfile, `node_modules`, and TypeScript config. No workspace, no
monorepo orchestrator, no change to the root package manifest or lockfile.**

Justification — every preflight constraint holds WITHOUT touching a governed asset:
- **No backend source moved.** `git status` shows only new untracked paths.
- **Root `tsconfig.json` not weakened / not touched.** Its `include` is already scoped to
  `["src/**/*.ts","tests/**/*.ts","scripts/**/*.ts"]`, so `apps/**` is naturally invisible
  to `npm run typecheck`. Verified: root `tsc --noEmit` → exit 0, `git status` on
  `tsconfig.json` empty.
- **Root test discovery not broadened.** Root `test` glob is `tests/**/*.test.ts`; the app
  tests live under `apps/web/test/` and are never collected by root.
- **Existing backend commands unchanged and green** (see EVIDENCE).
- **Own manifest + tsconfig**: `apps/web/package.json`, `apps/web/tsconfig.json`.
- **Generated dirs git-ignored**: `apps/web/.gitignore` ignores `.next/`, `out/`,
  `coverage/`, `next-env.d.ts`; root `.gitignore` already ignores `node_modules/`. Verified:
  0 git-visible `.next/`/`node_modules/` paths under `apps/`.
- **Dependency install did not restructure the backend toolchain.** `npm install` ran INSIDE
  `apps/web/` and created only `apps/web/node_modules` + `apps/web/package-lock.json`. The
  pre-existing root `package-lock.json` (committed, dated 2026-07-12) is byte-unchanged
  (`git status` empty for it).

No workspace adoption or root-manifest change was necessary, so no HALT was required.

---

## SCOPE A — SERVER-ONLY BOUNDARY

**Mechanism: the `server-only` npm package** (`import 'server-only'` at the top of every
module that touches Postgres, a connection string, or a raw evidence row:
`src/lib/server/db.ts`, `boardRepository.ts`, `fixtureRepository.ts`, `boardService.ts`).

**Precision:** this is a **Next.js FRAMEWORK BUILD-TIME MODULE BOUNDARY**, not TypeScript
compile-time type enforcement. `server-only`'s package exports resolve to a throwing module
in a client build (`"default": "./index.js"`) and an empty module under the
`react-server` condition (`"react-server": "./empty.js"`). TypeScript does not enforce it;
the Next build does.

**Fixture-isolated NEGATIVE PROOF (acceptance #4):** a temporary client component
(`app/negproof/page.tsx`, `'use client'`) importing `getBoardPool` from the server-only
`db.ts` was created, built, and deleted (bash `trap` cleanup; nothing left in the
production tree). Result:
```
build exit=1  (correctly failed)
Error:  x You're importing a module that depends on "server-only". This API is only
available in Server Components in the App Router...
 1 | import 'server-only';
./app/negproof/page.tsx
```
The diagnostic names `server-only`, states it is only available in Server Components, and
points at the offending client file and the `import 'server-only'` line — proving the
failure was caused by CROSSING THE SERVER-ONLY BOUNDARY, not by a syntax/resolution/config
error. **Both halves hold:** the valid app builds successfully (acceptance #3), and the
controlled invalid import fails for the expected reason.

**Secrets:** the DB URI is read from the NON-PUBLIC `SLIPLABZ_BOARD_DATABASE_URL`
(no `NEXT_PUBLIC_` prefix). Client-bundle scan: 0 occurrences of that name, of `pg` driver
code, or of any `postgres://`/`postgresql://` string.

---

## SCOPE B — THE BOARD PROJECTION (allowlist construction)

Type quoted in full (`apps/web/src/lib/boardProjection.ts`):
```ts
export interface BoardProjectionBase {
  readonly player: string;
  readonly team: string;
  readonly market: string;
  readonly evaluated_line: number | null;      // present; null only for Unavailable
  readonly classification_label: string;         // §D.2 compact label (GD-15)
  readonly compact_display_line: string;          // label [+ binding cap tag]
  readonly disclosure_g1: string;                 // §G.1 disclosure text
}
export interface BoardProjection extends BoardProjectionBase {
  readonly cap_tag?: string;            // §D.4 rule 6 — present ONLY when a cap fires
  readonly provenance_marker?: string;  // §D.4 rule 7 — present ONLY when backfilled; NOT hover-only
}
```

Each **required presence** traced to authority:
- `classification_label` ← §D.2 compact classification label, exact taxonomy; produced by
  the committed `renderCompactExplanation` (`compact_label`). GD-15 preserved: `Unavailable`
  is a distinct label, never collapsed into Insufficient (fixture "Fixture Delta" asserts a
  non-empty Unavailable label).
- `cap_tag` ← §D.4 rule 6 binding quality-cap tag (the five owner-ratified v1.3 tags), from
  the committed renderer's `binding_cap.cap_summary_short`.
- `provenance_marker` ← §D.4 rule 7, present when `includes_backfilled_historical` is true;
  rendered as **persistent text** in `BoardTable` (a `<div>`, NOT hover-only).
- `disclosure_g1` ← §G.1 disclosure (`disclosure_g1.text`).
- `player`, `team`, `market`, `evaluated_line` ← the grain identity + evaluated line.

Each **required absence** — absent from the TYPE, so it cannot be carried:
- the numeric composite score (DR-19) — no field exists;
- paid per-book offering detail (`book_detail.offerings`) — no field exists;
- any raw `evidence_profiles` row — the projection is a distinct interface;
- unrestricted metadata — only the allowlist above.

The compact renderer is **consumed, not duplicated or modified**
(`import { renderCompactExplanation } from '../../../../src/explanation/index.js'`); it
already carries `must_never_expose_numeric_score: true` in its type.

**Constructor** builds a NEW object literal with an explicit allowlist; conditional keys are
attached via `...(cap ? { cap_tag } : {})` — NOT a raw-row spread, NOT spread-then-delete,
no `omit` helper, no JSON round-trip, no cast to hide runtime fields:
```ts
const projection: BoardProjection = {
  player: candidate.player, team: candidate.team, market: candidate.market,
  evaluated_line: candidate.evaluated_line,
  classification_label: compact.compact_label,
  compact_display_line: compact.compact_display_line,
  disclosure_g1: compact.disclosure_g1.text,
  ...(cap ? { cap_tag: compact.binding_cap!.cap_summary_short } : {}),
  ...(provenance ? { provenance_marker: compact.provenance_marker!.text } : {}),
};
```

**RUNTIME KEY-SET ASSERTION** (`assertBoardProjectionKeySet`): expected set = base keys +
`cap_tag` iff a cap applies + `provenance_marker` iff provenance applies; throws on any
extra or missing key, throws on any `BOARD_PROJECTION_FORBIDDEN_KEYS`
(`composite_score`, `components`, `book_detail`, `offerings`, `profile_output`, `reasons`,
`method_version`, the tie-break fields, …), and throws if an optional key's presence
disagrees with applicability. Tested for all four v2 classifications (Strong+provenance,
Moderate+cap, Mixed, Unavailable) and against a smuggled `composite_score` (throws).

**Staged call path (Scope B mandatory):**
```
raw DB row (PostgresBoardRepository.rowToCandidate)  — or fixture rows
  -> RankedCandidate  (restricted composite_score + DR-20 tie-break fields live HERE only)
  -> constructBoardProjection()   (allowlist; renderCompactExplanation consumed)
  -> BoardProjection  (no score, no offerings, no raw row)
  -> BoardTable ('use client')  /  server-rendered empty state
```
A raw evidence row is never passed into rendering; only `BoardProjection[]` crosses the
client boundary.

---

## SCOPE C — SERVER QUERY, METHOD SELECTION, ORDERING

**Method selection:** `ACTIVE_BOARD_METHOD_VERSION = 'evidence_method_v2'` — a hard-coded
server-side constant, not read from any request/header/cookie/query, so it is not
client-controllable. `buildBoardQuery` filters explicitly with a bound parameter
(`WHERE ep.method_version = $1`, `values:['evidence_method_v2']`; the method is never
interpolated into the SQL text). `assertKnownMethodVersion` makes an unknown/unconfigured
method **fail loud** (no default, no fallback) — tested.

**Ordering (DR-20):** ranking reuses the committed comparator `dr20Compare`
(`src/evidence/classification.ts`), quoted:
```ts
export function dr20Compare(a: DR20SortInput, b: DR20SortInput): number {
  const absA = a.composite_score === null ? -Infinity : Math.abs(a.composite_score);
  const absB = b.composite_score === null ? -Infinity : Math.abs(b.composite_score);
  if (absA !== absB) return absB - absA;
  if (a.l10_eligible_n !== b.l10_eligible_n) return b.l10_eligible_n - a.l10_eligible_n;
  if (a.eligible_sportsbook_count !== b.eligible_sportsbook_count) return b.eligible_sportsbook_count - a.eligible_sportsbook_count;
  if (a.internal_game_id < b.internal_game_id) return -1;
  if (a.internal_game_id > b.internal_game_id) return 1;
  return 0;
}
```
- **Direction:** `|composite_score|` DESCENDING (strongest evidence first) on the
  full-precision stored value.
- **NULL handling:** a null score maps to `-Infinity` → sorts **LAST**; it is **not**
  inferred as zero.
- **Deterministic tie-break sequence:** (1) `|score|` desc, (2) `l10_eligible_n` desc,
  (3) `eligible_sportsbook_count` desc, (4) `internal_game_id` **ascending** (final,
  total order) → repeated requests over the same rows are stable (asserted).
- Tie-break fields live on `RankedCandidate` (internal) and never become projection keys.
- **Sorting happens BEFORE projection** (`ranked.sort(dr20Compare)` then
  `ranked.map(constructBoardProjection)`); after projection the score is gone.
- Fixture ordering verified: scores `|−0.918|, 0.42, 0.05, null` →
  `Alpha, Bravo, Charlie, Delta` (null last).

**Hosted state (read-only):** actual counts by `method_version` at execution time —
`evidence_method_v1 = 145`, `evidence_method_v2 = 0`. (Read via the available session-pooler
URI as a one-off read-only diagnostic; the app RUNTIME path targets the 6543 transaction
pooler, pending env provisioning — see Deviations.) Zero v2 rows ⇒ the empty state is the
expected result; nothing was seeded, faked, hidden, or replaced, and there is no v1
fallback.

---

## SCOPE D — MINIMAL RENDER + EMPTY STATE

`app/board/page.tsx` is a server component (`runtime='nodejs'`, `dynamic='force-dynamic'`).
It calls `getBoardData()`, and on ≥1 projection renders `<BoardTable>` (the only client
component, prop-typed `BoardProjection[]`, with a minimal local `useState` disclosure
toggle — no fetch). On 0 projections it server-renders the empty state.

**Empty state** (approved, non-promotional): heading `Board` + `No current Board profiles
are available.` It does not imply failure, missing connectivity, absence of
games/markets, unavailability of v1, or a guaranteed appearance time. Verified
server-rendered (5,035-byte document, `data-testid="board-empty-state"` present) and swept
by the committed forbidden-term gate.

---

## SCOPE E — TEST ARCHITECTURE (no hosted dependency)

Injected `BoardRepository` interface; production = `PostgresBoardRepository` (one Postgres
query), tests/audit = `FixtureBoardRepository` (in-memory, same interface). 14 app tests,
**none** hosted-dependent (`node --conditions=react-server --test`). Required method-selection
tests all pass:
- query construction filters explicitly to `evidence_method_v2`;
- v1 fixture rows excluded; mixed input cannot produce a mixed Board;
- zero v2 rows → empty state; adding a v2 row populates the Board with no
  method-selection code change;
- unknown configured method fails loud.

---

## SCOPE F — SERIALIZATION AUDIT (the acceptance standard)

Fixtures seed DISTINCTIVE values: composite `-0.9182736455` (digits `9182736455`), paid book
`ZZQXFIXTUREBOOK7788`, paid price `-424242`. **Every response the slice emits, enumerated
and mapped to its assertion:**

| # | Response emitted by the slice | Assertion / result |
|---|---|---|
| 1 | Initial HTML document `/board` (fixture mode) | grep full body incl. `<script>`: **0** of each distinctive value |
| 2 | Embedded RSC flight payload (inside that HTML, `__next_f` script — present, count 1) | covered by the same full-body grep: **0** |
| 3 | RSC navigation response (`RSC: 1` header) | grep: **0** of each distinctive value |
| 4 | Client JS bundles (`.next/static/**`) | **0** distinctive values; **0** `pg` driver code; **0** `postgres(ql)://`; **0** `SLIPLABZ_BOARD_DATABASE_URL` |
| 5 | Route metadata for `/board` (static title/description from `layout.tsx`) | no evidence data; present in HTML `<head>`, covered by #1 grep |
| 6 | Home `/` and `/_not-found` (static) | no evidence data |
| 7 | Client-initiated fetches | **NONE** — the only client interaction is a local `useState` toggle; `grep` for `fetch(`/XHR/axios/SWR in `components/`,`app/` = empty |
| 8 | Route-handler responses | **NONE** — `find app -name route.ts` = empty |

The sanitized projection strings (`compact_display_line`, cap tag `stale market`, provenance
`Includes seeded historical…`) ARE present in the RSC payload — proving the client receives
the allowlisted projection while the distinctive score is absent (0). Visual non-rendering
was NOT relied upon; the RSC/script payload was grepped directly.

**Scope-of-scanning distinction honored:** the distinctive prohibited EVIDENCE VALUES were
asserted absent from browser-visible responses AND client bundles (not from server build
artifacts — the server-only fixture legitimately contains them). SECRETS (DB URL name, `pg`
code, connection strings) were asserted absent from client bundles and browser responses.

**Server request log scan:** the running server's log contained **0** of each distinctive
value and **0** secrets (`postgres://`, `postgresql://`, `SLIPLABZ_BOARD_DATABASE_URL`).

**Copy safety (#15):** every authored Board string (empty-state copy, `classification_label`,
`compact_display_line`, `cap_tag`, `provenance_marker`, `disclosure_g1`) passes the
**reused, unmodified** `sweepForbiddenTerms` from `src/explanation/copySafetyTerms.ts`
(0 violations). `tests/explanation/`'s sweep was not forked or modified.

---

## SCOPE G — DATABASE CONFIG FAILS CLOSED

`src/lib/server/db.ts`: reads NON-PUBLIC `SLIPLABZ_BOARD_DATABASE_URL`; throws
`BoardDbConfigError` when missing; validates the URI targets port **6543** (transaction
pooler) via `new URL(url).port` WITHOUT echoing the URI; errors surface only the env var
name and the low-sensitivity observed port integer — never host/user/password. Node runtime
only (`export const runtime='nodejs'` on the route). The local fixture path needs no hosted
URI (Scope G satisfied; the local test suite never sets one).

## SCOPE H — CONNECTION RULES DOC

`docs/architecture/V1_APP_CONNECTION_RULES.md` records: runtime → 6543 transaction pooler;
migrations/admin → 5432 session pooler; always copy the complete pooler URI from the Connect
panel (never hand-edit the direct string; `postgres.<project_ref>` username; hand-editing
yields a 28P01 indistinguishable from a wrong password); the direct route required IPv6 and
was unusable from THIS environment (environment-specific, not a universal ENOTFOUND claim);
no named prepared statements / LISTEN-NOTIFY / session-scoped behaviour through 6543;
deployment never triggers migrations. Referenced from `next.config.mjs` and `db.ts`.

## SCOPE I — PREVIEW DEPLOYMENT — PENDING EXTERNAL PROVISIONING

No Vercel CLI, no `.vercel` project, and no `VERCEL_*` credentials exist in this environment.
Per Scope I I did NOT create an account/project or request credentials. Scopes A–H are
complete and validated locally. **Founder actions required to unblock:** (1) create/most
likely already-owned Vercel project and link `apps/web`; (2) provision
`SLIPLABZ_BOARD_DATABASE_URL` (the 6543 transaction-pooler URI, preview scope) in Vercel
env; (3) provide preview deploy credentials to the execution environment. On provisioning I
will deploy PREVIEW only, re-run the serialization audit against the DEPLOYED response, and
report the preview URL — no production deployment.

---

## EVIDENCE — SUITES

- App: `next build --webpack` → success (`/board` dynamic, `/` static). App `tsc --noEmit` → exit 0. App tests → **14 pass / 0 fail**.
- Root (UNMODIFIED, UNCHANGED commands): `npm run typecheck` (`tsc --noEmit`) → exit 0; unit suite → **573 pass / 0 fail**; FULL SERIAL integration (`node --import tsx --test --test-concurrency=1 tests/integration/*.test.ts`) → **124 pass / 0 fail**. No committed `src/`, `tests/`, `scripts/`, `supabase/`, root `tsconfig.json`, or root `package.json`/lockfile was modified.

## THE EIGHTEEN ACCEPTANCE CRITERIA
1 ✓ backend source in place · 2 ✓ root typecheck+tests unchanged & green · 3 ✓ valid app
builds · 4 ✓ invalid client import fails for the server-only reason · 5 ✓ hosted access only
in server-only code · 6 ✓ tests need no hosted · 7 ✓ one method version, never mixed · 8 ✓
full-precision sort before projection, deterministic tie-break · 9 ✓ newly-constructed
allowlisted projection · 10 ✓ type cannot carry score/offerings/raw row · 11 ✓ initial body
incl. scripts/RSC has none of the distinctive values · 12 ✓ every emitted response enumerated
& audited · 13 ✓ client bundles clean · 14 ✓ server logs clean · 15 ✓ copy-safety covers all
strings, sweep unmodified · 16 ✓ honest empty state, no seeding/suppression · 17 ✓ no
migration/auth/Stripe/entitlement/prod-deploy · 18 ✓ omissions documented (below).

## WHAT I DELIBERATELY DID NOT BUILD (Scope D / #18)
Visual design, information architecture, density, headshots (GD-17 #1), styling beyond the
minimum, sorting/filtering UI, pagination, Research View / full explanation, per-book paid
detail surface, auth/accounts/entitlement, any route handler or API, and any production
deployment. Those belong to the amended V1-6 design review and later tickets. This slice
proves the path and stops.

## DEVIATIONS & CLASSIFIED ASSUMPTIONS
- **DEVIATION (reported):** `l10_eligible_n` (a DR-20 tie-break field) is not persisted on
  the evidence row; `PostgresBoardRepository` sets it to `0`. This is **inert**: hosted holds
  0 v2 rows (no hosted ranking this ticket) and the L10 tie-break is consulted only on an
  exact composite-score tie. The tie-break LOGIC is the committed `dr20Compare`, fully
  exercised by fixtures. No data is fabricated (there are no rows).
- **ASSUMPTION (build):** the app is built with the **webpack** builder (`next build
  --webpack`) so `resolve.extensionAlias` maps the consumed backend `.js` ESM specifiers to
  `.ts`. Next 16 defaults to Turbopack; this is an explicit, documented choice for the slice.
- **ASSUMPTION (rendering shape):** the compact Board is driven by COLUMNS (classification,
  quality_cap_reason, includes_backfilled_historical) via the committed renderer; the
  Postgres repo leaves `profile_output.reasons` empty (correct for compact — the renderer's
  only use of `reasons` is the abnormal_dispersion guard, which v2 rows can never trip).
- **PENDING PROVISIONING:** the 6543 `SLIPLABZ_BOARD_DATABASE_URL` and Vercel preview.
- **OBSERVATION (GAP-14):** the board service imports the committed DR-20 comparator by a
  five-level deep relative path (`../../../../../src/evidence/classification.js`). The
  dependency direction is correct (consume the shared library, don't duplicate the
  comparator), but the path is brittle to a future directory move on either side. Planned
  resolution: a path alias in `apps/web/tsconfig.json` the next time that file is
  legitimately opened. Recorded as GAP-14 (cosmetic/maintainability; no behaviour at risk).

## STATE OF v1 / v2 / EMPTY STATE
v1's 145 rows remain hosted and untouched. v1 is intentionally excluded from the user-facing
Board (rendering superseded-method output is forbidden). The empty state is the correct
current production result. V1-A2-3 persistence will populate the SAME Board automatically
once valid v2 profiles exist — no Board code change required (proven: adding v2 fixture rows
populates the Board with no method-selection change).

## FINAL `git status --short` — every path classified
```
?? apps/                                              → V1-6a (new isolated app; .next/, node_modules/, and their generated contents are git-ignored — 0 git-visible)
?? docs/architecture/V1_APP_CONNECTION_RULES.md       → V1-6a (Scope H)
?? docs/product/reports/V1_TICKET_6A_REPORT.md        → V1-6a (this report)
?? docs/product/reports/V1_TICKET_A2_3_REPORT.md      → PRE-EXISTING (not mine; untouched, not staged)
```
No `.next/`, browser-test artifacts, coverage, temporary invalid-import fixtures, or
downloaded deployment logs are left behind. No lockfile churn outside `apps/web/`. Nothing
committed.

*Report generated 2026-07-24. No commit performed per ticket instruction.*

═══════════════════════════════════════════════════════════════════════════════

# REVISION — AUDIT CODIFICATION (governor REVISE, 2026-07-25)

## The defect (self-identified at governor inspection)
The two headline audits — the browser-visible serialization audit and the negative
server-only boundary proof — plus the client-bundle scan, server-log scan, and empty-state
check, were originally executed as **ad-hoc bash during the build session**. They were not
committed, re-runnable artifacts; their passing results existed only in the transcript. An
audit a reviewer cannot re-run from the repository is an assertion, not a proof. This failed
acceptance items **#4, #11, #12, #13, #14** from one root cause (durability).

## The repair (additive only — no re-architecture)
Two committed, deterministic, re-runnable test artifacts plus a dedicated runner. Nothing
approved was changed: the projection, method selection, ranking, repository interface, empty
state, database module, and connection-rules doc are untouched.

- **`apps/web/test-audit/serialization.test.ts`** — builds+serves the FIXTURE data source
  (no hosted dependency) and asserts, over the COMPLETE captured bodies (initial HTML
  including `<script>`, and the `RSC: 1` flight response — never a parsed DOM):
  - `initial HTML … leaks no prohibited value; flight + positive control present` — GUARD (a)
    asserts the RSC flight marker `__next_f` IS present in the captured body (so the audit
    cannot inspect nothing); GUARD (b) asserts known-allowed content (`stale market`,
    `Includes seeded historical closing lines`) IS present (so an empty/error body cannot
    pass trivially); then asserts every distinctive value absent.
  - `RSC / navigation flight response leaks no prohibited value (raw body)`.
  - `client JS bundles contain no prohibited value, no db driver code, no connection string,
    no env var name`.
  - `server request log contains no prohibited value and no secret`.
  - `empty state renders when the fixture repository returns zero rows`.
  - Servers are spawned as the Next CLI directly in a detached process group and killed
    (group SIGKILL) in `after`/`finally`; captured bodies/logs live in memory — nothing is
    left on disk.
- **`apps/web/test-audit/negativeBoundary.test.ts`** — subprocess proof:
  - `a client component importing a server-only module FAILS the build for the server-only
    reason` — generates a temporary client route importing the server-only `db` module,
    builds it as a subprocess, and asserts BOTH a non-zero exit AND the `server-only`
    diagnostic (`/server-only/i` and `/Server Component/i`) naming the offending file
    (`/audit_negproof/`). The fixture is removed in `finally`.
  - `after cleanup the tree is clean and the VALID application still builds`.
- **Runner:** `apps/web` gains `npm run audit` (`next build --webpack` then the two files,
  serial, `--conditions=react-server`). The fast `npm test` (`test/**`) is unchanged and does
  NOT collect `test-audit/`. How to run is documented in `apps/web/README.md`.

No new dependency was added — Node's built-in `fetch`, `child_process`, and test runner
cover every response this slice emits (no client fetch, no route handler), so no
browser-testing stack was introduced.

## Evidence
- `npm run audit` → **7 pass / 0 fail** (build + serialization 5 + negative 2); no lingering
  server, no leftover `audit_negproof` fixture.
- **Deliberate-failure demonstrations (each reverted after):**
  - Serialization negative assertion — injected a prohibited value into the captured body →
    `✖ AssertionError: prohibited value "ZZQXFIXTUREBOOK7788" leaked into the initial
    HTML/RSC body`.
  - Serialization GUARD (a) — stripped `__next_f` from the captured body →
    `✖ AssertionError: RSC flight marker __next_f absent — audit would be inspecting nothing`.
  - Negative proof — pointed the fixture at a NON-server-only import so the build succeeded →
    `✖ AssertionError: expected a failed build; got status 0` (and the fixture was still
    removed by `finally`).
- Fast `npm test` (apps/web) → **14 pass / 0 fail**; app `tsc --noEmit` → exit 0.
- Root (UNMODIFIED): `tsc --noEmit` → exit 0; unit → **573 pass / 0 fail**; full serial
  integration → **124 pass / 0 fail**. No committed backend file, authority, evidence method,
  or `tests/explanation/` sweep was changed.

## Files added by this revision (all under `apps/web/`, plus this report)
`test-audit/serialization.test.ts`, `test-audit/negativeBoundary.test.ts`, `README.md`, and
the `audit` script in `package.json`. No artifacts left behind: no captured HTML/RSC/log
files, no `audit_negproof` fixture, no coverage output; `.next/`, `node_modules/`, and
`*.tsbuildinfo` remain git-ignored.

*Revision generated 2026-07-25. No commit performed per ticket instruction.*

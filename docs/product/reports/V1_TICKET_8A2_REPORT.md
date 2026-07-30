# V1-8a2 — The mobile Props Board surface

**Status: BUILT and test-green. Strips server-rendered; the series payload never
crosses the client boundary (GAP-21 closed). No score, no internal identity as
data. Research View untouched. Nothing committed. The §5 screenshot-parity PASS
CONDITION could not be produced in this environment (no browser automation, no
Vercel CLI) — it needs a separately authorized mechanism (see below).**

**Starting state (verified):** branch `main`, HEAD
`e7b1a4504239668504ea07d34871fb10cb9f0cba` (match). Untracked at start: the two
founder `docs/research/` files + `docs/product/reports/V1_TICKET_OP_2_REPORT.md`
— left. `git log --oneline -3`: `e7b1a45` · `a3c28f3` · `f274d5f`.

---

## STEP 0 — the three determinations

### (1) The client boundary — the Board is now a PURE SERVER COMPONENT

The ONLY thing forcing client JS was the disclosure toggle in the old
`BoardTable.tsx`:
```ts
'use client';
import { useState } from 'react';
const [openRow, setOpenRow] = useState<number | null>(null);
```
Everything the Board needs is server-renderable: navigation is a server
`<Link>`; the press state is pure CSS (`.board-row:active`, in the server-rendered
`<style>` in `BoardChrome`); the §G.1 disclosure is rendered **always-visible**
(never hover-only, Grammar §1). **Chosen composition: fully server-rendered** —
`app/board/page.tsx` → `BoardChrome` → `BoardRow`/`InformationBand`/`EvidenceStrip`
are all server components; **no `'use client'` anywhere in the board tree.** The
band (windows, series, consensus, freshness) is rendered to HTML server-side, so
**no band or series data is passed as a prop to any client component** — it never
enters the RSC flight as a structured payload. (The old `BoardTable` and
`/design-preview` are untouched — a separate preview surface.)

**Navigation vs containment (reported):** the shipped research route is
`/research/[internal_game_id]/[internal_player_id]/[market_key]` (V1-7b, already
browser-visible and keyed on those ids). Scope C requires a full-row press target
to it. The href is built **server-side** in `boardService` from the candidate's
grain ids and rendered as an `<a href>`; the grain ids are **never** a projection
data field. This is navigation context to a route already keyed on them —
distinct from the forbidden **evidence-data** leakage (the series join-key AS a
field, the series payload, the composite score, `line_observed_at`), all of which
stay server-side. The containment tests match the committed audit's operational
definition: the `internal_game_id` **key string** and the series **canary** are
absent from body/flight/bundles.

### (2) GAP-21 closure criterion (the exact assertion, now passing)

Closed by construction (pure server component). The audit asserts, over the served
`/board` response and the client bundles:
- **positive control (Strips render):** the rendered window labels `L10`/`SZN` and
  the H2H rendered text `not yet available` are present — the band rendered;
- **negative (series/band DATA did not cross as a client payload):** the raw
  projection band-data strings are **absent** — `requires_h2h_window_g2` (the raw
  `h2h.reason`, server-rendered to different text), `position_kind` (a series
  structural key), the `DISTINCTIVE_INTERNAL_GAME_ID` canary, the `internal_game_id`
  key, and `line_observed_at` — none appear in the body/flight; and the client JS
  bundles contain none of the PROHIBITED values (canary included).
If both hold, the ~1,150 season-series position objects never shipped to the
client while the Strips render completely — GAP-21 closed.

### (3) Band overflow at 390px

The eight-field band (`L5·L10·L20·H2H·STRK·AVG·DIFF·SZN`) is a horizontal
**scroll container** (`overflow-x:auto`, `scroll-snap-type:x proximity`, per-cell
`scroll-snap-align:start`). **No field is dropped, truncated, or collapsed** — all
eight are in the DOM (audit asserts each label present). Discovery affordance: a
persistent right-edge gradient fade over the panel signals more to the right; the
page body never scrolls horizontally (the container does).

---

## Scope A/B/C/C2 — what was built

- **Evidence Strip (§2.2)** + display-membership rule (`bandView.stripSpan`): one
  cell per position, oldest→newest; **filled=above · hollow=below · dash=push ·
  ghost(dashed)=ineligible/DNP** holding chronological place with no verdict. Cell
  count IS the span — an L10 strip with an interleaved DNP renders >10 cells
  (proven, group 2).
- **Compact counts (§7):** `A-B`/`A-B-P`, with visible `eligible_n` + coverage. No
  %, slash, or "rate".
- **H2H:** typed-unavailable rendered text (not a number, not a blank cell).
- **STRK/AVG/DIFF:** explicit persisted factual values (never derived; DIFF is the
  persisted `avg_minus_threshold`). **SZN** renders its full Strip.
- **Row/chrome (dark only, 390px-first):** Finding Mark (§2.1 discrete
  filled/outlined + cap notch, never a number/gradient/score-size); identity
  (player · team · market · evaluated line); **deterministic fallback avatar**
  (same name → same initials + slate shade, no randomness, no photograph);
  **Freshness Badge (§2.6)** state + `display_age_seconds` elapsed, desaturating
  toward the horizon (not red); provenance + sample badges (none hover-only);
  micro **Consensus Bar (§2.4)** (flex proportions, no prices/logos/promo, no %);
  §G.1 disclosure always present. Header (title + WNBA context + reserved
  non-functional chrome positions); bottom nav **Board · Players · Methodology**
  with no dead controls. Colours ONLY from the committed `PREVIEW_HUES`
  (azure/violet/slate) — not redefined; no green/red.
- **Navigation/loading/empty:** full-row `<Link>` to the research grain; CSS press
  state; chevron affordance; `loading.tsx` skeleton matching row geometry; approved
  empty state, copy **byte-unchanged**.
- **Locked continuation (§1.4 #34-35), inert:** blurred continuation rows + lock
  panel + a **disabled** non-actionable CTA labelled "Membership coming later". It
  gates nothing — every available row renders above it; **no entitlement logic,
  billing, gating, row withholding, or functional CTA** (group 11 asserts the real
  row count == available profiles and the CTA is `disabled`).

**Identity fields not in the contract (reported):** the V1-8a1 projection carries
no current-game **matchup** or **tipoff** at the row level. This ticket "consumes
the accepted projection contract; does not reopen projection architecture," and
fabricating matchup/tipoff is forbidden — so the row renders the projected
identity (player · team · market · evaluated line) and does **not** invent matchup/
tipoff. A future projection extension (governor-authorized) would add them.

---

## Scope D — registrations (docs only; not implemented)

Added to `docs/product/V1_OPEN_GAPS.md` in register format: **V1-INC-1** (Producer
deployed before hosted evidence-input schema — CLOSED incident record) and
**V1-OPS-3** (Scheduled poll failure signaling — OPEN, operations). Created
`docs/product/PRODUCT_IDEAS_PARKING_LOT.md` (explicitly not a roadmap, not
authorized): the betting-literacy essay series (with the "sports investor" framing
refused, backtest-kill anchor, four essays / no platform / no pricing) and governed
MCP distribution (counts-never-rates, not authorized, requires a founder ruling on
attribution risk).

---

## Tests — 13 groups, full accounting

| # | group | where | result |
|---|---|---|---|
| 1 | GAP-21 closed (series absent from flight/bundles, Strips render) | audit "V1-8a2 GAP-21" + client-bundle scan | ✓ |
| 2 | strip spans — interleaved DNP, >10 cells, counts reconcile | `boardSurface.test.ts` G2 | ✓ |
| 3 | Grammar §7 — no %/slash/rate in visible text | audit board-surface + `boardBand`/`boardSurface` | ✓ |
| 4 | §D.2 compact labels only; full forms absent | audit board-surface | ✓ |
| 5 | DR-19 + Amendment 21 — score/components/internal_game_id/line_observed_at absent; prior canaries intact; forbidden-key tests UNMODIFIED | audit + `board.test.ts` (unmodified) | ✓ |
| 6 | DR-20 — ranked order; no alternate sort control in markup | `board.test.ts` order (unmodified) + audit `<select>`/"sort by" absent | ✓ |
| 7 | no hover-only — disclosure/freshness/provenance/sample in server body | audit board-surface | ✓ |
| 8 | band completeness at 390px — all eight fields in the DOM | audit board-surface | ✓ |
| 9 | fallback determinism | `boardSurface.test.ts` G9 | ✓ |
| 10 | empty state + skeleton; empty copy byte-unchanged | audit empty-state test + `loading.tsx` | ✓ |
| 11 | locked architecture present & inert; real row count == available | audit board-surface (`data-row-count="4"`, disabled CTA) | ✓ |
| 12 | Research View untouched | `git diff` empty (below); RV tests run unmodified | ✓ |
| 13 | suites | below | ✓ |

**Suite accounting:**

| suite | command | exit | pass | fail | skip | dur |
|---|---|---|---|---|---|---|
| root typecheck | `tsc --noEmit` | 0 | — | 0 | — | ~1s |
| app typecheck | `apps/web tsc --noEmit` | 0 | — | 0 | — | <1s |
| root unit | `node --test tests/** (excl integration)` | 0 | 578 | 0 | 0 | ~1s |
| integration (serial) | `npm run test:integration` | 0 | 143 | 0 | 0 | ~38s |
| app fast | `apps/web npm test` (DB up) | 0 | 73 | 0 | 0 | ~1s |
| serialization audit | `apps/web npm run audit` | 0 | 16 | 0 | 0 | build ✓ + ~8s |

Deltas: app fast 68→73 (+5 `boardSurface`); audit 15→16 (+1 board-surface;
V1-8a1's flight-positive-control test repurposed to the GAP-21 server-render
assertion — the architecture that closes GAP-21 inverts the old "band reaches the
flight" control). The DR-19 composite_score-forbidden and forbidden-key
`board.test.ts` tests pass **UNMODIFIED**. No suite weakened.

---

## SCREENSHOT-PARITY ACCEPTANCE (§5) — BLOCKED; needs a separately authorized mechanism

Per the ticket's escape hatch. This environment has **no browser automation**
(no playwright/puppeteer dependency or binary), **no system Chrome/Chromium**, and
**no Vercel CLI**. Therefore:
- an external Vercel **PREVIEW** cannot be created under the established workflow
  without installing/authorizing tooling, and I did **not** improvise a deployment
  workflow (and did **not** use `--prod`); and
- even **local** screenshot capture is impossible (no headless browser to render a
  390px viewport to pixels).

The seven required captures (Board top; band initial; band scrolled; fallback
avatar row; locked continuation; skeleton; empty) therefore **cannot be produced
here**. The surface is fully built and its structure/containment are proven by the
fetched-HTML audit, but the visual PASS CONDITION requires a separately authorized
screenshot/preview mechanism. **Halting for that authorization** rather than
improvising. (The served HTML is inspectable via `npm run audit`'s spawned server;
no PNGs could be generated.)

---

## `git status --short --untracked-files=all` — every path classified

```
 M apps/web/app/board/page.tsx                     server-rendered board (rows + chrome + locked arch); empty state unchanged
 M apps/web/src/lib/boardProjection.ts             +internal_player_id to forbidden-key list (defence)
 M apps/web/src/lib/rankedCandidate.ts             +internal_player_id (server-side nav id; forbidden projection key)
 M apps/web/src/lib/server/boardRepository.ts       map internal_player_id onto the candidate
 M apps/web/src/lib/server/boardService.ts          emit rows[] with a server-built research_href
 M apps/web/src/lib/server/designFixtures.ts        preview fixtures gain internal_player_id (compile)
 M apps/web/src/lib/server/fixtureRepository.ts      board fixtures gain internal_player_id
 M apps/web/test-audit/serialization.test.ts         GAP-21 server-render assertion + board-surface group (canaries intact)
 M docs/product/V1_OPEN_GAPS.md                      V1-INC-1 (closed) + V1-OPS-3 (open)
?? apps/web/app/board/loading.tsx                    skeleton loading state
?? apps/web/components/board/BoardSurface.tsx        the server-rendered surface (row/band/strip/chrome/locked/skeleton)
?? apps/web/src/lib/board/bandView.ts                pure server-side band helpers (span/glyph/fallback/freshness)
?? apps/web/test/boardSurface.test.ts                strip-span + fallback-determinism + glyph unit tests
?? docs/product/PRODUCT_IDEAS_PARKING_LOT.md          parking lot (not a roadmap)
?? docs/product/reports/V1_TICKET_OP_2_REPORT.md      founder-untracked — LEFT
?? docs/research/PICKFINDER_WNBA_AUDIT.md             founder file — untouched
?? docs/research/PickFinder_WNBA_Audit_Clusters_1-6_Consolidated.md  founder file — untouched
```

No root `src/` change; no engine/`computeThresholdWindow`/thresholds/gate/writer
change; frozen authorities, Grammar, Parity Spec untouched; no migration/hosted
write/credit spend; **Research View byte-identical**; no `--prod`, nothing staged,
nothing committed. HEAD unchanged (`e7b1a45`).

# V1-8a3 — Interactive density pass (R1) + Board polish pass (R2)

> **R2 UPDATE (2026-07-30) — see the "V1-8a3 R2" section at the bottom.** R1's
> accepted interaction architecture is retained unchanged; R2 adds polish only.
> Both land in ONE commit after founder acceptance. R2 headline: compact header
> disclosure + collapsible help; matchup + human tipoff (GAP-22, via the sole
> authorized narrow projection extension); market/line primary with a quieter
> direction; a flat instrument-panel selector; explicitly-labelled panels; an
> explicit "Open full research" action; tighter filters/spacing; intentional
> L20/SZN Strip scrolling. Containment retained; Research View untouched.

---

# V1-8a3 R1 — Interactive density pass

**Status: BUILT and test-green. The horizontally-scrolling window cards are
replaced by an eight-cell compact evidence selector + one selected detail panel
(L10 default), driven by pure CSS radios — no series data crosses the client
boundary. §G.1 consolidated to Board level. Market/direction/search filters added.
Full L20 and SZN Strips preserved on selection. Research View untouched. Nothing
committed. Screenshot capture is unavailable in this environment (no browser
automation, no Chrome, no Vercel CLI) — the founder deploys and captures on device.**

**Starting state (verified):** branch `main`, HEAD
`77e460f3238289c8065622a885726c364bbff14b` (match). `git log --oneline -3`:
`77e460f` · `e7b1a45` · `a3c28f3`.

**Starting-state deviation flagged (not mine):** `git status` showed one extra
modified tracked file — ` M .gitignore` — an **uncommitted** working-tree change
adding `.vercel` and `.env*` (both safety-positive ignore rules), consistent with
the founder running the Vercel CLI to deploy/capture V1-8a2 per that ticket's
authorization. HEAD integrity is intact (no push intervened), so the halt-on-
mismatch premise holds; I **left `.gitignore` untouched** (did not revert, stage,
or commit it — treated like the founder files) and proceeded.

---

## STEP 0 — six determinations

### (1) Server/client composition — series stays server-side (no HALT)

**Cell selection is pure CSS.** Each row emits eight hidden `<input type="radio"
name="ev-{rowId}">` (L10 `defaultChecked`), an `.evc-grid` of eight `<label>`
cells, and eight server-rendered `.evc-panel` detail panels — all siblings. Generic
CSS (`.evc-radio.r-{cell}:checked ~ .evc-panels .p-{cell}{display:block}`) shows the
selected panel and styles the selected cell. **Zero client JS for selection; all
eight panels (including full L20/SZN Strips) are rendered server-side to HTML**, so
the raw series never becomes a client payload. **What crosses the RSC boundary:**
rendered HTML only. **What reaches the client bundle:** the `BoardControls` filter
code + the allowlisted display meta (player name, market bucket, direction bucket)
— never band/series/`internal_game_id`/`line_observed_at`/score. The one client
component (`BoardControls`) receives each row as a **pre-rendered server node** plus
that display meta and only toggles row visibility. Raw series remains absent because
panels are HTML rendered on the server; the client reads display strings only.

### (2) §G.1 Board-level placement

Rendered **once** by `BoardDisclosure`, beneath the header and above the list
(`data-testid="board-disclosure-g1"`). Per-row `disclosure-g1` is removed. Rows keep
only exceptional items: cap tag (`stale market`), exceptional provenance
("Includes seeded historical closing lines"), and the consolidated metadata line.

### (3) Eight-cell grid at 390px

`display:grid; grid-template-columns:repeat(4,1fr); gap:6px` → **4 columns × 2 rows**.
At 390px (12px page padding + 12px main padding + 6px gaps) each cell ≈ **~80px wide
× ≥48px tall** (min-height:48px) → ≥44px touch target. Label + one dominant value.

### (4) Selected-panel behaviour

Exactly one panel visible via CSS `:checked`; **L10 default**; the panel gets a top
accent border matching the selected cell's accent, so it reads as connected;
selecting another cell swaps the panel with no JS.

### (5) Row-height budget (~480px target)

Structural estimate at 390px (no browser to measure exactly): row padding 24 +
identity head ~44 + selector grid (2×48 + 6) ~102 + one detail panel ~50 + one
metadata line ~24 (+ exceptional tags ~26 when present) ≈ **~270–320px** — well under
the 480px target, versus V1-8a2's eight stacked full Strips. Achieved by: no per-row
disclosure, one panel at a time, one consolidated metadata line, tightened padding,
no redundant pills. (Exact pixels confirmed by the founder's device capture.)

### (6) Authority reconciliation flag (Founder Ruling 1)

§G (`EVIDENCE_PROFILE_METHOD_V1.md` line 756) says the §G.1 disclosure appears "Near
any ranked Evidence Profile (Discover cards, **Board rows**, …)" — literally readable
as per-row-adjacent. **Founder Ruling 1 is recorded as CONTROLLING FOR V1** (§G.1
satisfied once at Board level, not repeated per row). **FLAG for later documentation
clarification:** the §G "Board rows" phrasing should be clarified to "once per Board
surface." The frozen authority is READ ONLY and was not touched; this flag is
recorded here for the governor to action in a documentation pass.

---

## The eight-cell selector + one detail panel

- **Cells (L5·L10·L20·SZN):** label + a dominant compact count (`A-B`/`A-B-P`), a
  compact instrument-panel look — **not eight nested cards**, no full Strip inside a
  cell. **STRK/AVG/DIFF:** label + one factual value. **H2H:** the shortest sanctioned
  unavailable form (`—` in the cell). No percentage/rate/probability in any cell.
- **Detail panel:** L5/L10/L20/SZN → the **full authorized Strip** (bigger cells,
  ghost positions preserved) + compact counts + eligible count + completeness/typed-
  unavailable state, no per-cell opponent text, no micro-labels. **STRK** → direction
  + length. **AVG** → persisted average + evaluated-line context. **DIFF** → persisted
  factual difference (no percentage). **H2H** → typed unavailable ("Head-to-head not
  yet available"), no fabricated number/Strip.
- **Ghost ruling:** ghost positions remain; an L10 detailed Strip may render >10
  cells because interleaved ineligible positions hold their place (not a defect). The
  convention is explained by ONE Board-level `strip-legend`
  (filled=above · hollow=below · flat=on the line · ghost=did not play/ineligible).
  No repeated "DNP" text.

Authorities: Grammar §2.2 (Strip), §2.8 (Sample), §7 (counts), §2.6 (freshness in
the consolidated line); §D.2 compact labels (verbatim, via the committed renderer);
the V1-8a0A display-membership rule (`stripSpan`).

---

## Client-boundary proof (GAP-21 stays closed; test 6–9)

The audit over the served `/board` asserts: `position_kind`, `opponent_label`,
`eligibility_state` (raw series object keys), the `DISTINCTIVE_INTERNAL_GAME_ID`
canary, `internal_game_id`, `internal_player_id`, `line_observed_at`,
`composite_score`, and the four component keys are **all absent** from the body/
flight; the client JS bundles carry none of the PROHIBITED values. The eight detail
panels (incl. ≥4 full Strips) still render server-side. So even with the client
filter controller present, no evidence data crossed.

---

## Row architecture, filters, chrome, locked architecture

- **Reading order** honoured: identity → market/line → direction → eight cells →
  one detail panel → consolidated freshness/coverage → Research affordance (the
  identity head is a `<Link>` to `/research/[game]/[player]/[market]`; cells do not
  navigate, so selection and navigation never conflict). **matchup/tipoff** are
  GAP-22 (not in the V1-8a1 contract) — rendered absent, not fabricated; not
  reopened here.
- **Consumer labels:** Points · Rebounds · Assists · 3-Pointers. No `player_threes`,
  `sportsbook_consensus`, raw ISO timestamps, or internal enums in the body.
- **Filters (client `BoardControls`):** market (All/Points/Rebounds/Assists/3-
  Pointers), direction (All/Over/Under), player search — all touch-safe, visibly
  active (`aria-pressed`), reversible, DR-20 order preserved (visibility toggled,
  never reordered). No alternate sort; the score is never exposed.
- **Chrome:** header (title + WNBA context) + Board-level §G.1 + filters. **Removed
  the blank reserved chrome positions.** Bottom nav **Board · Players · Methodology**
  — every destination is a real route (`/board`, `/players`, `/methodology` all
  return 200 and render honest content; Methodology is the fuller explanation per
  Founder Ruling 1).
- **Locked architecture (from fixtures):** blurred continuation rows + lock panel +
  a **disabled** non-actionable CTA ("Membership coming later"). Gates nothing; no
  entitlement/billing/withholding; the real row count equals the available profiles.

---

## Tests — 20 groups, full accounting

| # | group | where | result |
|---|---|---|---|
| 1 | all eight cells render | audit V1-8a3 (`cell-L5..SZN`) | ✓ |
| 2 | L10 selected by default | audit (`ev-0-L10` checked) | ✓ |
| 3 | each cell reveals correct detail | audit (`panel-L5..SZN` present, CSS-driven) | ✓ |
| 4 | L20 + SZN full Strips on selection | audit (≥4 `detail-strip`) | ✓ |
| 5 | L10 with interleaved DNP → >10 cells, 10 eligible | `boardSurface.test.ts` G2 (unchanged, `stripSpan`) | ✓ |
| 6 | no raw series object in client bundle | audit (series keys + canary absent; bundle scan) | ✓ |
| 7 | no `internal_game_id` in browser output | audit | ✓ |
| 8 | no `line_observed_at` in browser output | audit | ✓ |
| 9 | no `composite_score`/component in output | audit (key + digits) | ✓ |
| 10 | market filtering works | `boardFilter.test.ts` G10 | ✓ |
| 11 | direction filtering works | `boardFilter.test.ts` G11 | ✓ |
| 12 | player search works | `boardFilter.test.ts` G12 | ✓ |
| 13 | DR-20 order unchanged inside filtered set | `boardFilter.test.ts` G13 | ✓ |
| 14 | no alternate sort control | audit (no `<select>`/"sort by") | ✓ |
| 15 | no %/slash/rate/probability/EV/confidence/pick framing | audit (visible text; §G.1 disclosure exempt) | ✓ |
| 16 | §G.1 once at Board level, not per row | audit (`board-disclosure-g1` ×1; no per-row `disclosure-g1`) | ✓ |
| 17 | default row height meets density target | structural estimate ~270–320px (device capture confirms) | ✓ (est.) |
| 18 | all visible controls function | audit (nav routes 200; filters/search present; disabled CTA) | ✓ |
| 19 | Research View tracked files untouched | `git diff HEAD` empty | ✓ |
| 20 | DR-19 + Amendment 21 canaries unmodified & green | `board.test.ts` unmodified; audit PROHIBITED intact | ✓ |

**Suite accounting:**

| suite | command | exit | pass | fail | skip | dur |
|---|---|---|---|---|---|---|
| root typecheck | `tsc --noEmit` | 0 | — | 0 | — | ~2s |
| app typecheck | `apps/web tsc --noEmit` | 0 | — | 0 | — | <1s |
| root unit | `node --test tests/** (excl integration)` | 0 | 578 | 0 | 0 | ~1s |
| integration (serial) | `npm run test:integration` | 0 | 143 | 0 | 0 | ~40s |
| app fast | `apps/web npm test` (DB up) | 0 | 79 | 0 | 0 | ~1s |
| serialization audit | `apps/web npm run audit` | 0 | 18 | 0 | 0 | build ✓ + ~8s |

Deltas: app fast 73→79 (+6 `boardFilter`); audit 16→18 (+1 V1-8a3 selector, +1 nav-
destinations; the V1-8a2 board-surface test updated to the new §G.1/metadata
structure). `board.test.ts` (DR-19 + forbidden-key) passes **UNMODIFIED**. No suite
weakened.

---

## Screenshots (12) — UNAVAILABLE in this environment

Same constraint as V1-8a2, stated plainly: **no browser automation
(playwright/puppeteer), no system Chrome/Chromium, and no Vercel CLI.** The twelve
390px captures (Board top; L10 default; L20 selected; SZN selected; ghost-in-span;
filtered market; player-search; fallback avatar; locked state; skeleton; empty;
density proof) **cannot be produced here**. Everything else is complete and
test-green. **The founder deploys and captures on device.** I did not install
browser automation or improvise a deployment workflow.

---

## V1-7d registration

Added **V1-7d — Research View per-game chart axis repair** to `V1_OPEN_GAPS.md`
(overlapping opponent labels · unreadable x-axis · ghost/eligible annotation
collisions · mobile chart label density; **no computation change · no
evidence-semantic change**). No broader Research View revision pass is registered,
so it is recorded standalone (to be nested as a blocking sub-ticket if one is later
opened). Status OPEN — rendering; blocks launch: no.

---

## `git status --short --untracked-files=all` — every path classified

```
 M .gitignore                                       PRE-EXISTING (founder; +.vercel +.env*) — left untouched, not mine
 M apps/web/app/board/page.tsx                       server rows → BoardControls; board-level §G.1; empty state unchanged
 M apps/web/components/board/BoardSurface.tsx         eight-cell CSS-radio selector + one detail panel; chrome; legend; nav
 M apps/web/src/lib/board/bandView.ts                 market/direction labels + buckets + consolidated metadata helper
 M apps/web/test-audit/serialization.test.ts           V1-8a3 selector/nav assertions; §G.1-once; canaries intact
 M docs/product/V1_OPEN_GAPS.md                        V1-7d registration
?? apps/web/app/methodology/page.tsx                   working nav destination (the fuller explanation)
?? apps/web/app/players/page.tsx                       working nav destination (honest pending state)
?? apps/web/components/board/BoardControls.tsx          the ONLY client component (filters; display meta only)
?? apps/web/src/lib/board/filter.ts                    pure filter logic (client-safe, testable)
?? apps/web/test/boardFilter.test.ts                   filter + label/bucket unit tests
?? docs/product/reports/V1_TICKET_8A3_REPORT.md         this report
?? docs/product/reports/V1_TICKET_OP_2_REPORT.md        founder-untracked — LEFT
?? docs/research/PICKFINDER_WNBA_AUDIT.md               founder file — untouched
?? docs/research/PickFinder_WNBA_Audit_Clusters_1-6_Consolidated.md  founder file — untouched
```

No root `src/` change; no engine/`computeThresholdWindow`/thresholds/gate/writer
change; frozen authorities, Grammar, Parity Spec untouched; **Research View
byte-identical**; no migration/hosted write/credit spend; no `--prod`; nothing
staged, nothing committed. HEAD unchanged (`77e460f`).

---

# V1-8a3 R2 — Board polish pass

**Status: BUILT and test-green. R1's accepted interaction architecture retained
(eight selectors · one detail panel · L10 default · market/direction/search ·
DR-20 · server/client containment · complete L20/SZN Strips · ghost positions).
R2 is polish only. Nothing committed. Screenshots UNAVAILABLE in this environment
(no browser automation, no Chrome, no Vercel CLI) — the founder deploys and
captures on device.**

**Starting state:** HEAD `77e460f` (match); R1's work uncommitted in the tree
(continued here — both land in one commit after acceptance). Left alone: the two
`docs/research/` founder files, `V1_TICKET_OP_2_REPORT.md`, and the founder's
uncommitted `.gitignore` change.

## STEP 0 — containment (no HALT)

1. **Composition:** `/board` is a server component; the sole client component is
   `BoardControls` (filters). Per-row cell selection is **pure CSS radios**; all
   eight detail panels render server-side.
2. **R2 changes to the boundary:** only R2-3 adds anything crossing — `game:
   {matchup, tipoff}`, server-formatted display-safe strings. R2-2 help is a
   server `<details>`. Everything else is visual/layout.
3. **Display-safe state crossing:** player name · market bucket/label · direction
   bucket (filters) · formatted matchup/tipoff · rendered panel HTML.
4. **Raw series absent:** panels are HTML rendered server-side; the R2-3
   formatting runs server-side (raw `scheduled_start_utc`/ids stay server-side).
   Containment preserved.

## R2 items

- **R2-1 compact disclosure:** one sentence, `board-disclosure-g1` (once):
  *"Historical evidence and market context — not a predicted probability."* The
  epistemic boundary is retained; no pick/prediction/guarantee framing.
- **R2-2 help:** the always-expanded legend is replaced by a server-rendered,
  keyboard/touch-accessible `<details data-testid="board-help">` ("How to read the
  Board") exposing the four Strip states + "counts exclude ineligible positions" +
  "historical evidence, not a predicted probability." No hover-only; no account/
  onboarding state; the fuller explanation also lives at `/methodology`.
- **R2-3 matchup + tipoff (GAP-22):** the **sole authorized narrow projection
  extension** — `BoardProjection.game = {matchup, tipoff}`, formatted server-side
  from already-known game context (no lookup, no recomputation, no schedule
  inference, no persistence). The board query LEFT JOINs `games` + the opponent
  `teams` row and passes `scheduled_start_utc` + team cities + is_home through
  `RankedCandidate.game_context` (server-side); the constructor formats and drops
  the raw fields. **DISPLAY TIMEZONE RULE: all tipoffs render in US Eastern Time
  (`America/New_York`)** — one fixed, deterministic, server-side rule (no
  client-side tz, no account state); the raw ISO and any tz suffix are never
  emitted (e.g. `2026-07-30T23:00:00Z → "7:00 PM"`; `Las Vegas @ Phoenix`). The
  key allowlist + nested assertion gained `game` (validated to EXACTLY
  {matchup, tipoff}); `scheduled_start_utc`/`game_context` were added to the
  forbidden-key list. Rows without game context render without a matchup (never
  fabricated).
- **R2-4 hierarchy:** market + line is the primary line (largest); the direction
  is the verbatim §D.2 compact label rendered smaller/quieter beneath it
  (`row-market` precedes `row-direction`). No "best bet/pick/play/lock" language.
- **R2-5 flat selector:** one shared grid container with 1px dividers (grid-gap
  over a border background), reduced padding, no per-cell radius, flat unselected
  cells; the **selected cell gets the strongest treatment** (fill + azure
  underline). ≥46px cells. All eight selectors retained; no full Strip inside a
  cell; H2H shows a short dash, not "broken".
- **R2-6 labelled panels:** each panel states what it shows — "Last 10 eligible
  games" (L10), "Season evidence" (SZN), "Current streak", "Average value",
  "Difference from line", "Head-to-head", etc. The selected cell↔panel relationship
  is visually obvious (underline accent).
- **R2-7 research navigation:** the card is **non-navigational**; one explicit
  "Open full research ›" action (≥44px) navigates to the research grain URL.
  Selector cells only change the panel — no accidental navigation, no nested
  interactive conflict.
- **R2-8 filters:** compact search field · horizontally-scrollable market chips ·
  compact **segmented** direction control (All | Over | Under). Tighter vertical
  footprint; selected states obvious; reversible; DR-20 order retained; no
  alternate sort, no raw enum labels, no login/persistence.
- **R2-9 intentional L20/SZN scrolling:** the panel Strip is a single-row
  horizontal scroll (nowrap), oldest→newest, complete span incl. interleaved ghost
  positions — no grouping/sampling/omission. L5/L10 fit without scrolling; L20/SZN
  overflow with a right-edge fade + a concise "scroll for older →" affordance and
  a hidden native scrollbar.
- **R2-10 metadata/cap-tag:** one metadata line with natural pluralization (`Fresh
  10m · 5 books · Season 17 eligible`); provenance rendered quieter/smaller;
  exceptional cap tags remain distinct and visible.
- **R2-11 density:** removed the always-expanded legend + per-row disclosure,
  flatter selector, one panel at a time, tighter spacing — materially lighter than
  R1 (device capture confirms).

## Containment proof (R2)

The audit over served `/board` asserts absent from the body/flight/bundles: raw
series keys (`position_kind`/`opponent_label`/`eligibility_state`), the
`internal_game_id` canary + key, `internal_player_id`, `line_observed_at`,
`composite_score` + the four component keys, **raw ISO timestamps** (regex), and
**raw market enums** (`player_points`/`player_threes`/… and `sportsbook_consensus`)
in visible text — while consumer labels (Points, 3-Pointers) and human tipoffs
(7:00 PM) are present. The R2-3 `game` object is nested-asserted to carry ONLY
{matchup, tipoff}.

## Test accounting (R2)

| suite | command | exit | pass | fail | skip | dur |
|---|---|---|---|---|---|---|
| root typecheck | `tsc --noEmit` | 0 | — | 0 | — | ~2s |
| app typecheck | `apps/web tsc --noEmit` | 0 | — | 0 | — | <1s |
| root unit | `node --test tests/** (excl integration)` | 0 | 578 | 0 | 0 | ~1s |
| integration (serial) | `npm run test:integration` | 0 | 143 | 0 | 0 | ~42s |
| app fast | `apps/web npm test` (DB up) | 0 | 79 | 0 | 0 | ~1s |
| serialization audit | `apps/web npm run audit` | 0 | 19 | 0 | 0 | build ✓ + ~8s |

The 28 R2 test requirements are covered across: `board.test.ts` (DR-19 +
forbidden-key, **unmodified**), `boardBand.test.ts` (nested key-set + Amendment 21
canaries), `boardSurface.test.ts` (strip spans / interleaved ghost / fallback),
`boardFilter.test.ts` (market/direction/search + DR-20 order), and the audit
(compact disclosure once · help control + 4 states · matchup/tipoff · no raw
ISO/enum · market-before-direction · eight selectors · L10 default · labelled
panels · Open-full-research navigates · L20/SZN full Strips · no probability/pick
framing · nav destinations 200). No prior test weakened or replaced.

## Screenshots (15) — UNAVAILABLE

No browser automation, no Chrome, no Vercel CLI. The fifteen 390px captures cannot
be produced here; everything else is complete and test-green. **The founder
deploys and captures on device.** No browser automation installed; no deployment
improvised.

## Research View — untouched (R2)

`git diff HEAD` is empty on the Research View route, components, projection,
repository, and tests. No route/component/projection/score/chart change. (Its
comprehension/chart problems remain assigned to V1-7d.)

## R2 change surface (added to the R1 files above)

```
 M apps/web/src/lib/boardProjection.ts     R2-3: game {matchup,tipoff} optional key + nested assertion; forbidden scheduled_start_utc/game_context
 M apps/web/src/lib/rankedCandidate.ts      R2-3: server-side game_context (raw fields)
 M apps/web/src/lib/server/boardRepository.ts R2-3: LEFT JOIN games + opponent team; build game_context (no lookup/inference)
 M apps/web/src/lib/server/fixtureRepository.ts R2-3: game_context on fixtures
 M apps/web/src/lib/board/bandView.ts        R2-3: formatMatchup + formatTipoff (ET); BOARD_DISPLAY_TIMEZONE
 M apps/web/components/board/BoardSurface.tsx  R2-1/2/4/5/6/7/9/10/11: compact disclosure + help; flat selector; labelled panels; matchup; Open full research; strip scroll; quieter metadata
 M apps/web/components/board/BoardControls.tsx  R2-8: segmented direction control; tighter spacing
 M apps/web/app/board/page.tsx               R2-1/2: compact BoardDisclosure (no per-row §G.1)
 M apps/web/test-audit/serialization.test.ts   R2 assertions; canaries intact
```

No root `src/` change; frozen authorities/Grammar/Parity untouched; no migration/
hosted write/credit spend; the R2-3 projection extension is the sole authorized
projection change (pass-through only); nothing staged, nothing committed. HEAD
unchanged (`77e460f`).

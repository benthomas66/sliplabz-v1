# V1-8b — Mobile Research View Comprehension Pass

**Ticket:** V1-8b — transform the Research View from a developer evidence dump into a
clear, mobile-first evidence-inspection surface. **Presentation, terminology, and
interaction only.** No new evidence computation, no new scoring, no new persistence,
no alteration of evidence semantics.

**Expected starting HEAD:** `66e51ac1367c5259ddf3fe2d5d9553a70c24e3cb` — **verified match.**
**Nothing committed. Nothing pushed.**

---

## 1. Starting state / diagnosis

The Research View rendered the persisted evidence profile as a near-raw dump: an oversized
"Strong Under Evidence" card, four static window cards side-by-side, an SVG history chart
with overlapping opponent labels and repeated "ineligible" prose, raw market-context enums
(`sportsbook_consensus`, `unique_modal`, `complete`, `one-sided neither`), raw reason codes,
and the composite score presented up front. It read as a debugging surface, not an
inspection surface, and several strings implied currency/forecasting the evidence does not
claim.

The task was to **translate, not recompute**: keep every persisted value (scores, ranks,
eligibility, chronology, freshness, caps) and re-present it in plain, mobile-first language
with the four authorized interactions, while holding the existing containment boundary
(no internal identities, no raw ISO timestamps, no raw enums, no client-side calculation).

## 2. STEP 0 determinations (reported before implementing)

1. **Server components.** All research components are server-rendered — `ResearchView`,
   `EvidenceChart`, `GameHistory`. None carry `'use client'`. Interaction is achieved with
   zero client JS.
2. **Client interaction.** The authorized interactions (window selection, game inspection,
   collapsible technical sections) are implemented with the **CSS-radio pattern** (hidden
   `<input type="radio">` + `:checked ~ sibling` selectors) and native `<details>` — the
   same technique the Board uses. No component became a client component; no series data
   crosses as a client prop.
3. **Display-safe data across RSC.** Because every component is server-rendered to HTML,
   the projection object itself never serializes into the RSC flight. Only translated,
   display-safe text reaches the browser.
4. **Raw internal identities.** `internal_game_id` / `internal_player_id` are already
   dropped by the projection layer (`RESEARCH_PROJECTION_FORBIDDEN_KEYS`); the series entry
   type carries no `internal_game_id`. Verified absent from projection JSON and rendered HTML.
5. **Does the complete persisted series cross the boundary?** Yes — but as **server-rendered
   HTML only**, never as a client payload. The full chronology (including interleaved
   ineligible/DNP positions) is present for the chart and the game-history list.
6. **Pre-rendered representation supports the authorized interactions?** Yes. Window
   selection toggles pre-rendered blocks; game inspection expands pre-rendered `<details>`.
   No interaction requires computing anything in the browser.

**HALT RISK R5 resolution — NO HALT.** Tapping a history position identifies the game by a
**display-safe handle**: its game **date** + **opponent** + home/away, held in chronological
position. No `internal_game_id` is required or exposed (Amendment 21 preserved).

## 3. Section architecture (R11)

Rendered top-to-bottom, no nested bordered boxes:

1. **Profile header** — avatar (deterministic fallback), player, matchup + human tipoff (ET),
   plain market · evaluated line, quiet finding + Finding Mark, freshness + book coverage,
   cap tag, provenance, aged marker, concise disclosure.
2. **Evidence summary** — the quiet finding ("Evidence leans over/under/mixed…"), carried by
   the Finding Mark, not an oversized card (co-located in the header block).
3. **Window selector** — L5 · L10 · L20 · Season, **L10 default**, CSS radios.
4. **Historical visualization** — the rebuilt per-game chart for the selected window.
5. **Game history** — readable stacked rows with per-game inspection.
6. **Market context** — plain language + collapsible "Technical details".
7. **Why this profile ranked here** — plain-language reasons + collapsible "Technical reason codes".
8. **Technical scoring** — **collapsed `<details>`**: classification, score, §G.2 disclosure,
   components, versions.
9. **Methodology disclosure** — fuller §G.1 text + persistent methodology link.

First viewport shows player · matchup · market/line · direction · freshness · selected
window · start of the visualization.

## 4. Terminology mapping (`src/lib/research/terminology.ts`, new)

Deterministic, pure, no LLM. Every mapping is a static lookup from an already-emitted
internal value to approved plain language; an **unknown value renders the safe typed
fallback `"Technical detail unavailable"`, never the raw token.**

| Domain | Internal → Display |
|---|---|
| Markets | `player_points`→Points, `player_rebounds`→Rebounds, `player_assists`→Assists, `player_threes`→3-Pointers |
| Finding | `strong/moderate_over`→"Evidence leans over"; `…under`→"Evidence leans under"; `mixed`→"Evidence is mixed"; `insufficient`→"Insufficient evidence"; `unavailable`→"Evidence unavailable" |
| Selection method | `single_book`→"from a single book"; `unique_modal`→"the most common line"; `tied_no_unique_mode`→"no single most-common line"; `no_eligible_source`→"no eligible source" |
| Coverage | `complete`→"across the full book set"; `single_book`→"from one book"; `unresolved_consensus`→"no settled consensus"; `no_line`→"no line observed" |
| One-sided | `over_only`/`under_only`→"only the over/under side was offered"; `neither`/null→"both sides offered" |
| Movement | net point movement → "none observed" / "up N" / "down N" / "not observed" |
| Reason codes | all 22 `EVIDENCE_REASON_CODES` → plain sentences (deterministic map) |
| Display status | `eligible`→Counted, `did_not_play`→Did not play, `ineligible`→Ineligible |
| Outcome | `above`→Above line, `below`→Below line, `equal`→On line |

`windowSpan(series, eligible_n)` implements the **display-membership rule**: from the Nth-most-recent
counted entry through the newest, inclusive of interleaved ineligible positions (so L10 may
show >10 positions when ghosts fall inside the span). Pure slice — no sampling, no computation.

## 5. Server/client boundary & containment proof

- Every research component is a **server component**; the projection is never serialized to
  the client. Interaction is pure CSS-radio + `<details>` — **no client JS, no client-side
  evidence calculation.**
- The serialization audit (`npm run audit`, real `next build` + served fixture render) asserts
  over the **actual rendered `/design-preview/research/0` body**: no `internal_game_id`,
  `internal_player_id`, or `line_observed_at` keys; no raw market enum (`player_points`), no
  raw source enum (`sportsbook_consensus`), no raw market-context enum (`unique_modal`,
  `one_sided`); no raw ISO timestamp in visible text (the tipoff renders "7:00 PM" ET only);
  no paid-book/price canaries; and no probability/pick/EV/confidence/% framing in authored copy.
- The composite score renders **rounded** (`0.78`); the full-precision value (`0.7834`) never
  appears (DR-19 preserved — score is legitimately present on this surface, but only rounded
  and only inside the collapsed technical disclosure).

## 6. Requirement-by-requirement

- **R1 header** — avatar fallback + player + matchup + human tipoff (reuses the committed
  Board `formatMatchup`/`formatTipoff`, US Eastern, server-formatted — **imported, not
  modified**) + market · line + finding + freshness + book coverage + cap tag. No raw
  `player_assists`, `sportsbook_consensus`, raw ISO, event ids, or internal source names.
- **R2 compact summary** — the big §D.2 card is replaced by "Evidence leans …" + Finding
  Mark; strength/cap carried by the mark, not oversized copy.
- **R3 window selector** — L5·L10·L20·Season, L10 default; selecting swaps one selected
  summary + chart; **no client calc**; not four static cards.
- **R4 visualization rebuilt** — one compact bar + **one date label** per position; ghost
  (dashed) bars for ineligible/DNP holding chronological place; evaluated-line threshold;
  horizontal scroll for wide spans; oldest→newest; no green/red valence; no percentages;
  no removal/aggregation/sampling.
- **R5 game inspection** — tapping a row opens a `<details>` with persisted facts only
  (date, opponent, home/away, stat, evaluated line, result-vs-line / non-participation). No
  internal game id; identified by date + opponent.
- **R6 game history** — stacked mobile rows Date · Opponent · Result · Stat · Line; DNP/
  ineligible in chronological position, **marked "excluded from evidence counts"**; no
  box-score stats.
- **R7 market context** — Consensus line, Observed at N books, Observed range, Line movement,
  Point changes, plain one-sided text; raw enums behind a compact "Technical details"
  expansion; no prices/offerings.
- **R8 reasons** — deterministic reason-code → plain-language map; raw codes behind a
  collapsible "Technical reason codes".
- **R9 scoring** — normal user sees "Why this profile ranked here" (plain reasons);
  "Technical scoring details" collapsed by default (classification, score, §G.2, components,
  versions); score labelled "Evidence Strength score" (research-ranking), never probability.
- **R10 disclosure** — concise profile-level ("…not a prediction") + fuller §G.1 methodology
  text near the technical sections + persistent methodology link.
- **R11 architecture** — the nine-section order above; no nested bordered boxes.
- **R12 interaction** — only window selection, game inspection, collapsible technical/history
  expansion. No line adjustment, alt-line, book selection, predictions, payouts, bet slips,
  saved profiles, alerts, sharing, comments, or AI summaries.

## 7. Files changed

**Modified (tracked):**
- `apps/web/components/research/ResearchView.tsx` — full R1–R11 rewrite (server component).
- `apps/web/components/research/EvidenceChart.tsx` — div-based, one-date-per-column, ghost
  bars, horizontal scroll.
- `apps/web/src/lib/researchProjection.ts` — dropped `tipoff_utc`; added display-safe
  `matchup`, `tipoff`, `classification_label_compact` (reusing Board `formatMatchup`/
  `formatTipoff`). No score/component changes; forbidden keys unchanged.
- `apps/web/src/lib/researchCandidate.ts` — added optional server-side `opponent_city`,
  `player_team_city`, `is_home` (matchup inputs).
- `apps/web/src/lib/server/researchRepository.ts` — extended the existing read query to
  fetch opponent + home/away + cities (read-only passthrough; no computation).
- `apps/web/src/lib/server/fixtureResearchRepository.ts` — supplied matchup context to the
  fixtures so previews/tests render a header matchup.
- `apps/web/test/researchProjection.test.ts` — updated key list (matchup/tipoff/compact).
- `apps/web/test/researchView.test.ts` — added V1-8b data-boundary + view-structure tests.
- `apps/web/test-audit/serialization.test.ts` — added the V1-8b rendered-body audit.

**New (untracked):**
- `apps/web/components/research/GameHistory.tsx` — readable rows + per-game inspection.
- `apps/web/src/lib/research/terminology.ts` — deterministic translation layer.
- `apps/web/test/researchTerminology.test.ts` — terminology + windowSpan unit tests.

**Untouched (verified):** all Board tracked files (`bandView.ts` imported only — the
approved shared utility was **not modified**, so the test-25 shared-utility exception was not
needed), all computation/evidence/persistence files, `src/shared`, migrations.

## 8. Test accounting

| Suite | Command | Result |
|---|---|---|
| Root typecheck | `tsc --noEmit` (root) | **exit 0** |
| App typecheck | `tsc --noEmit` (apps/web) | **exit 0** |
| Root unit (non-integration) | `node --test-concurrency=1 --test tests/{bdl,computation,evidence,explanation,identity,lines,odds,seed,migrations}/**` | **578 / 578** |
| Full serial integration | `npm run test:integration` | **143 / 143** |
| App fast | `apps/web` `npm test` | **95 / 95** |
| Serialization audit | `apps/web` `npm run audit` (`next build` + served render) | **20 / 20** |

**Note on the root `npm test` glob.** Running the bare root `npm test` naively globs
`tests/**` and executes the integration tests **in parallel**, which deadlocks on shared-table
truncation (`truncateAllV14Tables`). That is a pre-existing harness artifact of the parallel
glob, not a defect — the integration suite is designed to run serially (`--test-concurrency=1`)
and passes 143/143 that way. My changes touch **zero** root `src/` or `tests/` files, so they
cannot affect those suites; the unit suites were run serially and are fully green.

**Canaries green:** DR-19 (score rounded, full precision absent, non-probabilistic label);
Amendment 21 (no `internal_game_id` in projection, HTML, or flight). No existing tests were
weakened; assertions were added, not removed.

## 9. Screenshots

**Screenshots are unavailable in this environment** — there is no browser automation
(Playwright/Puppeteer), no Chrome/Chromium, and no Vercel CLI. Everything else in the ticket
is complete and verified via the `next build` + served-render serialization audit. The
founder deploys and captures on device.

## 10. Confirmation — computation & persistence unchanged

No file under `src/computation`, `src/evidence`, or any persistence/ingest path was modified.
The Research View **translates** already-persisted values for display; it computes no new
evidence, writes nothing, and alters no evidence semantics. Scores, components, reasons,
eligibility, chronology, freshness, and caps are rendered exactly as persisted.

# V1-7b — The Research View — Report (PHASE 1 COMPLETE)

**Date:** 2026-07-28
**Status:** PHASE 1 COMPLETE, deployed, audited. **Halting after Phase 1** — a
valid, ticket-authorized outcome ("if Phase 1 consumes the ticket, HALT AFTER
PHASE 1 AND SAY SO"). Phase 2 (the line selector + live recompute) is deferred
and NOT built. Nothing committed. Nothing persisted from the research path.
Board untouched.

Starting state (verified): HEAD `d6fc9b51a0fd81be149cc23752a94eed46dea045`
(V1-7a); only the two untracked founder `docs/research/` files (left untouched).

---

## STEP 0 — the two questions (answered before building)

### 0(i) Per-game series — RESOLVED by the governor amendment (Option 1)

The original STEP 0(i) halt was correct: the series' **opponent (home/away)** and
**DNP/ineligible** dimensions are NOT projectable from already-read rows. The
amendment authorized a NEW read-only app-repository reader. The committed
semantics are BORROWED, not invented, and were unambiguous:

- Eligibility/DNP are the persisted output of `src/bdl/eligibility.ts computeEligibility`,
  stored on `player_game_stats.eligibility_state` (`'eligible' | 'non_participation'
  | 'unresolved_minutes' | 'quarantined' | 'live_or_non_final'`) + `minutes_status`
  (`'played' | 'dnp' | 'unresolved_non_numeric'`). Quoted in the reader header;
  the app SQL SELECTs them verbatim and never re-authors them.
- **Ambiguity check (governor-flagged): NOT ambiguous.** `computeEligibility`
  classifies only EXISTING rows; a DNP is an explicit stored row
  (`minutes_status='dnp'` → `eligibility_state='non_participation'`, eligibility.ts
  L153-160), and "team played, no row at all" is absence the model never
  fabricates. So DNP (stored) vs no-row (absent) are distinct — proceeded.

The new reader (`researchRepository.ts readSeries`) anchors the COUNTED set to the
SAME `historical_line_results` eligible set the committed threshold-window reader
uses, so series and windows reconcile by construction; ghosts (DNP/ineligible)
come from `player_game_stats` rows not in that set; the opponent label is a
`teams` join. Read-only; no write; no change to any existing query.

### 0(ii) Path B evaluation context — confirmed (for Phase 2)

`computeEvidenceProfileV2(input: EvidenceProfileInputV2)` takes `line_observed_at`
+ `evaluation_reference_time` as INPUTS (`engineV2.ts:51`); `classification_age =
evaluation_reference_time − line_observed_at`. A `user_entered` recompute can pass
the PERSISTED profile's context (not `now`), reproducing the same age so an aged
grain does not go beyond-horizon. Achievable with committed code; nothing blocks
it. **Deferred to Phase 2.**

---

## Founder ruling honored — display-with-age, not suppression

The Research View DISPLAYS an aged evaluation WITH a visible marker; it never
suppresses it and never implies currency. `researchFreshness.ts computeResearchFreshness`
imports the committed horizon `T_SERVE_SUPPRESS_MAX_SECONDS` (3600, D-A1) — it
reads it, it does NOT change or relax the Board serving gate. The **Board is
untouched** (byte-identical diff on its route files) and still suppresses.

**Freshness-disclosure markup for an aged grain** (server-rendered, `data-testid="aged-marker"`,
never hover-only):
```
Aged historical evidence — beyond the current-market window.
Shown for inspection only; this is not current market analysis.
```
Preserved distinctly: Path A is the persisted default; the aged grains (fixtures
2 & 5, and the real hosted grain) render this marker while remaining VISIBLE.

---

## Scope 1A — series projection

`ResearchProjection` gains `series: ReadonlyArray<ResearchSeriesEntry>` (added to
`RESEARCH_PROJECTION_KEYS` + the key-set assertion). Each entry: `game_date_utc,
opponent_label, is_home, stat_value, comparison_line, outcome ('above'|'below'|'equal'|null),
counted, eligibility_state (verbatim), minutes_status (verbatim), display_status
('eligible'|'did_not_play'|'ineligible'), includes_backfilled_historical`. Counts
and flags only — no rate, no percentage, no "hit" language. `outcome` is the SAME
comparison the threshold window performs (stat vs the evaluated line), set ONLY
for counted entries; `counted = eligibility_state==='eligible' && stat_value!==null
&& evaluated_line!==null` ⟺ `outcome!==null`, so series and windows reconcile.

**Consistency proven, not assumed:** a test asserts `windows.L10.count_above/below/equal`
exactly equal the tally of counted series entries and that DNP/ineligible entries
are EXCLUDED (ghosts, not evidence).

## Scope 1B — routes + isolation

- **PRODUCTION:** `/research/[internal_game_id]/[internal_player_id]/[market_key]`
  — server component, `PostgresResearchRepository` (server-only, transaction
  pooler), `ACTIVE_BOARD_METHOD_VERSION` (fail-loud). `null` → the authorized
  Unavailable state (never fabricated/approximated).
- **PREVIEW:** `/design-preview/research` (index → seven fixture grains) +
  `/design-preview/research/[idx]` — `FixtureResearchRepository`, banner.

**Isolation proven by test:** the production route imports no fixture module; the
preview routes import neither `PostgresResearchRepository` nor `getBoardPool`/the
hosted env; Board files import no research module. Source is selected by ROUTE.

## Scope 1C — the page (Path A)

`components/research/ResearchView.tsx` (mobile-first 390px, DARK, importing the
committed valence-neutral hue pair from `previewVariantStyle` — not redefined).
Sections: identity + context (exact line + source); the finding (FULL §D.2 label
verbatim — strength never discarded — direction, binding cap tag, provenance);
freshness disclosure (line-observed time + visible age + state + aged marker);
window evidence (L5/L10/L20/season count cards); the chart; market context (no
per-book offerings); reasons (engine order); grade detail; §G.1 page-level.

**The chart** (`components/research/EvidenceChart.tsx`, SVG): per-game bars vs the
threshold line, oldest-to-newest, DNP/ineligible as dashed ghosts, values
labelled, opponents on the axis. **Color documentation (in-file + on-page legend):**
above = azure `#57A6D9`, below = violet `#B58AD6`, on-the-line = slate `#8B929B`
— a valence-neutral pair, NOT green/red; ghosts are dashed slate. **Bar length
encodes the stat value, never the composite score.** No trend arrows, no
confidence encodings, no prediction.

**Grade detail (DR-19) markup — §G.2 IMMEDIATELY adjacent to the score:**
```
Evidence Strength score: 0.78                         (data-testid="composite-score")
It is not the estimated probability that a prop will hit.  (§G.2, data-testid="disclosure-g2")
components — c_rtp … · c_ms … · c_wa … · c_ma …
method evidence_method_v2 · computation v1            (data-testid="versions")
```
Score rounded to 2 decimals (`.toFixed(2)`), never a percentage.

## Scope 1D — tests (all groups green)

`test/researchView.test.ts` (7) + updates to `test/researchProjection.test.ts`:
1. all seven grains construct; every FULL §D.2 label reachable; GD-15 (Unavailable ≠ Insufficient); compact forms never used.
2. series/window consistency (the L10 tally assertion); DNP/ineligible excluded.
3. freshness: an aged grain is `aged_historical`/beyond-horizon and VISIBLE; a fresh grain is `fresh`; unknown when no line. (The aged MARKER in the server body is asserted by the audit, group 7.)
4. grade detail: score ≤2 decimals, no `%`; §G.2 present; method + computation version present.
5. copy safety: the committed `sweepForbiddenTerms` over every authored literal (view, chart, freshness copy, routes) AND every dynamic projection string — not forked.
6. route isolation (production ⊘ fixtures; preview ⊘ hosted; Board ⊘ research modules).
7. **serialization audit extended** to `/design-preview/research`, `/…/0` (fresh), `/…/1` (aged).
8. Board byte-identical (empty diff) + its audit assertions unchanged and green.
9. root typecheck/unit, app fast, full serial integration — green, none weakened.

**Audit canary adjustment (stated explicitly):** the composite score is now
LEGITIMATELY present on the research surface (DR-19). So for the research routes
the audit does NOT assert the score-digits canary; instead it asserts (a) the
PAID per-book offering canaries (`ZZQXFIXTUREBOOK7788`, `424242`) are absent, (b)
secrets are absent, and (c) the score shown is the ROUNDED value (`0.78` present,
full-precision `0.7834` ABSENT).

**Results:** app fast **55/55**, app typecheck 0, serialization audit **14/14**
(11 prior + 3 research), root typecheck 0, root unit **573/573**, full serial
integration **130/130**. **Board route files diff: EMPTY.**

## Scope 1E — deploy (PREVIEW only, no `--prod`)

Transient-root-link topology (V1-6c). Build required one fix (below). Deployed
**READY**.

**Preview URL (design-review artifact):** `https://web-nu4uoyo4v-bens-projects-593972b9.vercel.app`
- Research index: `.../design-preview/research`
- Fresh grain: `.../design-preview/research/0` · Aged grain: `.../design-preview/research/1`
- Production grain (real hosted data): `.../research/0b568345-ab7e-4203-b03a-271dc9df2a31/6e8393f6-857c-45fd-ac5b-7fa611bc4e3c/player_points`

**Deployed-response audit — 8/8 pass:** Board unchanged (empty state, no banner);
`/design-preview` + `/a` + `/b` unchanged; research index + fresh grain (full §D.2
label, §G.2-adjacent ROUNDED score, no paid/secret/full-precision) + aged grain
(aged marker present, not implying currency); production `/research/<grain>`
renders real hosted data (no paid canary/secret); client bundles clean.

### Build fix required (reported)

The production route pulled the committed read-model builder into the app build
graph, which transitively type-imports `pg` (via `src/db` `Tx`). `pg` is installed
in `apps/web` but the app-scoped Vercel build could not resolve its types for the
repo-root `src/db` modules → build failed. Two additive fixes, no behaviour
change: (a) `researchRepository.ts` now uses the app-local pool (`getBoardPool`)
instead of the root `openPool` (avoiding the root `pg` VALUE import — the same
one-owner pg wiring the Board uses); (b) `apps/web/tsconfig.json` gains a `paths`
mapping so `pg` resolves to `apps/web`'s `@types/pg` for the shared library's
root `src/db` modules. Local build + Vercel build both green after. The Board's
rendered output is unchanged (deployed empty state verified).

---

## Phase 2 — DEFERRED (not built)

The line selector + `user_entered` server-side live recompute (COMPUTED-NEVER-
PERSISTED, the persisted-vs-temporary distinction, the failure→Unavailable
behaviour, and the recompute-transport audit) is deferred to a subsequent ticket,
using the STEP 0(ii)-confirmed evaluation context. Phase 1 wrote NOTHING to any
database and added no recompute path.

---

## Files (nothing committed)

New:
- `apps/web/src/lib/researchFreshness.ts` — freshness disclosure (imports the committed horizon)
- `apps/web/components/research/ResearchView.tsx` — the Path A page
- `apps/web/components/research/EvidenceChart.tsx` — the per-game chart (SVG)
- `apps/web/app/research/[internal_game_id]/[internal_player_id]/[market_key]/page.tsx` — production route
- `apps/web/app/design-preview/research/page.tsx` — preview index
- `apps/web/app/design-preview/research/[idx]/page.tsx` — preview per-grain
- `apps/web/test/researchView.test.ts` — Phase 1 tests
- `docs/product/reports/V1_TICKET_7B_REPORT.md` — this report

Modified (additive):
- `apps/web/src/lib/researchCandidate.ts` — `series` + `ResearchSeriesRow`
- `apps/web/src/lib/researchProjection.ts` — `series` + `ResearchSeriesEntry` + key-set
- `apps/web/src/lib/server/researchRepository.ts` — `readSeries` (new reader) + app-local pool
- `apps/web/src/lib/server/fixtureResearchRepository.ts` — series fixtures + freshness
- `apps/web/test-audit/serialization.test.ts` — research-route coverage
- `apps/web/test-audit/deployedResponse.test.ts` — deployed research coverage
- `apps/web/test/researchProjection.test.ts` — superseded V1-7a "renders nothing" assertion → research-route isolation
- `apps/web/tsconfig.json` — `pg` → `@types/pg` path mapping (build fix)

Untouched: the entire `/board` route + `BoardProjection` (byte-identical), the
Board serving gate, `src/evidence`, the engine, authorities, thresholds, writers,
templates. No migration, no hosted write, no credit spend, no `--prod`, no commit.
The two `docs/research/` files (V1-GOV-2) are untouched.

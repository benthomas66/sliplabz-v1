# V1-OP-6 — Forward closing-line → hlr pipeline (FREE promotion) — SHELVED (structurally blocked; see GAP-30)

> ## ⛔ SHELVED — 2026-07-31 (founder ruling)
>
> - **Authority analysis: VALID and retained.** The STEP 0.A FREE verdict
>   (provenance / current-directional isolation / shape parity) stands and is NOT
>   withdrawn. See §4.1 of `V1_RELIGHT_PATH.md`.
> - **The FREE provenance/shape path is technically sanctioned in principle** —
>   promoting the last pre-tip `current_poll` (`self_observed`) snapshot into a
>   closing quote is authority-permitted.
> - **Operational execution is structurally blocked** under the current
>   boundary + polling invariants: with no forward `actual_start_utc` producer the
>   close boundary is `scheduled_with_grace` (`scheduled+900`), so the 600s
>   close-capture window is `[scheduled+300, scheduled+900]` — entirely AFTER
>   scheduled tip, while forward polling stops by scheduled tip. No eligible
>   forward snapshot can exist. **The missing element is an eligible forward
>   snapshot, not authority.** Recorded as **GAP-30**.
> - **NOT DISPATCHABLE.** The prepared V1-OP-6 dispatch envelope is **VOID** (never
>   issued). No implementation agent is to be dispatched against this ticket. The
>   HEAD/baseline framing below is retained for provenance only and is INERT.
> - **Shelved** pending a future actual-start / near-tip-trigger architecture
>   (a separate, unassigned ticket).
> - **Superseded as the immediate relight mechanism** by the paid historical path
>   (Path C — post-hoc archive retrieval), gated by the GAP-29 forecast fix.

**Historical baseline (reference only — NOT the execution pin; INERT while shelved):** `df58f05` (V1-OP-4c).
**Execution HEAD:** supplied EXCLUSIVELY by the post-governance-commit dispatch
envelope. That envelope's HEAD controls the pre-dispatch feasibility preflight and
SUPERSEDES the historical baseline above; the implementation agent must never treat
`df58f05` as a preflight pin. HEAD/worktree mismatch is judged against the
dispatch-envelope HEAD only. This keeps the agent from encountering two competing
HEAD requirements.
**Context:** `V1_RELIGHT_PATH.md`, GAP-28, GAP-3.
**Goal:** Make historical closing-line coverage (`historical_line_results`, the
table the evidence engine consumes) stay current AUTOMATICALLY going forward, so
the V1-OP-4c gate can lift and the Board serves coherent evidence — without an
operator running backfill scripts every slate.

This ticket owns legs 2+3 of the three-leg coverage requirement:
- **Leg 2** — closing line → `source_closing_quotes` → `canonical_closing_points`.
- **Leg 3** — `historical_line_results` computed from leg 2 ⋈ leg 1 (box scores).
(Leg 1, box scores + finalization, is V1-OP-5a. This ticket assumes leg 1 is
producing; it does not implement BDL.)

## Why this exists
The live scheduled cycle produces `current_market_rows` + `evidence_profiles`
only. `canonical_closing_points` are written ONLY by the historical Odds API seed
path; `historical_line_results` only by the operator populator / correction
writer. There is NO automatic forward producer for the engine's coverage table —
so profiles are built on hlr frozen at the 07-12 seed boundary. Restoring box
scores (5a) does not fix this. ~~This is the relight critical path.~~ **SUPERSEDED — see the SHELVED block at the top of this ticket and GAP-30: V1-OP-6 (FREE forward promotion) is no longer the relight path; the FREE mechanism is structurally blocked and the immediate relight is Path C (paid post-hoc historical retrieval).**

## Pre-dispatch feasibility preflight — HISTORICAL ANALYSIS ONLY (NOT a live dispatch gate)
> **SHELVED-ticket note:** this section is retained as historical analysis. It is
> **NOT a live dispatch gate** and **no agent is to be dispatched against it.**
> It also **cannot discriminate structurally-impossible from merely under-cadenced**:
> it measures `scheduled_with_grace` games, whose 600s window is post-tip by
> construction (GAP-30), so a "0 qualifying" result is the *structural* block, not a
> cadence miss a tighter V1-OP-3 could close. Kept only to document how the block
> was found.

STEP 0.B(2) proves promotion on a real slate against EXISTING snapshots. Whether any
existing snapshot even qualifies is not assumed — it is decided first, at zero cost.
Before dispatching implementation, run one read-only query: across recent past-tip
games, does ANY game have its latest `current_poll` / `self_observed` snapshot landing
within `CLOSE_CAPTURE_STALENESS_THRESHOLD_SECONDS` (600s) of its close boundary?
- **≥1 qualifying game →** proceed to STEP 0 / implementation; use those games for the
  STEP 0.B(2) real-slate proof.
- **0 qualifying games →** STOP. Under the current throttled cadence (~1.5–2.7h between
  polls vs. a 600s window) STEP 0.B(2) cannot pass against existing data; the promoted
  path first needs a near-tip poll (a scoped slice of V1-OP-3, or one manual near-tip
  poll). **Report the finding and return for founder direction before implementing** —
  do not force it.

This gate prevents dispatching an implementation whose central proof may be unprovable
until cadence is addressed; it does not itself reorder V1-OP-3.

## STEP 0 (report before implementing) — TWO load-bearing determinations

**STEP 0.A — Is forward coverage FREE, or does it require the Odds API?** THE
pivotal question; the ticket's size and cost hinge on it.
- The close-capture rule (`src/seed/staleness.ts`, §7.10.1 / §14.11.1) makes a
  closing quote an observation **within 10 minutes BEFORE** the close boundary
  (`CLOSE_CAPTURE_STALENESS_THRESHOLD_SECONDS = 600`; NOT loosenable in code). It
  is a PRE-close observation — post-close is not required.
- The live cycle already polls `current_poll` (`self_observed`) snapshots pre-tip.
  If the last pre-tip snapshot lands inside that 10-min window, it is
  close-capture-eligible BY TIMING.
- **Resolve against authority whether a `self_observed` current-poll snapshot may
  be PROMOTED into a `source_closing_quote` / `canonical_closing_point`:**
  - FOR: `recomputationWriter` already writes hlr with `provenance='self_observed'`;
    the §7.10.1 timing rule is provenance-agnostic.
  - AGAINST: `src/lines/currentHistoricalIsolation.ts` enforces "current and
    historical snapshots cannot mix" (`CURRENT_ONLY_WHERE_CLAUSE`; the
    `provenance='self_observed'` CHECKs). If the closing-quote lineage is
    historical-provenance-exclusive, promotion is FORBIDDEN.
  - **Quote the governing spec (§7.10.1, §7.10.2, Odds §14.11.1, §18.4; the
    isolation invariant) and state the verdict.** If promotion is forbidden, that
    is a real methodology constraint — legs 2+3 then require the Odds API
    historical endpoint (**~40 credits/event** per §14.11.2's 10× historical
    multiplier — the earlier ~4/game figure used the current-odds formula and is
    SUPERSEDED, see GAP-29) and this ticket carries provider spend + the §14.11
    coverage preflight under the Historical-spend order below. If permitted,
    forward coverage is FREE.
- **Also determine what `closeBoundary.ts` is:** confirm it is a pure,
  authority-grounded (§7.10) primitive that computes the close boundary but
  captures nothing — i.e., wiring it forward COMPLETES an unfinished design
  rather than repurposing it. State whether legs 2+3 are "connect the existing
  primitive + a promotion step" (small) or "build new capture" (large).

**STEP 0.A verdict is settled (governor-verified 2026-07-31): FREE** — see
`V1_RELIGHT_PATH.md` §4.1. Promotion of the last pre-tip `current_poll` snapshot is
authority-permitted (§7.10.1 provider-agnostic; isolation is current-directional;
no provenance CHECK bars promotion on the closing-quote tables, and
`historical_line_results` — leg 3, the table the engine reads — explicitly PERMITS
the promoted value: migration `20260711140007` originally `CHECK
(provenance='self_observed')`, widened by `20260711150000` to `CHECK (provenance IN
('self_observed','backfilled_historical'))` with `self_observed` as the column
default; not a DR-24 change). Re-confirm the authority in your own STEP 0 write-up,
but the branch is FREE (no Odds API).

**STEP 0.B — HARD GATE: prove the new lineage, do not assume it.** This is
authority-permitted but **never-exercised** wiring — no `self_observed` market
snapshot has ever flowed into a `canonical_closing_point`. Before ANY forward
producer is trusted, STEP 0.B must:
  1. **Structural-shape + deterministic-content proof (provenance VALUE is EXEMPT).**
     Demonstrate that a `canonical_closing_point` and a `historical_line_results`
     row produced by the promoted path match a row produced by the committed seed
     path in **structural shape and deterministic content** — columns, types,
     `selection_method`/`coverage_state` domains, `computation_version`, rounding,
     null-handling — by **reusing `computeCanonicalRows` and the existing hlr
     compute, NOT parallel math**. **The `provenance` VALUE is deliberately EXEMPT
     from this identity and MUST be `self_observed` for promoted rows** — their
     source is a live `current_poll` snapshot, so `self_observed` is the honest
     value (`historical_line_results` permits it: migration `20260711150000`,
     `CHECK (provenance IN ('self_observed','backfilled_historical'))`, column
     default `self_observed`). Use **`recomputationWriter`** (writes
     `provenance='self_observed'`, `from_backfilled=false`) as the provenance
     reference for this path — **NOT** `historicalLineResultsBackfill`
     (`BACKFILL_PROVENANCE='backfilled_historical'`). A literal "byte-identical to
     the seed/backfill populator" reading would stamp `backfilled_historical` onto
     a live observation, flipping the browser-surfaced `includes_backfilled_historical`
     flag (`readModelInputBuilder.ts:533`→`:603`) to a false value — a rule-#6
     copy-safety defect. Any divergence in the shape (provenance-value aside) →
     report before building.
  2. **One-real-slate end-to-end verification.** Prove on ONE actual finished slate
     that the promoted path yields `coverage_state IN ('complete','single_book')`
     hlr for its games (read-only comparison / dry-run; no destructive writes until
     the governor authorizes). If the current 3h poll window already left an
     eligible pre-close snapshot for those games, use it; if NO game in a recent
     slate has an eligible in-window snapshot, report that (it quantifies V1-OP-3's
     exact requirement) rather than forcing it.
  3. **Compose/method boundary.** If, in wiring, promotion would change what a
     closing quote MEANS (provenance semantics, selection, or any `evidence_method_v1`
     input contract) rather than adding a population source, that is a
     `method_version` event per DR-24 — **HALT and report**, do not proceed as ops.

Do not build the forward producer until STEP 0.B's shape proof and real-slate
verification pass and the governor authorizes.

## Scope (pending STEP 0.A verdict)
- **Branch FREE (promotion permitted):** a forward driver that, per game at its
  close boundary (`evaluateCloseBoundary`), selects the eligible last-pre-tip
  `current_poll` offering set (within the 10-min window, allowlisted sportsbooks,
  launch markets, "final snapshot / no walking backward" per §14.11.1) and
  promotes it through the existing `computeCanonicalRows` → hlr populate path.
  No new provider calls. V1-OP-3 (cadence floor ensuring a near-tip poll) becomes
  the enabling dependency.
- **Branch PAID (promotion forbidden):** a scheduled per-slate driver that calls
  the Odds API historical event-odds endpoint (**~40 credits/event**, §14.11.2 10×
  multiplier — NOT the superseded ~4/game) at each finalized game's close boundary
  and runs the existing seed → canonical → hlr path. Carries budget-floor + reserve
  accounting (`RESERVE_FLOOR_CREDITS`) and the §14.11 preflight, and is gated by the
  **Historical-spend order** below (GAP-29 forecast fixed and verified first).
- **Either branch:** idempotent, resumable, one-owner reuse of
  `computeCanonicalRows` / the hlr populate (no parallel closing-line math);
  triggered as leg-1 finalization lands so leg 3 = leg 2 ⋈ leg 1.

## Historical-spend order (binding — applies to ANY Odds API historical credit)
The FREE branch spends nothing. But the PAID fallback, and the adjacent V1-OP-5b
market-coverage probe / backfill, spend historical credits — and `quotaForecast`
currently under-reads that cost ~22× (GAP-29), the very function that gates spend
against `RESERVE_FLOOR_CREDITS`. Therefore, before ANY historical Odds API call, in
order:
1. **Fix GAP-29** — add the §14.11.2 10× historical multiplier to
   `forecastEventOddsCost` and a non-zero historical-discovery cost to
   `forecastEventDiscoveryCost`.
2. **Independently verify** the corrected forecast, reconciled against the
   authoritative `x-requests-remaining` header (`reconcileQuota`).
3. **Then** execute the bounded historical market-coverage probe (≤40 credits) —
   confirms the 4 WNBA player-prop markets are actually present in the historical
   event-odds payload. Open residual: the discovery endpoint returns game shells,
   not markets, so market presence is unproven until this probe runs (established by
   the V1-OP-5b Odds API probe, 2026-07-31 — supporting founder-held evidence, held
   untracked; not a committed dependency of this ticket).
4. **Return the corrected budget package for founder authorization** before any
   larger historical spend (e.g. the ~1,695-credit in-window backfill).

No step 3+ before steps 1–2 land: the probe itself exercises the mis-billing path
(`reconcileQuota → observed_higher_than_forecast`).

## Out of scope
BDL box scores + finalization (V1-OP-5a). The V1-OP-4c gate itself (done). The 24
unmapped historical in-window games (they roll off; not backfillable here).

## Done when
The pre-dispatch feasibility preflight returned ≥1 qualifying game (or its 0-game
halt was resolved by founder direction); STEP 0 report resolves 0.A (with authority
quoted) and 0.B before any code; STEP 0.B(1) shows structural-shape parity with
provenance held at `self_observed`; no historical Odds API credit was spent outside
the Historical-spend order; the
forward pipeline produces usable hlr for a live slate end-to-end (verified: a game
played after this lands gets `coverage_state IN ('complete','single_book')` hlr
within 96h of tip); the V1-OP-4c gate's coverage-unresolved count for recent games
trends to zero as covered slates accumulate; all suites green; report written;
halts without committing for governor review.

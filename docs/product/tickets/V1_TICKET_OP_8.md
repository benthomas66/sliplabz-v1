# V1-OP-8 — Path C historical closing-line retrieval → hlr (backlog + recurring forward) — DRAFT, STEP-0-GATED

**Proposed number:** V1-OP-8 (adjust if the founder prefers another).
**Baseline (reference only):** `f685f86`; execution HEAD supplied at dispatch.
**Status:** DRAFT for founder review. NOT executed. No spend, no commit until STEP-0 gates pass AND the founder authorizes (spend is a further, separate authorization gated on `V1_PATH_C_BUDGET.md`).
**Context:** `V1_PATH_C_BUDGET.md`, `V1_RELIGHT_PATH.md` §6 (Path C), GAP-3 / GAP-28 (operational half) / GAP-27 / GAP-30 / GAP-29.

## Goal
Produce historical closing lines forward + backlog via the **paid Odds API historical endpoint**:
`source_closing_quotes → canonical_closing_points → historical_line_results` (legs 2+3), so the
V1-OP-4c gate's coverage-unresolved count trends to zero and the Board relights. Closes the
**operational half of GAP-28 / GAP-3**. This is Path C — the FREE forward promotion (V1-OP-6) is
shelved (GAP-30); this retrieves closing lines post-hoc from the archive, which is immune to the
scheduled-with-grace boundary block.

## Reuse — single owner, no parallel math
- Retrieval: the committed historical HTTP clients (`src/seed/httpClient.ts`) — live-validated by
  the 2026-08-01 probe (payloads present, all 4 markets, close-capture eligible).
- Canonical + hlr: the committed seed path — `computeCanonicalRows` / `selectCanonicalClosingPoint`
  (`src/lines/canonicalClosingPoint.ts`) and the populator `src/lines/historicalLineResultsBackfill.ts`
  (`computeHistoricalLineResult`). No parallel closing-line math anywhere.
- **Provenance is clean here (unlike V1-OP-6).** Historical retrieval legitimately produces
  `provenance='backfilled_historical'` — so the `historicalLineResultsBackfill` writer
  (`BACKFILL_PROVENANCE='backfilled_historical'`) is the CORRECT writer, and the `self_observed`
  provenance tension that shelved V1-OP-6 (its F1 / rule-#6 copy-safety concern) **does not apply**.

## Spend discipline (binding)
Every historical Odds API call behind the **GAP-29-corrected forecast** (`forecastHistoricalEventOddsCost`
40/event, `forecastHistoricalEventDiscoveryCost` 1/call — now live-validated) + `RESERVE_FLOOR_CREDITS`,
using the F5-style order per call: **forecast → issue → reconcile vs `x-requests-last` → halt before
the ceiling / reserve floor**. Idempotent, resumable per-slate (recurring) and per-batch (backlog);
a re-run must not double-charge already-covered games (skip games with usable hlr). Honor the
budget-package ceiling; no blind retry.

## HARD STEP-0 GATES (must pass before the full backfill relies on the path)
The probe proved the payload is present and shaped correctly; it did NOT prove these:

1. **Player → internal-id resolution (Qualification 1).** Run the historical payload player names
   (the `description` field) through the committed seed reconciliation path
   (`src/identity/playerReconciliation.ts` + `nameNormalization.ts`) on ONE real slate. Prove
   deterministic name→internal_player_id resolution; enumerate any non-resolving name and its
   coverage impact (a name that doesn't resolve yields no hlr for that grain). Report the
   resolution rate. The probe confirmed names are PRESENT, not that they RESOLVE.

2. **Boundary-derivation lock (Qualification 2) — WIDENED (2026-08-01).** Compute the close boundary
   SOLELY via the committed `evaluateCloseBoundary` (which depends on EITHER `games.actual_start_utc`
   → `verified_actual_start`, OR `scheduled_start_utc + 900` → `scheduled_with_grace`). **The retrieval
   writes NEITHER `actual_start_utc` NOR `scheduled_start_utc`, and synthesizes NO timestamp from a
   date-only provider field** (e.g. Odds `commence_time` or BDL's date-only `date` — GAP-31). Moving
   either field shifts the boundary and retroactively flips eligible snapshots to `close_capture_stale`
   (verified in the probe: the archive's actual commence was 19:07, but the governed boundary is
   `scheduled+900`=19:15; a 19:07-derived boundary would make the eligible 19:10:37 snapshot stale).
   **Guard test asserts BOTH start-time fields are byte-identical** for every touched game and that the
   boundary derives only from the committed primitive.

3. **Canonical/hlr shape-parity proof (deferred STEP-0.B).** On ONE real slate, prove the produced
   `canonical_closing_point` + `historical_line_results` rows are byte-identical in shape to the
   committed seed path (reuse, not parallel math), reaching `coverage_state IN ('complete','single_book')`
   before the forward producer is trusted. (Read-only / dry-run comparison first; destructive writes
   only after founder authorization.)

4. **DR-24 boundary.** If wiring would change what a closing quote MEANS (definition/selection or any
   `evidence_method_v1` input contract) rather than adding a population source, that is a
   `method_version` event — **HALT and report**, do not proceed as ops. (Expected NOT to trigger:
   this reuses the seed definition/selection unchanged.)

## ⛔ GATE — the first paid one-game validation is blocked on V1-OP-8a (GAP-36, 2026-08-02)

**The first paid one-game validation under V1-OP-8 is gated on committed and independently-audited V1-OP-8a.** **No historical Odds API request may be issued until the bounded caller exists.**

STEP-0 re-confirmation (2026-08-02, code-verified) found that **no committed driver can execute a bounded one-game retrieval + persistence**: `scripts/v1_4b_stage2_phase_b_seed.ts` has zero CLI args and scans a discovery cache that does not cover the restored cohort's dates, and `scripts/v1_4c_phase_b_populate.ts` has no game selector and would populate globally-eligible hlr grains beyond the target. Issuing a paid request before the scoped caller exists would retrieve data with **no authorized bounded persistence path**. The per-event primitives themselves are sound — the missing object is orchestration. See **GAP-36** and **`tickets/V1_TICKET_OP_8A.md`**.

**Update (2026-08-02, `54c346d`):** V1-OP-8a's bounded owner has **landed and is dry-run-verified** (GAP-36 → resolved-pending-validation). Its paid fetch and persist seams remain **stubbed-to-throw**, so the one-game paid validation is still a separate founder authorization.

**⛔ SECOND GATE — the BROADER Path C repair is additionally gated on a GAP-37 ruling.** Beyond a successful one-game validation, the bulk repair requires a deliberate decision on **game-level transactionality**: `persistHistoricalSnapshot` is atomic **per (event, market, bookmaker) triple**, not per game, and canonical/hlr fire only after all of a game's triples complete. A mid-game failure leaves partial `source_closing_quotes` with no canonical point and no hlr — safe-by-incompleteness and resumable, and acceptable for one game, but across the **47 backlog + 113 forward** games it becomes an operational concern (resume bookkeeping, repeated spend on partially-persisted events). **Rule on whether a game-level transaction wraps retrieve→canonical→hlr BEFORE authorizing the bulk repair.** See GAP-37.

This gate does **not** otherwise rescope V1-OP-8; the goal, reuse constraints, spend discipline, and STEP-0 gates below are unchanged.

## Dependencies / sequencing
- **V1-OP-5a (BDL box scores, leg 1) — sequenced BEFORE OP-8 for the backlog** (`tickets/V1_TICKET_OP_5A.md`).
  The dependency is **UPSTREAM for the backlog** (only **1 of 47** backlog games currently has box
  scores; the other 46 cannot compute leg-3 hlr until 5a lands them) and **parallel for forward
  games** (leg-2 retrieval and leg-1 finalization can run together per slate; leg-3 lands once both
  are present). **Amendment (2026-08-01):** the STEP-0.B(2) real-persist validation target is now a
  **representative mapped, box-score-complete backlog slate (post-5a)** — NOT the single unmapped
  exception (`22302337`) that was the only qualifying game pre-5a.
- **Shared WIDENED two-field boundary invariant (cross-ticket with V1-OP-5a / 5c / 5D; GAP-31):**
  Neither `actual_start_utc` nor `scheduled_start_utc` may be written, refreshed, synthesized, or
  altered by V1-OP-5a, V1-OP-5c, V1-OP-5D, or V1-OP-8 for games whose close-boundary-dependent
  evidence is being preserved or promoted, absent a separately authorized boundary migration proving
  downstream validity. `evaluateCloseBoundary` depends on either field; moving either can flip an
  eligible archived snapshot to `close_capture_stale` (the legacy `v1_4e_step2` is PROHIBITED, GAP-31). Both
  tickets carry the guard.
- Backlog repair + recurring forward retrieval **sustain until** the uncovered tail rolls off past
  the recent-N window (GAP-28) and the V1-OP-4c gate lifts. The 2 pre-window permanent-hole games
  (GAP-30) are outside the recent-N window and need not be repaired to relight.
- Scope of spend + game counts: per `V1_PATH_C_BUDGET.md` (one-time ~1,900 cr / 47 in-window games;
  recurring ~4,556 cr / 113 games through 2026-09-25).

## Out of scope
BDL box scores + finalization (V1-OP-5a). The V1-OP-4c gate itself (done). Any change to the
closing-quote definition/selection or the evidence method. The FREE forward promotion (V1-OP-6, shelved).

## Done when
STEP-0 gates 1–3 pass (player resolution proven, boundary-derivation locked with a guard, shape
parity demonstrated on a real slate) and the founder authorizes spend; hlr is produced end-to-end
for a live slate at `coverage_state IN ('complete','single_book')`; the V1-OP-4c gate's
coverage-unresolved count for recent games trends to zero as covered slates accumulate; all suites
green; report written; **halts without committing for governor review.**

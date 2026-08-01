# V1-OP-5a — Restore + sustain BDL box scores & finalization (leg 1 / player_game_stats) — DRAFT

**Proposed number:** V1-OP-5a. **Baseline (reference only):** `4c72bde`; execution HEAD supplied at dispatch.
**Status:** DRAFT for founder review. NOT executed. **0 credits** (BDL is a free API; no Odds API spend).
**Context:** `V1_RELIGHT_PATH.md` (leg 1), GAP-3, GAP-26/GAP-28, and the shared `actual_start_utc` invariant with `V1_TICKET_OP_8.md`.

## Goal
Restore and then sustain BDL box scores + game-status finalization (leg 1 → `player_game_stats`). This is the **upstream prerequisite** for V1-OP-8's leg-3 `historical_line_results` on the **46/47 backlog games** that lack box scores, and for all forward games (`hlr = leg2 ⋈ leg1` cannot compute without leg 1).

## Scope
- **Backlog:** the **~46 in-window games lacking `player_game_stats`** (window 2026-07-12 → now) + the **~36 past-tip games stuck `status='scheduled'`** (finalize them). Counts read 2026-08-01; STEP 0 re-confirms.
- **Forward:** per-slate finalization + box-score ingestion running continuously (the automated leg that froze ~07-15).

## Reuse — single owner, no parallel math
The committed V1-2 BDL modules: `src/bdl/gameStatus.ts` (status → `final`), `src/bdl/correctionDetection.ts`, the `player_game_stats` writer + `player_game_stat_history`. Honor the V1-2 identity/correction invariants: **finality comes only from the mapped BDL status** (never inferred from clock/period), **unknown statuses quarantine** (never guess).

## ⚠️ HARD CROSS-TICKET INVARIANT (audit-derived — the load-bearing 5a↔OP-8 interaction)
**V1-OP-5a MUST NOT populate `games.actual_start_utc`.** Finalization writes **status + box scores only**.
- **Why:** OP-8's boundary-derivation lock (GAP-30 / OP-8 Gate 2) depends on `actual_start_utc` staying **null** so `evaluateCloseBoundary` = `scheduled_with_grace` (scheduled + 900s). If 5a wrote `actual_start_utc` (e.g. from a BDL game-start time), every game's close boundary would shift to actual tip and **retroactively flip the archive snapshots OP-8 promotes to `close_capture_stale`** — silently breaking relight. (Verified in the OP-8 probe: the eligible 19:10:37 snapshot is eligible only against the scheduled+900=19:15 boundary; an actual-start-derived boundary would make it stale.)
- **Guard:** add a test/invariant asserting `actual_start_utc` remains **null** after finalization for the processed games.

## Gate-safety — why 5a is now UNHELD, and why it does NOT relight alone
Restoring `player_game_stats` does **NOT** lift the V1-OP-4c gate. That gate keys suppression on **hlr coverage** (`USABLE_HLR_COVERAGE_STATES`, `src/ops/ingestionGate.ts`), reporting pgs absence only as a **separate** diagnostic signal. So the Board stays **honestly dark** until V1-OP-8 lands hlr coherence. State this explicitly: it **dissolves the old GAP-3 hold**, which was predicated on the retired **pgs-anchored V1-OP-4 gate** — re-anchored to hlr coverage by V1-OP-4c (GAP-26 closed). 5a can no longer prematurely lift suppression, so it is safe to run now.

## STEP 0 (report before implementing)
1. Confirm the committed BDL finalization path + box-score writer to reuse (status mapping, correction detection, the `player_game_stats` writer + history), and that no new parallel ingestion is introduced.
2. Confirm the **`actual_start_utc`-stays-null** invariant is honored by that path (the writer must not set it); design the guard test.
3. Re-confirm exact backlog counts (games without pgs; stuck-`scheduled`) at execution HEAD.
4. Confirm 5a touches no closing-line / canonical / hlr surface and does not modify the V1-OP-4c gate.

## Done when
Backlog `player_game_stats` restored + stuck-`scheduled` games finalized; forward finalization + box-score ingestion runs; the **`actual_start_utc`-null invariant test passes**; the V1-OP-4c gate **demonstrably does NOT lift** (stays suppressed pending hlr — proving the coherence guard holds); all suites green; report written; **halts without committing for governor review** (0-credit, but its writes are not trusted until reviewed).

## Out of scope
Closing lines / canonical / hlr (V1-OP-8, legs 2+3). Any Odds API spend. The V1-OP-4c gate itself (done). **`actual_start_utc` (must remain null).**

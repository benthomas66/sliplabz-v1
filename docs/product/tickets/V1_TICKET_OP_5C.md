# V1-OP-5c — Durable Forward Box-Score & Game-Finalization Ingestion — DRAFT

**Proposed number:** V1-OP-5c. **Baseline (reference only):** `75c0055`; execution HEAD supplied at dispatch.
**Status:** DRAFT for founder review. NOT executed, NOT dispatched. **0 credits** (BDL free API). Do not fold into V1-OP-5a.
**Context:** `V1_RELIGHT_PATH.md` (leg 1), GAP-3 (recurring one-shot defect — this closes its forward half), the shared `actual_start_utc` invariant with V1-OP-8.

## Goal
Run the BDL processing + persistence path **durably going forward**: continuously fetch completed-game box scores + update finality, so leg 1 (`player_game_stats`) stays current per slate — the standing counterpart to V1-OP-5a's one-time backlog restore.

**Owner note (2026-08-01):** the **single reusable `src/` finalization owner is delivered by V1-OP-5D** (the GAP-31 repair — the scoped status-only finalizer). **V1-OP-5c adds continuous scheduling + failure-signaling ON THAT SAME OWNER — not a parallel implementation.** The standing warning against copying operator-script SQL into a second owner applies; governor confirms boundaries in STEP 0.

## Why this is separate from V1-OP-5a
V1-OP-5a restores the **backlog** by re-running committed **operator scripts** (`scripts/v1_4c_stats_backfill.ts`, `scripts/v1_4e_step2_forward_games.ts`). Those scripts are one-shot operator tools, not a durable owner, and the persistence logic currently lives in **scripts**, not `src/`. Sustaining leg 1 forever by re-running operator scripts by hand IS GAP-3 ("backfills are one-shots") made permanent. V1-OP-5c fixes that structurally.

## Scope
- **Promote / refactor** the box-score + finalization persistence into an appropriate reusable `src/` owner, **preserving the committed V1-2 semantics** (status→finality only from mapped BDL status, never clock/period; unknown statuses quarantine; eligibility precedence; correction detection via `correctionDetection.ts`; watermark = complete-only). **Do NOT copy operator-script SQL into a second semantic owner — promote to a single owner, no parallel math.**
- **Continuously** ingest completed-game box scores + finality, idempotent bounded-batch, resumable, no reprocessing of already-complete games.
- **Independently governed scheduler/trigger** (a workflow/schedule of its own — the analogue of the Odds `poll-cycle.yml`, or another governed trigger). Failure signaling + observation (ties to the open V1-OPS-3 poll-failure-signaling concern).

## ⚠️ HARD INVARIANT — WIDENED (shared with V1-OP-5a / V1-OP-8)
**V1-OP-5a, V1-OP-5c, and V1-OP-8 must not write, alter, synthesize, or "refresh" either `actual_start_utc` OR `scheduled_start_utc`** for a game whose close-boundary-dependent evidence is being preserved, validated, or promoted, unless a separately authorized boundary-migration procedure proves all dependent snapshots remain valid.
**Reason:** `evaluateCloseBoundary` may depend on EITHER field (`closeBoundary.ts` — `verified_actual_start` from `actual_start_utc`; `scheduled_with_grace` = `scheduled_start_utc + 900`). Movement of either changes the governed capture window, so a previously eligible archived snapshot can become `close_capture_stale` solely because a writer changed a boundary input.
**For 5c specifically:** the forward finalization writer updates **`status` only**, altering **neither start-time field**, and must be **scopeable to an explicit game set** (unlike the legacy season-wide `v1_4e_step2_forward_games.ts`). Carry a guard test asserting neither `actual_start_utc` nor `scheduled_start_utc` changes for any processed game.

## Governance boundaries — the implementation governor determines the architecture
The `src/` owner boundaries, the promotion/refactor shape, and the scheduler/trigger are for the implementation governor to design (STEP-0 first, report before implementing). Do NOT presuppose the module layout here.

## Status framing (explicit)
- **NOT required before** the V1-OP-5a backlog restore.
- **NOT required before** V1-OP-8's representative validation or the governed historical repair.
- **MANDATORY before** the relight is declared **operationally durable** — without it, forward leg 1 stalls again and the Board re-darkens as coverage drifts.
- **Not optional polish; not to be deferred indefinitely** after relight.

## Out of scope
Closing lines / canonical / hlr (V1-OP-8). Any Odds API spend. The V1-OP-4c gate itself. Backlog restore (V1-OP-5a). `actual_start_utc` (must remain null).

## Done when
The single `src/` owner produces forward box scores + finality durably on its governed schedule; committed V1-2 semantics preserved (tests); the `actual_start_utc`-null guard passes; idempotent/resumable proven; failure signaling in place; suites green; report written; halts without committing for governor review.

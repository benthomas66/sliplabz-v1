# V1-OP-5D — Scoped status-only game finalizer (repairs GAP-31) — DRAFT

**Proposed number:** V1-OP-5D. **Baseline (reference only):** `75c0055`; execution HEAD supplied at dispatch.
**Status:** DRAFT for founder review. NOT executed, NOT dispatched. **0 credits** (BDL free API). Docs-only authoring here; implementation dispatches separately after review.
**Context:** GAP-31 (the legacy finalizer's date-only midnight overwrite), the widened two-field boundary invariant, V1-OP-5a Phase 2 (the 36 held games), V1-OP-5c (durable owner), V1-OP-8 (Gate 2).

## Why this exists
The only committed finalization tool, `scripts/v1_4e_step2_forward_games.ts`, is **prohibited for production use (GAP-31)**: it writes `scheduled_start_utc = COALESCE(g.datetime ?? g.date, scheduled_start_utc)`, and BDL's `datetime` is null for all WNBA 2026 games (read-only delta, 2026-08-01) — so it would overwrite the committed scheduled tip with **date-only midnight**, moving the governed close boundary by ~hours (a 19:00Z tip → 00:00Z = ~−68,400 s against a 600 s capture window) and invalidating historical close-capture eligibility. This ticket delivers the **safe replacement**.

## Required outcome (binding)
- Existing-game finalization updates **`status` only**, plus ordinary audit metadata (`updated_at`).
- **Must not write `scheduled_start_utc`. Must not write `actual_start_utc`.**
- **Must never derive a timestamp from BDL's date-only `date` field.**
- Supports **explicit bounded selection** of a game-id set (e.g. the 36 held games).
- Provides a **true dry-run with zero database writes**.
- **Idempotent.**
- Must **not create** unrelated season games or mappings (no season-wide re-observation; no row creation outside the explicit batch).
- Preserves all committed finalization/status semantics: finality only from mapped BDL status (never clock/period); unknown statuses **quarantine**; correction detection (`correctionDetection.ts`).
- **Regression tests prove both `actual_start_utc` and `scheduled_start_utc` remain byte-identical for every touched game.**

## Preferred implementation
- **Create or promote a reusable scoped finalization owner in `src/`.** This owner is the **single BDL-finalization owner** — V1-OP-5c later adds continuous scheduling / failure-signaling **on top of this same owner**, not a parallel implementation.
- Leave the legacy season-wide script **prohibited**; convert it to a thin adapter over the safe owner **only after independent review** — never modify-and-run in place.
- Validate on a **small representative subset first**, then execute against the 36-game backlog, then **halt for independent audit before V1-OP-8**.

## ⚠️ Architecture note — avoid a second semantic owner
V1-OP-5c's remit already includes promoting the BDL persistence path into a **single reusable `src/` owner**. The finalizer built here **must be that owner**; 5c adds scheduling/failure-signaling atop it. Governor confirms the owner boundaries in STEP 0 so we do not end up with two owners. The standing warning against copying operator-script SQL into a second owner applies.

## STEP 0 (report before implementing)
Confirm the `src/` owner boundaries (shared with 5c); confirm the status-only write path and the two-field byte-identity guard; confirm explicit-batch selection + write-free dry-run; confirm no season-wide re-observation / no row creation outside the batch.

## Halt conditions
Any path would write either start-time field · a date-only synthesis would be required · selection cannot be bounded to the explicit set · row creation outside the batch · the dry-run cannot be made write-free · committed finalization/status semantics would change.

## Done when
The scoped `src/` finalizer updates `status` only for an explicit game set; both start-time fields provably byte-identical (regression tests); write-free dry-run; idempotent; no out-of-batch row creation; validated on a subset then run against the 36 held games; suites green; report written; **halts without committing for independent audit before V1-OP-8**.

# V1-OP-8c — Repair V1-OP-8b batch-1 (recover paid data, fix persist wiring, close the verification gap)

**Baseline (reference only):** `f764130`; execution HEAD supplied at dispatch.
**Resolves:** GAP-39. **Status:** DRAFT, STEP-0-GATED. Not dispatched.
**Context:** GAP-39 · GAP-38 (closed `52fd0a0`) · GAP-37 · `tickets/V1_TICKET_OP_8B.md` · `docs/product/manifests/V1_OP_8B_BATCH_1.txt`.

## Authorization

**Authorizes:** code · tests · read-only DB analysis · a **0-credit recovery re-process** *if* STEP 0 proves it viable.

**Does NOT authorize:** any new paid fetch · the batch re-fire · the full-backlog run. Each is a separate founder authorization.

## What happened

V1-OP-8b batch-1 fired 10 games against the frozen manifest (`sha256 0928c8c8…`). **All 10 returned `close_capture=eligible`. 400 credits billed, `reconcileQuota=exact_match` on every call. Zero rows persisted.**

**Single root cause.** `scripts/v1_op_8b_batch.ts:204` passed `linked_internal_game_id: null`; the committed guard at `persistHistoricalSnapshot.ts:290` (`if (input.linked_internal_game_id === null) continue;`) skipped every candidate. The one-game validation passes `internal_game_id` correctly (`scopedHistoricalRetrievalDeps.ts:165`) — this was a regression introduced when the wiring was rewritten for the batch entry. **Nothing else caused the zero-row outcome.**

**Valid measurement obtained (archive timing only).** `retrieveGame` computes close-capture via `processHistoricalSnapshot` → `evaluateCloseCapture` (`v1_op_8b_batch.ts:182`, read at `:188`), **upstream** of `persistGameAtomically` (`bulkHistoricalRepair.ts:215`, gated at `:204`). So the close-capture verdicts are trustworthy despite the persistence failure: **10/10 fetched snapshots passed the governed close-capture rule; measured `close_capture_stale` rate 0/10; ages ~262–263s before boundary.** This is **valid archive-timing evidence, NOT persistence success, and it does not mitigate the zero-row failure.** Billing was also exact at batch scale (forecast 400 = observed 400).

**The atomic design held.** 0 orphan quotes · both start-time fields byte-identical on all 10 · `games` 332→332, `provider_games` 534→534 · nothing swept in (other-game hlr 4686→4686) · gate unmoved `53/55 → 53/55`. The failure was clean-but-empty, which is the safe direction.

## STEP 0 — the recovery determination (**ALREADY ANSWERED, read-only, 2026-08-04**)

**Question:** can the 10 games be recovered at 0 credits by re-processing stored data, rather than re-fetching?

**Answer: NO. A re-fetch is required. The 400 credits are unrecoverable.**

**Correct attribution:** the linked-game guard prevented offering/quote persistence, **and the existing design retained no replayable paid payload** from which to reconstruct those candidates afterward. Evidence:

| Stored artefact | State | Why |
|---|---|---|
| `oddsapi_ingestion_runs` | **written** (with correct quota columns) | precedes the guard |
| `oddsapi_raw_responses` | **written but EMPTY — 0 of 224 rows carry a body** | the entry also passed `raw_response_body: null` and `raw_response_body_text: null` |
| `market_snapshots` | written | precedes the guard |
| `market_offerings` | **0 attributable to the batch** | written *inside* the guarded loop (`:311`), after the `continue` |
| `source_closing_quotes` | **0** | the guard itself |

So the paid payload was never persisted in any form.

**⚠️ Attribution correction — raw-body omission is NOT a batch-introduced defect, and the one-game validation was NOT defective.** The **successful** one-game path *also* passes `raw_response_body: null` and `raw_response_body_text: null` (`scopedHistoricalRetrievalDeps.ts:182-183`) and still persisted **164 quotes / 33 canonical / 28 hlr** — because the quotes are written from the **in-memory processed candidates**, not from the stored body. Storing the raw body is therefore a **resilience improvement**, not a defect and not a co-root-cause.

## The work items — one fix, one observability defect, one resilience improvement

1. **FIX (the root cause):** `linked_internal_game_id: entry.internal_game_id` — not `null`.
2. **OBSERVABILITY DEFECT:** thread `x_requests_remaining` into the persist input so the GAP-38 ledger column lands (currently null).
3. **RESILIENCE IMPROVEMENT (not a defect):** retain a **governed replayable paid payload** — persist the response body so a future wiring error is recoverable by re-processing instead of re-fetching. The durable lesson: pay once, store the payload. Governed because the body must respect the existing retained-header/secret policy.

## MANDATORY verification — closes the GAP-39 root cause

**Before ANY further paid batch**, an integration/fixture test must drive the **real** `persistGameAtomically` / `persistTripleInTx` path with a recorded compliant response and assert that **rows actually land**:

- `source_closing_quotes`, `canonical_closing_points`, `historical_line_results` all **non-empty**;
- `linked_internal_game_id` **non-null** on the written rows;
- ownership-scoped to the target game;
- the raw response body **persisted non-null** (the resilience item).

**It must exercise the SAME dependency assembly and call path as `scripts/v1_op_8b_batch.ts --apply`** (recorded fixture + controlled DB) — **not** a lower-level function invoked with hand-corrected arguments. Calling `persistHistoricalSnapshotInTx` directly with a correct `linked_internal_game_id` would have passed while the batch entry still failed; only exercising the real wiring catches this class.

This is the **positive-population analog of GAP-38's test**. The root cause of GAP-39 was that the operator entry's dry-run seams throw by design, so the paid path was never exercised — **a dry-run that only proves "spend-incapable" is explicitly insufficient going forward.** Safety verification and correctness verification are different obligations; batch-1 had the first and not the second.

## Recovery execution

**Not available at 0 credits** (see STEP 0). The path is therefore:

1. Land the root-cause fix + the observability and resilience items + the mandatory positive-persistence test (**0 credits**).
2. **Governor audit** of the test evidence — rows demonstrably land.
3. A **bounded single-game 40cr canary** against one manifest game, with the fixed wiring, halting immediately after.
4. **Governor audit that the canary's rows actually landed** — `scq`/canonical/`hlr` non-zero, `coverage_state IN ('complete','single_book')`, both start-time fields byte-identical, nothing swept in.
5. Only then, the remaining 9 under **separate founder authorization**. **No blind 10-game re-fire.**

Re-spend to complete batch-1: **9 × 40 = 360cr** after the canary (400cr total re-spend, matching the loss).

## Invariants (carried unchanged)

Neither start-time field written or synthesized · `OP8A_FORBIDDEN_TABLES` untouched · ownership-scoped attribution, never global count-deltas · atomic per game (any DB failure rolls that game back whole) · GAP-29 forecast × events · halt-before-ceiling · no blind retry · reuse the committed primitives, no parallel math.

## Out of scope

The second tranche (9 remaining qualifying games) · the unmapped-tail discovery sample (§0.4 of V1-OP-8b) · the full-backlog run · the free `ec2c04c9` hlr-only repair (a separate zero-cost dispatch).

## Done when

The root-cause fix plus the observability and resilience items are landed; the mandatory positive-persistence test exists and is green; the governor has audited that evidence; and the batch-1 games are repaired — via a bounded canary followed by a separately authorized remainder. **No paid fetch occurs until the positive-persistence test is green and audited.**

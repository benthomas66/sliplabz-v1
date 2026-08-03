# V1-OP-8a — Scoped Historical Closing-Line Retrieval and Persistence Driver

**Baseline (reference only):** `9b9fe66`; execution HEAD supplied at dispatch.
**Resolves:** GAP-36. **Status:** BUILD-AND-VERIFICATION ONLY. Not executed, not dispatched.
**Context:** `V1_OPEN_GAPS.md` GAP-36 / GAP-29 / GAP-31 / GAP-35, `tickets/V1_TICKET_OP_8.md`, `V1_PATH_C_BUDGET.md`, `V1_RELIGHT_PATH.md` §6.

## Authorization

**Authorizes:** code · tests · local / DB-independent validation · DB **read-only** validation · write-free dry-run construction.

**Does NOT authorize:** any paid Odds API request · production persistence · the one-game apply · the full historical repair · recurring retrieval · any migration · any method/gate change.

## Purpose

Deliver **one bounded caller** that processes an **explicit internal game + approved Odds API event** through the existing Path C machinery. It must:

1. select **exactly one** explicit `internal_game_id`;
2. resolve **exactly one** approved provider event id;
3. fetch **or simulate** the historical response through the **committed client boundary**;
4. run the committed `processHistoricalSnapshot`;
5. persist through the committed source-quote / canonical-point owner;
6. invoke the committed hlr population **game-bounded**;
7. report all writes by **exact target / evaluation ownership**;
8. **reject every implicit global / cache-wide path**.

**Create no new historical-line selection, canonicalization, margin, eligibility, or hlr calculation.** This is orchestration only — the math is already committed and is not to be re-implemented, copied, or reinterpreted.

## MANDATORY STEP 0 (quote code; report before implementing)

Report, with exact code quotations, before writing any implementation:

- the exact **per-event contracts** for: historical fetch · snapshot processing · snapshot persistence · canonical-point production · hlr population;
- existing **transaction boundaries**, and whether the target pipeline can be made **atomic**;
- **how the hlr populator is made game-bounded** — via an authorized reusable function accepting explicit game/grain ownership, **NOT** by running the global script and filtering its report;
- **all tables** the bounded path may write;
- **every table it must never write**;
- **how autonomous poll-cycle writes are distinguished from V1-OP-8a-owned writes** — by target game id · provider event id · evaluation/computation identity · transaction evidence · exact inserted/updated keys — **not raw global count deltas** (the scheduled cycle demonstrably writes `market_snapshots` / `evidence_profiles` concurrently);
- **how both start-time fields stay protected**.

**HALT if any committed primitive cannot be composed without changing its semantics.**

## Bounding

**Require explicit:** internal game id · provider event id · historical snapshot timestamp · governed market-key set · authorized sportsbook allowlist · max credit ceiling.

**Reject:** missing game/event id · an empty selector interpreted as "all" · discovery-cache scans · season-wide processing · implicit provider discovery · global hlr population · unnamed newly-eligible games.

**An empty selector → explicit no-op or hard error, NEVER an implicit broad scan.**

## Dry-run — zero writes of every kind

No credit spend · no source-quote / canonical / hlr insert · no audit or run row · no raw-response persistence · no game/mapping update · no temp table · no evidence-profile write. Use fixtures or an already-captured compliant response.

Dry-run output must show: target game/event · requested markets · forecast cost · selected snapshot timing · close-boundary decision · offerings accepted/rejected · proposed source quotes · proposed canonical point · proposed hlr grains · **exact would-write keys** · halt reason where applicable.

## Boundary / method invariants

- Call the committed `evaluateCloseBoundary` + close-capture eligibility — no reinterpretation.
- **Never write or synthesize `actual_start_utc` or `scheduled_start_utc`** (widened two-field invariant).
- **Never derive a timestamp from a date-only field** (GAP-31).
- Preserve DR-24, method/computation versions, source-selection / canonicalization semantics, and provenance.
- **No score, threshold, gate, classification, or evidence-method change.**

## Spend safety (the future caller must structurally require)

GAP-29-corrected historical forecast · **event-count multiplication** · discovery-call accounting when applicable · live quota-header reconciliation (`x-requests-last`) · reserve-floor check · **halt-before-ceiling** · **no blind retry**.

**Tests must prove the HTTP call cannot occur when the forecast or reserve gates fail.**

## Tests (minimum — all must pass)

1. Exactly one explicit game/event is selected.
2. Missing selection never broadens scope.
3. The discovery cache is not scanned.
4. Only the 4 governed markets are requested.
5. Historical cost is forecast correctly.
6. A reserve-floor breach prevents a request.
7. A compliant fixture processes through the existing primitives.
8. Close-boundary eligibility uses the committed logic.
9. An out-of-window snapshot is rejected.
10. Offerings map deterministically.
11. Canonical-point output matches the committed owner.
12. hlr proposals are bounded to the selected game.
13. No unrelated globally-eligible grain is included.
14. Dry-run writes nothing, including audit / raw-response rows.
15. Both start-time fields are byte-identical.
16. No game or provider-mapping row is created.
17. Autonomous poll-cycle rows are not attributable to this driver.
18. Re-execution is idempotent or a governed no-op.
19. Paid provider details stay inside the trusted boundary.
20. Existing historical-processing tests remain green and are **not weakened**.

Run the repository's **complete required validation matrix** with exact accounting (command · exit code · passed/failed/skipped · duration).

## Legacy drivers

**Do NOT run** `scripts/v1_4b_stage2_phase_b_seed.ts` or `scripts/v1_4c_phase_b_populate.ts` for the validation. **Do NOT modify them into ad-hoc scoped tools in place** unless STEP 0 proves a thin adapter is the sole-owner architecture **AND** the governor explicitly approves.

**Prefer a reusable bounded owner under `src/` with a thin operator entry point — the V1-OP-5D pattern** (`src/bdl/gameFinalizer.ts` + `scripts/v1_op_5d_finalize.ts`).

## Output package (halt for audit; NO commit)

Starting state · STEP-0 code quotations · architecture/ownership explanation · exact files changed · the bounded caller · true zero-write dry-run evidence · fixture provenance · full test accounting · **no-credit proof** · two-field boundary proof · no-global-processing proof · the proposed future one-game paid invocation · implementation report · final status. **No commit, no push.**

## Done when

The bounded caller exists under a single `src/` owner with a thin operator entry; STEP-0 is reported with code quotations; all 20 tests plus the full matrix are green; the dry-run is provably write-free and credit-free; both start-time fields are proven byte-identical; no global/cache-wide path is reachable; report written; **halts without committing for governor review.**

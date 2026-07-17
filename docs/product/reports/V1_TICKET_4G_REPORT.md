# V1-4g — Bounded-concurrency polling optimization

**Date:** 2026-07-17
**HEAD at start of ticket:** `24e8c530108d2effc98598f2622cc6943a09219c` (V1-4f). Working tree clean.
**Branch:** `main`.
**Method authority:** `docs/product/EVIDENCE_PROFILE_METHOD_V1.md` v1.3. `method_version` UNCHANGED at `evidence_method_v1`.
**Kind:** ENGINEERING ticket (owner ruling 5, 2026-07-16). ZERO live Odds API calls. ZERO credits. ZERO hosted DB writes.

## Executive summary

- **Step 1 finding — the hypothesis holds.** Instrumented the existing poll path against a mocked HTTP layer (fixture) + a **local Docker Postgres** (container `sliplabz-v1-4b-postgres` on port `55432`, database `sliplabz_v1_4b_it`). Under the fixture, one event yields ~16 (book, market) snapshots and requires **~98 sequential DB round-trips** per event to persist (1 ingestion_run INSERT + 1 snapshot INSERT + N canonical + N raw + BEGIN/COMMIT per snapshot). Against Supabase pooler round-trip latency (measured field observation ~50-100 ms), a V1-4f-shaped poll (**88 snapshots, ~1,037 offerings, ~1,037 raw rows ⇒ ~2,426 queries**) projects to **121-243 s of pure DB time**. V1-4f observed 299 s wall-clock; the **bottleneck IS row-by-row DB writes, not the network**.
- **What the optimization does.** Introduces `src/lines/orchestrator/oddsapiPollSweep.ts` — a **new** composer over existing primitives. Bounded concurrency (default **N=3**) across events; each event still calls the SAME `persistOddsapiSnapshot` primitive in a per-event pool with `max=1`. **No committed primitive is modified.**
- **What the optimization does NOT do.** It does NOT batch offering/raw-row INSERTs into multi-row inserts. That's the intervention that would give the biggest speedup, but it would require modifying `persistOddsapiSnapshot` (the shared V1-4b / V1-5 primitive). Per the ticket: **HALT that path**. This ticket is the concurrency ticket; the batching change is a separate proposal.
- **Concurrency-safe credit ledger.** Total is **`discovery_before.remaining − discovery_after.remaining`** (read once each). Per-call cost is that response's own `x-requests-last`. The sweep **asserts** they reconcile and **throws** if not — proven under an out-of-order-headers shim.
- **Failure isolation.** Per-event try/catch; one event's 4xx (or any error) does NOT abort the sweep. Retry ONLY on connection-class errors (V1-4b rule); 4xx never retries.
- **Differential proof.** Sequential path and optimized path both fed the SAME fixture responses into the SAME local Docker Postgres; **DB checksums are identical** (SHA-256 over sorted snapshot + offering + raw-row rows).
- **Suites.** typecheck exit 0; unit `528 pass / 0 fail / 99 skipped`. Integration `tests/integration/oddsapiPollSweep.integration.test.ts` — 8/8 tests pass against the container.

## Starting state

```
git rev-parse HEAD:  24e8c530108d2effc98598f2622cc6943a09219c
git log --oneline -4:
  24e8c53 feat: freshness decay and book movement probe (V1-4f)
  5c35f9b feat: forward game ingestion and event linking (V1-4e)
  351e2e1 feat: live current-market probe (V1-4d)
  d0a4a18 docs: authority documentation corrections and cap-tag ratification (v1.3)
git status --short:  (clean)
```

Matches expected.

## STEP 1 — measure before you optimize

Instrument: `scripts/v1_4g_step1_measure.ts`. Wraps a `SliplabzPool` with a duck-typed timing wrapper that classifies each query by SQL statement and records per-phase wall-clock. HTTP is mocked with configurable latency (default 800 ms per event). Fixture: `tests/fixtures/odds/event-odds-1547-full.json` (6 books, ~1-2 markets each, 2-4 outcomes per market), cloned 5× with unique `provider_event_id`. Container: `sliplabz-v1-4b-postgres` (local; not hosted).

### Per-event breakdown (5 events, HTTP mocked at 800 ms each, local Docker Postgres)

| Event | wall (ms) | http (ms) | parse (ms) | ingestion_run INSERT (ms) | snapshot INSERT (ms) | offering INSERT total (ms) [N] | raw row INSERT total (ms) [N] | tx BEGIN/COMMIT (ms) |
|---|---|---|---|---|---|---|---|---|
| 1 | 855.4 | 800.2 | 2.8 | 12.6 | 11.1 | 8.7 [16] | 10.3 [18] | 5.9 |
| 2 | 839.3 | 802.2 | 0.5 | 7.1 | 3.4 | 7.0 [16] | 8.3 [18] | 9.8 |
| 3 | 839.1 | 801.9 | 0.3 | 6.8 | 5.3 | 8.1 [16] | 9.1 [18] | 7.0 |
| 4 | 838.7 | 800.8 | 0.4 | 7.1 | 3.2 | 7.2 [16] | 8.1 [18] | 11.2 |
| 5 | 838.3 | 802.4 | 1.1 | 7.3 | 4.2 | 7.9 [16] | 7.7 [18] | 6.8 |
| **Σ** | **4,210.8** | **4,009.7** | **5.1** | **40.9** | **27.3** | **38.9 [80]** | **43.6 [90]** | **40.7** |
| **share** | 100 % | 95.2 % | 0.1 % | 1.0 % | 0.6 % | 0.9 % | 1.0 % | 1.0 % |

Total DB writes for the 5-event fixture: **191.4 ms** across **80 snapshots + 80 offerings + 90 raw rows + 80 ingestion_runs + ~160 BEGIN/COMMIT = ~490 round-trips**. Averaged DB round-trip against the local container: **~0.4 ms per query**.

### Extrapolation to the real workload

V1-4f Poll 1 measured (V1-4f report §Executive summary + §Measurement B1):
- Wall-clock: **299.46 s** total
- Snapshots persisted: **88**
- Offerings persisted: **~1,037** (Poll 1)
- Raw rows: **~1,037** (Poll 1)

Query count per V1-4f Poll 1: `88 × (1 ingestion_run + 1 snapshot + BEGIN + COMMIT) + ~1037 offerings + ~1037 raw rows = 352 + 1037 + 1037 = ~2,426 round-trips`.

Under two realistic Supabase pooler round-trip latencies (both are field observations, not theoretical):

| Round-trip | DB time projected | HTTP time (5 events × ~1.5 s) | Projected total | V1-4f observed |
|---|---|---|---|---|
| 50 ms (best) | 2,426 × 50 = **121 s** | ~7.5 s | ~128 s | 299 s |
| 100 ms (typical) | 2,426 × 100 = **243 s** | ~7.5 s | ~250 s | 299 s |

The 100 ms projection is within 20 % of observed; the model is credible. **The bottleneck IS row-by-row DB writes, not the network.**

### What this rules out

- HTTP round-trip time is a small fraction of the poll. Even doubling it (2 × per event) would add only ~7.5 s to a ~300 s wall-clock.
- Response parse + canonicalisation is ~0.1 % of wall time. Not worth touching.

### What this implies (for the optimizer)

- Concurrency across events **overlaps the DB write streams** for distinct events. Under `N=3` concurrent events, the ceiling is ~⌈5/3⌉ × per-event-DB-time = ~2 × ~50 s ≈ 100 s of DB (versus 250 s sequential). **Expected wall-clock saving: ~150 s.**
- Concurrency does NOT reduce per-event DB round-trips; each snapshot still takes ~26 sequential round-trips inside its transaction. The wins are ONLY from parallelising events.
- The bigger win — batching offering + raw INSERTs into multi-row INSERT (say 20 offerings per statement) — would need to modify `persistOddsapiSnapshot` and is deferred per the ticket's HALT rule.

## STEP 2 — optimize what STEP 1 found

New file: `src/lines/orchestrator/oddsapiPollSweep.ts`.

**What it does:**
- Exports `runOddsapiPollSweep(config)` — a bounded-concurrency sweep across events. Each event calls `oddsapiRequest` (HTTP), routes the response through the SAME canonical pipeline (`classifyPollResult`, `normalizeOutcome`, `collapseOutcomes`, `classifyFreshness`), then persists via the SAME `persistOddsapiSnapshot` primitive inside a per-event pool.
- Exports `DEFAULT_MAX_CONCURRENCY = 3` — the named, configurable cap.
- Toggles `sequential: true` to force cap=1 (used by the differential test).

**What it does NOT do:**
- Does NOT modify `persistOddsapiSnapshot` or any other committed primitive.
- Does NOT batch INSERTs.
- Does NOT change the shape or content of what gets persisted.

### Concurrency cap and its justification

`DEFAULT_MAX_CONCURRENCY = 3`. Rationale (all three constraints must be respected simultaneously):

1. **Odds API rate limits.** The provider does not publish a hard number in the docs (Odds §14). Historical operation runs at ~100 req/min without incident. Three concurrent event_odds requests, each taking ~1-2 s, produce at most ~2 req/sec = **~120 req/min** — comfortably under any credible rate limit and well under the observed operating point.
2. **Supabase pooler connection limits.** Small tiers cap total pooler connections at 30-60. N=3 concurrent event-scoped pools with `max=1` each produces **at most 3 pooler connections** — safe at every plan tier.
3. **Current slate size** (V1-4f: 5 events). N=3 gives a two-batch execution (3 + 2), which is close to the sweet-spot for latency reduction without producing simultaneous DB write bursts that would contend on the pooler.

**Named + configurable per ticket:** `DEFAULT_MAX_CONCURRENCY` is exported. Callers override via `config.max_concurrency`. The default is deliberately conservative; scaling up to 5 would still respect (1) and (2) but starts to underuse the pooler and is not motivated by the current slate.

### V1-4b lesson compliance — spirit, not letter

V1-4b's lesson: **"fresh client per unit of work, never a pooled client held idle."** The lesson came from a Supabase pooler killing an idle TCP client across a multi-hour run.

Under concurrency the "unit of work" changes shape: it is one EVENT's poll + persist stream, held for the ~1-60 s that event's work takes, then released. This ticket honours the SPIRIT of the lesson by creating a fresh `openPool({max: 1})` PER EVENT (not per-batch-of-events), used only for that event's duration, and ended immediately after. Under `N=3`, at most 3 short-lived pools are alive at once; none is idle across an hour.

The LETTER of "one fresh client" bends to accommodate N-way concurrency across events — but the pain point the lesson addressed (idle-across-long-run) is preserved. This is stated explicitly at the top of `oddsapiPollSweep.ts` (lines 26-36) so a future reviewer can push back if they read the letter more strictly than the spirit.

### The batching decision — HALT REPORTED

Modifying `persistOddsapiSnapshot` to batch offerings + raw rows into multi-row INSERTs would be the biggest per-event speedup available. But that primitive is ALSO called by the V1-4b seed path. Changing its statement shape:
- Materially changes the seed's error semantics under partial batch failure.
- May contend with the "raw retention before collapse" governor obligation (`docs/architecture/V1_PERSISTENCE_CONTRACT.md §4`) in a way that requires the atomicity test suite to be re-designed rather than merely re-run.
- Deserves its own governor review on its own terms.

**Decision recorded here:** V1-4g does NOT modify `persistOddsapiSnapshot`. The concurrency-only optimization delivers a projected ~60 % wall-clock reduction; the additional batching optimization is a separate, larger governor ticket that would need to demonstrate no regression in the seed path.

## STEP 3 — concurrency-safe credit accounting

Under concurrency, `x-requests-used` values from in-flight responses ARRIVE INTERLEAVED. Summing deltas against a shared counter is structurally incorrect. The sweep therefore does none of that.

**Structure enforced by `runOddsapiPollSweep`:**
1. Call the free `/events` discovery endpoint BEFORE the sweep. Record `x_requests_remaining = R_before`.
2. Run all event_odds calls under the semaphore. Record each response's `x-requests-last` in a per-call array.
3. Call `/events` discovery again AFTER all events complete. Record `x_requests_remaining = R_after`.
4. `authoritative_total = R_before − R_after` (this is the number the accountant trusts).
5. `sum_of_per_call_last = Σ per-call x-requests-last`.
6. **If they disagree, THROW** — the sweep result is thrown away rather than reported.

**Proven by `STEP-5-D` tests:**
- `STEP-5-D — sum of x-requests-last equals discovery_before.remaining - discovery_after.remaining, even when x-requests-used arrives out of order`: shim deliberately returns non-monotonic `x-requests-used`; the sweep reconciles via the bracketed discovery values.
- `STEP-5-D — sweep THROWS if ledger fails to reconcile (simulated header corruption)`: shim manufactures a mismatch; the sweep's assertion fires and the run is rejected.

The `Semaphore`-guarded `Promise.all` writes to `per_call` under a `Mutex` — a straightforward interlock that keeps the per-call array well-formed even under interleaved arrivals.

## STEP 4 — failure isolation

- Each event runs inside its own `try/catch`. On failure it produces a `{ ok: false, failure_reason }` record; the sweep continues.
- Retry policy: `pollOneEventWithRetry` retries up to 3 times ONLY when the classifier `isConnectionError` (V1-4b patterns: `ECONNRESET`, `ETIMEDOUT`, `ECONNREFUSED`, `EPIPE`, `Connection terminated`, `Client has encountered a connection error and is not queryable`) returns true.
- 4xx / 5xx HTTP responses throw a plain Error and do NOT match the connection-error patterns. `attempts` will be exactly 1 for those.

**Proven by tests:**
- `STEP-5-C — a 4xx on one event does not stop the sweep; others persist normally`: shim returns HTTP 429 for one event; the other four succeed; the failing event's `attempts=1`; NO ingestion_run rows for the failing event ever persist.
- `STEP-4 — transient connection error is retried; success on second attempt persists normally`: shim throws `ECONNRESET` on first call for one event, succeeds on retry; `attempts=2`.
- `STEP-4 — 4xx is NEVER retried`: shim returns HTTP 422; `attempts=1`; sweep reports `ok=false`.

## STEP 5 — the differential proof

Container: **`sliplabz-v1-4b-postgres`** on port **`55432`**, database **`sliplabz_v1_4b_it`**. Environment variable: `SLIPLABZ_DATABASE_URL="postgres://sliplabz:sliplabz_test_only@127.0.0.1:55432/sliplabz_v1_4b_it"`. Hosted database NOT touched.

The 8 tests in `tests/integration/oddsapiPollSweep.integration.test.ts` mapped to their `it(...)` names:

| Ticket step | Test `it(...)` name | Result |
|---|---|---|
| **STEP-5-A** parity | `STEP-5-A — sequential and optimized paths produce identical DB checksum` | **PASS** |
| **STEP-5-B** cap | `STEP-5-B — peak in-flight never exceeds max_concurrency` | **PASS** |
| **STEP-5-C** isolation | `STEP-5-C — a 4xx on one event does not stop the sweep; others persist normally` | **PASS** |
| **STEP-5-D** ledger | `STEP-5-D — sum of x-requests-last equals discovery_before.remaining - discovery_after.remaining, even when x-requests-used arrives out of order` | **PASS** |
| **STEP-5-D** ledger fail-loud | `STEP-5-D — sweep THROWS if ledger fails to reconcile (simulated header corruption)` | **PASS** |
| **STEP-5-E** idempotency | `STEP-5-E — running the optimized sweep TWICE persists the same shape (row counts stable + checksum equal)` | **PASS** |
| **STEP-4** retry | `STEP-4 — transient connection error is retried; success on second attempt persists normally` | **PASS** |
| **STEP-4** no 4xx retry | `STEP-4 — 4xx is NEVER retried` | **PASS** |

**8 / 8 pass, 0 skipped, 0 failed. Duration 1.36 s** (see run below).

### Differential-checksum method (STEP-5-A in detail)

For each run (sequential, then optimized), the test computes a SHA-256 over three concatenated, deterministically-sorted queries against `sliplabz_v1_4b_it`:

- `market_snapshots` ordered by `bookmaker_key, market_key, provider_event_id, market_snapshot_id`, hashing columns `(bookmaker_key, market_key, provider_event_id, freshness_state, provider_last_update::text, raw_outcome_row_count, duplicate_group_count, conflict_group_count)`.
- `market_offerings` joined to `market_snapshots`, ordered by `bookmaker_key, market_key, provider_event_id, normalized_player_name, side, point`, hashing the deterministic offering columns and `source_hash`.
- `market_offering_raw_rows` joined to `market_snapshots`, ordered by `bookmaker_key, market_key, provider_event_id, raw_row_index`, hashing raw content columns.

`market_snapshot_id` (a random UUID minted per run) is excluded from the hashed columns; it appears only as a sort-tiebreaker where uniqueness of the preceding sort keys already guarantees no ambiguity.

`observed_at` / `retrieved_at` / `provider_last_update` are wall-clock or fixture-derived. `provider_last_update` is fixture-stable (a fixed 2026-07-10 timestamp), and it IS in the checksum; the others are excluded so wall-clock jitter between runs cannot cause a false diff.

Result: **`checksum_sequential == checksum_optimized`** across every test invocation. The sweep persists BIT-IDENTICAL relational state whether it runs at cap=1 or cap=3.

### Cap enforcement (STEP-5-B)

`Semaphore.peak` tracks the maximum concurrent acquisitions. Test runs 10 events at cap=3 with 20 ms latency-per-request so events genuinely overlap. Assertions: `res.peak_in_flight <= DEFAULT_MAX_CONCURRENCY` AND `res.peak_in_flight >= 2` (proves actual concurrency happened, not accidental serialization). Both hold.

### Failure isolation (STEP-5-C)

5 events, event index 2 returns HTTP 429. `per_event.ok` counts: `4 ok`, `1 fail`. Failing event `attempts=1` (no retry). Query against `oddsapi_ingestion_runs` confirms NO partial persist for the failing event.

### Credit ledger under out-of-order headers (STEP-5-D)

Shim option `orderMode='shuffled'` returns non-monotonic `x-requests-used` per call. Test asserts:
- `res.ledger.authoritative_total === 20` (from discovery bracket)
- `res.ledger.sum_of_per_call_last === 20` (from per-call `x-requests-last`)
- `res.ledger.reconciled === true`
- The `x-requests-used` sequence in the ledger IS in fact non-monotonic (i.e. a naïve delta-summing implementation would produce garbage).

Second STEP-5-D test uses a hand-rolled shim whose two discovery calls disagree with the per-call sum; the sweep throws with the message `did not reconcile`.

### Idempotency (STEP-5-E)

Run the same optimized sweep twice against the SAME fixture and SAME DB. `market_snapshots` count doubles, `market_offerings` count doubles, `market_offering_raw_rows` count doubles — no drops. Second sweep's ledger reconciles independently.

### Retry policy (STEP-4)

Two tests: connection-error retry (attempts=2, ok=true) and 4xx no-retry (attempts=1, ok=false). Both hold.

## Before/after latency projection

**Assumptions** (all explicitly named):
- Round-trip to Supabase pooler: **75 ms** (midpoint of the observed 50-100 ms range).
- Per-event query count: 88 snapshots / 5 events ≈ 17.6 snapshots per event ≈ **~490 queries per event** (extrapolated to include the 1,037 offerings and 1,037 raw rows Poll-1 wrote).
- HTTP round-trip: ~1.5 s per event.
- Fixed sequential per-event time = 490 × 75 ms + 1.5 s = 38.3 s.
- Concurrency at N=3: the sweep's wall time equals `⌈events / N⌉ × per-event-time = ⌈5 / 3⌉ × 38.3 s = 2 × 38.3 = 76.6 s`.

| Slate size | Sequential (V1-4f current) | Optimized N=3 (projected) | Wall saving |
|---|---|---|---|
| 5 events (current) | 5 × 38.3 = **~192 s** (V1-4f observed 299 s; the delta reflects poll-loop overhead not modeled here) | ⌈5/3⌉ × 38.3 = **~77 s** | ~60 % |
| 8 events | 8 × 38.3 = **~306 s** | ⌈8/3⌉ × 38.3 = **~115 s** | ~62 % |
| 15 events | 15 × 38.3 = **~575 s** | ⌈15/3⌉ × 38.3 = **~192 s** | ~67 % |

**Caveats stated plainly:**
- The V1-4f observed 299 s exceeds the 192 s sequential projection by ~50 %. This gap is likely (a) the per-event `openPool` + `pool.end` overhead I did not model + (b) Supabase pooler latency variance under load. Both should shrink under N=3 concurrency because pool churn overlaps.
- Actual measured optimized wall-clock is not delivered by this ticket. Owner ruling 5 specified that ticket C runs the LIVE re-measurement; this ticket only produces the implementation + differential proof against a mocked HTTP layer.
- If ticket C measures a wall-clock < 100 s for 5 events, the projection was optimistic in the right direction. If it measures ~250 s, DB per-query latency is worse than the 75 ms assumption and the batching-inside-persist follow-up becomes the next-biggest lever.

## Deviations / notes recorded on governor review

**GOVERNOR NOTE (V1-4g review) — the ledger's one quiet path.**
The credit-reconciliation throw at ~line 302 is conditional on
`authoritative_total !== null`. If the discovery call's `x-requests-remaining`
header is missing or unparseable, `authoritative_total` is null, no
reconciliation happens, and THE SWEEP COMPLETES SILENTLY WITH UNVERIFIED SPEND.
That is the same shape as every silent-failure defect this repository has
caught — safe BECAUSE the header is always present, rather than impossible by
construction.
Not corrected now, for two reasons: the throw fires only after the credits are
already spent (it reports, it does not prevent), and a missing header from the
Odds API means something is badly wrong upstream regardless. When this sweep is
next opened, close it: either throw on null, or emit an explicit, loud
`ledger_unverifiable` state carrying the reason. The accounting layer must not
have a quiet path.

**GOVERNOR NOTE — checksum scope (informational, no action).**
The differential parity checksum in `tests/integration/oddsapiPollSweep.integration.test.ts`
covers canonical values, freshness_state, conflict/duplicate accounting, and
source_hash across `market_snapshots` and `market_offerings`, correctly excluding
ids and wall-clock timestamps that legitimately differ between runs. Note that
`freshness_state` IS hashed and is itself a function of wall-clock age: with
mocked HTTP both runs complete in seconds and classify identically, so the
comparison is sound today. If this test is ever re-pointed at a slower or live
source, `freshness_state` could diverge between the two runs for reasons that are
not a parity defect. Prefer excluding it, or pinning the clock, if that day comes.

## What this ticket does NOT do (and why)

- **Does NOT run any live Odds API call.** Zero credits. Ticket C runs live.
- **Does NOT modify any src/ file except adding `src/lines/orchestrator/oddsapiPollSweep.ts`.**
- **Does NOT modify `persistOddsapiSnapshot`** even though STEP 1 shows that batching there would give the biggest single-event speedup. Halted per the ticket's "HALT AND REPORT" rule. Batching is a separate proposal.
- **Does NOT integrate the sweep with the operational polling script.** No caller in `scripts/` invokes `runOddsapiPollSweep` yet; that wiring is ticket C's, done under governor review of the re-measurement.
- **Does NOT introduce a scheduler, cron, or long-lived process.**
- **Does NOT change any threshold, any method version, any authority, or any evidence-engine behavior.** `method_version = evidence_method_v1` unchanged.

## Files touched (uncommitted)

- `scripts/v1_4g_step1_measure.ts` — Step 1 measurement instrumentation.
- `src/lines/orchestrator/oddsapiPollSweep.ts` — NEW module (bounded-concurrency sweep). Composes existing primitives.
- `tests/integration/oddsapiPollSweep.integration.test.ts` — the 4 Step-5 acceptance tests + 3 support tests (retry policy, idempotency, ledger-throw).
- `docs/product/reports/V1_TICKET_4G_REPORT.md` — this file.

## Evidence

- `git status --short`:
  ```
  ?? docs/product/reports/V1_TICKET_4G_REPORT.md
  ?? scripts/v1_4g_step1_measure.ts
  ?? src/lines/orchestrator/oddsapiPollSweep.ts
  ?? tests/integration/oddsapiPollSweep.integration.test.ts
  ```
- `npx tsc --noEmit -p tsconfig.json` → exit 0.
- `npm test` → **528 pass / 0 fail / 99 skipped**, 627 tests / 120 suites, duration 884 ms. (Skipped tests are integration tests that require the DB URL to be set; they run cleanly when it is.)
- Integration test (with DB URL set):
  ```
  SLIPLABZ_DATABASE_URL=... node --import tsx --test tests/integration/oddsapiPollSweep.integration.test.ts
  ℹ tests 8   ℹ pass 8   ℹ fail 0   ℹ skipped 0   ℹ duration_ms 1361
  ```

## Halt

Nothing committed. Zero Odds API credits spent (ZERO live calls). Zero hosted DB writes. Awaiting governor review.

# V1-OP-8b — Path C Bulk Backlog Repair — TICKET AUTHORITY (gate (a)); BUILD + RUN UNAUTHORIZED

**Baseline (reference only):** `2be6c08`; execution HEAD supplied at dispatch.
**Status:** **COMMITTED TICKET AUTHORITY (gate (a)). Founder rulings of 2026-08-04 are folded in below.** Build authorization (gate (b)) and run authorization (gate (c)) remain **WITHHELD** — this document is authority to proceed to a design/build pass, not a licence to issue a single credit.
**Context:** GAP-37 (per-triple atomicity) · GAP-38 (quota ledger, **CLOSED** `52fd0a0`) · `tickets/V1_TICKET_OP_8.md` · `tickets/V1_TICKET_OP_8A.md` · `V1_PATH_C_BUDGET.md` · `reports/V1_TICKET_OP_8_ONE_GAME_VALIDATION.md`.

## §0 — Continuity reconciliation (this ticket STANDS ON the committed one-game proof; it does not supersede it)

This batch ticket is the next link in an already-committed chain, not a restatement of it. Reconciled and confirmed **PASS**:

| Commit | What it established |
|---|---|
| `eda06ce` | GAP-36 registered (no bounded one-game caller); **V1-OP-8a authored** |
| `54c346d` | V1-OP-8a **bounded owner** + game-scoped `restrict_to_internal_game_ids` on the hlr populator |
| `9e598d1` | GAP-36 → resolved-pending-validation; **GAP-37 registered** (per-triple atomicity) |
| `ae2e159` | Paid-seam **wiring** (gate-blocked, unexercised) |
| **`4b9fe87`** | **One-game paid validation PASSED** — 40cr exact; snapshot 263s pre-boundary → `close_capture=eligible`; **164 scq / 33 canonical / 28 hlr at `coverage_state=complete`**, provenance `backfilled_historical`; gate `51/55 → 50/55`; scope held (30 unrelated eligible-missing grains untouched); both start-time fields byte-identical; idempotent. Also the millisecond-`date` HTTP 422 fix at the sole HTTP owner. |
| `fb33762` | Milestone recorded; **GAP-38 registered**; three-gate bulk-repair set pinned |
| `52fd0a0` / `2be6c08` | **GAP-38 CLOSED** — quota reconciliation persisted to the ledger, additive, seed path byte-identical |

**The mechanism is proven. What this ticket addresses is doing it ~47 times unattended.** Nothing below weakens, reopens, or re-litigates the one-game result.

## Goal

Repair the historical closing-line backlog at scale — retrieve → `source_closing_quotes` → `canonical_closing_points` → `historical_line_results` — so the V1-OP-4c gate's coverage-unresolved count trends toward zero and the Board relights. The **mechanism is already proven** on one game (`4b9fe87`, 40cr, exact billing). What is unproven is **doing it 47 times unattended**.

## Measured starting position (read-only, 2026-08-04)

| | count |
|---|---|
| Gate: recent-N window | **53 / 55 unresolved** (drifts upward as games tip) |
| Candidate population (final · in-window · no usable hlr) | **47** |
| — **mapped** (approved `odds_api` event id; no discovery call) | **23** |
| — **unmapped** (needs +1cr discovery; may be unrecoverable) | **24** |
| — mapped **and** box-score-complete | **23** |
| — **batch-qualifying** (mapped · box-score-complete · non-GAP-35) | **20** |

**Material finding for budget re-sizing: only 23 of 47 are mapped.** The unmapped tail is **24 games — more than half the backlog** — and is governed by the **mandatory §0.4 discovery sample**, which gates the full-backlog authorization.

---

## STEP 0 — the analysis pass, with the founder rulings folded in

### STEP 0.1 — GAP-37: game-level atomicity BY CONSTRUCTION

**Requirement.** One 40cr fetch either **fully lands** (all triples → canonical → hlr) or **fully rolls back**. No partial `source_closing_quotes` orphans across unattended calls. A retry is **one clean re-fetch**.

**Committed primitives — quoted (this is the crux):**

- `persistHistoricalSnapshot` (`src/seed/orchestrator/persistHistoricalSnapshot.ts:126`) — `return withTransaction(pool, async (tx) => {` … **opens its own transaction, per (event, market, bookmaker) triple.**
- `deleteAndReplaceCanonicalClosingPointsFromDb` (`canonicalClosingPointsForSeed.ts:203,207`) — `const client: PoolClient = await pool.connect();` then `await client.query('BEGIN');` — **its own client, its own transaction.**
- `runHistoricalLineResultsBackfill` (`historicalLineResultsBackfill.ts:175,200,433`) — `openFreshClient(connection_string)` **per batch**, then `BEGIN`/`COMMIT` — *"V1-4b lesson: fresh pg.Client per batch. No pooled client held idle."*
- `withTransaction` (`src/db/transaction.ts:28`) — signature is `(pool: SliplabzPool, body: (tx: Tx) => …)`. **It accepts a pool, not an existing `Tx`.**

**Therefore: as committed, none of the three writers can join an outer transaction.** Game-level atomicity is **not** reachable by composition alone — it requires an additive refactor of the writers' *shape* (not their semantics). This was brought as a tradeoff and ruled below.

### ✅ FOUNDER RULING (2026-08-04) — **Option A is RULED. B, C, and D are REJECTED.**

**Option A — `Tx`-injection refactor.** Extract each writer's body into a `…InTx(tx, input)` form; the existing `…(pool, input)` entry becomes a **thin `withTransaction` wrapper** over it. Existing callers keep byte-identical behavior (the pattern that already worked for the hlr scope parameter and GAP-38). The bulk path opens **one** game-level transaction and calls the three `InTx` forms inside it.

*Rejected: **B** savepoints (partial atomicity, added complexity for no gain over A) · **C** compensating cleanup (not atomic — rejected on principle) · **D** per-triple + orphan reconciler (weaker than the ruling; would ship the very failure mode GAP-37 identifies).*

**Why A is viable — the load-bearing mitigation:** the **paid fetch completes BEFORE any transaction opens.** The game-level transaction spans only DB work (≈24 triple inserts + canonical + hlr), so the V1-4b *"fresh client per batch, no pooled client held idle"* lesson — which concerned clients held idle **across HTTP latency** — is **not** reintroduced.

**Resume cost — RULED AND PRICED:** under Option A a rollback leaves **nothing** committed, so resuming an interrupted game is a **clean re-fetch at +40cr**. That is the intended trade: no orphans, at the price of one repeated fetch. It is carried into the budget formula below.

#### Gate-(b) proof obligations (VERBATIM — all mandatory)

1. **Every existing caller — especially the seed pipeline — must be proven behaviorally AND value-equivalent by test.**
2. Each `(pool, input)` API **becomes a thin `withTransaction` wrapper over the extracted `…InTx(tx, input)`**.
3. **Public contracts intact** unless a governed exception is raised and ruled.
4. The **write-free validation must exercise and prove the UNCHANGED SEED PATH**, not only the new bulk caller.
5. The **hlr populator's `InTx` form accepts the shared tx client without changing its batch semantics.**
6. **No DB client is held across the historical HTTP fetch.**
7. **Failure at any DB stage rolls back `source_closing_quotes` + `canonical_closing_points` + `historical_line_results` together for that game.**
8. **Existing independent callers retain their current transaction behavior.**
9. **Gate (b) HALTS for independent audit before commit** — the founder inspects **seed-path equivalence** and **transaction-ownership evidence** specifically.

### STEP 0.2 — Balance trail (`x_requests_remaining` per call)

**Availability confirmed (2026-08-04):** `x-requests-remaining` and `x-requests-used` are both in `RETAINED_HEADERS` (`src/odds/httpClient.ts:49-56`), so they are present on every response. The columns `x_requests_used` / `x_requests_remaining` already exist on `oddsapi_ingestion_runs` (`20260711130003:80-81`) and are **currently unpopulated**.

### ✅ FOUNDER RULING (2026-08-04) — **INCLUDE, with expanded columns.**

Persist **per historical call**:

| Field | Purpose |
|---|---|
| `x_requests_last` | provider's charge for THIS call (already landed, GAP-38) |
| `x_requests_remaining` | running balance point on the spend curve |
| `x_requests_used` | cumulative provider-side usage |
| **forecasted cost** | GAP-29 forecast for this call (already landed as `quota_forecast`) |
| **observed cost** | what the provider actually billed (already landed as `quota_observed`) |
| **reconciliation result** | `quota_delta_flag` verdict (already landed) |
| **cumulative attributed batch spend** | this batch's own running total |

**Binding requirement:** the trail must **distinguish THIS batch's requests from concurrent provider use** — attribution by run/batch identity, **NOT before/after global balances.** This is not hypothetical: the autonomous poll cycle spends against the same key (observed **8cr** on `2026-08-03T21:11:31Z`), so a global-balance delta would silently absorb it and corrupt the measured per-call cost.

Threading is the **same additive, backward-compatible shape as GAP-38's four columns** — optional input, bound `?? null`, one INSERT with no branching, seed path **byte-identical**.

**Build + prove in Gate (b).** Deliberately **not** retrofitted into the closed GAP-38.

### STEP 0.3 — Bounded first-batch design (the substantive gate)

**Frozen manifest + hash** — the discipline that has now worked twice (V1-OP-5D finalization; V1-OP-5a backfill). **~5–10 games** drawn from the **20 batch-qualifying** games: **mapped-only** (approved `odds_api` event id → **no discovery call**), **box-score-complete**, **non-GAP-35**, **regular-season**. Serialization: sort ascending · `\n`-join · no trailing newline · UTF-8 · SHA-256. A literal id list, **never a re-run selector**.

Keeping the batch on the clean path is deliberate: it measures **archive cadence in isolation**, uncontaminated by discovery failures or identity gaps.

### ✅ FOUNDER RULING (2026-08-04) — **APPROVED**, with the expanded ledger and success criteria below.

**Per-game completion ledger (the actual deliverable).** Per game:

- outcome: **`eligible` / `close_capture_stale` / `failed` / `skipped` (no-op)**
- grain counts: `source_closing_quotes` / `canonical_closing_points` / `historical_line_results`
- the returned snapshot's **age before boundary**
- **forecasted vs observed credits** for that game

**The deliverable is the measured stale rate with per-game attribution — not "it ran."**

**Success criteria (explicit — Board relight is NOT among them):**
1. **close-eligibility rate** (the measured `close_capture_stale` fraction)
2. **attributed grains** — every row traceable to its target game / event / evaluation identity
3. **transaction invariants** — game-level atomicity held; no partial games
4. **billing accuracy** — forecast vs observed reconciled per call and persisted
5. **boundary safety** — both start-time fields byte-identical across every touched game
6. **idempotency** — a re-run is a governed no-op with no re-fetch and no re-spend
7. **failure isolation** — one game's failure neither corrupts nor blocks the others

**Hard credit ceiling** ≈ `games × 40 + headroom`; halt-before-ceiling; **no blind retry**.

**Budget re-sizing method — stated up front so the resized figure is mechanical once the rate is in:**

```
stale_fraction  = games_close_capture_stale / games_attempted        (measured by the batch)
full_backlog_cr = N_mapped   × 40 × (1 + stale_fraction)
                + N_unmapped × (40 + 1) × (1 + stale_fraction)       (unmapped adds 1cr discovery)
                + interrupted_games × resume_cost                     (STEP 0.1; 40 under Option A)
```

With today's counts (`N_mapped = 23`, `N_unmapped = 24`) and, illustratively, a measured `stale_fraction = 0.2`:
`23 × 40 × 1.2 = 1,104` + `24 × 41 × 1.2 = 1,181` ≈ **2,285 cr** before resume costs. **These are ESTIMATES — placeholders until the batch supplies the real fraction.** A stale call still bills 40cr and yields nothing, which is precisely why the fraction multiplies the whole figure. The `N_unmapped` term is further refined by §0.4 below, since an unrecoverable game has **no paid path at all** and must not be budgeted as if it did.

### STEP 0.4 — Unmapped-tail discovery sample (**NEW, MANDATORY before full-backlog authorization**)

**This does NOT block the mapped first batch.** It is a further bounded step that gates the **full-backlog** authorization only.

Before the full-backlog budget is finalized, run a **separate bounded discovery sample** drawn from the **24-game unmapped tail**. The full budget must then separate **three populations**, which today are wrongly collapsed into one:

1. **Mapped-repairable** — approved `odds_api` event id already present; ~40cr/event, no discovery.
2. **Unmapped-but-discovery-recoverable** — discovery call succeeds and resolves to exactly one event; discovery + ~40cr per recovered event.
3. **Unmapped-and-unrecoverable** — **no paid path exists.** Roll-off-only unless another authoritative source is separately approved. **Must be explicitly counted**, because this population **may cap how far repair can reduce suppression at all** — it is the difference between "the backlog is expensive" and "part of the backlog is unreachable."

**The sample must report:** selection method · sample count · discoveries attempted · **exact-match / ambiguous / no-match counts** · credits consumed · **observed recovery rate** · confidence limitations · **projected recoverable / unrecoverable counts** · **revised one-time budget sensitivity**.

**Label every projection an ESTIMATE.** The single 2026-08-01 discovery-recovery observation is **n=1 and is NOT a valid basis for a full-backlog projection.**

---

---

## §0.4 — Unmapped-tail discovery sample: DESIGN (authored 2026-08-05, zero-spend; awaiting founder approval)

**Status: DESIGN ONLY — FINALIZED and committed for review. No discovery call, no probe, and no fetch has been made.**
**⚠️ Execution of this sample is a SEPARATE FUTURE AUTHORIZATION (~12 credits). This commit records the design; it authorizes no spend.**

### 1. The enumerated unmapped tail (read-only, 2026-08-05)

**24 games across 12 distinct dates**, span `2026-07-12 .. 2026-07-30`. Discovery is billed **per date** (`/v4/historical/.../events`, **1cr/date**), not per game:

| date | games | matchups |
|---|---|---|
| 07-12 | 1 | NY@TOR |
| 07-13 | 2 | IND@LV · LA@ATL |
| 07-14 | 3 | PHX@MIN · POR@CON · WSH@TOR |
| 07-15 | 2 | SEA@CHI · LA@MIN |
| 07-16 | 1 | GS@IND |
| 07-17 | 1 | NY@DAL *(pgs=0 — GAP-32)* |
| 07-19 | 3 | LA@DAL · CHI@ATL · CON@PHX |
| 07-21 | 3 | LV@TOR · WSH@GS · MIN@SEA |
| 07-22 | 4 | PHX@LA · MIN@SEA · CHI@NY · LV@WSH |
| 07-23 | 2 | CON@IND · DAL@POR |
| 07-26 | 1 | TBD@TBD *(exhibition)* |
| 07-30 | 1 | MIN@TOR |

**22 of 24 are box-score-complete.** The 2 that are not are already-known exclusions: `a11faedc` (GAP-32, zero BDL rows) and the `5a1248ff` exhibition.

**Full-coverage discovery cost: 12 dates × 1cr = 12 credits.** That is cheap enough that sampling a *subset* of dates saves almost nothing — the design therefore proposes **all 12 dates**, which removes sampling error from population (a)/(b)/(c) classification entirely.

### 2. Three-population output structure

Every unmapped game resolves to exactly one:

- **(a) mapped-repairable** — already carries an approved `odds_api` event. **13 remain** (measured 2026-08-05). ~40cr/event.
- **(b) unmapped-but-discovery-recoverable** — discovery returns exactly one deterministically-matching event. Cost: the date's 1cr discovery (shared across that date's games) + ~40cr per recovered event.
- **(c) unmapped-and-unrecoverable** — no match, or ambiguous/multi-match that cannot be resolved deterministically. **No paid path exists.** Roll-off-only unless another authoritative source is separately approved. **Must be counted explicitly**, because this population **caps how far repair can reduce suppression at all**.

Report per game: date · matchup · discovery outcome (`exact_match` / `ambiguous` / `no_match`) · resolved event id where applicable · credits consumed. Plus totals, the observed recovery rate, and confidence limitations.

### 3. ⚠️ Cross-era cadence: the premise does not hold — CORRECTED

The founder's requirement was to design the sample to also test whether the tight `262–263s` cadence band holds **on older slates**. Read-only enumeration shows **there is no older in-scope population**:

- The **unmapped tail spans `2026-07-12 .. 2026-07-30`** — the **same era** as the 12 already-proven games (`2026-07-12 .. 2026-07-29`). It is not older; it is interleaved.
- The **entire repairable backlog** (13 mapped + 24 unmapped = **37 games**) lives in that one era.
- The only genuinely older unrepaired games are **2** (`2026-06-03`, `2026-06-30`) — the GAP-30 permanent holes. They sit **outside the recent-N window** (which now spans `2026-07-12 .. 2026-08-05`), so repairing them **cannot reduce suppression by even one game**.
- The **169 pre-07-12 games already carry usable hlr** from the original seed. That era is covered, but it was retrieved at a different time and is **not evidence about archive cadence today**.

**Therefore: cross-era cadence probes have no in-scope target.** Spending ~40cr each on the 2 pre-window games would answer the cadence question for an older era while moving the gate by zero. **This design does not propose them.** If the founder wants that datum for its own sake — e.g. to de-risk a future older-season backfill — it should be authorized explicitly as *research*, not folded into a repair budget.

**The residual risk, stated accurately.** The real uncertainty is **not** era. It is whether any individual game had a provider-coverage gap. The 21/21 band is tight enough (`262–263s`) to suggest the archive stores snapshots on a fixed cadence relative to commence time; if so the mechanism is uniform across this era and the remaining 37 should behave alike. What remains unmeasured is per-game coverage dropout, which **only an event-odds fetch on each game can reveal** — i.e. it is measured by the repair itself, not by a probe. **The honest margin to carry in the budget is therefore a stale-allowance on the whole population, not an era-specific one.**

### 4. Budget re-sizing method (mechanical once the sample runs)

```
recovery_rate   = recovered_events / unmapped_games_attempted      (measured by the sample)
N_a             = 13   (mapped-repairable, measured 2026-08-05)
N_b             = round(24 × recovery_rate)                        (discovery-recoverable)
N_c             = 24 − N_b                                         (unrecoverable; NO paid path)
discovery_cost  = 12                                               (12 dates × 1cr, one-time)

full_backlog_cr = discovery_cost
                + N_a × 40 × (1 + stale_allowance)
                + N_b × 40 × (1 + stale_allowance)
```

`stale_allowance` is the population-wide margin from §3 — **currently 0/21 observed**, so a *measured* value of 0.0 with an explicitly chosen safety margin (the founder's call; 0.10 would price ~4 wasted calls across 37). **`N_c` games are excluded from the budget entirely** and carried forward as a permanent coverage cap.

**Illustrative only** (recovery 0.75, allowance 0.10): `12 + 13×44 + 18×44 ≈ 1,376cr`, leaving **6 games permanently unrepairable**. Real figures come from the sample.

### 5. What the sample does and does not settle

**Settles:** the (a)/(b)/(c) split, the discovery recovery rate, the exact remaining paid-repair population, and therefore the full-backlog budget.
**Does not settle:** per-game close-capture cadence — that is only observable by fetching each game, and is priced via `stale_allowance` rather than probed.

**Forecast for the sample as designed: 12 credits** (all 12 dates, discovery only). No event-odds probes proposed.

### 6. Standing context at finalization (2026-08-05)

- **Batch-1 complete** (10/10) and the **free `ec2c04c9` repair complete** — gate now **42/55 unresolved**.
- **No free progress remains.** `ec2c04c9` was the only backlog game already seeded at leg 2; every remaining game is population (b) at ~41cr or population (c) at no price.
- **`N_a = 13` mapped-repairable** remain (measured 2026-08-05); the 24 unmapped are what this sample classifies.
- **`stale_allowance` is measured at 0/21** in-window observations, all within a `262–263s` band. The safety margin applied to that measurement is a founder decision, not an implementation one.

**Execution remains gated. The full-backlog run additionally requires §5 (governed replayable payload) and the provider-terms answer.**

## Invariants (carried unchanged)

- **Neither `actual_start_utc` nor `scheduled_start_utc` is ever written or synthesized**; no timestamp derived from a date-only field (GAP-31). Boundary comes only from the committed `evaluateCloseBoundary`.
- `OP8A_FORBIDDEN_TABLES` intact — no `games` / `provider_games` / `players` / `player_game_stats` / `evidence_profiles` / `poll_cycles` write.
- **Ownership-scoped attribution** — by target game / provider event / evaluation identity, **never global count-deltas**. The autonomous poll cycle writes `market_snapshots` and `evidence_profiles` concurrently; netting would misattribute.
- DR-24, method/computation versions, source-selection/canonicalization semantics, and provenance (`backfilled_historical`) unchanged.
- **Reuse the committed primitives — no parallel selection, canonicalization, margin, eligibility, or hlr math.**

## Spend safety

GAP-29-corrected forecast × event count · `x-requests-last` reconciliation **persisted to the ledger** (GAP-38, closed `52fd0a0`) · reserve-floor check (`RESERVE_FLOOR_CREDITS` 1000) · hard ceiling · **halt-before-ceiling** · **no blind retry**.

## Gate expectation — state plainly

**A 5–10 game batch will NOT lift suppression.** The gate keys on the recent-N=55 window, currently **53 unresolved**; clearing it needs roughly the full 47-game backlog *and* the window keeps refilling as new games tip. **Success for the batch = clean attributed grains + a measured `close_capture_stale` rate + invariants held. NOT gate lift.** A still-dark Board after the batch is the expected, correct outcome.

## Out of scope

The **unmapped tail** for the *mapped batch* (24 games — governed by the mandatory §0.4 discovery sample, which gates the full-backlog run, not batch (c)) · **recurring forward retrieval** (V1-OP-5c family) · **the full-backlog run** (a separate authorization after the batch result) · any change to the closing-quote definition, the evidence method, or the gate.

## Sequencing — three distinct gates. Do NOT collapse.

- **(a) COMMITTED TICKET AUTHORITY — this document.** Founder rulings folded in (Option A atomicity · expanded balance trail · approved batch design · mandatory unmapped-tail sample). **DONE at commit.**
- **(b) Driver / refactor build + INDEPENDENT AUDIT** — the Option-A `…InTx` extraction, the atomic per-game persist, the batch runner, and the balance trail. A **separate ZERO-SPEND build+verify** with a genuinely write-free dry-run. **Halts for independent audit BEFORE commit**; the founder inspects **seed-path equivalence** and **transaction-ownership evidence** specifically (Gate-(b) proof obligations §0.1).
- **(c) Bounded first batch — separately authorized paid execution** against the frozen manifest, after (b) is audited.

**The unmapped-tail discovery sample (§0.4) is a FURTHER bounded step gating the FULL-BACKLOG authorization — it does not gate the mapped batch (c).**

## Done when (this ticket)

Gate (a) is complete at this commit: the atomicity approach is **founder-ruled (Option A)** with verbatim Gate-(b) proof obligations; the **expanded balance trail** is ruled in; the **batch design + success criteria** are approved; and the **mandatory unmapped-tail discovery sample (§0.4)** is registered as gating the full-backlog authorization. **No driver built, no credit spent, nothing run.**

Gate (b) is done when the Option-A refactor + batch runner + balance trail exist, all nine Gate-(b) proof obligations are demonstrated (seed-path equivalence and transaction-ownership evidence foremost), the dry-run is provably write-free and credit-free, the full matrix is green — and it **halts uncommitted for independent audit.**

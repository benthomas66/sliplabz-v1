# V1-OP-8b — Tranche 1: RESULT (INTERRUPTED)

**Fired** 2026-08-07 at HEAD `db9a94c` · manifest `V1_OP_8B_TRANCHE_1.txt`
sha256 `99a8b7034e2150d97d95c1dc0872ed532045c4e65302bcf101051218830f6a7a`
**Outcome: interrupted after 3 of 10 games by a 2-minute command timeout on my side.**
**Spend 120cr (3 calls). 2 games repaired. 1 game billed and rolled back — 40cr sunk.**

---

## What happened, plainly

I ran the batch under a tool call whose default timeout is 2 minutes. Ten games at
roughly 20–40s each cannot finish in that budget. The process took `SIGTERM`
(exit 143) partway through the third game. **This was my operational error — the
authorization, manifest, preflight and wiring were all correct; I simply failed to
extend the timeout for a run I had myself forecast at 10 × 40cr.**

No blind retry was attempted, per standing terms.

## 1 — LEDGER SUMMABILITY: the GAP-46 fix is PROVEN LIVE

| event id | ledger rows | rows carrying the trail | `SUM(quota_observed)` |
|---|---|---|---|
| `d6adc93ae6db51` | 24 | **1** | **40** |
| `19a1dc62b2c56f` | 24 | **1** | **40** |
| **total** | 48 | **2** | **80 = calls × 40** |

`reconcileQuota = exact_match` on every call. **Exactly one trail row per paid
call, live, at multi-call scale.** Before the fix these two games alone would have
summed to 1,920. The audit trail is now directly summable.

### But it revealed a NEW gap — GAP-47

**The third game's 40cr left no ledger record at all.** Its
`oddsapi_ingestion_runs` rows are written *inside* the same game-level
transaction as the quotes, so when the interrupt rolled the game back, the
ledger rows rolled back with it.

- Actual spend: **120cr** (3 calls, confirmed by balance).
- Ledger sum: **80cr**.
- **The ledger understates real spend by exactly the rolled-back call.**

This is the flip side of atomicity: rollback protects data integrity but erases
the billing evidence for a call the provider has already charged for. It cannot
be seen from the ledger alone — only the balance read catches it. Registered as
**GAP-47**; it matters more at tranche scale, where an interrupted run could sink
several hundred credits invisibly.

## 2 — PER-GAME INVARIANT: held, on all ten

- All 10 targets: `scheduled_start_utc`, `actual_start_utc` **and `updated_at`
  byte-identical** — no `games` row was touched at all.
- **All-games digest across all 332 games: UNCHANGED.**
- The 5 (b) targets still have **zero** `odds_api` `provider_games` rows — the
  repair created no mapping. The 5 `N_a` targets each retain their single
  pre-existing approved mapping, unchanged.
- `games` 332 → 332; `event_reconciliation_queue` 12 → 12.

Note `provider_games` moved 539 → 543 globally during this window; that is the
autonomous poll cycle mapping newly-tipped games, **attributed per-game rather
than netted** — none of the four belong to our ten.

## 3 — Atomicity held perfectly

| | n | detail |
|---|---|---|
| COMPLETE | **2** | `0b42ac8f` 166/35/31 · `0b9e01f4` 175/33/28 — all hlr usable |
| untouched (clean) | **8** | `scq/ccp/hlr = 0/0/0` |
| **PARTIAL / orphaned** | **0** | — |

The interrupt landed mid-game and produced **zero orphans**. `11ec7958` was
billed, rolled back completely, and is safe to re-fetch — a clean re-run, not a
resume over partial state. This is exactly what the GAP-37 Option-A design was
built for, now demonstrated under a real interrupt rather than a simulated one.

## 4 — Ownership scope, exact

| grain | global delta | target-attributed | |
|---|---|---|---|
| `source_closing_quotes` | 341 | 166 + 175 = **341** | exact |
| `canonical_closing_points` | 68 | 35 + 33 = **68** | exact |
| `historical_line_results` | 59 | 31 + 28 = **59** | exact |

Nothing swept in; no poll-cycle netting required.

## 5 — Billing

Balance `98,803 → 98,675` = **−128**. Attributed: **120 to us** (3 × 40) and
**8 to the concurrent poll cycle**. Not netted.

## 6 — Gate moved +1, not +2 — and the reason matters

`12 → 13` covered. Only one of the two repaired games counted, because the
**recent-55 window has slid to `2026-07-15 .. 2026-08-07`** and `0b42ac8f`
(2026-07-14) has fallen outside it.

**Of the 10 games selected as recent-N barely a day ago, only 7 still are.**
Repairing `0b42ac8f` was still correct — the data is real and permanent — but it
no longer moves the gate. This sharpens the V1-OP-5c point from "the backlog
grows" to something more pointed: **the oldest backlog games are aging out of
gate relevance faster than we are repairing them.** Future tranches should be
ordered newest-first, and manifests re-checked for window membership immediately
before firing rather than at authoring time.

---

## Standing

**Remaining in this manifest: 8 games** (`fe5cb6e1`, `67762b24`, `11ec7958`,
`a3f23abe`, `23c6c6c2`, `7fd2af1f`, `ddda8c8e`, `3411777f`) — one of which
(`11ec7958`) has already been paid for once and must be paid again.

Not re-run, not retried. The remainder awaits a fresh founder authorization, and
should be fired with an adequate command timeout (≥10 minutes for 10 games).

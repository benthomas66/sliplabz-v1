# V1-OP-8b — (b)-canary: RESULT

**Fired** 2026-08-06 at HEAD `7235e78` · manifest `V1_OP_8B_B_CANARY.txt`
sha256 `b3624387e526757cea792ad6cbd232afa68e45ba32b1355856d62e169c3dc640`
**Target** `2bfab280-66bd-4064-b87f-69020a36aad8` SEA@CHI · event `dd23179c4373849ae1da8476ec21def3`
**Spend** 40 credits, `exact_match`. **First previously-unmapped (b) game repaired on live spend.**

---

## 1 — THE INVARIANT HOLDS. This is what validates all 22 (b) repairs.

| check | result |
|---|---|
| target `scheduled_start_utc` | `2026-07-15 16:00:00+00` → `2026-07-15 16:00:00+00` — **byte-identical** |
| target `actual_start_utc` | `<NULL>` → `<NULL>` — **byte-identical, still NULL** |
| target `games` row digest (start-times + status) | **unchanged** |
| target `games.updated_at` | **unchanged — the row was never touched at all** |
| **all-games** start-time digest (332 games, both fields) | **unchanged** |
| `provider_games` global | 539 → 539 — **no mapping created** |
| `provider_games` for target, `odds_api` | **0 → 0 — the repair needed no mapping** |
| `games` row count | 332 → 332 |
| `event_reconciliation_queue` | 12 → 12 |

The `updated_at` check is the strongest form: not merely "the values are the same",
but **no UPDATE touched the row**. And the all-games digest proves nothing shifted
for any *other* game either.

**The (b) path is confirmed in production, not just in principle.** A previously
unmapped game was repaired end-to-end using only the event id stored in
`discovery_results` — no mapping creation, no `eventResolutionForSeed`, no
start-time write. The close boundary that made the archived snapshot eligible was
read, never moved. The remaining 21 (b) repairs rest on exactly this path.

## 2 — Billing: exact at 40 credits

- `reconcileQuota` = **`exact_match`**, forecast 40 / observed 40.
- Ledger row trail complete: `last=40 remaining=98803 used=1197`, **zero nulls across all six quota fields**.
- **Independent free balance read: `98,843` → `98,803` = exactly −40.** No poll-cycle
  drift to attribute this time; `x-requests-used` moved `1157 → 1197` in step.

## 3 — Positive persistence on the live response

| grain | before | after |
|---|---|---|
| `source_closing_quotes` | 0 | **151** |
| `canonical_closing_points` | 0 | **31** |
| `historical_line_results` | 0 | **26** |

hlr coverage: **25 `complete` + 1 `single_book`** — all 26 usable under
`USABLE_HLR_COVERAGE_STATES`. **Zero scq rows with a null linked game id**
(the GAP-39 regression check). Snapshot age 263s before the boundary → eligible;
measured `close_capture_stale` 0/1, keeping the running same-era rate at **0/41**.

## 4 — Ownership scope, atomicity, idempotency, gate

- **Scoped exactly:** global deltas equal target-attributed deltas — scq +151/+151,
  ccp +31/+31, hlr +26/+26. Nothing swept in; no netting against the concurrent
  poll cycle was needed because no unrelated grain moved.
- **Atomic:** one game-level transaction (`persistGameAtomically`); the operator
  reported `persisted atomically`.
- **Idempotent:** a second `--apply` on the same manifest returned
  `skipped — already has usable hlr — no fetch, no spend`; balance unchanged at
  **98,803**. No re-fetch, no re-spend.
- **Gate: 11 → 12 covered, +1 exactly as predicted** (suppression 44 → 43).

---

## NEW FINDING — GAP-46: the ledger over-counts spend by ~24×

`SUM(quota_observed)` over `oddsapi_ingestion_runs` for this event id is **960**,
not 40 — because `persistHistoricalSnapshotInTx` runs **once per (market,
bookmaker) triple** and each call writes its own ingestion-run row carrying the
**same whole-call quota trail**. 24 rows × 40 = 960.

**This is pre-existing, not introduced by the (b) path.** Previously repaired
games show the identical shape — 48 rows / 1920 apiece.

**No money was lost and no prior conclusion is overturned:** actual spend is
confirmed at exactly 40 by the independent balance read, and the per-call spend
curve (`x_requests_remaining`, one distinct value: 98803) is correct. Every
discovery-run reconciliation stands, because discovery writes exactly one ledger
row per call.

**Why it matters before the tranches:** the ledger is the designated
DB-reconcilable record of spend (the whole point of GAP-38/GAP-40). Anyone — or
any script — reconciling by summing `quota_observed` across 34 games would read
**~54,000 credits instead of 1,382**. Registered as **GAP-46** with the correct
reconciliation stated (count distinct paid calls, or dedupe on the balance-curve
columns) and a fix proposed: record the quota trail on exactly one row per paid
call and leave the sibling triple-rows null.

---

## Standing

The (b) path is proven on live spend. The load-bearing invariant held on every
measure available, including the two strongest (untouched `updated_at`, unchanged
all-games digest). 21 (b) repairs plus 12 `N_a` remain, at a deterministic
1,342cr from here.

Not run: the remaining tranches, any further event-odds fetch, §5.

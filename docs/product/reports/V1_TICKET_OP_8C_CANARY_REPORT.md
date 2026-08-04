# V1-OP-8c — One-Game Canary: Result

**Status: PASS.** The corrected wiring persisted a live paid response end-to-end. 40 credits spent, exactly as forecast. **One incomplete corrective found and reported below (§3) — it does not affect this result's validity but must be closed before the batch remainder.**

**Executed:** 2026-08-04 against HEAD `0f57cb0` (corrective `2eaab4c` in history; the three code paths byte-identical to committed — no drift).
**Canary (founder-ratified):** `8edfaa19-772f-4083-be7a-665df9f7df7b` — POR @ WSH, tip `2026-07-16T23:00:00Z` — Odds API event `00a997433337939ebda3beb882a1e2db`. Chosen because leg 1 is complete (27 box-score rows), so any anomaly isolates to legs 2–3.

---

## 1. Billing

| | |
|---|---|
| Forecast | **40** (1 event · 4 markets · 8 books · no discovery) |
| `x-requests-last` | **40** |
| `reconcileQuota` | **`exact_match`** |
| Balance | **99,347 → 99,307 = exactly 40** |

## 2. Positive persistence — the GAP-39 fix proven on a LIVE response

| Table (attributed to the target game) | before → after |
|---|---|
| `source_closing_quotes` | 0 → **156** |
| `canonical_closing_points` | 0 → **36** |
| `historical_line_results` | 0 → **30** |

- **hlr `coverage_state`:** 28 `complete` + 2 `single_book` — **all 30 usable**, provenance `backfilled_historical`.
- **canonical breakdown:** 28 `unique_modal`/`complete` · 3 `single_book` · 5 `tied_no_unique_mode`/`unresolved_closing_consensus` (correctly excluded from hlr).
- **The GAP-39 line is fixed on the live path:** 92 `market_snapshots` carry `linked_internal_game_id = 8edfaa19…` for this event. (44 rows for this event carry a NULL link — **residue of the failed batch-1 run**, not this canary.)
- Close capture: **`eligible`, snapshot 263s before the boundary**, inside `[23:05, 23:15]`.

## 3. ⚠️ Quota ledger — corrective C is INCOMPLETE (found by this canary)

The seven-field trail is **computed and logged** (console showed `forecast=40 observed=40 flag=exact_match last=40 remaining=99307 used=693 cumulative_batch=40`), but **only four fields reach the database**:

```
ledger row: {"f":40,"o":40,"df":"exact_match","l":40,"rem":null,"used":null}
```

**Cause:** `persistHistoricalSnapshotInTx`'s `quota_reconciliation` input contract (`persistHistoricalSnapshot.ts:83-88`) accepts only `forecast` / `observed` / `delta_flag` / `x_requests_last`. `x_requests_remaining` and `x_requests_used` — the two fields the governor specifically required — **have no parameter to travel through**, so they are still null in `oddsapi_ingestion_runs`.

**My test had the same blind spot that caused GAP-39.** It asserted the `on_quota_trail` **intermediate object** carried all seven fields, not that seven fields reached the **persisted row**. Asserting an in-memory object instead of the durable outcome is exactly the class of error standing rule 5b exists to prevent; the rule was satisfied for *persistence of quotes*, but I did not extend the same standard to the *quota ledger*.

**Consequence:** the running balance curve across the batch is **not reconstructable from the DB** — the original GAP-38/§0.2 objective. **This must be closed before the batch remainder**, since that is exactly where an unattended spend curve matters. It does not invalidate this canary: billing exactness is independently proven by `x-requests-last` (persisted) plus the balance delta.

## 4. Invariants — all held

- `scheduled_start_utc` **byte-identical** · `actual_start_utc` **byte-identical (null)** · target `games.updated_at` **unchanged** (no `games` write).
- `games` 332 → 332 · `provider_games` 534 → 534 · `player_game_stats` 5291 → 5291.
- **Nothing swept in:** other games' `source_closing_quotes` 23128 → 23128 · `canonical_closing_points` 4988 → 4988 · `historical_line_results` 4686 → 4686.
- Atomic per game (one transaction over quotes → canonical → hlr); DR-24 / method / gate logic unchanged.

## 5. Gate — moved by exactly one game

**`53/55 → 52/55` unresolved.** The Board **remains suppressed**, which is correct: one game cannot clear the recent-N window. This is not a failure.

## 6. Idempotency — no re-fetch, no re-spend

Re-running `--apply` on the same manifest: **`skipped` — "already has usable hlr — no fetch, no spend"**, `calls billed: 0`. Target still `scq=156 / hlr=30` (no duplicates); balance still **99,307**. The `alreadyRepaired` check runs *before* both the ceiling check and `retrieveGame`, so a repeat invocation is structurally incapable of re-spending.

## 7. Minor reporting inaccuracy (no data impact)

The runner's ledger reported `scq=165` while the DB holds **156** rows. The ledger counts `source_closing_quote_ids` returned across triples; 9 were collapsed by the `(player, market, book)` UNIQUE on upsert. Distinct grains = 156 = row count, so the data is correct and the **ledger count is an over-report** of ~6%. Worth correcting alongside §3 so the batch ledger's grain counts are exact.

---

## What this establishes

1. **The GAP-39 root cause is fixed on the live paid path**, not merely in a fixture — a real response produced 156/36/30 owned rows.
2. **Standing rule 5b worked**: the positive-persistence test predicted the live outcome. Its limit is now also known — it must assert *persisted rows*, not intermediate objects (§3).
3. **Archive cadence:** `eligible` at 263s. With batch-1's 10/10 and the original one-game validation, in-window snapshots are now **12/12** for this era — though still zero *measured stale* observations, so the true stale rate remains unmeasured, not zero.
4. **40cr/event holds** at n=12.

**Still outstanding:** the batch-1 remainder (9 games, 360cr) and the full backlog remain **unauthorized**. §3 should be closed first. §5 (governed replayable payload) still gates only the full-backlog run.

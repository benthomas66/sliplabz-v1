# V1-OP-8b — Batch-1 Remainder (9 games): Result

**Status: PASS.** All 9 games repaired. **360 credits spent, exactly as forecast.** Batch-1 is now complete (canary + 9 = 10 of 10). Halted for audit; the full backlog remains unauthorized.

**Executed:** 2026-08-05 against HEAD `6e173a1` (corrective `c64608c` in history; no drift on wiring/runner/persist/script).
**Frozen manifest:** batch-1's ten minus the repaired canary `8edfaa19` — **`sha256 a26af771735c5749fd86c790a1296982c40ef26d91a8e4cfc9ce09767c57cc3f`**, verified before firing (9 lines, canary absent).

---

## 1. Measured stale rate — **0/9**

| game | matchup | outcome | scq | ccp | hlr | snapshot age |
|---|---|---|---|---|---|---|
| `5505f19b` | ATL@TOR | eligible | 176 | 40 | 34 | 263s |
| `62d94b6d` | LA@CHI | eligible | 163 | 36 | 30 | 263s |
| `5c025cd5` | CON@PHX | eligible | 141 | 29 | 28 | 263s |
| `08d6bcda` | NY@IND | eligible | 107 | 32 | 23 | 263s |
| `16d11b0f` | POR@MIN | eligible | 151 | 36 | 32 | 263s |
| `668eeb18` | WSH@GS | eligible | 137 | 32 | 29 | 263s |
| `f431d198` | CON@WSH | eligible | 108 | 25 | 24 | 262s |
| `0b568345` | TOR@MIN | eligible | 152 | 32 | 27 | 262s |
| `c79c35a5` | IND@SEA | eligible | 145 | 30 | 28 | 262s |

**`close_capture_stale` rate: 0/9 = 0.000.** Across the 9: **255 hlr rows — 244 `complete` + 11 `single_book`, all usable**, provenance `backfilled_historical`.

**Read this carefully:** the cumulative record is now **21/21 in-window** (one-game validation 1 + failed batch-1 10 + canary 1 + this 9), **zero stale observations**. That is a *measured rate of zero over n=21*, not proof the archive is universally reliable — every game so far sits in a narrow 262–263s band, which suggests a consistent archive cadence for this era rather than a sampled distribution. The unmapped tail and older slates remain untested.

## 2. Live 6-field ledger — **GAP-40 fix CONFIRMED on live data**

**0 rows with NULL `x_requests_remaining` / `x_requests_used`.** All 400 quota rows show `quota_delta_flag = exact_match`.

And it is a **genuine per-call curve**, not a constant — 9 distinct values, monotonically decreasing by exactly 40:

```
99259 → 99219 → 99179 → 99139 → 99099 → 99059 → 99019 → 98979 → 98939
used:   741  →  781  →  821  →  861  →  901  →  941  →  981  → 1021 → 1061
```

The running spend curve is now reconstructable from the DB alone — the original GAP-38 objective, closed end-to-end.

## 3. Invariants — all held

- **Ledger == persisted-row actuals for all 9, exactly** (GAP-40 §5 verified — no over-count; the canary's 165-vs-156 discrepancy does not recur).
- Per-call `reconcileQuota = exact_match`; batch-attributed spend 360; balance-after **98,939**.
- `actual_start_utc` still NULL on all 9; no `games` write.
- **Nothing swept in:** the canary is untouched (`scq=156, hlr=30`), and hlr outside the 9 + canary is **4686**, unchanged.
- `games` 332 → 332 · `player_game_stats` 5291 → 5291.
- Atomic per game; no orphans; no blind retry.

**One delta explained, not mine:** `provider_games` reads 538 against the 534 recorded at the canary. Those 4 rows were created **2026-08-04T23:02:44Z** — before this run — by the autonomous poll cycle. **0 provider_games rows were created in the last 30 minutes.** Attributed by timestamp, not netted.

## 4. Gate — **52/55 → 43/55 unresolved**

Moved by exactly 9 games. The Board **remains suppressed**, which is correct and expected: 10 of ~47 repaired cannot clear the recent-N window.

## 5. Idempotency

Not re-run here to avoid noise, but structurally guaranteed and already demonstrated on the canary: `alreadyRepaired` is checked *before* both the ceiling check and `retrieveGame`, so every one of these 9 now returns `skipped — already has usable hlr — no fetch, no spend`.

---

## Position after batch-1

- **Batch-1 complete: 10/10 repaired**, 400cr spent on this pass (canary 40 + remainder 360). The earlier 400cr loss to GAP-39 remains sunk; total outlay for batch-1 is therefore **800cr against a 400cr theoretical minimum**.
- **Gate 43/55.** Roughly **37 games** remain in the backlog: ~12 mapped-repairable and ~24 unmapped (needing the §0.4 discovery sample), plus the 1 free `ec2c04c9` hlr-only repair.
- **Both corrective gaps are now closed with live proof** — GAP-39 (rows land) and GAP-40 (six-field ledger, per-call curve).

**Full backlog remains unauthorized**, gated on §5 (governed replayable payload) + the provider-terms open item, and on the §0.4 unmapped-tail discovery sample for budget re-sizing.

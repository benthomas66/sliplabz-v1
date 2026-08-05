# V1-OP-8b §0.4 — Corrected re-probe: RESULT

**Fired** 2026-08-05 at HEAD `bd2dce0` · plan `V1_OP_8B_S04_DISCOVERY_PLAN.jsonl` (24 games)
**Ratified probe-plan hash** `6f960408bd72e1d706af4625421d6ec1bf63a12904f501ded3a5ad51532f6974`
(sha256 over 24 `internal_game_id|probe_at` lines, ascending, `\n`-joined, no trailing newline, UTF-8)
**Spend** 22 credits, exact · 22 probes at true close boundaries · **Writes** 22 ledger rows, nothing else.

---

## HEADLINE: there is no meaningful suppression floor. Backlog repair clears the gate.

The first sample reported `c_within_recent_n = 18` and could not support a decision.
With the GAP-41 matcher and GAP-42 boundary anchor corrected, the same 24 games
return **21 (b) / 3 (c)** — a **recovery rate of 87.5%**, up from 20.8%.

**The (c)-within-recent-N floor is 3, and only 2 of those are genuine.** The
answer to the question the sample was commissioned to settle:
**backlog repair clears the gate. A floor does not force relight to wait on roll-off.**

Both corrections mattered, and they were independent:

| | first sample | re-probe |
|---|---|---|
| (b) recoverable | 5 | **21** |
| (c) unrecoverable | 19 | **3** |
| recovery rate | 20.8% | **87.5%** |
| (c) within recent-N | 18 | **3** |

All 6 POR/TOR games now resolve via `token_containment` — they were never
unrecoverable, only unmatchable by our own city-less `display_name`. And 10
further games matched only once probed at their actual close boundary rather
than end-of-UTC-day.

---

## 1 — (b)/(c) split (corrected matcher + true close-boundary probe)

**21 (b) discovery-recoverable** — 15 by exact both-team match, 6 by
`token_containment` (the expansion-team names):
`22302337` NY@TOR · `69d23cf5` IND@LV · `68378a24` LA@ATL · `fe5cb6e1` PHX@MIN ·
`67762b24` POR@CON · `0b42ac8f` WSH@TOR · `2bfab280` SEA@CHI · `11ec7958` LA@MIN ·
`a3f23abe` GS@IND · `68aeff17` LA@DAL · `4ee4dab4` CHI@ATL · `d5cca9df` CON@PHX ·
`434ce5f9` LV@TOR · `f8d2635b` WSH@GS · `dcf8be4b` MIN@SEA · `e1dfff22` PHX@LA ·
`47477e52` CHI@NY · `926a9763` LV@WSH · `f653c1c1` CON@IND · `a4982740` DAL@POR ·
`c3ec0c4d` MIN@TOR

**3 (c)** — and they are not equivalent:

| game | reason | genuine? |
|---|---|---|
| `5a1248ff` TBD@TBD | no team identity at all | **yes** — correct by definition |
| `a11faedc` NY@DAL | no matching event at the boundary; **also 0 box-score rows (GAP-32)** | **yes** — doubly dark: even a successful line fetch could not produce hlr without leg 1 |
| `455f3873` MIN@SEA | **ambiguous — 2 events matched both teams** | **no** — see below |

### The ambiguous case is disambiguable, not unrecoverable

`455f3873` (MIN@SEA, tip `2026-07-21T02:00Z`) and `dcf8be4b` (MIN@SEA, tip
`2026-07-22T19:00Z`) are a **two-game series**. At the `02:15Z` probe both were
listed, so the conservative uniqueness rule sent it to (c) — correctly, given
the rule. `dcf8be4b` matched cleanly at its own boundary once the earlier game
had rolled off. Ranking candidates by `commence_time` proximity to the boundary
would resolve this deterministically. Registered as **GAP-44**; it would move
`N_b` 21 → 22 and the genuine floor 2 → 2 (unchanged, since it leaves (c)).

**So: 2 genuinely unrecoverable games, 1 pending a cheap matcher improvement.**

## 2 — The floor, and whether repair clears the gate

The 42 suppressed recent-55 games decompose exactly:

| segment | n | disposition |
|---|---|---|
| unmapped, post-07-12, final | **23** | 20 are (b) → repairable; 3 are (c) |
| mapped, post-07-12, final (`N_a`) | **12** | repairable now |
| mapped, post-07-12, **not final** | **7** | blocked on finalization (V1-OP-5c), **not** a permanent floor |

Repairing `N_a` 12 + the 20 in-window (b) clears **32 of 42**, taking the gate
**42 → 10 suppressed** (45/55 covered). Of the residual 10: **7 merely await
finalization** and 3 are (c), of which **2 are genuine**.

**Stated plainly: the gate is not floor-bound. Relight does not have to wait on
roll-off.** The binding constraints are spend authorization and finalizing the
7 non-final games — both actionable — not permanent unrecoverability.

Leg-1 readiness verified: **all 21 (b) games and all 12 `N_a` games have box
scores**, so a successful line fetch converts to hlr for every one of them. The
sole leg-1 hole is `a11faedc`, already counted as (c).

## 3 — Deterministic three-population budget

| term | n | rate | credits |
|---|---|---|---|
| `N_a` mapped | 12 | 40 | **480** |
| `N_b` discovery-recoverable | 21 | 41 (1 discovery + 40 odds) | **861** |
| `N_c` | 3 | — | excluded (roll-off only) |
| `stale_allowance` | founder-set | 40/slot | — |
| **total** | **33** | | **1,341** + allowance |

If GAP-44 is fixed, `N_b` 22 → **1,382**. Measured `close_capture_stale` rate to
date is **0/19**, so a zero or single-digit allowance is defensible; that is a
founder call, not mine. Balance after this run: **98,885** — the full repair is
~1.4% of it.

## 4 — Billing: exact at 22 credits

22 `oddsapi_ingestion_runs` rows, `event_discovery`/`historical_events`,
`result_state='complete'`.

- `sum(quota_observed)` = **22**; every row `exact_match`.
- **Zero nulls across all six quota fields** — GAP-40 contract holds on the
  discovery path for the second consecutive run.
- Balance curve strictly monotone, step 1: `98906 → 98885`.
- Independent free balance read `98907 → 98885` = **22**, matching the ledger exactly.
- Every `requested_effective_time` is a close boundary; **zero end-of-day stamps**.

## 5 — No writes beyond the ledger

| table | pre | post | Δ |
|---|---|---|---|
| `oddsapi_ingestion_runs` (discovery) | 12 | 34 | +22 |
| `provider_games` / `provider_games(odds_api)` | 539 / 207 | 539 / 207 | **0 / 0** |
| `games` | 332 | 332 | **0** |
| `event_reconciliation_queue` | 12 | 12 | **0** |
| `source_closing_quotes` | 24564 | 24564 | **0** |
| `canonical_closing_points` | 5316 | 5316 | **0** |
| `historical_line_results` (usable) | 5001 | 5001 | **0** |
| gate (recent-55 covered) | 13 | 13 | **0** |

Report-only: no mapping created for any of the 21 (b) matches —
`eventResolutionForSeed.ts` remains the governed owner. Zero 40cr event-odds
calls; the seam is unreachable from the sample module by construction.

---

## Recommendation

The measurement is now decisive and the budget is concrete: **1,341 credits for
33 games**, no floor obstacle. Fixing GAP-44 first is cheap and adds a 34th game.
§5 payload retention remains unbuilt and gated on provider terms — it did not
block this run, and this run's outcome is not at risk from its absence, since
the classification is now correct rather than needing re-analysis.

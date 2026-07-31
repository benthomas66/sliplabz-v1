# V1-OP-5 STEP 0 — Ingestion Restore: Retention, Cost, DB Read, and a Blocking Coherence Finding

> **Governor STEP 0 record.** Read-only investigation before any write or provider
> call. **No writes were made. No provider calls were made. Zero quota spent.**
> The hosted read used `SLIPLABZ_HOSTED_DATABASE_URL` inside a `READ ONLY`
> transaction with `default_transaction_read_only=on`.
>
> **Headline: STEP 0 surfaced a blocking evidence-coherence finding (§5).**
> V1-OP-5a as originally scoped (BDL stats + finalization, standalone) would
> **lift the ingestion-gate suppression while the evidence engine is still blind
> to every post-2026-07-12 game** — serving confidently-wrong profiles built on
> pre-gap data. That is worse than the honest suppression in place today. The
> write path is **HELD pending owner re-ruling.** All firm values below stand.

- **Date:** 2026-07-31
- **Pinned HEAD:** `58114e4` (V1-OP-4 committed)
- **Window under study:** `[2026-07-12T00:00Z, now)` — 19 days.

---

## 1. Two providers, two cost streams (not to be conflated)

| Stream | Provider | Metering | Backfill cost, this window |
|---|---|---|---|
| `player_game_stats` + game-status finalization | **balldontlie** (`api.balldontlie.io`) | rate-limited (`x-ratelimit-*`), flat subscription | **~0 credits** |
| historical closing lines (`historical_line_results`) | **The Odds API** (`api.the-odds-api.com`) | credit-metered (`x-requests-remaining`) | see §4 |

The credit concern is entirely The Odds API. BDL is rate-limited, not metered.

## 2. Hosted DB read — firm values

**43 past-tip games in window.**

**Q1 — box-score / finalization gap**
| Metric | Value |
|---|---|
| Games in window | 43 |
| Games with **no** `player_game_stats` | **41** |
| Oldest → newest missing | 2026-07-12 → 2026-07-31 |
| Status `scheduled` (past tip, never finalized) | **31** |
| Status `final` | 12 |

Two independent failures: 31 past-tip games never transitioned to `final`
(finalization dead since 07-12), and even among the 12 finals only 2 have box
scores. 41 = 31 stuck-scheduled + 10 un-ingested finals. (The 10 already-final
games with no box scores prove finalization and stats ingestion are independent
failures — a driver that only pulls stats for games it just finalized would miss
those 10.)

**Q2 — do historical closing-line artifacts already exist?** No.
| Artifact | Games covered (of 43) |
|---|---|
| `market_snapshots` provenance=`backfilled_historical` | 2 |
| `canonical_closing_points` | 2 |
| `historical_line_results` | 1 |
| any `market_snapshots` (mostly pre-tip `current_poll`) | 19 |

The "already-persisted → $0" best case is dead. Note especially: 19 games have
`current_poll` snapshots yet only 2 produced a `canonical_closing_point` — so
current-poll data did **not** become closing lines for these games (polling
stopped before the close boundary). There is no closing-line-at-finalization
promotion path (§5).

**Q3 — is the Odds API event id present?** Partially.
| `provider_games` provider | In-window games mapped |
|---|---|
| balldontlie | **43 / 43** |
| odds_api | **19 / 43** |

BDL can reach every game. The Odds API has an event id for only 19; the other 24
were never mapped (polling died) and would need historical events-discovery first.

## 3. Retention — unconfirmed, and a registered preflight

Not assertable statically. The Odds API historical endpoint is an archive (not a
rolling window), so 19-day-old data is not at age-risk **if** the plan tier
includes historical + additional-markets (player props). But
`V1_GAP_MATRIX.md:150` already carries **"Historical WNBA player-prop coverage
preflight by market/sportsbook (Odds §14.11) — Blocked by validation gate,"** and
line 295 lists historical-snapshot **rights** under the legal gate. Definitive
confirmation = one ~4-credit historical event-odds probe reading
`x-requests-remaining` before/after. **Not run — needs authorization.**

## 4. Cost model (for 5b, if pursued)

`cost = requested_markets × ceil(requested_bookmakers / 10)` = `4 × ceil(8/10)` =
**4 credits per historical event-odds call** (`src/odds/quotaForecast.ts`,
Odds §14.6/§14.7; header authoritative). Bounded to the 19 mapped games →
**~76 credits**, + discovery for up to 24 unmapped games (which may hit the
§14.11 wall). `RESERVE_FLOOR_CREDITS = 1000`. **No Odds API spend authorized.**

## 5. STEP 0 HALT — evidence windows are anchored to `historical_line_results`, not `player_game_stats`

This is the decisive finding and the reason 5a cannot proceed standalone.

**Code path (evidence engine):**
`readModelInputBuilder.ts:237-243` → `readHistoricalGamesForPlayerMarket`
(`readModelInputBuilder.ts:513-535`) reads the engine's threshold-window
observations **`FROM historical_line_results WHERE coverage_state IN
('complete','single_book')`**; each game's `player_stat_value` is
`historical_line_results.player_stat_value` (denormalised from `pgs` at backfill
time). `computeThresholdWindow` (`thresholdWindows.ts`) then takes the last N of
exactly those rows. **A game with a `player_game_stats` row but no
`historical_line_results` row is absent entirely from the engine's windows.** The
Board/Research series reader agrees: `historicalSeriesRead.ts:77` sets
`stat_value = CASE WHEN hlr.internal_game_id IS NOT NULL THEN
hlr.player_stat_value ELSE NULL END` — NULL (ineligible) when no closing line.

**Why restoring pgs does not create hlr:**
- `canonical_closing_points` come from the close-boundary snapshot pipeline;
  absent → `no_closing_line` (`canonicalClosingPoint.ts:82`), excluded from
  `historical_line_results` (`historicalLineResult.ts:12`).
- An initial `player_game_stats` landing enqueues no recomputation:
  `initial_observation` returns `[]`; only `material_correction` fires the writer
  (`recomputationInvalidation.ts:41,60`). Empirically (Q2), hlr stays ~1 of 43.

**The trap.** The ingestion gate I shipped (V1-OP-4) measures **`player_game_stats`
absence**. The evidence engine measures **`historical_line_results`**. They are
different tables. So V1-OP-5a (restore pgs) would:
1. clear the oldest-unresolved-tip → **lift the gate → the Board serves**, while
2. the engine still has **no** post-07-12 `historical_line_results` → it builds
   L5/L10/L20/season from the last games that *do* have a closing line — i.e.
   pre-2026-07-12 games — and serves them as the current profile.

Result: for exactly the players in the gap window, the Board would present
confident directional profiles anchored to weeks-old data (the D-A1 market gate
only checks line recency, not game recency; nothing in the method requires the
most-recent-counted game to be recent). **A partial restore producing
inconsistent evidence is worse than the honest suppression we have now.**

This is a **gate/engine anchor mismatch**: suppression is keyed to a table the
evidence does not depend on. (Registering it as a formal GAP is **deferred per
owner instruction**; recorded here as the root cause.)

## 6. Consequence for the split — 5b is not "deferrable depth"

The original split treated 5b (historical line results) as optional closing-line
*depth*. §5 shows it is **required for the evidence windows to include any
post-07-12 game at all.** And hlr depends on `canonical_closing_points` ←
Odds API historical snapshots (absent), so evidence coherence for the gap window
genuinely depends on the Odds API path — for the 19 mapped games; the 24 unmapped
games cannot get hlr and can only be honestly Unavailable.

## 7. Options for re-ruling (no option executed)

- **A — Couple 5a + 5b.** Restore pgs/finalization **and** hlr together so
  suppression only lifts over coherent evidence. Needs the ~4-credit probe then
  ~76-credit backfill (19 games); the 24 unmapped games stay honestly Unavailable.
  Requires Odds API spend + the §14.11/rights gates.
- **B — 5a data-only, keep suppression (zero credits).** Restore pgs/finalization
  as source-data hygiene (and a prerequisite for any future hlr), but **do not let
  it lift the Board**: teach the suppression to measure what the evidence actually
  depends on (closing-line/hlr coverage), not pgs alone. Honest suppression
  persists until evidence is coherent. Fixes the §5 anchor mismatch; no provider
  spend; launch-safe. **Governor-recommended.**
- **C — Accept honest-Unavailable (NOT recommended).** Only safe if the engine
  provably yields Unavailable/Insufficient (not confident) for gap-window players
  with stale hlr. Current method does not guarantee this — it would be confident
  on stale windows — so this needs a method change and is out of scope.

## 8. Status

- **V1-OP-5a standalone: HELD** pending owner re-ruling (A / B / C).
- **No writes performed. No Odds API spend authorized or made.**
- **V1-OP-5b: parked** behind the ~4-credit probe regardless of the ruling.
- BDL reaches 43/43; the pgs/finalization restore itself is sound and zero-credit
  — the open question is solely whether it may lift suppression before hlr exists.

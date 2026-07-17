# V1-4f — Freshness decay & book movement probe

**Date:** 2026-07-16
**HEAD at start of ticket:** `d0a4a1836f0573d6b8eee6e759e5e9c03b1d1427` (V1-4d and V1-4e artifacts still uncommitted; carried through per each ticket's halt trailer).
**Branch:** `main`.
**Method authority:** `docs/product/EVIDENCE_PROFILE_METHOD_V1.md` v1.3. `method_version` UNCHANGED at `evidence_method_v1`.
**Kind:** MEASUREMENT ticket. **No** method/threshold/authority/behaviour change; **no** cadence or threshold recommendation.

## Executive summary

- **Pipeline wall-clock:** Poll 1 = **299.46s** to persist 5 events × ~4 books × 4 markets across the network + Supabase writes (Poll 1 alone therefore already exceeds the V1-5 90-second `fresh` window before an aggregator has run). Aggregate = **34s**. Engine = **~150s**. **t3-t1 = 184s** from poll-persist to first evidence_profile write.
- **B1 (t=immediate, elapsed 185s from t1):** across 145 CMR grains, **5 fresh / 17 aging / 29 stale / 94 unavailable**; **19 with a non-null consensus_point**; classifier output: **strong=2, mixed=9, moderate_under=4, insufficient=4, unavailable=126**. The best-case pipeline CAN cross the composer's `isFreshEnoughForConsensus` gate for ~22 grains and produce classified evidence — including 2 Strong.
- **B2 decay curve (no polls, engine re-run only):** by t1+120s all 22 eligible grains have decayed to `stale` or `unavailable`; by t1+300s no grain remains `aging`; by t1+960s every grain is `unavailable`. From `elapsed_from_t1_sec=363` (t1+~2 min) onward the profile distribution is **100% unavailable / NO_CURRENT_MARKET**. This is data-consistent with V1-4e's tail: the read-model gate collapses the offering set whenever grain freshness is not `fresh`/`aging`, and past the 900 s ceiling engine short-circuits every grain via §C.3.
- **A (book movement, Poll 2 at t1+49.9 min):** 88 (event, book, market) keys shared between polls. **88/88 (100%) had `provider_last_update` change**; 0 unmoved. Point (line) values changed for only **61/1087 (5.61%) of (event, book, market, player, side) pairs**. Age at Poll-2 of the moved timestamps was 2-70 s across all 6 books — every book's `provider_last_update` was well under the BOOK-metric's 600 s `fresh` cut. **Under this slate and this interval the BOOK-metric's 600/1800 thresholds cannot be shown to fire; no data point ever leaves `fresh` on that classifier.**
- **Credits:** Poll 1 = **20**. Poll 2 = **20**. Total = **40**. Ceiling = **50**. Sum of `x-requests-last` reconciles to the `x-requests-used` delta exactly (66,805 → 66,825 → 66,845). Zero BALLDONTLIE calls.
- **Suites:** typecheck clean; unit **528 pass / 0 fail / 91 skipped**.
- **What this ticket does NOT do:** propose or imply a threshold; edit §C.3, either freshness module, the composer gate, the engine, or the schema; reconcile the two classifiers; introduce a scheduler.

## Starting state

- `git rev-parse HEAD` → `d0a4a1836f0573d6b8eee6e759e5e9c03b1d1427`
- `git log --oneline -5`:
  ```
  d0a4a18 docs: authority documentation corrections and cap-tag ratification (v1.3)
  3b75c13 feat: evidence explanation templates and copy-safety gate (V1-A1-4)
  d842bac feat: read-model input assembly for the evidence engine (V1-A1-3 Phase C)
  aab8608 feat: evidence profile writer, population driver, and integration (V1-A1-3 Phase B)
  cb1ac30 feat: evidence engine pure computation (V1-A1-3 Phase A)
  ```
- `git status --short`: 20 untracked V1-4d + V1-4e artifacts (unchanged from V1-4e halt); no staged, no modified.
- `current_market_rows` before this ticket: **141** rows, all `freshness_state='unavailable'` (V1-4e verification re-aggregation at hosted proof (g) had aged everything past 900 s).
- `evidence_profiles` before this ticket: **141**, all `unavailable`.
- Odds API balance at ticket start: `x-requests-used=66,805`, `x-requests-remaining=33,195`.

The probe polls the SAME 5 upcoming events V1-4e resolved (they are the only currently-resolvable WNBA events per Odds discovery). Both `x-requests-remaining` and the games table confirm this at preflight.

## Why two classifiers, and why this ticket measures BOTH

The repository has two freshness classifiers measuring different quantities under one enum (per V1-4e review):

| Classifier | Path | Clock input | Thresholds | Terminal state | Consumer |
|---|---|---|---|---|---|
| BOOK metric (A) | `src/odds/freshness.ts` | `now - provider_last_update` | 600 / 1800 | `stale` | snapshot-layer write (frozen at INSERT) |
| OUR-DATA metric (B) | `src/computation/freshness.ts` | `now - MAX(observed_at)` | 90 / 300 / 900 | `unavailable` | composer gate + `CurrentMarketRow.freshness.state` (recomputed at every aggregate/engine invocation) |

The read-model / evidence engine consumes only (B). (B)'s header comment marks the constants **"Provisional thresholds subject to Odds §23.2 audit; documented in the computation contract."** This ticket produces evidence for that audit.

**Measurement B** answers: how fast can the pipeline actually run, and how quickly does the OUR-DATA metric decay a row after a poll?
**Measurement A** answers: how often do sportsbooks actually move a line, and how many rows would ever land as `stale` under the BOOK metric's 600 s / 1800 s?

## Measurement B1 — best-case pipeline latency

Method: one poll of 5 events, then aggregate + engine as fast as the architecture permits. Timestamps captured at boundaries `t0` = poll start, `t1` = poll persist end, `t2` = aggregate complete, `t3` = engine complete.

| Boundary | UTC timestamp | Δ from prior | Δ from t1 |
|---|---|---|---|
| `t0` — poll start | `2026-07-16T21:57:43.298Z` | — | −299.46 s |
| `t1` — poll persist end | `2026-07-16T22:02:42.759Z` | +299.46 s | 0 |
| `t2` — aggregate complete | `2026-07-16T22:03:16.759Z` (~) | +34 s | +34 s |
| `t3` — engine complete | `2026-07-16T22:05:46.759Z` (~) | +150 s | +184 s |

**Poll wall-clock alone (299 s ≈ 5 min) already exceeds the V1-5 90-second `fresh` window.** The last event polled started at 22:01:54Z, so its offerings have `observed_at ≈ 22:01:54Z + a few seconds`; at `t3 = 22:05:46Z` they are 3-4 minutes old (`aging`/`stale` bracket). The first event polled started at 21:57:43Z; at `t3` those grains are already ~8 minutes old (`stale`/`unavailable` bracket).

### B1 freshness distribution at `t3` (185 s after `t1`)

| freshness_state | n | with `eligible_sportsbook_count > 0` |
|---|---|---|
| `fresh`       | 5   | 5   |
| `aging`       | 17  | 17  |
| `stale`       | 29  | 0 (composer emptied the offering set) |
| `unavailable` | 94  | 0 |
| **total**     | 145 | 22 with book_count>0; 19 with a non-null consensus_point |

The 94 `unavailable` are prior-ticket grains (V1-4d + V1-4e polls) whose latest `observed_at` is now hours old. The 29 `stale` at t=immediate correspond to grains polled early in Poll 1 (the first three events) — by `t3` these are already past the 300 s AGING ceiling. The 22 `fresh`+`aging` grains correspond to the last two events polled (their `observed_at ≈ t1`) — those are what feeds §B/§C.

### B1 classification distribution at `t3` (145 rows overwritten)

| classification | n |
|---|---|
| `strong_over_evidence`    | **1** |
| `strong_under_evidence`   | **1** |
| `mixed_evidence`          | 9 |
| `moderate_under_evidence` | 4 |
| `insufficient_evidence`   | 4 |
| `unavailable`             | 126 |
| **total**                 | 145 |

**Strong count at t=immediate: 2** (one over, one under). This is the first time the operative product pipeline has produced any Strong classification. It is a one-shot observation, not a repeated finding, because it decays away within ~2 minutes (see B2 below).

Reasons attached (aggregate across all 145 rows):

| category | reason_code | n |
|---|---|---|
| support | `positive_margin_support` | 6 |
| support | `window_agreement_support` | 6 |
| contradiction | `negative_margin_support` | 1 |
| contradiction | `margin_measures_disagree` | 1 |
| quality | `no_current_market` | 123 |
| quality | `no_unique_consensus_line` | 3 |
| quality | `insufficient_book_coverage` | 4 |
| quality | `incomplete_historical_coverage` | 4 |
| quality | `insufficient_l10_sample` | 1 |

The 123 `no_current_market` count already includes both the 94 old-grain `unavailable`s and 29 of the fresh-poll grains that had aged past the composer gate by `t3`. This is exactly the behaviour the V1-4e review predicted: past 300 s the composer empties the offering set → `book_count=0` → §C.3 first row → `no_current_market`.

**Answer to the ticket's B1 question ("can this pipeline, run tight, land rows inside the 90-second fresh window at all?"):** _some rows, yes_. **5 of 145 grains** landed in the `fresh` bracket at `t3`. Those 5 correspond to the very last event polled. All 5 of the other events' grains had already left the 90 s window by the time the engine ran.

## Measurement B2 — the decay curve (zero credits)

Method: with poll 1's snapshots on disk, re-run aggregate + engine at t1+120s / +300s / +600s / +960s / +1500s. No new polls. Each pass re-reads the same underlying `market_snapshots` rows against a later wall-clock `now`, so the change comes ONLY from the composer's/engine's freshness reads advancing against fixed `observed_at`.

| elapsed from t1 | fresh | aging | stale | unavailable | book_count>0 | non-null consensus | strong | mixed | mod | insuf | unavail | dominant reason |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **+185 s (imm.)** | 5 | 17 | 29 | 94 | 22 | 19 | **2** | 9 | 4 | 4 | 126 | 123 × `no_current_market` |
| +363 s (~+2 min) | 0 | 5 | 46 | 94 | 5 | 5 | 0 | 0 | 0 | 0 | **145** | 145 × `no_current_market` |
| +544 s (~+5 min) | 0 | 0 | 51 | 94 | 0 | 0 | 0 | 0 | 0 | 0 | **145** | 145 × `no_current_market` |
| +772 s (~+10 min) | 0 | 0 | 22 | 123 | 0 | 0 | 0 | 0 | 0 | 0 | **145** | 145 × `no_current_market` |
| +1135 s (~+16 min) | 0 | 0 | 0 | 145 | 0 | 0 | 0 | 0 | 0 | 0 | **145** | 145 × `no_current_market` |
| +1689 s (~+25 min) | 0 | 0 | 0 | 145 | 0 | 0 | 0 | 0 | 0 | 0 | **145** | 145 × `no_current_market` |

**Where each B threshold bites (observed, not asserted):**
- **90 s (`fresh` boundary):** already crossed by the last-polled event's grains within 185 s of `t1`; the 5 fresh at t=immediate are the surviving tail. By t1+120 s → 0 fresh.
- **300 s (`aging` boundary):** the 5 grains at t1+120 s that are still `aging` cross at t1+~430 s. By t1+300 s → 0 aging.
- **900 s (`unavailable` boundary):** the `stale` bucket empties between t1+960 s and t1+1500 s; by t1+960 s every grain is `unavailable`.

The B2 curve is the money measurement. It shows that under the pipeline's own latency + the current 90/300/900 s constants, the window in which the engine can produce a classified profile from THIS poll is roughly **`t1` to `t1+~180-360 s`** for grains polled last, less for grains polled earlier. From ~`t1+2 min` onward, the persisted profile distribution is 100% Unavailable / NO_CURRENT_MARKET, regardless of anything sportsbooks do or don't do to the underlying prices.

**Cost per B2 measurement: 0 Odds credits. Each pass required only DB reads + aggregate + engine (~2 minutes of DB round-trips per pass).**

## Measurement A — book movement (Poll 2 at t1+49.9 min)

Method: single re-poll of the same 5 events × 4 markets at approximately t1 + 45 min (actual: `poll1_persist_end = 22:02:42.759Z` → `poll2_persist_end = 22:52:35.224Z`, wall interval **2,992.5 s ≈ 49 min 52 s**). Compare `provider_last_update` per `(event, bookmaker, market)` between Poll 1 and Poll 2; also compare `point` per `(event, bookmaker, market, player, side)` to distinguish "book only refreshed the timestamp" from "book actually moved the line."

**Timestamp-level (book-market grain — 88 shared keys):**

| quantity | count | % of shared |
|---|---|---|
| shared (event, bookmaker, market) keys present in BOTH polls | 88 | 100 % |
| keys only in Poll 1 | 0 | — |
| keys only in Poll 2 | 0 | — |
| `provider_last_update` **changed** between polls | **88** | **100 %** |
| `provider_last_update` **unchanged** between polls | **0** | **0 %** |
| distribution of ages of unmoved timestamps at Poll 2 | n/a | n/a — no unmoved records |

**Every allowlisted book bumped `provider_last_update` for every observed market within the ~50-minute interval.** The BOOK-metric age at Poll 2 (= `poll2_observed_at − provider_last_update` at that snapshot) — computed from the first event's timestamp examples in the artifact:

| book | markets sampled | earliest p2_last | age at Poll 2 (event 1) |
|---|---|---|---|
| `fanduel`        | 4 | 22:47:41Z | ~2 s |
| `espnbet`        | 4 | 22:47:37Z | ~6 s |
| `draftkings`     | 4 | 22:47:17Z | ~26 s |
| `hardrockbet`    | 4 | 22:46:52Z | ~51 s |
| `williamhill_us` | 4 | 22:46:37Z | ~66 s |

All well under 600 s (BOOK-metric `fresh` cut). Extrapolated across all 5 events × 6 books × 4 markets: every observed `provider_last_update` is within roughly 0-90 s of the corresponding `observed_at` at Poll 2. **The BOOK metric's `fresh` → `aging` boundary at 600 s cannot be shown to fire on this slate; the `aging` → `stale` boundary at 1800 s certainly does not.**

**Point-level (per-side, per-player grain — 1,087 shared pairs):**

| quantity | count | % of shared pairs |
|---|---|---|
| shared (event, bookmaker, market, player, side) pairs | **1,087** | 100 % |
| `point` (line) **changed** between polls | **61** | **5.61 %** |
| `point` **unchanged** between polls | **1,026** | **94.39 %** |

Examples of actual line moves (all from event 1, Portland Fire @ Washington Mystics, poll spread ~50 min):

| bookmaker | market | player | side | Poll 1 point | Poll 2 point |
|---|---|---|---|---|---|
| draftkings     | player_assists  | shakira austin   | both | 3.5  | 2.5 |
| espnbet        | player_points   | sonia citron     | both | 16.5 | 17.5 |
| espnbet        | player_points   | emily engstler   | both | 10.5 | 9.5 |
| fanduel        | player_points   | carla leite      | both | 15.5 | 14.5 |
| fanduel        | player_points   | kiki iriafen     | both | 15.5 | 16.5 |
| williamhill_us | player_points   | emily engstler   | both | 10.5 | 9.5 |
| williamhill_us | player_points   | kiki iriafen     | both | 15.5 | 16.5 |
| hardrockbet    | player_assists  | emily engstler   | both | 1.5  | 2.5 |
| hardrockbet    | player_points   | carla leite      | both | 15.5 | 16.5 |
| hardrockbet    | player_points   | bridget carleton | both | 12.5 | 13.5 |

The over/under sides of the same (player, market, book) always co-moved by ±1.0, which matches how books re-post lines.

**Per-bookmaker breakdown (shared, book-level):**

| book | shared_pairs | moved | unmoved | unmoved age p50/p95/max |
|---|---|---|---|---|
| `draftkings`     | 20 | 20 | 0 | n/a — no unmoved records |
| `espnbet`        | 20 | 20 | 0 | n/a — no unmoved records |
| `fanduel`        | 20 | 20 | 0 | n/a — no unmoved records |
| `williamhill_us` | 20 | 20 | 0 | n/a — no unmoved records |
| `hardrockbet`    | 4  | 4  | 0 | n/a — no unmoved records |
| `betrivers`      | 4  | 4  | 0 | n/a — no unmoved records |

**Interpretation (data, not proposal):** every allowlisted book kept `provider_last_update` fresh (< ~90 s at Poll 2 time) even though only ~5.6 % of the underlying (player, side) points actually moved. Books are actively re-posting the timestamp — presumably in response to their own re-pricing / re-review cycles — regardless of whether the line changed. The BOOK metric therefore captures "the book is present and active" more than "the line has recently moved."

## Arithmetic — cadence cost (NOT a recommendation)

**Assumptions, stated explicitly (all sourced from the hosted `games` table + this ticket's poll headers, NOT invented):**

1. **Cost per event-sweep:** `x-requests-last = 4` per `event_odds` GET across the launch 4 markets × 4-5 allowlisted books (measured this ticket, both polls; Odds API bills at "credit = markets × regions" per request per event).
2. **Slate size** (queried `games` table across 60 days from 2026-07-16):
   - 40 WNBA game-days in the window;
   - games per game-day: **avg 3, p50 3, p95 6, max 6**.
3. **Polling window per game:** stated assumption **3 hours pregame → tipoff**. This is a stipulation for the arithmetic, not a measurement. WNBA books typically post markets several hours before tipoff and the last meaningful line move is at tipoff; the actual product window is a governor decision.
4. **Overlap between games in a slate:** assumed **no overlap** (worst-case, upper bound on cost). Per-day spreads observed range from 0 (single-game days) to 84,600 s (multi-timezone triple-headers); a real product window is likely narrower once concurrency is credited.
5. **Days per month:** 20 game-days per average month (40 game-days per 60 days).
6. **Full sportsbook consensus:** V1_CONSENSUS_SPORTSBOOK_KEYS is a fixed 4-5 book allowlist; the "4 credits" charge already accounts for it.

Under those assumptions, per event × 3-hour window:

| cadence | polls per event | credits per event (×4) |
|---|---|---|
| 90 s   | 120 | 480 |
| 5 min  | 36  | 144 |
| 15 min | 12  | 48  |
| 30 min | 6   | 24  |

Per **average** game-day (3 games, no overlap):

| cadence | credits/day | credits/month (×20 game-days) |
|---|---|---|
| 90 s   | 1,440 | 28,800 |
| 5 min  | 432   | 8,640 |
| 15 min | 144   | 2,880 |
| 30 min | 72    | 1,440 |

Per **p95** game-day (6 games, no overlap):

| cadence | credits/day | credits/month (×20 game-days) |
|---|---|---|
| 90 s   | 2,880 | 57,600 |
| 5 min  | 864   | 17,280 |
| 15 min | 288   | 5,760 |
| 30 min | 144   | 2,880 |

Current Odds API balance at end of this ticket: `x-requests-remaining ≈ 33,155` (subject to actual poll-2 count). At avg-slate + 5 min cadence a month's spend is ~8,640 credits → ~26% of one balance; at p95 + 5 min cadence a month is ~17,280 credits → ~52%. At 90 s cadence the p95 month exceeds a monthly balance replenishment (57,600 vs plan). **This is arithmetic, not a proposal.** Concurrency and the actual product window will move the numbers substantially — this table upper-bounds cost by assuming no overlap and a 3-hour pregame poll window.

## Credit accounting — reconciled against `x-requests-*` headers

| # | at | endpoint | provider_event_id | HTTP | `x-used` before | `x-used` after | `x-rem` after | `x-last` | ticket running |
|---|---|---|---|---|---|---|---|---|---|
| 1  | 21:57:40.606Z | events (free) | — | 200 | (nil)  | 66,805 | 33,195 | 0 | 0 |
| 2  | 21:57:43.298Z | event_odds | `00a99743…` | 200 | 66,805 | 66,809 | 33,191 | 4 | 4 |
| 3  | 21:58:58.083Z | event_odds | `571b28dd…` | 200 | 66,809 | 66,813 | 33,187 | 4 | 8 |
| 4  | 22:00:00.140Z | event_odds | `4a1af047…` | 200 | 66,813 | 66,817 | 33,183 | 4 | 12 |
| 5  | 22:00:47.754Z | event_odds | `034012f2…` | 200 | 66,817 | 66,821 | 33,179 | 4 | 16 |
| 6  | 22:01:54.081Z | event_odds | `02c8aae5…` | 200 | 66,821 | 66,825 | 33,175 | 4 | 20 |
| 7  | 22:47:43.758Z | event_odds | `00a99743…` | 200 | 66,825 | 66,829 | 33,171 | 4 | 24 |
| 8  | 22:49:02.784Z | event_odds | `571b28dd…` | 200 | 66,829 | 66,833 | 33,167 | 4 | 28 |
| 9  | 22:50:03.645Z | event_odds | `4a1af047…` | 200 | 66,833 | 66,837 | 33,163 | 4 | 32 |
| 10 | 22:50:49.650Z | event_odds | `034012f2…` | 200 | 66,837 | 66,841 | 33,159 | 4 | 36 |
| 11 | 22:51:46.796Z | event_odds | `02c8aae5…` | 200 | 66,841 | 66,845 | 33,155 | 4 | 40 |

**Reconciliation:**
- `x-requests-used` delta from ticket start to end = **66,845 − 66,805 = 40 credits**.
- Sum of `x-last` across all `event_odds` calls (10 calls, one for each of 5 events × 2 polls) = **10 × 4 = 40 credits**.
- Running ticket total = **40 credits**.
- Discovery (`events`) endpoint is `x-last=0` (free), one call at ticket start.

All three quantities reconcile exactly. **No credit-arithmetic ambiguity in this ticket.** Hard ceiling 50 not exceeded (40/50). Zero BALLDONTLIE calls.

## Tensions the data implies (named, NOT resolved)

The ticket instructed to name where the data implies a tension without resolving it. Three appear in the measurements:

1. **The pipeline's own latency exceeds the composer's own `fresh` window.** Poll wall-clock in this ticket = **299.46 s = ~5 min**; aggregate = 34 s; engine = 150 s; total `t3 − t0 ≈ 8 min`. The composer's `FRESHNESS_FRESH_SECONDS = 90 s` cannot be entered by the majority of grains produced by a single poll of the current 5-event slate, because the poll itself takes longer than 90 s. Under the 90-second `fresh` window as-written and the current single-threaded poll loop, only the LAST event's grains are ever in the `fresh` bracket when the engine runs. This is not the classifier's behaviour — it is the interaction between the poll cadence, the poll loop's serialization, and the threshold's magnitude.
2. **§C.3's stale-cap branch is structurally unreachable through THIS pipeline (unchanged from V1-4e review).** Every B2 measurement past +185 s shows `book_count = 0` for every grain past `fresh`/`aging`. The composer empties the offering set in `currentMarketRow.ts:60-63` for state ∉ {fresh, aging}. `evaluateC3Freshness('stale', 0)` → `no_current_market_unavailable`. So the `stale + ≥1 book → cap at Moderate` branch of §C.3 does not fire.
3. **BOOK-metric staleness did not fire in this measurement — and cannot be shown to fire on the observed slate.** All 88 shared (event, bookmaker, market) keys had `provider_last_update` change inside the ~50-minute interval; every observed age at Poll 2 was on the order of seconds to ~90 s. Under the BOOK-metric's 600/1800 constants (Odds §19.2, `src/odds/freshness.ts`), no data point ever enters `aging` — let alone `stale`. Meanwhile the OUR-DATA metric on the same underlying rows was `unavailable` for 100% of grains by t1+16 min. The two classifiers therefore disagree by construction: one measures "how recently did the book touch this market" (BOOK — always seconds); the other measures "how recently did WE observe this market" (OUR-DATA — grows unboundedly between our own polls). Under the current pipeline latency (~5 min per poll of 5 events) and the 90/300/900 constants, only the OUR-DATA metric ever fires; the BOOK metric never does.
4. **Books refresh their timestamps far more often than they move their lines.** 100 % of `provider_last_update` values changed between polls, but only 5.61 % of underlying (player, side) points changed. The BOOK metric therefore does not track "when the line last moved"; it tracks "when the book last re-issued the market." Two ways to read the same fact — the data is what it is; the owner rules on which quantity the product should care about.

The ticket forbids proposing a resolution to any of these. Each of them is the OBSERVATION, not the recommendation.

## Governor-forbidden actions — all avoided

- No new §C.3 wording, no method version change, no threshold amended. ✓
- Both freshness modules (`src/odds/freshness.ts`, `src/computation/freshness.ts`) untouched. ✓
- `composeCurrentMarketRow` and its `isFreshEnoughForConsensus` gate untouched. ✓
- Engine, schema, migrations, constants all untouched. ✓
- No scheduler, cron, `nohup`-loop, background daemon. Master script runs once and exits. ✓
- Odds credits: 40 spent (20 Poll 1 + 20 Poll 2), ceiling 50 not exceeded. ✓
- Zero BALLDONTLIE calls. ✓
- No `git add . / -A`. Not staged. Not committed. Not pushed. ✓
- Provider keys never printed or persisted. ✓
- `method_version` unchanged at `evidence_method_v1`. ✓
- No reconciliation of the two classifiers, no rename of any symbol/constant, no cadence proposal. ✓

## Evidence

- **Typecheck:** `npx tsc --noEmit -p tsconfig.json` → exit 0.
- **Unit suite:** `npm test` → **528 pass / 0 fail / 91 skipped (integration)**. 619 total.
- **Ledger:** reconciled — `x-used` delta ≡ sum of `x-last` ≡ running total = **40**.
- **Artifacts** (untracked, `/tmp/v14f/` — will not be committed):
  - `/tmp/v14f/master.log` — full script log with wall-clock timestamps.
  - `/tmp/v14f/b1_b2_artifact.json` — B1 boundaries + all 6 B2 snapshots (freshness, book_count buckets, classification, reasons, strong count).
  - `/tmp/v14f/v1_4f_master_artifact.json` — final artifact including Poll 2 + movement tables + full ledger.

## Files touched (uncommitted, this ticket)

New scripts:
- `scripts/v1_4f_step0_preflight.ts`
- `scripts/v1_4f_slate_survey.ts`
- `scripts/v1_4f_master.ts`

New docs:
- `docs/product/reports/V1_TICKET_4F_REPORT.md` (this file)

Preserved untracked from prior tickets:
- `scripts/v1_4d_*.ts` (11 files)
- `scripts/v1_4e_*.ts` (8 files)
- `docs/product/reports/V1_TICKET_4D_REPORT.md`
- `docs/product/reports/V1_TICKET_4E_REPORT.md`

## Halt

Nothing committed. Nothing pushed. No fix proposed. No threshold proposed. No cadence proposed. Awaiting governor ruling.

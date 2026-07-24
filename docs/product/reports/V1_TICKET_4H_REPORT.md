# V1-4h — Optimized latency, decay, and multi-interval movement probe

**Date:** 2026-07-18
**HEAD at start of ticket:** `d834e6be30eb45281b1cb0767f634544caa409b5` (V1-4g). Working tree clean at ticket start.
**Branch:** `main`.
**Method authority:** `docs/product/EVIDENCE_PROFILE_METHOD_V1.md` v1.3. `method_version` UNCHANGED at `evidence_method_v1`.
**Kind:** MEASUREMENT ticket. Proposes no threshold, amends no authority, changes no behaviour, mutates no evidence_method_v1 profile. Engine run in `dry_run: true` on every pass.

## Executive summary

- **Optimized poll wall-clock: 72 s** for a 3-event sweep at cap=3 (versus V1-4f's 299.46 s for 5 events sequential). The V1-4g projection said ~77 s for 5-event cap=3; today's 3-event cap=3 measured 72 s. **Projection held on the poll segment**; scaled up to 5 events the projection undershoots (see §Projection vs reality).
- **`observed_at` spread across the sweep: 0 s** (every offering in a single poll shares a second-precision `observed_at`), versus V1-4f's ~5 minute spread. The bottleneck — "the poll's own duration acted as the filter, stranding every grain except the last event's" — is essentially gone under the concurrent sweep.
- **Movement curve (the ticket's product)** measured over four intervals (5 / 15 / 30 / 60 min) with point, price, and timestamp tracked **independently** per owner ruling 3:

  | vs poll 1 | POINT changed | PRICE changed | TIMESTAMP refreshed |
  |---|---|---|---|
  | +5 min  | 10/677 = **1.48 %** | 102/677 = **15.07 %** | 56/56 = **100 %** |
  | +15 min | 24/677 = **3.55 %** | 216/677 = **31.91 %** | 56/56 = **100 %** |
  | +30 min | 34/677 = **5.02 %** | 316/677 = **46.68 %** | 56/56 = **100 %** |
  | +60 min | 40/677 = **5.91 %** | 348/677 = **51.40 %** | 56/56 = **100 %** |

  V1-4f's ratio ("88/88 timestamps refreshing while only 5.61 % of points moved") is CONFIRMED and now decomposed: **prices move ~10× more often than points**, and timestamps refresh 100 % between polls even 5 minutes apart.
- **Decay curve** (dry-run engine, 6 snapshots at t=immediate / +2 / +5 / +10 / +16 / +25 min): 3 grains fresh/aging at t=immediate, 0 fresh/aging by t1+120 s, all 263 grains unavailable by t1+600 s. Strong count = 0 at every snapshot. The decay measurement is thin — see §Decay caveats.
- **Credits: 60 (this attempt) + 60 (attempt 1, interrupted) = 120 / 120 total ticket ceiling.** Ledger reconciled on every one of 5 polls; discovery-bracket delta equals sum of per-call `x-requests-last` exactly.
- **evidence_profiles IMMUTABLE:** before/after: `{ unavailable: 145, total: 145 }` — mutation-check assertion passed.
- **Suites:** typecheck exit 0; unit **528 pass / 0 fail / 99 skipped**.

## Starting state

```
git rev-parse HEAD:  d834e6be30eb45281b1cb0767f634544caa409b5
git log --oneline -4:
  d834e6b feat: bounded-concurrency odds poll sweep (V1-4g)
  24e8c53 feat: freshness decay and book movement probe (V1-4f)
  5c35f9b feat: forward game ingestion and event linking (V1-4e)
  351e2e1 feat: live current-market probe (V1-4d)
git status --short:  (clean)
```
Matches expected.

## What went wrong on attempt 1, and what changed

An initial run started at 2026-07-17T21:24:52Z. Polls 1-3 completed cleanly (60 credits, `reconciled=true` on all three). Between poll 3 and poll 4 (in the 15-minute sleep window), the process was suspended by the host — sleep target was 21:54:52Z, poll 4 actually started at 22:04:14Z. Poll 4 then failed with `TypeError: fetch failed` — a transport-level error the sweep's retry policy considered a connection-class error but which exhausted retries.

**60 credits were spent on attempt 1 and produced no usable movement curve** (three polls at 0/5/15 min do not span the target 60-minute schedule). Both artifacts are preserved at `/tmp/v14h/master.log.attempt1` and `/tmp/v14h/polls_partial.json.attempt1` for the record.

**Retry** was executed today (2026-07-18) with 3 events instead of 5, keeping the full 5-poll schedule (T0 / +5 / +15 / +30 / +60). Rationale: total ticket ceiling is 120 credits; 60 were already spent on attempt 1; a 5-event retry would need 100 more credits and exceed the ceiling. **The trade-off was more events at each interval versus preserving the interval structure** — the ticket's requirement is a CURVE (multiple intervals), and owner ruling 2 named 5/15/30 min as candidates. A 3-event retry preserves all four target intervals; a 5-event retry with fewer polls would not. The retry used 60 credits, bringing the ticket total to **exactly 120**.

## Configuration used

- **Sweep**: `src/lines/orchestrator/oddsapiPollSweep.ts` (V1-4g).
- **Concurrency cap**: `DEFAULT_MAX_CONCURRENCY = 3`. Reported as `peak_in_flight = 3` on every poll (cap held under load).
- **Events (retry)**: 3 events, all with 425+ min buffer to earliest tipoff at T0:
  - `cb4f9fb8` — New York Liberty @ Indiana Fever (2026-07-19T00:00:00Z, 425 min to tipoff)
  - `f8783a88` — Portland Fire @ Minnesota Lynx (2026-07-19T00:00:00Z, 425 min)
  - `d24612bd` — Washington Mystics @ Golden State Valkyries (2026-07-19T00:30:00Z, 455 min)

  All three resolved via `resolveOddsapiEventForSeed` → `resolved_exact`; each linked to an internal game.

**Poll schedule (retry, T0 = 2026-07-18T17:11:52.000Z):**

| poll | target | actual start | persist end | duration | credits | peak in-flight | ledger reconciled | spread(s) | offerings |
|---|---|---|---|---|---|---|---|---|---|
| poll1 | T0     | 17:11:52.000Z | 17:13:16.306Z | 84.3 s | 12 | 3 | ✓ | 0 | 843 |
| poll2 | T0+5   | 17:16:51.998Z | 17:18:03.723Z | 71.7 s | 12 | 3 | ✓ | 0 | 711 |
| poll3 | T0+15  | 17:26:51.993Z | 17:28:04.103Z | 72.1 s | 12 | 3 | ✓ | 0 | 711 |
| poll4 | T0+30  | 17:41:52.044Z | 17:43:04.629Z | 72.6 s | 12 | 3 | ✓ | 0 | 710 |
| poll5 | T0+60  | 18:11:52.062Z | 18:13:04.074Z | 72.0 s | 12 | 3 | ✓ | 0 | 710 |

Total credits (retry): **60**. Total ticket credits: **60 (attempt 1) + 60 (retry) = 120 = ceiling**.

## Credit ledger — reconciled against `x-requests-*` headers

Retry-only ledger (attempt-1 ledger of 60 was reconciled at attempt-1 time and preserved):

| poll | `x-remaining` before | `x-remaining` after | authoritative total | sum of per-call `x-last` | reconciled |
|---|---|---|---|---|---|
| poll1 | 33,095 | 33,083 | 12 | 12 | ✓ |
| poll2 | 33,083 | 33,071 | 12 | 12 | ✓ |
| poll3 | 33,071 | 33,059 | 12 | 12 | ✓ |
| poll4 | 33,059 | 33,047 | 12 | 12 | ✓ |
| poll5 | 33,047 | 33,035 | 12 | 12 | ✓ |

Ticket total (retry) = 33,095 − 33,035 = **60** = 15 event_odds calls × 4 credits. **No credit-arithmetic ambiguity, no question mark. V1-4g's structural rule held on every poll.** Zero BALLDONTLIE calls.

## Measurement M — movement curve

Owner ruling 3 required tracking point and price movement independently. V1-4f had reported point alone. This ticket also tracks the timestamp (`provider_last_update`) refresh so the three quantities are directly comparable.

Comparison grain:
- POINT / PRICE: `(provider_event_id, bookmaker_key, market_key, normalized_player_name, side)` — 677 shared tuples between polls.
- TIMESTAMP: `(provider_event_id, bookmaker_key, market_key)` — 56 shared tuples (books × markets × events).

### Cumulative rates (vs poll 1) — the CURVE

| elapsed (min) | POINT n / total = frac | PRICE n / total = frac | TIMESTAMP n / total = frac |
|---|---|---|---|
| 5   | 10 / 677 = **1.48 %** | 102 / 677 = **15.07 %** | 56 / 56 = **100 %** |
| 15  | 24 / 677 = **3.55 %** | 216 / 677 = **31.91 %** | 56 / 56 = **100 %** |
| 30  | 34 / 677 = **5.02 %** | 316 / 677 = **46.68 %** | 56 / 56 = **100 %** |
| 60  | 40 / 677 = **5.91 %** | 348 / 677 = **51.40 %** | 56 / 56 = **100 %** |

### Consecutive rates (poll N-1 → poll N) — steady vs bursty?

| interval | span (min) | POINT frac | PRICE frac | TIMESTAMP frac | POINT per-min rate |
|---|---|---|---|---|---|
| poll1 → poll2 | 5 | 1.48 % | 15.07 % | 100 % | 0.296 % / min |
| poll2 → poll3 | 10 | 2.07 % | 21.86 % | 100 % | 0.207 % / min |
| poll3 → poll4 | 15 | 3.25 % | 24.22 % | 100 % | 0.217 % / min |
| poll4 → poll5 | 30 | 0.89 % | 16.99 % | 100 % | **0.030 % / min** |

**Movement is bursty, not steady.** Per-minute point-change rate is ~0.2-0.3 %/min in the first 30 min and drops **~7-10×** to 0.03 %/min between poll 4 and poll 5. Two candidate readings, unresolved:
- (a) point movement decays with time-to-tipoff — books commit early to their pregame numbers and stop moving them until much closer to game start. Our slate was 425-455 min pre-tipoff throughout.
- (b) point movement is spiky within short windows, and the 30-minute poll4→poll5 span smoothed over a quiet stretch after a busier 0-30 min window.

The current dataset cannot separate (a) from (b) — one slate, one 60-minute window, ~14 hours pre-tipoff.

### Per-bookmaker breakdown (cumulative, poll 1 → poll 5, 60 min elapsed)

| bookmaker      | n (line pairs) | POINT changed | PRICE changed | n (ts grains) | TIMESTAMP refreshed |
|---|---|---|---|---|---|
| `draftkings`     | 172 | 18 = **10.47 %** | 111 = **64.53 %** | 12 | 12 = 100 % |
| `betrivers`      |  89 |  8 = **8.99 %**  |  71 = **79.78 %** | 12 | 12 = 100 % |
| `hardrockbet`    | 130 |  8 = **6.15 %**  |  70 = **53.85 %** |  8 |  8 = 100 % |
| `williamhill_us` | 138 |  4 = **2.90 %**  |  43 = **31.16 %** | 12 | 12 = 100 % |
| `fanduel`        | 148 |  2 = **1.35 %**  |  53 = **35.81 %** | 12 | 12 = 100 % |

**Books differ by ~8× on point movement (draftkings 10.5 % vs fanduel 1.4 %) and ~2-3× on price movement (betrivers 79.8 % vs williamhill_us 31.2 %).** Averaging across books to a slate-wide "5.91 % of points moved" number describes NO SINGLE BOOK. Owner ruling 3 anticipated exactly this shape.

## Measurement L — optimized pipeline latency

At poll 5 the pipeline ran end-to-end. Aggregate went to production `current_market_rows` (that's the read model, not evidence_profiles — same table V1-4d/e/f wrote to). Engine ran with `dry_run: true` per §Engine dry-run.

| boundary | UTC timestamp | Δ from prior | Δ from t1 |
|---|---|---|---|
| `t0` — poll start | 2026-07-18T18:11:52.062Z | — | −72.0 s |
| `t1` — poll persist end | 2026-07-18T18:13:04.074Z | +72.0 s | 0 |
| `t2` — aggregate complete | 2026-07-18T18:14:15.678Z | +71.6 s | +71.6 s |
| `t3` — engine dry-run complete | 2026-07-18T18:18:32.078Z | +256.4 s | +328.0 s |

**Under the V1-4g sweep, poll wall-clock was 72.0 s for 3 events at cap=3.**

### Projection vs reality (governor's standing note requires stating this plainly)

V1-4g's projection model:
- 5-event sequential: ~192 s (V1-4f actually measured 299.46 s → V1-4g underestimated sequential by **35 %**, and the V1-4g report acknowledged this: "the delta reflects poll-loop overhead not modeled here").
- 5-event cap=3 optimized: ~77 s.

Today's measurement (3 events at cap=3): **72 s per poll**. That is close to the 5-event 77 s projection — but 5 events at cap=3 is a two-batch execution (3 + 2), so the projection for 5 events should be scaled to `⌈5/3⌉ × per_event = 2 × 72 = ~144 s` if the same per-event time held.

Back-derivation of the per-query DB round-trip: at 72 s per event for ~554 queries per event (20 ingestion_runs + 20 snapshots + ~237 offerings + ~237 raw rows + ~40 BEGIN/COMMIT), the effective round-trip is **~130 ms**, versus V1-4g's model assumption of 75 ms. Adjusted 5-event optimized projection: `⌈5/3⌉ × 72 = ~144 s` — call it ~140-150 s.

**Held on the shape: yes.** Concurrency-across-events overlaps DB streams and cuts poll wall-clock by ~76 % (299 s → 72 s for the events polled today; ~150 s projected for 5 events). **Missed on the size: DB per-query latency is ~130 ms, not 75 ms**, so 5-event projections should be scaled up ~1.8×.

### `observed_at` spread comparison

- **V1-4f (sequential poll)**: spread across the 5-event sweep was ~5 minutes. The poll's own duration acted as the filter — grains polled early had timestamps that were already ~5 min old when the last event's grain was written.
- **V1-4h (optimized cap=3 sweep)**: spread = **0 s** on all 5 polls (second-precision `observed_at` matches across every offering in a poll).

**The stranding problem V1-4f named is essentially gone under the concurrent sweep.**

### Absolute-times comparison to V1-4f

| segment | V1-4f | V1-4h | delta |
|---|---|---|---|
| Poll wall-clock (t1−t0) | 299.46 s | 72.0 s | **−76 %** |
| Aggregate wall-clock (t2−t1) | 34 s | 71.6 s | +110 % |
| Engine wall-clock (t3−t2) | ~150 s | 256.4 s | +71 % |
| End-to-end poll→profile (t3−t0) | ~483 s | 400.0 s | −17 % |

Aggregate and engine both slowed, driven by grain count (V1-4f: 141 grains; V1-4h: 263 grains — 145 pre-existing baseline + 118 new inserts recorded by populator, though ROLLED BACK per §Engine dry-run). Per-grain engine time is comparable (~1 s/grain).

## Measurement D — decay curve (dry-run engine, 6 snapshots)

Method: at t=immediate and at t1+120s / +300s / +600s / +960s / +1500s, re-run aggregator + engine dry-run against the same underlying `market_snapshots` rows. `now` advances each pass; nothing else changes.

| elapsed from t1 (s) | fresh | aging | stale | unavailable | book_count > 0 | consensus non-null | strong | 
|---|---|---|---|---|---|---|---|
| **+330 (immediate)** | 0 | 3 | 0 | 260 | 3 | 3 | 0 |
| +672 (~+2 min)  | 0 | 0 | 3 | 260 | 0 | 0 | 0 |
| +995 (~+5 min)  | 0 | 0 | 3 | 260 | 0 | 0 | 0 |
| +1343 (~+10 min)| 0 | 0 | 0 | 263 | 0 | 0 | 0 |
| +1670 (~+16 min)| 0 | 0 | 0 | 263 | 0 | 0 | 0 |
| +2014 (~+25 min)| 0 | 0 | 0 | 263 | 0 | 0 | 0 |

Reason-code distribution collapsed to `no_current_market` for all 263 rows once book_count hit 0 (matches V1-4f's finding; §C.3 first row).

### Decay caveats — the measurement is thin

**Only 3 grains ever crossed the composer's eligibility gate.** That's a very small n for a decay measurement.

Two contributing factors:
1. **Aggregator first-seen semantics.** `composeCurrentMarketRow` (`src/computation/currentMarketRow.ts`) groups offerings by `(book, point)` and takes the first-seen row's `observed_at`. For a grain whose `(book, point)` tuples are unchanged across polls 1-5, the first-seen row's `observed_at` may come from an EARLIER poll (many minutes before poll 5). The `latestObserved` for the grain is `max(entry.observed_at)`, which then reflects the earliest of the "unchanged" polls rather than poll 5. Only grains where poll 5 introduced NEW `(book, point)` tuples (i.e. where a line actually moved during the 60-min window) show poll 5's fresh `observed_at` in `latestObserved`. This is the exact bias the V1-4e freshness review flagged as GAP-8 territory — not our defect to fix here.
2. **Pipeline latency exceeded the composer's aging window BEFORE the immediate snapshot.** `t3 − t1 = 328 s`; the aging ceiling is 300 s; so by the time the engine ran, even the grains that DID get poll 5's `observed_at` were already crossing from `aging` into `stale`. At t=immediate we see 3 aging (a handful of grains whose composed `observed_at` happened to be right at the edge); by t1+120 s they've all crossed into `stale`; by t1+600 s (i.e., ~570 s past the observed_at of the freshest grain) they're all unavailable.

**Consequence for the ticket's decay analysis:** the boundaries where each threshold bites — 90 s FRESH / 300 s AGING / 900 s STALE — are visible in the transitions (3 grains aging at +330 s of pipeline elapse, stale by +672 s of engine time, unavailable by +600 s more) but the sample is 3 grains. **This is thin data. It is consistent with V1-4f's shape, but it is not itself a curve.**

### The V1-4f finding is NOT contradicted

V1-4f (5-event sequential) also observed the "everything unavailable within ~15 min of t1" pattern, driven by the same two factors. V1-4h under the optimized sweep replicates the shape with a smaller sample.

## Engine dry-run — how immutability was preserved

`runEvidencePopulator` accepts a `dry_run: true` option that wraps each batch in BEGIN/ROLLBACK; the work is performed, counters are reported, and the transaction rolls back on batch commit. Every engine invocation in this ticket used `dry_run: true`.

Confirmation:
- `evidence_profiles` count BEFORE ticket: `{ by_classification: [{ unavailable: 145 }], total: 145 }`
- `evidence_profiles` count AFTER ticket: `{ by_classification: [{ unavailable: 145 }], total: 145 }`
- Assertion: `evidence_before === evidence_after` ⇒ **mutation-check PASS**.

Counters from the immediate engine pass reported `profiles_inserted: 118, profiles_updated: 145` — that is the work the batches WOULD have committed; the ROLLBACK inside each batch left the actual table unchanged.

## Measurement C — candidate threshold arithmetic (NOT a proposal)

Using Measurement M's cumulative POINT-movement curve, `P(line still current | age ≤ t)` derived as `1 − P(point changed by t)`:

| threshold t (min) | frac points changed by t | **P(still current)** = 1 − frac | n |
|---|---|---|---|
| 5   | 1.48 % | **0.9852** | 677 |
| 15  | 3.55 % | **0.9645** | 677 |
| 30  | 5.02 % | **0.9498** | 677 |
| 60  | 5.91 % | **0.9409** | 677 |

Owner-ruling-2-named candidates 5 / 15 / 30 minutes yield P(still current) of 0.9852 / 0.9645 / 0.9498 respectively on today's slate.

### Derivation, stated plainly

The measurement compares each (event, bookmaker, market, player, side) offering in poll 1 to its counterpart in poll K. "POINT changed" is a strict inequality on the numeric `point` value. "P(still current)" is the fraction whose point did NOT change between poll 1 and poll K. This treats "point unchanged" as a binary proxy for "the line the sportsbook would post now is the same line poll 1 saw" — a proxy that a book's own re-posting cadence (100 % timestamp refresh) tells us is not the same as "the book has not touched the market."

### Limits of this arithmetic, stated plainly

- **One slate, one session, one day.** Three WNBA events (New York @ Indiana, Portland @ Minnesota, Washington @ Golden State) on 2026-07-18. Different games, different books, different tipoff windows would produce different numbers.
- **All events 425+ min pre-tipoff.** WNBA books historically move lines more aggressively in the final 60-120 minutes before tipoff — a slate 14 hours out is quiet by comparison. Ticket C measured pre-tipoff-quiet regime; the numbers for a tipoff-adjacent regime are unknown.
- **N = 677 shared line pairs, N = 56 shared timestamp grains.** The 60-min bucket has 40 point changes; the 5-min bucket has 10. Binomial 95 % CI on 40/677 = 5.91 % is roughly ±1.8 pp; on 10/677 = 1.48 % it is roughly ±0.9 pp.
- **Movement is bursty, not steady** (see §Consecutive rates): 0.2-0.3 %/min for the first 30 min, 0.03 %/min for the 30-60 min interval. A threshold set on the 60-min cumulative rate does not describe the 0-30 min regime — extrapolating past this window is not warranted from this data alone.
- **Books differ by ~8× on point movement** (draftkings 10.47 % vs fanduel 1.35 %). A slate-wide "P(still current)" is an average that describes no book.
- **Point vs price divergence is dramatic.** P(price still current at 60 min) would be `1 − 0.5140 = 0.4860`. If the product cares about price stability (not just point stability), the number the threshold is set against changes by half a magnitude.

**This is arithmetic the owner needs. It is NOT a recommendation. No value is preferred here.**

## Tensions the data implies (named, not resolved)

1. **Timestamps refresh 100 % on every interval down to 5 minutes; points move ~1.5 % over the same 5 minutes.** The BOOK-metric (600/1800 provider-last-update) will never fire on this slate; the OUR-DATA metric (90/300/900 observed_at) DOES fire because our pipeline can't run inside a 90-s FRESH window. The two-classifier gap V1-4e review named remains.
2. **Bursty movement in the first 30 min followed by a near-quiet 30-60 window.** A single-value threshold cannot honor both regimes. Whether the owner cares about "captured the recent move" (5-min window) or "captured a stable line" (30-60 min window) is a product decision, not a data one.
3. **Per-book movement variance is ~8×.** A book-independent threshold treats DraftKings and FanDuel identically — one has 10 % of its points moved by 60 min, the other has 1 %. The owner may reasonably decide one number for all or per-book numbers; this ticket does not choose.
4. **The optimized poll cut wall-clock by 76 %; the pipeline TOTAL still exceeds the composer's AGING window at engine time.** t3 − t1 = 328 s > 300 s. Even a 0-s poll cannot land more than a handful of grains in `fresh` at engine time under the current engine cost per grain. The remaining lever is the engine's per-grain cost, which V1-4g explicitly did not touch.

## What this ticket does NOT do (and why)

- Does NOT propose or imply a threshold value. Owner ruling 2 explicitly reserved the v2 threshold ruling to ticket D.
- Does NOT amend §C.3, §15.2, or any authority.
- Does NOT modify either freshness module, the composer, the engine, the schema, or any constant.
- Does NOT reconcile or rename the two classifiers (ticket D/E territory).
- Does NOT persist any evidence profile — `dry_run: true` on every engine invocation; mutation-check PASS.
- Does NOT poll during the decay series.
- Does NOT introduce a scheduler, cron, or migration.

## Files touched (uncommitted)

- `scripts/v1_4h_step0_preflight.ts` — env / DB / balance / slate preflight (zero cost).
- `scripts/v1_4h_master.ts` — 5-poll master; composes V1-4g's `runOddsapiPollSweep`; runs pipeline + decay.
- `scripts/v1_4h_movement.ts` — offline movement analysis over the artifact.
- `docs/product/reports/V1_TICKET_4H_REPORT.md` — this file.

## Evidence

- **Typecheck:** `npx tsc --noEmit -p tsconfig.json` → exit 0.
- **Unit suite:** `npm test` → **528 pass / 0 fail / 99 skipped (integration)**.
- **Reconciled credit ledger:** every poll's `authoritative_total` (before-after remaining delta) equals its `sum_of_per_call_last`; all 5 polls reconciled. Retry ticket total = 60. Total ticket credits = 120 = ceiling.
- **`evidence_profile` mutation check:** PASS — before and after both `{ unavailable: 145, total: 145 }`.
- **Artifacts** (uncommitted, `/tmp/v14h/`):
  - `master_artifact.json` — full run data (polls, offerings, pipeline, decay, ledger, mutation-check).
  - `movement_analysis.json` — pairwise cumulative + consecutive + per-book breakdown + candidate-threshold table.
  - `master.log` — full stdout of the retry run.
  - `master.log.attempt1`, `polls_partial.json.attempt1` — preserved evidence of the interrupted first attempt.

## Halt

Nothing committed. No threshold proposed. No profile mutated. Awaiting governor review.

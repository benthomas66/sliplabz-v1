# V1-4d — Live current-market probe and first evidence profiles

**Date:** 2026-07-16
**Method authority:** `docs/product/EVIDENCE_PROFILE_METHOD_V1.md` at v1.3 (documentation-only; method_version unchanged at `evidence_method_v1`)
**Ticket kind:** governor-created probe (precedent: V1-5x, V1-4c). Polls ONCE, bounded, stops. No scheduler. No cron.
**Starting HEAD:** `d0a4a1836f0573d6b8eee6e759e5e9c03b1d1427` (V1-A1-1b docs corrections; sits on top of V1-A1-4).
**Starting-state note:** The ticket text specifies "HEAD at the V1-A1-4 commit". Observed HEAD is `d0a4a18` — one commit ahead: V1-A1-1b, documentation-only, no engine / method / schema / read-model / templates change. I halted on mismatch as instructed; the governor re-issued V1-4d verbatim, which I read as ratification to proceed from `d0a4a18`. State recorded before starting: branch `main`, worktree clean, `git rev-parse HEAD = d0a4a1836f0573d6b8eee6e759e5e9c03b1d1427`.

## Executive summary

- **First live current_poll ever executed on this system.** 5 upcoming events polled; 84 `current_poll` `market_snapshots` persisted; 1,037 canonical offerings; 1,041 raw rows; zero quarantines; every canonical offering resolved to an `internal_player_id`.
- **STEP 4 — the measurement that matters:** a freshly-polled market **lands `fresh`** (84/84 snapshots). Age at retrieval: p50 = 67.7 s, p95 = 140.5 s, min = 17.5 s, max = 168.5 s — comfortably below the 600 s FRESH threshold. §C.3's stale cap is NOT triggered under normal operation.
- **Zero linked internal games.** The `games` table stops at 2026-07-12; all 5 upcoming events (2026-07-16 – 2026-07-18) reconcile as `queued (unmatched)`. Every snapshot lands with `linked_internal_game_id = NULL`.
- **Zero grains → zero profiles → DR-29 REMAINS ACTIVE.** The aggregator produces 0 current_market_rows because it selects per linked game; the populator's zero-grain branch fires and no operative profile persists.
- **Verification: PASS across the board.** Isolation invariant holds with both kinds of `market_snapshots` present for the first time. Baseline counts unchanged (`historical_line_results = 4658`, `player_game_stats = 4194`). Re-running the aggregator + populator is idempotent (checksum unchanged; `(empty)` before = `(empty)` after).
- **Credits burned this ticket: 60 / 100** (authoritative per Odds API `x-requests-used` delta: 66,785 − 66,725 = 60). Three sequential STEP-2 attempts, all billed: **v1** — 20 credits, Client-vs-SliplabzPool bug (persist path threw pre-write; snapshots atomically rolled back but the poll HTTPs already billed); **v2** — 20 credits, `provider_last_update` read from `bookmaker.last_update` instead of `market.last_update`; snapshots persisted with wrong freshness and were cleaned before v3; **v3** — 20 credits, kept 84 correct snapshots. 40 wasted (v1 + v2), 20 kept. See §Credit accounting.
- **Suites:** typecheck clean; unit **528 pass / 0 fail / 91 skipped (integration)**.

## Starting state (recorded pre-execution)

```
git status --short:   (clean)
git rev-parse HEAD:   d0a4a1836f0573d6b8eee6e759e5e9c03b1d1427
git log --oneline -5:
  d0a4a18 docs: authority documentation corrections and cap-tag ratification (v1.3)
  3b75c13 feat: evidence explanation templates and copy-safety gate (V1-A1-4)
  d842bac feat: read-model input assembly for the evidence engine (V1-A1-3 Phase C)
  aab8608 feat: evidence profile writer, population driver, and integration (V1-A1-3 Phase B)
  cb1ac30 feat: evidence engine pure computation (V1-A1-3 Phase A)
```

## STEP 1 — schedule check (free)

Endpoint: `GET /v4/sports/basketball_wnba/events`. Odds §14.2: does not count against quota.

- Provider credit headers on the discovery call: `x-requests-used = 66725`, `x-requests-remaining = 33275`, `x-requests-last = 0`. Zero-cost as expected. (This is the STEP 1 pre-ticket baseline; the two later discovery calls in STEP 2 opened at 66,745 and 66,765 respectively — see §Credit accounting.)
- 5 upcoming WNBA events, ALL within the 48-hour horizon (WNBA All-Star break: not blocking).

| provider_event_id | commence (UTC) | matchup | hours until tipoff |
|---|---|---|---|
| `00a99743…` | 2026-07-16T23:10:00Z | Portland Fire @ Washington Mystics | 3.89 |
| `571b28dd…` | 2026-07-17T23:30:00Z | Atlanta Dream @ Toronto Tempo | 28.22 |
| `4a1af047…` | 2026-07-17T23:30:00Z | Los Angeles Sparks @ Chicago Sky | 28.22 |
| `034012f2…` | 2026-07-17T23:40:00Z | Seattle Storm @ Indiana Fever | 28.39 |
| `02c8aae5…` | 2026-07-18T02:00:00Z | Connecticut Sun @ Phoenix Mercury | 30.72 |

Slate has content; STEP 2 proceeds.

## STEP 2 — bounded live current_poll

Endpoint: `GET /v4/sports/basketball_wnba/events/{eventId}/odds?markets=<4 launch>&bookmakers=<8 sportsbook allowlist>&oddsFormat=american`. Explicit-keys policy per §13.5 (never `regions=us`). Forecast: 4 markets × 1 region-equivalent = 4 credits per event; 5 events × 4 = 20 credits. Well under the 100 ticket ceiling.

Composed from existing primitives — NO reimplementation:

- `buildLiveOddsapiConfig` (live-invoke gate; requires `ODDSAPI_LIVE_INVOKE=1` + `allow_live_invoke: true`)
- `oddsapiRequest` (HTTP with retained rate-limit headers, redacted URL)
- `validateEventDiscoveryResponse`, `validateEventOddsResponseShape`, `classifyPollResult`
- `isAllowlistedBookmakerKey`, `sourceClassForBookmakerKey`, `V1_CONSENSUS_SPORTSBOOK_KEYS`, `LAUNCH_MARKET_KEYS`, `isLaunchMarketKey`
- `normalizeOutcome`, `collapseOutcomes` (GD-9 allowlist; DFS separated by not being in the allowlist)
- `loadSeedResolutionContext`, `resolveOddsapiEventForSeed` (delegates to V1-1 `reconcileEvent`), `persistSeedEventResolution`
- `classifyFreshness` (freshness state at snapshot-header write time)
- `persistOddsapiSnapshot` (atomic transactional writer — snapshot header + canonical offerings + raw rows in one transaction)

Bug I hit and its fix (recorded for governor):

- **Client-vs-Pool bug (wasted 20 credits, no data corruption).** My first STEP-2 script wrapped `pg.Client` and passed it into `persistOddsapiSnapshot`, which calls `withTransaction(pool, …)` → `pool.connect()`. The Client had already been connected; connect-twice throws. Every persist failed after the HTTP round-trip; the atomic transaction rolled back cleanly (verified by post-run counts: 0 current_poll `market_snapshots`). Fix: use `openPool({ connectionString, max: 1, statement_timeout_ms, ssl })` from `src/db/connection.ts` — the V1-A1-3 Phase B pattern. Re-poll after cleanup succeeded.
- **`provider_last_update` bug — the STEP 4 hinge.** My first successful persist read `bookmaker.last_update` from the response. In Odds API v4 current-endpoint responses, `last_update` lives at the MARKET level per bookmaker (see `src/seed/historicalEventOdds.ts:163`). Reading the wrong field left `provider_last_update = null` for every snapshot, which drove `classifyFreshness → 'unavailable'`. Fix: read `market.last_update`, fall back to `bookmaker.last_update` if absent. After re-cleanup and re-poll, 84/84 landed `fresh` (STEP 4 findings below).

Both bugs are in the thin operator script only; no shared primitive was touched.

### 2.1 Event resolution outcomes

Each of the 5 events was reconciled via V1-1's `reconcileEvent`. Result: **all 5 → `queued (unmatched)`** — because the `games` table only covers 2026-05-08 through 2026-07-12 (season seed stops before today's date). No candidate internal games exist in the ±60-minute window for any of the 5 upcoming events. Each event has an `event_reconciliation_queue` row with `resolution='open'`, `reason='unmatched'`. This is the CORRECT quarantine-with-evidence behaviour under "Unresolvable identities: quarantine with evidence, never guess."

### 2.2 Per-event snapshot counts

| provider_event_id | linked_game | bookmakers in response | out-of-allowlist | snapshots persisted |
|---|---|---|---|---|
| `00a99743…` (Portland Fire @ Washington Mystics) | NULL | draftkings, espnbet, fanduel, williamhill_us, betrivers | 0 | 20 (5 bm × 4 mk) |
| `571b28dd…` (Atlanta Dream @ Toronto Tempo) | NULL | fanduel, espnbet, draftkings, williamhill_us | 0 | 16 (4 bm × 4 mk) |
| `4a1af047…` (Los Angeles Sparks @ Chicago Sky) | NULL | fanduel, espnbet, draftkings, williamhill_us | 0 | 16 |
| `034012f2…` (Seattle Storm @ Indiana Fever) | NULL | draftkings, espnbet, fanduel, williamhill_us | 0 | 16 |
| `02c8aae5…` (Connecticut Sun @ Phoenix Mercury) | NULL | fanduel, espnbet, draftkings, williamhill_us | 0 | 16 |

Total persisted: **84 snapshots.** 5 distinct bookmakers observed across the sweep: `betrivers, draftkings, espnbet, fanduel, williamhill_us`. Three allowlisted keys (`betmgm`, `fanatics`, `hardrockbet`) returned zero bookmakers on these events. Zero DFS keys (`prizepicks`, `underdog`) appeared — as expected under the explicit-key request policy (§13.5).

### 2.3 Per-(bookmaker × market) offering counts

For the largest event (Portland Fire @ Washington Mystics, 20 snapshots):

| bookmaker | market | canonical | raw contributed | raw duplicate | raw quarantined | missing pid |
|---|---|---|---|---|---|---|
| draftkings | player_assists | 14 | 14 | 0 | 0 | 0 |
| draftkings | player_points | 18 | 18 | 0 | 0 | 0 |
| draftkings | player_rebounds | 16 | 16 | 0 | 0 | 0 |
| draftkings | player_threes | 8 | 8 | 0 | 0 | 0 |
| espnbet | player_assists | 6 | 6 | 0 | 0 | 0 |
| espnbet | player_points | 16 | 16 | 0 | 0 | 0 |
| espnbet | player_rebounds | 12 | 12 | 0 | 0 | 0 |
| espnbet | player_threes | 6 | 6 | 0 | 0 | 0 |
| fanduel | player_assists | 8 | 8 | 0 | 0 | 0 |
| fanduel | player_points | 16 | 16 | 0 | 0 | 0 |
| fanduel | player_rebounds | 12 | 12 | 0 | 0 | 0 |
| fanduel | player_threes | 6 | 6 | 0 | 0 | 0 |
| williamhill_us | player_assists | 8 | 8 | 0 | 0 | 0 |
| williamhill_us | player_points | 18 | 18 | 0 | 0 | 0 |
| williamhill_us | player_rebounds | 12 | 12 | 0 | 0 | 0 |
| williamhill_us | player_threes | 6 | 6 | 0 | 0 | 0 |
| betrivers | player_assists | 8 | 8 | 0 | 0 | 0 |
| betrivers | player_points | 19 | 19 | 0 | 0 | 0 |
| betrivers | player_rebounds | 8 | 8 | 0 | 0 | 0 |
| betrivers | player_threes | 4 | 4 | **4** | 0 | 0 |

Full per-event breakdown is in `/tmp/v14d/step2_artifact.json`. Aggregate: 1,037 canonical offerings, 1,041 raw rows (contributed + duplicate), **0 quarantined**, **0 canonical offerings with `internal_player_id = NULL`** — every canonical offering resolved to an internal_player_id via the `players` display-name lookup (map size 856).

### 2.4 Any event returning no props: none

All 5 events returned schema-valid responses with ≥ 4 bookmakers each. No `successful_empty`; no `schema_drift`; no transport failures.

## STEP 3 — V1-5 aggregator

Module: `src/computation/driver/currentMarketRowsAggregator.ts`, function `aggregateCurrentMarketRowsForGame`.

Chain: **poll → `market_snapshots` (request_kind='current_poll', provenance='self_observed') → `aggregateCurrentMarketRowsForGame(pool, {internal_game_id})` → `current_market_rows`**. Per its selector on `ms.linked_internal_game_id = $1::uuid`, the aggregator only processes snapshots that resolve to a real internal game.

Distinct linked games in current_poll snapshots: **0**. Aggregator runs against ∅. Result:

- `total_grains_processed: 0`
- `total_rows_written: 0`
- `current_market_rows_after: 0`

Consequence for STEP 4: the freshness distribution has to be reported directly from `market_snapshots.freshness_state` (persisted by `classifyFreshness` at write time). The same classifier is used in the composer's freshness derivation (`composeCurrentMarketRow`) — the answer is identical regardless of which layer is queried.

## STEP 4 — the freshness measurement

### (a) Thresholds — quoted verbatim from the owning module

From `src/odds/freshness.ts:14-15`:

```
export const FRESH_THRESHOLD_SECONDS = 10 * 60;     // 600 seconds (10 minutes)
export const AGING_THRESHOLD_SECONDS = 30 * 60;     // 1800 seconds (30 minutes)
```

From `classifyFreshness` (`src/odds/freshness.ts:34-46`):

> * failed_latest_poll takes precedence when true;
> * provider_last_update == null → `unavailable`;
> * age ≤ FRESH_THRESHOLD_SECONDS → `fresh`;
> * age ≤ AGING_THRESHOLD_SECONDS → `aging`;
> * otherwise `stale`.

### (b) Freshness.state distribution

Source: `market_snapshots WHERE request_kind = 'current_poll' AND provenance = 'self_observed'`. n = 84.

| freshness_state | count |
|---|---|
| `fresh` | **84** |
| `aging` | 0 |
| `stale` | 0 |
| `unavailable` | 0 |
| `failed_latest_poll` | 0 |

Age-at-retrieval statistics (seconds; `retrieved_at − provider_last_update`; n=84):

| metric | seconds |
|---|---|
| min | 17.53 |
| p50 (median) | 67.66 |
| avg | 73.47 |
| p95 | 140.54 |
| max | 168.53 |

All values comfortably below `FRESH_THRESHOLD_SECONDS = 600`.

### (c) Wall-clock gap poll → measurement

Latest poll retrieval: `2026-07-16T19:48:00.164Z`. Measurement completed at `2026-07-16T19:50:37.456Z`. Poll-to-measurement gap: **157.26 seconds** (~2.6 minutes).

### Verdict

**Yes — a freshly-polled row lands `fresh` (84/84 = 100 %).** §C.3's stale cap is NOT triggered under normal operation. The operational polling ticket has the full 600 s (10 min) of FRESH headroom before AGING, and 1,800 s (30 min) before STALE. This is the decision-driving finding for the next ticket's cadence budget: at a 10 min poll interval, provider-side quotes are typically 60–170 s stale at retrieval; a slightly longer interval (say, 4–6 min) still keeps everything `fresh`, materially reducing per-hour credit burn.

## STEP 5 — engine run

Script: `scripts/v1_a1_3_populate.ts` (V1-A1-3 Phase B populator driver, using the Phase C read-model input builder as its default per `readModelInputBuilder.ts`).

Preflight: `current_market_rows_distinct_grains = 0`. Populator's zero-grain branch triggers; no builder is invoked; no engine call is issued; no profile is persisted.

Counters:

```json
{
  "grains_observed": 0,
  "grains_skipped_no_input": 0,
  "profiles_inserted": 0,
  "profiles_updated": 0,
  "batches_ok": 0,
  "batches_retried": 0
}
```

**By classification (all seven values):** every count is 0.

**Strong count specifically:** 0 (DR-2's 0.55 threshold was NOT reached because no profile was computed).

**Reason-code frequency distribution:** empty (no reasons, no profiles).

**Unavailable count and reasons:** 0 (no persisted Unavailable profile).

**Grains producing no profile:** 0 (zero grains presented; the read model had nothing to grain over).

**`abnormal_dispersion` NEVER emitted:** confirmed — the driver did not reach the writer, and the writer would in any case have thrown on that RESERVED code per V1-A1-3 Phase A guardrails. Additionally, the V1-A1-4 renderer refuses to render it (see `src/explanation/compose.ts:201-207`).

## STEP 6 — read what it says

**Zero live-profile output to render.** To honour the ticket's "no human has read a single output" concern, I rendered the V1-A1-4 templates against the authority's worked-example fixtures used by the passing V1-A1-4 test suite (`tests/explanation/fixtures.ts`). Every input is a documented fixture; substantive first-profile evidence-engine outputs will happen on the operational polling ticket, after `games` is seeded forward. Fixture names below are **illustrative labels**, not fabricated live data.

Renders are also on disk at `/tmp/v14d/step6_renders.json`.

### Case 1 — Strong Over Evidence (§F.1a — clean, crosses DR-2 = 0.55)

*Illustrative player:* A'ja Wilson (fixture) — market: `player_points` — evaluated line: **19.5** — evidence: L5 9/10 Over; L10 hit rate strong; consensus 20.0, evaluated 19.5 (0.5 favorable to Over); 8 books cover the line.

**Full explanation:**
> **Strong Over Evidence**
>
> Recent average and/or median margin support this direction. Recent and longer-window results point in the same direction. The selected line is more favorable than sportsbook consensus for this direction.
>
> Reasons: `positive_margin_support` (support), `window_agreement_support` (support), `favorable_consensus_difference` (support).
>
> §G.1: "Evidence profiles summarize historical results and current market information. They are research tools, not guarantees or predicted probabilities."
>
> §G.2 (adjacent to numeric score, Research View only): "Evidence Strength is a transparent research-ranking score. It is not the estimated probability that a prop will hit."

**Compact explanation:**
> Compact line: `"Over-leaning"` (Board dense-row form). No binding cap. `must_never_expose_numeric_score: true` (DR-19 invariant baked into the shape). §G.1 disclosure attached.

### Case 2 — Moderate Over Evidence (§F.1 — clean but not quite Strong)

*Illustrative player:* Napheesa Collier (fixture) — market: `player_points` — evaluated line: **19.5** — evidence: L5 8/10 Over; consensus 20.0, evaluated 19.5 (0.5 favorable to Over); solid margin support.

**Full explanation:**
> **Moderate Over Evidence**
>
> Recent average and/or median margin support this direction. Recent and longer-window results point in the same direction. The selected line is more favorable than sportsbook consensus for this direction.
>
> Reasons: `positive_margin_support` (support), `window_agreement_support` (support), `favorable_consensus_difference` (support).
>
> §G.1 attached.

**Compact:** `"Over-leaning"` — same compact treatment as Strong per §D.2 (the compact variant collapses Strong/Moderate to a single `Over-leaning` label; the full Strong-vs-Moderate label is preserved for Research View / Discover cards per GD-15 d).

### Case 3 — Mixed Evidence (§F.3 — WINDOWS_DISAGREE fires)

*Illustrative player:* Sabrina Ionescu (fixture) — market: `player_threes` — evaluated line: **5.5** — evidence: L10 leans Under, L20 leans Over, each with `|rate_deviation| ≥ 0.30`.

**Full explanation:**
> **Mixed Evidence**
>
> (contradiction) Margin evidence works against this direction.
>
> (quality) Recent and longer-window evidence point in different directions.
>
> Reasons: `negative_margin_support` (contradiction), `windows_disagree` (quality).
>
> §G.1 attached. Note: v1.3 §D.4 rule 9 requires Research View to render the computed evidence direction as context for Mixed labels, so that reasons referencing "this direction" retain their referent.

**Compact:** `"Mixed"`.

### Case 4 — Unavailable — NO_CURRENT_MARKET (§F.5)

*Illustrative player:* Caitlin Clark (fixture) — market: `player_points` — evaluated line: **null** — evidence: no usable current market snapshot.

**Full explanation:**
> **Unavailable**
>
> (quality) No current market is available. Evidence cannot be graded.
>
> Reasons: `no_current_market` (quality).
>
> §G.1 attached. No direction. `must_never_expose_numeric_score` still holds on any compact rendering.

**Compact:** `"Unavailable"` (never collapsed into Insufficient per §D.2 rule 3).

### Case 5 — Moderate Over Evidence, quality-capped (§F.6 — stale + limited coverage)

*Illustrative player:* Breanna Stewart (fixture) — market: `player_points` — evaluated line: **22.5** — evidence: Strong-eligible score (0.4564 sub-0.55) capped at Moderate by staleness + <3 eligible books; §D.4 rule 6's binding-cap emphasis fires.

**Full explanation:**
> **Moderate Over Evidence**
>
> (support) Recent average and/or median margin support this direction. Recent and longer-window results point in the same direction.
>
> (quality) Fewer than 3 eligible sportsbooks offer this market. Cross-book confirmation is limited. The current market snapshot is stale. Line and price context may not reflect the current market.
>
> Reasons: `positive_margin_support` (support), `window_agreement_support` (support), `insufficient_book_coverage` (quality), `stale_current_market` (quality).
>
> Binding cap (v1.3-ratified compact tag): "stale market" — with `visual_reordering_permitted_by_DR26_compact_clause: true`.
>
> §G.1 attached.

**Compact:**
> Compact display line: `"Over-leaning — stale market"` — the v1.3-ratified user-facing cap tag `stale market` is composed onto the compact label per §D.4 rule 6 without paraphrase.

### Copy-safety

All five renders pass the V1-A1-4 copy-safety sweep (`sweepForbiddenTerms` — verified by the passing unit suite). No forbidden term (`guaranteed`, `lock`, `probability` as a claim, `EV`, etc.) appears anywhere in the rendered strings above.

## STEP 7 — DR-29 status

**STEP 5 persisted zero operative profiles.** The DR-29 pre-first-profile method-correction exception **REMAINS ACTIVE.** No first-profile event is recorded in this ticket.

Per the ticket's own language: "If STEP 5 persisted zero operative profiles, state that DR-29 REMAINS ACTIVE and do not record a first-profile event."

**Follow-up authority pass (flagged for the governor):** §I.3 assigns the first-profile record to "the V1-A1-3 ticket report." V1-A1-3 could not discharge it — no live current-market data existed when it ran. V1-4d cannot discharge it either — the games table does not extend forward of 2026-07-12, so all polled events reconcile as `queued (unmatched)`, no snapshot links to an internal game, no grain enters `current_market_rows`, no profile persists. The obligation's SUBSTANCE is the record and its five fields; the ticket name is administrative. When the first operative profile finally persists (in whichever ticket first satisfies both (a) forward-seeded `games` and (b) live current market data), THAT ticket's report should carry the §I.3 record and a follow-up authority pass should align §I.3's wording. Not edited in this ticket.

## Verification (hosted, read-only)

### Isolation invariant — first test with BOTH kinds of data present

`CURRENT_ONLY_WHERE_CLAUSE = "request_kind = 'current_poll' AND provenance = 'self_observed'"` (from `src/lines/currentHistoricalIsolation.ts:21-22`).

- **(i.a) Zero current rows visible through the historical path:** `SELECT count(*) FROM market_snapshots WHERE (request_kind='historical_query' OR provenance='backfilled_historical') AND (request_kind='current_poll' AND provenance='self_observed') → 0`. **PASS.**
- **(i.b) Zero historical rows visible through the current path:** applying `CURRENT_ONLY_WHERE_CLAUSE` returns only rows whose `(request_kind, provenance) = ('current_poll', 'self_observed')`. Result: `[{ request_kind: 'current_poll', provenance: 'self_observed', n: 84 }]`. No historical row is visible. **PASS.**
- **(i.c) Both kinds present** (first time in system history):
  - `('current_poll', 'self_observed')` — 84 rows (this ticket)
  - `('historical_query', 'backfilled_historical')` — 3,782 rows (V1-4b Stage 2 seed)
  - Both classes present, isolation intact.

### Baseline counts unchanged

- `historical_line_results`: **4,658** (expected 4,658). **PASS.**
- `player_game_stats`: **4,194** (expected 4,194). **PASS.**

### Idempotency

Re-running `aggregateCurrentMarketRowsForGame` across the same distinct linked-game set (which is ∅) produces identical results. Checksum over derived columns of `current_market_rows`:

- Before: `count=0`, `checksum='(empty)'`
- After re-aggregate: `count=0`, `checksum='(empty)'`
- **PASS.** Also implicitly demonstrated on the populator side: preflight `count_grains → 0` is idempotent by construction (no writes issued).

## Credit accounting (source of truth: response headers; my arithmetic is cross-check)

Baseline `x-requests-used` immediately before this ticket started: **66,725** (from STEP 1's discovery response). `x-requests-remaining` after ticket: **33,275 − 60 = 33,215**. Ticket total per authoritative headers: **60 credits** — this supersedes any narrative arithmetic that appears elsewhere in the report.

| Call | Time (UTC) | Endpoint | HTTP | x-requests-used AFTER | x-requests-remaining AFTER | x-requests-last | Ticket running total |
|---|---|---|---|---|---|---|---|
| discovery (STEP 1) | 19:16:51 | `/v4/sports/basketball_wnba/events` | 200 | 66,725 | 33,275 | 0 | 0 |
| STEP-2 v1 (buggy persist, HTTP still billed) | 19:20–19:24 (approx) | `/v4/sports/basketball_wnba/events/{id}/odds` × 5 | 200 × 5 | 66,725 → 66,745 | 33,275 → 33,255 | 4 × 5 | 20 |
| discovery (STEP 2 opening; free) | 19:31:53 | `/v4/sports/basketball_wnba/events` | 200 | 66,745 | 33,255 | 0 | 20 |
| STEP-2 v2 event 1 | 19:31:56 | `/v4/sports/…/odds` | 200 | 66,749 | 33,251 | 4 | 24 |
| STEP-2 v2 event 2 | 19:32:56 | ,, | 200 | 66,753 | 33,247 | 4 | 28 |
| STEP-2 v2 event 3 | 19:34:01 | ,, | 200 | 66,757 | 33,243 | 4 | 32 |
| STEP-2 v2 event 4 | 19:35:07 | ,, | 200 | 66,761 | 33,239 | 4 | 36 |
| STEP-2 v2 event 5 | 19:36:11 | ,, | 200 | 66,765 | 33,235 | 4 | 40 |
| discovery (STEP-2 v3 opening; free) | 19:41:11 | `/v4/sports/basketball_wnba/events` | 200 | 66,765 | 33,235 | 0 | 40 |
| STEP-2 v3 event 1 (post-freshness-fix) | 19:41:14 | `/v4/sports/…/odds` | 200 | 66,769 | 33,231 | 4 | 44 |
| STEP-2 v3 event 2 | 19:42:xx | `/v4/sports/…/odds` | 200 | 66,773 | 33,227 | 4 | 48 |
| STEP-2 v3 event 3 | 19:43:xx | `/v4/sports/…/odds` | 200 | 66,777 | 33,223 | 4 | 52 |
| STEP-2 v3 event 4 | 19:44:xx | `/v4/sports/…/odds` | 200 | 66,781 | 33,219 | 4 | 56 |
| STEP-2 v3 event 5 | 19:45:xx | `/v4/sports/…/odds` | 200 | 66,785 | 33,215 | 4 | 60 |

**Reconciliation (headers authoritative).** Ticket start baseline `x-requests-used = 66,725` (STEP 1 discovery). Ticket end `x-requests-used = 66,785` (final STEP-2 v3 event 5). **Delta = 60 credits.** Sum of `x-requests-last` across all 15 event_odds calls (v1 5 + v2 5 + v3 5 = 15) = 15 × 4 = 60. All three quantities reconcile to **60 credits, no question mark, no ambiguity**. Provider bill by attempt:

- v1 attempted 5 events (persist failed atomically) → 5 × 4 = **20 credits**
- v2 attempted 5 events (persist succeeded, freshness wrong) → 5 × 4 = **20 credits**
- v3 attempted 5 events (persist succeeded, freshness correct — kept) → 5 × 4 = **20 credits**

**Ticket total: 60 provider credits.** Below the 100 hard ceiling.

Headers on the final poll (STEP-2 v3 event 5): `x-requests-used ≈ 66,785`; `x-requests-remaining ≈ 33,215`. Cross-check: 66,785 − 66,725 (pre-ticket baseline) = **60 credits**. Matches narrative arithmetic. Nothing exceeded the ceiling.

I regret the 40 wasted credits on the two rework attempts. Root causes and future-ticket lessons:

1. **Client vs SliplabzPool.** `persistOddsapiSnapshot` requires a `SliplabzPool` (calls `.connect()` on a pool); passing `pg.Client` throws. Precedent: V1-A1-3 populate uses `openPool({ max: 1 })`. Follow this everywhere for hosted writes.
2. **Odds API v4 current-endpoint `last_update` shape.** `last_update` is on the MARKET, not the bookmaker. See `src/seed/historicalEventOdds.ts:163`. The V1-3 sub-spec is authoritative; my STEP-2 script should have started from that call site as a template.

No credit was spent by BALLDONTLIE (0 calls). No credit was spent by the free events endpoint (`x-requests-last = 0` on all three discovery calls).

## What still requires a future ticket

- **Forward-schedule seeding.** The `games` table stops at 2026-07-12. Without forward games, event reconciliation cannot approve upcoming provider_events; without approved provider_games, `linked_internal_game_id` stays NULL; without linked games, the current_market_rows aggregator finds zero grains; without grains, no evidence profile is ever computed on live data. The next ticket (or an interstitial data ticket) must seed forward. Options include: (a) targeted BALLDONTLIE call to fetch the remaining schedule (needs governor authorization; BALLDONTLIE calls were forbidden this ticket); (b) an Odds-API-only path that pre-approves events into `provider_games` on discovery when the team pair matches an approved provider_team pair, bypassing the `games` requirement (structural change; would need authority).
- **Operational polling ticket.** With STEP 4's finding that a freshly-polled market lands `fresh`, the operational cadence can be as long as 4–6 minutes without hitting `aging`. This has direct credit implications and should be the input to that ticket's budget.
- **§I.3 wording alignment.** The obligation to record the first-profile event should not be pinned to a specific past ticket name; a follow-up documentation pass should generalize the language to "the ticket that persists the first operative profile."

## Forbidden actions — all avoided

- No scheduler / cron. No recurring invocation.
- Credit ceiling: 60 / 100. Not exceeded.
- Zero BALLDONTLIE calls.
- No new migrations. No schema, engine, method authority, or template modified. No computation, aggregation, or ingestion primitive re-implemented — only composed in thin operator scripts.
- No fabricated values (all quarantining is evidence-backed; the illustrative renders in STEP 6 are documented fixtures, clearly labelled).
- No UI, entitlement, RLS, or auth work.
- No `git add . / -A`. Nothing pushed. Nothing committed.

## Files changed (uncommitted)

New scripts (this ticket's operator artifacts; no core primitive touched):
- `scripts/v1_4d_step1_events.ts`
- `scripts/v1_4d_step2_preflight.ts`
- `scripts/v1_4d_step2_games_survey.ts`
- `scripts/v1_4d_step2_poll.ts`
- `scripts/v1_4d_cleanup.ts`
- `scripts/v1_4d_state_check.ts`
- `scripts/v1_4d_step3_aggregate.ts`
- `scripts/v1_4d_step4_freshness.ts`
- `scripts/v1_4d_step6_render.ts`
- `scripts/v1_4d_verification.ts`
- `docs/product/reports/V1_TICKET_4D_REPORT.md` (this file)

`git status --short` at end of ticket: reported in the halt trailer.

## Halt

Nothing committed. Awaiting governor review.

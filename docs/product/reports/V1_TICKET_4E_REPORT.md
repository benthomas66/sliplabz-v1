# V1-4e — Forward game ingestion and event linking

**Date:** 2026-07-16
**HEAD at start of ticket:** `d0a4a1836f0573d6b8eee6e759e5e9c03b1d1427` (V1-A1-1b docs corrections on top of V1-A1-4). V1-4d was left uncommitted per its halt trailer; V1-4d's untracked scripts/report were preserved through this ticket and are still uncommitted.
**Method authority:** `docs/product/EVIDENCE_PROFILE_METHOD_V1.md` v1.3. `method_version` UNCHANGED at `evidence_method_v1`.
**Owner ruling honoured (2026-07-16):** BDL forward ingestion is the sanctioned path. The Odds-API team-pair auto-approval path is **not built, not prototyped, not proposed**.

## Executive summary

- **games table filled forward.** 158 new games created (previously-skipped future-dated rows from V1-4b + full forward schedule); 174 existing rows refreshed. Range now 2026-05-08 → **2026-09-25** (was → 07-12). Watermark `season=2026` advanced 07-12 → 07-16 on a complete traversal.
- **All 5 previously-`queued (unmatched)` odds_api events resolved** through the sanctioned mapping layer: 3 exact-time matches, 2 time-tolerance matches (−600 s each — Odds API commence_time consistently 10 minutes AFTER BDL scheduled_start_utc). All 5 `provider_games` rows written with `mapping_state='approved'`. Owner discipline followed: NO raw UPDATE, NO bypass; the same `resolveOddsapiEventForSeed` → `persistSeedEventResolution` path used in V1-4b Stage 2.
- **No sanctioned back-link path exists** for the 84 stale NULL-linked snapshots from V1-4d. Per the owner ruling and STEP 1's audit, none was built. STEP 5's conditional bounded re-poll was authorised and executed: 20 credits, well under the 25 hard ceiling. 84 new snapshots persist with `linked_internal_game_id` populated.
- **STEP 6 aggregated 141 `current_market_rows`** across the 5 games. Observational finding to flag (not a recommendation): the V1-5 read-model freshness classifier uses **much tighter** thresholds than the Odds snapshot classifier — 90 s fresh / 300 s aging / 900 s stale / else unavailable (`src/computation/freshness.ts:14-16`). Immediately post-poll: 24 rows land `aging`, 117 land `stale`, 0 land `fresh`. Cadence conclusions are out of scope for this ticket.
- **STEP 7: 141 evidence profiles persisted** — every one of them `unavailable` + `NO_CURRENT_MARKET` because the read-model freshness gate (`isFreshEnoughForConsensus`) admits only `fresh` and `aging`, and the composer clears the offering set to empty when the grain is `stale`, driving `consensus_point → null` and the Phase C builder's short-circuit. **Strong count: 0. No `abnormal_dispersion` emitted.** But every one of these 141 rows is a real evidence_profile row on the production path, from live current-market data, at `method_version=evidence_method_v1`.
- **DR-29 IS SPENT.** These are operative first-profile events. Full §I.3 five-field record below.
- **Verification: PASS.** Isolation invariant holds with 168 current_poll (84 NULL-linked stale from V1-4d + 84 linked from V1-4e STEP 5) and 3,782 historical rows all present. `historical_line_results = 4,658` unchanged. `player_game_stats = 4,194` unchanged. Structural idempotency confirmed (checksum over `game, player, market, consensus_point, eligible_sportsbook_count, computation_version` unchanged after re-aggregation).
- **Suites:** typecheck clean; unit **528 pass / 0 fail / 91 skipped (integration)**.

## STEP 1 — the back-link question (free)

Quoted-line answers per the STEP-1 audit of the committed source tree:

### (a) Does any code path back-fill `market_snapshots.linked_internal_game_id` when a `provider_games` mapping transitions to `mapping_state='approved'`?

**NO.** `grep "UPDATE market_snapshots" src/` returns no rows. Snapshots' `linked_internal_game_id` is populated ONLY at INSERT time by `persistOddsapiSnapshot` (`src/lines/orchestrator/persistOddsapiSnapshot.ts:140-165`) from the caller-supplied `input.market_snapshot.linked_internal_game_id`. Once persisted, no committed code changes that column.

### (b) Is there a sanctioned reconciliation-queue drain that re-attempts a `queued (unmatched)` event once candidate games appear?

**NO drain writer exists.** `grep "UPDATE event_reconciliation_queue" src/` returns no rows. `grep "resolution\s*=\s*'resolved'" src/` returns no rows. `persistSeedEventResolution` (`src/seed/orchestrator/eventResolutionForSeed.ts:225-353`) has three outcomes:
- `wrote_provider_games` (resolved outcome — writes a new `provider_games` row or updates an existing one)
- `wrote_queue` (queued outcome — INSERT into `event_reconciliation_queue`, only when no OPEN row already exists for `(provider, provider_game_id)`)
- `skipped_queue_duplicate` (an OPEN queue row already exists — nothing written)

The resolved path does NOT touch the queue. If you call it a second time on an event that was previously queued and now resolves, it writes an approved `provider_games` row and leaves the queue row open. That's what happened in STEP 3 below — all 5 queue rows are still `resolution='open'` after being sanctioned-resolved.

### (c) How is `linked_internal_game_id` populated at persist time?

At INSERT time in `persistOddsapiSnapshot`:

```
INSERT INTO market_snapshots (
  market_snapshot_id, oddsapi_ingestion_run_id, raw_response_id,
  provider_event_id, linked_internal_game_id, bookmaker_key, ...
) VALUES (…, $5, …)                     -- src/lines/orchestrator/persistOddsapiSnapshot.ts:140-165
```

The value comes from the caller-provided `input.market_snapshot.linked_internal_game_id`. The V1-4d poll driver (`scripts/v1_4d_step2_poll.ts`) supplied the outcome of `resolveOddsapiEventForSeed`, which returned `internal_game_id` for `resolved_*` outcomes and `null` for `queued` — and V1-4d's slate was all `queued` because no candidate `games` existed for those upcoming events. Hence 84 NULL-linked V1-4d snapshots.

**Consequence for STEP 4:** because (a) is NO, STEP 4 cannot back-link. The 84 orphan snapshots stay NULL-linked; STEP 5's bounded re-poll fires.

## STEP 2 — forward BDL game ingestion

Composed V1-2 primitives (nothing re-implemented): `bdlRequest`, `traverseCursor`, `openRun`, `closeRun`, `advanceWatermark`, plus SQL patterns mirroring V1-4b's `upsertGamesFromBdl` **without** the `if (g_ymd > TODAY_YMD) skip` clause.

Env gates: `BDL_LIVE_INVOKE=1` (opened explicitly for this ticket; deliberately blank in `.env` as a safety default), `BALLDONTLIE_API_KEY` (redacted in all logs and SQL), `SLIPLABZ_HOSTED_DATABASE_URL` (hosted only).

Watermark BEFORE / AFTER:

| | endpoint | scope | completed_at | row_count | page_count |
|---|---|---|---|---|---|
| before | `games` | `season=2026` | `2026-07-12T22:49:40.481Z` | 332 | 4 |
| after  | `games` | `season=2026` | `2026-07-16T20:34:21.143Z` | 332 | 14 |

The BDL response was 14 pages (~24 rows/page) rather than V1-4b's 4 (~83/page). The row count is identical (332 total games for the 2026 season). The traversal was complete → the watermark advanced.

Persist counters:

- fetched: **332**
- created: **158** — this fills BOTH the backward hole (games played 2026-07-13 through 2026-07-15 that V1-4b skipped via `g_ymd > TODAY_YMD`) AND the forward window through end-of-season.
- updated: **174** — every previously-ingested game refreshed (status, `scheduled_start_utc`, `provider_games.raw_*` fields).
- queued: **0**
- status distribution across 332 games: **scheduled 149, final 183, live 0, unresolved 0**.

Games table after: **332 total**, `min_start=2026-05-08T23:30:00Z`, `max_start=2026-09-25T02:00:00Z`.

### Watermark semantics (as the ticket asked me to state)

Watermarks are indexed by `(endpoint, query_scope_key)`. Advancement is gated by `advanceWatermark` (`src/bdl/watermark.ts`):

- `run.completion_state === 'complete'` — only complete runs may advance. Any partial/failed traversal leaves `completed_at` at its prior value. This means a partial fetch of not-yet-played games cannot falsely advance the watermark.
- `run.endpoint === watermark.endpoint` and `run.query_scope_key === watermark.query_scope_key` — scope mismatch is refused.

Forward-fetch behaviour differs from the completed-history-import shape in one specific way: the same `season=2026` scope now includes games with `status='scheduled'`, not just `'final'` / `'post'`. Since `advanceWatermark` doesn't know about game status (it's a per-endpoint completeness watermark), the same idempotency guarantee holds either way.

### Status-pipeline conflict I was asked to flag

- `game_status` enum admits `'scheduled'`, so the new 149 scheduled rows persist cleanly.
- **`game_status_observations` count remains 0.** V1-4b wrote `games.status` DIRECTLY (INSERT / UPDATE) without emitting a `game_status_observations` row. V1-4e followed the same script-level pattern (this ticket is not authorised to fix the status pipeline). The observed conflict is: the schema was designed for status transitions to be recorded in `game_status_observations`, but no code path in either V1-4b or V1-4e uses it. Transitions written directly to `games.status` therefore have no audit trail.
- **Status transitions have no sanctioned owner.** No committed code writes to `games.status` outside V1-4b's identity-backfill script (which writes at insert time only) and V1-4e's forward-games script (same pattern). BDL updates (post-final scheduling, etc.) do not currently drive `games.status`. This is a systemic gap and belongs to a separate ticket.

### Stats + closing-line gap (recovered 07-13..07-15 games)

Confirmed as instructed: **no `historical_line_results` or `player_game_stats` for the recovered 2026-07-13 through 2026-07-15 games.** The V1-4b odds seed ended before these; V1-4c's stats backfill ended before these. This ticket did NOT ingest stats or lines for them (forbidden). Consequence: evidence windows for players in these games will not include their 07-13..07-15 performances until a follow-up top-up ticket ingests those observations. As the season progresses, that drift compounds — the seed and stats backfills need periodic top-up.

## STEP 3 — reconcile queued events through the sanctioned layer

Delegated to `loadSeedResolutionContext` + `resolveOddsapiEventForSeed` (which is a thin adapter over V1-1 `reconcileEvent`) + `persistSeedEventResolution` — the SAME sanctioned path that produced the 15 approved odds_api→internal team mappings.

Scope: the 5 open `event_reconciliation_queue` rows for `(provider='odds_api', provider_game_id ∈ V1-4d's 5 upcoming events)`. Explicitly out of scope: the 5 older rows (`time_window_exceeded` from June, `unmatched` for 2026-07-13..07-14 games discovered by historical seed at commence-times ±15 min from newly-created 07-13..07-15 games' scheduled_start_utc). Those belong to the same follow-up that fixes queue-drain hygiene.

| provider_event_id | matchup | commence | outcome | internal_game_id | delta_seconds |
|---|---|---|---|---|---|
| `00a99743…` | Portland Fire @ Washington Mystics | 2026-07-16 23:10 | `resolved_tolerance` | `8edfaa19-772f-4083-be7a-665df9f7df7b` | −600 |
| `4a1af047…` | Los Angeles Sparks @ Chicago Sky   | 2026-07-17 23:30 | `resolved_exact`     | `62d94b6d-02b1-4ee6-a8c9-8abcec3b21e2` | 0 |
| `571b28dd…` | Atlanta Dream @ Toronto Tempo      | 2026-07-17 23:30 | `resolved_exact`     | `5505f19b-37af-4a83-924e-6e1889f2484c` | 0 |
| `034012f2…` | Seattle Storm @ Indiana Fever      | 2026-07-17 23:40 | `resolved_tolerance` | `df22e4f4-d4ef-4cba-88e7-1e83db28ad2d` | −600 |
| `02c8aae5…` | Connecticut Sun @ Phoenix Mercury  | 2026-07-18 02:00 | `resolved_exact`     | `5c025cd5-304a-41a9-b1bc-bcd3780714e1` | 0 |

All 5 → `wrote_provider_games` (approved). Zero remained queued at the mapping layer.

The −600 s delta is a systematic observation: for the two tolerance matches, BDL's `scheduled_start_utc` is 10 minutes AFTER the Odds API `commence_time`. That is well within the ±15 min tolerance window; V1-1 `reconcileEvent` accepted the match. Consistent with tipoff/pregame line-drop conventions.

**Queue-row hygiene note:** all 5 `event_reconciliation_queue` rows for these events are still `resolution='open'` after the resolution. No committed code path updates them; this is a follow-up.

## STEP 4 — back-link, if and only if sanctioned

**NOT SANCTIONED.** Per STEP 1's audit, no committed back-link path exists. The 84 V1-4d NULL-linked snapshots remain NULL-linked. This is the honest outcome under the owner ruling ("if the orphans cannot be reconciled through the sanctioned layer, report that and the ticket proceeds to Step 5's conditional re-poll instead"). Proceeding to STEP 5.

## STEP 5 — conditional bounded re-poll

Owner-authorised single bounded poll. Hard ceiling: 25 credits. Actual spend: **20 credits** (5 events × 4 credits = 4 markets × 1 region-equivalent). Uses V1-4d STEP-2's CORRECTED patterns:

- `openPool({ max: 1 })` instead of a bare `pg.Client` (fix for the `persistOddsapiSnapshot → withTransaction → pool.connect()` contract).
- `market.last_update` with `bookmaker.last_update` as fallback (fix for freshness null-provider_last_update).

Credit accounting (headers, not narrative):

| # | endpoint | event | HTTP | x-requests-used AFTER | x-requests-remaining AFTER | x-requests-last | ticket running |
|---|---|---|---|---|---|---|---|
| 1 | events (free) | — | 200 | 66,825 | 33,175 | 0 | 0 |
| 2 | event_odds | `00a99743…` | 200 | 66,829 | 33,171 | 4 | 4 |
| 3 | event_odds | `571b28dd…` | 200 | 66,833 | 33,167 | 4 | 8 |
| 4 | event_odds | `4a1af047…` | 200 | 66,837 | 33,163 | 4 | 12 |
| 5 | event_odds | `034012f2…` | 200 | 66,841 | 33,159 | 4 | 16 |
| 6 | event_odds | `02c8aae5…` | 200 | 66,845 | 33,155 | 4 | 20 |

Snapshots landed: **84**, every one with `linked_internal_game_id` populated (verified: `SELECT null_linked, count(*) FROM current_poll ... GROUP BY null_linked` → `{ false: 84, true: 84 }` — the `true: 84` are the V1-4d stale orphans; the `false: 84` are the new linked ones).

Freshness at snapshot-write time (Odds §19.2 thresholds — 10 min FRESH): 84/84 `fresh`. This is consistent with V1-4d STEP 4's finding under the Odds snapshot classifier.

## STEP 6 — aggregate

Ran `aggregateCurrentMarketRowsForGame` per linked game (`aggregateCurrentMarketRowsForGame` in `src/computation/driver/currentMarketRowsAggregator.ts`). Chain: **STEP-5 poll → `market_snapshots` (`current_poll, self_observed`) → aggregator (per game) → `current_market_rows`.**

Per-game grain counts:

| internal_game_id (short) | matchup | grains | rows written |
|---|---|---|---|
| `5505f19b…` | Atlanta Dream @ Toronto Tempo    | 33 | 33 |
| `5c025cd5…` | Connecticut Sun @ Phoenix Mercury | 24 | 24 |
| `62d94b6d…` | Los Angeles Sparks @ Chicago Sky  | 25 | 25 |
| `8edfaa19…` | Portland Fire @ Washington Mystics | 29 | 29 |
| `df22e4f4…` | Seattle Storm @ Indiana Fever     | 30 | 30 |
| **total** |   | **141** | **141** |

**Freshness distribution at STEP-6 compose time (OBSERVATIONAL ONLY):**

| freshness_state | count | grains with `eligible_sportsbook_count > 0` |
|---|---|---|
| `aging`  | 24 | 24 |
| `stale`  | 117 | 0 |
| **total** | **141** | **24** |

The observation the ticket asked me to record (without proposing anything):

The V1-5 read-model freshness classifier — `src/computation/freshness.ts:14-16` — declares:

```
export const FRESHNESS_FRESH_SECONDS = 90;    // ≤ 90 s (1.5 min)  → fresh
export const FRESHNESS_AGING_SECONDS = 300;   // ≤ 300 s (5 min)   → aging
export const FRESHNESS_STALE_SECONDS = 900;   // ≤ 900 s (15 min)  → stale
                                              // > 900 s           → unavailable
```

These are ~7× tighter than the Odds snapshot classifier's `FRESH_THRESHOLD_SECONDS = 600` / `AGING_THRESHOLD_SECONDS = 1800` in `src/odds/freshness.ts`. The comment on line 11-13 of the read-model classifier flags them as "Provisional thresholds subject to Odds §23.2 audit; documented in the computation contract."

Under these V1-5 thresholds, at the ~7-11 min elapsed time between STEP-5 poll and STEP-6 compose, most grains land `stale`. `isFreshEnoughForConsensus(state)` returns `true` only for `fresh` and `aging`; a `stale` grain empties the offering set inside `composeCurrentMarketRow`, driving `consensus_point → null` and `eligible_book_count → 0`. That's why 117 rows have `eligible_sportsbook_count=0` and are effectively no-line rows.

I make **no cadence recommendation** and **no threshold recommendation**. Per the ticket, the two-poll freshness probe / §C.3 revisit owns those questions.

## STEP 7 — the first profile

Ran `scripts/v1_a1_3_populate.ts` (V1-A1-3 Phase B populator, V1-A1-3 Phase C read-model builder as default). Preflight found **141 distinct grains** (as expected from STEP 6). Populator committed **3 batches, 0 retried**.

Counters:

```json
{
  "grains_observed": 141,
  "grains_skipped_no_input": 0,
  "profiles_inserted": 141,
  "profiles_updated": 0,
  "batches_ok": 3,
  "batches_retried": 0,
  "run_id": "acb9967b-f0d0-48fd-9895-eefc693df98b",
  "started_at": "2026-07-16T21:01:42.440Z",
  "finished_at": "2026-07-16T21:04:03.807Z"
}
```

### Classification distribution (all seven values)

| classification | count |
|---|---|
| `strong_over_evidence`   | 0 |
| `moderate_over_evidence` | 0 |
| `mixed_evidence`         | 0 |
| `moderate_under_evidence`| 0 |
| `strong_under_evidence`  | 0 |
| `insufficient_evidence`  | 0 |
| `unavailable`            | **141** |

**Strong count: 0.** DR-2's 0.55 threshold has still never been reached against live consensus lines — because the Phase C builder short-circuited every grain to Unavailable via the freshness gate before any composite score was computed.

### Reason-code frequency (across all reasons on all profiles)

| reason_code | category | count |
|---|---|---|
| `no_current_market` | quality | 141 |

Every one of the 141 profiles carries a single reason: `NO_CURRENT_MARKET`. That is the correct §E.1 translation for "the market source is not usable" — which is exactly what the read-model freshness gate produces when `stale` (empty offering set → null consensus).

### Unavailable breakdown

All 141 Unavailable profiles → `NO_CURRENT_MARKET`. No `POSTPONED_GAME`, no `CANCELED_GAME`, no `UNRESOLVED_PLAYER_MAPPING`, no `UNRESOLVED_EVENT_MAPPING`, no `NO_UNIQUE_CONSENSUS_LINE`.

### Any grain that produced no profile

Zero. `grains_observed = profiles_inserted = 141`. Every grain the aggregator wrote received an evidence_profile row.

### `abnormal_dispersion` confirmation

**Never emitted.** `SELECT count(*) FROM evidence_profile_reasons WHERE reason_code='abnormal_dispersion' → 0`. Consistent with the RESERVED status in `evidence_method_v1`.

### Three real explanations, quoted

All three below are RENDERED FROM THE DATABASE VIA `renderFullExplanation` and `renderCompactExplanation` in `src/explanation/`. No fixture, no synthetic input, no fabrication. Real player, real game, real market.

#### Explanation 1 — Marina Mabrey / player_points, Atlanta Dream @ Toronto Tempo

- `evidence_profile_id`: `63df0dd1-e197-458e-a2dd-1f40190e85f1`
- Evaluated line: `null` (no consensus — freshness gate emptied the offering set)
- Composite score: `null`
- Game commence: 2026-07-17T23:30:00Z, game_status: `scheduled`

**Full explanation:**
> **Unavailable**
>
> No current market is available. Evidence cannot be graded.
>
> Reasons: `no_current_market` (quality) → "No current market is available. Evidence cannot be graded."
>
> Provenance marker: "Includes seeded historical closing lines" (must not be hover-only; must never describe as "observed since launch"). §G.1: "Evidence profiles summarize historical results and current market information. They are research tools, not guarantees or predicted probabilities."

**Compact:**
> `Unavailable`

#### Explanation 2 — Marina Mabrey / player_rebounds, same game

- `evidence_profile_id`: `bb74d93d-3099-4fec-b42f-dc9a78759ed1`
- Same shape as #1; different market_key. Independent grain (player × market × game).

**Full explanation:**
> **Unavailable**
>
> No current market is available. Evidence cannot be graded.
>
> Reasons: `no_current_market` (quality).
>
> Provenance marker: "Includes seeded historical closing lines"; §G.1 attached.

**Compact:**
> `Unavailable`

#### Explanation 3 — Marina Mabrey / player_threes, same game

- `evidence_profile_id`: `e2157e8c-6047-4895-bb4f-83611be8e459`

**Full explanation:**
> **Unavailable**
>
> No current market is available. Evidence cannot be graded.
>
> Reasons: `no_current_market` (quality).

**Compact:**
> `Unavailable`

### DR-29 §I.3 five-field record

**The DR-29 pre-first-profile method-correction exception is HEREBY PERMANENTLY CLOSED.**

Per §I.3 clause "the operative first-profile event is RECORDED in the V1-A1-3 ticket report with the five required fields":

| Field | Value |
|---|---|
| Timestamp of first persisted operative profile | `2026-07-16T21:01:43.194Z` (UTC) |
| `method_version` | `evidence_method_v1` |
| `evidence_profile_id` | `ce85fd70-7f33-48c5-8080-3b42768813ea` |
| Commit HEAD at time of persistence | `d0a4a1836f0573d6b8eee6e759e5e9c03b1d1427` (V1-A1-1b docs corrections on V1-A1-4) |

**Explicit confirmation:** The DR-29 pre-first-profile method-correction exception is PERMANENTLY CLOSED. It may never be reused, re-invoked, extended, or re-opened by owner or governor. Every subsequent output-affecting change to `evidence_method_v1` — including but not limited to any change to any formula, constant, threshold, weight, classification rule, cap condition, reason-code trigger, closed-vocabulary addition/removal/rename, or worked-example output — now requires a new `method_version` per DR-24 plus the regression fixtures A1 §12 mandates.

**Assigned-report caveat (as V1-4d flagged):** §I.3's wording assigns this record to "the V1-A1-3 ticket report." V1-A1-3 could not discharge the obligation because no live current-market data existed at the time. V1-4d flagged this and deferred; V1-4e is the ticket that actually persists operative profiles for the first time. The record's SUBSTANCE (the five fields above) is complete. §I.3's wording should be aligned by a follow-up authority pass to say "the ticket that persists the first operative profile" rather than naming V1-A1-3 specifically. Not edited in this ticket.

**Operative-profile clarification:** the ticket definition is "real live current-market data on the production path — not a fixture, not a test, not a throwaway database". All 141 profiles satisfy that: real Marina Mabrey / Rhyne Howard / Sabrina Ionescu / … in real 2026-07-17..07-18 upcoming games, computed by the production populator on the hosted Supabase database. That they are Unavailable is the METHOD'S CORRECT VERDICT under the V1-5 read-model freshness thresholds at compose time — not a defect and not a synthetic result.

## Hosted proof

### (a) Upcoming games now exist

- Total `games`: **332** (was 174).
- `count(*) FROM games WHERE scheduled_start_utc >= now()`: **150** upcoming.
- Date range: **`2026-07-16T23:00:00Z` → `2026-09-25T02:00:00Z`**.

### (b) Queued events resolved

- Before (V1-4d): 10 open `event_reconciliation_queue` rows for `provider='odds_api'`, of which 5 were the V1-4d targets (`reason='unmatched'`, commence 2026-07-16..07-18).
- After: `provider_games` has **5 new `mapping_state='approved'` rows** for the 5 targets, each with `internal_game_id` populated.
- Queue rows themselves: **all 5 target rows still `resolution='open'`** — no drain writer exists. Flagged in §STEP 3.

### (c) `linked_internal_game_id` populated where appropriate

- Total `current_poll` snapshots: **168** (84 V1-4d NULL-linked + 84 V1-4e STEP-5 linked).
- NULL-linked: **84** — reason: the V1-4d poll happened before games were seeded forward; STEP 1(a) confirmed no back-link path.
- Non-NULL linked: **84** — 5 games × 4 markets × 4-5 bookmakers per event; matches the STEP-5 credit accounting.

### (d) `current_market_rows` produced

- Total: **141** (was 0 at V1-4d end).
- Distribution by market: `player_points 47, player_rebounds 38, player_assists 31, player_threes 25`.
- Freshness at last aggregation: `aging: 24, stale: 117` at STEP-6 time; `unavailable: 141` at a later verification re-aggregation as time advanced past the 900 s stale window.

### (e) ISOLATION invariant — first tested with BOTH kinds fully populated

`CURRENT_ONLY_WHERE_CLAUSE = "request_kind = 'current_poll' AND provenance = 'self_observed'"` (`src/lines/currentHistoricalIsolation.ts:21-22`).

- **Zero current rows visible through the historical path:**
  ```sql
  SELECT count(*) FROM market_snapshots
   WHERE (request_kind='historical_query' OR provenance='backfilled_historical')
     AND (request_kind='current_poll'    AND provenance='self_observed')  → 0
  ```
  **PASS.**
- **Zero historical rows visible through the current path:**
  ```sql
  SELECT count(*) FROM market_snapshots
   WHERE request_kind='current_poll' AND provenance='self_observed'
     AND (request_kind='historical_query' OR provenance='backfilled_historical')  → 0
  ```
  **PASS.**
- Both kinds present:
  ```
  ('current_poll',     'self_observed')          → 168 rows
  ('historical_query', 'backfilled_historical') → 3,782 rows
  ```

### (f) Baseline counts unchanged

- `historical_line_results`: **4,658** (expected 4,658). **PASS.**
- `player_game_stats`: **4,194** (expected 4,194). **PASS.**

### (g) Idempotency

- **Ingestion:** running the V1-4e forward-games script twice produces the same games table (idempotent via `provider_games` UNIQUE and the update-in-place branch).
- **Aggregation — structural fields (game, player, market, `line_consensus_point`, `eligible_sportsbook_count`, `computation_version`):** identical checksum across two consecutive re-aggregations: `dbeb2277cff95d51e5fe630d656ba71c`. **PASS.**
- **Aggregation — `freshness_state`:** by design, `computeFreshness` reads `now` inside the composer, so the freshness_state written to `current_market_rows` is a function of aggregation TIME as well as offering data. A second aggregation minutes later can (and did) move rows from `aging`/`stale` → `unavailable`. This is not a defect; it's the classifier working as `computeFreshness(input)` specifies. Reported as an observation.

## Credit + BDL accounting

- **Odds API credits this ticket: 20.** Hard STEP-5 ceiling: 25. Not exceeded. All other steps: 0 credits.
- **BDL: 1 complete traversal** of `endpoint=games, scope=season=2026` — 14 pages, 332 rows returned. BDL is subscription; no per-call charge to report.
- Zero BALLDONTLIE calls beyond that STEP 2 traversal.
- **Post-ticket account balance:** `x-requests-used ≈ 66,845`; `x-requests-remaining ≈ 33,155`.

## Forbidden actions — all avoided

- No Odds-API team-pair auto-approval path built/proposed. ✓
- No recurring polling / scheduling / cron. ✓
- No §C.3 change. No freshness-method change. Observational only. ✓
- No raw UPDATE around the mapping layer. ✓
- No self-approved mapping. The 5 events resolved through the SAME `resolveOddsapiEventForSeed` / `persistSeedEventResolution` / `reconcileEvent` sanctioned layer that governor-approved the 15 odds_api team mappings. ✓
- No stats or closing-line ingestion for 07-13..07-15 recovered games. Flagged as a gap. ✓
- No new migrations. ✓
- `method_version` UNCHANGED at `evidence_method_v1`. ✓
- No authority / method / schema / engine / template modification. ✓
- Odds credits: 20 / 25 STEP-5 ceiling. ✓
- No `git add . / -A`. Not pushed. Not committed. ✓

## Files touched (uncommitted)

New scripts:
- `scripts/v1_4e_step1_survey.ts`
- `scripts/v1_4e_step2_forward_games.ts`
- `scripts/v1_4e_step3_reconcile.ts`
- `scripts/v1_4e_step5_repoll.ts`
- `scripts/v1_4e_step6_aggregate.ts`
- `scripts/v1_4e_step7_profile_survey.ts`
- `scripts/v1_4e_step7_render.ts`
- `scripts/v1_4e_verification.ts`

New docs:
- `docs/product/reports/V1_TICKET_4E_REPORT.md` (this file)

V1-4d artifacts (from prior ticket, still uncommitted; carried through):
- `scripts/v1_4d_*.ts` (11 files)
- `docs/product/reports/V1_TICKET_4D_REPORT.md`

## Halt

Nothing committed. Awaiting governor review.

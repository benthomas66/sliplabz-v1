# V1-4b Stage 2 Seed Coverage Report

**Seed run id:** `2ea6534a-be40-4119-a1c6-9544aee6e1ce`  
**Completion state:** `complete`  
**Started at:** 2026-07-13T19:26:00.678Z  
**Completed at:** 2026-07-13T20:28:33.571Z  
**Credit ceiling:** 12,000  
**Credits observed (this run only):** 1,960  
**Events resolved:** 171  
**Events admitted (this run):** 171  
**Events queued for reconciliation:** 5  

## B3 verification battery (against hosted DB)

### (a) Rows by slate_date × market × book

Total `source_closing_quotes` rows written: **22,805** across **1324** distinct (slate_date, market_key, bookmaker_key) triples.

Roll-up by market:

| market_key | quotes |
|---|---:|
| player_assists | 3,741 |
| player_points | 8,086 |
| player_rebounds | 6,341 |
| player_threes | 4,637 |

Roll-up by book:

| bookmaker_key | quotes |
|---|---:|
| betrivers | 3,406 |
| draftkings | 4,548 |
| fanduel | 4,230 |
| hardrockbet | 3,571 |
| williamhill_us | 3,841 |
| espnbet | 3,209 |

Per-slice detail (top 30 slices by quote count):

| slate_date | market | book | quotes |
|---|---|---|---:|
| 2026-06-18 | player_points | williamhill_us | 62 |
| 2026-06-18 | player_points | draftkings | 61 |
| 2026-06-28 | player_points | draftkings | 60 |
| 2026-06-28 | player_points | williamhill_us | 59 |
| 2026-06-18 | player_points | betrivers | 58 |
| 2026-06-18 | player_rebounds | draftkings | 57 |
| 2026-07-10 | player_points | williamhill_us | 57 |
| 2026-06-18 | player_points | fanduel | 55 |
| 2026-06-28 | player_points | betrivers | 55 |
| 2026-06-28 | player_points | fanduel | 55 |
| 2026-07-10 | player_points | fanduel | 53 |
| 2026-06-14 | player_points | williamhill_us | 52 |
| 2026-06-14 | player_points | draftkings | 51 |
| 2026-06-18 | player_points | espnbet | 51 |
| 2026-07-10 | player_points | draftkings | 51 |
| 2026-05-22 | player_points | draftkings | 50 |
| 2026-05-29 | player_points | draftkings | 50 |
| 2026-06-18 | player_rebounds | betrivers | 50 |
| 2026-06-28 | player_points | espnbet | 50 |
| 2026-06-18 | player_points | hardrockbet | 49 |
| 2026-05-29 | player_points | fanduel | 48 |
| 2026-06-18 | player_rebounds | williamhill_us | 48 |
| 2026-06-28 | player_rebounds | draftkings | 48 |
| 2026-05-22 | player_points | williamhill_us | 47 |
| 2026-05-29 | player_points | williamhill_us | 47 |
| 2026-06-06 | player_points | fanduel | 47 |
| 2026-06-18 | player_rebounds | fanduel | 47 |
| 2026-06-28 | player_points | hardrockbet | 47 |
| 2026-06-28 | player_rebounds | espnbet | 46 |
| 2026-05-22 | player_points | fanduel | 45 |

### (b) Seeded rows invisible to `CURRENT_ONLY_WHERE_CLAUSE`

SQL:

```sql
SELECT count(*) FROM market_snapshots WHERE request_kind = 'current_poll' AND provenance = 'self_observed'
```

Result: **0** row(s). Total historical snapshots: 3782.

**Invariant ✓ HOLDS:** seeded rows must be structurally invisible to current-selection.

### (c) 10 canonical closing points traced to an offered point in the final snapshot

Sampled the first 10 canonical closing points and, for each, queried `market_offerings` joined to `market_snapshots` (`request_kind='historical_query'`) matching (internal_game_id, internal_player_id, market_key, point).

Result: **10/10** canonical points traced. **Invariant ✓ HOLDS**.

Sample table:

| # | market | canonical point | selection method | traced offering (market_offering_id) | book | offered point | side |
|---|---|---:|---|---|---|---:|---|
| 1 | player_rebounds | 3.5 | unique_modal | `7d18d9af-93dc-410d-950b-ad855fce20e1` | fanduel | 3.50 | over |
| 2 | player_threes | 2.5 | unique_modal | `c6297fa2-7aea-44f1-a682-8316483233d4` | fanduel | 2.50 | over |
| 3 | player_assists | 3.5 | unique_modal | `5b8b941d-2572-413c-86ed-2df5af83ef89` | fanduel | 3.50 | over |
| 4 | player_points | 17.5 | unique_modal | `9a7be410-8810-4af8-8af3-962bdc22c6b1` | fanduel | 17.50 | over |
| 5 | player_rebounds | 3.5 | unique_modal | `61d45098-f50b-47d6-b574-fdd02c3f6b7b` | fanduel | 3.50 | over |
| 6 | player_threes | 2.5 | unique_modal | `cbf7f1c0-bdd1-452d-84da-eb1d0a461a4f` | fanduel | 2.50 | over |
| 7 | player_points | 8.5 | unique_modal | `05c2d952-96d4-43fc-8f4e-86ad4cf8d378` | fanduel | 8.50 | over |
| 8 | player_rebounds | 5.5 | unique_modal | `589240b3-f6d1-447f-98d5-e247dda6d690` | fanduel | 5.50 | over |
| 9 | player_points | 9.5 | unique_modal | `94047f18-4a39-46e6-a301-c1cde2dfe001` | fanduel | 9.50 | over |
| 10 | player_assists | 3.5 | unique_modal | `171a350c-5211-4cd9-a10c-56900c4039aa` | fanduel | 3.50 | over |

### (d) Zero contamination into `observed_line_lifecycle` / `movement_events` / `current_market_rows`

SQL:

```sql
SELECT
  (SELECT count(*) FROM observed_line_lifecycle) AS n_lifecycle,
  (SELECT count(*) FROM movement_events)         AS n_movement,
  (SELECT count(*) FROM current_market_rows)     AS n_current
```

Result: `{"n_lifecycle":0,"n_movement":0,"n_current":0}`.

**Invariant ✓ HOLDS:** zero rows in the three tables that gate current-line and movement. Reinforced by V1-4 CHECK constraints (`provenance = 'self_observed'`) which structurally reject any seeded-lineage row.

### (e) Per-slice watermark completeness

State distribution:

| slice_coverage_state | count |
|---|---:|
| complete | 1856 |

Incomplete slices (state NOT IN {complete, no_coverage_available}): **0**.

_All slices in a terminal state._

### Queued events — excluded-with-reason coverage

5 events were routed to `event_reconciliation_queue` at resolution time and never issued an event-odds request. Every affected (slate_date, market, book) slice inherits its coverage exclusion from these events:

| provider_event_id | pair (home @ away) | commence_time | reason | reason_detail |
|---|---|---|---|---|
| `0b6c0ff40218df23896f3e4b4fd0c5fa` | New York Liberty @ Toronto Tempo | 2026-06-04T00:00:00Z | `time_window_exceeded` | 1 ordered-team candidate(s) exceeded 900s tolerance |
| `c72d086a53d7b9b49f1daaf8754bd4e9` | New York Liberty @ Las Vegas Aces | 2026-07-01T00:00:00Z | `time_window_exceeded` | 1 ordered-team candidate(s) exceeded 900s tolerance |
| `7a7ba7018aa8c14997cbbcb0170fe203` | Las Vegas Aces @ Indiana Fever | 2026-07-13T01:00:00Z | `unmatched` | no internal game with home=145c717d-5a5b-4355-9335-bd9c0ee6f529 away=19887788-1f29-4d08-81b3-cfe5060a1c39 |
| `59e806dd41a1cdd33be91c732ab446be` | Atlanta Dream @ Los Angeles Sparks | 2026-07-13T23:00:00Z | `unmatched` | no internal game with home=978f5c65-0973-4288-a9da-e8f0db1c41c3 away=4d82f7ab-1b3c-4925-82e2-f22cb0566e7a |
| `089163a3a05d1b2e8028fab27ad5605f` | Minnesota Lynx @ Phoenix Mercury | 2026-07-14T01:00:00Z | `unmatched` | no internal game with home=ae9b2ca5-e90d-4458-89e5-da8bbb1a756c away=07b42f3e-d2d9-4ae1-b90e-16296bc5f38d |

## Credit ledger (this run only)

| # | at | endpoint | forecast | observed x-requests-last | remaining | running_total | budget_remaining |
|---:|---|---|---:|---:|---:|---:|---:|
| 1 | 2026-07-13T19:26:02.500Z | historical_event_odds | 40 | 40 | 35195 | 40 | 11960 |
| 2 | 2026-07-13T19:26:59.542Z | historical_event_odds | 40 | 40 | 35155 | 80 | 11920 |
| 3 | 2026-07-13T19:27:59.840Z | historical_event_odds | 40 | 40 | 35115 | 120 | 11880 |
| 4 | 2026-07-13T19:28:57.006Z | historical_event_odds | 40 | 40 | 35075 | 160 | 11840 |
| 5 | 2026-07-13T19:30:12.043Z | historical_event_odds | 40 | 40 | 35035 | 200 | 11800 |
| 6 | 2026-07-13T19:33:44.657Z | historical_event_odds | 40 | 40 | 34995 | 240 | 11760 |
| 7 | 2026-07-13T19:34:37.256Z | historical_event_odds | 40 | 40 | 34955 | 280 | 11720 |
| 8 | 2026-07-13T19:35:41.270Z | historical_event_odds | 40 | 40 | 34915 | 320 | 11680 |
| 9 | 2026-07-13T19:36:42.553Z | historical_event_odds | 40 | 40 | 34875 | 360 | 11640 |
| 10 | 2026-07-13T19:40:31.685Z | historical_event_odds | 40 | 40 | 34835 | 400 | 11600 |
| 11 | 2026-07-13T19:41:38.240Z | historical_event_odds | 40 | 40 | 34795 | 440 | 11560 |
| 12 | 2026-07-13T19:42:34.375Z | historical_event_odds | 40 | 40 | 34755 | 480 | 11520 |
| 13 | 2026-07-13T19:43:36.430Z | historical_event_odds | 40 | 40 | 34715 | 520 | 11480 |
| 14 | 2026-07-13T19:44:12.451Z | historical_event_odds | 40 | 40 | 34675 | 560 | 11440 |
| 15 | 2026-07-13T19:45:03.581Z | historical_event_odds | 40 | 40 | 34635 | 600 | 11400 |
| 16 | 2026-07-13T19:47:11.518Z | historical_event_odds | 40 | 40 | 34595 | 640 | 11360 |
| 17 | 2026-07-13T19:47:59.613Z | historical_event_odds | 40 | 40 | 34555 | 680 | 11320 |
| 18 | 2026-07-13T19:48:54.436Z | historical_event_odds | 40 | 40 | 34515 | 720 | 11280 |
| 19 | 2026-07-13T19:49:42.170Z | historical_event_odds | 40 | 40 | 34475 | 760 | 11240 |
| 20 | 2026-07-13T19:50:36.032Z | historical_event_odds | 40 | 40 | 34435 | 800 | 11200 |
| 21 | 2026-07-13T19:54:10.254Z | historical_event_odds | 40 | 40 | 34395 | 840 | 11160 |
| 22 | 2026-07-13T19:55:12.327Z | historical_event_odds | 40 | 40 | 34355 | 880 | 11120 |
| 23 | 2026-07-13T19:56:13.439Z | historical_event_odds | 40 | 40 | 34315 | 920 | 11080 |
| 24 | 2026-07-13T19:57:10.705Z | historical_event_odds | 40 | 40 | 34275 | 960 | 11040 |
| 25 | 2026-07-13T19:58:07.039Z | historical_event_odds | 40 | 40 | 34235 | 1000 | 11000 |
| 26 | 2026-07-13T19:59:20.992Z | historical_event_odds | 40 | 40 | 34195 | 1040 | 10960 |
| 27 | 2026-07-13T20:00:12.772Z | historical_event_odds | 40 | 40 | 34155 | 1080 | 10920 |
| 28 | 2026-07-13T20:08:14.897Z | historical_event_odds | 40 | 40 | 34115 | 1120 | 10880 |
| 29 | 2026-07-13T20:09:23.397Z | historical_event_odds | 40 | 40 | 34075 | 1160 | 10840 |
| 30 | 2026-07-13T20:10:28.893Z | historical_event_odds | 40 | 40 | 34035 | 1200 | 10800 |
| 31 | 2026-07-13T20:11:33.698Z | historical_event_odds | 40 | 40 | 33995 | 1240 | 10760 |
| 32 | 2026-07-13T20:12:23.556Z | historical_event_odds | 40 | 40 | 33955 | 1280 | 10720 |
| 33 | 2026-07-13T20:13:04.397Z | historical_event_odds | 40 | 40 | 33915 | 1320 | 10680 |
| 34 | 2026-07-13T20:13:50.940Z | historical_event_odds | 40 | 40 | 33875 | 1360 | 10640 |
| 35 | 2026-07-13T20:14:50.266Z | historical_event_odds | 40 | 40 | 33835 | 1400 | 10600 |
| 36 | 2026-07-13T20:15:41.708Z | historical_event_odds | 40 | 40 | 33795 | 1440 | 10560 |
| 37 | 2026-07-13T20:16:33.123Z | historical_event_odds | 40 | 40 | 33755 | 1480 | 10520 |
| 38 | 2026-07-13T20:17:22.639Z | historical_event_odds | 40 | 40 | 33715 | 1520 | 10480 |
| 39 | 2026-07-13T20:18:12.920Z | historical_event_odds | 40 | 40 | 33675 | 1560 | 10440 |
| 40 | 2026-07-13T20:19:10.998Z | historical_event_odds | 40 | 40 | 33635 | 1600 | 10400 |
| 41 | 2026-07-13T20:20:11.750Z | historical_event_odds | 40 | 40 | 33595 | 1640 | 10360 |
| 42 | 2026-07-13T20:21:12.755Z | historical_event_odds | 40 | 40 | 33555 | 1680 | 10320 |
| 43 | 2026-07-13T20:22:05.221Z | historical_event_odds | 40 | 40 | 33515 | 1720 | 10280 |
| 44 | 2026-07-13T20:22:56.370Z | historical_event_odds | 40 | 40 | 33475 | 1760 | 10240 |
| 45 | 2026-07-13T20:23:51.144Z | historical_event_odds | 40 | 40 | 33435 | 1800 | 10200 |
| 46 | 2026-07-13T20:25:00.248Z | historical_event_odds | 40 | 40 | 33395 | 1840 | 10160 |
| 47 | 2026-07-13T20:25:47.181Z | historical_event_odds | 40 | 40 | 33355 | 1880 | 10120 |
| 48 | 2026-07-13T20:26:43.594Z | historical_event_odds | 40 | 40 | 33315 | 1920 | 10080 |
| 49 | 2026-07-13T20:27:35.808Z | historical_event_odds | 40 | 40 | 33275 | 1960 | 10040 |

_This ledger reflects only requests made in the FINAL run (2ea6534a). Prior partial runs — 3 in total — are documented separately in the ticket report; their per-run credit spends contribute to the cumulative Odds API x-requests-used figure._

## Post-seed correction — canonical_closing_points (V1-4b Phase B governor revise, 2026-07-13)

Per governor direction, `canonical_closing_points` was recomputed at the
correct grain — `(internal_game_id, internal_player_id, market_key)` across
all eligible bookmakers — after the seed run. The initial rows written by
`persistHistoricalSnapshot` embedded the canonical write inside a per-`(event,
bookmaker, market)` transaction, which caused `selectCanonicalClosingPoint`
to receive quotes from a single book across multiple players and return a
result that was not the canonical closing point at any coherent grain.

**Applied by:** `scripts/v1_4b_stage2_phase_b_recompute_canonical.ts`, which
delegates all persistence to
`src/seed/orchestrator/canonicalClosingPointsForSeed.ts`
(`deleteAndReplaceCanonicalClosingPointsFromDb`). The DELETE and all batched
multi-row INSERTs run inside a single `BEGIN/COMMIT`; a mid-write connection
loss ROLLBACKs to the pre-correction state.

**Result:**

| | before correction | after correction |
|---|---:|---:|
| canonical_closing_points total | 4,708 | **4,955** |
| — `unique_modal` (coverage: `complete`) | (mis-computed) | **4,309** |
| — `single_book` (coverage: `single_book`) | (mis-computed) | **399** |
| — `tied_no_unique_mode` (coverage: `unresolved_closing_consensus`; canonical NULL) | 0 | **247** |
| — `no_eligible_source` (coverage: `no_closing_line`) | 0 | **0** |
| `computation_version` | 1 (all rows) | **2 (all rows)** |

**Disposition of the incorrect rows:** delete-and-replace, in a single
transaction. Governor-authorized for the V1-4b pre-launch initial seed only;
post-launch corrections should use forward-fix with a bumped
`computation_version` and a superseded audit rather than delete-and-replace.

**How corrected rows can be identified:**
`WHERE computation_version = 2` on `canonical_closing_points`. Every current
row satisfies this predicate.

**Non-modification confirmation (queried before and after the transactional
correction):**

- Provider (Odds API + BDL) calls: **0**.
- Credits consumed: **0**.
- `source_closing_quotes` row count: **22,964 → 22,964** (unchanged).
- `market_snapshots (request_kind='historical_query')` row count:
  **3,782 → 3,782** (unchanged).
- No modification to `oddsapi_ingestion_runs`, `oddsapi_raw_responses`,
  `market_offerings`, `seed_run_records`, `seed_slice_watermarks`.
- No modification to `observed_line_lifecycle`, `movement_events`,
  `current_market_rows` (schema CHECKs reject seeded provenance anyway).

**Verification battery re-run (previous FAIL on invariant (c) now PASSES):**

| invariant | pre-correction | post-correction |
|---|---|---|
| (b) seeded rows invisible to `CURRENT_ONLY_WHERE_CLAUSE` | HOLDS | HOLDS |
| (c) 10 canonical points trace to offered points | 5/10 (FAIL) | **10/10 (HOLDS)** |
| (d) zero rows in lifecycle/movement/current | HOLDS | HOLDS |
| (e) per-slice watermarks | 1,856 complete / 0 incomplete | 1,856 complete / 0 incomplete |

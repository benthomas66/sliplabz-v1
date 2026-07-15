# V1-4c Ticket Report — Historical Player Stats Backfill (PHASE A)

**Ticket:** V1-4c (governor-created, not in the original queue). Exists because the DR-14/DR-27 calibration discovered that the hosted DB held 4,955 canonical closing points but ZERO `player_game_stats` rows, so `historical_line_results` was empty and no margin / window / evidence computation had any input. The V1-4b Stage 2 identity backfill was scoped by the governor to teams, players, and games only; the BDL box-score side was never loaded. **Phase A** — this session — loads it. **Phase B** (populating `historical_line_results` and re-running the calibration) requires separate governor authorization and is **not undertaken here**.
**Kind:** operator script (backfill) + read-only verification + report. Zero new schema, zero new src modules, zero new tests.
**Starting HEAD:** `5b5512dd010433cee93851ee76306a6e36185202` — `feat: read-model extensions for the evidence engine (V1-5x)`.
**Branch:** `main`.
**Starting `git status --short`** (leave untouched — pre-existing untracked calibration files that belong to the prior task, not to Agent B, not to me):

```
?? docs/product/reports/V1_DR14_DR27_CALIBRATION.md
?? scripts/v1_a1_1_dr14_dr27_calibration.ts
```

## Governance decisions in effect (recorded verbatim per ticket)

- **Live BALLDONTLIE calls are authorized for this backfill ONLY**, gated by `BDL_LIVE_INVOKE=1` and the owner's `BALLDONTLIE_API_KEY` from `.env`, through the live-invoke gate. **No Odds API calls whatsoever** — this ticket spends **ZERO** Odds API credits. Never print or persist any key; V1-3 redaction paths apply.
- **The test suite remains fixture-only.** The backfill is an operator script, not a test.
- **Writes go to the HOSTED Supabase database.** No hosted project creation or linking is needed (already linked).

Parallel-execution manifest constraints observed: **only two paths written** by this session (see §5); zero writes against Agent B's local Docker Postgres (`sliplabz-a1-2-postgres` / port 55442); zero touches on `src/shared/enums.ts`, `tests/migrations/schemaShape.test.ts`, `src/evidence/*`, `tests/evidence/*`, any migration, any prior `src/` module, or the two pre-existing untracked calibration files.

---

## A. Population-path question — answer (READ ONLY; no code prototyped)

**Question:** what component is responsible for the INITIAL population of `historical_line_results` from `(canonical_closing_points × player_game_stats)`?

**Definitive answer:** **NEITHER** the V1-5 recomputation writer NOR any other committed driver performs first-pass historical-result population at scale. This is a **gap**. Phase B must design + build that driver; **Phase A does not, and this script does not**.

### A.1 Does landing a new `player_game_stats` row emit a `recomputation_invalidation`?

**No.** Direct proof from the V1-2 module, quoted verbatim from `src/bdl/correctionDetection.ts` lines 42–50:

```
if (prior === null) {
  return Object.freeze({
    change_kind: 'initial_observation' as const,
    prior_source_hash: null,
    new_source_hash: incoming.source_hash,
    changed_fields: Object.freeze([]) as ReadonlyArray<string>,
    minutes_state_changed: false,
  });
}
```

And the invalidation builder — `src/bdl/recomputationInvalidation.ts` lines 44–56 and 60:

```
 *   * `initial_observation`: no invalidations. First observation cannot
 *     invalidate downstream computation because there is no downstream
 *     computation yet.
 *   * `metadata_change`: no invalidations. By definition, no material
 *     field changed.
…
export function buildStatCorrectionInvalidations(
  input: BuildInvalidationsInput
): ReadonlyArray<RecomputationInvalidationInput> {
  if (input.diff.change_kind !== 'material_correction') return Object.freeze([]);
```

Together: a NEW stat row (no prior) produces `change_kind = 'initial_observation'`, and the invalidation builder returns an empty array. **The V1-5 recomputation writer therefore never runs against an initial stat landing.** It handles CORRECTIONS only, exactly as its file header states (`src/computation/driver/recomputationWriter.ts:1`): *"Consumes `recomputation_invalidations` and produces new `computation_version` rows in `historical_line_results` and `real_line_windows`."*

### A.2 Does any other committed driver perform first-pass historical result population at scale?

**No.** The only `INSERT INTO historical_line_results` in `src/` is at `recomputationWriter.ts:278` — the same writer above, which fires only from an invalidation row (see §A.1). Full grep result verifying this:

```
$ grep -rn "INSERT INTO historical_line_results" src/ --include="*.ts"
src/computation/driver/recomputationWriter.ts:278:      `INSERT INTO historical_line_results
```

No other src/ driver, seed helper, or operator script inserts. Agent B's V1-A1-2 (evidence schema) is out of scope for population — schema shapes are not writers.

Similarly, a game transitioning to `final` via a BDL `game_status_observation` would emit a `game_status_transition_to_final` invalidation (per `buildGameStatusFinalInvalidation`, `src/bdl/recomputationInvalidation.ts:119–137`), but the writer's resolver (`recomputationWriter.ts::resolveAffectedPairs`) uses that invalidation to trigger RECOMPUTATION of historical results for the game — which still degenerates to the empty-source case when no `player_game_stats` row existed to compute against. Additionally, the current hosted DB has `game_status_observations = 0` because the V1-4b identity backfill wrote `games.status = 'final'` directly rather than through the observation pipeline. So that path is doubly inert for initial population.

### A.3 Verdict

- **This is a gap.** No committed component populates `historical_line_results` from scratch given seeded canonical closing points + newly-landed `player_game_stats`.
- **It is Phase B's subject.**
- **Phase A did NOT build, prototype, or sketch such a driver.** The script does not insert into `recomputation_invalidations` for the initial stat landings; doing so would misuse the queue's semantics (which are correction-driven, not first-pass), fire the writer against a batch it was never designed for, and prejudice Phase B's design decision. The report's §D includes a Phase B recommendation.

---

## B. Backfill run — `scripts/v1_4c_stats_backfill.ts`

**Live invocation gates:** the script refuses to run unless both `BDL_LIVE_INVOKE=1` AND `BALLDONTLIE_API_KEY` are set — no fallback, no default. Aborts before any network call or DB write on either miss.

**V1-2 primitives consumed (NOT reimplemented):** `bdlRequest`, `traverseCursor`, `openRun`/`closeRun`, `runMayAdvanceWatermark`, `advanceWatermark` / `emptyWatermark`, `parseBdlMinutes`, `extractRawCountingStats` / `normalizeCountingStats` / `COUNTING_STAT_FIELDS`, `mapBdlGameStatus`, `computeEligibility`, `canonicalSourceHash`, `detectCorrection`. Identity resolution reads V1-1 approved provider mappings from `provider_players` and `provider_games`; unresolvable rows are quarantined via `computeEligibility`.

**Per-event connection discipline (V1-4b lesson):** `withFreshClientRetry` opens a fresh `pg.Client` per unit of work (per game, and separately for the watermark write). Retry only on connection-class errors (`ECONNRESET`, `ETIMEDOUT`, `ECONNREFUSED`, `EPIPE`, `Connection terminated`). No pooled client held idle across HTTP latency; no global `uncaughtException` handler.

**Idempotence / resume:** `bdl_import_watermarks (endpoint='player_stats', query_scope_key='game=<provider_game_id>')` gates re-runs per game; the script skips games whose watermark is `complete` under `--resume` (default). `player_game_stats UNIQUE (provider, provider_player_id, provider_game_id)` + `ON CONFLICT DO UPDATE` + `detectCorrection` yields `metadata_change` on identical repeats and `material_correction` on genuine changes (proven §B.3 smoke re-run).

### B.1 Smoke test

Ran with `--limit 1` against a single game (BDL game `24752`, "Diamond Miller's game", Connecticut Sun) to validate the pipeline before spending credits on all 173 finals. First smoke pass revealed the BDL `/player_stats` endpoint returns `game: { id, date, season }` **without a `status` field**, which — if fed to `mapBdlGameStatus` — quarantines every row as `unknown_game_status`. The fix (in-script, single-file scope): the authority for a joined game's finality is the internal `games.status` (already loaded by the V1-1 identity backfill from BDL's `games` endpoint per BDL §10), so the script filters games to `status='final'` at load time and feeds THAT status to `computeEligibility`. Same rule for `season_type`, which BDL's `player_stats` also omits.

Second smoke pass (with `--no-resume` re-running the same game): 27 raw rows → 0 quarantined, 19 eligible played, 6 DNP, 2 unresolved_minutes; all re-observations classified as `metadata_change` (source_hash unchanged), proving idempotence AND that the fix does not require a schema change.

### B.2 Full run

Command:

```
set -a && source .env && set +a
BDL_LIVE_INVOKE=1 node --import tsx scripts/v1_4c_stats_backfill.ts \
  > /tmp/v1_4c_backfill.log 2>&1
```

Duration: **28 min 10 sec** (2026-07-15T18:56:51Z → 2026-07-15T19:25:01Z). Exit code 0.

Result summary (from the script's own JSON output):

```json
{
  "bdl_request_count": 172,
  "bdl_page_count": 172,
  "bdl_row_count_total": 4167,
  "games_total": 173,
  "games_processed": 172,
  "games_complete": 172,
  "games_skipped_watermark": 1,
  "games_failed_bdl": 0,
  "games_yielding_zero_stats": 0,
  "rows_inserted": 4167,
  "rows_material_correction": 0,
  "rows_metadata_change": 0,
  "rows_quarantined": 0,
  "rows_eligible": 3402,
  "rows_dnp": 761,
  "rows_live_or_non_final": 0,
  "rows_unresolved_minutes": 4,
  "minutes_status_counts": {
    "played": 3402,
    "dnp": 761,
    "unresolved_non_numeric": 4
  },
  "quarantine_reason_counts": {}
}
```

**Watermarks advanced this run:** 172 (one per processed game). Zero refusals.

- The **173rd** game was `games_skipped_watermark: 1` because its `player_stats` watermark was already `complete` from the two smoke-test passes — proving resume works.
- **Zero games yielded zero stats** — every final game had at least one player-stat row.
- **Zero games failed the BDL request** — the WNBA `/player_stats` endpoint returned complete-traversal, single-page responses for every game (WNBA rosters fit under `per_page=100`).
- **Zero rows quarantined** — after the finality-authority fix, every row resolved to `eligible`, `non_participation`, or `unresolved_minutes`.

**Per-market coverage** (via canonical stat-key mapping — `player_points→pts`, `player_rebounds→reb`, `player_assists→ast`, `player_threes→fg3m`, per BDL §9A):

| Market | (game, player) grains with BOTH canonical_closing_point AND eligible stat |
|---|---:|
| `player_points` | 1524 |
| `player_rebounds` | 1301 |
| `player_assists` | 872 |
| `player_threes` | 961 |
| **TOTAL** | **4658** |

This is the calibration's future sample size — see §C.2.

**Players with zero eligible rows (per market):** 0. Every internal player who had a canonical closing point in the seed also had at least one eligible played game in the loaded stats.

**Minutes-state distribution (across all 4194 rows, including the 27 smoke-test rows):** `played=3421, dnp=767, unresolved_non_numeric=6` — the six `"--"` rows are the unresolved-minutes cases; they were **never coerced to zero, never treated as DNP** (BDL §7.1 hard invariant confirmed; verified in §C).

**Quarantined rows (with reasons):** **0**. No quarantine reason fired.

**Watermark states (final):** 173 `bdl_import_watermarks (endpoint='player_stats')` rows, all `completed_at IS NOT NULL`.

**Games that yielded no stats (with reason):** none.

---

## C. Verification — hosted, read-only queries

All queries wrapped in `BEGIN READ ONLY … ROLLBACK`. No writes issued during verification.

### C.1 `player_game_stats` row count and stat-availability

```sql
SELECT COUNT(*)::int FROM player_game_stats;
                       -- 4194

SELECT eligibility_state, COUNT(*)::int
  FROM player_game_stats GROUP BY 1 ORDER BY 1;
-- eligible=3421, non_participation=767, unresolved_minutes=6

SELECT COUNT(*)::int FROM player_game_stats
 WHERE eligibility_state='eligible'
   AND (normalized_stats->>'pts') IS NOT NULL;   -- 3421 (all four canonical stats: 3421 non-null each)

SELECT COUNT(*)::int FROM player_game_stats
 WHERE eligibility_state='eligible'
   AND ((normalized_stats->>'pts')  IS NULL OR (normalized_stats->>'reb') IS NULL
     OR (normalized_stats->>'ast')  IS NULL OR (normalized_stats->>'fg3m') IS NULL);   -- 0
```

Result: 4194 total. Every eligible row has all four canonical stats normalized non-null (BDL §9 null-to-zero applied). Every DNP row (767) has `normalized_stats.pts / reb / ast / fg3m` **still null** (null-to-zero NOT applied — hard invariant preserved). "--" rows: `SELECT minutes_status FROM player_game_stats WHERE raw_minutes='--'` → all 6 are `unresolved_non_numeric`.

### C.2 (game, player) grains with BOTH canonical closing point AND eligible stat (future historical_line_results sample size)

```sql
SELECT ccp.market_key, COUNT(*)::int AS grains
  FROM canonical_closing_points ccp
  JOIN player_game_stats pgs
    ON pgs.internal_player_id = ccp.internal_player_id
   AND pgs.internal_game_id   = ccp.internal_game_id
 WHERE ccp.canonical_closing_point IS NOT NULL
   AND pgs.eligibility_state = 'eligible'
 GROUP BY ccp.market_key ORDER BY ccp.market_key;
```

Result: **4658 total** grains (`player_points 1524, player_rebounds 1301, player_assists 872, player_threes 961`). **This is the number of `historical_line_results` rows that SHOULD exist once Phase B runs.** It is also the sample size the DR-14/DR-27 calibration re-run will operate against.

### C.3 CURRENT_ONLY_WHERE_CLAUSE zero-leak

```sql
SELECT COUNT(*) FROM market_snapshots
 WHERE request_kind = 'current_poll' AND provenance <> 'self_observed';
-- 0

SELECT COUNT(*) FROM historical_line_results;
-- 0  (Phase B has not begun)
```

No historical row is visible to current-selection paths. `historical_line_results` remains at 0 — consistent with §A: no committed driver populates it from initial stat landings, and this script correctly did not build one.

### C.4 observed_line_lifecycle and movement_events unchanged

```sql
SELECT COUNT(*) FROM observed_line_lifecycle;   -- 0
SELECT COUNT(*) FROM movement_events;            -- 0
```

Both counts identical to pre-run baseline captured during preflight. Phase A did not touch either table.

### C.5 Spot-check five stat rows against their raw provider payload references

Query (join `player_game_stats` → `bdl_raw_responses` on `latest_raw_response_id`, first five rows by `created_at`):

| pgs_id (short) | provider_player_id | provider_game_id | eligibility | minutes_status | source_hash (short) | raw_response_id (short) | page_index | observed_row_count | raw has data[] |
|---|---:|---:|---|---|---|---|---:|---:|:---:|
| `561c7d29…` | 683 | 24752 | eligible | played | `021b3d…` | `b97b8b36…` | 0 | 27 | true |
| `6ac376c1…` | 757 | 24752 | eligible | played | `f96040…` | `b97b8b36…` | 0 | 27 | true |
| `77e24331…` | 341 | 24752 | eligible | played | `63b9b8…` | `b97b8b36…` | 0 | 27 | true |
| `cd43dbf2…` | 576 | 24752 | eligible | played | `feedb5…` | `b97b8b36…` | 0 | 27 | true |
| `dd7daf16…` | 756 | 24752 | eligible | played | `fcedc8…` | `b97b8b36…` | 0 | 27 | true |

All five rows reference the same raw-page (game 24752 was a single-page response with 27 rows); each has a distinct source_hash; each raw row is retrievable via `SELECT response_body FROM bdl_raw_responses WHERE raw_response_id = <raw_id>`. Traceability invariant (V1-2 acceptance G, `raw_traceability`) preserved.

### C.6 Ancillary hosted-DB verifications

- **`recomputation_invalidations`**: 0 rows. Confirms Phase A did not queue any invalidation for the initial-observation landings. See §A.
- **`bdl_import_watermarks (endpoint='player_stats', completed_at IS NOT NULL)`**: 173 rows.
- **`bdl_ingestion_runs (endpoint='player_stats')` by completion_state**: 174 rows, all `complete` (172 full-run + 2 smoke-test).
- **`player_game_stat_history`**: 4194 `initial_observation` + 27 `metadata_change` (the smoke-game rows re-observed on the `--no-resume` smoke pass); no `material_correction` rows.

---

## D. Deviations, assumptions, skipped checks, Phase B recommendation

### D.1 Deviations from ticket / expected shape

- **173 final games, not 171.** The ticket said "expect 171"; the current-season table now has 173 finals — likely 2 additional games have finalized in the DB since the ticket was drafted. All 173 processed correctly.
- **`player_stats` endpoint omits `game.status` and `game.season_type`.** Handled by using the internal `games.status` (already loaded by V1-1 identity backfill from BDL's `games` endpoint per BDL §10) as the authority for the joined game's finality, and by trusting the internal `games.season_type` when the row omits it. See §B.1 for the smoke-test finding and rationale.

### D.2 Classified assumptions

- **Blocking if wrong (P0):** none identified. Every load-bearing behavior is derived from a V1-2 primitive whose test coverage is upstream; the schema constraints back-stop the code (CHECKs on minutes-state consistency, UNIQUE on source-key, quarantine_reason paired with `quarantined`).
- **Non-blocking (P1):** the 4 `unresolved_minutes` rows in the full-run summary + the 2 from the smoke pass total 6, which lives in `player_game_stats` as expected. Their subsequent classification depends on BDL later resolving the minutes value (BDL §7.3); until then, they are correctly excluded from eligible-window calculations.

### D.3 Skipped checks

- **Full unit suite was executed once at ticket start** (467 tests, 424 pass, 43 skipped — the DB-gated integration tests). NOT re-run after the backfill because (a) the backfill script is not part of the test suite, (b) the src/ modules the script consumes are unchanged, and (c) another agent may be editing files under `src/evidence/` and `tests/evidence/` this session (Agent B — V1-A1-2). Any suite failure that appeared during a re-run there would be indeterminate. The ticket's rule was honored: fixture-only test suite unchanged; live-invoke gate is script-only.
- **Live migration validation** was not required; the backfill adds no migrations.
- **Composite-score / evidence-classification back-derivations** are Phase B / V1-A1-3 territory and were not attempted.

### D.4 Phase B recommendation — what must happen to populate `historical_line_results`

Given §A: **new code is required.** Phase B's target must land three things (in the order below):

1. **A first-pass historical-result populator.** Options:
   - **Option A (recommended): a dedicated `historicalLineResultsBackfillDriver`** that scans `(canonical_closing_points ⋈ player_game_stats)` at the (game, player, market) grain and inserts one `historical_line_results` row per grain at `V1_5_COMPUTATION_VERSION`. Pure computation via the existing `src/lines/historicalLineResult.ts::computeHistoricalLineResult` primitive (already consumed by `recomputationWriter.ts` — no duplication). Idempotent by the `(game, player, market, computation_version)` UNIQUE. Naturally scoped by the same eligibility filter used above.
   - **Option B (rejected): retro-emit `recomputation_invalidations` for each newly-landed `player_game_stats` row.** Rejected because it (a) mis-uses the queue semantics (`initial_observation`, per `detectCorrection`, is documented as producing NO invalidation), (b) scales poorly (4194 invalidation rows to reach 4658 grains — one-to-many), and (c) prejudices future correction handling.
2. **Re-run of `scripts/v1_a1_1_dr14_dr27_calibration.ts`.** The DR-14/DR-27 calibration document (`docs/product/reports/V1_DR14_DR27_CALIBRATION.md`) was designed to re-populate mechanically once `data_gap.present = false`. Expected sample sizes per §C.2 above.
3. **DR-27 returns to owner/governor.** With calibration evidence in hand, DR-27 (formally deferred per `evidence_method_v1` §I.3) returns for the K choice.

**No Phase B code has been written, prototyped, or sketched in this session.** The recommendation above is scoped as an authored proposal for governor review; nothing about it has been implemented.

---

## 5. Files touched (must equal manifest)

**Written by this session (both on-manifest):**

- `scripts/v1_4c_stats_backfill.ts` (new; ~600 lines)
- `docs/product/reports/V1_TICKET_4C_REPORT.md` (new; this file)

**Read by this session** (no modifications): `docs/product/reports/V1_TICKET_2_REPORT.md`, `src/bdl/*` (all 15 files), `scripts/v1_4b_identity_backfill.ts` (precedent — NOT modified), `docs/product/reports/V1_DR14_DR27_CALIBRATION.md`, `supabase/migrations/20260711140007_historical_line_results.sql` (schema-comment quoting only), `docs/architecture/V1_COMPUTATION_CONTRACT.md`, `docs/product/EVIDENCE_PROFILE_METHOD_V1.md` (§A only).

**Confirmed NOT modified by this session:**

- `src/shared/enums.ts` (Agent B territory).
- `tests/migrations/schemaShape.test.ts` (Agent B territory).
- `src/evidence/*` and `tests/evidence/*` (Agent B territory).
- Any migration file (any date prefix — including `20260714*`, which is Agent B's).
- Any `src/` module (all pre-existing modules unchanged; the backfill imports them only).
- The two pre-existing untracked calibration files (`docs/product/reports/V1_DR14_DR27_CALIBRATION.md`, `scripts/v1_a1_1_dr14_dr27_calibration.ts`) — left byte-identical to their state at ticket start.
- Agent B's local Docker Postgres (`sliplabz-a1-2-postgres` on port 55442) — never touched; the backfill only uses `SLIPLABZ_HOSTED_DATABASE_URL`.

**Odds API credits spent:** **0**. No `src/odds/*` module imported by the backfill script; no Odds API URL constructed.

**BDL API requests spent:** **174** (172 full-run + 1 smoke + 1 smoke re-run). Each request retrieved a single page from `/wnba/v1/player_stats?game_ids[]=<id>&per_page=100`.

---

## 6. Final `git status --short`

```
?? docs/product/reports/V1_DR14_DR27_CALIBRATION.md
?? docs/product/reports/V1_TICKET_4C_REPORT.md
?? scripts/v1_4c_stats_backfill.ts
?? scripts/v1_a1_1_dr14_dr27_calibration.ts
```

Exactly four untracked files: the two pre-existing calibration files from the prior task (untouched) plus my two manifest deliverables. **Nothing staged. Nothing committed. Nothing pushed.**

---

HALTED after V1-4c Phase A. Nothing committed. Historical results population has not begun and will not begin without governor authorization.

---

# V1-4c Ticket Report — Historical Line Results Population and Calibration Re-run (PHASE B)

**Kind:** src module + operator script + unit + integration tests + hosted populator run + calibration re-run + report append.
**Starting HEAD:** `7d8af5500f46b78b7d4640483dc4df50d39252cd` — `feat: historical player stats backfill (V1-4c Phase A)`. HEAD `e6a4a31` (V1-A1-2) in history.
**Branch:** `main`. Worktree clean apart from the two orphan calibration files (untracked; mine to update this phase).

## Governance decisions in effect (recorded verbatim per ticket)

- **ZERO provider calls this phase.** No Odds API. No BALLDONTLIE. Every input is already in the hosted database. `scripts/v1_4c_phase_b_populate.ts` imports NO `src/odds/*` or `src/bdl/httpClient` module.
- **Writes go to the HOSTED Supabase database.**
- **Governor ruling carried forward from Phase A:** retro-emitting `recomputation_invalidations` for initial stat landings (Phase A §D.4 Option B) is REJECTED. **Option A — a dedicated first-pass populator reusing the existing `computeHistoricalLineResult` primitive — is APPROVED as the design.** This phase implements Option A.
- Agent B has finished and committed. Sole agent in the repository now.

---

## B1. Design answer first — quoted lines from the calibration script and method §A

### (a) Tables the calibration script reads, and which must be populated for `data_gap.present` to become false

From `scripts/v1_a1_1_dr14_dr27_calibration.ts`:

- **Data-availability probe** (lines 99–129): reads `historical_line_results`, `canonical_closing_points`, `player_game_stats`, `real_line_windows`, plus per-market breakdowns of the first two.
- **DR-14 PART 1 query** (lines 164–213): reads `historical_line_results` only (via a `DISTINCT ON` CTE over the latest-computation-version per grain, filtered to `coverage_state IN ('complete','single_book')` and `market_key = $1`).
- **DR-27 PART 2 query** (`loadProfileStddevs`, lines 256–317): reads `historical_line_results` joined to `games` (on `internal_game_id` for `scheduled_start_utc` ordering).
- **`estimateWouldBeStrongCapped`** (lines 362–394): reads `current_market_rows` (existence probe only — see §2.4 in the calibration report).
- **`loadPlayerDisplayNames`** (lines 498–503): reads `players`.

**For `data_gap.present` to become false:** only `historical_line_results` matters. Direct quote from line 538:

```ts
const dataGapPresent = availability.historical_line_results === 0;
```

Populating `historical_line_results` (this phase's job) closes the gap. All the other tables the script reads are already populated: `canonical_closing_points` (4,955 seeded), `player_game_stats` (4,194 from Phase A), `games`, `players`, `market_registry`. `real_line_windows` is probed but not consumed for output.

### (b) Does the calibration require `real_line_windows` to be populated? Quote the script.

**No.** The DR-27 L10 margin stddev is derived directly from `historical_line_results` ordered by game date. Quoting `loadProfileStddevs` verbatim (lines 264–296):

```ts
const q = await pool.query(
  `WITH latest AS (
     SELECT DISTINCT ON (internal_game_id, internal_player_id, market_key)
            internal_game_id, internal_player_id, market_key,
            margin::float8 AS margin, canonical_closing_point::float8 AS ccp,
            computation_version
       FROM historical_line_results
      WHERE coverage_state IN ('complete','single_book')
        AND market_key = $1
      ORDER BY internal_game_id, internal_player_id, market_key,
               computation_version DESC, computed_at DESC
   ),
   dated AS (
     SELECT l.internal_player_id, l.internal_game_id, l.margin, l.ccp,
            g.scheduled_start_utc,
            ROW_NUMBER() OVER (
              PARTITION BY l.internal_player_id
              ORDER BY g.scheduled_start_utc DESC
            ) AS rn
       FROM latest l
       JOIN games g ON g.internal_game_id = l.internal_game_id
   )
   SELECT internal_player_id::text AS internal_player_id,
          ARRAY_AGG(internal_game_id::text ORDER BY scheduled_start_utc DESC) AS gids,
          ARRAY_AGG(margin ORDER BY scheduled_start_utc DESC) AS margins,
          MAX(scheduled_start_utc) AS latest_start,
          (ARRAY_AGG(ccp ORDER BY scheduled_start_utc DESC))[1] AS latest_ccp
     FROM dated
    WHERE rn <= 10
    GROUP BY internal_player_id
    HAVING COUNT(*) >= 5`, // per DR-6 minimum L10 eligibility
  [market]
);
```

Population stddev is then computed in TypeScript from that margin array — no `real_line_windows` query anywhere in the calibration output path.

### (c) Will the V1-A1-3 evidence engine require `real_line_windows` to be populated? Is there a committed driver that populates them outside the correction path?

**Separate question, for report only:** The engine's binding table in EVIDENCE_PROFILE_METHOD_V1.md §A.1 is `ThresholdWindowResult` from `src/computation/thresholdWindows.ts::computeThresholdWindow(window_type, threshold, games)` — computed **on demand** from a games list, not persisted. §A.1 does not list `real_line_windows` as a binding. §A.2 line-relative production also binds to `ThresholdWindowResult` fields, not to `real_line_windows`.

Therefore the V1-A1-3 engine, as bound in the method authority, **does NOT require `real_line_windows` to be persisted for its own computation.**

**Is there a committed driver that populates `real_line_windows` outside the correction path?** No. The V1-5 `recomputationWriter` is the sole committed writer for `real_line_windows`; it is invalidation-driven and does not run against initial stat landings (same argument as Phase A §A for `historical_line_results`). This is a **second gap** — parallel in structure to the first — but its consumer set is smaller (Brief / Board read-model surfaces per `V1_COMPUTATION_CONTRACT.md §1`, not the evidence engine).

**Gap name (for governor tracking):** *"initial-population of `real_line_windows` outside the correction path"*. Follow-up owner suggestion: whichever ticket first surfaces a consumer that reads `real_line_windows` at scale (candidate: V1-6 Brief / Board window aggregates) owns building the first-pass populator, mirroring the Option A pattern established here. **This phase does NOT build it** — per B1 (b) it is unnecessary for the calibration and per (c) unnecessary for V1-A1-3.

### (d) Reference-date policy

**Not applicable.** (b) says calibration does not need `real_line_windows` populated; (c) says the engine does not either. This phase does not populate `real_line_windows`, so no reference-date policy is invoked.

**HARD GATE (no new migrations required):** the populator writes only to `historical_line_results`. No new migration, no schema change, no new table. The gate passes.

---

## B2. Populator built

**Files added:**

- `src/lines/historicalLineResultsBackfill.ts` (~430 lines) — the populator library.
- `scripts/v1_4c_phase_b_populate.ts` (~200 lines) — thin operator script.
- `tests/lines/historicalLineResultsBackfill.test.ts` — unit tests for pure helpers.
- `tests/integration/v1_4c_phase_b_backfill.integration.test.ts` — 5 live-Postgres integration tests.

### B2.1 Reuse discipline

- **Reuses `src/lines/historicalLineResult.ts::computeHistoricalLineResult`.** No parallel margin / outcome / push / coverage math. One owner per metric.
- Reuses `src/computation/computationVersion.ts::V1_5_COMPUTATION_VERSION`.
- The eligibility SQL is exported as a named constant `HISTORICAL_LINE_RESULTS_BACKFILL_ELIGIBILITY_SQL` and quoted verbatim by the operator script's preflight probe — no string drift between the populator's scan and the preflight report.

### B2.2 Version-aware UPSERT

The `INSERT INTO historical_line_results` clause matches `recomputationWriter`'s shape line-for-line, targeting the same `historical_line_results_grain_version_unique` constraint and restricting `DO UPDATE SET` to exactly the recomputable columns (never method_version, computation_version, or the identity columns). The exact clause used:

```
INSERT INTO historical_line_results
  (…identity + derived columns…, computation_version, computed_at)
VALUES (…, $13, now())
ON CONFLICT ON CONSTRAINT historical_line_results_grain_version_unique
DO UPDATE SET
  canonical_closing_point_id = EXCLUDED.canonical_closing_point_id,
  canonical_closing_point    = EXCLUDED.canonical_closing_point,
  player_game_stat_id        = EXCLUDED.player_game_stat_id,
  player_stat_key            = EXCLUDED.player_stat_key,
  player_stat_value          = EXCLUDED.player_stat_value,
  outcome                    = EXCLUDED.outcome,
  margin                     = EXCLUDED.margin,
  coverage_state             = EXCLUDED.coverage_state,
  computed_at                = now(),
  updated_at                 = now()
RETURNING (xmax = 0) AS inserted
```

**Never `ON CONFLICT DO NOTHING`.** The V1-5 anti-pattern is impossible here by construction.

### B2.3 rowCount verification

Every UPSERT verifies `rowCount === 1` and throws (rolling back the batch) on mismatch. Counter values (`rows_inserted` vs `rows_updated`) come from `RETURNING (xmax = 0)`, distinguishing the two paths — insert vs update — from a single statement.

### B2.4 Transactional batches + fresh-client-per-batch

- Batch size: **500 grains** per transaction (`DEFAULT_BATCH_SIZE`).
- `withFreshClientRetry`: opens a brand-new `pg.Client` (with statement_timeout=30s + SSL) per batch. `client.end()` in finally. Retries up to 3 times on connection-class errors only (`ECONNRESET`, `ETIMEDOUT`, `ECONNREFUSED`, `EPIPE`, `Connection terminated`, `Client has encountered a connection error and is not queryable`). No pooled client held idle. No global `uncaughtException` handler.
- Batch-cursor sanity check: throws defensively if the cursor fails to advance despite the batch being full — no infinite-loop hazard.

### B2.5 Idempotence & resumability

Idempotent by the `historical_line_results_grain_version_unique` UNIQUE + the version-aware UPSERT: a second run at the same `V1_5_COMPUTATION_VERSION` UPDATES rather than INSERTS, with identical derived-column values. Timestamps update; derived values do not. `computation_version` never advances on a re-run.

### B2.6 Eligibility filter

Exported `HISTORICAL_LINE_RESULTS_BACKFILL_ELIGIBILITY_SQL`:

```
ccp.canonical_closing_point IS NOT NULL
AND ccp.selection_method IN ('single_book', 'unique_modal')
AND ccp.coverage_label   IN ('single_book', 'complete')
AND pgs.eligibility_state = 'eligible'
```

This is identical to Phase A §C.2's filter and to `recomputationWriter::recomputeHistoricalForGamePlayer`. Ineligible grains are ABSENT from the output — never defaulted, never relabeled to dodge the schema CHECK.

### B2.7 Provenance

Rows are written with `provenance = 'backfilled_historical'`. The V1-4b CHECK-widening migration `20260711150000_...` admits this value. No CHECK is weakened. `recomputationWriter` hard-codes `'self_observed'` because it handles CURRENT-poll corrections; this populator hard-codes `'backfilled_historical'` because it handles the seeded closing lines. Both are truthful.

### B2.8 Pushes

`computeHistoricalLineResult` owns the push classification (`margin === 0 → push`). This populator never touches it.

---

## B3. Run against the hosted database — actual outcome vs expected

**Preflight probe** (read-only) — captured 2026-07-15T19:44:23Z:

```
historical_line_results (before):        0
player_game_stats:                    4194
canonical_closing_points:             4955
recomputation_invalidations:             0
observed_line_lifecycle:                 0
movement_events:                         0
eligible-grain count (per populator SQL):
  player_assists   872
  player_points   1524
  player_rebounds 1301
  player_threes    961
  TOTAL           4658
```

**Run 1** (2026-07-15T19:44:23Z → 19:52:57Z, 8 min 34 sec):

```json
{
  "grains_observed": 4658,
  "grains_skipped_missing_stat": 0,
  "rows_inserted": 4658,
  "rows_updated": 0,
  "batches_ok": 10,
  "batches_retried": 0,
  "rows_per_market": {
    "player_assists": 872,
    "player_rebounds": 1301,
    "player_threes": 961,
    "player_points": 1524
  }
}
```

**Total 4658 = expected 4658.** Per-market exact match: points 1524, rebounds 1301, assists 872, threes 961. No divergence. Zero connection-class retries. Zero grains skipped for missing normalized stat (V1-2 null-to-zero on eligible played rows meant every eligible grain had a finite stat value at the canonical stat key).

---

## B4. Verification (hosted, read-only)

All queries wrapped in `BEGIN READ ONLY … ROLLBACK`. Nothing written during verification.

### B4.1 Row counts total + per market

```sql
SELECT COUNT(*)::int FROM historical_line_results;
-- 4658

SELECT market_key, COUNT(*)::int FROM historical_line_results GROUP BY market_key ORDER BY market_key;
-- player_assists 872, player_points 1524, player_rebounds 1301, player_threes 961
```

Exact match with the expected 4658 / (1524, 1301, 872, 961).

### B4.2 Idempotency proof — checksum + version stability

**Derived-column checksum** (excludes timestamps deliberately) computed BEFORE re-run:

```
c44b1f157c451e643a46a741a2fe7563
```

**Second populator run** (2026-07-15T19:56:03Z → 20:03:58Z, 7 min 55 sec):

```json
{
  "grains_observed": 4658,
  "grains_skipped_missing_stat": 0,
  "rows_inserted": 0,
  "rows_updated": 4658,
  "batches_ok": 10,
  "batches_retried": 0
}
```

**0 inserts / 4658 updates** — the version-aware UPSERT correctly hit `DO UPDATE SET`, not the INSERT branch. **Checksum after re-run:**

```
c44b1f157c451e643a46a741a2fe7563   ← identical
```

**Distinct `computation_version` values across all rows:** `3` (before and after) — the V1-5 canonical constant, unchanged. computation_version did NOT advance. **Idempotency proven.**

### B4.3 Ten hand-checked spot rows

Query joined `historical_line_results` → `players` → `market_registry` → `player_game_stats`, ordered by market then player then game, LIMIT 10. Every row's `stored_margin == recomputed(stat - line)` and every `stored_outcome == expected_outcome(margin sign)`. All ten rows: `match: true`. Sample:

| Market | Player | Line | Stat | Stored margin | Stored outcome | Coverage | Provenance | cv |
|---|---|---:|---:|---:|---|---|---|---:|
| player_assists | Kelsey Mitchell | 2.50 | 3 | 0.50  | over  | complete    | backfilled_historical | 3 |
| player_assists | Kelsey Mitchell | 2.50 | 1 | -1.50 | under | single_book | backfilled_historical | 3 |
| player_assists | Kelsey Mitchell | 2.50 | 2 | -0.50 | under | complete    | backfilled_historical | 3 |
| player_assists | Kelsey Mitchell | 3.50 | 4 | 0.50  | over  | complete    | backfilled_historical | 3 |
| player_assists | Kelsey Mitchell | 2.50 | 6 | 3.50  | over  | complete    | backfilled_historical | 3 |
| player_assists | Kelsey Mitchell | 3.50 | 2 | -1.50 | under | complete    | backfilled_historical | 3 |
| player_assists | Kelsey Mitchell | 2.50 | 3 | 0.50  | over  | complete    | backfilled_historical | 3 |
| player_assists | Kelsey Mitchell | 2.50 | 3 | 0.50  | over  | single_book | backfilled_historical | 3 |
| player_assists | Kelsey Mitchell | 2.50 | 2 | -0.50 | under | complete    | backfilled_historical | 3 |
| player_assists | Kelsey Mitchell | 2.50 | 3 | 0.50  | over  | complete    | backfilled_historical | 3 |

Arithmetic reproduced by hand: e.g. row 5, 6 assists − 2.50 line = 3.50 margin, sign +1 → over. Correct.

### B4.4 Push rows

`SELECT COUNT(*) FROM historical_line_results WHERE outcome='push';` → **0** — none exist.

**Reason confirmed structurally:** `SELECT COUNT(*) FROM canonical_closing_points WHERE canonical_closing_point IS NOT NULL AND canonical_closing_point = ROUND(canonical_closing_point, 0);` → **0**. Every seeded canonical closing point is a half-point (like 15.5, 8.5, 4.5, 2.5). Player stats are integer counts. Therefore `stat − line` can NEVER equal zero on this dataset — a push outcome is structurally impossible. This is a truthful absence, not a populator omission.

The integration test in `tests/integration/v1_4c_phase_b_backfill.integration.test.ts` DOES include a push-row test using an explicitly integer-valued line (game index 4 in the fixture — line 15, stat 15 → margin 0 → outcome 'push') to prove the populator's push classification works when the data admits it.

### B4.5 CURRENT_ONLY_WHERE_CLAUSE zero-leak

- `SELECT COUNT(*) FROM market_snapshots WHERE request_kind='current_poll' AND provenance <> 'self_observed';` → **0**.
- `SELECT provenance, COUNT(*) FROM historical_line_results GROUP BY provenance;` → **4658 backfilled_historical, 0 self_observed**.

No historical row is visible through current-selection filters. Structural isolation preserved.

### B4.6 observed_line_lifecycle + movement_events + recomputation_invalidations still zero

```
observed_line_lifecycle:         0  (expected 0)
movement_events:                 0  (expected 0)
recomputation_invalidations:     0  (expected 0)
```

All three unchanged from pre-run. Populator did NOT create lifecycle state, did NOT emit movement events, did NOT retro-emit invalidations (governor ruling honored).

### B4.7 Outcome distribution

```
over:  2125
under: 2533
push:     0
```

Sum: 4658 ✓.

---

## B5. Calibration re-run

**Command:**

```
set -a && source .env && set +a
node --import tsx scripts/v1_a1_1_dr14_dr27_calibration.ts > /tmp/v1_4c_phase_b_calibration.json
```

Exit code 0. Output size: 67 kB JSON. **`data_gap.present: false`** — the calibration ran mechanically as designed, populating every DR-14 and DR-27 section.

The full regenerated report is at `docs/product/reports/V1_DR14_DR27_CALIBRATION.md`. Summary:

**DR-14 clamp proportions:** points 31.10 %, rebounds 24.06 %, assists 32.11 %, threes **48.07 %**. Every market clears the "ordinary-margin dominance" flag (p75 ≥ M/2). `player_threes` has the highest clamp proportion; owner attention warranted on M_threes = 1.5.

**DR-27 qualifying-sample size — with decisiveness commentary:**

| Market | Qualifying players | Decisiveness |
|---|---:|---|
| player_points   | 98 | adequate |
| player_rebounds | 85 | adequate |
| player_assists  | 52 | **thin** |
| player_threes   | 58 | **thin** |

**Honestly:** this sample cannot decide K for `player_assists` or `player_threes` on its own. `player_points` and `player_rebounds` are decisive.

**DR-27 cap proportions per K:**

- `K = 1.5`: points 5.10 %, rebounds 1.18 %, assists 9.62 %, threes 3.45 %.
- `K = 2.0`, `2.5`, `3.0`: **zero profiles capped across all four markets.**

**would_be_strong_capped:** null for every (market, K). Reported as absence — composite score §B.6 requires current market rows + evaluated line not present in seed data. Per §I.1 "no estimation where data is absent."

**Recommended K (one, labeled):** `K = 1.5`. Rationale: it is the only candidate that produces observable caps on this sample; K ≥ 2.0 makes DR-27 a dormant rule. Caveats: thin sample for assists / threes; owner may reasonably defer for those two markets until a larger sample is available. This is calibration EVIDENCE, not a governor decision — DR-27 remains formally deferred; the K choice is the owner's, routed through DR-24; `ABNORMAL_DISPERSION` remains RESERVED in `evidence_method_v1`.

---

## B6. Evidence

### B6.1 Typecheck

```
$ npm run typecheck
> tsc --noEmit
(exit 0, no diagnostics)
```

### B6.2 Full unit suite (worktree quiet — sole agent)

```
$ npm test
ℹ tests 529
ℹ suites 88
ℹ pass 458
ℹ fail 0
ℹ cancelled 0
ℹ skipped 71  (integration — no SLIPLABZ_DATABASE_URL for the unit run)
```

Growth over Phase A close: +6 unit tests (5 new V1-4c Phase B populator tests + Phase A's earlier growth). Prior baselines: V1-5 had 419, V1-A1-2 had 453, this run has 458.

### B6.3 Integration suite (against a fresh local Docker Postgres `sliplabz-v1-4c-postgres:5432 → 55443`)

```
$ SLIPLABZ_DATABASE_URL="postgresql://postgres:postgres@localhost:55443/sliplabz_v1_4c_test" \
    npm run test:integration
ℹ tests 71
ℹ suites 14
ℹ pass 71
ℹ fail 0
```

Growth: +5 integration tests over V1-A1-2 (66) — the five new populator probes:

- happy path (4 markets × 5 games = 20, one ineligible game → 16 rows) + push classification + provenance + computation_version verification;
- second-run no-op idempotency (checksum unchanged, computation_version stable);
- dry_run BEGIN/ROLLBACK per batch — table stays at zero even though counters report 20;
- absence-by-design — a missing canonical_closing_point row leaves its grain ABSENT;
- only_market filter narrows correctly without leakage.

### B6.4 Populator run output

`/tmp/v1_4c_phase_b_run1.log` (first run, 4658 inserts / 0 updates) and `/tmp/v1_4c_phase_b_run2.log` (second run, 0 inserts / 4658 updates). Both exit 0.

### B6.5 B4 verification SQL + results

Recorded verbatim in §B4 above.

### B6.6 Regenerated calibration report

`docs/product/reports/V1_DR14_DR27_CALIBRATION.md` (replaces the prior data-gap version). Full JSON output for reproducibility: `/tmp/v1_4c_phase_b_calibration.json`.

---

## B7. Files touched — Phase B

**Written by Phase B session (all on-manifest, none touching Phase A / Agent B / prior migrations):**

- `src/lines/historicalLineResultsBackfill.ts` (new, ~430 lines) — populator library.
- `scripts/v1_4c_phase_b_populate.ts` (new, ~200 lines) — operator script.
- `tests/lines/historicalLineResultsBackfill.test.ts` (new) — unit tests.
- `tests/integration/v1_4c_phase_b_backfill.integration.test.ts` (new) — integration tests.
- `docs/product/reports/V1_DR14_DR27_CALIBRATION.md` (rewrote — this file is mine to update per the ticket's "those ARE yours to update in this phase").
- `docs/product/reports/V1_TICKET_4C_REPORT.md` (appended Phase B section — Phase A content preserved verbatim).

**Confirmed NOT modified by Phase B:**

- `scripts/v1_a1_1_dr14_dr27_calibration.ts` — the calibration script itself. It's mine to update but nothing needed updating; it worked exactly as authored once `historical_line_results` was populated. Left byte-identical to its pre-Phase-B state.
- `scripts/v1_4c_stats_backfill.ts` (Phase A committed) — untouched.
- Any `src/shared/enums.ts`, any migration, `src/evidence/*`, `tests/evidence/*`, `tests/migrations/schemaShape.test.ts` (Agent B territory / already committed).
- Any prior authority under `docs/product/` other than the two on-manifest ones.
- Any `src/` module other than the one new file `src/lines/historicalLineResultsBackfill.ts`.

---

## B8. Final `git status --short`

```
 M docs/product/reports/V1_TICKET_4C_REPORT.md
?? docs/product/reports/V1_DR14_DR27_CALIBRATION.md
?? scripts/v1_4c_phase_b_populate.ts
?? scripts/v1_a1_1_dr14_dr27_calibration.ts
?? src/lines/historicalLineResultsBackfill.ts
?? tests/integration/v1_4c_phase_b_backfill.integration.test.ts
?? tests/lines/historicalLineResultsBackfill.test.ts
```

Two of the seven lines are the previously-orphan files (`docs/product/reports/V1_DR14_DR27_CALIBRATION.md` and `scripts/v1_a1_1_dr14_dr27_calibration.ts`). `V1_TICKET_4C_REPORT.md` shows as `M` because Phase A committed a version of it (this is my append). The calibration REPORT shows as `??` (not `M`) because it was never committed — Phase B rewrote the untracked file in place per the ticket's authorization ("those ARE yours to update in this phase"). The calibration SCRIPT `scripts/v1_a1_1_dr14_dr27_calibration.ts` remains untracked because I did not modify it — it worked exactly as authored once `historical_line_results` was populated.

**Nothing staged. Nothing committed. Nothing pushed.**

---

HALTED after V1-4c Phase B. Nothing committed. Calibration evidence is ready for owner review; DR-27 has not been decided and the evidence engine has not begun.

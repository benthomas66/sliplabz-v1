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

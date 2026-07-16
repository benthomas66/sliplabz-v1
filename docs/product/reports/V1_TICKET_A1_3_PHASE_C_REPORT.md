# V1-A1-3 Phase C Ticket Report — Read-Model Input Assembly

**Ticket:** V1-A1-3 Phase C (governor-required split from Phase B; the injectable-builder default that Phase B deferred).
**Kind:** engine-adjacent module + driver wiring + integration tests. No new migrations. No new formulas. Phase A is consumed unchanged.
**Starting HEAD:** `aab86085ccde11f18390f8218f610e0b77b93330` — `feat: evidence profile writer, population driver, and integration (V1-A1-3 Phase B)`.
**Method authority version:** `docs/product/EVIDENCE_PROFILE_METHOD_V1.md` v1.2; `method_version` = `evidence_method_v1` (unchanged).

---

## 1. Governance status

- **DR-29 REMAINS ACTIVE.** Hosted `current_market_rows` is empty; the operator script observed zero grains and persisted zero profiles. Per §I.3 (clarified 2026-07-15), rows written by tests / fixtures / migration probes / throwaway Docker databases are NOT first-profile events. Phase C fixture-inserted read-model source rows in a local Docker Postgres to exercise the pipeline end to end — those are NOT first-profile events and do NOT trigger expiry.
- **`method_version` unchanged.** No formula, threshold, weight, worked-example value, reason trigger, or surface rule was modified. Phase A is consumed via imports only; nothing under `src/evidence/{engine,quality,classification,reasons,components}.ts` was touched.
- **No new migrations.** Every input the builder needs is available from the read model shipped in V1-1 through V1-5x.
- **`abnormal_dispersion` never emitted.** The writer's belt-and-braces guard from Phase B is untouched; Phase C's integration proofs implicitly exercise it (Test 6's re-run has never emitted the reserved code).

---

## 2. Section A blocking answer — with quoted signatures

### (a) Does the read model's threshold-windows owner accept an arbitrary evaluated line?

**Yes.** The signature at `src/computation/thresholdWindows.ts:38-42` is:

```
export function computeThresholdWindow(
  window_type: 'L5' | 'L10' | 'L20' | 'season',
  threshold: number,
  games_reverse_chron: ReadonlyArray<ThresholdWindowGame>
): ThresholdWindowResult
```

The module header states: *"Compares player performance against a user-supplied threshold. This is LINE-RELATIVE — distinct from real-line results (which compare against the game's actual closing line)."* The `threshold` parameter is arbitrary — the caller chooses the line.

`docs/product/EVIDENCE_PROFILE_METHOD_V1.md` §A.1 verbatim confirms: *"The engine takes threshold-relative results per window from `ThresholdWindowResult` (`src/computation/thresholdWindows.ts` → `computeThresholdWindow(window_type, threshold, games)`), one invocation per window, all against the evaluated line as threshold."*

### (b) The exact call and its ordering dependency

Per grain the builder executes, in this order:

1. **Read the composed `CurrentMarketRow`** via the canonical read path (query `market_offerings + market_snapshots` restricted to `current_poll + self_observed` and call `composeCurrentMarketRow`; this is exactly what `src/computation/driver/currentMarketRowsAggregator.ts` does, and it is the single owner of the composition). Cite: aggregator lines 42-124.
2. **Extract `consensus_point` from `CurrentMarketRow.line_consensus.consensus_point`.** No tiebreak is invented; when it is null, the builder proceeds through short-circuit branches (§C.3.1 tied / §C.3 no market) with a type placeholder that the engine ignores on those paths.
3. **Read the player's historical games** at the latest `computation_version` per grain (mirroring V1-4c Phase B's populator + V1-5's read pattern), joined to `games` for `scheduled_start_utc`, ordered reverse-chronologically. Provenance carries through.
4. **Call `computeThresholdWindow` FOUR times** — for `'L5'`, `'L10'`, `'L20'`, `'season'` — each with the SAME `threshold = consensus_point`. §A.1 mandates "one invocation per window, all against the evaluated line as threshold."
5. Call `readHistoricalCoverageForPlayerMarket` (RME-1 owner — `src/computation/historicalCoverage.ts`).
6. Call `readMappingResolutionForGrain` (RME-2 owner — `src/computation/mappingResolution.ts`).
7. Extract `book_detail.one_sided` from the composed `CurrentMarketRow.book_detail` (RME-3 — already computed inside `composeCurrentMarketRow`).
8. Read `games.status` (§C.8) and assemble `EvidenceProfileInput` + `EvidenceProfileAuditRefs`.

The ordering dependency is real: threshold windows are computed AT the consensus point → the consensus point must be extracted FIRST. Test 2 makes this explicit — a fixture where consensus is 25.5 but the "obvious" line is 20.5 yields opposite directions; the persisted profile's direction proves the engine used 25.5.

### (c) Read-model gap? No.

`(a)` is yes, so `(c)` is N/A. **No parallel computation is built.** The builder does not compute consensus, does not compute freshness, does not compute one-sided, does not compute coverage, does not compute mapping resolution, does not compute threshold windows. It calls the six read-model owners in the correct order and passes their outputs into `computeEvidenceProfile`.

### (d) Threshold windows vs real_line_windows — §A.1 confirmation

Confirmed. §A.1 (`docs/product/EVIDENCE_PROFILE_METHOD_V1.md` lines 71-84) binds every historical-window input to `ThresholdWindowResult` — NOT `RealLineWindowResult`. The engine consumes threshold windows (line-relative, against the evaluated line) and NOT real-line windows (against each game's own closing line). Therefore the initial-population gap for `real_line_windows` that V1-4c Phase B identified does NOT block this ticket. Confirmed.

---

## 3. The builder — `src/evidence/driver/readModelInputBuilder.ts`

### 3.1 API

```
export function makeReadModelInputBuilder(ctx: {
  today_utc_date: string;
  reference_date: string;
}): (grain: EvidenceGrain, tx: Tx) => Promise<
  { input: EvidenceProfileInput; audit: EvidenceProfileAuditRefs } | null
>
```

A factory that returns a `BuildProfileInput` closure the driver injects into its per-grain loop. The clock is passed in — the builder never reads `Date.now()` for its outputs (one exception is scoped to the `composeCurrentMarketRow` freshness owner's `now` field, which is where freshness OWNS the clock semantics per V1-5).

### 3.2 Consumed read-model owners (one owner per metric — single-owner invariant)

| Owner | Purpose | §A binding |
|---|---|---|
| `src/computation/currentMarketRow.ts::composeCurrentMarketRow` | `CurrentMarketRow` (consensus, range, distribution, book count, first-observed, movement, freshness, book_detail one_sided, availability_context) | §A.3, RME-3 |
| `src/computation/thresholdWindows.ts::computeThresholdWindow` | 4× (L5/L10/L20/season) `ThresholdWindowResult` | §A.1, §A.2 |
| `src/computation/historicalCoverage.ts::readHistoricalCoverageForPlayerMarket` | RME-1 `HistoricalCoverageResult` | §A.4, DR-25 |
| `src/computation/mappingResolution.ts::readMappingResolutionForGrain` | RME-2 `MappingResolutionResult` | §A.4, §C.9 |
| `games.status` direct SQL | §C.8 postponed/canceled | §A.6 |

### 3.3 Short-circuit cases — declared explicitly

**Case 1 — Tied consensus** (`line_consensus.selection_method = 'tied_no_unique_mode'` AND `consensus_point IS NULL` AND `eligible_book_count > 0`):

- The builder passes `evaluated_line = 0` as a TYPE placeholder (the `EvidenceProfileInput` type requires `number`).
- This value NEVER propagates to the persisted profile because the engine reaches `unavailable` at §D.1 step 1 via §C.3.1 (DR-28) BEFORE evaluating components. The output's `evaluated_line` is set to `null` on that path (V1-A1-2 CHECK enforced).
- The composed `CurrentMarketRow.line_consensus.selection_method = 'tied_no_unique_mode'` alone drives the outcome. The builder does NOT choose lower / upper / average / first-observed / single-book. Test 3 proves this end-to-end from real read-model rows.

**Case 2 — No usable current market** (§C.3 four-way disambiguation reaches Unavailable — `freshness = 'unavailable'` OR `(freshness ∈ {stale, failed_latest_poll} AND book_count = 0)`):

- `consensus_point` may be null; the placeholder rule from Case 1 applies.
- Engine reaches `unavailable` at §D.1 step 1 via `NO_CURRENT_MARKET`. Components not evaluated. Persisted `evaluated_line = null`.

**Case 3 — Unresolved mapping** (§C.9: `MappingResolutionResult.player_resolved = false` OR `event_resolved = false`):

- `consensus_point` may be present. Builder assembles the input truthfully.
- Engine reaches `unavailable` at §D.1 step 1 via `UNRESOLVED_PLAYER_MAPPING` or `UNRESOLVED_EVENT_MAPPING` BEFORE components are evaluated. Test 4 proves this from real `provider_players` / `provider_games` state (no fabricated flag).

In none of these does the builder fabricate an input to keep the pipeline tidy. When `consensus_point` is null, `evaluated_line = 0` is a shape placeholder that never appears on the persisted profile.

### 3.4 Wiring: replaces the Phase B throw at populate.ts:~234

`src/evidence/driver/populate.ts` is updated:

- `PopulatorOptions` gains `today_utc_date?: string` and `reference_date?: string`. Both are REQUIRED when `build_profile_input` is omitted (the default builder needs them for DR-25 + §H reproducibility).
- The throw at line 234 is replaced by `defaultReadModelBuilder(options)` — a function that constructs `makeReadModelInputBuilder(ctx)` from the options's dates. If either date is missing, it throws a clear error naming which is missing and why.
- The injection seam for tests is preserved: `options.build_profile_input` still overrides the default.

The operator script (`scripts/v1_a1_3_populate.ts`) now passes `today_utc_date = new Date().toISOString().slice(0, 10)` and `reference_date = today` so the hosted invocation exercises the default builder end-to-end. When hosted grain count is 0, the script still short-circuits (skipping the populator call entirely to avoid unnecessary DB round-trips) and reports the DR-29 status truthfully.

---

## 4. Six integration proofs — real read-model rows

**Container:** `sliplabz-v1-a1-3-phase-c-postgres`, image `postgres:16`, host port `55448 → 5432`, run `--rm` and stopped after validation. **Database:** `sliplabz_v1_a1_3_phase_c_test`. **Test file:** `tests/integration/v1_a1_3_phase_c_read_model.integration.test.ts`.

Every proof fixture-inserts source rows in the V1-1 through V1-5 tables the read model reads (`teams`, `players`, `games`, `provider_teams/players/games`, `bookmaker_registry`, `market_registry`, `oddsapi_ingestion_runs`, `market_snapshots`, `market_offerings`, `current_market_rows`, `player_game_stats`, `canonical_closing_points`, `historical_line_results`, `bdl_ingestion_runs`). No fabricated inputs beyond what real polling would emit.

| # | Ticket bullet | `it(...)` name | Result |
|---:|---|---|---|
| 1 | unique modal → persisted profile at consensus, expected classification + reasons | `1: a unique modal consensus, assembled from real read-model rows, produces a persisted profile at that consensus point with the expected classification and reasons` | ✓ |
| 2 | threshold windows AT the consensus line (ordering dependency) | `2: threshold windows are computed AT the consensus line — a fixture where consensus vs. some other line yields DIFFERENT counts, and the consensus-line answer is the one stored` | ✓ |
| 3 | tied consensus → Unavailable + `no_unique_consensus_line`, no invented line | `3: tied consensus, assembled from real rows, reaches Unavailable + no_unique_consensus_line with no invented line` | ✓ |
| 4 | unresolved mapping from real state (not fabricated flag) | `4: a grain whose mapping is unresolved reaches the §C.9 outcome from real mapping state (not a fabricated flag)` | ✓ |
| 5 | `includes_backfilled_historical` derived from real provenance, reaches persisted profile | `5: includes_backfilled_historical is computed from actual row provenance and reaches the persisted profile intact` | ✓ |
| 6 | idempotent re-run: checksum unchanged | `6: re-running the driver over the same fixture set is idempotent — checksum over derived columns unchanged` | ✓ |

Plus one sanity test: `sanity: makeReadModelInputBuilder returns null for a non-launch market_key (four-market scope lock per GD-9)` — ✓.

---

## 5. Hosted zero-profile proof

Command:

```
$ set -a && source .env && set +a && node --import tsx scripts/v1_a1_3_populate.ts
```

Output (verbatim):

```json
{
  "kind": "preflight",
  "hosted_db_host_redacted": "postgresql://postgres.fxlzkhaepwlnezchnkyt:REDACTED@aws-0-ca-central-1.pooler.supabase.com:5432/postgres",
  "governor_notes": "Zero provider calls. Reads/writes are hosted-Supabase-only. Grain source: current_market_rows (V1-5 read-model summary)."
}
{
  "kind": "preflight_grains",
  "current_market_rows_distinct_grains": 0,
  "expected_hosted_result": "zero grains → zero profiles. current_market_rows is empty (no live polling has ever run; seeded games are all final/past)."
}
{
  "kind": "complete",
  "counters": {
    "grains_observed": 0,
    "grains_skipped_no_input": 0,
    "profiles_inserted": 0,
    "profiles_updated": 0,
    "batches_ok": 0,
    "batches_retried": 0
  },
  "dr29_note": "Zero profiles persisted. The DR-29 pre-first-profile exception REMAINS ACTIVE. No operative first-profile event occurred; the record obligation carries forward to the first ticket that persists an operative profile against live current-market data."
}
```

**Grain-source query (verbatim from `src/evidence/driver/populate.ts::countGrains`):**

```sql
SELECT COUNT(*)::int AS n
  FROM (SELECT DISTINCT internal_game_id, internal_player_id, market_key
          FROM current_market_rows) g
```

**Result:** 0 grains → 0 profiles → 0 reason rows → 0 provider calls → DR-29 remains **ACTIVE**.

---

## 6. Suites

### 6.1 Typecheck
```
$ npm run typecheck
> tsc --noEmit
(exit 0, no diagnostics)
```

### 6.2 Unit suite
```
$ npm test
ℹ tests 580
ℹ suites 104
ℹ pass 489
ℹ fail 0
ℹ skipped 91  (integration tests — no SLIPLABZ_DATABASE_URL for the unit run)
```
Growth over Phase B: +7 tests (all the new integration tests appear here as skipped).

### 6.3 Integration suite
```
$ SLIPLABZ_DATABASE_URL="…phase-c-postgres:55448/…" npm run test:integration
ℹ tests 91
ℹ suites 16
ℹ pass 91
ℹ fail 0
```
Growth: +7 integration tests (6 proofs + 1 sanity). Every pre-existing V1-A1-2 / V1-4c Phase B / V1-A1-3 Phase B integration test continues to pass.

---

## 7. Files added / modified

**Added (`??`):**
- `src/evidence/driver/readModelInputBuilder.ts` — the Phase C builder.
- `tests/integration/v1_a1_3_phase_c_read_model.integration.test.ts` — the six proofs + sanity.

**Modified (`M`):**
- `src/evidence/driver/populate.ts` — `PopulatorOptions` gains `today_utc_date` + `reference_date`; the throwing stub at line 234 is replaced by `defaultReadModelBuilder(options)`; the injection seam preserved.
- `scripts/v1_a1_3_populate.ts` — the hosted-grains branch now invokes the populator with the Phase C default builder; the zero-grain branch is preserved and reports DR-29 truthfully.

**NOT modified:** the authority, any prior migration, `src/evidence/{engine,quality,classification,reasons,components,marginNormalizers,types,writer,computationVersion}.ts`, or any pre-Phase-A file. Phase A's method logic is consumed as a black box.

---

## 8. Deviations

None from the ticket contract. Every §A binding lands on the exact V1-5 module §A names for it.

**GOVERNOR NOTE (V1-A1-3 Phase C review, `readModelInputBuilder.ts` ~line 156).** When `consensus_point` is null, the builder passes `evaluated_line = 0` as a shape placeholder and computes four threshold windows against it. Those values are garbage — every stat sits above a line of 0 — and are discarded: `engine.ts` reaches its Unavailable short-circuit and returns with `c_rtp / c_ms / c_wa / c_ma / composite_score` all null before any component consumes them. No fabricated number can reach a persisted profile. The behaviour is contained structurally because `threshold_windows` is an ENGINE INPUT and never leaves the engine call — the writer persists components, versions, and audit references, never the windows.

The honest type is `evaluated_line: number | null` with a correspondingly nullable `threshold_windows`, which would make the fabrication IMPOSSIBLE rather than harmless-by-downstream-guard. The governor declined a REVISE here: the fix cascades through Phase A's committed input type for zero present risk. It should be done the next time those types are legitimately opened, and this note exists so that ticket knows why.

Secondary, minor: the discarded window computation is wasted CPU on every short-circuited grain. No extra queries — `games` is fetched once and reused.

## 9. Classified assumptions

| # | Assumption | Class |
|---:|---|---|
| 1 | Consensus computation and freshness within the composer are stable across the tx boundary — the builder calls `composeCurrentMarketRow` with `now = new Date().toISOString()` inside the tx. When the composer is later extended to expose a "now" injection (a §I.2 follow-up), the builder can forward `today_utc_date` for full determinism. Today the composer's freshness owner reads the clock; the builder does not. | Non-blocking |
| 2 | The persisted `current_market_rows` row is the AUTHORITATIVE grain source (it's what the aggregator writes). The builder re-composes the full `CurrentMarketRow` shape at read time by re-reading the underlying offerings; this is the canonical read path (matches the aggregator's own composition). No "cached" flat summary is trusted where the composed shape is required. | Non-blocking |
| 3 | `evaluated_line = 0` as a type placeholder when `consensus_point` is null is honest because the engine never propagates it to the persisted profile on Unavailable paths. If `EvidenceProfileInput.evaluated_line` ever becomes `number \| null` in a future ticket, this placeholder disappears. Under `evidence_method_v1` the placeholder is never observable on-the-wire. | Non-blocking |
| 4 | `bdl_availability_snapshot_id` is written as `null` for the audit reference. §A.4 binds availability to `CurrentMarketRow.availability_context` (composed from `bdl_availability_current_state`); the V1-A1-2 schema admits `NULL` here per the migration comment. A follow-up ticket may wire a specific snapshot id lookup; today the profile row's audit lineage is anchored by `current_market_row_id`. | Non-blocking |
| 5 | The provider-blind semantics of `MappingResolutionResult` (documented at `mappingResolution.ts:82-102`: "approved for AT LEAST ONE provider") are consumed as-is. A grain that is approved for BALLDONTLIE but unresolved for Odds API reports `resolved=true` here and surfaces downstream as `NO_CURRENT_MARKET`. The engine's §C.9 behaviour matches the shape's stable semantics. | Non-blocking |

## 10. Where §A was silent — decisions taken

| Situation | Choice | Justification |
|---|---|---|
| §A does not explicitly name the historical-games source for `computeThresholdWindow` (§A.1 says "games" without naming a table). | Read from `historical_line_results` at the latest `computation_version` per grain, joined to `games` for `scheduled_start_utc`. | V1-4c Phase B populator already established this as the canonical source; V1-5 recomputationWriter reads the same table for its own downstream aggregations. Single owner: `historical_line_results` at the latest version. |
| The composer's `earliest_observations` and `movement_events` inputs (`CurrentMarketRowInput`) — §A.3 doesn't say what the engine consumes from them. | Passed empty arrays for both. | The composed shape's `first_observed.point` and `movement_summary.net_point_movement` are what §B.5 uses; both derive to `null` when the input arrays are empty. §B.5 handles null: `first_observed.point = null` → `movement_summary.first_observed_point = null` → `net_point_movement = null` → `movement_dir = 0` per §B.5's `if (net_point_movement is null) then 0`. A hosted follow-up ticket can wire earliest-observation persistence + movement-event replay once those are populated. Nothing about §B.5 is broken by empty inputs today. |
| `bdl_availability_snapshot_id` — no snapshot-id lookup logic is bound anywhere in §A. | Set to `null` on the audit row. | The V1-A1-2 schema admits null; §A.4 binds availability semantics to `CurrentMarketRow.availability_context`, which the composer already produces. Snapshot-id anchoring is optional per the schema and unnecessary for reproduction. |

Nothing was silently invented. Where the authority was silent on shape (e.g. what "games" means for the threshold-window inputs), the ticket chose the single owner already established by prior tickets and cited the precedent. Where the authority was silent on a nullable field (`earliest_observations`, snapshot id), the ticket passed null / empty and cited the composer's behaviour on that input.

---

## 11. `git status --short`

```
 M scripts/v1_a1_3_populate.ts
 M src/evidence/driver/populate.ts
?? src/evidence/driver/readModelInputBuilder.ts
?? tests/integration/v1_a1_3_phase_c_read_model.integration.test.ts
?? docs/product/reports/V1_TICKET_A1_3_PHASE_C_REPORT.md  (this file)
```

**Nothing staged. Nothing committed. Nothing pushed.**

---

HALTED after V1-A1-3 Phase C. Nothing committed. The engine is wired to the read model; zero operative profiles persisted; DR-29 remains active.

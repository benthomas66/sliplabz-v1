# V1-A1-3 Phase B Ticket Report — Evidence Engine: Persistence, Population, and Integration

**Ticket:** V1-A1-3 Phase B (governor-required split; Phase A committed at `cb1ac30`).
**Kind:** writer + population driver + operator script + 12 integration proofs. No new migrations. No live provider calls. No scheduling.
**Starting HEAD:** `cb1ac30cc2e11dde4b33b8c6715e7911172e26c9` — `feat: evidence engine pure computation (V1-A1-3 Phase A)`.
**Method authority version:** `docs/product/EVIDENCE_PROFILE_METHOD_V1.md` v1.2; `method_version` = `evidence_method_v1` (unchanged).
**Evidence computation_version:** starts at **1** (`src/evidence/computationVersion.ts`).

---

## 1. Governance status

**DR-29 REMAINS ACTIVE.** The operator script ran against hosted and persisted **zero** operative profiles. Per §I.3 (clarified 2026-07-15), rows written by tests / fixtures / migration probes / throwaway Docker databases are NOT first-profile events and do NOT trigger expiry. No operative first-profile event occurred during this ticket, so the DR-29 record obligation carries forward to the first ticket that persists an operative profile against **live current-market data**. This ticket does not manufacture one.

`method_version` unchanged, `evidence_method_v1`. No formula, threshold, weight, worked-example value, reason trigger, or surface rule modified. Phase A is consumed, not modified. `abnormal_dispersion` is never persisted (Phase A's reasons.ts throws on any attempt; the writer belt-and-braces asserts the same before every INSERT).

---

## 2. The writer — `src/evidence/writer.ts`

### 2.1 Conflict strategy (matches migration header exactly)

The V1-A1-2 profiles migration header (`supabase/migrations/20260714000001_evidence_profiles.sql`, lines 74–98) was written FOR THIS TICKET. The writer implements it verbatim:

- **Version-aware UPSERT** on `evidence_profiles_grain_version_unique` (`UNIQUE (internal_game_id, internal_player_id, market_key, method_version, computation_version)`).
- **`DO UPDATE SET` restricted to exactly the recomputable columns** per the header list: `evaluated_line`, `evaluated_source_kind`, `evaluated_source_identifier`, `classification`, `direction`, `composite_score`, `c_rtp`/`c_ms`/`c_wa`/`c_ma`, `quality_capped`, `quality_cap_reason`, `includes_backfilled_historical`, `reference_date`, `source_read_model_computation_version`, `current_market_row_id`, `bdl_availability_snapshot_id`, `book_detail_one_sided`, `computed_at`, `updated_at`. Immutable columns (`internal_game_id`, `internal_player_id`, `market_key`, `method_version`, `computation_version`, `evidence_profile_id`, `created_at`) are NEVER in `DO UPDATE SET`.
- **Defense-in-depth `WHERE` clause** gates the UPDATE on same-version identity (`evidence_profiles.method_version = EXCLUDED.method_version AND evidence_profiles.computation_version = EXCLUDED.computation_version`). Even if the caller supplies a different-version pair, the row for a different version never mutates.
- **NEVER `ON CONFLICT DO NOTHING`** — the V1-5 anti-pattern the migration explicitly forbids. `RETURNING (xmax = 0) AS inserted` distinguishes insert vs. update from a single statement.
- **`rowCount` verification** on every INSERT/UPSERT: throw (rolling back the caller's transaction) when `rowCount !== 1`. Counters return affected rows, never attempts.

### 2.2 Reason-set strategy: delete-then-insert inside the same transaction

Both the reasons migration header (`20260714000002_...`, lines 30–45) and the ticket rubric ask for a specific reason-set replacement pattern. **Chosen strategy:** delete-then-insert inside the profile's UPSERT transaction.

**Rationale:**

1. **Simpler than upsert-plus-orphan-delete** — the profile UPSERT already establishes the anchor row's identity in the transaction; DELETE clears any pre-existing reasons and INSERTs establish the post-commit truth. No need for a per-reason UPSERT with a subsequent orphan-scan.
2. **Naturally correct against DR-26 ordering AND the schema's `UNIQUE (evidence_profile_id, category, intra_category_rank)`** — a full-replace with the ordered `output.reasons` array can never leave stale ranks or duplicate positions.
3. **Safe under concurrency** — the writer holds the profile row's transaction lock, so no other writer can observe the intermediate state where the profile is updated but reasons are empty.

Implemented as `DELETE FROM evidence_profile_reasons WHERE evidence_profile_id = $1` followed by one `INSERT ... VALUES (...)` per reason, all inside the caller-supplied `Tx`. Both the delete and each insert verify `rowCount` (each insert = 1; delete is unconditional).

**One-transaction guarantee:** the writer's signature is `writeEvidenceProfile(tx: Tx, ...)`. It NEVER opens its own transaction; the caller is required to wrap the call in `withTransaction`. Test 9 (below) proves that an injected fault after the profile UPSERT but before any reason INSERT fully rolls back both — no orphan profile, no partial reason set.

### 2.3 Consensus-only persistence — structural refusal

Per governor ruling (V1-A1-2 grain decision), only `evaluated_source_kind = 'sportsbook_consensus'` profiles may be persisted at `evidence_method_v1`. The writer refuses structurally:

```
if (input.evaluated_source_kind !== 'sportsbook_consensus') {
  throw new Error('V1-A1-3 writer refused: non-consensus evaluated_source_kind is never persisted at evidence_method_v1');
}
```

This throw fires BEFORE any SQL is executed. Test 6 verifies the refusal and confirms the transaction rolls back with zero rows persisted.

### 2.4 DR-27 reserved-code guard

Belt-and-braces (Phase A's `reasons.ts` also throws on any reserved-code emission): the writer iterates `output.reasons` and throws if any `reason_code` is in `EVIDENCE_RESERVED_REASON_CODES` (currently just `abnormal_dispersion`). Test 11 exercises the full §F fixture matrix and asserts `SELECT COUNT(*) FROM evidence_profile_reasons WHERE reason_code = 'abnormal_dispersion'` = 0.

### 2.5 §H reproducibility (audit references)

Every reference the schema requires is populated truthfully by the writer:

- `current_market_row_id` — passed by the caller as an `EvidenceProfileAuditRefs` field.
- `bdl_availability_snapshot_id` — same.
- `book_detail_one_sided` — same; NULL when the offering set is empty or every price is null (per §A.4 RME-3 derivation rule).
- `source_read_model_computation_version` — the V1-5 read-model computation_version consulted at write time (currently 3).
- `reference_date` — the profile input's `reference_date` field.
- `method_version` — `EVIDENCE_METHOD_VERSION` = `'evidence_method_v1'`.
- `computation_version` — `EVIDENCE_COMPUTATION_VERSION` = 1.
- `includes_backfilled_historical` — computed by Phase A's engine from the actual threshold_windows inputs' provenance flags; carried through the output unchanged (never defaulted).

---

## 3. The driver — `src/evidence/driver/populate.ts` + `scripts/v1_a1_3_populate.ts`

### 3.1 Grain source: `current_market_rows` (with §C.3 citation)

The driver's grain source is `current_market_rows`, the V1-5 read-model summary table. It scans the LATEST `computation_version` per `(internal_game_id, internal_player_id, market_key)` grain (DISTINCT ON pattern, mirroring V1-5's `historicalLineResultsRead::LATEST_CTE`).

**Justification (with authority citations):**

1. **§C.3 four-way disambiguation presupposes a CurrentMarketRow exists.** The four-way table (`docs/product/EVIDENCE_PROFILE_METHOD_V1.md` §C.3, lines 315–323) says the engine "consults `CurrentMarketRow.freshness.state` and `CurrentMarketRow.eligible_book_count.count`." That consultation only makes sense when a `CurrentMarketRow` exists for the grain. When no `CurrentMarketRow` exists at all, the grain is not in the product's view; there is no §C.3 branch to evaluate against.
2. **§C.3 `unavailable | any` fires only when the row itself exists AND says `unavailable`.** The row `unavailable | any book_count → Unavailable + NO_CURRENT_MARKET` (§C.3 last row, line 323) requires the composed `CurrentMarketRow` to report `freshness.state = 'unavailable'`. A total absence of the row is a stronger state — the grain isn't in the product's slate at all — and no profile is written.
3. **`V1_COMPUTATION_CONTRACT.md` §7 confirms `current_market_rows` is the product-slate grain source.** It lists the `current_market_rows aggregator` (`driver/currentMarketRowsAggregator.ts`) as the driver that "upserts one row per `(game, player, market, computation_version)`."

Confirmed reading: **a grain with a `current_market_row` but no usable market is Unavailable + `NO_CURRENT_MARKET`; a grain with NO `current_market_row` at all gets no profile.**

### 3.2 Batched + resumable + fresh-client-per-batch

- Default batch size: **50 grains** (compute is heavier than a plain UPSERT; smaller batches give more predictable timing).
- **Fresh `pg.Pool` per batch** with `max = 1` so it behaves like a fresh client (V1-4b lesson). Retries only on connection-class errors (`ECONNRESET`, `ETIMEDOUT`, `ECONNREFUSED`, `EPIPE`, `Connection terminated`, `Client has encountered a connection error`). Non-connection errors surface immediately.
- **Whole-batch transaction:** all grains in a batch either commit or roll back together. A single failure within a batch (e.g. the writer's guard throwing) rolls back the batch.
- **Cursor-based pagination** on `(internal_game_id, internal_player_id, market_key)` for stable ordering.
- **No global `uncaughtException` handler.**
- **No scheduling.** Cadence is a separate operational ticket; the driver is safe to call repeatedly.

### 3.3 Injectable input builder (test seam)

`BuildProfileInput` is a callback the driver invokes per grain to assemble the full `EvidenceProfileInput`. The default hosted implementation is deferred — since `current_market_rows` is empty on hosted, no builder is needed against hosted. Tests supply their own callback so fixture inputs go straight through without depending on the read-model composer.

A production hosted builder — which composes `CurrentMarketRow`, reads threshold windows AT the composed consensus point, and assembles `HistoricalCoverageResult` (RME-1), `MappingResolutionResult` (RME-2), and `book_detail.one_sided` (RME-3) — belongs to **V1-A1-3 Phase C — Read-Model Input Assembly**. This is engine work with a real ordering dependency (read `current_market_rows` → take the consensus point → compute threshold windows at that line → assemble RME-1/2/3), not a scheduling concern.

### 3.3.1 What V1-A1-3 Phase C must deliver, and what is currently unproven

**Phase C must deliver** a production `BuildProfileInput` implementation that, for each grain surfaced by `current_market_rows`:

1. Reads the current-poll offerings + freshness state + earliest observations + movement events for the grain and calls `composeCurrentMarketRow` (`src/computation/currentMarketRow.ts`) — the single owner of the composed row.
2. Takes the resulting `CurrentMarketRow.line_consensus.consensus_point` as the profile's `evaluated_line`. For the canonical Discover profile, this is the only choice per the V1-A1-2 grain ruling (consensus-only persistence).
3. Calls `computeThresholdWindow(window_type, threshold, games)` (`src/computation/thresholdWindows.ts`) FOUR times — L5, L10, L20, season — against **that same evaluated_line** as threshold. §A.1 binds each window to this call and specifies "one invocation per window, all against the evaluated line as threshold."
4. Reads `HistoricalCoverageResult` for `(internal_player_id, market_key)` via `readHistoricalCoverageForPlayerMarket` (RME-1 owner). §C.1 / DR-25 consume this.
5. Reads `MappingResolutionResult` for `(internal_player_id, internal_game_id)` via `readMappingResolutionForGrain` (RME-2 owner). §C.9 consumes this.
6. Extracts `book_detail.one_sided` from the composed `CurrentMarketRow.book_detail` (RME-3, already computed in step 1).
7. Reads `games.status` for §C.8.
8. Returns the assembled `EvidenceProfileInput` + `EvidenceProfileAuditRefs` for the writer.

**What is currently unproven without Phase C.** The twelve integration tests in this ticket cover every writer + driver contract using **fixtures**, not the real read-model→engine path. That is deliberate — writer semantics and driver control flow are what Phase B owns. But it means:

- **No integration test exercises the read-model→engine wiring end-to-end.** Every test injects a pre-assembled `EvidenceProfileInput` and asserts on what the writer stores. No test proves that `composeCurrentMarketRow` output shapes into the exact `EvidenceProfileInput` fields the engine expects, or that `computeThresholdWindow` calls agree with the engine's threshold-window contract when both are chained from a real `current_market_rows` scan.
- **The engine cannot run in production until Phase C's builder exists.** Today, when `current_market_rows` becomes non-empty (via a later live-polling ticket), the operator script would exit early rather than attempt to run without an injected builder. There is no path from a live-polled grain to a persisted evidence_profile until Phase C ships.

**Phase C is a prerequisite for the DR-29 first-profile event.** The operative first-profile event (§I.3) requires a profile computed against real V1-4c-populated `historical_line_results` + V1-5 read-model inputs, in the production path. Phase C's builder is that production path.

### 3.4 Hosted preflight probe: `countGrains`

Read-only, wrapped in `BEGIN READ ONLY`. Returns the distinct grain count in `current_market_rows`. Test 12 also asserts the count is 0 on a truncated table (mirrors the expected hosted outcome).

### 3.5 Idempotence proof (see Test 10)

A second complete invocation reports 0 inserts + N updates, and the profile checksum over derived columns matches byte-for-byte. Test 10 asserts both.

---

## 4. Twelve integration proofs — 1:1 map

**Container:** `sliplabz-v1-a1-3-postgres`, image `postgres:16`, host port `55447 → 5432`, started `--rm` and stopped after validation. **Database:** `sliplabz_v1_a1_3_phase_b_test`.

**Test file:** `tests/integration/v1_a1_3_engine.integration.test.ts`. Every proof is a distinct `it(...)` block inside the `V1-A1-3 Phase B — 12 integration proofs` suite. All 12 pass, plus one sanity test.

| # | Ticket requirement | Test name | Result |
|---:|---|---|---|
| 1 | unique modal consensus → persisted canonical profile at that consensus point, reasons in DR-26 order | `1: a unique modal consensus produces a persisted canonical profile at that consensus point, with its reasons in DR-26 order` | ✓ |
| 2 | 2-2 tied → Unavailable, no invented evaluated_line, `no_unique_consensus_line`, NOT `no_current_market` | `2: a 2-2 tied distribution produces Unavailable with no invented evaluated_line, reason no_unique_consensus_line, and NO no_current_market` | ✓ |
| 3 | genuinely absent market → `no_current_market`, NEVER `no_unique_consensus_line` | `3: a genuinely absent market emits no_current_market and NEVER no_unique_consensus_line` | ✓ |
| 4 | reordering sportsbook inputs doesn't change the tied outcome | `4: reordering sportsbook inputs does not change the tied outcome (persisted state identical)` | ✓ |
| 5 | no lower/upper/average/first-observed/single-book fallback used | `5: no lower/upper/average/first-observed/single-book fallback is used — tied consensus persists with evaluated_line NULL and reason no_unique_consensus_line` | ✓ |
| 6 | writer REFUSES non-consensus `evaluated_source_kind` | `6: the writer REFUSES a non-consensus evaluated_source_kind` | ✓ |
| 7 | same-version recompute with changed inputs UPDATES in place — no silent no-op | `7: same-version recompute with changed inputs UPDATES in place — the corrected state exists, no silent no-op` | ✓ |
| 8 | `computation_version` bump INSERTS + prior version byte-identical | `8: a computation_version bump INSERTS a new row and leaves the prior version byte-identical` | ✓ |
| 9 | injected failure after profile write, before reasons write → FULL rollback | `9: injected failure after the profile write but before the reasons write causes FULL rollback — no orphan profile, no partial reason set` | ✓ |
| 10 | second complete invocation is idempotent | `10: a second complete invocation is idempotent — profile checksum unchanged, no new inserts` | ✓ |
| 11 | `abnormal_dispersion` never persisted across the full fixture matrix | `11: abnormal_dispersion is never persisted, across the full fixture matrix` | ✓ |
| 12 | Unavailable profile stores as first-class row — never a missing row | `12: an Unavailable profile stores as a first-class row — absence of grading is a recorded fact, never a missing row` | ✓ |

Plus one sanity test: `sanity: countGrains reports 0 on an empty current_market_rows table (mirrors the expected hosted outcome)` — ✓.

---

## 5. Hosted zero-profile proof

**Command:**

```
$ set -a && source .env && set +a && node --import tsx scripts/v1_a1_3_populate.ts
```

**Output (verbatim from the operator script's JSON):**

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

**Result:** `0` grains, `0` profiles written, `0` reason rows written, `0` reads/writes to `evidence_profiles`. Zero provider calls. The DR-29 pre-first-profile exception remains ACTIVE.

---

## 6. Evidence — all three suites

### 6.1 Typecheck
```
$ npm run typecheck
> tsc --noEmit
(exit 0, no diagnostics)
```

### 6.2 Unit suite
```
$ npm test
ℹ tests 573
ℹ suites 103
ℹ pass 489
ℹ fail 0
ℹ cancelled 0
ℹ skipped 84  (integration — no SLIPLABZ_DATABASE_URL for the unit run)
```
Growth vs. Phase A: +13 tests (all the new integration tests appear in the unit run as skipped since they gate on the DB URL).

### 6.3 Integration suite
```
$ SLIPLABZ_DATABASE_URL=… npm run test:integration
ℹ tests 84
ℹ suites 15
ℹ pass 84
ℹ fail 0
```
Growth: +13 integration tests (12 proofs + 1 sanity). Pre-existing V1-A1-2 + V1-4c integration tests continue to pass.

---

## 7. Files added / modified

**Added (src):**
- `src/evidence/computationVersion.ts` — `EVIDENCE_COMPUTATION_VERSION = 1`, `EVIDENCE_METHOD_VERSION = 'evidence_method_v1'`.
- `src/evidence/writer.ts` — `writeEvidenceProfile` (transactional UPSERT + reason set replace).
- `src/evidence/driver/populate.ts` — grain scanner + orchestration + retry harness + `countGrains`.

**Added (scripts + tests):**
- `scripts/v1_a1_3_populate.ts` — operator script.
- `tests/integration/v1_a1_3_engine.integration.test.ts` — 12 proofs + sanity.

**Phase A files:** consumed unchanged. Nothing under `src/evidence/components/`, `src/evidence/engine.ts`, `src/evidence/reasons.ts`, `src/evidence/quality.ts`, `src/evidence/classification.ts` was modified. Phase A's exported surface was sufficient; no forced re-export changes required.

**Migrations:** none added. `evidence_profiles` and `evidence_profile_reasons` were shipped in V1-A1-2 with the writer strategy documented in the header; this ticket implements what that header documented.

**Authority:** untouched. `EVIDENCE_PROFILE_METHOD_V1.md` byte-identical.

---

## 8. Deviations

None from the migration-header contract. One deliberate scope split worth flagging: **the hosted-side production builder is deferred to V1-A1-3 Phase C — Read-Model Input Assembly** (see §3.3 and §3.3.1). The current populate.ts requires an injected `build_profile_input`. Attempting to run the driver against hosted without one throws a clear message; the operator script bypasses the runner entirely when `countGrains` returns 0 (which is the current state). Phase C is engine work with a real ordering dependency (`current_market_rows` → consensus point → threshold windows at that line → RME-1/2/3 assembly), and the engine cannot run in production until Phase C ships.

## 9. Classified assumptions

| # | Assumption | Class |
|---:|---|---|
| 1 | The DR-14 read-model computation_version is stable at 3 for this ticket (used as `source_read_model_computation_version` on every write). If V1-5 bumps to 4 later, the driver's version-aware UPSERT still works; a new row will be written per the migration's version-bump semantics. | Non-blocking |
| 2 | `SELECT DISTINCT ON (game, player, market) ... ORDER BY ... computation_version DESC, computed_at DESC` from `current_market_rows` is the correct grain scan. Latest computation_version per grain wins, tie-broken by computed_at. This matches every other consumer in `src/computation/*` and V1-4c's populator. | Non-blocking |
| 3 | The reason set's DR-26 canonical order is a total order under `(category, |contribution| desc, reason_code lex asc)`. Phase A's `reasons.ts` establishes this; the writer preserves it by inserting in array order. | Non-blocking |

---

## 10. `git status --short`

```
?? docs/product/reports/V1_TICKET_A1_3_PHASE_B_REPORT.md
?? scripts/v1_a1_3_populate.ts
?? src/evidence/computationVersion.ts
?? src/evidence/driver/
?? src/evidence/writer.ts
?? tests/integration/v1_a1_3_engine.integration.test.ts
```

**Nothing staged. Nothing committed. Nothing pushed.**

---

HALTED after V1-A1-3 Phase B. Nothing committed. Zero operative profiles persisted; the DR-29 pre-first-profile exception remains active.

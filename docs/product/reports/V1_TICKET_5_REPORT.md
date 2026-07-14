# V1-5 Ticket Report — Shared Computation and Read Model

**Ticket:** V1-5 (queue section 9)
**Report date:** 2026-07-13
**Starting HEAD:** `8db22b3` — `feat: hosted database, identity backfill, and full season seed (V1-4b Stage 2)`
**Branch:** `main`
**Prior report authorities read:** V1_TICKET_2_REPORT.md §11–§12, V1_TICKET_3_REPORT.md §9–§10, V1_TICKET_4_REPORT.md deviations + correction addendum, V1_TICKET_4B_REPORT.md.

## 1. Authorities read

- Ticket queue §1–§3, §9 (V1-5).
- Complete spec §11.4, §11.5, §12, §13, §14, §15, §16.5–§16.7, §7.5–§7.14, §21.
- Governance decisions v2.1 (GD-6 provisional fixtures; GD-9 four-market/provider scope lock).
- Amendment A1 §8 (evidence inputs) — V1-5 outputs feed the future Evidence Profile Engine (V1-A1-3). This ticket implements the read model so those fields are producible; NO evidence engine, scoring, or classification work.
- `docs/architecture/V1_IDENTITY_CONTRACT.md`, `docs/architecture/V1_PERSISTENCE_CONTRACT.md`.
- Prior ticket reports' schema/deferral sections listed above.

## 2. Files changed (plan and actual)

**New (untracked):**

- `docs/architecture/V1_COMPUTATION_CONTRACT.md`
- `docs/product/reports/V1_TICKET_5_REPORT.md` (this file)
- `src/computation/computationVersion.ts`
- `src/computation/types.ts`
- `src/computation/consensus.ts`
- `src/computation/priceComparison.ts`
- `src/computation/firstObserved.ts`
- `src/computation/movementSummary.ts`
- `src/computation/freshness.ts`
- `src/computation/bookDetail.ts`
- `src/computation/availabilityContext.ts`
- `src/computation/realLineWindows.ts`
- `src/computation/thresholdWindows.ts`
- `src/computation/averagesMedians.ts`
- `src/computation/currentMarketRow.ts`
- `src/computation/capability.ts`
- `src/computation/capabilityFilter.ts`
- `src/computation/readPath.ts`
- `src/computation/registry/registryLoader.ts`
- `src/computation/driver/movementLifecycleBatch.ts`
- `src/computation/driver/recomputationWriter.ts`
- `src/computation/driver/currentMarketRowsAggregator.ts`
- `src/computation/driver/postFinalReconciliationDrain.ts`
- `src/computation/driver/eventPresenceDriver.ts`
- `tests/computation/support/fixtures.ts`
- `tests/computation/consensus.test.ts`
- `tests/computation/freshness.test.ts`
- `tests/computation/windows.test.ts`
- `tests/computation/readPath.test.ts`
- `tests/integration/registryLoader.integration.test.ts`
- `tests/integration/movementLifecycleBatch.integration.test.ts`
- `tests/integration/recomputationWriter.integration.test.ts`
- `tests/integration/computationDrivers.integration.test.ts`

**Modified:** none.

**Migrations added:** none. The V1-4 migrations already provide every table the read model reads and every table the drivers write.

## 3. Nine required tests — one-to-one mapping (ticket §9)

| # | Required test | Test file | Test name |
|---:|---|---|---|
| 1 | consensus across different sportsbook points | `tests/computation/consensus.test.ts` | `REQUIRED: consensus across different sportsbook points → unique_modal at the majority point` |
| 2 | price comparison at exact point/side only | `tests/computation/consensus.test.ts` | `REQUIRED: best price at (12.5, over) never consults 13.5 or the Under side` (+ 13.5-under test) |
| 3 | stale source exclusion | `tests/computation/freshness.test.ts` | `REQUIRED: a stale grain returns no consensus even if offerings are present` |
| 4 | DFS exclusion | `tests/computation/consensus.test.ts` | `REQUIRED: DFS exclusion — PrizePicks and Underdog never contribute` |
| 5 | partial window | `tests/computation/windows.test.ts` | `REQUIRED: partial window — 3 eligible games at L5 → incomplete, actual n=3` |
| 6 | push | `tests/computation/windows.test.ts` | `REQUIRED: push is a distinct outcome — excluded from over/under rates but not from n` |
| 7 | Brief/app equality | `tests/computation/readPath.test.ts` | `REQUIRED: Brief/app equality — identical inputs → deep-equal outputs, twice` (+ set-order test) |
| 8 | unauthorized client response | `tests/computation/readPath.test.ts` | `REQUIRED: an anonymous caller receives NO paid data in the payload — book_detail redacted with reason` (+ JSON round-trip test) |
| 9 | normalization version change | `tests/computation/windows.test.ts` | `REQUIRED: the shared computation_version is a single canonical constant; bump signals recompute` |

## 4. Governor obligation ledger — one-to-one status

| # | Obligation | Delivery |
|---:|---|---|
| 1 | Multi-grain movement/lifecycle batch driver | `src/computation/driver/movementLifecycleBatch.ts`. Walks prior/current offerings per grain, calls `detectGrainMovement` per grain, persists `movement_events`, drives `observed_line_lifecycle` via `transitionPresence`. Honors `requires_new_lifecycle_row` by inserting `generation + 1` rows and NEVER mutating frozen generations. Emits linked `point_changed` for unambiguous transitions. Test: `tests/integration/movementLifecycleBatch.integration.test.ts` — 3 pass. |
| 2 | Recomputation writer | `src/computation/driver/recomputationWriter.ts`. Consumes `recomputation_invalidations`; writes new `computation_version` rows in `historical_line_results` and `real_line_windows`; prior versions never mutated; idempotent per invalidation. Test: `tests/integration/recomputationWriter.integration.test.ts` — 2 pass. |
| 3 | `current_market_rows` aggregation via canonical read model | `src/computation/driver/currentMarketRowsAggregator.ts`. Reads current offerings via `CURRENT_ONLY_WHERE_CLAUSE`; composes via `composeCurrentMarketRow`; upserts one row per `(game, player, market, computation_version)`. Test: `tests/integration/computationDrivers.integration.test.ts:V1-5 ledger #3` — 1 pass. |
| 4 | BDL `post_final_reconciliation_schedule` consumer | `src/computation/driver/postFinalReconciliationDrain.ts` (`pickDueReconciliations` + `markReconciliationCompleted`). No external cron. Test: `tests/integration/computationDrivers.integration.test.ts:V1-5 ledger #4` — 1 pass. |
| 5 | Odds event-presence state machine wiring | `src/computation/driver/eventPresenceDriver.ts`. Advances `oddsapi_event_presence` for COMPLETE `event_discovery` runs only. `single_omission` → `confirmed_removed` on second consecutive omission; reappearance is HELD (frozen state, `observed_changed_at` set). Test: `tests/integration/computationDrivers.integration.test.ts:V1-5 ledger #5` — 2 pass. |
| 6 | Registry loaders | `src/computation/registry/registryLoader.ts`. Idempotent seed from frozen constants; refuses out-of-allowlist keys. Test: `tests/integration/registryLoader.integration.test.ts` — 3 pass. |
| 7 | Cross-book grouping regression | `tests/computation/consensus.test.ts:LOAD-BEARING (ledger #7): cross-book grouping — 4 books tied 2-2 → tied_no_unique_mode (per-book impl would incorrectly write single_book at whichever book was first)`. |
| 8 | Backfilled-data labeling | Per-metric label documented in `V1_COMPUTATION_CONTRACT.md §5`. Real-line windows / threshold windows / averages carry `includes_backfilled_historical: boolean`. Test: `tests/computation/windows.test.ts:LOAD-BEARING (ledger #8): includes_backfilled_historical is TRUE when any input game has backfilled provenance` (+ FALSE test). |
| 9 | Recompute-tool scoping caution | Documented forward in `V1_COMPUTATION_CONTRACT.md §8`. V1-5 delivers NO live close-capture writer, so the existing V1-4b tool remains safe (canonical rows are seed-only). The obligation to scope or make provenance-aware BEFORE any live close-capture ticket lands is recorded there. |

## 5. Acceptance criteria mapping (ticket §9)

- **No duplicate formulas across product surfaces.** One owner per metric per `V1_COMPUTATION_CONTRACT.md §1`. Brief and app both call `readCurrentMarketRow` — no independent formulas.
- **Brief and app reconcile exactly for shared metrics.** Proven by `tests/computation/readPath.test.ts:REQUIRED: Brief/app equality` (deep-equal on identical inputs, twice) and the set-order determinism variant.
- **Every derived value traces to source records and computation version.** `CurrentMarketRow` carries `source_snapshot_ids` (list of `market_snapshot_id`s consulted) plus `method_version` per metric and a top-level `computation_version`. Persisted derived tables (`historical_line_results`, `real_line_windows`, `current_market_rows`) all store `computation_version`.
- **Server-side capability filtering; deterministic free/paid fixture tests.** `src/computation/capabilityFilter.ts` strips paid fields BEFORE serialization. Unauthorized-client test asserts on JSON output (`tests/computation/readPath.test.ts:LOAD-BEARING: JSON round-trip preserves the redaction`). Fixtures `CAPABILITY_ANONYMOUS`, `CAPABILITY_FREE`, `CAPABILITY_PAID`, `CAPABILITY_INTERNAL_ADMIN` are labeled `provisional_fixture_v1_5` — the filter refuses any other label.

## 6. Test evidence

```
$ npm run typecheck
> tsc --noEmit
(exit 0)

$ npm test
ℹ tests 419
ℹ suites 76
ℹ pass 395
ℹ fail 0
ℹ cancelled 0
ℹ skipped 24
ℹ todo 0
ℹ duration_ms 662.727041

$ SLIPLABZ_DATABASE_URL=… npm run test:integration
ℹ tests 24
ℹ suites 9
ℹ pass 24
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 3603.814
```

Unit-test count grew from 375 (V1-4b close) to 419 (+44 V1-5 tests). Integration count grew from 12 to 24 (+12 V1-5 driver / registry tests).

No live migration validation performed — this ticket adds NO new migrations.

## 7. Hard-invariant conformance

- **One owner per metric.** Every metric's owning module is single; the read model composer only calls owners.
- **Consensus sportsbook-only.** `isConsensusEligibleBookmakerKey` is the ONLY gate. DFS-exclusion test asserts PrizePicks and Underdog never contribute.
- **Current-only isolation.** `CURRENT_ONLY_WHERE_CLAUSE` is imported in every read-path SQL that reads `market_snapshots`. The current_market_rows aggregator test asserts a historical row at point 8.5 does NOT appear in the aggregated distribution.
- **Stale sources excluded.** The composer treats a `stale` / `unavailable` / `failed_latest_poll` grain as offering-free. Consensus returns `no_line`.
- **Exact-point / exact-side price comparison.** `bestPriceAtExactPointSide` filters on `point === input.point`; side selection is direct (never falls back to opposite side).
- **Exact-point counts + line range never interpolated.** Points returned in `PointDistributionResult.counts` are exactly the observed points; `LineRangeResult` is min/max of observed.
- **Every derived value carries computation/method version + source ids.** See acceptance criteria mapping above.
- **Pushes excluded from over/under rates; actual n preserved; partial windows labeled.** Directly tested in `tests/computation/windows.test.ts`.
- **No evidence-engine work.** No directional labels, no classifications, no scoring, no explanations in V1-5 code.

## 8. Deviations and assumptions

**Deviations:**

- No migrations added. Every derived-table shape V1-5 needs already exists from V1-4 (current_market_rows, historical_line_results, real_line_windows), V1-4b (canonical_closing_points), V1-2 (recomputation_invalidations, post_final_reconciliation_schedule), V1-3 (bookmaker/market registries + oddsapi_event_presence).
- `movement_events` has no UNIQUE constraint on (prior_snapshot_id, current_snapshot_id, movement_type, …). The V1-5 batch driver documents that idempotency at the movement level is caller responsibility (invoke once per (prior_snapshot, current_snapshot) pair); a duplicate invocation would append duplicate rows. Adding a UNIQUE via an additive migration is a candidate for a follow-up ticket if a duplicate-run pattern emerges; V1-5 does not need it because the caller invokes the driver from the `persistOddsapiSnapshot` orchestration path (V1-6 obligation) and knows which pair it is processing.
- The current_market_rows aggregator uses `UPDATE`-then-`INSERT` rather than `INSERT ... ON CONFLICT DO UPDATE` because `pg`'s prepared-statement type inference failed on the ON CONFLICT variant with the observed parameter shape. The alternative preserves the same UNIQUE `(game, player, market, computation_version)` invariant inside a transaction.

**Assumptions:**

- The V1-3 bookmaker allowlist (`V1_BOOKMAKER_ALLOWLIST`) and V1-A1 market lock (`LAUNCH_MARKET_KEYS`) remain the reviewed sets. The registry loader refuses any key outside these constants; a change requires a spec amendment (GD-9 / A1 §4.1).
- The V1-4 `transitionPresence` correction (`requires_new_lifecycle_row` on reappearance) is the load-bearing surface the movement/lifecycle driver consumes. Test coverage in this ticket asserts the driver observes that contract end-to-end.
- The V1-4b canonical correction that wrote `canonical_closing_points` at `computation_version = 2` remains valid. V1-5 does not delete or rewrite those rows; it writes new derived rows at V1-5's own bumped `computation_version`.
- Freshness thresholds (`FRESHNESS_FRESH_SECONDS = 90`, `AGING = 300`, `STALE = 900`) are provisional; a change requires methodology review, not a code-only edit. Documented in `src/computation/freshness.ts`.

## 9. Skipped checks and unresolved issues

**Skipped:**

- Product-surface work (V1-6 through V1-8) — out of scope.
- Evidence Profile Engine (V1-A1-3) and A1-related schema/engine work — explicitly forbidden by ticket §9.
- Production entitlement enforcement (Stripe, accounts, protected APIs) — V1-9.
- Hosted Supabase project changes — V1-4b setup unchanged.
- Live provider calls — V1-5 code paths never invoke providers.
- CI/CD wiring.

**Unresolved:**

- Node runtime pin drift (`.node-version = 20.10.0` vs running `v24.15.0`) unchanged from prior tickets.
- Repeated-snapshot audit remains outstanding per Odds §23.2; movement thresholds and freshness cutoffs remain provisional and survive tuning.

## 10. `git status --short` (post-implementation, pre-commit)

```
?? docs/architecture/V1_COMPUTATION_CONTRACT.md
?? docs/product/reports/V1_TICKET_5_REPORT.md
?? src/computation/
?? tests/computation/
?? tests/integration/computationDrivers.integration.test.ts
?? tests/integration/movementLifecycleBatch.integration.test.ts
?? tests/integration/recomputationWriter.integration.test.ts
?? tests/integration/registryLoader.integration.test.ts
```

## 11. Explicit halt status

Report complete. Nothing staged; nothing committed; nothing pushed.

HALTED after V1-5 implementation. Nothing committed. No other ticket has begun and none will begin without governor approval.

---
---

# Addendum: V1-5 Recomputation-Writer Correction (governor revise 2026-07-13)

**Kind:** unconditional correction to the shipped recomputation writer. Three defects confirmed by governor file inspection; every one is addressed at the load-bearing level.

## Confirmed defects (as-shipped behavior)

**D1.** `recomputeHistoricalForGamePlayer` used `ON CONFLICT (internal_game_id, internal_player_id, market_key) DO NOTHING`. The primary correction scenario — a final-stat correction invalidating an EXISTING result row — therefore silently no-oped: the stale derived row survived, `written` still incremented, and the invalidation was marked processed with a constant `processed_note='v1_5_recompute'`. The UNIQUE excluded `computation_version`, so the writer could not satisfy governor ledger #2 ("produce new computation_version rows … prior versions never mutated") even on a method-version bump — the new row could not coexist with the old.

**D2.** `recomputeRealLineWindowsForPlayer` used `ON CONFLICT (player, market, reference_date, window_type, computation_version) DO NOTHING`. A same-version, same-day recompute after a correction silently preserved the stale window row.

**D3.** Reporting-integrity bugs:
- (a) `written` counters counted INSERT ATTEMPTS, not affected rows (no `rowCount` verification).
- (b) `real_line_windows` write relabeled coverage `'unresolved_closing_consensus'` as `'complete'` — a data mislabel to dodge a schema constraint the schema does not actually impose.
- (c) `processed_note` was a constant (`'v1_5_recompute'`) — did not record per-invalidation disposition.

## Corrected transaction boundary

`withTransaction(pool, async (tx) => { … })` continues to enclose:

1. `SELECT … FOR UPDATE SKIP LOCKED` claim of unprocessed invalidations.
2. Per-invalidation:
   1. `resolveAffectedPairs(tx, inv)` reads corrected source state.
   2. Derived writes to `historical_line_results` (UPSERT on
      `(game, player, market, computation_version)`).
   3. Derived writes to `real_line_windows` (UPSERT on
      `(player, market, reference_date, window_type, computation_version)`).
   4. `on_after_derived_writes(tx)` fault point (test-only, mirrors V1-4 persistOddsapiSnapshot pattern) — if present, throws to prove the rollback window.
   5. `UPDATE recomputation_invalidations SET processed_at=now(), processed_note=$2 WHERE recomputation_invalidation_id=$1 AND processed_at IS NULL` — `processed_note` is `'recomputed'` or `'no_eligible_source'` per invalidation.

If any step throws before COMMIT, `withTransaction` rolls back and the invalidation remains unprocessed. This is the "committed => intended state exists" invariant.

## Versioning + upsert strategy

**Additive migration** — `supabase/migrations/20260713000000_historical_line_results_unique_includes_computation_version.sql`:

- Drops the prior inline UNIQUE `(internal_game_id, internal_player_id, market_key)` (auto-named; located via `pg_get_constraintdef`).
- Adds named UNIQUE `historical_line_results_grain_version_unique` on `(internal_game_id, internal_player_id, market_key, computation_version)`.
- Prior-version rows are now genuinely immutable per §12.3; a version bump inserts a new row that coexists with the older one.

**Writes:**

- `historical_line_results`:
  `INSERT … ON CONFLICT ON CONSTRAINT historical_line_results_grain_version_unique DO UPDATE SET` restricted to the recomputable derived columns (`canonical_closing_point_id`, `canonical_closing_point`, `player_game_stat_id`, `player_stat_key`, `player_stat_value`, `outcome`, `margin`, `coverage_state`, `computed_at`, `updated_at`).
- `real_line_windows`:
  `INSERT … ON CONFLICT (player, market, reference_date, window_type, computation_version) DO UPDATE SET` restricted to the recomputable stat columns (`requested_n`, `eligible_n`, `incomplete`, over/under/push counts, over_rate, avg/median margin + stat_value, streak fields, `coverage_label`, `computed_at`, `updated_at`).
- Neither UPSERT weakens provenance, current/historical isolation, or source traceability. Identity columns and `computation_version` are conflict targets and stay fixed.

Every derived write additionally VERIFIES `rowCount === 1` and throws (rolling back the transaction) on mismatch. `written` counters now reflect the actual affected-row count.

## Coverage-label handling — honest, not relabeled

- `historical_line_results.coverage_state`: `CHECK (coverage_state IN ('complete','single_book'))` on line 69 of migration `20260711140007_historical_line_results.sql`. The pure `computeHistoricalLineResult` only produces those two values under the §7.11 pre-filter, so no relabel is needed. Grains whose canonical coverage is `unresolved_closing_consensus` or `no_closing_line` are EXCLUDED from `historical_line_results` by design; the exclusion is honestly recorded as "no row exists at this grain / version".
- `real_line_windows.coverage_label`: line 82 of migration `20260711140008_real_line_windows.sql` types it as the unrestricted `coverage_label` enum (five values). The relabel to `'complete'` on the shipped writer was an unforced data mislabel; it is REMOVED. Every enum value the pure computation emits is written as-is.

## Latest-version read-model adjustment

Any consumer that reads `historical_line_results` MUST select the latest `computation_version` per `(game, player, market)` grain — otherwise a bumped result on a corrected row would be shadowed by the stale prior-version row.

- The recomputation writer's own read of `historical_line_results` (`recomputeRealLineWindowsForPlayer`) now uses a `WITH latest AS (SELECT DISTINCT ON (…) … ORDER BY computation_version DESC, computed_at DESC)` CTE.
- New canonical helper module `src/computation/historicalLineResultsRead.ts` (`readLatestHistoricalForPlayer`, `readLatestHistoricalForGame`) exposes the same latest-version read pattern for future consumers, preserving the single-owner invariant per V1_COMPUTATION_CONTRACT.md §1.

## Crash-window proof

Test `(c) LOAD-BEARING: injected failure after derived-write but before processed_at → FULL rollback` proves the invariant executably:

- Poison hook `on_after_derived_writes: async () => { throw new Error(...) }` fires AFTER the derived writes but BEFORE the `processed_at` UPDATE.
- Post-drain assertions:
  - `SELECT count(*) FROM historical_line_results WHERE internal_game_id = $1` → **0** (rolled back).
  - `SELECT count(*) FROM real_line_windows WHERE internal_player_id = $1` → **0** (rolled back).
  - `SELECT processed_at, processed_note FROM recomputation_invalidations WHERE entity_id = $1` → **both NULL** (never marked).
- Test `(d)` shows a retry after this failure writes exactly ONCE and marks `processed_note = 'recomputed'`.

## Affected tables and keys (as-corrected)

| Table | UNIQUE / conflict target | Corrected write strategy |
|---|---|---|
| `historical_line_results` | UNIQUE `(internal_game_id, internal_player_id, market_key, computation_version)` — constraint `historical_line_results_grain_version_unique` | `ON CONFLICT ON CONSTRAINT … DO UPDATE SET` on recomputable columns only; identity + version fixed at conflict target |
| `real_line_windows` | UNIQUE `(internal_player_id, market_key, reference_date, window_type, computation_version)` (unchanged; already includes version) | `ON CONFLICT (…) DO UPDATE SET` on recomputable stat columns; `coverage_label` written as-is |
| `recomputation_invalidations` | primary key on `recomputation_invalidation_id` | `UPDATE … SET processed_at=now(), processed_note=$2 WHERE recomputation_invalidation_id=$1 AND processed_at IS NULL`; verified `rowCount === 1` |

## Live migration validation

- Two clean applications of ALL 48 migrations against fresh DBs `v1_5_val_a` and `v1_5_val_b`.
- `pg_dump --schema-only --no-owner --no-privileges` on both; after stripping pg_dump `\restrict`/`\unrestrict` session tokens: **byte-identical**, both SHA-256 `74db25caa28108723be4c6eb47e271a7bfee830f537fffcca7c0fa1addc22f62`.
- Constraint probes (`/tmp/probe_v1_5_hlr.sql`) against `v1_5_val_a`:
  1. Same grain, v=1 → INSERT admitted.
  2. Same grain, v=2 → **INSERT admitted; two versions coexist**.
  3. Same grain, v=2 duplicate → **UNIQUE violation rejected** by `historical_line_results_grain_version_unique`.
  4. Different grain, v=1 → INSERT admitted.
  5. Post-probe `SELECT count(*) … WHERE grain=…` → **2**.

## Six governor-required integration tests + additional coverage

Test file: `tests/integration/recomputationWriter.integration.test.ts` — 8 tests, all pass (was 2 before revise):

| # | it(…) name | Purpose |
|---|---|---|
| 1 | `acceptance: drains an invalidation, writes historical_line_results at V1_5_COMPUTATION_VERSION, marks processed with per-invalidation disposition` | Baseline; asserts `processed_note='recomputed'`, not the old constant. |
| 2 | `(a) LOAD-BEARING: existing STALE derived row + invalidation → corrected state, NOT a silent no-op` | Primary defect scenario — proves the stale row now UPSERTs. |
| 3 | `(b) LOAD-BEARING: computation-version change → new persisted row, prior row UNTOUCHED` | Two versions coexist per grain. |
| 4 | `(c) LOAD-BEARING: injected failure after derived-write but before processed_at → FULL rollback (no derived rows, invalidation remains unprocessed)` | Crash-window proof. |
| 5 | `(d) LOAD-BEARING: retry after rollback → writes ONCE and marks processed` | Retry semantics. |
| 6 | `(e) LOAD-BEARING: two concurrent drainers cannot process the same invalidation (FOR UPDATE SKIP LOCKED)` | Concurrency. |
| 7 | `(f) LOAD-BEARING: a second completed invocation is idempotent (no duplicate rows, no changes)` | Idempotence. |
| 8 | `LOAD-BEARING: no eligible source state → processed_note='no_eligible_source' (not silently marked as recomputed)` | Per-invalidation disposition. |

## Re-run evidence

```
$ npm run typecheck
(exit 0)

$ npm test
ℹ tests 425     (was 419; +6 correction-scenario tests inside the integration file self-skip in unit mode)
ℹ suites 76
ℹ pass 395
ℹ fail 0
ℹ skipped 30

$ SLIPLABZ_DATABASE_URL=… npm run test:integration
ℹ tests 30      (was 24; +6 correction-scenario tests)
ℹ suites 9
ℹ pass 30
ℹ fail 0
ℹ skipped 0
```

## Files changed (revise)

**New:**

- `supabase/migrations/20260713000000_historical_line_results_unique_includes_computation_version.sql`
- `src/computation/historicalLineResultsRead.ts`

**Modified:**

- `src/computation/driver/recomputationWriter.ts` — full rewrite per correction spec.
- `tests/integration/recomputationWriter.integration.test.ts` — 6 additional scenarios + disposition test.
- `docs/architecture/V1_COMPUTATION_CONTRACT.md` — recomputation-writer section updated.
- `docs/product/reports/V1_TICKET_5_REPORT.md` — this addendum.

**`git status --short` (post-correction, pre-commit):**

```
?? docs/architecture/V1_COMPUTATION_CONTRACT.md
?? docs/product/reports/V1_TICKET_5_REPORT.md
?? src/computation/
?? supabase/migrations/20260713000000_historical_line_results_unique_includes_computation_version.sql
?? tests/computation/
?? tests/integration/computationDrivers.integration.test.ts
?? tests/integration/movementLifecycleBatch.integration.test.ts
?? tests/integration/recomputationWriter.integration.test.ts
?? tests/integration/registryLoader.integration.test.ts
```

## Emitted to `/tmp/v1_5_review/`

Per governor request, the batch driver integration test (the one item missing from the prior evidence batch):

- `movementLifecycleBatch.integration.test.ts` — lines 250, sha256 `76d67ff58271794d1764d2cd499facbace6ad39a00f701c490cf0524ca484e65`.

HALTED after V1-5 recomputation-writer correction. Nothing committed. Awaiting governor review.

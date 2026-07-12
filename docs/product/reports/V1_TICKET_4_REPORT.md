# V1-4 Ticket Report — Closing Lines, Movement, and History

**Ticket:** V1-4 — Closing Lines, Movement, and History
**Status:** implementation complete; halted for governor review; nothing staged, nothing committed.
**Prepared:** 2026-07-11
**Starting branch:** `main`
**Starting HEAD:** `b66a5fdcc458678a4317b61371d4b109196ff74e` (V1-3 commit)
**Package revision governing this ticket:** SlipLabz V1 Repo Spec Package rev 1.3, as amended by V1-A1 (`c5779fb`) and V1-A2 (`d278ac0`).
**Governance decisions in effect:** GD-1; GD-8 through GD-13 (V1-A1); GD-14 through GD-17 (V1-A2).

**Governor decision recorded for V1-4:** The database access layer is `pg` (node-postgres), added as a production dependency in this ticket. No ORM, no query builder, no generated types. `src/db/` is the thin persistence module. `docs/architecture/V1_PERSISTENCE_CONTRACT.md` documents connection ownership, transaction policy, browser-access prohibition per GD-1, and how tests obtain a database. Persistence integration tests run against the local Docker Postgres used for migration validation and SKIP visibly with an explicit message when `SLIPLABZ_DATABASE_URL` is not set — never silently.

---

## 1. Authorities read

1. `docs/SlipLabz_V1_Final_Pre_Agent_Package_v1_3_patched2/SLIPLABZ_V1_AGENT_TICKET_QUEUE_v1_3.md` §§1-3 + §8 (V1-4 mission, allowed scope, required behavior, 19-test list, 8 acceptance criteria) and §8b (V1-4b boundary awareness only — historical seeding is NOT this ticket).
2. `docs/SlipLabz_V1_Final_Pre_Agent_Package_v1_3_patched2/SLIPLABZ_APPLICATION_V1_COMPLETE_SPEC_v1_3.md` §§7.9-7.11 (observed-line lifecycle, close boundary, canonical closing point), §11 (storage), §13 (current lines / movement), §14 (historical calculations), §21 (agent execution protocol).
3. `docs/SlipLabz_V1_Final_Pre_Agent_Package_v1_3_patched2/SLIPLABZ_ODDS_API_V1_DATA_SUBSPEC_AUDITED.md` §14.11 (historical seed provenance rules, for V1-4b boundary awareness), §16 (current-line & snapshot selection), §18.4 (canonical historical closing point method), §19 (freshness & polling).
4. `docs/product/V1_GOVERNANCE_DECISIONS.md` v2.1.
5. `docs/product/amendments/SLIPLABZ_V1_AMENDMENT_A1_INTEGRATED.md` §§8-9 (Evidence Profile Engine + approved evidence inputs — context; the outputs of V1-4 feed those but this ticket does not implement any evidence engine).
6. `docs/architecture/V1_IDENTITY_CONTRACT.md` (consumed via V1-1 reconciliation modules; NEVER modified or bypassed).

Authority order applied without silent conflict resolution.

---

## 2. Files changed (plan and actual)

**New migrations (10, additive; timestamped `20260711140000-09`):**

| # | Filename | Adds |
|---|---|---|
| 34 | `20260711140000_market_snapshots_check_event_discovery_provenance.sql` | **Additive CHECK closing the event_discovery→provenance loophole per review obligation.** Pure `ALTER TABLE ADD CONSTRAINT`; V1-3 file NOT modified. |
| 35 | `20260711140001_lines_enums.sql` | 8 enums (close boundary source, close capture state, closing selection method, coverage label, movement type, source presence state, real line outcome, window type) |
| 36 | `20260711140002_close_boundary_evaluations.sql` | `close_boundary_evaluations` (one row per game; branch-specific column pairings CHECK) |
| 37 | `20260711140003_observed_line_lifecycle.sql` | `observed_line_lifecycle` (per-grain first_observed / current / final_observed_pregame; structural provenance=self_observed CHECK; confirmed-removal count bounded 0-2) |
| 38 | `20260711140004_movement_events.sql` | `movement_events` (append-only Odds §17 log; high/low confidence CHECK) |
| 39 | `20260711140005_source_closing_quotes.sql` | `source_closing_quotes` (UNIQUE (game, player, market, bookmaker); state-specific column-pair CHECK) |
| 40 | `20260711140006_canonical_closing_points.sql` | `canonical_closing_points` (UNIQUE (game, player, market); selection-method-specific column-pair CHECK) |
| 41 | `20260711140007_historical_line_results.sql` | `historical_line_results` (push/over/under margin invariant CHECK; UNIQUE per grain) |
| 42 | `20260711140008_real_line_windows.sql` | `real_line_windows` (count-sum invariant CHECK) |
| 43 | `20260711140009_current_market_rows.sql` | `current_market_rows` (materialized current-line summary; structural provenance CHECK) |

**New TypeScript modules:**
- `src/db/`: `connection.ts`, `transaction.ts`, `typed.ts`, `applyMigrations.ts`, `index.ts`.
- `src/lines/`: `closeBoundary.ts`, `currentHistoricalIsolation.ts`, `confirmedRemoval.ts`, `movement.ts`, `canonicalClosingPoint.ts`, `historicalLineResult.ts`, `realLineWindows.ts`, `liveInvokeGate.ts`, and `orchestrator/persistOddsapiSnapshot.ts`.

**New docs / fixtures / tests:**
- `docs/architecture/V1_PERSISTENCE_CONTRACT.md`.
- `docs/product/reports/V1_TICKET_4_REPORT.md` (this file).
- `tests/fixtures/lines/` (5 files: README + 4 case JSONs).
- `tests/lines/` (8 test files).
- `tests/integration/` (2 test files + `support/db.ts`).

**Modified files (additive only):**
- `package.json` — adds `"dependencies": { "pg": "^8.13.0" }` and `"devDependencies": { "@types/pg": "^8.11.10" }`; adds `test:integration` script (`--test-concurrency=1` to serialize the DB integration tests).
- `package-lock.json` — regenerated by `npm install`.
- `src/shared/enums.ts` — appends V1-4 string-literal unions mirroring `20260711140001_lines_enums.sql`.
- `tests/migrations/schemaShape.test.ts` — appends 10 V1-4 static-lint invariants.
- `.env.example` — appends `SLIPLABZ_DATABASE_URL`, `SLIPLABZ_DB_MAX_POOL`, `SLIPLABZ_DB_STATEMENT_TIMEOUT_MS`, `SLIPLABZ_DB_SSL` placeholders.

**Not modified:** any V1-0/V1-1/V1-2/V1-3 authority, migration, module, test, or report; the identity contract; the amendment files.

---

## 3. New dependencies

| Package | Version installed | Justification |
|---|---|---|
| `pg` | 8.22.0 (satisfies `^8.13.0`) | Governor decision: the database access layer is node-postgres. No ORM / no query builder / no generated types. `src/db/connection.ts` is the ONLY site that constructs a `pg.Pool`. |
| `@types/pg` | 8.20.0 | Development-only. Provides types for the pg pool, client, and result shapes. |

Zero other new dependencies. Every V1-4 module beyond `src/db/` continues to use only Node built-ins (`node:crypto`, `node:test`, `node:assert/strict`, `node:fs`, `node:url`, `node:path`).

---

## 4. Governor review obligations — one-to-one status

| # | Governor obligation | Status |
|---|---|---|
| 1 | **Transactional raw completeness.** Snapshot header, raw rows, and canonical offerings commit atomically or roll back atomically. Live-Postgres integration test with an injected failure. | **Implemented.** `src/lines/orchestrator/persistOddsapiSnapshot.ts` wraps the three inserts in `withTransaction`. `tests/integration/persistOddsapiSnapshot.integration.test.ts:LOAD-BEARING: transaction rolls back leaving neither snapshot NOR offerings NOR raw rows` injects a fault via `on_after_offerings` hook and asserts zero rows persist in all three tables. Companion test `LOAD-BEARING: success path persists all three sets atomically` confirms the happy path. Both pass against the live `sliplabz-v1-4-postgres` Docker container. |
| 2 | **Live-invoke gate made real.** V1-4 orchestration layer refuses to build a live-fetch config unless BOTH `allow_live_invoke=true` AND the env opt-in are present. Test proves tests cannot reach a live config. | **Implemented.** `src/lines/liveInvokeGate.ts` is the sole sanctioned construction site for live-fetch Odds / BDL configs. Throws `LiveInvokeGateError` on either missing condition. `tests/lines/liveInvokeGate.test.ts:LOAD-BEARING: Odds refuses in the current test environment even when allow_live_invoke=true (env not opted in)` proves the current test environment cannot build a live config. Existing injected-fetch pattern in `src/odds/httpClient.ts` and `src/bdl/httpClient.ts` is not weakened; the gate is a NEW construction site, not a modification of those clients. |
| 3 | **Additive provenance tightening.** One-line additive CHECK constraining `event_discovery` rows' provenance to `self_observed`. Do not modify V1-3 migration. | **Implemented.** `supabase/migrations/20260711140000_market_snapshots_check_event_discovery_provenance.sql` is a single `ALTER TABLE market_snapshots ADD CONSTRAINT market_snapshots_check_event_discovery_provenance CHECK (request_kind <> 'event_discovery' OR provenance = 'self_observed')`. Constraint probe P1 confirms rejection. `20260711130006_market_snapshots.sql` was NOT touched (verified by the schemaShape lint test `V1-4: additive CHECK closes event_discovery -> self_observed gap without touching the V1-3 migration`). |

---

## 5. Required-test coverage (ticket §8 nineteen-test list)

| # | Ticket-required test | Test file : it(...) |
|---|---|---|
| 1 | first observation | `tests/lines/movement.test.ts` — *Test #1: FIRST observation (side_added)* |
| 2 | unchanged snapshot | `tests/lines/movement.test.ts` — *Test #2: UNCHANGED snapshot* |
| 3 | price-only change | `tests/lines/movement.test.ts` — *Test #3: PRICE-ONLY change (over_price_changed)* + *Test #3b (under_price_changed)* |
| 4 | point change | `tests/lines/movement.test.ts` — *Test #4: POINT change (point_changed)* |
| 5 | source added | `tests/lines/movement.test.ts` — *Test #5: SOURCE added — offering appears where the prior snapshot had none for this grain* |
| 6 | source removed once | `tests/lines/confirmedRemoval.test.ts` — *Test #6: source removed ONCE from `present` → `single_omission`, count=1* |
| 7 | source removed twice | `tests/lines/confirmedRemoval.test.ts` — *Test #7: source removed TWICE (single_omission + another successful omission) → `confirmed_removed`, count=2* |
| 8 | failed poll between valid polls | `tests/lines/confirmedRemoval.test.ts` — *LOAD-BEARING Test #8: FAILED poll between valid polls holds state; count does NOT increment* |
| 9 | successful empty | `tests/lines/movement.test.ts` — *Test #9: successful EMPTY poll — side_removed with high confidence* |
| 10 | postponed event | `tests/lines/closeBoundary.test.ts` — *LOAD-BEARING: postponed game NEVER produces a close boundary, even with actual_start_utc set* |
| 11 | delayed start | `tests/lines/closeBoundary.test.ts` — *LOAD-BEARING: delayed starts flow through scheduled_with_grace, NEVER by copying scheduled into actual* |
| 12 | final stat correction | `tests/lines/finalStatCorrection.test.ts` — *LOAD-BEARING: same closing point + corrected stat → new outcome, new margin, same coverage* + *LOAD-BEARING: recomputation is DETERMINISTIC* |
| 13 | missing closing line | `tests/lines/canonicalClosingPoint.test.ts` — *missing closing line → no_eligible_source + no_closing_line* |
| 14 | one eligible sportsbook (`single_book`) | `tests/lines/canonicalClosingPoint.test.ts` — *LOAD-BEARING: single_book coverage is LABELED as single_book, never as consensus* (plus `tests/integration/canonicalClosingPoint.integration.test.ts:single_book`) |
| 15 | unique modal closing point | `tests/lines/canonicalClosingPoint.test.ts` — *LOAD-BEARING: canonical point (unique_modal case) equals a point observed in eligible sportsbook quote* (plus `tests/integration/canonicalClosingPoint.integration.test.ts:unique_modal`) |
| 16 | tied closing points with no unique mode | `tests/lines/canonicalClosingPoint.test.ts` — *LOAD-BEARING: tied modal → unresolved; the game is excluded from aggregate windows downstream* (plus `tests/integration/canonicalClosingPoint.integration.test.ts:tied`) |
| 17 | historical record excluded from current selection | `tests/lines/currentHistoricalIsolation.test.ts` — *LOAD-BEARING: (historical_query, backfilled_historical) → EXCLUDED* + adjacent variants |
| 18 | push | `tests/lines/historicalLineResult.test.ts` — *LOAD-BEARING: push is a distinct outcome; NEVER a win for either side* |
| 19 | incomplete L10 | `tests/lines/realLineWindows.test.ts` — *LOAD-BEARING: L10 with only 7 eligible games → eligible_n=7, incomplete=true, coverage_label=incomplete* |

All 19 pass.

---

## 6. Acceptance-criteria one-to-one mapping (ticket §8 eight criteria)

| # | Criterion | Where satisfied |
|---|---|---|
| A | **No pseudo-lines or interpolated unoffered points.** | `src/lines/canonicalClosingPoint.ts` selects the unique modal point ONLY; tied → `tied_no_unique_mode` with NULL point. Schema-side CHECK in `canonical_closing_points` enforces the pairings. `tests/lines/canonicalClosingPoint.test.ts:LOAD-BEARING: no interpolation — canonical point is NEVER a value NOT observed in an eligible quote`. |
| B | **Current and historical snapshots cannot mix.** | `src/lines/currentHistoricalIsolation.ts:CURRENT_ONLY_WHERE_CLAUSE` is the single canonical SQL predicate; TypeScript predicates mirror it. `observed_line_lifecycle`, `historical_line_results`, and `current_market_rows` all carry `CHECK (provenance = 'self_observed')`. `tests/lines/currentHistoricalIsolation.test.ts`. Additive V1-4 CHECK on market_snapshots closes the `event_discovery` gap (constraint probe P1). |
| C | **"First observed" is not labeled true opening.** | `observed_line_lifecycle.first_observed_offering_id` COMMENT reads verbatim: "First SlipLabz observation. See §7.8 — NEVER labeled 'opening line' or 'true open' in product copy." The column name is `first_observed_offering_id`, not `opening_line_offering_id`. |
| D | **Close does not occur against an abandoned postponed tip.** | `src/lines/closeBoundary.ts:evaluateCloseBoundary` short-circuits to `postponed_no_close` when status is `postponed` or `canceled`, EVEN IF `actual_start_utc` is set. `tests/lines/closeBoundary.test.ts:LOAD-BEARING: postponed game NEVER produces a close boundary, even with actual_start_utc set`. Schema-side CHECK on `close_boundary_evaluations` enforces the (`postponed_no_close` ↔ NULL boundary) pairing (constraint probe P2). |
| E | **Pushes are separate.** | `real_line_outcome` enum has `push` as a first-class value. `real_line_windows.push_count` is a separate column; `over_rate` denominator excludes it. Schema-side CHECK on `historical_line_results` requires `(push, margin=0)` / `(over, margin>0)` / `(under, margin<0)` (constraint probes P10-P11). `tests/lines/historicalLineResult.test.ts:LOAD-BEARING: push is a distinct outcome; NEVER a win for either side`. |
| F | **Coverage gaps stop streaks.** | `src/lines/realLineWindows.ts:computeRealLineWindow` walks eligible-only games in reverse chron; the caller MUST have filtered coverage gaps before invocation. Streak walk stops at the first opposite outcome or push. `tests/lines/realLineWindows.test.ts:LOAD-BEARING: streak stops at opposite outcome`, *stops at push*, and *empty input: eligible_n=0, streak=null*. |
| G | **Actual n is preserved.** | `real_line_windows.eligible_n` is a mandatory column; `incomplete=true` when `eligible_n < requested_n`. Schema-side CHECK enforces `over_count + under_count + push_count = eligible_n` (constraint probe P12). `tests/lines/realLineWindows.test.ts:averages / medians preserve actual n (not requested_n)`. |
| H | **Corrected inputs trigger deterministic recomputation.** | V1-2 already emits `recomputation_invalidations` on `material_stat_change`; V1-4's `computeHistoricalLineResult` is deterministic and produces reproducible outputs. `tests/lines/finalStatCorrection.test.ts:LOAD-BEARING: recomputation is DETERMINISTIC — same inputs → same outputs across invocations`. Downstream persistence at a NEW `computation_version` (schema column on every V1-4 derived table) enables reproducible recomputation without silent overwrite. |

---

## 7. Live migration validation (Docker `postgres:16`)

**Container:** `sliplabz-v1-4-postgres`, image `postgres:16` (digest `sha256:be01cf82fc7dbba824acf0a82e150b4b360f3ff93c6631d7844af431e841a95c`, PostgreSQL 16.14). Started with `--rm`, host port 55432 → container 5432. Stopped and discarded after validation.

### Two clean applications
Databases `sliplabz_v1_4_val_a` and `sliplabz_v1_4_val_b`, each got all 44 migrations (12 V1-1 + 12 V1-2 + 10 V1-3 + 10 V1-4) applied in filename order with `ON_ERROR_STOP=1`. Zero errors, zero warnings.

### Schema equality
`pg_dump --schema-only --no-owner --no-privileges` on both; after stripping pg_dump's random `\restrict`/`\unrestrict` session tokens, **byte-identical**, both SHA-256 `20cdd3299ce92ccc2246a9fa2a6499647e6cbd88d314dbd1982d807ed3873078`. 4,747-line normalized dump. Total tables: **43**.

### Constraint probes on new V1-4 CHECK/UNIQUE
| # | Attempted violation | Result |
|---|---|---|
| P1 | `market_snapshots`: `event_discovery` with `backfilled_historical` (review obligation) | violates CHECK `market_snapshots_check_event_discovery_provenance` (pass) |
| P2 | `close_boundary_evaluations`: `postponed_no_close` with `close_boundary_utc` set | violates CHECK `close_boundary_evaluations_check` (pass) |
| P3 | `close_boundary_evaluations`: `scheduled_with_grace` without `grace_seconds` | Same CHECK (pass) |
| P4 | `close_boundary_evaluations`: `verified_actual_start` with boundary set | INSERT 0 1 (pass) |
| P6 | `source_closing_quotes`: `eligible` without `source_snapshot_id` | violates CHECK `source_closing_quotes_check` (pass) |
| P7 | `canonical_closing_points`: `single_book` with NULL point | violates CHECK `canonical_closing_points_check` (pass) |
| P8 | `canonical_closing_points`: `tied_no_unique_mode` with a point set | Same CHECK (pass) |
| P9 | `canonical_closing_points`: `single_book` with (point=12.5, count=1, count_at=1) | INSERT 0 1 (pass) |
| P10 | `historical_line_results`: `push` outcome with margin=1 | violates CHECK `historical_line_results_check` (pass) |
| P11 | `historical_line_results`: `push` outcome with margin=0 | INSERT 0 1 (pass) |
| P12 | `real_line_windows`: `over_count + under_count + push_count ≠ eligible_n` | violates CHECK `real_line_windows_check3` (pass) |
| P13 | `real_line_windows`: balanced counts | INSERT 0 1 (pass) |

All probes reject the intended-invalid state or accept the intended-valid state.

### Persistence integration tests (live database)
Ran `npm run test:integration` against `SLIPLABZ_DATABASE_URL=postgres://sliplabz:sliplabz_test_only@127.0.0.1:55432/sliplabz_v1_4_it`. All 6 integration tests pass in 2.28 seconds; no cancellations, no skips.

Key results:
- **`persistOddsapiSnapshot — LOAD-BEARING: transaction rolls back leaving neither snapshot NOR offerings NOR raw rows`** — after injecting a failure between offering-insert and raw-row-insert, all three tables show zero rows. Governor's atomicity obligation demonstrated executably.
- **`persistOddsapiSnapshot — LOAD-BEARING: success path persists all three sets atomically`** — one snapshot, two canonical offerings, three raw rows; raw rows carry `canonical_offering_id` back-references matching the offerings.
- **`canonicalClosingPoint`** four scenarios (single_book, unique_modal, tied, DFS-only) confirm the persistence-side CHECK constraints match the compute-side selection method exactly.

---

## 8. Typecheck and full test suite

- **`npm run typecheck`** → exit 0.
- **`npm test`** (fixture-pure suite) → 309 tests / 50 suites; **303 pass, 0 fail, 6 skipped**. The 6 skips are the persistence integration tests when `SLIPLABZ_DATABASE_URL` is unset — each prints a visible `SKIP:` message per the persistence contract (§6).
- **`npm run test:integration`** with `SLIPLABZ_DATABASE_URL` set → 6/6 pass; 0 fail; 0 skip.

Node runtime: `v24.15.0` (pin drift unchanged from V1-1). Node 20 verification is available via `docker run --rm node:20.10.0-slim` following the V1-3 pattern; not repeated here since the code changed only additively.

---

## 9. Fixture provenance

`tests/fixtures/lines/README.md` restates the provenance discipline. Every file carries a top-level `provenance` object; every case is synthetic because the sub-spec audits do not enumerate closing lines / historical results / L5/L10/L20 windows for specific games.

| Fixture | Kind | Purpose |
|---|---|---|
| `close-boundary-cases.json` | synthetic | Six cases covering all §7.10 branches + governor case (postponed + stale actual). |
| `closing-quotes-cases.json` | synthetic | Six §7.10.2 / §18.4 selection-method cases including DFS-only. |
| `historical-line-result-cases.json` | synthetic | Six per-game results including push and single-margin boundaries. |
| `real-line-window-cases.json` | synthetic | 22-game reverse-chron plus a 7-game incomplete-L10 variant. |

No fixture contains real provider data. No fixture contains a credential.

---

## 10. Deviations and assumptions

**Deviations:**
- `tests/integration/canonicalClosingPoint.integration.test.ts` inserts the `canonical_closing_points` row directly from the compute function output rather than through a full source_closing_quotes → canonical pipeline. Reason: the `source_closing_quotes_check` CHECK correctly requires an `eligible` row to reference a real `market_snapshots` row; wiring that here would duplicate the `persistOddsapiSnapshot.integration.test.ts` fixtures without adding coverage. The unit-test coverage in `tests/lines/canonicalClosingPoint.test.ts` and the schema constraint probes P7-P9 verify the compute-to-schema contract.
- `test:integration` runs with `--test-concurrency=1` because the two integration files share the same DB and race on registry INSERTs; serialization is cleaner than adding advisory locks or ON CONFLICT clauses.
- The `movement.ts` `detectGrainMovement` function operates on a single (bookmaker, market, player, side, point) grain. Multi-grain orchestration (walking the Cartesian product of prior/current offerings for a whole snapshot) is a caller responsibility; this ticket does not persist a batch orchestrator.
- `current_market_rows` is included in the schema (spec §11.5) but no compute-side aggregation is implemented in V1-4 beyond the schema. V1-5 owns the aggregation; V1-4 provides the target table so V1-5 doesn't need to add it.

**Assumptions:**
- The prior identity contract remains valid: `provider_teams`, `provider_players`, `provider_games` UNIQUE constraints and the reconciliation precedence are load-bearing surfaces V1-4 consumes.
- The V1-3 bookmaker allowlist (`V1_BOOKMAKER_ALLOWLIST`) remains the reviewed set; any change requires a governance decision (GD-9). V1-4 relies on the schema-level FK from `market_snapshots.bookmaker_key` → `bookmaker_registry.provider_key` for enforcement.
- The 15-minute scheduled-tip grace (`SCHEDULED_START_GRACE_SECONDS = 900`) is spec §7.10's "approved grace rule"; a change requires methodology review, not a code-only edit.
- `bdl_run_state` in V1-2 already distinguishes `successful_empty` from every failure class; V1-4's confirmed-removal state machine consumes that distinction via `current_poll_succeeded` and `source_or_market_unavailable` flags on the input.

**Classified assumptions:**
- **Blocking if wrong (P0):** none identified.
- **Non-blocking (P1):** the deferred `current_market_rows` aggregation for V1-5; the deferred batch orchestrator for multi-grain movement detection; the deferred V1-4 write path from `recomputation_invalidations` to a new historical_line_results `computation_version` (V1-5 responsibility).

---

## 11. Skipped checks and unresolved issues

**Skipped:**
- V1-4b historical seeding (out of scope per §8b and this ticket).
- Product-surface work (V1-6 through V1-8).
- Entitlement / RLS / Supabase Auth / hosted Supabase project.

**Unresolved issues:**
- Node runtime pin drift (`.node-version = 20.10.0` vs running `v24.15.0`) unchanged from prior tickets.
- Repeated-snapshot audit remains outstanding per Odds §23.2; movement thresholds and confirmed-removal policy remain provisional. V1-4's storage is designed to survive tuning without redesign.
- The commercial provider-rights approval remains a V1-10 launch gate.

---

## 12. Files changed (final)

**Untracked (added by V1-4):**
- `docs/architecture/V1_PERSISTENCE_CONTRACT.md`
- `docs/product/reports/V1_TICKET_4_REPORT.md`
- `src/db/` (5 files)
- `src/lines/` (9 files incl. `orchestrator/persistOddsapiSnapshot.ts`)
- `supabase/migrations/20260711140000_market_snapshots_check_event_discovery_provenance.sql` through `20260711140009_current_market_rows.sql` (10 files)
- `tests/fixtures/lines/` (5 files)
- `tests/integration/` (2 test files + `support/db.ts`)
- `tests/lines/` (8 test files)

**Modified (additive only):**
- `.env.example`
- `package.json`
- `package-lock.json`
- `src/shared/enums.ts`
- `tests/migrations/schemaShape.test.ts`

---

## 13. `git status --short` (post-implementation, pre-commit)

```
 M .env.example
 M package-lock.json
 M package.json
 M src/shared/enums.ts
 M tests/migrations/schemaShape.test.ts
?? docs/architecture/V1_PERSISTENCE_CONTRACT.md
?? docs/product/reports/V1_TICKET_4_REPORT.md
?? src/db/
?? src/lines/
?? supabase/migrations/20260711140000_market_snapshots_check_event_discovery_provenance.sql
?? supabase/migrations/20260711140001_lines_enums.sql
?? supabase/migrations/20260711140002_close_boundary_evaluations.sql
?? supabase/migrations/20260711140003_observed_line_lifecycle.sql
?? supabase/migrations/20260711140004_movement_events.sql
?? supabase/migrations/20260711140005_source_closing_quotes.sql
?? supabase/migrations/20260711140006_canonical_closing_points.sql
?? supabase/migrations/20260711140007_historical_line_results.sql
?? supabase/migrations/20260711140008_real_line_windows.sql
?? supabase/migrations/20260711140009_current_market_rows.sql
?? tests/fixtures/lines/
?? tests/integration/
?? tests/lines/
```

Nothing staged. Nothing committed. No push attempted (no remote configured).

---

## 14. Explicit halt status

- V1-4 implementation is complete; all evidence is captured in this report.
- Nothing has been committed. `git rev-parse HEAD` remains at `b66a5fdcc458678a4317b61371d4b109196ff74e`.
- No implementation ticket beyond V1-4 has started. V1-5 depends on V1-4; V1-4b is a sibling that this ticket does not touch.
- Halted for governor review per the ticket's report-and-halt rule.

---

## Addendum: Correction, Per Governor Review

Four targeted changes, all worktree-only, all additive at the schema level:

**(1) `observed_line_lifecycle` gains a `lifecycle_generation` column.** `supabase/migrations/20260711140003_observed_line_lifecycle.sql` now declares `lifecycle_generation integer NOT NULL DEFAULT 1` with `CHECK (lifecycle_generation >= 1)`. The column joins the UNIQUE as its FINAL member: `UNIQUE (internal_game_id, internal_player_id, market_key, bookmaker_key, side, point, lifecycle_generation)`. The migration header now documents the generation semantics: reappearance after `confirmed_removed` inserts a NEW row at `generation + 1`; prior generations are frozen historical records and never mutate. A `COMMENT ON COLUMN` mirrors the same wording.

**(2) `src/lines/confirmedRemoval.ts` gains `requires_new_lifecycle_row`.** The `PresenceTransitionResult` interface adds `requires_new_lifecycle_row: boolean`. When `prior_state === 'confirmed_removed'` AND `present_in_current_poll === true` (and the poll succeeded and the source is available), the state machine now HOLDS the row at `confirmed_removed` with `count = 2` and returns `requires_new_lifecycle_row: true` — NEVER `present/0`. Every other transition returns `requires_new_lifecycle_row: false`. The updated `tests/lines/confirmedRemoval.test.ts` asserts the new field on every existing case AND adds three explicit reappearance-branch tests:

- `LOAD-BEARING: REAPPEARANCE after confirmed_removed HOLDS state (confirmed_removed/2) and sets requires_new_lifecycle_row=true — NEVER present/0`
- `LOAD-BEARING: absence after confirmed_removed HOLDS state; requires_new_lifecycle_row stays false`
- `LOAD-BEARING: FAILED poll after confirmed_removed HOLDS state; no new-row signal even if the offering would have been present`

**(3) `src/lines/movement.ts` comment corrections.** Two comments were factually wrong: no `detectPointTransitions` function exists in this repository, and `persistOddsapiSnapshot` does NOT itself walk the Cartesian product of prior/current offerings. The corrected top-of-function docstring now reads that this function is grain-scoped; the batch driver that walks the Cartesian product across a whole snapshot and reconciles grains via the `observed_line_lifecycle` UNIQUE key is a V1-5 obligation. The corrected same-side-point-change comment now describes the decomposition option at the batch level (V1-5) rather than referencing a nonexistent function.

**(4) `tests/migrations/schemaShape.test.ts` extended.** The new lint test `V1-4 correction: observed_line_lifecycle has lifecycle_generation NOT NULL DEFAULT 1 with CHECK >= 1, included as UNIQUE final member` asserts:
  - the column declaration exact form,
  - the `CHECK (lifecycle_generation >= 1)`,
  - the UNIQUE constraint's exact ordered member list ending in `lifecycle_generation`,
  - the header comment contains "Lifecycle generation semantics", "generation + 1", and "prior generations never mutate".

### Re-run evidence

- **`npm run typecheck`** → exit 0, no diagnostics.
- **`npm test`** (fixture-pure) → **313 tests / 50 suites; 307 pass, 0 fail, 6 skipped**. The four added confirmedRemoval assertions and the new schemaShape lint all pass; the 6 skips are the integration tests when `SLIPLABZ_DATABASE_URL` is unset (visible SKIP messages, per the persistence contract).
- **`npm run test:integration`** with `SLIPLABZ_DATABASE_URL` set → **6/6 pass** in ~830 ms. The transactional-atomicity test and the four canonical-closing-point cases all continue to pass.
- **Migration validation.** Two clean applications of ALL 44 migrations against fresh databases `sliplabz_v1_4_val_a` and `sliplabz_v1_4_val_b`. `pg_dump --schema-only --no-owner --no-privileges` on both; after stripping pg_dump's `\restrict`/`\unrestrict` session tokens, **byte-identical**, both SHA-256 `9adfa2514b4b84815fa5020e1596a0d4418def5c089b4239a9dac7bd60d2ca99`. Table count: **43**.

### Generation-column live probes

Six additional constraint probes ran on the live `sliplabz_v1_4_val_a` database:

| # | Attempted | Result |
|---|---|---|
| 1 | Insert lifecycle row at `(grain, generation=1)` | INSERT 0 1; returned `lifecycle_generation = 1` |
| 2 | **Insert lifecycle row at the SAME grain with `generation=2`** | INSERT 0 1; returned `lifecycle_generation = 2` (**the reappearance case**) |
| 3 | Duplicate at same `(grain, generation=1)` | `duplicate key value violates unique constraint "observed_line_lifecycle_internal_game_id_internal_player_id_key"` (pass) |
| 4 | Duplicate at same `(grain, generation=2)` | Same UNIQUE violation (pass) |
| 5 | `lifecycle_generation = 0` | `violates check constraint "observed_line_lifecycle_lifecycle_generation_check"` (pass) |
| 6 | Read back the two coexisting rows | `SELECT` returned two rows for the SAME grain: `generation=1, first_observed_offering_id=…331` and `generation=2, first_observed_offering_id=…334`. Both rows independently valid. |

The generation-column probe therefore proves executably: two rows for the same grain at different generations coexist; a duplicate at the same (grain, generation) is rejected; and `generation = 0` is rejected by the CHECK.

### Correction files changed (all worktree-only; nothing committed)

| File | Change |
|---|---|
| `supabase/migrations/20260711140003_observed_line_lifecycle.sql` | Adds `lifecycle_generation` column with CHECK + updates UNIQUE members + updates header comments + adds column comment. |
| `src/lines/confirmedRemoval.ts` | Adds `requires_new_lifecycle_row` field; new reappearance-after-confirmed branch that holds state and signals true. |
| `src/lines/movement.ts` | Two comment corrections (no `detectPointTransitions`; `persistOddsapiSnapshot` does not walk grains — V1-5 obligation). |
| `tests/lines/confirmedRemoval.test.ts` | All existing tests updated to assert `requires_new_lifecycle_row`; three explicit reappearance tests added. |
| `tests/migrations/schemaShape.test.ts` | New V1-4 correction lint asserting the column, CHECK, UNIQUE, and header-comment invariants. |
| `docs/product/reports/V1_TICKET_4_REPORT.md` | This addendum. |

Nothing else was touched. HEAD unchanged at `b66a5fdcc458678a4317b61371d4b109196ff74e`. No commit, no stage, no push.

# V1-4b Stage 1 Ticket Report — Current-Season Historical Closing-Line Seed

**Ticket:** V1-4b — Current-Season Historical Closing-Line Seed (Stage 1)
**Stage:** 1 of 2 (build the pipeline, prove on fixtures, run a BOUNDED live probe, inventory existing data, halt)
**Status:** implementation complete; halted for governor review; nothing staged, nothing committed. Stage 2 (full-season seed run) requires separate governor authorization.
**Prepared:** 2026-07-11
**Starting branch:** `main`
**Starting HEAD:** `5f852b0bb100945d862687303241ce3199137f4c` (V1-4 commit)
**Package revision governing this ticket:** SlipLabz V1 Repo Spec Package rev 1.3, as amended by V1-A1 and V1-A2.

---

## 1. Governance decisions recorded verbatim

Per the ticket preamble:

1. **Historical rights authorization.** The product owner, on advice of counsel, has authorized historical Odds API retrieval, retention, and use for this ticket; counsel assessed the rights risk as **low**. This authorization is the owner's decision of record. The V1-10 launch audit remains the final customer-facing rights checkpoint.
2. **First live-call authorization.** This is the FIRST ticket authorized to make live provider calls. Live calls are permitted ONLY through the live-invoke gate (`src/lines/liveInvokeGate.ts`) with `ODDSAPI_LIVE_INVOKE=1` set by the operator, ONLY to the historical endpoints named by the ticket, and ONLY within the Stage 1 credit budget below. The test suite remains fixture-only: no test may perform a live call; live probe execution is a separately-run operator script (`scripts/v1_4b_stage1_probe.ts`), not a test.
3. **Stage 1 live credit budget.** 200 credits maximum. Track spend against response headers after every request; halt live probing immediately if the next request would exceed the budget. The full-season forecast (approximately 40 credits/event × ~350 events ≈ 14,000 credits) is Stage 2 and is NOT authorized in this session.
4. **API key handling.** The owner will provide `ODDS_API_KEY` via the local `.env` (gitignored). Never print, log, or persist the key; the redaction path from V1-3 applies (`src/lines/liveInvokeGate.ts` + `src/odds/httpClient.ts`).

Governance record `docs/product/V1_GOVERNANCE_DECISIONS.md` v2.1 has NOT been modified by this ticket (that requires an amendment adoption, not a build ticket).

---

## 2. Authorities read

1. `docs/SlipLabz_V1_Final_Pre_Agent_Package_v1_3_patched2/SLIPLABZ_V1_AGENT_TICKET_QUEUE_v1_3.md` §§1-3 + §8b.
2. `docs/SlipLabz_V1_Final_Pre_Agent_Package_v1_3_patched2/SLIPLABZ_APPLICATION_V1_COMPLETE_SPEC_v1_3.md` §§3.6, 7.10, 10.13, 14.
3. `docs/SlipLabz_V1_Final_Pre_Agent_Package_v1_3_patched2/SLIPLABZ_ODDS_API_V1_DATA_SUBSPEC_AUDITED.md` §§6, 13, 18.4, 14.11 (full — §§14.11.1, 14.11.2, 14.11.3).
4. `docs/product/V1_GOVERNANCE_DECISIONS.md` v2.1.
5. `docs/architecture/V1_PERSISTENCE_CONTRACT.md`; `docs/architecture/V1_IDENTITY_CONTRACT.md`.
6. `docs/product/reports/V1_TICKET_4_REPORT.md` including the correction addendum (governor-approved).

Authority order applied without silent conflict resolution. §8b required a targeted expansion of the V1-4 `historical_line_results.provenance` CHECK; the additive migration `20260711150000_historical_line_results_allow_backfilled_provenance.sql` carries a prominent `GOVERNOR FLAG` header explaining the change and why current/historical isolation remains intact.

---

## 3. Preflight findings

### 3.1 Historical WNBA player-prop coverage

**Provider capability (Odds §14.11):** the historical event-odds endpoint returns player-prop markets from May 2023 onward, at 10-minute intervals historically and 5-minute intervals from September 2022 onward. WNBA is included. No SlipLabz live probe was executed in this session because `ODDS_API_KEY` was not present in the environment; the operator will run `scripts/v1_4b_stage1_probe.ts` separately.

### 3.2 Commercial retention / display rights

Recorded verbatim in §1 above: authorized by owner on advice of counsel; rights risk assessed as **low**; V1-10 audit remains the final gate. This is the owner's decision of record.

### 3.3 Current quota balance

Unknown in this session (no live invocation). The probe script's first request would fetch quota-header truth. The Stage 1 ceiling of 200 credits + `nextRequestWouldExceedBudget` pre-request predicate mechanically prevents overspend regardless of actual balance.

### 3.4 Existing historical rows

See §7 archive inventory. Summary: the propv1-archive Python pipeline captured **171,535 historical odds rows** across 2023-2026 seasons (Phase 4 backfill). Those rows live in a separate Supabase project and a filesystem cache at `/Users/benthomas/propv1-archive/var/cache/odds_api/` (2,471 gzipped payload files, ~9.7 MB). They are NOT copied into V1 by this ticket (Stage 1 is read-only per GD-7). Stage 2 may reuse the cache to eliminate live cost for previously-fetched slates — a Stage 2 decision, not a Stage 1 mandate.

---

## 4. Pipeline implementation

### 4.1 New migrations (3, additive; timestamped `20260711150000-02`)

| # | Filename | Adds |
|---|---|---|
| 44 | `20260711150000_historical_line_results_allow_backfilled_provenance.sql` | Additive CHECK expansion. `DO $$` block locates the anonymous V1-4 inline CHECK by `pg_get_constraintdef`, drops it, adds a named replacement `historical_line_results_provenance_check` admitting `('self_observed', 'backfilled_historical')`. V1-4 file NOT modified. Prominent `GOVERNOR FLAG` header documents that current-selection isolation is preserved on `market_snapshots` and via `CURRENT_ONLY_WHERE_CLAUSE`, which never filters on `historical_line_results`. |
| 45 | `20260711150001_seed_run_records.sql` | `seed_run_records`: run lifecycle + governor budget accounting (`credit_budget`, `credits_observed_total`, `completion_state` including `aborted_credit_budget`). CHECK pairs running with NULL `completed_at`; every terminal state requires it. |
| 46 | `20260711150002_seed_slice_watermarks.sql` | `seed_slice_watermarks`: PK `(slate_date, market_key, bookmaker_key)`, `slice_coverage_state` enum-in-CHECK, opaque `resume_cursor` jsonb, structural CHECK that `completed_at` requires both a run reference AND a terminal state (`complete` or `no_coverage_available`). |

Live migration validation: two clean applications of ALL 47 migrations against fresh databases `sliplabz_v1_4b_val_a` and `sliplabz_v1_4b_val_b`. `pg_dump --schema-only --no-owner --no-privileges` on both; after stripping pg_dump's `\restrict`/`\unrestrict` session tokens, **byte-identical**, both SHA-256 `3754eda7c5c091a5d9fdfc440b06a72d6bcf92098d0f101396ff6821ba39848b`. Total tables: **45**.

### 4.2 New TypeScript modules (`src/seed/`)

- `types.ts` — domain types (historical event / snapshot response shapes; seed run scope, open/closed; close-capture evaluation; historical closing-quote candidate; coverage-report row; quota-ledger entry).
- `staleness.ts` — `evaluateCloseCapture(...)`; constant `CLOSE_CAPTURE_STALENESS_THRESHOLD_SECONDS = 600` (10 minutes, spec §7.10.1 — configuration-backed, NOT loosenable in code).
- `quotaForecast.ts` — `forecastHistoricalEventOddsCost(...)` = `10 × markets × ceil(books/10)`; `reconcileHistoricalQuota(...)`; `nextRequestWouldExceedBudget(...)` (the pre-request guard).
- `historicalEventDiscovery.ts` — validate historical-events snapshot envelope (`{ timestamp, previous_timestamp, next_timestamp, data: [...] }`); duplicate/malformed rows quarantine.
- `historicalEventOdds.ts` — `processHistoricalSnapshot(...)`: applies staleness gate; filters to LAUNCH markets only; filters to allowlisted sportsbook keys only; DFS excluded; emits candidates for eligible sportsbook rows in the FINAL snapshot only (never walks backward).
- `seedRun.ts` — `openSeedRun` / `closeSeedRun` / `runMayAdvanceSliceWatermark`.
- `watermarks.ts` — `advanceSliceWatermark(prior, delta, run)`: only `complete` runs advance to `complete`/`no_coverage_available`; every other completion state → `partial_in_progress` with `completed_at = NULL` (interrupted-run resume invariant).
- `coverageReport.ts` — aggregation + markdown formatter for `V1_4B_STAGE1_COVERAGE_PROBE.md`.
- `httpClient.ts` — historical endpoint URLs (`/v4/historical/sports/basketball_wnba/events` and `.../events/{id}/odds`); reuses V1-3 `oddsapiRequest` for content-type-aware parsing + header retention.
- `orchestrator/persistHistoricalSnapshot.ts` — transactional persistence: `oddsapi_ingestion_runs` (`historical_query`) + `oddsapi_raw_responses` + `market_snapshots` (`historical_query, backfilled_historical`) + one `market_offerings` row per eligible candidate (required by V1-4 `source_closing_quotes` CHECK) + `source_closing_quotes` + optional `canonical_closing_points`. Atomic: any failure rolls back the whole set (proven by the `on_after_snapshot` hook injection test).

### 4.3 New operator script

- `scripts/v1_4b_stage1_probe.ts` — the Stage 1 bounded probe. Requires BOTH `ODDS_API_KEY` and `ODDSAPI_LIVE_INVOKE=1`; otherwise writes a fixture-mode skeleton to `docs/product/reports/V1_4B_STAGE1_COVERAGE_PROBE.md` describing what the run would do (see §6 below). The probe:
  1. Bounded to at most 4 events across 3 slate dates.
  2. Sportsbook allowlist only (never DFS).
  3. All four launch markets.
  4. Pre-request `nextRequestWouldExceedBudget()` check halts before overspend.
  5. Coverage-report markdown emitted at end (or fixture-mode skeleton if no key).

### 4.4 Modified files (additive only)

- `tsconfig.json` — added `scripts/**/*.ts` to `include` so typecheck covers the operator script.
- `tests/migrations/schemaShape.test.ts` — appended 3 V1-4b lint invariants (provenance CHECK expansion; `seed_run_records` state pairing; `seed_slice_watermarks` PK/terminal-state pairing).
- `tests/integration/support/db.ts` — `truncateAllV14Tables` now also clears `seed_run_records` and `seed_slice_watermarks`.

---

## 5. Test evidence

### 5.1 Fourteen required tests (§8b) — one-to-one mapping

| # | Ticket-required test | Test file : it(...) |
|---|---|---|
| 1 | historical event-ID discovery | `tests/seed/historicalEventDiscovery.test.ts` — *LOAD-BEARING #1: six-event historical slate validates cleanly* |
| 2 | clean final pre-tip snapshot | `tests/seed/historicalEventOdds.test.ts` — *LOAD-BEARING #2: clean final pre-tip snapshot → eligible; sportsbook candidates only* |
| 3 | snapshot within 10 minutes before boundary | `tests/seed/staleness.test.ts` — *LOAD-BEARING #3: 9 minutes before boundary → eligible* + boundary case at exactly 10 min |
| 4 | snapshot >10 minutes → `close_capture_stale` | `tests/seed/staleness.test.ts` — *LOAD-BEARING #4: 15 minutes before boundary → close_capture_stale* + boundary case at 10 min + 1 sec |
| 5 | offering absent from final but present earlier — must remain excluded | `tests/seed/historicalEventOdds.test.ts` — *LOAD-BEARING #5: offering absent from FINAL snapshot is NOT resurrected from earlier snapshot* |
| 6 | single-book canonical close | `tests/seed/canonicalClosingPointHistorical.test.ts` — *LOAD-BEARING #6: single-book eligible sportsbook → single_book coverage* |
| 7 | unique modal canonical close | `tests/seed/canonicalClosingPointHistorical.test.ts` — *LOAD-BEARING #7: unique modal (2 books at 12.5, 1 at 13.5) → canonical = 12.5* |
| 8 | tied points with no unique mode | `tests/seed/canonicalClosingPointHistorical.test.ts` — *LOAD-BEARING #8: tied 12.5 vs 13.5 → tied_no_unique_mode; NULL canonical* + no-interpolation |
| 9 | unsupported market slice | `tests/seed/historicalEventOdds.test.ts` — *LOAD-BEARING #9: unsupported market key (player_steals) filtered* |
| 10 | historical record cannot become current | `tests/seed/historicalIsolation.test.ts` — *LOAD-BEARING #10: every historical_query row is EXCLUDED from current selection*; **integration probe:** `tests/integration/persistHistoricalSnapshot.integration.test.ts` — *LOAD-BEARING PROBE (governor obligation): seeded snapshots are INVISIBLE to CURRENT_ONLY_WHERE_CLAUSE* |
| 11 | historical record cannot create first-observed or movement | `tests/seed/historicalIsolation.test.ts` — *LOAD-BEARING #11: observed_line_lifecycle STILL enforces provenance = self_observed* + `current_market_rows` same; **integration probe:** `tests/integration/persistHistoricalSnapshot.integration.test.ts` — *LOAD-BEARING: observed_line_lifecycle REJECTS provenance=backfilled_historical* + `current_market_rows` same |
| 12 | 40-credit default event forecast + header reconciliation | `tests/seed/quotaForecast.test.ts` — *LOAD-BEARING #12: default 8-book × 4-market historical event-odds forecast = 40 credits* + observed exact_match |
| 13 | idempotent rerun | `tests/seed/watermarks.test.ts` — *LOAD-BEARING #13 idempotent: a `complete` slice cannot be rewound by a second run* |
| 14 | interrupted run resumes without false completeness | `tests/seed/watermarks.test.ts` — *LOAD-BEARING #14 interrupted run: aborted_credit_budget → partial_in_progress; completed_at STAYS NULL* + resume path |

### 5.2 Full suite

- **`npm run typecheck`** → exit 0.
- **`npm test`** (fixture-pure) → **363 tests / 58 suites; 351 pass, 0 fail, 12 skipped**. The 12 skips are the integration tests when `SLIPLABZ_DATABASE_URL` is unset (visible `# SKIP integration:` messages).
- **`npm run test:integration`** with `SLIPLABZ_DATABASE_URL` set → **12/12 pass** in ~1,700 ms. Includes the six new V1-4b tests inside `persistHistoricalSnapshot.integration.test.ts`:
  - transactional atomicity (rollback proof under injected fault),
  - success path with correct `(historical_query, backfilled_historical)` shape,
  - **governor-obligation isolation probe (SQL): `SELECT count(*) FROM market_snapshots WHERE ${CURRENT_ONLY_WHERE_CLAUSE}` returns 0 while the seeded snapshot exists**,
  - `observed_line_lifecycle` rejects `backfilled_historical` at the CHECK,
  - `current_market_rows` rejects `backfilled_historical` at the CHECK,
  - `historical_line_results` accepts `backfilled_historical` (V1-4b additive migration executably verified end-to-end).

### 5.3 Live migration validation

Docker `postgres:16` (`sliplabz-v1-4b-postgres`, `--rm`, stopped and discarded after validation).

- Two clean applications of ALL 47 migrations; zero errors.
- `pg_dump` normalized SHA-256: `3754eda7c5c091a5d9fdfc440b06a72d6bcf92098d0f101396ff6821ba39848b` (both databases; byte-identical after stripping session tokens).
- Table count: **45**.
- Constraint-probe evidence lives in the schemaShape lint (3 new V1-4b assertions) and in the integration suite (the six V1-4b tests are executable schema probes against a live database).

---

## 6. Probe results

The live probe was NOT executed in this session because `ODDS_API_KEY` was not present in the environment when the script ran. The operator invokes it separately with the local `.env` populated:

```bash
export ODDS_API_KEY="…"                 # never commit
export ODDSAPI_LIVE_INVOKE=1            # explicit gate
export SLIPLABZ_DATABASE_URL="postgres://sliplabz:sliplabz_test_only@127.0.0.1:55432/sliplabz_v1_4b_it"
npx tsx scripts/v1_4b_stage1_probe.ts
```

`docs/product/reports/V1_4B_STAGE1_COVERAGE_PROBE.md` was written in **fixture mode**: it documents the governor scope (200-credit budget; 4 events; 3 slate dates; four launch markets; the 8 sportsbook allowlist keys with 1 region-equivalent; 40-credit-per-event forecast), the sequence the pipeline follows when live, and the exact live-invocation checklist. When the operator runs the probe with the key set, the same file is overwritten with the real quota ledger, per-slice coverage, and per-exclusion detail.

---

## 7. Archive inventory — `/Users/benthomas/propv1-archive` (READ-ONLY, per GD-7)

Confirmed strictly read-only. Nothing changed in `/Users/benthomas/propv1-archive`; nothing copied out.

### 7.1 Repository shape

- Branch `backfill-phase-0-1` at HEAD `8b2dc06` per `state.md`.
- Python pipeline (`src/pipeline/`) with an Odds-API historical backfill workstream and BallDontLie-style live ingestion.
- Migrations (`migrations/`): `001_init.sql` through `012_reset_phase3_extensions.sql`.

### 7.2 Historical odds inventory (Supabase snapshot 2026-07-09)

Per `state.md` and `docs/backfill/PHASE4_REPORT.md`:

- `odds_snapshots`: **172,067 rows** (live-line snapshots)
- `game_odds_snapshots`: **48 rows**
- `backtest_grades`: **13,347 rows** (`benchmark_type='sportsbook_line'`, `run_version='real_lines_v1_2026-07-09'`)
- Phase 4 historical-lines pull: **997 events × 2 snapshots = 1,994 snapshots; 171,535 historical odds rows written**. Actual credit spend across all Phase 4 sessions: **58,220** (delta of `x-requests-remaining` header from 98,947 to 40,727).
- Per-season row counts: 2023 = 27,501 / 2024 = 48,185 / 2025 = 64,496 / 2026 = 31,353.

### 7.3 Filesystem cache

`/Users/benthomas/propv1-archive/var/cache/odds_api/`

- **Total size:** ~9.7 MB gzipped.
- **File count:** **2,471** gzipped JSON payloads.
- **Distribution by year of snapshot date:** 2023 = 802, 2024 = 785, 2025 = 914, 2026 = 448.
- **Payload shape (audit-verified):** `{ endpoint, headers, params, payload: { data, timestamp, previous_timestamp, next_timestamp }, requested_at, url }`. `endpoint` values include `/historical/event_odds`. Request headers preserve `x-requests-last`, `x-requests-remaining`, `x-requests-used` — sufficient for Stage 2 forecast-vs-observed reconciliation without a new live request when re-using a cached slate.
- **Markets:** every filename observed is `player_assists_player_points_player_rebounds_us`. `player_threes` is NOT in the cache — Stage 2 will need to fetch it live (or discard `player_threes` from the seeded set for those slates and label the gap honestly).
- **Bookmakers per payload (sample):** `draftkings`, `betrivers`, `unibet_us`, `bovada`. `unibet_us` and `bovada` are NOT in the SlipLabz V1 sportsbook allowlist — they would be filtered by `processHistoricalSnapshot` if re-ingested. **Only `draftkings` and `betrivers` (V1 allowlist keys) would flow through.**

### 7.4 Coverage vs. SlipLabz launch scope

| Slice | Archive coverage | V1 launch coverage |
|---|---|---|
| Player points | full 2023-2026 | required |
| Player rebounds | full 2023-2026 | required |
| Player assists | full 2023-2026 | required |
| Player threes | **absent** | required |
| Sportsbooks | DraftKings + BetRivers + Unibet US + Bovada | 8 keys per Odds §10.3; only DraftKings and BetRivers overlap |

Implication for Stage 2 planning (see §8): even reusing the cache, the seed pipeline must live-fetch `player_threes` for every eligible slate, AND the majority of sportsbook keys (`fanduel`, `betmgm`, `williamhill_us`, `fanatics`, `hardrockbet`, `espnbet`) require live fetching for every event. The credit forecast for Stage 2 does not materially decrease from cache reuse; the primary benefit is redundancy / rate-limit relief.

---

## 8. Stage 2 recommendation

**Recommendation: PROCEED to Stage 2 seed run** for the season active at launch, contingent on the operator running the Stage 1 live probe first (with an ODDS_API_KEY populated) and reporting the outcomes to the governor.

### 8.1 Full-season forecast

- **Events in season active at launch (2026, per archive Phase 4):** ~161 events observed through mid-July 2026.
- **Projected total for full 2026 season:** ~350-400 events (extrapolating the propv1-archive per-season pattern: 262 → 263 → 311 → 350+).
- **Per-event historical event-odds cost (§14.11.2):** 40 credits (4 markets × 1 region-equivalent × 10 multiplier), assuming the V1 allowlist stays at ≤10 sportsbook keys.
- **Historical events discovery cost:** documented separately per §14.11.2; conservatively 1 credit per slate date × ~180 slate dates ≈ 180 credits.
- **Full-season total forecast:** **~14,000-16,000 credits** for event-odds + ~180 credits for discovery. Header remains authoritative.

### 8.2 Expected coverage

- **Sportsbooks:** `player_points` / `player_rebounds` / `player_assists` are historically abundant per the archive (2023-2026 dense). `player_threes` is not in the archive but per Odds §14.11 has been available since May 2023 for WNBA; expected coverage is comparable.
- **DFS / pick'em:** correctly EXCLUDED by allowlist × source_class filter. §14.11.1 sportsbook-only for canonical historical seed.
- **Player mapping:** Odds §10.11 slate-audit found zero unmatched normalized names against BDL active players; V1-1's reconciliation queue absorbs any unresolved cases without contaminating aggregates.

### 8.3 Open risks

1. **Provider quota tail risk.** A single provider outage that returns unexpected schema at HTTP 200 would emit `failed_schema_drift` per V1-3 error matrix (not applicable to Stage 1 code but is to Stage 2's outer loop); coverage stays honest.
2. **Snapshot availability at close boundary.** For events whose provider snapshots are >10 min before scheduled tip (§7.10.1), `close_capture_stale` is enforced; those events remain missing in the seed, and the slice watermark records the gap. Coverage report enumerates every gap.
3. **`player_threes` first-availability lag on 2023 early-season events.** §14.11 permits "only include sources, sports, and markets after provider support began"; Stage 2 must accept and label the resulting missing slices.
4. **Backwards-map of previously-fetched propv1-archive cache.** Reusing the cache is a Stage 2 decision, not a Stage 1 mandate; the cache format shape is auditable but does not include V1 sportsbook keys FanDuel / BetMGM / Fanatics / Hard Rock Bet / theScore Bet / Caesars for many events. Recommend Stage 2 fetch live for the V1 allowlist AND retain the cache as read-only cross-check only.

### 8.4 Alternative disposition (not recommended)

A **forward-only disposition** would be justified only if (a) the Stage 1 live probe reveals coverage sparser than Odds §14.11 documents, or (b) counsel withdraws the historical retention authorization. Absent either signal, the recommendation stands: proceed to Stage 2 with the Stage 1 pipeline as-built and the same governance decisions extended to cover the full budget.

---

## 9. Deviations and assumptions

**Deviations:**
- `tsconfig.json` was extended to `include: ["src/**/*.ts", "tests/**/*.ts", "scripts/**/*.ts"]` so typecheck covers the new operator script. This is a purely additive edit to the config file introduced in V1-1; no prior test regressed.
- The V1-4b provenance CHECK expansion migration replaces an anonymous inline CHECK with a NAMED constraint. The V1-4 migration file itself was NOT edited (schemaShape lint verifies). The V1-4b migration uses a `DO $$` block to look up the constraint by expression, making it robust across environments.
- The persistence orchestrator inserts a single `market_offerings` row per candidate to satisfy V1-4's `source_closing_quotes.source_offering_id NOT NULL WHEN eligible` CHECK. This is a schema-side requirement; the seeded offering rows carry `provenance` on their linked snapshot (not on `market_offerings` itself, which has no provenance column). `CURRENT_ONLY_WHERE_CLAUSE` still filters on `market_snapshots`, so those offerings remain invisible to current selection.

**Assumptions:**
- The V1-1 identity contract remains valid; V1-4b consumes it via `reconcileOddsApiEvent` (through the same code path V1-3 uses).
- The V1 bookmaker allowlist is exactly the 10 keys in `src/odds/bookmakerAllowlist.ts`. Any change requires a governance decision under GD-9 (unchanged from V1-3 report addendum).
- The 10-minute close-capture threshold is spec §7.10.1's approved value; a change requires methodology review, not a code-only edit.
- The propv1-archive is not modified by any V1 code (GD-7 explicit); the inventory in §7 is a documentation-only artifact.

**Classified assumptions:**
- **Blocking if wrong (P0):** none identified for Stage 1.
- **Non-blocking (P1):** the Stage 2 forecast is extrapolated from the archive's per-season counts; if actual 2026 season size differs materially, the pre-request predicate still enforces the budget in Stage 2 exactly as it does in Stage 1.

---

## 10. Skipped checks and unresolved issues

**Skipped:**
- Live provider invocation (no `ODDS_API_KEY` in the current environment; operator runs `scripts/v1_4b_stage1_probe.ts` separately).
- Actual credit consumption is 0 in this session; will be observed when the operator invokes the probe.
- The seed pipeline's optional DB write-through path (`SEED_PROBE_PERSIST=1`) — Stage 1 defaults to dry-run to keep read-only. The persistence orchestrator itself is exercised by the integration suite.

**Unresolved issues:**
- Node runtime pin drift (`.node-version = 20.10.0` vs. running `v24.15.0`) unchanged from prior tickets.
- Repeated-snapshot audit remains outstanding per Odds §23.2; movement thresholds provisional. V1-4b does not depend on that resolution.
- V1-10 launch audit remains the final customer-facing rights checkpoint; unchanged from the ticket preamble.

---

## 11. Files changed (final)

**Untracked (added by V1-4b):**
- `docs/product/reports/V1_TICKET_4B_REPORT.md` (this file)
- `docs/product/reports/V1_4B_STAGE1_COVERAGE_PROBE.md` (fixture mode; overwritten by live probe)
- `scripts/v1_4b_stage1_probe.ts`
- `src/seed/` (10 files including `orchestrator/persistHistoricalSnapshot.ts`)
- `supabase/migrations/20260711150000_historical_line_results_allow_backfilled_provenance.sql`
- `supabase/migrations/20260711150001_seed_run_records.sql`
- `supabase/migrations/20260711150002_seed_slice_watermarks.sql`
- `tests/fixtures/seed/` (10 files including README)
- `tests/seed/` (7 files)
- `tests/integration/persistHistoricalSnapshot.integration.test.ts`

**Modified (additive only):**
- `tsconfig.json` — appended `scripts/**/*.ts` to `include`
- `tests/migrations/schemaShape.test.ts` — appended 3 V1-4b lint invariants
- `tests/integration/support/db.ts` — `truncateAllV14Tables` extended for seed tables

**Not modified:** any V1-0/V1-1/V1-2/V1-3/V1-4 authority, migration, module, test, or report; the identity or persistence contracts; the amendment files.

---

## 12. `git status --short` (post-implementation, pre-commit)

```
 M tests/integration/support/db.ts
 M tests/migrations/schemaShape.test.ts
 M tsconfig.json
?? docs/product/reports/V1_4B_STAGE1_COVERAGE_PROBE.md
?? docs/product/reports/V1_TICKET_4B_REPORT.md
?? scripts/
?? src/seed/
?? supabase/migrations/20260711150000_historical_line_results_allow_backfilled_provenance.sql
?? supabase/migrations/20260711150001_seed_run_records.sql
?? supabase/migrations/20260711150002_seed_slice_watermarks.sql
?? tests/fixtures/seed/
?? tests/integration/persistHistoricalSnapshot.integration.test.ts
?? tests/seed/
```

Nothing staged. Nothing committed. No push attempted (no remote configured).

---

## 13. Explicit halt status

- V1-4b Stage 1 implementation is complete; all evidence is captured in this report + the coverage-probe fixture-mode report.
- Nothing has been committed. `git rev-parse HEAD` remains at `5f852b0bb100945d862687303241ce3199137f4c`.
- The full-season seed run has NOT begun and will not begin without governor authorization.
- Halted per Stage 1 gate.

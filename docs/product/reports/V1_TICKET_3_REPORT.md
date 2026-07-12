# V1-3 Ticket Report — Odds API Ingestion Foundation

**Ticket:** V1-3 — Odds API Ingestion Foundation
**Status:** implementation complete; halted for governor review; nothing staged, nothing committed.
**Prepared:** 2026-07-11
**Starting branch:** `main`
**Starting HEAD:** `5a3175a3c7d8ae6b29f2319e801f36d9e70ae09f` (V1-2 commit)
**Package revision governing this ticket:** SlipLabz V1 Repo Spec Package rev 1.3, as amended by V1-A1 (product amendment, `c5779fb`) and V1-A2 (UX amendment, `d278ac0`).
**Governance decisions in effect:** GD-1 (Supabase-hosted PostgreSQL); GD-8 through GD-13 (V1-A1); GD-14 through GD-17 (V1-A2). V1-3 is unchanged by V1-A1 per §30, and the four launch markets + bookmaker allowlist remain locked by A1 §4.1 / §4.2.

---

## 1. Authorities read

1. `docs/SlipLabz_V1_Final_Pre_Agent_Package_v1_3_patched2/SLIPLABZ_V1_AGENT_TICKET_QUEUE_v1_3.md` §§1-3 and §7 (V1-3 mission, allowed scope, required behavior, 17-test list, 7 acceptance criteria).
2. `docs/SlipLabz_V1_Final_Pre_Agent_Package_v1_3_patched2/SLIPLABZ_ODDS_API_V1_DATA_SUBSPEC_AUDITED.md` — FULL, read end-to-end. Every load-bearing constraint in the migrations and code cites its numbered section.
3. `docs/SlipLabz_V1_Final_Pre_Agent_Package_v1_3_patched2/SLIPLABZ_APPLICATION_V1_COMPLETE_SPEC_v1_3.md` §§8-11, §13, §21.
4. `docs/product/V1_GOVERNANCE_DECISIONS.md` v2.1.
5. `docs/product/amendments/SLIPLABZ_V1_AMENDMENT_A1_INTEGRATED.md` §§4 and §30 (V1-3 unchanged by amendment; four launch markets and bookmaker allowlist locked).
6. `docs/architecture/V1_IDENTITY_CONTRACT.md` — consumed via `src/odds/eventReconciliationAdapter.ts`; V1-1 event reconciliation NEVER reimplemented.

Authority order applied without silent conflict resolution.

---

## 2. Files changed (plan and actual)

**New migrations (10, additive; all timestamped `20260711130000-09`):**

| # | Filename | Adds |
|---|---|---|
| 24 | `20260711130000_oddsapi_enums.sql` | 15 enums governing runs, provenance, source class, offering state, freshness, schema state, promotion type, price semantic, quota delta |
| 25 | `20260711130001_bookmaker_registry.sql` | `bookmaker_registry` (allowlist with structural source_class) |
| 26 | `20260711130002_market_registry.sql` | `market_registry` (launch-market flag + canonical stat key) |
| 27 | `20260711130003_oddsapi_ingestion_runs.sql` | `oddsapi_ingestion_runs` (one per request; running↔completed_at CHECK; quota reconciliation columns) |
| 28 | `20260711130004_oddsapi_raw_responses.sql` | `oddsapi_raw_responses` (immutable per-run raw body + text + headers) |
| 29 | `20260711130005_oddsapi_event_snapshots.sql` | `oddsapi_event_snapshots` + derived `oddsapi_event_presence` |
| 30 | `20260711130006_market_snapshots.sql` | `market_snapshots` (UNIQUE (run, event, book, market); CHECK restricting request_kind × provenance to (current_poll, self_observed) in V1-3 and (historical_query, backfilled_historical) in V1-4b) |
| 31 | `20260711130007_market_offerings.sql` | `market_offerings` (UNIQUE (snapshot, normalized_player, point, side); CHECK duplicate_count>=1; CHECK conflict_reason paired with state) |
| 32 | `20260711130008_market_offering_raw_rows.sql` | `market_offering_raw_rows` (per-raw disposition contributed/duplicate/quarantined; UNIQUE (snapshot, raw_row_index)) |
| 33 | `20260711130009_oddsapi_quarantine.sql` | `oddsapi_quarantine` (schema drift, conflicts, unallowlisted keys, etc.) |

**New TypeScript modules (`src/odds/`, 16 files, zero new dependencies):**
- `types.ts`, `marketKeys.ts`, `bookmakerAllowlist.ts`, `quotaForecast.ts`, `freshness.ts`, `sourceHash.ts`, `eventDiscovery.ts`, `normalizeOutcome.ts`, `duplicateCollapse.ts`, `schemaValidation.ts`, `pollResult.ts`, `prizePicks.ts`, `underdog.ts`, `ingestionRun.ts`, `eventReconciliationAdapter.ts`, `httpClient.ts`.

**New fixtures (`tests/fixtures/odds/`, 13 files) with provenance manifest.**

**New tests (`tests/odds/`, 14 files):** cover the 17-item required list + schemaShape lint extension + HTTP-client safety.

**Modified files (3, additive only):**
- `src/shared/enums.ts` — appends V1-3 string-literal unions mirroring `20260711130000_oddsapi_enums.sql`.
- `tests/migrations/schemaShape.test.ts` — appends V1-3 static-lint invariants.
- `.env.example` — appends `ODDS_API_KEY`, `ODDSAPI_LIVE_INVOKE`, `ODDSAPI_REQUEST_TIMEOUT_MS` placeholders.

**Not modified:** any V1-0, V1-1, or V1-2 authority; any prior migration; any prior identity or BDL module or test; the identity contract; the amendment files; either report.

**No new dependencies.** Every V1-3 module uses only Node built-ins (`node:crypto`, `node:test`, `node:assert/strict`, `node:fs`, `node:url`, `node:path`).

---

## 3. Required-test coverage (ticket §7 seventeen-test list)

| # | Ticket-required test | Test file : it(...) |
|---|---|---|
| 1 | six-event slate fixture | `tests/odds/eventDiscovery.test.ts` — *six-event slate fixture: all six events pass structural validation*, plus *slate identity: the six audit-verbatim event IDs are all present* |
| 2 | all four markets | `tests/odds/fourMarkets.test.ts` — *exactly four launch market keys and their canonical stat mapping*, *isLaunchMarketKey accepts the four keys and rejects everything else* |
| 3 | source sparsity | `tests/odds/duplicateCollapse.test.ts` — *source sparsity: sparse event produces canonical rows for each outcome; no duplicates; no conflicts* |
| 4 | zero books | `tests/odds/duplicateCollapse.test.ts` — *zero books: empty outcomes array yields zero offerings — NOT an error* |
| 5 | duplicate BetRivers-style outcomes | `tests/odds/duplicateCollapse.test.ts` — *LOAD-BEARING: BetRivers duplicate group collapses (2 Over → 1 canonical duplicate_count=2; 2 Under → same)* |
| 6 | conflicting duplicates | `tests/odds/duplicateCollapse.test.ts` — *LOAD-BEARING: conflicting duplicates quarantine both raw rows; NO canonical offering emitted* |
| 7 | PrizePicks symmetric display prices | `tests/odds/prizePicks.test.ts` — *LOAD-BEARING: fixture invariants — 26 rows, ALL price=-137, ALL multiplier=null* |
| 8 | PrizePicks null multiplier | `tests/odds/prizePicks.test.ts` — *promotion type is ALWAYS `unknown` in V1-3 (§11.7)* + *normalized rows carry provider_synthetic_or_display_price semantic* |
| 9 | Underdog multiplier 1.0 | `tests/odds/underdog.test.ts` — *LOAD-BEARING: multiplier 1.0 is NEVER interpreted (§12.5)* |
| 10 | Underdog over-only offering | `tests/odds/underdog.test.ts` — *LOAD-BEARING: Kayla Thornton 8.5 player_points is over_only; Under NEVER fabricated*; also `duplicateCollapse.test.ts` cross-check |
| 11 | 10-book quota | `tests/odds/quotaForecast.test.ts` — *LOAD-BEARING: 10-book × 4-market forecast = 4; observed header exactly 4 → exact_match* |
| 12 | 11+ book quota | `tests/odds/quotaForecast.test.ts` — *LOAD-BEARING: 12-book × 4-market forecast = 8; observed header exactly 8 → exact_match* |
| 13 | invalid-market 422 | `tests/odds/pollResult.test.ts` — *invalid-market 422 → failed_invalid_request; does NOT overwrite current* |
| 14 | successful empty | `tests/odds/pollResult.test.ts` — *LOAD-BEARING: 200 with empty bookmakers → successful_empty; DOES overwrite current (§16.1)* |
| 15 | failed response | `tests/odds/pollResult.test.ts` — *LOAD-BEARING: 500 failed poll → failed_transport; NEVER overwrites current* |
| 16 | stale market timestamp | `tests/odds/freshness.test.ts` — *classifies four canonical cases per §19.2 thresholds*, plus boundary tests at 10m and 30m |
| 17 | invalid schema with HTTP 200 | `tests/odds/pollResult.test.ts` — *LOAD-BEARING: 200 with invalid body (schema drift) → failed_schema_drift; raw preserved by caller* |

All 17 pass.

---

## 4. Acceptance-criteria mapping (ticket §7 seven criteria)

| # | Criterion | Where satisfied |
|---|---|---|
| A | **Sportsbook and DFS records never mix in consensus.** | `src/odds/bookmakerAllowlist.ts:isConsensusEligibleBookmakerKey` returns `true` only when source_class is `sportsbook`. `market_snapshots.source_class` is enum-typed at the schema level. `tests/odds/bookmakerAllowlist.test.ts:PrizePicks and Underdog are dfs_pickem and NOT consensus-eligible`; `tests/odds/prizePicks.test.ts:LOAD-BEARING: excluded from sportsbook consensus`; `tests/odds/underdog.test.ts:LOAD-BEARING: excluded from sportsbook consensus`. |
| B | **Exact duplicates collapse only after raw retention.** | Every raw outcome enters `market_offering_raw_rows` (immutable in intent; UNIQUE (snapshot, raw_row_index)) BEFORE `duplicateCollapse` emits canonical rows. `market_offerings.duplicate_count` records how many raw rows contributed. `tests/odds/duplicateCollapse.test.ts:LOAD-BEARING: BetRivers duplicate group collapses` verifies the count. |
| C | **Conflicts quarantine.** | `collapseOutcomes` emits no canonical row when prices disagree at the same key; every raw row in the conflict group is flagged for quarantine. `market_offerings.conflict_reason` CHECK requires `offering_state='conflicting'` when set. `tests/odds/duplicateCollapse.test.ts:LOAD-BEARING: conflicting duplicates quarantine both raw rows`. |
| D | **Quota forecast reconciles to response headers.** | `src/odds/quotaForecast.ts:reconcileQuota` returns one of `exact_match`, `observed_lower_than_forecast`, `observed_higher_than_forecast`, or `observed_missing`; divergence is recorded, never silently patched. `oddsapi_ingestion_runs.quota_delta_flag` persists the outcome. `tests/odds/quotaForecast.test.ts:LOAD-BEARING: divergence records flag; NEVER silently patched`. |
| E | **Empty success and failed poll produce different states.** | `classifyPollResult` returns `successful_empty` only for a schema-valid 200 with `bookmakers: []`; every failure class is distinct. `runOverwritesLastValidSnapshot` returns true only for `complete` and `successful_empty`. `tests/odds/pollResult.test.ts:LOAD-BEARING: 200 with empty bookmakers → successful_empty; DOES overwrite current` + *LOAD-BEARING: 500 failed poll → failed_transport; NEVER overwrites current*. |
| F | **No missing side is fabricated.** | `collapseOutcomes` never emits a synthetic Over/Under counterpart; one-sided groups receive `offering_state = 'over_only'` or `'under_only'`. `tests/odds/duplicateCollapse.test.ts:LOAD-BEARING: Underdog over-only offering preserved` + `tests/odds/underdog.test.ts:Kayla Thornton 8.5 player_points is over_only`. |
| G | **All provider strings, prices, points, and timestamps remain auditable.** | Raw fields preserved verbatim in `market_offering_raw_rows.raw_payload`, `market_offerings.raw_price_american`, `raw_multiplier`, `raw_player_description`, `provider_last_update`. `oddsapi_raw_responses` is immutable in intent (no `updated_at`); the schema-shape lint enforces this. `tests/odds/normalizeOutcome.test.ts:LOAD-BEARING: raw fields preserved verbatim`; `tests/odds/rawTraceabilityAndHash.test.ts` covers hash determinism and price-semantic sensitivity. |

---

## 5. Hard-invariant conformance

Every hard invariant from the ticket is enforced in schema AND code AND test:

- **No live provider call in the test suite** — `tests/odds/httpClientSafety.test.ts` asserts `ODDSAPI_LIVE_INVOKE` and `ODDS_API_KEY` are absent/empty at test time and that `.env.example` contains the empty placeholders. The injected `fetch` shim is required by the client's signature; there is no path from tests to `globalThis.fetch`.
- **Sportsbook vs DFS structural** — `market_snapshots.source_class` is `source_class` enum; `bookmaker_registry.source_class` is enum. Consensus predicate lives in one file.
- **Raw retention before collapse** — `market_offering_raw_rows` is the durable retention target; `market_offerings.duplicate_count` records the collapse count without erasing evidence.
- **Conflict quarantine with evidence** — `market_offerings.offering_state='conflicting'` CHECK requires `conflict_reason`; `oddsapi_quarantine.reason` CHECK covers `conflicting_outcomes` and every §10.14 missing-data reason.
- **Quota reconciliation** — `oddsapi_ingestion_runs.quota_forecast`, `quota_observed`, `quota_delta_flag`, and the three `x_requests_*` columns persist the reconciliation record.
- **Successful-empty vs failed distinction** — `bdl_run_state` — sorry, `oddsapi_run_state` — has separate `successful_empty` and every failure class; `runOverwritesLastValidSnapshot` distinguishes both.
- **One-sided offerings preserved** — `collapseOutcomes` assigns `over_only`/`under_only` explicitly; the `offering_state` enum has both values as first-class.
- **Only four launch markets** — `LAUNCH_MARKET_KEYS` is `Object.freeze`d; `isLaunchMarketKey` is the single canonical predicate; `market_registry.is_launch_market` is the schema flag.
- **Only allowlisted books** — `V1_BOOKMAKER_ALLOWLIST` is exactly 10 entries; `bookmaker_registry` FK from `market_snapshots.bookmaker_key`.
- **Schema-drift quarantine with raw preserved** — `oddsapi_raw_responses.response_body_text` retains the raw text on drift; `oddsapi_quarantine.reason='schema_drift_http_200'` records the incident.
- **Current-poll provenance** — `market_snapshots` CHECK forces `(current_poll, self_observed)` for V1-3 writes; `(historical_query, backfilled_historical)` reserved for V1-4b.
- **Auditable strings/prices/points/timestamps** — every raw string and value is retained; the schema-shape lint enforces the immutability-in-intent contract for raw responses.

---

## 6. Live migration validation (Docker `postgres:16`)

**Container:** `sliplabz-v1-3-postgres`, image `postgres:16` (digest `sha256:be01cf82fc7dbba824acf0a82e150b4b360f3ff93c6631d7844af431e841a95c`, PostgreSQL 16.14). Started with `--rm`, host port 55432 → container 5432. Stopped and discarded after validation. No Supabase CLI, no Homebrew, no hosted project.

### Two clean applications
- `sliplabz_v1_3_val_a`: all 34 migrations (12 V1-1 + 12 V1-2 + 10 V1-3) applied in filename order with `ON_ERROR_STOP=1`. Zero errors, zero warnings.
- `sliplabz_v1_3_val_b`: independent database, same migrations. Zero errors, zero warnings.

### Schema equality
`pg_dump --schema-only --no-owner --no-privileges` on both; after stripping pg_dump's random `\restrict`/`\unrestrict` session tokens, **byte-identical**, both SHA-256 `85c068e0ae13c93a5312825e7b948055813077cc9d81d5f849575a349ae8f674`. 3,667-line normalized dump. Total tables: **35**.

### Constraint probes on new invariants
| # | Attempted violation | Result |
|---|---|---|
| P1 | `oddsapi_ingestion_runs`: `result_state='running'` with `completed_at` set | violates CHECK `oddsapi_ingestion_runs_check` (pass) |
| P2 | Terminal state without `completed_at` | Same CHECK (pass) |
| P3 | Happy-path complete run | INSERT 0 1 |
| P4 | Duplicate `(run_id)` on `oddsapi_raw_responses` | violates UNIQUE `oddsapi_raw_responses_run_unique` (pass) |
| P5 | `market_snapshots` `current_poll` with provenance `backfilled_historical` | violates CHECK `market_snapshots_check` (pass) |
| P6 | `market_snapshots` `current_poll` without `observed_at` | violates CHECK `market_snapshots_check2` (pass) |
| P7 | `market_snapshots` `current_poll` + `self_observed` + `observed_at` | INSERT 0 1 |
| P8 | Duplicate `(run, event, book, market)` on `market_snapshots` | violates UNIQUE `market_snapshots_oddsapi_ingestion_run_id_provider_event_id_key` (pass) |
| P9 | `market_snapshots` `historical_query` with `self_observed` | violates CHECK `market_snapshots_check1` (pass — V1-4b reserved) |
| P10 | `market_offerings` `duplicate_count=0` | violates CHECK `market_offerings_duplicate_count_check` (pass) |
| P11 | `market_offerings` `state='conflicting'` without `conflict_reason` | violates CHECK `market_offerings_check` (pass) |
| P12 | `market_offerings` `state='two_sided_complete'` with `conflict_reason` set | Same CHECK (pass) |
| P13 | Duplicate `(snapshot, normalized_player, point, side)` on `market_offerings` | violates UNIQUE `market_offerings_market_snapshot_id_normalized_player_name__key` (pass) |
| P14 | `market_offering_raw_rows.disposition='bogus'` | violates CHECK `market_offering_raw_rows_disposition_check` (pass) |
| P15 | `market_offering_raw_rows` valid dispositions (`contributed`, `duplicate`, `quarantined`) | 3× INSERT 0 1 (pass) |
| P16 | `oddsapi_quarantine.reason='bogus_reason'` | violates CHECK `oddsapi_quarantine_reason_check` (pass) |
| P17 | `oddsapi_quarantine.reason='schema_drift_http_200'` | INSERT 0 1 (pass) |

All 17 probes reject the intended-invalid states or accept the intended-valid ones.

---

## 7. Typecheck and full test suite

**Command:** `npm run typecheck` → exit 0, no diagnostics.

**Command:** `npm test` (`node --import tsx --test tests/**/*.test.ts`) →
- **tests: 232**
- **suites: 39**
- **pass: 232**
- fail: 0
- skipped: 0
- todo: 0
- duration_ms: ~549
- warnings: none observed

Node runtime: `v24.15.0` (repo `.node-version` pin `20.10.0`; unchanged drift called out from V1-1 / V1-2).

---

## 8. Fixture provenance

`tests/fixtures/odds/README.md` restates the provenance discipline. Each file carries a top-level `provenance` object.

| Fixture | Kind | Derivation |
|---|---|---|
| `events-slate-2026-07-10.json` | audit_derived | Six event IDs, matchups, and commence times from Odds §5 verbatim. |
| `event-odds-1547-full.json` | mixed | Event ID + matchup verbatim; row content compact (5 players instead of 9); BetRivers duplicate-group pattern preserved verbatim (§10.8). |
| `event-odds-93c-partial.json` | mixed | Event ID + matchup verbatim; sparse coverage per §10.6. |
| `event-odds-1547-conflicting-duplicates.json` | synthetic | Crafted §10.5-rule-5 case: two BetRivers rows same key, different prices. |
| `prizepicks-1547.json` | mixed | 26 rows arranged 13 Over + 13 Under; audit-verbatim aggregate counts and semantics. |
| `underdog-1547.json` | mixed | 11 rows arranged 6 Over + 5 Under; §12.6 over-only Kayla Thornton `player_points 8.5` preserved verbatim. |
| `quota-10-book-response.json` | audit_derived | §13.2 test 1 headers: 4 credits, 1 region-equivalent. |
| `quota-12-book-response.json` | audit_derived | §13.2 test 2 headers: 8 credits, 2 region-equivalents. |
| `quota-invalid-market-422.json` | audit_derived | §13.7 audit: HTTP 422, 0 credits. |
| `successful-empty-response.json` | synthetic | HTTP 200 with `bookmakers: []`. |
| `failed-response-500.json` | synthetic | HTTP 500 with text body. |
| `schema-drift-200.json` | synthetic | HTTP 200 with `bookmakers` as a string. |
| `stale-market-timestamp.json` | synthetic | Four freshness-threshold cases + null. |

No fixture contains a real Odds API payload retrieved from a live source. No fixture contains a credential.

---

## 9. Deviations and assumptions

**Deviations:**
- The four-market event-odds slate fixture `event-odds-1547-full.json` reduces row content to a compact set (5 players instead of the audit's 9); the audit's §10.3 summary counts (books, players, duplicate groups) drove the shape rather than a one-to-one replay. Called out in the fixture's `provenance.notes`.
- `event_markets` and `historical_events` / `historical_event_odds` endpoints are declared in the `oddsapi_endpoint` enum for V1-4b's future adoption but are NOT ingested by V1-3.
- The `oddsapi_event_presence` table's `single_omission` / `confirmed_removed` transitions are declared but the state machine that advances them is not fully wired in V1-3; the ticket did not require an operational polling loop. The schema supports the state machine V1-4 or a poll-runner will drive.

**Assumptions:**
- The V1-1 identity contract stays valid: `provider_teams`, `provider_players`, `provider_games` UNIQUE constraints and the reconciliation precedence are the load-bearing surfaces V1-3 consumes.
- `bookmaker_registry` and `market_registry` are curated tables loaded by an operator process (out of scope). V1-3 code assumes the allowlist matches `V1_BOOKMAKER_ALLOWLIST` and the four launch markets are the only `is_launch_market=true` rows; the tests validate the code-side constants directly.
- `providerkind` enum values `balldontlie` / `odds_api` remain adequate; V1-3 does not add a new provider.
- The 10-key default V1 bundle bills as 1 region-equivalent (Odds §13.3 / §14.6). Operators may configure a larger allowlist; the forecast still uses `ceil(n/10)`.

**Classified assumptions:**
- **Blocking if wrong (P0):** none identified.
- **Non-blocking (P1):** the event-presence transition wiring, the operator-driven registry loaders.

---

## 10. Skipped checks and unresolved issues

**Skipped:**
- The optional `event_markets` diagnostic endpoint (§14.10). Explicitly optional per V1 use.
- Historical odds (`historical_events`, `historical_event_odds`) — reserved for V1-4b; the schema has enum values and CHECKs, but no ingestion code.

**Unresolved issues:**
- Node runtime version pin drift (`.node-version = 20.10.0` vs running `v24.15.0`) unchanged from V1-1 / V1-2.
- Repeated-snapshot audit remains outstanding (Odds §23.2); movement thresholds and disappearance policy are provisional until then. V1-4 owns movement; V1-3's storage is designed to survive tuning without redesign.
- Commercial provider-rights approval (Odds §23.3) is out of scope; V1-10 launch gate holds.

---

## 11. Files changed (final)

**Untracked (added by V1-3):**
- `docs/product/reports/V1_TICKET_3_REPORT.md` (this file)
- `src/odds/` (16 files)
- `supabase/migrations/20260711130000_oddsapi_enums.sql` … `20260711130009_oddsapi_quarantine.sql` (10 files)
- `tests/fixtures/odds/` (14 files including `README.md`)
- `tests/odds/` (14 files)

**Modified (additive only):**
- `.env.example` — appended Odds placeholders
- `src/shared/enums.ts` — appended V1-3 string-literal unions
- `tests/migrations/schemaShape.test.ts` — appended V1-3 lint checks

**Not modified:**
- Any V1-0, V1-1, or V1-2 authority.
- Any V1-1 or V1-2 migration.
- Any V1-1 identity or V1-2 BDL module or test.
- `docs/architecture/V1_IDENTITY_CONTRACT.md`.
- V1-2 report or governance documents.
- `package.json` / `package-lock.json` (no new dependencies).

---

## 12. `git status --short` (post-implementation, pre-commit)

```
 M .env.example
 M src/shared/enums.ts
 M tests/migrations/schemaShape.test.ts
?? docs/product/reports/V1_TICKET_3_REPORT.md
?? src/odds/
?? supabase/migrations/20260711130000_oddsapi_enums.sql
?? supabase/migrations/20260711130001_bookmaker_registry.sql
?? supabase/migrations/20260711130002_market_registry.sql
?? supabase/migrations/20260711130003_oddsapi_ingestion_runs.sql
?? supabase/migrations/20260711130004_oddsapi_raw_responses.sql
?? supabase/migrations/20260711130005_oddsapi_event_snapshots.sql
?? supabase/migrations/20260711130006_market_snapshots.sql
?? supabase/migrations/20260711130007_market_offerings.sql
?? supabase/migrations/20260711130008_market_offering_raw_rows.sql
?? supabase/migrations/20260711130009_oddsapi_quarantine.sql
?? tests/fixtures/odds/
?? tests/odds/
```

Nothing staged. Nothing committed. No push attempted (no remote configured).

---

## 13. Explicit halt status

- V1-3 implementation is complete; all evidence is captured in this report.
- Nothing has been committed. `git rev-parse HEAD` remains at `5a3175a3c7d8ae6b29f2319e801f36d9e70ae09f`.
- No implementation ticket beyond V1-3 has started. V1-4 depends on both V1-2 and V1-3 per the queue; V1-3 halts for review here.
- Halted for governor review per the ticket's report-and-halt rule.

---

## Addendum: Review Clarifications

(a) The §9 "Assumptions" sentence stating that operators may configure a larger allowlist is **withdrawn**. Any change to `V1_BOOKMAKER_ALLOWLIST` — adding, removing, or reclassifying a bookmaker key — requires a governance decision under GD-9 (four-market and provider scope locked). The generic `ceil(n/10)` arithmetic in `src/odds/quotaForecast.ts:bookmakerRegionEquivalents` does not authorize expansion; it is the arithmetic of the audited billing rule (Odds §13.3–§13.4, §14.6), not an operational permission. The V1 default bundle remains exactly the ten keys enumerated in `src/odds/bookmakerAllowlist.ts:V1_BOOKMAKER_ALLOWLIST`.

(b) Acceptance criterion B ("Exact duplicates collapse only after raw retention") is guaranteed in V1-3 at the **schema-and-contract** level: `market_offering_raw_rows` is the durable retention target with a UNIQUE `(market_snapshot_id, raw_row_index)` constraint and an explicit `disposition` label, and `market_offerings.duplicate_count` is CHECK'd `>= 1`. `src/odds/duplicateCollapse.ts` is documented as ordering the operations correctly (raw rows first, then canonical collapse), and its output shape ensures a caller cannot emit a canonical offering without having enumerated the raw rows. The **executable persistence-time** ordering guarantee — the transactional wire-up that provably writes the raw rows before the canonical offering in every code path — is an explicit V1-4 obligation and will be tested there against a live database, alongside the movement/first-observed persistence that V1-4 owns.

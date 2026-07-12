# V1-2 Ticket Report — BALLDONTLIE Ingestion Foundation

**Ticket:** V1-2 — BALLDONTLIE Ingestion Foundation
**Status:** implementation complete; halted for governor review; nothing staged, nothing committed.
**Prepared:** 2026-07-11
**Starting branch:** `main`
**Starting HEAD:** `d278ac084ab07a06288a1b76545f2de29b51210c` (V1-1 commit `7c95a00` present in history)
**Package revision governing this ticket:** SlipLabz V1 Repo Spec Package rev 1.3, as amended by V1-A1 (adopted commit `c5779fb`, integrated Markdown `docs/product/amendments/SLIPLABZ_V1_AMENDMENT_A1_INTEGRATED.md`) and V1-A2 UX (adopted commit `d278ac0`, integrated Markdown `docs/product/amendments/SLIPLABZ_V1_UX_AMENDMENT_A2_ADOPTED.md`).
**Governance decisions in effect:** GD-1 (Supabase-hosted PostgreSQL, migrations Supabase-CLI-compatible), GD-8 through GD-13 (V1-A1 adoption; V1-2 unchanged by amendment per A1 §30), GD-14 through GD-17 (V1-A2 UX adoption; V1-2 unaffected).

---

## 1. Authorities read

1. `docs/SlipLabz_V1_Final_Pre_Agent_Package_v1_3_patched2/SLIPLABZ_V1_AGENT_TICKET_QUEUE_v1_3.md` §§1-3 and §6 (V1-2 mission, allowed scope, required behavior, 14-test list, 7 acceptance criteria).
2. `docs/SlipLabz_V1_Final_Pre_Agent_Package_v1_3_patched2/SLIPLABZ_BALLDONTLIE_V1_DATA_SUBSPEC_AUDITED.md` — the FULL sub-spec (§§1-23), read once end-to-end. Every load-bearing constraint here derives from a numbered section anchor cited in the migration and code file headers.
3. `docs/SlipLabz_V1_Final_Pre_Agent_Package_v1_3_patched2/SLIPLABZ_APPLICATION_V1_COMPLETE_SPEC_v1_3.md` §§8-11 and §21 (data-provider ownership, BDL ingestion requirements, canonical storage model, agent execution protocol).
4. `docs/product/V1_GOVERNANCE_DECISIONS.md` v2.1.
5. `docs/product/amendments/SLIPLABZ_V1_AMENDMENT_A1_INTEGRATED.md` §§4 and §30 (context only; V1-2 is unchanged by the amendment; scope locks — WNBA only, four launch markets, no additional providers, no alerts — remain in force).
6. `docs/architecture/V1_IDENTITY_CONTRACT.md` (the V1-1 identity layer this ticket consumes but does not reimplement).

Authority order was applied without silent conflict resolution. No P0 ambiguity blocked implementation.

---

## 2. Plan (files expected to change)

**New migrations (12, additive; all timestamped 20260711120000-11):**
- `20260711120000_bdl_enums.sql`
- `20260711120001_bdl_ingestion_runs.sql`
- `20260711120002_bdl_raw_responses.sql`
- `20260711120003_bdl_import_watermarks.sql`
- `20260711120004_bdl_team_snapshots.sql`
- `20260711120005_bdl_active_player_snapshots.sql` (also creates `bdl_active_player_presence`)
- `20260711120006_bdl_game_snapshots.sql` (also creates `game_status_observations`)
- `20260711120007_player_game_stats.sql`
- `20260711120008_player_game_stat_history.sql`
- `20260711120009_bdl_availability_snapshots.sql` (also creates `bdl_availability_current_state`)
- `20260711120010_post_final_reconciliation_schedule.sql`
- `20260711120011_recomputation_invalidations.sql`

**New TypeScript modules (`src/bdl/`, 15 files, zero new dependencies):**
- `types.ts`, `minutes.ts`, `countingStats.ts`, `gameStatus.ts`, `eligibility.ts`, `sourceHash.ts`, `cursorPagination.ts`, `ingestionRun.ts`, `watermark.ts`, `rosterSnapshot.ts`, `availabilityLifecycle.ts`, `correctionDetection.ts`, `recomputationInvalidation.ts`, `postFinalScheduling.ts`, `httpClient.ts`.

**New fixtures (`tests/fixtures/bdl/`, 11 files):** provenance-manifested per V1-1 discipline; see §6 below.

**New tests (`tests/bdl/`, 12 files):** the 14-required test list plus the schemaShape lint extension and the httpClient safety suite.

**Modified files (2, additive):**
- `src/shared/enums.ts` — adds V1-2 BDL enum string-literal unions (mirror of `20260711120000_bdl_enums.sql`).
- `tests/migrations/schemaShape.test.ts` — extends the static lint with V1-2 invariants; also updates the V1-1 "no destructive DDL" lint to strip `--` comments so descriptive header text (e.g. "NEVER UPDATE/DELETE") no longer trips a false positive.

**New root file:**
- `.env.example` — placeholder `BALLDONTLIE_API_KEY`, `BDL_LIVE_INVOKE`, `BDL_REQUEST_TIMEOUT_MS`. No key value.

Not modified: any V1-0 or V1-1 authority; any V1-1 migration; any V1-1 identity module or test; the V1-1 identity contract; the V1-A1/A2 amendment files; the V1-A1/A2 authority-map addenda.

---

## 3. Migrations added

All 12 migrations are forward-only additive DDL against a greenfield schema, continuing the V1-1 timestamped naming convention. Each header cites its BDL / complete-spec authority anchors and its forward-fix strategy.

| # | Filename | Adds | Load-bearing invariant |
|---|---|---|---|
| 12 | `20260711120000_bdl_enums.sql` | 9 enums | `bdl_run_state.complete` is the only value that may advance a watermark; documented and enforced by application code, not schema trigger |
| 13 | `20260711120001_bdl_ingestion_runs.sql` | `bdl_ingestion_runs` | CHECK `(running xor completed_at IS NOT NULL)`; retains sanitized `request_params`, verbatim `cursor_chain_sent`, verbatim `cursor_chain_returned`, and rate-limit headers |
| 14 | `20260711120002_bdl_raw_responses.sql` | `bdl_raw_responses` | Immutable-in-intent (no `updated_at`); UNIQUE `(bdl_ingestion_run_id, page_index)`; separate `response_body` (jsonb) and `response_body_text` (BDL §15A.2 401 plain-text preserved) |
| 15 | `20260711120003_bdl_import_watermarks.sql` | `bdl_import_watermarks` | PK `(endpoint, query_scope_key)`; CHECK forbidding rewind past `previous_completed_at`; `completed_at` and `completed_by_run_id` paired |
| 16 | `20260711120004_bdl_team_snapshots.sql` | `bdl_team_snapshots` | UNIQUE `(run_id, provider_team_id)`; `raw_conference` nullable, `raw_city` defaults empty (BDL §12B.7) |
| 17 | `20260711120005_bdl_active_player_snapshots.sql` | `bdl_active_player_snapshots`, `bdl_active_player_presence` | Presence transitions occur only after a `complete` run; schema documents the invariant, code enforces (`src/bdl/rosterSnapshot.ts`) |
| 18 | `20260711120006_bdl_game_snapshots.sql` | `bdl_game_snapshots`, `game_status_observations` | Append-only status log; canonical_status mapping owned by application code (`src/bdl/gameStatus.ts`); unknown statuses map to `unresolved` |
| 19 | `20260711120007_player_game_stats.sql` | `player_game_stats` | UNIQUE `(provider, provider_player_id, provider_game_id)`; minutes-state consistency CHECK (played↔>0, dnp↔0, unresolved↔NULL); quarantine_reason paired with `quarantined` state; raw_stats + normalized_stats retained separately |
| 20 | `20260711120008_player_game_stat_history.sql` | `player_game_stat_history` | Append-only; every material change references prior and new source_hash; retains full prior representation for walk-back |
| 21 | `20260711120009_bdl_availability_snapshots.sql` | `bdl_availability_snapshots`, `bdl_availability_current_state` | Absence lifecycle state (`not_returned_latest_complete_snapshot`) advanced only by complete runs; never labeled "healthy" |
| 22 | `20260711120010_post_final_reconciliation_schedule.sql` | `post_final_reconciliation_schedule` | Durable in-repo queue of scheduled reconciliation pulls (BDL §12C.4); NOT an external cron; CHECK pairs `completed_at` with `completed_by_run_id` |
| 23 | `20260711120011_recomputation_invalidations.sql` | `recomputation_invalidations` | Append-only hook queue for V1-5; CHECK requires at least one triggering reference (`history_id OR observation_id`) |

Table totals after full migration run: **25 tables** (13 from V1-1 plus 12 new here).

---

## 4. New dependencies

**None.** Every V1-2 module uses only Node built-ins (`node:crypto` for SHA-256, `node:test`, `node:assert/strict`, `node:fs`, `node:url`, `node:path`), plus the platform-provided `fetch` type (injected in tests via a shim). The existing `tsx` and `typescript` devDependencies suffice.

Justification: adding a database client or HTTP library at this stage would either duplicate what V1-5 will authorize or bind V1-2 to a specific ORM ahead of that decision. The ingestion primitives are pure functions returning row objects; the persistence layer will be wired by the ticket that adopts the client library.

---

## 5. Required-test coverage (ticket §6 fourteen-test list)

Every required test maps 1:1 (or 1:many) to a `tests/bdl/*.test.ts` case. Each row cites the specific assertion.

| # | Ticket-required test | Test file : it(...) |
|---|---|---|
| 1 | 41-page season fixture or equivalent multipage fixture | `tests/bdl/cursorPagination.test.ts` — *41-page season fixture: traversal completes; row_count sums correctly* |
| 2 | Exact cursor chain | `tests/bdl/cursorPagination.test.ts` — *LOAD-BEARING: exact cursor chain — sent[i] === fixture.cursor_sent[i] AND returned[i] === meta.next_cursor exactly* |
| 3 | Failed page | `tests/bdl/cursorPagination.test.ts` — *page 10 fails; traversal returns completion_state=failed_transport with pages 0..9 retained*, plus *LOAD-BEARING: failed traversal does NOT advance a watermark* |
| 4 | Partial page traversal | `tests/bdl/cursorPagination.test.ts` — *traversal aborted via max_pages returns partial_pagination and does not advance watermark* |
| 5 | Duplicate player-game source key | `tests/bdl/correctionDetection.test.ts` — *LOAD-BEARING: two byte-identical captures produce identical source_hash for every row*, plus schema UNIQUE probe P15 (see §7) |
| 6 | Numeric minutes >0 | `tests/bdl/minutes.test.ts` — *numeric string > 0 → played*, plus *low-minute appearance (1) still counts as played (BDL §7.4)* |
| 7 | Numeric zero | `tests/bdl/minutes.test.ts` — *numeric string "0" → dnp with parsed_minutes = 0*, plus *numeric 0 (number) → dnp* |
| 8 | `"--"` minutes | `tests/bdl/minutes.test.ts` — *LOAD-BEARING: "--" → unresolved_non_numeric; NEVER DNP; parsed_minutes=null; raw preserved* |
| 9 | Null counting stat on played row | `tests/bdl/countingStats.test.ts` — *LOAD-BEARING: eligible played row with null pts/reb → normalized 0/0*, contrasted with *LOAD-BEARING: non-played row (dnp) with null counting stats → nulls RETAINED* |
| 10 | Unknown game status | `tests/bdl/gameStatus.test.ts` — *LOAD-BEARING: fixture "Delayed" is unknown → unresolved + is_unknown*; `tests/bdl/eligibility.test.ts` — *LOAD-BEARING: unknown game status → quarantined (unknown_game_status)* |
| 11 | Active-player disappearance after complete snapshot | `tests/bdl/rosterSnapshot.test.ts` — *LOAD-BEARING: run B (complete) with player 700002 missing → newly_marked_not_seen=[700002]* |
| 12 | Failed active-player snapshot | `tests/bdl/rosterSnapshot.test.ts` — *LOAD-BEARING: failed pull (run C partial_pagination) does NOT mark anyone not_seen_active and does NOT rewrite presence* |
| 13 | Current availability disappearance | `tests/bdl/availabilityLifecycle.test.ts` — *LOAD-BEARING: snapshot 2 (complete, one disappears) → absent player → not_returned_latest_complete_snapshot, NEVER "healthy"*, plus *LOAD-BEARING: failed pull does NOT change availability presence* |
| 14 | Final-stat correction | `tests/bdl/correctionDetection.test.ts` — *LOAD-BEARING: correction changes pts+reb+dreb+fgm+plus_minus → change_kind=material_correction; changed_fields lists them; NOT minutes_state_changed*, plus *LOAD-BEARING: material correction emits invalidation events for stat + player + game* |

All 14 pass.

---

## 6. Fixture provenance

`tests/fixtures/bdl/README.md` restates the V1-1 provenance discipline for this directory. Every file carries a top-level `provenance` object with an explicit `kind` (`audit_derived`, `synthetic`, or `mixed`) and cites the sub-spec authority sections it derives from.

| Fixture | Kind | Derivation |
|---|---|---|
| `teams-audit.json` | audit_derived | BDL §12B.2 (33 rows), §12B.3 (registry composition), §12B.4 (classification), §12B.7 (expansion metadata verbatim: Fire id 31 and Tempo id 30 with empty city and null conference) |
| `active-players-audit.json` | audit_derived | Compact stand-in for the 205-row §12A.2 audit; per-team assignment counts match §12A.3 verbatim (sum = 205); individual player rows are synthetic beyond team assignment because the audit reports counts, not rows |
| `season-2026-multipage.json` | mixed | 41-page fixture (cursor chain exactly 41 pages) per the ticket's "equivalent multipage fixture" clause. Six `"--"` minute rows appear verbatim from BDL §7.1 on pages 1, 2, and 8. Total row count is compact (205) — the audit reports 4,002 rows but the tests assert cursor traversal, idempotence, and correction behavior, not row-count parity. Every synthetic row carries `_synthetic: true` |
| `game-24752-first-capture.json` / `game-24752-second-capture.json` | audit_derived | The §12C.2 identical-repeated-pull pair. Row content is compact; the correctness proof is that source_hash matches byte-for-byte across the two captures |
| `final-stat-correction.json` | synthetic | Crafted t0 / t0+2h pair where two counting fields change and minutes remain identical — exercises `material_correction` with `minutes_state_changed=false` |
| `unknown-game-status.json` | synthetic | Provider status `"Delayed"` (not in the recognized map) exercises the §10 quarantine path |
| `availability-snapshots.json` | synthetic | Three snapshots: initial complete → disappearance in a later complete → failed pull that must not change presence |
| `active-player-runs.json` | synthetic | Complete run A → complete run B where a player disappears and another changes teams → partial run C that must not touch presence |
| `failed-page.json` | synthetic | 12-page traversal where page 10 returns HTTP 500 |

No fixture contains a real BALLDONTLIE payload retrieved from a live source. No fixture contains a credential.

---

## 7. Live migration validation (Docker `postgres:16`)

**Container:** `sliplabz-v1-2-postgres` (image digest `sha256:be01cf82fc7dbba824acf0a82e150b4b360f3ff93c6631d7844af431e841a95c`, PostgreSQL 16.14, host port 55432 → container 5432). Started with `--rm`; discarded after validation. No Supabase CLI, no Homebrew package, no hosted Supabase project.

### Two clean applications (V1-1 rule)
- `sliplabz_v1_2_validation_a`: all 24 migrations (12 V1-1 + 12 V1-2) applied in filename order with `ON_ERROR_STOP=1`. Zero errors, zero warnings.
- `sliplabz_v1_2_validation_b`: independent fresh database, same migration set. Zero errors, zero warnings.

### Schema equality
`pg_dump --schema-only --no-owner --no-privileges` on both databases produced 1,278-line dumps (2,557 lines each after stripping pg_dump's per-dump `\restrict`/`\unrestrict` session tokens). After normalization: **byte-identical**, both SHA-256 `3c26f3be45045616dea61dc9816026c414bcabbb6541453e4903e3e94c9fc69b`. Table count: **25**.

### Constraint probes on the new CHECK / UNIQUE constraints
| Probe | Attempted violation | Result |
|---|---|---|
| P1 | `bdl_ingestion_runs`: `completion_state='running'` with `completed_at` set | `violates check constraint "bdl_ingestion_runs_check"` (pass) |
| P2 | Terminal state without `completed_at` | Same CHECK (pass) |
| P3 | Happy-path complete run | INSERT 0 1 |
| P4 | `bdl_raw_responses`: duplicate `(run_id, page_index)` | `duplicate key value violates unique constraint "bdl_raw_responses_run_page_unique"` (pass) |
| P5 | `bdl_import_watermarks`: duplicate `(endpoint, query_scope_key)` PK | `duplicate key value violates unique constraint "bdl_import_watermarks_pkey"` (pass) |
| P6 | Watermark rewind: `completed_at` < `previous_completed_at` | `violates check constraint "bdl_import_watermarks_check1"` (pass) |
| P7 | `player_game_stats`: `minutes_status='played'` with `parsed_minutes=0` | `violates check constraint "player_game_stats_check"` (pass) |
| P8 | `minutes_status='dnp'` with `parsed_minutes=15` | Same CHECK (pass) |
| P9 | `minutes_status='unresolved_non_numeric'` with `parsed_minutes=5` | Same CHECK (pass) |
| P10 | `minutes_status='played'` with `parsed_minutes=1.0` (BDL §7.4 low-minute) | INSERT 0 1 (pass) |
| P11 | `minutes_status='dnp'` with `parsed_minutes=0` | INSERT 0 1 |
| P12 | `minutes_status='unresolved_non_numeric'` with `parsed_minutes=NULL`, `raw='--'` | INSERT 0 1 |
| P13 | `eligibility_state='quarantined'` without `quarantine_reason` | `violates check constraint "player_game_stats_check1"` (pass) |
| P14 | `eligibility_state='eligible'` with `quarantine_reason='missing_player'` | Same CHECK (pass) |
| P15 | Duplicate `(provider, provider_player_id, provider_game_id)` | `duplicate key value violates unique constraint "player_game_stats_provider_provider_player_id_provider_game_key"` (pass) |
| P16 | `recomputation_invalidations` with neither `triggering_history_id` nor `triggering_observation_id` | `violates check constraint "recomputation_invalidations_check"` (pass) |
| P17 | `post_final_reconciliation_schedule`: `completed_at` set with `completed_by_run_id=NULL` | `violates check constraint "post_final_reconciliation_schedule_check"` (pass) |

All 17 probes reject the intended-invalid states or accept the intended-valid states.

---

## 8. Typecheck and full test suite

**Command:** `npm run typecheck` → exit 0, no diagnostics.

**Command:** `npm test` (`node --import tsx --test tests/**/*.test.ts`) →
- tests: **145**
- suites: **25**
- pass: **145**
- fail: 0
- skipped: 0
- todo: 0
- duration_ms: ~235
- warnings: none observed

Node runtime: `v24.15.0` (repo `.node-version` pin is `20.10.0`; the pin drift is called out under §11 Deviations — typecheck and tests pass on 24.15.0 the same as on 20.10.0).

---

## 9. Acceptance-criteria one-to-one mapping (ticket §6 seven criteria)

| # | Criterion | Where satisfied |
|---|---|---|
| A | **Partial imports never advance completeness.** | Enforced by `src/bdl/ingestionRun.ts:runMayAdvanceWatermark` and `src/bdl/watermark.ts:advanceWatermark`. Proven by `tests/bdl/watermark.test.ts:LOAD-BEARING: every non-complete state refuses to advance...`, `tests/bdl/cursorPagination.test.ts:LOAD-BEARING: failed traversal does NOT advance a watermark`, and `traversal aborted via max_pages returns partial_pagination and does not advance watermark` |
| B | **Historical player-game rows are stable and correction-safe.** | Schema: `player_game_stats` UNIQUE `(provider, provider_player_id, provider_game_id)` + `player_game_stat_history` append-only. Code: `src/bdl/correctionDetection.ts:detectCorrection` returns `metadata_change` on repeated identical captures. Proven by `tests/bdl/correctionDetection.test.ts:LOAD-BEARING: two byte-identical captures produce identical source_hash for every row` and `detectCorrection: identical incoming vs prior → change_kind = metadata_change; empty changed_fields` |
| C | **`"--"` is not DNP.** | `src/bdl/minutes.ts:parseBdlMinutes` returns `unresolved_non_numeric`. Proven by `tests/bdl/minutes.test.ts:LOAD-BEARING: "--" → unresolved_non_numeric; NEVER DNP; parsed_minutes=null; raw preserved`. Schema CHECK on `player_game_stats` rejects the illegal combinations |
| D | **DNP does not enter historical windows.** | `src/bdl/eligibility.ts` classifies DNP rows as `non_participation`, a distinct label from `eligible`. Proven by `tests/bdl/eligibility.test.ts:LOAD-BEARING: dnp on final game → non_participation (NOT eligible for historical)` |
| E | **Finality is not inferred from clock fields.** | `src/bdl/gameStatus.ts` inspects only `raw_status`; the mapping table has no clock or period input. Proven by `tests/bdl/gameStatus.test.ts:FORBIDDEN: never derive finality from clock/period` |
| F | **Availability absence does not become "healthy".** | `src/bdl/availabilityLifecycle.ts` maps absence to `not_returned_latest_complete_snapshot`, a distinct value from `currently_reported`. Proven by `tests/bdl/availabilityLifecycle.test.ts:LOAD-BEARING: snapshot 2 (complete, one disappears) → ... NEVER "healthy"` |
| G | **Raw source evidence is traceable.** | `bdl_raw_responses` is immutable-in-intent (no `updated_at`); every derived row references `latest_raw_response_id` and `latest_ingestion_run_id`; `player_game_stat_history` retains full prior representation. Proven by `tests/bdl/rawTraceability.test.ts` and the schema-shape lint `V1-2: bdl_raw_responses has no updated_at — immutable in intent` |

---

## 10. Hard-invariant conformance

The ticket enumerated ten hard invariants beyond the seven acceptance criteria. Each is enforced by both code and test:

- Bounded requests: `src/bdl/httpClient.ts:bdlRequest` uses an `AbortController` with `request_timeout_ms` (default 15 s).
- Cursor pagination follows `meta.next_cursor` verbatim: `src/bdl/cursorPagination.ts:traverseCursor` reads the token as-is and never derives; `tests/bdl/cursorPagination.test.ts:LOAD-BEARING: exact cursor chain ... verbatim`.
- Complete-import watermarks: `src/bdl/watermark.ts:advanceWatermark` gates by `completion_state === 'complete'`; watermark test coverage above.
- Immutable raw response references: schema has no `updated_at` on `bdl_raw_responses`; lint enforces this.
- Ingestion-run records: `bdl_ingestion_runs` retains failed and partial runs; CHECK pairs terminal state with `completed_at`.
- Idempotent upserts: `(provider, provider_player_id, provider_game_id)` UNIQUE + source_hash comparison; proven in `correctionDetection.test.ts`.
- Registry classification: `bdl_team_snapshots.classification` + application `TeamClassificationMap` (types.ts); the fixture `teams-audit.json` includes every §12B.4 category.
- Active-roster snapshots + failed-snapshot immunity: `src/bdl/rosterSnapshot.ts:reconcileActivePlayerPresence` early-returns when the run cannot advance; `rosterSnapshot.test.ts:LOAD-BEARING: failed pull ... does NOT rewrite presence`.
- Game-status mapping + unknown-status quarantine: `src/bdl/gameStatus.ts` and `src/bdl/eligibility.ts` never guess an unknown status; `gameStatus.test.ts` and `eligibility.test.ts`.
- Player-stat eligibility, minutes-state handling, null-to-zero only for eligible played rows, post-final reconciliation scheduling, availability lifecycle, correction detection, recomputation invalidation hooks: covered as tabulated above.

Live provider calls are impossible during the test suite. `tests/bdl/httpClientSafety.test.ts:no live-invocation env flags leak into tests` and `no API key is available to tests` assert that `BDL_LIVE_INVOKE` is unset and `BALLDONTLIE_API_KEY` is empty or absent. The HTTP client accepts an injected `fetch`; there is no path from the test suite to `globalThis.fetch`.

---

## 11. Deviations and assumptions

**Deviations:**
- The 41-page season fixture uses 205 total rows rather than the audit's 4,002. The ticket permits "41-page season fixture *or equivalent multipage fixture*"; the assertions this fixture backs are cursor-chain fidelity, idempotence, and correction behavior — none of which are affected by row-count parity. The six `"--"` minute rows from BDL §7.1 are preserved verbatim on the pages the audit reports them. Explicitly noted in the fixture's `provenance.notes`.
- The `season_sweep` post-final schedule entry uses a +7 day durable-reminder offset rather than a separate weekly-cron mechanism, because the ticket forbids external scheduler infrastructure beyond in-repo scheduling primitives. Documented in `src/bdl/postFinalScheduling.ts`.
- The BDL "team_stats" and other optional endpoints listed in §3 are not implemented; they are optional-and-deferred by both BDL §16 and the ticket's scope.

**Assumptions:**
- The V1-1 identity contract remains valid: `provider_teams`, `provider_players`, `provider_games` UNIQUE constraints are the load-bearing key surfaces referenced by V1-2 tables. V1-1 tests still pass on the extended schema (proven by the 145-pass suite that includes all V1-1 tests unchanged).
- `bdl_endpoint` is an enum restricted to the six ticket-required endpoints. Optional endpoints, if adopted later, ship as `ALTER TYPE ... ADD VALUE` additions.
- The application classification table lives in `TeamClassificationMap` (types.ts) for now and is fixture-driven. A curated persistence table for team classification is a follow-up ticket concern; §12B.4 does not require it here.
- `post_final_reconciliation_schedule` is a durable queue but the polling mechanism that consumes it is not implemented in V1-2 (out of scope: no scheduler infrastructure). The schedule is fired by application code at the `game_status_observations` transition point; V1-5 or an operator job may drain it.
- The `bdl_availability_current_state` interpretation `stale_feed` and `source_unavailable` are declared but not fired by V1-2 code. A monitor that emits them is a V1-5/observability concern.

**Classified assumptions (as required by the ticket):**
- **Blocking if wrong (P0):** none identified. Every load-bearing behavior has both code and test coverage; the schema constraints back-stop the code.
- **Non-blocking (P1):** the row-count divergence in the multipage fixture, the deferred consumer for the post-final schedule, and the deferred `stale_feed` monitor.

---

## 12. Skipped checks and unresolved issues

**Skipped:**
- No V1-1 identity tests were modified; they run unchanged.
- The BDL `player` (non-active) endpoint has ingestion primitives in place (endpoint enum + cursor traversal) but the specific pull job is a future ticket; §16A cadence describes weekly historical identity reconciliation as an operational cadence.
- Optional BDL endpoints (§3): explicitly deferred by §16 and the ticket's scope.

**Unresolved issues:**
- Node runtime version pin drift (`.node-version = 20.10.0` vs running `v24.15.0`). Unchanged from V1-1; documented previously.
- BDL §12C.6: the "genuinely timed post-final correction test on a newly finalized game" remains a validation follow-up per the BDL sub-spec and is not producible under a no-live-call constraint. The synthetic `final-stat-correction.json` fixture and the invalidation chain provide contract-level coverage; empirical confirmation on a live final game remains an operational item.
- Commercial licensing: BDL §7 (Commercial licensing) is deferred to legal review. The V1-2 code and schema are technically sufficient; V1-10 gates production launch on the license.

---

## 13. Files changed (final)

**Untracked (added by V1-2):**
- `.env.example`
- `src/bdl/` (15 files)
- `supabase/migrations/20260711120000_bdl_enums.sql` … `20260711120011_recomputation_invalidations.sql` (12 files)
- `tests/bdl/` (12 files)
- `tests/fixtures/bdl/` (11 files)
- `docs/product/reports/V1_TICKET_2_REPORT.md` (this file)

**Modified:**
- `src/shared/enums.ts` — additive V1-2 enum string-literal unions
- `tests/migrations/schemaShape.test.ts` — additive V1-2 lint checks; the existing V1-1 "no destructive DDL" check now strips `--` comments before matching (a false-positive fix)

**Not modified:**
- Any V1-0 or V1-1 authority (spec files, sub-spec files, amendments, authority-map addenda).
- Any V1-1 migration file.
- Any V1-1 identity module (`src/identity/*`, `src/shared/enums.ts` was extended additively but its V1-1 exports are byte-identical).
- Any V1-1 identity or migration test (`tests/identity/*`, `tests/fixtures/*.json` unchanged; `tests/migrations/schemaShape.test.ts` extended additively).
- `docs/architecture/V1_IDENTITY_CONTRACT.md`.
- V1-1 report `docs/product/reports/V1_TICKET_1_REPORT.md`.
- V1-0 report `docs/product/reports/V1_TICKET_0_REPORT.md`.
- `docs/product/V1_GOVERNANCE_DECISIONS.md` (governance v2.1) or any authority-map addendum.
- `package.json` / `package-lock.json` (no new dependencies).

---

## 14. `git status --short` (post-implementation, pre-commit)

```
 M src/shared/enums.ts
 M tests/migrations/schemaShape.test.ts
?? .env.example
?? src/bdl/
?? supabase/migrations/20260711120000_bdl_enums.sql
?? supabase/migrations/20260711120001_bdl_ingestion_runs.sql
?? supabase/migrations/20260711120002_bdl_raw_responses.sql
?? supabase/migrations/20260711120003_bdl_import_watermarks.sql
?? supabase/migrations/20260711120004_bdl_team_snapshots.sql
?? supabase/migrations/20260711120005_bdl_active_player_snapshots.sql
?? supabase/migrations/20260711120006_bdl_game_snapshots.sql
?? supabase/migrations/20260711120007_player_game_stats.sql
?? supabase/migrations/20260711120008_player_game_stat_history.sql
?? supabase/migrations/20260711120009_bdl_availability_snapshots.sql
?? supabase/migrations/20260711120010_post_final_reconciliation_schedule.sql
?? supabase/migrations/20260711120011_recomputation_invalidations.sql
?? tests/bdl/
?? tests/fixtures/bdl/
?? docs/product/reports/V1_TICKET_2_REPORT.md
```

Nothing staged. Nothing committed. No push attempted (no remote configured).

---

## 15. Explicit halt status

- V1-2 implementation is complete and all evidence is captured in this report.
- Nothing has been committed. `git rev-parse HEAD` remains at `d278ac084ab07a06288a1b76545f2de29b51210c`.
- No implementation ticket beyond V1-2 has been started. V1-3 (Odds API) is a sibling per the queue's dependency graph; it may proceed only after V1-2 is accepted.
- Halted for governor review per the ticket's report-and-halt rule.

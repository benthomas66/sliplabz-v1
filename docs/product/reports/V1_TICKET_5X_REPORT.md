# V1-5x Ticket Report — Read-Model Extensions for the Evidence Engine

**Ticket:** V1-5x (RME-1, RME-2, RME-3) per `docs/product/EVIDENCE_PROFILE_METHOD_V1.md` §I.2.
**Kind:** shared computation extension. No engine work, no evidence classifications, no reason codes, no UI. No migrations.
**Starting HEAD:** `efe8fed65760d961fa4b5e91679edfd2a5a4a7fe` — `docs: adopt owner-approved evidence method authority v1.0 (V1-A1-1)`.
**Branch:** `main`. Working tree at ticket start: clean.

---

## 1. Authorities read

- `docs/product/EVIDENCE_PROFILE_METHOD_V1.md` (locked authority, `evidence_method_v1`) — §A input bindings, §C.1 / DR-25, §C.7 / DR-18, §C.9, §I.2 V1-5x prerequisite ruling, DR-23 backfilled-historical inclusion. This document is the **consumer contract**; every field name, type, and semantic delivered here matches the authority's exact naming.
- `docs/architecture/V1_COMPUTATION_CONTRACT.md` §§1–9 — one-owner-per-metric invariant, computation-version vs method-version distinction, backfilled_historical labeling contract, isolation invariants, capability-filter separation.
- `docs/architecture/V1_IDENTITY_CONTRACT.md` §§6, 8 — V1-1 reconciliation-queue vocabulary and precedence. RME-2 reads these queues; V1-1 remains the sole owner of writes.
- `docs/product/V1_GOVERNANCE_DECISIONS.md` v2.1 — GD-8 (no probability/EV/projection), GD-9 (four-market and provider scope locked).

---

## 2. One-to-one RME → consumer line → producer → test map

| RME | Method-authority consumer line | Producer module / field | Proving test |
|---|---|---|---|
| **RME-1** | EVIDENCE_PROFILE_METHOD_V1.md §A.1 row "historical coverage start → `HistoricalCoverageResult.coverage_start_date`"; consumed by §C.1 / DR-25 predicate "≥ 30 days of eligible player-game history" and by §A.4 row "incomplete historical coverage → `ThresholdWindowResult.coverage_label` + `HistoricalCoverageResult.coverage_start_date`". | `src/computation/historicalCoverage.ts` — `HistoricalCoverageResult { internal_player_id, market_key, coverage_start_date: string \| null, eligible_game_count, includes_backfilled_historical, method_version, computation_version }`; readers `computeHistoricalCoverage(...)`, `readHistoricalCoverageForPlayerMarket(db, player_id, market_key)`; DR-25 predicate `satisfiesDR25ThirtyDayCoverage(coverage, today_utc_date)`. | `tests/computation/historicalCoverage.test.ts` (10 assertions across 8 tests — pure aggregation + DR-25 predicate) and `tests/integration/v1_5x_readModelExtensions.integration.test.ts` §"RME-1" (3 live-Postgres tests: MIN-date derivation across (player, market), 29-vs-30-day predicate boundary, empty-history null case). |
| **RME-2** | EVIDENCE_PROFILE_METHOD_V1.md §A.4 rows "unresolved player mapping → `MappingResolutionResult.player_resolved` + `.queue_reason`" and "unresolved event mapping → `MappingResolutionResult.event_resolved`"; consumed by §C.9 "→ Unavailable + `UNRESOLVED_PLAYER_MAPPING` / `UNRESOLVED_EVENT_MAPPING`". | `src/computation/mappingResolution.ts` — `MappingResolutionResult { internal_player_id, internal_game_id, player_resolved: boolean, event_resolved: boolean, queue_reason: string \| null, method_version }`; pure assembler `assembleMappingResolution(...)`; reader `readMappingResolutionForGrain(db, player_id, game_id)`. | `tests/computation/mappingResolution.test.ts` (6 tests including a verbatim vocabulary-reuse proof across all 12 V1-1 queue-reason enum values) and `tests/integration/v1_5x_readModelExtensions.integration.test.ts` §"RME-2" (6 live-Postgres tests: both-resolved default, player-only unresolved, approved-non-open exclusion, event-only unresolved, BOTH-unresolved §C.9 order, read-only guarantee via before/after row-count assertions across 3 identity tables). |
| **RME-3** | EVIDENCE_PROFILE_METHOD_V1.md §A.4 row "one-sided offerings → `CurrentMarketRow.book_detail.one_sided ∈ {'over_only', 'under_only', 'neither'} \| null`"; consumed by §C.7 "→ `C_MA := 0`, cap at Moderate, attach `ONE_SIDED_OFFERING`" (DR-18). | `src/computation/bookDetail.ts` (extends the pre-existing book-detail owner; method_version bumped 1 → 2) — `classifyOneSided(offerings)` pure function; wired through `computeBookDetail(...)` into `BookDetailResult.one_sided`; propagated through `composeCurrentMarketRow`; preserved on capability redaction in `src/computation/capabilityFilter.ts` (truth-not-paywalled per §16.8). | `tests/computation/bookDetailOneSided.test.ts` (10 assertions across 10 tests — enum exhaustive, empty-set null, non-fabrication, two-sided → "neither", composer wiring) and `tests/integration/v1_5x_readModelExtensions.integration.test.ts` §"RME-3" (composer emits correct enum across two-sided, over-only, and empty-offering grains). |

---

## 3. DR-25 and DR-18 satisfiability confirmations

- **DR-25** ("≥ 30 days of eligible player-game history exists"): satisfiable directly from `HistoricalCoverageResult.coverage_start_date` via the module's `satisfiesDR25ThirtyDayCoverage(coverage, today_utc_date)` helper. Whole-day UTC arithmetic; returns `false` when `coverage_start_date === null`. Live-Postgres test `LOAD-BEARING (DR-25): 29 days apart → predicate returns false; 30 days apart → true` proves the boundary condition end-to-end.
- **DR-18** ("only Over OR only Under → `ONE_SIDED_OFFERING`; `C_MA := 0`; cap at Moderate"): satisfiable directly from `CurrentMarketRow.book_detail.one_sided ∈ {'over_only', 'under_only'}`. The engine reads the field verbatim — no evaluated-point relativity is required at the read-model boundary because the grain-level summary suffices for §C.7's branch. Live-Postgres composer test `LOAD-BEARING: composed row carries book_detail.one_sided derived from CurrentOffering[]` proves the field materializes correctly.

---

## 4. Method-authority under-specification and choices recorded

Two spots where the method authority names a field without fully specifying its type. In both cases the narrowest type that satisfies every stated use was chosen; both choices are recorded in the module source (see the file headers of `historicalCoverage.ts` and `mappingResolution.ts`).

1. **`HistoricalCoverageResult.coverage_start_date` — type not specified in authority.** Chosen: **ISO-8601 date string, `YYYY-MM-DD`, UTC-day**, produced by `to_char(games.scheduled_start_utc AT TIME ZONE 'UTC', 'YYYY-MM-DD')`. Rationale: the DR-25 predicate is a whole-day comparison against `today`; a date string keeps the arithmetic timezone-safe and eliminates any timestamp-precision ambiguity that could sit on the 30-day boundary. `null` when no eligible row exists.
2. **`MappingResolutionResult.queue_reason` — composition rule when BOTH `player_resolved` and `event_resolved` are false is not specified.** Chosen: **player queue reason wins**, because §C.9 lists `UNRESOLVED_PLAYER_MAPPING` before `UNRESOLVED_EVENT_MAPPING`. `player_resolved` and `event_resolved` remain independently visible so the engine can attach both reason codes if it chooses; the raw V1-1 enum values (`player_queue_reason`, `event_queue_reason`) are surfaced verbatim without a parallel vocabulary.

---

## 5. Files changed

- **NEW:** `src/computation/historicalCoverage.ts` — RME-1 owner (pure function + DB reader + DR-25 predicate).
- **NEW:** `src/computation/mappingResolution.ts` — RME-2 owner (pure assembler + DB reader).
- **MODIFIED:** `src/computation/bookDetail.ts` — RME-3 addition (`classifyOneSided`, wired into `computeBookDetail`). method_version bumped `1 → 2`.
- **MODIFIED:** `src/computation/types.ts` — added `OneSidedOfferingKind`, `HistoricalCoverageResult`, `MappingResolutionResult`, and extended `BookDetailResult` with `one_sided`.
- **MODIFIED:** `src/computation/computationVersion.ts` — added `historical_coverage: 1`, `mapping_resolution: 1`; bumped `book_detail: 1 → 2`.
- **MODIFIED:** `src/computation/capabilityFilter.ts` — `book_detail` redaction preserves `one_sided` (truth-about-availability per §16.8); redacted marker's `method_version` derives from the registry rather than a hard-coded `1`.
- **NEW:** `tests/computation/historicalCoverage.test.ts` — 9 unit tests (pure aggregation + DR-25 predicate).
- **NEW:** `tests/computation/mappingResolution.test.ts` — 6 unit tests (assembly composition + verbatim vocabulary proof).
- **NEW:** `tests/computation/bookDetailOneSided.test.ts` — 10 unit tests (classifier + composer wiring).
- **NEW:** `tests/integration/v1_5x_readModelExtensions.integration.test.ts` — 10 live-Postgres integration tests across RME-1, RME-2, RME-3.
- **MODIFIED:** `docs/architecture/V1_COMPUTATION_CONTRACT.md` — added RME-1/2/3 rows to the metric ownership table (§1); added backfilled-stance rows for the three new fields (§5); added §9 documenting the V1-5x extensions; renumbered "what this document does not authorize" to §10.
- **NEW:** `docs/product/reports/V1_TICKET_5X_REPORT.md` — this report.

**No migrations added.** The three fields derive from existing storage:
- RME-1 reads `historical_line_results` (already includes both provenances per V1-4b migration 44) joined to `games.scheduled_start_utc`.
- RME-2 reads `player_reconciliation_queue` and `event_reconciliation_queue` (V1-1 migrations).
- RME-3 derives from live `CurrentOffering[]` already assembled by the current-market aggregator.

**No prior migrations were modified.** No `git add . / -A`. No push. No commit.

---

## 6. Evidence

### Typecheck

```
$ npx tsc --noEmit
(clean; no output)
```

### Unit suite

```
$ node --import tsx --test tests/**/*.test.ts
ℹ tests 460
ℹ suites 84
ℹ pass 420
ℹ fail 0
ℹ skipped 40   (integration tests — require SLIPLABZ_DATABASE_URL)
```

The unit suite grew by **25 tests** (9 RME-1 + 6 RME-2 + 10 RME-3). Prior unit tests still pass; no regressions.

### Integration suite (against local Docker Postgres `sliplabz_v1_4b_it`)

```
$ SLIPLABZ_DATABASE_URL=postgres://sliplabz:sliplabz_test_only@127.0.0.1:55432/sliplabz_v1_4b_it npm run test:integration
ℹ tests 40
ℹ suites 12
ℹ pass 40
ℹ fail 0
```

All 40 integration tests pass, including the 10 new V1-5x integration tests (RME-1: 3 tests, RME-2: 6 tests, RME-3: 1 composer wiring test). Prior integration tests still pass; no regressions.

### Live migration validation

**Not required for this ticket.** V1-5x adds no migrations — all three RMEs derive from data already in the V1-4/V1-4b schema. The pre-existing migration-lint suite (`tests/migrations/`) continues to pass without changes.

---

## 7. Hard-invariant compliance

- **One owner per metric** — three new/extended fields each have exactly one owning module in `src/computation/` (see §1 of the computation contract).
- **Current/historical isolation** — RME-1 reads `historical_line_results` only; the query is scoped to that table and joins to `games` for the date. It never touches `market_snapshots` or `current_market_rows` and therefore cannot leak historical rows into current-selection paths. RME-3 derives from the current-only `CurrentOffering[]` already produced by the aggregator (which enforces `CURRENT_ONLY_WHERE_CLAUSE`).
- **No fabrication** — coverage is null when no rows exist; unresolved mapping is unresolved (never auto-approved); a one-sided offering stays one-sided (the missing side is never fabricated). Tests explicitly assert the non-fabrication paths.
- **Version metadata** — every returned shape carries `method_version` (and, for RME-1, `computation_version`) drawn from `computationVersion.ts`, matching the traceability contract in §2.
- **Cross-book grouping (ledger #7)** — RME-3 aggregates strictly at the (`game`, `player`, `market`) grain already established by `composeCurrentMarketRow`; no new cross-book aggregate was introduced.
- **No evidence-engine work** — no scoring, no classifications, no reason-code emission, no thresholds. This ticket delivers the three inputs V1-A1-3 will consume; it stops at the read-model boundary.

---

## 8. Final `git status --short`

```
 M docs/architecture/V1_COMPUTATION_CONTRACT.md
 M src/computation/bookDetail.ts
 M src/computation/capabilityFilter.ts
 M src/computation/computationVersion.ts
 M src/computation/types.ts
?? docs/product/reports/V1_TICKET_5X_REPORT.md
?? src/computation/historicalCoverage.ts
?? src/computation/mappingResolution.ts
?? tests/computation/bookDetailOneSided.test.ts
?? tests/computation/historicalCoverage.test.ts
?? tests/computation/mappingResolution.test.ts
?? tests/integration/v1_5x_readModelExtensions.integration.test.ts
```

All twelve entries are V1-5x deliverables — five modified (types, computation-version registry, book-detail owner, capability filter, computation contract) plus seven new (two owners, three unit tests, one integration test, this report). Nothing else in the working tree changed.

---

## 9. Explicit halt status

Report complete. Nothing staged, committed, or pushed. Zero migrations, zero UI, zero evidence-engine code. All three deliverables are wired end-to-end with unit + integration proof.

HALTED after V1-5x implementation. Nothing committed. The evidence engine has not begun and will not begin without governor approval.

---

## 10. Governor REVISE (2026-07-15) — RME-2 positive-resolution correction

**Defect identified:** The initial RME-2 reader derived `player_resolved` / `event_resolved` from the ABSENCE of an open reconciliation-queue row. That silently reported `resolved:true` for grains that were never mapped, were quarantined, or had a superseded mapping — because "no open queue row" is not the same as "positive approved mapping".

**Correction (`src/computation/mappingResolution.ts` only):**

- Resolution is now read **positively** from V1-1 via
  `EXISTS (SELECT 1 FROM provider_players WHERE internal_player_id = $1 AND mapping_state = 'approved')` and the analogous check on `provider_games`. Migration-05 / migration-06 CHECKs guarantee that `mapping_state = 'approved'` implies the internal id is non-null, so an approved row is by construction a positive mapping.
- The reconciliation queues are consulted ONLY to supply `queue_reason` for grains that fail the positive predicate. **Queue silence never implies resolution; queue noise never un-resolves an approved mapping.**
- When a grain is unresolved and NO queue row references its internal id (never-mapped, quarantined-without-a-queue-row, etc.), `queue_reason` falls back to `'unmatched'` — the truthful vocabulary shape for "no provider record maps to this internal id", present in both `player_queue_reason` and `event_queue_reason` V1-1 enums (migration `20260710190000_enums.sql` lines 76 and 86). **No new reason is invented; the existing V1-1 vocabulary covers every observable unresolved state.**
- Queue selection when a row exists: prefer OPEN over non-open (`ORDER BY (resolution = 'open') DESC`), then oldest for determinism. A quarantined mapping's recorded reason therefore still surfaces to the engine rather than being flattened to `'unmatched'`.
- The pure `assembleMappingResolution` now REFUSES incoherent input: if a caller supplies `resolved=true` with a non-null queue-reason candidate, it throws — the positive predicate is authoritative and the reader is buggy in that shape.

**Assembler-signature change:** `MappingResolutionInput` was reshaped from `{ player_open_queue_reason, event_open_queue_reason }` (queue-first) to `{ player_resolved, event_resolved, player_queue_reason_candidate, event_queue_reason_candidate }` (positive-first). This matches the corrected data flow — resolution is decided from provider_* first; queue reasons are diagnostic-only.

**Tests added / rewritten (governor-required scenarios):**

- Unit tests (`tests/computation/mappingResolution.test.ts`): 6 → 10, including the three fallback-vocabulary cases and an assembler-refuses-incoherent-input assertion.
- Integration tests (`tests/integration/v1_5x_readModelExtensions.integration.test.ts` §RME-2): 6 → 9, adding:
  - `APPROVED provider mappings for both grains → resolved=true, queue_reason=null`
  - `NO provider mapping at all → resolved=false; queue silent → queue_reason='unmatched'`
  - `QUARANTINED player mapping → player_resolved=false even without any open queue row`
  - `QUARANTINED player mapping WITH a non-open queue row → queue_reason reflects the queue's recorded reason`
  - `approved mapping + open queue row that still lists this internal id as a candidate → RESOLVED wins`
  - `both unresolved → player queue reason wins per §C.9`

Both booleans remain independently visible so `V1-A1-3` §C.9 can attach both `UNRESOLVED_PLAYER_MAPPING` and `UNRESOLVED_EVENT_MAPPING` when appropriate.

**Contract update:** `V1_COMPUTATION_CONTRACT.md` §9 RME-2 wording remains accurate as written — it always described resolution against the "V1-1 identity layer's approved provider mappings" and named the queues as diagnostic-only. The corrected reader now matches that description.

**Vocabulary gap check:** confirmed no gap. The union
`{ 'unmatched', 'ambiguous_multiple_candidates', 'ambiguous_alias_conflict', 'missing_event_context', 'missing_team_context', 'normalized_name_only', 'unresolved_provider_team', 'time_window_exceeded', 'ordered_teams_disagree', 'self_match_invalid' }`
covers every observable unresolved-mapping state at the (player, game) grain, with `'unmatched'` serving as the truthful shape for the never-referenced case.

**Evidence after correction:**

- `npx tsc --noEmit` — clean.
- Unit suite — 467 tests, 424 pass, 43 skipped (DB-gated). No regressions.
- Integration suite — 43 tests, all pass (up from 40; +3 corrective RME-2 tests). No regressions.
- **No migrations added.**
- **`src/computation/mappingResolution.ts` is the ONLY module changed by this REVISE**, per the governor directive.

Nothing committed. Nothing pushed. Awaiting governor review.

HALTED after V1-5x mapping-resolution correction. Nothing committed. Awaiting governor review.

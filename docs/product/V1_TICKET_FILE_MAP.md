# V1 Ticket-to-File Map

**Ticket:** V1-0 — Authority and Repo Readback
**Prepared:** 2026-07-10
**Baseline:** Greenfield repository. Every file listed below is a **file to add** rather than a file to modify. The paths below are recommendations, not authority — the implementing agent for each ticket is free to reorganize inside its scope so long as the complete spec §11, ticket queue §1.5, and complete spec §16.5 (two-stage enforcement) invariants are preserved.

Conventions used for suggested paths:

- Monorepo-friendly, framework-agnostic.
- Postgres-backed database (vendor decision deferred — see conflict register P2-3). Migrations placed under `db/migrations/` regardless of vendor.
- Server code under `src/server/`, shared under `src/shared/`, client under `src/app/` in a Next.js-style route layout consistent with UX §2.2.
- Tests colocated under `tests/` mirroring the source tree.
- Fixtures under `tests/fixtures/`.
- Reports under `docs/product/reports/`.

Every ticket must halt after producing its report — no ticket resumes automatically.

---

## Parallelism summary

Serial: V1-0 → V1-1 → { V1-2 || V1-3 } → V1-4 → { V1-4b || V1-5 } → V1-5 → { V1-6 || V1-7 || V1-8 } → V1-9 → V1-10.

- **V1-2 and V1-3** may run in parallel after V1-1 acceptance.
- **V1-4b** may run in parallel with V1-5 through V1-8 after V1-4 acceptance. V1-4b does not block core product construction; it blocks V1-10 acceptance.
- **V1-6, V1-7, and V1-8** may run in parallel after V1-5 acceptance.
- Everything else is sequential.

---

## V1-1 — Canonical Identities and Mapping

### Likely files to add

Migrations (`db/migrations/`):
- `0001_players.sql` — internal `players` table.
- `0002_teams.sql` — internal `teams` table (no UNIQUE on `full_name` or `abbreviation`; nullable conference; empty city allowed).
- `0003_games.sql` — internal `games` table with `scheduled_start_utc` + `actual_start_utc`.
- `0004_provider_players.sql` — `(provider, provider_player_id)` unique; FK to `players`.
- `0005_provider_teams.sql` — `(provider, provider_team_id)` unique; team classification enum column; FK to `teams`.
- `0006_provider_games.sql` — `(provider, provider_game_id)` unique; time delta; mapping state; FK to `games`.
- `0007_player_aliases.sql` and `0008_team_aliases.sql` — versioned alias tables.
- `0009_mapping_state_enum.sql` — mapping/review state enum (`unresolved`, `pending_review`, `approved`, `quarantined`).

Server code (`src/server/identity/`):
- `players.ts`, `teams.ts`, `games.ts` — internal-identity accessors.
- `provider-players.ts`, `provider-teams.ts`, `provider-games.ts` — provider-identity accessors.
- `event-reconciliation.ts` — ordered-teams + commence-time matching (exact / ≤15m unique / queue).
- `player-reconciliation.ts` — reviewed → normalized name + context → alias → manual.
- `name-normalization.ts` — apostrophes, hyphens, diacritics, transliteration; used **only** by matching, never for permanent match.
- `alias-registry.ts` — alias versioning.
- `mapping-audit.ts` — versioned mapping-change history.

Shared code (`src/shared/`):
- `types/identity.ts` — internal ID types, provider-string types (distinct types!).
- `errors/mapping.ts` — quarantine reasons matching BDL §11A.

Tests (`tests/server/identity/`):
- `event-mapping.exact.test.ts`, `event-mapping.tolerance.test.ts`, `event-mapping.ambiguous.test.ts`, `event-mapping.unmatched.test.ts`.
- `player-mapping.exact.test.ts`, `player-mapping.diacritic.test.ts`, `player-mapping.ambiguous.test.ts`, `player-mapping.team-change.test.ts`.
- `provider-id-stability.test.ts`, `idempotent-rerun.test.ts`, `migration-rollback.test.ts`.

Fixtures (`tests/fixtures/identity/`):
- `contemporaneous-slate-2026-07-10.json` — the 6-event WNBA slate from Odds §5 paired with the 205-player active-player audit from BDL §12A.
- `expansion-teams.json` — Portland Fire (id 31) and Toronto Tempo (id 30) with empty city and null conference.
- `placeholder-teams.json` — ids 32 and 33 sharing `TBD` full_name and abbreviation.

### High-risk shared modules

- `mapping-audit.ts` — every later ticket queries mapping state; regressions cascade.
- `name-normalization.ts` — used by V1-3 for Odds API player resolution and V1-8 for Compare Your Line input; single owner critical.

### Report

- `docs/product/reports/V1_TICKET_1_REPORT.md`.

### Parallelism

Fully serial; blocks V1-2 and V1-3.

---

## V1-2 — BALLDONTLIE Ingestion Foundation

### Likely files to add

Migrations:
- `0010_player_game_stats.sql` — includes minutes_status enum, raw + normalized fields, source_hash, correction timestamps, normalization_version.
- `0011_availability_snapshots.sql` — 5-state interpretation enum; observed timestamps.
- `0012_ingestion_runs_bdl.sql` — ingestion-run records (either shared with V1-3 or provider-scoped; recommend a single `ingestion_runs` table with `provider` column, so create it in V1-2 and reuse in V1-3).
- `0013_bdl_watermarks.sql` — complete-import watermarks per endpoint/scope.

Server code (`src/server/providers/balldontlie/`):
- `client.ts` — bounded requests, TLS, redacted logs, content-type-aware error parsing (BDL §15A).
- `pagination.ts` — cursor traversal; never derives cursors.
- `endpoints/players.ts`, `endpoints/active-players.ts`, `endpoints/teams.ts`, `endpoints/games.ts`, `endpoints/player-stats.ts`, `endpoints/player-injuries.ts`.
- `normalizers/minutes.ts` — three-state minutes handling (played / dnp / unresolved_non_numeric).
- `normalizers/counting-stats.ts` — null-to-zero only for eligible played rows; preserves raw.
- `normalizers/teams.ts` — 6-value classification.
- `ingestion/ingestion-run.ts` — run start/complete + watermark advancement.
- `ingestion/post-final-scheduler.ts` — ~final, +2h, +1d, weekly reconciliation.
- `ingestion/correction-detector.ts` — source_hash compare; recomputation invalidation.

Shared code (`src/shared/`):
- `types/bdl.ts`, `enums/bdl-status.ts`, `enums/minutes-status.ts`, `enums/team-classification.ts`.

Tests (`tests/server/providers/balldontlie/`):
- Full list per ticket queue V1-2 required tests: 41-page (or equivalent) fixture, exact cursor chain, failed page, partial-page traversal, duplicate player-game key, numeric minutes >0, numeric 0, `"--"`, null counting on played row, unknown game status, active-player disappearance after complete snapshot, failed active-player snapshot, availability disappearance, final-stat correction.

Fixtures (`tests/fixtures/bdl/`):
- `player-stats-season-2026-partial.json` — subset representative of the 41-page/4,002-row audit.
- `teams-registry.json` — 33-row mixed registry (BDL §12B.3).
- `active-players-2026-07-10.json` — 205-player snapshot (BDL §12A.1).
- `error-400.json`, `error-401-plaintext.txt`.

### High-risk shared modules

- `ingestion/ingestion-run.ts` — shared identity for V1-3.
- `normalizers/minutes.ts` and `normalizers/counting-stats.ts` — every historical calculation depends on them.
- `correction-detector.ts` — invalidation cascades into V1-4 and V1-5.

### Report: `docs/product/reports/V1_TICKET_2_REPORT.md`.

### Parallelism: may run in parallel with V1-3 after V1-1.

---

## V1-3 — Odds API Ingestion Foundation

### Likely files to add

Migrations:
- `0014_odds_ingestion_runs.sql` — reuse `ingestion_runs` created in V1-2 with `request_kind` enum (`current_poll` / `historical_query`); alternatively provider-scoped.
- `0015_market_snapshots.sql` — synthetic `market_snapshot_id` PK; per-run UNIQUE on `(ingestion_run_id, provider_event, source, market)`; `provenance` enum (`self_observed` / `backfilled_historical`); provider_snapshot_at + retrieved_at + current-only observed_at; freshness state; schema-validation state.
- `0016_market_offerings.sql` — per-snapshot identity `(game, player, source, market, point, side)`; offering_state 7-value enum; promotion_type enum (default `unknown`).
- `0017_bookmaker_registry.sql` — configuration-backed bookmaker keys with source_class (`sportsbook` / `dfs_pickem` / `unknown`).
- `0018_odds_freshness_thresholds.sql` — configuration table for fresh/aging/stale thresholds.

Server code (`src/server/providers/odds-api/`):
- `client.ts` — apiKey query param, redacted URL logging, TLS, header capture.
- `endpoints/events.ts`, `endpoints/event-odds.ts`.
- `quota/forecast.ts` — `markets × ceil(bookmaker_count / 10)`.
- `quota/header-reconciler.ts` — `x-requests-last` authoritative; alarm on mismatch.
- `quota/circuit-breaker.ts` — pre-exhaustion halt.
- `normalizers/outcomes.ts` — event → bookmaker → market → outcome shape.
- `dedup/exact-outcome-groups.ts` — group by (event, bookmaker, market, normalized player, side, point, price, last_update).
- `dedup/conflict-quarantine.ts` — materially conflicting duplicates.
- `sources/prizepicks.ts` — synthetic-price flag; null-multiplier promotion=`unknown`.
- `sources/underdog.ts` — one-sided offering handling; multiplier as opaque metadata.
- `freshness/state-machine.ts` — 5-state freshness.
- `ingestion/current-poll.ts` — successful-empty vs failed semantics.
- `ingestion/schema-drift-guard.ts` — HTTP 200 with invalid body → quarantine.

Shared code:
- `enums/request-kind.ts`, `enums/provenance.ts`, `enums/source-class.ts`, `enums/offering-state.ts`, `enums/freshness-state.ts`, `enums/change-type.ts` (used by V1-4).

Tests (`tests/server/providers/odds-api/`):
- All items from ticket queue V1-3 required tests.

Fixtures (`tests/fixtures/odds/`):
- `wnba-events-2026-07-10.json` (the 6 events from Odds §5).
- `event-odds-full-slate.json` — 24-credit total slate.
- `event-odds-prizepicks-only.json` — synthetic `-137` symmetric prices, null multipliers.
- `event-odds-underdog-only.json` — 3 markets returned; multiplier 1.0; over-only Kayla Thornton at 8.5.
- `event-odds-invalid-market-422.json`.
- `event-odds-empty.json` — successful zero-coverage.
- `event-odds-schema-drift.html` — HTTP 200 with wrong body.

### High-risk shared modules

- `market_snapshots` schema — a single mistake here (nullable timestamps in composite key) recreates pre-agent P0-1. Locked pattern; do not vary without governor review.
- `enums/request-kind.ts` and `enums/provenance.ts` — invariants across V1-4, V1-4b, V1-5.
- `sources/prizepicks.ts`, `sources/underdog.ts` — consensus exclusion is enforced here and re-verified in V1-4/V1-5.

### Report: `docs/product/reports/V1_TICKET_3_REPORT.md`.

### Parallelism: may run in parallel with V1-2 after V1-1.

---

## V1-4 — Closing Lines, Movement, and History

### Likely files to add

Migrations:
- `0019_movement_events.sql` — 16 change types; prior/current snapshot refs; detected_at.
- `0020_historical_line_results.sql` — canonical closing point; selection method; source-level closing quote refs; provenance; provider_snapshot_at; O/U/P; margin; coverage state; computation_version.
- `0021_research_window_metrics.sql` — L5/L10/L20/season; eligible_n; average; median; coverage; computation_version.

Server code (`src/server/computation/`):
- `first-observed.ts` — per (event, bookmaker, market, player, point family).
- `current-line.ts` — self-observed + current_poll + fresh; guards against historical rows.
- `close-boundary.ts` — actual-start > scheduled + grace > never abandoned tip; 10-minute close-capture staleness.
- `source-closing-quote.ts` — eligible sportsbook + present in final snapshot + no resurrection.
- `canonical-closing-point.ts` — `single_book` / unique modal / `closing_consensus_unresolved` (excluded).
- `movement.ts` — per (event, bookmaker, market, player) transitions; linked point moves.
- `disappearance.ts` — two consecutive successful omissions.
- `over-under-push.ts` — push excluded from percentages and streak direction.
- `research-windows.ts` — L5/L10/L20/season with actual `n` and coverage labels.
- `recompute-triggers.ts` — hooks from V1-2 correction detector and V1-3 ingestion.

Shared:
- `types/computation.ts`, `types/coverage.ts`.

Tests (`tests/server/computation/`):
- All ticket-queue V1-4 required tests.

Fixtures:
- `close-boundary-actual-start.json`, `close-boundary-postponed.json`, `close-boundary-late-start.json`.
- `single-book-close.json`, `unique-modal-close.json`, `tied-close-unresolved.json`.
- `historical-vs-current-isolation.json` — the assertion that a historical row cannot enter current selection.

### High-risk shared modules

- `canonical-closing-point.ts` — arithmetic median must never appear here.
- `first-observed.ts` — must never be created from a historical query.

### Report: `docs/product/reports/V1_TICKET_4_REPORT.md`.

### Parallelism: sequential after V1-2 and V1-3.

---

## V1-4b — Current-Season Historical Closing-Line Seed

### Likely files to add

Server code (`src/server/providers/odds-api/historical/`):
- `preflight.ts` — coverage & rights confirmation; no fetching if either gate open.
- `endpoints/historical-events.ts` — historical event-ID discovery.
- `endpoints/historical-event-odds.ts` — snapshot-at-close request.
- `seed-runner.ts` — idempotent, resumable; per-slice watermarks.
- `close-capture-validator.ts` — reject snapshots > 10 minutes before close boundary.
- `coverage-report.ts` — per (date, market, source, player) with exclusion reasons.
- `forward-only-disposition.ts` — reviewed disposition when a slice is unsupported/unapproved.

Migrations: none if V1-3/V1-4 already introduced `historical_query` request_kind + `backfilled_historical` provenance + `provider_snapshot_at`. Otherwise, adjust upward.

Tests (`tests/server/providers/odds-api/historical/`):
- All ticket-queue V1-4b required tests, including quota reconciliation, close_capture_stale, and no-resurrection.

Fixtures:
- `historical-events-response.json`.
- `historical-event-odds-clean.json` — 40-credit response.
- `historical-event-odds-stale.json` — snapshot > 10m before close.
- `historical-event-odds-absent-line.json` — line removed before close; must remain excluded.

### High-risk shared modules

- `seed-runner.ts` — must be idempotent + resumable; violating this risks partial state that later appears as complete.
- `close-capture-validator.ts` — bypassing this violates spec §7.10.1.

### Report: `docs/product/reports/V1_TICKET_4B_REPORT.md`.

### Parallelism

May run in parallel with V1-5, V1-6, V1-7, V1-8 after V1-4 acceptance. V1-10 requires an approved V1-4b disposition; V1-9 does not.

---

## V1-5 — Shared Computation and Read Model

### Likely files to add

Migrations:
- `0022_current_market_rows.sql` — materialized/derived per (game, player, market).

Server code (`src/server/read-model/`):
- `current-market-row.ts` — consensus, range, exact-point counts, eligible sportsbook count, current source rows, freshness, first_observed_consensus, movement summary.
- `research-window-view.ts` — L5/L10/L20/season with coverage labels.
- `threshold-window-view.ts` — user-entered threshold calculations (used by V1-8).
- `read-path.ts` — protected server-side entrypoint used by both the app and the Brief; enforces server-side capability filtering against injected/fixture entitlement.
- `methodology-metadata.ts` — versioned methodology + computation version references.
- `entitlement/capability-filter.ts` — pre-V1-9: reads a fixture/injected entitlement. Real Stripe/account/protected-API enforcement is V1-9.

Shared: `types/capability.ts`, `types/read-model.ts`.

Tests: consensus across sportsbook points, price comparison at exact point/side, stale exclusion, DFS exclusion, partial window, push, Brief/app equality, unauthorized client response, normalization-version change.

Fixtures: capability fixtures for anonymous / free / paid / internal-admin / complimentary; deterministic scenarios (not client-only placeholders).

### High-risk shared modules

- `read-path.ts` — every product surface consumes this. If a metric gets computed anywhere else, V1's "one owner per metric" invariant is violated.
- `entitlement/capability-filter.ts` — the injection point for V1-9's real enforcement.

### Report: `docs/product/reports/V1_TICKET_5_REPORT.md`.

### Parallelism: sequential after V1-4.

---

## V1-6 — Today's Props Board

### Likely files to add

Client (`src/app/app/board/`):
- `page.tsx` — desktop table + mobile card fallback per UX §5, §6.
- `components/BoardTable.tsx`, `components/BoardRow.tsx`, `components/BookExpansion.tsx`, `components/MobileResearchCard.tsx`.
- `components/FilterBar.tsx`, `components/SortControl.tsx`, `components/ColumnPicker.tsx`.
- `components/FreshnessLabel.tsx`, `components/AvailabilityNote.tsx`, `components/CoverageLabel.tsx`.
- `components/RowDrawer.tsx` — 40–48% viewport width per UX §5.9.
- `state/filters.ts`, `state/scroll-position.ts` — route-preserved.

Server:
- `src/server/api/board.ts` — reads V1-5 read model; enforces preview limits via capability filter.

Shared components (`src/shared/ui/`) — start of the design-system inventory in UX §17: `PrimaryButton`, `SecondaryButton`, `TextLink`, `SearchInput`, `Select`, `SegmentedControl`, `FilterButton`, `FilterBottomSheet`, `InlineNotice`, `EmptyState`, `ErrorState`, `PaywallState`, `SkeletonRow`, `GlobalHeader`, `MobileBottomNav`, `AccountMenu`.

Tests (`tests/server/api/board/` + `tests/e2e/board/`): full slate, empty slate, stale source, unresolved player, one eligible book, no consensus, preview anti-enumeration (against fixture entitlement), mobile layout, keyboard nav, return-state preservation.

Fixtures: full-slate free preview, full-slate paid, mixed freshness states.

### High-risk shared modules

- `src/shared/ui/*` — every surface reuses these; UX §23.3 requires reuse over creation.
- `src/server/api/board.ts` — enumeration risk if capability filtering is bypassed.

### Report: `docs/product/reports/V1_TICKET_6_REPORT.md`.

### Parallelism: may run in parallel with V1-7 and V1-8 after V1-5.

---

## V1-7 — Prop Research View and Player Pages

### Likely files to add

Client (`src/app/app/research/[game]/[player]/[market]/`):
- `page.tsx` — two-column desktop per UX §7.2; mobile order per UX §7.10.
- `components/MarketSummary.tsx`, `components/BookGrid.tsx`, `components/PickemGrid.tsx`, `components/MovementTimeline.tsx`, `components/MovementEventLog.tsx`, `components/HistoricalGameTable.tsx`, `components/HistoricalWindowTable.tsx`, `components/ResultDistribution.tsx`.

Client (`src/app/app/players/[player]/`):
- `page.tsx` — Player Page per UX §9.
- `components/PlayerHeader.tsx`, `components/CurrentPropsList.tsx`, `components/GameLogTable.tsx`, `components/MarketTabs.tsx`, `components/OpponentHistory.tsx`, `components/AvailabilityTimeline.tsx`.

Client (`src/app/app/brief/`):
- `page.tsx` — editorial Brief per UX §10.

Server:
- `src/server/api/research.ts` — read V1-5 read model per (game, player, market).
- `src/server/api/player.ts` — read V1-5 read model per player.
- `src/server/api/brief.ts` — deep-link + shared-metric consumption.

Tests: multiple sportsbook points, stale book, one-sided sportsbook, PrizePicks separate, no real-line history, incomplete L10, availability missing, unresolved opponent history, Brief deep link.

Fixtures: historical rows with `single_book`, `unique modal`, and `closing_consensus_unresolved` coverage states.

### Report: `docs/product/reports/V1_TICKET_7_REPORT.md`.

### Parallelism: may run in parallel with V1-6 and V1-8 after V1-5.

---

## V1-8 — Compare Your Line

### Likely files to add

Client (`src/app/app/compare/`):
- `page.tsx` — centered narrow flow per UX §8.2.
- `components/CompareForm.tsx`, `components/CompareResult.tsx`, `components/DifferenceLabel.tsx`, `components/ThresholdWindowTable.tsx`, `components/WatchButton.tsx`.

Server:
- `src/server/api/compare.ts` — validated input; threshold-window calculation via V1-5 read model.
- `src/server/api/watches.ts` — watch CRUD; provisional fixture-based limits pre-V1-9.

Migration:
- `0023_watches.sql` — watched-line records with player, market, entered_line, movement_threshold, delivery state.

Tests: line above/below/equal to consensus, no consensus, no current books, insufficient history, push, invalid input, unsupported market, free usage limit (fixture value), saved paid watch.

### Report: `docs/product/reports/V1_TICKET_8_REPORT.md`.

### Parallelism: may run in parallel with V1-6 and V1-7 after V1-5.

---

## V1-9 — Pricing, Entitlement, and Brief Delivery

### Likely files to add

Migrations:
- `0024_users.sql`, `0025_customers.sql`, `0026_subscriptions.sql` — account states per §17.1 (all nine).
- `0027_stripe_events.sql` — idempotency keys; out-of-order safe.
- `0028_entitlements.sql` — server-authoritative capability grants.
- `0029_usage_counters.sql` — Compare Your Line + preview enumeration counters.
- `0030_delivery_lists.sql` — Brief delivery synchronization.
- `0031_audit_logs.sql` — payment / cancellation / restore / entitlement change history.

Server:
- `src/server/auth/` — anonymous, free-registered, active-paid, complimentary, past-due, canceled-through-period, expired, refunded, internal-admin.
- `src/server/billing/stripe-client.ts`, `webhook-handler.ts`, `products.ts` — one product/price at $7.99/month; idempotent; out-of-order safe.
- `src/server/entitlement/authority.ts` — replaces V1-5's fixture with real entitlement.
- `src/server/entitlement/usage-counters.ts` — anti-enumeration.
- `src/server/api/protected/*` — protected APIs for paid data.
- `src/server/brief-delivery/` — vendor client (Resend or governor-decided), list sync, add/remove.

Client:
- `src/app/app/account/` — account page (plan, billing, email delivery, watches, preferences, sign out) per UX §16.1.
- `src/app/pricing/page.tsx` — one clear paid plan per UX §15.8.
- `src/app/app/board/components/PaywallState.tsx` (extension) — upgrade prompt after preview limit reached.

Tests: displayed and charged price is $7.99/month; free Board preview enforced against real accounts; free Compare limit enforced; paid full Board + book grid + history + movement; direct API attempt by free user rejected; first purchase; duplicate webhook; out-of-order webhook; canceled-through-period; failed renewal; refund; complimentary; expired; direct protected API request rejected; Brief delivery add/remove.

### High-risk shared modules

- `src/server/entitlement/authority.ts` — flips capability filtering from fixtures to real accounts. Regression here can silently expose paid data.
- `src/server/billing/webhook-handler.ts` — idempotency and out-of-order behavior are load-bearing.

### Report: `docs/product/reports/V1_TICKET_9_REPORT.md`.

### Parallelism: sequential after V1-6, V1-7, V1-8.

---

## V1-10 — Release Hardening

### Likely files to add

Drills & audits (`tests/drills/`):
- `provider-outage.drill.ts`, `stale-state.drill.ts`, `successful-empty.drill.ts`, `schema-drift.drill.ts`, `quota-circuit-breaker.drill.ts`, `payment-lifecycle.drill.ts`.
- `accessibility.audit.ts` — keyboard, screen reader, contrast AA, reduced motion.
- `responsive.audit.ts` — breakpoint QA per UX §18.
- `performance.test.ts` — full WNBA slate.
- `forbidden-copy.scan.ts` — automated scan of forbidden framings (§18.1; UX §21.3).

Reports (`docs/product/reports/`):
- `V1_TICKET_10_REPORT.md`.
- `V1_RELEASE_CHECKLIST.md`.
- `V1_PROVIDER_RIGHTS_DISPOSITION.md`.
- `V1_SEED_DISPOSITION.md` — either successful V1-4b seed or reviewed forward-only disposition.

### Parallelism: strictly serial; final gate.

---

## Cross-ticket high-risk shared modules

| Module | Owning ticket | Consumed by |
|---|---|---|
| `db/migrations/*` | V1-1..V1-9 | All later phases |
| `enums/request-kind.ts`, `enums/provenance.ts` | V1-3 | V1-4, V1-4b, V1-5 |
| `enums/change-type.ts` | V1-3 | V1-4 |
| `mapping-audit.ts` | V1-1 | Every later ticket |
| `name-normalization.ts` | V1-1 | V1-3, V1-8 |
| `market_snapshots` schema | V1-3 | V1-4, V1-4b, V1-5 |
| `canonical-closing-point.ts` | V1-4 | V1-4b, V1-5, V1-6, V1-7 |
| `read-path.ts` | V1-5 | V1-6, V1-7, V1-8, V1-9 |
| `entitlement/capability-filter.ts` | V1-5 (stub) | V1-9 (real) |
| `src/shared/ui/*` | V1-6 | V1-7, V1-8, V1-9 |
| `billing/webhook-handler.ts` | V1-9 | V1-10 payment lifecycle drill |

---

## Dependency-driven ordering (repeat, for scan-ability)

- V1-0 → V1-1 → { V1-2 || V1-3 } → V1-4 → { V1-4b (long-running, non-blocking) || V1-5 } → V1-5 → { V1-6 || V1-7 || V1-8 } → V1-9 → V1-10.
- V1-10 acceptance additionally requires an approved V1-4b disposition (compliant seed or forward-only), the closed provider-rights gate, and passing the four validation gates: repeated-snapshot, post-final BDL correction, cross-provider mapping, and historical WNBA-prop coverage preflight.

# V1 Gap Matrix

**Ticket:** V1-0 — Authority and Repo Readback
**Prepared:** 2026-07-10
**Baseline:** Greenfield repository (see `docs/architecture/V1_CURRENT_STATE_READBACK.md`).

Classifications used (from Ticket 0 §H):

- **Exists and conforms** — implementation exists and matches authority.
- **Exists but needs adaptation** — implementation exists and diverges but can be adjusted within ticket authority.
- **Missing** — no implementation.
- **Conflicts with authority** — implementation would need to be reversed or replaced.
- **Blocked by decision** — a governance decision is required before build.
- **Blocked by legal gate** — provider-rights or licensing approval is required.
- **Blocked by validation gate** — an open validation observation is required.

Because the repo is greenfield, every code-level line below is **Missing** unless it is subject to an open decision, validation, or legal gate.

---

## V1-1 — Canonical Identities and Mapping

| Required capability | Authority | Status | Notes |
|---|---|---|---|
| Internal player IDs (`players`) | Spec §7.1, §11.1 | Missing | Clean creation. |
| Internal team IDs (`teams`) | Spec §11.1; BDL §12B | Missing | Must not require nonempty city, must allow null conference, no UNIQUE on `full_name` or `abbreviation` (BDL §12B.5, §12B.7). |
| Internal game IDs (`games`) | Spec §7.2, §11.1 | Missing | Store canonical scheduled_start_utc and actual_start_utc separately (§7.10). |
| Provider identity tables (`provider_players`, `provider_teams`, `provider_games`) | Spec §11.1 | Missing | Enforce (provider, provider_*_id) uniqueness. |
| Reviewed alias tables (`player_aliases`, `team_aliases`) | Ticket queue V1-1 | Missing | Version aliases; used in mapping order (Spec §7.3). |
| Mapping / review state (`mapping_state`) | Spec §11.1 | Missing | Include `unresolved`, `pending_review`, `approved`, `quarantined`. |
| Event reconciliation queue | Spec §7.2; Odds §6, §7 | Missing | Ordered-teams + commence-time match with 15-minute tolerance when unique; otherwise queue. |
| Player reconciliation queue | Spec §7.3; BDL §12A.6; Odds §10.11 | Missing | Reviewed mapping → normalized name + event/team context → alias → manual. |
| No name-only permanent matching | Spec §7.3 | Missing | Enforce at schema and code level. |
| Ordered team + time-aware game matching | Spec §7.2 | Missing | |
| Versioned mapping changes | Spec §7 (implicit); BDL §22 | Missing | Aliases have `alias_version`; mapping tables retain change history. |
| Raw provider strings retained | Spec §11.1; BDL §12A.7, §12B.10 | Missing | |
| Migrate existing FKs safely | Ticket queue V1-1 | N/A (no existing FKs) | Clean creation — clause inert. |
| Complete contemporaneous event-mapping fixture | Ticket queue V1-1 acceptance | Missing | Fixture must map or quarantine deterministically. |
| Rollback / forward-fix migration safety | Spec §21.4 | Missing | Establish migration tool & convention at V1-1. |

---

## V1-2 — BALLDONTLIE Ingestion Foundation

| Required capability | Authority | Status | Notes |
|---|---|---|---|
| Adapter with server-side secrets, redacted URLs, TLS on | BDL §3A; Spec §20.1 | Missing | |
| Cursor traversal (per_page=100, follow `meta.next_cursor` exactly) | BDL §5; Spec §9.2 | Missing | Never derive cursors. |
| Teams ingestion (all 33 rows, then classify) | BDL §12B; Spec §9.7 | Missing | 6-value classification enum (§12B.4). |
| Players (historical registry) | BDL §3, §3B | Missing | |
| Active players (daily snapshot) | BDL §12A | Missing | Absence must not delete a player (§12A.4). |
| Games (schedule + finality) | BDL §10; Spec §9.6 | Missing | Do not infer finality from clock/period. |
| Player stats (backfill + reconciliation) | BDL §12C | Missing | Idempotent upsert on (provider, provider_player_id, provider_game_id). |
| Player injuries / availability | BDL §13, §20; Spec §9.10 | Missing | 5-state interpretation enum. |
| Ingestion-run records | BDL §19.1 | Missing | Only complete when every page succeeds, chain matches, no next_cursor, row validation passes. |
| Immutable raw response references | Spec §21.6; BDL §14 | Missing | Raw payload never discarded on parse failure. |
| Complete-import watermarks | BDL §19.4 | Missing | Partial import may not advance watermark. |
| Idempotent upserts | Spec §21.5; BDL §12C.4 | Missing | |
| Team registry classification (6 values) | BDL §12B.4 | Missing | |
| Active-roster snapshots | BDL §12A.7 | Missing | first-seen-active, last-seen-active, `not_seen_active` state without deletion. |
| Game-status mapping | BDL §10 | Missing | |
| Player-stat eligibility (final + numeric minutes > 0 + normalized stat + no quarantine) | BDL §8, §14.1 | Missing | |
| Minutes-state handling (played / dnp / unresolved_non_numeric) | BDL §7 | Missing | `"--"` is not DNP. |
| Null-to-zero normalization for eligible played rows only | BDL §9 | Missing | Preserve raw. |
| Post-final reconciliation scheduler (~final, +2h, +1d, weekly) | Spec §9.9; BDL §12C.4 | Missing | |
| Availability lifecycle states (5 values) | BDL §20 | Missing | Disappearance never reads as recovery. |
| Source correction detection | BDL §12C.5 | Missing | Material changes recompute dependents. |
| Recomputation invalidation hooks | Spec §12.2 | Missing | Wired to V1-4 and V1-5 outputs. |
| Failure isolation (partial pagination watermarks, failed availability, failed roster, failed status refresh) | Spec §15.3; BDL §19.1 | Missing | |
| Error response handling (400 JSON body vs 401 plain-text; 429/500/503 documented but unobserved) | BDL §15A | Missing | Content-type aware parsing required. |
| Rate-limit metadata retention (from success **and** error responses) | BDL §15A.4 | Missing | |
| **Post-final correction validation** | BDL §12C.6, §23.2; Spec §26.2 | **Blocked by validation gate** | Rev 1.3 audit item — non-blocking for V1-2; blocking for V1-10 acceptance. |
| **Commercial rights (BDL)** | BDL §23.3; Spec §2.3 | **Blocked by legal gate** | Non-blocking for build; required for customer-facing launch. |

---

## V1-3 — Odds API Ingestion Foundation

| Required capability | Authority | Status | Notes |
|---|---|---|---|
| Adapter with `apiKey` as query param, redacted logs, no client exposure | Odds §14.1, §22; Spec §20.1 | Missing | |
| Event discovery (`/v4/sports/basketball_wnba/events`) — free | Odds §7, §14.2; Spec §10.1 | Missing | May refresh independently of paid polling. |
| Event odds (`/v4/sports/basketball_wnba/events/{eventId}/odds`) | Odds §14.3; Spec §10.2 | Missing | Use explicit `bookmakers`, not `regions=us` (§10.3, Odds §13.5). |
| Explicit bookmaker allowlist (8 sportsbooks + PrizePicks + Underdog) | Spec §10.3; Odds §13.4, §18.1 | Missing | Keep to ≤10 keys unless deliberately budgeted (Odds §21). |
| Four launch markets | Spec §6.1 | Missing | |
| Quota forecasting (`markets × ceil(book_count / 10)`) | Spec §10.9; Odds §13.8 | Missing | Response header `x-requests-last` authoritative. |
| Quota header reconciliation with alarms | Odds §13.8, §21 | Missing | Circuit breaker before exhaustion. |
| Raw market snapshots | Spec §11.4; Odds §15.1 | Missing | |
| Normalized outcome rows (`(event, bookmaker, market, player, point, side)`) | Odds §15.3 | Missing | |
| Exact duplicate handling (BetRivers-style equivalent groups) | Spec §10.5; Odds §10.8 | Missing | Preserve raw refs; emit one canonical observation. |
| Conflicting duplicate quarantine | Spec §10.5; Odds §10.8 | Missing | |
| Source classification (`sportsbook` / `dfs_pickem` / `unknown`) | Spec §10.4 | Missing | |
| PrizePicks treatment (excluded from sportsbook consensus; synthetic `-137`; null multiplier; promotion `unknown` unless proven) | Spec §10.7; Odds §11 | Missing | |
| Underdog treatment (excluded from sportsbook consensus; one-sided offerings valid) | Spec §10.8; Odds §12 | Missing | |
| Successful empty vs failed poll semantics | Spec §10.10; Odds §16.1, §19.3 | Missing | Empty success stores zero-coverage; failed poll preserves last valid snapshot. |
| Provisional cadence | Spec §10.11; Odds §19.1 | Missing | Configurable. |
| Provisional freshness (fresh ≤10m, aging ≤30m, stale >30m, failed-latest-poll separate) | Spec §10.12; Odds §19.2 | Missing | |
| One-sided offerings preserved | Odds §12.6 | Missing | |
| Multi-line preservation | Odds §11.6, §12.8, §16.2 | Missing | |
| Schema-drift quarantine | Spec §15.6; Odds §20 | Missing | Retain raw body; alert; do not overwrite prior current state. |
| `market_snapshots` with synthetic PK + per-run UNIQUE on `(ingestion_run_id, provider_event, source, market)` | Spec §11.4; Odds §15.2; pre-agent audit P0-1 | Missing | **Locked** — do not use nullable timestamp in composite key. |
| `provenance` = `self_observed` on all current polls | Spec §11.4; Odds §15.2 | Missing | |
| **Repeated-snapshot validation** | Spec §26.1; Odds §17, §23.2 | **Blocked by validation gate** | Refines removal + freshness thresholds; not blocking for V1-3 build. |
| **Commercial rights (Odds)** | Odds §23.3; Spec §2.3 | **Blocked by legal gate** | Non-blocking for build; required for customer-facing launch. |

---

## V1-4 — Closing Lines, Movement, and History

| Required capability | Authority | Status | Notes |
|---|---|---|---|
| First observed (per event/bookmaker/market/player/point) | Spec §7.8, §13.4; Odds §16.3 | Missing | Never labeled "opening" without explicit provider evidence. |
| Current observation selection (fresh, self-observed, current_poll) | Spec §7.9; Odds §16.1 | Missing | Historical rows structurally excluded. |
| Final observed pregame | Spec §13.4; Odds §16 | Missing | |
| Close boundary (verified actual start > scheduled tip + grace > never abandoned tip) | Spec §7.10 | Missing | 10-minute close-capture staleness rule (§7.10.1). |
| Postponed-game handling | Spec §15.5 | Missing | No close against abandoned tip. |
| Movement events (16 change types) | Spec §13.1; Odds §17 | Missing | Point move = removed + added, linked when unambiguous. |
| Source additions/removals | Spec §13.1 | Missing | |
| Line additions/removals | Spec §13.1 | Missing | |
| Point movement | Spec §13.2 | Missing | |
| Price movement | Spec §13.1 | Missing | |
| Confirmed-removal policy (two consecutive successful omissions) | Spec §13.3; Odds §17 | Missing | Threshold provisional pending §26.1 gate. |
| Source-level closing quotes | Spec §7.10.1 | Missing | |
| **Canonical observed closing-point selection** (single_book / unique modal / unresolved-if-tied) | Spec §7.10.2; Odds §18.4 | Missing | **P0 correction from pre-agent audit — do not introduce arithmetic median.** |
| Historical closing-line results | Spec §11.5, §14.2 | Missing | |
| Explicit provenance + current/historical isolation | Spec §11.4, §12.1; Odds §14.11.3 | Missing | Guarded at query and computation. |
| Over/Under/Push grading | Spec §7.12, §14.4 | Missing | Push excluded from percentages; excluded from streak direction. |
| Real-line L5/L10/L20/season windows | Spec §7.13, §14.3 | Missing | Actual `n` always shown. |
| Coverage labels (incomplete window, single_book, closing_consensus_unresolved) | Spec §7.13 | Missing | |
| Actual sample size | Spec §7.13, §14.3 | Missing | |
| Correction recomputation (BDL correction → dependent metric invalidation) | Spec §12.2 | Missing | Wired to V1-2 outputs. |

---

## V1-4b — Current-Season Historical Closing-Line Seed

| Required capability | Authority | Status | Notes |
|---|---|---|---|
| Historical event-ID discovery via historical events endpoint | Spec §10.13; Odds §14.11.1 | Missing | Not from current event discovery. |
| Map historical events to internal/BDL games | Spec §7.2 | Missing | |
| Historical event-odds request at canonical close boundary | Spec §10.13; Odds §14.11.1 | Missing | Reject snapshots >10m before close (`close_capture_stale`). |
| Only canonical final games + conventional sportsbook keys | Spec §3.6 | Missing | DFS/pick'em excluded from historical sportsbook metrics. |
| Historical quota forecast `10 × markets × region-equivalents × events` (40/event default) | Spec §10.13; Odds §14.11.2 | Missing | Response header authoritative. |
| Store `provider_snapshot_at` separately from `retrieved_at` | Spec §7.10; Odds §14.11.3 | Missing | |
| Mark request_kind `historical_query`, provenance `backfilled_historical` | Spec §11.4 | Missing | |
| Historical rows never enter current selection, first-observed, or movement | Spec §11.4, §12.1; Odds §14.11.3 | Missing | Structural + query guards. |
| No walking backward to resurrect removed offerings | Spec §3.6; Odds §14.11.1 | Missing | |
| Idempotent, resumable seed runs with per-slice coverage watermarks | Ticket queue V1-4b | Missing | |
| Coverage-and-rights disposition (compliant seed OR reviewed forward-only) | Spec §3.6, §26.4 | Missing | Required for V1-10; not for build. |
| **Historical WNBA player-prop coverage preflight by market/sportsbook** | Odds §14.11 | **Blocked by validation gate** | Non-blocking for V1-4b start; determines seed scope. |
| **Commercial rights for retention & display of purchased historical snapshots** | Spec §2.3, §3.6; Odds §14.11 | **Blocked by legal gate** | Non-blocking for core build; blocking for actual seeding. |
| Existing local historical data reusable? | Prompt §D.1 | Missing (none present) | See readback §D.1: no local historical data survived; use fresh pulls if gates close. |

---

## V1-5 — Shared Computation and Read Model

| Required capability | Authority | Status | Notes |
|---|---|---|---|
| Canonical `current_market_rows` (line consensus, range, distribution, eligible sportsbook count, current source rows, freshness, first_observed_consensus, movement) | Spec §11.5 | Missing | |
| Research window metrics (per player/market/reference_date/window_type) | Spec §11.5 | Missing | |
| Brief/app shared computation | Spec §1.2, §5.5, §12.1 | Missing | One owner per metric; identical outputs. |
| Protected server-side read path (server-side capability filtering) | Ticket queue §1.5, V1-5 acceptance | Missing | Pre-V1-9 uses injected/fixture entitlement; V1-9 wires real accounts. |
| Methodology metadata (methodology_version, computation_version) | Spec §12.3 | Missing | |
| Recalculation triggers | Spec §12.2 | Missing | |
| Source traceability | Spec §20.2 | Missing | Every derived value traces to provider/raw/ingestion_run/normalized/computation_version. |
| No paid-data leakage in server responses | Spec §16.7 | Missing | Test with unauthorized client fixture. |

---

## V1-6 — Today's Props Board

| Required capability | Authority | Status | Notes |
|---|---|---|---|
| Board layout (desktop + mobile card fallback, sticky header, sticky first column) | UX §5, §6, §5.11 | Missing | |
| One row per (game, player, market) | Spec §5.1, §7.5 | Missing | |
| Player/matchup context (name, team abbr, opponent, H/A, scheduled time) | Spec §5.1; UX §5.4 | Missing | |
| Consensus display (median + range) | UX §5.5 | Missing | |
| Line range | Spec §5.1 | Missing | |
| Point distribution | Spec §5.1 | Missing | |
| Eligible book count | Spec §5.1 | Missing | |
| First-observed movement (compact) | Spec §5.1; UX §5.7 | Missing | Neutral notation, no green/red. |
| Freshness/status | Spec §5.1; UX §5.8 | Missing | 5-state (fresh/aging/stale/latest-poll-failed/unavailable). |
| Availability context | Spec §5.1 | Missing | |
| Real-line windows (L5, L10, L20, season) with actual `n` | Spec §5.1, §7.13; UX §5.6 | Missing | Neutral text. |
| Search (player, team, alias) | UX §11 | Missing | |
| Filters (game, team, market, book count, freshness, advanced) | Spec §5.1; UX §12 | Missing | |
| Sorting on approved columns (never default rank by desirability) | UX §12.2 | Missing | |
| Book expansion (right drawer desktop; full page mobile) | UX §5.9, §5.10, §6.4 | Missing | Sportsbook vs pick'em visually separated. |
| Route-preserved state | Spec §5.1; UX §5.11, §12.3 | Missing | |
| Free preview enforcement (stable server-selected subset; anti-enumeration) | Spec §16.6; UX §15.6 | Missing | **Blocked by decision (limits are V1-9 config).** Ticket queue §1.5 permits provisional fixture values. |
| Truthful unavailable states | Spec §15.4 | Missing | |
| Keyboard navigation (Enter opens row; focus management) | UX §19.1 | Missing | |
| Accessible tables (headers, sort state, row expansion, chart alternatives, freshness not color-only) | UX §19.2 | Missing | |
| Performance budget for full WNBA slate | Spec §24.7 | Missing | To be defined and tested in V1-10. |

---

## V1-7 — Prop Research View and Player Pages

| Required capability | Authority | Status | Notes |
|---|---|---|---|
| Two-column desktop research layout | UX §7.2 | Missing | |
| Header (player, team/opponent, market, scheduled time, availability, last checked, back control) | UX §7.3 | Missing | No recommendation summary. |
| Current market summary (consensus, range, eligible sportsbook count, first observed, movement, freshness) | Spec §5.2; UX §7.4 | Missing | Compact summary block. |
| Book grid (Book, Line, Over, Under, Updated, State) | Spec §5.2; UX §7.5 | Missing | Best price highlighted only at same point/side; pick'em separated below. |
| Exact-point price comparison | Spec §7.7 | Missing | Never crosses points. |
| Movement timeline (restrained line chart + event log) | Spec §5.2; UX §7.7 | Missing | No blinking/animation. |
| Historical real-line record (Date, Opponent, Result, Closing line, Outcome, Margin) | Spec §5.2; UX §7.8 | Missing | Provenance shown quietly (details disclosure), not per-row badges. |
| Result distribution (simple histogram/dot plot; threshold line; median/average labels; text summary) | Spec §5.2; UX §7.9 | Missing | No probability curves. |
| Player Page (canonical identity, current team, availability, next game, last refresh) | Spec §5.4; UX §9 | Missing | |
| Current props by market | Spec §5.4; UX §9.4 | Missing | |
| Recent + season game logs | Spec §5.4; UX §9.5 | Missing | Clean table > metric-card sprawl. |
| Market switching (tabs / segmented control) | UX §9.6 | Missing | |
| PTS/REB/AST/3PM + L5/L10 averages | Spec §5.4 | Missing | |
| Opponent history with explicit `n` | Spec §5.4; UX §9.7 | Missing | No "favorable matchup" copy. |
| Brief deep links | Spec §5.5; UX §10 | Missing | |
| Availability timeline / current report | Spec §5.4; UX §9.3 | Missing | |

---

## V1-8 — Compare Your Line

| Required capability | Authority | Status | Notes |
|---|---|---|---|
| Validated input (player, market, numeric line, optional source label) | Spec §5.3; UX §8.2 | Missing | |
| Threshold calculations (L5/L10/L20/season vs entered line) | Spec §5.3, §7.14 | Missing | Stored separately from historical sportsbook-line metrics. |
| Current sportsbook consensus vs entered line | Spec §5.3 | Missing | |
| Difference language ("higher"/"lower"/"equal", never "better"/"worse") | UX §8.3 | Missing | |
| No-consensus/insufficient-history handling | UX §8.5 | Missing | Explain what remains available. |
| Recent result distribution | Spec §5.3 | Missing | |
| Movement/freshness context | Spec §5.3 | Missing | |
| Explicit notice that SlipLabz does not verify external source | Spec §5.3 | Missing | |
| Watch creation (paid, multiple; free, one when enabled) | Spec §5.3, §16.3-16.4; UX §8.4, §16.2 | Missing | Fixtures pre-V1-9; account-backed at V1-9. |
| Free usage limit | Spec §16.3; ticket queue §1.5 | **Blocked by decision** | Anonymous vs free-registered Compare-limit relationship deferred to V1-9. Use provisional fixture value. |
| Rate limits and abuse controls server-side | Ticket queue V1-8 acceptance | Missing | |

---

## V1-9 — Pricing, Entitlement, and Brief Delivery

| Required capability | Authority | Status | Notes |
|---|---|---|---|
| One Stripe product/price at exactly $7.99/month | Spec §16.1, §17.2; UX §15.1, §15.8 | Missing | No alternate introductory price authorized. |
| Explicit free-vs-paid capability matrix | Spec §16.3, §16.4; UX §15.4, §15.5 | Missing | |
| Paid feature locks added here, not client-only placeholders earlier | Spec §16.5; UX §15.2; ticket queue §1.5 | Missing | |
| Account states (all nine per §17.1) | Spec §17.1 | Missing | Anonymous vs free-registered access separated. |
| Anonymous vs free-registered Compare-limit relationship | Spec §17.1; ticket queue §1.5 | **Blocked by decision** | Set as configuration in V1-9. |
| Exact free preview-row counts | Spec §16.3; ticket queue §1.5 | **Blocked by decision** | Set as configuration in V1-9. |
| Exact free Compare Your Line usage limit | Spec §16.3; ticket queue §1.5 | **Blocked by decision** | Set as configuration in V1-9. |
| Stripe webhook reconciliation (idempotent + out-of-order safe) | V1-9 tests | Missing | |
| Protected routes / protected APIs | Spec §16.7 | Missing | |
| Cancellation / restoration | Spec §17.2; UX §16.3 | Missing | Retain access through billing period. |
| Complimentary access flow | Spec §17.1; V1-9 tests | Missing | |
| Brief delivery entitlement synchronization | Spec §17.3 | Missing | |
| External-customer end-to-end path | Spec §17.2 | Missing | No operator-only knowledge required. |
| Delivery vendor (email — Resend or other) | Prompt §G; UX §16.1 references "email delivery" | **Blocked by decision** | Spec does not name Resend. Governor decision required or delegated to V1-9 implementer. |
| Telegram delivery | Prompt §G | **Blocked by decision** | Not designated by V1 spec. Governor decision required. |
| Preview anti-enumeration | Spec §16.6 | Missing | Stable server-selected subset. |
| Paid data never delivered to unauthorized client | Spec §16.7 | Missing | Test with direct API request. |

---

## V1-10 — Release Hardening

| Required capability | Authority | Status | Notes |
|---|---|---|---|
| Repeated-snapshot evidence review | Spec §26.1 | **Blocked by validation gate** | Refines removal + freshness thresholds. |
| Post-final BDL correction validation | Spec §26.2 | **Blocked by validation gate** | Newly finalized game shortly after final, +2h, +1d. |
| Cross-provider mapping audit | Spec §26.3 | **Blocked by validation gate** | Complete contemporaneous slate. |
| Provider outage drill | Spec §24.4 | Missing | |
| Stale-state drill | Spec §24.4 | Missing | |
| Successful-empty drill | Spec §24.4 | Missing | |
| Schema-drift drill | Spec §24.4 | Missing | |
| Quota circuit-breaker drill | Spec §24.4 | Missing | |
| Payment lifecycle drill | Spec §24.5 | Missing | External customer full lifecycle. |
| Accessibility audit (keyboard, screen reader, contrast AA, motion) | Spec §24.7; UX §19 | Missing | |
| Responsive QA | Spec §24.7; UX §18 | Missing | |
| Performance test (full WNBA slate) | Spec §24.7 | Missing | |
| Forbidden-copy scan | Spec §18.1, §24.6; UX §21.3 | Missing | Automated scan. |
| Methodology page | Spec §18.4 | Missing | Public and free-visible. |
| Release checklist | Ticket queue V1-10 | Missing | |
| **Provider commercial and retention rights** | Spec §2.3, §26.5 | **Blocked by legal gate** | Required for customer-facing launch. |
| **Historical-seed disposition (compliant seed OR forward-only)** | Spec §26.4; §3.6 | Missing (produced by V1-4b) | Required for V1-10 acceptance, not for V1-5–V1-8. |

---

## Summary counts

- **Exists and conforms:** 0 capabilities (greenfield).
- **Exists but needs adaptation:** 0.
- **Missing:** every capability listed above except the blocked-gate rows.
- **Conflicts with authority:** 0 code-level conflicts.
- **Blocked by decision:** 6 (anonymous-vs-free-registered Compare limit; exact free preview-row counts; exact free Compare limit; V1-6 free-preview limits; email-delivery vendor; Telegram delivery).
- **Blocked by legal gate:** 3 (BDL commercial rights; Odds API commercial rights; historical-snapshot retention/display rights).
- **Blocked by validation gate:** 4 (post-final BDL correction, Odds repeated-snapshot, cross-provider mapping, historical WNBA prop coverage preflight).

None of these decision/legal/validation gates prevent V1-1 from beginning. They constrain V1-4b, V1-6 fixtures, V1-8 fixtures, V1-9, and V1-10 acceptance.

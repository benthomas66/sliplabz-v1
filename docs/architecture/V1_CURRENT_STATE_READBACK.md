# V1 Current-State Readback

**Ticket:** V1-0 — Authority and Repo Readback
**Prepared:** 2026-07-10
**Repository path:** `/Users/benthomas/SLIPLABZ-PRODUCT-1.0`

---

## 0. Headline finding

**The repository is greenfield.** Aside from the SlipLabz V1 authority package under `docs/SlipLabz_V1_Final_Pre_Agent_Package_v1_3_patched2/` and a macOS metadata file (`.DS_Store`), the working directory contains no application code, no configuration, no schema, no migrations, no tests, no fixtures, no build system, no CI, no dependency manifest, and no version-control history. `git status` returns `fatal: not a git repository`.

Sections B through G below therefore describe an **empty starting point**, not a legacy implementation to be adapted. This has three durable consequences for V1:

1. There is nothing to conflict with the complete spec at the code level. Every code-level P0/P1 conflict category is empty. Product-authority conflicts are still evaluated in the conflict register.
2. V1-1 cannot "migrate existing FKs safely" or "adapt existing tables" — those clauses in the ticket-queue V1-1 requirements are inert here. V1-1 is a clean-schema creation.
3. Section D.1 (historical seed feasibility) has no locally discoverable data to inventory. Feasibility must be assessed against fresh Odds API historical-endpoint pulls plus the still-open provider-rights gate.

---

## A. Repository inventory

### Working-directory tree

```
/Users/benthomas/SLIPLABZ-PRODUCT-1.0
├── .DS_Store                                              (macOS metadata; not application state)
└── docs/
    └── SlipLabz_V1_Final_Pre_Agent_Package_v1_3_patched2/ (authorities — see V1_AUTHORITY_MAP.md)
        ├── SLIPLABZ_APPLICATION_V1_COMPLETE_SPEC_v1_3.md
        ├── SLIPLABZ_V1_UX_UI_SUBSPEC_v1_3.md
        ├── SLIPLABZ_BALLDONTLIE_V1_DATA_SUBSPEC_AUDITED.md
        ├── SLIPLABZ_ODDS_API_V1_DATA_SUBSPEC_AUDITED.md
        ├── SLIPLABZ_V1_AGENT_TICKET_QUEUE_v1_3.md
        ├── SLIPLABZ_V1_REPO_SPEC_README_v1_3.md
        ├── SLIPLABZ_V1_FINAL_PRE_AGENT_AUDIT_v1_3.md
        ├── SLIPLABZ_DATA_INGESTION_INTEGRATION_AUDIT.md
        ├── SLIPLABZ_V1_TICKET_0_AUTHORITY_REPO_READBACK_PROMPT_v1_3.md
        ├── SLIPLABZ_V1_FULL_PACKAGE_MANIFEST.txt
        ├── SlipLabz_Application_V1_Complete_Spec_v1_3.docx     (non-authoritative export)
        └── SlipLabz_V1_UX_UI_Subspec_v1_3.docx                 (non-authoritative export)
```

New directories created by this ticket (per the allowed paths in the prompt):

```
docs/architecture/                       (this file)
docs/product/                            (V1_AUTHORITY_MAP, V1_GAP_MATRIX, V1_CONFLICT_REGISTER, V1_TICKET_FILE_MAP)
docs/product/reports/                    (V1_TICKET_0_REPORT)
```

### Git state

```
git status --short   → fatal: not a git repository
git rev-parse HEAD   → fatal: not a git repository
git branch --show    → fatal: not a git repository
```

**Consequence:** the repository is not yet under version control. Ticket 0's evidence requirements ("initial git status, branch, HEAD" and "final git status") are recorded as "N/A — not a git repository" throughout the ticket report. Before V1-1 begins, a repository owner should run `git init` and make an initial commit that captures the authority package plus the V1-0 audit artifacts. That decision is deferred to the governor — this ticket does not initialize git.

---

## B. Current architecture map

There is no current architecture. Each layer required by the complete spec is listed with the current state.

| Layer | Complete-spec expectation | Current state | Entry points found |
|---|---|---|---|
| Frontend framework | Web app (spec §0, §5); responsive mobile web (UX §7, §18) | **None** | none |
| Routing | Routes listed in UX §2.2 (`/app`, `/app/board`, `/app/compare`, `/app/players`, `/app/players/[player]`, `/app/research/[game]/[player]/[market]`, `/app/brief`, `/app/account`, `/methodology`, `/pricing`) | **None** | none |
| Backend / API structure | Server-side capability filtering (spec §16.5, §16.7); protected APIs (§20); Brief and app consume the same computation service (§1.2, §5.5, §12.1) | **None** | none |
| Database | Canonical storage entities per spec §11 (players, teams, games, provider_*, player_game_stats, availability_snapshots, odds_ingestion_runs, market_snapshots, market_offerings, movement_events, current_market_rows, historical_line_results, research_window_metrics) | **None** | none |
| Authentication | Account states in spec §17.1 (anonymous, free registered, active paid, complimentary, past due, canceled-through-period, expired, refunded, internal/admin) | **None** | none |
| Payment provider | Stripe (spec §16.1, §17.2, ticket queue V1-9); one product/price at $7.99/month | **None** | none |
| Job scheduling | Cadence per spec §9.11, §10.11; BDL sub-spec §16A, §21; Odds sub-spec §19.1 | **None** | none |
| Provider clients | BALLDONTLIE (BDL sub-spec §3A) and Odds API (Odds sub-spec §14.1); server-side secrets; redacted URLs (spec §20.1) | **None** | none |
| Email delivery | Complete spec §5.5, §17.3 (Brief delivery); ticket queue V1-9 (Brief delivery integration); vendor not fixed by spec | **None** — spec does not name Resend by decree; UX §16.1 refers only to "email delivery"; ticket 0 prompt §G asks about "Resend/Telegram integration" as a legacy question | none |
| Telegram delivery | The prompt asks whether it exists; the complete spec does not designate Telegram as V1 delivery | **None** — not required; see conflict register P2 note | none |
| Caching | Traceability requirement in §20.2 does not require caching in V1 | **None** | none |
| Deployment | Environment definitions in §2.3 (local, internal/admin, access-controlled staging, customer-facing launch) | **None** | none |
| Test framework | Ticket-level test requirements; forbidden-copy scan (V1-10) | **None** | none |
| Fixtures | Deterministic free/paid fixtures required pre-V1-9 (ticket queue §1.5); event-mapping fixture (V1-1); slate fixtures per ticket | **None** | none |
| Observability | Complete spec §20.3 (operational metrics) and §20.4 (alerts) | **None** | none |
| Environment / configuration loading | Provider facts must be configuration-backed (§3.5); secrets server-side only (§20.1) | **None** | none |
| Server/client boundary | Paid data must not be delivered to the client and merely hidden (§16.7); this is architectural | **None** | none |
| Local artifact / dry-run mode | Ticket 0 prompt §D asks about "local artifact mode" | **None** | none |

**No shared modules exist to flag as high-risk.** Every module V1 requires must be created.

---

## C. Current schema inventory

There is no schema, no migration history, no view, no function, no trigger, and no enum in the repository. There is no database connection, no ORM model file, and no SQL file.

Consequently, the columns below serve as **target state**, not present state. They are enumerated so V1-1 can implement them without re-reading the specs. Each row is annotated "Missing" under "Present in repo?".

### C.1 Target-state summary of storage entities (from complete spec §11 and sub-specs)

| Entity | Complete-spec source | Present in repo? | Notes for V1-1 |
|---|---|---|---|
| `players` | §11.1 | Missing | internal_player_id (PK), canonical display name, normalized name, current team, status, created_at, updated_at |
| `provider_players` | §11.1 | Missing | (provider, provider_player_id) unique key; internal_player_id FK; raw name fields; normalized name; current provider team; first_seen; last_seen; mapping_state; alias_version |
| `teams` | §11.1 | Missing | internal_team_id (PK), display name, abbreviation, current-franchise state, lineage metadata; **do not** put a UNIQUE constraint on full_name or abbreviation (BDL §12B.5 — provider has duplicate full_name and abbreviation `TBD`) |
| `provider_teams` | §11.1 | Missing | (provider, provider_team_id) unique; internal_team_id FK; raw metadata; classification (BDL §12B.4 six-value enum); first_seen; last_seen; **allow null conference & empty city** (BDL §12B.5, §12A.5 — expansion teams `Fire`/`Tempo` have this) |
| `games` | §11.1 | Missing | internal_game_id (PK), season, season_type (BDL §6A — 2=regular, 3=postseason), home_team_id, away_team_id, scheduled_start_utc, actual_start_utc, canonical status, postseason bool, created_at, updated_at |
| `provider_games` | §11.1 | Missing | (provider, provider_game_id) unique; internal_game_id FK; raw teams; raw commence time; mapping state; time delta; first_seen; last_seen |
| `player_aliases` / `team_aliases` | Ticket queue V1-1 | Missing | Alias tables with alias_version |
| `player_game_stats` | §11.2; BDL §19.3 | Missing | Idempotent upsert on (provider, provider_player_id, provider_game_id); raw & parsed minutes; **minutes_status** with three states (played / dnp / unresolved_non_numeric — BDL §7); raw + normalized counting stats; source_hash; first_observed; last_verified; last_changed; eligibility_state; quarantine_reason; normalization_version |
| `availability_snapshots` | §11.3; BDL §20 | Missing | (player, source) natural + observed_at; source status, comment, return-date text; first_seen; last_seen; changed_at; interpretation state enum (`currently_reported`, `not_returned_latest_complete_snapshot`, `stale_feed`, `unresolved_player`, `source_unavailable`); raw payload ref |
| `odds_ingestion_runs` | §11.4; Odds §15.1 | Missing | provider, **request_kind** (`current_poll` / `historical_query`), event, requested effective timestamp when historical, requested markets/sources, started_at, completed_at, HTTP status, quota expected/observed, result state, raw reference |
| `market_snapshots` | §11.4 | Missing | Synthetic `market_snapshot_id` PK. Within a run enforce UNIQUE on (ingestion_run_id, provider_event, source, market). **Store provider_snapshot_at for historical and observed_at for current — do not use a nullable timestamp as a composite key** (pre-agent audit P0-1). Fields include internal_game, source_class, request_kind, **provenance** (`self_observed`/`backfilled_historical`), provider `last_update`, retrieved_at, freshness (current only), row/duplicate counts, schema state, raw ref |
| `market_offerings` | §11.4 | Missing | Identity within snapshot: (game, player, source, market, point, side). Fields: price, multiplier, promotion_type (default `unknown` — Odds §11.7), offering_state (§10.9 seven-value enum), duplicate_count, source_row refs, mapping_state, product_eligibility |
| `movement_events` | §11.4; Odds §17 | Missing | prior_snapshot, current_snapshot, game, player, source, market, change_type (16-value enum in §13.1 + Odds §17), prior/current point, prior/current price, detected_at, provider timestamp change, confidence |
| `current_market_rows` | §11.5 | Missing | Materialized or computed; game, player, market, consensus, range, distribution, eligible sportsbook count, current source rows, freshness, first_observed_consensus, movement |
| `historical_line_results` | §11.5 | Missing | game, player, market, **canonical closing point**, closing selection method (§7.10.2 four-value: `single_book` / unique modal / `closing_consensus_unresolved` (excluded) / tied — no unique mode), total eligible sportsbook count, sportsbook count at selected point, source-level closing quote refs, provenance, provider_snapshot_at, final result, O/U/P, margin, coverage state, computation version |
| `research_window_metrics` | §11.5 | Missing | player, market, reference_date, window_type, eligible_n, O/U/P counts, average, median, coverage status, computation version |
| Users / customers / subscriptions / entitlement / usage counters / delivery lists / audit logs | §16, §17, §19, §20 | Missing | To be introduced in V1-1 (identity FKs may reference future users table) and V1-9 (subscriptions, Stripe events, usage counters, protected APIs, delivery-list sync). Ticket queue §1.5 requires that pre-V1-9 code exposes injected/fixture-driven capability hooks rather than client-only paywalls. |

### C.2 Shadow schemas / duplicate sources of truth

**None.** No prior schema to shadow.

### C.3 Provider strings used as canonical identity

**None.** No prior code to inspect. The complete spec §7.1 and BDL/Odds sub-specs make it clear that internal, provider-independent IDs are canonical; provider strings must not be promoted.

### C.4 Migration history

**None.** No prior migrations. V1-1 will establish migration #1.

---

## D. Current ingestion inventory

There is no ingestion. Every provider fetch, normalization step, mapping job, snapshot store, and Brief-artifact generator listed by the prompt §D is absent.

| Job / Module / Command / Cron | Complete-spec / sub-spec source | Present in repo? |
|---|---|---|
| BALLDONTLIE fetch (players, active players, teams, games, player_stats, player_injuries) | Complete §9.1; BDL §3, §3A, §3B | Missing |
| Odds API fetch (events, event odds, historical events, historical event odds) | Complete §10.1–10.13; Odds §7, §10, §14 | Missing |
| Any other WNBA source | Complete §0 (WNBA only via these two providers) | Missing |
| Normalize players | BDL §12A, §12A.6; Odds §10.11 | Missing |
| Normalize teams | BDL §11, §12B | Missing |
| Map games (event reconciliation) | Complete §7.2; Odds §6 | Missing |
| Store odds | Complete §11.4; Odds §15 | Missing |
| Store snapshots (current + historical) | Complete §11.4; Odds §15.2, §16.1 | Missing |
| Compute opening observations (first_observed) | Complete §7.8, §13.4; Odds §16.3 | Missing |
| Compute closing observations | Complete §7.10.1, §7.10.2; Odds §18.4, §14.11 | Missing |
| Compute movement | Complete §13; Odds §17 | Missing |
| Compute history (real-line L5/L10/L20/season) | Complete §14; BDL §8, §9A | Missing |
| Generate Brief artifacts | Complete §5.5, §17.3 | Missing |
| Write to Supabase | Ticket 0 prompt asks; spec does not name Supabase but §16.7, §20 impose server-side authoritative persistence | Missing (Supabase not adopted; conflict register P2 note) |
| Local artifact / no-write mode | Prompt asks | Missing |
| Idempotency | Complete §21.5; BDL §19.3 | Missing |
| Raw-payload retention | Complete §21.6; BDL §14; Odds §15.1 | Missing |
| Retry behavior | BDL §15, §15A; Odds §20 | Missing |
| Rate-limit behavior | BDL §15A.4; Odds §8, §21 | Missing |
| Post-final reconciliation scheduler | Complete §9.9; BDL §12C.4 | Missing |
| Current-line/historical isolation guard | Complete §7.10, §11.4, §12.1; Odds §14.11 | Missing |

### D.1 Historical closing-line seed feasibility (V1-4b)

Ticket 0 prompt §D.1 requires a specific inventory here.

**What was searched:**
- All files under the repo tree (only the authority package plus `.DS_Store` exist).
- All git history — **not applicable**; the repo is not under version control, so no branches, tags, or reflog exist to inspect.
- Any documented database — none exists.
- Retained artifacts, scripts, fixtures — none exist.

**Findings:**
- **No historical Odds API data of any kind is present** in the repository. The "large historical odds pull from earlier modeling work (on the order of 100k+ odds rows)" that the prompt asks about has not survived the repositioning into this working directory. If that pull exists, it lives in another location (older repo, archived branch elsewhere, external storage, or a colleague's machine) and is outside the audit scope. If the pull is retrievable from elsewhere, it becomes a V1-4b input rather than a V1-0 finding.
- No fixture, script, or table shows final-snapshot source offerings; final observed-time / retrieval-time separation; sportsbook coverage; provenance markers; or backfilled markers.
- **Seeding therefore cannot be served by existing local data.** V1-4b will need fresh Odds API historical-endpoint pulls if (and only if) the provider-rights gate is closed.

**Quota estimate for fresh pulls, per complete spec §10.13 and Odds sub-spec §14.11.2:**

The default V1 conventional-sportsbook allowlist is **8 keys** (§10.3, minus PrizePicks and Underdog which are pick'em): `draftkings`, `fanduel`, `betmgm`, `williamhill_us`, `fanatics`, `betrivers`, `hardrockbet`, `espnbet`.

- Bookmaker-region equivalents = `ceil(8 / 10)` = **1**.
- Historical event-odds cost per event = `10 × markets × region-equivalents × events` = `10 × 4 × 1 × 1` = **40 credits per event** (matches the complete spec §10.13 example verbatim).
- The WNBA regular season is 44 games per team × 15 teams / 2 ≈ 330 regular-season games; postseason adds roughly 20–35 games. If the launch season targets a slate of ~350 games, the forecast is `350 × 40` = **≈ 14,000 credits** for the event-odds calls. Historical event-ID discovery has its own budget (Odds §14.11.2, unquantified there) — treat as a separate line-item allowance.
- If V1-4b decides to enlarge the allowlist to 11–20 keys, region-equivalents doubles and per-event cost becomes 80 credits, roughly doubling the total. This is exactly the "region-equivalent, not raw book count" behavior described in complete spec §10.13.

**Licensing status:**
- **Open commercial gate.** Complete spec §2.3, §3.6, §26.5, and Odds §14.11.1 all require provider-rights approval for retention and customer-facing display of purchased historical snapshots before a customer-facing launch. This is stated as unresolved by design in the pre-agent audit §6 and §7. It is flagged as a launch gate here; it does **not** block core V1 build (per rev 1.3 correction P0-3).

**Feasibility recommendation for V1-4b:** proceed with a preflight coverage-and-rights confirmation before any credit is spent. If either gate fails, produce the reviewed forward-only disposition described in complete spec §3.6 and Odds §14.11.1 and halt V1-4b without blocking V1-5 through V1-9.

---

## E. Current computation inventory

There is no code implementing consensus, canonical point selection, current line, opening/first observed, closing line, movement, Over/Under/Push grading, L5/L10/L20/season windows, averages, medians, streaks, sample sizes, freshness, coverage, availability, projection models, edge, or recommendation logic.

- **Duplicate formulas:** none — because no formulas.
- **Inconsistent formulas:** none.
- **Current/historical contamination risks:** none in code, but note that V1-1 through V1-5 must actively design for isolation per complete spec §11.4 and §12.1; the pre-agent audit P0-1 documents how easily a snapshot key can allow contamination.
- **Ambiguous timestamps:** none in code. The complete spec §7.10, §11.4 mandate `provider_snapshot_at`, `retrieved_at`, and current-only `observed_at`; ambiguity is a hazard only if V1-1/V1-3/V1-4 fail to enforce this. Flag for those tickets.
- **Arithmetic that creates unoffered lines:** none. The pre-agent audit P0-2 warns that a naïve arithmetic median across sportsbook points (e.g., median(13.5, 14.5) = 14.0) violates the "real lines only" invariant. V1-4 must implement §7.10.2's unique-modal selection instead.
- **Behavior forbidden by V1:** none exists to remove. Forbidden framings (pick, lock, best bet, edge, EV, model, projections, confidence, hot/cold, etc.) from complete spec §18.1 and UX §21.3 have no counterpart in code; V1-10 will run the forbidden-copy scan.
- **Code paths that bypass the common computation and data-contract layer:** none. V1-5 establishes the shared computation service; earlier tickets must not create parallel formulas.

---

## F. Current product-surface inventory

There are no surfaces. Every route required by UX §2.2 is unimplemented. There is no landing page, application shell, board or table, Compare surface, player cards, player pages, Brief pages, methodology page, account pages, payment pages, protected routes, or admin pages.

| Route (UX §2.2) | Current state | V1 disposition |
|---|---|---|
| `/` (landing) | Missing | To be created; not in complete spec's V1 surface list §5 (V1 surfaces are the app, not marketing pages). Treat as a later or out-of-scope decision — flag as V1-9 or later. |
| `/app` | Missing | To be created |
| `/app/board` | Missing | V1-6 (Today's Props Board) |
| `/app/compare` | Missing | V1-8 (Compare Your Line) |
| `/app/players` | Missing | V1-7 (Player Pages) |
| `/app/players/[player]` | Missing | V1-7 |
| `/app/research/[game]/[player]/[market]` | Missing | V1-7 (Prop Research View) |
| `/app/brief` | Missing | V1-7 (Brief integration deep links); Brief delivery hardening in V1-9 |
| `/app/account` | Missing | V1-9 |
| `/methodology` | Missing | Complete spec §18.4 requires public methodology; UX §15.3 keeps methodology visible even to free users. Recommend delivering with V1-6 or V1-7 at the latest. |
| `/pricing` | Missing | V1-9 |

Server/client data boundaries, protected routes, and admin surfaces are all absent.

---

## G. Pricing, entitlement, and delivery inventory

| Item | Complete-spec / UX expectation | Present in repo? | Notes |
|---|---|---|---|
| $7.99/month Stripe product and price | Complete §16.1; UX §15.1, §15.8; ticket queue V1-9 | Missing | V1-9 will create the sole product/price. |
| Other conflicting prices/tiers | None allowed in V1 (§16.1) | None present | No alternate tier or introductory price is authorized; ticket queue prohibits it. |
| Account states (anonymous / free registered / active paid / complimentary / past due / canceled-through-period / expired / refunded / internal/admin) | Complete §17.1 | Missing | Anonymous vs free-registered Compare-limit relationship is an open V1-9 commercial decision (spec §17.1 execution-consistency patch). Provisional fixture values in earlier tickets. |
| Free vs paid capability boundary | Complete §16.3, §16.4; UX §15.4, §15.5 | Missing | Feature list is defined in the authorities. |
| Paid locks (server vs client) | Server-side authoritative (§16.7, §16.9) | None present | Ticket queue §1.5 mandates server-side capability filtering pre-V1-9 driven by injected/fixture entitlement, no client-only placeholders. Real Stripe/account/protected-API enforcement lands in V1-9. |
| Server responses leaking paid fields | Forbidden (§16.7) | N/A — no APIs exist | Track as invariant to enforce from V1-5 onward. |
| Stripe integration | Complete §16.1, §17.2; V1-9 | Missing | Includes webhook handling, idempotency, and out-of-order handling per V1-9 tests. |
| Webhook handling | V1-9 | Missing | Duplicate-webhook + out-of-order-webhook required tests are in the queue. |
| Entitlement authority | Server-side authoritative (§16.7) | Missing | Two-stage: fixtures pre-V1-9, account-backed in V1-9. |
| Cancellation behavior | Complete §17.2, §22 V1-9; UX §16.3 | Missing | Retain access through billing period; expire on time. |
| Complimentary access | Complete §17.1; V1-9 tests | Missing | |
| Usage counters / preview limits | Complete §16.3 (limits are configuration finalized in V1-9); §16.6 anti-enumeration | Missing | Earlier tickets carry provisional fixture values. |
| API enumeration risks | Complete §16.6 | N/A — no APIs exist | Design goal for V1-5, V1-6. |
| Delivery-list synchronization | Complete §17.3 (Brief delivery); §22 V1-9 | Missing | |
| Resend integration | *Not designated by the complete spec*; ticket 0 prompt raises it | Missing | Vendor decision to be made in V1-9. Conflict register carries a P2 note. |
| Telegram integration | *Not designated by the complete spec*; ticket 0 prompt raises it | Missing | Not currently a V1 requirement; not blocking. Conflict register carries a P2 note. |
| Manual operator steps | Forbidden for a normal external customer (§17.2) | N/A | Invariant to enforce during V1-9. |
| End-to-end test coverage (free / paid / canceled / expired / complimentary) | V1-9 acceptance tests | None | |

Two-stage-enforcement note: the ticket queue §1.5 and the complete-spec execution-consistency patch (§16.5) explicitly separate pre-V1-9 server-side capability filtering against injected/fixture entitlement from V1-9 real account-backed enforcement (Stripe sync, protected APIs, anti-enumeration, usage counters). This ticket does not represent fixture filtering as completed production enforcement.

---

## H. Cross-cutting observations for V1-1

1. **Migration policy is greenfield.** Ticket queue V1-1 requires "no name-only permanent matching", ordered-team + time-aware event matching, versioned mappings, retained raw provider strings, and "existing foreign keys migrated safely". The last clause has no existing FKs to migrate — V1-1 is a clean creation.
2. **Provider-team null tolerance is a load-bearing invariant.** BDL §12A.5, §12B.5, §12B.7 confirm that expansion teams (Portland Fire `POR` id 31, Toronto Tempo `TOR` id 30) currently carry empty city and null conference in canonical `/teams` responses; and that placeholder IDs 32, 33 share `full_name` and `abbreviation` "TBD". V1-1 must therefore avoid UNIQUE constraints on `full_name` or `abbreviation` and must allow null conference and empty city.
3. **`market_snapshots` identity is a locked pattern.** V1-1 (or V1-3) must use a synthetic `market_snapshot_id` with UNIQUE on `(ingestion_run_id, provider_event, source, market)` — not a nullable timestamp as a composite key member. This is a direct P0 correction from the pre-agent audit and must not be re-introduced.
4. **Current/historical isolation is a schema-level invariant.** `request_kind` and `provenance` are non-nullable, non-defaultable columns that are checked at query time in current selection, first-observed, and movement paths. V1-1 sets the schema; V1-3 enforces at ingestion; V1-4 enforces at computation.
5. **Version-control is not initialized.** Before V1-1 commits any code, git initialization and a first commit of the authority package + audit artifacts are needed. Deferred to governor.

---

## I. Tests, fixtures, observability, and CI

- **Tests:** none. No test framework installed.
- **Fixtures:** none. The BDL sub-spec §6.2 audit records a 41-page season pull with 4,002 rows as a real-world reference; the Odds sub-spec §10 records a 6-event WNBA slate. These sub-spec sections are not fixtures in the repo — they are audit findings. V1-1/V1-2/V1-3 will need to create fixtures.
- **Observability:** none.
- **CI:** none.
- **Environment / configuration loading:** none.
- **Server/client boundaries:** none.
- **Local artifact or dry-run modes:** none.

---

## J. Summary

Sections B through G describe an empty starting point rather than a legacy system. V1-1 begins with a clean slate. Every V1-1 through V1-10 requirement is either "missing" (build from spec) or, in a small number of governance decisions, "blocked by decision" (see the conflict register). No P0 code-level conflict exists because there is no code.

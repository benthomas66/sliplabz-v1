# SlipLabz Application V1 — Agent Ticket Queue

**Status:** Execution authority derived from `SLIPLABZ_APPLICATION_V1_COMPLETE_SPEC_v1_3.md`  
**Revision:** 1.3  
**Date:** 2026-07-10  
**Implementation authorization:** Active. Proceed through the queue one ticket at a time and halt at every required review checkpoint.

> **Revision 1.3 (2026-07-10):** Final pre-agent audit moved historical seeding to V1-4b so unresolved coverage or rights cannot block the core build. The ticket now uses historical event discovery, the official 10x historical cost, strict current/historical isolation, and a real observed canonical closing-point method.

---

# 1. Queue rules

## 1.1 Authority order

1. `SLIPLABZ_APPLICATION_V1_COMPLETE_SPEC_v1_3.md`
2. `SLIPLABZ_V1_UX_UI_SUBSPEC_v1_3.md` (interface, interaction, responsive, accessibility, and UX-copy matters)
3. `SLIPLABZ_BALLDONTLIE_V1_DATA_SUBSPEC_AUDITED.md`
4. `SLIPLABZ_ODDS_API_V1_DATA_SUBSPEC_AUDITED.md`
5. Existing explicitly locked repo authorities
6. Approved ticket
7. Current implementation
8. Agent assumptions

A lower authority may not override a higher authority. A repo document counts as an explicitly locked authority only when it carries an authoritative status or version declaration; a filename alone does not establish locked status.

## 1.2 Mandatory ticket behavior

Every agent must:

- read the ticket’s listed authorities;
- inspect the current repo before proposing edits;
- state exact files expected to change;
- identify conflicts before coding;
- preserve raw provider evidence;
- write idempotent ingestion and recomputation paths;
- avoid destructive migrations;
- run the required tests;
- produce the required report;
- halt at the ticket boundary.

## 1.3 Global prohibitions

No ticket may silently add:

- a sport other than WNBA;
- a launch market beyond points, rebounds, assists, and made threes;
- live props;
- predictive projections;
- picks or recommendation language;
- expected value;
- wager execution;
- affiliate flows;
- raw-data export;
- hidden methodology;
- a second formula for a metric already owned by the shared computation layer.

## 1.4 Commit rules

Unless a ticket explicitly says otherwise:

- do not use `git add ..`;
- do not use `git add -A`;
- stage only named files;
- do not push;
- do not merge;
- do not rewrite history;
- halt for review after the report.

## 1.5 Entitlement staging

Paid enforcement is staged:

- Tickets before V1-9 build server-side capability filtering driven by an injected or fixture entitlement, deterministic free/paid fixtures, and correct free/paid interface states. They do not build client-only placeholder paywalls and do not depend on Stripe or live accounts.
- V1-9 activates real account-backed entitlement: Stripe synchronization, account states, server-side usage counters, protected APIs, and preview anti-enumeration.

Exact free preview-row counts and Compare Your Line limits are finalized as V1-9 configuration. Earlier tickets use clearly labeled provisional fixture values.

---

# 2. Dependency graph

```text
V1-0 Authority and repo readback
  └── V1-1 Canonical identities and mapping
        ├── V1-2 BALLDONTLIE ingestion foundation
        └── V1-3 Odds API ingestion foundation
              └── V1-4 Closing lines, movement, and history
                    ├── V1-4b Current-season historical closing-line seed
                    └── V1-5 Shared computation and read model
                          ├── V1-6 Today's Props Board
                          ├── V1-7 Prop Research View and Player Pages
                          └── V1-8 Compare Your Line
                                └── V1-9 Pricing, entitlement, and Brief delivery
                                      └── V1-10 Release hardening
```

V1-2 and V1-3 may proceed in parallel only after V1-1 is accepted.

V1-4b may run in parallel with V1-5 through V1-8 after V1-4 is accepted. V1-10 requires an approved V1-4b disposition, but core product construction does not.

---

# 3. Ticket register

| Ticket | Name | Type | Depends on | Required review gate |
|---|---|---|---|---|
| V1-0 | Authority and Repo Readback | Audit only | None | Yes |
| V1-1 | Canonical Identities and Mapping | Schema/infrastructure | V1-0 | Yes |
| V1-2 | BALLDONTLIE Ingestion Foundation | Data infrastructure | V1-1 | Yes |
| V1-3 | Odds API Ingestion Foundation | Data infrastructure | V1-1 | Yes |
| V1-4 | Closing Lines, Movement, and History | Data computation | V1-2, V1-3 | Yes |
| V1-4b | Current-Season Historical Closing-Line Seed | Data infrastructure | V1-4 | Yes |
| V1-5 | Shared Computation and Read Model | Application infrastructure | V1-4 | Yes |
| V1-6 | Today's Props Board | Product surface | V1-5 | Yes |
| V1-7 | Prop Research View and Player Pages | Product surface | V1-5 | Yes |
| V1-8 | Compare Your Line | Product surface | V1-5 | Yes |
| V1-9 | Pricing, Entitlement, and Brief Delivery | Commercial infrastructure | V1-6, V1-7, V1-8 | Yes |
| V1-10 | Release Hardening | QA/release | V1-9, approved V1-4b disposition | Final |

---

# 4. V1-0 — Authority and Repo Readback

## Mission

Audit the existing repository against the complete SlipLabz V1 specification and produce an implementation map without changing behavior.

## Scope

Read-only repo inspection plus documentation artifacts.

Allowed changes:

- `docs/product/`
- `docs/architecture/`
- `docs/product/reports/`

No application code, schema, migration, configuration, dependency, environment, or CI behavior may change.

## Required deliverables

1. Authority map
2. Current architecture map
3. Current schema inventory
4. Current ingestion inventory
5. Current metric/computation inventory
6. Current product-surface inventory
7. Entitlement/payment/delivery inventory
8. Gap matrix against complete spec
9. Conflict and ambiguity register
10. Proposed ticket-to-file map
11. Recommended implementation order
12. Ticket report

## Required artifacts

Suggested paths:

- `docs/product/V1_AUTHORITY_MAP.md`
- `docs/architecture/V1_CURRENT_STATE_READBACK.md`
- `docs/product/V1_GAP_MATRIX.md`
- `docs/product/V1_CONFLICT_REGISTER.md`
- `docs/product/V1_TICKET_FILE_MAP.md`
- `docs/product/reports/V1_TICKET_0_REPORT.md`

## Acceptance criteria

- No behavior change.
- Every authoritative document is identified.
- Every relevant current table is listed.
- Every relevant ingestion job is listed.
- Existing provider integrations are identified.
- Existing metric implementations are identified.
- Existing Brief and app overlap is identified.
- Every V1 phase is mapped to likely files/modules.
- P0 ambiguities are separated from implementation preferences.
- The report states whether V1-1 can begin.
- Agent halts for review.

## Report and halt

Produce the ticket report and halt for review. Do not begin the next ticket.

---

# 5. V1-1 — Canonical Identities and Mapping

## Mission

Create provider-independent player, team, and game identities plus auditable BALLDONTLIE and Odds API mappings.

## Depends on

Accepted V1-0 readback.

## Required behavior

- Internal player IDs.
- Internal team IDs.
- Internal game IDs.
- Provider identity tables.
- Mapping state and review state.
- Reviewed alias tables.
- Event reconciliation queue.
- Player reconciliation queue.
- No name-only permanent matching.
- Ordered team and time-aware game matching.
- Versioned mapping changes.
- Raw provider strings retained.
- Existing foreign keys migrated safely.

## Required migrations

At minimum, support:

- `players`
- `provider_players`
- `teams`
- `provider_teams`
- `games`
- `provider_games`
- `player_aliases`
- `team_aliases`
- mapping/review state

Existing schema may be adapted rather than duplicated, but behavior must match the complete spec.

## Required tests

- exact event match;
- event match within tolerance;
- ambiguous event;
- unmatched event;
- exact player mapping;
- punctuation/diacritic alias;
- ambiguous player;
- team change;
- provider ID stability;
- idempotent rerun;
- rollback/forward-fix migration safety.

## Acceptance criteria

- Every provider entity can map to an internal entity.
- Unresolved mappings quarantine rather than guess.
- Existing historical references remain valid.
- No provider display string is treated as canonical identity.
- Complete contemporaneous slate fixture maps or quarantines deterministically.

## Report and halt

Produce the ticket report and halt for review. Do not begin the next ticket.

---

# 6. V1-2 — BALLDONTLIE Ingestion Foundation

## Mission

Implement the canonical WNBA identity, game, completed-stat, and current-availability ingestion path from BALLDONTLIE.

## Depends on

Accepted V1-1.

## Required endpoints

- players
- active players
- teams
- games
- player stats
- player injuries/current availability

## Required behavior

- bounded requests;
- cursor pagination;
- complete-import watermarks;
- immutable raw response references;
- ingestion-run records;
- idempotent upserts;
- team registry classification;
- active-roster snapshots;
- game-status mapping;
- player-stat eligibility;
- minutes-state handling;
- null-to-zero normalization for eligible played rows;
- post-final reconciliation scheduling;
- availability lifecycle states;
- source correction detection;
- recomputation invalidation hooks.

## Required tests

- 41-page season fixture or equivalent multipage fixture;
- exact cursor chain;
- failed page;
- partial page traversal;
- duplicate player-game source key;
- numeric minutes >0;
- numeric zero;
- `"--"` minutes;
- null counting stat on played row;
- unknown game status;
- active-player disappearance after complete snapshot;
- failed active-player snapshot;
- current availability disappearance;
- final-stat correction.

## Acceptance criteria

- Partial imports never advance completeness.
- Historical player-game rows are stable and correction-safe.
- `"--"` is not DNP.
- DNP does not enter historical windows.
- Finality is not inferred from clock fields.
- Availability absence does not become “healthy.”
- Raw source evidence is traceable.

## Report and halt

Produce the ticket report and halt for review. Do not begin the next ticket.

---

# 7. V1-3 — Odds API Ingestion Foundation

## Mission

Implement event discovery and current pregame WNBA prop ingestion from The Odds API.

## Depends on

Accepted V1-1.

## Required behavior

- free event discovery;
- event reconciliation;
- explicit bookmaker allowlist;
- four launch markets;
- quota forecasting;
- quota header reconciliation;
- raw market snapshots;
- normalized outcome rows;
- exact duplicate handling;
- conflicting duplicate quarantine;
- source classification;
- PrizePicks treatment;
- Underdog treatment;
- successful-empty semantics;
- failed-poll semantics;
- freshness states;
- one-sided offerings;
- multi-line preservation;
- schema-drift quarantine.

## Required tests

- six-event slate fixture;
- all four markets;
- source sparsity;
- zero books;
- duplicate BetRivers-style outcomes;
- conflicting duplicates;
- PrizePicks symmetric display prices;
- PrizePicks null multiplier;
- Underdog multiplier 1.0;
- Underdog over-only offering;
- 10-book quota;
- 11+ book quota;
- invalid-market 422;
- successful empty;
- failed response;
- stale market timestamp;
- invalid schema with HTTP 200.

## Acceptance criteria

- Sportsbook and DFS records never mix in consensus.
- Exact duplicates collapse only after raw retention.
- Conflicts quarantine.
- Quota forecast reconciles to response headers.
- Empty success and failed poll produce different states.
- No missing side is fabricated.
- All provider strings and timestamps remain auditable.

## Report and halt

Produce the ticket report and halt for review. Do not begin the next ticket.

---


# 8. V1-4 — Closing Lines, Movement, and History

## Mission

Create the observed-line lifecycle and verified historical real-line calculations.

## Depends on

Accepted V1-2 and V1-3.

## Required behavior

- first observed;
- current observation;
- final observed pregame;
- close boundary;
- postponed-game handling;
- movement events;
- source additions/removals;
- line additions/removals;
- point movement;
- price movement;
- confirmed-removal policy;
- source-level closing quotes;
- canonical observed closing-point selection;
- historical closing-line results;
- explicit provenance and current/historical isolation;
- Over/Under/Push;
- real-line L5/L10/L20/season windows;
- coverage labels;
- actual sample size;
- correction recomputation.

## Required tests

- first observation;
- unchanged snapshot;
- price-only change;
- point change;
- source added;
- source removed once;
- source removed twice;
- failed poll between valid polls;
- successful empty;
- postponed event;
- delayed start;
- final stat correction;
- missing closing line;
- one eligible sportsbook (`single_book`);
- unique modal closing point;
- tied closing points with no unique mode;
- historical record excluded from current selection;
- push;
- incomplete L10.

## Acceptance criteria

- No pseudo-lines or interpolated unoffered points.
- Current and historical snapshots cannot mix.
- “First observed” is not labeled true opening.
- Close does not occur against an abandoned postponed tip.
- Pushes are separate.
- Coverage gaps stop streaks.
- Actual `n` is preserved.
- Corrected inputs trigger deterministic recomputation.

## Report and halt

Produce the ticket report and halt for review. Do not begin the next ticket.

---

# 8b. V1-4b — Current-Season Historical Closing-Line Seed

## Mission

Attempt and, where coverage and provider rights permit, seed the season active at launch with verified conventional-sportsbook closing lines from The Odds API historical endpoints.

This ticket is a prelaunch data-readiness track. It does not block V1-5 through V1-8 from building against fixtures and self-observed data.

## Authority

Complete spec Sections 3.6, 7.10, 10.13, and 14; Odds API sub-spec Section 14.11.

## Depends on

Accepted V1-4, because the historical snapshot schema, provenance isolation, close boundary, and canonical closing-point method must exist first.

## Preflight

Confirm and record:

- historical WNBA player-prop coverage for each launch market and conventional sportsbook;
- commercial rights for retrieval, retention, and customer-facing display;
- current quota balance and forecast;
- whether usable historical rows already exist in the repo or database.

If rights remain unresolved, do not purchase or ingest new historical data. Produce a reviewed forward-only disposition and halt this ticket without blocking unrelated build phases.

## Required behavior

- operate only on canonical final games;
- use the historical events endpoint to discover historical event IDs;
- map historical events to internal/BALLDONTLIE games;
- request the historical event-odds snapshot at the canonical close boundary;
- request only the four launch markets and conventional sportsbook keys;
- forecast `10 × markets × bookmaker-region equivalents × events`;
- treat response quota headers as authoritative;
- reject any returned snapshot more than 10 minutes before the close boundary;
- retain only offerings present in the returned final snapshot;
- do not walk backward to resurrect removed offerings;
- store provider snapshot time separately from retrieval time;
- mark request kind `historical_query` and provenance `backfilled_historical`;
- never allow seeded rows into current selection, first-observed, or movement history;
- apply the canonical observed closing-point method from V1-4;
- maintain idempotent, resumable seed runs and per-slice coverage watermarks;
- produce a coverage report by date, market, source, player, and exclusion reason.

## Required tests

- historical event-ID discovery;
- clean final pre-tip snapshot;
- snapshot returned within 10 minutes before the requested close boundary;
- snapshot more than 10 minutes before close (`close_capture_stale`);
- offering absent from final snapshot but present earlier (must remain excluded);
- single-book canonical close;
- unique modal canonical close;
- tied points with no unique mode;
- unsupported market slice;
- historical record cannot become current;
- historical record cannot create first observed or movement;
- 40-credit default event forecast and header reconciliation;
- idempotent rerun;
- interrupted run resumes without false completeness.

## Acceptance criteria

- Every imported line belongs to a canonical final game and is present in a snapshot no more than 10 minutes before close.
- Every product-wide historical point is a point actually offered by an eligible sportsbook.
- Historical and current data are structurally isolated.
- No DFS/pick'em row enters sportsbook historical metrics.
- Coverage and rights gaps remain missing and are reported.
- The final report records either successful seed coverage or a forward-only disposition.

## Report and halt

Produce the seed-run or forward-only disposition report and halt for review. Do not begin the next ticket.

---

# 9. V1-5 — Shared Computation and Read Model

## Mission

Create one canonical computation layer consumed by both the web app and Daily Brief.

## Depends on

Accepted V1-4.

## Required outputs

- current market row;
- line consensus;
- line range;
- exact-point counts;
- eligible book count;
- book detail;
- first observed;
- movement summary;
- availability context;
- real-line windows;
- threshold-window calculations;
- averages;
- medians;
- sample-size labels;
- methodology/version metadata.

## Required behavior

- one owner per metric;
- versioned calculations;
- recomputation triggers;
- protected server-side access;
- no paid-data leakage;
- same inputs yield same Brief/app outputs.

## Required tests

- consensus across different sportsbook points;
- price comparison at exact point/side only;
- stale source exclusion;
- DFS exclusion;
- partial window;
- push;
- Brief/app equality;
- unauthorized client response;
- normalization version change.

## Acceptance criteria

- No duplicate formulas across product surfaces.
- Brief and app reconcile exactly for shared metrics.
- Every derived value traces to source records and computation version.
- The read path supports server-side capability filtering and passes deterministic free/paid fixture tests. Production account-backed enforcement (Stripe, accounts, usage counters, protected APIs) is activated in V1-9, not in this ticket.

## Report and halt

Produce the ticket report and halt for review. Do not begin the next ticket.

---

# 10. V1-6 — Today's Props Board

## Mission

Build the primary slate-wide WNBA prop research table.

## Depends on

Accepted V1-5.

## Required behavior

- one row per game/player/market;
- player and matchup context;
- consensus;
- line range;
- point distribution;
- eligible book count;
- first-observed movement;
- freshness;
- availability;
- real-line windows;
- search;
- filters;
- sort;
- book expansion;
- route-preserved state;
- free preview enforcement;
- truthful unavailable states.

## Required tests

- full slate;
- empty slate;
- stale source;
- unresolved player;
- one eligible book;
- no consensus;
- preview anti-enumeration;
- mobile layout;
- keyboard navigation;
- return-state preservation.

## Acceptance criteria

- Board does not expose paid data to clients lacking capability, verified against provisional fixture entitlement; production account-backed enforcement and final preview limits are applied in V1-9.
- DFS sources do not affect consensus.
- Every freshness and coverage limitation is visible.
- The full WNBA slate meets performance budget.

## Report and halt

Produce the ticket report and halt for review. Do not begin the next ticket.

---

# 11. V1-7 — Prop Research View and Player Pages

## Mission

Build deep research surfaces for a player-market and player identity.

## Depends on

Accepted V1-5.

## Required behavior

- current summary;
- book grid;
- exact-point price comparison;
- movement timeline;
- real-line history;
- result distribution;
- average/median/range;
- availability context;
- Player Page;
- current props;
- recent logs;
- season logs;
- opponent sample size;
- Brief deep links.

## Required tests

- multiple sportsbook points;
- stale book;
- one-sided sportsbook quote;
- PrizePicks separate display;
- no real-line history;
- incomplete L10;
- current availability missing;
- unresolved opponent history;
- Brief deep link.

## Acceptance criteria

- Price comparison never crosses points.
- Player Page does not infer unsupported splits.
- Real-line history shows the actual closing line for each included game.
- Charts have text alternatives.

## Report and halt

Produce the ticket report and halt for review. Do not begin the next ticket.

---

# 12. V1-8 — Compare Your Line

## Mission

Implement the acquisition wedge that analyzes a user-entered WNBA prop threshold.

## Depends on

Accepted V1-5.

## Required inputs

- player;
- launch market;
- numeric line;
- optional source label.

## Required outputs

- user-entered line label;
- current sportsbook consensus;
- line difference;
- line range;
- eligible book count;
- L5/L10/L20/season threshold record;
- pushes;
- actual `n`;
- average;
- median;
- result distribution;
- movement/freshness context;
- external-source limitation.

## Required tests

- line above consensus;
- below consensus;
- equal consensus;
- no consensus;
- no current books;
- player with fewer than five eligible games;
- push;
- invalid input;
- unsupported market;
- free usage limit;
- saved paid watch.

## Acceptance criteria

- User-entered threshold results are never stored as historical sportsbook-line results.
- No recommendation copy.
- External source is not presented as verified.
- Rate limits and abuse controls are server-side.
- Free usage limits use clearly labeled provisional fixture values; final limits and production account-backed enforcement are applied in V1-9.

## Report and halt

Produce the ticket report and halt for review. Do not begin the next ticket.

---

# 13. V1-9 — Pricing, Entitlement, and Brief Delivery

## Mission

Implement the $7.99/month subscription, the limited free tier, server-side paid feature locks, and the complete external-customer lifecycle across the app and Daily Brief.

## Depends on

Accepted V1-6, V1-7, and V1-8.

## Required behavior

- one Stripe product/price representing $7.99 per month;
- explicit free-versus-paid capability matrix;
- paid feature locks added in this ticket, not scattered as client-only placeholders through earlier tickets;
- internal/admin access to the complete product for pre-paywall testing;
- anonymous;
- free;
- active paid;
- complimentary;
- past due;
- canceled through period;
- expired;
- refunded;
- internal/admin;
- Stripe webhook reconciliation;
- idempotent events;
- protected routes;
- protected APIs;
- cancellation;
- restoration;
- Brief delivery entitlement;
- external-customer test.

## Required tests

- displayed and charged price is $7.99/month;
- free Board preview;
- free Compare Your Line limit;
- paid full Board and book grid;
- paid full history and movement;
- direct API attempt by free user;
- first purchase;
- duplicate webhook;
- out-of-order webhook;
- canceled through period;
- failed renewal;
- refund;
- complimentary entitlement;
- expired access;
- direct protected API request;
- Brief delivery add/remove.

## Acceptance criteria

- The configured V1 paid price is exactly $7.99/month.
- Free users retain the approved useful feature subset.
- Paid locks are enforced server-side after the core surfaces are implemented.
- Entitlement is server-authoritative.
- No manual operator step is required for normal customers.
- App and Brief access remain consistent.
- Duplicate/out-of-order payment events are safe.

## Report and halt

Produce the ticket report and halt for review. Do not begin the next ticket.

---

# 14. V1-10 — Release Hardening

## Mission

Prove that the V1 application is safe, truthful, resilient, accessible, and commercially ready.

## Depends on

Accepted V1-9, an approved V1-4b seed or forward-only disposition, and all explicit validation and commercial provider-rights gates.

## Required work

- repeated-snapshot evidence review;
- post-final correction evidence review;
- cross-provider mapping audit;
- provider-rights documentation;
- outage drill;
- stale-state drill;
- successful-empty drill;
- schema-drift drill;
- quota circuit-breaker drill;
- payment lifecycle drill;
- accessibility audit;
- responsive QA;
- performance test;
- forbidden-copy scan;
- methodology review;
- release checklist.

## Acceptance criteria

- All release criteria in the complete spec pass.
- No unresolved P0/P1 defect.
- Commercial provider-rights gate is documented.
- Launch approval is explicit.

## Report and halt

Produce the release report and halt for the launch decision. Do not deploy to customers without explicit approval.

---

# 15. Required review checkpoints

The agent must halt after:

- V1-0 readback;
- V1-1 schema proposal/migrations;
- V1-2 provider foundation;
- V1-3 provider foundation;
- V1-4 history computation;
- V1-4b historical seed run or forward-only disposition;
- V1-5 shared read model;
- V1-6 product review;
- V1-7 Prop Research View and Player Pages;
- V1-8 Compare Your Line;
- V1-9 end-to-end customer test;
- V1-10 release decision.

No agent may automatically continue into the next phase.

---

# 16. Immediate next action

Run **V1-0 — Authority and Repo Readback** in the existing repository.

Use the separate prompt:

`SLIPLABZ_V1_TICKET_0_AUTHORITY_REPO_READBACK_PROMPT_v1_3.md`

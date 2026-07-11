You are operating inside the existing SlipLabz repository.

Begin **V1-0 — Authority and Repo Readback**.

The V1 implementation is authorized to proceed after this readback is accepted. Continue through the approved ticket sequence, pausing at every review checkpoint.

This ticket is an audit-only preparation ticket. Do not implement V1 behavior yet.

Revision 1.3 (2026-07-10): Section D.1 inventories historical closing-line seed feasibility for the non-blocking V1-4b launch-preparation track.

# Mission

Read the complete SlipLabz V1 product and data authorities, inspect the current repository, and produce an exact implementation map showing what exists, what conflicts, what is missing, and which files each later V1 ticket is likely to touch.

The result must allow us to begin V1-1 without asking another agent to rediscover the repository.

# Required authorities

Read these in full before analyzing implementation:

1. `SLIPLABZ_APPLICATION_V1_COMPLETE_SPEC_v1_3.md`
2. `SLIPLABZ_V1_UX_UI_SUBSPEC_v1_3.md`
3. `SLIPLABZ_BALLDONTLIE_V1_DATA_SUBSPEC_AUDITED.md`
4. `SLIPLABZ_ODDS_API_V1_DATA_SUBSPEC_AUDITED.md`
5. Existing product, methodology, database, migration, payment, Brief, delivery, and architecture authorities in the repo
6. Existing migration history
7. Existing environment/configuration documentation
8. Existing tests and fixtures relevant to WNBA data, odds, Brief, account, and payment behavior

The complete specification, the UX/UI sub-spec, and the two audited provider sub-specs are all binding V1 authorities and must all be read in full. If these four V1 authorities are not yet in the repository, copy them into an appropriate documentation directory without changing their contents, and record the chosen paths.

# Authority order

Use this order when documents conflict:

1. Complete V1 specification
2. UX/UI sub-spec (interface, interaction, responsive, accessibility, and UX-copy matters)
3. Audited provider sub-specs (provider-specific technical contracts)
4. Existing explicitly locked repo authorities
5. Approved individual ticket
6. Current implementation
7. Agent assumptions

Do not silently resolve a conflict. Record it.

# Scope

Allowed:

- read the entire repository;
- run non-mutating inspection commands;
- inspect the database schema and migrations;
- inspect tests and fixtures;
- write documentation under:
  - `docs/product/`
  - `docs/architecture/`
  - `docs/product/reports/`

Forbidden:

- application behavior changes;
- migration changes;
- dependency changes;
- environment changes;
- provider calls;
- Supabase mutation;
- payment mutation;
- production data mutation;
- refactors;
- formatting unrelated files;
- deleting or moving existing authorities;
- implementing any later V1 ticket.

# Required analysis

## A. Authority map

Identify every current document that governs:

- product positioning;
- WNBA-only scope;
- Daily Brief;
- methodology;
- data providers;
- forbidden language;
- interface, interaction, responsive layout, accessibility, and UX copy;
- database schema;
- ingestion;
- current lines;
- historical lines;
- account/auth;
- payment;
- the fixed $7.99/month subscription;
- free-versus-paid boundaries;
- entitlement;
- email or Telegram delivery;
- deployment;
- testing;
- release gates.

For each authority, record:

- path;
- status;
- scope;
- whether it conflicts with the complete V1 spec;
- recommended long-term disposition:
  - remain authoritative;
  - subordinate;
  - supersede;
  - archive;
  - unresolved.

Treat a document as a locked/binding authority only when it carries an explicit authoritative status or version declaration. A filename alone does not establish locked status; record undeclared documents as current-implementation context or non-authoritative rather than as binding authorities.

## B. Current architecture map

Describe the current application architecture:

- frontend framework;
- backend/API structure;
- database;
- authentication;
- payment provider;
- job scheduling;
- provider clients;
- email/Telegram delivery;
- caching;
- deployment;
- test framework;
- fixtures;
- observability.

## C. Current schema inventory

List every table, view, function, trigger, enum, migration, and important constraint relevant to:

- players;
- teams;
- games;
- player stats;
- injuries/availability;
- odds;
- snapshots;
- historical lines;
- Brief artifacts;
- customers/users;
- subscriptions;
- entitlement;
- delivery;
- audit logs.

For each, record:

- current key;
- relevant columns;
- foreign keys;
- uniqueness constraints;
- whether it can satisfy the V1 contract;
- required migration or adaptation;
- data-migration risk.

## D. Current ingestion inventory

Identify every current job, module, command, cron, script, or function that:

- fetches BALLDONTLIE;
- fetches The Odds API;
- fetches any other WNBA source;
- normalizes players;
- normalizes teams;
- maps games;
- stores odds;
- computes closing lines;
- computes history;
- generates Brief artifacts;
- writes to Supabase;
- supports local artifact mode.

For each, record:

- path;
- entry point;
- inputs;
- outputs;
- write targets;
- idempotency;
- raw retention;
- retry behavior;
- current tests;
- conflict with V1.

### D.1 Historical line backfill inventory (seed feasibility)

Complete spec Section 3.6 makes current-season historical closing-line seeding a V1 requirement (built in ticket V1-4b). Determine what already exists to serve it:

- locate any historical Odds API data already present in the repo, an old branch, or the database — in particular the large historical odds pull from the earlier modeling work (on the order of 100k+ odds rows), if it survived the repositioning;
- for any found data, record: path/table, row counts, seasons and markets covered, which books, whether snapshots carry at-or-before-tip (closing) timestamps, and whether provenance is distinguishable from self-observed lines;
- assess whether existing data can seed current-season closing lines directly, needs fresh historical-endpoint pulls, or is unusable for closing lines;
- determine whether it contains final-snapshot source offerings or merely arbitrary historical rows;
- estimate historical endpoint quota using the official 10x multiplier and conventional sportsbook keys only;
- record the licensing status of retaining/displaying purchased historical snapshots, and flag it as an open gate if unresolved;
- inventory only — do not purchase, fetch, or mutate anything.

## E. Current computation inventory

Find every implementation of:

- consensus;
- current line;
- opening or first observed;
- closing line;
- movement;
- Over/Under/Push;
- L5/L10/L20/season;
- average;
- median;
- streak;
- freshness;
- availability;
- model projection;
- edge or recommendation.

Identify duplicate formulas and any current behavior forbidden by V1.

## F. Current product-surface inventory

Identify existing:

- landing page;
- paid app;
- board/table;
- player cards;
- player pages;
- Brief pages;
- audit pages;
- methodology pages;
- account pages;
- payment pages;
- protected routes;
- admin pages.

Record current routes, data sources, and whether each should be reused, replaced, or removed from the V1 path.

## G. Pricing, entitlement, and delivery inventory

Describe:

- whether a $7.99/month Stripe product/price already exists;
- every other current price that conflicts with the V1 authority;
- the current free-versus-paid capability boundary;
- where paid feature locks currently exist;
- whether those locks are client-only or server-enforced;

- account states;
- Stripe integration;
- webhook handling;
- entitlement authority;
- cancellation behavior;
- complimentary users;
- delivery-list synchronization;
- Resend/Telegram integration;
- manual operator steps;
- current end-to-end test coverage.

## H. Gap matrix

For every V1 phase V1-1 through V1-10, classify each required capability as:

- exists and conforms;
- exists but needs adaptation;
- missing;
- conflicts with authority;
- blocked by decision;
- blocked by legal gate;
- blocked by validation gate.

Include exact repo paths.

## I. Conflict register

Classify conflicts:

- **P0:** blocks V1-1 or risks data corruption/incorrect product meaning;
- **P1:** blocks a later phase;
- **P2:** implementation choice that can be resolved within ticket authority;
- **P3:** cleanup/non-blocking.

For every conflict, provide:

- documents/code involved;
- exact conflict;
- recommended ruling;
- consequence of each option;
- ticket that should resolve it.

Do not invent the ruling when product authority is genuinely missing.

## J. Ticket-to-file map

For V1-1 through V1-10, list:

- likely files to modify;
- likely files to add;
- migrations;
- tests;
- fixtures;
- reports;
- high-risk shared modules;
- tickets that may safely run in parallel.

# Required artifacts

Write:

1. `docs/product/V1_AUTHORITY_MAP.md`
2. `docs/architecture/V1_CURRENT_STATE_READBACK.md`
3. `docs/product/V1_GAP_MATRIX.md`
4. `docs/product/V1_CONFLICT_REGISTER.md`
5. `docs/product/V1_TICKET_FILE_MAP.md`
6. `docs/product/reports/V1_TICKET_0_REPORT.md`

You may add one machine-readable inventory file if useful, but explain why.

# Report requirements

`V1_TICKET_0_REPORT.md` must contain:

- plan completed;
- authorities read;
- commands run;
- files created;
- files modified;
- behavior changes;
- test commands;
- deviations;
- P0 conflicts;
- P1 conflicts;
- whether V1-1 is ready to begin;
- current-season historical seed feasibility (existing data vs. fresh pulls vs. blocked), per Section D.1;
- recommended exact next ticket;
- halt status.

# Acceptance criteria

This ticket passes only if:

- no application behavior changes;
- no schema changes;
- no dependency changes;
- no production/provider mutation;
- the full relevant repo is mapped;
- all relevant tables and migrations are inventoried;
- all relevant ingestion paths are inventoried;
- duplicate or conflicting metric implementations are identified;
- entitlement and Brief delivery are mapped;
- every V1 phase has likely file ownership;
- P0 conflicts are explicit;
- the report makes a binary recommendation on whether V1-1 may begin.

# Commit rules

Do not commit or push unless the user explicitly authorizes it.

Do not use:

- `git add ..`
- `git add -A`
- broad formatting commands
- automated dependency upgrades

# Halt condition

After writing the six required artifacts, halt for review.

Do not begin V1-1.

Your final response must include:

- concise summary;
- files created;
- P0/P1 count;
- whether V1-1 is ready;
- exact halt statement.

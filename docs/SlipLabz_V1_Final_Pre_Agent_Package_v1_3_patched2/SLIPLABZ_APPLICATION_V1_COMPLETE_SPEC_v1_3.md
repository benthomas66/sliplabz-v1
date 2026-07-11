# SLIPLABZ APPLICATION V1 — COMPLETE PRODUCT AND IMPLEMENTATION SPECIFICATION

**Status:** Integration-ready product authority  
**Revision:** 1.3  
**Date:** 2026-07-10  
**Product:** SlipLabz  
**League:** WNBA only  
**Primary surface:** Web application with free and paid access  
**Distribution companion:** Daily Brief  
**Implementation authorization:** Active - proceed through the ticket sequence  
**Commercial launch gate:** Provider rights and retention approval required  
**Detailed data authorities:**  
- `SLIPLABZ_BALLDONTLIE_V1_DATA_SUBSPEC_AUDITED.md`
- `SLIPLABZ_ODDS_API_V1_DATA_SUBSPEC_AUDITED.md`

> **Revision 1.3 (2026-07-10):** Final pre-agent audit completed. Historical seeding remains a launch-preparation requirement when a compliant source is available, but it no longer blocks the core build. The revision adds explicit historical-snapshot isolation, source-level and canonical closing-line rules, historical endpoint discovery and quota behavior, corrected ticket dependencies, and exact active authority filenames.

---

# 0. Executive decision

SlipLabz V1 is a WNBA-only player-prop research application designed to replace the manual workflow of moving between sportsbook screens, stat sites, spreadsheets, social feeds, and pick'em applications.

It does not compete by covering every league, every market, or every possible statistic.

It competes by making one recurring research job substantially easier and more transparent:

> Show the current WNBA prop market, the exact differences across books, the player's verified history around a line, how the market has moved, and the limitations of the evidence in one trustworthy workflow.

The product is **market intelligence and research**, not betting advice.

The commercial model is one paid tier at **$7.99 per month**, plus a useful limited free tier. Paid feature enforcement is added near the end of the build after the core product is functional and testable.

V1 contains:

1. Today's Props Board
2. Prop Research View
3. Compare Your Line
4. Player Pages
5. Daily Brief integration
6. Account, entitlement, freshness, methodology, and failure-state infrastructure

The initial verified markets are:

- Points
- Rebounds
- Assists
- Made three-pointers

PRA and other combinations are deferred unless current-line and real historical-line coverage independently pass verification.

The technical architecture is locked:

- **BALLDONTLIE** is canonical for WNBA players, teams, games, final status, completed player statistics, and current availability context.
- **The Odds API** is canonical for current pregame sportsbook and pick'em lines.
- SlipLabz owns provider-independent internal identities, normalization, observed history, research calculations, workflow, presentation, and methodology.
- PrizePicks and Underdog remain separate from conventional sportsbook consensus.
- The product never silently estimates missing provider data.

This specification is authorized for implementation now. Agents may proceed through the approved ticket sequence, halting at the review checkpoints defined in this document.

---

# 1. Product thesis

## 1.1 Primary positioning

**The deepest transparent WNBA player-prop research workflow available to an individual subscriber.**

One-line product description:

> WNBA lines, book comparisons, verified real-line history, movement, and player context in one research workspace — market research, not betting advice.

## 1.2 Competitive goal

SlipLabz should win by combining five advantages that broad multi-sport tools usually weaken:

### Depth before breadth

- WNBA only.
- Small verified market set.
- More care around player identity, expansion teams, sparse markets, and coverage gaps.
- No unsupported feature parity.

### Workflow before data volume

The product organizes information around the user's research sequence:

1. What is offered today?
2. What are books showing?
3. Where do lines differ?
4. What has the player done around this threshold?
5. How has the line changed?
6. How fresh and complete is the evidence?

### Transparent incompleteness

The product explicitly labels:

- stale data;
- incomplete book coverage;
- unresolved identities;
- missing historical lines;
- low sample size;
- unavailable consensus;
- one-sided offerings;
- provider failures.

Missing information is never filled with a pseudo-line, guessed status, inferred injury recovery, or model output.

### Proprietary observed history

SlipLabz stores every permitted observed market snapshot and change from launch forward.

This creates a growing first-party historical archive of:

- first observed lines;
- current lines;
- confirmed removals;
- book additions and disappearances;
- point changes;
- price changes;
- final pregame observations.

This archive becomes more valuable each slate without requiring a predictive model.

### Brief and app reinforce each other

The Daily Brief remains the recurring curated artifact and distribution engine.

The app is the self-directed research workspace.

The Brief creates the habit. The app creates depth. Shared metrics must come from the same computation layer.

## 1.3 Strategic wedge

The V1 wedge is **Compare Your Line**.

A user can enter a line seen elsewhere and immediately receive:

- current sportsbook consensus;
- current book count;
- difference between the entered line and consensus;
- historical results against the entered threshold;
- averages, median, pushes, and sample size;
- current line movement and freshness.

This serves sportsbook and pick'em users without requiring SlipLabz to ingest every external platform.

## 1.4 What SlipLabz does not sell

SlipLabz does not sell:

- picks;
- recommended sides;
- model probabilities;
- expected value;
- guarantees;
- stake sizing;
- bet slips;
- wager execution;
- a standalone raw-data feed.

SlipLabz sells:

- organization;
- normalization;
- transparent calculations;
- line-history observations;
- cross-book comparison;
- verified historical context;
- saved research time;
- a repeatable workflow.

---

# 2. Authority hierarchy

When two documents conflict, use this order:

1. This complete specification
2. UX/UI sub-spec (`SLIPLABZ_V1_UX_UI_SUBSPEC_v1_3.md`) for interface, interaction, responsive, accessibility, and UX-copy matters
3. Audited provider sub-specs for provider-specific technical contracts
4. Existing explicitly locked repository authorities
5. Approved individual ticket
6. Current implementation
7. Agent assumptions

An authority counts as "explicitly locked" only when the document itself carries an authoritative status or version declaration. A filename alone does not establish locked status; an undeclared document is treated as current-implementation context, not as a binding authority.

An agent may not use current code behavior to override this specification.

An agent may not silently resolve a genuine ambiguity. It must halt and report the conflict.

## 2.1 Binding downstream authorities

The following remain detailed technical authorities:

- `SLIPLABZ_BALLDONTLIE_V1_DATA_SUBSPEC_AUDITED.md`
- `SLIPLABZ_ODDS_API_V1_DATA_SUBSPEC_AUDITED.md`

This specification summarizes their product-relevant contracts. It does not invalidate their detailed audit evidence.

## 2.2 Active implementation policy

The SlipLabz V1 build is authorized to proceed now.

The implementation sequence is:

1. audit the existing repository;
2. establish canonical identities and provider mappings;
3. implement both ingestion foundations;
4. implement observed-line history and shared computations;
5. build the core research surfaces;
6. validate the end-to-end product;
7. add and enforce paid feature locks near the end of the build;
8. complete release hardening and provider-rights approval.

The product should be built as one coherent application rather than as a permanently separate “free product” and “paid product.”

During the earlier infrastructure and product-surface phases:

- developers may use internal/admin access to test the complete experience;
- paid-only capabilities do not need to be artificially blocked before the entitlement layer exists;
- free-versus-paid behavior must still be represented in requirements and test fixtures;
- no customer-facing production deployment may expose paid features without server-side entitlement enforcement.

The entitlement and paywall phase is deliberately later in the sequence so the underlying research product can be built and validated before access rules obscure defects.

There is no subscriber-count prerequisite for implementation.


## 2.3 Commercial provider-rights gate

Technical availability does not itself authorize paid production use.

Before customer-facing launch, each provider must be approved for:

- commercial display;
- caching;
- raw-response retention;
- normalized-data retention;
- self-observed historical line storage;
- derived metrics and consensus;
- attribution;
- redistribution limits;
- bulk export restrictions.

If BALLDONTLIE rights are not approved, the statistics adapter must be replaceable without changing product definitions.

**Environment definitions.** These terms are distinct throughout this specification:

- **Local/development:** a developer machine or ephemeral environment with no external customers and no production data.
- **Internal/admin:** an authenticated environment used by the team to exercise the complete product, including paid capabilities, before the entitlement layer is active.
- **Access-controlled staging:** a non-public or credential-gated deployment used for validation. It is not a customer-facing launch even when it runs production-like data.
- **Customer-facing launch:** a public deployment that accepts real external customers and real payment. The commercial provider-rights gate in Section 2.3, the external-customer path in Section 17.2, and the V1-10 launch approval all refer to this environment. Local, internal, and access-controlled staging environments are not a customer-facing launch.

---

# 3. Non-negotiable product invariants

## 3.1 No predictive model in V1

No V1 product surface reads or displays:

- projections;
- model probabilities;
- simulated outcomes;
- model edges;
- ranked picks;
- graded bets;
- expected return.

A future model may not be added through an implementation ticket. It requires a product-spec amendment.

## 3.2 Real lines only for historical line metrics

Historical line-based metrics use only verified historical closing lines.

Never substitute:

- season average;
- current line;
- user-entered line;
- inferred line;
- modeled line;
- neighboring game's line.

If no verified closing line exists, the game is excluded from real-line metrics.

## 3.3 No performance claims

SlipLabz never says or implies that:

- the product beats the market;
- a board or filter identifies winners;
- a user should wager a side;
- a strategy is profitable;
- historical frequency predicts guaranteed future outcomes.

## 3.4 Paywall gates depth, not truth

Methodology, timestamps, sample-size rules, and failure states are never hidden behind the paywall.

Paid access may unlock:

- more rows;
- more books;
- deeper history;
- charts;
- multiple watches;
- richer filters;
- saved research state.

It may not unlock a more honest explanation of the same metric.

## 3.5 Provider facts are configuration, not permanent product truth

The following must be configuration-backed and re-verifiable:

- bookmaker keys;
- provider prices;
- subscription-tier names;
- rate limits;
- polling costs;
- update intervals;
- supported markets.

## 3.6 Launch historical seeding (current season)

The V1 architecture must support seeding verified current-season historical closing lines before customer launch.

The required outcome is:

- attempt a current-season seed after the closing-line methodology and storage contract are implemented;
- use the seed for every market, book, and date slice that passes coverage and provider-rights review;
- fall back to forward-only self-observation for unsupported or unapproved slices;
- show the resulting coverage honestly.

The core application build must not halt merely because provider-rights review or historical coverage is still unresolved. Historical seeding is a prelaunch data-readiness track, not a prerequisite for building current ingestion, computations, or product surfaces.

Non-negotiable constraints:

- **Verified close boundary only.** Historical requests use the canonical close boundary defined in Section 7.10. The provider snapshot must be the closest available snapshot at or before that boundary.
- **Active-at-close requirement.** A source offering qualifies only if it is present in that final historical snapshot. The importer does not walk backward to resurrect a line that disappeared before close.
- **Sportsbooks only.** PrizePicks, Underdog, and other DFS/pick'em sources are not used to seed sportsbook historical-line metrics.
- **No approximation.** Missing games, players, markets, sources, points, or snapshots are excluded. Never substitute a later snapshot, a current line, an average, an inferred line, or a neighboring game.
- **Typed provenance.** Seeded records use `backfilled_historical`. Forward observations use `self_observed`. Backfilled data never creates first-observed timestamps, opening claims, or movement-from-first-observed history.
- **Historical isolation.** Historical responses retain their provider snapshot time separately from retrieval time and cannot enter current-line selection.
- **Real observed point.** The product-wide historical result uses the canonical observed closing point defined in Section 7.10.2. It never uses an interpolated median that no sportsbook offered.
- **Equal metric treatment.** Once a canonical closing point is valid, `backfilled_historical` and `self_observed` rows receive identical treatment in the historical calculations in Section 14.
- **Coverage and rights gated.** Seeding occurs only where historical WNBA player-prop coverage and commercial retention/display rights are confirmed. Unsupported or unapproved slices remain missing and are labeled as such.
- **Current season scope.** V1 seed scope is the season active at the time of launch. Prior seasons remain optional later work.

Release readiness requires one of the following to be documented:

1. the compliant current-season seed completed for supported slices; or
2. a reviewed forward-only disposition explaining which coverage or provider-rights gate prevented seeding.

---

# 4. Target user and job-to-be-done

## 4.1 Primary user

A WNBA prop researcher who currently moves among:

- sportsbook applications;
- pick'em applications;
- player game logs;
- WNBA stat sites;
- spreadsheets;
- social feeds;
- manual notes.

The user may place wagers elsewhere. SlipLabz does not accept or transmit wagers.

## 4.2 Core job

> When I encounter a WNBA player-prop line, help me quickly understand the current market, the player's verified history around that threshold, the line's movement, and the limitations of the evidence so I can conduct my own research.

## 4.3 Secondary jobs

- Scan the entire WNBA slate.
- Compare books at an exact line.
- Find where sportsbook lines disagree.
- Investigate a player in depth.
- Enter an external line without requiring source ingestion.
- Move from a Daily Brief item into deeper research.
- Return later and understand what changed.

---

# 5. V1 surfaces

## 5.1 Today's Props Board

The flagship slate-wide research table.

One primary row represents:

`internal_game_id + internal_player_id + canonical_market_key`

The row displays:

- player;
- team;
- opponent;
- home/away;
- scheduled game time;
- canonical market;
- current sportsbook line consensus;
- minimum and maximum sportsbook line;
- eligible sportsbook count;
- count at each exact point;
- first observed consensus;
- open-to-current movement;
- freshness state;
- availability context;
- L5/L10/L20/season real-line record where coverage exists;
- actual eligible sample size;
- season, L5, and L10 result averages;
- expandable per-book details.

### Required board interactions

- Search player.
- Search team.
- Filter event.
- Filter team.
- Filter market.
- Filter freshness.
- Filter eligible-book count.
- Sort any approved column.
- Expand book detail.
- Open Prop Research View.
- Preserve filters and scroll position when returning.

### Board detail expansion

For each eligible source:

- bookmaker title;
- bookmaker key internally;
- line;
- Over price;
- Under price;
- provider market timestamp;
- SlipLabz observation timestamp;
- offering completeness;
- stale state.

PrizePicks and Underdog appear in a separate pick'em area, never inside sportsbook consensus.

## 5.2 Prop Research View

A page or drawer for one:

`game + player + market`

Required modules:

### Current market summary

- consensus line;
- line range;
- eligible book count;
- exact-point distribution;
- current freshness;
- last successful observation;
- latest poll state.

### Book grid

- every eligible conventional sportsbook quote;
- exact line;
- Over and Under prices;
- exact-line best price highlighting;
- one-sided or incomplete status;
- stale status;
- source timestamp.

### Movement

Before close:

- first observed to current;
- book-level movement;
- consensus movement;
- added and removed books;
- added and removed points;
- price-only movement.

After close:

- first observed to final observed pregame line;
- closing line status;
- coverage caveat when polling did not capture true market open.

### Historical real-line record

For L5, L10, L20, and season:

- Over count;
- Under count;
- Push count;
- eligible `n`;
- incomplete-window label;
- coverage start;
- verified closing line for every included game;
- final result;
- margin to line.

### Player result distribution

- recent game results;
- season game results;
- selected threshold;
- median;
- average;
- range;
- distribution chart;
- no probability claim.

### Context

- current availability report;
- observed-at timestamp;
- source wording;
- opponent history with `n`;
- home/away only if independently verified and approved.

## 5.3 Compare Your Line

User input:

- player;
- market;
- line;
- optional source label.

Output:

- clearly labeled user-entered line;
- current sportsbook line consensus;
- eligible sportsbook count;
- line range;
- numerical difference:
  - entered line above consensus;
  - entered line below consensus;
  - entered line equal to consensus;
- L5/L10/L20/season results against the entered threshold;
- pushes;
- actual sample size;
- average and median result;
- recent result distribution;
- current sportsbook movement and freshness;
- explicit notice that SlipLabz does not verify the external source or availability.

### V1 persistence behavior

Free:

- no saved external lines;
- one active email watch only if the acquisition flow is enabled.

Paid:

- multiple watched lines;
- movement threshold preferences;
- email digest;
- line-history access.

Saved watches are research alerts, not recommendations.

## 5.4 Player Page

Required modules:

- canonical identity;
- current team;
- reviewed display alias;
- current availability context;
- today's supported props;
- recent game logs;
- season game logs;
- PTS, REB, AST, and 3PM averages;
- L5 and L10 averages;
- real historical line results by market;
- selected current prop line history;
- opponent history with explicit sample size;
- data freshness and coverage.

## 5.5 Daily Brief integration

The Brief remains the curated daily product.

Required integration:

- Brief rows deep-link to board state.
- Player cards deep-link to Player Page.
- Movement items deep-link to the relevant Prop Research View.
- Shared metric computation comes from one canonical service or materialized computation.
- The Brief and app may format differently, but may not calculate the same metric differently.

---

# 6. Market scope

## 6.1 Launch markets

Locked V1 markets:

| Product label | Canonical market | BALLDONTLIE field |
|---|---|---|
| Points | `player_points` | `pts` |
| Rebounds | `player_rebounds` | `reb` |
| Assists | `player_assists` | `ast` |
| Made threes | `player_threes` | `fg3m` |

## 6.2 Conditional markets

PRA may be added only if:

- current line coverage is verified;
- historical closing-line coverage is sufficient;
- provider identity is stable;
- the market passes the same acceptance suite as the four launch markets.

## 6.3 Excluded markets

V1 excludes:

- alternate-line browsing as a primary surface;
- milestone props;
- live props;
- quarter and half props;
- blocks;
- steals;
- turnovers;
- specialty combinations;
- double-double;
- triple-double;
- model-derived markets.

The storage model may preserve simultaneous provider lines without promoting them into the V1 primary row.

---

# 7. Canonical definitions

## 7.1 Internal identity

SlipLabz uses provider-independent IDs for:

- player;
- team;
- game;
- source;
- market.

Provider IDs remain external identities.

## 7.2 Event mapping

An Odds API event maps to a BALLDONTLIE game using:

- WNBA competition;
- ordered home and away teams;
- reviewed aliases;
- season;
- commence-time comparison;
- no competing candidate.

Preferred time match:

- exact;
- up to 15 minutes when matchup is unique;
- larger difference requires review.

Unresolved events stay in staging and do not enter product calculations.

## 7.3 Player mapping

Mapping order:

1. existing reviewed provider mapping;
2. normalized full name plus event/team context;
3. reviewed alias;
4. manual review.

Name-only permanent matching is prohibited.

## 7.4 Quote

A normalized quote represents one provider outcome:

`game + player + market + source + point + side + snapshot`

Stored fields include:

- point;
- price;
- source timestamp;
- SlipLabz observed time;
- source class;
- multiplier;
- promotion type;
- raw reference;
- eligibility state.

## 7.5 Primary research row

One board row per:

`game + player + market`

It may summarize multiple sportsbook lines.

## 7.6 Sportsbook line consensus

Line consensus summarizes one current eligible main observation per conventional sportsbook.

Required outputs:

- median point;
- minimum point;
- maximum point;
- count at each point;
- eligible source count.

Different point values remain distinct offered products.

## 7.7 Price comparison

Price comparison is allowed only for:

`same game + same player + same market + same side + exact same point`

Prices at different points are never ranked as interchangeable.

## 7.8 First observed line

The first eligible SlipLabz observation.

It is not guaranteed to be the bookmaker's true opening line.

Customer wording should use:

- **First observed**
- **First seen by SlipLabz**

Do not use unqualified **opening line** unless provider evidence establishes true opening.

## 7.9 Current line

The latest eligible, fresh, pregame observation.

## 7.10 Closing line

The close boundary is:

1. verified actual game start when available;
2. otherwise scheduled tip with the approved grace rule;
3. never an abandoned start time for a postponed or rescheduled game.

### 7.10.1 Source closing quote

A source closing quote is the eligible conventional-sportsbook offering present in the last successful provider snapshot at or before the close boundary.

Rules:

- the snapshot effective time must be at or before close;
- the offering must be present in that snapshot;
- the player, game, market, side, and point must be resolved;
- DFS/pick'em sources are excluded;
- a line removed before the final snapshot is not resurrected from an older snapshot;
- a failed poll does not manufacture a close;
- a snapshot more than 10 minutes before the close boundary is ineligible and receives `close_capture_stale`; the threshold is configuration-backed but may not be loosened without methodology review.

For historical API data, the provider returns the closest snapshot equal to or earlier than the requested close-boundary timestamp. That provider snapshot time is stored as `provider_snapshot_at`; the time SlipLabz retrieved it is stored separately as `retrieved_at`.

### 7.10.2 Canonical historical closing point

Historical L5/L10/L20/season results require one real, observed point per game/player/market.

Selection method:

1. gather one eligible source closing point per conventional sportsbook;
2. if exactly one eligible sportsbook exists, use that observed point and label coverage `single_book`;
3. if two or more sportsbooks exist, select the unique modal observed point;
4. if no point has a unique highest count, mark `closing_consensus_unresolved` and exclude that game from aggregate real-line windows.

The selected point must have been offered by at least one eligible sportsbook. An arithmetic median that falls between offered points is never used as a historical real line.

Store and surface:

- canonical closing point;
- selection method;
- total eligible sportsbook count;
- count of sportsbooks at the selected point;
- source-level closing quotes;
- provenance;
- coverage state.

## 7.11 Historical real-line game

A game is eligible for a historical line statistic only when it has:

- approved player identity;
- approved game identity;
- final status;
- eligible played-game result;
- at least one eligible source closing quote for the same player and market;
- a canonical historical closing point selected under Section 7.10.2;
- no unresolved void, event defect, or tied closing consensus.

## 7.12 Push

Final result equals line.

Pushes:

- shown separately;
- excluded from Over and Under percentages;
- excluded from streak direction.

## 7.13 Historical windows

L5/L10/L20 means the most recent 5/10/20 eligible real-line games.

It does not mean the player's last appearances when line coverage is missing.

Always show actual `n`.

## 7.14 User-entered threshold metric

Compare Your Line calculations are threshold analyses against a user input.

They are not historical sportsbook-line metrics and must be stored and labeled separately.

## 7.15 Availability state

A player may be:

- currently reported;
- absent from latest completed report;
- stale feed;
- unresolved player;
- source unavailable.

Absence from the feed is not proof that the player is healthy or cleared.

---

# 8. Data-provider ownership

## 8.1 BALLDONTLIE ownership

Canonical for:

- players;
- active players;
- teams;
- games;
- final status;
- completed player statistics;
- current availability context.

## 8.2 The Odds API ownership

Canonical for:

- current pregame sportsbook lines;
- current pregame prices;
- current PrizePicks lines;
- current Underdog lines;
- provider market timestamps;
- observed line-history snapshots.

## 8.3 SlipLabz ownership

Canonical for:

- internal identities;
- provider mappings;
- aliases;
- normalized records;
- source classifications;
- eligibility;
- first observed history;
- current snapshot selection;
- closing snapshot selection;
- movement events;
- consensus;
- user-entered threshold calculations;
- product copy;
- entitlement.

---

# 9. BALLDONTLIE ingestion requirements

The audited BALLDONTLIE sub-spec is authoritative for detailed endpoint and error behavior.

## 9.1 Required endpoints

- `/wnba/v1/players`
- `/wnba/v1/players/active`
- `/wnba/v1/teams`
- `/wnba/v1/games`
- `/wnba/v1/player_stats`
- `/wnba/v1/player_injuries`

## 9.2 Pagination

- Cursor-based.
- `per_page=100`.
- Follow exact `meta.next_cursor`.
- Never derive cursors.
- Partial traversal cannot advance completeness watermark.

## 9.3 Player-game key

Natural source key:

`provider + provider_player_id + provider_game_id`

Upsert idempotently.

## 9.4 Minutes

States:

- numeric greater than zero: played;
- numeric zero: DNP/non-participation;
- null, empty, `"--"`, or unknown: unresolved.

Unresolved minutes are excluded from historical calculations.

No hidden minimum-minutes rule.

## 9.5 Counting-stat normalization

For finalized played rows, verified null counting fields may normalize to zero.

Raw and normalized values are both retained.

## 9.6 Final status

BALLDONTLIE `status` is authoritative.

Do not infer finality from period, clock, or scheduled time.

## 9.7 Team registry

Provider team ID is authoritative.

The registry contains:

- current teams;
- historical teams;
- exhibition teams;
- national teams;
- placeholders.

Application classification is versioned.

## 9.8 Active players

Active roster is current-state discovery, not permanent identity.

A missing player is not deleted.

A failed or partial pull cannot mark unseen players inactive.

## 9.9 Post-final reconciliation

For each final game:

1. first successful stats pull after final;
2. approximately two hours later;
3. following day;
4. weekly season correction sweep.

Material corrections invalidate and recompute dependent metrics.

## 9.10 Availability

Store:

- source status;
- source comment;
- return-date text;
- first seen;
- last seen;
- observed changed at;
- current presence state.

Do not infer recovery from disappearance.

## 9.11 Default cadence

- Teams: daily.
- Active players: daily.
- Historical players: initial backfill and weekly.
- Games more than 24 hours away: every 6 hours.
- Games inside 24 hours: hourly.
- Games inside 2 hours: every 15 minutes.
- Believed-live games: every 2 minutes.
- Availability inside 6 hours of games: every 15 minutes.
- Other in-season availability: hourly.

---

# 10. The Odds API ingestion requirements

The audited Odds API sub-spec is authoritative for detailed quota, source, and response behavior.

## 10.1 Event discovery

Endpoint:

`/v4/sports/basketball_wnba/events`

- free;
- returns pre-match and in-play event identity;
- does not establish completion;
- may be refreshed independently of paid odds polling.

## 10.2 Event odds

Endpoint:

`/v4/sports/basketball_wnba/events/{eventId}/odds`

Request the four V1 markets.

Use explicit bookmaker keys, not `regions=us`.

## 10.3 Initial source configuration

Conventional sportsbooks:

- `draftkings`
- `fanduel`
- `betmgm`
- `williamhill_us`
- `fanatics`
- `betrivers`
- `hardrockbet`
- `espnbet`

Pick'em/DFS:

- `prizepicks`
- `underdog`

Configuration does not imply live coverage.

## 10.4 Source classes

- `sportsbook`
- `dfs_pickem`
- `unknown`

Only `sportsbook` is eligible for sportsbook consensus.

## 10.5 Deduplication

Exact duplicate candidate grouping uses:

- event;
- source;
- market;
- normalized player;
- side;
- point;
- price;
- provider `last_update`.

Equivalent duplicates become one canonical observation with retained raw references.

Conflicting duplicates are quarantined.

## 10.6 One-sided offerings

Valid states include:

- two-sided complete;
- Over only;
- Under only;
- multi-line;
- conflicting;
- unresolved.

Do not fabricate a missing side.

## 10.7 PrizePicks

- Excluded from sportsbook consensus.
- Observed symmetric `-137` prices are synthetic/display values.
- Do not use those prices for implied probability or best price.
- Null multiplier does not identify standard, Goblin, or Demon.
- Promotion type defaults to unknown.

## 10.8 Underdog

- Excluded from sportsbook consensus.
- Observed symmetric `-137` prices are synthetic/display values.
- `multiplier=1.0` remains uninterpreted provider metadata.
- One-sided offerings are valid.
- Missing market coverage is event-specific.

## 10.9 Quota

Expected event-odds cost:

`billable markets × ceil(explicit bookmaker count / 10)`

Observed response header is authoritative:

- `x-requests-last`
- `x-requests-used`
- `x-requests-remaining`

Use quota alarms and circuit breakers.

## 10.10 Successful empty versus failed poll

Failed poll:

- preserve last valid current data;
- show failure/staleness;
- do not create removal evidence.

Successful schema-valid empty poll:

- store a zero-coverage observation;
- remove prior data from current status;
- preserve prior non-empty snapshot as history;
- contribute to disappearance confirmation.

## 10.11 Provisional cadence

Until repeated snapshots finalize policy:

- more than 6 hours: every 60 minutes;
- 2–6 hours: every 30 minutes;
- 30–120 minutes: every 10 minutes;
- inside 30 minutes: every 5 minutes;
- stop pregame polling at event start boundary.

## 10.12 Provisional freshness

- Fresh: provider timestamp age <= 10 minutes.
- Aging: >10 and <=30 minutes.
- Stale: >30 minutes.
- Failed latest poll: separate flag.

These are product thresholds, not provider guarantees.

## 10.13 Historical seed requests

Historical seeding uses:

1. the historical events endpoint to discover historical Odds API event IDs for canonical final games;
2. the historical event-odds endpoint to request the closest snapshot at or before the canonical close boundary.

Historical player-prop event-odds requests have a different quota multiplier from current event odds. Forecast:

`10 × requested markets × bookmaker-region equivalents × events`

Bookmaker-region equivalents use the same region model as Section 10.9 (`ceil(explicit bookmaker count / 10)`). The multiplier is therefore driven by region-equivalents, not the raw book count: up to ten conventional sportsbook keys count as one region-equivalent, and a book count above ten increases the region-equivalent and the forecast accordingly.

For the default eight conventional sportsbook keys and four launch markets, the forecast is **40 credits per event** before any zero-cost behavior reflected by response headers.

Rules:

- use only canonical final games and conventional sportsbook keys;
- reject a returned snapshot more than 10 minutes before the close boundary;
- record `x-requests-last` as authoritative;
- retain historical event discovery and mapping evidence;
- store provider snapshot time separately from retrieval time;
- mark request kind `historical_query` and provenance `backfilled_historical`;
- never allow a historical query into current-line or movement selection.

---

# 11. Canonical storage model

The implementation may adapt existing tables, but final behavior must support these entities.

## 11.1 Core identities

### `players`

- internal_player_id
- canonical display name
- normalized name
- current team
- status
- created_at
- updated_at

### `provider_players`

- provider
- provider_player_id
- internal_player_id
- raw name fields
- normalized name
- current provider team
- first_seen
- last_seen
- mapping_state
- alias_version

### `teams`

- internal_team_id
- display name
- abbreviation
- current-franchise state
- lineage metadata

### `provider_teams`

- provider
- provider_team_id
- internal_team_id
- raw metadata
- classification
- first_seen
- last_seen

### `games`

- internal_game_id
- season
- season_type
- home_team_id
- away_team_id
- scheduled_start_utc
- actual_start_utc
- canonical status
- postseason
- created_at
- updated_at

### `provider_games`

- provider
- provider_game_id
- internal_game_id
- raw teams
- raw commence time
- mapping state
- time delta
- first_seen
- last_seen

## 11.2 Statistics

### `player_game_stats`

- internal_game_id
- internal_player_id
- provider source key
- player team
- opponent
- home/away
- raw minutes
- parsed minutes
- minutes status
- raw stats
- normalized stats
- eligibility state
- quarantine reason
- source hash
- first observed
- last verified
- last changed
- normalization version

## 11.3 Availability

### `availability_snapshots`

- player
- source
- source status
- source comment
- source return-date text
- observed_at
- first_seen
- last_seen
- changed_at
- current presence state
- raw reference

## 11.4 Odds ingestion

### `odds_ingestion_runs`

- provider
- request kind: `current_poll` or `historical_query`
- event
- requested effective timestamp when historical
- requested markets
- requested sources
- started_at
- completed_at
- HTTP status
- quota expected
- quota observed
- result state
- raw response reference

### `market_snapshots`

Identity:

A synthetic `market_snapshot_id` is primary. Within one ingestion run, enforce uniqueness on:

`ingestion_run_id + provider_event + source + market`

The effective provider time is stored as `provider_snapshot_at` for historical queries or `observed_at` for current polls; it is not used as a nullable composite primary key.

Fields:

- internal game
- source class
- request kind
- provenance: `self_observed` or `backfilled_historical`
- provider snapshot time when historical
- provider market `last_update`
- retrieved_at
- observed_at for forward polling only
- freshness for current polling only
- row count
- duplicate count
- schema state
- raw reference

Historical snapshots are never eligible for current snapshot selection or movement generation.

### `market_offerings`

Identity within snapshot:

`game + player + source + market + point + side`

Fields:

- price
- multiplier
- promotion type
- offering state
- duplicate count
- source row references
- mapping state
- product eligibility

### `movement_events`

- prior snapshot
- current snapshot
- game
- player
- source
- market
- change type
- prior point
- current point
- prior price
- current price
- detected_at
- provider timestamp change
- confidence

## 11.5 Derived research

### `current_market_rows`

Materialized or computed:

- game
- player
- market
- line consensus
- line range
- point distribution
- eligible sportsbook count
- current source rows
- freshness
- first observed consensus
- movement

### `historical_line_results`

- game
- player
- market
- canonical closing point
- closing selection method
- total eligible sportsbook count
- sportsbook count at selected point
- source-level closing quote references
- provenance
- provider snapshot time
- final result
- Over/Under/Push
- margin
- coverage state
- computation version

### `research_window_metrics`

- player
- market
- reference date
- window type
- eligible `n`
- Over/Under/Push
- average
- median
- coverage status
- computation version

---

# 12. Computation ownership

Every metric has one owner.

## 12.1 Canonical computation service

The same service or shared SQL definition owns:

- current-snapshot eligibility, which excludes every `historical_query` and `backfilled_historical` record;
- consensus line;
- line range;
- exact-point counts;
- first observed;
- current line;
- closing line;
- movement;
- historical Over/Under/Push;
- L5/L10/L20/season windows;
- average;
- median;
- streak;
- sample-size labels.

The web application and Brief consume these outputs.

They do not independently reimplement the formulas.

## 12.2 Recalculation triggers

Recompute affected metrics when:

- player identity mapping changes;
- event mapping changes;
- a final stat changes;
- minutes status changes;
- a historical closing line changes;
- current odds snapshot changes;
- eligibility changes;
- normalization version changes.

## 12.3 Versioning

Each derived record includes:

- computation version;
- input snapshot/version references;
- calculated_at;
- coverage state.

---

# 13. Movement and disappearance

## 13.1 Movement types

- point changed;
- Over price changed;
- Under price changed;
- side added;
- side removed;
- point added;
- point removed;
- player added;
- player removed;
- market added;
- market removed;
- source added;
- source removed;
- duplicate state changed;
- provider timestamp changed;
- unchanged.

## 13.2 Point transition

A point move is represented as:

- old point removed;
- new point added;
- linked transition when unambiguous.

## 13.3 Disappearance

States:

- not returned in latest successful snapshot;
- confirmed removed;
- source unavailable;
- market unavailable;
- event no longer pregame;
- failed latest poll.

Provisional confirmation:

- two consecutive successful omissions;
- unless event has started;
- unless entire source or market failed.

Repeated-snapshot validation may tune this threshold.

## 13.4 First observed and close

The app must preserve:

- first observed source offering;
- first observed consensus;
- last current offering;
- final eligible pregame observation.

Never backfill a false first observed timestamp from a later historical query.

---

# 14. Historical calculations

## 14.1 Played-game eligibility

Include only:

- final game;
- valid identity;
- numeric minutes greater than zero;
- normalized required stat;
- no quarantine.

## 14.2 Real-line eligibility

Additionally require:

- at least one source closing quote for the exact player and market;
- a canonical observed closing point selected under Section 7.10.2;
- approved event;
- eligible conventional sportsbook source methodology;
- no unresolved close defect or tied closing consensus.

## 14.3 Windows

For each requested window:

- traverse eligible games in reverse chronological order;
- stop at requested count;
- show actual `n`;
- label incomplete if `n` is smaller.

## 14.4 Percentages

Over rate:

`Over / (Over + Under)`

Push excluded.

Never imply predictive probability.

## 14.5 Streak

A streak stops at:

- opposite result;
- unresolved coverage gap;
- missing real line;
- invalid game.

---

# 15. Freshness, failures, and degraded modes

## 15.1 General rule

The product must prefer an honest unavailable state over stale information presented as current.

## 15.2 Odds failures

On failed latest poll:

- keep last valid snapshot;
- display actual timestamp;
- flag failed latest poll;
- stop calling it current when stale;
- alert operator.

## 15.3 BALLDONTLIE failures

- Partial pagination never marks import complete.
- Failed roster import never marks missing players inactive.
- Failed availability import never changes player presence state.
- Failed game-status refresh cannot finalize a game.

## 15.4 Provider outage

Required UI behavior:

- banner or inline notice;
- last successful verification time;
- affected provider or module;
- no fabricated zero;
- no hidden stale state.

## 15.5 Postponed and canceled games

- Do not finalize close against abandoned tip.
- Retain observations with event-state history.
- Reconcile rescheduled event mapping.
- Exclude canceled game from historical result calculations.

## 15.6 Unknown schema

A 200 response with an invalid schema is not accepted as valid data.

- retain raw response;
- quarantine;
- alert;
- preserve prior current state subject to freshness.

---

# 16. Free and paid product boundaries

## 16.1 Price

The full SlipLabz product is priced at:

> **$7.99 per month**

The subscription renews monthly until canceled.

No alternate introductory price is part of the V1 authority unless added through a later business amendment.

## 16.2 Access strategy

SlipLabz has:

- a useful free tier;
- one paid tier providing access to the full product.

The free tier should demonstrate the product's usefulness without allowing complete reconstruction of paid research depth.

The paid tier unlocks the complete research workflow.

## 16.3 Free features

The initial free tier includes:

- limited Today's Props Board preview;
- player and team search;
- a limited number of Compare Your Line uses;
- sportsbook consensus line;
- eligible sportsbook count;
- basic freshness information;
- L5 and season threshold summary where available;
- methodology and data-coverage explanations;
- free Daily Brief excerpt;
- one active watched line when watch delivery is enabled.

Exact daily limits and preview-row counts are configuration values finalized during the entitlement ticket (V1-9); earlier tickets exercise these features with clearly labeled provisional fixture values.

## 16.4 Paid features - $7.99/month

Paid access includes:

- full Today's Props Board;
- all supported games, players, and launch markets;
- complete sportsbook book grid;
- exact-line price comparison;
- L5/L10/L20/season detail;
- complete verified game-by-game real-line history;
- movement history;
- Player Pages;
- full Compare Your Line access;
- multiple watched lines;
- configurable movement thresholds;
- full Daily Brief access and delivery.

## 16.5 Timing of paid feature locks

Core research behavior should be implemented and tested before paid locks are enforced.

Required sequence:

1. build canonical data and computations;
2. build complete product surfaces;
3. verify the full experience through internal/admin access;
4. implement account, payment, and entitlement;
5. classify each protected capability as free or paid;
6. enforce restrictions server-side;
7. run free, paid, canceled, expired, and complimentary end-to-end tests.

Earlier tickets must not create throwaway client-only paywalls.

The final access rules are implemented in V1-9 after the core product surfaces exist.

**Two-stage enforcement.** Paid gating is delivered in two stages so earlier tickets can build honestly without throwaway paywalls:

- Before V1-9, the read path and product surfaces implement server-side capability filtering driven by an injected or fixture entitlement, expose the correct free and paid interface states, and pass deterministic free/paid fixture tests. These are entitlement-ready capability hooks, not client-only placeholders.
- During V1-9, that filtering is wired to real account-backed entitlement: Stripe synchronization, account states, server-side usage counters, protected APIs, and preview anti-enumeration.

**Provisional limit values.** Exact free preview-row counts and Compare Your Line usage limits are finalized as configuration in V1-9. Earlier tickets that test free/paid behavior use clearly labeled provisional fixture values, not final production limits.

## 16.6 Preview anti-enumeration

A free user must not reconstruct the full paid table through:

- repeated sorting;
- pagination;
- filter combinations;
- direct API calls;
- predictable row IDs.

The preview is a stable server-selected subset.

## 16.7 Entitlement authority

The server-side entitlement record is authoritative.

Protected data is never sent to an unauthorized client and merely hidden in the interface.

## 16.8 Truth is never paywalled

Methodology, timestamps, sample-size rules, freshness definitions, and failure states remain available to free users.

Paid access unlocks depth and workflow, not more honest disclosure.


# 17. Account, payment, and delivery

## 17.1 Required states

- anonymous;
- free registered;
- active paid;
- complimentary;
- past due;
- canceled but entitled through period;
- expired;
- refunded;
- internal/admin.

**Anonymous versus free-registered access.** Anonymous and free-registered are distinct states. Both receive the free capability subset defined in Section 16.3; the difference is identity and durability, not a different set of truthful metrics.

- Anonymous usage (for example the Compare Your Line free limit) is metered by a coarse server-side identifier such as session or request origin, is inherently weaker against evasion, and does not persist saved state such as a watched line.
- Free-registered usage is metered per account and may persist a limited amount of saved state.

Whether a free-registered account receives an identical or a modestly higher Compare limit than anonymous is an open commercial decision, fixed as configuration in V1-9. An implementing agent must not silently choose it; until it is set, tickets use a labeled provisional value.

## 17.2 Required end-to-end path

A new external customer can:

1. create or access account;
2. pay;
3. receive entitlement;
4. access full app;
5. receive documented Brief delivery;
6. cancel;
7. retain access through correct period;
8. lose access at correct time.

No operator-only knowledge may be required.

## 17.3 Brief delivery

Paid entitlement and private Brief access must reconcile through one documented workflow.

---

# 18. Copy, trust, and compliance

## 18.1 Forbidden product framing

Do not use:

- pick;
- lock;
- best bet;
- edge;
- expected value;
- profitable;
- guaranteed;
- confidence rating;
- smash;
- recommendation;
- should bet;
- model favorite.

Neutral factual phrases are allowed where unavoidable in methodology, but customer-facing copy must not imply advice.

## 18.2 Required labels

Where relevant, display:

- First observed;
- Current;
- Final observed pregame;
- User-entered line;
- Sportsbook consensus;
- Eligible books;
- Last checked;
- Provider timestamp;
- Sample size;
- Coverage incomplete;
- Source unavailable;
- Stale;
- Pick'em source.

## 18.3 Responsible-gambling footer

Every public product surface includes:

> This is market research, not betting advice. If you or someone you know has a gambling problem, call 1-800-GAMBLER.

## 18.4 Methodology

Public methodology must explain:

- providers;
- line consensus;
- first observed;
- closing line;
- pushes;
- historical windows;
- sample-size treatment;
- freshness;
- missing data;
- pick'em source separation.

---

# 19. Product analytics

## 19.1 Core product events

Track:

- board viewed;
- filters changed;
- book grid expanded;
- research view opened;
- player page opened;
- Compare Your Line submitted;
- watch created;
- paywall shown;
- upgrade started;
- upgrade completed;
- Brief deep link opened.

## 19.2 Trust and reliability events

Track:

- stale module shown;
- consensus unavailable;
- player mapping unresolved;
- event mapping unresolved;
- provider failure shown;
- coverage incomplete shown;
- historical window incomplete.

## 19.3 Success indicators

V1 success is measured through:

- paid activation;
- repeat weekly use;
- Compare Your Line use;
- Brief-to-app deep-link use;
- book-grid expansion;
- Player Page return use;
- watch creation;
- paid conversion.

Do not use wager outcomes as product performance claims.

---

# 20. Security and observability

## 20.1 Secrets

- server-side only;
- redacted request URLs;
- no keys in fixtures;
- no keys in client bundles;
- no keys in user-visible errors.

## 20.2 Raw-data traceability

Every displayed derived value must be traceable to:

- provider;
- raw response;
- ingestion run;
- normalized record;
- computation version.

## 20.3 Operational metrics

Monitor:

- provider success rate;
- request latency;
- page traversal completion;
- source coverage;
- market coverage;
- stale markets;
- duplicate groups;
- mapping failures;
- quota usage;
- correction events;
- entitlement failures.

## 20.4 Alerts

Distinct alerts for:

- provider outage;
- authentication failure;
- quota risk;
- schema drift;
- stale feed;
- incomplete pagination;
- mapping failure;
- computation mismatch;
- entitlement failure.

---

# 21. Agent execution protocol

This section is binding for all implementation agents.

## 21.1 Before coding

Each agent must:

1. read this complete specification;
2. read the relevant audited provider sub-spec;
3. inspect current repo authorities and schema;
4. list exact files expected to change;
5. restate acceptance criteria;
6. identify conflicts or missing authority;
7. halt before coding if a P0 ambiguity exists.

## 21.2 Ticket response format

Each ticket implementation must return:

- plan;
- authorities read;
- files changed;
- migrations added;
- tests run;
- acceptance criteria results;
- deviations;
- unresolved risks;
- commit hash if authorized;
- explicit halt state.

## 21.3 No silent invention

Agents must not invent:

- provider fields;
- source keys;
- table names that conflict with existing authorities;
- business decisions;
- paywall rules;
- freshness thresholds beyond the approved defaults;
- legal rights;
- market support.

## 21.4 Schema changes

Any schema change must include:

- migration;
- rollback or forward-fix strategy;
- constraints;
- indexes;
- provenance fields;
- compatibility impact;
- tests.

## 21.5 Idempotency

All ingestion and recomputation jobs must be safe to rerun.

## 21.6 Raw preservation

No normalization ticket may discard raw source evidence.

## 21.7 Halt conditions

An agent must halt when:

- provider response contradicts the sub-spec;
- current schema cannot preserve required identity;
- a legal gate is being treated as resolved without evidence;
- an existing authority conflicts with this spec;
- a migration would destroy historical data;
- a product metric cannot be computed honestly;
- a required test fixture is missing and production data would be mutated.

## 21.8 Scope control

No ticket may add:

- a new sport;
- a new launch market;
- live props;
- predictive modeling;
- pick recommendations;
- affiliate behavior;
- wager execution;
- hidden methodology.

---

# 22. Implementation sequence

The sequence is authorized to proceed now. Each phase must still halt at its stated review checkpoint.

## Phase V1-0 — Authority and repo readback

Deliverables:

- authority map;
- current schema inventory;
- current ingestion inventory;
- current product-surface inventory;
- gap matrix against this spec;
- no behavior change.

Halt for review.

## Phase V1-1 — Canonical identities

Deliverables:

- internal players, teams, and games;
- provider identity mappings;
- alias tables;
- mapping state;
- reconciliation queues;
- migration tests;
- complete contemporaneous event-mapping fixture.

Acceptance:

- no name-only permanent match;
- all current slate events map or quarantine;
- all current offered players map or quarantine.

## Phase V1-2 — BALLDONTLIE foundation

Deliverables:

- adapters;
- cursor traversal;
- teams;
- players;
- active roster;
- games;
- player stats;
- availability;
- ingestion runs;
- raw retention;
- watermarks;
- post-final reconciliation scheduler.

Acceptance:

- complete pagination;
- DNP/unresolved minutes behavior;
- final-state authority;
- correction-safe upserts;
- failure isolation.

## Phase V1-3 — Odds API foundation

Deliverables:

- event discovery;
- explicit source configuration;
- event odds polling;
- quota recording;
- raw snapshots;
- market snapshots;
- normalized offerings;
- deduplication;
- DFS source classification;
- freshness states;
- zero-coverage semantics.

Acceptance:

- all four markets parsed;
- exact duplicates deduplicated;
- conflicts quarantined;
- PrizePicks/Underdog excluded from sportsbook consensus;
- quota forecast reconciles to headers.

## Phase V1-4 — Closing and history

Deliverables:

- first observed;
- current selection;
- close boundary;
- final pregame observation;
- movement events;
- historical line results;
- L5/L10/L20/season calculations;
- recomputation hooks.

Acceptance:

- no pseudo-lines;
- pushes separated;
- actual `n`;
- post-final corrections recompute affected metrics;
- postponed games do not close incorrectly.

## Phase V1-4b — Current-season historical seed

This launch-preparation phase begins after V1-4 establishes the closing-line schema and selection method. It may run in parallel with V1-5 through V1-8 and does not block construction of the core product surfaces.

Deliverables:

- historical event discovery and mapping for canonical final games;
- historical quota budget;
- provider-rights and coverage disposition;
- compliant current-season sportsbook closing-line import where permitted;
- explicit `backfilled_historical` provenance;
- seed coverage report;
- forward-only waiver for unsupported or unapproved slices;
- no first-observed or movement records from historical queries.

Acceptance:

- current and historical snapshots cannot mix;
- every canonical historical result uses an actually observed point;
- stale close captures older than 10 minutes are excluded;
- historical event IDs come from the historical events endpoint;
- response-header quota cost reconciles to the historical forecast;
- the run is idempotent and resumable;
- the agent halts for seed-review approval.

## Phase V1-5 — Shared read model

Deliverables:

- canonical current market rows;
- research window metrics;
- Brief/app shared computation;
- protected server-side read path;
- methodology metadata.

Acceptance:

- identical metric outputs across Brief and app;
- the read path supports server-side capability filtering and passes free/paid fixture tests, with production account-backed enforcement activated in V1-9;
- source traceability.

## Phase V1-6 — Today's Props Board

Deliverables:

- board;
- search;
- filters;
- sorting;
- per-book expansion;
- freshness;
- unavailable states;
- free preview enforcement.

Halt for product review.

## Phase V1-7 — Prop Research View and Player Pages

Deliverables:

- market summary;
- book grid;
- movement;
- historical real-line record;
- charts;
- Player Page;
- availability context;
- Brief deep links.

## Phase V1-8 — Compare Your Line

Deliverables:

- validated input;
- threshold calculations;
- current consensus comparison;
- neutral copy;
- limits;
- watch creation if authorized.

## Phase V1-9 — Pricing, entitlement, and delivery

Deliverables:

- fixed $7.99/month subscription product;
- account states;
- Stripe synchronization;
- free-versus-paid capability matrix;
- server-side paid feature enforcement;
- protected access;
- cancellation;
- complimentary users;
- Brief delivery integration;
- end-to-end free and paid customer tests.

This is the phase where paid feature locks become active. Earlier phases build and test the complete research experience through internal/admin access.

## Phase V1-10 — Release hardening

Deliverables:

- provider outage drill;
- stale-state tests;
- quota circuit-breaker drill;
- accessibility review;
- responsive QA;
- performance test;
- methodology page;
- forbidden-copy scan;
- launch checklist.

---

# 23. Required ticket template

Every agent ticket derived from this spec must include:

## Mission

One sentence describing the user-visible or infrastructure result.

## Authority

Exact sections and documents the agent must read.

## Scope

Exact files, modules, tables, or services allowed.

## Forbidden changes

Explicitly list adjacent systems that must not change.

## Required behavior

Numbered, testable behavior.

## Data contracts

Keys, fields, states, timestamps, and lineage.

## Failure behavior

What happens on partial, empty, stale, invalid, or unavailable data.

## Tests

Unit, integration, migration, fixture, and end-to-end requirements.

## Acceptance criteria

Binary conditions.

## Deliverables

Files, reports, migrations, screenshots, or artifacts.

## Halt conditions

Conditions requiring review before continuing.

## Commit rules

Whether commit/push is authorized and prohibited commands.

---

# 24. Release acceptance criteria

V1 is release-ready only when all required criteria pass.

## 24.1 Authority and legal

- V1 implementation authorization remains active.
- Provider rights are documented.
- No unresolved P0 authority conflict.
- Data lineage is complete.

## 24.2 Data integrity

- All launch markets pass current-line parsing.
- Event and player mapping pass complete-slate tests.
- Historical line metrics contain no pseudo-lines or interpolated unoffered points.
- Historical query records cannot enter current-line or movement selection.
- The current-season seed has either completed for compliant slices or has a reviewed forward-only disposition.
- BALLDONTLIE pagination is complete.
- Odds duplicates are handled.
- Availability disappearance is not represented as recovery.
- Corrections trigger recomputation.

## 24.3 Product

- Board meets Section 5.1.
- Research View meets Section 5.2.
- Compare Your Line meets Section 5.3.
- Player Page meets Section 5.4.
- Brief deep links work.
- Shared metrics reconcile.

## 24.4 Freshness and failure

Test:

- stale source;
- failed latest poll;
- successful empty response;
- incomplete pagination;
- unknown schema;
- provider authentication failure;
- quota circuit breaker;
- postponed game;
- canceled game;
- late start;
- unresolved identity.

## 24.5 Entitlement

An external customer can complete the full paid lifecycle without operator-only knowledge.

## 24.6 Trust

- Methodology visible.
- Sample size visible.
- Timestamps visible.
- Unavailable states truthful.
- Forbidden-copy scan passes.
- No recommendation behavior.
- No model output.

## 24.7 Accessibility and performance

- Keyboard accessible.
- Screen-reader labels.
- Responsive board.
- Charts have textual alternatives.
- Full WNBA slate meets agreed performance budget.
- No paid-data exposure in client payloads.

---

# 25. Explicitly out of scope

- Any league other than WNBA
- Native mobile applications
- Live/in-play props
- Automated bet placement
- Sportsbook-account integration
- Bet slips
- Parlays
- Stake sizing
- Picks
- Model projections
- Model probabilities
- Expected value
- Affiliate bonuses
- Community pick tracking
- Public performance leaderboards
- User wager history
- Defense-versus-position
- Teammate-out impact modeling
- Unverified rest splits
- Unverified home/away splits
- Broad alternate-line browser
- Seconds-latency promises
- Raw-data export product

---

# 26. Open validation gates

These are not missing architecture.

## 26.1 Odds repeated-snapshot gate

Complete and review:

- first available;
- one hour before;
- 30 minutes before;
- 10 minutes before;
- near tip.

Validate:

- point change;
- price change;
- additions;
- removals;
- source disappearance;
- market timestamp;
- confirmed-removal threshold;
- freshness thresholds.

## 26.2 BALLDONTLIE correction gate

Capture a newly final game:

- shortly after final;
- approximately two hours later;
- following day.

## 26.3 Cross-provider mapping gate

Run complete contemporaneous slates from both providers.

## 26.4 Historical seed disposition gate

Before customer launch, document either:

- successful current-season seed coverage for approved slices; or
- a reviewed forward-only disposition for unsupported or unapproved slices.

## 26.5 Legal gate

Approve provider commercial and retention rights before paid launch.

---

# 27. Final implementation decision

This document is the single complete V1 product and implementation authority.

It preserves the original competitive goal:

- WNBA depth;
- exact-market comparison;
- transparent real-line history;
- observed movement;
- honest incompleteness;
- Daily Brief distribution;
- Compare Your Line as the wedge;
- no predictive model;
- no recommendation language.

It incorporates the audited provider contracts without turning the product spec into a raw API manual.

It is sufficiently specific for agents to:

- audit the repo;
- design migrations;
- implement adapters;
- build normalization;
- construct shared metrics;
- build product surfaces;
- test failure states;
- enforce entitlement;
- halt on unresolved decisions.

The next step is to run V1-0 and proceed through the approved ticket queue, pausing at each review checkpoint.

# SlipLabz Application V1 — BALLDONTLIE Data Sub-Spec

**Status:** Integration-ready technical authority with explicit validation and legal gates  
**Revision:** 0.9  
**Last updated:** 2026-07-10  
**Scope:** BALLDONTLIE’s role in SlipLabz Application V1  
**Commercial licensing:** Deferred to separate legal review; technical availability does not itself authorize production use.

---

## 1. Purpose

This document defines how SlipLabz may ingest, normalize, validate, store, and use BALLDONTLIE WNBA data in Application V1.

BALLDONTLIE is the proposed canonical V1 provider for:

- WNBA player identity;
- active-player status;
- team identity;
- game schedule and game state;
- completed player game statistics;
- current player availability reports.

The Odds API is the canonical V1 source for current sportsbook and pick’em player-prop lines. BALLDONTLIE betting odds and player-prop endpoints are evaluation-only unless a later provider decision explicitly authorizes them.

---

## 2. Confirmed provider capabilities

The reviewed WNBA OpenAPI contract and live responses confirm support for:

- teams;
- players;
- active players;
- games;
- player game statistics;
- team game statistics;
- player and team season statistics;
- player and team advanced statistics;
- shot-location statistics;
- standings;
- current player availability reports;
- betting odds;
- current player props;
- opening player props;
- play-by-play.

Application V1 requires only the core identity, game, player-stat, and current-availability endpoints. Optional contextual endpoints may not become launch dependencies without a spec amendment.

---

## 2A. Coverage boundary

The provider documentation states WNBA coverage from 2008 to current.

This is a provider coverage claim, not a guarantee that every endpoint and field is complete for every season. Application V1 treats:

- current and recent basic game logs as the core supported dataset;
- older seasons as backfillable subject to validation;
- advanced, injury, and roster metadata as endpoint-specific in coverage.

Every historical backfill records season-level row counts and data-quality results. A season is not marked complete merely because the provider returned a successful final page.

## 3. Required endpoints

Application V1 requires:

- `GET /wnba/v1/players`
- `GET /wnba/v1/players/active`
- `GET /wnba/v1/teams`
- `GET /wnba/v1/games`
- `GET /wnba/v1/player_stats`
- `GET /wnba/v1/player_injuries`

Optional supporting ingestion may use:

- `GET /wnba/v1/team_stats`
- `GET /wnba/v1/player_season_stats`
- `GET /wnba/v1/team_season_stats`
- advanced-stat endpoints;
- shot-location endpoints;
- standings.

---

## 3A. Connection and authentication contract

- Production base URL: `https://api.balldontlie.io`
- WNBA endpoint prefix: `/wnba/v1`
- Authentication header: `Authorization: <BALLDONTLIE_API_KEY>`
- The API key is supplied through secret management and is never embedded in source code, client bundles, logs, fixtures, or user-visible errors.
- All requests explicitly accept JSON where applicable.
- Request timeouts are bounded.
- TLS certificate verification remains enabled.

Access to an endpoint depends on the account’s WNBA subscription tier. A `401` may indicate a missing or invalid API key **or** insufficient tier access. The client must distinguish these operationally using configuration, subscription state, and the endpoint being requested rather than assuming every `401` means a malformed credential.

The required production subscription must provide access to `player_stats`. At the reviewed pricing structure, that is a GOAT-equivalent WNBA data tier or broader eligible access. Subscription naming and pricing are configuration facts, not permanent application logic.

---

## 3B. Approved V1 request shapes

The following request filters are approved for V1 ingestion.

### Teams

`GET /wnba/v1/teams`

Optional provider filter:

- `conference`

SlipLabz normally retrieves the complete registry and applies its own classification.

### Players

`GET /wnba/v1/players`

Approved filters:

- `cursor`
- `per_page`
- `search`
- `first_name`
- `last_name`
- `team_ids[]`
- `player_ids[]`

The complete historical identity pull uses cursor traversal. Targeted identity reconciliation may use player IDs or name search.

### Active players

`GET /wnba/v1/players/active`

Approved filters:

- `cursor`
- `per_page`
- `search`
- `first_name`
- `last_name`
- `team_ids[]`
- `player_ids[]`

The routine roster snapshot requests all rows through complete cursor traversal.

### Games

`GET /wnba/v1/games`

Approved filters:

- `cursor`
- `per_page`
- `dates[]`
- `seasons[]`
- `team_ids[]`
- `season_type`
- `start_date`
- `end_date`

Routine jobs use bounded dates or seasons. The adapter must serialize array parameters using repeated bracketed query keys.

### Player statistics

`GET /wnba/v1/player_stats`

Approved filters:

- `cursor`
- `per_page`
- `player_ids[]`
- `team_ids[]`
- `game_ids[]`
- `dates[]`
- `seasons[]`
- `start_date`
- `end_date`

Backfills use season/date bounds plus full cursor traversal. Final-game reconciliation uses `game_ids[]`.

### Current player availability

`GET /wnba/v1/player_injuries`

Approved filters:

- `cursor`
- `per_page`
- `player_ids[]`
- `team_ids[]`

This endpoint is live-only and must not be queried as though it supported historical date filters.

## 4. Provider identifiers and internal identity

SlipLabz stores BALLDONTLIE player, team, and game IDs as external provider identifiers.

SlipLabz also maintains provider-independent internal identifiers so that:

- The Odds API entities can be reconciled without replacing BALLDONTLIE IDs;
- future providers can be added;
- provider corrections do not break internal references.

A standard BALLDONTLIE full-game player-stat observation has the natural source key:

`(provider, player_id, game_id)`

The production table must enforce idempotent upserts on this key.

---

## 5. Pagination contract

BALLDONTLIE uses cursor-based pagination.

For every paginated endpoint:

1. request `per_page=100` where supported;
2. ingest the returned page;
3. read `meta.next_cursor`;
4. send the exact returned cursor in the next request;
5. continue until `next_cursor` is absent.

Cursors are opaque provider tokens. SlipLabz must not increment, derive, or reinterpret them.

A first page containing 25 or 100 rows is never assumed to be complete.

---

## 6. 2026 season-to-date player-stat audit

### 6.1 Audit artifact

The completed season-to-date audit requested:

- endpoint: `https://api.balldontlie.io/wnba/v1/player_stats`;
- season: `2026`;
- `per_page=100`;
- all cursors followed until exhaustion.

### 6.2 Results

- Pages retrieved: **41**
- Total player-game rows: **4,002**
- Distinct `(player_id, game_id)` pairs: **4,002**
- Duplicate player-game pairs: **0**
- Duplicate rows: **0**
- Rows missing player ID: **0**
- Rows missing game ID: **0**
- Teams represented: **15**

### 6.3 Locked conclusions

The audited 2026 extract supports the following V1 rules:

- `(player_id, game_id)` is unique across the complete audited season extract.
- No audited row lacks a player ID or game ID.
- The importer may use idempotent upserts keyed by `(provider, player_id, game_id)`.
- Duplicate detection remains mandatory even though no duplicates were observed.
- All current 2026 teams in the source must be accepted dynamically; no fixed historical team-count assumption is permitted.

### 6.4 Audit freshness limitation

The extract was retrieved at a point during the 2026 season. It is complete for the provider state and query at retrieval time, not necessarily for the eventual completed season.

A later run may contain:

- additional games;
- newly added player rows;
- corrected statistics;
- revised team or player metadata.

Production ingestion must therefore reconcile previously imported rows instead of treating this audit file as immutable season truth.

---

## 6A. Time, date, and season semantics

Provider game dates are ISO-8601 timestamps with UTC offsets or `Z`.

SlipLabz:

- parses provider timestamps as timezone-aware instants;
- stores canonical timestamps in UTC;
- never strips timezone information;
- derives local dates and display times only at the presentation layer;
- records `retrieved_at` separately from provider event time.

Date filters such as `dates[]`, `start_date`, and `end_date` are serialized as `YYYY-MM-DD`.

The provider’s `season` is stored as an integer season year.

Regular season and postseason remain distinct:

- provider `season_type=2` means regular season;
- provider `season_type=3` means postseason;
- game `postseason=true` is retained as source context.

Unless a surface explicitly says otherwise, V1 recent-game windows and season summaries default to regular-season eligible games. Postseason rows are not silently mixed into regular-season samples.

## 7. Minutes normalization

### 7.1 Observed formats

Across 4,002 audited rows:

- integer strings: **3,996**
- other format: **6**

All six unusual values were the literal string `"--"`.

Observed `"--"` rows:

| Player ID | Game ID | Raw minutes |
|---:|---:|:---|
| 712 | 24752 | `--` |
| 66926 | 24752 | `--` |
| 448 | 24756 | `--` |
| 765 | 24756 | `--` |
| 672 | 24824 | `--` |
| 672 | 24829 | `--` |

### 7.2 Canonical minutes states

SlipLabz recognizes three distinct minutes states:

1. **Played:** parsed numeric minutes greater than zero.
2. **DNP / non-participation:** parsed numeric minutes equal to zero.
3. **Unresolved non-numeric minutes:** values such as `"--"`, null, empty string, or any unrecognized format.

The third state must not be collapsed into zero.

### 7.3 Application rules

- Integer minute strings are parsed to numeric minutes.
- Numeric values greater than zero qualify as played games.
- Numeric zero qualifies as non-participation.
- `"--"` is stored as the raw value and mapped to `minutes_status = unresolved_non_numeric`.
- An unresolved non-numeric row is excluded from L5/L10/L20, averages, medians, hit rates, streaks, and exact-line comparisons until resolved.
- SlipLabz may not infer that `"--"` means DNP solely because counting statistics are null.
- Any newly observed non-integer format triggers a data-quality event and review.
- Raw minutes are always retained.

### 7.4 Low-minute appearances

A valid numeric value greater than zero counts as a played game, including one-minute appearances.

Application V1 applies no hidden minimum-minutes filter. Any future minimum-minutes filter must be visible to the user and explicitly approved as a methodology change.

---

## 8. Player-stat eligibility

A player-game row is eligible for finalized historical calculations only when:

- the joined game maps to canonical status `final`;
- player ID and game ID are present;
- the row is not quarantined or duplicated;
- numeric minutes are greater than zero;
- the required statistic is verifiably normalizable.

Rows with zero minutes are non-participation and are excluded from ordinary player-performance windows.

Rows with unresolved non-numeric minutes are excluded pending resolution.

The product’s “last 5” or “last 10” means the player’s last five or ten eligible played games, not the team’s last five or ten scheduled games.

---

## 9. Counting-stat normalization

BALLDONTLIE frequently uses `null` where the basketball count is zero.

For a valid finalized row with numeric minutes greater than zero, verified counting fields may normalize null to zero, including:

- `pts`
- `reb`
- `ast`
- `fg3m`
- `stl`
- `blk`
- `turnover`
- `fgm`
- `fga`
- `fg3a`
- `ftm`
- `fta`
- `oreb`
- `dreb`
- `pf`

`plus_minus` is retained separately and is not required for the V1 prop workflow.

Normalization rules:

- preserve the raw source value;
- store the normalized value separately;
- attach a normalization version;
- never apply null-to-zero to descriptive metadata;
- never apply played-row normalization to zero-minute or unresolved-minute rows.

Team-level null rates vary materially because rosters, DNP rows, and zero-count fields differ. Null prevalence alone is not evidence of missing game coverage.

---

## 9A. Core V1 stat mapping

The canonical V1 prop-stat mapping is:

| SlipLabz market | BALLDONTLIE field | Normalized type |
|---|---|---|
| Points | `pts` | integer |
| Rebounds | `reb` | integer |
| Assists | `ast` | integer |
| Made threes | `fg3m` | integer |

Derived combinations, when later enabled, are calculated from normalized component fields rather than imported as separate BALLDONTLIE values:

- PRA = `pts + reb + ast`
- Points + rebounds = `pts + reb`
- Points + assists = `pts + ast`
- Rebounds + assists = `reb + ast`

A derived value is unavailable if any required component is unresolved. Derived combinations do not convert an ineligible or quarantined player-game row into an eligible observation.

## 10. Game-state authority

BALLDONTLIE `status` is the authoritative provider field used to map games into:

- scheduled;
- live;
- final;
- postponed;
- canceled;
- unresolved.

The `time` and `period` fields do not independently establish finality. Completed games may retain unexpected clock values.

Unknown status values are quarantined from finalized calculations until mapped.

---

## 11. Team and opponent identity

Historical matchup identity is derived from the canonical game record, not solely from the team object embedded in a player-stat row.

For each eligible player-game observation, SlipLabz stores:

- player team at game time;
- opponent team;
- home or away status;
- season;
- postseason flag.

Team metadata may have null conference or empty city fields. Display logic must:

- prefer a valid `full_name`;
- otherwise use `name`;
- never require `city`;
- never assume a fixed number of league teams.

Franchise continuity and historical display identity remain separate concepts.

---

## 11A. Referential-integrity and reconciliation checks

Before a player-stat row becomes product-eligible, SlipLabz verifies:

- the provider game ID exists in the games table;
- the provider player ID exists or is created in the identity table;
- the player-stat team ID matches either the game’s home-team ID or visitor-team ID;
- the opponent can be derived unambiguously from the other game team;
- game season and player-stat game season agree;
- game date and player-stat embedded game date do not materially conflict;
- the game is classified as an eligible WNBA competition game;
- the row’s provider key is unique within the completed import.

A mismatch does not receive a guessed repair. It is quarantined with a reason code, raw payload reference, and observed timestamp.

Approved reason codes include:

- `missing_game`
- `missing_player`
- `team_not_in_game`
- `season_mismatch`
- `date_mismatch`
- `duplicate_source_key`
- `unsupported_competition_team`
- `unresolved_minutes`
- `unknown_game_status`

Successful later reconciliation may release the row and trigger dependent recomputation.

## 12. Active-player and roster handling

The active-player endpoint is the preferred source for the current searchable roster.

The all-players endpoint remains necessary for historical identity.

A player may:

- appear in historical game logs but not the active list;
- change teams;
- appear in The Odds API before roster metadata is fully synchronized.

Absence from the active endpoint must not delete a historical player or break an existing provider mapping.

Cross-provider matching must use more than current team alone.

---

## 12A. Active-player audit

### 12A.1 Audit artifact

The completed active-player audit requested:

- endpoint: `https://api.balldontlie.io/wnba/v1/players/active`;
- `per_page=100`;
- all cursors followed until exhaustion;
- retrieval time: `2026-07-10T20:59:04Z`.

### 12A.2 Results

- Pages retrieved: **3**
- Total active-player rows: **205**
- Distinct non-null player IDs: **205**
- Rows missing player ID: **0**
- Rows missing team object or team ID: **0**
- Duplicate player IDs: **0**
- Duplicate normalized full names: **0**
- Names flagged as unusual by the audit: **0**
- Teams represented: **15**

### 12A.3 Team assignment counts

| Team | Active-player rows |
|---|---:|
| Phoenix Mercury:PHX | 14 |
| Dallas Wings:DAL | 14 |
| Los Angeles Sparks:LA | 13 |
| Golden State Valkyries:GS | 15 |
| New York Liberty:NY | 14 |
| Connecticut Sun:CON | 14 |
| Tempo:TOR | 14 |
| Fire:POR | 14 |
| Indiana Fever:IND | 13 |
| Atlanta Dream:ATL | 14 |
| Washington Mystics:WSH | 13 |
| Chicago Sky:CHI | 15 |
| Minnesota Lynx:MIN | 12 |
| Las Vegas Aces:LV | 13 |
| Seattle Storm:SEA | 13 |

### 12A.4 Locked conclusions

The audited active-player response supports the following V1 rules:

- BALLDONTLIE player ID is complete and unique within the audited active roster.
- Every audited active player has a team object and team ID.
- No two audited active players share the same normalized full name.
- The active endpoint is suitable as the primary current-roster discovery feed.
- The active endpoint is not a permanent identity registry and must not replace the all-players endpoint or historical game-log identity.
- Team assignment is current-state metadata and may change after trades, waivers, hardship contracts, expansion allocation, or provider correction.
- Absence from the active endpoint must never delete a player, historical game row, or cross-provider mapping.
- A player offered in The Odds API but absent from the latest active roster must enter a reconciliation queue rather than being automatically rejected.

### 12A.5 Expansion-team metadata

The active-player response assigns players to all 15 current teams, including:

- team ID `30`, abbreviation `TOR`, name/full name `Tempo`;
- team ID `31`, abbreviation `POR`, name/full name `Fire`.

For these expansion teams, the audited objects retain:

- empty `city`;
- null `conference`;
- shortened `full_name`.

Therefore:

- team ID is the authoritative provider key; abbreviation is a useful current-franchise matching signal but is not globally unique across the entire registry;
- `full_name`, `city`, and `conference` are mutable descriptive metadata;
- SlipLabz must not require a nonempty city or conference for roster ingestion;
- SlipLabz may maintain a reviewed display alias for presentation, but must preserve the raw provider values;
- provider metadata must be refreshed and reconciled rather than treated as immutable.

### 12A.6 Name-matching implications

The absence of duplicate normalized names in this one audit reduces immediate ambiguity but does not justify name-only matching.

Cross-provider matching order for active players is:

1. an existing reviewed provider-ID mapping;
2. normalized full name plus compatible event/team context;
3. aliases and punctuation normalization;
4. manual review when identity remains ambiguous.

Current team alone is never sufficient because provider rosters can update at different times.

Names may contain:

- apostrophes;
- hyphens;
- spaces within surnames;
- diacritics or transliteration differences;
- initials or shortened forms in another provider.

The source name is preserved exactly, while a separate normalized search key supports matching.

### 12A.7 Roster-snapshot storage

Each active-player import stores:

- provider player ID;
- current team ID;
- raw identity fields;
- raw team object;
- retrieval timestamp;
- first-seen-active timestamp;
- last-seen-active timestamp;
- content hash;
- observed team-assignment change timestamp.

A player missing from a later snapshot is marked `not_seen_active` after the completed import; the record is not deleted.

A partial or failed paginated pull may not mark absent players inactive.

## 12B. Teams endpoint audit

### 12B.1 Audit artifact

The completed teams audit requested:

- endpoint: `https://api.balldontlie.io/wnba/v1/teams`;
- retrieval time: `2026-07-10T21:01:59Z`.

### 12B.2 Results

- Total team rows: **33**
- Distinct non-null team IDs: **33**
- Rows missing at least one canonical descriptive field: **18**
- Duplicate team IDs: **0**
- Duplicate full names: **1**
- Duplicate abbreviations: **1**
- Eastern Conference rows: **6**
- Western Conference rows: **9**
- Rows with missing conference: **18**

### 12B.3 Registry composition

The endpoint is a mixed historical and competition-team registry, not a current-franchise-only list.

The 33 rows include:

- **15 current 2026 franchises:** IDs `1–13`, `30`, and `31`;
- **2 retired historical franchises:** Sacramento Monarchs (`14`) and Houston Comets (`15`);
- **conference or exhibition teams:** East, West, Team WNBA, Team USA;
- **captain-draft All-Star teams:** Team Delle Donne, Team Parker, Team Wilson, Team Stewart, Team Clark, Team Collier;
- **national teams:** Brazil, Japan, Australia, Puerto Rico;
- **placeholder teams:** IDs `32` and `33`, both represented as `TBD`.

Therefore `/teams` must not be interpreted as the current WNBA franchise universe without classification.

### 12B.4 Team classification

SlipLabz stores every provider team record, but assigns a separate application classification:

- `current_franchise`
- `historical_franchise`
- `all_star_or_exhibition`
- `national_team`
- `placeholder`
- `unknown`

For the audited 2026 provider state:

- IDs `1–13`, `30`, `31` are classified as `current_franchise`;
- IDs `14`, `15` are classified as `historical_franchise`;
- IDs `16–25` are classified as `all_star_or_exhibition`;
- IDs `26–29` are classified as `national_team`;
- IDs `32`, `33` are classified as `placeholder`.

Classification is configuration-backed and versioned. It is not inferred from conference alone.

### 12B.5 Uniqueness rules

Provider team ID is the only audited globally unique team identifier.

The endpoint contains duplicate descriptive identities:

- two distinct provider IDs share full name `TBD`;
- two distinct provider IDs share abbreviation `TBD`.

Accordingly:

- `provider_team_id` must be unique within BALLDONTLIE;
- `full_name` must not have a uniqueness constraint;
- `abbreviation` must not have a uniqueness constraint;
- name or abbreviation alone may not resolve a provider team;
- placeholder teams must remain distinguishable by provider ID.

### 12B.6 Current-franchise selection

A team is eligible for the current WNBA product universe only when it is classified as `current_franchise`.

The application may not derive the current league by:

- taking every `/teams` row;
- filtering to non-null conference;
- filtering by abbreviation length;
- filtering by a hardcoded total row count.

The current-franchise set must be reconciled with:

- current-season games;
- active-player team assignments;
- reviewed configuration.

A newly observed team ID in current-season games enters a review queue and must not be silently dropped.

### 12B.7 Expansion-team metadata

The canonical teams endpoint confirms incomplete metadata for:

- Portland Fire: ID `31`, abbreviation `POR`, empty city, null conference, full name `Fire`;
- Toronto Tempo: ID `30`, abbreviation `TOR`, empty city, null conference, full name `Tempo`.

These incomplete values are not isolated to embedded game or player objects; they are present in the canonical teams response.

SlipLabz therefore:

- preserves raw provider values;
- permits null conference and empty city;
- uses provider team ID as the primary provider key;
- may maintain reviewed display aliases for customer-facing presentation;
- refreshes provider metadata for future corrections;
- never overwrites raw values with application aliases.

### 12B.8 Historical franchise handling

Retired teams remain present in `/teams`.

Historical game display must use the team identity associated with the game and season, not a current-franchise descendant label.

SlipLabz stores separately:

- provider team record;
- franchise lineage, when reviewed;
- season-aware display identity;
- current-franchise status.

Franchise lineage is curated application metadata and is not inferred merely from a shared city, relocation history, or current descendant.

### 12B.9 Placeholder and special-team handling

Placeholder, national, All-Star, and exhibition teams may appear in provider data.

They must not:

- appear in the normal WNBA franchise filter;
- contribute to regular-season team counts;
- enter sportsbook consensus matching as ordinary franchises;
- be merged because their names or abbreviations match.

If a game involving a non-franchise team is encountered, the game is classified by competition context before inclusion in any product calculation.

### 12B.10 Team refresh and mutation

Team metadata is mutable.

Each teams import stores:

- provider team ID;
- raw conference;
- raw city;
- raw name;
- raw full name;
- raw abbreviation;
- application classification;
- retrieval timestamp;
- first-seen timestamp;
- last-seen timestamp;
- content hash;
- observed metadata-change timestamp.

A provider metadata change updates the current provider snapshot while retaining change history or an auditable prior representation.

## 12C. Post-final correction audit

### 12C.1 Audit artifact

Two captures were taken for BALLDONTLIE game ID `24752` using:

- `GET /wnba/v1/player_stats`
- `game_ids[]=24752`
- `per_page=100`

Capture timestamps:

- first capture: `2026-07-10T21:04:53Z`
- second capture: `2026-07-10T21:05:04Z`

The observed interval between captures was **11 seconds**.

### 12C.2 Results

Both captures contained:

- **27 player-stat rows**
- **0 duplicate keys**
- **0 added rows**
- **0 removed rows**
- **0 changed fields**

Per-row hashes were identical between the two captures.

### 12C.3 Interpretation

This audit confirms that, for the tested finalized game and the tested 11-second interval:

- the endpoint returned a stable row set;
- player-game keys remained stable;
- no statistic or metadata field changed;
- no player rows were added or removed.

This does **not** establish that finalized box scores are immutable.

The second capture was labeled `plus_2h`, but its recorded retrieval time was only 11 seconds after the first capture. The intended two-hour observation window was therefore not actually completed.

The tested game occurred on `2026-05-08`, while both captures occurred on `2026-07-10`. The audit therefore measures short-interval repeatability for an older finalized game, not the correction behavior immediately after a newly completed game.

### 12C.4 Locked ingestion policy

SlipLabz must continue to assume that finalized player-stat rows may be corrected after first publication.

Production ingestion therefore uses reconciliation pulls rather than insert-once behavior.

For each completed game, the proposed V1 reconciliation schedule is:

1. first successful pull after the game maps to `final`;
2. follow-up pull approximately two hours after final;
3. follow-up pull the next calendar day;
4. optional later correction sweep during periodic season reconciliation.

Every pull:

- upserts by `(provider, player_id, game_id)`;
- compares a canonical source-field hash;
- records changed fields;
- preserves or references the prior raw representation;
- invalidates dependent aggregates when a material stat changes.

### 12C.5 Correction semantics

A provider correction may change:

- participation state;
- minutes;
- counting statistics;
- team assignment;
- player metadata embedded in the row;
- row presence.

Material statistical corrections trigger recomputation of:

- L5/L10/L20 windows;
- averages and medians;
- exact-line results;
- hit rates;
- streaks;
- any cached player research view using the corrected game.

A repeated identical response updates ingestion health and `last_verified_at` but does not create a duplicate logical player-game observation.

### 12C.6 Remaining validation

The intended post-final correction test remains **partially complete**.

A valid completion requires captures of a newly finalized game at materially separated times, preferably:

- shortly after final;
- approximately two hours later;
- the following day.

The current audit is retained as evidence of deterministic repeat retrieval, but not as proof of post-final immutability or two-hour stability.

## 13. Current player availability

The BALLDONTLIE `player_injuries` endpoint is treated as a current availability feed, not a complete historical injury database.

Records may represent:

- physical injury;
- coach’s decision;
- reconditioning;
- pregnancy;
- other non-participation reasons.

Application V1 may display:

- source status;
- source comment;
- provider return-date string;
- SlipLabz observed-at time.

The provider return-date string is informational and may not be represented as guaranteed or authoritative.

Because the feed does not expose a reliable source update timestamp, SlipLabz stores:

- `first_seen_at`;
- `last_seen_at`;
- `observed_at`;
- `content_hash`;
- `observed_changed_at`.

These timestamps describe SlipLabz observation, not the exact upstream change time.

Historical teammate-absence analysis is not a V1 launch feature.

---

## 14. Raw-data retention and reconciliation

Each ingestion run records:

- endpoint;
- request parameters;
- retrieval time;
- page count;
- row count;
- cursor chain or page audit;
- success or failure state.

For every normalized row, SlipLabz retains either:

- the raw source payload; or
- an immutable retrievable raw representation.

Repeated pulls use upserts and compare source-relevant fields so provider corrections can be detected.

No evidence from the one-time full-season audit proves that previously published rows are immutable.

---

## 15. Error handling

The ingestion system must handle:

- `400` invalid request;
- `401` authentication or tier failure;
- `404` missing resource;
- `406` unsupported response format;
- `429` rate limiting;
- `500` provider failure;
- `503` temporary provider unavailability.

Retryable failures use bounded exponential backoff with jitter.

Authentication, authorization, and invalid-query failures do not enter an unbounded retry loop.

Partial pagination is never marked as a successful complete import.

---

## 15A. Observed error-response contracts

### 15A.1 Invalid-query response (`400`)

Observed request:

- endpoint: `GET /wnba/v1/player_stats`
- invalid parameter: `per_page=not-a-number`
- retrieval time: `2026-07-10T21:07:49Z`

Observed response:

- HTTP status: `400 Bad Request`
- content type: `application/json; charset=utf-8`
- rate-limit headers present:
  - `x-ratelimit-limit: 600`
  - `x-ratelimit-remaining: 599`
  - `x-ratelimit-reset: 1783717730`
- structured body:

```json
{
  "errors": [
    {
      "param": "per_page",
      "error": "per_page must be a valid integer (max 100)"
    }
  ]
}
```

Locked handling:

- parse JSON when content type indicates JSON;
- preserve parameter-level validation details;
- classify as `non_retryable_invalid_request`;
- do not retry automatically;
- record endpoint, sanitized parameters, status, response body, and provider request metadata;
- raise an operational alert if a production-generated request produces a `400`, because it indicates an integration or validation defect.

### 15A.2 Invalid-key response (`401`)

Observed request:

- endpoint: `GET /wnba/v1/teams`
- authorization header was present but invalid;
- retrieval time: `2026-07-10T21:07:58Z`

Observed response:

- HTTP status: `401 Unauthorized`
- content type: `text/plain; charset=utf-8`
- raw body: `Unauthorized`
- JSON body: absent
- no rate-limit headers were observed in the captured response.

Locked handling:

- response parsing must be content-type aware;
- the client must not assume every error body is JSON;
- classify as `non_retryable_authentication_or_access_failure`;
- halt the affected BALLDONTLIE ingestion run;
- do not retry repeatedly with the same credential;
- emit a high-priority operational alert and check both credential validity and WNBA tier access;
- never log or expose the API key;
- permit retry only after credentials or subscription state have changed.

### 15A.3 Error-envelope implications

BALLDONTLIE does not use one uniform error envelope across all status classes.

The ingestion client must retain:

- HTTP status;
- reason phrase;
- content type;
- selected response headers;
- raw response body;
- parsed JSON body when available;
- parse-error state when JSON decoding is inapplicable or fails.

The client must not:

- call `.json()` unconditionally;
- discard plain-text error bodies;
- retry all non-2xx responses;
- expose authorization credentials in logs.

### 15A.4 Rate-limit metadata

The observed `400` response still consumed or participated in the request-rate budget and returned rate-limit metadata.

Therefore:

- invalid requests are not operationally free;
- preflight parameter validation should occur before sending requests;
- rate-limit state should be recorded from both successful and error responses when headers are present;
- the absence of headers on one response class must not be treated as a zero or unlimited rate limit.

### 15A.5 Remaining unobserved classes

The following documented classes have not yet been empirically captured:

- `429 Too Many Requests`
- `500 Internal Server Error`
- `503 Service Unavailable`
- `404 Not Found`
- `406 Not Acceptable`

Their documented handling remains in force. Natural production examples may refine body parsing and retry behavior later, but they are not required to complete the V1 technical sub-spec.

## 16. Optional contextual data

Advanced statistics, shot locations, standings, and team context are optional supporting data.

They may not delay the core V1 launch.

Application V1 does not require:

- defense versus position;
- shot-zone visualizations;
- PIE;
- net rating;
- historical injury splits;
- play-by-play;
- BALLDONTLIE betting odds or player props.

## 16A. V1 ingestion cadence and freshness

The following cadence is the proposed BALLDONTLIE V1 operating contract. It may be tuned operationally without changing product meaning, provided freshness labels remain accurate.

### Teams

- Fetch once per day during the season.
- Fetch immediately when a current-season game or active-player record contains an unknown team ID.
- Changes to descriptive metadata update the provider snapshot but do not overwrite reviewed display aliases.

### Players and active players

- Fetch the active-player endpoint once per day during the season.
- Fetch the all-players endpoint during initial backfill and periodically for historical identity reconciliation.
- Trigger targeted player lookup or reconciliation when The Odds API contains an unmatched player.

### Games

- Fetch the current and near-future schedule at least once per day.
- Refresh same-day games periodically before tip-off.
- Refresh live games frequently enough to detect the transition to final.
- Re-fetch recently completed games during the post-final reconciliation window.
- Store the source retrieval time separately from the scheduled game time.

### Player statistics

- Backfill historical or season-to-date data through complete cursor traversal.
- During live games, player statistics may be ingested for internal monitoring but are not eligible for finalized historical product calculations.
- After a game reaches final, run the reconciliation schedule defined in Section 12C.
- A partial paginated response may not advance the complete-import watermark.

### Current availability

- Fetch often enough to support the customer-facing freshness claim.
- The initial V1 target is every 15 minutes on game days and less frequently when no games are scheduled.
- Every displayed status includes a SlipLabz observation timestamp.
- Because the provider supplies no authoritative update timestamp, the product may say “observed” or “last checked,” not “updated by the source at.”

### Freshness and stale-data behavior

Each provider-derived surface records:

- provider;
- endpoint;
- `retrieved_at`;
- last successful retrieval;
- last attempted retrieval;
- freshness state;
- stale reason when applicable.

If a required feed exceeds its configured freshness threshold:

- retain the last valid data;
- mark it stale;
- suppress unsupported “current” claims;
- do not replace the last valid record with an empty or failed response.

A successful empty response is distinguished from a transport, parsing, authorization, or pagination failure.

---

## 16B. Technical readiness decision

The BALLDONTLIE technical evidence and explicit contracts are sufficient for integration into the complete V1 specification.

No additional BALLDONTLIE artifact is required to define the V1 architecture or ingestion schema.

The following remain non-blocking follow-up work:

- complete a genuinely timed post-final correction test on a newly finalized game;
- refine retry parsing if natural `429`, `500`, or `503` examples occur;
- obtain commercial-use and retention approval before production launch;
- validate cross-provider player and event matching using actual The Odds API responses.

The absence of these follow-ups does not prevent writing the combined V1 product and data specification. Production launch remains subject to the legal gate and implementation validation.

---

## 17. Verification register

| Item | Status | Result |
|---|---|---|
| WNBA OpenAPI contract | Complete | Reviewed |
| Real games response | Complete | Status and team metadata quirks documented |
| Real player-stats response | Complete | Null-as-zero and DNP behavior confirmed |
| Real current-availability response | Complete | Live-only and timestamp limitations confirmed |
| Full paginated 2026 season-to-date player-stats pull | **Complete** | 4,002 rows at retrieval time; no duplicate keys or missing IDs; six `"--"` minute values |
| Real active-players response | **Complete** | 205 unique players; no missing IDs or teams; all 15 teams represented |
| Real teams response | **Complete** | 33-row mixed registry; 15 current franchises; retired, special, national, and placeholder teams identified |
| Post-final correction test | **Partial** | Two identical 27-row captures, but only 11 seconds apart and for an older finalized game |
| Error-response samples | **Partial / sufficient** | Real 400 JSON validation response and 401 plain-text authentication response captured |
| Commercial-use and retention approval | Deferred | Separate legal review |

---

## 18. Current disposition

The BALLDONTLIE core historical-stat feed passes the initial V1 structural audit for:

- identity completeness;
- pagination;
- source-key uniqueness;
- core prop-stat availability;
- DNP distinction;
- null-count normalization.

The feed does not permit a binary played-versus-DNP interpretation based solely on minutes because `"--"` also occurs. The V1 ingestion contract must preserve and quarantine that third state.

The BALLDONTLIE technical sub-spec is sufficient for the combined V1 specification. The correctly timed post-final follow-up remains a non-blocking validation item.

---

## 19. Canonical V1 storage and import contract

### 19.1 Ingestion run

Every BALLDONTLIE request belongs to an ingestion run containing:

- provider;
- endpoint;
- sanitized request parameters;
- requested season, dates, game IDs, player IDs, or team IDs;
- started-at and completed-at timestamps;
- page count;
- cursor chain;
- row count;
- HTTP and parse outcome;
- selected response headers;
- raw-response references;
- normalization version;
- completion state.

A paginated import is `complete` only when:

- every page succeeds;
- every page parses;
- the exact returned cursor chain is followed;
- the final response has no `next_cursor`;
- row-level validation completes.

A partial or failed run may retain rows for diagnosis but may not advance a complete-import watermark or mark unseen records inactive.

### 19.2 Provider entity snapshots

Current provider-state tables retain versioned snapshots for:

- teams;
- players;
- active-player assignments;
- games;
- current availability records.

Every snapshot includes:

- provider ID;
- raw payload reference;
- content hash;
- first seen;
- last seen;
- observed changed at;
- current-state flag;
- ingestion-run ID.

### 19.3 Player-game statistics

The canonical normalized player-game record is keyed by:

`(provider, provider_player_id, provider_game_id)`

Stored fields include:

- internal player ID;
- internal game ID;
- provider team ID;
- derived opponent team ID;
- home/away state;
- raw minutes;
- parsed minutes;
- minutes status;
- raw and normalized counting fields;
- season;
- season type;
- source hash;
- first observed;
- last verified;
- last materially changed;
- eligibility state;
- quarantine reason;
- raw payload reference;
- normalization version.

Material source changes update the canonical row and append or retain an auditable prior representation.

### 19.4 Complete-import watermarks

Watermarks are maintained separately by endpoint and query scope.

Examples:

- all active players at retrieval time;
- all teams at retrieval time;
- all player statistics for season 2026 through a retrieval time;
- all statistics for a specified finalized game.

A season-to-date watermark does not mean the eventual season is complete.

---

## 20. Current-availability lifecycle

The availability endpoint is a current observed feed.

A record’s logical identity is based on the provider player ID plus the normalized current availability content observed in a snapshot.

Stored fields include:

- provider player ID;
- internal player ID;
- source status;
- source comment;
- source return-date text;
- raw payload reference;
- first seen;
- last seen;
- observed changed at;
- latest completed-snapshot presence;
- current interpretation state.

Interpretation states include:

- `currently_reported`
- `not_returned_latest_complete_snapshot`
- `stale_feed`
- `unresolved_player`
- `source_unavailable`

Absence from one completed snapshot does not prove medical recovery or availability. Customer-facing copy may say that the player is “not present in the latest provider report,” but may not state “healthy,” “cleared,” or “available” solely from disappearance.

A failed or partial pull does not change presence state.

---

## 21. Default operating cadence

These defaults make the ingestion handoff executable. They may be tuned through configuration without changing methodology.

### 21.1 Teams and identities

- Teams: once daily during the season.
- Active players: once daily, plus a targeted refresh when an unmatched Odds API player appears.
- Full historical players: initial backfill, then weekly during the season and on demand for reconciliation.

### 21.2 Games

- Future schedule more than 24 hours away: every 6 hours.
- Games within 24 hours: hourly.
- Games within 2 hours: every 15 minutes.
- Games believed live: every 2 minutes until final, postponed, canceled, or unresolved.
- Recently final games: according to the reconciliation schedule in Section 12C.

### 21.3 Player statistics

- Historical backfill: bounded batch jobs with complete cursor traversal.
- Newly final game: first pull after final detection.
- Correction checks: approximately 2 hours after final and the following day.
- Season correction sweep: weekly during the season.

### 21.4 Current availability

- Game days with events inside 6 hours: every 15 minutes.
- Other in-season periods: hourly.
- Offseason or no scheduled games: every 6 hours, unless disabled by configuration.

All displayed freshness language uses SlipLabz observation time unless the provider supplies an authoritative source timestamp.

---

## 22. Cross-provider handoff contract

BALLDONTLIE supplies the canonical internal identities to which Odds API records are mapped.

Required handoff objects:

- internal player ID ↔ BALLDONTLIE player ID;
- internal team ID ↔ BALLDONTLIE team ID;
- internal game ID ↔ BALLDONTLIE game ID;
- reviewed team aliases for Odds API matching;
- reviewed player aliases for Odds API matching.

An Odds API event or player cannot become product-eligible until the mapping is approved or deterministically resolved under the Odds API sub-spec.

Mapping changes are versioned and auditable. They do not rewrite raw provider records.

---

## 23. Integration and launch gates

### 23.1 Sufficient for master-spec integration

This sub-spec is sufficient to define:

- BALLDONTLIE ingestion runs;
- identity and roster ingestion;
- current team classification;
- game-state authority;
- completed player-stat normalization;
- historical-window eligibility;
- availability observation;
- correction reconciliation;
- cross-provider identity handoff.

### 23.2 Validation gate

Still required before post-final correction behavior is considered empirically complete:

- a newly finalized game captured shortly after final;
- a materially separated follow-up near two hours;
- a following-day comparison.

The current policy remains valid without this test because it assumes corrections are possible.

### 23.3 Legal launch gate

Before paid production use, confirm:

- commercial display rights;
- caching and retention rights;
- raw-payload retention;
- derived-stat display;
- attribution requirements;
- restrictions on redistribution or bulk export.

### 23.4 Final integration decision

The BALLDONTLIE sub-spec is ready to be integrated into the complete SlipLabz V1 specification.

Its remaining items are validation and legal gates, not missing architectural definitions.

# SlipLabz Application V1 — The Odds API Data Sub-Spec

**Status:** Implementation-ready technical authority with explicit validation and legal gates  
**Revision:** 0.10  
**Last updated:** 2026-07-10  
**Scope:** The Odds API’s role in SlipLabz Application V1  
**Canonical prop provider:** The Odds API  
**Canonical game/stat provider:** BALLDONTLIE  
**Commercial/legal review:** Separate launch gate

> **Revision 0.10 (2026-07-10):** Final pre-agent audit corrected the historical seed contract. Historical seeding is attempted before launch when coverage and rights permit, but it does not block the core build. Historical event-ID discovery, the 10x historical quota multiplier, snapshot/retrieval time separation, current-line isolation, and canonical observed closing-point rules are now explicit.

---

## 1. Purpose

This document defines how SlipLabz ingests, normalizes, validates, stores, and uses The Odds API data for pregame WNBA player-prop research.

The Odds API is the proposed canonical V1 provider for current pregame lines from:

- conventional sportsbooks;
- PrizePicks;
- Underdog;
- other approved pick’em or DFS sources.

BALLDONTLIE remains canonical for:

- players;
- teams;
- games;
- completed player statistics;
- current availability context.

The Odds API does not replace BALLDONTLIE’s game or player identity. Cross-provider mappings are explicit and auditable.

---

## 2. V1 market scope

Initial supported markets:

- `player_points`
- `player_rebounds`
- `player_assists`
- `player_threes`

The following are not launch dependencies:

- live player props;
- featured team markets;
- alternate lines except where required to represent a pick’em source;
- additional combinations;
- historical Odds API purchases.

PrizePicks and Underdog are stored as separate source classes and are excluded from conventional sportsbook consensus.

---

## 3. Evidence register

| Evidence package | Status | Result |
|---|---|---|
| Official V4 documentation packet | **Core API complete** | Endpoint, quota, historical, and multiplier rules documented; legal/reference pages still pending |
| Real WNBA events response | **Complete** | 6 unique pre-match events; 12 team names; zero request credits |
| Four-market event-odds slate | **Complete** | 6/6 events successful; all four markets observed; 24 credits total |
| Repeated event snapshots | Pending | Awaiting artifact |
| PrizePicks and Underdog audit | **Complete for sampled event** | Both sources audited separately; further UI and promotion validation remains |
| Quota behavior audit | **Substantially complete** | 10-book, 12-book, region, and invalid-market costs validated |
| Error responses | **Partial / sufficient** | Invalid-market 422 captured; remaining classes covered by retry policy and future natural samples |

---

## 4. WNBA events endpoint audit

### 4.1 Captured request

- Provider: The Odds API
- Sport key: `basketball_wnba`
- Endpoint: `/v4/sports/basketball_wnba/events`
- Retrieval time: `2026-07-10T21:26:52Z`
- HTTP status: `200`
- Date format: `iso`
- API key retained in artifact: **No**
- Redacted request URL: `https://api.the-odds-api.com/v4/sports/basketball_wnba/events?apiKey=REDACTED&dateFormat=iso`

### 4.2 Response summary

- Event rows: **6**
- Distinct non-missing event IDs: **6**
- Missing event IDs: **0**
- Duplicate event IDs: **0**
- Distinct team names: **12**
- Pre-match events: **6**
- Commenced or in-play events: **0**
- Invalid or missing commence times: **0**
- Response rows containing a `completed` field: **0**

### 4.3 Event response shape

Each observed event contains:

- `id`
- `sport_key`
- `sport_title`
- `commence_time`
- `home_team`
- `away_team`

No bookmaker, market, price, or completion information appears in this endpoint response.

### 4.4 Locked event rules

- The Odds API event ID is the authoritative external key for event-odds requests.
- The event ID is opaque and stored as text.
- Missing or duplicate event IDs quarantine the affected response.
- `commence_time` is parsed as a timezone-aware UTC timestamp.
- Team names are provider labels used for matching, not internal team identity.
- Event state inferred from time is only `pre_match` or `commenced_or_in_play`.
- This endpoint does not establish authoritative completion.
- BALLDONTLIE remains authoritative for scheduled, live, final, postponed, and canceled game state.
- An event disappearing from this endpoint is not by itself proof of cancellation or completion.
- A successful empty event response is distinguished from a request or parsing failure.

---

## 5. Observed WNBA event universe

| Odds API event ID | Matchup | Commence time |
|---|---|---|
| `1547b39904db439304af0dfdacaa469d` | Golden State Valkyries at Connecticut Sun | `2026-07-10T23:40:00Z` |
| `7295f7e8db8d22124fdf261cda31a1f6` | Dallas Wings at Toronto Tempo | `2026-07-10T23:40:00Z` |
| `14c1ed8012d1c1a70778c1d1aa348e83` | Chicago Sky at Los Angeles Sparks | `2026-07-11T02:10:00Z` |
| `93c27f5318a98fdd2a9bfbc42269f134` | New York Liberty at Minnesota Lynx | `2026-07-11T17:00:00Z` |
| `9f2c4d943190edd1073d4cd6760fcf8c` | Portland Fire at Atlanta Dream | `2026-07-11T20:00:00Z` |
| `dbbae9c1944a4874fe492f9fe23d8f62` | Phoenix Mercury at Las Vegas Aces | `2026-07-11T22:00:00Z` |

The captured slate includes 12 distinct teams across six games.

Observed expansion-team labels:

- Golden State Valkyries
- Portland Fire
- Toronto Tempo

These customer-facing names are more complete than the raw BALLDONTLIE expansion-team display metadata reviewed earlier.

SlipLabz may use reviewed application display aliases, but cross-provider mapping remains tied to provider IDs and reviewed aliases rather than display strings alone.

---

## 6. BALLDONTLIE event reconciliation

A cross-provider event mapping key must consider:

- normalized home team;
- normalized away team;
- commence time;
- season;
- competition;
- reviewed aliases.

Team names alone are insufficient.

The supplied one-off automated comparison is **not accepted as mapping validation** because the BALLDONTLIE comparison artifact did not represent the complete contemporaneous game slate. Its low match rate is therefore an artifact-coverage limitation, not evidence that the providers disagree.

### 6.1 Mapping policy

A mapping is auto-approved only when:

- sport is WNBA;
- home and away teams resolve to reviewed internal team IDs;
- the ordered matchup agrees;
- commence times fall within the approved tolerance;
- no competing candidate exists.

Initial time tolerance:

- exact timestamp match preferred;
- up to 15 minutes may auto-match when ordered teams are unique and no competing candidate exists;
- larger differences require review.

Otherwise, the event enters manual or rule-based reconciliation.

The mapping table stores:

- Odds API event ID;
- BALLDONTLIE game ID;
- internal game ID;
- matching method;
- matched-at timestamp;
- review state;
- source team strings;
- source commence times;
- time delta;
- alias version.

A provider event ID must not be reused for another internal game.

Cross-provider mapping remains a required implementation test using complete, contemporaneous event sets from both providers.

---

## 7. Event discovery and lifecycle

The events endpoint is used to discover the provider’s currently available WNBA event universe.

V1 ingestion behavior:

1. fetch the events endpoint;
2. validate all event rows;
3. reconcile each event to an internal/BALLDONTLIE game;
4. queue approved events for event-specific prop requests;
5. retain first-seen and last-seen timestamps;
6. record disappearance separately from authoritative game status.

Stored event fields include:

- provider event ID;
- sport key;
- sport title;
- commence time;
- provider home-team string;
- provider away-team string;
- linked internal game ID;
- first seen;
- last seen;
- last successfully observed;
- active-in-provider-feed flag;
- raw payload hash.

Event payload changes are versioned or auditable.

---

## 8. Quota headers

The successful events request returned:

- `x-requests-used: 59285`
- `x-requests-remaining: 40715`
- `x-requests-last: 0`

The observed request cost was therefore **0 credits**.

Locked behavior:

- record quota headers on every response when present;
- treat header values as account-wide counters;
- compute observed request cost from `x-requests-last`;
- do not infer prop-request cost from the free events request;
- alert on unexpected quota consumption;
- never expose the API key or unredacted request URL.

Ordinary event discovery can be refreshed without prop-market credit cost under the observed account behavior, subject to published rate limits and future provider changes.

---

## 9. Response and transport metadata

The captured response confirms:

- JSON content type;
- AWS/CloudFront request metadata;
- quota headers;
- no pagination metadata.

The client stores selected diagnostic headers, including:

- response date;
- content type;
- provider request ID;
- trace ID where available;
- quota headers;
- cache status where useful.

Infrastructure headers are retained for operations but are not product data.

---


## 10. Four-market WNBA slate audit

### 10.1 Captured request set

The audit queried all **6** discovered WNBA events individually using the four V1 markets and ten explicit bookmaker candidates.

Retrieval time: `2026-07-10T21:34:34Z`.

### 10.2 Slate-level results

- Events requested: **6**
- Successful event responses: **6**
- Failed event responses: **0**
- Events with zero prop coverage: **0**
- Distinct player names across slate: **49**
- Duplicate outcome groups detected: **14**
- Missing `last_update`: **0**
- Missing price: **0**
- Missing point/line: **0**
- Total quota used: **24**
- Requests with unknown quota cost: **0**

All six events returned prop coverage, and all four requested markets appeared across the slate.

### 10.3 Event coverage summary

| Event ID | Matchup | Books returned | Players | Duplicate groups | Credits |
|---|---|---:|---:|---:|---:|
| `1547b39904db439304af0dfdacaa469d` | Golden State Valkyries at Connecticut Sun | 7 | 9 | 5 | 4 |
| `7295f7e8db8d22124fdf261cda31a1f6` | Dallas Wings at Toronto Tempo | 6 | 11 | 6 | 4 |
| `14c1ed8012d1c1a70778c1d1aa348e83` | Chicago Sky at Los Angeles Sparks | 7 | 9 | 3 | 4 |
| `93c27f5318a98fdd2a9bfbc42269f134` | New York Liberty at Minnesota Lynx | 5 | 8 | 0 | 4 |
| `9f2c4d943190edd1073d4cd6760fcf8c` | Portland Fire at Atlanta Dream | 5 | 6 | 0 | 4 |
| `dbbae9c1944a4874fe492f9fe23d8f62` | Phoenix Mercury at Las Vegas Aces | 5 | 6 | 0 | 4 |

### 10.4 Quota result

Each event-specific request used **4 credits**, for **24 total credits** across six events.

This empirically supports the tested V1 cost formula:

`events × requested markets × one bookmaker-region equivalent`

The response headers remain authoritative for actual cost.

### 10.5 Bookmaker-key validation

All ten configured keys were accepted syntactically:

- `draftkings`
- `fanduel`
- `betmgm`
- `williamhill_us`
- `fanatics`
- `betrivers`
- `hardrockbet`
- `espnbet`
- `prizepicks`
- `underdog`

Acceptance does not imply that a bookmaker returns data for every event or market.

The sample event returned seven of the ten requested sources. BetMGM, Fanatics, and the configured theScore Bet candidate returned no props in that first capture. A later quota audit established `espnbet` as the working key that returned title `theScore Bet`.

### 10.6 Coverage sparsity

Coverage varies by event, bookmaker, market, and player.

A successful response may include:

- fewer bookmakers than requested;
- fewer than all requested markets for a bookmaker;
- different player counts across bookmakers;
- zero results from a syntactically valid bookmaker key.

No missing bookmaker or market is imputed.

The consensus denominator includes only eligible sportsbook observations actually returned for the exact event, player, market, line, and snapshot.

### 10.7 Response hierarchy and normalization

Observed hierarchy:

- event
  - bookmaker
    - market
      - outcome

Observed outcome fields:

- `name`: side, normally Over or Under;
- `description`: player display name;
- `price`: American odds;
- `point`: line.

Each raw outcome is normalized with event, bookmaker, source class, market, raw and normalized player name, linked player ID, side, point, price, provider `last_update`, SlipLabz `observed_at`, raw row reference, and normalization version.

### 10.8 Duplicate outcomes

The audit detected **14 duplicate outcome groups**.

The sample event contained repeated BetRivers `player_threes` over outcomes for the same player and point.

Deduplication rules:

1. group by event, bookmaker, market, normalized player, side, point, price, and `last_update`;
2. preserve all raw row references;
3. emit one canonical observation for field-equivalent duplicates;
4. record the duplicate count;
5. quarantine materially conflicting duplicates;
6. deduplicate before movement, current-line, or consensus calculations.

### 10.9 Outcome completeness

A bookmaker/player/market group is classified as:

- `two_sided_complete`
- `over_only`
- `under_only`
- `multi_line`
- `duplicate_contaminated`
- `conflicting`
- `unresolved`

Price-derived calculations require the relevant price and understood side semantics. PrizePicks and Underdog are not forced into conventional sportsbook pairing rules.

### 10.10 Timestamps

Every returned market in this audit had a non-null `last_update`.

SlipLabz stores provider `last_update` separately from SlipLabz `observed_at`, first seen, last seen, and change timestamps.

The exact semantics of `last_update` remain subject to the official documentation and repeated-snapshot tests.

### 10.11 Player reconciliation

The slate contained **49** distinct player names.

A normalized comparison against the supplied BALLDONTLIE active-player snapshot found **0** unmatched names.

All 49 names matched after normalization.

Production matching still requires reviewed provider mappings, normalized name plus event/team context, aliases, and manual review where needed.

### 10.12 Source classes

Conventional sportsbooks:

- DraftKings
- FanDuel
- BetMGM
- Caesars
- Fanatics
- BetRivers
- Hard Rock Bet
- theScore Bet

Pick’em / DFS:

- PrizePicks
- Underdog

Only conventional sportsbooks are eligible for conventional sportsbook consensus.

### 10.13 Consensus eligibility

A sportsbook observation is eligible only when event and player mappings are approved, the source is a conventional sportsbook, market and point are valid, freshness is acceptable, duplicate conflicts are resolved, and outcome semantics are understood.

Consensus is calculated at the exact market and point grain. Different line values are not treated as identical products.

### 10.14 Missing-data policy

- Missing `point` → quarantine.
- Missing player description → quarantine.
- Missing outcome side → quarantine.
- Missing `last_update` → timestamp unavailable; exclude where freshness cannot be established.
- Missing `price` → no implied-probability calculation.
- Empty bookmaker list → valid zero-coverage only after a successful schema-valid response.

---



## 11. PrizePicks provider-specific audit

### 11.1 Captured request

- Bookmaker key: `prizepicks`
- Source class: `dfs_pickem`
- Event ID: `1547b39904db439304af0dfdacaa469d`
- Matchup: Golden State Valkyries at Connecticut Sun
- Retrieval time: `2026-07-10T21:45:20Z`
- HTTP status: `200`
- Requested markets:
  - `player_points`
  - `player_rebounds`
  - `player_assists`
  - `player_threes`
- `includeMultipliers=true`
- Quota used: **4**

### 11.2 Coverage result

- Normalized outcome rows: **26**
- Distinct players: **8**
- Markets returned: **4**
- Players in points: **8**
- Players in rebounds: **2**
- Players in assists: **2**
- Players in made threes: **1**
- Missing prices: **0**
- Missing points: **0**
- Exact duplicate groups: **0**
- Multiple-point offerings: **0**

### 11.3 Observed outcome semantics

Every captured player-market offering appeared as an Over and Under pair at the same point.

Observed side counts:

- Over rows: **13**
- Under rows: **13**

Observed prices:

- `-137`: 26 rows

Observed multipliers:

- `None`: 26 rows

The capture returned `price=-137` for every Over and every Under outcome, while every multiplier was null.

### 11.4 Locked price interpretation

The PrizePicks `price` field is not treated as a conventional sportsbook price.

The evidence shows:

- identical price on both sides;
- identical price across players;
- identical price across all four markets;
- no accompanying multiplier distinction.

Therefore PrizePicks prices are classified as `provider_synthetic_or_display_price` unless later official documentation proves a different semantic.

They must not be used for:

- implied probability;
- vig removal;
- sportsbook consensus pricing;
- best-price comparison;
- expected value;
- side-strength interpretation.

The raw price is still retained for audit.

### 11.5 Multiplier interpretation

Although the request used `includeMultipliers=true`, every returned multiplier was null.

Therefore:

- null does not mean a standard payout with certainty;
- the absence of a multiplier cannot identify Standard, Goblin, or Demon;
- Goblin/Demon classification must not be inferred from line height alone;
- a provider-specific promotion type remains `unknown` unless directly encoded or manually verified.

### 11.6 Line representation

This capture contained no player-market with multiple distinct points.

Accordingly:

- the observed response represents one point per player-market;
- this does not prove PrizePicks never exposes multiple points;
- future snapshots may contain alternate or promotional lines;
- the storage model must still support multiple simultaneous points.

The logical PrizePicks offering identity is:

`(event_id, player_id_or_normalized_name, market_key, point, observed_at)`

Over and Under rows are retained as source outcomes, but the product-facing PrizePicks line may be represented as one pick’em offering with two selectable directions when both sides share the same point.

### 11.7 Standard, Goblin, and Demon status

No reliable Standard/Goblin/Demon discriminator was present in this response.

The following fields did not resolve promotion type:

- bookmaker key;
- market key;
- outcome side;
- point;
- constant price;
- null multiplier.

PrizePicks promotion type is therefore stored as:

- `standard` only when explicitly established;
- `goblin` only when explicitly established;
- `demon` only when explicitly established;
- otherwise `unknown`.

A contemporaneous UI comparison or future provider field is required before assigning a specific type.

### 11.8 Product treatment

PrizePicks is:

- excluded from sportsbook consensus;
- excluded from sportsbook price comparison;
- eligible for a separate pick’em comparison surface;
- eligible for line-history tracking;
- eligible for “your line versus PrizePicks line” display;
- not eligible for implied-probability claims from the observed `price`.

Displayed copy should identify it as a pick’em source, not a sportsbook.

### 11.9 Freshness

All captured PrizePicks markets shared market `last_update`:

`2026-07-10T21:44:38Z`

The response was retrieved at:

`2026-07-10T21:45:20Z`

Observed lag was approximately **42 seconds**.

This is one observation only. It supports storing and displaying provider timestamp separately from SlipLabz observation time, but it does not establish the normal update interval.

### 11.10 Quota

The PrizePicks-only four-market request cost **4 credits**.

The tested cost depends on requested markets rather than returned row count. The headers remain authoritative.

### 11.11 Remaining PrizePicks validation

Still desirable but not blocking for schema design:

- contemporaneous PrizePicks UI comparison;
- a response containing a confirmed Goblin line;
- a response containing a confirmed Demon line;
- repeated snapshots showing line addition, removal, or point change;
- official documentation for `includeMultipliers` and DFS price semantics.


## 12. Underdog provider-specific audit

### 12.1 Captured request

- Bookmaker key: `underdog`
- Source class: `dfs_pickem`
- Event ID: `1547b39904db439304af0dfdacaa469d`
- Matchup: Golden State Valkyries at Connecticut Sun
- Retrieval time: `2026-07-10T21:45:20Z`
- HTTP status: `200`
- Requested markets:
  - `player_points`
  - `player_rebounds`
  - `player_assists`
  - `player_threes`
- `includeMultipliers=true`
- Quota used: **3**

### 12.2 Coverage result

- Normalized outcome rows: **11**
- Distinct players: **5**
- Markets returned: **3**
- Points players: **4**
- Rebounds players: **1**
- Assists players: **0**
- Made-threes players: **1**
- Missing prices: **0**
- Missing points: **0**
- Exact duplicate groups: **0**
- Multiple-point offerings: **0**

Underdog returned no assists market for this event.

### 12.3 Observed outcome semantics

Observed side counts:

- Over rows: **6**
- Under rows: **5**

Observed prices:

- `-137`: 11 rows

Observed multipliers:

- `1.0`: 11 rows

All rows used `price=-137` and `multiplier=1.0`.

### 12.4 Locked price interpretation

As with PrizePicks, the Underdog `price` field is not treated as a conventional sportsbook price.

The evidence shows:

- one constant price across all returned players and markets;
- identical price on paired Over and Under outcomes;
- no side-specific pricing information.

Underdog prices are classified as `provider_synthetic_or_display_price` unless official documentation establishes a different semantic.

They are excluded from:

- implied-probability calculations;
- vig removal;
- best-price logic;
- sportsbook consensus pricing;
- expected-value claims.

The raw value remains retained for audit.

### 12.5 Multiplier interpretation

Every row returned `multiplier=1.0`.

This establishes only that the API supplied a numeric multiplier field for this snapshot.

It does not establish that:

- `1.0` is a payout multiplier;
- `1.0` is equivalent to standard;
- the multiplier can be compared directly with PrizePicks;
- a non-1.0 value would necessarily indicate an alternate line.

Therefore the multiplier is stored as provider metadata and not converted into probability or expected value without official semantics.

### 12.6 One-sided offerings

The response contained **1** over-only player-market-point group and **0** under-only groups.

Observed over-only group:

- `player_points` — kayla thornton at 8.5

This proves Underdog may return a one-sided offering.

Accordingly:

- absence of the opposite side is not automatically an ingestion error;
- the offering state is explicitly `over_only` or `under_only`;
- the product must not fabricate the missing direction;
- one-sided rows remain excluded from conventional sportsbook two-sided pricing analysis;
- removal of one side across snapshots is tracked as a material offering change.

### 12.7 Market availability

Underdog returned:

- `player_points`
- `player_rebounds`
- `player_threes`

It did not return `player_assists`.

Therefore source coverage is evaluated independently for each event and market. A missing assists market does not mark the source unavailable globally.

### 12.8 Multi-line handling

No player-market had multiple simultaneous points in this snapshot.

The schema still supports multiple points because later snapshots or other events may expose:

- standard and alternate lines;
- changed lines overlapping during provider transitions;
- promotional variants.

Each distinct point remains a separate offering.

### 12.9 Product treatment

Underdog is:

- excluded from sportsbook consensus;
- excluded from sportsbook price comparison;
- eligible for a separate pick’em comparison surface;
- eligible for line-history and movement tracking;
- eligible for one-sided offering display;
- not eligible for implied-probability claims using the observed price or multiplier.

Displayed copy must identify it as a pick’em source, not a sportsbook.

### 12.10 Freshness

All captured Underdog markets shared:

`last_update = 2026-07-10T21:44:42Z`

The response was retrieved at:

`2026-07-10T21:45:20Z`

Observed lag was approximately **38 seconds**.

This is a single observation and does not establish a normal update interval.

### 12.11 Quota

The Underdog-only request asked for four markets but returned three and cost **3 credits**.

This is material evidence that event-odds cost may track markets actually returned or billable for the selected source, rather than simply markets requested.

The exact quota rule remains pending official documentation and broader tests. Response headers are authoritative.

### 12.12 Remaining Underdog validation

Still desirable but not blocking for schema design:

- repeated snapshots showing line changes;
- a confirmed multi-line response;
- a response with multiplier values other than `1.0`;
- contemporaneous Underdog UI comparison;
- official documentation for multiplier and price semantics.


## 13. Quota and request-shape audit

### 13.1 Audit scope

The audit used one WNBA event and tested:

- four markets with ten explicit bookmakers;
- four markets with twelve explicit bookmakers;
- a repeated ten-bookmaker request;
- four markets using `regions=us`;
- an invalid market request.

All successful tests returned quota headers.

### 13.2 Observed results

| Test | Status | Bookmaker-region equivalents | Returned books | Returned markets | Observed cost |
|---|---:|---:|---:|---:|---:|
| Four markets, 10 explicit bookmakers | 200 | 1 | 8 | 4 | 4 |
| Four markets, 12 explicit bookmakers | 200 | 2 | 9 | 4 | 8 |
| Four markets, repeated 10-book request | 200 | 1 | 8 | 4 | 4 |
| Four markets, `regions=us` | 200 | 1 | 5 | 4 | 4 |
| Invalid market | 422 | 1 | 0 | 0 | 0 |

### 13.3 Ten-bookmaker threshold

The ten-bookmaker request was billed as one bookmaker-region equivalent.

Observed cost:

`4 markets × 1 equivalent = 4 credits`

The request returned eight bookmakers, but billing was based on the request shape rather than the number of books actually returned.

### 13.4 Eleven-or-more bookmaker behavior

The twelve-bookmaker request was billed as two bookmaker-region equivalents.

Observed cost:

`4 markets × 2 equivalents = 8 credits`

This establishes the tested threshold behavior:

- 1–10 explicit bookmaker keys → one equivalent;
- 11–20 explicit bookmaker keys → two equivalents.

The application must compute expected cost from requested bookmaker count, not returned bookmaker count.

### 13.5 Explicit bookmakers versus regions

The explicit ten-bookmaker request and the `regions=us` request each cost four credits, but they did not return the same source set.

Explicit request returned eight sources, including:

- Hard Rock Bet;
- theScore Bet via key `espnbet`;
- PrizePicks;
- Underdog.

The `regions=us` request returned five sources and omitted several explicitly desired sources.

Therefore V1 should use an explicit bookmaker allowlist rather than relying on `regions=us`.

Benefits:

- deterministic source membership;
- explicit separation of sportsbooks and pick’em sources;
- avoidance of accidental source additions;
- clearer quota forecasting;
- easier product eligibility rules.

### 13.6 Returned coverage does not determine cost

The audit confirms:

- requested bookmakers may return no data;
- requested markets may return uneven source coverage;
- quota is not reduced merely because fewer bookmakers returned;
- successful request cost is determined by billable request dimensions and provider rules.

The earlier Underdog-only request remains a special observed case: four markets were requested, three returned, and three credits were charged. That provider-specific behavior should not be generalized to conventional multi-bookmaker requests without official documentation.

### 13.7 Invalid-market failure

The invalid market request returned HTTP **422**.

Observed quota behavior:

- quota before: 40660
- quota after: 40660
- observed cost: **0**
- consumed quota: **No**

Locked handling:

- classify as a non-retryable request-validation failure;
- retain status, headers, content type, and raw body;
- alert if application-generated production requests contain unsupported markets;
- do not repeatedly retry;
- never assume all failed requests are free based on one error class.

### 13.8 Quota forecasting contract

For the tested event-odds shape, expected cost is:

`requested market count × bookmaker-region equivalents`

where explicit bookmaker equivalents are provisionally:

`ceil(requested bookmaker count / 10)`

The provider response header `x-requests-last` remains authoritative.

The ingestion service records:

- requested markets;
- requested bookmaker keys;
- requested regions;
- expected cost;
- observed cost;
- `x-requests-used`;
- `x-requests-remaining`;
- mismatch flag.

A cost mismatch triggers an operational alert and does not silently change forecasting logic.

### 13.9 Source-key correction

This package confirms that the current key for theScore Bet in the tested response is:

`espnbet`

with returned title:

`theScore Bet`

The earlier candidate `thescorebet` must not be used unless separately validated by the provider.

Provider keys are configuration data and may change. Titles are display metadata and are not stable identifiers.

### 13.10 Artifact-quality issue

The supplied `quota_results.csv` contains headers but zero data rows, while the JSON package contains five completed tests.

Therefore:

- JSON is the evidentiary source for this package;
- the CSV is not accepted as a complete tabular export;
- the audit script should be corrected before it becomes reusable production validation tooling.

This does not invalidate the quota findings because the JSON test records and response headers are complete.

### 13.11 Remaining quota validation

Still useful:

- a successful event request returning zero bookmakers or zero markets;
- a valid but unavailable event/market combination;
- an invalid event ID;
- an invalid bookmaker-only request;
- naturally encountered quota exhaustion or rate limiting, without intentionally burning quota;
- official documentation confirming the billing formula and special pick’em behavior.

These are not all required before continuing the product specification, but the official documentation packet remains required before the final technical authority is closed.


## 14. Official V4 documentation contract

### 14.1 Host and authentication

Official host:

`https://api.the-odds-api.com`

The API key is supplied as the `apiKey` query parameter.

SlipLabz must:

- inject the key through secret management;
- redact it from request logs and artifacts;
- never expose it to client-side code;
- retain only redacted request URLs.

### 14.2 Events endpoint

Official endpoint:

`GET /v4/sports/{sport}/events`

The endpoint returns in-play and pre-match event identity and scheduling fields without odds.

Approved V1 parameters:

- `apiKey`
- `dateFormat`
- `eventIds`
- `commenceTimeFrom`
- `commenceTimeTo`
- `includeRotationNumbers`

The endpoint does not count against quota.

This confirms that event discovery may be refreshed independently from paid prop polling.

### 14.3 Event-odds endpoint

Official endpoint:

`GET /v4/sports/{sport}/events/{eventId}/odds`

The endpoint:

- returns odds for one event;
- accepts any available market key;
- is the intended endpoint for non-featured markets such as player props;
- may have limited coverage by sport and bookmaker.

Approved V1 parameters include the ordinary odds parameters plus:

- `eventId`
- `includeMultipliers`

### 14.4 `includeMultipliers`

The official documentation states that `includeMultipliers=true` is applicable to US DFS sites and includes multipliers in each selection outcome when available.

Locked interpretation:

- the field is optional;
- absence or null remains valid;
- a numeric multiplier is provider metadata unless its semantic meaning is otherwise documented;
- PrizePicks and Underdog multiplier handling remains provider-specific.

### 14.5 Market-level `last_update`

For event odds, `last_update` exists at the market level rather than the bookmaker level because markets can update on independent schedules.

This confirms the existing V1 storage grain:

`bookmaker × market × provider last_update`

SlipLabz must not manufacture a bookmaker-wide update timestamp by taking one market timestamp without labeling it as derived.

### 14.6 Bookmakers and regions

If both `bookmakers` and `regions` are supplied, `bookmakers` takes priority.

Explicit bookmaker billing equivalence:

- up to 10 bookmaker keys = 1 region;
- 11–20 bookmaker keys = 2 regions;
- continue by groups of 10.

This officially confirms the observed quota audit and supports an explicit V1 allowlist.

### 14.7 Quota formula

Official current/event-odds quota formula:

`number of markets × number of regions or bookmaker-region equivalents`

Response headers:

- `x-requests-remaining`
- `x-requests-used`
- `x-requests-last`

The response header remains authoritative for actual request cost.

The official documentation also states that empty odds data does not consume quota.

This explains why provider-specific requests may cost fewer credits when a requested market has no returned odds.

### 14.8 Event lifecycle

The current odds feed reflects events listed by bookmakers.

Official lifecycle caveats:

- events may temporarily disappear between rounds;
- events may be absent out of season;
- current odds endpoints do not return completed events;
- commence time may be used to distinguish pre-start from commenced/in-play, but not to establish authoritative completion.

This supports retaining BALLDONTLIE as the authoritative final-status source.

### 14.9 Odds formatting

Supported formats:

- `decimal`
- `american`

V1 requests American odds.

The official documentation warns that American-format values may have small rounding discrepancies for some bookmakers.

Therefore:

- raw American values are retained;
- price equality must not be assumed across converted formats;
- no conversion-derived difference is described as a bookmaker move without source evidence.

### 14.10 Event-markets endpoint

Official endpoint:

`GET /v4/sports/{sport}/events/{eventId}/markets`

It returns recently seen market keys by bookmaker for one event.

It is not a comprehensive list of every supported market, and more market keys may appear as commence time approaches.

V1 use is optional:

- diagnostic discovery;
- determining whether a market is beginning to open;
- avoiding unnecessary paid event-odds requests where useful.

It must not be treated as a permanent market capability registry.

### 14.11 Historical odds

The documentation includes paid historical endpoints for:

- historical sport odds;
- historical event discovery;
- historical event odds.

Historical snapshots:

- return the closest available snapshot equal to or before the requested timestamp;
- include previous and next snapshot timestamps;
- are generally available at 10-minute intervals historically and 5-minute intervals from September 2022 onward;
- include additional markets such as player props from May 2023 onward;
- may preserve historical data errors even after current-feed corrections;
- only include sources, sports, and markets after provider support began.

### 14.11.1 V1 seed policy

The V1 architecture supports a current-season historical closing-line seed before launch.

Required process:

1. select a canonical BALLDONTLIE game already classified `final`;
2. use the historical events endpoint to discover the historical Odds API event ID;
3. map that event to the internal/BALLDONTLIE game;
4. request historical event odds at the canonical close-boundary timestamp;
5. use the returned closest snapshot equal to or before that boundary;
6. reject the close capture if its provider snapshot timestamp is more than 10 minutes before the close boundary;
7. ingest only eligible conventional sportsbook offerings present in that snapshot;
8. calculate the canonical historical closing point under the complete specification.

A line absent from the final historical snapshot is not resurrected from an older snapshot. A snapshot outside the 10-minute close-capture tolerance is classified `close_capture_stale` and does not create a historical result.

The import is attempted for the season active at launch. Population is conditional on confirmed WNBA player-prop coverage and provider rights permitting retention and display. Unsupported or unapproved slices remain forward-only and are labeled missing.

### 14.11.2 Historical quota

The official historical event-odds cost is:

`10 × regions or bookmaker-region equivalents × markets × events`

Region-equivalents follow the same `ceil(explicit bookmaker count / 10)` grouping used for current event odds. The multiplier scales with region-equivalents rather than the number of books: up to ten keys is one region-equivalent, and more than ten keys increases it.

With up to ten explicit conventional sportsbook keys and four launch markets, the forecast is **40 credits per event**.

The response header `x-requests-last` remains authoritative.

Historical event discovery has its own documented cost and should be budgeted separately.

### 14.11.3 Provenance and time

Historical requests store:

- request kind `historical_query`;
- provenance `backfilled_historical`;
- requested close-boundary timestamp;
- returned provider snapshot timestamp;
- retrieval timestamp;
- raw response reference.

Historical rows:

- never populate current-line selection;
- never create first-observed timestamps;
- never create movement-from-first-observed history;
- never masquerade as continuously observed SlipLabz history.

Prior seasons remain optional later sources for validation, gap repair, and broader research.

### 14.12 Documentation status

This PDF is accepted as the official core V4 endpoint and quota authority.

It does not itself close:

- current bookmaker reference completeness;
- current supported-market reference completeness;
- update-frequency expectations by bookmaker or market;
- rate-limit contract;
- complete error-code catalog;
- commercial redistribution, caching, and retention terms.

---

## 15. Canonical V1 storage contract

### 15.1 Raw captures

Every successful or failed request creates an immutable ingestion record containing:

- provider;
- request kind: `current_poll` or `historical_query`;
- endpoint;
- redacted request URL;
- request parameters;
- requested event ID;
- requested effective timestamp when historical;
- requested bookmaker keys;
- requested market keys;
- requested time;
- completed time;
- HTTP status;
- selected response headers;
- raw body reference;
- parser version;
- normalization version;
- observed quota cost;
- ingestion outcome.

Raw response bodies are retained according to the approved commercial and retention policy. A failed parse does not destroy the raw body.

### 15.2 Normalized market snapshot

A market snapshot has a synthetic `market_snapshot_id`.

Within one ingestion run, enforce uniqueness on:

`(ingestion_run_id, provider_event_id, bookmaker_key, market_key)`

Provider/effective timestamps remain attributes rather than nullable composite-key members.

Stored fields include:

- linked internal game ID;
- provider event ID;
- bookmaker key and title;
- source class;
- market key;
- request kind;
- provenance: `self_observed` or `backfilled_historical`;
- provider snapshot timestamp when historical;
- provider market `last_update`;
- SlipLabz retrieval timestamp;
- SlipLabz `observed_at` for forward polling only;
- freshness state for current polling only;
- raw payload reference;
- row count;
- duplicate count;
- schema-validation state.

### 15.3 Normalized offering

A canonical offering is identified within a snapshot by:

`(provider_event_id, bookmaker_key, market_key, internal_player_id, point, outcome_side)`

Before player resolution, the normalized provider name is used in a quarantine/staging key.

Stored fields include:

- raw player description;
- normalized player name;
- internal player ID;
- side;
- point;
- American price;
- multiplier;
- promotion type;
- offering state;
- duplicate count;
- source row references;
- eligibility flags.

No source row is silently discarded.

---

## 16. Current-line and snapshot selection

### 16.1 Current snapshot

For each event, bookmaker, and market, the current usable snapshot is the latest successfully observed **current poll** that:

- has request kind `current_poll` and provenance `self_observed`;
- passes schema validation;
- is not superseded by a later successful snapshot;
- meets the freshness threshold;
- is not from after the event became ineligible for pregame display.

A failed poll does not overwrite the last valid snapshot.

A successful schema-valid empty **current-poll** response is stored as a new zero-coverage observation. It removes the prior snapshot from `current` status while preserving it as the last non-empty historical snapshot. Product surfaces may show the prior line only as stale historical context, never as current.

### 16.2 Current offering

For each event, bookmaker, market, and player:

- preserve every simultaneous point;
- do not collapse alternate lines;
- designate a primary line only when the source supplies exactly one valid point or a provider-specific primary-line rule exists;
- otherwise expose multiple offerings or mark primary line unresolved.

For conventional sportsbooks, an exact Over/Under pair at the same point is preferred. One-sided sportsbook rows may be displayed as incomplete but are excluded from two-sided price analytics.

### 16.3 Opening observation

“Opening” means the first successfully observed, eligible SlipLabz snapshot for that exact event, bookmaker, market, player, and point family.

It does **not** mean the bookmaker’s true market open unless The Odds API supplies and documents such a field.

Customer copy must use “first observed” rather than “opening” unless this distinction is made explicit.

---

## 17. Movement and disappearance contract

The following changes are detected between consecutive successful snapshots at the same event/bookmaker/market/player grain:

- `point_changed`
- `over_price_changed`
- `under_price_changed`
- `side_added`
- `side_removed`
- `point_added`
- `point_removed`
- `player_added`
- `player_removed`
- `market_added`
- `market_removed`
- `bookmaker_added`
- `bookmaker_removed`
- `duplicate_state_changed`
- `provider_timestamp_changed`
- `unchanged`

A point change is represented as removal of the old point plus addition of the new point, with a linked movement event when the transition is unambiguous.

Disappearance requires two concepts:

- `not_returned_in_snapshot`
- `confirmed_removed`

Until repeated-snapshot evidence establishes a better threshold, a single omission is not considered confirmed removal. V1 confirms removal after two consecutive successful polls in which the offering is absent, unless the event has started or the whole source/market is unavailable.

The repeated-snapshot audit may refine this rule without changing the storage model.

---

## 18. Consensus contract

### 18.1 Eligible sources

Only configured conventional sportsbooks are eligible.

PrizePicks and Underdog are excluded.

The initial conventional source allowlist is configuration-driven and may include:

- `draftkings`
- `fanduel`
- `betmgm`
- `williamhill_us`
- `fanatics`
- `betrivers`
- `hardrockbet`
- `espnbet`

A key’s presence in configuration does not imply current coverage.

### 18.2 Exact-market grain

Consensus never mixes:

- different events;
- different players;
- different market keys;
- stale and current observations;
- sportsbook and DFS sources.

Two distinct aggregation grains are supported:

- **line consensus:** summarizes the distribution of current sportsbook points across eligible books for one event, player, and market;
- **price consensus:** compares or aggregates prices only among observations at the exact same point and side.

For a user-entered line, SlipLabz may compare that line with the distribution of current sportsbook lines. It must distinguish:

- number of eligible books;
- median line;
- minimum line;
- maximum line;
- count at each exact point;
- sources unavailable or stale.

### 18.3 Price handling

American prices may be converted to raw implied probabilities for conventional sportsbooks only.

Any no-vig or consensus probability requires:

- a complete two-sided pair at the same point;
- documented conversion;
- explicit aggregation methodology;
- exclusion of DFS synthetic/display prices.

V1 does not need to publish a consensus probability. Line consensus and book-grid display are sufficient.

### 18.4 Canonical historical closing point

Historical real-line metrics do not use the descriptive arithmetic median unless it is also the selected observed point.

For each game/player/market:

- retain source-level closing quotes;
- use a single observed source point when only one eligible sportsbook exists, labeled `single_book`;
- with multiple eligible sportsbooks, select the unique modal observed point;
- if no unique mode exists, mark the closing consensus unresolved and exclude the game from aggregate historical windows.

This prevents creation of a synthetic line between two sportsbook points.

## 19. Polling, freshness, and staleness

### 19.1 Proposed V1 polling cadence

The cadence is provisional until the repeated-snapshot evidence is complete:

- more than 6 hours before tip: every 60 minutes;
- 2–6 hours before tip: every 30 minutes;
- 30–120 minutes before tip: every 10 minutes;
- inside 30 minutes: every 5 minutes;
- stop pregame polling at scheduled tip unless a brief grace window is required to handle delayed start;
- do not present in-play observations as pregame lines.

Free event discovery may run more frequently because it does not consume quota.

### 19.2 Freshness states

Each market snapshot is classified as:

- `fresh`
- `aging`
- `stale`
- `unavailable`
- `failed_latest_poll`

Initial thresholds:

- fresh: provider `last_update` no more than 10 minutes old;
- aging: more than 10 and no more than 30 minutes old;
- stale: more than 30 minutes old.

These are product thresholds, not claims about provider update guarantees. The repeated-snapshot audit may tune them.

### 19.3 Failure behavior

On transport, authorization, quota, rate-limit, or parsing failure:

- retain the last valid snapshot;
- mark the latest poll failed;
- display its actual observation/provider timestamps;
- suppress “live” or “current” wording when stale;
- do not replace valid data with an empty object;
- retry only according to error class.

---

## 20. Error and retry matrix

| Class | Example | Retry | Required action |
|---|---|---|---|
| Invalid request | 400/422 | No | Fix parameters; alert on production-generated request |
| Unauthorized/invalid key | 401 | No until configuration changes | Halt provider jobs; alert; rotate/fix key |
| Forbidden/subscription | 403 | No until access changes | Halt affected endpoint; verify plan |
| Event not found | 404 | Limited reconciliation retry | Refresh events; verify event lifecycle |
| Rate limited | 429 | Yes | Honor retry guidance; exponential backoff with jitter |
| Server error | 5xx | Yes | Bounded retries with jitter; retain last valid data |
| Timeout/network | Transport error | Yes | Bounded retries; idempotent ingestion |
| Schema drift | 200 with invalid body | No blind retry | Preserve raw body; quarantine; alert |
| Successful empty | 200 empty/no books | No immediate error retry | Record valid zero coverage and zero/observed quota cost |

The invalid-market audit directly validates the non-retryable 422 path. Other classes remain documentation- or implementation-derived until naturally observed.

---

## 21. Quota budgeting and safeguards

The forecast for event odds is:

`events polled × billable markets × bookmaker-region equivalents × polling runs`

Safeguards:

- explicit bookmaker allowlist;
- no more than 10 keys in the default V1 bundle unless intentionally budgeted;
- event discovery before paid polling;
- do not poll completed or unmapped events;
- stop polling after pregame eligibility ends;
- record expected and observed cost;
- daily and monthly quota alarms;
- emergency circuit breaker before exhaustion;
- separate development and production quota budgets where possible.

Quota forecasts use worst-case billable markets. Header observations are authoritative.

---

## 22. Security, privacy, and observability

- API keys are server-side secrets.
- Query strings are redacted before logging.
- Raw headers are filtered to avoid accidental secret retention.
- Provider request IDs and trace IDs may be retained.
- Every derived customer value can be traced to source snapshots and normalization version.
- Ingestion metrics include success rate, latency, returned books, returned markets, duplicate groups, stale markets, mapping failures, and quota cost.
- Alerts must distinguish provider outage, empty coverage, stale source, mapping failure, and application bug.

---

## 23. Verification and launch gates

### 23.1 Sufficient for implementation now

The sub-spec is sufficient to implement:

- event discovery;
- event-specific four-market polling;
- explicit bookmaker selection;
- raw capture and normalization;
- player/event reconciliation queues;
- sportsbook versus DFS classification;
- deduplication;
- current snapshot storage;
- quota accounting;
- stale-data behavior;
- line comparison and book-grid surfaces.

### 23.2 Validation gate before movement features are called complete

Still required:

- completed repeated snapshots of the same event;
- validation of point, price, addition, removal, and disappearance behavior;
- adjustment of provisional freshness/removal thresholds if evidence requires it.

The storage and change model is intentionally designed so this validation should refine policy rather than require schema redesign.

### 23.3 Legal launch gate

Before paid production display or long-term retention, obtain approval for:

- commercial display in an analytical subscription product;
- caching and retention duration;
- storing self-observed line history;
- displaying derived consensus and movement;
- treatment of raw versus derived data;
- restrictions on redistribution or bulk export;
- attribution requirements.

### 23.4 Optional follow-up evidence

Useful but non-blocking:

- current bookmaker reference export;
- current supported-player-market reference;
- published update intervals;
- rate-limit page;
- natural 401, 403, 404, 429, and 5xx examples;
- PrizePicks/Underdog UI comparisons;
- confirmed promotional or alternate DFS lines.

---

## 24. Final readiness decision

The Odds API sub-spec contains enough technical detail to proceed with the combined SlipLabz V1 application and data specification.

It is **implementation-ready for core ingestion and research surfaces**.

It is not yet evidence-complete for:

- final movement/removal thresholds;
- commercial launch rights.

Those are explicit validation and legal gates, not missing architectural definitions.

---

## 25. Cross-provider integration handoff

The Odds API adapter consumes reviewed internal mappings originating from the BALLDONTLIE identity layer.

Required mappings:

- Odds API event ID ↔ internal game ID ↔ BALLDONTLIE game ID;
- Odds API player display identity ↔ internal player ID ↔ BALLDONTLIE player ID;
- Odds API team string ↔ internal team ID ↔ BALLDONTLIE team ID;
- bookmaker key ↔ source class and product eligibility;
- market key ↔ canonical SlipLabz stat definition.

An odds observation remains in staging or quarantine until event and player mappings resolve.

No Odds API raw string becomes a canonical player, team, or game identity by itself.

---

## 26. Master-spec integration contract

When merged into the complete SlipLabz V1 specification, the following definitions must remain authoritative:

- BALLDONTLIE owns canonical players, teams, games, final status, completed statistics, and current availability context.
- The Odds API owns current pregame sportsbook and pick’em offerings.
- Conventional sportsbooks and DFS/pick’em sources remain distinct source classes.
- “First observed” is not represented as a true bookmaker opening line.
- Line consensus summarizes sportsbook point distributions.
- Price comparison occurs only at exact point and side.
- Successful empty responses are valid zero-coverage observations.
- Failed responses preserve the last valid snapshot but make freshness/failure visible.
- Movement and removal policies remain provisional until the repeated-snapshot package is reviewed.
- Paid production launch remains subject to provider-rights approval.

This sub-spec is ready for integration into the complete V1 specification with those gates preserved.

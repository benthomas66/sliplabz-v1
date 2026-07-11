# SlipLabz V1 Data-Ingestion Sub-Spec Integration Audit

**Audit date:** 2026-07-10  
**Documents reviewed (at audit time):**
- BALLDONTLIE Data Sub-Spec revision 0.8 (shipped as revision 0.9)
- The Odds API Data Sub-Spec revision 0.7 (shipped as revision 0.10)

Revisions advanced after this audit only to tighten the current-season historical-seed contract (historical event-ID discovery, the 10x historical quota multiplier, snapshot/retrieval time separation, current-line isolation, and the canonical observed closing-point method). The integration conclusions below are unaffected.

## 1. Final decision

Both sub-specs are ready to be integrated into the complete SlipLabz V1 specification after the corrections contained in the audited copies.

The provider architecture is coherent:

- BALLDONTLIE is canonical for players, teams, games, final status, completed player statistics, and current availability context.
- The Odds API is canonical for current pregame sportsbook and pick’em lines.
- Internal provider-independent IDs bridge the two systems.
- Conventional sportsbook consensus excludes PrizePicks and Underdog.
- Raw provider data is retained or immutably referenced.
- Unknown, conflicting, partial, and stale data are not silently converted into valid product observations.

## 2. Blocking defects found and corrected

### 2.1 BALLDONTLIE status inconsistency

The document called itself a working authority while declaring the architecture sufficient.

**Correction:** status changed to integration-ready with explicit validation and legal gates.

### 2.2 Missing consolidated BALLDONTLIE storage contract

The document described individual entity behavior but did not provide one implementation handoff for ingestion runs, snapshots, player-game rows, and watermarks.

**Correction:** added canonical storage and complete-import watermark contracts.

### 2.3 Availability disappearance ambiguity

A player disappearing from the current availability feed could have been misread as confirmed recovery.

**Correction:** added explicit states distinguishing latest-snapshot absence, stale feed, unresolved identity, and source failure. Disappearance alone cannot produce “healthy,” “cleared,” or “available.”

### 2.4 BALLDONTLIE cadence ambiguity

Phrases such as “periodically” and “frequently enough” were not executable defaults.

**Correction:** added configurable default intervals for teams, players, games, live-state detection, player stats, correction sweeps, and availability.

### 2.5 Odds API evidence-register inconsistency

The register still marked error evidence pending after the invalid-market 422 audit.

**Correction:** marked error evidence partial/sufficient.

### 2.6 Empty-response contradiction

The Odds API spec said empty polls did not overwrite the last valid snapshot, while also treating successful empty responses as valid zero coverage and disappearance evidence.

**Correction:** failed polls preserve the last valid snapshot; successful schema-valid empty responses create a new zero-coverage observation and end the prior snapshot’s current status.

### 2.7 Consensus-grain ambiguity

“Exact point grain” was correct for prices but too restrictive for a median-line consensus across books.

**Correction:** separated:
- line consensus across the distribution of sportsbook points;
- price comparison only at exact point and side.

### 2.8 Missing explicit cross-provider handoff

The documents described mappings independently but lacked a concise integration boundary.

**Correction:** added required event, player, team, bookmaker, and market mappings and staging/quarantine behavior.

## 3. Cross-document consistency checks

### Canonical ownership

**Pass.** Provider responsibilities do not conflict.

### Market mapping

**Pass.**
- `player_points` ↔ `pts`
- `player_rebounds` ↔ `reb`
- `player_assists` ↔ `ast`
- `player_threes` ↔ `fg3m`

### Event identity

**Pass with implementation validation gate.** Ordered teams, reviewed aliases, commence-time tolerance, season, and competition are used. A complete contemporaneous provider comparison remains required during implementation.

### Player identity

**Pass.** Name-only matching is prohibited; reviewed mappings and event/team context are required.

### Game finality

**Pass.** BALLDONTLIE is authoritative. Odds API commence time and disappearance do not establish completion.

### Time semantics

**Pass.** UTC-aware timestamps and separate provider versus SlipLabz observation timestamps are required.

### Duplicate handling

**Pass.** BALLDONTLIE detects duplicate source keys; Odds API deduplicates equivalent outcomes and quarantines material conflicts.

### Missing and partial data

**Pass after correction.** Partial pagination, failed polls, successful empties, stale snapshots, unresolved minutes, and one-sided DFS offerings are distinct states.

### Price semantics

**Pass.** Conventional sportsbook prices may support exact-line analysis; PrizePicks and Underdog synthetic/display prices are excluded from probability and best-price logic.

### Historical semantics

**Pass.** BALLDONTLIE completed stats support game-history calculations. Self-observed Odds API history is distinct from purchased historical snapshots and from true bookmaker opening history.

### Quota control

**Pass.** Explicit bookmaker allowlist, groups-of-ten equivalence, response-header accounting, forecasting, alarms, and circuit breakers are defined.

### Security

**Pass.** Server-side secrets, redacted query strings, raw-body retention controls, and traceability are defined.

## 4. Remaining gates that must survive master-spec integration

### Validation gates

- Complete the repeated Odds API snapshot package.
- Validate addition, removal, point movement, price movement, and disappearance behavior.
- Complete the newly-finalized BALLDONTLIE correction test.
- Run a complete contemporaneous cross-provider game-mapping test.

These gates may refine thresholds and operational policy. They do not require a schema redesign.

### Legal gates

For each provider, confirm:

- commercial display rights;
- caching and retention;
- raw-payload storage;
- self-observed historical line storage;
- derived analytics and consensus display;
- attribution;
- redistribution and bulk-export restrictions.

No paid production launch should occur before these are resolved.

## 5. Integration instructions for the complete product spec

The master spec should not paste every audit artifact into the main product narrative.

It should incorporate:

1. canonical provider ownership;
2. normalized entities and source keys;
3. eligibility and quarantine rules;
4. cross-provider mapping contracts;
5. ingestion cadence and correction behavior;
6. freshness, staleness, and failure semantics;
7. consensus and DFS separation;
8. quota and security constraints;
9. validation and legal launch gates.

The detailed provider audits should remain linked technical authorities or appendices.

## 6. Final readiness rating

- **Architecture completeness:** Pass
- **Schema readiness:** Pass
- **Normalization readiness:** Pass
- **Cross-provider boundary:** Pass
- **Operational readiness:** Pass with configurable provisional Odds API thresholds
- **Movement evidence:** Pending validation
- **Commercial launch rights:** Pending legal review
- **Ready for complete-spec integration:** **Yes**

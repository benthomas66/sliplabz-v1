# SlipLabz V1 — Final Pre-Agent Audit

**Audit status:** Passed after corrections  
**Audited input:** `SlipLabz V1 Full Report Package v1 2.zip`  
**Corrected package revision:** 1.3  
**Audit date:** 2026-07-10

---

# 1. Final decision

The package is ready to be passed to the V1-0 repository-audit agent **in revision 1.3**.

Revision 1.2 should not be used as the active authority. Its new historical-seeding idea was strategically reasonable, but the implementation wording created several material contradictions and data-integrity risks.

After the revision 1.3 corrections:

- the core build remains authorized now;
- the price remains **$7.99 per month** for full access;
- the useful free tier remains intact;
- paid feature enforcement remains late in V1-9;
- current-season historical seeding is attempted before launch where coverage and rights permit;
- unresolved historical licensing or coverage cannot stop the core product build;
- historical data cannot contaminate current lines, first-observed history, or movement;
- historical metrics cannot create a line no sportsbook actually offered;
- the agent queue and complete specification use the same dependency model.

No unresolved P0 specification defect remains.

---

# 2. Material issues found in revision 1.2

## P0-1 — Historical data could collide with current snapshots

Revision 1.2 added `backfilled_historical` conceptually, but the snapshot key and current-selection contract still centered on `observed_at`. A historical snapshot retrieved today could therefore be stored with a present-day retrieval time and accidentally become eligible as current data.

### Correction

Revision 1.3 adds:

- request kind: `current_poll` or `historical_query`;
- provenance: `self_observed` or `backfilled_historical`;
- separate `provider_snapshot_at`, `retrieved_at`, and forward-only `observed_at` fields;
- current selection restricted to `current_poll` plus `self_observed`;
- synthetic snapshot identity with per-ingestion-run uniqueness instead of a nullable timestamp composite key.

## P0-2 — The historical “closing line” was not uniquely defined

The product shows one historical result per game/player/market, but revision 1.2 seeded multiple sportsbook lines without defining how they become one product-wide closing line.

Using the ordinary arithmetic median could create a point that no sportsbook offered. Example: sportsbook points 13.5 and 14.5 produce a median of 14.0, violating the real-lines-only invariant.

### Correction

Revision 1.3 defines:

1. retain source-level closing quotes;
2. if exactly one eligible sportsbook exists, use that observed point with `single_book` coverage;
3. with multiple sportsbooks, select the unique modal observed point;
4. if no unique mode exists, mark `closing_consensus_unresolved` and exclude the game from aggregate real-line windows.

The product never invents an interpolated historical line.

## P0-3 — Historical rights could block the entire product build

Revision 1.2 made V1-4 depend on V1-3b, while V1-3b had to halt if historical licensing was unresolved. Because every later product phase depended on V1-4, unresolved historical rights could stop Board, Compare, Player Page, and entitlement work.

That contradicted the active-build policy.

### Correction

Historical seeding is now V1-4b:

- it starts after V1-4 defines close and provenance behavior;
- it may run in parallel with V1-5 through V1-8;
- it is a prelaunch data-readiness track;
- V1-10 requires a successful seed or reviewed forward-only disposition;
- unrelated core work does not halt on unresolved historical coverage or rights.

---

# 3. Other implementation defects corrected

## P1-1 — Historical event-ID discovery was missing

Historical event odds require historical event IDs. They must be obtained from the historical events endpoint rather than assumed from current event discovery.

Revision 1.3 makes this mandatory.

## P1-2 — Historical quota was materially understated

Historical event-odds requests cost **10 per region-equivalent per market per event**, not the current event-odds cost.

With eight conventional sportsbook keys and four launch markets, the default forecast is:

`10 × 1 region-equivalent × 4 markets = 40 credits per event`

Revision 1.3 adds this formula, separate budgeting, and response-header reconciliation.

## P1-3 — Close capture age was undefined

The phrase “at or before tip” allowed an arbitrarily old snapshot to qualify.

Revision 1.3 sets a maximum close-capture age of 10 minutes. Older captures receive `close_capture_stale` and do not create historical results.

## P1-4 — Lines removed before close could be resurrected

A backward search could treat an earlier, withdrawn offering as the closing line.

Revision 1.3 uses only offerings present in the final qualifying snapshot and explicitly forbids walking backward to resurrect removed offerings.

## P1-5 — The master sequence omitted the new ticket

Revision 1.2 added V1-3b to the queue but not to Section 22 of the complete specification.

Revision 1.3 includes V1-4b in both authorities and aligns all dependencies.

## P1-6 — Storage lacked seed provenance fields

Revision 1.3 adds historical request kind, provenance, effective snapshot time, retrieval time, source counts, selection method, raw source references, and computation version.

---

# 4. Minor corrections

- Replaced section-sign cross-references with the word “Section” for more reliable DOCX rendering.
- Updated active authority references to exact revision 1.3 filenames.
- Clarified the primary surface as a web application with free and paid access rather than only a paid web application.
- Added quiet UX disclosure for historical provenance, source count, and coverage state.
- Updated README and manifest supersession language.
- Preserved the original no-model, no-picks, real-lines-only, and no-performance-claims guardrails.

---

# 5. Verified external technical facts

The corrected historical contract is aligned with the official The Odds API documentation reviewed on 2026-07-10:

- historical event odds accept additional markets such as player props;
- historical event IDs come from the historical events endpoint;
- the returned snapshot is the closest snapshot equal to or before the requested timestamp;
- additional-market historical snapshots are available at approximately five-minute intervals;
- historical event odds cost 10 per region per market per event;
- WNBA historical data for additional markets is documented as available from May 2023, but per-book and per-market coverage still requires live preflight validation.

The specification correctly keeps commercial retention and display rights as a separate launch gate.

---

# 6. Cross-authority consistency result

| Area | Result |
|---|---|
| Build authorization | Pass |
| $7.99 monthly price | Pass |
| Useful free tier | Pass |
| Paid locks late in V1-9 | Pass |
| WNBA-only scope | Pass |
| Four launch markets | Pass |
| No predictive model | Pass |
| No recommendation language | Pass |
| BALLDONTLIE ownership | Pass |
| Odds API ownership | Pass |
| Current/historical isolation | Pass after correction |
| Real-line historical methodology | Pass after correction |
| Historical seed dependencies | Pass after correction |
| Quota accounting | Pass after correction |
| UX/product alignment | Pass |
| Agent halt/review behavior | Pass |
| Commercial provider-rights gate | Open by design |

---

# 7. Remaining gates that are not specification defects

These remain intentionally open and must not be represented as complete:

1. repeated current-odds snapshot validation;
2. newly-finalized BALLDONTLIE correction validation;
3. complete contemporaneous cross-provider event mapping;
4. historical WNBA player-prop coverage preflight by market and sportsbook;
5. provider commercial retention and display approval;
6. current-season historical seed run or reviewed forward-only disposition.

They are implementation, validation, or legal gates. They do not require another product-spec redesign.

---

# 8. Agent handoff recommendation

Pass revision 1.3 to the V1-0 agent.

The first agent must remain audit-only and must halt after producing the six required repository-readback artifacts.

Do not pass revision 1.2 alongside revision 1.3 as an active authority.

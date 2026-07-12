# V1-4b Seed Test Fixture Provenance Manifest

**Ticket:** V1-4b — Current-Season Historical Closing-Line Seed
**Applies to:** every fixture file in this directory.

Every fixture carries a top-level `"provenance"` object with the same shape
as V1-1/V1-2/V1-3/V1-4. V1-4b fixtures are almost entirely `synthetic`
because the Odds sub-spec §14.11 audits do not enumerate historical event
IDs or historical snapshot bodies for specific games. Where a fixture
mirrors an audited shape (e.g. §5 event-ID format, §10.7 outcome shape,
§11.2/§12.2 audit tables), the provenance notes cite the audit.

**Files:**

- `historical-events-response.json` — synthetic. The historical events
  endpoint returns a snapshot envelope `{ timestamp, previous_timestamp,
  next_timestamp, data: [event...] }` per Odds §14.11. Six events at a
  chosen snapshot time.
- `historical-event-odds-clean.json` — synthetic. Clean final pre-tip
  snapshot: `timestamp` exactly at the requested boundary; two sportsbooks
  (DraftKings + FanDuel) at points 12.5; one PrizePicks row that MUST be
  excluded from sportsbook consensus.
- `historical-event-odds-stale.json` — synthetic. `timestamp` is 15 minutes
  before the requested boundary — must classify as `close_capture_stale`.
- `historical-event-odds-within-tolerance.json` — synthetic. `timestamp` is
  9 minutes before boundary — must classify as `eligible`.
- `historical-event-odds-final-vs-earlier.json` — synthetic. A pair: an
  earlier snapshot that CONTAINS an offering, and the FINAL snapshot at the
  boundary that DOES NOT. The final snapshot's offering set is authoritative;
  the earlier one must NOT resurrect the removed offering.
- `historical-event-odds-single-book.json` — synthetic. Only one eligible
  sportsbook (DraftKings) present in the final snapshot.
- `historical-event-odds-unique-modal.json` — synthetic. Three eligible
  sportsbooks; two share point 12.5, one is at 13.5.
- `historical-event-odds-tied.json` — synthetic. Two sportsbooks at 12.5,
  two at 13.5.
- `historical-event-odds-unsupported-market.json` — synthetic. Provider
  responded with a market key SlipLabz does not launch (e.g.
  `player_steals`) — must be filtered out.
- `quota-headers-40-credit.json` — synthetic. Mirrors §14.11.2: default
  8-book × 4-market historical event-odds request should observe
  `x-requests-last: 40`.

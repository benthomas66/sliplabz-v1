# V1-3 Odds API Test Fixture Provenance Manifest

**Ticket:** V1-3 — Odds API Ingestion Foundation
**Applies to:** every fixture file in this directory.

Every fixture file carries a top-level `"provenance"` object with the same
shape as V1-1 and V1-2 (see `tests/fixtures/README.md` and
`tests/fixtures/bdl/README.md`). Odds API fixtures use these categories:

- **`audit_derived`** — every record's identifying fields are traceable to
  a Odds sub-spec audit table (§4, §5, §10, §11, §12, §13).
- **`synthetic`** — hand-crafted contract examples not derivable from the
  audits (edge cases: conflicting duplicates, schema drift, stale
  timestamp, HTTP 500). Every synthetic record carries `"_synthetic": true`.
- **`mixed`** — a mix; each record within carries its own flag.

**Rules for fixtures in this directory:**

1. No provider payload is represented as though it were captured from a
   live Odds API request unless it appears verbatim in the sub-spec audit.
2. Fixtures are inputs to unit tests only. No test in this ticket makes a
   live provider call under any circumstances. The injected HTTP client
   (`src/odds/httpClient.ts`) is exercised only through fixture-backed
   fetch shims.
3. Numeric row counts and coverage tallies match the audits when the
   fixture is `audit_derived`. Divergences (e.g. compact row content for
   audit-verbatim counts) are called out in the file's `provenance.notes`.

**Files in this directory:**

- `events-slate-2026-07-10.json` — audit_derived. The six-event slate from
  Odds §5 verbatim: IDs, matchups, and commence times.
- `event-odds-1547-full.json` — audit_derived. The `1547b39904db439304af0dfdacaa469d`
  (Golden State Valkyries @ Connecticut Sun) event-odds capture per §10.3:
  7 books, 9 players, 5 duplicate groups, 4 credits. Row-level contents
  are compact synthetic beyond the audit's summary metrics; the BetRivers
  duplicate group pattern is preserved.
- `event-odds-93c-partial.json` — audit_derived. Sparse event
  `93c27f5318a98fdd2a9bfbc42269f134` (Liberty @ Lynx) per §10.3: 5 books,
  8 players, 0 duplicate groups, 4 credits.
- `event-odds-1547-conflicting-duplicates.json` — synthetic. A crafted
  variant of the §10.5-rule-5 conflicting-duplicate case: two BetRivers
  rows at the same player/side/point but with different prices.
- `prizepicks-1547.json` — audit_derived. The full §11 audit: 26 rows, 8
  players, 4 markets, all `-137` prices, all null multipliers.
- `underdog-1547.json` — audit_derived. The full §12 audit: 11 rows, 5
  players, 3 markets, all `-137` prices, all multiplier `1.0`, Kayla
  Thornton `player_points` over-only at 8.5 preserved verbatim.
- `quota-10-book-response.json` — audit_derived. §13.2 test 1: HTTP 200,
  1 region-equivalent, 8 books returned, 4 markets, 4 credits observed.
- `quota-12-book-response.json` — audit_derived. §13.2 test 2: HTTP 200,
  2 region-equivalents, 9 books returned, 4 markets, 8 credits observed.
- `quota-invalid-market-422.json` — audit_derived. §13.7 test: HTTP 422,
  0 credits observed, error body preserved verbatim.
- `successful-empty-response.json` — synthetic. HTTP 200 with
  `{"bookmakers": []}` — the §10.14 successful-empty case.
- `failed-response-500.json` — synthetic. HTTP 500 with text body — the
  §20 failed-poll case.
- `schema-drift-200.json` — synthetic. HTTP 200 with a body that fails
  event-odds shape validation (`bookmakers` present but not an array).
- `stale-market-timestamp.json` — synthetic. `provider_last_update` more
  than 30 minutes before `observed_at`.

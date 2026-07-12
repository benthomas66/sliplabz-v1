# V1-4 Lines Test Fixture Provenance Manifest

**Ticket:** V1-4 — Closing Lines, Movement, and History
**Applies to:** every fixture file in this directory.

Every fixture file carries a top-level `"provenance"` object matching the
V1-1/V1-2/V1-3 shape:

```json
{
  "provenance": {
    "kind": "audit_derived" | "synthetic" | "mixed",
    "authority_sources": [ "…" ],
    "notes": "…"
  }
}
```

V1-4 fixtures are almost entirely `synthetic`: the sub-spec audits do not
enumerate closing lines, historical results, or L5/L10/L20 windows for
specific games. Every row is hand-crafted to exercise a spec §7.10.2 /
§7.12 / §13 / §14 case.

**Files in this directory:**

- `close-boundary-cases.json` — synthetic. Six games covering the three
  §7.10 branches: verified actual, scheduled with grace, postponed no
  close, canceled no close, delayed start (scheduled+grace), and a game
  with actual_start_utc set but status='postponed' (governor case — the
  postponed branch takes precedence).
- `closing-quotes-cases.json` — synthetic. Six games covering §7.10.2 /
  §18.4 selection outcomes: single_book (one eligible sportsbook),
  unique_modal (three books, majority at 12.5), tied_no_unique_mode (two
  books each at 12.5 and 13.5), tied_three_way, no_eligible_source (all
  quotes stale), and DFS-only (PrizePicks + Underdog, must return
  no_eligible_source).
- `historical-line-result-cases.json` — synthetic. Six per-game results
  covering over, under, push, and boundary margins.
- `real-line-window-cases.json` — synthetic. A single player with 22
  reverse-chronological eligible games covering L5 (complete), L10
  (complete), L20 (complete), season, and an incomplete-L10 variant.
- `movement-cases.json` — synthetic. Snapshot pairs exercising §17
  transition types: unchanged, price-only change, point change, source
  added, source removed (once), source removed (twice → confirmed), failed
  poll between valid, successful empty, provider timestamp change.
- `postponed-event-cases.json` — synthetic. Two games with postponement
  transitions demonstrating that the abandoned tip never produces a close.

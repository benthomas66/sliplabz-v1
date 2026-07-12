# V1-2 BDL Test Fixture Provenance Manifest

**Ticket:** V1-2 — BALLDONTLIE Ingestion Foundation
**Applies to:** every fixture file in this directory.

Every fixture file carries a top-level `"provenance"` object with the same
shape as V1-1 (`tests/fixtures/README.md`). BDL fixtures use these
categories:

- **`audit_derived`** — every record's identifying fields are traceable to
  an audit table in the shipped BDL sub-spec (§6.2, §12A, §12B, §12C, §15A).
- **`synthetic`** — hand-crafted contract examples not derivable from the
  audits (edge-case rows for the required test list — failed page, unknown
  status, correction pair, etc.). Every synthetic record carries
  `"_synthetic": true`.
- **`mixed`** — a mix; each record carries its own flag.

**Rules for fixtures in this directory:**

1. No provider payload may be represented as though it were captured from a
   live provider unless it appears verbatim in the BDL sub-spec audit tables
   (§6.2, §12A, §12B, §12C, §15A). Records the audits do not contain must
   carry `"_synthetic": true`.
2. Fixtures are inputs to unit tests only. No test in this ticket makes a
   live provider call under any circumstances. The injected HTTP client
   (`src/bdl/httpClient.ts`) is exercised only through fixture-backed fetch
   shims.
3. Numeric row counts are not required to match the audits; the ticket
   permits an "equivalent multipage fixture." When counts diverge from the
   audit, the divergence is called out in the file-specific note below.

**Files in this directory:**

- `teams-audit.json` — audit-derived. The 33 rows of the BDL §12B teams
  audit, with the §12B.4 classification applied. Empty city / null
  conference are preserved verbatim (§12B.7).
- `active-players-audit.json` — audit-derived. Snapshot IDs are synthetic,
  but all 15 team counts match the §12A.3 table. The individual player-row
  content is a compact stand-in: identifying fields are audit-derived where
  audit rows are available, otherwise synthetic to reach the audit's team
  counts.
- `season-2026-multipage.json` — mixed. An equivalent multipage fixture of
  the 41-page BDL §6.2 audit. The cursor chain has exactly 41 pages. Each
  page carries a small number of synthetic rows; the 6 `"--"` minute rows
  from §7.1 are preserved verbatim on the pages they were audited on.
  Total row count is compact for fixture practicality — 205 rows across
  41 pages (matches the active-player audit total for legibility) — and is
  called out in the provenance note.
- `game-24752-first-capture.json` and `game-24752-second-capture.json` —
  audit-derived, verbatim from §12C.2 (27-row identical captures 11 seconds
  apart). Used to prove repeated-pull idempotence.
- `final-stat-correction.json` — synthetic. A crafted post-final correction
  pair (t0 first pull, t0+2h second pull) demonstrating the invalidation
  hook path. Marked `_synthetic` at the record level.
- `unknown-game-status.json` — synthetic. A BDL game object whose `status`
  is a string not in the recognized map (`Delayed`), exercising the
  quarantine path per §10.
- `availability-snapshots.json` — mixed. Two complete snapshots and one
  failed pull, exercising presence, disappearance, and failed-pull
  invariants. Individual record content is synthetic; the shape follows
  §13.
- `active-player-runs.json` — synthetic. Two complete active-player runs
  and one failed pull, exercising the `not_seen_active` transition after
  a complete snapshot AND the "failed pull cannot mark anyone
  not_seen_active" invariant.
- `failed-page.json` — synthetic. A cursor traversal fixture where page 10
  fails with a 500. Rows on prior pages must be retained for diagnosis
  and the watermark must NOT advance.

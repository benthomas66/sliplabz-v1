# V1-OP-8 — One-Game Paid Validation: Result

**Status:** **PASS.** One historical event-odds fetch issued against the ratified target; closing lines retrieved, canonicalized, and promoted to `historical_line_results` for that one game. **40 credits spent, exactly as forecast.** Halted for audit; the broader Path C repair remains unauthorized.

**Executed:** 2026-08-03, against HEAD `ae2e159` + the uncommitted date-fix and guard-lift committed alongside this report.
**Target (founder-ratified, no substitution):** `df22e4f4-d4ef-4cba-88e7-1e83db28ad2d` (SEA @ IND, 2026-07-17) · Odds API event `034012f210532a879b3d1ab5de8306e6`.

---

## 1. The first attempt: HTTP 422, unbilled — and the defect it exposed

The first fire returned **HTTP 422 with 0 credits billed** (balance `99,811` before and after; the Odds API does not bill 4xx). The no-blind-retry guard fired correctly: *"No retry attempted; no rows written."*

**Root cause — a defect in our wire serialization, not the provider.** `evaluateCloseBoundary` emits `.toISOString()`, i.e. millisecond precision (`2026-07-17T23:45:00.000Z`). The historical endpoints require second precision. The original seed's successful requests — recoverable from `oddsapi_ingestion_runs.request_params` — used `"2026-07-12T23:00:00Z"`.

**Fix (committed with this report):** `toHistoricalDateParam()` in `src/seed/httpClient.ts`, the **sole HTTP owner** of both historical endpoints (grep-proven: every other reference is a redacted persistence string or a fixture). Applied at **all four** `date:` sites — event-odds *and* discovery, builders *and* fetchers — so sub-second precision is **impossible by construction** for any future caller (bulk repair, recurring forward), not merely absent from today's callers. It strips only the fractional-seconds group, so it is exactly idempotent on already-second-precision input and every existing caller serializes byte-identical. **Only the wire serialization changes** — the stored/derived `close_boundary_utc` is untouched, so boundary semantics and the widened two-field invariant are unaffected.

---

## 2. The corrected fetch — PASS

| | |
|---|---|
| Wire `date` | `2026-07-17T23:45:00Z` (second precision, verified pre-call) |
| Derived boundary | `2026-07-17T23:45:00.000Z`, `boundary_source=scheduled_with_grace`, grace 900s — derived in code, never hand-typed |
| Close-capture window | `[23:35:00Z .. 23:45:00Z]` (600s threshold) |
| **Returned snapshot** | **`2026-07-17T23:40:37Z` — 263s before boundary** |
| **Close capture** | **`eligible`** |
| Offerings | **174 accepted, 0 rejected** |
| Triples | 24 — 4 markets × 6 books |

### Billing — the 40cr/event model is now PROVEN, not inferred
Forecast **40** (GAP-29-corrected: 4 markets × ceil(8/10) × 10 historical multiplier × 1 event, no discovery). Balance **99,803 → 99,763 = exactly 40**. Forecast == observed → **exact match**. This is the call that converts the Path C budget model from inference into measurement.

*Reporting caveat (honest):* the `oddsapi_ingestion_runs` rows written by `persistHistoricalSnapshot` carry **null** `quota_forecast` / `quota_observed` / `quota_delta_flag` / `x_requests_last` — that persistence path does not populate the quota columns, so `reconcileQuota`'s verdict was **not recorded in the run rows**. Billing exactness above is proven by the provider balance delta instead. Wiring the quota columns through this path is a small follow-up worth doing before the bulk repair, so per-request reconciliation is auditable from the DB rather than from a session transcript.

## 3. Persistence — ownership-attributed, scope held

**Target-owned (attributed by target game / event, never by global count deltas):**

| Table | before → after |
|---|---|
| `source_closing_quotes` | 0 → **164** |
| `canonical_closing_points` | 0 → **33** |
| `historical_line_results` | 0 → **28** |

- **hlr:** all 28 rows `coverage_state='complete'`, provenance `backfilled_historical` — the correct writer for post-hoc historical retrieval.
- **canonical:** 28 `unique_modal`/`complete`, 1 `single_book`/`single_book`, 4 `tied_no_unique_mode`/`unresolved_closing_consensus`. The tied grains are correctly **excluded** from hlr — no relabel-to-dodge-constraint.

**Scope proof — the whole point of the game-scoped parameter:**

| | before → after | |
|---|---|---|
| other games' `source_closing_quotes` | 22964 → 22964 | IDENTICAL |
| other games' `canonical_closing_points` | 4955 → 4955 | IDENTICAL |
| other games' `historical_line_results` | 4658 → 4658 | IDENTICAL |
| **globally-eligible-but-missing hlr grains outside the target** | **30 → 30** | **IDENTICAL — the scope param HELD** |

That last row is the decisive one: 30 unrelated grains were eligible for hlr and would have been swept in by the unscoped global populator. None were.

## 4. Invariants

- `scheduled_start_utc` **byte-identical** (`2026-07-17T23:30:00.000Z`); `actual_start_utc` **byte-identical** (`null`).
- Target `updated_at` **unchanged** — the `games` row was never written.
- `games` 332 → 332 · `provider_games` 534 → 534 · `player_game_stats` 5291 → 5291 — no row created in any forbidden table.
- DR-24 / method version / gate logic unchanged; no evidence-profile write by this path.

## 5. Gate — moved by exactly one game, as predicted

**`51/55 → 50/55` unresolved.** The target now has usable hlr and left the unresolved set. The Board **remains suppressed**, which is correct and expected: one game of ~47+ cannot lift the gate. A still-dark Board here is the honest outcome, not a failure.

## 6. Idempotency — proven without a second paid call

Re-running the game-scoped hlr populator (free, no fetch): `grains_observed=28, rows_inserted=0, rows_updated=28`. Target hlr still **28**, other games still **4658**, balance still **99,763** — **no re-fetch, no re-spend.**

## 7. Validation matrix

| Command | Exit | Result |
|---|---|---|
| `tsc --noEmit` | 0 | clean |
| `npm test` | 0 | **815 · 672 pass · 0 fail · 143 skipped** |

---

## What this establishes for the broader repair

1. **Path C works end-to-end** on a real restored game: retrieve → source quotes → canonical → hlr at `complete` coverage.
2. **The archive holds in-window snapshots** for this era — 263s before boundary, comfortably inside the 600s rule. Encouraging but **n=1**; it is not proof that every backlog game has one.
3. **40 cr/event is measured**, so the committed budget model can be trusted for scaling.
4. **Bounded scoping is real** — 30 unrelated eligible grains stayed untouched.

**Still gating the bulk repair:** GAP-37 (per-triple atomicity — a game-level transactionality ruling), and the per-request quota-column gap noted in §2. **Not authorized and not started.**

# V1-OP-4c — Report: re-anchor the ingestion gate to the engine's coverage table (GAP-26)

**Pinned HEAD:** `ebfa6bc` (verified `git rev-parse HEAD` = `ebfa6bc445a9ca6c1c509d1f77a232ccf239a645`).
**Posture:** serving/ops-layer only. Compose-only. ZERO provider spend. **HALTED WITHOUT COMMITTING** — working tree left with changes uncommitted for governor review.

---

## STEP 0 — analysis (produced before implementation)

### 1. Compose-only feasibility — PRIMARY HALT GATE: **PASS (compose-only feasible)**

Measuring `historical_line_results` coverage requires only the gate's OWN read-only probe query
(`buildIngestionLagQuery`) plus a drift-tripwire test. The gate mirrors the engine's usable-coverage
set via a new ops constant `USABLE_HLR_COVERAGE_STATES` and binds it to the engine through a test that
READS the engine source — **no import from, and no edit to, any `src/evidence/**` or `src/computation/**`
reader.** The halt gate was not tripped; implementation proceeded.

### 2. Engine predicate sites the tripwire pins (both currently inline `coverage_state IN ('complete', 'single_book')`)

- `src/evidence/driver/readModelInputBuilder.ts:526` — `readHistoricalGamesForPlayerMarket`
- `src/computation/historicalSeriesRead.ts:70` — `readHistoricalSeries`

(For context, the same predicate also appears in `historicalLineResultsRead.ts`, `historicalCoverage.ts`,
and the recomputation writer's CHECK; the tripwire pins the two the ticket names — the readers that feed
the threshold windows.)

### 3. Read-only hosted probe — two-metric query over `[2026-07-12T00:00Z, now)`

Executed against `SLIPLABZ_HOSTED_DATABASE_URL` under `SET default_transaction_read_only = on` +
`BEGIN TRANSACTION READ ONLY`. No writes, no DDL, no provider/API calls. Probe script lived at repo root
(`./._probe.mjs`) and was **deleted** after the run. `serve_now = 2026-07-31T22:32:52Z`.

| Metric | Window `[2026-07-12, now)` | Oldest tip |
|---|---|---|
| **A — usable `historical_line_results` absent** (DRIVES suppression) | **42** | 2026-07-12T19:00Z |
| **B — `player_game_stats` absent** (reported only) | **41** | 2026-07-12T23:00Z |
| **DISCRIMINATING — pgs PRESENT but usable-HLR ABSENT** (the "before" baseline) | **1** | 2026-07-12T19:00Z |

Matches the ticket's expected values (A ≈ 42, B = 41, discriminating ~1–2).

**The discriminating "before" baseline = 1.** This is the exact population Metric A catches and the old
pgs-anchored gate (Metric B) misses: a game with a restored box score but no usable closing line. Today
it is 1. After V1-OP-5a restores ~41 box scores with closing lines still absent, this set becomes ~41 —
every one a game the old gate would have served with no evidence behind it. Capturing it now, pre-5a, is
the before/after that shows the re-anchoring works.

Unbounded (all past-tip — the gate's actual predicate, no lower bound) for completeness:
Metric A = **44** (oldest 2026-06-03T23:30Z), Metric B = **41**, discriminating = **3**,
`newest_usable_coverage_game` = 2026-07-12T19:00Z. The gate itself has no lower bound, so in production
today it suppresses (oldest coverage-unresolved tip is months > 96h old) — which is correct: the engine
is blind to those games.

### 4. `serve_now` discipline

One caller-supplied instant; the decision is pure; no clock read (mirrors `servingGate.ts` and the
existing V1-OP-4 gate). Unchanged.

---

## Implementation

### SCOPE A — `src/ops/constants.ts`
- `INGESTION_LAG_GRACE_SECONDS` (48h) and `INGESTION_LAG_SUPPRESS_SECONDS` (96h) **unchanged**.
- Added `USABLE_HLR_COVERAGE_STATES = ['complete', 'single_book'] as const`, documented as the engine's
  usable-coverage set mirrored by the gate, drift-guarded by test, ops-not-method.

### SCOPE B — gate + repository + service
- **`src/ops/ingestionGate.ts`** — `IngestionLagMetric` now carries TWO metrics against one `serve_now`,
  never collapsed:
  - Metric A: `coverage_unresolved_past_grace_48h`, `coverage_unresolved_past_fire_96h`,
    `oldest_coverage_unresolved_tip`, `newest_usable_coverage_game`.
  - Metric B: `pgs_absent_past_grace_48h`, `pgs_absent_past_fire_96h`, `oldest_pgs_absent_tip`.
  - `decideIngestionCurrency` keys `ingestion_behind` on **Metric A only**
    (`oldest_coverage_unresolved_tip` older than `serve_now − 96h`). Two-threshold anomaly tolerance,
    fixture exemption, and fail-safe-on-unparseable all carry over unchanged, applied to Metric A.
    (GAP-25's distinct unparseable log reason is NOT folded in — reserved for V1-OP-4b.)
  - `buildIngestionServeLogLine` emits BOTH blocks on BOTH paths, `coverage_*` and `pgs_*` separated
    by ` || `; distinct prefixes `BOARD_SUPPRESSED coverage_behind:` / `BOARD_SERVE_OK coverage_ok:`.
- **`apps/web/src/lib/server/boardRepository.ts`** — `buildIngestionLagQuery` computes both metrics.
  Metric A: `NOT EXISTS` a `historical_line_results` row at `coverage_state IN ('complete', 'single_book')`
  for a past-tip game (`scheduled_start_utc < $1`). Metric B: `NOT EXISTS` a `player_game_stats` row.
  The `coverage_state IN (...)` fragment is rendered from `USABLE_HLR_COVERAGE_STATES` (compile-time
  constants — no injection risk), so the gate has one source of truth. Neither metric references game
  `status`. Grace/suppress bound as `$2`/`$3` from the ops constants.
- **`apps/web/src/lib/server/boardService.ts`** — comment updated to describe the two-metric re-anchor;
  the wiring (probe → decide → log/suppress) is signature-unchanged.
- `fixtureRepository.ts` needed no change (it returns the exempt `FIXTURE_INGESTION_METRIC`, whose new
  shape lives in `ingestionGate.ts`); left untouched.

### SCOPE C — none. No migration.

---

## Exact-predicate binding (drift tripwire — Test 4)

`tests/ops/ingestionGate.test.ts` reads both engine reader sources, extracts every
`coverage_state IN ( ... )` literal, and asserts each equals `USABLE_HLR_COVERAGE_STATES`. If the engine
ever changes its predicate without the gate following, the tripwire fails loud with a message pointing at
`src/ops/constants.ts`. Both sites currently pass (`['complete', 'single_book']`).

---

## Both-metrics log samples (captured from `apps/web/test/boardIngestionGate.test.ts`)

**Suppress path** (both metrics behind — production-shaped):
```
BOARD_SUPPRESSED coverage_behind: coverage_unresolved_past_grace_48h=44 · coverage_unresolved_past_fire_96h=42 · oldest_coverage_unresolved_tip=2026-07-12 · newest_usable_coverage=none || pgs_absent_past_grace_48h=41 · pgs_absent_past_fire_96h=41 · oldest_pgs_absent_tip=2026-07-12
```

**THE FIX (Test 2) — box score present, closing line absent, still suppressed** (Metric B resolved,
Metric A drives suppression — a pgs-anchored gate would have served this):
```
BOARD_SUPPRESSED coverage_behind: coverage_unresolved_past_grace_48h=1 · coverage_unresolved_past_fire_96h=1 · oldest_coverage_unresolved_tip=2026-07-26 · newest_usable_coverage=none || pgs_absent_past_grace_48h=0 · pgs_absent_past_fire_96h=0 · oldest_pgs_absent_tip=none
```

**Pass path** (Metric A resolved, Metric B stopped — the two metrics visibly diverge, both reported):
```
BOARD_SERVE_OK coverage_ok: coverage_unresolved_past_grace_48h=0 · coverage_unresolved_past_fire_96h=0 · oldest_coverage_unresolved_tip=none · newest_usable_coverage=none || pgs_absent_past_grace_48h=41 · pgs_absent_past_fire_96h=41 · oldest_pgs_absent_tip=2026-07-01
```

Fixture/preview source emits neither (verified).

---

## Compose-only proof (`git diff --name-only HEAD`)

Changed (tracked) — exactly the allowed set:
```
src/ops/constants.ts
src/ops/ingestionGate.ts
apps/web/src/lib/server/boardRepository.ts
apps/web/src/lib/server/boardService.ts
tests/ops/ingestionGate.test.ts
apps/web/test/boardIngestionGate.test.ts
```
**EMPTY diff** confirmed for `src/evidence/**`, `src/computation/**`, `src/evidence/v2/servingGate.ts`,
`src/evidence/v2/thresholds.ts`, `apps/web/src/lib/server/boardProjection.ts`, persistence, and
migrations. Test 12 (in the web file) re-asserts this from inside the suite via `git diff --name-only HEAD`.
The ticket file `docs/product/tickets/V1_TICKET_OP_4C.md` remains untracked (not committed).

---

## Full suite results (all green; no suite weakened)

| Suite | Result |
|---|---|
| Root `node --import tsx --test tests/ops/ingestionGate.test.ts` | **18 pass / 0 fail** |
| Root `npm test` (full) | **596 pass / 143 skip / 0 fail** (739 total) |
| Root `tsc --noEmit` | **exit 0** |
| Web `test/boardIngestionGate.test.ts` | **12 pass / 0 fail** |
| Web `npm test` (full, `--conditions=react-server`) | **106 pass / 1 skip / 0 fail** (107 total) |
| Web `tsc --noEmit` | **exit 0** |
| Web `npm run audit` (`next build` + serialization/negative-boundary) | **20 pass / 0 fail** — fixture Board stays POPULATED, empty state still renders |

Required test groups implemented across both files: Test 1 (keys on Metric A, not pgs), Test 2 (box score
present, closing line absent → still suppressed — the fix's signature), Test 3 (resolved requires usable
hlr), Test 4 (exact-predicate drift tripwire), Test 5 (both metrics reported separately, diverging case),
Test 6 (anomaly-in-band 72h on Metric A), Test 7 (96h boundary, strict `>`), Test 8 (fixture exemption),
Test 9 (both log paths, both blocks, distinct prefixes), Test 10 (byte-identical empty state), Test 11
(probe query shape), Test 12 (compose-only git diff).

---

## Done-when checklist

- [x] STEP 0 report: compose-only feasible + two-metric today's values + discriminating baseline (=1).
- [x] All suites green (root + web + serialization audit); no suite weakened.
- [x] Drift tripwire binds gate ↔ engine.
- [x] Report written.
- [x] **Halts without committing** — no `git add` / `git commit` / `git push`. Working tree left
      uncommitted for governor review. Ticket file untracked. No provider spend.

---

## GOVERNOR ADDENDUM — 2026-07-31 (lower-bound amendment, post-review)

The agent's implementation above re-anchored the gate to `historical_line_results`
coverage correctly and all-green. Governor review then found a material design
gap the ticket had not reckoned with, and this amendment closes it before commit.

**Finding.** The gate's oldest-unresolved-tip was **global across all history with
no lower bound.** A read-only hosted probe showed the unbounded coverage-unresolved
set at 44 games, oldest `2026-06-03` — because two pre-window games (`2026-06-03`
@ rank 145, `2026-06-30` @ rank 70) are `final`, have box scores, but have no
closing line. Neither V1-OP-5a (window 07-12→now) nor 5b (the 19 mapped in-window
games) touches June, so as-is the gate would suppress the Board **forever** even
after a perfect restore. This is introduced by the (correct) move to the sparser
hlr anchor: the OP-4 pgs gate would have lifted (those June games have pgs).

**Amendment (owner-approved).** Bound BOTH metrics to the
`INGESTION_COVERAGE_RECENT_GAMES_N = 55` most recent past-tip games league-wide —
a **game-count** bound, never calendar (a calendar window would scroll a live
stall out of view at day window+1; a game-count bound cannot). Sizing, verified
against hosted data: the 07-12 stall spans ranks 1–43; the nearest permanent hole
is rank 70; feasible band **[43, 69]**; **N = 55** centres it so **±20% = [44, 66]**
both stay valid. Full L20 reach (~130 league games) is infeasible — it re-includes
the June holes — so L20-tail/season coverage past N is registered as **GAP-27**.

**Sensitivity (re-run of STEP 0's probe against the amended Metric A):**

| N | window edge | Metric A unresolved | oldest tip | June 30 / June 3 excluded |
|---|---|---|---|---|
| 44 (−20%) | 2026-07-11 | 42 | 2026-07-12 | ✅ / ✅ |
| 55 | 2026-07-08 | 42 | 2026-07-12 | ✅ / ✅ |
| 66 (+20%) | 2026-07-03 | 42 | 2026-07-12 | ✅ / ✅ |

**Changed for the amendment:** `src/ops/constants.ts` (`INGESTION_COVERAGE_RECENT_GAMES_N`),
`apps/web/src/lib/server/boardRepository.ts` (`recent_games` CTE, `LIMIT $4`),
`src/ops/ingestionGate.ts` (metric-contract note), + the two test files (SQL-shape
`recent_games`/`LIMIT $4` assertions, N-constant + ±20% band test). Compose-only
still holds (forbidden paths empty-diff). Drift tripwire unchanged and passing.

**Verification (governor-run, amended):** root ops 19/19 · root full 597/143/0 ·
web gate 12/12 · web full 106/1/0 · serialization audit 20/20 (compiles, fixture
Board populated, empty state renders) · both typechecks clean.

**Registered alongside this commit:** GAP-26 → CLOSED; **GAP-27** (season/L20 reach
past N — coverage under-count, non-blocking); **GAP-28** (the gate cannot relight
from backfill alone — 23 of 42 in-window games are unmapped and can only roll off
via forward ingestion; blocks the Board serving; relight path to be specified
before V1-OP-5a).

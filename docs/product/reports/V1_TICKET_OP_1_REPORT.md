# V1-OP-1 — Scheduled Polling Loop — Report

**Date:** 2026-07-26
**Status:** COMPLETE — nothing committed; workflow built but NOT enabled.

Turns the manually-proven V1-A2-3 chain (poll → aggregate → v2-populate, 99 live
profiles) into a scheduled operational cycle. This ticket **composes** the
committed, live-proven primitives; it reimplements none of them.

---

## 1. Design — a pure composer over injected primitives

`src/ops/scheduledCycle.ts` exports `runScheduledCycle(deps: ScheduledCycleDeps)`.
It owns **no** business logic of its own beyond sequencing, gating, and
recording. Every primitive is an injected seam:

| Seam (dep) | Production binding (`productionCycleDeps.ts`) | Kind |
| --- | --- | --- |
| `discover` | `oddsapiRequest` `/events` + `validateEventDiscoveryResponse` (reads `x-requests-remaining`) | HTTP |
| `prepareEvents` | `loadSeedResolutionContext` / `resolveOddsapiEventForSeed` / `persistSeedEventResolution`, filter to window, cap, build player_map | HTTP+DB |
| `runPollSweep` | `runOddsapiPollSweep` (V1-4g bounded-concurrency sweep, reconciled ledger) | HTTP |
| `aggregate` | `aggregateCurrentMarketRowsForGame` | DB |
| `listGrainsForGames` | `listAllGrains` filtered to polled games | DB |
| `populate` | `runEvidencePopulatorV2` + `makeV2ReadModelInputBuilder` | DB |

Tests inject mocks for the HTTP seams and the **real** committed functions for
the DB seams (aggregate / listGrains / populate), so the composition is proven
end-to-end against a real Postgres without spending a credit.

**No primitive was modified.** The evidence method, thresholds, engine, writers,
composer, sweep, aggregator, and populator are untouched. Composition never
required a primitive change, so the HALT condition was never hit.

---

## 2. The six stages

1. **SLATE GATE** — DB-only, **zero API**. `SELECT` scheduled games whose tipoff
   is within `CYCLE_WINDOW_BEFORE_TIPOFF_SECONDS` (3h) of `started_at`. Empty →
   `skipped_no_slate`, no HTTP ever issued. This is what makes idle wakes free.
2. **BUDGET FLOOR** — discovery is free; reads `x-requests-remaining`. Below
   `RESERVE_FLOOR_CREDITS` (1000) → `skipped_budget_floor`, no poll. Also refuses
   if projected spend (`4 × events`) would exceed `CYCLE_CREDIT_CEILING` (25).
3. **POLL** — the committed sweep. Its reconciled ledger is re-checked
   (`ledger.reconciled`); a non-reconciling ledger throws → `failed`.
4. **AGGREGATE** — `aggregateCurrentMarketRowsForGame` per polled linked game.
5. **POPULATE** — **ONE** `evaluation_reference_time` for the whole batch (R4).
   Beyond-horizon grains (>3600s, D-A1) persist no row — reported as
   `beyond_horizon_skipped`. **No second suppression threshold** is introduced.
6. **RECORD** — a `try/finally` that **always** writes exactly one `poll_cycles`
   row for a cycle that ran (including `failed` + `error_summary`), then unlocks
   and closes. The ledger never has silent holes.

---

## 3. Overlap protection

A session-scoped Postgres advisory lock (`pg_try_advisory_lock(4271990311)`)
held on a **dedicated `pg.Client`** for the whole cycle. A wake that cannot
acquire it returns `outcome: 'blocked'` **without polling and without writing a
row** — it never ran, so it leaves no ledger trace. (`'blocked'` is therefore a
runtime-only value and is deliberately **not** in the `poll_cycles` CHECK
constraint.) Because the lock is session-scoped, the operator uses the **session
pooler (5432)**. This is the belt; the workflow `concurrency` group is the
suspenders.

---

## 4. Operational constants (`src/ops/constants.ts`)

OPERATOR-TUNABLE ops parameters — **not** method authority. They change *when/
whether a cycle spends*, never what a profile means.

| Constant | Value | Meaning |
| --- | --- | --- |
| `CYCLE_WINDOW_BEFORE_TIPOFF_SECONDS` | 10800 (3h) | Pregame-only window; matches the V1-4h cost model. |
| `CYCLE_EVENT_CAP` | 5 | Max events/cycle → 5×4 = 20 ≤ ceiling. |
| `CYCLE_CREDIT_CEILING` | 25 | Hard per-cycle projection stop. |
| `RESERVE_FLOOR_CREDITS` | 1000 | Refuse to poll below this remaining balance. |

The serve-suppress horizon (3600s, D-A1) is **not** here and is not
operator-tunable — it stays method authority.

---

## 5. Migration 53 → 54 (Scope A + F)

`supabase/migrations/20260726120000_poll_cycles.sql` — one **additive** table,
no existing table altered. 14 columns; CHECK
`outcome IN ('completed','skipped_no_slate','skipped_budget_floor','failed')`;
index `poll_cycles_started_at_idx (started_at DESC)`; table/column COMMENTs.

- Proven on local Docker first (drop-and-recreate; 14 columns, CHECK rejects
  'bogus', insert works).
- **Hosted push (Scope F):** `npx supabase db push` via the session pooler
  (5432). Dry-run showed exactly `20260726120000_poll_cycles.sql`. Post-push
  verified read-only:
  - `supabase_migrations.schema_migrations`: **53 → 54**
  - `to_regclass('public.poll_cycles')` = `poll_cycles`
  - 14 columns, `poll_cycles_outcome_check` present, `poll_cycles_pkey` +
    `poll_cycles_started_at_idx` present, 0 rows.

---

## 6. The workflow (Scope D — BUILT, NOT ENABLED)

`.github/workflows/poll-cycle.yml`:

```yaml
name: poll-cycle
on:
  schedule:
    - cron: '*/15 * * * *'
  workflow_dispatch: {}
concurrency:
  group: poll-cycle
  cancel-in-progress: false
permissions:
  contents: read
jobs:
  cycle:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm ci
      - name: Run one scheduled cycle
        env:
          SLIPLABZ_HOSTED_DATABASE_URL: ${{ secrets.SLIPLABZ_HOSTED_DATABASE_URL }}
          ODDS_API_KEY: ${{ secrets.ODDS_API_KEY }}
          ODDSAPI_LIVE_INVOKE: '1'   # plain live-invoke flag, NOT a secret
        run: node --import tsx scripts/run_scheduled_cycle.ts
```

Idle wakes cost **zero** API credits (slate gate). Secrets are referenced by
name only — no value appears in the file, logs, or this report.

> **Note (found during Scope G):** the committed live-invoke gate
> (`buildLiveOddsapiConfig`) refuses to build a live config unless
> `ODDSAPI_LIVE_INVOKE=1`. That flag is set in the workflow `env` as a plain
> string (it is not a secret). The slate gate still runs first, so this flag
> does not cause any API spend on idle wakes.

---

## 7. Tests (Scope E)

`tests/integration/v1_op_1_scheduled_cycle.integration.test.ts` — 6 tests, all
against a real local Docker Postgres with mocked HTTP:

- ✔ SLATE GATE — no game in window → `skipped_no_slate` with ZERO API calls; row written
- ✔ BUDGET FLOOR — remaining below RESERVE_FLOOR → `skipped_budget_floor`; no poll
- ✔ FULL CYCLE — persists profiles with ONE `evaluation_reference_time`; correct `poll_cycles` row
- ✔ MID-CYCLE FAILURE — a stage throws → outcome `failed` with `error_summary`; row written
- ✔ OVERLAP — a second cycle cannot run while the advisory lock is held
- ✔ IDEMPOTENCY — re-running over the same market state UPDATES, not duplicates

**Full test bar (all green, existing suites unmodified):**

- Root typecheck (`tsc --noEmit`): exit 0
- Unit suite: **tests 573 / pass 573 / fail 0**
- Full serial integration (`--test-concurrency=1 tests/integration/*.test.ts`):
  **tests 130 / suites 30 / pass 130 / fail 0** (the 6 new OP-1 tests included).

---

## 8. One live cycle (Scope G — ceiling 25 credits)

Ran `scripts/run_scheduled_cycle.ts` **once** against hosted (session pooler,
live). At 2026-07-26 there is no WNBA game inside the 3h window (next tipoffs are
07-28/07-29), so the slate gate honestly short-circuited:

```json
{
  "outcome": "skipped_no_slate",
  "poll_cycle_id": "bf363221-b0e3-4bfc-aab5-5780769a63f9",
  "events_polled": 0, "credits_spent": 0, "credits_remaining_after": null,
  "grains_aggregated": 0, "profiles_persisted": 0, "profiles_updated": 0,
  "beyond_horizon_skipped": 0, "evaluation_reference_time": null,
  "error_summary": null
}
```

- **Credits spent: 0** (well under the 25 ceiling; zero HTTP issued — the slate
  gate is stage 1).
- `poll_cycles`: exactly **1** row (`skipped_no_slate`, all-zero, no ert, no
  error, ~1.6s duration). Ledger writes as designed even for a skip.
- **v1 untouched:** `evidence_profiles` by method_version =
  `evidence_method_v1 = 145`, `evidence_method_v2 = 99` — identical to the
  pre-run baseline. No evidence row was inserted, updated, or deleted.

This is a passing Scope G result: the operational cycle ran end-to-end against
hosted, recorded its ledger row, and cost nothing because there was no slate.

---

## 9. Founder activation checklist (NOT done by the agent)

The agent did **not** enable, trigger, push, commit, or set any secret. To
activate the loop:

1. Review these 7 new files and commit them (governor action).
2. Push the repo to GitHub with `poll-cycle.yml` on the default branch.
3. Set two repository secrets (Settings → Secrets and variables → Actions):
   - `SLIPLABZ_HOSTED_DATABASE_URL` — the **session-pooler** URI (port 5432).
   - `ODDS_API_KEY`.
4. The schedule then fires every 15 min; idle wakes cost zero credits. A manual
   `workflow_dispatch` run is available to smoke-test first.

---

## 10. Files (all new — nothing modified, nothing committed)

```
?? .github/workflows/poll-cycle.yml
?? scripts/run_scheduled_cycle.ts
?? src/ops/constants.ts
?? src/ops/productionCycleDeps.ts
?? src/ops/scheduledCycle.ts
?? supabase/migrations/20260726120000_poll_cycles.sql
?? tests/integration/v1_op_1_scheduled_cycle.integration.test.ts
```

Hosted DB advanced 53 → 54 (additive `poll_cycles` table + one operational
ledger row from the Scope G cycle). No existing table altered; v1's 145 evidence
rows untouched.

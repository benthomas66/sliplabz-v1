# V1-A2-5 — FRESHNESS-NEUTRAL COMPOSER PATH — REPORT

**Outcome: COMPLETE.** The confirmed architecture blocker (GAP-12) is repaired. The v2
pipeline now assembles its `CurrentMarketRow` through a freshness-neutral core + a v2
wrapper that applies NO wall-clock gate, so a grain older than v1's ~300s window stays
STRUCTURALLY MARKET-PRESENT and reaches v2's `aging` / `stale-present` branches. The v2
composition-through-classification path contains **zero** wall-clock reads. v1 is
byte-identical. No hosted DB, no credits, no migration.

---

## Starting state (verified, matches expected)

```
git rev-parse HEAD : bf203a54934914394008f7fd307d14f3fdef94fb
git log --oneline -4:
  bf203a5 feat: v2 read-model input builder and production wiring (V1-A2-4)
  aaf6e8e feat: optimized freshness decay and book-movement probe (V1-4h)
  7eebe57 feat: evidence_method_v2 implementation with freshness-neutral engine core (V1-A2-2)
  015e23a feat: evidence_method_v2 freshness authority and timing schema (V1-A2-1)
git status --short : ?? docs/product/reports/V1_TICKET_A2_3_REPORT.md   (not mine — left untouched)
```
No mismatch. Work done entirely against LOCAL Docker Postgres (`sliplabz-v1-4b-postgres`, port 55432).

---

## ARCHITECTURE STATEMENT

Mirrors the V1-A2-2 `engineCore` extraction: extract the shared computation, let each
method wrap it with its own policy.

### What the assembly CORE owns — `src/computation/currentMarketRowCore.ts`
`assembleMarketRowCore(input) → MarketRowCore`. **Structural market computation only**,
over exactly the offering set it is given: `line_consensus`, `line_range`,
`point_distribution`, `eligible_book_count`, `book_detail`, `first_observed`,
`movement_summary`, `availability_context`, `source_snapshot_ids`, `line_observed_at`,
and the version stamps. It owns **no** eligibility rule and reads **no** clock. It is the
SINGLE OWNER of `line_observed_at` (freshest `observed_at` across the given offerings).

### What each WRAPPER owns
- **v1 wrapper** — `composeCurrentMarketRow` (`src/computation/currentMarketRow.ts`),
  **exact same signature and output**. It computes the wall-clock freshness verdict
  (`computeFreshness`) and applies the wall-clock gate (`isFreshEnoughForConsensus` → the
  eligible offering set) EXACTLY as before, then delegates structural computation to the
  core over that gated set, and attaches `freshness`. Byte-identical (proof 1). It returns
  the stricter `CurrentMarketRowV1` (freshness required) so existing v1 consumers —
  the aggregator, the read path — see `freshness` as required, unchanged.
- **v2 wrapper** — `composeCurrentMarketRowV2`
  (`src/evidence/v2/freshnessNeutralMarketRow.ts`). NO freshness gate, NO clock. All
  self_observed offerings pass straight through to the core; `line_observed_at` is
  surfaced from the core. The returned row **omits** `freshness`.

This is NOT the rejected `currentMarketRowV2.ts` (owner ruling R4): that fabricated a
`state: 'unavailable'` sentinel and used `as any`. This wrapper fabricates nothing.

### The honest type shape — and why it is honest
`CurrentMarketRow.freshness` is made **OPTIONAL** (`freshness?: FreshnessResult`), and the
core returns a `MarketRowCore` that has **no freshness field at all** (owner's acceptable
shapes #1 + #2 combined). The v1 wrapper ALWAYS populates `freshness`; the v2 wrapper
**omits** it. Omission is the honest representation of "freshness not evaluated here":
there is **no fabricated value, no sentinel, no placeholder timestamp, no `as any`** on the
v2 path. The `FreshnessState` enum has no truthful "not-evaluated" member, so any non-null
value would be a fabrication — omission is the only honest choice. `CurrentMarketRow`
gains **no** new field (`line_observed_at` lives on `MarketRowCore` only), so the v1 row
shape is unchanged.

Why optional and not a fully separate v2 type: the v2 row must flow through the **frozen**
`engineCore` (`computeCoreEvidenceProfile(input: EvidenceProfileInput, …)`), which is
forbidden to modify and whose `EvidenceProfileInput.current_market_row` is `CurrentMarketRow`.
`engineCore` reads only `availability_context` (never `freshness`), so an optional
`freshness` threads through it untouched. The **only** two runtime readers of
`freshness.state` are v1-method sites (`engine.ts:36`, `quality.ts` `evaluateQualityRules`);
each received a **behaviour-preserving guard** (throw-if-absent, unreachable on the v1 path
because the v1 wrapper always sets freshness). This does not change v1's observable
behaviour (the ticket's stated halt trigger), so per the honesty-trap instruction I
proceeded rather than halted. These two guards are the only edits to v1-method files, and
proof 1 shows v1 output is byte-identical.

### Call path — proof 9 (no duplicate consensus, no duplicate query)
```
makeV2ReadModelInputBuilder(ctx)
  → makeReadModelInputBuilderV2Core(ctx)
    → buildOneGrain(grain, tx, ctx, readCurrentMarketRowV2)
      → readCurrentMarketRowV2(tx, grain)
        → readGrainOfferings(tx, grain)          ← the ONE current-market query
        → composeCurrentMarketRowV2({offerings})
          → assembleMarketRowCore({offerings})    ← the ONE consensus computation
                                                    (computeLineConsensus, once)
      → computeEvidenceProfileV2(input)           ← reads eligible_book_count + injects C3 verdict
        → classifyV2Freshness(...) ; computeCoreEvidenceProfile(...)
```
`readGrainOfferings` is the single shared query (v1 and v2 both call it; neither re-queries).
`assembleMarketRowCore` computes consensus once; the v2 wrapper does not recompute it.

---

## PROOFS

Commands (local Docker; test-only credentials; URL never a secret):
```
export SLIPLABZ_DATABASE_URL='postgres://sliplabz:***@127.0.0.1:55432/sliplabz_v1_4b_it'
npx tsc --noEmit -p tsconfig.json                                   # exit 0
node --import tsx --test --test-concurrency=1 <unit globs>          # 573 pass / 0 fail
node --import tsx --test --test-concurrency=1 tests/integration/*.test.ts  # 124 pass / 0 fail
```

### Proof 1 — v1 BYTE-IDENTICAL ✔
Full unit suite **573 pass / 0 fail**, including `tests/computation/freshness.test.ts`,
`tests/computation/readPath.test.ts`, the Brief/app equality tests, every §F fixture
(F.1–F.6), and `tests/evidence/engine.governor.test.ts`. The v1 populator path is exercised
by `tests/integration/v1_a1_3_phase_c_read_model.integration.test.ts` (green inside the 124).
The v1 wrapper delegates to the core with identical formulas over the identical gated set
and attaches the identical freshness; the two v1-method guards are unreachable on the v1
path. No v1 output moved.

### Proof 2 — NO WALL-CLOCK in the v2 path ✔
The v2 composition-through-classification path comprises:
`src/computation/currentMarketRowCore.ts`, `src/evidence/v2/freshnessNeutralMarketRow.ts`,
`src/evidence/v2/engineV2.ts`, `src/evidence/v2/freshnessClassifier.ts`,
`src/evidence/v2/thresholds.ts`, `src/evidence/engineCore.ts`, `src/evidence/quality.ts`,
`src/evidence/v2/readModelInputBuilderV2.ts`, and the v2 reader
`readCurrentMarketRowV2` + `readGrainOfferings` in `src/evidence/driver/readModelInputBuilder.ts`.
A grep for `new Date(` / `Date.now(` / SQL `now()` over these (excluding comment text)
returns **zero** matches. The single `new Date()` in the builder file lives inside the v1
reader `readCurrentMarketRow` (line 427), which the v2 path never calls. (The batch
`evaluation_reference_time` is captured once by the populator per owner R4 — that is the
sanctioned timing anchor of the permitted equation, not a composition-path clock read.)

### Proof 3 — 301/901/1801s stay MARKET-PRESENT ✔
For each age, the same seeded grain built through the v2 builder has
`eligible_book_count ≥ 1` and a non-null `line_observed_at`, while the v1 wall-clock
builder returns `eligible_book_count == 0` for the identical offerings. The exact defect
GAP-12 named, fixed.

### Proof 4 — 901s → AGING (no cap) ✔
Persisted v2 row classifies `strong/moderate_over_evidence` with
`quality_cap_reason ≠ stale_current_market` and NO `STALE_CURRENT_MARKET` reason.

### Proof 5 — 1801s → STALE-PRESENT ✔
Persisted v2 row: `quality_capped = true`, `quality_cap_reason = stale_current_market`,
classification capped to `moderate_over_evidence`, `STALE_CURRENT_MARKET` reason emitted.

### Proof 6 — 3600s remains CLASSIFIABLE ✔
`profiles_inserted = 1`, `grains_skipped_beyond_horizon = 0`; a row is persisted (the
3600s boundary is inclusive).

### Proof 7 — 3601s persists NO row ✔
`grains_skipped_beyond_horizon = 1`, `profiles_inserted = 0`; zero `evidence_profiles`
rows for the grain.

### Proof 8 — shared reference time → identical classification ✔
Two grains with the same `line_observed_at`, processed in one batch under one
`evaluation_reference_time`, produce identical `classification` and `quality_cap_reason`;
`SELECT DISTINCT evaluation_reference_time` returns exactly one value. Because the v2 path
reads no wall clock, the wall-clock moment of processing is irrelevant — classification is
determined solely by `line_observed_at`.

### Proof 9 — no duplicate consensus / query ✔
See the call path above: one `readGrainOfferings` query, one `assembleMarketRowCore`
consensus computation.

### Suites ✔
- typecheck `tsc --noEmit` → **exit 0**.
- unit → **573 pass / 0 fail**.
- FULL SERIAL integration (`tests/integration/*.test.ts`) → **124 pass / 0 fail** (118 prior + 6 new V1-A2-5 proofs).

---

## FILES CHANGED (no commit)

```
 M src/computation/types.ts                         freshness → optional; + MarketRowCore, CurrentMarketRowV1
 M src/computation/currentMarketRow.ts              v1 wrapper delegates to the core (byte-identical)
?? src/computation/currentMarketRowCore.ts          the freshness-neutral assembly core (Scope A)
?? src/evidence/v2/freshnessNeutralMarketRow.ts     the v2 wrapper (Scope C)
 M src/evidence/driver/readModelInputBuilder.ts     shared readGrainOfferings; v1 + v2 readers; v2-core factory (Scope D/E)
 M src/evidence/v2/readModelInputBuilderV2.ts        v2 builder → v2-core (freshness-neutral) path (Scope D)
 M src/evidence/engine.ts                           behaviour-preserving optional-freshness guard (v1 output byte-identical)
 M src/evidence/quality.ts                          behaviour-preserving optional-freshness guard (v1 output byte-identical)
 M tests/evidence/engine.governor.test.ts           test helper: narrow now-optional freshness (fixture invariant)
?? tests/integration/v1_a2_5_freshness_neutral_composer.integration.test.ts   proofs 3–8
```
Untouched (per FORBIDDEN): `src/computation/freshness.ts` (the gate thresholds),
`src/evidence/engineCore.ts`, `src/evidence/v2/freshnessClassifier.ts`, the writers, both
authorities, all migrations. `V1_TICKET_A2_3_REPORT.md` remains untracked (not mine).

No hosted DB connection, no Odds/BDL call, no credit spend, no migration, no scheduler, no
commit.

*Report generated 2026-07-24. No commit performed per ticket instruction.*

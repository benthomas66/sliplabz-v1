# V1-A2-4 — V2 READ-MODEL INPUT BUILDER (line_observed_at) — REPORT

**Outcome: COMPLETE. GATE A of V1-A2-3 is closed.** The v2 populator now has a
production source for `line_observed_at`, and `runEvidencePopulatorV2` is callable in
production with no hardcoded literals in its input path. No hosted access, no Odds/BDL
calls, no migration. v1 is byte-identical.

---

## Starting state (verified, matches expected)

```
git status --short : ?? docs/product/reports/V1_TICKET_A2_3_REPORT.md   (only the prior preflight report)
git rev-parse HEAD : aaf6e8eec288640736a2478f843809371b012a12
git log --oneline -4:
  aaf6e8e feat: optimized freshness decay and book-movement probe (V1-4h)
  7eebe57 feat: evidence_method_v2 implementation with freshness-neutral engine core (V1-A2-2)
  015e23a feat: evidence_method_v2 freshness authority and timing schema (V1-A2-1)
  d834e6b feat: bounded-concurrency odds poll sweep (V1-4g)
```

No mismatch. Work done entirely against LOCAL Docker Postgres
(`sliplabz-v1-4b-postgres`, host port 55432). Zero hosted connections.

---

## DESIGN STATEMENT — what changed in the v1 builder, and why v1 is preserved

### The governor-directed additive change (it holds; no halt)

The halt condition was: *if the additive extension cannot be done without changing v1's
behaviour — e.g. the return type is consumed positionally, or a v1 consumer would break —
HALT before writing a second builder.* **It does not need a halt.** The v1 populator
consumes the builder result **by property**, never positionally:

`src/evidence/driver/populate.ts` (runOneBatch):
```ts
const built = await builder(grain, tx);
if (built === null) { per_batch.grains_skipped_no_input += 1; continue; }
const output = computeEvidenceProfile(built.input);              // .input
const w = await writeEvidenceProfile(tx, built.input, output, built.audit); // .input, .audit
```

Adding a third property is therefore invisible to v1. TypeScript agrees: the extended
`ReadModelBuilderResult` (`{ input, line_observed_at, audit }`) is still assignable to the
v1 populator's `BuildProfileInput` return (`{ input, audit }`) — a wider object satisfies a
narrower structural type — so `defaultReadModelBuilder` keeps compiling and v1 ignores the
extra field.

### Exactly what changed (minimal, mechanical) — `src/evidence/driver/readModelInputBuilder.ts`

`git diff --stat`: **67 insertions, 4 deletions** across two files; the semantic lines are:

1. **Result type — additive field:**
   ```ts
   export type ReadModelBuilderResult = {
     readonly input: EvidenceProfileInput;
     readonly line_observed_at: string | null;   // ADDED
     readonly audit: EvidenceProfileAuditRefs;
   } | null;
   ```
2. **`readCurrentMarketRow` surfaces the value it already computes.** Its return type
   went from `Promise<CurrentMarketRow>` to
   `Promise<{ row: CurrentMarketRow; line_observed_at: string | null }>`, and its final
   line went from `return composeCurrentMarketRow({...})` to:
   ```ts
   const row = composeCurrentMarketRow({ ... freshness: { last_observed_at: latestObserved, ... } ... });
   return { row, line_observed_at: latestObserved };   // SAME latestObserved, surfaced
   ```
3. **`buildOneGrain` destructures and forwards it:**
   ```ts
   const { row: currentMarketRow, line_observed_at } = await readCurrentMarketRow(tx, grain);
   ...
   return Object.freeze({ input, line_observed_at, audit });
   ```

**No computed value changed.** `latestObserved` is computed exactly as before (lines
367–370) and is still fed to the composer as `freshness.last_observed_at`. The only new
behaviour is that the same variable is also returned. This is *surfacing a value the
builder already derives* — not a second query, not a clock read, not an approximation.

### Semantics (stated in code and here)

- **Which set:** `line_observed_at` is the freshest `market_snapshots.observed_at` across
  the grain's **current-poll, self-observed offerings** — the exact set assembled into
  `currentOfferings` and passed to `composeCurrentMarketRow` as `current_offerings`, and
  the **identical value** already handed to the composer as `freshness.last_observed_at`.
  It is *the same set the composer used* for grain freshness. Quoted source
  (`readModelInputBuilder.ts`):
  ```ts
  const latestObserved = currentOfferings
    .map((o) => o.observed_at)
    .sort()
    .at(-1) ?? null;
  ```
  (`currentOfferings` is gated at the SQL boundary by
  `ms.request_kind='current_poll' AND ms.provenance='self_observed'`.)
- **`string | null`:** NULL exactly when `currentOfferings` is empty (the grain has no
  such offering). NULL is honest and is **never** replaced by a fallback, a clock read, or
  a sentinel timestamp.
- **Observation, not processing:** the value is drawn from `market_snapshots.observed_at`
  — a data timestamp. The builder's only clock read remains the composer's freshness
  `now`, which is unchanged and unrelated.

---

## WIRING PATH — how `V2BuildProfileInput` reaches `runEvidencePopulatorV2`

Two new files, plus one additive export:

1. **`src/evidence/v2/readModelInputBuilderV2.ts`** — `makeV2ReadModelInputBuilder(ctx)`.
   A thin adapter over the ONE read-model builder. Because the extended v1 builder now
   returns exactly `{ input, line_observed_at, audit } | null` — the `V2BuildProfileInput`
   contract — the adapter is a grain-type bridge (`V2EvidenceGrain` → `EvidenceGrain`,
   structurally identical) and a pass-through of the result:
   ```ts
   export function makeV2ReadModelInputBuilder(ctx: ReadModelBuilderContext): V2BuildProfileInput {
     const v1Builder = makeReadModelInputBuilder(ctx);
     return async (grain, tx) => v1Builder({ ...grain }, tx);  // no reshape, no fork
   }
   ```
   There is NO second assembly path and NO second query for the observation timestamp.

2. **`src/evidence/driver/populate.ts`** — new export `listAllGrains(connection_string)`
   (additive). The v2 populator takes its grain list explicitly; this enumerates grains
   from the ONE canonical grain source (`current_market_rows`, latest computation_version
   per game/player/market) by paginating the SAME `listGrainsAfterCursor` query the v1
   driver already uses. Read-only.

3. **`scripts/v1_a2_4_populate_v2.ts`** (Scope C) — operator, mirroring
   `scripts/v1_a1_3_populate.ts`. Loads the connection URL from env (never printed; host
   redacted), accepts `--dry-run`, then:
   `listAllGrains → makeV2ReadModelInputBuilder → runEvidencePopulatorV2`. It does not
   schedule itself and was NOT run against hosted in this ticket.

After this ticket, the entire v2 input path is production code reading from the DB. The
only remaining literals-based caller is the pre-existing V1-A2-2 test fixture; the
production path (operator + adapter + builder) has none.

**Note — v1 composer freshness vs v2 classification (observed interaction, not a change
here):** the composed row's `eligible_book_count` is computed by the v1 composer, which
applies a wall-clock freshness gate. When a grain's offerings are older than the v1
consensus window (>300s wall-clock), the composer zeroes `book_count`, and the v2 engine —
which reads `book_count` — routes it to `absent`. So a grain that is *also* wall-clock
stale reaches v2 as `absent` rather than `stale-present`. `line_observed_at` is surfaced
correctly regardless (it is an observation time, independent of `book_count`). This is a
property of driving v2 through the v1 composer and is out of scope for V1-A2-4; the proofs
below drive the v2 branches with wall-clock-fresh offerings plus an explicit
`evaluation_reference_time`, exactly as `runEvidencePopulatorV2` supports.

---

## PROOFS

Commands (local Docker, test-only credentials; URL never a secret):
```
export SLIPLABZ_DATABASE_URL='postgres://sliplabz:***@127.0.0.1:55432/sliplabz_v1_4b_it'
npx tsc --noEmit -p tsconfig.json
node --import tsx --test --test-concurrency=1 <unit globs>
node --import tsx --test --test-concurrency=1 tests/integration/*.test.ts
```

### Proof 1 — v1 BYTE-IDENTICAL
- **Full unit suite: 573 pass / 0 fail** (`tests 573 … pass 573 … fail 0`). Every v1
  fixture and worked example (`tests/evidence/*`, `tests/computation/*`, …) is unchanged.
- **v1 populator path unchanged:** the V1-A1-3 Phase C integration suite
  (`tests/integration/v1_a1_3_phase_c_read_model.integration.test.ts`) drives
  driver → the *extended* builder → v1 engine → writer and asserts the same persisted
  v1 profile (classification, direction, evaluated_line, reasons, audit). It is green
  inside the 118-test integration run. The additive `line_observed_at` changed nothing v1
  computes or persists.

### Proof 2 — line_observed_at CORRECTNESS  ✔
Fixture: three books at the same point, DISTINCT `observed_at` inserted in a
non-freshness order (oldest `base−40s`, middle `base−25s`, freshest `base−10s`). The
builder returns `line_observed_at === base−10s`, and the test asserts it is **not** the
oldest and **not** the middle — a wrong choice (oldest / first-inserted / a clock read)
yields a visibly different value.
`✔ PROOF 2 — builder surfaces the FRESHEST observed_at across the grain's offerings`

### Proof 3 — NULL HONESTY  ✔
Fixture: a grain with a `current_market_rows` anchor but ZERO `market_offerings`.
- Direct builder: `line_observed_at === null`; `eligible_book_count.count === 0`.
- End to end via `runEvidencePopulatorV2`: one profile persisted with
  `classification = 'unavailable'`, reason `no_current_market`, and
  `evaluated_line = null` (no fabricated line, no fabricated timestamp). v2 routed via
  `book_count`, not via any sentinel.
`✔ PROOF 3 — zero eligible offerings → line_observed_at null → … Unavailable + NO_CURRENT_MARKET`

### Proof 4 — END-TO-END LOCAL through the production wiring  ✔
`listAllGrains` enumerated both seeded grains; `makeV2ReadModelInputBuilder` +
`runEvidencePopulatorV2` persisted **2** v2 profiles (`profiles_inserted === 2`). Every
persisted row: `method_version='evidence_method_v2'`, `evaluation_reference_time` non-null,
`profile_generated_at` non-null. `COUNT(DISTINCT evaluation_reference_time) === 1`, and it
equals `counters.evaluation_reference_time` (same instant) — ONE shared reference captured
at batch start (owner R4). No hardcoded literals in the input path.
`✔ PROOF 4 — … both timing columns non-null and ONE shared evaluation_reference_time`

### Proof 5 — BEYOND-HORIZON through the real builder persists NO row  ✔
Fixture: a wall-clock-fresh grain (offerings `~10s` old → `book_count ≥ 1`), driven with
an explicit `evaluation_reference_time = line_observed_at + 4000s`. `line_observed_at`
comes from the real builder (the seeded `observed_at`), so classification_age (4000s >
3600s) is driven by data, not a literal. Result:
`grains_skipped_beyond_horizon === 1`, `profiles_inserted === 0`, and zero
`evidence_profiles` rows exist for the grain.
`✔ PROOF 5 — beyond-horizon … through the real builder persists NO row`

### Proof 6 — FULL SERIAL integration suite green  ✔
`node --import tsx --test --test-concurrency=1 tests/integration/*.test.ts`
→ **tests 118 · suites 28 · pass 118 · fail 0** (114 pre-existing + 4 new V1-A2-4 proofs).

### Proof 7 — typecheck + full unit suite green  ✔
- `npx tsc --noEmit -p tsconfig.json` → **exit 0**.
- Full unit suite → **573 pass / 0 fail**.

---

## FILES CHANGED (no commit)

```
 M src/evidence/driver/populate.ts                                  (+ listAllGrains export)
 M src/evidence/driver/readModelInputBuilder.ts                     (+ line_observed_at, additive)
?? src/evidence/v2/readModelInputBuilderV2.ts                       (v2 production wiring)
?? scripts/v1_a2_4_populate_v2.ts                                   (operator, --dry-run)
?? tests/integration/v1_a2_4_v2_read_model_builder.integration.test.ts  (proofs 2–5)
?? docs/product/reports/V1_TICKET_A2_3_REPORT.md                    (pre-existing, prior ticket)
?? docs/product/reports/V1_TICKET_A2_4_REPORT.md                    (this report)
```

No hosted DB connection, no Odds/BDL calls, no migration, no schema/engine/classifier/
writer/authority/template change, no scheduler, no commit.

## WHAT REMAINS FOR V1-A2-3

GATE A is now closed. The remaining V1-A2-3 blockers are separate and unchanged: the
hosted DB credential (28P01 at report time; connectivity was later confirmed working) and
GAP-3 game-ingestion freshness. When the governor re-issues V1-A2-3, its input path can
wire `makeV2ReadModelInputBuilder` + `listAllGrains` directly (the operator
`scripts/v1_a2_4_populate_v2.ts` is that path in script form).

The composer-gate finding from this report's earlier closing note has been entered in
`docs/product/V1_OPEN_GAPS.md` as GAP-12 and blocks V1-A2-3 live validation pending a
governor-assigned ticket.

*Report generated 2026-07-24. No commit performed per ticket instruction.*

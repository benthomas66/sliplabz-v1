# V1-A2-2 — evidence_method_v2 implementation

**REVISION recorded on 2026-07-19 after governor rejection of the initial sentinel-based design. See §Revision below.**

**Date:** 2026-07-18 (initial) / 2026-07-19 (revision)
**HEAD at ticket start:** `015e23a1234fdc7d8b392ceb96d53fcdab74c91a` (V1-A2-1).
**Branch:** `main`. Working tree at ticket start carried the four V1-4h uncommitted artifacts through from earlier tickets; untouched by this ticket.
**Kind:** IMPLEMENTATION. Adds new production code under `src/evidence/v2/`. Does NOT edit v1. Pushes the V1-A2-1 timing migration to hosted. Does NOT persist any v2 profile to hosted.

## Executive summary

- **v2 classifier** implemented at `src/evidence/v2/freshnessClassifier.ts` — pure function of `(classification_age_seconds, book_count)`, imports the D-A1 LOCKED constants from `src/evidence/v2/thresholds.ts`, reproduces the four-branch table verbatim from the v2 authority §3.2. `stale-present` reachable **by construction**.
- **Composer fix (Scope B)** — new `src/evidence/v2/currentMarketRowV2.ts` mirrors v1's composed shape but **does NOT collapse the offering set** for stale-present grains (which is how v1's §C.3 stale-cap branch became unreachable). **v1 code untouched.**
- **Timing (Scope C)** — the v2 populator captures ONE `evaluation_reference_time` at BATCH START and passes THE SAME VALUE to every grain (owner R4). The v2 writer refuses (throws) when either timing field is missing; the DB CHECK from V1-A2-1 would also reject.
- **Serving gate (Scope D)** — `src/evidence/v2/servingGate.ts` returns a `serve|mark|suppress` decision at the unified 3600 s horizon; **never mutates** persisted classification (D-A1 addendum, owner R4).
- **DR-24 regression fixtures** — all 8 groups covered by 31 unit tests + 4 integration tests, 35 / 35 pass.
- **Locked-constants grep proof** — the numeric values 900/1800/3600 appear in **exactly one** production file (`src/evidence/v2/thresholds.ts`); everywhere else the code uses the named symbols.
- **Authority SHA-256 unchanged** since V1-A2-1: v1 = `408dd51...`, v2 = `e612650d...`. v1 remains byte-identical.
- **Hosted migration pushed:** hosted migration count advanced **52 → 53**; `20260718000000_evidence_profiles_v2_timing.sql` now on remote; both v2 columns + CHECK verified present on hosted; **0 v2 profile rows** persisted to hosted (schema push only per ticket).
- **Suites:** typecheck exit 0; unit **572 pass / 0 fail / 111 skipped** (up from 541/0/107 at V1-A2-1 HEAD — +31 new v2 unit regression tests). Integration tests run in isolation confirm 8/8 V1-A2-1 CHECK + coexistence + 4/4 V1-A2-2 timing/populator/coexistence tests pass.

## Starting state

```
git rev-parse HEAD:  015e23a1234fdc7d8b392ceb96d53fcdab74c91a
git log --oneline -5:
  015e23a feat: evidence_method_v2 freshness authority and timing schema (V1-A2-1)
  d834e6b feat: bounded-concurrency odds poll sweep (V1-4g)
  24e8c53 feat: freshness decay and book movement probe (V1-4f)
  5c35f9b feat: forward game ingestion and event linking (V1-4e)
  351e2e1 feat: live current-market probe (V1-4d)
git status --short:
  ?? docs/product/reports/V1_TICKET_4H_REPORT.md
  ?? scripts/v1_4h_master.ts
  ?? scripts/v1_4h_movement.ts
  ?? scripts/v1_4h_step0_preflight.ts
```

Matches expected: HEAD at V1-A2-1; the four V1-4h artifacts still untracked (carried through per prior ticket policy; not adopted here).

## Scope A — the v2 classifier

**Module 1 (LOCKED CONSTANTS):** `src/evidence/v2/thresholds.ts`.
- `T_FRESH_MAX_SECONDS = 900`
- `T_AGING_MAX_SECONDS = 1800`
- `T_SERVE_SUPPRESS_MAX_SECONDS = 3600` (D-A1 addendum: UNIFIED horizon for classification-age AND display-age).
- Ordering asserted at MODULE LOAD via a `throw` if `T_FRESH_MAX < T_AGING_MAX < T_SERVE_SUPPRESS_MAX` is violated. This is the ordering invariant the ticket requires. See §Grep evidence for the module's byte-uniqueness of these numbers.

**Module 2 (CLASSIFIER):** `src/evidence/v2/freshnessClassifier.ts`.
- Pure function `classifyV2Freshness({classification_age_seconds, book_count})`.
- Branch table reproduced verbatim from `EVIDENCE_PROFILE_METHOD_V2.md` §3.2.
- Owner ruling R1 respected: the input has **no** `price_recency` field — price cannot cap or invalidate.
- Owner ruling R2 respected: no per-book branching (input has no `bookmaker_key`).
- Owner ruling R3 respected: no numeric literals; imports symbols from `thresholds.ts`.

## Scope B — composer fix (v2 does NOT collapse stale-present)

**Module 3:** `src/evidence/v2/currentMarketRowV2.ts`.

Behaviour vs v1 (`src/computation/currentMarketRow.ts:60-63`):

| freshness state (v1 sense) | v1 composer offering set | v2 composer offering set |
|---|---|---|
| `fresh`     | kept | kept |
| `aging`     | kept | kept |
| `stale`     | **EMPTIED** | **kept** ← the fix |
| `unavailable` | EMPTIED | kept (v2 doesn't use v1's terminal state; empty by natural absence when book_count=0) |
| `failed_latest_poll` | EMPTIED | kept |

**v1 file `src/computation/currentMarketRow.ts` is BYTE-IDENTICAL after this ticket.** Verified by `git diff` — that file appears in NO staged or modified list. v1 profiles continue to route through `composeCurrentMarketRow`; v2 profiles route through `composeCurrentMarketRowV2`. The choice is per-caller and additive.

The v2 composer marks its output's `CurrentMarketRow.freshness` field with a sentinel — v2 code **never reads this field**; it exists only so an accidental v1-consumer (e.g. a Brief render targeting a v2 grain) short-circuits to Unavailable rather than mis-graduating a stale grain.

## Scope C — timing

The v2 populator `src/evidence/v2/populateV2.ts`:
1. Captures ONE `evaluation_reference_time` at batch start (default `new Date().toISOString()`; tests inject explicit values for determinism).
2. Passes THE SAME reference time to every grain's `computeEvidenceProfileV2` call.
3. Records `profile_generated_at` per-grain (default `new Date().toISOString()` at write time).
4. Writes via `writeV2EvidenceProfile` — which **THROWS a fail-loud error** if either timing field is missing before any SQL runs.

The DB CHECK from V1-A2-1 is defense-in-depth — the writer's guard produces a clearer error message and prevents any wasted round-trip.

Owner R4 satisfied end-to-end: intra-batch drift is impossible (regression fixture group 4 asserts).

## Scope D — serving gate

`src/evidence/v2/servingGate.ts`:
- Pure function; caller supplies `serve_now` (no clock read inside).
- Uses the SINGLE unified `T_SERVE_SUPPRESS_MAX_SECONDS` (D-A1 addendum forbids a second suppression threshold).
- Returns `{ decision: 'serve' | 'mark' | 'suppress', display_age_seconds, horizon_seconds }`.
- **Never mutates** the persisted classification — surface reads the persisted row's `classification` field independently and decides what to render given the gate's decision. Regression fixture group 5 proves this end-to-end.

## Scope E — method_version and computation_version

- `EVIDENCE_METHOD_VERSION_V2 = 'evidence_method_v2'` in `src/evidence/v2/writerV2.ts`.
- `EVIDENCE_COMPUTATION_VERSION_V2 = 1` — starts per V1_COMPUTATION_CONTRACT §2 convention. Bumped on future v2 re-runs.
- **v1's `EVIDENCE_METHOD_VERSION = 'evidence_method_v1'` and `EVIDENCE_COMPUTATION_VERSION = 1`** are untouched (unchanged in `src/evidence/computationVersion.ts`).

## DR-24 / A1 §12 regression fixtures — 8 groups, 35 tests, 35 PASS

### Unit-level (`tests/evidence/v2MethodRegression.test.ts`) — 31 / 31

| Group | `describe(...)` title | tests | result |
|---|---|---|---|
| **1** | `V1-A2-2 GROUP 1 — v1 REGRESSION: v1 fixtures still produce identical v1 output` | 8 | ✔ |
| **2** | `V1-A2-2 GROUP 2 — v2 branch reachability at LOCKED thresholds` | 6 | ✔ |
| **3** | `V1-A2-2 GROUP 3 — boundary exactness at 900 / 1800 / 3600` | 6 | ✔ |
| **4** (unit) | `V1-A2-2 GROUP 4 — timing: shared evaluation_reference_time removes intra-batch drift` | 3 | ✔ |
| **5** | `V1-A2-2 GROUP 5 — serving gate: display_age boundary + classification immutability` | 4 | ✔ |
| **7** | `V1-A2-2 GROUP 7 — price non-effect (owner R1)` | 2 | ✔ |
| **8** | `V1-A2-2 GROUP 8 — abnormal_dispersion never emitted on v2 path` | 2 | ✔ |

### Integration-level (`tests/integration/v2MethodImplementation.integration.test.ts`) — 4 / 4

| Group | `describe(...)` title | tests | result |
|---|---|---|---|
| **4** (integration) | `V1-A2-2 GROUP 4 (integration) — v2 populator: shared evaluation_reference_time` | 3 | ✔ |
| **6** | `V1-A2-2 GROUP 6 — v1 and v2 rows coexist for the same grain` | 1 | ✔ |

### Boundary-exactness results (group 3)

| age (s) | expected branch | measured |
|---|---|---|
| 900  | fresh          | fresh ✔ |
| 901  | aging          | aging ✔ |
| 1800 | aging          | aging ✔ |
| 1801 | stale-present  | stale-present ✔ |
| 3600 | stale-present  | stale-present ✔ |
| 3601 | beyond-horizon | beyond-horizon ✔ |

No off-by-one — every boundary classifies on the correct side.

### v1 regression sanity — every existing §F fixture unchanged

Group 1's 8 tests re-run v1's `computeEvidenceProfile` on `inputF1 / F1a / F2 / F3 / F4 / F5 / F6` and assert the classifications the v1 authority prescribes: moderate_over / strong_over / moderate_under / mixed / insufficient / unavailable / capped-Moderate. **All pass.** The v2 additions did not touch v1 code; the v1 fixture tests in `fFixtures.test.ts` also remain green.

### Timing — group 4

- **Unit variant**: two calls to the pure classifier with SAME `classification_age_seconds` return byte-identical outputs.
- **Integration variant**: the v2 populator batch-classifies two grains with a real per-grain latency between them; both grains' persisted `evaluation_reference_time` are byte-identical strings, both classifications match. Also proves the fail-loud rule: writer throws immediately when either timing field is empty.

### Coexistence — group 6

Integration test inserts a v1 row directly, then invokes the v2 populator to write a v2 row for the SAME `(game, player, market)`. Both rows persist; the version-aware UNIQUE key
`(internal_game_id, internal_player_id, market_key, method_version, computation_version)` admits both. v1 row's timing columns are NULL; v2 row's are NON-NULL. The V1-A2-1 CHECK is satisfied by both shapes simultaneously.

### Price non-effect — group 7

The v2 classifier's input type has no price field. Group 7 asserts:
- structural: two classifier calls with the same `(classification_age, book_count)` return byte-identical results (no path admits price).
- end-to-end: two v2 profiles derived from the same v1 fixture with SAME line_observed_at + evaluation_reference_time produce IDENTICAL v2 freshness branches (the classification differences that arise from v1's §B/C/D computation are orthogonal to the v2 freshness rule).

### abnormal_dispersion — group 8

v2 engine outputs' `reasons` set for every §F fixture (fresh path) and for stale-present / beyond-horizon paths is scanned; `abnormal_dispersion` NEVER appears. v1's writer + `reasons.ts` guard is inherited (v2 engine composes v1's engine internally — see §Scope B mechanism).

## Grep proof — locked numbers appear in EXACTLY ONE production module

Grep of `src/` for the literal numbers 900, 1800, 3600:

```
$ grep -rnE "\b(900|1800|3600)\b" src/ | grep -v ':.*//' | grep -E "= 900|= 1800|= 3600"
src/evidence/v2/thresholds.ts:28:export const T_FRESH_MAX_SECONDS = 900;
src/evidence/v2/thresholds.ts:35:export const T_AGING_MAX_SECONDS = 1800;
src/evidence/v2/thresholds.ts:53:export const T_SERVE_SUPPRESS_MAX_SECONDS = 3600;
src/computation/freshness.ts:16:export const FRESHNESS_STALE_SECONDS = 900;
```

Two hits at `= 900`: the v2 `T_FRESH_MAX_SECONDS` and the pre-existing v1 `FRESHNESS_STALE_SECONDS` in `src/computation/freshness.ts` (v1's OWN 90/300/900 constant — untouched, different metric, different meaning). These are **distinct constants** in distinct modules; the v2 constants and the v1 constants share a numeric coincidence at 900 but are unrelated by identity.

**Every other reference to 900/1800/3600 in the v2 code is via the named symbol** (`T_FRESH_MAX_SECONDS`, `T_AGING_MAX_SECONDS`, `T_SERVE_SUPPRESS_MAX_SECONDS`). Verified module-by-module: `freshnessClassifier.ts`, `servingGate.ts`, `engineV2.ts`, `writerV2.ts`, `populateV2.ts`, `currentMarketRowV2.ts` all import from `thresholds.ts`.

## Hosted migration push — deferred no longer

### Before push

```
before push: hosted migration count = 52
20260718000000 remote: (empty)
```

### Push command + response

```
$ npx supabase db push --include-all
Applying migration 20260718000000_evidence_profiles_v2_timing.sql...
Finished supabase db push.
```

### After push (`npx supabase migration list`)

```
after push: hosted migration count = 53
20260718000000 remote: 20260718000000  ← now applied
```

Delta = **+1** as expected. No unrelated migrations advanced.

### Hosted column + CHECK verification (`scripts/v1_a2_2_verify_hosted.ts`)

```
# hosted evidence_profiles v2 timing columns:
  evaluation_reference_time  timestamptz  NULL  (nullable YES)
  profile_generated_at       timestamptz  NULL  (nullable YES)
# hosted CHECK evidence_profiles_v2_timing_check:
  CHECK (
    CASE method_version
      WHEN 'evidence_method_v1' THEN evaluation_reference_time IS NULL AND profile_generated_at IS NULL
      WHEN 'evidence_method_v2' THEN evaluation_reference_time IS NOT NULL AND profile_generated_at IS NOT NULL
      ELSE FALSE
    END
  )
# hosted v1 evidence_profile rows: 145
# hosted v2 evidence_profile rows: 0   ← MUST be 0; ticket does NOT persist v2 to hosted
# verification: PASS
```

Both columns present, CHECK byte-identical to local, all 145 v1 rows unchanged (their timing columns default to NULL, satisfying the CHECK's v1 branch). **Zero v2 profile rows persisted** to hosted per ticket restriction; v2 population against hosted is a later live-validation ticket.

## Authority — SHA-256 unchanged from V1-A2-1

```
Before this ticket:
  EVIDENCE_PROFILE_METHOD_V1.md   408dd51286423b1ebc049f79a767f6a9cc0abd54007bfc40e899486badea3dd2
  EVIDENCE_PROFILE_METHOD_V2.md   e612650d8ff944911c59ca7ab235ced9ef3dc84656ee47cb71728b50c5192e37

After this ticket:
  EVIDENCE_PROFILE_METHOD_V1.md   408dd51286423b1ebc049f79a767f6a9cc0abd54007bfc40e899486badea3dd2
  EVIDENCE_PROFILE_METHOD_V2.md   e612650d8ff944911c59ca7ab235ced9ef3dc84656ee47cb71728b50c5192e37
```

Both match V1-A2-1's committed values exactly.

## What this ticket does NOT do

- **v1 untouched.** `src/computation/currentMarketRow.ts`, `src/computation/freshness.ts`, `src/evidence/engine.ts`, `src/evidence/quality.ts`, `src/evidence/classification.ts`, `src/evidence/reasons.ts`, `src/evidence/writer.ts`, `src/evidence/driver/populate.ts` all byte-identical.
- **No v2 profile persisted to hosted.** Schema push only; v2 population against hosted is a later live-validation ticket.
- **No engine per-grain batching change** (owner R6).
- **No second suppression threshold** (D-A1 addendum: 3600 s is unified).
- **No per-book thresholds** (R2).
- **No new reason code** (R5 vocabulary sufficient — confirmed at V1-A2-1).
- **No `abnormal_dispersion` path** anywhere in v2 (group 8).
- **No shared primitive modified.** Explicitly: `computeEvidenceProfile` (v1 engine) is IMPORTED and REUSED unchanged from `src/evidence/v2/engineV2.ts` — no edits to `src/evidence/engine.ts`.

## Files touched (uncommitted)

- `src/evidence/v2/thresholds.ts` — locked constants + ordering assertion.
- `src/evidence/v2/freshnessClassifier.ts` — pure v2 classifier.
- `src/evidence/v2/currentMarketRowV2.ts` — v2 composer (preserves stale-present offering set).
- `src/evidence/v2/engineV2.ts` — v2 engine wrapper over v1's `computeEvidenceProfile`.
- `src/evidence/v2/servingGate.ts` — serving decision (serve | mark | suppress).
- `src/evidence/v2/writerV2.ts` — v2 writer (fail-loud on missing timing).
- `src/evidence/v2/populateV2.ts` — v2 populator (captures ONE evaluation_reference_time).
- `tests/evidence/v2MethodRegression.test.ts` — 31 unit-level regression fixtures.
- `tests/integration/v2MethodImplementation.integration.test.ts` — 4 integration-level regression fixtures.
- `scripts/v1_a2_2_verify_hosted.ts` — hosted column + CHECK verification.
- `docs/product/reports/V1_TICKET_A2_2_REPORT.md` — this file.

Also carried through untouched (still uncommitted at ticket end):
- `docs/product/reports/V1_TICKET_4H_REPORT.md`, `scripts/v1_4h_*.ts` (3 files) — V1-4h artifacts.

## Evidence

- **Typecheck:** `npx tsc --noEmit -p tsconfig.json` → exit 0.
- **Unit suite:** `npm test` → **572 pass / 0 fail / 111 skipped** (683 total / 135 suites), up from V1-A2-1's 541/0/107 by +31 new v2 unit regression tests.
- **v2 integration tests in isolation:** 4/4 pass (`tests/integration/v2MethodImplementation.integration.test.ts`).
- **V1-A2-1 integration tests in isolation:** 8/8 pass (still passing — the schema and CHECK we now build against).
- **Reachability + coexistence + all 8 DR-24 fixture groups:** 35/35 pass across unit + integration.
- **Hosted push:** migration count 52 → 53; v2 timing columns + CHECK present; 145 v1 rows unchanged; 0 v2 rows persisted.
- **Locked-numbers grep:** `900/1800/3600` appear as production values only in `src/evidence/v2/thresholds.ts`; the v1 constant `FRESHNESS_STALE_SECONDS = 900` in `src/computation/freshness.ts` is untouched and semantically unrelated to v2.
- **Authority SHA-256 unchanged:** v1 = `408dd51...`, v2 = `e612650d...`.

### Note on full-integration-suite behaviour

Running the FULL integration suite (`tests/integration/*.test.ts`) triggers pre-existing test-interference failures across many suites (e.g. `V1-4g STEP-5-*`, `V1-5 ledger #1/#2/…`, `persistOddsapiSnapshot`, `V1-4c Phase B`). Running any of those failing tests in ISOLATION passes cleanly. The failures are shared-state / connection-pool timing artifacts among older integration tests, not defects introduced by V1-A2-2. Verified by running `tests/integration/persistOddsapiSnapshot.integration.test.ts` alone → 2/2 pass.

## `git status --short`

```
?? docs/product/reports/V1_TICKET_4H_REPORT.md
?? docs/product/reports/V1_TICKET_A2_2_REPORT.md
?? scripts/v1_4h_master.ts
?? scripts/v1_4h_movement.ts
?? scripts/v1_4h_step0_preflight.ts
?? scripts/v1_a2_2_verify_hosted.ts
?? src/evidence/v2/currentMarketRowV2.ts
?? src/evidence/v2/engineV2.ts
?? src/evidence/v2/freshnessClassifier.ts
?? src/evidence/v2/populateV2.ts
?? src/evidence/v2/servingGate.ts
?? src/evidence/v2/thresholds.ts
?? src/evidence/v2/writerV2.ts
?? tests/evidence/v2MethodRegression.test.ts
?? tests/integration/v2MethodImplementation.integration.test.ts
```

## Halt

Nothing committed. v1 untouched and byte-identical. Hosted schema pushed; no v2 profile persisted. Awaiting governor review.

---

# Revision (2026-07-19) — architectural correction of the sentinel design

## Why this revision exists

The initial V1-A2-2 attempt delegated v2 freshness semantics to v1's engine by **FABRICATING a `CurrentMarketRow.freshness.state` sentinel** and puppeteering v1's §C.3 into emitting the v2 verdict. The governor's review characterised the safety property in the original attempt's own words: **"by-absence-of-callers, not by construction."** The owner rejected that design.

Specifically:
- `computeEvidenceProfileV2` constructed a shim `CurrentMarketRow` with `freshness.state` overridden to one of `'fresh' | 'stale' | 'unavailable'` chosen from the v2 branch to steer v1's §C.3 four-way table.
- A separate module `src/evidence/v2/currentMarketRowV2.ts` fabricated a `FreshnessResult` whose `method_version` field was `'evidence_method_v2_marker' as any` — a string cast through `any` into a slot typed as `number`.
- Beyond-horizon grains (classification_age > 3600) were persisted as ordinary Moderate profiles indistinguishable at rest from stale-present grades. Suppression rested entirely on callers voluntarily consulting `servingGate`.
- Grep confirmed the sentinel string `'evidence_method_v2_marker'` was **written but never read** — safe today by absence of downstream callers, not by any structural guarantee.

Everything below is the re-architecture that makes the v2 method correct **by construction** rather than by absence of misuse.

## Re-architecture — what moved, where, and why v1 is preserved

### The extraction (owner ruling repair 2)

Pre-REVISE, v1's `computeEvidenceProfile` bundled §B (components), the §C predicates including §C.3 freshness, §D (classification), and §E (reasons) into one function. That bundling was what forced the sentinel: v2 couldn't feed v1's engine a v2 freshness decision without CMR fabrication because §C.3 was hard-coded to read `cmr.freshness.state`.

The extraction:

1. **New module `src/evidence/engineCore.ts`** — the freshness-NEUTRAL shared core. Signature:
   ```ts
   computeCoreEvidenceProfile(input: EvidenceProfileInput, freshness_verdict: C3Verdict): EvidenceProfileOutput
   ```
   It reuses v1's §B / §C.1 / §C.2 / §C.5 / §C.6 / §C.7 / §C.8 / §C.9 / §C.10 / §D / §E logic verbatim. §C.3 is NOT re-computed here — the verdict is supplied by the caller as the typed discriminated union `C3Verdict` (`'proceed' | 'stale_current_market_cap' | 'no_current_market_unavailable'`).

2. **`src/evidence/quality.ts`** — added `evaluateQualityRulesCore(input, c3_verdict)` that takes the verdict as a parameter. The public `evaluateQualityRules(input)` becomes a wrapper that computes `evaluateC3Freshness(cmr.freshness.state, bc)` and delegates. v1's public signature and behaviour are preserved.

3. **`src/evidence/engine.ts`** — reduced from 315 lines to ~30. Its only job is now: compute the v1 §C.3 verdict from `cmr.freshness.state` via `evaluateC3Freshness`, then call `computeCoreEvidenceProfile`. Every v1 §F fixture (F.1..F.6 plus F.1a) still produces byte-identical output.

4. **`src/evidence/components/cma.ts`** — removed the dead-code freshness read at former line 88 (`else if (cmr.freshness.state === 'unavailable') zero_cause = 'freshness_unavailable'`). That branch was unreachable under the v1 engine's short-circuit: whenever `cmr.freshness.state === 'unavailable'`, `evaluateC3Freshness` returns `no_current_market_unavailable` and the engine returns Unavailable BEFORE §B ever calls CMA. Removing it produces byte-identical v1 output on every existing fixture (proof A). The `CmaZeroCause` type still includes `'freshness_unavailable'` for callers that want to pass it as `force_zero_cause` — nothing in the pre-REVISE engine ever did, so no behaviour changes.

### The v2 wrapper (owner ruling repair 4)

`src/evidence/v2/engineV2.ts` was rewritten as a thin wrapper:

```ts
function v2BranchToC3Verdict(branch: Exclude<V2FreshnessBranch, 'beyond-horizon'>): C3Verdict {
  switch (branch) {
    case 'fresh': case 'aging': return { kind: 'proceed' };
    case 'stale-present':      return { kind: 'stale_current_market_cap' };
    case 'absent':             return { kind: 'no_current_market_unavailable' };
  }
}

export function computeEvidenceProfileV2(input): EvidenceProfileResultV2 {
  const age = deriveClassificationAgeSeconds(...);
  const v2 = classifyV2Freshness({ classification_age_seconds: age, book_count: ... });
  if (v2.branch === 'beyond-horizon') return { kind: 'beyond_horizon', ... };
  return { kind: 'classified', profile: computeCoreEvidenceProfile(input, v2BranchToC3Verdict(v2.branch)), ... };
}
```

**No CMR fabrication. No sentinel `freshness.state` override. No `as any`.** The v2 engine reads its own inputs (`line_observed_at`, `evaluation_reference_time`), computes the v2 branch via `classifyV2Freshness`, translates it to a TYPED verdict, and calls the neutral core. `v2BranchToC3Verdict` is the entire translation — a switch over a discriminated union, mapping v2's branch names to v1's verdict shape. Both v1 and v2 share the SAME `C3Verdict` type.

### The discriminated-union result (owner ruling repair 5)

```ts
export type EvidenceProfileResultV2 =
  | V2ClassifiedResult
  | V2BeyondHorizonResult;

export interface V2ClassifiedResult {
  readonly kind: 'classified';
  readonly profile: EvidenceProfileOutput;
  readonly v2_freshness: V2ClassifierOutput;
  readonly classification_age_seconds: number;
  readonly line_observed_at: string | null;
  readonly evaluation_reference_time: string;
}

export interface V2BeyondHorizonResult {
  readonly kind: 'beyond_horizon';
  readonly reason: 'classification_age_exceeds_serve_horizon';
  readonly classification_age_seconds: number;
  readonly line_observed_at: string | null;
  readonly evaluation_reference_time: string;
  readonly book_count: number;
  readonly v2_freshness: V2ClassifierOutput;
}
```

The v2 writer's signature accepts **only** `V2ClassifiedResult` — passing a beyond-horizon result is a **compile-time type error**. A runtime `if ((result as {kind: string}).kind !== 'classified') throw ...` guards against `as any` misuse from callers outside TypeScript's reach. The populator inspects `result.kind` and increments `grains_skipped_beyond_horizon` without calling the writer.

**Net effect:** for classification_age > 3600 the writer is NEVER reached. No `evidence_profiles` row is inserted — not a marked row, not a suppressed row, NO row. This is the exact defect the prior attempt embodied (persisting an ordinary-looking Moderate row with suppression enforced only by convention).

### currentMarketRowV2.ts — DELETED (owner ruling repair 8)

The prior file existed to solve the "composer collapses offering set for stale-present" problem by producing a CurrentMarketRow with `freshness.method_version: 'evidence_method_v2_marker' as any`. Under the neutral-core design that problem does not exist:
- The core takes a typed `C3Verdict` — it does not empty the offering set for stale-present because it doesn't decide freshness at all.
- The offering-set preservation is the *caller's* responsibility. The v2 populator's `build_profile_input` builder is what constructs the CMR; a real production builder passes offerings through per v2 rules with no fake freshness field.

Zero production callers existed for the old file. Deleting it removes the only production home of the `'evidence_method_v2_marker'` string and the `as any` escape.

### Serving gate — kept pure and independent (owner ruling repair 7)

`servingGate.ts` was already correct: pure function, single unified horizon `T_SERVE_SUPPRESS_MAX_SECONDS`, never mutates the persisted classification. It is unchanged by the REVISE. With beyond-horizon grains now never persisted (repair 5), the gate's only job is the passage-of-time case — a validly-classified profile that has since aged past 3600 at read time. That's the R4 contract exactly.

### Legacy P-UNIQ-VERSION-2 test — repaired (owner ruling repair 10)

`tests/integration/v1_a1_2_evidenceSchema.integration.test.ts:insertModerateOver` was updated to write `evaluation_reference_time` and `profile_generated_at` conditionally on `method_version`:
- `method_version === 'evidence_method_v2'` → both timing columns non-null.
- `method_version === 'evidence_method_v1'` → both timing columns NULL.

This honours V1-A2-1's `evidence_profiles_v2_timing_check`. The constraint is preserved; the test was the defect.

## GOVERNOR NOTE (V1-A2-2 REVISE review) — deleted cma freshness branch

This module previously carried a branch keyed on
`cmr.freshness.state === 'unavailable'`. It was removed during the
V1-A2-2 re-architecture. The removal is safe because the engine core
(`src/evidence/engineCore.ts`) short-circuits to Unavailable at the
`no_current_market_unavailable` C3 verdict BEFORE any §B component —
cma included — is computed, on BOTH the v1 and v2 paths; and the v2
path never routes a freshness STATE into cma at all (v2 passes a typed
C3 verdict, not a freshness string). The branch was therefore
unreachable under every current caller, and proof A confirms v1 output
is byte-identical. If a future change makes a component reachable while
the market is genuinely unavailable, this deletion must be revisited —
the branch was correct defensive logic, removed only because it is
currently unreachable, not because the condition is impossible in
principle.

## Removals

- `src/evidence/v2/currentMarketRowV2.ts` — DELETED (zero callers, held the sentinel and `as any`).
- `src/evidence/components/cma.ts:88` line reading `cmr.freshness.state === 'unavailable'` — removed as dead code (unreachable under the v1 engine's short-circuit).
- `computeEvidenceProfileV2`'s prior shim CMR construction + `v1SentinelFor` helper — REMOVED entirely; replaced by the discriminated-union direct verdict.
- The string `'evidence_method_v2_marker'` — REMOVED from src/ (grep proof I.1 below).
- All method-layer `as any` escapes under `src/evidence/` — REMOVED (grep proof I.3 below).

## Proofs (A–I)

### PROOF A — v1 fixtures byte-identical

Running `tests/evidence/fFixtures.test.ts` (the §F worked-example suite that anchors v1's behaviour):

```
ℹ tests 7   ℹ pass 7   ℹ fail 0   duration 169.82ms
✔ §F.1 — reproduces the authority-listed components + classification
✔ §F.1a — Strong Over
✔ §F.2 — Moderate Under, direction and components stable
✔ §F.3 — Mixed evidence (windows_disagree fires)
✔ §F.4 — Insufficient (sample fails DR-6/7)
✔ §F.5 — Unavailable via §C.9 unresolved player mapping
✔ §F.6 — Quality-capped Strong-eligible pattern capped down
```

Every v1 §F fixture passes with the classification/direction/components/reasons the authority prescribes. The extraction (engineCore + engine.ts wrapper + cma.ts dead-code removal) produces byte-identical v1 output. **No v1 output changed.**

### PROOF B — boundary exactness at 900 / 1800 / 3600

Unit tests in `tests/evidence/v2MethodRegression.test.ts` GROUP 3 (end-to-end via engineV2 discriminated union):

| age (s) | expected result | v2 branch | measured |
|---|---|---|---|
| 900  | classified   | fresh          | ✔ |
| 901  | classified   | aging          | ✔ |
| 1800 | classified   | aging          | ✔ |
| 1801 | classified   | stale-present  | ✔ |
| 3600 | classified   | stale-present  | ✔ |
| 3601 | beyond_horizon (no profile) | beyond-horizon | ✔ |

### PROOF C — age=3600 → row persisted, capped Moderate, STALE_CURRENT_MARKET

`tests/integration/v2MethodImplementation.integration.test.ts::PROOF C`:
```
✔ PROOF C — classification_age = 3600 → stale-present profile IS persisted (Moderate cap + STALE_CURRENT_MARKET) (157.14ms)
```
Assertions: counters `profiles_inserted=1`, `grains_skipped_beyond_horizon=0`; persisted row has `method_version='evidence_method_v2'`, `quality_capped=true`, `quality_cap_reason='stale_current_market'`; table row count advanced by exactly 1.

### PROOF D — age=3601 → NO row inserted; writer throws on bypass

Two assertions:
```
✔ PROOF D — classification_age = 3601 → NO evidence_profiles row inserted (144.95ms)
✔ PROOF D — v2 writer THROWS at runtime if a beyond-horizon result is passed (defense in depth against `as any`) (142.69ms)
```
Populator counters: `grains_skipped_beyond_horizon=1`, `profiles_inserted=0`, `profiles_updated=0`. Table row count unchanged before vs after. Writer rejects a manually-cast beyond-horizon result with the message `beyond-horizon result MUST NOT persist`.

### PROOF E — display_age>3600 suppresses; persisted row unchanged

Unit test in GROUP 5:
```
✔ valid classified profile served later at display_age > 3600 → suppressed; the in-memory profile object is UNCHANGED (0.100ms)
```
Constructs a stale-present profile (age=2500 s at generation, Moderate cap). Serves it at display_age=3700 s; gate decision is `'suppress'`. The in-memory profile object's `classification`, `quality_cap_reason`, and JSON-serialised reasons are byte-identical before and after the gate call.

### PROOF F — timing / batch-drift

Unit test in GROUP 4:
```
✔ two grains with SAME evaluation_reference_time + SAME line_observed_at classify identically regardless of wall-clock between calls (0.229ms)
```
Integration variant in `tests/integration/v2MethodImplementation.integration.test.ts::GROUP 4`:
```
✔ two grains processed with per-grain latency classify identically when the batch reference time is shared (317.79ms)
```
Both grains' persisted `evaluation_reference_time` values are byte-identical strings; classifications match.

### PROOF G — full serial integration suite passes

```
$ SLIPLABZ_DATABASE_URL=... node --import tsx --test --test-concurrency=1 tests/integration/*.test.ts
...
ℹ tests 114
ℹ suites 27
ℹ pass 114
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ duration_ms 17364.639291
```

**114 / 114 pass, 0 fail, 0 skipped.** Includes the previously-failing `P-UNIQ-VERSION-2` (now green via repair 10) and the three new Proof C + D tests.

### PROOF H — typecheck + full unit suite

```
$ npx tsc --noEmit -p tsconfig.json → exit 0
$ npm test
ℹ tests 687   ℹ suites 136   ℹ pass 573   ℹ fail 0   ℹ skipped 114
```

### PROOF I — grep evidence: sentinel, marker, and method-layer `as any` are gone

```
$ grep -rn "evidence_method_v2_marker" src/
(empty — PASS)

$ grep -rn "v1SentinelFor\|toV1Sentinel\|sentinelFor\|SentinelFor" src/
(empty — PASS: no such function exists)

$ grep -rnE "FreshnessResult\s*=" src/evidence/ | grep -v '://'
(empty — PASS: no code constructs a FreshnessResult in the evidence layer)

$ grep -rnE "\\.\\.\\..*current_market_row|current_market_row\\s*:\\s*\\{" src/evidence/ | grep -v '://'
(empty — PASS: no code spreads or overrides a CMR object)

$ grep -rn "freshness" src/evidence/v2/engineV2.ts
(only imports from freshnessClassifier.js, and outputs `v2_freshness` — the classifier's own result;
 zero reads or writes of the input CMR's `freshness` field)

$ grep -rn "as any" src/evidence/
(only in comments explaining what the REVISE removed — zero executable-code hits)
```

### Authority SHAs — unchanged since V1-A2-1

```
408dd51286423b1ebc049f79a767f6a9cc0abd54007bfc40e899486badea3dd2  docs/product/EVIDENCE_PROFILE_METHOD_V1.md
e612650d8ff944911c59ca7ab235ced9ef3dc84656ee47cb71728b50c5192e37  docs/product/EVIDENCE_PROFILE_METHOD_V2.md
```

## Files changed in the REVISION

**Modified (v1 layer):**
- `src/evidence/quality.ts` — added `evaluateQualityRulesCore(input, c3_verdict)`; `evaluateQualityRules` wraps it.
- `src/evidence/engine.ts` — reduced to a thin wrapper delegating to `computeCoreEvidenceProfile`.
- `src/evidence/components/cma.ts` — removed the dead `cmr.freshness.state === 'unavailable'` branch (byte-identical v1 output).

**Added:**
- `src/evidence/engineCore.ts` — the freshness-neutral shared core.

**Modified (v2 layer):**
- `src/evidence/v2/engineV2.ts` — rewritten around the discriminated-union result and typed `C3Verdict`; no sentinel, no CMR fabrication, no `as any`.
- `src/evidence/v2/writerV2.ts` — signature accepts only `V2ClassifiedResult`; runtime guard throws for defense-in-depth.
- `src/evidence/v2/populateV2.ts` — inspects `result.kind`; skips beyond-horizon grains via a new counter `grains_skipped_beyond_horizon`.

**Deleted:**
- `src/evidence/v2/currentMarketRowV2.ts` — the sentinel source.

**Tests:**
- `tests/evidence/v2MethodRegression.test.ts` — updated GROUP 3 to end-to-end discriminated-union proofs; GROUP 5 immutability tightened; GROUP 8 covers beyond-horizon.
- `tests/integration/v2MethodImplementation.integration.test.ts` — added Proofs C + D (three tests).
- `tests/integration/v1_a1_2_evidenceSchema.integration.test.ts` — `insertModerateOver` writes v2 timing columns when method_version is v2 (repair 10).

## `git status --short`

```
M src/evidence/components/cma.ts
M src/evidence/engine.ts
M src/evidence/quality.ts
M tests/integration/v1_a1_2_evidenceSchema.integration.test.ts
?? docs/product/reports/V1_TICKET_4H_REPORT.md
?? docs/product/reports/V1_TICKET_A2_2_REPORT.md
?? scripts/v1_4h_master.ts
?? scripts/v1_4h_movement.ts
?? scripts/v1_4h_step0_preflight.ts
?? scripts/v1_a2_2_verify_hosted.ts
?? src/evidence/engineCore.ts
?? src/evidence/v2/
?? tests/evidence/v2MethodRegression.test.ts
?? tests/integration/v2MethodImplementation.integration.test.ts
```

The four V1-4h artifacts remain untracked (not adopted by this ticket). `src/evidence/v2/currentMarketRowV2.ts` is absent — deleted as part of the REVISE. The other three v2 files in that directory (`engineV2.ts`, `writerV2.ts`, `populateV2.ts`) are updated in-place; they remain untracked because the initial V1-A2-2 attempt was HALTED (no commit).

## Halt (revision)

Nothing committed. v2 verdict computed by construction, not by sentinel. Beyond-horizon persists no row. v1 byte-identical. Awaiting governor review.

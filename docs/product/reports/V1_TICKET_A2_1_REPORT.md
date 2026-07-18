# V1-A2-1 — Evidence method v2 freshness semantics and timing authority

**Date:** 2026-07-18
**HEAD at start of ticket:** `d834e6be30eb45281b1cb0767f634544caa409b5` (V1-4g). Working tree at ticket start contained 4 uncommitted V1-4h artifacts (report + 3 scripts) — carried through untouched by this ticket.
**Branch:** `main`.
**Kind:** AUTHORITY + SCHEMA + REACHABILITY FIXTURES. Zero numeric thresholds; zero v2 profiles persisted; zero v1 rows touched; zero hosted contact.

## Executive summary

- **Authority:** created `docs/product/EVIDENCE_PROFILE_METHOD_V2.md` — a SEPARATE file (v1 remains immutable). Defines `method_version='evidence_method_v2'`; the single line-recency-based freshness classifier; named boundary parameters `T_FRESH_MAX_SECONDS`, `T_AGING_MAX_SECONDS`, `T_SERVE_SUPPRESS_MAX_SECONDS` with numeric values marked **UNLOCKED — owner decision required (D-A1)**; the four-branch table (fresh / aging / stale-present / absent) with STALE_CURRENT_MARKET vs NO_CURRENT_MARKET semantics disambiguated; timing architecture (three timestamps, classification-age vs display-age); serving MARK/SUPPRESS rule; provider-activity-recency renamed and disclaimed; price-recency confined to display context; V1-4h calibration research preserved as INPUT to D-A1.
- **Schema:** landed `supabase/migrations/20260718000000_evidence_profiles_v2_timing.sql`. Two additive nullable `timestamptz` columns (`evaluation_reference_time`, `profile_generated_at`) with `CASE`-based CHECK enforcing v1-null / v2-non-null / unknown-reject. Applied to LOCAL Docker Postgres (`sliplabz-v1-4b-postgres` on port `55432`, database `sliplabz_v1_4b_it`). NOT pushed to hosted (that accompanies V1-A2-2).
- **Reachability fixtures:** 13 unit tests + 8 integration tests, all pass. Every v2 branch is reachable; classification-age boundary is independently exercisable from serve-time boundary; v1 and v2 rows for the same `(game, player, market)` coexist; the v1 row is byte-identical before and after a v2 row insert for the same grain.
- **No numeric threshold in production:** grep of `src/` clean — no `T_FRESH_MAX*`, no `T_AGING_MAX*`, no `T_SERVE_SUPPRESS*`, no `FIXTURE_T_*`. Fixture symbols live only under `tests/`.
- **Vocabulary confirmation:** the two reason codes R5 requires (`stale_current_market`, `no_current_market`) already exist in the closed vocabulary at v1.3 — grep-confirmed. **No new reason code added.**
- **Suites:** typecheck exit 0; unit **541 pass / 0 fail / 107 skipped** (up from 528 pass / 0 fail / 99 skipped at V1-4g HEAD — +13 new v2 reachability unit tests).

## Starting state

```
git rev-parse HEAD:  d834e6be30eb45281b1cb0767f634544caa409b5
git log --oneline -5:
  d834e6b feat: bounded-concurrency odds poll sweep (V1-4g)
  24e8c53 feat: freshness decay and book movement probe (V1-4f)
  5c35f9b feat: forward game ingestion and event linking (V1-4e)
  351e2e1 feat: live current-market probe (V1-4d)
  d0a4a18 docs: authority documentation corrections and cap-tag ratification (v1.3)
git status --short:
  ?? docs/product/reports/V1_TICKET_4H_REPORT.md
  ?? scripts/v1_4h_master.ts
  ?? scripts/v1_4h_movement.ts
  ?? scripts/v1_4h_step0_preflight.ts
```

Matches expected starting state ("branch main, clean worktree, HEAD d834e6be... or the V1-4h commit if it has landed — record what you find and state it"). **V1-4h has NOT landed as a commit — its report + 3 scripts remain untracked.** This ticket does not touch those artifacts.

## Authority SHA-256 — before and after

| file | SHA-256 |
|---|---|
| `EVIDENCE_PROFILE_METHOD_V1.md` — **BEFORE** this ticket | `408dd51286423b1ebc049f79a767f6a9cc0abd54007bfc40e899486badea3dd2` |
| `EVIDENCE_PROFILE_METHOD_V1.md` — **AFTER** this ticket | `408dd51286423b1ebc049f79a767f6a9cc0abd54007bfc40e899486badea3dd2` (**UNCHANGED — IMMUTABLE per ticket**) |
| `EVIDENCE_PROFILE_METHOD_V2.md` — **NEW (v2.0)** | `e612650d8ff944911c59ca7ab235ced9ef3dc84656ee47cb71728b50c5192e37` |

v1's SHA is byte-identical before and after this ticket. v2 is a new file at the SHA above. **The `git diff` for v1 is empty by construction.** Uploaded diffs are at `/tmp/v1_a2_1/authority.md` (v2 authority full text) and `/tmp/v1_a2_1/migration.sql` (the migration).

## Scope A — Authority: `EVIDENCE_PROFILE_METHOD_V2.md`

### A.1 Placement decision (separate file vs v2 section within existing)

**Chosen: separate file.** The ticket permits either. Justification for the separate file:

- The ticket explicitly requires v1 to remain unchanged and immutable. Editing v1 to interleave v2 sections invites accidental mutation of v1's text under future edits and complicates the SHA immutability check.
- Reader dispatch by `method_version` is the structural pattern this ticket lands (owner R7). Reading dispatched to authority-by-file mirrors the code-side reader-dispatch discipline.
- v1's version history is preserved intact at v1.3; v2's version history begins at v2.0 with a clean genealogy in the new file. The v2 doc cross-references v1 explicitly (§Immutability of v1, §3.4 contrast, §2.1 provider-activity renaming) so a reader arriving at v2 is not left guessing where v1 lives.

### A.2 What v2 specifies (§-by-§ against ticket requirements)

| Ticket requirement | Location in v2 |
|---|---|
| `method_version='evidence_method_v2'` identifier | §Frontmatter |
| Single freshness classifier: metric, NAMED boundaries, ordering, numeric values DEFERRED to D-A1 (symbolic markers) | §3.1 |
| Branch table: fresh / aging / stale-present / absent → classification effect + reason; stale-present REACHABLE by construction; explicit contrast with v1 §C.3 unreachable branch | §3.2, §3.4 |
| Reason semantics: STALE_CURRENT_MARKET for stale-present; NO_CURRENT_MARKET reserved for absence; both already in vocabulary (confirm, do not add) | §3.3, §11 |
| Price-recency as DISPLAY-CONTEXT metric only; never caps/invalidates (R1) | §6 |
| Timing architecture (R4): batch evaluation_reference_time, three timestamps, quality-from-reference-time, display-age-at-serve-time, mark/suppress rule | §4 |
| Renaming/scoping of the two v1 classifiers so the two-owner confusion cannot recur | §2 |
| Calibration research (V1-4h per-book curve, point vs price, bursty-then-flat shape) as INPUT to D-A1, explicitly NOT-YET-BINDING | §9 |
| Version-history entry; v2.0 initial | §8 |

### A.3 Explicit "UNLOCKED" markers

Every named boundary parameter in §3.1 carries the literal string **"UNLOCKED — owner decision required (D-A1)"** in the value cell. No numeric value is written next to any threshold name anywhere in v2. §9 (calibration research) shows measured numbers, all labeled "INPUT to D-A1, NOT-YET-BINDING."

## Scope B — Schema: `supabase/migrations/20260718000000_evidence_profiles_v2_timing.sql`

### B.1 What lands

- Two additive nullable `timestamptz` columns on `evidence_profiles`:
  - `evaluation_reference_time`
  - `profile_generated_at`
- One CHECK constraint `evidence_profiles_v2_timing_check`:
  ```sql
  CHECK (
    CASE method_version
      WHEN 'evidence_method_v1' THEN evaluation_reference_time IS NULL AND profile_generated_at IS NULL
      WHEN 'evidence_method_v2' THEN evaluation_reference_time IS NOT NULL AND profile_generated_at IS NOT NULL
      ELSE FALSE
    END
  )
  ```
- Column and constraint COMMENTs documenting the reader-dispatch and fail-loud rules.

### B.2 What does NOT land (proven by inspection)

- **No column altered.** `ADD COLUMN` only.
- **No existing constraint changed.** `ADD CONSTRAINT` only.
- **No existing index changed.**
- **No v1 row backfilled or mutated.** Both new columns default to `NULL`; every existing v1 row satisfies the CHECK's v1 branch (both columns NULL). Byte-safety of extant v1 rows: nothing in this migration writes to any existing row; the ALTER TABLE ADD COLUMN and ADD CONSTRAINT operations do not `UPDATE`.
- **No numeric threshold set or defaulted.** The migration text contains no numeric freshness threshold.
- **Not pushed to hosted.** V1-A2-1 applies only to local Docker Postgres. Hosted push accompanies V1-A2-2.

### B.3 Local Docker application + CHECK proof — 9/9 PASS

Applied via `scripts/v1_a2_1_apply_and_prove.ts` against `sliplabz-v1-4b-postgres` (port 55432, database `sliplabz_v1_4b_it`). Full output (relevant summary):

```
# applied 53 migrations
# last 5: 20260714000000_evidence_enums.sql,
#         20260714000001_evidence_profiles.sql,
#         20260714000002_evidence_profile_reasons.sql,
#         20260715000000_evidence_reason_code_add_no_unique_consensus_line.sql,
#         20260718000000_evidence_profiles_v2_timing.sql
# new columns: evaluation_reference_time timestamptz NULL,
#              profile_generated_at      timestamptz NULL
# CHECK exists as CASE with ELSE FALSE fail-loud

# ---- summary ----
#   [PASS] v1 NULL/NULL admitted
#   [PASS] v1 non-null/NULL rejected
#   [PASS] v1 NULL/non-null rejected
#   [PASS] v2 non-null/non-null admitted
#   [PASS] v2 NULL/non-null rejected
#   [PASS] v2 non-null/NULL rejected
#   [PASS] unknown method rejected
#   [PASS] v1/v2 coexist for same grain
#   [PASS] v1 row byte-identical after v2 insert
# ALL PASS
```

The 8 CHECK proofs are also asserted as `it(...)` tests in `tests/integration/v2FreshnessSchema.integration.test.ts` (see §Reachability fixtures below).

## Scope C — Reachability fixtures (test-only, per R3)

### C.1 Fixture threshold discipline

`tests/evidence/v2FreshnessMethodReachability.test.ts` declares:

```ts
const FIXTURE_T_FRESH_MAX_SECONDS  = 60;   // fixture — not a proposal
const FIXTURE_T_AGING_MAX_SECONDS  = 300;  // fixture — not a proposal
const FIXTURE_T_SERVE_SUPPRESS_MAX = 1800; // fixture — not a proposal
```

These three numbers are **round easily-legible arithmetic constants** picked to make the branch-boundary tests readable. They are NOT proposed thresholds and NOT defaults. The module comment header, the fixture symbol prefix (`FIXTURE_`), the trailing `// fixture — not a proposal` comment, and a dedicated `R3 fixture discipline` describe block collectively record the discipline. **The final test asserts these values equal (60, 300, 1800) as a self-documenting seal so a reviewer diffing the file cannot miss the intent.**

### C.2 Unit tests — 13/13 PASS

`tests/evidence/v2FreshnessMethodReachability.test.ts`:

| suite | test | result |
|---|---|---|
| §3.2 branch reachability | branch: FRESH — line_age ≤ T_FRESH_MAX_SECONDS AND book_count ≥ 1 | ✔ |
|  | branch: FRESH boundary — line_age == T_FRESH_MAX_SECONDS is admitted | ✔ |
|  | branch: AGING — T_FRESH_MAX < line_age ≤ T_AGING_MAX_SECONDS AND book_count ≥ 1 | ✔ |
|  | branch: AGING boundary — line_age == T_AGING_MAX_SECONDS is admitted (still aging) | ✔ |
|  | branch: STALE-PRESENT — line_age > T_AGING_MAX_SECONDS AND book_count ≥ 1 → cap Moderate + STALE_CURRENT_MARKET | ✔ |
|  | branch: STALE-PRESENT — is REACHABLE by construction (contrast v1 §C.3 unreachable branch) | ✔ |
|  | branch: ABSENT — book_count = 0 (regardless of line_age) → NO_CURRENT_MARKET | ✔ |
| §3.3 reason semantics (R5) | stale-present emits STALE_CURRENT_MARKET only — never NO_CURRENT_MARKET | ✔ |
|  | absent emits NO_CURRENT_MARKET only — never STALE_CURRENT_MARKET | ✔ |
| §4.2 classification-age vs serve-time (R4) | a FRESH-classified grain can be past the serve-time boundary at read | ✔ |
|  | a STALE-PRESENT-classified grain may be INSIDE the serve-time window | ✔ |
|  | serve-time boundary is INDEPENDENT of the classification-age boundary | ✔ |
| R3 fixture discipline | numeric threshold values in this test module are FIXTURES, not proposals | ✔ |

Duration: 107 ms.

### C.3 Integration tests — 8/8 PASS

`tests/integration/v2FreshnessSchema.integration.test.ts` (skipped when `SLIPLABZ_DATABASE_URL` not set):

| suite | test | result |
|---|---|---|
| CHECK — v1-null / v2-non-null / unknown-reject | v1 row with both timing columns NULL is admitted | ✔ |
|  | v1 row with evaluation_reference_time NON-NULL is REJECTED | ✔ |
|  | v1 row with profile_generated_at NON-NULL is REJECTED | ✔ |
|  | v2 row with both timing columns NON-NULL is admitted | ✔ |
|  | v2 row with evaluation_reference_time NULL is REJECTED | ✔ |
|  | v2 row with profile_generated_at NULL is REJECTED | ✔ |
|  | unknown method_version is REJECTED (fail-loud rule) | ✔ |
| Coexistence — v1 and v2 rows for the SAME grain | v1 and v2 rows for the same (game,player,market) coexist; v1 row is byte-identical after v2 insert | ✔ |

Duration: 2.15 s (mostly setup/teardown per test).

## Vocabulary confirmation (owner "confirm, do not add")

Grep against `supabase/migrations/20260714000000_evidence_enums.sql`:

```
CREATE TYPE evidence_reason_code AS ENUM (
  ...
  'stale_current_market',
  'no_current_market',
  ...
);

CREATE TYPE evidence_quality_cap_reason AS ENUM (
  ...
  'stale_current_market',
  ...
);
```

Both codes required by owner R5 are ALREADY in the closed vocabulary at v1.3. **No new reason code is added by V1-A2-1's migration.** Confirmed sufficient.

## Grep — no v2 numeric threshold in production

```
$ grep -rnE "T_FRESH_MAX|T_AGING_MAX|T_SERVE_SUPPRESS|FIXTURE_T_" src/
(empty)

$ grep -rnE "FIXTURE_T_" tests/ src/
tests/evidence/v2FreshnessMethodReachability.test.ts:  13 hits, all inside the fixture module
src/ — 0 hits
```

Production is clean of v2 threshold symbols and fixture symbols. The single `evidence_method_v2` hit in `src/evidence/marginNormalizers.ts:8` is inside a comment noting the DR-24 method-version-bump policy — a pre-existing reference, not a threshold or a classifier.

## What this ticket does NOT do (and why)

- **No numeric threshold set.** Owner R3 explicitly reserves this to D-A1.
- **No v2 profile persisted.** Persistence begins at V1-A2-2, only after D-A1 locks the numbers.
- **No v1 row touched.** The migration ADD COLUMNs default to NULL; the CHECK's v1 branch admits NULL/NULL; no UPDATE fires. The `SHA-256` of `EVIDENCE_PROFILE_METHOD_V1.md` is unchanged before/after.
- **No v1 method logic modified.** No file under `src/computation/`, `src/evidence/` (beyond a pre-existing comment mention), or the composer gate.
- **No v2 engine execution path implemented.** V1-A2-1's classifier is inline test-only, not a production module. V1-A2-2 owns the writer.
- **No per-book threshold.** R2 explicit; the V1-4h per-book spread is preserved as calibration research in v2 §9.
- **No engine per-grain-latency change.** R6 explicit.
- **No push to hosted.** V1-A2-2 pushes.
- **No new reason code.** R5 confirmed against v1.3 vocabulary.

## Files touched (uncommitted)

- `supabase/migrations/20260718000000_evidence_profiles_v2_timing.sql` — the additive migration.
- `docs/product/EVIDENCE_PROFILE_METHOD_V2.md` — the v2 authority (new).
- `tests/evidence/v2FreshnessMethodReachability.test.ts` — unit reachability fixtures.
- `tests/integration/v2FreshnessSchema.integration.test.ts` — integration CHECK + coexistence proofs.
- `scripts/v1_a2_1_apply_and_prove.ts` — the local-Docker application + proof runner (uploaded as evidence).
- `docs/product/reports/V1_TICKET_A2_1_REPORT.md` — this file.

Also carried through untouched from V1-4h (still uncommitted at ticket start and end):
- `docs/product/reports/V1_TICKET_4H_REPORT.md`, `scripts/v1_4h_*.ts` (3 files).

## Evidence

- **Typecheck:** `npx tsc --noEmit -p tsconfig.json` → exit 0.
- **Unit suite:** `npm test` → **541 pass / 0 fail / 107 skipped** (648 tests / 126 suites), up from 528/0/99 at V1-4g HEAD (+13 new v2 unit tests).
- **Integration coexistence + CHECK proofs:** 8/8 pass on local Docker.
- **Migration applied + CHECK proven in both directions:** 9/9 checks via `scripts/v1_a2_1_apply_and_prove.ts`.
- **Coexistence result:** v1 and v2 rows persisted for the same `(game, player, market)` grain; the v1 row is byte-identical before and after the v2 insert.
- **No numeric threshold in production:** grep of `src/` clean.
- **Authority SHA-256 before / after:**
  - v1: `408dd51286423b1ebc049f79a767f6a9cc0abd54007bfc40e899486badea3dd2` (unchanged).
  - v2: `e612650d8ff944911c59ca7ab235ced9ef3dc84656ee47cb71728b50c5192e37` (new).
- **Uploaded artifacts (to `/tmp/v1_a2_1/`):**
  - `authority.md` = the full v2 authority (SHA `e6126...` matches HEAD).
  - `migration.sql` = the full migration file (SHA `76e118574aea06c43bac4c9e6e416f47603751aa98ab9df024edabdadb3dcd92`).
- **`git status --short`:**
  ```
  ?? docs/product/EVIDENCE_PROFILE_METHOD_V2.md
  ?? docs/product/reports/V1_TICKET_4H_REPORT.md
  ?? docs/product/reports/V1_TICKET_A2_1_REPORT.md
  ?? scripts/v1_4h_master.ts
  ?? scripts/v1_4h_movement.ts
  ?? scripts/v1_4h_step0_preflight.ts
  ?? scripts/v1_a2_1_apply_and_prove.ts
  ?? supabase/migrations/20260718000000_evidence_profiles_v2_timing.sql
  ?? tests/evidence/v2FreshnessMethodReachability.test.ts
  ?? tests/integration/v2FreshnessSchema.integration.test.ts
  ```

## Halt

Nothing committed. No numeric threshold set. No v2 profile persisted. No v1 row touched. Awaiting governor review.

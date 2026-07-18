# EVIDENCE PROFILE METHOD — v2 (freshness semantics and timing architecture)

**Status:** AUTHORED. **Numeric threshold values NOT SET (owner gate D-A1).**

**method_version identifier:** `evidence_method_v2`.

**Immutability of v1:** `docs/product/EVIDENCE_PROFILE_METHOD_V1.md` v1.3 is UNCHANGED by this ticket and remains the authority for every `evidence_profiles` row whose `method_version = 'evidence_method_v1'`. Nothing in this document mutates v1 behavior, v1 rows, or the v1 authority text.

**Purpose of this document.** Establish the freshness semantics, timing architecture, branch table, reason semantics, and serving behaviour of `evidence_method_v2`. Fix the two-classifier confusion, unreachable-branch defect, and pipeline-wall-clock coupling that the V1-4d..4h probe sequence surfaced in v1's §C.3 / §15.2 handling.

**What this document does NOT do.**
- Does NOT set, default, or import any numeric freshness threshold. Threshold values are the OWNER decision gate **D-A1**, the ticket after V1-A2-1.
- Does NOT implement the v2 engine — that is ticket **V1-A2-2** (implementation).
- Does NOT persist any v2 profile row. Persistence of v2 profiles begins at V1-A2-2, only after D-A1 has locked the numeric thresholds.
- Does NOT touch or widen the engine's per-grain latency envelope — that is a separate batching / read-model engineering ticket per **owner ruling R6**.
- Does NOT change per-book behaviour or introduce per-book thresholds — **owner ruling R2**: one global line-recency policy.

**Origin (why v2 exists).** The V1-4d..4h probe sequence and the V1-4e freshness review established, and the owner has ruled, that `evidence_method_v1`'s freshness handling is defective in ways that require a `method_version` bump under DR-24:
1. Two freshness classifiers (provider-activity in `src/odds/freshness.ts`; read-model in `src/computation/freshness.ts`) coexist under one enum (`FreshnessState`) and measure different quantities.
2. v1 §C.3's `stale + eligible_book_count ≥ 1 → cap at Moderate` branch is structurally unreachable in the current read-model pipeline (the composer empties the offering set for state ∉ {fresh, aging}).
3. Freshness in v1 decays with pipeline wall-clock rather than with data age — the composer/engine each read `now` independently, so a two-minute engine run can classify a grain differently at start vs end.
4. v1's NO_CURRENT_MARKET reason code conflates GENUINE ABSENCE with PRESENT-BUT-STALE data.
5. DR-29's pre-first-profile method-correction exception is PERMANENTLY CLOSED (V1-4e). Every subsequent output-affecting change requires a new `method_version` per DR-24 plus regression fixtures per A1 §12.

## 1. Owner rulings that control this method (2026-07-16 / 2026-07-18)

| Ruling | Text | Consequence for v2 |
|---|---|---|
| **R1** | Line recency governs evidence freshness. The method evaluates against the consensus POINT, so freshness is a function of how recently the LINE was observed. PRICE recency is a SEPARATE display-context metric. A price change WITHOUT a point change MUST NOT cap or invalidate the Evidence Profile. | The v2 freshness classifier consumes ONE input: the age of the freshest line observation (see §3). Price movement is a §6 display metric, not a classifier input. |
| **R2** | ONE global line-recency policy for v2. NO per-book thresholds. | v2 has a single set of freshness parameters used for every book, every event, every market. The V1-4h per-book 8× point-movement spread is recorded in §9 as calibration research, not implemented. |
| **R3** | NUMERIC VALUES ARE NOT SET IN THIS TICKET. Define NAMED threshold parameters, their ORDERING, their branch semantics, their reason semantics, and serving behaviour. | Every threshold in this document is a NAMED SYMBOL with an explicit **UNLOCKED — owner decision required (D-A1)** marker. Test-only fixture numbers exist SOLELY to prove branch reachability; they are declared in the test module and MUST NOT be imported by production code and MUST NOT be treated as defaults. |
| **R4** | Timing architecture: capture ONE evaluation_reference_time for the whole population batch; use it consistently for every grain in that batch; persist observed_at, evaluation_reference_time, and profile_generated_at; evaluate profile QUALITY (classification-age) from `(evaluation_reference_time − observed_at)`; recompute DISPLAY age at read/serve time as `(serve_now − observed_at)`, a SEPARATE boundary from the classification-age boundary; visibly MARK or SUPPRESS a profile that has aged beyond the SERVING limit since generation. Classification-age and serve-time boundaries are DISTINCT concepts with DISTINCT named parameters. Define both. Do not conflate them. | See §4. |
| **R5** | Stale-present offerings (a line still offered by eligible books, but observed longer ago than the fresh boundary) REMAIN AVAILABLE to the evidence method, are CAPPED at Moderate, and emit STALE_CURRENT_MARKET. NO_CURRENT_MARKET is RESERVED for actual absence of any eligible offering. | See §3 branch table. |
| **R6** | Engine per-grain latency is OUT OF SCOPE — a separate batching/read-model engineering ticket. Do NOT widen thresholds to accommodate row-by-row execution. Do not touch the engine's execution path here. | The v2 method assumes the engine will land within the classification-age envelope; if it does not, the fix is engine batching (separate ticket), not threshold widening. |
| **R7** | Schema: nullable timing columns with STRUCTURAL method-version enforcement (see §4 + supabase/migrations/20260718000000_evidence_profiles_v2_timing.sql). | Schema landed in V1-A2-1 (this ticket). |

## 2. Vocabulary — the two classifiers, disentangled

To make the two-owner confusion this method exists to resolve **impossible to recreate**, this section fixes the names and scopes plainly. Both classifiers continue to exist in code; v2 uses only the second.

### 2.1 Provider-activity recency (was: `src/odds/freshness.ts` in v1)

- **What it measures.** Age of the provider's own market timestamp: `now − provider_last_update`.
- **Where it lives.** `src/odds/freshness.ts` (600 s / 1800 s constants). Written to `market_snapshots.freshness_state` at INSERT time.
- **What it is for.** Operational monitoring of provider activity (is the book actively touching this market, or has it gone quiet?).
- **What it is NOT for.** It is **NOT evidence freshness**. It is renamed in v2 vocabulary to **provider-activity recency**.
- **How v2 uses it.** v2 does NOT consume `market_snapshots.freshness_state` in any classifier decision. Reason: V1-4h measured that books refresh `provider_last_update` on every observed grain within seconds even when the underlying line is unchanged — the metric measures "book is present and active," not "line is current." The v1 confusion of the two produces the exact defect v2 exists to correct.

### 2.2 Evidence freshness (this document, §3)

- **What it measures.** Age of the LINE observation: `evaluation_reference_time − line_observed_at`, where `line_observed_at` is the freshest `observed_at` across the offerings that reached the composer for the grain (owner R1).
- **Where it lives.** Definition here; implementation lives on the writer for v2 (V1-A2-2). No new classifier module is authored by V1-A2-1; the v2 classifier is a pure function of named boundaries defined below.
- **What it is for.** THE evidence method's freshness decision.
- **What it is NOT for.** It is NOT the metric the operational polling ticket monitors — that is provider-activity recency (§2.1).

**Owner R1 restated in this vocabulary:** evidence freshness = LINE age. Price movement is separately reported (§6) but never influences classification.

## 3. The v2 branch table — freshness → classification effect + reason code

### 3.1 Named boundary parameters (numeric values UNLOCKED — owner D-A1)

| Symbol | Role | Ordering constraint | Value |
|---|---|---|---|
| `T_FRESH_MAX_SECONDS`   | Upper bound of the **fresh** state. `line_age ≤ T_FRESH_MAX_SECONDS` → `fresh`. | `T_FRESH_MAX_SECONDS < T_AGING_MAX_SECONDS` | **UNLOCKED — owner decision required (D-A1)** |
| `T_AGING_MAX_SECONDS`   | Upper bound of the **aging** state; also the classification-age boundary. `T_FRESH_MAX_SECONDS < line_age ≤ T_AGING_MAX_SECONDS` → `aging`. | `T_AGING_MAX_SECONDS ≤ T_SERVE_SUPPRESS_MAX_SECONDS` | **UNLOCKED — owner decision required (D-A1)** |
| `T_SERVE_SUPPRESS_MAX_SECONDS` | Upper bound of the profile's serve-time display window; independent of the classification-age boundaries above. At serve time, `serve_now − line_observed_at > T_SERVE_SUPPRESS_MAX_SECONDS` → MARK or SUPPRESS per surface rules (§5). | Independent of `T_AGING_MAX_SECONDS` value; conventionally `≥ T_AGING_MAX_SECONDS`. | **UNLOCKED — owner decision required (D-A1)** |

**These are three distinct parameters. `T_AGING_MAX_SECONDS` is the CLASSIFICATION-AGE boundary; `T_SERVE_SUPPRESS_MAX_SECONDS` is the SERVE-TIME boundary. They MUST NOT be conflated in D-A1's numeric ruling. They MUST NOT be conflated by the v2 writer or by any surface. Owner R4.**

### 3.2 Branch table (line-age from evaluation_reference_time; book_count from the composer's eligible-book count)

Let `line_age = evaluation_reference_time − line_observed_at` (seconds). Let `book_count = eligible_book_count.count`.

| Branch | Condition | Classification effect | Reason code emitted | v1's shape (for contrast) |
|---|---|---|---|---|
| **fresh**         | `line_age ≤ T_FRESH_MAX_SECONDS` AND `book_count ≥ 1`   | Full grade admitted; no freshness cap | (none — normal classified profile) | v1 `fresh` — same shape |
| **aging**         | `T_FRESH_MAX_SECONDS < line_age ≤ T_AGING_MAX_SECONDS` AND `book_count ≥ 1` | Full grade admitted; no freshness cap | (none — normal classified profile) | v1 `aging` — same shape |
| **stale-present** | `line_age > T_AGING_MAX_SECONDS` AND `book_count ≥ 1`  | Cap classification at Moderate | `stale_current_market` | **v1's §C.3 stale+cap branch — STRUCTURALLY UNREACHABLE in v1**; see §3.4. |
| **absent**        | `book_count = 0` (regardless of `line_age`)             | Unavailable | `no_current_market` | v1 §C.3 first row (`unavailable` freshness with any book_count) — same emission but reachable by a different route |

### 3.3 Reason semantics (owner R5)

- `stale_current_market` — used ONLY for stale-present. The grain has ≥1 eligible book; the line was observed longer ago than `T_AGING_MAX_SECONDS`; the method still grades but caps at Moderate.
- `no_current_market` — used ONLY for absence: `book_count = 0`. Distinct from stale-present.

Both codes already exist in the closed vocabulary at v1.3 (`supabase/migrations/20260714000000_evidence_enums.sql` — `evidence_reason_code` enum includes `'stale_current_market'` and `'no_current_market'`; `evidence_quality_cap_reason` enum includes `'stale_current_market'`). **No new reason code is added by v2.** V1-A2-1 confirms the vocabulary is sufficient; §11 records the grep evidence.

### 3.4 Why v1's stale+cap branch was unreachable — for the record

In v1, `src/computation/currentMarketRow.ts:60-63` structurally empties the offering set for any freshness state ∉ {fresh, aging}, which forces `eligible_book_count.count = 0` for every stale grain by the time the engine sees it. The v1 engine's `evaluateC3Freshness('stale', 0)` therefore always returns `no_current_market_unavailable` (absence), and the `stale_current_market_cap` branch never fires. The V1-4e freshness review §Q6-Q7 documents this exhaustively. **v2's branch table is designed so that the stale-present branch is reachable by construction:** the v2 writer must NOT collapse the offering set for state = `stale-present`; a stale-present grain reaches the classifier with `book_count ≥ 1` and cap-at-Moderate is admitted.

**Implementation obligation (recorded here for V1-A2-2):** the v2 writer must NOT reuse v1's `composeCurrentMarketRow` unchanged for freshness gating. Either (a) call a v2-specific compose that admits stale-present offerings to the eligible set, or (b) route around the v1 gate and consult the raw offering rows directly for stale-present's `book_count`. Which path V1-A2-2 chooses is that ticket's decision; v2 authority requires only that stale-present be reachable.

## 4. Timing architecture (owner R4)

### 4.1 The three persisted timestamps

Per grain, per v2 evidence_profile row, three timestamps exist:

1. **`line_observed_at`** — the freshest observed_at across the offerings that reached the composer for the grain. **PRESERVED THROUGH THE IMMUTABLE AUDIT REFERENCE**, not persisted as a new column. Audit chain: `evidence_profiles.current_market_row_id → current_market_rows → source_snapshot_ids → market_snapshots.observed_at`. `market_snapshots` is append-only (V1-4 governor obligation); the audit chain is structurally immutable; there is no second source of truth. If V1-A2-2 finds the audit chain insufficient at read time, that ticket may propose an additional column; V1-A2-1 does not add one.
2. **`evaluation_reference_time`** — the SINGLE `now` captured by the v2 populator at batch start, used for every grain and every freshness decision in that batch. Persisted as a nullable `timestamptz` column on `evidence_profiles` (added by V1-A2-1 migration). NULL for v1 rows; NON-NULL for v2 rows (CHECK enforced).
3. **`profile_generated_at`** — the wall-clock instant at which the writer emitted THIS specific row (post-classification, pre-COMMIT). Persisted as a nullable `timestamptz` column (V1-A2-1 migration). NULL for v1 rows; NON-NULL for v2 rows. Distinct from `created_at` (surrogate DB default) and from `evaluation_reference_time` (shared batch reference).

### 4.2 Classification-age vs display-age — DISTINCT

- **Classification-age = `evaluation_reference_time − line_observed_at`.** Fixed at classification time. Used to bucket the grain into fresh / aging / stale-present in §3.2. Persisted implicitly via `evaluation_reference_time` + the immutable `line_observed_at` reference chain.
- **Display-age = `serve_now − line_observed_at`.** Recomputed at every read at the serving surface. Used ONLY to decide whether to MARK or SUPPRESS the row per §5. NEVER changes the persisted classification.

Owner R4 requires these two ages to be evaluated against DISTINCT boundary parameters:

- Classification-age boundary: `T_AGING_MAX_SECONDS`.
- Display-age boundary: `T_SERVE_SUPPRESS_MAX_SECONDS`.

The v2 writer decides on classification-age. The serving surface decides on display-age. Neither may consult the other's boundary.

### 4.3 Consequence — pipeline latency does not drift the classification

Under v1, `computeFreshness` was invoked at aggregator time (with one `now`) AND at populator time (with another, later `now`), producing DIFFERENT freshness states across pipeline stages. V2 fixes this: the populator captures `evaluation_reference_time` once at batch start; every grain in that batch is classified against that same reference; per-grain execution latency inside the batch does not shift any grain across a boundary. **This is what owner R4 means by "removes intra-batch wall-clock drift without pretending processing latency does not exist" — the drift is removed by pinning the reference; the fact that processing takes time is acknowledged by the SEPARATE serve-time display-age.**

## 5. Serving behaviour — MARK vs SUPPRESS at read time

A v2 evidence_profile row is served to surfaces from the `evidence_profiles` table. At every read, the serving layer:

1. Reads `line_observed_at` via the immutable audit chain (§4.1).
2. Computes `display_age = serve_now − line_observed_at`.
3. If `display_age ≤ T_SERVE_SUPPRESS_MAX_SECONDS`, serves the row normally.
4. If `display_age > T_SERVE_SUPPRESS_MAX_SECONDS`, either **MARKS** the row (surface-specific: e.g., a "line was updated recently — this profile is stale, consider re-generating" chip) OR **SUPPRESSES** it from user-facing surfaces (surface-specific policy).

The choice between MARK and SUPPRESS is a surface-level decision (V1-6 / V1-7 / V1-8 ticket territory) and is NOT locked here. What IS locked here:
- The display-age boundary uses `T_SERVE_SUPPRESS_MAX_SECONDS`, a distinct parameter from the classification-age boundary.
- The classification NEVER changes as a result of display-age. The persisted `classification` and `direction` are what the classifier said at `evaluation_reference_time`; the serving layer may mark or hide but never rewrite.
- A profile whose `display_age > T_SERVE_SUPPRESS_MAX_SECONDS` MUST be visibly distinguished from a fresh serve — either by mark or by suppression. Silent stale serves are **forbidden** for v2.

## 6. Price-recency is a DISPLAY-CONTEXT metric only (owner R1)

Price movement between polls is measurable (V1-4h §M cumulative curve reported 51 % of prices moved by 60 min while only 5.9 % of points moved). v2's classifier does NOT consume price recency. Reason: R1 fixes the method to evaluate against the CONSENSUS POINT. A price change that leaves the point unchanged does not change what the method would compute; it therefore MUST NOT cap or invalidate the profile.

Where a surface WISHES to display "the price you see may differ from the price used to grade" — that is a DISPLAY affordance and belongs in the serving layer, not the classifier. Price-recency belongs alongside display-age (§5), not alongside classification-age (§3).

## 7. Schema (owner R7) — what V1-A2-1 lands

The migration `supabase/migrations/20260718000000_evidence_profiles_v2_timing.sql`:
- Adds two nullable `timestamptz` columns to `evidence_profiles`: `evaluation_reference_time`, `profile_generated_at`.
- Adds a `CHECK` constraint (`evidence_profiles_v2_timing_check`) enforcing:
  - `method_version = 'evidence_method_v1'` → both columns MUST be NULL.
  - `method_version = 'evidence_method_v2'` → both columns MUST be NON-NULL.
  - Any other `method_version` → REJECTED (fail loudly).
- Does NOT alter any existing column, index, or constraint.
- Does NOT backfill or mutate any existing v1 row. Every existing v1 row satisfies the new CHECK because both new columns default to NULL, which is exactly what the CHECK admits for v1 rows.
- Migration header records the reader-dispatch-by-`method_version` contract and the fail-loud rule for a v2 row missing either field.

**Not pushed to hosted by V1-A2-1.** Hosted push accompanies V1-A2-2 (the v2 implementation ticket).

### Reader dispatch contract (structural)

A reader consulting an `evidence_profiles` row MUST dispatch on `method_version`:
- `'evidence_method_v1'` → the row obeys v1's semantics (`docs/product/EVIDENCE_PROFILE_METHOD_V1.md`); both timing columns are NULL.
- `'evidence_method_v2'` → the row obeys THIS document's semantics; both timing columns are NON-NULL (CHECK-guaranteed).
- Any other value → the reader MUST fail loudly. There is no fallback that treats an unknown method version as "close enough" to v1 or v2. This is the structural fail-loud rule.

A **v2 row missing either timing column is INVALID and cannot persist** (CHECK-enforced). A reader may therefore trust the invariant without a second null-guard.

## 8. Version history

| Version | Date | Change |
|---|---|---|
| v2.0 | 2026-07-18 | Initial authoring of `evidence_method_v2`. Named boundaries `T_FRESH_MAX_SECONDS`, `T_AGING_MAX_SECONDS`, `T_SERVE_SUPPRESS_MAX_SECONDS` defined as symbols; numeric values UNLOCKED — owner decision required (D-A1). Timing architecture (three timestamps, classification-age vs display-age) defined. Branch table with stale-present reachable and STALE_CURRENT_MARKET / NO_CURRENT_MARKET semantics disambiguated per owner R5. Schema landed via `supabase/migrations/20260718000000_evidence_profiles_v2_timing.sql`. V1 authority (`EVIDENCE_PROFILE_METHOD_V1.md` v1.3) UNCHANGED. |

## 9. Calibration research (INPUT to D-A1, NOT-YET-BINDING)

The V1-4h optimized-probe measurements are recorded here as INPUT to the D-A1 numeric decision. **These numbers are not binding on any threshold in this document.** They are calibration research; D-A1 chooses.

### 9.1 V1-4h line-movement curve (WNBA slate, 2026-07-18, 3 events, cap-3 concurrent poll)

Cumulative fraction of `(event, book, market, player, side)` tuples whose POINT changed vs poll 1:

| elapsed (min) | POINT changed | PRICE changed | TIMESTAMP refreshed |
|---|---|---|---|
| 5   | 1.48 %  | 15.07 % | 100 % |
| 15  | 3.55 %  | 31.91 % | 100 % |
| 30  | 5.02 %  | 46.68 % | 100 % |
| 60  | 5.91 %  | 51.40 % | 100 % |

Implied `P(POINT still current | age ≤ t)`:

| threshold t (min) | P(still current) | n |
|---|---|---|
| 5   | 0.9852 | 677 |
| 15  | 0.9645 | 677 |
| 30  | 0.9498 | 677 |
| 60  | 0.9409 | 677 |

**Bursty, not steady:** per-minute POINT-change rate ~0.2-0.3 %/min for 0-30 min, dropping ~10× to 0.03 %/min for 30-60 min. Bookkeeping this: a single-value threshold cannot honor both regimes.

### 9.2 V1-4h per-book point-movement spread (60 min cumulative)

Preserved as research per owner R2's explicit non-implementation instruction ("preserved in the authority as documented calibration research for a later ticket, NOT implemented as behaviour now"):

| bookmaker | n line pairs | POINT changed | PRICE changed |
|---|---|---|---|
| `draftkings`     | 172 | **10.47 %** | 64.53 % |
| `betrivers`      |  89 |  8.99 %    | 79.78 % |
| `hardrockbet`    | 130 |  6.15 %    | 53.85 % |
| `williamhill_us` | 138 |  2.90 %    | 31.16 % |
| `fanduel`        | 148 |  **1.35 %** | 35.81 % |

Books differ by ~8× on point movement. **v2 uses one global policy** per R2; this table is retained here as the observation the owner has explicitly declined to implement, so that a future per-book policy can be considered on the same evidence rather than re-measured.

### 9.3 V1-4h optimized pipeline latency

Poll wall-clock **72 s** (versus v1-observation 299 s under sequential poll — 76 % reduction). Aggregate 71.6 s. Engine (dry-run) 256.4 s (263 grains). Total `t3 − t1 = 328 s`. `observed_at` spread across the sweep = 0 s (versus V1-4f's ~5 min).

**Implication for D-A1** (advisory, not binding on this document): under the OPTIMIZED sweep, batch-scoped `evaluation_reference_time` (§4.1 ¶2) can be captured at aggregator start; the population batch then classifies within a controlled envelope. Whether that envelope fits inside `T_AGING_MAX_SECONDS` depends on D-A1's choice.

### 9.4 Scope of this data — stated plainly

- One slate, one session, one day. Three WNBA events, ~14 hours pre-tipoff.
- Books' pregame behaviour ≠ their tipoff-adjacent behaviour. Movement generally accelerates closer to tipoff.
- N = 677 shared line pairs, N = 56 shared timestamp grains. 95 % CI on 40/677 = 5.91 % is roughly ±1.8 pp.
- Absolute values may shift under a different slate, session, or time-to-tipoff regime.

Owner ruling 2's "test 5/15/30 min as candidates" is a candidate list, not an approved value. D-A1 chooses.

## 10. Coexistence with v1 — the invariant V1-A2-1 fixtures prove

For any grain `(internal_game_id, internal_player_id, market_key)`:
- A v1 evidence_profile row (byte-identical to what v1 wrote) may coexist with a v2 evidence_profile row for the same grain — the version-aware UNIQUE `(internal_game_id, internal_player_id, market_key, method_version, computation_version)` handles this.
- The v1 row's `evaluation_reference_time` and `profile_generated_at` remain NULL. The v2 row's are NON-NULL.
- A reader dispatches on `method_version`; a v1 reader must not infer v2 timing semantics from a v1 row.
- V1-A2-1's reachability fixtures prove this invariant end-to-end on local Docker (see V1_TICKET_A2_1_REPORT.md §Coexistence proof).

## 11. Vocabulary confirmation (owner: "The vocabulary already has what R5 needs — confirm it")

Grep of `supabase/migrations/20260714000000_evidence_enums.sql` at HEAD `d834e6be...`:
- `evidence_quality_cap_reason` enum includes `'stale_current_market'` (line 218 of that migration in v1.0 shape; grep-verified in V1_TICKET_A2_1_REPORT.md).
- `evidence_reason_code` enum includes both `'stale_current_market'` and `'no_current_market'`.

**No new reason code is added by V2 authority or by V1-A2-1's migration. Confirmed sufficient.**

## 12. What V1-A2-2 (the implementation ticket) inherits from V1-A2-1

- This document, at v2.0, as the authoritative specification.
- The two new nullable timestamp columns on `evidence_profiles` (added by V1-A2-1's migration).
- The CHECK constraint enforcing the v1-null / v2-non-null structural rule.
- The reachability fixtures (test-only) proving branches are reachable and coexistence holds.
- The confirmed vocabulary at v1.3 (no new codes needed).
- The calibration research in §9 as input to D-A1.

**V1-A2-2 obligations recorded here so they are not lost:**
1. Implement the v2 classifier as a pure function of `(line_age, book_count, T_FRESH_MAX_SECONDS, T_AGING_MAX_SECONDS)` — after D-A1 locks the numbers.
2. Route the v2 writer around v1's composer-gate collapse of stale-present offerings (§3.4).
3. Capture `evaluation_reference_time` once at batch start; use it for every grain in the batch.
4. Populate `evaluation_reference_time` and `profile_generated_at` on every v2 row (CHECK-required).
5. Implement the D-24 regression fixtures.
6. Push the V1-A2-1 migration to hosted only as part of V1-A2-2 (V1-A2-1 is authority + local-schema only).

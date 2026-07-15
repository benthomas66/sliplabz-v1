# V1-A1-2 Ticket Report — Evidence Profile Schema

**Ticket:** V1-A1-2 (per amendment V1-A1 §31 + merged sequence GD-12)
**Status:** implementation complete; halted for governor review; nothing staged, nothing committed.
**Prepared:** 2026-07-15
**Starting branch:** `main`
**Starting HEAD:** `5b5512dd010433cee93851ee76306a6e36185202` — `feat: read-model extensions for the evidence engine (V1-5x)`
**Package revision governing this ticket:** SlipLabz V1 Repo Spec Package v1.3 as amended by V1-A1 and V1-A2.
**Governance decisions in effect:** GD-1, GD-8 through GD-13, GD-14 through GD-17.

**Scope:** STORAGE ONLY for the locked authority `docs/product/EVIDENCE_PROFILE_METHOD_V1.md` (`evidence_method_v1`). No scoring, no engine, no profiles populated. Engine work is V1-A1-3.

---

## 1. Authorities read

1. `docs/product/EVIDENCE_PROFILE_METHOD_V1.md` (OWNER-APPROVED v1.0) in full — the sole method authority for every stored field, enum value, and constraint. Sections cited inline throughout §3 below.
2. `docs/architecture/V1_COMPUTATION_CONTRACT.md` — read model that supplies the engine's inputs (§1 metric ownership, §2 versioning, §5 backfilled labeling, §9 V1-5x extensions RME-1/2/3).
3. `docs/product/V1_GOVERNANCE_DECISIONS.md` v2.1 — GD-8 (no probabilities / EV / projections), GD-9 (four-market scope), GD-12 (merged sequence), GD-13 (Discover default), GD-15 (fixed taxonomy).
4. `docs/product/amendments/SLIPLABZ_V1_AMENDMENT_A1_INTEGRATED.md` §10 (classification taxonomy), §12 (method authority + stored profile fields), §13 (Discover requirements), §25 (data-model requirements — the schema authority), §26 (reason-code minimum set), §27 (testing requirements).
5. `docs/product/reports/V1_TICKET_4_REPORT.md` (§8 deviations — CHECK-widening lesson from `historical_line_results` provenance) and `docs/product/reports/V1_TICKET_5_REPORT.md` (§4 governor obligation #2 — version-aware UNIQUE recomputation-writer lesson).
6. `supabase/migrations/*.sql` (V1-1 through V1-4b + V1-5's additive `20260713000000_...` correction) — schema baseline the additive V1-A1-2 migrations extend.

---

## 2. Files touched — this list EQUALS the ownership manifest subset actually written

**New (untracked):**

- `supabase/migrations/20260714000000_evidence_enums.sql`
- `supabase/migrations/20260714000001_evidence_profiles.sql`
- `supabase/migrations/20260714000002_evidence_profile_reasons.sql`
- `src/evidence/schema.ts`
- `tests/evidence/schema.test.ts`
- `tests/integration/v1_a1_2_evidenceSchema.integration.test.ts`
- `docs/product/reports/V1_TICKET_A1_2_REPORT.md` (this file)

**Modified (additive only):**

- `src/shared/enums.ts` — appended V1-A1-2 string-literal unions mirroring the new SQL enums.
- `tests/migrations/schemaShape.test.ts` — appended 18 V1-A1-2 static-lint invariants.

**Not modified** — nothing outside the manifest. Confirmed via `git status --short` before and after the run; the only files listed are the ones above, plus Agent A's untracked `scripts/v1_4c_stats_backfill.ts` (their scope, unchanged by me) and the two prior-task untracked files `docs/product/reports/V1_DR14_DR27_CALIBRATION.md` and `scripts/v1_a1_1_dr14_dr27_calibration.ts` (belong to neither of us — untouched).

**Not staged, not committed, not pushed.** Confirmed by `git status --short` — every V1-A1-2 file appears as either `??` (untracked new) or ` M` (modified but unstaged). See §7 for the closing status.

---

## 3. Field-by-field mapping — every stored column traced to its authority section

### `evidence_profiles`

| Column | Type | NULL policy | Authority section |
|---|---|---|---|
| `evidence_profile_id` | `uuid PK` | NOT NULL | A1 §25 "profile ID" |
| `internal_game_id` | `uuid FK games` | NOT NULL | A1 §25 "game ID" |
| `internal_player_id` | `uuid FK players` | NOT NULL | A1 §25 "player ID" |
| `market_key` | `text FK market_registry` | NOT NULL | A1 §25 "market" |
| `evaluated_line` | `numeric(10,2)` | Nullable — only when `classification='unavailable'` (CHECK) | A1 §25 "evaluated line"; method §A.1 "evaluated line as threshold" |
| `evaluated_source_kind` | `evidence_evaluated_source_kind` | Nullable — same pairing | A1 §25 "evaluated source type" |
| `evaluated_source_identifier` | `text` | Nullable | A1 §25 "evaluated ... identifier" |
| `classification` | `evidence_classification` | NOT NULL | Method §D.1 + GD-15 (fixed A1 §10 seven-value taxonomy) |
| `direction` | `evidence_direction` | Nullable — pairing enforced by CHECK | Method §B.7 |
| `composite_score` | `numeric(12,10)` | Nullable | Method §B.6 + DR-20 (full precision, ranking uses stored value) |
| `c_rtp` | `numeric(12,10)` | Nullable | Method §B.2 Recent Threshold Performance |
| `c_ms` | `numeric(12,10)` | Nullable | Method §B.3 Margin Support |
| `c_wa` | `numeric(12,10)` | Nullable | Method §B.4 Window Agreement |
| `c_ma` | `numeric(12,10)` | Nullable | Method §B.5 Market Alignment |
| `quality_capped` | `boolean` | NOT NULL | Method §D.1 step 5 "boolean quality_capped: true \| false" |
| `quality_cap_reason` | `evidence_quality_cap_reason` | NOT NULL | Method §C.2 / §C.3 / §C.5 / §C.6 / §C.7 — WHICH cap bound |
| `includes_backfilled_historical` | `boolean` | NOT NULL | Method §A.5 + DR-23 (a) |
| `method_version` | `text` | NOT NULL | Method §H + DR-24 |
| `computation_version` | `integer` | NOT NULL, ≥1 | V1-5 pattern per `V1_COMPUTATION_CONTRACT.md §2` |
| `reference_date` | `date` | NOT NULL | Windows are date-relative — §B.2 uses "L10 primary recent" evaluated against a reference date; mirrors `real_line_windows.reference_date` |
| `source_read_model_computation_version` | `integer` | NOT NULL, ≥1 | Method §H "historical_line_results at the referenced computation_version" |
| `current_market_row_id` | `uuid FK current_market_rows` | Nullable | Method §H "CurrentMarketRow" reference; NULL when §C.3 no market / §C.8 postponed / §C.9 unresolved |
| `bdl_availability_snapshot_id` | `uuid FK bdl_availability_snapshots` | Nullable | Method §H "bdl_availability_current_state at the referenced bdl_availability_snapshot_id" |
| `book_detail_one_sided` | `evidence_one_sided_state` | Nullable | Method §A.4 RME-3 + `V1_COMPUTATION_CONTRACT.md §9` (RME-3 rules) |
| `computed_at` / `created_at` / `updated_at` | `timestamptz DEFAULT now()` | NOT NULL | A1 §25 "calculation timestamp" |

### `evidence_profile_reasons`

| Column | Type | NULL policy | Authority section |
|---|---|---|---|
| `evidence_profile_reason_id` | `uuid PK` | NOT NULL | surrogate |
| `evidence_profile_id` | `uuid FK evidence_profiles ON DELETE CASCADE` | NOT NULL | A1 §25 "inclusion status, exclusion reason codes" |
| `reason_code` | `evidence_reason_code` | NOT NULL | Method §E.1 closed vocabulary |
| `category` | `evidence_reason_category` | NOT NULL | Method §E.2 + DR-26 |
| `intra_category_rank` | `integer` | NOT NULL, ≥1 | DR-26 tie-broken order within category |
| `contribution_magnitude` | `numeric(12,10)` | Nullable, clamped [-1, +1] when non-null | Method §E.1 "Trigger" magnitude concepts; NULL for boolean-fact reasons |
| `created_at` | `timestamptz DEFAULT now()` | NOT NULL | audit |

---

## 4. Enum values verbatim + citation

### `evidence_classification` (7 values, GD-15 locked)

```
'strong_over_evidence', 'moderate_over_evidence', 'mixed_evidence',
'moderate_under_evidence', 'strong_under_evidence',
'insufficient_evidence', 'unavailable'
```
**Citation:** EVIDENCE_PROFILE_METHOD_V1.md §D.1 + A1 §10 "Strong Over Evidence; Moderate Over Evidence; Mixed Evidence; Moderate Under Evidence; Strong Under Evidence; Insufficient Evidence; Unavailable."

### `evidence_direction`

```
'over', 'under'
```
**Citation:** Method §B.7 "Over-signed score."

### `evidence_evaluated_source_kind`

```
'sportsbook_consensus', 'sportsbook_specific', 'pickem', 'user_entered'
```
**Citation:** A1 §25 "evaluated source type and identifier"; sportsbook_consensus per §A.3; sportsbook_specific + pickem per §13.3 Notable Line Discrepancies; user_entered per §17 Compare Your Line.

### `evidence_quality_cap_reason`

```
'none', 'insufficient_book_coverage', 'stale_current_market',
'market_disagrees_with_history', 'push_heavy_sample', 'one_sided_offering'
```
**Citation (each value → cap condition):**
- `insufficient_book_coverage` → §C.2 (DR-10: eligible_book_count < 3)
- `stale_current_market` → §C.3 four-way disambiguation
- `market_disagrees_with_history` → §C.5 T2 (sign(C_MA) ≠ sign(C_RTP) with both magnitudes ≥ 0.30)
- `push_heavy_sample` → §C.6 (DR-9: L10 pushes > 30%)
- `one_sided_offering` → §C.7 (RME-3 one_sided ∈ over_only / under_only)
- `none` → classification reached without any §C cap firing (§D.3)

Insufficient (§C.1) and Unavailable (§C.3 no market / §C.8 / §C.9) are CLASSIFICATIONS themselves — not cap-reason values — and are represented via `classification`.

### `evidence_one_sided_state`

```
'over_only', 'under_only', 'neither'
```
**Citation:** §A.4 RME-3 exact enum ("'over_only' | 'under_only' | 'neither' | null"). The stored column is nullable to admit the fourth `null` case per RME-3's derivation rule ("offering set empty or every price null").

### `evidence_reason_code` (21 values — closed vocabulary)

```
'window_agreement_support', 'favorable_consensus_difference', 'positive_margin_support',
'unfavorable_consensus_difference', 'negative_margin_support', 'margin_measures_disagree',
'market_disagrees_with_history', 'windows_disagree',
'stale_current_market', 'insufficient_book_coverage', 'push_heavy_sample',
'one_sided_offering', 'source_unavailable',
'insufficient_l10_sample', 'incomplete_historical_coverage',
'unresolved_player_mapping', 'unresolved_event_mapping', 'no_current_market',
'postponed_game', 'canceled_game',
'abnormal_dispersion'  -- RESERVED — NOT EMITTED IN evidence_method_v1
```
**Citation:** EVIDENCE_PROFILE_METHOD_V1.md §E.1 table (row-by-row) + T2 addition (`MARKET_DISAGREES_WITH_HISTORY`) + T3 replacement (`WINDOW_AGREEMENT_SUPPORT`) + E.4 addition (`MARGIN_MEASURES_DISAGREE`) + DR-27 / §I.3 reservation (`ABNORMAL_DISPERSION`).

**ABNORMAL_DISPERSION reservation:** documented in the `20260714000000_evidence_enums.sql` migration header AND at the enum-declaration COMMENT ("RESERVED — NOT EMITTED IN `evidence_method_v1`"). It appears in the enum because §E.1 requires the closed vocabulary; it MUST NOT be written by a `v1` writer per DR-27 halt condition. TypeScript reinforces this: `EVIDENCE_RESERVED_REASON_CODES` set contains `abnormal_dispersion`, and the unit test asserts membership so the writer (V1-A1-3) can refuse to emit it at test time. Activation later requires a DR-24 method-version bump AND regression fixtures per A1 §12 (per §I.3 clause 4).

### `evidence_reason_category`

```
'support', 'contradiction', 'quality'
```
**Citation:** DR-26 canonical stored order — "(1) primary supporting evidence, (2) contradicting evidence, (3) quality/coverage limitations."

---

## 5. Grain decision — RESOLVED by governor ruling 2026-07-15

The evidence method is threshold-relative (§A.1: "one invocation per window, all against the evaluated line as threshold"). The authority does not explicitly settle whether `evaluated_line` is part of the row's UNIQUE grain key. The ticket shipped Option A; the governor has now ruled on it.

**Option A shipped:** UNIQUE `(internal_game_id, internal_player_id, market_key, method_version, computation_version)`. `evaluated_line` and `evaluated_source_kind` are STORED as ordinary columns per A1 §25 requirement, but are NOT part of the UNIQUE key. One canonical persisted profile per (game, player, market) per version.

**Rationale for the chosen option:**
- A1 §25 lists `evaluated line` as STORED, not as GRAIN KEY.
- Matches V1-5's version-bump-on-recompute pattern (see `V1_COMPUTATION_CONTRACT.md §2` and V1-5's `20260713000000_...` correction).
- §D.4 rule 4 authorizes Research-View re-evaluation "deterministically re-evaluate[d]" at a different line — reads as on-demand recomputation, not a per-line stored variant.
- §17 Compare Your Line results are saved into the Research List (V1-A1-8A), not into a new evidence_profiles row per user-entered threshold.

> **[GOVERNOR RULING — RESOLVED 2026-07-15]** The canonical persisted profile is evaluated at `sportsbook_consensus`. The other three `evidence_evaluated_source_kind` values — `sportsbook_specific`, `pickem`, and `user_entered` — are computed **on demand** by V1-A1-3 from the read model and are **NOT persisted** at `evidence_method_v1`. The grain `(internal_game_id, internal_player_id, market_key, method_version, computation_version)` is **APPROVED AS SHIPPED**. **No CHECK constrains `evaluated_source_kind` — deliberately** — so the additive path to per-line variants (widening the UNIQUE with `evaluated_source_kind` and `evaluated_line`) remains open under DR-24 without a schema-shape change forcing a wider retrofit later.

The chosen option is documented prominently in the `20260714000001_evidence_profiles.sql` migration header ("Grain question — mandatory disclosure") together with the ruling verbatim. The `schemaShape.test.ts` "grain-question decision is documented prominently" assertion enforces the header's presence.

---

## 6. Every CHECK — with admitted-states justification

### `evidence_profiles`

**CHECK `evidence_profiles_evaluated_line_availability_check`**
```sql
classification = 'unavailable'
OR (evaluated_line IS NOT NULL AND evaluated_source_kind IS NOT NULL)
```
**Admitted states:**
- Any Unavailable row — MAY or MAY NOT have an evaluated line (§C.3 no market / §C.8 postponed/canceled / §C.9 unresolved mapping — each of these can legitimately arise without a usable evaluated line).
- Any non-Unavailable row — MUST have both `evaluated_line` and `evaluated_source_kind` (the row was scored against a specific line from a specific source kind).

**Nothing legitimate excluded:** Insufficient (§C.1) profiles fire only after the read model produced a `(line, sample)` pair, so they always have an evaluated_line; classified profiles (Strong / Moderate / Mixed) trivially have both.

**CHECK `evidence_profiles_classification_direction_check`**
```sql
(classification IN ('strong_over_evidence','moderate_over_evidence') AND direction='over')
OR (classification IN ('strong_under_evidence','moderate_under_evidence') AND direction='under')
OR (classification IN ('mixed_evidence','insufficient_evidence','unavailable') AND direction IS NULL)
```
**Admitted states:** every A1 §10 classification with its legitimate direction — 5 classified + 3 directionless. **Nothing legitimate excluded:** §B.7 explicitly makes direction null for `|score| < DR-5`; §D.1 makes direction null for Insufficient/Unavailable; no legitimate profile combines a directional label with NULL direction or vice versa.

**CHECK `evidence_profiles_score_clamp_check`**
Each of `composite_score`, `c_rtp`, `c_ms`, `c_wa`, `c_ma` is either NULL or ∈ [−1, +1]. **Admitted states:** NULL ("not computed") plus any clamped value. **Nothing legitimate excluded:** §B.6 clamps composite to [−1, +1]; §B.2/§B.3/§B.4/§B.5 each clamp their own component.

**CHECK `evidence_profiles_quality_cap_pairing_check`**
```sql
(quality_capped=false AND quality_cap_reason='none')
OR (quality_capped=true AND quality_cap_reason<>'none')
```
**Admitted states:** exactly six combinations — `(false,'none')` plus `(true, X)` for each of the five §C cap-condition values. **Nothing legitimate excluded:** §D.3 "Quality cap ⇒ Moderate" implies a bound cap always has an identifiable §C condition.

**CHECK `evidence_profiles_computation_version_positive_check`** — `computation_version >= 1`. Admitted: any positive integer. Nothing legitimate excluded — V1-4 baseline shipped `computation_version = 1`, V1-4b Phase B wrote 2, V1-5 wrote 3.

**CHECK `evidence_profiles_source_read_model_positive_check`** — `source_read_model_computation_version >= 1`. Same rationale.

### `evidence_profile_reasons`

**CHECK `evidence_profile_reasons_rank_positive_check`** — `intra_category_rank >= 1`. Admitted: any positive integer. Nothing legitimate excluded (DR-26 ranks start at 1).

**CHECK `evidence_profile_reasons_contribution_range_check`** — `contribution_magnitude IS NULL OR ∈ [−1, +1]`. Admitted: NULL for boolean-fact reasons (§C.9 mapping), any clamped [−1, +1] for component-derived reasons. Nothing legitimate excluded — §B components clamp to [−1, +1] so a legitimate reason's contribution respects the same bound.

---

## 7. Documented future-writer conflict strategy

The writer itself is V1-A1-3. This schema documents the intended UPSERT shape in the `20260714000001_evidence_profiles.sql` migration header:

- **Same-version recompute** — the writer runs
  ```sql
  INSERT INTO evidence_profiles (...) VALUES (...)
  ON CONFLICT ON CONSTRAINT evidence_profiles_grain_version_unique
  DO UPDATE SET
    composite_score = EXCLUDED.composite_score,
    c_rtp = EXCLUDED.c_rtp, c_ms = EXCLUDED.c_ms,
    c_wa = EXCLUDED.c_wa, c_ma = EXCLUDED.c_ma,
    classification = EXCLUDED.classification,
    direction = EXCLUDED.direction,
    quality_capped = EXCLUDED.quality_capped,
    quality_cap_reason = EXCLUDED.quality_cap_reason,
    includes_backfilled_historical = EXCLUDED.includes_backfilled_historical,
    evaluated_line = EXCLUDED.evaluated_line,
    evaluated_source_kind = EXCLUDED.evaluated_source_kind,
    evaluated_source_identifier = EXCLUDED.evaluated_source_identifier,
    reference_date = EXCLUDED.reference_date,
    source_read_model_computation_version = EXCLUDED.source_read_model_computation_version,
    current_market_row_id = EXCLUDED.current_market_row_id,
    bdl_availability_snapshot_id = EXCLUDED.bdl_availability_snapshot_id,
    book_detail_one_sided = EXCLUDED.book_detail_one_sided,
    computed_at = EXCLUDED.computed_at,
    updated_at = now()
  WHERE evidence_profiles.method_version = EXCLUDED.method_version
    AND evidence_profiles.computation_version = EXCLUDED.computation_version;
  ```
  The IMMUTABLE columns (`internal_game_id`, `internal_player_id`, `market_key`, `method_version`, `computation_version`, `evidence_profile_id`, `created_at`) MUST NOT appear in `DO UPDATE SET`. The WHERE clause is defense-in-depth against future misuse: even if a caller mistakenly attempts to UPSERT a different-version row, the update never touches a row at a different version.
- **Version bump** — a `method_version` bump (DR-24, e.g. `evidence_method_v1 → evidence_method_v2`) OR a `computation_version` bump inserts a NEW row against a different UNIQUE key. The `ON CONFLICT` clause never fires, and the prior-version row remains IMMUTABLE per §H reproducibility.
- **The V1-5 anti-pattern** — a version-blind UNIQUE with `ON CONFLICT DO NOTHING` — is forbidden by construction: the UNIQUE constraint here explicitly includes `method_version` and `computation_version`. V1-5's `recomputationWriter` shipped that anti-pattern against `historical_line_results` and had to be corrected by migration `20260713000000_...`; this schema does not repeat it.

`evidence_profile_reasons`: on same-version UPSERT, the recommended pattern is `DELETE FROM evidence_profile_reasons WHERE evidence_profile_id = $1; INSERT INTO evidence_profile_reasons ...` inside the same transaction — the reasons set is entirely derived from the profile's inputs at (method_version, computation_version), the writer holds the profile row's transaction lock, and the FK ON DELETE CASCADE + UNIQUE (profile, reason_code) prevent orphan rows and duplicate emissions.

---

## 8. Live migration validation (Docker `postgres:16`)

**Container:** `sliplabz-a1-2-postgres`, image `postgres:16`, started fresh with `--rm`, host port `55442 → 5432`. Isolated from Agent A's containers.

**Two clean applications** — databases `sliplabz_a1_2_val_a` and `sliplabz_a1_2_val_b`, each got all 48 migrations (12 V1-1 + 12 V1-2 + 10 V1-3 + 10 V1-4 + 3 V1-4b + 1 V1-5 correction + 3 V1-A1-2) applied in filename order with `-v ON_ERROR_STOP=1`. **Zero errors, zero warnings.**

**Schema equality** — `pg_dump --schema-only --no-owner --no-privileges` on both, after stripping pg_dump's random `\restrict`/`\unrestrict` session tokens: **byte-identical**, both SHA-256 `984783722daf81c313aa9527a96fad74ccbe6768b8bc4f74f6ea53fcfb9c912a`, 5,427-line normalized dump. Total public tables: **47** (45 from V1-1 through V1-5 correction + 2 new: `evidence_profiles`, `evidence_profile_reasons`). New enums declared: `evidence_classification`, `evidence_direction`, `evidence_evaluated_source_kind`, `evidence_quality_cap_reason`, `evidence_one_sided_state`, `evidence_reason_code`, `evidence_reason_category`.

**Constraint probes** — every new CHECK and UNIQUE gets a live probe. The probes live in `tests/integration/v1_a1_2_evidenceSchema.integration.test.ts` and run against `sliplabz_a1_2_integration` (a third database on the same container).

| # | Probe | Rejects | Result |
|---:|---|---|---|
| P-CLASS-DIR-1 | Strong Over + direction=under | `evidence_profiles_classification_direction_check` | pass |
| P-CLASS-DIR-2 | Mixed + direction=over | same CHECK | pass |
| P-CLASS-DIR-3 | Insufficient + non-NULL direction | same CHECK | pass |
| P-CLASS-DIR-4 | Unavailable + NULL direction | ACCEPTED (positive path) | pass |
| P-EVAL-LINE-1 | Non-Unavailable + NULL evaluated_line | `evidence_profiles_evaluated_line_availability_check` | pass |
| P-EVAL-LINE-2 | Unavailable + NULL evaluated_line + NULL source_kind | ACCEPTED (§C.9 case) | pass |
| P-SCORE-CLAMP-1 | composite_score = 1.5 | `evidence_profiles_score_clamp_check` | pass |
| P-SCORE-CLAMP-2 | c_wa = −1.0001 | same CHECK | pass |
| P-CAP-1 | quality_capped=true + cap_reason='none' | `evidence_profiles_quality_cap_pairing_check` | pass |
| P-CAP-2 | quality_capped=false + cap_reason='stale_current_market' | same CHECK | pass |
| P-CAP-3 | quality_capped=true + cap_reason='one_sided_offering' | ACCEPTED (§C.7 case) | pass |
| P-CVER | computation_version = 0 | `evidence_profiles_computation_version_positive_check` | pass |
| P-SRMVER | source_read_model_computation_version = 0 | `evidence_profiles_source_read_model_positive_check` | pass |
| **P-UNIQ-VERSION** | **two rows at the same grain with DIFFERENT computation_versions COEXIST** | ACCEPTED (2 rows) | **pass** |
| **P-UNIQ-VERSION-2** | **two rows at the same grain with DIFFERENT method_versions COEXIST** | ACCEPTED (2 rows) | **pass** |
| **P-UNIQ-DUP** | **same-version duplicate at the same grain** | `evidence_profiles_grain_version_unique` | **pass** |
| P-REASON-1 | Legitimate reason INSERT | ACCEPTED (positive path) | pass |
| P-REASON-DUP | Same reason_code twice on same profile | `evidence_profile_reasons_profile_reason_unique` | pass |
| P-REASON-RANK-DUP | Two reasons at same (category, rank) | `evidence_profile_reasons_profile_category_rank_unique` | pass |
| P-REASON-RANK-ZERO | intra_category_rank = 0 | `evidence_profile_reasons_rank_positive_check` | pass |
| P-REASON-MAG-OOB | contribution_magnitude = 1.5 | `evidence_profile_reasons_contribution_range_check` | pass |
| P-REASON-CASCADE | Delete profile CASCADEs reasons | ACCEPTED (0 orphan rows) | pass |

**P-UNIQ-VERSION + P-UNIQ-VERSION-2 + P-UNIQ-DUP** are the mandated version-coexistence + same-version-duplicate probes. Together they prove the schema encodes the V1-5 recomputation-writer lesson correctly: prior versions coexist alongside new versions; a same-version duplicate is rejected.

---

## 9. Test evidence

**Typecheck:**
```
$ npm run typecheck
> tsc --noEmit
(exit 0, no diagnostics)
```

**Migration lint suite (which suites I ran + why):** `npm run test:migrations` — full lint of every migration's shape invariants (69 tests, +18 V1-A1-2, ALL PASS). Ran on top of the full suite too.

**Full unit suite** — `npm test` — worktree quiet across Agent A's files at the time (verified via `git status --short` immediately before the run; only Agent A's `scripts/v1_4c_stats_backfill.ts` was untracked and my suite does not compile it). Result:
```
ℹ tests 519
ℹ suites 86
ℹ pass 453
ℹ fail 0
ℹ cancelled 0
ℹ skipped 66  (integration tests — no SLIPLABZ_DATABASE_URL in this run)
```
Growth: +34 unit tests over V1-5's 419 baseline (10 new evidence enum tests + 18 new schemaShape lint tests + prior deltas).

**Full integration suite** — `SLIPLABZ_DATABASE_URL=... npm run test:integration` against `sliplabz_a1_2_integration`:
```
ℹ tests 66
ℹ suites 13
ℹ pass 66
ℹ fail 0
```
Growth: +27 V1-A1-2 constraint probes over V1-5 (24) + V1-5x (15) baseline.

**No failure attributable to Agent A's session** was observed. Every failing assertion in this run was a probe I intentionally attempted against my own new CHECK/UNIQUE — those were then corrected in the test to prove positive+negative paths and now pass. No off-manifest file was modified.

---

## 10. Confirmation of ownership discipline

- Files modified are EXACTLY those inside the ownership manifest for this ticket: `supabase/migrations/20260714*.sql` (three new), `src/evidence/**` (one new file), `tests/evidence/**` (one new file), `tests/integration/v1_a1_2_*.ts` (one new file), `src/shared/enums.ts` (modified), `tests/migrations/schemaShape.test.ts` (modified), `docs/product/reports/V1_TICKET_A1_2_REPORT.md` (this file).
- No file outside the manifest was created, modified, moved, staged, or deleted. Verified by `git status --short`.
- Nothing staged, nothing committed, nothing pushed.
- Local Postgres `sliplabz-a1-2-postgres` on port `55442` is the only database this ticket wrote to. **Hosted Supabase was never touched**; `supabase db push` was never invoked; `supabase link` was never invoked.
- The two prior-task untracked files (`docs/product/reports/V1_DR14_DR27_CALIBRATION.md` and `scripts/v1_a1_1_dr14_dr27_calibration.ts`) remain untouched.
- Agent A's `scripts/v1_4c_stats_backfill.ts` remains untouched.

---

## 11. Deviations

None. Every migration is additive, every enum value ties one-to-one to a §E.1 / §D.1 / §C row, and the version-aware UNIQUE + documented UPSERT strategy match the V1-5 recomputation-writer lesson.

## 12. Assumptions (classified)

| # | Assumption | Class | Note |
|---:|---|---|---|
| 1 | The canonical persisted profile is evaluated at `sportsbook_consensus`. `sportsbook_specific`, `pickem`, and `user_entered` evaluations are computed on-demand by V1-A1-3 from the read model and are NOT persisted as additional evidence_profiles rows at `evidence_method_v1`. | **RESOLVED — governor ruling 2026-07-15** | See §5. The additive DR-24 path (widen the UNIQUE with `evaluated_source_kind` + `evaluated_line`) remains open — no CHECK constrains `evaluated_source_kind`. |
| 2 | The `contribution_magnitude` column on `evidence_profile_reasons` is optional and may be NULL for boolean-fact reasons (e.g. §C.9 mapping). Component-derived reasons store their signed contribution in [−1, +1]. | Ordinary storage-side ergonomics | The writer decides per-reason. Not a semantic commitment. |
| 3 | `book_detail_one_sided` is snapshotted onto the profile row so a consumer does not have to recompose the CurrentMarketRow just to learn which one_sided classification applied at write time. Reproducibility per §H is still walk-back via `current_market_row_id`. | Small optimization; not authoritative | The RME-3 field is derived on-demand elsewhere in the read model; this stored snapshot is a convenience anchor. |
| 4 | `reference_date` on the profile row is the UTC calendar day the windows were computed against, matching `real_line_windows.reference_date`. Consumers reproduce windows by joining on `(internal_player_id, market_key, reference_date, window_type, source_read_model_computation_version)`. | Reproducibility anchor | Not stored as a separate `evidence_profile_source_refs` table — arrays of IDs also not stored, per the "store only what the authority requires" rubric. If a future auditor needs stronger anchoring (e.g. explicit historical_line_result_ids array), an additive migration can extend the row. |

## 13. Halt condition per §I.3

Confirmed: no scoring, no classification logic, no reason-code emission, no engine code, no evidence-profile row populated. `ABNORMAL_DISPERSION` is present in the closed vocabulary per §E.1's requirement AND explicitly marked RESERVED in the migration COMMENT AND enforced against writer emission via `EVIDENCE_RESERVED_REASON_CODES` in `src/shared/enums.ts`. No `K` was chosen; no dispersion column was added; no dispersion threshold was invented. DR-27 halt condition is respected.

---

`git status --short` (immediately before this report's closing halt):

```
 M src/shared/enums.ts
 M tests/migrations/schemaShape.test.ts
?? docs/product/reports/V1_DR14_DR27_CALIBRATION.md          (prior task, untouched)
?? docs/product/reports/V1_TICKET_A1_2_REPORT.md             (this file, new)
?? scripts/v1_4c_stats_backfill.ts                           (Agent A, untouched)
?? scripts/v1_a1_1_dr14_dr27_calibration.ts                  (prior task, untouched)
?? src/evidence/                                              (new)
?? supabase/migrations/20260714000000_evidence_enums.sql      (new)
?? supabase/migrations/20260714000001_evidence_profiles.sql   (new)
?? supabase/migrations/20260714000002_evidence_profile_reasons.sql  (new)
?? tests/evidence/                                            (new)
?? tests/integration/v1_a1_2_evidenceSchema.integration.test.ts     (new)
```

Nothing staged, nothing committed, nothing pushed.

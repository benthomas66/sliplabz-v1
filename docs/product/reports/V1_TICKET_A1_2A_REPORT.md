# V1-A1-2a Ticket Report — Tied-Consensus Reason Code

**Ticket:** V1-A1-2a (governor-created micro-ticket; precedent V1-5x). Applies owner ruling of 2026-07-15.
**Kind:** additive schema migration + authority document update (v1.1 → v1.2) + additive tests. NO engine work. NO existing reason's meaning, trigger, effect, or translation changed. NO formula, constant, threshold, weight, worked example, or surface rule changed.
**Starting HEAD:** `44da8ce19704ea5e6fbbd72ac54785f56592d9df` — `docs: record DR-14 validation and DR-27 deferral ruling in evidence method authority (v1.1)` (with `cb79211` V1-4c Phase B and `e6a4a31` V1-A1-2 in history).
**Authority SHA-256 pre-edit:** `31d8d41eb08f3d3c1bca97c8245bdab703343d30931132d78c3d4c15c0ca6e00` (matches the ticket's expected pre-edit hash).

---

## 1. Owner ruling applied (verbatim in substance)

The closed reason vocabulary gains one new value — **`NO_UNIQUE_CONSENSUS_LINE`** (Exclusion → Unavailable) — closing an implementation-blocking omission discovered before any Evidence Profile has ever been computed. Trigger: `line_consensus.selection_method = 'tied_no_unique_mode'` AND `line_consensus.consensus_point IS NULL` AND `eligible_book_count.count > 0` (all three required). Effect: force Unavailable; PRIMARY reason attached; `evaluated_line` remains null; no canonical directional profile persisted or evaluated at any tied sportsbook point; the read model's `tied_no_unique_mode` value AND the underlying point distribution are preserved for audit / Research View display. NO tiebreak: engine MUST NOT choose lower / upper / average / first-observed / single-book fallback. User-facing translation, verbatim: *"Eligible sportsbooks are evenly split on this line, so no single consensus line can be established."* Negative scope: MUST NOT be used when there are zero eligible sportsbook offerings; when the market source is unavailable; when current-market freshness is `unavailable`; or when consensus is absent for any reason other than `tied_no_unique_mode` — those states remain governed by their existing reasons (including `NO_CURRENT_MARKET` where factually applicable).

DR-28 records the tied-consensus handling. DR-29 records the pre-first-profile method-correction exception (self-terminating: expires permanently at the moment the first `evidence_profiles` row is committed under `evidence_method_v1`).

**Document version advances v1.1 → v1.2. `method_version` REMAINS `evidence_method_v1`**, permitted only because zero `evidence_profiles` rows have been persisted under `evidence_method_v1` and the DR-29 exception is being exercised now. The DR-24 test IS triggered by v1.2's reason-code taxonomy addition; DR-29 supersedes it exactly once. The exception's automatic expiry is documented, and the V1-A1-3 ticket report will document the FIRST-PROFILE EVENT closing the exception (§I.3 of the authority names the required fields).

---

## 2. Files touched (exactly on-manifest — nothing outside scope)

**Authority (modified):**
- `docs/product/EVIDENCE_PROFILE_METHOD_V1.md` — header (v1.1 → v1.2 with the DR-29 basis inline), Decision Register (+ DR-28, + DR-29), new §C.3.1 tied-consensus subsection, §E.1 vocabulary row (+ `NO_UNIQUE_CONSENSUS_LINE`), §I.3 pre-first-profile exception + V1-A1-3 first-profile-event hand-off obligation, compliance checklist entry, closing paragraph.

**Additive migration (new):**
- `supabase/migrations/20260715000000_evidence_reason_code_add_no_unique_consensus_line.sql` — `ALTER TYPE evidence_reason_code ADD VALUE IF NOT EXISTS 'no_unique_consensus_line' BEFORE 'abnormal_dispersion';` + refreshed `COMMENT ON TYPE`. No CHECK / INSERT / UPDATE references the new value (PostgreSQL constraint honored).

**Tests (added / modified):**
- `tests/migrations/schemaShape.test.ts` (modified) — five new V1-A1-2a static-lint assertions: migration presence, lowercase per G1, `BEFORE 'abnormal_dispersion'` position per G2, original enum untouched with all 21 values in unchanged relative order (owner test 6), no CHECK/INSERT/UPDATE referencing the new value in the same tx, authority text carries the DR-28/DR-29/verbatim-translation/negative-scope wording.
- `tests/evidence/reasonVocabulary.test.ts` (new file — the reason-vocabulary test file per the ticket's "state its path") — reads BOTH migrations and asserts: original declares exactly the 21 pre-existing values in the expected order; additive adds exactly one new value `no_unique_consensus_line`; additive does not touch the CREATE TYPE stanza (no CREATE / DROP); union = 22 values, no removals, no duplicates; `abnormal_dispersion` still present AND still marked RESERVED via the ORIGINAL migration's COMMENT.
- `tests/computation/consensus.test.ts` (modified — G3 order-independence added because genuinely absent) — new `LOAD-BEARING (V1-A1-2a owner test 4): tied_no_unique_mode is INDEPENDENT of sportsbook input order — no first-observed/lower/upper tiebreak leaks`. See §5 below for the honest citation of what pre-existed.

**Report (new):**
- `docs/product/reports/V1_TICKET_A1_2A_REPORT.md` (this file).

**Not modified — deliberately, per scope:**
- `src/shared/enums.ts` — the `EVIDENCE_REASON_CODES` TypeScript mirror. See §6 intentional-divergence flag.
- Any other `src/` file (no engine work).
- Any prior migration.
- `docs/product/reports/V1_TICKET_A1_1_REPORT.md` (point-in-time artifact, stays historical).
- Any V1-4c file.

---

## 3. Governor rulings acknowledged and applied

### G1 — Enum case mapping (LOWERCASE literal / UPPERCASE prose)

The committed `evidence_reason_code` enum uses lowercase for all 21 pre-existing values. The authority's §E.1 prose uses uppercase for every reason code. The additive migration therefore writes the LOWERCASE literal `'no_unique_consensus_line'`; the authority's §E.1 row and DR-28 body use the UPPERCASE form `NO_UNIQUE_CONSENSUS_LINE`. This is explicitly stated in the migration header COMMENT. Assertion `V1-A1-2a: additive migration adds evidence_reason_code value no_unique_consensus_line (LOWERCASE per G1)` in `schemaShape.test.ts` verifies the lowercase literal and asserts the uppercase spelling does NOT appear as an enum literal.

### G2 — Enum position

**Chosen position:** `BEFORE 'abnormal_dispersion'`. Rationale: `abnormal_dispersion` is the RESERVED terminal value in the vocabulary; keeping it last preserves the semantic reading that the RESERVED code sits at the end of the ordered list. The `ADD VALUE ... BEFORE` form does NOT reorder or recreate any existing value.

**Enum_range probe against local Postgres (`sliplabz-v1-a1-2a-postgres`, port `55444`, image `postgres:16`, container run with `--rm`):**

BEFORE (after applying only the 20260714 originals):

```
{window_agreement_support,favorable_consensus_difference,positive_margin_support,unfavorable_consensus_difference,negative_margin_support,margin_measures_disagree,market_disagrees_with_history,windows_disagree,stale_current_market,insufficient_book_coverage,push_heavy_sample,one_sided_offering,source_unavailable,insufficient_l10_sample,incomplete_historical_coverage,unresolved_player_mapping,unresolved_event_mapping,no_current_market,postponed_game,canceled_game,abnormal_dispersion}
```
(21 values, `abnormal_dispersion` last.)

AFTER (applying `20260715000000_...` on top):

```
{window_agreement_support,favorable_consensus_difference,positive_margin_support,unfavorable_consensus_difference,negative_margin_support,margin_measures_disagree,market_disagrees_with_history,windows_disagree,stale_current_market,insufficient_book_coverage,push_heavy_sample,one_sided_offering,source_unavailable,insufficient_l10_sample,incomplete_historical_coverage,unresolved_player_mapping,unresolved_event_mapping,no_current_market,postponed_game,canceled_game,no_unique_consensus_line,abnormal_dispersion}
```
(22 values; new value inserted at position 21; `abnormal_dispersion` still last; every original value's relative order preserved.)

Proof of unchanged relative order: intersect(BEFORE, AFTER) = BEFORE (in identical order). Every pre-existing pair `(A, B)` in the original list still has `A` before `B` in the post list. No value was moved; no data was rewritten.

### G3 — Test split

**Added in THIS ticket (V1-A1-2a):**

1. **Migration probe (owner test 6):** the new enum value is admitted AND all 21 pre-existing values survive with unchanged relative order. Two assertions cover this — one in `schemaShape.test.ts` scanning the migration files, one in `reasonVocabulary.test.ts` computing the vocabulary union.
2. **Vocabulary test:** `evidence_reason_code` contains exactly the expected set (21 originals + `no_unique_consensus_line` = 22), with `abnormal_dispersion` still present AND still marked RESERVED. Full block in `tests/evidence/reasonVocabulary.test.ts`.
3. **Consensus order-independence (owner test 4):** added to `tests/computation/consensus.test.ts` because it was **genuinely absent**. See §5 for the citation of what pre-existed.

**Carried forward to V1-A1-3 (binding hand-off list; NOT implemented in this ticket):**

| Owner test | Behavior V1-A1-3 must implement + test |
|---|---|
| **1** | A 2-2 tied distribution produces `consensus_point = null`, `selection_method = tied_no_unique_mode`, classification = `unavailable`, PRIMARY reason = `no_unique_consensus_line`, `evaluated_line = null`. |
| **2** | A tied market WITH eligible books does NOT emit `no_current_market`. Reason: it emits `no_unique_consensus_line` per DR-28's positive scope. |
| **3** | A genuinely absent market STILL emits `no_current_market` and NEVER emits `no_unique_consensus_line`. Reason: DR-28's negative scope preserves the §C.3 disambiguation. |
| **5** | No lower-point, upper-point, average-point, first-observed, or single-book fallback is used to break a tie. Any observed fallback is a halt condition. |
| **7** | `abnormal_dispersion` is never emitted under `evidence_method_v1` (already carried by §I.3 clause 2; V1-A1-3 must add a forbidden-language / forbidden-emission fixture). |

### G4 — Decision Register

DR-28 (tied-consensus handling → Unavailable + `NO_UNIQUE_CONSENSUS_LINE`, no tiebreak) added.
DR-29 (pre-first-profile method-correction exception, self-terminating) added.
Both stamped `[OWNER APPROVED — 2026-07-15]`.

`grep -c "OWNER APPROVAL REQUIRED" docs/product/EVIDENCE_PROFILE_METHOD_V1.md` → **0** ✓

---

## 4. Diff / migration / test artifacts for governor review

### 4.1 Authority diff

**Path:** `/tmp/authority_v1_2.diff` (packaged for upload).
**Diff line count:** 125.
**Authority working-tree line count:** 899.
**Authority working-tree SHA-256:** `cd34e703bb02940ca33907f3bc9e44e9b68a411edef190c3082e51dfdefdf88c`.
**Committed baseline (HEAD) line count / SHA-256:** 845 / `31d8d41eb08f3d3c1bca97c8245bdab703343d30931132d78c3d4c15c0ca6e00`.

Delta: +54 lines (real added content — version-history entry, new §C.3.1 subsection, §E.1 row, DR-28 + DR-29 rows in the register, §I.3 exception block, closing-paragraph update).

### 4.2 Migration full text

The full migration is a single ALTER TYPE + refreshed COMMENT ON TYPE. See `supabase/migrations/20260715000000_evidence_reason_code_add_no_unique_consensus_line.sql`. Key statement:

```sql
ALTER TYPE evidence_reason_code
  ADD VALUE IF NOT EXISTS 'no_unique_consensus_line'
  BEFORE 'abnormal_dispersion';
```

The rest of the file is documentation (header COMMENT explaining the rationale, the DR-28 / DR-29 basis, G1 / G2 / G3 mapping, the PostgreSQL same-tx constraint) and the refreshed `COMMENT ON TYPE` reflecting the v1.2 vocabulary.

### 4.3 Test additions / changes

- `tests/migrations/schemaShape.test.ts`: 5 new `it(...)` blocks appended to the existing describe (see V1-A1-2a additions).
- `tests/evidence/reasonVocabulary.test.ts`: new file; 6 `it(...)` blocks covering the vocabulary union, additive-only guarantee, RESERVED-preservation of `abnormal_dispersion`, and the migration filename shape.
- `tests/computation/consensus.test.ts`: 1 new `it(...)` block appended immediately after the existing `LOAD-BEARING (ledger #7)` tied-mode test — six permutations of the same tied inputs, each asserting `tied_no_unique_mode` + `consensus_point = null`.

---

## 5. G3 pre-existing coverage citation — the honest what-existed-before record

Two adjacent tests already existed and are cited here to be transparent about why the new consensus test does not duplicate them:

- **`tests/computation/consensus.test.ts:54` — `LOAD-BEARING (ledger #7): cross-book grouping — 4 books tied 2-2 → tied_no_unique_mode (per-book impl would incorrectly write single_book at whichever book was first)`** — asserts that ONE specific fixed order of tied inputs produces `tied_no_unique_mode`. Does not permute the inputs. Does not test order-independence.
- **`tests/computation/readPath.test.ts:67` — `REQUIRED: deterministic under different Set iteration paths`** — reverses the offerings in the input and asserts deep-equality of the FULL composed `CurrentMarketRow` on a NON-tied baseline fixture (`baseInput()`). Guarantees general Set-iteration determinism at the composer level, but does NOT specifically exercise the tied-mode branch of `computeLineConsensus`.

Neither existing test proves that reordering inputs cannot leak a first-observed / lower-point / upper-point tiebreak into the tied branch. The new **`LOAD-BEARING (V1-A1-2a owner test 4)`** in `consensus.test.ts` fills that gap — six distinct permutations of the same 2-2 tied fixture, each independently asserted to produce `tied_no_unique_mode` with `consensus_point = null`. This is the minimal probe that would catch a hidden tiebreak.

---

## 6. Intentional TS-side divergence — flagged for the V1-A1-3 hand-off

`src/shared/enums.ts` is OUT OF SCOPE for this micro-ticket. Its `EVIDENCE_REASON_CODES` TypeScript mirror therefore continues to list 21 values (matching the ORIGINAL migration file that `tests/evidence/schema.test.ts` compares against — which passes). The DB now stores 22 values (the 22nd added by the additive migration).

This is a **temporary intentional divergence** for the pre-first-profile window. V1-A1-3 owns the TS-side vocabulary extension when it wires the emitter for `no_unique_consensus_line` — that ticket must (a) add `'no_unique_consensus_line'` to `EVIDENCE_REASON_CODES` in `src/shared/enums.ts`, and (b) update or restructure `tests/evidence/schema.test.ts` so the strict `deepStrictEqual(EVIDENCE_REASON_CODES, readSqlEnumLabels('evidence_reason_code'))` assertion knows about the additive migration (options include reading both migrations and computing the union, or moving the strict assertion into `reasonVocabulary.test.ts` which already does so).

Alternative considered and rejected: touching `src/shared/enums.ts` in THIS ticket. Rejected because the scope statement is explicit ("nothing else — owner-authorized scope"), and premature TS emission enablement risks V1-A1-3 quietly using the new value without going through DR-28's tied-consensus emission rules. The divergence is documented here so V1-A1-3 sees it immediately.

---

## 7. Evidence

### 7.1 Typecheck

```
$ npm run typecheck
> tsc --noEmit
(exit 0, no diagnostics)
```

### 7.2 Full unit suite

```
$ npm test
ℹ tests 541
ℹ suites 89
ℹ pass 470
ℹ fail 0
ℹ cancelled 0
ℹ skipped 71  (integration tests — no SLIPLABZ_DATABASE_URL for the unit run)
```

Growth: +12 unit tests over V1-4c Phase B's baseline of 529 (5 new schemaShape probes + 6 new reason-vocabulary probes + 1 new consensus tied-order-independence probe).

### 7.3 Full integration suite

```
$ SLIPLABZ_DATABASE_URL=… npm run test:integration
ℹ tests 71
ℹ suites 14
ℹ pass 71
ℹ fail 0
ℹ skipped 0
```

Same count as V1-4c Phase B — this ticket adds no new integration test files (the migration is covered by static lint + the enum_range probe + a manual functional probe against the local DB).

### 7.4 Live migration validation (Docker `postgres:16`)

**Container:** `sliplabz-v1-a1-2a-postgres`, image `postgres:16`, isolated from Agent B / prior containers. Host port `55444` → container `5432`. Started `--rm` and stopped after validation.

**Two clean applications:** databases `sliplabz_a1_2a_val_a` and `sliplabz_a1_2a_val_b`, each got all 52 migrations (12 V1-1 + 12 V1-2 + 10 V1-3 + 10 V1-4 + 3 V1-4b + 1 V1-5 correction + 3 V1-A1-2 + 1 V1-A1-2a) applied in filename order with `-v ON_ERROR_STOP=1`. **Zero errors, zero warnings.**

**Normalized dump-hash equality:** `pg_dump --schema-only --no-owner --no-privileges` on both, after stripping pg_dump's random `\restrict`/`\unrestrict` session tokens — **byte-identical**, both SHA-256 `b4e87c86017801daedfb5107a3c47136fb8200da6c640408ea098952d8212aa8`, 5,428-line normalized dump. (The V1-A1-2 baseline was 5,427 lines; the additive migration added 1 line to the `CREATE TYPE` decl in the pg_dump output.)

**Enum_range before/after probe:** results shown in §3 G2 above. `pg_enum` ordinal positions: 21 unchanged pre-existing values in their original positions; `no_unique_consensus_line` inserted at position 21 (0-indexed 20); `abnormal_dispersion` moves down by one ordinal to position 22 (0-indexed 21) but its RELATIVE order to every other value is unchanged (it is still after every original value).

**G3 functional probe against the local DB:** an `evidence_profiles` row with `classification = 'unavailable'` + `direction = NULL` + `evaluated_line = NULL` + `evaluated_source_kind = NULL` was INSERTed (matching the CHECK admitted-states for the Unavailable + tied case), and an `evidence_profile_reasons` row was INSERTed with `reason_code = 'no_unique_consensus_line'`, `category = 'quality'`, `intra_category_rank = 1`. Both INSERTs succeeded. Subsequent SELECT returned the row verbatim — the new enum value is queryable, storable, and comparable end-to-end. This probe RAN in a fresh session (not the ADD VALUE transaction), respecting the PostgreSQL constraint that a new enum value cannot be used in the same tx that added it.

---

## 8. Confirmations for the governor's checklist

- ✅ No existing reason's meaning, trigger, effect, or translation changed.
- ✅ No formula, constant, threshold, weight, worked-example value, or surface rule changed.
- ✅ No existing value's relative order in `evidence_reason_code` changed.
- ✅ Enum is not reordered or recreated; no data is rewritten.
- ✅ `abnormal_dispersion` still present, still marked RESERVED, still non-emitted in `evidence_method_v1`.
- ✅ `method_version` unchanged at `evidence_method_v1`, permitted only by DR-29's self-terminating pre-first-profile exception.
- ✅ Document version advances v1.1 → v1.2 with the DR-29 basis stated inline in the version-history block.
- ✅ V1-A1-3 hand-off obligation (FIRST-PROFILE EVENT documentation) recorded in §I.3 where the engine agent will read it.
- ✅ Hosted database NOT touched (migration application is a post-commit governor step).
- ✅ Nothing staged, nothing committed, nothing pushed.

**Final `git status --short`:**

```
 M docs/product/EVIDENCE_PROFILE_METHOD_V1.md
 M tests/computation/consensus.test.ts
 M tests/migrations/schemaShape.test.ts
?? supabase/migrations/20260715000000_evidence_reason_code_add_no_unique_consensus_line.sql
?? tests/evidence/reasonVocabulary.test.ts
?? docs/product/reports/V1_TICKET_A1_2A_REPORT.md
```

Five files match the ownership manifest exactly. This report file appears as `??` (new, untracked). Nothing outside the manifest was modified.

---

HALTED after V1-A1-2a. Nothing committed. Awaiting governor diff review. V1-A1-3 has not begun.

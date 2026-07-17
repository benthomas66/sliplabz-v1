# V1-4e Freshness-Path Review — Answers

**HEAD:** `d0a4a1836f0573d6b8eee6e759e5e9c03b1d1427`
**Scope:** targeted freshness-path review. No code changes proposed. No fix implemented.

---

## 1. Every freshness classifier in the repository

Two classifiers exist. Both write into the same `FreshnessState` enum (`src/shared/enums.ts:249`).

### Classifier A — snapshot-layer (Odds §19.2 write-time)

| Field | Value |
|---|---|
| Path | `src/odds/freshness.ts` |
| Symbol | `classifyFreshness(inputs: FreshnessInputs): FreshnessState` |
| Thresholds | `FRESH_THRESHOLD_SECONDS = 10 * 60` (600 s), `AGING_THRESHOLD_SECONDS = 30 * 60` (1800 s). `stale` beyond 1800 s. |
| Input clock | Caller-supplied `inputs.now: string`; caller-supplied `inputs.provider_last_update: string \| null` (the PROVIDER'S market-level timestamp — `market.last_update` with `bookmaker.last_update` fallback). |
| Output enum | `FreshnessState` — one of `'fresh' \| 'aging' \| 'stale' \| 'failed_latest_poll' \| 'unavailable'`. |
| Consumer | Ingestion / poll paths: `scripts/v1_4d_step2_poll.ts:32,457` and `scripts/v1_4e_step5_repoll.ts:16,257`. The value is persisted on `market_snapshots.freshness_state` at INSERT time (snapshot-layer freshness). |

### Classifier B — read-model / composer (V1-5 §19.2 compose-time)

| Field | Value |
|---|---|
| Path | `src/computation/freshness.ts` |
| Symbol | `computeFreshness(input: FreshnessInput): FreshnessResult`, plus gate `isFreshEnoughForConsensus(state)` (returns true only for `'fresh' \| 'aging'`). |
| Thresholds | `FRESHNESS_FRESH_SECONDS = 90`, `FRESHNESS_AGING_SECONDS = 300`, `FRESHNESS_STALE_SECONDS = 900`. Beyond 900 s → `unavailable`. |
| Input clock | Caller-supplied `input.now: string`. In production both call sites — `src/computation/driver/currentMarketRowsAggregator.ts:119` and `src/evidence/driver/readModelInputBuilder.ts:372` — pass `new Date().toISOString()`, i.e. wall-clock at compose/aggregate time. `input.last_observed_at` is the MAX `market_snapshots.observed_at` (SlipLabz retrieval time), NOT the provider's market timestamp. |
| Output enum | `FreshnessState` (same enum as Classifier A). |
| Consumer | `composeCurrentMarketRow` (`src/computation/currentMarketRow.ts:59-63`) — value is (a) written to `current_market_rows.freshness_state` via the aggregator, and (b) fed into the evidence engine via `EvidenceProfileInput.current_market_row.freshness.state`. The composer also uses the classifier to gate offerings into consensus via `isFreshEnoughForConsensus`. |

No other file computes a freshness state. `src/computation/freshness.ts` and `src/odds/freshness.ts` are the only two owners.

---

## 2. Are 600/1800 and 90/300/900 the same metric or different metrics?

They represent **two structurally distinct metrics that share an enum but not a definition**. Specifically:

1. **Different clock inputs.** Classifier A measures `now - provider_last_update` (provider's own market timestamp). Classifier B measures `now - MAX(observed_at)` (SlipLabz retrieval time across the grain's offerings). These two source clocks are not the same field. A batch of offerings polled together will have essentially identical `observed_at` values, while `provider_last_update` can vary per market/book.
2. **Different subjects.** Classifier A classifies ONE snapshot row at write time. Classifier B classifies A GRAIN (game × player × market) at compose time by aggregating over its `observed_at` values.
3. **Different lifetimes.** Classifier A's value is FROZEN at snapshot INSERT (`market_snapshots.freshness_state` never rewritten — grep-verified per V1-4e STEP 1(a)). Classifier B's value is RECOMPUTED every aggregation / builder pass because `now` is read live.
4. **Different consumers.** Classifier A's value informs snapshot-level reporting only. Classifier B's value alone flows into §C.3 and into the composer's offering gate.

So this is not "one metric with conflicting constants" and it is not a historical/current layering distinction. It is **a snapshot-layer freshness (A) and a read-model / consumption-layer freshness (B) that happen to share the `FreshnessState` enum**. The comment atop `src/computation/freshness.ts` explicitly reinforces the "one owner" of the compose-layer metric.

---

## 3. Authoritative owner for each metric under the committed V1-5 / V1-5x contracts

| Metric | Contract owner (per docs) | Code owner (per repo) |
|---|---|---|
| Snapshot-layer freshness (`market_snapshots.freshness_state`) | Odds §19.2 (provider-timestamp classification at ingestion). | `src/odds/freshness.ts` — `classifyFreshness`. |
| Read-model / grain freshness (`current_market_rows.freshness_state`, `CurrentMarketRow.freshness`) | V1_COMPUTATION_CONTRACT §1 "one owner per metric"; the file header on `src/computation/freshness.ts:1-6` names itself the sole owner ("Product surfaces display the state; they never independently compute the label from the timestamp"). Comment further cites Odds §19.2 + spec §15 for authority and marks the constants "Provisional thresholds subject to Odds §23.2 audit; documented in the computation contract." | `src/computation/freshness.ts` — `computeFreshness`, plus the eligibility gate `isFreshEnoughForConsensus`. Consumer of that gate is `composeCurrentMarketRow`. |

The gate that decides whether an offering enters `line_consensus` / `eligible_book_count` / `book_detail` / etc. is `isFreshEnoughForConsensus` at `src/computation/freshness.ts:68`, and its threshold source is the 90/300/900 constants at `src/computation/freshness.ts:14-16` — i.e. Classifier B. Classifier A plays NO role in the read-model gate.

`EVIDENCE_PROFILE_METHOD_V1.md` §C.3's freshness inputs are bound (per `src/evidence/quality.ts:99-112`) to `CurrentMarketRow.freshness.state` — i.e. the OUTPUT of Classifier B, never Classifier A.

---

## 4. Real grain trace end-to-end (Marina Mabrey / player_points / Atlanta Dream @ Toronto Tempo)

Uses the operative first-profile grain flagged in the V1-4e report §Explanation 1 (evidence_profile_id `63df0dd1-e197-458e-a2dd-1f40190e85f1`), reconstructed from the code path.

| Layer | Data | Producer | Predicate / gate |
|---|---|---|---|
| `market_snapshots` | ~4 rows (4-5 bookmakers × 1 market for the grain), each with `request_kind='current_poll'`, `provenance='self_observed'`, `linked_internal_game_id='5505f19b…'`, `market_key='player_points'`, `provider_last_update` set (V1-4e STEP 5 fix), `observed_at ≈ STEP-5 wall clock`, `freshness_state` written by Classifier A as `'fresh'` (per STEP 5: 84/84 fresh at write time). | `persistOddsapiSnapshot` (STEP 5 re-poll). | INSERT-time only; no rewrite. |
| `current_market_rows` for that grain | ONE row per grain per computation_version, composed by `composeCurrentMarketRow` via `aggregateCurrentMarketRowsForGame`. `freshness.state` at STEP-6 compose time was `'stale'` (age ≈ 7-11 min > 300 s ≤ 900 s under Classifier B). `eligible_book_count` = 0 because the composer's gate emptied the offering set. `line_consensus.consensus_point` = null (empty set → no consensus). | `src/computation/driver/currentMarketRowsAggregator.ts:36-179` calling `composeCurrentMarketRow` (`src/computation/currentMarketRow.ts:50-100`). | Classifier B via `isFreshEnoughForConsensus(computeFreshness(...).state)`; only `'fresh' \| 'aging'` admit offerings. `'stale'` and `'unavailable'` and `'failed_latest_poll'` collapse the offering set to `[]`. |
| Per-offering eligibility | Actually a grain-level structural gate, not per-offering: the composer either passes ALL offerings (fresh/aging) or NONE (stale/unavailable/failed). Individual offerings are NOT independently filtered by freshness at any layer visible in this pipeline. | Same site: `currentMarketRow.ts:60-63`. | Same predicate as above. |
| Market composition | `line_consensus = computeLineConsensus([])` → `consensus_point = null`, `selection_method` reflects empty set. `line_range` → nulls. `point_distribution.counts = []`. `eligible_book_count.count = 0`. `book_detail.one_sided = null` (empty). | `computeLineConsensus`, `computeLineRange`, `computePointDistribution`, `computeEligibleBookCount`, `computeBookDetail` — each fed the empty-frozen offering array. | Determined by the emptied `structurallyEligibleOfferings` array. |
| Evidence input | `readModelInputBuilder` re-composes the same shape (via `readCurrentMarketRow` — `src/evidence/driver/readModelInputBuilder.ts:280-378`) at builder wall-clock. As `now` advances further beyond 900 s, the grain classifies as `'unavailable'` on the re-computed freshness. `EvidenceProfileInput.current_market_row.freshness.state = 'unavailable'`, `eligible_book_count.count = 0`, `line_consensus.consensus_point = null`. `evaluated_line = 0` (shape placeholder — see `readModelInputBuilder.ts:180`). | `readModelInputBuilder.buildOneGrain`. | The builder's `now = new Date().toISOString()` (`readModelInputBuilder.ts:372`) — a SECOND independent wall-clock read, this time later than the aggregator's. |
| Final profile | `evaluateC3Freshness('unavailable', 0)` → `no_current_market_unavailable`. Engine (`src/evidence/engine.ts:67`) sets `unavailable_cause = 'no_current_market'`, returns `classification='unavailable'`, all components null, `evaluated_line=null`. Reason attached: single `no_current_market` (quality). Persisted to `evidence_profiles` + `evidence_profile_reasons`. | `computeEvidenceProfile` → `writeEvidenceProfile`. | §C.3 first row of the four-way table: `unavailable` freshness with any `book_count` → `no_current_market_unavailable`. |

---

## 5. Why exactly 117 stale → Unavailable, and 24 aging → Unavailable

Both counts are produced by a **second wall-clock read** in `readModelInputBuilder.ts:372` firing at builder time, which is later than the aggregator's clock in `currentMarketRowsAggregator.ts:119`.

- **117 stale grains at STEP-6 time.** The composer's `isFreshEnoughForConsensus` gate returned `false` for `'stale'`. `structurallyEligibleOfferings` was set to the empty frozen array (`currentMarketRow.ts:60-63`). All downstream metrics (consensus, range, distribution, book count, book detail) were computed on `[]`. Result on `current_market_rows`: `eligible_sportsbook_count=0`, `line_consensus_point=null`, `freshness_state='stale'`. When STEP 7 re-composed via the builder, the second wall-clock read advanced age past 900 s, so `computeFreshness` returned `'unavailable'`. `evaluateC3Freshness('unavailable', 0)` returned `no_current_market_unavailable` (first row of §C.3 table — `unavailable` freshness triggers NO_CURRENT_MARKET regardless of book count). The engine's §D.1 step 1 first-match set `unavailable_cause='no_current_market'`. Output: Unavailable + NO_CURRENT_MARKET.

- **24 aging grains at STEP-6 time.** These grains passed the composer's gate (`'aging'` returns true from `isFreshEnoughForConsensus`), had non-empty offering sets, and `eligible_sportsbook_count > 0`. By STEP 7 builder time, the second wall-clock read had advanced age past 900 s so `computeFreshness` returned `'unavailable'` for these 24 grains as well. That same rule (`unavailable` with any book count → NO_CURRENT_MARKET) fired, and the builder passes an offering set that IS non-empty at read time but the composer inside the builder re-computes freshness against the NEW `now`; if the state now returns `'unavailable'` the composer clears the offering set to `[]`, yielding `eligible_book_count.count = 0` on the builder's own `CurrentMarketRow`. `evaluateC3Freshness('unavailable', 0)` → NO_CURRENT_MARKET. Output: Unavailable + NO_CURRENT_MARKET.

Net: for both cohorts, the **transition to Unavailable is driven by the wall-clock advance between (a) the aggregator's `now` and (b) the builder's `now`** combined with the 900 s ceiling in `FRESHNESS_STALE_SECONDS`. No engine rule, no method change, no owner ruling produced the transition.

---

## 6. Is §C.3's branch `stale + eligible_book_count >= 1 → cap at Moderate` reachable under the current read-model pipeline?

**No — it is structurally unreachable in the current read-model pipeline.**

The engine's implementation at `src/evidence/quality.ts:99-112`:
```
if (freshness_state === 'stale' || freshness_state === 'failed_latest_poll') {
  if (book_count >= 1) return { kind: 'stale_current_market_cap' };
  return { kind: 'no_current_market_unavailable' };
}
```
requires `freshness_state = 'stale' \| 'failed_latest_poll'` combined with `book_count >= 1`. In the current pipeline, `CurrentMarketRow.eligible_book_count.count` is computed by `computeEligibleBookCount(structurallyEligibleOfferings)` and `structurallyEligibleOfferings` is defined as:

```
const structurallyEligibleOfferings = isFreshEnoughForConsensus(freshness.state)
  ? input.current_offerings
  : Object.freeze([]) as ReadonlyArray<CurrentOffering>;
```
(`src/computation/currentMarketRow.ts:60-63`)

`isFreshEnoughForConsensus` returns `true` only when the state is `'fresh' \| 'aging'`. For `'stale' \| 'failed_latest_poll' \| 'unavailable'`, the offering set is emptied. Therefore `eligible_book_count.count = 0` whenever `freshness_state = 'stale' \| 'failed_latest_poll'`. The `stale + book_count >= 1` branch in §C.3 cannot be reached: **any grain whose freshness state is `stale` or `failed_latest_poll` will always arrive at the engine with `book_count = 0`, and therefore will always classify as `no_current_market_unavailable` instead of `stale_current_market_cap`**.

Equivalently, the third value (`'failed_latest_poll'`) has the same behavior: pipeline-emptied to `book_count = 0`, forcing NO_CURRENT_MARKET.

---

## 7. Proof of where stale offerings are removed before the engine sees them

Structural gate is a single line pair in the read-model composer:

**File:** `src/computation/currentMarketRow.ts`
**Lines 59-63:**
```ts
const freshness = computeFreshness(input.freshness);
const structurallyEligibleOfferings = isFreshEnoughForConsensus(freshness.state)
  ? input.current_offerings
  : Object.freeze([]) as ReadonlyArray<CurrentOffering>;
```

**Predicate authority:** `isFreshEnoughForConsensus` at `src/computation/freshness.ts:68-70`:
```ts
export function isFreshEnoughForConsensus(state: FreshnessState): boolean {
  return state === 'fresh' || state === 'aging';
}
```

Because the composer's downstream computations (`computeLineConsensus`, `computeLineRange`, `computePointDistribution`, `computeEligibleBookCount`, `computeBookDetail`) all consume `structurallyEligibleOfferings`, EVERY stale, failed-latest-poll, or unavailable grain reaches the engine with `eligible_book_count.count = 0`. The engine never observes a stale grain with `book_count >= 1`.

The composer's own header comment acknowledges this explicitly at `currentMarketRow.ts:52-58`:
> "Stale sources are structurally excluded from consensus BEFORE this composer is called — the caller passes only current_offerings whose source freshness is fresh/aging... As a defense-in-depth check, we compute the grain freshness here and, when it is unavailable / stale / failed, treat the consensus as no_line by passing an empty offering set to the consensus formulas."

Neither `currentMarketRowsAggregator.ts` nor `readModelInputBuilder.ts` filters by freshness at the SQL level — both pass ALL current-poll self_observed offerings into the composer. The gate is the composer's own predicate.

---

## 8. Is NO_CURRENT_MARKET being used for genuinely absent data, present-but-stale data, or both?

**Both — because the read-model gate collapses "present-but-stale" into the same shape as "genuinely absent" before the engine can distinguish them.**

The engine's `evaluateC3Freshness` distinguishes three verdicts (`proceed`, `stale_current_market_cap`, `no_current_market_unavailable`) based on the (freshness_state, book_count) pair. But because the composer's gate ensures `book_count = 0` whenever `state ∈ {stale, failed_latest_poll, unavailable}`, the engine only ever sees `state='unavailable' + book_count=0` OR `state ∈ {stale, failed_latest_poll} + book_count=0`. Both routes classify as `no_current_market_unavailable`.

Consequences observed in V1-4e:

- **Genuinely absent** (offering set genuinely empty at the grain, e.g. book stopped offering the market): freshness inputs collapse to `'unavailable'` because `last_observed_at = null` → engine correctly classifies as NO_CURRENT_MARKET.
- **Present-but-stale** (offerings exist and are being pulled from `market_snapshots` right now, but their `observed_at` values exceed 900 s from `now`): freshness returns `'stale'` or `'unavailable'`, the composer empties the offering set, the engine sees `book_count = 0`, and classifies as NO_CURRENT_MARKET.

The 141 V1-4e profiles are all the second case (present-but-stale). The reason code emitted is the same one that would be emitted for genuinely absent data. Downstream consumers cannot distinguish the two from the profile alone; only reading the underlying `market_snapshots` (which do exist for these grains) discriminates them.

---

## 9. Is the persisted profile reproducible from authority + source records + committed code constants?

**Reproducible from committed code plus source records — with one caveat about the wall clock.**

Authority document (`EVIDENCE_PROFILE_METHOD_V1.md`) does NOT itself specify the 90/300/900 constants. It cites §C.3 (four-way disambiguation) as a table that consumes `CurrentMarketRow.freshness.state` and `eligible_book_count`; the STATE VALUES themselves come from `computeFreshness` in the code (Classifier B), whose thresholds `FRESHNESS_FRESH_SECONDS = 90`, `FRESHNESS_AGING_SECONDS = 300`, `FRESHNESS_STALE_SECONDS = 900` (`src/computation/freshness.ts:14-16`) are annotated in the code as "Provisional thresholds subject to Odds §23.2 audit; documented in the computation contract."

- **Given** the 4 market_snapshots rows for the grain (`observed_at`, book keys, points, prices), plus the constants 90 / 300 / 900, plus a specific `now`, the persisted profile is deterministic and reproducible.
- **Undocumented in the authority document** (as far as this review can verify from the code annotations): the 90/300/900 constants themselves. They live only in the code (`src/computation/freshness.ts:14-16`) with a comment marking them provisional, not in an authority-document table this review could quote. Reproduction of the persisted profile therefore requires the code constants as a THIRD input beyond authority + sources.
- **Wall-clock caveat:** `computeFreshness` is a function of `now`. The composer's aggregator and the builder's re-composer each read wall-clock independently, so two aggregation passes at different times can (and did per STEP 6 vs the later verification re-aggregation noted in Hosted Proof §g) produce DIFFERENT `freshness_state` for the same source records. Reproduction therefore also requires pinning `now`. This is a documented and known behavior of `computeFreshness` (see aggregator comment at `currentMarketRowsAggregator.ts:117-122`), not a defect.

Summary — reproduction inputs needed:
1. Authority: §C.3 four-way disambiguation table and §D.1 first-match order (present in `EVIDENCE_PROFILE_METHOD_V1.md`).
2. Source records: the exact `market_snapshots` rows for the grain.
3. Committed code constants: `FRESHNESS_FRESH_SECONDS / AGING_SECONDS / STALE_SECONDS` (90/300/900) — NOT quoted in the authority document as of HEAD.
4. Pinned `now` timestamp — implicit in every `computeFreshness` invocation.

The 90/300/900 numeric thresholds are the one undocumented (at authority level) constant required for reproduction.

---

## 10. Correcting this — what is required?

This review does not choose or recommend a fix; the following enumerates the mechanically-distinct fix classes and where each would apply. Only a governor ruling can assign a class.

| Fix class | Would apply if the ruling is… | Requires new `method_version`? |
|---|---|---|
| **Read-model bug fix, no evidence-method change.** Example: change the composer to admit `'stale'` offerings for §C.3's cap branch (or lengthen the 900 s ceiling, or change the input clock from `observed_at` to `provider_last_update`), keeping §C.3 verbatim. | The 90/300/900 constants are wrong or the compose-time gate has the wrong shape, and §C.3 as written is the authority. | No, IF and only IF the change is provably output-equivalent under the committed method (which loosening the gate is not — it produces different classifications). More realistically, YES per DR-24 because it changes what the engine sees. |
| **Authority clarification (§C.3 or §19.2 wording).** Example: authority explicitly ratifies the 90/300/900 constants and the compose-time gate; makes it explicit that §C.3's "stale+cap" branch is intentionally unreachable in V1-5. | The current behavior is the intended behavior and only the authority document is silent. | No — clarification without behavior change. |
| **`evidence_method_v2`.** Example: §C.3 replaced by a different rule that ingests provider timestamps directly, or that discriminates present-but-stale from absent. | Any change that alters the engine's outputs for the same inputs. | Yes, per DR-24 and §I.3 (DR-29 permanently closed — see Q11). |
| **Combination.** Example: read-model bug fix (change gate) + authority clarification (ratify new constants) + `evidence_method_v2` (record the method change). | The pipeline and the authority both need to move. | Yes for the method-change portion. |

DR-29 is permanently closed per V1-4e §DR-29 §I.3 record; any output-changing correction now REQUIRES a new `method_version` per DR-24 plus regression fixtures per A1 §12.

---

## 11. DR-29 closure record — permanent and still valid regardless of the freshness ruling?

**Confirmed — the DR-29 closure record is permanent and remains valid regardless of the freshness ruling.**

Per the V1-4e report §DR-29 §I.3, the five required fields are recorded:

| Field | Value |
|---|---|
| Timestamp of first persisted operative profile | `2026-07-16T21:01:43.194Z` |
| `method_version` | `evidence_method_v1` |
| `evidence_profile_id` | `ce85fd70-7f33-48c5-8080-3b42768813ea` |
| Commit HEAD at time of persistence | `d0a4a1836f0573d6b8eee6e759e5e9c03b1d1427` |

The V1-4e report explicitly states: "the DR-29 pre-first-profile method-correction exception is HEREBY PERMANENTLY CLOSED... it may never be reused, re-invoked, extended, or re-opened by owner or governor. Every subsequent output-affecting change to `evidence_method_v1` — including but not limited to any change to any formula, constant, threshold, weight, classification rule, cap condition, reason-code trigger, closed-vocabulary addition/removal/rename, or worked-example output — now requires a new `method_version` per DR-24 plus the regression fixtures A1 §12 mandates."

The 141 Unavailable profiles satisfy the "operative first-profile" definition given by §I.3 (real live current-market data on the production path, real players, real games, real market_key, run by the production populator against the hosted database). That the classification came out Unavailable does not disqualify: §I.3 requires operative persistence, not a specific classification. The V1-4e §"Operative-profile clarification" states this explicitly.

The closure record is therefore permanent and independent of any subsequent ruling on the 90/300/900 constants. Any freshness fix that changes engine outputs will require `evidence_method_v2` regardless.

The record's SUBSTANCE (the five fields) is complete. §I.3's wording assigns the record to "the V1-A1-3 ticket report"; V1-4e flagged an authority alignment follow-up on that wording ("should be aligned by a follow-up authority pass to say 'the ticket that persists the first operative profile' rather than naming V1-A1-3 specifically"). That follow-up is a pure documentation edit and does not affect the substance of the closure.

---

## 12. Exact status of the five reconciliation queue rows

Per the V1-4e report §STEP 3 and §Hosted Proof (b):

- **Mappings approved:** 5 / 5. All 5 `event_reconciliation_queue` targets were successfully resolved to `mapping_state='approved'` `provider_games` rows via the sanctioned `resolveOddsapiEventForSeed` → `persistSeedEventResolution` path — the same path used by V1-4b Stage 2 and by governor-approved mapping work. Rows:
  - `00a99743…` Portland Fire @ Washington Mystics → `8edfaa19…` (resolved_tolerance, Δ=−600 s)
  - `4a1af047…` Los Angeles Sparks @ Chicago Sky → `62d94b6d…` (resolved_exact)
  - `571b28dd…` Atlanta Dream @ Toronto Tempo → `5505f19b…` (resolved_exact)
  - `034012f2…` Seattle Storm @ Indiana Fever → `df22e4f4…` (resolved_tolerance, Δ=−600 s)
  - `02c8aae5…` Connecticut Sun @ Phoenix Mercury → `5c025cd5…` (resolved_exact)

- **Queue rows still open:** 5 / 5. All five `event_reconciliation_queue` target rows are still `resolution='open'` after the resolution. STEP 1(b)'s audit confirmed that the `persistSeedEventResolution.wrote_provider_games` path does NOT touch the queue: on second invocation for a previously-queued event, it writes an approved `provider_games` row and leaves the queue row open. `grep "UPDATE event_reconciliation_queue" src/` returns no rows. `grep "resolution\s*=\s*'resolved'" src/` returns no rows.

- **Sanctioned close/drain operation:** **NONE exists.** No committed code path updates `event_reconciliation_queue.resolution`. `scripts/v1_4e_step3_reconcile.ts:140` explicitly acknowledges this ("Per STEP 1 audit, no committed code path updates event_reconciliation_queue.resolution"). This is a systemic gap belonging to a separate follow-up ticket, NOT to this freshness review. The queue-row-hygiene follow-up is orthogonal to the freshness ruling.

Note also that the five OLDER queue rows (V1-4e STEP 3 scope exclusion — `time_window_exceeded` from June, `unmatched` for 2026-07-13..07-14 games discovered by historical seed) are also still open and are also out of scope for this freshness review.

---
*End of REVIEW_ANSWERS.md*

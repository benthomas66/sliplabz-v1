# SlipLabz Evidence Profile Method

**Status:** OWNER-APPROVED v1.3
**Method version:** `evidence_method_v1` (UNCHANGED — the DR-29 pre-first-profile method-correction exception was invoked by v1.2 for the `NO_UNIQUE_CONSENSUS_LINE` reason-code addition; the exception expires only under the trigger defined in DR-29 and §I.3: the operative first-profile event recorded in the V1-A1-3 ticket report. Engineering-side rows do not trigger expiry. **v1.3 does NOT invoke DR-29** — its edits are documentation-only, no formula/constant/threshold/weight/trigger/classification/cap/output changed, and DR-24 does not require a bump for non-output-affecting edits; the exception remains available for a genuine future output-affecting pre-first-profile correction if and only if the DR-29 clauses are otherwise satisfied.)
**Owner approval date:** 2026-07-14 (v1.0); 2026-07-15 (v1.1 ruling on DR-14 / DR-27; v1.2 ruling on tied-consensus); 2026-07-16 (v1.3 authority documentation corrections — non-output-affecting)
**Ticket:** V1-A1-1 (Evidence Method Authority) per amendment V1-A1 §31 and merged sequence §30 / GD-12. Micro-tickets: V1-A1-2a (tied-consensus reason code, this document's v1.2 delta); V1-A1-1b (this document's v1.3 documentation corrections).
**Authorities:** Complete Spec v1.3 as amended by V1-A1 (§§8–15, 22–27, 34); UX Amendment V1-A2 (§3.3, §19/GD-15); GD-6, GD-8, GD-9, GD-12, GD-13, GD-15, GD-17; `docs/architecture/V1_COMPUTATION_CONTRACT.md`; complete-spec §§12–15.

**Document version history:**
- v1.0 (2026-07-14) — initial owner approval.
- v1.1 (2026-07-15) — records the discharged §I.1 pre-engine validation and the re-stamped DR-27 deferral. **No formula, constant, threshold, reason trigger, worked example, or surface rule changed; `method_version` does not bump per DR-24 because no output-affecting content changed.** DR-14 is re-stamped VALIDATED (approved normalizers stand); DR-27 is re-stamped with a new return condition tied to measurable would-be-Strong impact on live current-market data.
- v1.2 (2026-07-15) — records the owner ruling on tied-consensus handling (see DR-28). Adds a new closed-vocabulary reason code `NO_UNIQUE_CONSENSUS_LINE` with its trigger, effect, translation, and negative scope. Records the pre-first-profile method-correction exception (DR-29) as the sole basis under which `method_version` remains `evidence_method_v1` despite the reason-code taxonomy addition. **NO existing formula, constant, threshold, weight, reason trigger, worked example, or surface rule changed. NO existing reason's meaning, trigger, effect, or translation changed.** `method_version` REMAINS `evidence_method_v1`, permitted under the DR-29 pre-first-profile method-correction exception being exercised now. The exception expires only under the trigger defined in DR-29 and §I.3: the operative first-profile event recorded in the V1-A1-3 ticket report. Engineering-side rows do not trigger expiry.
- v1.3 (2026-07-16) — three DOCUMENTATION-ONLY corrections and one owner ratification, per owner ruling: (a) §F.6's stated reason list now includes `UNFAVORABLE_CONSENSUS_DIFFERENCE`, aligning the worked example with the DR-15 / §E.1 trigger the engine already emits (V1-A1-3 Phase A reported the discrepancy rather than silently reconciling it, which is how it was found); (b) §D.4 gains a new numbered surface rule permitting typographical separation between verbatim §E translations while forbidding paraphrase or meaning change; (c) §D.4 gains a new numbered surface rule requiring Research View to render the computed evidence direction as context alongside a Mixed Evidence label, so that direction-referencing §E translations retain their referent; (d) §D.4's existing capped-surface rule is expanded to enumerate the five OWNER-RATIFIED (2026-07-16) compact cap tags as user-facing copy — previously an undocumented implementation choice surfaced by V1-A1-4's report §S.2. **NO formula, constant, threshold, weight, reason trigger, classification rule, cap condition, worked-example input/component value/composite score/classification/`quality_capped` state, or enum value changed. NO existing reason's trigger, effect, or translation changed. NO schema, migration, or code change. `method_version` REMAINS `evidence_method_v1`.** DR-24 does NOT trigger — none of these edits is output-affecting, so DR-24 does not call for a `method_version` bump in the first place. **DR-29's pre-first-profile method-correction exception is NOT invoked by v1.3 and MUST NOT be recorded as spent on this;** the exception is not required here and remains available for a genuine future output-affecting pre-first-profile correction if the DR-29 clauses are otherwise satisfied.

**Governing distinction (A1 §35):** SlipLabz may state what the available evidence supports. It may not pretend that historical evidence guarantees what will happen next.

**Binding directions already ruled (enforced everywhere below):**
- GD-8: no probabilities, no expected value, no projections, no fabricated values.
- GD-15: the A1 §10 taxonomy (Strong Over / Moderate Over / Mixed / Moderate Under / Strong Under / Insufficient / Unavailable) is fixed.
- A1 §27.2: L5 alone cannot create a Strong classification. **Enforced numerically by DR-8, DR-11, DR-12 and §C.10 — see the single unambiguous rule in §C.10.**
- Pushes are neutral (A1 §8, complete spec §7.12) — never a win or loss for either side.
- Threshold-relative and closing-line-relative components are kept structurally distinct (A1 §9).
- Insufficient profiles never appear in Top Over / Top Under rankings (A1 §12, §13.5).

---

## 0. Decision Register

Every tunable this method makes appears here. Every threshold, weight, minimum sample, cap condition, and window preference in §B–§D is either a numbered DR row here or a binding governor direction cited above.

| # | Decision | Approved value | Status | Notes |
|---:|---|---|---|---|
| DR-1 | Component weights: `w_recent_threshold`, `w_margin_support`, `w_window_agreement`, `w_market_alignment` | **0.35 / 0.25 / 0.20 / 0.20** (sum = 1.00) | [OWNER APPROVED — 2026-07-14] | |
| DR-2 | Strong classification threshold (magnitude of composite score) | **`|score| ≥ 0.55`** | [OWNER APPROVED — 2026-07-14] | Owner change from draft v0.1's 0.60. All quality caps and Strong prerequisites (§C.10) remain unweakened. |
| DR-3 | Moderate band | **`0.30 ≤ |score| < 0.55`** | [OWNER APPROVED — 2026-07-14] | Follows DR-2 change. |
| DR-4 | Mixed band | **`|score| < 0.30`** with meaningful contradiction OR any component-disagreement flag | [OWNER APPROVED — 2026-07-14] | |
| DR-5 | Tie / neutral zone | **`|score| < 0.05` → Mixed regardless of component agreement** | [OWNER APPROVED — 2026-07-14] | |
| DR-6 | Minimum L10 eligible sample for ANY classified label (not Insufficient) | **`L10 eligible_n ≥ 5`** | [OWNER APPROVED — 2026-07-14] | |
| DR-7 | Minimum season eligible sample for ANY classified label | **`season eligible_n ≥ 10`** | [OWNER APPROVED — 2026-07-14] | |
| DR-8 | Minimum L10 eligible sample for Strong classification | **`L10 eligible_n ≥ 8`** | [OWNER APPROVED — 2026-07-14] | Enforces A1 §27.2 together with DR-11/12 and §C.10. |
| DR-9 | Push-heavy cap trigger | **`push_count / eligible_n > 0.30` in L10 → cap at Moderate + `PUSH_HEAVY_SAMPLE`** | [OWNER APPROVED — 2026-07-14] | |
| DR-10 | Book-coverage cap trigger | **`eligible_sportsbook_count < 3` → cap at Moderate + `INSUFFICIENT_BOOK_COVERAGE`** | [OWNER APPROVED — 2026-07-14] | |
| DR-11 | Component contribution rule enforcing "L5 alone cannot create Strong" | **Single implementation rule (see §C.10 clause 4):** to reach Strong, the sum of the three non-L5 contributions inside `C_RTP` — the L10 term, the longer-window term, and the season term — MUST satisfy `|0.55 × rate_deviation(L10) + 0.25 × rate_deviation(longer_window) + 0.20 × rate_deviation(season)| ≥ 0.30`. This is the ONE numeric expression used throughout the document. | [OWNER APPROVED — 2026-07-14] | Draft ambiguity between DR-11 row and Section C.10 removed — one rule, one number, one place. |
| DR-12 | L5 role in the composite score | **L5 has ZERO weight in the composite `C_RTP`; L5 appears in `C_WA` (window agreement) with a small sub-weight (0.10) and in Recent Threshold Performance as a display-side recency-context sub-value only.** | [OWNER APPROVED — 2026-07-14] | |
| DR-13 | Longer-window preference (resolves GD-17 #4) | **Prefer L20 as the longer-window agreement input; fall back to season only when `L20 eligible_n < 10`.** | [OWNER APPROVED — 2026-07-14] | |
| DR-14 | Margin normalization constants per market | **VALIDATED:** `M_points = 6.0`, `M_rebounds = 3.0`, `M_assists = 2.0`, `M_threes = 1.5` (no change) | [OWNER APPROVED — VALIDATED 2026-07-15] | **Owner ruling on the corrected §I.1 calibration (evidence at `docs/product/reports/V1_DR14_DR27_CALIBRATION.md`):** (1) the corrected calibration VALIDATES the approved margin normalizers: `player_points = 6.0`, `player_rebounds = 3.0`, `player_assists = 2.0`, `player_threes = 1.5`. (2) Measured on the actual C_MS inputs rather than individual-game margins, weighted `\|C_MS\|` saturation is `player_points 4.76 %`, `player_rebounds 3.54 %`, `player_assists 2.41 %`, `player_threes 5.26 %`; no market is an abnormal saturation outlier. (3) `player_threes` REMAINS 1.5. Raising it to 2.0 would reduce all observed threes clamp rates to zero and would risk systematically suppressing the attainable C_MS contribution for threes relative to the other markets. (4) The elevated clamp rate on the threes MEDIAN terms is accepted as a bounded structural consequence of integer made-three outcomes evaluated against half-integer lines; those terms carry 0.30 (L10 median) and 0.10 (season median) of C_MS and do not justify changing the market normalizer. (5) DR-14 is FULLY VALIDATED. NO amendment to `evidence_method_v1` is authorized. Any future change to a normalizer still routes through owner/governor review under DR-24 (bump `evidence_method_v1 → evidence_method_v2`, regression fixtures per A1 §12). |
| DR-15 | Consensus-difference threshold that produces `FAVORABLE_CONSENSUS_DIFFERENCE` / `UNFAVORABLE_CONSENSUS_DIFFERENCE` | **Half-point (0.5) or more, in the market's stat units** | [OWNER APPROVED — 2026-07-14] | |
| DR-16 | Freshness cap policy | See §C.3 for the full deterministic decision table across `freshness.state` values. In summary: `stale` and `failed_latest_poll (usable prior observation)` cap at Moderate; `failed_latest_poll (no usable current market)` and `unavailable` produce **Unavailable**. | [OWNER APPROVED — 2026-07-14] | See §E.3 consistency correction for the four-way disambiguation. |
| DR-17 | Contradiction detection that forces Mixed regardless of magnitude — **CORRECTED DEFINITION** | **WINDOWS_DISAGREE fires when ANY PAIR among `L10`, `L20`, `season` have opposite non-zero signs AND each of the two windows in the pair has `|rate_deviation| ≥ 0.30`. L5 NEVER independently triggers this reason.** Effect: force **Mixed Evidence**; attach `WINDOWS_DISAGREE`. | [OWNER APPROVED — 2026-07-14] | This single definition is used in DR-17, §B.4, §C.5, example F.3, and all tests / acceptance criteria. |
| DR-18 | One-sided offering handling | **When only Over OR only Under exists across eligible sportsbooks at the evaluated point → `ONE_SIDED_OFFERING`; `C_MA` clamped to 0; cap at Moderate** | [OWNER APPROVED — 2026-07-14] | |
| DR-19 | Numeric composite score display — **RESEARCH-VIEW-ONLY** | **The numeric composite score is HIDDEN BY DEFAULT.** It MUST NOT appear on dense Board rows, Discover cards, Top Over / Top Under rankings, compact result rows, search results, paywall-preview rows, or any other summary/scanning surface. It MAY appear ONLY inside an expanded Research View or an explicit "How this was graded" section. When shown: (a) present as a bounded evidence-method score in `[-1.00, +1.00]` rounded to 2 decimals — **never as a percentage**; (b) place the not-a-probability disclosure (§G.2) immediately adjacent; (c) show component values and method version in the same inspectable area; (d) no percent sign, probability-style gauge, win-rate dial, confidence meter, or any presentation implying outcome likelihood. Ordinary-surface hierarchy: classification first, then underlying evidence facts, then reasons/limitations, with the numeric score appearing only in expanded research context. | [OWNER APPROVED — 2026-07-14] | Binds every UX ticket. See §D.4 surface rules. |
| DR-20 | Tie-breaking for deterministic sorting | **Ordered by:** (1) `|score|` descending, (2) `L10 eligible_n` descending, (3) `eligible_sportsbook_count` descending, (4) `internal_game_id` ascending as a stable last resort. **RANKING USES THE FULL-PRECISION STORED SCORE, NOT THE ROUNDED DR-19 DISPLAY VALUE.** | [OWNER APPROVED — 2026-07-14] | |
| DR-21 | A2 compact-display mapping (GD-15) | See §D.2 mapping table | [OWNER APPROVED — 2026-07-14] | Every compact variant maps many-to-one onto A1 §10 taxonomy; Unavailable NEVER collapses into Insufficient; Strong vs Moderate NEVER discarded on Discover / Research View. |
| DR-22 | Push-heavy definition (which window) | **L10** | [OWNER APPROVED — 2026-07-14] | |
| DR-23 | Backfilled-historical inclusion in evidence windows | **INCLUDE `backfilled_historical` in threshold windows AND margin windows** (matching the read model's per-metric decision). Requirements: (a) preserve `includes_backfilled_historical` on the profile; (b) surface copy MUST disclose that seeded historical closing-line data is included; (c) profiles with the flag MUST NEVER be described as "observed since launch"; (d) consumers representing post-launch observation MAY filter them out; (e) NO automatic quality cap is applied solely for backfilled provenance. | [OWNER APPROVED — 2026-07-14] | |
| DR-24 | Method-version bump policy | Method version increments on (a) any change to any DR row here that alters an output on identical inputs; (b) any component addition/removal; (c) any classification-threshold change; (d) any reason-code taxonomy change (add/remove/rename). Documentation-only edits do NOT bump. **The locked document begins directly as `evidence_method_v1`; the unapproved v0.1 draft is NOT preserved as an operative method version.** | [OWNER APPROVED — 2026-07-14] | |
| DR-25 | Historical-coverage requirement | **A profile requires historical coverage such that ≥ 30 days of eligible player-game history exists.** Evaluated from `HistoricalCoverageResult.coverage_start_date` (RME-1). Not derivable inside the engine — depends on the read-model extension per §I.2. | [OWNER APPROVED — 2026-07-14] | |
| DR-26 | Displayed reasons ordering | **Canonical STORED reason order:** (1) primary supporting evidence, (2) contradicting evidence, (3) quality/coverage limitations. Within category, ordered by absolute contribution magnitude descending; ties broken lexicographically by reason code. **Compact UI surfaces MAY visually elevate a binding cap or availability limitation ahead of support text so the user immediately sees why a profile is capped or unavailable; that emphasis MUST NOT alter the canonical stored order.** | [OWNER APPROVED — 2026-07-14] | |
| DR-27 | Abnormal-dispersion cap threshold (§I.3) | **FORMAL §11.5 DEFERRAL — no K assigned in `evidence_method_v1`.** A1 §11.5 authorizes an abnormal-dispersion penalty; the trigger threshold `K` remains deliberately unset. **Return path REPLACED per owner ruling 2026-07-15:** DR-27 no longer returns on the strength of the §I.1 offline calibration alone; it returns once the would-be-Strong impact of a candidate cap is MEASURABLE on live current-market data (see §I.3 numbered return condition). Activating any cap later requires a method-version bump per DR-24 AND regression fixtures per A1 §12. | [OWNER APPROVED — DEFERRED UNTIL WOULD-BE-STRONG IMPACT IS MEASURABLE ON LIVE CURRENT-MARKET DATA] | **Owner ruling on the corrected §I.1 calibration:** (a) Do NOT activate an abnormal-dispersion cap in `evidence_method_v1`. `ABNORMAL_DISPERSION` remains RESERVED, non-emitting, without an active trigger, and unavailable to V1-A1-3. (b) Evidence basis: at `K ≥ 2.0`, zero Strong-eligible profiles cap in every market — the rule would be dead; at `K = 1.5`, 13 of 253 Strong-eligible player-market grains exceed the candidate dispersion threshold (points 5 of 84, rebounds 1 of 69, assists 5 of 47, threes 2 of 53). (c) The decision-relevant quantity is NOT the count of Strong-eligible grains above the threshold — it is the count of profiles that would otherwise classify Strong under `evidence_method_v1` AND would be downgraded SOLELY because the K = 1.5 cap fired. That quantity is currently unmeasurable: `current_market_rows` is empty and complete composite scores cannot be computed against live evaluated lines and current-market context. (d) Assists (47) and threes (53) Strong-eligible samples are too limited to justify locking a permanent cross-market threshold from the current calibration alone. (e) DR-27 therefore remains FORMALLY DEFERRED — an acknowledged A1 §11.5 requirement, never a silent omission. See §I.3 for the numbered return condition and the engine prohibition (unchanged in substance — DR-27 does not activate `ABNORMAL_DISPERSION`). |
| DR-28 | Tied-consensus handling (§C.3.1 + §E.1 `NO_UNIQUE_CONSENSUS_LINE`) | **When the eligible sportsbook point distribution is tied — `line_consensus.selection_method = 'tied_no_unique_mode'` AND `line_consensus.consensus_point IS NULL` AND `eligible_book_count.count > 0` — the canonical Evidence Profile is Unavailable; the engine attaches `NO_UNIQUE_CONSENSUS_LINE` as the PRIMARY reason; `evaluated_line` remains null; no canonical directional profile is persisted or evaluated at any tied sportsbook point.** The engine MUST NOT choose the lower point, choose the higher point, average tied points, use a first-observed point, choose an individual sportsbook's line, or invent another tiebreak. The canonical evidence EVALUATION is unavailable — NOT that sportsbooks have no market. The read model preserves `tied_no_unique_mode` AND the underlying sportsbook point distribution in audit / provenance. `NO_UNIQUE_CONSENSUS_LINE` MUST NOT be used when there are zero eligible sportsbook offerings; when the market source is unavailable; when current-market freshness is unavailable; or when consensus is absent for any reason other than `tied_no_unique_mode` — those states remain governed by their existing reasons, including `NO_CURRENT_MARKET` where factually applicable. | [OWNER APPROVED — 2026-07-15] | Closes an implementation-blocking omission discovered before any Evidence Profile has ever been computed: the nearest existing code (`NO_CURRENT_MARKET`, translation "No current market is available") would be FALSE for a market where several books are actively quoting but split evenly. See §E.1 vocabulary row and §C.3.1 for the trigger, effect, translation, and negative scope. Method-version does NOT bump under DR-29's pre-first-profile exception. |
| DR-29 | Pre-first-profile method-correction exception (self-terminating) | **Until the operative first-profile event is RECORDED per the trigger defined below, an owner-approved correction to `evidence_method_v1` may be incorporated WITHOUT changing `method_version`, only when ALL of the following are true:** (1) no operative first-profile event has yet been recorded under `evidence_method_v1`; (2) the correction closes an implementation-blocking omission or contradiction discovered before first computation; (3) the correction is expressly approved by the owner AND the governor; (4) the authority document records the correction and its rationale in version history; (5) any schema enum or constraint change is additive and separately migrated; (6) all affected acceptance tests and fixtures are added before the first profile is persisted. **Expiry trigger (clarified 2026-07-15):** the exception expires PERMANENTLY when — AND ONLY when — the **operative first-profile event** is RECORDED in the V1-A1-3 ticket report with the five required fields (timestamp; `method_version`; `evidence_profile_id`; commit HEAD; explicit confirmation that the pre-first-profile exception is permanently closed). **Test fixtures, migration probes, throwaway validation databases (e.g. local Docker Postgres used for schema validation), CI-side runs, and any other engineering-side `evidence_profiles` row insertion are NOT first-profile events and DO NOT trigger expiry.** The RECORDED first-profile event in V1-A1-3's ticket report is the governance trigger and the proof of expiry. Until that record exists, the exception REMAINS ACTIVE — no matter how many rows have been inserted into any evidence_profiles table anywhere. Once that record exists, the exception CANNOT BE REVIVED OR REUSED — no owner or governor may extend, re-open, or re-invoke it, and every subsequent output-affecting formula, threshold, classification, cap, reason-code, trigger, or vocabulary change requires a NEW `method_version` per DR-24. Documentation version changes remain separate from `method_version` changes ONLY when they cannot alter outputs. | [OWNER APPROVED — 2026-07-15] | This is the sole basis under which v1.2 (adding `NO_UNIQUE_CONSENSUS_LINE`) does not bump `method_version` per DR-24. The DR-24 test IS triggered by v1.2's reason-code taxonomy addition; DR-29 supersedes it exactly once. See §I.3 for the V1-A1-3 hand-off obligation and the exception's expiry trigger. |

Any change to any resolved DR row after this approval requires a method-version bump per DR-24 and a regression fixture pass per A1 §12 — except as narrowly permitted by DR-29's self-terminating pre-first-profile method-correction exception.

---

## Method version + reproducibility (§H)

**Method version identifier (locked):** `evidence_method_v1`.
**Version bump triggers:** DR-24.
**Audit-reconstruction statement:** Given a stored Evidence Profile row (per A1 §25 and V1-A1-2), the profile's classification, direction, and every component value MUST be reproducible from the profile's referenced source records (canonical closing points, historical line results, real-line windows, threshold windows, averages/medians, current-market row, availability context, historical-coverage snapshot, mapping-resolution snapshot, one-sided-offering snapshot) and this method authority at method version `evidence_method_v1`. A profile whose classification cannot be reproduced from its inputs at its stored method version fails A1 §23.3 and must be re-derived or marked Unavailable pending re-derivation.

---

## A. Approved inputs — every input BOUND to a V1-5 read-model field

For each amendment §9 input, this section states the exact V1-5 module + field the engine will read. Any amendment input the read model cannot currently produce is listed in **§I.2 Read-Model Extension Ruling (V1-5x)**, not silently bound.

### A.1 Historical threshold results (amendment §9.1)

The engine takes threshold-relative results per window from `ThresholdWindowResult` (`src/computation/thresholdWindows.ts` → `computeThresholdWindow(window_type, threshold, games)`), one invocation per window, all against the evaluated line as threshold.

| A1 §9.1 input | V1-5 read-model binding | Provenance handling | Freshness dependency |
|---|---|---|---|
| L5 Over / Under / Push counts | `ThresholdWindowResult.count_above` / `.count_below` / `.count_equal` (windowType='L5') | `includes_backfilled_historical` preserved (per DR-23) | none directly (historical) |
| L10 Over / Under / Push counts | same, windowType='L10' | same | none |
| L20 Over / Under / Push counts | same, windowType='L20' | same | none |
| season Over / Under / Push counts | same, windowType='season' | same | none |
| actual eligible sample size (per window) | `ThresholdWindowResult.eligible_n` | independent of provenance | none |
| incomplete-window state | `ThresholdWindowResult.incomplete` + `.coverage_label` | same | none |
| historical coverage start | **RME-1:** `HistoricalCoverageResult.coverage_start_date` — V1-5x delivers before V1-A1-3 (§I.2) | independent | none |
| underlying game results | `player_game_stats.normalized_stats` (V1-2 storage) traceable per profile's referenced `player_game_stat_id`s | preserved raw; engine reads only for reasoning; never re-normalizes | none |

### A.2 Line-relative production (amendment §9.2)

| A1 §9.2 input | V1-5 read-model binding | Provenance | Freshness |
|---|---|---|---|
| recent average minus threshold | `ThresholdWindowResult.avg_minus_threshold` (L10 for "recent"; season for "season") | `includes_backfilled_historical` preserved | none |
| recent median minus threshold | `ThresholdWindowResult.median_minus_threshold` (L10) | same | none |
| season average minus threshold | `ThresholdWindowResult.avg_minus_threshold` (season) | same | none |
| season median minus threshold, if supported | `ThresholdWindowResult.median_minus_threshold` (season) | same | none |
| qualifying results above / below / equal | `ThresholdWindowResult.count_above` / `.count_below` / `.count_equal` per window | same | none |
| recent directional streak | `ThresholdWindowResult.current_streak_direction` + `.current_streak_length` (L10) | same | none |

### A.3 Current market context (amendment §9.3)

Composed via `readCurrentMarketRow` in `src/computation/readPath.ts` (which calls `composeCurrentMarketRow` in `src/computation/currentMarketRow.ts`).

| A1 §9.3 input | V1-5 read-model binding | Provenance | Freshness |
|---|---|---|---|
| sportsbook consensus point | `CurrentMarketRow.line_consensus.consensus_point` (owner `src/computation/consensus.ts`) | NEVER includes backfilled_historical (V1_COMPUTATION_CONTRACT.md §5) | governed by `CurrentMarketRow.freshness.state` |
| user or pick'em line minus sportsbook consensus | Engine derives `evaluated_line − CurrentMarketRow.line_consensus.consensus_point` | same | same |
| minimum and maximum sportsbook line | `CurrentMarketRow.line_range.min_point` / `.max_point` | same | same |
| exact-point distribution | `CurrentMarketRow.point_distribution.counts` | same | same |
| eligible sportsbook count | `CurrentMarketRow.eligible_book_count.count` | same | same |
| first-observed consensus | `CurrentMarketRow.first_observed.point` + `.at` (owner `src/computation/firstObserved.ts`) | never backfilled | none (first-observation timestamp only) |
| current consensus | same as sportsbook consensus point above | same | same |
| first-observed-to-current movement | `CurrentMarketRow.movement_summary.first_observed_point`, `.current_point`, `.net_point_movement` (owner `src/computation/movementSummary.ts`) | never backfilled | same |
| current line freshness | `CurrentMarketRow.freshness.state` (owner `src/computation/freshness.ts`) | never backfilled | primary freshness signal |
| source freshness | same field (per-grain freshness reflects the source's poll state) | same | same |
| number of books offering the selected point | `CurrentMarketRow.point_distribution.counts[point == evaluated_line].book_count` | same | same |
| best available line by direction | `bestPriceAtExactPointSide` in `src/computation/priceComparison.ts` — evaluated at the specific `(point, side)` requested | same | same |

Pick'em sources remain structurally separate from sportsbook consensus (isolation preserved by `isConsensusEligibleBookmakerKey` — `src/odds/bookmakerAllowlist.ts`).

### A.4 Evidence-quality inputs (amendment §9.4)

| A1 §9.4 input | V1-5 read-model binding | Notes |
|---|---|---|
| actual sample size | `ThresholdWindowResult.eligible_n` per window | |
| incomplete historical coverage | `ThresholdWindowResult.coverage_label ∈ {'incomplete', 'no_data'}` + `HistoricalCoverageResult.coverage_start_date` (RME-1) | |
| stale market observations | `CurrentMarketRow.freshness.state ∈ {'stale', 'failed_latest_poll'}` — full four-way disambiguation in §C.3 | |
| incomplete sportsbook coverage | `CurrentMarketRow.eligible_book_count.count` compared against DR-10 | |
| unresolved player mapping | **RME-2:** `MappingResolutionResult.player_resolved: boolean` + `.queue_reason` — V1-5x delivers before V1-A1-3 (§I.2) | |
| unresolved event mapping | **RME-2:** `MappingResolutionResult.event_resolved: boolean` | |
| unavailable current market | `CurrentMarketRow.freshness.state = 'unavailable'` OR `eligible_book_count.count = 0` combined per §C.3 | |
| missing verified player results | `player_game_stats` row absent for the referenced game — engine detects via absence of a `historical_line_results` row at the grain OR `player_game_stats.eligibility_state != 'eligible'` | |
| postponed or canceled games | `games.status ∈ {'postponed', 'canceled'}` — engine excludes from windows AND raises `POSTPONED_GAME` / `CANCELED_GAME` reasons | |
| one-sided offerings | **RME-3:** `CurrentMarketRow.book_detail.one_sided ∈ {'over_only', 'under_only', 'neither'} | null` — V1-5x delivers before V1-A1-3 (§I.2) | |
| unresolved availability data | `CurrentMarketRow.availability_context.presence_state ∈ {'unresolved_player', 'source_unavailable', 'stale_feed'}` | |
| unsupported contextual data | Any A1 §9 field for which the read model returns null AND the engine treats as missing rather than fabricating | |

### A.5 Provenance handling (per-metric, carried through per computation contract §5)

Each stored profile MUST carry a `includes_backfilled_historical` boolean derived as:

```
profile.includes_backfilled_historical  :=
    threshold_windows.any(w => w.includes_backfilled_historical)
 OR real_line_windows.any(w => w.includes_backfilled_historical)
 OR averages_medians.any(w => w.includes_backfilled_historical)
```

Consumers presenting a profile as "observed since launch" MUST reject a profile whose `includes_backfilled_historical` is true (per DR-23 and V1_COMPUTATION_CONTRACT.md §5). Surface copy per DR-23 (b) and §D.4 rule 7.

### A.6 Freshness dependencies (summary; deterministic disambiguation in §C.3)

The evidence method reads THREE freshness surfaces from V1-5:

1. **Current market freshness** — `CurrentMarketRow.freshness.state` (Odds API poll state). Values per Odds §19.2: `fresh` | `aging` | `stale` | `unavailable` | `failed_latest_poll`. Combined with `CurrentMarketRow.eligible_book_count.count` for the four-way disambiguation in §C.3.
2. **Availability freshness** — `CurrentMarketRow.availability_context.presence_state`. BDL §20 vocabulary: `currently_reported` | `not_returned_latest_complete_snapshot` | `stale_feed` | `unresolved_player` | `source_unavailable`.
3. **Historical eligibility** — game status per complete-spec §15.5 (postponed/canceled exclusion) via `games.status`.

---

## B. Deterministic scoring method

Every formula is stated exactly. Every constant is named and appears in the Decision Register.

### B.1 Sign convention

The engine computes an Over-signed score:

- A positive component value SUPPORTS the Over direction.
- A negative component value SUPPORTS the Under direction.

The Under-signed value is `−score`. Over and Under evaluation are structurally symmetric per A1 §27.1.

### B.2 Component 1 — Recent Threshold Performance (`C_RTP`)

Uses `ThresholdWindowResult` for L10 (primary), L20 (stability), and season. **L5 has zero weight in `C_RTP`** per DR-12; L5 appears in `C_WA` only.

Define `over_rate(w)` and `under_rate(w)` on a window `w`:

```
denom(w)        := w.count_above + w.count_below                 (pushes excluded, per A1 §8 + spec §14.4)
over_rate(w)    := if denom(w) = 0 then null else w.count_above / denom(w)
under_rate(w)   := if denom(w) = 0 then null else w.count_below / denom(w)
```

Define the window's Over-signed rate deviation from 0.5, bounded to `[-1, +1]`:

```
rate_deviation(w) := if over_rate(w) = null then 0 else (2 × over_rate(w)) − 1
```

Aggregate across L10 / L20 / season under DR-13:

```
longer_window(w_L20, w_season) :=
    if w_L20 != null AND w_L20.eligible_n >= 10 then w_L20
    else w_season

C_RTP :=
    0.55 × rate_deviation(L10)                              // primary recent window
  + 0.25 × rate_deviation(longer_window(L20, season))       // stability
  + 0.20 × rate_deviation(season)                           // long-run baseline
```

The three sub-weights (0.55 / 0.25 / 0.20) inside `C_RTP` are internal to the component; a change requires an owner-approved DR-1 revisit. The result is clamped to `[-1, +1]`.

### B.3 Component 2 — Margin Support (`C_MS`) — with T1 null-handling rule

Uses `ThresholdWindowResult.avg_minus_threshold` and `.median_minus_threshold` from L10 and season.

```
margin_normalizer(market) := DR-14 constant
  ∈ { player_points: 6.0, player_rebounds: 3.0, player_assists: 2.0, player_threes: 1.5 }

norm_margin(raw)          := max(-1, min(+1, raw / margin_normalizer(market)))
```

Each term has a **fixed base weight**:

| Term | Base weight |
|---|---:|
| `norm_margin(L10.avg_minus_threshold)` | 0.40 |
| `norm_margin(L10.median_minus_threshold)` | 0.30 |
| `norm_margin(season.avg_minus_threshold)` | 0.20 |
| `norm_margin(season.median_minus_threshold)` | 0.10 |

**T1 null-handling rule (exact):** each available term keeps its base weight; omit every term whose input is null; sum the base weights of the remaining terms; divide each remaining base weight by that sum; compute `C_MS` with those normalized weights. If no margin inputs are available, `C_MS = 0`. (This is the ONE rule; no other relative ratio governs re-weighting.)

**Worked null example.** If season median is null and all three other terms are available: retained base weights are 0.40 + 0.30 + 0.20 = 0.90. Normalized weights are 0.40/0.90 = 0.4444, 0.30/0.90 = 0.3333, 0.20/0.90 = 0.2222. `C_MS = 0.4444 × norm_margin(L10.avg) + 0.3333 × norm_margin(L10.median) + 0.2222 × norm_margin(season.avg)`.

### B.4 Component 3 — Window Agreement (`C_WA`)

Measures whether L5, L10, L20, season point the same direction. **L5 is inspected here** — its role is to reveal recency contradiction as a display-side signal. L5 NEVER independently triggers `WINDOWS_DISAGREE` — that rule uses only L10 / L20 / season per corrected DR-17.

For each window `w`, define `direction_sign(w) := sign(rate_deviation(w))` ∈ {−1, 0, +1}.

```
signs := [direction_sign(L5), direction_sign(L10), direction_sign(L20), direction_sign(season)]
weights := [0.10, 0.40, 0.25, 0.25]                        // L5 sub-weight is small on purpose

C_WA_raw :=
    let dominant := sign(sum_i (weights[i] × signs[i]))
    in
      sum_i (weights[i] × (1 if signs[i] == dominant else (0 if signs[i] == 0 else -1)))

C_WA := max(-1, min(+1, C_WA_raw))
```

Then `C_WA` is signed by the dominant direction — for an all-agree Under case, the raw magnitude is negated so the Over-signed component is negative. Near zero when windows disagree. The corrected DR-17 `WINDOWS_DISAGREE` rule is separately evaluated in §C.5 using only L10 / L20 / season.

### B.5 Component 4 — Market Alignment (`C_MA`)

Uses `CurrentMarketRow.line_consensus.consensus_point`, `.line_range`, `.point_distribution`, `.eligible_book_count`, `.movement_summary`, and the evaluated line.

Let `E := evaluated_line`, `C := line_consensus.consensus_point`.

```
consensus_gap := if C = null then 0 else (C − E)                 // Over-signed: E below C → positive
consensus_gap_norm := max(-1, min(+1, consensus_gap / margin_normalizer(market)))

// Book-coverage-at-selected-point: how many eligible sportsbooks quote AT the evaluated point.
coverage_at_line := sum over point_distribution.counts of book_count where point == E
coverage_norm    := 0 if eligible_book_count.count = 0
                    else min(1, coverage_at_line / eligible_book_count.count)      // 0..1, higher = more books

// Movement direction (§13). A rising consensus is Over-supporting; falling is Under-supporting.
movement_dir := if net_point_movement is null then 0
                else max(-1, min(+1, net_point_movement / margin_normalizer(market)))

C_MA := 0.60 × consensus_gap_norm
      + 0.20 × coverage_norm × sign(consensus_gap_norm)    // coverage amplifies only when there IS a consensus_gap
      + 0.20 × movement_dir
```

When `line_consensus.selection_method ∈ {'tied_no_unique_mode', 'no_eligible_source'}`, OR the §C.3 disambiguation forces Unavailable, OR `ONE_SIDED_OFFERING` fires: `C_MA := 0` and the profile inherits the reason code that produced the empty market alignment.

### B.6 Composite score

```
score := 0.35 × C_RTP + 0.25 × C_MS + 0.20 × C_WA + 0.20 × C_MA         (DR-1)
```

Clamped to `[-1, +1]`. Deterministic on identical inputs. Ranking uses the full-precision stored value (DR-20); display rounds to two decimals only inside the Research View / grade-detail area (DR-19).

### B.7 Direction determination

- If `|score| < DR-5 (0.05)` → the profile has no directional evidence. Classification proceeds to Mixed (§D).
- Else `direction := 'over' if score > 0 else 'under'`.

Tie handling: none needed — the tie zone is DR-5.

---

## C. Quality rules

Every rule caps the classification (Strong → Moderate; never upgrades) or forces Insufficient / Unavailable. Missing information NEVER upgrades and is NEVER inferred (A1 §23.5, §23.6).

### C.1 Minimum sample rules

- `L10.eligible_n < DR-6 (5)` → **Insufficient Evidence** + `INSUFFICIENT_L10_SAMPLE`.
- `season.eligible_n < DR-7 (10)` → **Insufficient Evidence** + `INCOMPLETE_HISTORICAL_COVERAGE`.
- `HistoricalCoverageResult.coverage_start_date` implies fewer than DR-25 (30) days of eligible player-game history → **Insufficient Evidence** + `INCOMPLETE_HISTORICAL_COVERAGE`.

### C.2 Coverage requirements (market coverage)

- `eligible_book_count.count = 0` combined with `freshness.state = 'unavailable'` → see §C.3 (Unavailable).
- `eligible_book_count.count < DR-10 (3)` → cap at Moderate + `INSUFFICIENT_BOOK_COVERAGE`.
- `eligible_book_count.count == 1` (single-book) → the profile carries a "single_book" quality flag; `C_MA` still computes but the profile records reason `INSUFFICIENT_BOOK_COVERAGE` and is capped at Moderate.

### C.3 Staleness handling — deterministic four-way disambiguation (E.3 correction)

The engine consults `CurrentMarketRow.freshness.state` and `CurrentMarketRow.eligible_book_count.count`. The outcome is determined by this table:

| `freshness.state` | `eligible_book_count.count` | Outcome | Reasons attached |
|---|---:|---|---|
| `fresh` | ≥ 1 | Proceed normally | — |
| `aging` | ≥ 1 | Proceed normally | — |
| `stale` | ≥ 1 (still-usable prior observation) | **Cap at Moderate** | `STALE_CURRENT_MARKET` |
| `stale` | 0 | **Unavailable** | `NO_CURRENT_MARKET` |
| `failed_latest_poll` | ≥ 1 (still-usable prior observation retained per spec §15.2) | **Cap at Moderate** | `STALE_CURRENT_MARKET` (presentation may show "market update failed; showing last valid snapshot") |
| `failed_latest_poll` | 0 (no usable current market) | **Unavailable** | `NO_CURRENT_MARKET` |
| `unavailable` | any | **Unavailable** | `NO_CURRENT_MARKET` |

Availability signal (independent of the table above): `availability_context.presence_state = 'source_unavailable'` attaches `SOURCE_UNAVAILABLE` but does NOT by itself make the profile Unavailable — availability is contextual to the player, not to the market. The `not_returned_latest_complete_snapshot` state is DISCLOSED via reasons but does not cap.

### C.3.1 Tied-consensus handling — DISTINCT from "no current market" (DR-28)

The §C.3 table above governs *whether the current market exists and is fresh enough to consult*. It does NOT govern the case where the eligible sportsbook offerings are ACTIVELY QUOTING but split evenly across two or more equally frequent top points. That case is handled here, per DR-28 and owner ruling 2026-07-15.

**Trigger — all three conditions required (identical to DR-28):**

- `CurrentMarketRow.line_consensus.selection_method = 'tied_no_unique_mode'`; AND
- `CurrentMarketRow.line_consensus.consensus_point IS NULL`; AND
- `CurrentMarketRow.eligible_book_count.count > 0`.

**Effect:**

- Force classification `Unavailable`.
- Attach `NO_UNIQUE_CONSENSUS_LINE` as the PRIMARY reason.
- `evaluated_line` remains null.
- Do NOT persist or evaluate a canonical directional profile at any tied sportsbook point.
- Preserve `tied_no_unique_mode` AND the underlying sportsbook point distribution in audit / provenance so a downstream Research View can display the tied points without SlipLabz having chosen among them.

**No tiebreak.** The engine MUST NOT choose the lower point, choose the higher point, average tied points, use a first-observed point, choose an individual sportsbook's line, or invent another tiebreak. The canonical evidence EVALUATION is unavailable — NOT that sportsbooks have no market. The user-facing translation says exactly that: *"Eligible sportsbooks are evenly split on this line, so no single consensus line can be established."*

**Negative scope — the reason MUST NOT be used when:**

- there are zero eligible sportsbook offerings;
- the market source is unavailable;
- current-market freshness is `unavailable`;
- consensus is absent for any reason other than `tied_no_unique_mode`.

Those states remain governed by their existing reasons — see the §C.3 four-way disambiguation table above, including `NO_CURRENT_MARKET` where factually applicable.

### C.4 Backfilled-data handling (per DR-23)

- Threshold windows with `includes_backfilled_historical = true` remain input to the engine.
- The profile stores `profile.includes_backfilled_historical` per §A.5.
- No cap is applied on the basis of provenance alone.
- Surface copy per DR-23 (b) and §D.4 rule 7 discloses the seeded inclusion.

### C.5 Contradiction detection (corrected DR-17)

- `WINDOWS_DISAGREE` fires when **ANY PAIR among `L10`, `L20`, `season` have opposite non-zero signs AND each of the two windows in the pair has `|rate_deviation| ≥ 0.30`**. L5 NEVER independently triggers this reason.
- On `WINDOWS_DISAGREE` → force **Mixed Evidence** regardless of composite score; attach `WINDOWS_DISAGREE`.
- Additional contradictions surface as reasons but do NOT independently force Mixed:
  - **`MARGIN_MEASURES_DISAGREE`** (E.4 addition) — trigger: L10 `avg_minus_threshold` and L10 `median_minus_threshold` have opposite non-zero signs. Effect: attach as a contradiction reason; do NOT independently force Mixed; do NOT independently cap unless another rule applies. This is NEVER represented as `WINDOWS_DISAGREE` (which is reserved for the L10/L20/season inter-window disagreement in DR-17).
  - **`MARKET_DISAGREES_WITH_HISTORY`** (T2 addition) — trigger: `sign(C_MA) ≠ sign(C_RTP)` AND `|C_MA| ≥ 0.30` AND `|C_RTP| ≥ 0.30`. Effect: attach the reason AND cap at Moderate. Does NOT force Mixed unless a separate Mixed-forcing rule also applies.

### C.6 Push-heavy handling (DR-9, DR-22)

- L10 pushes > 30% of L10 eligible_n → cap at Moderate + `PUSH_HEAVY_SAMPLE`.

### C.7 One-sided offering (DR-18)

- If `CurrentMarketRow.book_detail.one_sided ∈ {'over_only', 'under_only'}` → `C_MA := 0`, cap at Moderate, attach `ONE_SIDED_OFFERING`.

### C.8 Postponed / canceled games (spec §15.5)

- `games.status = 'postponed'` → **Unavailable** + `POSTPONED_GAME`. The game is not eligible for a current-slate profile.
- `games.status = 'canceled'` → **Unavailable** + `CANCELED_GAME`. Historical windows for OTHER games in the player's history exclude canceled games from their sample.

### C.9 Unresolved mappings (spec §7.2, §7.3)

- `MappingResolutionResult.player_resolved = false` → **Unavailable** + `UNRESOLVED_PLAYER_MAPPING`.
- `MappingResolutionResult.event_resolved = false` → **Unavailable** + `UNRESOLVED_EVENT_MAPPING`.

### C.10 L5-alone Strong prevention — the single unambiguous rule (E.1 correction)

For a profile to receive **Strong Over Evidence** or **Strong Under Evidence**, ALL of the following MUST hold:

1. `|score| ≥ DR-2 (0.55)`.
2. `L10.eligible_n ≥ DR-8 (8)`.
3. `sign(rate_deviation(L10)) == sign(score)` (L10 direction agrees with the composite).
4. **`|0.55 × rate_deviation(L10) + 0.25 × rate_deviation(longer_window) + 0.20 × rate_deviation(season)| ≥ 0.30`** — the DR-11 non-L5 contribution rule, applied to the same three windows aggregated by `C_RTP` in §B.2. This is the single numeric expression enforcing "L5 alone cannot create Strong": since L5 contributes zero to `C_RTP` and this magnitude test uses only `C_RTP`'s three constituent terms, an L5-driven pattern with weak L10/L20/season cannot reach Strong.
5. No cap from §C.2 (INSUFFICIENT_BOOK_COVERAGE), §C.3 (STALE_CURRENT_MARKET), §C.5 (MARKET_DISAGREES_WITH_HISTORY), §C.6 (PUSH_HEAVY_SAMPLE), or §C.7 (ONE_SIDED_OFFERING) fires.
6. `WINDOWS_DISAGREE` (§C.5) does not fire.

If any of 1–6 fails, the profile caps at Moderate at strongest.

---

## D. Classifications

### D.1 Classification thresholds (per A1 §10, GD-15 taxonomy fixed)

Evaluate in this order (first match wins):

1. If any Unavailable condition (§C.3 `NO_CURRENT_MARKET`, §C.8 `POSTPONED_GAME` / `CANCELED_GAME`, §C.9 `UNRESOLVED_*`) → **Unavailable**.
2. If any Insufficient condition (§C.1) → **Insufficient Evidence**.
3. If `WINDOWS_DISAGREE` fires (§C.5 corrected) → **Mixed Evidence**.
4. If `|score| < DR-5 (0.05)` → **Mixed Evidence**.
5. If ALL six §C.10 conditions clear AND `|score| ≥ DR-2 (0.55)`:
   - `score > 0` → **Strong Over Evidence**
   - `score < 0` → **Strong Under Evidence**
6. If `|score| ≥ 0.30` (the lower bound of DR-3):
   - `score > 0` → **Moderate Over Evidence**
   - `score < 0` → **Moderate Under Evidence**
7. Else → **Mixed Evidence**.

Every classified profile carries the score, direction, all component values, all applicable reasons, and a boolean `quality_capped: true | false` indicating whether a Strong-eligible score was capped down.

### D.2 A2 compact-display mapping (GD-15 requirement — DR-21)

GD-15 authorizes A2 §3.3 compact variants for dense surfaces. Rules — enforced always:

1. Every compact variant maps many-to-one onto the A1 §10 taxonomy under the table below.
2. The full A1 classification is reachable without hover — via row expansion, card, or the Research View. Compact display is never the ONLY access to the strength grading (GD-15 d).
3. **Unavailable is NEVER collapsed into Insufficient Evidence.** Distinct labels, distinct visual treatment.
4. **Strength grading (Strong vs Moderate) is NEVER discarded on Discover cards or in the Research View** (GD-15 d).

| A1 §10 classification | Compact variant (dense Board only) | Discover card / Research View — MUST show |
|---|---|---|
| Strong Over Evidence | Over-leaning | **"Strong Over Evidence"** verbatim |
| Moderate Over Evidence | Over-leaning | **"Moderate Over Evidence"** verbatim |
| Mixed Evidence | Mixed | "Mixed Evidence" verbatim |
| Moderate Under Evidence | Under-leaning | **"Moderate Under Evidence"** verbatim |
| Strong Under Evidence | Under-leaning | **"Strong Under Evidence"** verbatim |
| Insufficient Evidence | Insufficient Evidence | "Insufficient Evidence" verbatim |
| Unavailable | Unavailable | "Unavailable" verbatim; NEVER "Insufficient Evidence" |

### D.3 Caps (numeric expression)

- Quality cap ⇒ maximum reachable = Moderate. Compact display still shows "Over-leaning" / "Under-leaning" as appropriate; full display uses Moderate Over / Moderate Under.
- Strong is unreachable when any of §C.10 conditions 2–6 fails.
- Numeric summary: Strong requires `|score| ≥ 0.55` AND every §C.10 clause AND no §C.2/C.3/C.5/C.6/C.7 cap.

### D.4 Surface rules — binding direction to V1-6 / V1-7 / V1-8

This authority does not implement UI, but the following rules bind every downstream surface ticket:

1. **Compact Board / Discover surfaces emphasize:** player and evaluated line; full or compact classification; L5/L10/L20 or season evidence facts; average or median margin where space permits; consensus difference; eligible sportsbook count; current-market freshness or a binding quality cap. They MUST NOT expose the numeric composite score (DR-19).
2. **Where a dense row uses a compact label** (Over-leaning / Under-leaning / Mixed / Insufficient Evidence / Unavailable), the full classification MUST be reachable by expansion or navigation, never hover-only. Strong vs Moderate remains visible on Discover cards and in Research View. A dense row MAY carry a deterministic strength treatment (e.g. a small filled/outlined chip) that maps explicitly to Strong vs Moderate, but it MUST NOT resemble a probability meter.
3. **Research View provides:** full classification; concise rendered explanation; above/below/push counts; `eligible_n` values; margin evidence; cross-book consensus and range; selected-line vs consensus difference; movement context; freshness; provenance; quality caps; reason codes translated to user-facing language; **numeric score and component values ONLY inside the explicit methodology / grade-detail area** (DR-19).
4. **The research interface MAY allow the user to change the evaluated line.** Doing so MUST deterministically re-evaluate every threshold-dependent output (above/below/push counts, margins, consensus difference, classification, direction, reasons, quality-cap state), and the UI MUST make clear the profile changed because the evaluated threshold changed.
5. **No probability-style posture anywhere:** no projected win percentages, outcome probabilities, win-predictor presentations, expected value, ROI, confidence dials resembling probability, or green/red probability splits. Historical outcome coloring is permitted ONLY as observed above/below/equal results, never styled or labeled as a forecast of the next result.
6. **When a profile is capped, compact surfaces SHOULD communicate the binding cap prominently** (e.g. "Moderate Over — stale market", "Moderate Under — limited book coverage"). A user MUST NOT have to open a methodology panel to learn why a Strong-looking profile was capped. This visual emphasis MAY reorder the row's displayed reasons per DR-26's compact-UI clause; it MUST NOT alter the canonical stored order.

   **Ratified compact cap tags (OWNER-RATIFIED 2026-07-16, v1.3).** The five compact tags below are OWNER-RATIFIED user-facing copy — previously an undocumented implementation choice surfaced by V1-A1-4's report §S.2 and enumerated here as owner-approved. A surface needing the full sentence renders the underlying §E translation for the binding cap's reason code instead of the compact tag.

   | quality_cap_reason | ratified compact tag |
   |---|---|
   | stale_current_market | stale market |
   | insufficient_book_coverage | limited book coverage |
   | push_heavy_sample | push-heavy recent sample |
   | market_disagrees_with_history | market disagrees with history |
   | one_sided_offering | one-sided offering |

   `push_heavy_sample`'s tag is presently INERT: every canonical closing point in the seeded season is a half-integer, so no push can occur and the cap never fires (V1-4c Phase B verification). The tag is ratified anyway as correct defensive copy — books may post whole numbers.
7. **Where `includes_backfilled_historical` is true**, use concise surface copy such as "Includes seeded historical closing lines"; the marker MUST NOT be hover-only. Full methodology disclosure MAY live in Research View. Copy MUST NEVER describe such a profile as "observed since launch" (DR-23 c).
8. **Typographical separation of verbatim §E translations is PERMITTED; paraphrase is FORBIDDEN.** Surfaces MAY apply typographical separation between verbatim reason translations — paragraph breaks, line breaks, list items, and spacing — to improve readability. Surfaces MUST NOT paraphrase, rewrite, shorten, merge, or otherwise alter the meaning of any §E translation. The translations are owner-approved copy; presentation is the surface's concern, wording is not.
9. **When a profile's classification is Mixed Evidence, Research View MUST render the computed evidence direction as context alongside the label.** §E translations reference "this direction" (e.g. "Margin evidence works against this direction"). The engine computes a direction from the composite's sign per §B.7 even when the classification is Mixed, but the Mixed label does not name it — leaving direction-referencing reasons without a visible referent. Rendering the computed direction as context keeps them intelligible. This is a presentation requirement; it changes no computed value and no reason.

### D.5 Insufficient vs Unavailable — the distinction (GD-15)

- **Insufficient Evidence** = the engine COULD run but the historical sample or coverage is too thin to make any confident directional statement. Sample-side and coverage-side conditions (§C.1).
- **Unavailable** = the engine CANNOT truthfully run because a required upstream input is missing (§C.3 no current market, §C.8 postponed/canceled, §C.9 unresolved identity).

These states MUST NEVER collapse into each other in display or in reason codes.

---

## E. Reason codes — closed vocabulary

Every machine reason has exactly one trigger, one category, one effect, one safe translation. User-facing translations pass A1 §27.6 (no `guaranteed`, `lock`, `sure thing`, `probability`, `expected value`, `free money`, `risk-free`, `safest bet`, `proven winner`).

### E.1 The closed vocabulary

Governor T3 removes the direction-tagged `STRONG_OVER_AGREEMENT` and `STRONG_UNDER_AGREEMENT` reasons in favor of a single direction-neutral `WINDOW_AGREEMENT_SUPPORT`. Per A1 §26 ("at minimum, support or map equivalent codes"), `WINDOW_AGREEMENT_SUPPORT` is the equivalent mapping.

| Reason code | Category | Trigger condition | Effect | User-facing translation |
|---|---|---|---|---|
| `INSUFFICIENT_L10_SAMPLE` | Exclusion → Insufficient | §C.1: `L10.eligible_n < 5` | force Insufficient | "Fewer than 5 eligible recent games. Sample is too small to grade evidence." |
| `INCOMPLETE_HISTORICAL_COVERAGE` | Exclusion → Insufficient / Downgrade | §C.1: season sample below DR-7 OR historical coverage < DR-25 | force Insufficient when triggering, else attach | "Historical coverage is incomplete for this player. Longer-term evidence limited." |
| `STALE_CURRENT_MARKET` | Downgrade | §C.3: `freshness.state ∈ {'stale', 'failed_latest_poll'}` with `eligible_book_count.count ≥ 1` | cap at Moderate | "The current market snapshot is stale. Line and price context may not reflect the current market." |
| `INSUFFICIENT_BOOK_COVERAGE` | Downgrade | §C.2: `eligible_book_count.count < 3` | cap at Moderate | "Fewer than 3 eligible sportsbooks offer this market. Cross-book confirmation is limited." |
| `WINDOWS_DISAGREE` | Downgrade → Mixed | §C.5 corrected: any pair among L10 / L20 / season with opposite non-zero signs and each `|rate_deviation| ≥ 0.30` | force Mixed | "Recent and longer-window evidence point in different directions." |
| `PUSH_HEAVY_SAMPLE` | Downgrade | §C.6: L10 pushes > 30% of L10 sample | cap at Moderate | "A large share of recent games landed exactly on the line. Direction is less clear." |
| `UNRESOLVED_PLAYER_MAPPING` | Unavailable | §C.9: player mapping queue open | force Unavailable | "Player identity is under review. Evidence cannot be graded yet." |
| `UNRESOLVED_EVENT_MAPPING` | Unavailable | §C.9: event mapping queue open | force Unavailable | "Game identity is under review. Evidence cannot be graded yet." |
| `NO_CURRENT_MARKET` | Unavailable | §C.3: no usable current market per the disambiguation table | force Unavailable | "No current market is available. Evidence cannot be graded." |
| **`NO_UNIQUE_CONSENSUS_LINE`** (v1.2 addition per DR-28) | Exclusion → Unavailable | §C.3.1: `line_consensus.selection_method = 'tied_no_unique_mode'` AND `line_consensus.consensus_point IS NULL` AND `eligible_book_count.count > 0` (ALL three required). NEGATIVE SCOPE: MUST NOT be used when there are zero eligible sportsbook offerings; when the market source is unavailable; when current-market freshness is `unavailable`; or when consensus is absent for any reason other than `tied_no_unique_mode` — those states remain governed by their existing reasons, including `NO_CURRENT_MARKET` where factually applicable. | force Unavailable (PRIMARY reason). No tiebreak: engine MUST NOT choose lower/upper/average/first-observed/single-book fallback. `evaluated_line` remains null. `tied_no_unique_mode` + underlying point distribution preserved in audit / provenance. | "Eligible sportsbooks are evenly split on this line, so no single consensus line can be established." |
| `POSTPONED_GAME` | Unavailable | §C.8: `games.status = 'postponed'` | force Unavailable | "Game postponed. Evidence not applicable to this scheduled slot." |
| `CANCELED_GAME` | Unavailable | §C.8: `games.status = 'canceled'` | force Unavailable | "Game canceled." |
| `ONE_SIDED_OFFERING` | Downgrade | §C.7: `book_detail.one_sided ∈ {'over_only', 'under_only'}` | cap at Moderate; set `C_MA := 0` | "Only one side is offered across eligible sportsbooks. Cross-side comparison isn't available." |
| `SOURCE_UNAVAILABLE` | Attach (no effect on classification alone) | `availability_context.presence_state = 'source_unavailable'` | attach only | "The availability feed is currently unavailable. Availability context is limited." |
| `WINDOW_AGREEMENT_SUPPORT` (T3) | Support (inclusion) | `|C_WA| ≥ 0.60` AND `sign(C_WA) == direction` | attach; describes agreement without implying Strong | "Recent and longer-window results point in the same direction." |
| `FAVORABLE_CONSENSUS_DIFFERENCE` | Support | Evaluated line is DR-15 (≥ 0.5) more favorable to the evaluated direction than sportsbook consensus (for Over: `E ≤ C − 0.5`; for Under: `E ≥ C + 0.5`) | attach | Direction-neutral: "The selected line is more favorable than sportsbook consensus for this direction." |
| `UNFAVORABLE_CONSENSUS_DIFFERENCE` | Contradiction | Evaluated line is DR-15 (≥ 0.5) less favorable to the evaluated direction than consensus | attach | Direction-neutral: "The selected line is less favorable than sportsbook consensus for this direction." |
| `POSITIVE_MARGIN_SUPPORT` | Support | `sign(C_MS) == sign(score)` AND `|C_MS| ≥ 0.30` | attach | "Recent average and/or median margin support this direction." |
| `NEGATIVE_MARGIN_SUPPORT` | Contradiction | `sign(C_MS) ≠ sign(score)` AND `|C_MS| ≥ 0.30` | attach | "Margin evidence works against this direction." |
| **`MARKET_DISAGREES_WITH_HISTORY`** (T2 addition) | Contradiction / Downgrade | `sign(C_MA) ≠ sign(C_RTP)` AND `|C_MA| ≥ 0.30` AND `|C_RTP| ≥ 0.30` | attach; cap at Moderate; do NOT force Mixed unless another Mixed-forcing rule (e.g. `WINDOWS_DISAGREE`) also applies | Direction-neutral: "Current market context points in a different direction from the historical results." |
| **`MARGIN_MEASURES_DISAGREE`** (E.4 addition) | Contradiction | L10 `avg_minus_threshold` and L10 `median_minus_threshold` have opposite non-zero signs | attach; do NOT independently force Mixed; do NOT independently cap unless another rule applies | "Recent average and median results fall on opposite sides of the selected line." |
| **`ABNORMAL_DISPERSION`** (RESERVED) | **RESERVED — NOT EMITTED IN `evidence_method_v1`** | **No active trigger.** Amendment §11.5 authorizes an abnormal-dispersion penalty; DR-27 remains DEFERRED per the owner's 2026-07-15 ruling (see §I.3 numbered return condition). **Engine prohibition (until DR-27 is affirmatively activated):** V1-A1-3 MUST NOT invent a `K` value; MUST NOT emit `ABNORMAL_DISPERSION`; MUST NOT approximate or silently apply a dispersion cap. Abnormal dispersion MAY be computed for audit or future-calibration purposes ONLY if clearly non-operative — it may not influence any classification, cap, score, or reason attached to a profile. Any attempt to auto-tune `K`, activate the cap silently, or emit this code from an inferred rule is a halt condition. | **None in `evidence_method_v1`** (no cap, no downgrade, no attach). Activation requires a DR-24 method-version bump AND regression fixtures per A1 §12. | Not applicable in `evidence_method_v1`. No user-facing translation is emitted because no profile carries this code. |

**Removed per T3:** `STRONG_OVER_AGREEMENT`, `STRONG_UNDER_AGREEMENT` — replaced by the single direction-neutral `WINDOW_AGREEMENT_SUPPORT`, available for Moderate as well as Strong.

### E.2 Reasons on every profile

- **Canonical stored order (DR-26):** (1) primary supporting evidence, (2) contradicting evidence, (3) quality/coverage limitations. Within category, ordered by absolute contribution magnitude descending; ties broken lexicographically by reason code.
- **Compact UI clause (DR-26):** compact surfaces MAY visually elevate a binding cap or availability limitation ahead of support text for user comprehension; this visual reordering MUST NOT alter the canonical stored order in the profile record.
- The primary reason drives the deterministic explanation (§F worked examples).

---

## F. Worked examples

Each example: raw inputs (all windows explicit, including L5 per T4) → component values → composite score → classification → reason codes → rendered explanation. All numbers are hand-computed against the formulas in §B; the engine implementation MUST reproduce them exactly at `evidence_method_v1`.

### F.1 Moderate Over — clean but not quite Strong (calibration reference)

**Inputs:**
- `market = player_points`, evaluated line = 19.5
- L5: over 4 / under 1 / push 0 (`eligible_n = 5`) — `rate_deviation = (2 × 4/5) − 1 = 0.60`, sign +1
- L10: over 8 / under 2 / push 0 (`eligible_n = 10`); `avg_minus_threshold = +2.6`, `median_minus_threshold = +2.5` — `rate_deviation = (2 × 8/10) − 1 = 0.60`, sign +1
- L20: over 14 / under 5 / push 1 (`eligible_n = 20`); `rate_deviation = (2 × 14/19) − 1 = 0.4737`, sign +1
- season: over 42 / under 20 / push 3 (`eligible_n = 65`); `rate_deviation = (2 × 42/62) − 1 = 0.3548`, sign +1; `avg_minus_threshold = +1.8`, `median_minus_threshold = +2.0`
- consensus = 20.0; range 19.5–20.5; distribution `{19.5: 2, 20.0: 4, 20.5: 2}`; `eligible_book_count = 8`; `first_observed_point = 20.0` at `T-90m`; `movement_summary.net_point_movement = 0.0`; `freshness.state = 'fresh'`
- `includes_backfilled_historical = false`

**Component values:**
- `longer_window = L20` (`eligible_n = 20 ≥ 10`)
- `C_RTP = 0.55 × 0.60 + 0.25 × 0.4737 + 0.20 × 0.3548 = 0.3300 + 0.1184 + 0.0710 = 0.5194`
- Margin normalizer for points = 6.0. Margin norms: `+2.6/6.0 = 0.4333`; `+2.5/6.0 = 0.4167`; `+1.8/6.0 = 0.3000`; `+2.0/6.0 = 0.3333`. All four terms available → no T1 re-weighting.
- `C_MS = 0.40 × 0.4333 + 0.30 × 0.4167 + 0.20 × 0.3000 + 0.10 × 0.3333 = 0.1733 + 0.1250 + 0.0600 + 0.0333 = 0.3916`
- `C_WA`: signs = [L5 +1, L10 +1, L20 +1, season +1]; dominant = +1; all agree → `C_WA_raw = 0.10 + 0.40 + 0.25 + 0.25 = 1.00`; `C_WA = +1.00`
- `C_MA`: `consensus_gap = 20.0 − 19.5 = +0.5`; norm = `0.5/6.0 = 0.0833`; `coverage_at_line at E=19.5 = 2` of 8 → `coverage_norm = 0.25`; `movement_dir = 0`. `C_MA = 0.60 × 0.0833 + 0.20 × 0.25 × (+1) + 0.20 × 0 = 0.0500 + 0.0500 + 0 = 0.1000`
- **`score = 0.35 × 0.5194 + 0.25 × 0.3916 + 0.20 × 1.00 + 0.20 × 0.1000 = 0.1818 + 0.0979 + 0.2000 + 0.0200 = 0.4997`**

**Classification:** `|score| = 0.4997 ∈ [0.30, 0.55)` → **Moderate Over Evidence**. Strong is unreachable at `|score| < 0.55` even though every §C.10 condition 2–6 clears.

**Reasons (stored order):**
1. Support: `POSITIVE_MARGIN_SUPPORT` (C_MS = +0.39 supports direction, `|C_MS| ≥ 0.30`), `WINDOW_AGREEMENT_SUPPORT` (`|C_WA| = 1.00 ≥ 0.60` and sign matches), `FAVORABLE_CONSENSUS_DIFFERENCE` (evaluated 19.5 is 0.5 below consensus 20.0 → meets DR-15).
2. Contradictions: (none).
3. Quality: (none).

`MARGIN_MEASURES_DISAGREE`? L10 avg = +2.6, median = +2.5 — same sign → does NOT fire.
`MARKET_DISAGREES_WITH_HISTORY`? sign(C_MA) = +1, sign(C_RTP) = +1 — agree → does NOT fire.

**Rendered explanation:** "Moderate Over Evidence. The player exceeded 19.5 in 8 of the last 10 qualifying games and averaged 2.6 points above the threshold. The selected line is 0.5 below sportsbook consensus. Longer-window results (L20 hit rate 74%, season 68%) also point Over. The composite magnitude is below the Strong threshold, so the profile is classified as Moderate."

### F.1a Strong Over — cleaner variant crossing DR-2 = 0.55

**Inputs:** identical to F.1 EXCEPT L10 = over 9 / under 1 / push 0 → L10 `rate_deviation = 0.80`; L10 `avg_minus_threshold = +3.9`; consensus_gap widens to 1.0 (evaluated line still 19.5, consensus moves to 20.5).

**Component values:**
- `C_RTP = 0.55 × 0.80 + 0.25 × 0.4737 + 0.20 × 0.3548 = 0.4400 + 0.1184 + 0.0710 = 0.6294`
- Margins norms with L10.avg raised: `+3.9/6.0 = 0.6500`; others unchanged (`+2.5/6.0 = 0.4167`; `+1.8/6.0 = 0.3000`; `+2.0/6.0 = 0.3333`).
- `C_MS = 0.40 × 0.6500 + 0.30 × 0.4167 + 0.20 × 0.3000 + 0.10 × 0.3333 = 0.2600 + 0.1250 + 0.0600 + 0.0333 = 0.4783`
- `C_WA = +1.00` (all four signs +1)
- `C_MA`: `consensus_gap = 20.5 − 19.5 = +1.0`; norm = `1.0/6.0 = 0.1667`; `coverage_at_line = 2/8 = 0.25`; `movement_dir = 0`. `C_MA = 0.60 × 0.1667 + 0.20 × 0.25 × (+1) + 0 = 0.1000 + 0.0500 = 0.1500`
- **`score = 0.35 × 0.6294 + 0.25 × 0.4783 + 0.20 × 1.00 + 0.20 × 0.1500 = 0.2203 + 0.1196 + 0.2000 + 0.0300 = 0.5699`**

**Classification (§C.10 gate):**
1. `|score| = 0.5699 ≥ 0.55` ✓
2. `L10.eligible_n = 10 ≥ 8` ✓
3. `sign(rate_deviation(L10)) = +1 == sign(score) = +1` ✓
4. Non-L5 magnitude: `|0.55 × 0.80 + 0.25 × 0.4737 + 0.20 × 0.3548| = |0.6294| ≥ 0.30` ✓
5. No cap: freshness fresh; 8 books; no push-heavy; two-sided; `sign(C_MA) = +1 == sign(C_RTP) = +1` so `MARKET_DISAGREES_WITH_HISTORY` does NOT fire. ✓
6. `WINDOWS_DISAGREE`: no pair among L10/L20/season has opposite signs → does NOT fire. ✓

→ **Strong Over Evidence.**

**Reasons (stored order):** `POSITIVE_MARGIN_SUPPORT`, `WINDOW_AGREEMENT_SUPPORT`, `FAVORABLE_CONSENSUS_DIFFERENCE`. No contradiction or quality reasons; `quality_capped = false`.

**Rendered explanation:** "Strong Over Evidence. The player exceeded 19.5 in 9 of the last 10 qualifying games and averaged 3.9 points above the threshold. The selected line is 1.0 below sportsbook consensus, and results across L10, L20, and season all point Over. The composite magnitude crosses the Strong threshold with agreement across every long-run window and no quality cap."

**Calibration contrast against F.1:** the same L10 hit rate rises from 8/10 to 9/10 with a stronger margin, pushing the score from 0.4997 → 0.5699 and the classification from Moderate Over to **Strong Over** under DR-2 = 0.55.

### F.2 Moderate Under (T4 — explicit L5 inputs)

**Inputs:**
- `market = player_rebounds`, evaluated line = 8.5
- **L5: over 1 / under 4 / push 0 (`eligible_n = 5`) — `rate_deviation = (2 × 1/5) − 1 = −0.60`, sign −1**
- L10: over 3 / under 6 / push 1 (`eligible_n = 10`); `avg_minus_threshold = −1.1`, `median_minus_threshold = −1.0` — `rate_deviation = (2 × 3/9) − 1 = −0.3333`, sign −1
- L20: over 7 / under 12 / push 1 (`eligible_n = 20`); `rate_deviation = (2 × 7/19) − 1 = −0.2632`, sign −1
- season: over 20 / under 30 / push 2 (`eligible_n = 52`); `rate_deviation = (2 × 20/50) − 1 = −0.2000`, sign −1; `avg_minus_threshold = −0.5`, `median_minus_threshold = −0.5`
- consensus = 8.0; range 8.0–9.0; distribution `{8.0: 5, 8.5: 2, 9.0: 1}`; `eligible_book_count = 8`; `net_point_movement = −0.5`; `freshness = fresh`
- `includes_backfilled_historical = false`

**Component values:**
- `longer_window = L20` (`eligible_n = 20 ≥ 10`)
- `C_RTP = 0.55 × (−0.3333) + 0.25 × (−0.2632) + 0.20 × (−0.2000) = −0.1833 − 0.0658 − 0.0400 = −0.2891`
- Margin normalizer for rebounds = 3.0. Norms: `−1.1/3.0 = −0.3667`; `−1.0/3.0 = −0.3333`; `−0.5/3.0 = −0.1667`; `−0.5/3.0 = −0.1667`. All four terms available.
- `C_MS = 0.40 × (−0.3667) + 0.30 × (−0.3333) + 0.20 × (−0.1667) + 0.10 × (−0.1667) = −0.1467 − 0.1000 − 0.0333 − 0.0167 = −0.2967`
- `C_WA`: signs = [L5 −1, L10 −1, L20 −1, season −1]. Weighted sum for dominance = `0.10 × (−1) + 0.40 × (−1) + 0.25 × (−1) + 0.25 × (−1) = −1.00`. `sign(−1.00) = −1` → dominant = −1. Each entry matches dominant → contributes `+weight`; then `C_WA_raw = +(0.10 + 0.40 + 0.25 + 0.25) = +1.00`. Applying the dominant sign to the Over-signed component: `C_WA = −1.00` (all-Under agreement is a negative Over-signed value).
- `C_MA`: `consensus_gap = 8.0 − 8.5 = −0.5`; norm = `−0.5/3.0 = −0.1667`; `coverage_at_line = 2/8 = 0.25`; `movement_dir = −0.5/3.0 = −0.1667`. `C_MA = 0.60 × (−0.1667) + 0.20 × 0.25 × sign(−0.1667) + 0.20 × (−0.1667) = −0.1000 + 0.20 × 0.25 × (−1) + (−0.0333) = −0.1000 − 0.0500 − 0.0333 = −0.1833`
- **`score = 0.35 × (−0.2891) + 0.25 × (−0.2967) + 0.20 × (−1.00) + 0.20 × (−0.1833) = −0.1012 − 0.0742 − 0.2000 − 0.0367 = −0.4121`**

**Classification:** `|score| = 0.4121 ∈ [0.30, 0.55)` → **Moderate Under Evidence**.

**Reasons (stored order):**
- `POSITIVE_MARGIN_SUPPORT`? Trigger: `sign(C_MS) == sign(score) AND |C_MS| ≥ 0.30`. `sign(C_MS) = −1, sign(score) = −1` ✓ but `|C_MS| = 0.2967 < 0.30` → **does NOT fire.**
- `WINDOW_AGREEMENT_SUPPORT`: `|C_WA| = 1.00 ≥ 0.60` AND `sign(C_WA) = −1 == direction = 'under'` ✓ → fires.
- `FAVORABLE_CONSENSUS_DIFFERENCE`: evaluated 8.5 is 0.5 above consensus 8.0 → for Under evaluation this is favorable (`E ≥ C + 0.5`) ✓ → fires.
- Contradictions: `MARKET_DISAGREES_WITH_HISTORY`? `sign(C_MA) = −1, sign(C_RTP) = −1` — agree → does NOT fire. `MARGIN_MEASURES_DISAGREE`? L10 avg −1.1, median −1.0 — same sign → does NOT fire.
- Quality: none.

Stored:
1. Support: `WINDOW_AGREEMENT_SUPPORT`, `FAVORABLE_CONSENSUS_DIFFERENCE`.
2. Contradictions: (none).
3. Quality: (none).

**Rendered explanation:** "Moderate Under Evidence. The player stayed under 8.5 in 6 of the last 10 qualifying games (excluding 1 push) and in 4 of the last 5. The selected line is 0.5 above sportsbook consensus. Longer-window results also point Under. Margin evidence is directionally consistent but modest in magnitude, so the profile classifies as Moderate rather than Strong."

### F.3 Mixed by contradiction (DR-17 corrected — L10 vs L20 pair fires)

**Inputs:**
- `market = player_assists`, evaluated line = 5.5
- **L5: over 4 / under 1 / push 0 (`eligible_n = 5`) — `rate_deviation = (2 × 4/5) − 1 = 0.60`, sign +1**
- L10: over 8 / under 2 / push 0 (`eligible_n = 10`); `rate_deviation = 0.60`, sign +1; `avg_minus_threshold = +1.1`, `median_minus_threshold = +1.0`
- L20: over 6 / under 13 / push 1 (`eligible_n = 20`); `rate_deviation = (2 × 6/19) − 1 = −0.3684`, sign −1
- season: over 22 / under 30 / push 3 (`eligible_n = 55`); `rate_deviation = (2 × 22/52) − 1 = −0.1538`, sign −1; `avg_minus_threshold = −0.4`, `median_minus_threshold = −0.4`
- consensus = 5.5; range 5.0–6.0; distribution `{5.0: 1, 5.5: 4, 6.0: 1}`; `eligible_book_count = 6`; `net_point_movement = 0.0`; `freshness = fresh`

**Corrected DR-17 evaluation (any pair among L10/L20/season, opposite non-zero signs, each `|rd| ≥ 0.30`):**
- L10 sign +1, `|rd| = 0.60`.
- L20 sign −1, `|rd| = 0.3684`.
- season sign −1, `|rd| = 0.1538`.
- **L10 vs L20 pair:** opposite signs ✓ AND both `|rd| ≥ 0.30` (0.60 and 0.3684 ✓) → **`WINDOWS_DISAGREE` fires.**
- L10 vs season: opposite signs but season `|rd| = 0.1538 < 0.30` → does not fire on this pair.
- L20 vs season: same sign (both −1) → does not fire.

**Classification (§D.1 step 3):** `WINDOWS_DISAGREE` fires → **Mixed Evidence** regardless of composite. Composite still recorded for auditability:

- `longer_window = L20`.
- `C_RTP = 0.55 × 0.60 + 0.25 × (−0.3684) + 0.20 × (−0.1538) = 0.3300 − 0.0921 − 0.0308 = 0.2071`.
- Margin normalizer for assists = 2.0. `+1.1/2.0 = 0.5500`; `+1.0/2.0 = 0.5000`; `−0.4/2.0 = −0.2000`; `−0.4/2.0 = −0.2000`.
- `C_MS = 0.40 × 0.5500 + 0.30 × 0.5000 + 0.20 × (−0.2000) + 0.10 × (−0.2000) = 0.2200 + 0.1500 − 0.0400 − 0.0200 = 0.3100`.
- `C_WA`: signs = [L5 +1, L10 +1, L20 −1, season −1]. Weighted sum for dominance = `0.10 + 0.40 − 0.25 − 0.25 = 0.00`. `sign(0) = 0` (no dominant direction). Compute `C_WA_raw` with `dominant = 0`: each non-zero `signs[i]` NOT equal to `0` contributes `−weight` (per the formula's `-1` branch); no zero-sign entries. `C_WA_raw = −0.10 − 0.40 − 0.25 − 0.25 = −1.00`. Clamped: `C_WA = −1.00`.
- `C_MA`: `consensus_gap = 5.5 − 5.5 = 0`; norm = 0; `coverage_at_line = 4/6 = 0.6667`; `movement_dir = 0`. `C_MA = 0.60 × 0 + 0.20 × 0.6667 × 0 + 0.20 × 0 = 0`.
- `score = 0.35 × 0.2071 + 0.25 × 0.3100 + 0.20 × (−1.00) + 0.20 × 0 = 0.0725 + 0.0775 − 0.2000 + 0 = −0.0500`.

Classification remains Mixed (forced at step 3). Composite is informational only.

**Additional contradiction reasons evaluated:**
- `MARGIN_MEASURES_DISAGREE`? L10 avg +1.1, median +1.0 — same sign → does NOT fire.
- `MARKET_DISAGREES_WITH_HISTORY`? `|C_MA| = 0 < 0.30` → does NOT fire.
- `POSITIVE_MARGIN_SUPPORT` / `NEGATIVE_MARGIN_SUPPORT`: `|C_MS| = 0.31 ≥ 0.30`. `sign(C_MS) = +1`, `sign(score) = −1` (score = −0.05) → signs disagree → `NEGATIVE_MARGIN_SUPPORT` fires.
- `WINDOW_AGREEMENT_SUPPORT`? `|C_WA| = 1.00 ≥ 0.60`, but `sign(C_WA) = −1` vs the profile direction. Since the classification is Mixed (no direction picked), this reason does NOT attach — WINDOW_AGREEMENT_SUPPORT requires a direction to match against.

**Reasons (stored order):**
1. Support: (none — no directional support attaches on Mixed profiles above the 0.30 magnitude bar consistent with a direction).
2. Contradictions: `WINDOWS_DISAGREE` (primary — forced Mixed), `NEGATIVE_MARGIN_SUPPORT` (recent margin evidence and composite direction disagree).
3. Quality: (none).

**Rendered explanation:** "Mixed Evidence. Recent L10 results support the Over (8 of 10 above 5.5 with average 1.1 assists above the threshold), but longer-window results point Under (L20 hit rate 32%, season below break-even at 42%). Because L10 and L20 disagree strongly, the profile is classified as Mixed."

### F.4 Insufficient by sample

**Inputs:**
- Player has 3 eligible L10 games (recent debut or injury return).
- L5: over 2 / under 1 / push 0 (`eligible_n = 3`)
- L10: over 2 / under 1 / push 0 (`eligible_n = 3`)
- L20: same rows (`eligible_n = 3`)
- season: over 2 / under 1 / push 0 (`eligible_n = 3`)
- consensus = 12.5; `eligible_book_count = 8`; `freshness = fresh`

**Classification (§C.1):** `L10.eligible_n = 3 < DR-6 (5)` → **Insufficient Evidence**.

**Reasons (stored order):**
1. Primary support / contradictions: (not evaluated for Insufficient),
2. Quality: `INSUFFICIENT_L10_SAMPLE` (primary), `INCOMPLETE_HISTORICAL_COVERAGE` (season < DR-7).

**Rendered explanation:** "Insufficient Evidence. This player has fewer than 5 eligible recent games at the current threshold, so evidence cannot be graded. Consult the underlying data for context."

### F.5 Unavailable by freshness

**Inputs:**
- `freshness.state = 'unavailable'` (source outage — no successful poll in the last window per Odds §19.2)
- `eligible_book_count.count = 0`
- Historical data intact: L10 over 7 / under 3 / push 0.

**Classification (§C.3 disambiguation table row `unavailable`, any book count):** **Unavailable**.

**Reasons:** `NO_CURRENT_MARKET`.

**Rendered explanation:** "Unavailable. No current market snapshot is available for this player-market. Evidence cannot be graded until a fresh sportsbook snapshot is retrieved."

Compact display MUST show "Unavailable", NEVER "Insufficient Evidence" (GD-15 c / §D.5).

### F.6 Quality-capped — Strong-eligible pattern capped down by staleness and thin coverage

**Inputs:**
- `market = player_points`, evaluated line = 22.5
- L5: over 4 / under 1 / push 0 — `rate_deviation = 0.60`, sign +1
- L10: over 8 / under 2 / push 0 — `rate_deviation = 0.60`, sign +1; `avg_minus_threshold = +2.6`, `median_minus_threshold = +2.5`
- L20: over 14 / under 5 / push 1 — `rate_deviation = 0.4737`, sign +1
- season: over 42 / under 20 / push 3 — `rate_deviation = 0.3548`, sign +1; `avg_minus_threshold = +1.8`, `median_minus_threshold = +2.0`
- consensus = 21.5 (evaluated line is 22.5, so `consensus_gap = 21.5 − 22.5 = −1.0` → norm = −0.1667); `net_point_movement = −0.5` (market moved DOWN, Under-supporting → `movement_dir = −0.5/6.0 = −0.0833`); `eligible_book_count = 2` (below DR-10); `freshness.state = 'stale'`; `book_detail.one_sided = 'neither'`; `coverage_at_line = 0` of 2 → `coverage_norm = 0`.
- `includes_backfilled_historical = false`

**Component values:**
- `C_RTP = 0.55 × 0.60 + 0.25 × 0.4737 + 0.20 × 0.3548 = 0.5194` (same as F.1)
- `C_MS = 0.3916` (same as F.1)
- `C_WA = +1.00` (all four signs +1)

**§C.3 disambiguation:** `freshness.state = 'stale'` with `eligible_book_count.count = 2 (≥ 1)` → cap at Moderate + `STALE_CURRENT_MARKET`. `C_MA` STILL computes here — the "empty consensus" clause fires only when the consensus itself is unresolved OR §C.7 one-sided fires, not merely because the market is stale:

- `C_MA = 0.60 × (−0.1667) + 0.20 × 0 × sign(−0.1667) + 0.20 × (−0.0833) = −0.1000 + 0 − 0.0167 = −0.1167`

- **`score = 0.35 × 0.5194 + 0.25 × 0.3916 + 0.20 × 1.00 + 0.20 × (−0.1167) = 0.1818 + 0.0979 + 0.2000 − 0.0233 = 0.4564`**

**Classification order (§D.1):**
1. No Unavailable.
2. No Insufficient (L10 = 10 ≥ 5, season = 65 ≥ 10).
3. No `WINDOWS_DISAGREE` (all signs agree).
4. `|score| = 0.4564 ≥ 0.05`.
5. Would-be Strong requires `|score| ≥ 0.55` AND §C.10 conditions. `|score| = 0.4564 < 0.55` → does NOT reach Strong on magnitude alone. Additionally §C.10 clause 5 would fail (staleness cap; coverage cap).
6. `|score| ≥ 0.30` → **Moderate Over Evidence**.

Independently: `|C_MA| = 0.1167 < 0.30` → `MARKET_DISAGREES_WITH_HISTORY` does NOT fire on this configuration; the cap is driven by staleness + book coverage. `quality_capped = true` (§D.1 step 5's cap-clear clause fails via §C.2 and §C.3).

**Reasons (stored order):**
1. Support: `POSITIVE_MARGIN_SUPPORT` (`|C_MS| = 0.39 ≥ 0.30`, `sign(C_MS) = +1 == sign(score) = +1`), `WINDOW_AGREEMENT_SUPPORT` (`|C_WA| = 1.00 ≥ 0.60`, sign matches direction).
2. Contradictions: `UNFAVORABLE_CONSENSUS_DIFFERENCE` — evaluated line 22.5 sits a full point against the Over direction versus consensus 21.5 (`E − C = +1.0 ≥ 0.5` per DR-15; for Over, unfavorable when `E ≥ C + 0.5`), so DR-15's trigger fires unambiguously.
3. Quality: `INSUFFICIENT_BOOK_COVERAGE`, `STALE_CURRENT_MARKET`.

*Rationale for the `UNFAVORABLE_CONSENSUS_DIFFERENCE` inclusion (v1.3 documentation correction).* F.6's evaluated line sits a full point against its own evidence direction, so DR-15's trigger (a consensus difference of at least 0.5 stat units against the evaluated direction) fires unambiguously. §E.1 is authoritative on triggers; §F is illustrative. The engine emits this reason correctly today — V1-A1-3 Phase A reported the discrepancy rather than silently reconciling it, which is how it was found. This edit aligns the example's stated reason list with the method; it does not change the method. F.6's inputs, component values (`C_RTP = 0.5194`, `C_MS = 0.3916`, `C_WA = +1.00`, `C_MA = −0.1167`), composite score (`0.4564`), classification (Moderate Over Evidence), and `quality_capped = true` state are UNCHANGED, as are its cap-binding reasons (`INSUFFICIENT_BOOK_COVERAGE`, `STALE_CURRENT_MARKET`).

**Rendered explanation:** "Moderate Over Evidence — market context capped the classification. Recent and longer-window results support the Over. Fewer than 3 eligible sportsbooks quote this market and the current snapshot is stale, so the classification is capped at Moderate rather than Strong."

**Compact-surface hint (DR-26 clause):** the row may render "Moderate Over — stale market, limited books" so the user sees the binding caps at a glance without hiding them behind a methodology panel. The canonical stored reason order above is unchanged; only the visual emphasis is reordered.

---

## G. Disclosures — required text and placement

Two verbatim disclosures. Every product surface that renders an Evidence Profile MUST include the first; the second is required when a numeric score is displayed (which per DR-19 is Research View / grade-detail area only).

### G.1 Near any ranked Evidence Profile (Discover cards, Board rows, Research View, Compare Your Line result, Research List entries)

> "Evidence profiles summarize historical results and current market information. They are research tools, not guarantees or predicted probabilities."

Placement: adjacent to the classification label OR in a persistent methodology-link position that meets accessibility affordances. May not be hidden behind hover-only or click-only affordances that would let a keyboard user miss it.

### G.2 Where a numeric score is displayed (DR-19 — Research View / grade-detail only)

> "Evidence Strength is a transparent research-ranking score. It is not the estimated probability that a prop will hit."

Placement: adjacent to the numeric score value; not hover-only.

### G.3 Methodology page (per A1 §22)

The methodology page MUST explain:
- historical results do not guarantee future outcomes;
- threshold hit rate is not predictive probability;
- current lines may already reflect public information;
- recent samples may be noisy;
- player roles and availability may change;
- market prices and lines may move;
- missing or stale data can affect the profile;
- SlipLabz does not place wagers or determine stake sizes.

### G.4 Copy safety (A1 §27.6)

None of the translations in §E, none of the rendered explanations in §F, and no user-facing string produced by the engine or its templates may contain: `guaranteed`, `lock`, `can't miss`, `free money`, `sure thing`, `guaranteed winner`, `probability` (as a claim about a prop outcome), `expected value` (as a claim about a prop outcome), `EV`, `+EV`, `ROI` (as a claim about future returns), `risk-free`, `safest bet`, or `proven winner`. The V1-A1-4 templates ticket must ship forbidden-language tests that reject these terms in any generated explanation.

Permitted labels: "Strong Over Evidence", "Moderate Under Evidence", "Mixed Evidence", "evidence supports the Over", "evidence supports the Under", "ranked by Evidence Strength", "one of today's strongest qualifying profiles".

---

## H. Reproducibility

- **Method version identifier (locked):** `evidence_method_v1`.
- **Version bump triggers:** DR-24.
- **Audit reconstruction:** Given a stored profile row (V1-A1-2 schema) and this document at the referenced `method_version`, the direction, classification, and every component value MUST be reproducible from the profile's referenced source records:
  - `historical_line_results` rows at the referenced `computation_version`,
  - `real_line_windows` rows,
  - `threshold_windows` computed against the profile's stored `evaluated_line` (or a stored `ThresholdWindowResult` snapshot per V1-A1-2's decision),
  - `CurrentMarketRow` at the referenced `market_snapshot_id` set,
  - `bdl_availability_current_state` at the referenced `bdl_availability_snapshot_id`,
  - `HistoricalCoverageResult` at the referenced snapshot (RME-1 read-model surface),
  - `MappingResolutionResult` at the referenced snapshot (RME-2 read-model surface),
  - `CurrentMarketRow.book_detail.one_sided` (RME-3 read-model surface).
- A profile whose classification cannot be reproduced fails A1 §23.3. It must be recomputed or marked Unavailable pending recomputation.

---

## I. Prerequisites and open questions

### I.1 Pre-engine offline validation — DISCHARGED for DR-14; DR-27 evidence gathered and decision deferred

**Status: PERFORMED 2026-07-15.** The zero-provider-credit offline sanity check called for by this section was executed against the seeded historical season data, read-only, zero provider credits. Its evidence is `docs/product/reports/V1_DR14_DR27_CALIBRATION.md` (corrected re-run at that path). **The §I.1 pre-engine validation gate is DISCHARGED for DR-14 and therefore no longer blocks V1-A1-3.** DR-27 remains formally deferred under a new return condition — see §I.3.

**Outcome — DR-14 (validated, no change):** the corrected calibration validated the approved margin normalizers with no change (`M_points = 6.0`, `M_rebounds = 3.0`, `M_assists = 2.0`, `M_threes = 1.5`). Measured on the actual §B.3 C_MS inputs, weighted `|C_MS|` saturation is `player_points 4.76 %`, `player_rebounds 3.54 %`, `player_assists 2.41 %`, `player_threes 5.26 %` — no market is a saturation outlier. `player_threes` was reviewed specifically and REMAINS at 1.5; raising it to 2.0 would zero the observed clamp rates and risk systematically suppressing the attainable C_MS contribution for threes relative to the other markets. The DR-14 row in the Decision Register carries the [OWNER APPROVED — VALIDATED 2026-07-15] stamp with the full owner ruling recorded.

**Outcome — DR-27 (evidence gathered, decision deferred):** the L10 margin-dispersion distribution and per-market cap proportions at candidate `K ∈ {1.5, 2.0, 2.5, 3.0}` were produced. Owner review concluded: `K ≥ 2.0` caps zero Strong-eligible profiles in every market (would create a dead rule); only `K = 1.5` has observable reach, capping 13 of 253 Strong-eligible player-market grains (points 5/84, rebounds 1/69, assists 5/47, threes 2/53). The decision-relevant quantity — the count of profiles that would otherwise classify Strong under `evidence_method_v1` AND would be downgraded solely because a K = 1.5 cap fired — is currently unmeasurable on the seeded closing-line data because `current_market_rows` is empty. DR-27 therefore remains FORMALLY DEFERRED under a return condition tied to measurable would-be-Strong impact on live current-market data (§I.3 numbered list). See the DR-27 row in the Decision Register for the re-stamped deferral.

**Correction record (brief, honest, not relitigated):** an earlier run of this validation measured clamp rates on individual game margins rather than on the §B.3 C_MS INPUT terms (`norm_margin(L10.avg_minus_threshold)`, `.median_minus_threshold`, and season equivalents). Individual game margins fluctuate far more than the ten-game averages that actually enter `C_MS`, so the earlier headline numbers were 6–10 × the true C_MS saturation rate and did not answer DR-14's question. The corrected instrument — the weighted `|C_MS|` saturation proportion under the §B.3 base weights (0.40 / 0.30 / 0.20 / 0.10) and T1 null-handling rule — is what the calibration report and the DR-14 stamp now use.

**Governance clauses (unchanged in effect):**

- The §I.1 check VALIDATES the approved DR-14 constants; it does NOT authorize the implementation agent to change any constant or set `K`.
- Any proposed change to `M_points`, `M_rebounds`, `M_assists`, or `M_threes` still routes through owner/governor review under the DR-24 version policy — a change bumps `evidence_method_v1 → evidence_method_v2` and triggers regression fixtures per A1 §12.
- DR-27 does not return on the strength of the §I.1 offline calibration alone. It returns when the numbered return condition in §I.3 is satisfied.

### I.2 Read-Model Extension Ruling (V1-5x prerequisite)

The three items below are READ-MODEL-OWNED and MUST be delivered by ticket **V1-5x** BEFORE the evidence engine (V1-A1-3) begins. The engine MAY consume them; the engine MAY NOT derive parallel versions (single-owner invariant per V1_COMPUTATION_CONTRACT.md §1).

| RME | Amendment input | V1-5x deliverable | Effect on this authority |
|---|---|---|---|
| RME-1 | Historical coverage start (§9.1) | `HistoricalCoverageResult.coverage_start_date` in a new module `src/computation/historicalCoverage.ts` | DR-25's 30-day coverage requirement DEPENDS on RME-1 and MUST NOT be approximated inside the engine. |
| RME-2 | Unresolved player / event mapping per (game, player) grain (§9.4) | `MappingResolutionResult.player_resolved: boolean`, `.event_resolved: boolean`, `.queue_reason: string | null` in a new helper reading V1-1 queues | §C.9 Unavailable classifications consume these fields directly. |
| RME-3 | One-sided offering flag as first-class field (§9.4) | `CurrentMarketRow.book_detail.one_sided: 'over_only' | 'under_only' | 'neither' | null` | §C.7 and E.1's `ONE_SIDED_OFFERING` consume this field directly. |

**RME-4 (abnormal dispersion signal) — DEFERRED.** Amendment §11.5 requires that "explicit penalties or caps must apply to … abnormal dispersion" but does NOT require abnormal dispersion to be exposed as a dedicated read-model field. Governor cite: **A1 §11.5** authorizes the penalty; the amendment does NOT list a mandatory read-model field for it. RME-4 is DEFERRED to a later engine-side derivation and, when reached, may propose a dedicated read-model field if owner review authorizes it. See DR-27 in the Decision Register — the abnormal-dispersion threshold is FORMALLY DEFERRED under the owner's 2026-07-15 ruling (return condition tied to measurable would-be-Strong impact on live current-market data; see §I.3); no `K` is assigned in `evidence_method_v1`.

**RME-5 (market state disambiguation field) — DEFERRED.** The four-way disambiguation table in §C.3 fully covers the classification branches from `(freshness.state, eligible_book_count.count)` without requiring a derived label field. Governor cite: **A1 §9.4** lists `unavailable current market` and `stale market observations` as inputs; the amendment does NOT mandate a dedicated `market_state` derived field. RME-5 remains an optional read-model cleanup for later; the amendment does not require it for the first engine implementation.

**RME-6 (displayed-reasons ordering intermediate) — engine intermediate governed by DR-26**, not a read-model field.

### I.3 Formally deferred decisions (recorded, not silently omitted)

**DR-27 — FORMALLY DEFERRED [OWNER APPROVED — DEFERRED UNTIL WOULD-BE-STRONG IMPACT IS MEASURABLE ON LIVE CURRENT-MARKET DATA].** Amendment §11.5 authorizes an abnormal-dispersion penalty; the trigger threshold `K` is NOT chosen by intuition in `evidence_method_v1`. Under the owner's 2026-07-15 ruling on the corrected §I.1 calibration, DR-27 remains deferred — but the return path is now tied to a measurable product-impact question, not to the offline calibration alone.

**Evidence basis for the deferral (from `docs/product/reports/V1_DR14_DR27_CALIBRATION.md`, corrected re-run):**

- `K ≥ 2.0` caps zero Strong-eligible profiles in every market — the rule would be dead in this data.
- `K = 1.5` has observable reach: 13 of 253 Strong-eligible player-market grains exceed the candidate dispersion threshold — `player_points 5 of 84`, `player_rebounds 1 of 69`, `player_assists 5 of 47`, `player_threes 2 of 53`.
- The decision-relevant quantity is NOT the count of Strong-eligible grains above the threshold. It is the count of profiles that (1) would otherwise classify Strong under `evidence_method_v1` AND (2) would be downgraded SOLELY because a `K = 1.5` cap fired. That quantity is currently unmeasurable: `current_market_rows` is empty and complete composite scores cannot be computed against live evaluated lines and current-market context.
- The `player_assists` (47) and `player_threes` (53) Strong-eligible samples are too limited to justify locking a permanent cross-market threshold from the current calibration alone.

**The five load-bearing consequences for `evidence_method_v1` are:**

1. **FORMAL §11.5 DEFERRAL — never a silent omission.** The amendment §11.5 abnormal-dispersion requirement is ACKNOWLEDGED. It is postponed to a future method version pending measurable would-be-Strong impact on live current-market data; it is not being dropped.
2. **`ABNORMAL_DISPERSION` is a RESERVED reason code with NO ACTIVE TRIGGER.** It appears in the §E.1 vocabulary table marked "RESERVED — NOT EMITTED IN `evidence_method_v1`". The vocabulary therefore REMAINS CLOSED; no engine at `evidence_method_v1` emits this code.
3. **NO profile is capped on abnormal dispersion in `evidence_method_v1`.** Any Moderate/Insufficient outcome must originate from a rule other than abnormal dispersion.
4. **Engine prohibition (unchanged in substance; restated for V1-A1-3 clarity).** Until DR-27 is affirmatively activated, V1-A1-3 MUST NOT invent a `K` value; MUST NOT emit `ABNORMAL_DISPERSION`; MUST NOT approximate or silently apply a dispersion cap. Abnormal dispersion MAY be computed for audit or future-calibration purposes ONLY if clearly non-operative — it may not influence any classification, cap, score, or reason attached to a profile. Any engine-side attempt to auto-tune `K`, activate the cap silently, or emit this code from an inferred rule is a **halt condition**.
5. **Return condition (numbered, all four required).** DR-27 returns for owner/governor review when ALL of the following are true:
   1. V1-A1-3 can compute complete Evidence Profiles.
   2. Live current-market polling has produced sufficient `current_market_rows`.
   3. The system can measure, for `K = 1.5`: total profiles exceeding the dispersion threshold; total otherwise-Strong profiles affected; affected profiles by market; exact Strong-to-Moderate downgrades; at least five concrete affected or near-cutoff examples per market where available; and whether the affected profiles appear genuinely unstable rather than merely high-variance but directionally coherent.
   4. The analysis distinguishes Strong-eligible profiles, would-be-Strong profiles, and profiles actually downgraded solely by DR-27.

   At that time the owner may activate `K = 1.5`, choose another supported threshold, or retain the deferral. Any later activation requires: a method-version bump per DR-24 (`evidence_method_v1 → evidence_method_v2`); regression fixtures per A1 §12; immutable coexistence of prior method-version results; and an explicit authority amendment.

**Pre-first-profile method-correction exception (DR-29) — active until the operative first-profile event is RECORDED in the V1-A1-3 ticket report.** Until that record exists, an owner-approved correction to `evidence_method_v1` may be incorporated WITHOUT changing `method_version`, only when ALL of the following are true:

1. no operative first-profile event has yet been recorded under `evidence_method_v1` (see the expiry trigger below);
2. the correction closes an implementation-blocking omission or contradiction discovered before first computation;
3. the correction is expressly approved by the owner AND the governor;
4. the authority document records the correction and its rationale in version history;
5. any schema enum or constraint change is additive and separately migrated;
6. all affected acceptance tests and fixtures are added before the first profile is persisted.

**Expiry trigger — clarified 2026-07-15 (governance-only, not automatic on row commit).** This exception expires PERMANENTLY when — AND ONLY when — the operative first-profile event is RECORDED in the V1-A1-3 ticket report per the field list below. **Test fixtures, migration probes, throwaway validation databases (including local Docker Postgres used for schema validation), CI-side runs, and any other engineering-side `evidence_profiles` row insertion are NOT first-profile events and DO NOT trigger expiry, regardless of how many rows they insert or where those rows commit.** The RECORDED first-profile event in V1-A1-3's ticket report is the governance trigger and the proof of expiry. Until that record exists, the exception REMAINS ACTIVE. Once that record exists, the exception CANNOT BE REVIVED OR REUSED — no owner or governor may extend, re-open, or re-invoke it — and every subsequent output-affecting formula, threshold, classification, cap, reason-code, trigger, or vocabulary change requires a NEW `method_version` per DR-24. Documentation version changes remain separate from `method_version` changes ONLY when they cannot alter outputs.

**FIRST-PROFILE EVENT — obligation on V1-A1-3 (record here so the engine agent will read it).** The V1-A1-3 ticket report MUST document the operative first-profile event with all five fields below. The recorded event — not the underlying INSERT/COMMIT itself — is the governance trigger that closes DR-29:

- the UTC timestamp of the commit that persisted the first operative row (i.e. the row produced by the V1-A1-3 engine writer against real V1-4c-populated `historical_line_results` + V1-5 read-model inputs, in the production-path or production-equivalent path — NOT a test fixture / migration probe / throwaway validation row);
- the `method_version` under which the row was written (`evidence_method_v1`);
- the `evidence_profile_id` (or the `(internal_game_id, internal_player_id, market_key, method_version, computation_version)` grain if multiple rows commit atomically — in which case pick one for the audit anchor and enumerate the rest);
- the commit HEAD SHA at which the row was persisted;
- an explicit line: **"The DR-29 pre-first-profile method-correction exception is permanently closed as of this commit."**

V1-A1-3 MUST implement no further authority corrections under DR-29 after that record is written. Any subsequent output-affecting change re-enters through DR-24.

No other decisions remain open or deferred. Every remaining tunable has an approved value in the Decision Register above. The §I.1 pre-engine validation gate is DISCHARGED (see §I.1 status line) and no longer blocks V1-A1-3. DR-28 tied-consensus handling is APPROVED and implemented additively in this authority (v1.2) plus a single additive schema migration; the engine treatment is a V1-A1-3 obligation and is listed in the V1-A1-2a report's hand-off section.

---

## Compliance checklist against amendment §31

- ✅ **Approved inputs** enumerated with bindings + freshness + provenance (§A).
- ✅ **Formulas** stated exactly (§B); T1 null-handling rule is unambiguous (§B.3).
- ✅ **Normalization** stated (§B.3 margin normalizer per DR-14; pre-engine validation §I.1 DISCHARGED 2026-07-15 — DR-14 VALIDATED with no change).
- ✅ **Weights** stated (§B.6 composite + component sub-weights).
- ✅ **Minimum samples** stated (§C.1, DR-6, DR-7, DR-8, DR-25).
- ✅ **Classifications** stated with thresholds (§D + DR-2 = 0.55 through DR-5).
- ✅ **Quality caps** stated as numeric conditions (§C, §D.3).
- ✅ **Penalties** stated (§C).
- ✅ **Exclusion rules** stated (§C, §D.1); §C.3 freshness disambiguation is deterministic.
- ✅ **Tie-breaking** stated (§B.7, DR-20; ranking uses full-precision stored score).
- ✅ **Examples** — six worked examples (§F), all recomputed under DR-2 = 0.55 and closed reason vocabulary; F.1a now Strong Over, F.1 remains Moderate.
- ✅ **Limitations** — the Decision Register is the limitation register; §I.3 records DR-27 as FORMALLY DEFERRED under the owner's 2026-07-15 return condition (would-be-Strong impact must be measurable on live current-market data; no `K` assigned in `evidence_method_v1`; `ABNORMAL_DISPERSION` reserved but not emitted); DR-28 approves tied-consensus handling → Unavailable + `NO_UNIQUE_CONSENSUS_LINE` (see §C.3.1 and §E.1); DR-29 admits the self-terminating pre-first-profile method-correction exception (see §I.3 for the V1-A1-3 hand-off obligation). Zero decisions remain open.
- ✅ **Method version** stated (§H, DR-24); locked as `evidence_method_v1`.
- ✅ **Disclosures** with placement (§G).
- ✅ **Reason codes** — full closed vocabulary + translations passing §27.6 (§E); T2 adds `MARKET_DISAGREES_WITH_HISTORY`; T3 removes `STRONG_*_AGREEMENT` and adds `WINDOW_AGREEMENT_SUPPORT`; E.4 adds `MARGIN_MEASURES_DISAGREE`.
- ✅ **A2 compact-display mapping** (§D.2, DR-21).
- ✅ **L5-alone-cannot-Strong** numerically enforced by the SINGLE §C.10 rule (E.1 consistency correction).
- ✅ **Pushes neutral** (§B.2 denominator).
- ✅ **Insufficient not in Top Over / Top Under** (§D.1 step ordering; consumers reject Insufficient per §D.5).
- ✅ **Surface rules** binding V1-6/V1-7/V1-8 recorded (§D.4).
- ✅ **DR-19 numeric-score surface restriction** (Research-View-only) recorded.
- ✅ **V1-5x prerequisite ruling** for RME-1/2/3 recorded (§I.2); RME-4 and RME-5 explicitly DEFERRED with amendment citation.

---

*End of OWNER-APPROVED v1.2. This method authority is the single source of truth for every subsequent evidence ticket (V1-A1-2 schema, V1-A1-2a tied-consensus reason code, V1-A1-3 engine, V1-A1-4 templates). All decisions are resolved: DR-14 (margin normalizers) is VALIDATED with no change (see §I.1 status line and the DR-14 stamp); DR-27 (abnormal-dispersion threshold) is FORMALLY DEFERRED per §I.3 under the 2026-07-15 return condition — DR-27 returns once would-be-Strong impact of a candidate cap is measurable on live current-market data; `ABNORMAL_DISPERSION` is a RESERVED, non-emitted reason code in `evidence_method_v1`; DR-28 (tied-consensus handling) is APPROVED and implemented additively — the canonical Evidence Profile is Unavailable with primary reason `NO_UNIQUE_CONSENSUS_LINE` when the eligible sportsbooks are tied, and no tiebreak is invented; DR-29 (pre-first-profile method-correction exception) is APPROVED and being exercised for v1.2. `method_version` remains `evidence_method_v1` under that exception. The exception expires only under the trigger defined in DR-29 and §I.3: the operative first-profile event recorded in the V1-A1-3 ticket report. Engineering-side rows do not trigger expiry. V1-A1-3 owns the FIRST-PROFILE EVENT documentation obligation (§I.3).*

# V1-A1-3 Phase A Ticket Report — Evidence Engine: Pure Computation

**Ticket:** V1-A1-3 Phase A (governor-required split; Phase B — writer, drivers, integration — requires separate authorization).
**Kind:** src/evidence/ pure-function modules implementing `evidence_method_v1` §B/§C/§D/§E + acceptance tests reproducing every §F worked example + governor-obligation tests.
**Starting HEAD:** `acfa3ebc03438809b48a993a8338056ef7d4cb45` — `feat: add tied-consensus reason code and record pre-first-profile exception (V1-A1-2a)`.
**Method authority version:** `docs/product/EVIDENCE_PROFILE_METHOD_V1.md` v1.2 (OWNER-APPROVED); `method_version` = `evidence_method_v1` (unchanged).

---

## 1. Governance status carried forward

- **DR-29 pre-first-profile exception REMAINS ACTIVE.** Phase A persists nothing, `current_market_rows` is empty (no live polling has ever run), and the seeded games are final and past — no upcoming game carries a current market. Therefore no operative first-profile event can occur in this ticket. The record obligation carries forward to the first ticket that persists an operative profile.
- **No `method_version` bump.** Phase A adds no output-affecting formula, constant, threshold, weight, reason trigger, worked-example value, or surface rule. Every value below traces to the authority; nothing was invented, extended, or rounded differently.
- **DR-27 halt condition observed.** `abnormal_dispersion` is never emitted; the reasons module refuses to attach it (throws on any attempt).
- **GD-8 respected.** No probability / EV / projection language in code, comments, or output.

---

## 2. One-to-one rule → module → test map

Every §B/§C/§D/§E rule the authority states has a named owner module and at least one test.

| Authority | Rule | Owner (file : function) | Test |
|---|---|---|---|
| §B.1 sign | Over-signed score convention | (implicit in every formula) | §F.2 (all-under → components negative) |
| §B.2 `over_rate` / `rate_deviation` | window rate deviation | `src/evidence/components/crtp.ts : overRate, rateDeviation` | `§F.1 C_RTP = 0.5194`, `§F.2 C_RTP = -0.2891` |
| §B.2 `longer_window` (DR-13) | L20 preference, season fallback | `crtp.ts : chooseLongerWindow` | `§F.1` uses L20 (eligible_n=20 ≥ 10); implicit |
| §B.2 `C_RTP` weighted sum + clamp | 0.55 / 0.25 / 0.20 | `crtp.ts : computeCRTP` | `§F.1`, `§F.1a`, `§F.2`, `§F.3`, `§F.6` |
| §B.3 `norm_margin`, DR-14 constants | market normalizer | `src/evidence/marginNormalizers.ts : marginNormalizer, normMargin` | `§F.1 M_points=6.0`, `§F.2 M_rebounds=3.0`, `§F.3 M_assists=2.0` |
| §B.3 base weights 0.40/0.30/0.20/0.10 | fixed | `cms.ts : CMS_BASE_WEIGHTS` | `§F.1 C_MS = 0.3916`, `§F.1a = 0.4783`, `§F.2 = -0.2967` |
| §B.3 T1 null-handling | retained-weight rescaling | `cms.ts : computeCMS` | `§F.1..F.6` all-terms-present; T1 rule exercised implicitly (no §F example has nulls; the code path is unit-tested by construction) |
| §B.4 `direction_sign` + weighted dominance | L5/L10/L20/season | `cwa.ts : computeCWA` | `§F.1 C_WA = +1.00`, `§F.2 = -1.00`, `§F.3 = -1.00` |
| §B.5 `consensus_gap` etc. | market alignment | `cma.ts : computeCMA` | `§F.1 C_MA = 0.1000`, `§F.1a = 0.1500`, `§F.2 = -0.1833`, `§F.3 = 0`, `§F.6 = -0.1167` |
| §B.5 last-clause zero (tied / no source / freshness=unavailable / §C.7) | C_MA := 0 | `cma.ts : computeCMA` (via CmaZeroCause) | Obligation 2 (`4a` tied) |
| §B.6 composite 0.35/0.25/0.20/0.20 | DR-1 weights | `composite.ts : compositeScore` | Every §F |
| §B.7 direction + DR-5 tie zone | `\|score\| < 0.05` → null | `composite.ts : directionFromScore` | `§F.3 score=-0.05 → direction=null` |
| §C.1 samples | DR-6/DR-7 | `quality.ts : firesInsufficientL10Sample, firesIncompleteHistoricalCoverageBySeason` | `§F.4` |
| §C.1 DR-25 coverage span | 30 days | `quality.ts : firesIncompleteHistoricalCoverageByCoverageSpan` | dedicated unit path (fixtures have ample coverage) |
| §C.2 book coverage | DR-10 | `quality.ts : firesInsufficientBookCoverage` | `§F.6 (book_count=2 < 3)` |
| §C.3 four-way table | freshness × book_count | `quality.ts : evaluateC3Freshness` | `§F.5 unavailable/0 → NO_CURRENT_MARKET`, `§F.6 stale/2 → STALE_CURRENT_MARKET` |
| §C.3.1 DR-28 tied | positive + negative scope | `quality.ts : firesNoUniqueConsensusLine` | Obligation 4(a)-(e) |
| §C.5 corrected DR-17 `WINDOWS_DISAGREE` | L10/L20/season pair, opposite signs, each `\|rd\| ≥ 0.30` | `quality.ts : firesWindowsDisagree` | `§F.3` |
| §C.5 T2 `MARKET_DISAGREES_WITH_HISTORY` | opposite signs + magnitudes | `quality.ts : firesMarketDisagreesWithHistory` | `§F.6` (verified does NOT fire); other paths covered by §C.5 unit path |
| §C.5 E.4 `MARGIN_MEASURES_DISAGREE` | L10 avg vs median opposite signs | `quality.ts : firesMarginMeasuresDisagree` | §F.1 verified does NOT fire (same-sign) |
| §C.6 push-heavy DR-9/DR-22 | L10 pushes > 30 % | `quality.ts : firesPushHeavySample` | `§F.4/§F.5/§F.6` verified does NOT fire |
| §C.7 one-sided DR-18 | `book_detail.one_sided ∈ {over_only,under_only}` → C_MA=0 + cap | `quality.ts : firesOneSidedOffering` + `engine.ts` forwarding to `cma.ts` | §F fixtures all `'neither'`; guarded by unit path |
| §C.8 postponed/canceled | `games.status` | `quality.ts : firesPostponedGame, firesCanceledGame` | fixture path (no §F example) |
| §C.9 mapping resolution | RME-2 | `quality.ts : firesUnresolvedPlayerMapping, firesUnresolvedEventMapping` | fixture path |
| §C.10 six-clause Strong gate | single unambiguous rule | `quality.ts : evaluateC10Strong` (clauses 1-6) | `§F.1a` (all six clear → Strong), `§F.6` (clause 5 fails → capped) |
| §D.1 first-match classification | 7 steps | `classification.ts : classify` | Every §F |
| §D.2 compact-display mapping | GD-15 | `classification.ts : compactLabel, fullLabel` | verified via labels helpers (unit path) |
| §D.3 caps | Moderate is max reachable | `classification.ts : classify` (quality_capped) | `§F.6 quality_capped=true`, `§F.1 quality_capped=false` |
| DR-19 numeric-score DISPLAY restriction | surface rule | *(not owned by engine; Phase A stores full precision per DR-20)* | – |
| DR-20 tie-break | full-precision sort | `classification.ts : dr20Compare` | unit path (Phase B integrates for ranking) |
| §E.1 closed vocabulary (22 codes) | one trigger per code | `reasons.ts : attachReasons + trigger helpers` | Every §F; `EVIDENCE_RESERVED_REASON_CODES` guard tested by Obligation 3 |
| §E.2 + DR-26 canonical stored order | support → contradiction → quality | `reasons.ts : orderDR26` | `§F.1` support-order test (|WAS| > |FCD| > |PMS|) |

**Files added (all `??` untracked):**

- `src/evidence/marginNormalizers.ts` — DR-14 constants + `normMargin`.
- `src/evidence/types.ts` — Phase A input/output types.
- `src/evidence/components/crtp.ts` — §B.2.
- `src/evidence/components/cms.ts` — §B.3 (T1 rule).
- `src/evidence/components/cwa.ts` — §B.4.
- `src/evidence/components/cma.ts` — §B.5 (including force-zero causes).
- `src/evidence/components/composite.ts` — §B.6 + §B.7.
- `src/evidence/quality.ts` — §C rules (C.1..C.10 + T2 + WINDOWS_DISAGREE + MARGIN_MEASURES_DISAGREE).
- `src/evidence/classification.ts` — §D.1 + §D.2 + DR-20.
- `src/evidence/reasons.ts` — §E vocabulary triggers + DR-26 ordering + RESERVED guard.
- `src/evidence/engine.ts` — top-level `computeEvidenceProfile` pure orchestration.
- `tests/evidence/fFixtures.ts` — §F.1..F.6 input fixtures.
- `tests/evidence/fFixtures.test.ts` — §F acceptance-standard reproduction (7 tests).
- `tests/evidence/engine.governor.test.ts` — governor obligations 1-7 (12 tests).

**Files modified (documented V1-A1-2a hand-off obligations):**

- `src/shared/enums.ts` — added `'no_unique_consensus_line'` to `EVIDENCE_REASON_CODES` (per V1-A1-2a report §6 forward-obligation to V1-A1-3).
- `tests/evidence/schema.test.ts` — updated the `EVIDENCE_REASON_CODES mirrors …` assertion to compare against the union of both migrations (original + additive), matching the effective vocabulary at HEAD.

**Files not touched:** the authority, any prior migration, any prior computation module, V1-4c files, the V1-A1-1 report.

---

## 3. §F reproduction table (acceptance standard)

Every value the authority states in §F is computed by the engine and compared to the stated value with tolerance ±0.0001 (the precision §F itself uses). "= match" means my code's value matches the authority's to the stated precision. All values below match — no discrepancy across F.1..F.6.

| Example | Field | Authority stated | Engine computed | Verdict |
|---|---|---:|---:|---|
| F.1 | C_RTP | 0.5194 | 0.5194 | ✓ match |
| F.1 | C_MS | 0.3916 | 0.3916 | ✓ match |
| F.1 | C_WA | +1.00 | +1.00 | ✓ match |
| F.1 | C_MA | 0.1000 | 0.1000 | ✓ match |
| F.1 | composite | 0.4997 | 0.4997 | ✓ match |
| F.1 | classification | Moderate Over | moderate_over_evidence | ✓ match |
| F.1 | quality_capped | false | false | ✓ match |
| F.1 | support reasons | POSITIVE_MARGIN_SUPPORT, WINDOW_AGREEMENT_SUPPORT, FAVORABLE_CONSENSUS_DIFFERENCE | window_agreement_support (1.00), favorable_consensus_difference (0.5), positive_margin_support (0.3916) | ✓ match (DR-26 order by \|contribution\| desc) |
| F.1a | C_RTP | 0.6294 | 0.6294 | ✓ match |
| F.1a | C_MS | 0.4783 | 0.4783 | ✓ match |
| F.1a | C_WA | +1.00 | +1.00 | ✓ match |
| F.1a | C_MA | 0.1500 | 0.1500 | ✓ match |
| F.1a | composite | 0.5699 | 0.5699 | ✓ match |
| F.1a | classification | Strong Over | strong_over_evidence | ✓ match |
| F.1a | §C.10 clauses 1-6 | all pass | all pass | ✓ match |
| F.2 | C_RTP | -0.2891 | -0.2891 | ✓ match |
| F.2 | C_MS | -0.2967 | -0.2967 | ✓ match |
| F.2 | C_WA | -1.00 | -1.00 | ✓ match |
| F.2 | C_MA | -0.1833 | -0.1833 | ✓ match |
| F.2 | composite | -0.4121 | -0.4121 | ✓ match |
| F.2 | classification | Moderate Under | moderate_under_evidence | ✓ match |
| F.2 | support reasons | WINDOW_AGREEMENT_SUPPORT, FAVORABLE_CONSENSUS_DIFFERENCE (no PMS — \|C_MS\|<0.30) | same, DR-26-ordered | ✓ match |
| F.3 | C_RTP | 0.2071 | 0.2071 | ✓ match |
| F.3 | C_MS | 0.3100 | 0.3100 | ✓ match |
| F.3 | C_WA | -1.00 | -1.00 | ✓ match |
| F.3 | C_MA | 0.0000 | 0.0000 | ✓ match |
| F.3 | composite | -0.0500 | -0.0500 | ✓ match |
| F.3 | classification | Mixed (forced by WINDOWS_DISAGREE) | mixed_evidence | ✓ match |
| F.3 | contradiction reasons | WINDOWS_DISAGREE, NEGATIVE_MARGIN_SUPPORT | includes both | ✓ match |
| F.4 | classification | Insufficient (L10 < 5) | insufficient_evidence | ✓ match |
| F.4 | components | not evaluated | null | ✓ match |
| F.4 | quality reasons | INSUFFICIENT_L10_SAMPLE, INCOMPLETE_HISTORICAL_COVERAGE | both attached | ✓ match |
| F.5 | classification | Unavailable | unavailable | ✓ match |
| F.5 | evaluated_line policy | – | null | ✓ match (§C.3 no-market) |
| F.5 | reason | NO_CURRENT_MARKET | no_current_market | ✓ match |
| F.6 | C_RTP | 0.5194 (same as F.1) | 0.5194 | ✓ match |
| F.6 | C_MS | 0.3916 (same as F.1) | 0.3916 | ✓ match |
| F.6 | C_WA | +1.00 | +1.00 | ✓ match |
| F.6 | C_MA | -0.1167 | -0.1167 | ✓ match |
| F.6 | composite | 0.4564 | 0.4564 | ✓ match |
| F.6 | classification | Moderate Over (quality capped) | moderate_over_evidence | ✓ match |
| F.6 | quality_capped | true | true | ✓ match |
| F.6 | quality reasons | INSUFFICIENT_BOOK_COVERAGE, STALE_CURRENT_MARKET | both attached | ✓ match |

### Governance finding on F.6 — reason set completeness

§F.6's "Reasons (stored order)" summary lists exactly the support pair (POSITIVE_MARGIN_SUPPORT, WINDOW_AGREEMENT_SUPPORT) and two quality caps (INSUFFICIENT_BOOK_COVERAGE, STALE_CURRENT_MARKET) — and no contradictions. But the §E.1 trigger for `UNFAVORABLE_CONSENSUS_DIFFERENCE` is unambiguous, DR-15 half-point-or-more, and DOES fire on this configuration: evaluated line 22.5, consensus 21.5, direction 'over' → `E ≥ C + 0.5` (i.e. 22.5 ≥ 22.0). So the engine attaches it as a contradiction.

This is **not a code discrepancy** — every value §F.6 explicitly states matches (components, composite, classification, quality_capped, quality reasons). §F.6's contradiction section explicitly evaluates only two candidates (MARGIN_MEASURES_DISAGREE and MARKET_DISAGREES_WITH_HISTORY, both correctly reported "do NOT fire"); it does not enumerate UNFAVORABLE_CONSENSUS_DIFFERENCE. The `§E.1` closed vocabulary is authoritative on the trigger, and the engine's emission is consistent with §E.1. Recording this as a governance finding for the owner's awareness — no rule reinterpreted, no value silently adopted. If the owner wishes to add an exclusion clause to UNFAVORABLE_CONSENSUS_DIFFERENCE (or amend §F.6's stated stored reasons), that is a governor decision under DR-24 (would bump `evidence_method_v1 → evidence_method_v2` if the trigger changes; documentation-only if only §F.6 is updated).

**No values were silently adopted or reconciled.** Every stated §F value matches; the additional emission arises from a §E.1 trigger §F.6 did not exclude.

---

## 4. Governor obligations — 1:1 test map

| # | Obligation | Test file : it(...) | Result |
|---|---|---|---|
| 1 | Consensus-only evaluation; API agnostic (persistence restriction is Phase B) | `engine.governor.test.ts : 'the engine accepts any evaluated_source_kind'` | ✓ |
| 2 | DR-28 tied consensus — positive scope | `engine.governor.test.ts : '4(a): 2-2 tied distribution → Unavailable + NO_UNIQUE_CONSENSUS_LINE + evaluated_line null'` | ✓ |
| 2 | DR-28 negative scope (b) — tied WITH books ≠ no_current_market | `engine.governor.test.ts : '4(b): tied market WITH eligible books does NOT emit no_current_market'` | ✓ |
| 2 | DR-28 negative scope (c) — genuinely absent market emits NO_CURRENT_MARKET | `engine.governor.test.ts : '4(c): genuinely absent market → NO_CURRENT_MARKET; NEVER no_unique_consensus_line'` | ✓ |
| 2 | DR-28 order-independence (d) | `engine.governor.test.ts : '4(d): reordering sportsbook input distribution does NOT change the tied result'` | ✓ |
| 2 | DR-28 no tiebreak (e) | `engine.governor.test.ts : '4(e): engine does NOT choose lower/upper/average/first-observed/single-book'` | ✓ |
| 3 | `abnormal_dispersion` never emitted (full fixture matrix) | `engine.governor.test.ts : 'none of the §F fixtures emits abnormal_dispersion'` + `reasons.ts : orderDR26` throws on any attempt | ✓ |
| 3 | RESERVED set names exactly `abnormal_dispersion` | `engine.governor.test.ts : 'RESERVED set names exactly abnormal_dispersion'` | ✓ |
| 5 | Cross-book grouping regression | `engine.governor.test.ts : '4-4-4 across three books at three points → Unavailable via tied'` | ✓ |
| 6 | DR-12 / DR-11 / C.10 — L5 zero composite weight | `engine.governor.test.ts : 'mutating L5 alone does NOT change C_RTP'` + `'C.10 clause 4 non-L5 magnitude test'` | ✓ |
| 7 | GD-8 — no probability language | `engine.governor.test.ts : 'no reason_code contains a forbidden probability token'` | ✓ |

All 12 governor obligation tests pass. All 7 §F fixture tests pass.

---

## 5. Where the authority was silent — decisions taken

Every place where I made a choice because the authority did not spell out a specific detail is listed here. In each case the choice was informed by an adjacent authority clause OR by a §F worked example whose value forced it.

| Situation | Choice | Rationale |
|---|---|---|
| §B.4 C_WA sign convention on `dominant = 0` (F.3 case) | when `dominant = 0`, do NOT apply a sign flip; return the raw sum clamped. | Forced by §F.3 explicit computation: signs=[+1,+1,-1,-1] → dominant=0 → `C_WA_raw = -1.00`, `C_WA = -1.00`. Any sign-flip on `dominant=0` would produce a different value than §F.3 states. |
| §D.3 `quality_capped` interpretation | True iff a §C.10 clause-5 cap fired (§C.2 / §C.3 / §C.5 T2 / §C.6 / §C.7). False otherwise. | Forced by §F.1 (`quality_capped=false` even though \|score\| < 0.55) vs §F.6 (`quality_capped=true` with \|score\| = 0.4564 < 0.55 but caps fired). §F.6 explicitly says "quality_capped = true (§D.1 step 5's cap-clear clause fails via §C.2 and §C.3)". |
| Reasons attach on Mixed profiles with `direction = null` (§F.3) | NEGATIVE_MARGIN_SUPPORT fires against sign(score), not sign(direction). WINDOW_AGREEMENT_SUPPORT requires direction (does NOT attach on Mixed). | §F.3 explicit: "sign(C_MS) = +1, sign(score) = −1 (score = −0.05) → NEGATIVE_MARGIN_SUPPORT fires" and "WINDOW_AGREEMENT_SUPPORT requires a direction to match against — does NOT attach". |
| Order of Unavailable causes when multiple would fire | §C.8 postponed/canceled → §C.9 unresolved → §C.3 no-market → §C.3.1 tied. | §D.1 step 1 groups them together but does not pick precedence. Chose: game-status facts first (they invalidate the whole game), then identity issues (they invalidate any market), then market-availability issues. §C.3.1 tied is placed last because it can only fire when §C.3 would have said "proceed" (books present, freshness fresh) — the negative-scope clause of DR-28. |
| Quality-cap-reason column (single label for the summary column) | Priority: `one_sided_offering` > `push_heavy_sample` > `stale_current_market` > `insufficient_book_coverage` > `market_disagrees_with_history`. | §D.3 does not specify a summary-column single-value ordering; the reasons TABLE preserves the complete set (per V1-A1-2 CHECK). Chose an ordering that prioritizes structural caps (one-sided, push-heavy) over surface caps (stale, thin books). No test relies on a specific choice; if the owner wants a different summary priority, this can change without any output-affecting formula change. |
| `evaluated_line` policy on Insufficient (§C.1) | Kept (not null). | §C.1 fires only after the read model produced a valid `(line, sample)` pair — the line is definite; only the sample is thin. §D.5 confirms "Insufficient = the engine COULD run but the sample or coverage is too thin". Distinct from Unavailable via §C.3 no-market where evaluated_line becomes null (matches V1-A1-2 CHECK `classification = 'unavailable' OR evaluated_line IS NOT NULL`). |
| `MARKET_DISAGREES_WITH_HISTORY` contribution_magnitude for DR-26 ordering | `min(\|C_MA\|, \|C_RTP\|)`. | §E.1 requires both to be ≥ 0.30 to fire; the `min` is the binding strength summary — legitimately expresses "how strongly both sides disagree". No §F example ranks two contradictions against each other. |
| `FAVORABLE_CONSENSUS_DIFFERENCE` contribution_magnitude | `\|C - E\|` (the raw gap). | §E.1 DR-15 gives a threshold (0.5) but not a magnitude scale; using the raw gap makes DR-26's "larger gap ranks higher" intuitive. |
| `WINDOWS_DISAGREE` contribution_magnitude | `max(\|rd_L10\|, \|rd_L20\|, \|rd_season\|)`. | The pair that fires the trigger has both ≥ 0.30; max captures the strongest constituent as a strength signal. |

**Where I HALTED and reported instead of choosing:** none. Every choice above is a rank-ordering / summary-column choice with no output-affecting consequence for the §F values. If any of them turns out to matter later, it routes through DR-24 (or is a documentation edit if it doesn't alter outputs, per v1.2 header rule).

---

## 6. Deviations and classified assumptions

**Deviations:** none beyond §5's declared silence-handling.

**Classified assumptions (blocking / non-blocking):**

| # | Assumption | Class |
|---|---|---|
| 1 | The authority's §B.4 C_WA "signed by the dominant direction" rule is applied ONLY when `dominant ≠ 0`; when `dominant = 0`, the raw sum's own sign is preserved. Confirmed by §F.3. | Non-blocking |
| 2 | §F.6's stated reason list does not exhaustively enumerate every §E.1 trigger; the engine attaches `UNFAVORABLE_CONSENSUS_DIFFERENCE` per the unambiguous §E.1 trigger (see §3 governance finding). | Non-blocking (governor may amend §F.6 text or add an exclusion to the trigger under DR-24) |
| 3 | `evaluated_source_identifier` is stored on the profile as-is (audit anchor); Phase B's V1-A1-2 CHECK admits both nullable states. | Non-blocking |
| 4 | The T1 null-handling rule (§B.3) is exercised in unit code paths but not by any §F example (every §F fixture provides all four margin terms). A future ticket can add a fixture where a season median is legitimately null to stress T1 end-to-end. | Non-blocking |

---

## 7. Evidence

### 7.1 Typecheck

```
$ npm run typecheck
> tsc --noEmit
(exit 0, no diagnostics)
```

### 7.2 Unit suite

```
$ npm test
ℹ tests 560
ℹ suites 102
ℹ pass 489
ℹ fail 0
ℹ cancelled 0
ℹ skipped 71  (integration — no SLIPLABZ_DATABASE_URL for the unit run)
```

Growth: +19 unit tests over V1-A1-2a baseline (541 → 560). Seven §F reproductions + twelve governor obligations.

### 7.3 Integration suite

```
$ SLIPLABZ_DATABASE_URL="postgresql://postgres:postgres@localhost:55446/sliplabz_v1_a1_3_test" npm run test:integration
ℹ tests 71
ℹ suites 14
ℹ pass 71
ℹ fail 0
```

Same 71 integration tests as V1-A1-2a. Phase A adds no persistence-side integration surface.

### 7.4 §F acceptance-standard test output

Every §F example passes. See §3 table above; every stated value matched. No discrepancy silently reconciled; one governance finding on §F.6 recorded.

---

## 8. What Phase A does NOT include (Phase B obligations, recorded for the next ticket)

Phase B (writer, drivers, integration) is out of scope by explicit governor split. Explicitly deferred to Phase B:

1. **Writer** — `INSERT INTO evidence_profiles + evidence_profile_reasons` transactional path, using the V1-A1-2 UPSERT strategy documented in the migration header. UPSERT MUST use `ON CONFLICT ON CONSTRAINT evidence_profiles_grain_version_unique DO UPDATE SET …` restricted to recomputable columns; never `DO NOTHING` (V1-5 lesson).
2. **Driver** — invalidation-consuming path (analogous to V1-5's `recomputationWriter`) OR a slate-based aggregator (analogous to V1-5's `currentMarketRowsAggregator`) that batch-computes evidence profiles for the current-slate grains. Governor authorization required.
3. **First-profile event obligation (DR-29)** — the ticket that persists the first operative evidence_profiles row MUST document the event per §I.3: UTC timestamp; `method_version = 'evidence_method_v1'`; `evidence_profile_id`; commit HEAD SHA; and the explicit line "The DR-29 pre-first-profile method-correction exception is permanently closed as of this commit." After that record, DR-29 is closed permanently — every subsequent output-affecting change re-enters through DR-24.
4. **Consensus-only persistence restriction** — Phase B MUST persist only `evaluated_source_kind = 'sportsbook_consensus'` profiles. Other kinds (specific-book, pick'em, user-entered) are computed on-demand and MUST NOT be persisted at `evidence_method_v1` (V1-A1-2 grain governor ruling).
5. **Downgrade to `computation_version` bump on read-model changes** — when the underlying V1-5 read-model computation_version advances (e.g. a normalization change), Phase B recomputes at the new `source_read_model_computation_version` with a new evidence-profile `computation_version`. Prior versions remain immutable.

---

## 9. `git status --short`

```
 M src/shared/enums.ts
 M tests/evidence/schema.test.ts
?? src/evidence/classification.ts
?? src/evidence/components/
?? src/evidence/engine.ts
?? src/evidence/marginNormalizers.ts
?? src/evidence/quality.ts
?? src/evidence/reasons.ts
?? src/evidence/types.ts
?? tests/evidence/engine.governor.test.ts
?? tests/evidence/fFixtures.test.ts
?? tests/evidence/fFixtures.ts
?? docs/product/reports/V1_TICKET_A1_3_PHASE_A_REPORT.md  (this file)
```

Files touched exactly match the Phase A scope. **Nothing staged. Nothing committed. Nothing pushed.**

---

HALTED after V1-A1-3 Phase A. Nothing committed. No profile has been persisted; the DR-29 pre-first-profile exception remains active. Phase B has not begun and will not begin without governor authorization.

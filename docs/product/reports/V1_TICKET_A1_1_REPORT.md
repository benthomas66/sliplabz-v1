# V1-A1-1 Ticket Report — Evidence Method Authority

**Ticket:** V1-A1-1 (amendment V1-A1 §31; merged sequence §30 / GD-12).
**Kind:** DOCUMENT-ONLY. No schema, no engine, no migrations, no `src/` changes. Every check was file-writing to `docs/`.
**Starting HEAD:** `7fa8358abe533ce6a6373b9f62cbaf4e1f6219e3` — `feat: shared computation, read model, and operational drivers (V1-5)`.
**Branch:** `main`.
**Working tree at ticket start:** clean.

---

## 1. Authorities read

- `docs/product/amendments/SLIPLABZ_V1_AMENDMENT_A1_INTEGRATED.md` — §§4, 8, 9, 10, 11, 12, 13, 26, 27 in full; §19 not present in A1 (A2 has 19); §§30, 31, 34 in full.
- `docs/product/amendments/SLIPLABZ_V1_UX_AMENDMENT_A2_ADOPTED.md` — §3.3 (evidence-state language / compact variants) and §19 GD-15 in full.
- `docs/architecture/V1_COMPUTATION_CONTRACT.md` — full read; every scoring input in §A of the method authority binds to a field this contract produces (with the explicit exceptions in the RME register).
- `docs/product/V1_GOVERNANCE_DECISIONS.md` v2.1 — GD-8 (no probability / EV / projection), GD-9 (four-market and provider scope locked), GD-6 (provisional fixtures pre-V1-9), GD-12, GD-13, GD-15, GD-17.
- Complete spec §§12–15 for freshness/failure/degraded vocabulary — freshness_state enum (fresh / aging / stale / unavailable / failed_latest_poll), BDL presence_state vocabulary (currently_reported / not_returned_latest_complete_snapshot / stale_feed / unresolved_player / source_unavailable), postponed/canceled game policy §15.5.
- Field-shape confirmation: `src/computation/types.ts` (14 exported interfaces + `CurrentMarketRow` composition), `src/computation/availabilityContext.ts` (presence state values), `supabase/migrations/20260711130000_oddsapi_enums.sql` (freshness_state enum).

## 2. Input-binding table summary

The method authority §A binds every amendment §9 input to a concrete V1-5 read-model field. Aggregate:

| §9 subsection | Inputs enumerated | Fully bound | Requires read-model extension (see §A.7 / RME below) |
|---|---:|---:|---:|
| §9.1 Historical threshold results | 8 | 7 | 1 (historical coverage start) |
| §9.2 Line-relative production | 6 | 6 | 0 |
| §9.3 Current market context | 12 | 12 | 0 |
| §9.4 Evidence-quality inputs | 11 | 9 | 2 (per-grain mapping resolution flags; one-sided offering first-class flag) |
| **Total** | **37** | **34** | **3 direct + 3 indirect (RME-4, RME-5, RME-6)** |

Every unbound input is listed in §A.7 with a proposed future read-model field and rationale. No input was silently bound to a field that does not produce it.

## 3. "Requires read-model extension" register

Six items (verbatim from method authority §A.7):

| # | Amendment input | Proposed future read-model field | Status |
|---|---|---|---|
| RME-1 | Historical coverage start (§9.1) | `HistoricalCoverageResult.coverage_start_date` in a new module `src/computation/historicalCoverage.ts` | Needed for DR-25 evaluation before engine ships. Trivial derivation. |
| RME-2 | Unresolved player / event mapping per (game, player) grain (§9.4) | `MappingResolutionResult.player_resolved: boolean`, `.event_resolved: boolean`, `.queue_reason: string | null` in a new helper reading V1-1 queues | Needed for Unavailable classification decisions §C.9. |
| RME-3 | One-sided offering flag as first-class field (§9.4) | `CurrentMarketRow.book_detail.one_sided: 'over_only' | 'under_only' | 'neither' | null` | Needed for §C.7 clean single-owner handling. Derivable now, but hoisting keeps V1_COMPUTATION_CONTRACT §1 single-owner rule intact. |
| RME-4 | Abnormal dispersion signal (§11.5) | `ThresholdWindowResult.margin_dispersion_stddev` or `.abnormal_dispersion: boolean` | Amendment §11.5 lists as a distinct quality input; currently derivable in-engine. |
| RME-5 | Market state disambiguation | `CurrentMarketRow.market_state: 'available' | 'unavailable' | 'aging_empty'` | Optional cleanup for DR-16 edge cases. |
| RME-6 | "Displayed reasons ordering" material-contribution intermediate | Engine intermediate, NOT a read-model field | Recorded so V1-A1-3 doesn't invent silently. |

**Engine work (V1-A1-3) cannot begin until RME-1 through RME-3 are either delivered as read-model extensions OR the owner explicitly authorizes the engine to compute them itself with corresponding tests.** RME-4 and RME-5 are engine-nice-to-have; RME-6 is engine-internal.

## 4. Decisions register count

The method authority §0 contains **26 numbered Decision Register rows** (DR-1 through DR-26), each marked **[OWNER APPROVAL REQUIRED]**. Categories:

- Weights and formulas: DR-1, DR-11, DR-12, DR-14 (4 rows)
- Classification thresholds: DR-2, DR-3, DR-4, DR-5 (4 rows)
- Sample requirements: DR-6, DR-7, DR-8, DR-25 (4 rows)
- Quality caps: DR-9, DR-10, DR-16, DR-17, DR-18, DR-22 (6 rows)
- Market alignment tunables: DR-15 (1 row)
- Long-window preference (GD-17 #4 resolution): DR-13 (1 row)
- Display and audit: DR-19, DR-20, DR-21, DR-26 (4 rows)
- Provenance policy: DR-23 (1 row)
- Version governance: DR-24 (1 row)

Nothing outside the Decision Register presents a tunable as settled. Every threshold, weight, minimum-sample, cap condition, and window preference in §B / §C / §D is either a numbered DR or a binding governor direction cited at the top of the method authority.

## 5. Binding directions honored (not presented as open)

- GD-8: no probabilities, EV, projections, or fabricated values anywhere in the method — asserted at top of the authority and enforced in §G.4 (forbidden-language list).
- GD-9: four-market and provider scope. §B margin normalizers (DR-14) are keyed only to `player_points`, `player_rebounds`, `player_assists`, `player_threes`.
- GD-15 taxonomy is fixed — §D uses the seven-label taxonomy verbatim; §D.2 provides the compact-display mapping (DR-21) with the four required GD-15 constraints applied literally.
- A1 §27.2 "L5 alone cannot create a Strong classification" — numerically enforced by DR-8 + DR-11 + DR-12 (L5 has zero composite weight in `C_RTP`, Strong requires `L10.eligible_n ≥ 8`, and Strong requires the non-L5 contribution to carry meaningful magnitude).
- Pushes neutral — §B.2 excludes pushes from the Over/Under denominator; §C.6 caps on push-heavy L10; §E.1 push-heavy translation.
- Threshold-relative and closing-line-relative components structurally distinct — §A binds them to distinct V1-5 modules (`thresholdWindows.ts` vs `realLineWindows.ts`); the engine is instructed to keep them separate per A1 §9.
- Insufficient never in Top Over / Top Under — §D.1 classification ordering places Insufficient before any directional label; V1-6 rank consumers reject Insufficient rows (documented restriction).

## 6. Deviations

- No dedicated §19 exists in amendment V1-A1 (§19 is A1's `Default sorting and filtering` section, which is amendment sorting-authority rather than a taxonomy or reason-code ruling). I read it and applied its constraints to §D.1 ordering discussion. I read GD-15 from A2 §19 as the preflight instructs.
- Amendment §11 numeric expression: the amendment specifies COMPONENT NAMES and generic normalization/weighting rules but leaves the specific weights and thresholds unresolved. All numeric expression is proposed as **[OWNER APPROVAL REQUIRED]** DR rows; nothing is presented as settled.
- Six worked examples produced (§F.1–§F.6). Example F.1 illustrates a case where a clean-looking pattern does NOT reach Strong under the draft's DR-2 = 0.60 — retained deliberately as an owner-review checkpoint. F.1a shows a stronger variant that still narrowly misses Strong at DR-2 = 0.60, documenting the practical bite of the threshold. This is intentional: the Decision Register invites the owner to evaluate whether DR-2 = 0.60 is too strict for the desired product density.

## 7. Assumptions

- The read-model extensions listed as RME-1 through RME-3 will be delivered as a small V1-5 extension ticket OR authorized as engine-owned computations before V1-A1-3 begins. This is not a V1-A1-1 decision.
- The A2 compact-display mapping in §D.2 (DR-21) resolves GD-15's "documented mapping IN THIS AUTHORITY" requirement. The mapping is DR-21 pending owner sign-off.
- GD-17 #4 (default longer historical window L20 vs season) is resolved as DR-13 with L20-preferred and a season fallback when L20 sample is thin. Owner approval on the same review pass.
- No product-surface work is authorized by this ticket. V1-6 / V1-7 / V1-8 consumers of Evidence Profiles will be defined in their own tickets.

## 8. Files changed

- **New:** `docs/product/EVIDENCE_PROFILE_METHOD_V1.md` (draft v0.1, pending owner approval).
- **New:** `docs/product/reports/V1_TICKET_A1_1_REPORT.md` (this file).
- **No changes to:** `src/`, `supabase/`, `tests/`, any prior report, any prior contract, or any amendment.

`git status --short`:

```
?? docs/product/EVIDENCE_PROFILE_METHOD_V1.md
?? docs/product/reports/V1_TICKET_A1_1_REPORT.md
```

## 9. Explicit halt status (draft-pass, superseded by correction pass below)

Report complete. Nothing staged, committed, or pushed.

HALTED after V1-A1-1 draft. Nothing committed. The method authority is pending product-owner review and approval; no evidence schema or engine work will begin without it.

---
---

# Correction pass — 2026-07-14

The product owner reviewed the v0.1 draft on 2026-07-14 and issued a set of decisions. This section records the changes applied to `docs/product/EVIDENCE_PROFILE_METHOD_V1.md`. The document was rewritten in place as a COMPLETE OWNER-APPROVED v1.0 stamped `evidence_method_v1`. Draft v0.1 is not preserved as an operative method version (DR-24 rule).

## 10. What changed

### 10.1 Technical corrections (T1–T4)

- **T1 (§B.3 null re-weighting):** replaced with the exact rule: each available term keeps its base weight (L10 avg 0.40 / L10 median 0.30 / season avg 0.20 / season median 0.10); omit terms whose input is null; sum the remaining base weights; divide each remaining base weight by that sum; compute `C_MS`. If no margin inputs are available, `C_MS = 0`. A worked null example (`season median null → normalized weights 0.4444 / 0.3333 / 0.2222`) is inline. No other relative ratio is referenced.
- **T2 (new `MARKET_DISAGREES_WITH_HISTORY` reason code):** trigger `sign(C_MA) ≠ sign(C_RTP) AND |C_MA| ≥ 0.30 AND |C_RTP| ≥ 0.30`; effect attach + cap at Moderate; direction-neutral translation. Recorded in §C.5 and §E.1.
- **T3 (remove `STRONG_*_AGREEMENT`, add direction-neutral `WINDOW_AGREEMENT_SUPPORT`):** trigger `|C_WA| ≥ 0.60 AND sign(C_WA) == direction`; available for Moderate as well as Strong; translation "Recent and longer-window results point in the same direction." Every worked example, reason list, and translation updated. §E.1 explicitly documents the mapping per A1 §26 ("at minimum, support or map equivalent codes").
- **T4 (F.2 explicit L5 inputs):** F.2 now states L5 over 1 / under 4 / push 0, `eligible_n = 5`, `rate_deviation = −0.60`, sign −1. `C_WA` recomputed from fully specified inputs. F.3 and F.6 also carry explicit L5 counts. No worked example relies on an unstated assumed value.

### 10.2 Owner decisions on the Decision Register

- **Approved as drafted** (marked `[OWNER APPROVED — 2026-07-14]`): DR-1, DR-4, DR-5, DR-6, DR-7, DR-8, DR-9, DR-10, DR-12, DR-13, DR-15, DR-16, DR-18, DR-20, DR-21, DR-22, DR-23, DR-24, DR-25, DR-26.
- **DR-2:** 0.60 → **0.55**. No quality cap or Strong prerequisite weakened.
- **DR-3:** Moderate band becomes `0.30 ≤ |score| < 0.55`.
- **DR-11:** approved in substance; the DR-11 row and §C.10 clause 4 now carry the SAME numeric expression verbatim: `|0.55 × rate_deviation(L10) + 0.25 × rate_deviation(longer_window) + 0.20 × rate_deviation(season)| ≥ 0.30`. Prior draft conflict removed.
- **DR-14:** provisionally approved (`M_points = 6.0, M_rebounds = 3.0, M_assists = 2.0, M_threes = 1.5`) with §I.1 recording the required pre-engine zero-provider-credit offline validation and stating explicitly the validation does NOT authorize the implementation agent to change the constants.
- **DR-17:** corrected definition adopted — WINDOWS_DISAGREE fires when ANY PAIR among L10, L20, season have opposite non-zero signs AND each has `|rate_deviation| ≥ 0.30`; L5 NEVER independently triggers. Applied identically in DR-17, §B.4, §C.5, and F.3.
- **DR-19:** changed to **research-view-only**. Numeric composite score hidden by default; only appears inside expanded Research View or grade-detail area; never a percentage; not-a-probability disclosure immediately adjacent; no probability-style gauge, dial, or meter. Bound to every downstream UX ticket.
- **DR-20:** clarified that ranking uses the full-precision stored score, not the rounded DR-19 display value.
- **DR-23:** approved with explicit requirements (a) preserve `includes_backfilled_historical` on the profile; (b) surface copy discloses seeded inclusion; (c) never "observed since launch"; (d) consumers filtering post-launch views may exclude these; (e) NO automatic quality cap solely for backfilled provenance.
- **DR-24:** approved; locked document begins directly as `evidence_method_v1`; draft v0.1 not preserved.
- **DR-26:** approved for canonical stored order; added the compact-UI clause allowing binding cap / availability elevation for user comprehension without altering the canonical stored order.

### 10.3 V1-5x ruling (§I.2)

- **RME-1 (`HistoricalCoverageResult.coverage_start_date`)**, **RME-2 (`MappingResolutionResult`)**, and **RME-3 (`CurrentMarketRow.book_detail.one_sided`)** — read-model-owned; delivered by ticket **V1-5x** BEFORE V1-A1-3. The engine consumes them; may not derive parallel versions.
- **DR-25's 30-day coverage requirement** depends on RME-1 and may not be approximated inside the engine.
- **RME-4 (abnormal dispersion signal) — DEFERRED.** Amendment cite: A1 §11.5 authorizes the penalty but does NOT mandate a dedicated read-model field.
- **RME-5 (market state disambiguation field) — DEFERRED.** Amendment cite: A1 §9.4 lists inputs but does NOT mandate a dedicated derived field. §C.3 disambiguation table covers the classification branches directly.
- **RME-6** remains an engine intermediate governed by DR-26.

### 10.4 Surface rules recorded (§D.4)

Seven binding rules for V1-6 / V1-7 / V1-8 governing compact surfaces, dense-row treatment, Research View content, threshold re-evaluation, prohibition on probability-style posture, cap communication, and backfilled-inclusion surfacing.

### 10.5 Consistency corrections (§E in the task)

1. DR-11 ↔ §C.10 clause 4 unified — one numeric rule.
2. DR-17 ↔ F.3 evaluated under the corrected any-pair definition — F.3 shows the L10/L20 pair firing.
3. Freshness §C.3 disambiguated into a four-way deterministic table across `(freshness.state, eligible_book_count.count)`.
4. Reason vocabulary closed. `WINDOWS_DISAGREE` reserved for inter-window L10/L20/season disagreement only. New `MARGIN_MEASURES_DISAGREE` code covers L10 avg-vs-median opposite signs (attach only, no independent Mixed/cap).
5. Worked examples fully recomputed — see §11 below.

## 11. Recomputed examples — before vs after

Every example was recomputed exactly under the final formulas.

| # | Example | Before (draft v0.1) | After (evidence_method_v1) |
|---|---|---|---|
| F.1 | Moderate Over — clean but not quite Strong (calibration reference) | score 0.4997 → Moderate Over (at DR-2 = 0.60) | score **0.4997** unchanged; classified **Moderate Over Evidence** (at DR-2 = 0.55; still below 0.55). Reasons: `POSITIVE_MARGIN_SUPPORT`, **`WINDOW_AGREEMENT_SUPPORT`** (replacing STRONG_OVER_AGREEMENT), `FAVORABLE_CONSENSUS_DIFFERENCE`. |
| F.1a | Strong Over — cleaner variant | score 0.5761 (arithmetic error in draft; C_MS recomputed as 0.4783) → Moderate under DR-2=0.60 | score **0.5699** (recomputed exactly; C_MS = 0.40×0.65 + 0.30×0.4167 + 0.20×0.30 + 0.10×0.3333 = **0.4783**; score = 0.35×0.6294 + 0.25×0.4783 + 0.20×1.00 + 0.20×0.15 = **0.5699**). Classified **Strong Over Evidence** at DR-2 = 0.55, with all §C.10 conditions clear. Reasons: `POSITIVE_MARGIN_SUPPORT`, `WINDOW_AGREEMENT_SUPPORT`, `FAVORABLE_CONSENSUS_DIFFERENCE`. Prose rewritten to describe Strong classification. |
| F.2 | Moderate Under | score −0.4121 → Moderate Under (assumed L5 sign) | score **−0.4121** unchanged; classified **Moderate Under Evidence**. L5 inputs now explicit (over 1 / under 4 / push 0, rd −0.60). Reasons: `WINDOW_AGREEMENT_SUPPORT` (T3), `FAVORABLE_CONSENSUS_DIFFERENCE`. `POSITIVE_MARGIN_SUPPORT` does NOT fire (`|C_MS| = 0.2967 < 0.30`) — explicitly noted in the example. |
| F.3 | Mixed by contradiction | Classification Mixed via DR-17 firing on L10/L20 pair (draft's "interpretation" of the rule) | Classification **Mixed** — same outcome, now under the OWNER-CORRECTED DR-17 (any pair among L10/L20/season, opposite non-zero signs, each `|rd| ≥ 0.30`). L5 inputs explicit (over 4 / under 1 / push 0, rd +0.60). L10 vs L20 pair fires; L10 vs season does not (season |rd| = 0.1538 below 0.30). Composite score recomputed exactly to −0.0500; classification forced Mixed at §D.1 step 3. Reasons include `WINDOWS_DISAGREE` (primary) and `NEGATIVE_MARGIN_SUPPORT` (`|C_MS| = 0.31 ≥ 0.30`, signs disagree). `MARGIN_MEASURES_DISAGREE` and `MARKET_DISAGREES_WITH_HISTORY` explicitly evaluated and shown to NOT fire on this configuration. |
| F.4 | Insufficient by sample | Insufficient by DR-6 — unchanged | Unchanged. L5 counts stated. |
| F.5 | Unavailable by freshness | Unavailable — unchanged | Unchanged; now cites §C.3 disambiguation row `unavailable, any count`. |
| F.6 | Quality-capped Strong → Moderate | Would-be-Strong capped by `INSUFFICIENT_BOOK_COVERAGE` + `STALE_CURRENT_MARKET` | Score **0.4564** (recomputed exactly). Classified **Moderate Over Evidence**, `quality_capped = true`. Reasons: `POSITIVE_MARGIN_SUPPORT`, `WINDOW_AGREEMENT_SUPPORT` (T3), `INSUFFICIENT_BOOK_COVERAGE`, `STALE_CURRENT_MARKET`. `MARKET_DISAGREES_WITH_HISTORY` explicitly checked and shown to NOT fire on this configuration (`|C_MA| = 0.1167 < 0.30`). Compact-surface hint per DR-26 clause noted. |

## 12. Closed reason vocabulary list (final)

Twenty (20) reason codes; every one has exactly one trigger, one category, one effect, one safe translation.

1. `INSUFFICIENT_L10_SAMPLE`
2. `INCOMPLETE_HISTORICAL_COVERAGE`
3. `STALE_CURRENT_MARKET`
4. `INSUFFICIENT_BOOK_COVERAGE`
5. `WINDOWS_DISAGREE` (corrected DR-17)
6. `PUSH_HEAVY_SAMPLE`
7. `UNRESOLVED_PLAYER_MAPPING`
8. `UNRESOLVED_EVENT_MAPPING`
9. `NO_CURRENT_MARKET`
10. `POSTPONED_GAME`
11. `CANCELED_GAME`
12. `ONE_SIDED_OFFERING`
13. `SOURCE_UNAVAILABLE`
14. **`WINDOW_AGREEMENT_SUPPORT` (T3 — direction-neutral, replaces `STRONG_OVER_AGREEMENT` / `STRONG_UNDER_AGREEMENT`)**
15. `FAVORABLE_CONSENSUS_DIFFERENCE`
16. `UNFAVORABLE_CONSENSUS_DIFFERENCE`
17. `POSITIVE_MARGIN_SUPPORT`
18. `NEGATIVE_MARGIN_SUPPORT`
19. **`MARKET_DISAGREES_WITH_HISTORY` (T2 — new)**
20. **`MARGIN_MEASURES_DISAGREE` (E.4 — new)**

`ABNORMAL_DISPERSION` is NOT in the closed vocabulary at `evidence_method_v1` — pending DR-27 owner decision.

## 13. Open questions

- **DR-27 — Abnormal-dispersion cap threshold.** A1 §11.5 authorizes the penalty; the trigger threshold requires owner input. Draft placeholder: `stddev(L10 margins) > K × margin_normalizer(market)`, K ∈ [1.5, 3.0]. Until decided, `ABNORMAL_DISPERSION` is NOT a reason code the engine emits. If rejected, the §11.5 abnormal-dispersion clause is deferred to a future method-version bump.

No other open questions remain. Every remaining tunable has an approved value in the Decision Register.

## 14. Files changed (correction pass)

- **Rewritten in place:** `docs/product/EVIDENCE_PROFILE_METHOD_V1.md` — now stamped `Status: OWNER-APPROVED v1.0`, `Method version: evidence_method_v1`.
- **Extended in place:** `docs/product/reports/V1_TICKET_A1_1_REPORT.md` — this correction-pass section appended.
- **No changes to:** `src/`, `supabase/`, `tests/`, any prior report, any prior contract, any amendment, or `docs/product/V1_GOVERNANCE_DECISIONS.md`.

`git status --short` (unchanged from draft pass — same two untracked files):

```
?? docs/product/EVIDENCE_PROFILE_METHOD_V1.md
?? docs/product/reports/V1_TICKET_A1_1_REPORT.md
```

## 15. Explicit halt status (correction pass)

Report complete. Nothing staged, committed, or pushed. Zero code / schema / migration / UI changes. No downstream ticket created.

HALTED after V1-A1-1 correction pass. The method authority is complete at OWNER-APPROVED v1.0 and awaits final owner/governor confirmation before commit. No implementation has begun.

---

## 16. Final micro-pass — DR-27 disposition + extended DR-14 validation (2026-07-14)

**Kind:** DOCUMENT-ONLY. No code, no schema, no migrations, no downstream ticket. Nothing staged, committed, or pushed.

**Owner directive:** DEFER DR-27 pending the already-required DR-14 offline distribution validation. Do NOT assign `K` by intuition in `evidence_method_v1`. The abnormal-dispersion requirement from amendment §11.5 remains ACKNOWLEDGED AND EXPLICITLY DEFERRED, never silently omitted.

**DR-27 disposition — [OWNER APPROVED — DEFERRED PENDING OFFLINE CALIBRATION — 2026-07-14].** Recorded verbatim as a FORMAL §11.5 DEFERRAL in the method authority, with four load-bearing consequences for `evidence_method_v1`:

1. FORMAL §11.5 DEFERRAL — never a silent omission.
2. `ABNORMAL_DISPERSION` is a RESERVED reason code with NO ACTIVE TRIGGER; it appears in the §E.1 vocabulary table marked "RESERVED — NOT EMITTED IN `evidence_method_v1`". The vocabulary REMAINS CLOSED.
3. NO profile is capped on abnormal dispersion in `evidence_method_v1`.
4. The engine MUST NOT invent, approximate, or derive a threshold; any such attempt is a halt condition. Activation requires (a) owner review of the extended §I.1 calibration evidence, (b) owner/governor approval of a recommended `K` with documented expected product impact, (c) a DR-24 method-version bump (`evidence_method_v1` → `evidence_method_v2`), AND (d) regression fixtures per A1 §12.

**Extended DR-14 validation requirement (§I.1).** The pre-engine offline validation now assembles BOTH the DR-14 margin-normalizer distribution AND the DR-27 calibration evidence, per market. The DR-27 evidence set includes: distribution of L10 margin standard deviation; median, 75th / 90th / 95th percentiles of that stddev; proportion of profiles WOULD be capped at each candidate `K ∈ {1.5, 2.0, 2.5, 3.0}`; specific impact on `player_threes` given its 1.5 margin normalizer; and at least five concrete profile examples near EACH candidate cutoff. After owner review, DR-27 RETURNS for owner/governor approval with a recommended `K` and expected product impact — the implementation agent MUST NOT choose `K`.

**Areas touched in the method document (exactly five):**

1. DR-27 register row (new stamp + verbatim four owner directives).
2. §E.1 vocabulary table — added `ABNORMAL_DISPERSION` entry marked RESERVED — NOT EMITTED IN `evidence_method_v1` (no active trigger, no effect, no user-facing translation).
3. §I.1 validation spec — extended with DR-27 calibration-evidence outputs, `player_threes` impact, ≥5 examples per candidate cutoff, and the "DR-27 RETURNS for owner/governor approval" clause.
4. §I.3 open-questions section — rewritten as "Formally deferred decisions" recording DR-27's four owner requirements; no `[OWNER APPROVAL REQUIRED]` marker remains anywhere in the document.
5. Compliance checklist (Limitations line), RME-4 paragraph (§I.2), and closing paragraph — reworded to reflect DR-27's formal deferral (all under "collateral wording tied to DR-27 disposition"; no substantive rule change).

**Verification:**

- `grep -c "OWNER APPROVAL REQUIRED" docs/product/EVIDENCE_PROFILE_METHOD_V1.md` → **0**.
- SHA-256: `66c2afb72fdf3ebbbfe4cbccb05a7bfcd0628ffd721c4be60579456fb0722393`.
- Line count: **838**.
- No approved formula, threshold, weight, reason-code trigger, worked-example number, or surface rule was changed. All decisions in the register are now resolved.

**Files changed in this micro-pass:**

- `docs/product/EVIDENCE_PROFILE_METHOD_V1.md` — five in-place edits enumerated above.
- `docs/product/reports/V1_TICKET_A1_1_REPORT.md` — this §16 appended.

HALTED after V1-A1-1 final micro-pass. `evidence_method_v1` is complete with all decisions resolved. Awaiting governor commit authorization. No implementation has begun.

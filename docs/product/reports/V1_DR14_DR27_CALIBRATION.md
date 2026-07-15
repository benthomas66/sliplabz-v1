# V1-A1-1 DR-14 / DR-27 Offline Calibration Validation — RE-RUN (CORRECTED)

**Method authority:** `docs/product/EVIDENCE_PROFILE_METHOD_V1.md` v1.0 (`evidence_method_v1`); DR-14 provisionally approved 2026-07-14; DR-27 formally deferred pending this calibration.
**Data source:** hosted Supabase database (`postgresql://postgres.fxlzkhaepwlnezchnkyt:REDACTED@aws-0-ca-central-1.pooler.supabase.com:5432/postgres`), read-only session (`BEGIN READ ONLY … ROLLBACK`).
**Generated:** 2026-07-15T20:52 UTC (corrected re-run).
**Supersedes:** the earlier V1-4c Phase B calibration report (same date) which contained two defects flagged by the governor and corrected here.
**Zero provider credits spent.** No Odds API, no BALLDONTLIE, no live-invoke path. Every input is already in the hosted database. Reads only; no writes.

**Governance framing (per method authority §I.3 clause 4):** the implementation agent MUST NOT choose K, MUST NOT activate `ABNORMAL_DISPERSION`, and MUST NOT change any constant. This report provides EVIDENCE for owner/governor review under DR-24. A single labeled recommendation appears at §3.

---

## 0. What changed vs. the earlier run

Two defects were flagged and are corrected here — no changes to the populator, no changes to `historical_line_results` data, no new writes.

**DEFECT 1 (blocking): DR-14's clamp analysis measured the wrong quantity.** The prior run reported clamp proportions of individual game margins (`COUNT(*) FILTER (WHERE margin / M <= -1 OR margin / M >= 1)`), but `norm_margin` in EVIDENCE_PROFILE_METHOD_V1.md §B.3 is never applied to an individual game margin — it is applied to four AVERAGED / MEDIAN terms per (player, market), then combined into `C_MS` with fixed base weights and the T1 null-handling rule. An average over ten games has a much smaller magnitude than the individual margins composing it, because they partially cancel. The prior "31 %, 24 %, 32 %, 48 %" numbers did NOT answer the DR-14 question ("does the normalizer disproportionately compress ordinary vs. exceptional margins into the score?"). §1 below reports the corrected analysis.

**DEFECT 2 (non-blocking): DR-27's qualifying population was the wrong cut.** DR-27 caps only would-be-STRONG profiles, and DR-8 requires L10 eligible_n ≥ 8 for Strong to be reachable. The prior run reported cap proportions on the DR-6 population (n ≥ 5, minimum for any label), which overstates the population DR-27 actually protects. §2 below now reports both `n ≥ 5` and `n ≥ 8` populations side by side.

**Read-model proxy caveat (applies to DR-14 corrected):** §B.3's four inputs — L10 avg_minus_threshold, L10 median_minus_threshold, season avg_minus_threshold, season median_minus_threshold — are relative to a single EVALUATED line. In the seeded historical data there is no evaluated line: `margin` is `player_stat_value − canonical_closing_point` for each game, using that game's OWN canonical closing line. The corrected DR-14 analysis therefore proxies each C_MS input as the mean / median of margin over the qualifying window under each game's own closing line. This proxy is directionally comparable in magnitude but not identical to a threshold-relative computation against a single evaluated line. A threshold-relative re-run becomes possible once current market rows exist for these grains (see §2.4 would-be-Strong prerequisite gap — same underlying data limitation).

**What is unchanged and correct (not redone):**

- DR-27's stddev computation itself (population stddev over the latest 10 eligible margins). Only the qualifying-population cut changes.
- `would_be_strong_capped` values remain **null** across every (market, K) pair — reported as absence per §I.1 "no estimation where data is absent."
- §I.3 clause (4) halt condition remains in force: no K is chosen; `ABNORMAL_DISPERSION` remains a RESERVED reason code in `evidence_method_v1`.

---

## 0.1 Data-availability probe

`data_gap.present = false` — this calibration is decisive to the extent the sample allows (see §2.1 qualifying-sample decisiveness on the n ≥ 8 population).

| Table | Row count |
|---|---:|
| `historical_line_results` | **4,658** |
| `canonical_closing_points` | 4,955 |
| `player_game_stats` | 4,194 |
| `real_line_windows` | 0 |

`historical_line_results` per market:

| Market | Rows |
|---|---:|
| `player_points` | 1,524 |
| `player_rebounds` | 1,301 |
| `player_assists` | 872 |
| `player_threes` | 961 |
| **TOTAL** | **4,658** |

`real_line_windows = 0` is **NOT a gap for this calibration** — the corrected DR-14 aggregates and the DR-27 stddev both derive directly from `historical_line_results` ordered by `games.scheduled_start_utc DESC`. See §4 SQL.

---

## 1. DR-14 CORRECTED — C_MS term distribution + weighted-C_MS saturation per market

### 1.0 What DR-14 asks

Per EVIDENCE_PROFILE_METHOD_V1.md §I.1 (extended pre-engine offline validation), DR-14 validation reports whether the approved margin normalizer for each market:

- disproportionately concentrates ordinary rather than exceptional margins into the score (`C_MS` saturates for typical performance), OR
- leaves ordinary performance so unclamped that the component fails to differentiate.

**The correct instrument for that question is the CLAMP PROPORTION of the four C_MS INPUT TERMS after `norm_margin` is applied, plus the SATURATION PROPORTION of the WEIGHTED C_MS itself.** Individual game-margin clamp rates measure something else entirely (see §1.4 informational table).

`norm_margin(raw) := max(-1, min(+1, raw / M))`. Base weights (§B.3): L10 avg 0.40, L10 median 0.30, season avg 0.20, season median 0.10. T1 null-handling: retained-weight rescaling; if all four are null, `C_MS = 0` (excluded from the qualifying pool below). `C_MS ∈ [-1, +1]` after clamp; `|C_MS| = 1` means at least one dominant term saturated and dragged the weighted sum to the bound.

### 1.1 Corrected clamp analysis — per term + weighted C_MS

Qualifying player-market pairs = players with at least one non-null term (all four came from ≥ 1 eligible margin). Numbers are proportions with the clamp count (low + high) shown for reproducibility.

**`player_points` — M = 6.0**

| Term | n | p50 |raw| | p75 |raw| | p90 |raw| | p95 |raw| | Clamp count | Clamp % |
|---|---:|---:|---:|---:|---:|---:|---:|
| `norm_margin(L10.avg)`   | 126 | 0.30 · 6 = 1.80 | 0.48 · 6 = 2.90 | 0.67 · 6 = 4.04 | 0.83 · 6 = 4.98 | 4 + 2 | **4.76 %** |
| `norm_margin(L10.median)` | 126 | 0.42 · 6 = 2.50 | 0.58 · 6 = 3.50 | 0.75 · 6 = 4.50 | 0.98 · 6 = 5.88 | 5 + 2 | **5.56 %** |
| `norm_margin(season.avg)` | 126 | 0.23 · 6 = 1.38 | 0.44 · 6 = 2.66 | 0.59 · 6 = 3.54 | 0.75 · 6 = 4.50 | 4 + 2 | **4.76 %** |
| `norm_margin(season.median)` | 126 | 0.25 · 6 = 1.50 | 0.50 · 6 = 3.00 | 0.75 · 6 = 4.50 | 0.96 · 6 = 5.75 | 4 + 3 | **5.56 %** |
| **`|C_MS|`** | 126 | **0.290** | **0.499** | **0.641** | **0.750** | 6 saturate | **4.76 %** |

**`player_rebounds` — M = 3.0**

| Term | n | p50 |raw| | p75 |raw| | p90 |raw| | p95 |raw| | Clamp count | Clamp % |
|---|---:|---:|---:|---:|---:|---:|---:|
| `norm_margin(L10.avg)`    | 113 | 0.25 · 3 = 0.75 | 0.43 · 3 = 1.30 | 0.65 · 3 = 1.96 | 0.83 · 3 = 2.50 | 4 + 0 | **3.54 %** |
| `norm_margin(L10.median)` | 113 | 0.17 · 3 = 0.50 | 0.50 · 3 = 1.50 | 0.67 · 3 = 2.00 | 0.83 · 3 = 2.50 | 4 + 0 | **3.54 %** |
| `norm_margin(season.avg)` | 113 | 0.17 · 3 = 0.50 | 0.33 · 3 = 1.00 | 0.65 · 3 = 1.96 | 0.83 · 3 = 2.50 | 4 + 0 | **3.54 %** |
| `norm_margin(season.median)` | 113 | 0.17 · 3 = 0.50 | 0.50 · 3 = 1.50 | 0.50 · 3 = 1.50 | 0.83 · 3 = 2.50 | 4 + 0 | **3.54 %** |
| **`|C_MS|`** | 113 | **0.217** | **0.389** | **0.646** | **0.833** | 4 saturate | **3.54 %** |

**`player_assists` — M = 2.0**

| Term | n | p50 |raw| | p75 |raw| | p90 |raw| | p95 |raw| | Clamp count | Clamp % |
|---|---:|---:|---:|---:|---:|---:|---:|
| `norm_margin(L10.avg)`    | 83 | 0.25 · 2 = 0.50 | 0.48 · 2 = 0.95 | 0.75 · 2 = 1.50 | 0.75 · 2 = 1.50 | 3 + 0 | **3.61 %** |
| `norm_margin(L10.median)` | 83 | 0.25 · 2 = 0.50 | 0.50 · 2 = 1.00 | 0.75 · 2 = 1.50 | 0.75 · 2 = 1.50 | 3 + 0 | **3.61 %** |
| `norm_margin(season.avg)` | 83 | 0.25 · 2 = 0.50 | 0.43 · 2 = 0.87 | 0.75 · 2 = 1.50 | 0.75 · 2 = 1.50 | 3 + 0 | **3.61 %** |
| `norm_margin(season.median)` | 83 | 0.25 · 2 = 0.50 | 0.50 · 2 = 1.00 | 0.75 · 2 = 1.50 | 0.75 · 2 = 1.50 | 2 + 0 | **2.41 %** |
| **`|C_MS|`** | 83 | **0.250** | **0.458** | **0.750** | **0.750** | 2 saturate | **2.41 %** |

**`player_threes` — M = 1.5**

| Term | n | p50 |raw| | p75 |raw| | p90 |raw| | p95 |raw| | Clamp count | Clamp % |
|---|---:|---:|---:|---:|---:|---:|---:|
| `norm_margin(L10.avg)`    | 95 | 0.33 · 1.5 = 0.50 | 0.47 · 1.5 = 0.70 | 0.67 · 1.5 = 1.00 | 0.84 · 1.5 = 1.27 | 4 + 1 | **5.26 %** |
| `norm_margin(L10.median)` | 95 | 0.33 · 1.5 = 0.50 | 0.33 · 1.5 = 0.50 | 1.00 · 1.5 = 1.50 | 1.00 · 1.5 = 1.50 | 9 + 3 | **12.63 %** |
| `norm_margin(season.avg)` | 95 | 0.33 · 1.5 = 0.50 | 0.40 · 1.5 = 0.60 | 0.62 · 1.5 = 0.93 | 0.84 · 1.5 = 1.27 | 4 + 1 | **5.26 %** |
| `norm_margin(season.median)` | 95 | 0.33 · 1.5 = 0.50 | 0.33 · 1.5 = 0.50 | 1.00 · 1.5 = 1.50 | 1.00 · 1.5 = 1.50 | 9 + 2 | **11.58 %** |
| **`|C_MS|`** | 95 | **0.333** | **0.391** | **0.680** | **0.907** | 5 saturate | **5.26 %** |

**Corrected headline numbers (weighted-C_MS saturation under approved M):**

| Market | Prior (individual margin, wrong) | Corrected (weighted `|C_MS|` saturation) |
|---|---:|---:|
| `player_points`   | 31.10 % | **4.76 %** |
| `player_rebounds` | 24.06 % | **3.54 %** |
| `player_assists`  | 32.11 % | **2.41 %** |
| `player_threes`   | 48.07 % | **5.26 %** |

The prior misread was 6-10× the actual `|C_MS|` saturation rate. **On the corrected numbers no market crosses a "normalizer is too tight" concern under the corrected §1.2 test.**

### 1.2 Corrected §1.1 ordinary-dominance test — the CORRECT direction

The prior report used the check `p75(|margin|) < M/2 → "no"`, which fires when the normalizer is too LOOSE (most margins tiny relative to M — ordinary performance underpowered against the scale). DR-14's stated concern is the OPPOSITE failure: a normalizer so TIGHT that ordinary performance saturates the component and rare margins do not differentiate. The correct instrument is the **weighted-C_MS saturation proportion** above.

**Corrected test — restated per market:**

The script flags "tight normalizer" when `|C_MS|` saturation ≥ 10 %.

| Market | `|C_MS|` saturation | Tight-normalizer flag? | Note |
|---|---:|:---:|---|
| `player_points`   | 4.76 % | no | headroom is comfortable; ordinary players do not saturate on M = 6.0 |
| `player_rebounds` | 3.54 % | no | comfortable |
| `player_assists`  | 2.41 % | no | comfortable |
| `player_threes`   | 5.26 % | no (5.26 % < 10 %) | see §1.3 — median terms have higher clamp rates (12.63 % / 11.58 %) but their base weights (0.30 / 0.10) prevent them from dominating C_MS |

None of the four markets triggers the tight-normalizer flag under the corrected test. The DR-14 constants (`M_points = 6.0`, `M_rebounds = 3.0`, `M_assists = 2.0`, `M_threes = 1.5`) are **defensible on this sample under the corrected instrument**.

### 1.3 `player_threes` deeper look

The `player_threes` median terms clamp at 12.63 % (L10 median) and 11.58 % (season median), well above the AVG term clamp rates (5.26 % each). This is a structural artifact of low integer counts: three-pointer medians land on integer values, so a median of 2 threes above/below a half-integer line already saturates `norm_margin` under M = 1.5 (norm = 1.67 → clamped to 1). The weighted `C_MS` doesn't inherit that saturation because the median weights are 0.30 (L10) and 0.10 (season) while the avg weights are 0.40 (L10) and 0.20 (season) — the avg terms carry 60 % of the weight and their clamp rates are much lower (5.26 % each). Net weighted saturation: 5.26 %.

If the owner is bothered by the individual-median-term saturation on `player_threes`, §1.4 sensitivity shows what happens at candidate M values above 1.5.

### 1.4 Informational: individual game-margin distribution — NOT the C_MS clamp rate

The prior report's per-market table is preserved here so a reader can compare with what the calibration ACTUALLY answers (§1.1 above). This is **informational context**, not the DR-14 clamp instrument.

| Market | M | n games | p50 \|margin\| | p75 | p90 | p95 | Individual-margin clamp % | (For comparison: weighted \|C_MS\| saturation) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| `player_points`   | 6.0 | 1,524 | 4.50 | 6.50 | 9.50 | 12.50 | 31.10 % | **4.76 %** |
| `player_rebounds` | 3.0 | 1,301 | 1.50 | 2.50 | 4.50 | 5.50  | 24.06 % | **3.54 %** |
| `player_assists`  | 2.0 | 872   | 1.50 | 2.50 | 3.50 | 4.50  | 32.11 % | **2.41 %** |
| `player_threes`   | 1.5 | 961   | 0.50 | 1.50 | 2.50 | 2.50  | 48.07 % | **5.26 %** |

Individual game margins fluctuate; ten-game averages don't. That difference is the whole reason DR-14 asks about the averaged / median terms, not raw margins.

### 1.5 Normalizer sensitivity — numbers only

The ticket's DEFECT-1 (f) asks for a per-market sweep around the approved M. `*` marks the approved value.

**`player_points` (approved M = 6.0):**

| M | L10 avg clamp | L10 median clamp | Season avg clamp | Season median clamp | Weighted \|C_MS\| saturation |
|---:|---:|---:|---:|---:|---:|
|  4.0 | 11.11 % | 16.67 % |  8.73 % | 13.49 % |  7.94 % (10/126) |
|  5.0 |  5.56 % |  9.52 % |  4.76 % |  6.35 % |  4.76 % (6/126) |
| **\*6.0** | **4.76 %** | **5.56 %** | **4.76 %** | **5.56 %** | **4.76 % (6/126)** |
|  7.0 |  3.17 % |  3.17 % |  3.17 % |  3.17 % |  3.17 % (4/126) |
|  8.0 |  0.00 % |  0.00 % |  0.00 % |  0.00 % |  0.00 % (0/126) |

**`player_rebounds` (approved M = 3.0):**

| M | L10 avg clamp | L10 median clamp | Season avg clamp | Season median clamp | Weighted \|C_MS\| saturation |
|---:|---:|---:|---:|---:|---:|
|  2.0 | 10.62 % | 12.39 % | 10.62 % |  9.73 % |  9.73 % (11/113) |
|  2.5 |  8.85 % |  9.73 % |  8.85 % |  8.85 % |  7.96 % (9/113) |
| **\*3.0** | **3.54 %** | **3.54 %** | **3.54 %** | **3.54 %** | **3.54 % (4/113)** |
|  3.5 |  2.65 % |  2.65 % |  2.65 % |  2.65 % |  2.65 % (3/113) |
|  4.0 |  1.77 % |  1.77 % |  1.77 % |  1.77 % |  1.77 % (2/113) |

**`player_assists` (approved M = 2.0):**

| M | L10 avg clamp | L10 median clamp | Season avg clamp | Season median clamp | Weighted \|C_MS\| saturation |
|---:|---:|---:|---:|---:|---:|
|  1.5 | 14.46 % | 20.48 % | 14.46 % | 18.07 % | 12.05 % (10/83) |
| **\*2.0** | **3.61 %** | **3.61 %** | **3.61 %** | **2.41 %** | **2.41 % (2/83)** |
|  2.5 |  2.41 % |  1.20 % |  2.41 % |  1.20 % |  1.20 % (1/83) |
|  3.0 |  0.00 % |  0.00 % |  0.00 % |  0.00 % |  0.00 % (0/83) |

**`player_threes` (approved M = 1.5):**

| M | L10 avg clamp | L10 median clamp | Season avg clamp | Season median clamp | Weighted \|C_MS\| saturation |
|---:|---:|---:|---:|---:|---:|
| **\*1.5** | **5.26 %** | **12.63 %** | **5.26 %** | **11.58 %** | **5.26 % (5/95)** |
|  2.0 |  0.00 % |  0.00 % |  0.00 % |  0.00 % |  0.00 % (0/95) |
|  2.5 |  0.00 % |  0.00 % |  0.00 % |  0.00 % |  0.00 % (0/95) |
|  3.0 |  0.00 % |  0.00 % |  0.00 % |  0.00 % |  0.00 % (0/95) |

**Interpretation aids (not a proposal):** DR-14 validation authorizes no constant change. Numbers above are for owner review under DR-24. For `player_threes` specifically, raising M to 2.0 zeros the median-term clamp (which is the visible saturation on the current M = 1.5) but also zeros the AVG-term clamp — the tradeoff is that the component then fails to differentiate exceptional performance from ordinary. That is exactly the kind of decision DR-24 was designed to route through owner/governor review.

---

## 2. DR-27 CORRECTED — dual-population cap analysis

### 2.1 Qualifying-sample sizes — DR-6 (n ≥ 5) vs DR-8 (n ≥ 8, Strong-eligible)

DR-27 caps only would-be-STRONG profiles. DR-8 requires L10 eligible_n ≥ 8 for Strong to be reachable. Players with n = 5..7 could never reach Strong, so DR-27 could never protect them — the cap proportions on the DR-6 sample overstate the population DR-27 actually protects.

| Market | n ≥ 5 (DR-6) qualifying players | n ≥ 8 (DR-8, Strong-eligible) | Decisiveness of n ≥ 8 cut |
|---|---:|---:|---|
| `player_points`   | 98 | **84** | adequate |
| `player_rebounds` | 85 | **69** | adequate |
| `player_assists`  | 52 | **47** | **thin** |
| `player_threes`   | 58 | **53** | **thin** |

**Honestly:** `player_assists` and `player_threes` samples remain thin under the n ≥ 8 cut too. **This sample cannot decide K for `player_assists` or `player_threes` on its own.** `player_points` and `player_rebounds` are decisive.

**Stddev-stability note (governor REVISE 2026-07-15):** an L10 stddev computed on 5 observations is materially less stable than one computed on 10 — a single high-variance game moves the estimate substantially at n = 5 and less at n = 10. The `n ≥ 8` column is the decision-relevant one.

### 2.2 Stddev percentiles under both cuts

| Market | Pop | p50 stddev | p75 | p90 | p95 |
|---|---|---:|---:|---:|---:|
| `player_points`   | n ≥ 5 | 5.500 | 6.663 | 7.260 | 8.596 |
|                   | **n ≥ 8** | **5.795** | **6.821** | **7.888** | **8.976** |
| `player_rebounds` | n ≥ 5 | 2.154 | 2.691 | 3.638 | 3.937 |
|                   | **n ≥ 8** | **2.261** | **2.941** | **3.779** | **3.964** |
| `player_assists`  | n ≥ 5 | 1.762 | 2.117 | 2.630 | 3.184 |
|                   | **n ≥ 8** | **1.792** | **2.156** | **2.789** | **3.189** |
| `player_threes`   | n ≥ 5 | 1.200 | 1.562 | 1.707 | 1.878 |
|                   | **n ≥ 8** | **1.197** | **1.565** | **1.664** | **1.918** |

The n ≥ 8 percentiles run slightly higher than n ≥ 5 for the first three markets (thin-sample players tend to have LOWER stddev because a small sample can't yet contain a large outlier); for `player_threes` the medians barely shift.

### 2.3 Cap counts per candidate K — BOTH populations side by side

| Market | K | Trigger | n ≥ 5 capped | n ≥ 5 % | **n ≥ 8 capped** | **n ≥ 8 %** |
|---|---:|---:|---:|---:|---:|---:|
| `player_points`   | **1.5** | 9.00  | 5 | 5.10 % | **5** | **5.95 %** |
| `player_points`   | 2.0 | 12.00 | 0 | 0.00 % | **0** | **0.00 %** |
| `player_points`   | 2.5 | 15.00 | 0 | 0.00 % | **0** | **0.00 %** |
| `player_points`   | 3.0 | 18.00 | 0 | 0.00 % | **0** | **0.00 %** |
| `player_rebounds` | **1.5** | 4.50  | 1 | 1.18 % | **1** | **1.45 %** |
| `player_rebounds` | 2.0 | 6.00  | 0 | 0.00 % | **0** | **0.00 %** |
| `player_rebounds` | 2.5 | 7.50  | 0 | 0.00 % | **0** | **0.00 %** |
| `player_rebounds` | 3.0 | 9.00  | 0 | 0.00 % | **0** | **0.00 %** |
| `player_assists`  | **1.5** | 3.00  | 5 | 9.62 % | **5** | **10.64 %** |
| `player_assists`  | 2.0 | 4.00  | 0 | 0.00 % | **0** | **0.00 %** |
| `player_assists`  | 2.5 | 5.00  | 0 | 0.00 % | **0** | **0.00 %** |
| `player_assists`  | 3.0 | 6.00  | 0 | 0.00 % | **0** | **0.00 %** |
| `player_threes`   | **1.5** | 2.25  | 2 | 3.45 % | **2** | **3.77 %** |
| `player_threes`   | 2.0 | 3.00  | 0 | 0.00 % | **0** | **0.00 %** |
| `player_threes`   | 2.5 | 3.75  | 0 | 0.00 % | **0** | **0.00 %** |
| `player_threes`   | 3.0 | 4.50  | 0 | 0.00 % | **0** | **0.00 %** |

### 2.4 The decision-relevant finding — K ≥ 2.0 caps nothing

**Verified on the n ≥ 8 (Strong-eligible) population, plainly stated: at K ∈ {2.0, 2.5, 3.0}, ZERO Strong-eligible profiles are capped in ANY of the four markets.** DR-27 at K ≥ 2.0 would install a rule that never fires against the observed L10 margin stddev distribution.

Only K = 1.5 produces observable caps, and the n ≥ 8 percentages are slightly HIGHER than the n ≥ 5 percentages (5.95 % / 1.45 % / 10.64 % / 3.77 % vs the prior 5.10 % / 1.18 % / 9.62 % / 3.45 %) because the denominator shrinks a bit and the high-variance profiles that would cap survive the n ≥ 8 cut. This is the most decision-relevant number in the report.

### 2.5 `player_threes` specific note

Normalizer M = 1.5 (smallest of the four markets). Trigger per K: K=1.5→2.25, K=2.0→3.00, K=2.5→3.75, K=3.0→4.50. Because M compresses the score band, a smaller absolute stddev suffices to trip DR-27 in raw margin units — but the observed p95 stddev is 1.918 (n ≥ 8) or 1.878 (n ≥ 5), well below every K threshold except K = 1.5. Two profiles cap at K = 1.5; K ≥ 2.0 caps nothing. Owner attention to `player_threes` is warranted on the DR-14 side (M compression, §1.5 sensitivity) more than on the DR-27 side.

### 2.6 would-be-Strong subset — PREREQUISITE GAP (unchanged from prior run)

For every (market, K) pair the `would_be_strong_capped_count` is **null**. The subset note: composite score §B.6 depends on inputs (current market row, evaluated line, threshold windows against that line, availability context) that the seeded historical data does not supply. The seed pipeline populated closing-line history; it did not populate current-poll market snapshots on the same grain. Therefore the `would_be_strong` numerator — profiles that would have qualified as Strong before DR-27 capped them — cannot be computed on the current hosted data alone. This is reported as absence per §I.1 "no estimation where data is absent." The number returns when live current-market snapshots are populated (V1-6 / operational-driver work), not as an artifact of this calibration.

### 2.7 Five concrete profile examples near each K cutoff (per market)

Marker meaning: `n=10` etc. is the L10 sample size; `strong=✓` marks n ≥ 8 (DR-8 Strong-eligible). Every example shown below is Strong-eligible under the corrected DR-8 cut — the extreme-stddev profiles that end up near the K cutoff all had 8..10 observations.

#### `player_points` (M = 6.0)

| K | Cutoff | Player | L10 stddev | n | Strong? | Dist. from cutoff | Would cap at K∈… |
|---:|---:|---|---:|---:|:---:|---:|---|
| **1.5** | 9.00 | Michaela Onyenwere | 9.058 | 10 | ✓ | 0.058 | {1.5} |
| 1.5 | 9.00 | Kahleah Copper     | 8.514 | 10 | ✓ | 0.486 | {} |
| 1.5 | 9.00 | Nyara Sabally      | 8.367 | 8  | ✓ | 0.633 | {} |
| 1.5 | 9.00 | Flau'jae Johnson   | 8.273 | 10 | ✓ | 0.727 | {} |
| 1.5 | 9.00 | Chennedy Carter    | 9.833 | 10 | ✓ | 0.833 | {1.5} |
| **2.0** | 12.00 | Marina Mabrey      | 11.758 | 10 | ✓ | 0.242 | {1.5} |
| 2.0 | 12.00 | Brittney Sykes     | 11.358 | 10 | ✓ | 0.642 | {1.5} |
| 2.0 | 12.00 | Kelsey Plum        | 10.591 | 10 | ✓ | 1.409 | {1.5} |
| 2.0 | 12.00 | Chennedy Carter    | 9.833  | 10 | ✓ | 2.167 | {1.5} |
| 2.0 | 12.00 | Michaela Onyenwere | 9.058  | 10 | ✓ | 2.942 | {1.5} |
| **2.5** | 15.00 | Marina Mabrey      | 11.758 | 10 | ✓ | 3.242 | {1.5} |
| 2.5 | 15.00 | Brittney Sykes     | 11.358 | 10 | ✓ | 3.642 | {1.5} |
| 2.5 | 15.00 | Kelsey Plum        | 10.591 | 10 | ✓ | 4.409 | {1.5} |
| 2.5 | 15.00 | Chennedy Carter    | 9.833  | 10 | ✓ | 5.167 | {1.5} |
| 2.5 | 15.00 | Michaela Onyenwere | 9.058  | 10 | ✓ | 5.942 | {1.5} |
| **3.0** | 18.00 | (same five as K=2.5; all remain at distance > 6) | — | — | ✓ | — | {1.5} |

Even the highest-stddev qualifying `player_points` profile (Marina Mabrey, 11.76) does NOT exceed the K = 2.0 trigger of 12.00. K ≥ 2.0 caps nothing.

#### `player_rebounds` (M = 3.0)

| K | Cutoff | Player | L10 stddev | n | Strong? | Dist. from cutoff | Would cap at K∈… |
|---:|---:|---|---:|---:|:---:|---:|---|
| **1.5** | 4.50 | Awak Kuier          | 4.106 | 8  | ✓ | 0.394 | {} |
| 1.5 | 4.50 | Aneesah Morrow      | 4.895 | 10 | ✓ | 0.395 | {1.5} |
| 1.5 | 4.50 | Nneka Ogwumike      | 4.011 | 10 | ✓ | 0.489 | {} |
| 1.5 | 4.50 | Olivia Nelson-Ododa | 3.969 | 8  | ✓ | 0.531 | {} |
| 1.5 | 4.50 | Kiki Iriafen        | 3.956 | 10 | ✓ | 0.544 | {} |
| **2.0+** | 6.00+ | (same five closest; Aneesah Morrow highest at 4.895 vs cutoff 6.00 → distance 1.1+) | — | — | — | — | {1.5} |

Only Aneesah Morrow caps at K = 1.5. K ≥ 2.0 caps nothing.

#### `player_assists` (M = 2.0)

| K | Cutoff | Player | L10 stddev | n | Strong? | Dist. from cutoff | Would cap at K∈… |
|---:|---:|---|---:|---:|:---:|---:|---|
| **1.5** | 3.00 | Alyssa Thomas    | 3.015 | 10 | ✓ | 0.015 | {1.5} |
| 1.5 | 3.00 | Jessica Shepard  | 3.177 | 10 | ✓ | 0.177 | {1.5} |
| 1.5 | 3.00 | Julie Allemand   | 3.194 | 10 | ✓ | 0.194 | {1.5} |
| 1.5 | 3.00 | Georgia Amoore   | 3.195 | 10 | ✓ | 0.195 | {1.5} |
| 1.5 | 3.00 | Caitlin Clark    | 2.638 | 10 | ✓ | 0.362 | {} |
| **2.0** | 4.00 | Jordin Canada    | 3.400 | 10 | ✓ | 0.600 | {1.5} |
| 2.0 | 4.00 | Georgia Amoore   | 3.195 | 10 | ✓ | 0.805 | {1.5} |
| 2.0 | 4.00 | Julie Allemand   | 3.194 | 10 | ✓ | 0.806 | {1.5} |
| 2.0 | 4.00 | Jessica Shepard  | 3.177 | 10 | ✓ | 0.824 | {1.5} |
| 2.0 | 4.00 | Alyssa Thomas    | 3.015 | 10 | ✓ | 0.985 | {1.5} |
| **2.5+** | 5.00+ | (same five: highest = Jordin Canada 3.40 vs cutoff 5.00 → distance 1.6+) | — | — | — | — | {1.5} |

Five profiles cap at K = 1.5 (10.64 % of 47 Strong-eligible). None cap at K ≥ 2.0. Caitlin Clark misses K = 1.5 by 0.36 stddev units.

#### `player_threes` (M = 1.5)

| K | Cutoff | Player | L10 stddev | n | Strong? | Dist. from cutoff | Would cap at K∈… |
|---:|---:|---|---:|---:|:---:|---:|---|
| **1.5** | 2.25 | Marina Mabrey    | 2.385 | 10 | ✓ | 0.135 | {1.5} |
| 1.5 | 2.25 | Bridget Carleton | 2.441 | 10 | ✓ | 0.191 | {1.5} |
| 1.5 | 2.25 | Chelsea Gray     | 2.013 | 10 | ✓ | 0.238 | {} |
| 1.5 | 2.25 | Lexi Held        | 1.855 | 5  | ✗ (n=5) | 0.395 | {} |
| 1.5 | 2.25 | Kelsey Plum      | 1.855 | 10 | ✓ | 0.395 | {} |
| **2.0** | 3.00 | Bridget Carleton | 2.441 | 10 | ✓ | 0.559 | {1.5} |
| 2.0 | 3.00 | Marina Mabrey    | 2.385 | 10 | ✓ | 0.615 | {1.5} |
| 2.0 | 3.00 | Chelsea Gray     | 2.013 | 10 | ✓ | 0.988 | {} |
| 2.0 | 3.00 | Lexi Held        | 1.855 | 5  | ✗ (n=5) | 1.145 | {} |
| 2.0 | 3.00 | Kelsey Plum      | 1.855 | 10 | ✓ | 1.145 | {} |
| **2.5+** | 3.75+ | Bridget Carleton stays closest; caps at 1.5 only. | — | — | — | — | {1.5} |

Two profiles cap at K = 1.5 (3.77 % of 53 Strong-eligible). None cap at K ≥ 2.0. Note: **Lexi Held (n=5) appears in the examples but is NOT Strong-eligible** — the stddev-stability caveat above applies. She would not be capped from Strong regardless of K because she cannot reach Strong.

---

## 3. Recommended K — ONE labeled recommendation, restated against the corrected numbers

**RECOMMENDATION (implementation agent, non-binding, for owner/governor decision under DR-24):** if the owner intends DR-27 to be operative in `evidence_method_v2`, the empirical evidence on this sample — corrected for both defects — supports **K = 1.5**. Rationale, restated against the corrected (n ≥ 8) numbers:

1. **K = 1.5 is the only candidate that produces observable caps** on Strong-eligible profiles: 5.95 % points, 1.45 % rebounds, 10.64 % assists, 3.77 % threes.
2. **K ≥ 2.0 caps ZERO Strong-eligible profiles across all four markets** — verified on the n ≥ 8 population, plainly stated. DR-27 at K ≥ 2.0 would install a dormant rule that never fires against the observed L10 margin stddev distribution.
3. **The 10.64 % `player_assists` cap at K = 1.5 is the aggressive tail on a thin sample** — 47 Strong-eligible players. Five of them (Jordin Canada 3.40, Georgia Amoore 3.20, Julie Allemand 3.19, Jessica Shepard 3.18, Alyssa Thomas 3.02) would cap. The owner may inspect whether their L10 margin arrays LOOK like true abnormal dispersion (mix of very-high and very-low margin games) vs consistently-below-average performers with occasional big games. Georgia Amoore's L10: `[0.5, -4.5, -5.5, -1.5, 0.5, -1.5, 3.5, 4.5, -1.5, 3.5]` — that IS abnormal dispersion in the intended sense.
4. **`player_threes` and `player_assists` samples remain thin** (47 / 53 Strong-eligible). If the owner prefers to defer for those two markets until next season's data enlarges the sample, that is defensible — this calibration cannot decide K for those two markets on its own. `player_points` (84) and `player_rebounds` (69) are decisive.

**What this recommendation is NOT:**

- **Not a governor decision.** DR-27 remains formally deferred per §I.3. This report is calibration EVIDENCE; the K decision is the owner's, routed through DR-24.
- **Not an engine activation.** `ABNORMAL_DISPERSION` remains a RESERVED reason code in `evidence_method_v1` per §E.1 and DR-27 §I.3 clause (2). The V1-A1-3 engine MUST NOT emit it. Activation later requires (a) owner approval of a specific K, (b) a DR-24 method-version bump `evidence_method_v1 → evidence_method_v2`, AND (c) regression fixtures per A1 §12.
- **Not a K choice for `player_threes` or `player_assists` in isolation.** The thin-sample caveat in §2.1 applies; a future re-run with a larger sample should re-check.

---

## 4. Reproducibility

Every number in this report is reproducible by running:

```
set -a && source .env && set +a
node --import tsx scripts/v1_a1_1_dr14_dr27_calibration.ts > /tmp/calib.json
```

against the hosted database at the same `historical_line_results` state. The full JSON output for this corrected run is preserved at `/tmp/v1_a1_1_calib_v2.json` (2026-07-15T20:52 UTC).

Verbatim queries used (as documented in the script's `queries_used` array):

- `SELECT COUNT(*) FROM historical_line_results` — data-availability probe.
- `SELECT COUNT(*) FROM canonical_closing_points` — data-availability probe.
- `SELECT COUNT(*) FROM player_game_stats` — data-availability probe.
- `SELECT COUNT(*) FROM real_line_windows` — data-availability probe (not consumed for output).
- **DR-14 INFORMATIONAL** (individual game-margin, relabeled): latest-computation_version `DISTINCT ON` over `historical_line_results`; `percentile_cont(0.50 / 0.75 / 0.90 / 0.95) WITHIN GROUP (ORDER BY ABS(margin))`; clamp counts on the RAW margin values.
- **DR-14 CORRECTED C_MS analysis:** per (`internal_player_id`, `market_key`) — latest-version `DISTINCT ON` + `scheduled_start_utc DESC` → L10 window (`rn <= 10`) and season (all eligible) aggregates; `percentile_cont(0.5) WITHIN GROUP (ORDER BY margin)` for medians; `AVG(margin)` for means. Weighted C_MS computed in TypeScript with §B.3 base weights (0.40 / 0.30 / 0.20 / 0.10) and the T1 null-handling rule.
- **DR-14 normalizer sensitivity:** same per-(player, market) aggregates, applied under candidate M values from `NORMALIZER_SENSITIVITY_CANDIDATES`; reports per-term clamp proportions and weighted C_MS saturation at each candidate M.
- **DR-27 dual-population** per market: per-player LATEST 10 eligible historical margins via `DISTINCT ON` + `games.scheduled_start_utc DESC` + `HAVING COUNT(*) >= 5`; population stddev in TypeScript. Cap counts reported for BOTH n ≥ 5 (DR-6) and n ≥ 8 (DR-8) subsets.
- would-be-Strong subset per K: `SELECT COUNT(DISTINCT (internal_player_id, market_key)) FROM current_market_rows WHERE market_key=$1 AND internal_player_id = ANY(...) AND freshness_state <> 'unavailable' AND eligible_sportsbook_count >= 1` — returns 0 for every (market, K) pair on this dataset.
- Player display names: `SELECT internal_player_id, display_name FROM players`.

The calibration script does not read from any table other than the ones listed above. It makes **zero** provider calls and **zero** writes.

---

*End of DR-14/DR-27 offline calibration re-run — CORRECTED. DR-27 remains formally deferred pending owner/governor review of the evidence above. DR-14 constants pass the corrected instrument on all four markets.*

---

## 5. Owner ruling — recorded 2026-07-15 (pointer only)

The product owner reviewed this evidence on 2026-07-15 and ruled:

- **DR-14: VALIDATED with no change.** The approved margin normalizers (`M_points = 6.0`, `M_rebounds = 3.0`, `M_assists = 2.0`, `M_threes = 1.5`) stand. Stamp updated to `[OWNER APPROVED — VALIDATED 2026-07-15]`.
- **DR-27: FORMALLY DEFERRED under a new return condition** tied to measurable would-be-Strong impact on live current-market data (not to the offline calibration alone). Stamp updated to `[OWNER APPROVED — DEFERRED UNTIL WOULD-BE-STRONG IMPACT IS MEASURABLE ON LIVE CURRENT-MARKET DATA]`. `ABNORMAL_DISPERSION` remains RESERVED, non-emitting, and unavailable to V1-A1-3.

The operative authority carrying the full ruling (evidence basis, numbered return condition, engine prohibition, and consequences) is `docs/product/EVIDENCE_PROFILE_METHOD_V1.md` v1.1 — see the DR-14 and DR-27 rows in the Decision Register, and §I.1 (discharge) / §I.3 (deferral + return condition). This report is not the operative record; it is the evidence the owner reviewed. `method_version` remains `evidence_method_v1` because no output-affecting content changed (no formula, threshold, weight, reason trigger, example, or surface rule was altered).

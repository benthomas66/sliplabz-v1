# SlipLabz — Evidence Grammar v1.3
## The governing design authority for surface vocabulary

**Status:** AUTHORIZED — founder rulings 2026-07-28. Governing UX design authority.
**Supersedes:** Evidence Grammar v1.2, v1.1, v1; the primitive sketches in Design Direction v1 §2.

**v1.3 amendment summary.** Clarifies the Evidence Strip's scope and authorizes the Value Chart. v1.2 §2.2 declared the Strip canonical "everywhere… No exceptions," which over-reached: a detailed analytical chart showing raw values with chronology and line-relative context is a different, richer representation of the same series, and was inadvertently forbidden. v1.3 scopes the Strip to **compact line-relative outcome** representation and adds **§2.10 VALUE CHART** as a Research View **component** (not a primitive).

**v1.2 amendment summary (retained).** v1.1 defined `passed-near-threshold` as a gate *state*, and separately authored six near-threshold rules — four of which described proximity from the **fired** side. A state that only exists on the passed side cannot carry fired-side proximity. v1.2 corrects this: **near-threshold becomes an orthogonal modifier on the outcome, never an outcome itself.** One-sided offering is additionally removed from the authorized set (its gate does not retain the per-side count a discrete proximity rule requires, and deriving one would reach into paid per-book offerings). §8.1 now holds five rules; §8.2 holds five gates.

### Division of authority

`EVIDENCE_PROFILE_METHOD_V1.md` and `EVIDENCE_PROFILE_METHOD_V2.md` remain **FROZEN** and continue to govern computation, classifications, gates, and method behaviour. **This document does not amend them and must never be described as doing so.**

This document is an **independently authorized surface-vocabulary extension, interpreted alongside §D.2.** It governs how computed evidence is represented, disclosed, and inspected. It may authorize a surface representation that §D.2 does not presently name, provided that representation:

- does not change any computed value;
- does not alter a classification or a gate;
- does not weaken a required long-form disclosure;
- does not introduce probability, rate, forecast, confidence, EV, or pick framing.

**Future tickets must cite BOTH authorities wherever a Grammar-authorized surface form is used.**

---

## 0. Thesis

> **SlipLabz never asks users to trust a conclusion they cannot inspect.**

Every primitive reinforces it. The Finding is inspectable. The Strip is inspectable. The Margin Glyph is inspectable. The Gate Indicator is inspectable. The methodology is inspectable. Every layer answers **"why?"**

Competing products compress uncertainty into summary numbers. SlipLabz progressively reveals it. Two consequences constrain everything below:

1. **Evidence is the interface.** Where a distribution exists, show the distribution. Where a sequence exists, preserve the sequence. **Given a choice between showing evidence and showing a summary of evidence, the default is always the evidence.** Summaries exist only where density genuinely requires them, and are a documented concession, never a first choice.

2. **No primitive may become a confidence meter.** The structural defense is **discrete states, never continua** — a continuum reads as a meter; a small set of named states reads as a category. Trust is earned by inspection, never encoded in a glyph.

---

## 1. Universal rules

Every primitive obeys all of these. A candidate that cannot is not a primitive.

1. **Never hover-only.** Required elements are visible without interaction (§D.4 rule 7, generalized).
2. **Never encodes the composite score** — not as length, angle, area, hue, or opacity. DR-19 governs encodings, not just digits.
3. **Never implies prediction.** No arrows meaning "will," no good/bad valence, no forward-looking microcopy.
4. **Always inspectable.** Tapping reveals composition. Curiosity is the loop.
5. **Sample size is never hidden.**
6. **Discrete states only.**
7. **Reused across at least two surfaces.** A one-off is a component, not a primitive.
8. **Primitive proliferation is a design failure.** Every new feature asks *"which existing primitive expresses this?"* before inventing one.

---

## 2. The primitives

### 2.1 FINDING MARK
*Orientation. Never persuasion.*

- **Answers exactly one question: "what kind of finding is this?"** It must NEVER answer *"how much should I trust this?"* Trust emerges from inspecting the evidence and is never encoded in the mark. This is an invariant.
- **Data:** `classification`, `direction`, `quality_capped`, binding cap tag.
- **States (discrete, exhaustive):** over-leaning · under-leaning · mixed · insufficient · unavailable. Strength = **filled (Strong) vs outlined (Moderate)** — two weights, never a gradient. A **notch** marks a binding cap.
- **Never:** varies in size, saturation, or fill proportion by score; carries a number; animates on a scale.
- **Appears:** Board rows, Research View header, any card surface.

### 2.2 EVIDENCE STRIP
*The defining primitive of SlipLabz.*

- **The canonical COMPACT representation of historical LINE-RELATIVE OUTCOMES** — the user's **first mental model** for what historical evidence looks like at a glance. Wherever historical evidence is summarized in limited space — board rows, window cards, filtered views, H2H — the Strip is the required form. Users should recognize it without reading a label.
- **Scope (v1.3):** "line-relative outcomes" is deliberate. A detailed surface may additionally show raw statistics that are not themselves an over/under outcome (minutes, field goals made); those are the VALUE CHART's domain (§2.10), not the Strip's.
- **Data:** the per-game series — one cell per game in the window, oldest→newest.
- **Cell states:** filled = above · hollow = below · dash = push · ghost outline = DNP/ineligible (holds position, carries no verdict).
- **Preserves what a percentage destroys:** sequence, clustering, streaks, volatility, missing observations, and sample size — the cell count *is* `eligible_n`.
- **Never:** aggregates into a rate; reorders; omits ineligible games; scales cell size by anything.
- **Appears:** wherever historical line-relative outcomes are summarized compactly.

### 2.10 VALUE CHART — *detailed analytical surfaces; a COMPONENT, not a primitive*

Detailed analytical surfaces MAY present an inspectable value chart. It MUST preserve:

- **chronology** — oldest→newest, never reordered;
- **raw values** — never normalized into a rate;
- **DNP and ineligible observations** — rendered as distinct non-verdict placeholders, never omitted;
- **the evaluated line** — shown as an explicit reference whenever the chart is line-relative;
- **touch inspection** — disclosure level 3 (§4);
- **factual component decomposition** for combination markets **only when source data supports it** — never an invented decomposition.

It obeys all universal rules (§1) and the color system (§5).

**It is a component, not a primitive.** §1 rule 7 (two-surface reuse) does not apply, and it does not enter the alphabet. Should it later appear on a second surface, it is promoted to a primitive and specified here at that time.

### 2.3 MARGIN GLYPH
*The distribution of distance from the line.*

- **Data:** per-game margins (stat value − line) from the same series.
- **Form:** a compact dot-plot on a centered axis — one dot per eligible game, zero-line marked, median indicated. Clustering and outliers stay visible as themselves.
- **Why distribution over summary:** "usually just over" and "wildly variable, averages just over" share an average and are different evidence.
- **Fallback (documented concession):** median tick + interquartile band. Never a bare average.
- **Appears:** Board row (compact), window cards, Research View evidence panel.

### 2.4 CONSENSUS BAR
*Market structure — whether the books agree.*

- **Data:** `point_distribution`, `consensus_point`, `line_range`, `selection_method`, `eligible_book_count`.
- **Form:** horizontal axis over offered points; tick per point with height by book count; consensus marked; range as extent. Unresolved consensus renders visibly split rather than picking a winner.
- **Never:** prices, juice, book logos, promo chips, affiliate anything.
- **Appears:** Board row (micro), Research View market panel.

### 2.5 GATE INDICATOR
*Flagship capability. The interface through which the product teaches how evidence quality works.*

- **Purpose:** this is not a diagnostic widget. Most analytical software hides its reasoning; ours exposes it. **Over time, users should begin predicting why classifications change before the application tells them.** That is the measure of a transparent system.
- **Data:** the quality-rule evaluation and ranked reason set.

**OUTCOME (discrete, exhaustive) — the gate's actual result:**

  `passed` · `fired_binding` · `fired_non_binding` · `not_applicable`

**PROXIMITY MODIFIER (orthogonal; authorized gates only) — never an outcome:**

  `near_threshold: boolean` plus, when true, an authority-owned `near_threshold_message`.

Where §8.1 authorizes a near rule and the rule's exact condition holds, the gate carries `near_threshold: true` and its message. Everywhere else — including all §8.2 gates — `near_threshold` is false and no proximity message exists.

**THE OUTCOME IS ALWAYS STATED FIRST.** Near-threshold must never replace, soften, or obscure the gate's actual result.

> **Authorized:** *"L10 sample sufficiency — 4 of 5 required — fired. One additional eligible game would satisfy the minimum."*
>
> **Not authorized:** *"L10 sample sufficiency — nearly passed."*

The second weakens the actual result and turns proximity into persuasion.

**The modifier is a boolean governed by a gate-specific, authority-authored rule.** It is NOT a percentage, a distance score, a gradient, a continuous meter, or a generalized calculation of "closeness." No component may infer degrees — no *very near*, *somewhat near*, *80% of the way*, *almost strong*, *close to flipping*. **A gate is either within its explicitly authorized discrete boundary or it is not.**

- **Carries:** gate name in authority wording, actual value, threshold — *"Book coverage — 5 of 4 required — passed."*
- **Composed into the GATE PANEL**, which is never hidden and never collapsed by default.
- **Appears:** Research View gate panel; compact roll-up on Board rows (the cap notch is its smallest form).

### 2.6 FRESHNESS BADGE
*Age as a first-class, live element.*

- **Data:** `line_observed_at`, display age at serve time, freshness state, D-A1 boundaries.
- **States (the only authorized states):** current · aging · stale-present · beyond-horizon (historical inspection only). **No proximity modifier** — see §8.2.
- **Form:** state + elapsed time, desaturating toward the horizon. **Desaturation, not a shift to red** — aging is context, not danger.
- **Never:** hover-only; absent when aged; worded to imply currency.
- **Appears:** Board rows, Research View header, any surface showing a persisted finding.

### 2.7 PROVENANCE BADGE
*Where this evidence came from.*

- **Data:** `includes_backfilled_historical`, per-row and per-window.
- **Form:** persistent glyph + the authority's exact copy. Per-row provenance visible in the gamelog and in any expanded Strip cell.
- **Never:** hover-only (§D.4 rule 7); described as "observed since launch" when it isn't.
- **Appears:** Board rows, window cards, gamelog rows, expanded Strip cells.

### 2.8 SAMPLE BADGE
*How much evidence is behind this.*

- **Data:** `eligible_n`, `coverage_label`, `incomplete`.
- **Form:** count + coverage state; visually distinct when thin or incomplete.
- **Thin evidence is content, not an embarrassment.**
- **Appears:** beside every Strip, on every window card, on filtered/H2H views.

### 2.9 EVIDENCE RELATIONSHIPS — *future family; NOT AUTHORIZED FOR IMPLEMENTATION*

Every primitive above describes a **property** of evidence. The grammar must also become capable of expressing **relationships between** pieces of evidence. Candidate relationships, named so the grammar accommodates them: agreement between windows · disagreement between windows · trend reversal · stability vs fragmentation · conflicting evidence.

The committed method already produces `WINDOWS_DISAGREE` and `MARKET_DISAGREES_WITH_HISTORY`, showing the relationship layer is partly represented in the method. **That observation does NOT authorize implementation.** During the present phase: no projection fields, no engine behaviour, no components, no fixtures, and no tickets for this family.

---

## 3. Composition patterns

- **WINDOW CARD** = Strip + Sample Badge + counts + Margin Glyph + Provenance Badge.
- **BOARD ROW** = Finding Mark (+ cap notch) + identity + evaluated line + Strip Band + compact Margin Glyph + Freshness Badge + Provenance Badge.
- **FINDING HEADER** = Finding Mark + full §D.2 label + binding cap + Freshness Badge + §G.1.
- **GATE PANEL** = ordered Gate Indicators + ranked reason set.
- **MARKET PANEL** = Consensus Bar + range + first-observed + movement + one-sided state.

The Board and the Research View are **two views into the same system** — same primitives, same assemblies, different density.

---

## 4. The disclosure ladder

| Level | Gesture | Reveals |
|---|---|---|
| **1 — Orientation** | glance | Finding Mark, Strip, line, freshness |
| **2 — Composition** | tap a primitive | counts (long form), sample size, margins, coverage |
| **3 — Provenance** | tap an element within it | the individual game: date, opponent, home/away, value, margin, provenance |
| **4 — Reasoning** | open gate/methodology panels | gate outcomes, authorized proximity modifiers, ranked reasons, score + components + method version |

**PRODUCT PRINCIPLE — THE INVERSION.** As users investigate deeper they discover *more assumptions, more provenance, more limitations, more context* — **not increasing certainty.** Most tools grow more confident as you drill in; ours grows more explicit about where the evidence stops. This inversion binds every future surface.

---

## 5. Color and weight

- **Hue** carries direction only: **azure** = over-relative · **violet** = under-relative · **slate** = neutral/push/ineligible. No green/red, any theme.
- **Weight** carries strength: filled vs outlined. Two states.
- **Opacity/saturation** carries freshness.
- **Nothing** carries the composite score.
- Every scale documented in the component that defines it.

---

## 6. Interaction contract

- **Everything is touchable**, with a press state, revealing composition.
- **Evidence is a navigable object.** Changing market, line, or filter recomputes *the whole object* — finding, strip, margins, windows, gates — with no page transition and no flash of stale content.
- **Persisted vs recomputed stays visually distinct** (founder ruling, V1-7b).
- **Failure is a state, not a blank:** the authorized Unavailable state renders; the persisted evaluation stays separately reachable.

---

## 7. Compact count form — AUTHORIZED (founder ruling 2026-07-28)

The Evidence Strip is a visualization governed by charts-are-copy. Trailing counts beside it are *text*. §D.2 does not name a compact count form; this section authorizes one as surface vocabulary, interpreted alongside §D.2 per the division of authority above.

> **Compact count form (dense analytical surfaces).** On dense surfaces where the long form does not fit, window evidence MAY be rendered as a compact count pair in the form `A–B` (above–below), or `A–B–P` when pushes are non-zero, immediately adjacent to the Evidence Strip it describes.
>
> The compact form is a **historical observation**, never predictive framing. It MUST NOT be rendered as a rate, a percentage, or a slash ratio (`7/10`) — a slash reads as a fraction of a whole and invites rate interpretation — and MUST NOT be accompanied by any forward-looking language.
>
> It MUST be accompanied by the Sample Badge or a visible `eligible_n`, so a compact count can never obscure a thin sample.
>
> The long form ("7 above · 3 below of 10 eligible") remains the default wherever width permits, and is **required** at disclosure level 2 and deeper.

Tickets using this form cite both §D.2 and this section.

---

## 8. Gate proximity modifiers (founder ruling 2026-07-28, amended v1.2)

**Principle:** proximity is authored per gate from that gate's own semantics. **Implementation may never invent proximity.** The modifier is orthogonal to the outcome (§2.5) and never replaces it.

### 8.1 Gates WITH an authorized proximity modifier (five)

Each rule below is exact. `near_threshold` is true ONLY when its stated condition holds, and the message is the authority's wording — components never author proximity prose.

| Gate | Condition | Authorized message |
|---|---|---|
| **L10 sample sufficiency** | the gate is **fired**, and exactly one additional eligible game would satisfy the minimum | *One additional eligible game would satisfy the minimum.* |
| **Season sample sufficiency** | the gate is **fired**, and exactly one additional eligible game would satisfy the minimum | *One additional eligible game would satisfy the minimum.* |
| **Coverage span** | the gate is **fired**, and exactly one additional calendar day of qualifying coverage would satisfy the required span | *One additional day of qualifying coverage would satisfy the required span.* |
| **Book coverage** | the gate is **fired**, and exactly one additional eligible book would satisfy the minimum | *One additional eligible book would satisfy the minimum.* |
| **Push-heavy sample** | the gate is **passed**, and exactly one additional push — all other evaluated quantities held constant — would fire the cap | *One additional push would fire this cap.* |

Push-heavy is the **only** currently authorized passed-side proximity rule. Coverage span does not use a proportional interval such as "within the final tenth."

### 8.2 Gates with NO authorized proximity modifier (five)

These report **outcome only**. `near_threshold` is false or absent per the projection contract; no proximity message may be generated; and the UI must not imply proximity through wording, styling, ordering, opacity, animation, or iconography.

| Gate | Reason |
|---|---|
| **Freshness** | A proportional rule would be an arbitrary continuous proximity measure and conflicts with the discrete-state defense. Freshness reports only its authorized states: current · aging · stale-present · beyond-horizon. A future amendment may define a concrete **discrete** warning interval using the actual D-A1 time boundaries. |
| **Windows disagree** | Proximity would be counterfactual unless the committed engine emits a deterministic, non-score-derived distance-to-state-change value. It does not. **Do not manufacture a near state from counterfactual recomputation.** |
| **Market disagrees with history** | Proximity is score-derived; exposing it would leak restricted quantities outside the DR-19-authorized methodology area. |
| **§C.10 Strong prerequisites** | Same: proximity is score-derived. Do not expose score proximity through a gate-state metaphor. |
| **One-sided offering** *(moved here in v1.2)* | The committed gate evaluation preserves only the categorical result and does not retain the per-side count a discrete proximity rule requires. Deriving one would reach into paid per-book offering data the projection must drop. Do not reopen `book_detail.offerings`, recompute the gate inside the projection, modify the method evaluator, or approximate proximity from unrelated fields. |

The restricted-quantity disclosure remains applicable to **Market disagrees with history** and **§C.10 Strong prerequisites**:

> *Proximity is not displayed because it depends on restricted score-derived quantities.*

---

## 9. Standing direction

Competitor analysis served its purpose — it taught us interaction density, research workflow, and user expectation. **It is no longer the reference.** From here the governing question for every design and implementation decision is:

> **"Is this consistent with the Evidence Grammar?"**

That is the transition from competitor analysis to product identity, and this document is where the identity lives.

# SlipLabz — Evidence Grammar v1.1
## The governing design authority for surface vocabulary

**Status:** AUTHORIZED — founder ruling 2026-07-28. Governing UX design authority.
**Supersedes:** Evidence Grammar v1; the primitive sketches in Design Direction v1 §2.

### Division of authority

`EVIDENCE_PROFILE_METHOD_V1.md` and `EVIDENCE_PROFILE_METHOD_V2.md` remain **FROZEN** and continue to govern computation, classifications, gates, and method behaviour. **This document does not amend them and must never be described as doing so.**

This document is an **independently authorized surface-vocabulary extension, interpreted alongside §D.2.** It governs how computed evidence is represented, disclosed, and inspected. It may authorize a surface representation that §D.2 does not presently name, provided that representation:

- does not change any computed value;
- does not alter a classification or a gate;
- does not weaken a required long-form disclosure;
- does not introduce probability, rate, forecast, confidence, EV, or pick framing.

**Future tickets must cite BOTH authorities wherever a Grammar-authorized surface form is used** (e.g. "§D.2 for the classification label; Evidence Grammar §7 for the compact count form").

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
8. **Primitive proliferation is a design failure.** Every new feature asks *"which existing primitive expresses this?"* before inventing one. Adding to this alphabet requires a stated reason that no existing primitive can carry the meaning.

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

- **The canonical representation of historical evidence, everywhere in the application** — the user's **first mental model** for what historical evidence looks like. If historical evidence exists on a surface, it appears as a Strip. Users should recognize it without reading a label.
- **Data:** the per-game series — one cell per game in the window, oldest→newest.
- **Cell states:** filled = above · hollow = below · dash = push · ghost outline = DNP/ineligible (holds position, carries no verdict).
- **Preserves what a percentage destroys:** sequence, clustering, streaks, volatility, missing observations, and sample size — the cell count *is* `eligible_n`.
- **Never:** aggregates into a rate; reorders; omits ineligible games (their absence is information); scales cell size by anything.
- **Appears:** everywhere historical evidence appears. No exceptions.

### 2.3 MARGIN GLYPH
*The distribution of distance from the line.*

- **Data:** per-game margins (stat value − line) from the same series.
- **Form:** a compact dot-plot on a centered axis — one dot per eligible game, zero-line marked, median indicated. Clustering and outliers stay visible as themselves.
- **Why distribution over summary:** "usually just over" and "wildly variable, averages just over" share an average and are different evidence. Per §0.1 this generalizes: **collapse a distribution only when density forces it, and say so.**
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
- **States (discrete):** passed · passed-near-threshold *(only where §8 authorizes a near-threshold rule)* · fired (binding) · fired (non-binding) · not-applicable.
- **Carries:** gate name in authority wording, actual value, threshold — *"Book coverage — 5 of 4 required — passed."*
- **Composed into the GATE PANEL**, which is never hidden and never collapsed by default.
- **Appears:** Research View gate panel; compact roll-up on Board rows (the cap notch is its smallest form).

### 2.6 FRESHNESS BADGE
*Age as a first-class, live element.*

- **Data:** `line_observed_at`, display age at serve time, freshness state, D-A1 boundaries.
- **States (the only authorized states):** current · aging · stale-present · beyond-horizon (historical inspection only). **No near-threshold state** — see §8.
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

Every primitive above describes a **property** of evidence. The grammar must also become capable of expressing **relationships between** pieces of evidence. Candidate relationships, named so the grammar is designed to accommodate them:

- **agreement** between windows
- **disagreement** between windows
- **trend reversal**
- **stability** vs **fragmentation**
- **conflicting evidence** (market direction opposing historical direction)

The committed method already produces `WINDOWS_DISAGREE` and `MARKET_DISAGREES_WITH_HISTORY`, which shows the relationship layer is partly represented in the method. **That observation does NOT authorize implementation.** During the present phase: no projection fields, no engine behaviour, no components, no fixtures, and no tickets for this family. It is recorded so that layout, spacing, and composition decisions leave room for it rather than requiring retrofit.

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
| **4 — Reasoning** | open gate/methodology panels | gates fired, gates near (where authorized), ranked reasons, score + components + method version |

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

## 8. Gate near-threshold states (founder ruling 2026-07-28)

**Principle:** near-threshold behaviour is authored per gate from that gate's own semantics. **Implementation may never invent proximity.**

### 8.1 Authorized near-threshold definitions (six)

| Gate | Near-threshold rule |
|---|---|
| L10 sample sufficiency | one additional eligible game would satisfy the minimum |
| Season sample sufficiency | one additional eligible game would satisfy the minimum |
| Coverage span | within one day of the required span |
| Book coverage | one additional eligible book would change the pass/fail state |
| Push-heavy sample | one additional push would fire the cap |
| One-sided offering | one additional eligible book quoting the missing side would clear it |

### 8.2 Gates with NO authorized near-threshold state (four)

These report **passed / fired only**. A near state must not be manufactured for them.

| Gate | Reason |
|---|---|
| **Freshness** | A proportional rule ("final tenth of the band") would be an arbitrary continuous proximity measure and conflicts with the Grammar's discrete-state defense. Freshness reports only its authorized states: current · aging · stale-present · beyond-horizon. A future authority amendment may define a concrete **discrete** warning interval using the actual D-A1 time boundaries. |
| **Windows disagree** | "One window's direction flipping" is counterfactual unless the committed engine emits a deterministic, non-score-derived distance-to-state-change value. It does not. **Do not manufacture a near state from counterfactual recomputation.** |
| **Market disagrees with history** | Proximity is score-derived; exposing it would leak restricted quantities outside the DR-19-authorized methodology area. |
| **§C.10 Strong prerequisites** | Same: proximity is score-derived. Do not expose score proximity through a gate-state metaphor. |

Where a user might expect proximity for the last two, use the plain disclosure:

> *Proximity is not displayed because it depends on restricted score-derived quantities.*

---

## 9. Standing direction

Competitor analysis served its purpose — it taught us interaction density, research workflow, and user expectation. **It is no longer the reference.** From here the governing question for every design and implementation decision is:

> **"Is this consistent with the Evidence Grammar?"**

That is the transition from competitor analysis to product identity, and this document is where the identity lives.

# SlipLabz — Mobile Product Parity Specification v2
## Screenshot-grounded architecture for the Props Board and Player Research workflow

**Prepared for:** Ben Thomas, Founder
**Prepared by:** Implementation Governor
**Date:** 2026-07-28
**Status:** AUTHORIZED under founder rulings 2026-07-28 (parity corrections) and 2026-07-28 (V1-8a review amendments). Governing structural/interaction specification for the V1-8 sequence.
**Supersedes:** Mobile Product Parity Specification v1 and v2 draft.
**Relationship to other authorities:** the frozen method authorities govern computation and classification; `SLIPLABZ_EVIDENCE_GRAMMAR.md` (v1.3) governs surface vocabulary; this document governs **structure, density, module inventory, and interaction**. Tickets cite whichever govern the decision at hand.

---

## 0. North star

> **SlipLabz reproduces the complete mobile player-prop research workflow — board scanning, market selection, line manipulation, sample filtering, tactile chart inspection, supporting context, movement history, averages, and gamelog — while replacing prediction and persuasion with inspectable historical evidence.**

The Evidence Grammar governs **how information is expressed**. It does **not** authorize deleting useful factual information merely because a competitor also displays it.

## 0.1 The governing rule

> **Preserve structure, density, factual statistics, source identity, and interaction. Translate only probability, recommendation, confidence, promotional, affiliate, or unsupported claims.**

v1 of this specification over-translated: it removed factual fields (average, difference, streak, source identity) because they resembled the reference, not because they violated an authority. Corrected throughout.

**Method.** The founder-supplied mobile screenshots are the **structural and interaction reference**. The frozen method authorities govern computation and classification. The Evidence Grammar governs wording, representation, and disclosure.

**Dispositions:**

- **DIRECT** — reproduce structure and interaction; data exists.
- **DIRECT SHELL / \<qualifier\>** — build the module, layout, and fallback now; real data or rights pending.
- **TRANSLATE** — same user need, evidence-first representation.
- **GAP** — data does not exist; needs a source, with layout preserved for later.
- **DEFER** — later milestone (accounts, entitlement, scope).
- **REFUSE** — forbidden by an authority.

---

## 1. Props Board

### 1.1 Chrome and navigation

| # | Element | Disposition | Notes |
|---|---|---|---|
| 1 | Sidebar toggle | DIRECT | |
| 2 | "Props" breadcrumb | DIRECT | |
| 3 | Sport selector (WNBA ▾) | DIRECT | Single sport today; control belongs so the shell needs no rework |
| 4 | Notification bell | DEFER | Accounts (V1-9). **Top chrome MAY retain a reserved position** because the reference hierarchy requires that location |
| 5 | Account avatar | DEFER | Accounts. Reserved top-chrome position permitted, same reason |
| 6 | Search | DIRECT | |
| 7 | Bookmark / saved | DEFER | Accounts. No dead control in the bottom bar (see #8) |
| 8 | Bottom tab bar | **DIRECT SHELL / NAV NOT FINAL** | Implement ONLY the visible functional destinations: **Board · Players · Methodology**. The component is architected to accept additional destinations later, but **no dead Saved, account, or alert controls are displayed in the bottom bar** — a visible control that does nothing is poor interaction design. "Research" is a context reached by tapping a player, not a global destination. Popular / Discrepancies / Discord are NOT reproduced. Final five-tab shape is a later founder ruling |

### 1.2 Source selection and filters

| # | Element | Disposition | Notes |
|---|---|---|---|
| 9 | **"Apps" source scroller** | **DIRECT (factual source identity permitted)** | Preserve the structure: horizontally scrollable source selector · selected-source state · "all sources"/consensus state · source count. Source names or marks MAY be shown when the source actually supplied the displayed observation, the display is factual, **no affiliate payment, promotional amount, bonus, ranking, or inducement is present**, and trademark use is acceptable. The Consensus Bar is an **additional** evidence display, not a replacement for source selection |
| 10 | Modifier ▾ (alt lines) | **DROP (current phase)** | No alt-line ladder ingested. Preserve extensible filter-row layout |
| 11 | Stats ▾ | DIRECT | Market filter |
| 12 | Games ▾ | DIRECT | |
| 13 | Date ▾ | DIRECT | |
| 14 | Teams ▾ | DIRECT | |
| 15 | Min/Max Odds ▾ | **DEFER — OUTSIDE CURRENT DATA SCOPE** | Prices are factual and not intrinsically forbidden; this filter is omitted for scope, not prohibition |
| 16 | Hit Rate ▾ | **TRANSLATE** | A *recommendation-oriented* filter. Replaced by classification filter (Strong/Moderate/Mixed/…) plus evidence-quality filters: capped only · complete samples only · provenance |

### 1.3 The player row

The row preserves the reference's **information band in full**. The Grammar changes what the cells *contain*, not whether the information exists. On narrow devices the band **scrolls horizontally** — fields are never deleted for density.

| # | Element | Disposition | Form in SlipLabz |
|---|---|---|---|
| 17 | Player image | **DIRECT SHELL / DATA-RIGHTS PENDING** | Build the image slot, layout, loading behaviour, and fallback avatar now. Production headshots blocked on rights (G8). **The row must look intentional both with and without a photograph** |
| 18 | Favorite star | DEFER | Accounts; reserve the affordance |
| 19 | Name + league badge | DIRECT | |
| 20 | Market + line ("O/U 23.5 Pts+Rebs") | DIRECT | Wording per §D |
| 21 | Matchup + tipoff | DIRECT | |
| 22 | Defensive-rank chip | **DROP (current phase)** | No opponent-defense source. Preserve chip position for later |
| 23 | O/U probability donut | **TRANSLATE** | → **FINDING MARK** (Grammar §2.1). Probability is refused; the anchor role is preserved |
| 24 | **L5 / L10 / L15 cells** | **TRANSLATE (cell contents only)** | → per-window **EVIDENCE STRIP** + compact counts (§7) + `eligible_n`. L15 → our L20. The *band* is preserved |
| 25 | **H2H cell** | TRANSLATE + **GAP (G2)** | Filtered Strip + counts. Requires the H2H window computation |
| 26 | **STRK cell** | **DIRECT (explicit factual field — RESTORED)** | Show the current run factually: `3 above` · `2 below` · `1 push`. **Not** styled as hot/cold, and never implying continuation. The Strip also carries the sequence; the explicit field is retained for rapid scanning |
| 27 | **AVG cell** | **DIRECT (explicit factual value — RESTORED)** | Average value for the window, with sample size |
| 28 | **DIFF cell** | **DIRECT (explicit factual value — RESTORED)** | Difference from the currently evaluated line. **Percentage difference excluded** unless independently authorized. The **MARGIN GLYPH** complements these numbers or appears at deeper disclosure — it does not remove the rapid numerical scan |
| 29 | SZN cell | TRANSLATE (contents) | Season Strip + counts + average |
| 30 | Heat coloring | **TRANSLATE** | Their scale encodes good/bad. Ours encodes direction only — azure/violet/slate (§5). Valence-neutral |
| 31 | Books row (icon + O/U prices) | **DIRECT (identity) / DEFER (prices)** | Source identity permitted per #9. **Source-specific prices are deferred on scope, not forbidden** — they are neither projected nor rendered in V1-8a1/V1-8a2, and require a later explicit ticket because they **enlarge the browser-visible market payload and serialization surface**. The shell leaves room for a future factual source-line row without structural redesign. **CONSENSUS BAR** renders market structure meanwhile |
| 32 | — | **ADD (ours)** | **FRESHNESS BADGE** (§2.6) — first-class, not a buried timestamp |
| 33 | — | **ADD (ours)** | **PROVENANCE** and **SAMPLE** badges (§2.7, §2.8) |

### 1.4 Locked state and loading

| # | Element | Disposition | Notes |
|---|---|---|---|
| 34 | Locked continuation rows | **DIRECT SHELL (build now)** | Blurred/skeleton continuation rows, lock panel, non-functional preview state are **part of parity and built in V1-8a**. Accounts, payment, entitlement enforcement, and purchase flow are deferred to V1-9. **V1-9 must not force a Board redesign** |
| 35 | Upgrade CTA | **DIRECT SHELL — EXPLICIT NON-ACTIONABLE STATE** | An enabled-looking button that performs no action misleads users. Choose ONE: a **disabled control labelled "Membership coming later"**, or a **non-button lock message with no actionable affordance**. The architecture reserves the future CTA location for V1-9 |
| 36 | "Video Guide" | DEFER | Content |
| 37 | Skeleton loading rows | DIRECT | Part of what makes the reference feel alive |
| 38 | Empty state | DIRECT | Exists, authority-approved |

---

## 2. Player Research View

### 2.1 Header and market selection

| # | Element | Disposition | Notes |
|---|---|---|---|
| 39 | Back / logo / bell / avatar | DIRECT (bell, avatar DEFER) | |
| 40 | Player photo, name, position, height | **DIRECT SHELL / DATA-RIGHTS PENDING (photo); GAP G5 (position, height)** | Build slot + fallback now; inventory upstream player metadata before seeking a new source |
| 41 | Matchup + tipoff | DIRECT | |
| 42 | Consensus tile | TRANSLATE | → **FINDING HEADER**: Finding Mark + full §D.2 label + binding cap + Freshness Badge + §G.1 |
| 43 | **Promo dollar chips ($50/$75/$25)** | **REFUSE** | Affiliate inducement. The book tiles themselves may show factual source identity per #9; the promotional amounts may not |
| 44 | **Market tabs** (REB · ASTS · PA · PR · RA · PRA · BLKS · STLS · 3PM …) | **DIRECT** | Switching the grain recomputes everything |
| 45 | Period chips (1Q/1H/2H/4Q) | **DROP (current phase)** | Full-game props only; preserve layout |
| 46 | Market title | DIRECT | |
| 47 | **Line stepper (− 23.5 +)** | **DIRECT** | `user_entered`, computed-never-persisted (V1-A1-2; founder V1-7b Path B ruling) |
| 48 | Book chip + "+8" | DIRECT (factual) | Source count/identity; opens the Consensus Bar |
| 49 | Favorite star | DEFER | Accounts |

### 2.2 Filters and windows

| # | Element | Disposition | Notes |
|---|---|---|---|
| 50 | **Opponent / Season / Home-Away / Team filters** | **DIRECT + GAP (G1)** | Core to the workspace. Requires filtered-window computation |
| 51 | Advanced-filter icon | DEFER | After base filters |
| 52 | **Window cards (L5/L10/L15/2026/H2H)** | **TRANSLATE (contents) — band preserved** | → **WINDOW CARD**: Strip + Sample Badge + compact counts + **explicit average** + **explicit difference from line** + streak + Margin Glyph + Provenance. HR% refused; the numeric scan utility is retained |

### 2.3 The primary chart

| # | Element | Disposition | Notes |
|---|---|---|---|
| 53 | **Stacked per-game bars** | **DIRECT (form) + GAP (G3)** | Stacked component segments **only when component values are present and semantically correct**. Fallback: one total-value bar with component breakdown in the touch detail. **No invented decomposition** |
| 54 | Value labels | DIRECT | |
| 55 | Dashed threshold line | DIRECT | The evaluated line |
| 56 | DNP ghost columns | DIRECT | Series carries the flag |
| 57 | Date + opponent axis | DIRECT | |
| 58 | Green/red coloring | **TRANSLATE** | Valence-neutral (§5) |
| 59 | **Touch a bar to inspect** | **DIRECT — required** | Disclosure level 3: date, opponent, home/away, value, margin, comparison line, provenance, component breakdown where available |

Governed by Evidence Grammar **§2.10 VALUE CHART** (v1.3) — a Research View component, not a primitive.

### 2.4 Secondary modules

| # | Element | Disposition | Notes |
|---|---|---|---|
| 60 | **Supporting Stats** (Minutes · Points · Rebounds · FG · 3PT) | **DIRECT + GAP (G3)** | Inventory `player_game_stats` before promising fields |
| 61 | **Depth Charts** | **DIRECT SHELL / DATA GAP / INTERIM AVAILABILITY MODE** | Build the complete module location and expandable roster structure. When verified depth-order data is unavailable, render an explicitly labelled **Availability Context** mode. This preserves the future product shape rather than designing the module away |
| 62 | **Line Movement** | **DIRECT + GAP (G4) — HIGH PRIORITY PARITY** | Must preserve: observed timestamp · line · source or consensus basis · movement direction · first-observed and latest-observed values · historical outcomes where applicable. **Arrows represent completed historical change only** — no arrow may imply future movement |
| 63 | Prop History | DIRECT + GAP (G4) | Same source; same priority |
| 64 | Feature tiles (Matchup · Defense · Shooting · Similar · Injuries · Odds · Rankings) | **MODULAR CONTEXT REGION — preserve** | Do not drop the category. Factual context modules that may populate it: game location · opponent · tip time · team records (if sourced) · availability · prior meetings · opponent-relative historical samples · factual game-market context if later ingested. **Injuries → Availability Context (have it).** Defense/Shooting/Similar/Rankings: no data — do not fabricate; preserve the region so they can be added without redesign |
| 65 | **Win Predictor donut** | **REFUSE** | Predictive. The **GATE PANEL** is an **independent SlipLabz module** placed where it best supports the research workflow. It **does not inherit** donut geometry, team-win framing, probability semantics, or prominence merely because the reference placed a predictor there |
| 66 | **Matchup Odds (ML/spread/total)** | **DEFER — OUTSIDE CURRENT DATA SCOPE** | Not ingested; not required for the core player-prop workflow. **Not intrinsically forbidden** — omission is scope and source availability, not epistemic incompatibility |
| 67 | **Regular Season Averages** accordion | **DIRECT + GAP (G6)** | Render only seasons actually represented by trustworthy data |
| 68 | **Gamelog** | **DIRECT** | The series, tabulated, horizontally scrollable. Add per-row provenance — no reference equivalent |
| 69 | — | **ADD (ours)** | **GATE PANEL** (V1-8f) |
| 70 | — | **ADD (ours)** | **METHODOLOGY** panel — DR-19 grade detail with §G.2 adjacent |

---

## 3. Data availability

### 3.1 Available now — no new computation
Identity · market · line · matchup · classification/direction/caps/reasons · threshold windows (counts, averages, medians, streaks, coverage) · **per-game series** (date, opponent, home/away, value, comparison line, outcome, DNP, provenance) · current-market context (consensus, selection method, range, distribution, book count, first observed, movement summary, one-sided) · freshness timing · availability context · gamelog · season aggregates derivable from the series.

### 3.2 Gaps

| # | Gap | Nature | Required by |
|---|---|---|---|
| G1 | Filtered windows (opponent · home/away · season) | New read-model computation over existing series | **V1-8d** |
| G2 | H2H window | Same machinery as G1 | **V1-8d**; Board cell #25 |
| G3 | `player_game_stats` column inventory | **Inventory first**, then projection. Determines whether stacked segments are buildable | **Before V1-8c commits to stacking**; V1-8e |
| G4 | Line-movement projection | History exists; no projection. **High-value parity gap — must not drift** | V1-8e |
| G5 | Player metadata (position, height) | **Inventory upstream first** before seeking a new source | V1-8b |
| G6 | Season-over-season averages | Render only trustworthy seasons | V1-8e |
| G7 | Gate states | Deferred to V1-8f (authority corrected at Grammar v1.2) | V1-8f |
| G8 | Headshot rights | Legal, counsel pending. **Must not block the image slot and fallback** | production images only |

**No gap authorizes modifying the frozen method authorities.**

---

## 4. Implementation sequence (approved)

| # | Ticket | Delivers |
|---|---|---|
| 1a | **V1-8a1 — Board read-model inventory and projection** | STEP 0 field inventory; extend `BoardProjection` only where values are already computed; staged allowlist construction; key-set assertion; serialization audit; DR-19 unchanged; H2H carried as explicit unavailable. **No components, CSS, routes, screenshots, or deployment** |
| 1b | **V1-8a2 — Props Board mobile surface** | Chrome, nav (Board·Players·Methodology, no dead controls), source selector, filter row, full information band (horizontally scrollable), image slot + fallback, locked architecture with an explicit non-actionable state, skeleton, empty state, Board→Research navigation, responsive styling, screenshot-parity acceptance. **Consumes the accepted projection contract; does not reopen projection architecture** |
| 2 | **V1-8b — Player Research View shell** | Finding header, market tabs, static line display, window cards with explicit values, module scaffolding for every region, gamelog, context region |
| 3 | **V1-8c — Tactile primary chart** | Value Chart: chronology, raw values, threshold line, DNP ghosts, opponent axis, tap-to-inspect. Requires Grammar v1.3 |
| 4 | **V1-8d — Synchronized recomputation** | Line stepper + market tabs + filters on one live path. Requires G1, G2 |
| 5 | **V1-8e — Secondary modules** | Supporting stats, line movement/prop history, season averages, availability context. Requires G3, G4, G6 |
| 6 | **V1-8f — Gate Panel** | Gate-state plumbing (former V1-7c) + the panel |
| 7 | **V1-8g — Polish** | Press states, transitions, momentum, density tuning |

---

## 5. Screenshot-parity acceptance (applies to EVERY V1-8 surface ticket)

Every V1-8 surface ticket must produce mobile screenshots at approximately **390px viewport width**.

**"Band fully visible" does NOT mean forcing the entire information band into a 390px viewport.** Where a band scrolls horizontally, TWO captures are required — one at the band's initial scroll position and one scrolled to its later cells.

**Required set for a Board surface ticket (seven):**
1. Board chrome, source selector, and filters;
2. populated row at the information band's **initial** position;
3. the same band **horizontally scrolled** to its later fields;
4. row with **fallback avatar** (no photograph);
5. locked continuation state;
6. skeleton loading state;
7. empty state.

Research-surface tickets substitute their own equivalent set (view top · primary chart region · relevant lower modules · unavailable states).

**Preview deployment.** A Vercel preview may be created ONLY if the established repository workflow supports a non-production preview from the local worktree **without** pushing a branch, committing, altering tracked configuration, deploying with `--prod`, or exposing secrets. If it cannot, the agent halts after local screenshot capture and reports that an external preview requires a separately authorized mechanism. **The agent must not improvise a deployment workflow.**

Governor review compares: **hierarchy · information density · vertical spacing · horizontal scrolling · touch-target sizes · card boundaries · typography hierarchy · sticky behaviour · loading and unavailable states.**

> **No surface ticket passes solely because the data and tests are correct while the mobile interface remains sparse or desktop-like.**

The goal is not visual copying of proprietary branding. The goal is **comparable professional density and tactile completeness.**

---

## 6. Refuse / defer / drop registers

**REFUSE for V1 (authority-grounded):** promotional dollar chips · affiliate bonuses · "best book" or value-routing claims · Win Predictor · predictive probability donut · recommendation-oriented hit-rate filters · implied hot/cold or good/bad color framing.

**NOT categorically refused — deferred on scope or data:** source or sportsbook identity · factual offered lines · factual prices · game moneyline/spread/total · source-specific line history · historical odds observations. *"Not needed in V1" is not "forbidden forever."*

**DROP for the current phase — preserve extensible layout:** quarter and half markets · defensive rankings · similarity rankings · shooting matchup scores · alt-line ladders.

---

## 7. Open founder items

1. Final five-tab bottom navigation — after the Board and Research View exist.
2. Percentage-difference display — currently excluded; independently authorizable.
3. G8 headshot rights — counsel.
4. Whether factual price display enters a later milestone.

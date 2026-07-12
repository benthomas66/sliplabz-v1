**SLIPLABZ V1**

UX Amendment A2 (Adopted)

*PickFinder-Inspired Structure with a Distinct SlipLabz Identity*

| **Status** | ADOPTED — authoritative UX amendment, operative upon governance commit (see Section 19) |
| --- | --- |
| **Amendment ID** | V1-A2 |
| **Applies to** | Discover, Board, Prop Research View, Compare, Research List, application shell |
| **Does not alter** | V1-1 through foundational backend/data tickets unless expressly stated |
| **Launch league** | WNBA only |
| **Commercial model** | $7.99/month with a useful free preview |

| **Purpose** This amendment authorizes SlipLabz to adopt the successful workflow, density, and research-oriented information hierarchy of leading player-prop tools while preserving a distinct visual identity, a non-predictive evidence framework, WNBA-only scope, and all existing product guardrails. |
| --- |

# 1. Authority and Scope

## 1.1 Amendment effect

Upon formal adoption, this amendment becomes the controlling authority for the visual structure, interaction model, and responsive behavior of the SlipLabz application surfaces named below. Where this amendment directly conflicts with an earlier UX/UI provision, this amendment controls. All non-conflicting provisions remain in force.

## 1.2 Surfaces governed

Global application shell and navigation

Discover at /app

Board at /app/board

Prop Research View

Compare

Research List

Free-preview, premium-lock, loading, stale, empty, and error states

## 1.3 Work explicitly unaffected

This amendment does not invalidate, restart, or require rework of identity, provider-mapping, ingestion, reconciliation, market normalization, historical-statistics, availability, or entitlement foundations already completed or already governed by earlier tickets. Existing backend work remains authoritative unless a later ticket identifies a concrete interface dependency.

## 1.4 Reference-product rule

PickFinder and similar tools may be used as structural references for scanning efficiency, density, navigation, table composition, and research workflow. They are not pixel-copy targets. SlipLabz must not reproduce competitor branding, proprietary copy, logos, illustrations, exact color treatment, exact component geometry, or unsupported feature modules.

# 2. Product Experience Principles

**Research first.** Every surfaced conclusion must lead back to inspectable evidence.

**Dense but legible.** Desktop views should support rapid scanning without becoming a trading terminal.

**Distinct identity.** The product may use a dark research workspace, but it must remain recognizably SlipLabz.

**No fabricated intelligence.** No probability, EV, profitability, projection, or predictive score may be shown unless separately authorized by a future methodology authority.

**Useful free access.** The free experience must reveal real product value before premium gating.

**WNBA-specific.** League context, terminology, fixtures, and examples must be WNBA-only at launch.

**State continuity.** Filters, sorting, selected market, selected threshold, and navigation state should persist when users return from deeper research views.

# 3. Visual Direction

## 3.1 Overall character

SlipLabz adopts a compact, dark, research-workspace aesthetic with restrained contrast, clear hierarchy, and a limited accent palette. The interface should feel analytical and premium, but not like a sportsbook, betting slip, financial trading terminal, or casino product.

## 3.2 Design system requirements

| **Area** | **Required direction** | **Prohibited** |
| --- | --- | --- |
| Background | Deep neutral navy/charcoal layers with clear surface separation | Pure black everywhere or high-glare contrast |
| Accent | One restrained blue-violet family plus neutral status colors | Competitor-identical gradients or rainbow emphasis |
| Typography | Compact sans serif; strong numeric legibility; tabular numerals where useful | Decorative or sportsbook-style display typography |
| Cards | Low-radius, low-elevation surfaces with subtle borders | Overly glossy, glassmorphic, or promotional cards |
| Evidence states | Text labels plus restrained color and icon support | Color-only meaning or green/red bet-result semantics |
| Headshots | Allowed in Discover and Research View; optional in Board if density remains strong | Large decorative portraits inside dense tables |

## 3.3 Evidence-state language

The primary directional labels are Over-leaning, Under-leaning, Mixed, and Insufficient Evidence. These labels describe deterministic evidence patterns, not calibrated probabilities or recommendations. Visual treatment must always include explicit text, not color alone.

# 4. Global Application Shell

Desktop uses a persistent left navigation rail and a compact top utility area. Mobile replaces the rail with a compact top bar and bottom or drawer navigation.

Primary navigation: Discover, Board, Compare, Research List.

Secondary navigation: Methodology, Account, Billing, Help.

WNBA is the only visible league at launch; no empty multi-sport selector.

Search is globally accessible and may resolve players, teams, and supported prop markets.

The shell must preserve route, filters, sort order, and selected row context when navigating back.

The shell must show data freshness and degraded-data states without blocking navigation.

# 5. Discover — Default Route /app

## 5.1 Purpose

Discover is a curated evidence surface, not the full Board with a default sort. It highlights notable evidence profiles that are explainable, current, and supported by the available data.

## 5.2 Required structure

Compact page header with WNBA context, current slate/date, freshness, and search.

Market filters for points, rebounds, assists, and made threes.

Optional direction and evidence-quality filters.

Ranked evidence cards or compact rows, each with player, matchup, market, current threshold, evidence direction, brief rationale, coverage, and freshness.

Direct actions: Open Research View and Save to Research List.

A visible explanation of why an item appears in Discover.

## 5.3 Ranking constraints

Discover may rank deterministic evidence profiles under the approved Evidence Method Authority. It must not display implied probability, projected hit rate, expected value, profitability, stake sizing, or recommendation language.

# 6. Board — /app/board

## 6.1 Purpose

The Board is the comprehensive scanning surface for supported WNBA player props. It should visually resemble a high-density research table while remaining understandable to a non-professional user.

## 6.2 Required controls

Search by player or team.

Market filter: points, rebounds, assists, made threes.

Game/slate filter.

Book/source availability filter where authorized.

Evidence direction filter.

Freshness and minimum-coverage filter.

Sortable columns with a visible active sort.

Reset filters action.

## 6.3 Desktop column model

| **Column** | **Content** |
| --- | --- |
| Player / Matchup | Player name, team, opponent, game time; optional compact headshot |
| Market | Supported prop market |
| Consensus | Current consensus threshold or best authorized aggregate |
| Sources | Compact book/source line cells or coverage count |
| Evidence | Over-leaning, Under-leaning, Mixed, or Insufficient Evidence |
| Avg. Margin | Deterministic historical average margin relative to the selected threshold, where method-authorized |
| L5 | Recent-window evidence result |
| L10 | Recent-window evidence result |
| L20 / Season | Longer-window evidence result |
| Movement | Direction and magnitude of observed line movement |
| Freshness | Age/status of latest relevant data |

## 6.4 Board interaction rules

The first column remains sticky during horizontal scrolling on desktop.

The header remains sticky within the Board viewport.

Clicking a row opens the Prop Research View for that player, market, game, and selected threshold.

Sort and filter state must restore when returning to the Board.

Rows must not imply a recommended wager.

Locked content must not obscure the existence of contradictory evidence.

# 7. Prop Research View

## 7.1 Layout

Desktop uses a two-column workspace: a primary research canvas occupying approximately 62–70% of the usable width and a context/evidence rail occupying approximately 30–38%. On mobile, the rail moves below the primary content.

## 7.2 Header

Player identity, team, opponent, game time, and supported market.

Current selected threshold and source coverage.

Market tabs for points, rebounds, assists, and made threes when available.

Save to Research List action.

Clear freshness and data-quality status.

## 7.3 Primary research canvas

Compact source/book line strip.

Threshold adjustment control that updates historical evidence without implying a projection.

Window controls: L5, L10, L20, and Season where data suffices.

Large threshold-relative historical chart.

Game-by-game log with opponent, minutes, result, threshold-relative margin, and relevant context fields.

Line-movement history where available.

Loading, insufficient-data, stale-data, and source-disagreement states.

## 7.4 Evidence rail

Evidence Summary.

Supporting Evidence.

Contradictory Evidence.

Consensus and source coverage.

Freshness and quality.

Movement summary.

Methodology and interpretation disclosures.

## 7.5 Explicit exclusions

Win Predictor or outcome probability.

Expected value, profitability, ROI, or stake sizing.

Unsupported DVP or defense-rank module.

Similar-player projections.

Team-form or matchup score without a separately approved methodology.

Automated injury interpretation beyond authorized availability data.

# 8. Compare

Compare allows side-by-side inspection of a small number of saved or selected props. It compares evidence, thresholds, coverage, freshness, movement, and contradiction. It must not collapse the comparison into a single predictive score or declare a best bet.

Maximum comparison count should remain intentionally limited for readability.

Differences must be attributable to visible evidence fields.

Missing or incomparable data must be explicit.

Comparison state may be temporary before registration and persistent only after the authorized identity/entitlement boundary.

# 9. Research List

Research List is a saved-research surface, not a betting slip or pick builder. It stores props the user wants to revisit and may show freshness changes, movement, and evidence-state changes in-app.

Before production registration, use fixture or injected identity only.

Persistent user-owned saves require the authorized registration boundary.

No proactive alerts, scheduled picks, or outbound research delivery are introduced by this amendment.

Transactional account and billing communications remain distinct from research content.

# 10. Free and Paid Experience

## 10.1 Free experience

A real, current, useful preview of Discover and Board.

At least one fully inspectable research example or a clearly defined rotating preview.

Visible methodology and freshness.

No fake blurred rows that imply unavailable data exists when it does not.

## 10.2 Paid experience

Full supported slate and deeper research access.

Full source/book coverage where available.

Compare and persistent Research List after registration.

Premium gating should occur after the user sees genuine product value.

Price remains $7.99 per month unless modified by a later commercial authority.

# 11. Responsive Behavior

Desktop prioritizes dense table scanning and a side-by-side Research View.

Tablet may collapse secondary columns and convert the evidence rail into a drawer or lower stack.

Mobile Board rows become compact cards or a horizontally scrollable table with the player cell pinned.

Filters collapse into a sheet or drawer with a visible count of active filters.

Charts must remain horizontally usable without truncating labels.

No critical evidence may be available only on hover.

# 12. States and Accessibility

Every surface requires loading, empty, stale, partial-data, no-source, error, and entitlement states.

Evidence direction must never depend on color alone.

Keyboard navigation must support primary controls, table rows, dialogs, and saved-item actions.

Focus indicators must be visible against dark surfaces.

Contrast must meet WCAG AA for text and essential controls.

Tables require semantic headers and accessible labels for abbreviated numeric cells.

# 13. Data and Methodology Boundaries

The interface may only render fields that are supported by approved schema, ingestion, normalization, historical-statistics, movement, availability, evidence-method, and entitlement authorities. A visual slot in this amendment does not itself authorize the underlying metric.

Unsupported fields must be omitted, not filled with placeholders that resemble real analytics.

Insufficient sample size must display Insufficient Evidence rather than a directional label.

Source disagreement and stale data must be visible.

Deterministic interpretation must remain reproducible from stored inputs.

No feature may silently introduce calibrated prediction.

# 14. Implementation Sequence and Non-Restart Rule

Adoption of this amendment does not restart the repository. Foundational tickets continue in their existing sequence. This amendment must be adopted before the frontend tickets that implement the governed surfaces.

Complete and approve V1-1.

Continue foundational identity, ingestion, market, historical, availability, and evidence-method work under existing authorities.

Adopt V1-A2 before Discover, Board, Prop Research View, Compare, or Research List frontend implementation begins.

Update the authority map, governance decisions, and ticket-file map to reference V1-A2.

Implement each governed surface through its existing or amended ticket, with screenshot and responsive acceptance evidence.

# 15. Required Governance Adoption Changes

Formal adoption should create or update only the necessary authority records:

Create docs/product/amendments/SLIPLABZ_V1_UX_AMENDMENT_A2.md.

Create docs/product/V1_AUTHORITY_MAP_ADDENDUM_A2.md.

Update docs/product/V1_GOVERNANCE_DECISIONS.md with an A2 adoption decision and precedence ruling.

Update docs/product/V1_TICKET_FILE_MAP.md so frontend tickets load V1-A2.

Record that V1-1 and completed foundational work are unaffected.

# 16. Acceptance Criteria

The app has a distinct SlipLabz identity while using the authorized dense research workflow.

Discover and Board are clearly different products, not the same table with different sorting.

The Board supports rapid WNBA prop scanning with authorized fields only.

The Research View exposes supporting and contradictory evidence.

No surface contains predictive probabilities, EV, ROI, staking, or bet-execution behavior.

The free experience provides genuine value before premium gating.

Desktop, tablet, and mobile layouts are specified and demonstrably usable.

State restoration works across Board and Research View navigation.

All metrics shown trace to an approved data and methodology authority.

No completed backend ticket requires restart solely because of this amendment.

# 17. Open Decisions Before Adoption

Whether compact player headshots appear in every Board row or only in Discover and Research View.

Exact dark-theme token values and accent palette.

Exact free-preview limit and which research example is fully unlocked.

Whether L20 or Season is the default longer historical window.

Whether book/source cells show individual lines, a coverage count, or both at launch.

Whether Compare launches in V1 or remains behind an existing later ticket.

| **Proposed ruling** Adopt Option A: use the reference product's interaction model and information density, but require a distinct SlipLabz visual identity, evidence language, navigation, and research architecture. Do not restart or rewrite foundational backend work. |
| --- |

# 18. Adoption Statement

This document is a proposed amendment only. It becomes operative only when incorporated into the repository authority hierarchy through an explicit governance decision and committed under the repository's one-approved-ticket-per-commit protocol.

SlipLabz V1 — UX Amendment A2 (Adopted)

# 19. Adoption Rulings (Governor, 2026-07-10)

This amendment is adopted subject to the following binding rulings, which resolve the conflicts and open decisions identified at review. Where this section conflicts with Sections 1-18, this section controls.

## GD-15 — Evidence-label taxonomy reconciliation

Amendment V1-A1 Section 10 remains the canonical classification taxonomy: Strong Over Evidence, Moderate Over Evidence, Mixed Evidence, Moderate Under Evidence, Strong Under Evidence, Insufficient Evidence, Unavailable. Section 3.3 of this amendment authorizes compact display variants for dense surfaces (for example "Over-leaning" as the compact form of a Moderate/Strong Over classification), subject to: (a) every compact variant maps one-to-one or many-to-one onto the A1 taxonomy under a documented mapping in the Evidence Method Authority; (b) the full A1 classification is reachable without hover (row expansion, card, or Research View); (c) the Unavailable state exists and is never collapsed into Insufficient Evidence; (d) strength grading (Strong vs Moderate) is never discarded on Discover cards or in the Research View.

## GD-16 — Compare naming and scope

"Compare Your Line" (complete spec plus V1-A1 Section 17) remains the required V1 feature at /app/compare: the user enters a line seen elsewhere and receives an evidence profile. Section 8 of this amendment describes a different capability — side-by-side comparison of multiple saved or selected props — which is hereby named "Compare Props," is NOT a required V1 deliverable, and is deferred unless a later explicit product ruling schedules it. Shell navigation labeled "Compare" routes to Compare Your Line. Nothing in Section 8 reduces the Compare Your Line requirements.

## GD-17 — Disposition of Section 17 open decisions

1. Board headshots: deferred to the amended V1-6 design review; default is no headshots inside dense Board rows, headshots permitted in Discover cards and Research View header.
2. Dark-theme token values and accent palette: decided within the amended V1-6 ticket under Section 3.2's constraints; not a governance matter.
3. Free-preview limit and the fully unlocked research example: remains V1-9 configuration per GD-6; earlier tickets use labeled provisional fixtures.
4. Default longer window (L20 vs Season): decided in the Evidence Method Authority (V1-A1-1) and applied consistently across surfaces.
5. Book/source cell presentation (individual lines vs coverage count vs both): decided at the amended V1-6 UX review; default is coverage count in Board cells with individual lines in the Research View source strip.
6. Compare Props launch timing: resolved by GD-16 (deferred).

## GD-14 — Precedence

Upon the governance commit adopting this amendment: the operative authorities for the governed surfaces are, in order, the Complete Spec v1.3 as amended by V1-A1, then this amendment V1-A2 for visual structure, interaction model, density, navigation, and responsive behavior of the surfaces named in Section 1.2, then the UX/UI Subspec v1.3 for all non-conflicting provisions. V1-A1 continues to control methodology, classification semantics, explanation content, disclosures, and copy-safety requirements. Section 13 of this amendment (a visual slot does not authorize the underlying metric) binds every frontend ticket.

# SLIPLABZ APPLICATION V1 — UX/UI SUB-SPEC

**Status:** Integration-ready UX authority  
**Revision:** 1.3  
**Date:** 2026-07-10  
**Product:** SlipLabz  
**Applies to:** Web application, responsive mobile web, account and paywall surfaces  
**Parent authority:** `SLIPLABZ_APPLICATION_V1_COMPLETE_SPEC_v1_3.md`

---

# 0. UX decision

SlipLabz V1 should feel like a **serious, calm research instrument**, not a sportsbook, fantasy application, consumer dashboard, or trading terminal.

The interface should be:

- clean;
- spacious;
- information-dense only where the research task requires it;
- neutral in tone;
- fast to scan;
- explicit about freshness and limitations;
- consistent across the Daily Brief and application;
- visually restrained enough that the data remains the focus.

The governing principle is:

> Show the minimum interface required to answer the user’s next research question, then reveal deeper information progressively.

The product must avoid:

- casino visual language;
- flashing movement indicators;
- excessive badges;
- decorative gradients;
- oversized cards;
- dense multi-panel dashboards;
- gamification;
- confidence colors;
- “winning” or “losing” visual semantics;
- gratuitous charts;
- mobile designs that merely shrink the desktop table.

---

# 1. Experience principles

## 1.1 One clear primary action per screen

Every screen should have one dominant user goal:

- Board: scan the slate.
- Research View: understand one player-market.
- Compare Your Line: analyze an external threshold.
- Player Page: understand one player.
- Account: manage access.

Secondary actions must remain visually subordinate.

## 1.2 Progressive disclosure

Show summary information first.

Reveal details through:

- row expansion;
- drawers;
- tabs;
- collapsible methodology;
- drill-down pages.

Do not display every book, every historical game, every timestamp, and every caveat at once.

## 1.3 Dense data, quiet chrome

The central table can be dense.

The surrounding interface should be quiet:

- compact header;
- limited navigation;
- minimal borders;
- no redundant cards;
- generous page margins;
- clear column alignment;
- subtle dividers.

## 1.4 Trust is part of the interface

Freshness, sample size, and coverage must be understandable without opening methodology.

The interface should visibly distinguish:

- current;
- aging;
- stale;
- unavailable;
- user-entered;
- first observed;
- final observed pregame;
- sportsbook;
- pick’em source.

## 1.5 Neutrality

Colors and labels must not imply that Over or Under is preferred.

Do not use:

- green for Over;
- red for Under;
- arrows that imply favorable movement;
- “hot” or “cold” labels;
- celebratory success states for historical outcomes.

Over, Under, and Push are factual categories.

## 1.6 Consistency over novelty

The same metric should look and behave the same in:

- Today’s Props Board;
- Prop Research View;
- Player Page;
- Compare Your Line;
- Daily Brief deep links.

---

# 2. Information architecture

## 2.1 Primary navigation

Desktop primary navigation:

1. **Board**
2. **Compare**
3. **Players**
4. **Brief**

Account and methodology are secondary utilities.

Recommended desktop header:

```text
SlipLabz | Board | Compare | Players | Brief                      Search    Account
```

Mobile bottom navigation:

1. Board
2. Compare
3. Players
4. Brief

Account is accessed from the top-right avatar/menu.

## 2.2 Route structure

Recommended routes:

- `/app`
- `/app/board`
- `/app/compare`
- `/app/players`
- `/app/players/[player]`
- `/app/research/[game]/[player]/[market]`
- `/app/brief`
- `/app/account`
- `/methodology`
- `/pricing`

Direct links must preserve enough route state to return the user to the prior Board context.

## 2.3 Default landing behavior

Authenticated paid user:

- land on Today’s Props Board.

Authenticated free user:

- land on Board preview.

Anonymous user entering a deep link:

- see the permitted preview;
- retain destination through sign-in or upgrade;
- return to the requested research context after authentication.

---

# 3. Global shell

## 3.1 Desktop shell

Structure:

```text
┌──────────────────────────────────────────────────────────────┐
│ Compact global header                                        │
├──────────────────────────────────────────────────────────────┤
│ Page title / date / key status                               │
│ Optional one-line context                                    │
├──────────────────────────────────────────────────────────────┤
│ Page-specific controls                                       │
├──────────────────────────────────────────────────────────────┤
│ Primary content                                              │
└──────────────────────────────────────────────────────────────┘
```

Maximum content width:

- research table may use nearly full viewport;
- narrative and account content should use a narrower reading width.

Avoid persistent left navigation in V1. It consumes horizontal space needed for the Board and adds unnecessary dashboard weight.

## 3.2 Header

Header requirements:

- compact height;
- SlipLabz wordmark;
- four primary destinations;
- global player search on desktop;
- account control;
- no marketing copy;
- no live ticker;
- no promotional banner unless operationally necessary.

## 3.3 Page title region

Each page begins with:

- concise title;
- date or context;
- optional status line;
- no oversized hero area.

Example:

```text
Today’s Props
Friday, July 10 · 6 games · Last checked 2:34 PM
```

## 3.4 Global status banner

Only show when actionably necessary:

- provider disruption;
- material stale data;
- incomplete slate;
- entitlement issue.

Banner should be one line when possible and link to detail.

Do not leave permanent informational banners at the top of every page.

---

# 4. Visual direction

## 4.1 Brand character

SlipLabz should feel:

- analytical;
- modern;
- composed;
- independent;
- premium but not luxurious;
- technical without appearing institutional.

Reference category:

- financial research tools;
- premium editorial data products;
- clean B2B analytics;
- modern sports journalism.

Avoid visual resemblance to:

- sportsbook bet slips;
- fantasy contests;
- crypto trading terminals;
- neon sports media;
- social betting feeds.

## 4.2 Color system

Use a restrained palette:

- near-white page background;
- white or slightly tinted content surfaces;
- dark navy or charcoal primary text;
- muted blue accent;
- neutral grays;
- one restrained warning tone;
- one restrained error tone.

The accent color should be used for:

- active navigation;
- links;
- selected controls;
- focus states;
- primary buttons.

Do not use multiple saturated colors for market categories.

## 4.3 Typography

Use one modern sans-serif family.

Hierarchy:

- page title;
- section title;
- body;
- data value;
- metadata;
- table label.

Numeric data should use tabular figures where available.

Avoid:

- all-caps headings except very small labels;
- decorative display fonts;
- excessive font weights;
- tiny low-contrast metadata.

## 4.4 Shape and elevation

- modest corner radius;
- limited shadows;
- prefer border and background contrast;
- no floating-card grid;
- no pill for every value.

Pills are reserved for states requiring compact categorical recognition:

- Fresh;
- Aging;
- Stale;
- Pick’em;
- Coverage incomplete.

## 4.5 Spacing

Use a consistent 4 or 8 pixel spacing system.

Favor:

- compact table rows;
- generous separation between page sections;
- moderate control spacing;
- no oversized card padding.

---

# 5. Today’s Props Board

## 5.1 Purpose

Allow the user to scan the entire current WNBA player-prop slate and identify which player-markets deserve deeper research.

## 5.2 Desktop layout

Recommended structure:

```text
Today’s Props                                 Fri, Jul 10
6 games · 49 players · Last checked 2:34 PM

[Search player or team] [Market ▾] [Game ▾] [Books ▾] [Freshness ▾] [More filters]
[Reset]                                                    [Columns ▾]

┌ Player / Matchup ┬ Market ┬ Consensus ┬ Books ┬ L5 ┬ L10 ┬ Season ┬ Move ┬ Status ┐
│ ...                                                                                 │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

## 5.3 Table hierarchy

Primary columns:

1. Player / matchup
2. Market
3. Consensus line
4. Eligible books
5. L5
6. L10
7. Season
8. Movement
9. Freshness/status

Secondary optional columns:

- line range;
- average;
- median;
- availability;
- first observed.

The default view must not show every secondary column.

## 5.4 Player cell

Display:

- player name;
- team abbreviation;
- opponent;
- home/away indicator;
- scheduled time.

Example:

```text
Gabby Williams
CON vs GS · 4:40 PM
```

Do not add a headshot in the dense Board table for V1.

## 5.5 Consensus cell

Display:

- median line as the primary value;
- range below when lines differ;
- no decimal padding beyond what the market uses.

Example:

```text
13.5
13.5–14.5
```

If no consensus:

```text
Unavailable
2 books below threshold
```

## 5.6 Historical record cells

Compact form:

```text
3–2
n=5
```

Pushes:

```text
3–1–1
n=5
```

The interface must not use green/red coloring for Over/Under outcomes.

Tooltips or detail views explain ordering:

`Over – Under – Push`

## 5.7 Movement cell

Use neutral notation:

```text
13.5 → 14.5
+1.0
```

Price-only movement:

```text
Line unchanged
Prices moved
```

No arrow color indicating good or bad.

## 5.8 Freshness

Prefer text plus subtle icon:

- Fresh · 2m
- Aging · 18m
- Stale · 42m
- Latest poll failed
- Coverage unavailable

Freshness should not dominate the row unless degraded.

## 5.9 Row interaction

Clicking the row opens Prop Research View.

Desktop options:

- preferred: right-side detail drawer for quick inspection;
- “Open full view” inside drawer;
- route updates so the state is shareable.

The drawer should occupy approximately 40–48% of viewport width, preserving Board context.

## 5.10 Expanded book details

Within row expansion or drawer:

```text
Sportsbooks
DraftKings       13.5   O -120   U -108   Updated 2m ago
FanDuel          13.5   O -114   U -114   Updated 3m ago
theScore Bet     14.5   O +100   U -140   Updated 1m ago

Pick’em sources
PrizePicks       13.5   Both directions   Updated 2m ago
Underdog         14.5   Higher only       Updated 2m ago
```

Sportsbooks and pick’em must be visually separated.

## 5.11 Sticky behavior

Desktop:

- sticky table header;
- first player column may remain sticky;
- avoid more than one sticky left column.

Mobile:

- no horizontally compressed full table;
- use card/list adaptation.

## 5.12 Board empty states

No games today:

```text
No WNBA games are currently listed.
Check the Brief or return when the next slate opens.
```

Games but no props:

```text
Games are scheduled, but supported player props are not available yet.
We’ll show them here when they appear.
```

Filtered to zero:

```text
No rows match these filters.
[Reset filters]
```

---

# 6. Mobile Board

## 6.1 Mobile principle

Do not reproduce the desktop table through horizontal scrolling as the primary experience.

Use compact research cards.

## 6.2 Card anatomy

```text
Gabby Williams                         Fresh · 2m
CON vs GS · 4:40 PM

POINTS
Consensus 13.5        6 books
L5 3–2                L10 6–4
Range 13.5–14.5       First seen 13.5

[View research]
```

The card should not look promotional.

## 6.3 Mobile controls

Top area:

- search;
- filter button;
- sort button;
- result count.

Filters open a bottom sheet.

Selected filters appear as removable chips only when active.

## 6.4 Mobile detail

Open Prop Research View as a full page, not a narrow drawer.

Back navigation returns to:

- same filters;
- same sort;
- same scroll position.

---

# 7. Prop Research View

## 7.1 Purpose

Answer the full research question for one player, one game, and one market.

## 7.2 Desktop structure

Recommended two-column layout:

```text
┌───────────────────────────────────┬──────────────────────────┐
│ Player / market header            │ Current market summary   │
├───────────────────────────────────┼──────────────────────────┤
│ Book grid                         │ Historical summary        │
├───────────────────────────────────┴──────────────────────────┤
│ Movement timeline                                             │
├──────────────────────────────────────────────────────────────┤
│ Historical game-by-game record                               │
├──────────────────────────────────────────────────────────────┤
│ Result distribution                                          │
└──────────────────────────────────────────────────────────────┘
```

The right column should be narrower than the main book grid.

## 7.3 Header

Display:

- player;
- team and opponent;
- market;
- scheduled time;
- availability context;
- last checked;
- back-to-board control.

Do not display a recommendation summary.

## 7.4 Current market summary

Primary values:

- consensus line;
- line range;
- eligible sportsbook count;
- first observed;
- current movement;
- freshness.

Use one compact summary block, not multiple KPI cards.

## 7.5 Book grid

Desktop table:

- Book
- Line
- Over
- Under
- Updated
- State

Best price highlighting:

- subtle border or text emphasis;
- only among same point and side;
- no “best bet” wording.

Pick’em sources appear in a separate subsection below the sportsbook table.

## 7.6 Historical summary

Show:

- L5;
- L10;
- L20;
- season.

Each includes:

- Over;
- Under;
- Push;
- `n`;
- average;
- median.

Do not use circular gauges or progress rings.

A compact table is preferred.

## 7.7 Movement timeline

Use a restrained line chart or chronological event list.

Default chart:

- x-axis: time;
- y-axis: line point;
- one line per sportsbook only when readable;
- consensus line emphasized;
- prices excluded from the default line chart.

Below chart, show event log:

```text
1:44 PM  FanDuel moved 13.5 → 14.5
1:58 PM  DraftKings price changed at 13.5
2:05 PM  BetRivers removed 14.5
```

No blinking or animation.

## 7.8 Historical game table

Columns:

- Date
- Opponent
- Result
- Closing line
- Outcome
- Margin

Each row also has accessible detail for:

- closing source count;
- closing selection method;
- provenance (`self_observed` or historical provider seed);
- coverage limitation.

Keep provenance visually quiet. Use a compact coverage note or details disclosure rather than a badge on every row.

Outcome text:

- Over
- Under
- Push

Use neutral text styles.

Rows with unavailable or unresolved historical lines do not enter the table’s calculated window. A separate coverage note must state excluded appearances and whether current-season history is seeded, self-observed, forward-only, or mixed.

## 7.9 Result distribution

Preferred visual:

- simple histogram or dot plot;
- selected threshold line;
- median and average labels;
- accessible textual summary.

Avoid probability curves in V1.

## 7.10 Mobile Research View

Order:

1. header;
2. current market;
3. historical summary;
4. sportsbook list;
5. pick’em list;
6. movement;
7. game history;
8. distribution;
9. methodology/caveat.

Use collapsible sections for book details and game history after the first few rows.

---

# 8. Compare Your Line

## 8.1 Purpose

Provide the fastest possible route from an externally observed line to useful SlipLabz research.

## 8.2 Desktop layout

Centered narrow workflow:

```text
Compare Your Line

[Player search________________]
[Market______________________]
[Line________________________]
[Optional source label_______]

[Compare line]
```

After submission, expand into a result page rather than retaining a large empty form.

## 8.3 Result hierarchy

1. User-entered line
2. Current sportsbook consensus
3. Difference
4. Historical threshold record
5. Result distribution
6. Current movement and freshness
7. Watch action

Example:

```text
Your line          14.5
Consensus          13.5
Difference         Your line is 1.0 higher

Against 14.5
L5   2–3   n=5
L10  4–6   n=10
Season 8–12–1   n=21
```

Use “higher,” “lower,” and “equal,” not better or worse.

## 8.4 Watch action

Primary secondary action:

```text
Watch this line
```

Supporting copy:

```text
Receive an email when the sportsbook consensus moves by your selected amount.
```

Do not imply urgency.

## 8.5 Input states

- player not found;
- unsupported market;
- invalid line;
- no current sportsbook consensus;
- insufficient historical games;
- external source not verified.

Each state should explain what remains available.

## 8.6 Mobile

Use full-width form controls.

Numeric line keyboard should be invoked.

The result summary remains above historical detail.

---

# 9. Player Pages

## 9.1 Purpose

Provide durable player-centered research independent of one current prop.

## 9.2 Header

Display:

- player name;
- current team;
- current availability context;
- next scheduled game;
- last data refresh.

A small team mark may be used if licensing permits, but is not required.

## 9.3 Page structure

1. Current props
2. Recent performance
3. Season overview
4. Real-line history by market
5. Opponent history
6. Availability timeline or current report

## 9.4 Current props

Use a compact list grouped by market.

Each row links to Prop Research View.

## 9.5 Recent performance

A clean game log table is preferred over multiple large metric cards.

Allow market selector:

- Points
- Rebounds
- Assists
- Threes

## 9.6 Market switching

Use tabs or a segmented control.

Do not show all market charts simultaneously.

## 9.7 Opponent history

Always show sample size.

If small:

```text
Limited history · n=2
```

Do not use “favorable matchup.”

---

# 10. Daily Brief integration

## 10.1 Brief page

The in-app Brief should resemble a premium editorial report, not another dashboard.

Structure:

- date and slate;
- concise introduction;
- selected market observations;
- movement items;
- availability notes;
- links to deeper research.

## 10.2 Deep links

Every linked item should open the exact context:

- player;
- game;
- market;
- relevant Board filter;
- relevant research section where possible.

## 10.3 Return behavior

Returning from a deep link should return to the same Brief position when feasible.

---

# 11. Search

## 11.1 Global player search

Desktop header search supports:

- player name;
- team;
- alias.

Results show:

- player;
- team;
- next game;
- active current prop count.

## 11.2 Search behavior

- keyboard navigable;
- tolerant of accents and punctuation;
- no automatic permanent identity creation;
- recent searches may be local to the user;
- empty results offer Compare Your Line only when a valid player cannot be found.

---

# 12. Filters and sorting

## 12.1 Filter design

Default filters remain hidden behind compact controls.

Show a chip only when a filter is active.

Primary filters:

- game;
- team;
- market;
- book count;
- freshness.

Advanced filters:

- availability state;
- line range;
- historical sample completeness.

## 12.2 Sorting

Default:

- game time;
- player;
- market.

User may sort approved numeric columns.

Avoid a default ranking that implies desirability.

Do not default-sort by historical Over rate.

## 12.3 Persistence

Preserve filters:

- while navigating inside the app;
- on return from detail;
- optionally in URL query parameters for shareability.

Do not preserve filters indefinitely across unrelated sessions unless user expectation is clear.

---

# 13. Loading states

## 13.1 Initial page load

Use skeleton rows matching final content density.

Do not use a large centered spinner for the entire Board.

## 13.2 Partial loading

Allow independent modules to load:

- current market;
- historical results;
- availability.

A slow non-critical module should not block the full page.

## 13.3 Background refresh

Do not visibly rearrange the table during background refresh.

When values change:

- update quietly;
- optionally show a subtle “Updated” indicator;
- preserve user focus and scroll position.

---

# 14. Empty, unavailable, and error states

## 14.1 State hierarchy

Use distinct states:

- no scheduled data;
- supported data not yet available;
- filtered zero;
- provider unavailable;
- stale data;
- unresolved identity;
- insufficient sample;
- paywalled;
- permission error.

## 14.2 Copy style

State copy should be:

- factual;
- brief;
- non-alarmist;
- actionable when possible.

Example:

```text
Sportsbook lines are temporarily unavailable.
Historical player results are still available.
Last successful check: 2:18 PM
```

## 14.3 Inline versus page-level errors

Use inline errors when one module fails.

Use page-level errors only when the primary page cannot function.

## 14.4 Retry

Show a Retry action only when user-triggered retry is reasonable.

Do not expose repeated provider retry controls that could consume quota unnecessarily.

---

# 15. Pricing, free access, and paid feature UX

## 15.1 Commercial model

SlipLabz has:

- a limited useful free tier;
- one full-access paid tier at **$7.99 per month**.

The interface must present one clear paid plan rather than a tier comparison grid.

## 15.2 Build sequencing

The complete product experience should be designed and implemented first.

Paid feature locks are added toward the end of the build during the pricing and entitlement phase.

Before that phase:

- internal/admin users may access the complete product;
- design states for free and paid users must still exist;
- agents must not scatter temporary client-only locks across components;
- components should expose capability hooks that the later entitlement layer can enforce consistently.

## 15.3 Paywall principle

Show the value of research depth without making the free experience deceptive.

Truth, methodology, timestamps, freshness, sample size, and failure explanations remain visible to all users.

## 15.4 Free experience

The free experience includes:

- limited Board preview;
- basic player search;
- limited Compare Your Line use;
- consensus line and book count;
- basic L5 and season summaries;
- freshness and methodology;
- free Brief excerpt;
- one active watch when enabled.

The free experience should feel complete for a small number of research actions, not like a broken paid page.

## 15.5 Paid experience - $7.99/month

Paid access includes:

- full Board;
- all supported rows;
- full sportsbook grid;
- exact-line prices;
- full L5/L10/L20/season history;
- movement history;
- Player Pages;
- unrestricted Compare Your Line within abuse controls;
- multiple watches;
- full Brief.

## 15.6 Board preview

The free preview should:

- show a stable server-selected subset;
- retain truthful timestamps;
- show methodology;
- prevent enumeration;
- clearly identify additional paid depth.

Do not blur an entire table.

Preferred transition:

```text
Continue with the full WNBA board, complete book grid, and movement history.
$7.99/month
[Get full access]
```

## 15.7 Contextual upgrade

Upgrade prompts may appear after:

- preview limit reached;
- full book grid requested;
- deeper history requested;
- free Compare limit reached;
- second watch requested.

Do not interrupt the user's first meaningful free interaction with a modal.

## 15.8 Pricing presentation

Use:

```text
SlipLabz Full Access
$7.99/month
Cancel anytime
```

Feature language:

- Full WNBA board
- Full book grid
- Movement history
- Player research
- Multiple watches
- Full Daily Brief

Avoid:

- unlock winning insights;
- find more edges;
- beat the books;
- limited-time pressure;
- crossed-out fictional prices.

## 15.9 Enforcement

A locked UI state reflects a server-authoritative entitlement decision.

Paid data must not be delivered to a free client and merely obscured.


# 16. Account and watch management

## 16.1 Account page

Sections:

- plan;
- billing;
- email delivery;
- active watches;
- preferences;
- sign out.

Keep this administrative and simple.

## 16.2 Watch list

Each watch shows:

- player;
- market;
- entered line;
- current consensus;
- movement threshold;
- last checked;
- delivery state;
- pause/delete controls.

No red/green performance display.

## 16.3 Cancellation

Clearly state:

- cancellation effective date;
- access-through date;
- Brief delivery status.

Avoid retention dark patterns.

---

# 17. Component inventory

The design system should begin with a small reusable set.

## 17.1 Navigation

- GlobalHeader
- MobileBottomNav
- AccountMenu
- Breadcrumb/BackControl

## 17.2 Inputs

- SearchInput
- Select
- NumericLineInput
- FilterButton
- FilterBottomSheet
- SegmentedControl
- DateContext

## 17.3 Data display

- ResearchTable
- MobileResearchCard
- BookGrid
- MarketSummary
- HistoricalWindowTable
- GameHistoryTable
- MovementChart
- ResultDistribution
- FreshnessLabel
- CoverageLabel
- AvailabilityNote

## 17.4 Actions

- PrimaryButton
- SecondaryButton
- TextLink
- WatchButton
- UpgradePrompt

## 17.5 Feedback

- InlineNotice
- GlobalStatusBanner
- SkeletonRow
- EmptyState
- ErrorState
- PaywallState

Avoid creating bespoke cards when one of these components already applies.

---

# 18. Responsive behavior

## 18.1 Breakpoint philosophy

Use content-driven breakpoints.

Suggested ranges:

- mobile: below 640 px;
- tablet: 640–1023 px;
- desktop: 1024 px and above;
- wide research table enhancement: 1280 px and above.

These are implementation defaults, not rigid design artifacts.

## 18.2 Tablet

Tablet may use:

- compact table with fewer default columns;
- full-screen research view;
- drawer only in landscape when space permits.

## 18.3 Data prioritization

When space decreases, remove in this order:

1. secondary metadata;
2. optional columns;
3. detailed range;
4. averages/medians;
5. first observed.

Never remove:

- player;
- market;
- consensus;
- book count;
- historical sample;
- freshness.

---

# 19. Accessibility

## 19.1 Keyboard

All actions must work without a mouse.

Required:

- logical tab order;
- visible focus;
- Escape closes drawers/sheets;
- arrow navigation where appropriate;
- Enter opens row;
- focus returns to trigger after close.

## 19.2 Screen readers

- tables use proper headers;
- sort state announced;
- row expansion state announced;
- charts have text summaries;
- icons have labels;
- freshness is not color-only;
- locked content is clearly identified.

## 19.3 Contrast

Meet WCAG AA for text and interactive controls.

Muted metadata must remain readable.

## 19.4 Motion

Respect reduced-motion preference.

Avoid motion except:

- drawer transition;
- small state transition;
- loading skeleton.

No animated odds ticker.

---

# 20. Data formatting

## 20.1 Time

Display in the user’s local time where possible.

Always retain precise UTC internally.

Use concise display:

- 4:40 PM
- Updated 2m ago
- Last checked 2:34 PM

Detailed timestamp appears on hover, tap, or detail view.

## 20.2 Lines

Preserve provider precision.

Typical:

- 13.5
- 2.5
- 0.5

Do not show `13.50`.

## 20.3 Prices

American format:

- +105
- -120

Use a true plus sign only if consistently supported; ASCII `+` is acceptable.

## 20.4 Records

Use:

- `3–2`
- `3–1–1`
- `n=5`

Explain order in accessible label.

## 20.5 Missing values

Use explicit words where meaning matters:

- Unavailable
- No current line
- Insufficient sample
- Coverage incomplete

Avoid ambiguous em dashes as the only explanation.

---

# 21. Copy tone

## 21.1 Voice

- direct;
- calm;
- factual;
- concise;
- transparent.

## 21.2 Preferred phrases

- Sportsbook consensus
- First observed
- Current line
- Final observed pregame
- Eligible books
- Historical result
- Sample size
- Coverage incomplete
- Last checked
- Pick’em source
- Your line is higher/lower/equal

## 21.3 Avoid

- hot
- cold
- trending pick
- sharp
- value
- lock
- edge
- smash
- best bet
- must play
- confidence
- profitable

---

# 22. Page-level acceptance criteria

## 22.1 Global shell

- Primary destination reachable in one click/tap.
- No persistent sidebar.
- Header remains compact.
- Operational banner appears only when needed.
- Mobile navigation remains usable with one hand.

## 22.2 Board

- Desktop slate is scannable without opening every row.
- Mobile does not depend on horizontal table scrolling.
- Filters do not dominate the page.
- User can return from detail without losing state.
- Free preview cannot be enumerated.
- Stale and unavailable states are visible.

## 22.3 Research View

- Current market is understandable within five seconds.
- Sportsbooks and pick’em are clearly separated.
- Price comparison never crosses points.
- Historical line coverage, source count, provenance explanation, and sample size are available without cluttering the primary view.
- No recommendation hierarchy appears.

## 22.4 Compare

- User can submit a line with minimal friction.
- Result clearly distinguishes entered line from provider lines.
- Difference uses neutral language.
- Insufficient data remains useful and truthful.
- Watch action is optional and secondary.

## 22.5 Player Page

- Current props and recent logs are easy to locate.
- Only one market is visually primary at a time.
- Opponent history always includes `n`.
- No unsupported matchup claim.

## 22.6 Account

- Billing and cancellation state are unambiguous.
- Watches are easy to pause or remove.
- No dark pattern.

---

# 23. Agent implementation rules

## 23.1 Required design artifacts before coding a surface

For each product-surface ticket, the agent must provide:

- route map;
- component tree;
- desktop wireframe;
- mobile wireframe;
- state matrix;
- data dependencies;
- accessibility notes;
- acceptance checklist.

These may be low-fidelity text or repository-native design artifacts.

## 23.2 No agent-designed product expansion

An agent may not add:

- homepage dashboard widgets;
- ranking cards;
- social features;
- notification center;
- player headshots;
- extra charts;
- gamification;
- trend badges;
- confidence scoring.

## 23.3 Component reuse

Before creating a new component, agent must identify why existing component inventory cannot satisfy the requirement.

## 23.4 Visual review gate

Every product-surface ticket must include:

- desktop screenshots;
- mobile screenshots;
- empty state;
- stale/error state;
- free/paywalled state where relevant;
- keyboard/accessibility check.

Agent halts for review before proceeding to another surface.

---

# 24. UX implementation sequence

## UX-0 — Design-system foundation

Deliver:

- tokens;
- typography;
- spacing;
- colors;
- buttons;
- inputs;
- labels;
- notices;
- loading and empty states.

## UX-1 — Application shell

Deliver:

- header;
- desktop navigation;
- mobile bottom navigation;
- page layout;
- account menu;
- status banner.

## UX-2 — Board

Deliver:

- desktop research table;
- mobile research cards;
- controls;
- filters;
- sorting;
- drawer/full-page detail entry;
- state preservation.

## UX-3 — Research View

Deliver:

- current summary;
- book grid;
- historical table;
- movement;
- distribution;
- mobile ordering.

## UX-4 — Compare

Deliver:

- input flow;
- result hierarchy;
- neutral difference state;
- watch action;
- invalid/no-data states.

## UX-5 — Player Page and Brief integration

Deliver:

- player page;
- market switching;
- game logs;
- current props;
- deep-link behavior;
- in-app Brief.

## UX-6 — Pricing, entitlement, account, and watches

Deliver:

- $7.99/month plan presentation;
- free preview;
- server-backed upgrade states;
- account;
- billing;
- watch management;
- cancellation.

## UX-7 — UX hardening

Deliver:

- responsive QA;
- keyboard audit;
- screen-reader audit;
- contrast;
- reduced motion;
- loading/error/outage review;
- forbidden-copy review.

---

# 25. Final UX decision

The UX is intentionally not a large dashboard.

The core experience is:

- one clean slate-wide Board;
- one focused research view;
- one simple external-line comparison flow;
- one durable Player Page;
- one editorial Daily Brief.

The interface should make SlipLabz feel deeper than broad competitors because it organizes WNBA prop research more clearly, not because it displays more visual elements.

This sub-spec is sufficiently detailed for agents to design and implement the V1 interface while preserving a clean, high-level product experience.

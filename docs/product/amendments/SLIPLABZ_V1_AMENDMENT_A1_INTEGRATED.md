**SLIPLABZ V1-A1**

**Product Interpretation and Discovery Amendment**

Integrated implementation authority incorporating GD-8 through GD-13

| **Document ID** | V1-A1 |
| --- | --- |
| **Status** | Authoritative product-spec amendment |
| **Product** | SlipLabz |
| **Scope** | WNBA-only V1 |
| **Effective date** | July 10, 2026 |
| **Amends** | Complete Spec v1.3 and UX/UI Subspec v1.3 |
| **Operative authority** | Complete Spec v1.3 as amended by V1-A1 |

**Governing principle:** SlipLabz may state what the available evidence supports. It may not pretend that historical evidence guarantees what will happen next.

# 1. Purpose

This amendment adds the interpretation, prioritization, discovery, and decision-completion layers required to make SlipLabz a useful player-prop research product rather than only a structured display of line data and historical statistics.

The original V1 specification correctly prioritizes real observed sportsbook lines, verified player results, exact-line historical calculations, cross-book comparison, line movement, freshness, provenance, sample-size visibility, truthful failure states, and the avoidance of fabricated predictive claims.

However, the original specification prohibits nearly all directional interpretation, prioritization, and recommendation-like behavior. That creates an incomplete workflow:

Current line data + player data → derived features → feature display → user performs all interpretation independently.

This amendment changes the required workflow to:

Current line data + player data → derived features → transparent directional evidence profile → prioritized discovery surface → detailed research → saved selection.

SlipLabz must help users determine:

which props deserve attention first;

whether the currently available evidence leans Over, Under, or Mixed;

which specific features caused the prop to be surfaced;

how complete, fresh, and reliable the supporting evidence is;

where the user can inspect the underlying data before making an independent decision.

SlipLabz may perform this interpretation without claiming that it has generated a calibrated prediction, guaranteed outcome, expected return, or demonstrated profitable betting edge.

# 2. Authority and precedence

The operative hierarchy-level-one authority is “SlipLabz Application V1 Complete Spec v1.3, as amended by V1-A1.” V1-A1 also amends the SlipLabz V1 UX/UI Subspec v1.3 on interpretation, discovery, directional evidence, ranking, navigation, and research-list matters.

Where this amendment conflicts with an earlier V1.3 prohibition against directional evidence labels, evidence-based rankings, ranked research opportunities, deterministic evidence summaries, Top Over or Top Under discovery surfaces, saved research selections, recommendation-adjacent prioritization grounded in disclosed criteria, or a Board-first default landing route, this amendment controls.

Earlier prohibitions on “picks,” “recommendation language,” “recommendation behavior,” “recommendation hierarchy,” and desirability-oriented sorting are superseded only to the extent necessary to permit amendment-authorized deterministic evidence interpretation and discovery.

The following restrictions remain in force:

no fabricated or unvalidated predictive probabilities;

no presentation of historical hit rate as future probability;

no predictive projections unless authorized by a later amendment;

no expected-value or betting-edge claims unless authorized by a later amendment;

no profitability claims;

no guarantees or “locks”;

no required stake sizes;

no wager execution or automated bet placement;

no invented, inferred, or unsupported provider data.

# 3. Revised product definition

SlipLabz V1 is a WNBA-only player-prop discovery and research application. It retrieves current market lines and verified player-performance data, calculates transparent line-relative features, identifies the direction supported by the available evidence, prioritizes notable props, and allows users to inspect the underlying evidence before saving a selection.

SlipLabz must:

organize the available prop market;

calculate line-relative evidence;

identify whether the evidence leans Over, Under, Mixed, Insufficient, or Unavailable;

surface the strongest qualifying evidence profiles;

explain why each prop was surfaced;

expose the data and methodology behind each conclusion;

allow registered users to save props for personal research.

**Product promise:** Find the WNBA props most strongly supported by current lines, verified historical results, and market context—then inspect the evidence behind every signal.

**Primary product loop:** Discover → interpret → inspect → compare → save.

# 4. Scope locks

## 4.1 League and launch markets

V1 remains WNBA-only. The launch markets remain exactly:

points;

rebounds;

assists;

made threes.

Any mention of steals, blocks, or other markets in methodology or normalization examples is future-proofing only. It does not authorize ingestion, storage, display, testing, or launch support for additional markets.

## 4.2 Providers and books

References to “more markets” or “more books” authorize only greater paid depth, coverage, rows, history, comparison detail, and access within the four approved launch markets and the existing approved sportsbook allowlist and pick’em source policy.

They do not authorize any new market, book key, provider, league, source, or provider relationship. Expansion requires a later explicit amendment.

## 4.3 Alerts

Movement alerts and evidence-change alerts are permitted future capabilities, not V1 implementation requirements. V1 does not implement scheduled monitoring, outbound email, Telegram, push, SMS, notification preferences, retry infrastructure, or proactive delivery.

V1 may display current line changes, evidence changes, and availability changes inside the Research List when a user opens or refreshes the application. This in-application comparison is not an alert.

# 5. Revised strategic wedge

The existing Compare Your Line workflow remains a core differentiator, but it is no longer the entire V1 wedge. The revised wedge is transparent WNBA prop discovery built on real lines and inspectable evidence.

## 5.1 Discover

Discover surfaces notable WNBA props from the current slate and explains which direction the available evidence supports. Discover reduces research time and answers which props deserve attention first.

## 5.2 Board

Today’s Props Board remains a first-class sibling surface that provides comprehensive current-slate market access. It is broader, more neutral, and more table-oriented than Discover. Discover and Board may share data, filters, components, and route state, but they are distinct product surfaces.

## 5.3 Compare Your Line

The user may enter a line seen elsewhere and receive current sportsbook consensus, current book count, difference between the entered line and consensus, historical results against the entered threshold, averages, median, pushes, actual sample size, current movement, freshness, evidence direction, evidence-strength classification, and a deterministic explanation.

# 6. Revised commercial boundary

SlipLabz sells prop discovery, evidence-based prioritization, directional evidence interpretation, transparent rankings, current-market organization, cross-book comparison, exact-line historical research, movement analysis, inspectable explanations, saved research time, and a repeatable selection workflow.

SlipLabz may identify and display:

Top Props;

Top Opportunities;

Top Over Profiles;

Top Under Profiles;

Strong Historical Profiles;

Notable Line Discrepancies;

Market Movers;

Trending Research Selections;

Mixed Evidence;

Insufficient Evidence.

SlipLabz must not use or imply:

Lock;

Guaranteed;

Can’t Miss;

Free Money;

Safest Bet;

Sure Thing;

Guaranteed Pick;

Risk-Free Pick;

Proven Winner;

Exact Chance to Hit, unless generated by a separately approved calibrated model;

Expected ROI, unless generated by a separately approved EV framework.

# 7. No predictive model remains a V1 invariant

V1 does not require a machine-learning or simulation-based predictive model. The interpretation layer must be deterministic, rules-based, transparent, reproducible, and derived only from approved V1 data.

The application may calculate historical hit rates, line-relative average and median margins, recent streaks, verified closing-line results, current-to-consensus differences, cross-book line differences, current market movement, source availability, freshness, sample sufficiency, evidence-direction labels, evidence-strength classifications, and internal ranking values.

An Evidence Strength value measures the strength, agreement, completeness, and quality of the currently available supporting evidence. It is not a prediction of future performance.

# 8. Evidence Profile Engine

SlipLabz V1 must implement a deterministic Evidence Profile Engine. The engine evaluates each eligible game + player + market + current threshold + direction combination.

The two evaluated directions are Over and Under. Pushes are neutral outcomes and must not be counted as wins for either direction.

The engine must produce:

evidence direction;

evidence-strength classification;

evidence component values;

evidence-quality state;

deterministic explanation;

qualifying or non-qualifying discovery status;

reasons for inclusion, downgrade, exclusion, or unavailability.

# 9. Approved evidence inputs

## 9.1 Historical threshold results

L5 Over, Under, and Push counts;

L10 Over, Under, and Push counts;

L20 Over, Under, and Push counts;

season Over, Under, and Push counts;

actual eligible sample size for each window;

incomplete-window state;

historical coverage start;

underlying game results.

These calculations compare historical player results to the selected current threshold. They are distinct from historical closing-line performance. The interface must clearly identify which calculations use the current selected threshold and which use verified historical closing lines.

## 9.2 Line-relative production

recent average minus threshold;

recent median minus threshold;

season average minus threshold;

season median minus threshold, if supported;

qualifying results above, below, and equal to threshold;

recent directional streak.

## 9.3 Current market context

sportsbook consensus point;

user or pick’em line minus sportsbook consensus;

minimum and maximum sportsbook line;

exact-point distribution;

eligible sportsbook count;

first-observed consensus;

current consensus;

first-observed-to-current movement;

current line freshness;

source freshness;

number of books offering the selected point;

best available line by direction.

Pick’em sources remain separate from sportsbook consensus.

## 9.4 Evidence-quality inputs

actual sample size;

incomplete historical coverage;

stale market observations;

incomplete sportsbook coverage;

unresolved player or event mapping;

unavailable current market;

missing verified player results;

postponed or canceled games;

one-sided offerings;

unresolved availability data;

unsupported contextual data.

Missing information must lower evidence strength, cap the classification, or make the profile unavailable. It must never be silently replaced with an estimate.

# 10. Evidence direction and classification

Each eligible prop must receive one of the following user-facing outputs:

Strong Over Evidence;

Moderate Over Evidence;

Mixed Evidence;

Moderate Under Evidence;

Strong Under Evidence;

Insufficient Evidence;

Unavailable.

A high L10 hit rate alone must not automatically produce a Strong label. Strong evidence generally requires sufficient sample size, directionally favorable threshold results, favorable average or median margin in the same direction, no severe data-quality failure, no strong contradiction from longer-window evidence, fresh enough current market data, and sufficient eligible market coverage.

Mixed Evidence must be used when meaningful components disagree. Insufficient Evidence must be used when sample or market coverage is inadequate. Unavailable must be used when a required upstream input cannot be produced truthfully.

Named classifications are the primary user-facing output. A numeric internal rank may be used for deterministic sorting. A numeric displayed score is optional and may be shown only if the method is documented, the components are inspectable, and the interface states that the value is not a probability.

# 11. Initial V1 scoring method

The V1 scoring system must prioritize transparency and stability over apparent sophistication. It must use normalized, capped component scores rather than opaque model output.

## 11.1 Recent threshold performance

Evaluate qualifying Over, Under, and Push results against the selected threshold for L5, L10, and L20. L10 is the primary recent window. L5 may provide recency context but cannot independently support a Strong classification. L20 provides stability context when available.

## 11.2 Margin support

Evaluate recent average margin, recent median margin, and season average margin to the threshold. Margins must be normalized by market-specific units or documented market-specific bounds so points, rebounds, assists, and made threes are not treated as directly interchangeable raw scales.

## 11.3 Window agreement

Measure whether L5, L10, L20, and season evidence point in the same direction. Agreement increases evidence strength. Contradiction decreases evidence strength and may force Mixed Evidence.

## 11.4 Market alignment

The method may evaluate the selected line versus sportsbook consensus, the current range, exact-point availability, current movement direction, and number of eligible books. A line more favorable to the evaluated side than sportsbook consensus may strengthen the profile. Market alignment must not be labeled expected value.

## 11.5 Evidence quality and penalties

Evidence quality may cap the maximum classification. Explicit penalties or caps must apply to stale data, thin sportsbook coverage, incomplete historical coverage, unresolved availability, one-sided offerings, abnormal dispersion, push-heavy samples, or material disagreement between windows.

# 12. Scoring configuration and method authority

Exact component weights, thresholds, caps, and minimum samples must be configuration-backed rather than embedded throughout presentation code.

The implementation must create docs/product/EVIDENCE_PROFILE_METHOD_V1.md defining component names, input fields, normalization, direction handling, weighting, sample-size requirements, classification thresholds, quality caps, penalties, exclusion rules, tie-breaking, examples, limitations, and method version.

Every stored Evidence Profile must record method version, calculation timestamp, input snapshot identifiers, selected threshold, direction, component values, penalties, final classification, final rank value, and inclusion or exclusion reasons.

Changes to weights or classification thresholds require a version increment, regression tests, documented rationale, before-and-after fixture comparison, and product-review approval. Agents may not tune the method to make selected examples look stronger.

# 13. Required Discover experience

Discover is a first-class navigation destination and the default /app landing surface. It must not be implemented as only a Board tab or default sort.

## 13.1 Top Over Profiles

Shows eligible current-slate props for which evidence supports Over. Default ordering uses evidence classification, evidence-quality state, internal evidence rank, eligible sportsbook count, freshness, and a stable deterministic tie-breaker.

## 13.2 Top Under Profiles

Shows eligible current-slate props for which evidence supports Under using the same ranking principles.

## 13.3 Notable Line Discrepancies

Shows props where a selected sportsbook or pick’em point differs materially from sportsbook consensus. Display selected source, selected point, consensus, difference, eligible book count, freshness, and directional interpretation. Do not label the difference as expected value.

## 13.4 Market Movers

Shows material changes in consensus point, book-level point, exact-point distribution, source availability, and price where supported. Movement alone does not create a Strong classification.

## 13.5 Mixed and insufficient evidence

Discover must provide access to notable Mixed Evidence profiles and may provide a filter or secondary section for Insufficient Evidence. Insufficient profiles must not appear in Top Over or Top Under rankings.

# 14. Required discovery row or card

Every ranked item must display, at minimum:

player, team, opponent, and scheduled game time;

market and evaluated line;

source of evaluated line;

evaluated direction and evidence classification;

primary and secondary reasons;

relevant L10 threshold record;

L10 average or median margin;

sportsbook consensus and line-versus-consensus difference, where applicable;

eligible sportsbook count;

freshness;

sample size;

warning or limitation indicator;

action to open Prop Research View;

action to save to Research List.

A qualifying item must not be shown as only a score. The user must understand the principal reason for the ranking without opening another page.

# 15. Deterministic explanation generation

Each Evidence Profile must include a deterministic plain-language explanation generated from structured data. It must identify the direction, most influential supporting evidence, material contradictory evidence, sample size, market context, and freshness or coverage limitations.

The explanation must not be generated from unconstrained language-model output. V1 should use templates. A later language-model rewriting layer requires separate approval, structured factual inputs, forbidden-language tests, and a deterministic fallback.

Example: “Moderate Over Evidence. The player exceeded 19.5 in 7 of the last 10 qualifying games and averaged 2.6 points above the threshold. The selected line is 0.5 below sportsbook consensus. Longer-window results are less supportive, so the profile is classified as Moderate rather than Strong.”

# 16. Prop Research View amendment

The existing Prop Research View remains required and must add an Evidence Summary module near the top of the page.

Required fields:

evidence direction;

evidence classification;

evaluated threshold and source;

evidence-method version;

component breakdown;

primary supporting evidence;

contradictory evidence;

sample-size state;

market-quality state;

freshness state;

deterministic explanation;

methodology link;

“not a probability” disclosure where a numeric score is displayed.

The user must be able to inspect the underlying games and sportsbook observations that produced each component. No component may be presented without traceable underlying data.

# 17. Compare Your Line amendment

Compare Your Line must produce an Evidence Profile for the user-entered threshold. Output must include the entered line, optional source label, sportsbook consensus, difference from consensus, eligible book count, L5/L10/L20/season threshold record, average and median margin, directional label, evidence classification, deterministic explanation, sample-size state, freshness, limitations, and save-to-research action.

The result must be clearly labeled as evaluated against the user-entered threshold and must not be confused with verified historical closing-line performance, sportsbook consensus, a modeled line, or a projected result.

# 18. Research List

V1 permits users to save props to a personal research workspace named Research List. A server-persisted Research List requires a registered account.

Anonymous users receive no durable server-persisted Research List. V1-A1-8 may either provide no anonymous list or explicitly session-scoped, non-authoritative client state. It must not create durable anonymous database records, hidden accounts, or an account substitute.

A saved selection must retain game, player, market, direction, selected line, selected source, evidence classification at save time, evidence-method version, saved timestamp, current classification, current line, change since save, freshness, and optional user note if implemented.

The product may display line changes, evidence changes, removed or unavailable markets, and current status when the user returns. It must not calculate stake size, place a wager, transmit a wager, promise combined-slip success probability, or multiply historical hit rates into a parlay probability.

Final free-registered and paid Research List limits are entitlement decisions finalized in V1-9. An implementing agent may not silently choose those limits earlier.

# 19. Default sorting and filtering

The previous restriction against desirability-oriented default sorting is superseded on Discover. Approved sorts include Evidence Strength, Strongest Over Evidence, Strongest Under Evidence, L10 threshold rate, L20 threshold rate, average margin, median margin, line-versus-consensus difference, eligible sportsbook count, movement magnitude, freshness, game time, player, and market.

When a user sorts by a single feature, the interface must identify that fact and must not imply that the single-feature sort is equivalent to the complete Evidence Profile ranking.

Approved filters include evidence direction, evidence classification, player, team, opponent, event, market, line source, sportsbook, pick’em source, minimum eligible book count, minimum sample size, freshness, movement state, historical coverage, discrepancy from consensus, and saved state.

# 20. Trending behavior

A Trending section may be implemented using aggregate user-saving or viewing behavior. Approved labels include Most Saved, Trending Research Selections, Most Viewed, and Popular Today.

Trending must not be described as most likely to win, community-confirmed winner, sharpest pick, or safest pick. Popularity, evidence strength, and market movement are separate concepts and must not be merged into an unexplained rank.

Community comments, public user records, and public performance leaderboards remain out of scope for V1.

# 21. Free and paid access

The free tier must demonstrate the complete product concept rather than presenting only raw data.

Free users should receive a limited but truthful preview of Discover, directional evidence labels, a limited number of ranked props, basic explanations, limited threshold history, Compare Your Line with usage limits, methodology, timestamps, sample sizes, and limitations.

Paid access may unlock the full ranked slate, all qualifying Over and Under profiles, deeper component breakdowns, fuller depth within the four approved markets and approved book allowlist, full historical windows, advanced filters, expanded Compare usage, persisted Research List, richer charts, expanded line history, and additional saved views.

Proactive movement and evidence-change alerts are deferred and are not V1 paid features.

The paywall may restrict depth, volume, convenience, persistence, and advanced research functionality. It must not conceal what an Evidence Profile means, that it is not a probability, the methodology, sample-size rules, freshness, known limitations, or contradictory evidence for an unlocked profile.

# 22. User-facing disclosures

Near ranked profiles, display: “Evidence profiles summarize historical results and current market information. They are research tools, not guarantees or predicted probabilities.”

Where a numeric score is shown, display: “Evidence Strength is a transparent research-ranking score. It is not the estimated probability that a prop will hit.”

The methodology page must explain that historical results do not guarantee future outcomes, threshold hit rate is not predictive probability, current lines may already reflect public information, recent samples may be noisy, player roles and availability may change, market prices and lines may move, missing or stale data can affect the profile, and SlipLabz does not place wagers or determine stake sizes.

# 23. Revised product invariants

## 23.1 Required interpretation

Every qualifying current prop must receive a transparent evidence interpretation or an explicit reason why one cannot be produced.

## 23.2 No fabricated prediction

Evidence Direction and Evidence Strength must never be represented as calibrated probability unless a later approved specification adds and validates such a model.

## 23.3 Inspectability

Every classification and ranking must be traceable to stored inputs and a versioned method.

## 23.4 Contradictions remain visible

Material evidence against the displayed direction must not be hidden.

## 23.5 Quality limits strength

Weak sample size, stale information, incomplete coverage, or unresolved mappings must cap or remove the profile.

## 23.6 Real data only

No missing input may be silently inferred.

## 23.7 Direction is permitted

The product may state that evidence supports Over, supports Under, is Mixed, is Insufficient, or is Unavailable when generated according to the approved method.

# 24. Revised out-of-scope list

The following remain out of scope:

any league other than WNBA;

markets other than points, rebounds, assists, and made threes;

new books or providers outside the approved allowlist and source policy;

native mobile applications;

live or in-play props;

automated bet placement or sportsbook-account integration;

wager execution or stake sizing;

guaranteed picks;

unvalidated predictive probabilities, projections, or expected value;

unsupported profitability claims;

affiliate-bonus optimization;

public user-performance leaderboards;

user wager-history accounting;

defense-versus-position claims without approved data;

teammate-out modeling without approved data;

unverified rest or home/away splits;

broad alternate-line browsing;

raw-data export as a standalone product;

proactive alerts or outbound notifications.

The following are no longer categorically out of scope: directional evidence labels, ranked prop discovery, Top Over and Top Under profiles, deterministic explanations, Evidence Strength scoring, saved research selections, a research-only pick builder, evidence-based sorting, and product-generated identification of notable props.

# 25. Data-model requirements

The implementation must add a versioned Evidence Profile representation supporting profile ID, game ID, player ID, market, evaluated line, evaluated source type and identifier, direction, evidence classification, internal rank, optional displayed score, method version, calculation timestamp, source snapshot references, historical-window values, margin values, market-context values, quality values, penalties, classification caps, inclusion status, exclusion reason codes, explanation fields, and freshness state.

The final schema may normalize components into related tables or structured JSON according to existing repository conventions, but it must support audit reconstruction. Given a stored profile, the system must identify which source observations, player results, and method version were used and how the final classification was reached.

# 26. Required reason codes

The implementation must use machine-readable reason codes for inclusion, downgrade, exclusion, and unavailability. At minimum, support or map equivalent codes for:

INSUFFICIENT_L10_SAMPLE;

INCOMPLETE_HISTORICAL_COVERAGE;

STALE_CURRENT_MARKET;

INSUFFICIENT_BOOK_COVERAGE;

WINDOWS_DISAGREE;

PUSH_HEAVY_SAMPLE;

UNRESOLVED_PLAYER_MAPPING;

UNRESOLVED_EVENT_MAPPING;

NO_CURRENT_MARKET;

POSTPONED_GAME;

CANCELED_GAME;

ONE_SIDED_OFFERING;

SOURCE_UNAVAILABLE;

STRONG_OVER_AGREEMENT;

STRONG_UNDER_AGREEMENT;

FAVORABLE_CONSENSUS_DIFFERENCE;

UNFAVORABLE_CONSENSUS_DIFFERENCE;

POSITIVE_MARGIN_SUPPORT;

NEGATIVE_MARGIN_SUPPORT.

User-facing copy must translate reason codes into understandable language.

# 27. Testing requirements

## 27.1 Directionality

Over and Under calculations are symmetric.

Pushes are neutral.

A result equal to the line is not counted as Over or Under.

Sign reversal for Under is correct.

## 27.2 Sample sufficiency

Small samples cannot receive Strong.

Missing windows are handled truthfully.

Incomplete windows display actual n.

L5 alone cannot create Strong evidence.

## 27.3 Conflicting evidence

Strong L5 and weak L20 may produce Mixed or Moderate rather than Strong.

Average and median disagreement is exposed.

Market disagreement is exposed.

Contradictory components are not discarded.

## 27.4 Quality limits

Stale data caps the classification.

Thin sportsbook coverage caps market conclusions.

Unresolved mappings produce Unavailable.

Missing player results do not become zeroes.

Postponed and canceled games are excluded correctly.

## 27.5 Reproducibility

Identical inputs and method version produce identical outputs.

Stored components reconcile to the final score.

Method-version changes do not silently overwrite historical profiles.

Tie-breaking is deterministic.

## 27.6 Copy safety

Forbidden-language tests must reject guaranteed, lock, can’t miss, free money, sure thing, guaranteed winner, unauthorized probability claims, and unauthorized expected-value claims. Approved-copy tests must allow Strong Over Evidence, Moderate Under Evidence, Mixed Evidence, one of today’s strongest qualifying profiles, evidence supports the Over, evidence supports the Under, and ranked by Evidence Strength.

# 28. UX acceptance criteria

The amendment passes product review only if an external user can:

open Discover;

immediately identify notable Over and Under profiles;

understand why the first item was surfaced;

see the sample size and freshness;

distinguish evidence strength from probability;

open the Prop Research View;

inspect the historical games and market observations behind the profile;

see material contradictory evidence;

compare a line encountered elsewhere;

receive a directional interpretation for that line;

save a prop to a Research List after registration;

return later and see whether the line or evidence changed.

The application fails review if the primary experience remains a large table of features requiring the user to construct the entire interpretation independently. It also fails if it presents unexplained scores or unsupported predictions.

# 29. Navigation and route authority

Discover is the explicit default app landing surface for anonymous, free-registered, and paid users, with entitlement-aware depth. This supersedes any earlier UX language making Today’s Props Board or Board Preview the default /app destination.

Required canonical routes:

/app → Discover;

/app/discover → Discover;

/app/board → Today’s Props Board;

/app/compare → Compare Your Line;

existing player, research, brief, account, methodology, and pricing routes remain valid.

Discover must be represented as a primary navigation destination. The Board remains a first-class sibling surface. Anonymous deep links must preserve the requested destination through sign-in or upgrade.

Changing Discover as the default landing destination requires a later explicit product ruling and is not left as an implementation-agent choice.

# 30. Merged implementation sequence

V1-0 through V1-5 remain unchanged. V1-4b remains unchanged. The merged sequence is:

V1-0 through V1-5;

V1-A1-1 — Evidence Method Authority;

mandatory product-review halt;

V1-A1-2 — Evidence Profile Schema;

V1-A1-3 — Evidence Profile Engine;

V1-A1-4 — Deterministic Explanation Templates;

amended V1-6 — Discover and Today’s Props Board;

amended V1-7 — Prop Research View including Evidence Summary;

amended V1-8 — Compare Your Line including Evidence Profile interpretation;

V1-A1-8A — Research List surface, data contract, and fixture-backed identity/capability behavior;

amended V1-9 — production registration, Research List ownership, final free/paid limits, Stripe, and server-authoritative entitlement;

amended V1-10 — release hardening and consolidated V1-A1 acceptance audit.

Discover requirements are folded into V1-6 so the pre-amendment Board is not built and later replaced. Evidence Summary is folded into V1-7. Compare interpretation is folded into V1-8. V1-A1-9 is absorbed into V1-9. V1-A1-10 is absorbed into V1-10.

Before V1-9, Research List implementation may use only an explicit fixture or injected identity boundary. It may not invent production authentication, anonymous durable persistence, or final entitlement policy.

# 31. Detailed ticket amendments

## V1-A1-1 — Evidence Method Authority

Create docs/product/EVIDENCE_PROFILE_METHOD_V1.md with approved inputs, formulas, normalization, quality rules, minimum samples, classifications, penalties, caps, reason codes, examples, and disclosures. Halt for product review before schema or engine implementation.

## V1-A1-2 — Evidence Profile Schema

Add versioned storage and audit references. Test migrations, constraints, method versioning, source traceability, and reproducibility fields.

## V1-A1-3 — Evidence Profile Engine

Implement deterministic Over and Under evaluation. Produce component values, direction, classification, rank, quality state, reason codes, and explanation inputs. No UI work. Halt for calculation-fixture review.

## V1-A1-4 — Explanation Templates

Implement deterministic templates for Strong Over, Moderate Over, Mixed, Moderate Under, Strong Under, Insufficient, and Unavailable, including contradiction and limitation language.

## Amended V1-6 — Discover and Board

Implement Discover as the default landing surface and Board as a first-class sibling. Include Top Over, Top Under, Discrepancies, Movers, Mixed Evidence, approved filters, approved sorts, and free-preview limits.

## Amended V1-7 — Prop Research View

Add Evidence Summary, component breakdown, supporting and contradictory evidence, methodology link, and underlying-data inspection.

## Amended V1-8 — Compare Your Line

Add Evidence Profile generation and explanation for user-entered thresholds.

## V1-A1-8A — Research List

Add save/remove behavior, UI, data contract, saved-versus-current comparison, and fixture-backed identity/capability behavior. Do not implement production identity or final entitlements.

## Amended V1-9 — Identity and entitlement

Implement production registration, ownership authorization, free-versus-paid Research List limits, account lifecycle, Stripe, protected APIs, and server-authoritative entitlement.

## Amended V1-10 — Consolidated acceptance audit

Verify ranking behavior, reproducibility, source traceability, copy safety, probability separation, contradiction visibility, stale-data treatment, route authority, identity ownership, and the complete external-user workflow.

# 32. Implementation halt conditions

Agents must halt and request review if:

the score requires an input not authorized by the active data specifications;

a component cannot be reproduced from stored data;

the method would treat historical hit rate as future probability;

a classification cannot be explained in plain language;

Over and Under logic is not symmetric;

a quality limitation cannot be represented;

a discovery ranking depends on unavailable or inferred data;

a provider-rights issue prevents customer-facing use;

a proposed interface hides contradictory evidence;

a requested feature implies EV, profitability, guaranteed performance, or stake sizing;

required minimum samples, weights, or classification thresholds remain unresolved;

the amendment conflicts with an unidentified authority not expressly overridden here.

Agents may not resolve these issues by inventing assumptions.

# 33. Recommended product language

## Homepage

Headline: “Find the WNBA props most supported by the data.”

Supporting copy: “SlipLabz ranks current player props using verified historical results, real sportsbook lines, market movement, and transparent evidence rules. Inspect every signal before making your own decision.”

## Discover

Heading: “Today’s Top Evidence Profiles.”

Sections: Top Over Profiles; Top Under Profiles; Notable Line Discrepancies; Market Movers; Mixed Evidence.

## Profile disclosure

“Evidence profiles summarize historical and current-market information. They are not guarantees or predicted probabilities.”

## Compare Your Line

“Enter a line from any sportsbook or pick’em app. SlipLabz will compare it with the current market, test it against verified player history, and explain which direction the available evidence supports.”

## Paid value

“Unlock the complete slate, deeper evidence, advanced filters, saved research, and expanded line history.”

# 34. Integrated governance rulings

The following rulings are incorporated into and governed by this amendment:

## GD-8 — Amendment precedence and narrowed recommendation restrictions

The operative level-one authority is the Complete Spec v1.3 as amended by V1-A1. V1-A1 controls on interpretation, discovery, directional evidence, ranking, navigation, and Research List matters. Earlier general prohibitions continue only against unsupported predictive, profitability, guarantee, and execution behavior.

## GD-9 — Four-market and provider scope remains locked

Launch support remains limited to points, rebounds, assists, and made threes and to the existing approved sportsbook allowlist and pick’em source policy. No new market, book, provider, league, or source is authorized.

## GD-10 — Proactive alerts are deferred

V1 may show changes inside the application when the user returns, but no outbound or scheduled alert infrastructure is authorized.

## GD-11 — Persistent Research List requires registration

Server persistence requires a registered account. Anonymous state is either absent or session-scoped and non-authoritative. Final free and paid limits are resolved in V1-9.

## GD-12 — Merged implementation sequence

The Evidence Method Authority precedes engine code and carries a mandatory product-review halt. Discover, Evidence Summary, and Compare interpretation are folded into V1-6, V1-7, and V1-8 respectively. Research List UI and data contract precede production identity through a fixture or injected boundary. V1-9 owns production identity, persistence ownership, and entitlement. V1-10 owns the consolidated acceptance audit.

## GD-13 — Discover is the default app landing surface

Discover expressly supersedes the prior Board-first default. Board remains a first-class sibling. Route and navigation authority are defined in Section 29.

# 35. Final governing principle

SlipLabz must not force users to infer the entire meaning of the data themselves.

SlipLabz may identify, prioritize, rank, and explain player props whose verified historical and current-market evidence supports a direction, provided that the criteria are disclosed, the method is reproducible, the inputs are traceable, sample size is visible, contradictory evidence is visible, quality limitations affect the result, evidence scores are not presented as probabilities, and no guarantee or unsupported profitability claim is made.

**The governing distinction:** SlipLabz may state what the available evidence supports. It may not pretend that historical evidence guarantees what will happen next.

**Required V1 product pipeline:** Retrieve → normalize → calculate → interpret → prioritize → explain → inspect → save.

This amendment converts SlipLabz from a passive research table into a transparent player-prop discovery product while preserving the evidence integrity, provenance, scope, and trust standards of the original specification.

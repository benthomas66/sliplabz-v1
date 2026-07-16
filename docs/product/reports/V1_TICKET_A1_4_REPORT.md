# V1-A1-4 Ticket Report — Explanation Templates

**Ticket:** V1-A1-4 (last piece of the evidence layer — turning a computed Evidence Profile into words a person reads).
**Kind:** pure functions over fixtures. No I/O, no clock, no database, no React, no HTML, no UI components. Emits STRUCTURED data; surfaces own rendering.
**Starting HEAD (expected):** `aab86085ccde11f18390f8218f610e0b77b93330` — `feat: evidence profile writer, population driver, and integration (V1-A1-3 Phase B)`.
**Session HEAD advanced during my run** to `d842bacfce9b3e1d01bcda1f36f0d6b352de64f3` — `feat: read-model input assembly for the evidence engine (V1-A1-3 Phase C)` — that is Agent A's commit, not mine (V1-A1-3 Phase C is Agent A's parallel ticket).
**Branch:** `main`.
**Starting `git status --short` (recorded verbatim):**

```
 M scripts/v1_a1_3_populate.ts
 M src/evidence/driver/populate.ts
?? docs/product/reports/V1_TICKET_A1_3_PHASE_C_REPORT.md
?? src/evidence/driver/readModelInputBuilder.ts
?? tests/integration/v1_a1_3_phase_c_read_model.integration.test.ts
```

All five entries are Agent A's V1-A1-3 Phase C work-in-progress; per the ticket's parallel-execution manifest I neither touched nor stole them.

## Parallel-execution manifest — confirmed observed

- **My manifest (files I created or modified this session):** `src/explanation/**` (six files: `compose.ts`, `copySafetyTerms.ts`, `disclosures.ts`, `index.ts`, `labels.ts`, `types.ts`, `vocabulary.ts`), `tests/explanation/**` (three files: `fixtures.ts`, `compose.test.ts`, `copySafety.test.ts`), this report (`docs/product/reports/V1_TICKET_A1_4_REPORT.md`). **Nothing else.**
- **Untouched (Agent A / prior-tasks / authorities):** `src/evidence/**`, `tests/evidence/**`, `tests/integration/**`, `scripts/**`, `docs/product/reports/V1_TICKET_A1_3_PHASE_C_REPORT.md`, any migration, `src/shared/enums.ts`, `tests/migrations/schemaShape.test.ts`, `docs/product/EVIDENCE_PROFILE_METHOD_V1.md`, any prior authority.
- **Databases:** none opened. No Docker container started (Agent A owns `sliplabz-a1-2-postgres` on port 55442). No hosted Supabase touched. No port bound.
- **Nothing staged, nothing committed, nothing pushed.**

---

## 1. Authorities read (in full)

1. `docs/product/EVIDENCE_PROFILE_METHOD_V1.md`
   - §D.1 (seven-value taxonomy per A1 §10, GD-15 fixed)
   - §D.2 (compact-display mapping table, DR-21 / DR-26; Unavailable never collapses into Insufficient)
   - §D.4 (surface rules 1, 6, 7 — no numeric score on compact; binding-cap prominence; provenance marker not hover-only)
   - §D.5 (Insufficient vs Unavailable distinction)
   - §E in full (closed vocabulary — every user-facing translation)
   - §G.1, §G.2, §G.3, §G.4 in full (disclosures + copy safety)
   - DR-19 (numeric score research-view-only)
   - DR-23 (backfilled-historical inclusion + surface copy DR-23 (c))
   - DR-26 (canonical stored order + compact UI clause)
2. `docs/product/amendments/SLIPLABZ_V1_AMENDMENT_A1_INTEGRATED.md` §27.6 (Copy safety) in full — quoted verbatim in `src/explanation/copySafetyTerms.ts`.
3. `docs/product/V1_GOVERNANCE_DECISIONS.md` — GD-8 (no probabilities/EV/projections), GD-15 (evidence-label taxonomy fixed).
4. `src/evidence/types.ts` (read-only) — the `EvidenceProfileOutput` shape my composer consumes.
5. `src/shared/enums.ts` — the six evidence enums (`EvidenceClassification`, `EvidenceDirection`, `EvidenceReasonCode`, `EvidenceReasonCategory`, `EvidenceQualityCapReason`, `EvidenceEvaluatedSourceKind`).

---

## 2. Deliverables — one-to-one map from output element to authority section

Every field the composer emits is traced to the authority section that requires or defines it.

### 2.1 Full explanation (Research View)

| Output element | Type / value | Authority section |
|---|---|---|
| `classification_label` | e.g. `"Moderate Over Evidence"` | §D.1 (verbatim in `labels.ts::FULL_CLASSIFICATION_LABELS`) |
| `direction` | `'over' | 'under' | null` | §B.7 / §D.1 |
| `prose_paragraphs` | Composed §E translations in DR-26 category order (support → contradiction → quality) | §E.1 / §E.2 / DR-26 |
| `reasons[].text` | §E translation VERBATIM per reason code | §E.1 (each row's "User-facing translation" column) |
| `reasons[].intra_category_rank` | Preserved as-received from the engine (`reasons.ts` owns DR-26 magnitude sort) | DR-26 |
| `binding_cap.reason_code` | The §E code corresponding to the profile's `quality_cap_reason` | §D.4 rule 6 + §E.1 |
| `binding_cap.cap_summary_short` | Short tag ("stale market", "limited book coverage", etc.) | §D.4 rule 6 shape "Moderate Over — stale market" |
| `provenance_marker.text` | `"Includes seeded historical closing lines"` | §D.4 rule 7 |
| `provenance_marker.must_not_be_hover_only: true` | Permanent boolean | §D.4 rule 7 |
| `provenance_marker.must_never_describe_as_observed_since_launch: true` | Permanent boolean | DR-23 (c) |
| `disclosure_g1.text` | §G.1 verbatim | §G.1 |
| `disclosure_g1.allowed_placements` | `['adjacent_to_classification_label', 'persistent_methodology_link']` | §G.1 "Placement:" clause |
| `disclosure_g1.affordance_rules.must_not_be_hover_only: true` | Permanent boolean | §G.1 "May not be hidden behind hover-only or click-only affordances" |
| `disclosure_g2` | §G.2 verbatim, present ONLY when caller passes `render_numeric_score: true` | §G.2 + DR-19 |
| `disclosure_g2.allowed_placements` | `['adjacent_to_numeric_score']` | §G.2 "Placement:" clause |

### 2.2 Compact explanation (Board / Discover dense row)

| Output element | Type / value | Authority section |
|---|---|---|
| `compact_label` | e.g. `"Over-leaning"`, `"Mixed"`, `"Unavailable"`, `"Insufficient Evidence"` (verbatim in `labels.ts::COMPACT_CLASSIFICATION_LABELS`) | §D.2 |
| `compact_display_line` | Deterministic composition: `"<compact_label>"` OR `"<compact_label> — <cap_summary_short>"` when capped | §D.4 rule 6 (shape "Moderate Over — stale market") |
| `binding_cap` (top-level field; never hover-only) | Same shape as Full | §D.4 rule 6 |
| `provenance_marker` (top-level field; `must_not_be_hover_only: true`) | Same shape as Full | §D.4 rule 7 |
| `disclosure_g1` | §G.1 verbatim | §G.1 |
| `must_never_expose_numeric_score: true` | Permanent boolean baked into the type shape | DR-19 |

Neither shape emits markup, HTML, CSS, React, or any UI component. The output is strictly structured data.

---

## 3. Copy-safety sweep — the load-bearing acceptance test

### 3.1 Forbidden terms swept — quoted verbatim from the authority

`docs/product/EVIDENCE_PROFILE_METHOD_V1.md` §G.4:

> "None of the translations in §E, none of the rendered explanations in §F, and no user-facing string produced by the engine or its templates may contain: `guaranteed`, `lock`, `can't miss`, `free money`, `sure thing`, `guaranteed winner`, `probability` (as a claim about a prop outcome), `expected value` (as a claim about a prop outcome), `EV`, `+EV`, `ROI` (as a claim about future returns), `risk-free`, `safest bet`, or `proven winner`."

`docs/product/amendments/SLIPLABZ_V1_AMENDMENT_A1_INTEGRATED.md` §27.6:

> "Forbidden-language tests must reject guaranteed, lock, can't miss, free money, sure thing, guaranteed winner, unauthorized probability claims, and unauthorized expected-value claims."

**Operative list** used by the sweep (`src/explanation/copySafetyTerms.ts::FORBIDDEN_COPY_TERMS`):

| # | Term | Kind | Case | Authority |
|---:|---|---|---|---|
| 1 | `guaranteed` | word (word-boundary) | insensitive | §27.6 + §G.4 |
| 2 | `lock` | word (word-boundary) | insensitive | §27.6 + §G.4 |
| 3 | `can't miss` | phrase (allows any whitespace) | insensitive | §27.6 + §G.4 |
| 4 | `free money` | phrase | insensitive | §27.6 + §G.4 |
| 5 | `sure thing` | phrase | insensitive | §27.6 + §G.4 |
| 6 | `guaranteed winner` | phrase | insensitive | §27.6 + §G.4 |
| 7 | `EV` | word | sensitive_uppercase | §G.4 |
| 8 | `+EV` | phrase | sensitive_uppercase | §G.4 |
| 9 | `ROI` | word | sensitive_uppercase | §G.4 |
| 10 | `risk-free` | phrase | insensitive | §G.4 |
| 11 | `safest bet` | phrase | insensitive | §G.4 |
| 12 | `proven winner` | phrase | insensitive | §G.4 |

Case sensitivity for `EV` / `+EV` / `ROI` is chosen because the lowercase forms are innocuous everyday tokens (e.g. `"ev"` inside `"evidence"`, `"roi"` inside `"royal"`). The uppercase forms are the domain slang the authority forbids. This is proven by a self-test asserting both positives and negatives (see `tests/explanation/copySafety.test.ts:"EV / +EV / ROI are case-sensitive"`).

### 3.2 Context-sensitive tokens (§G.4 "as a claim about a prop outcome")

`probability`, `probabilities`, `expected value`, `guarantees`, and `guarantee` are **context-sensitive per §G.4**. They appear inside the §G.1 and §G.2 disclosures — but ONLY in explicit-negation form ("not guarantees or predicted probabilities", "not the estimated probability that a prop will hit"). The disclosures are the very act of DENYING probability framing; §G.4's semantic clause "as a claim about a prop outcome" excludes them. The sweep treats these tokens as attention-flags (visible in the sweep result) rather than absolute violations, and the composer segregates the disclosures from the sweepable strings so the mandated authority text is not counted against itself.

This is proven end-to-end by `tests/explanation/copySafety.test.ts:"§G disclosure exemption: G.1 and G.2 use guarantees / probability in explicit negation form"`.

### 3.3 Matrix size and coverage

**Fixture matrix size:** **23** synthetic `EvidenceProfileOutput` shapes (`tests/explanation/fixtures.ts::ALL_FIXTURES`). Each fixture is a bare data literal — no engine invocation, no I/O.

**Reason-code coverage:** every emittable §E code appears at least once. Coverage assertion:
`tests/explanation/copySafety.test.ts:"LOAD-BEARING: every emitted §E reason code (all except RESERVED abnormal_dispersion) is exercised"` — enumerates `EVIDENCE_REASON_CODES` from `src/shared/enums.ts`, filters `abnormal_dispersion` (RESERVED per §I.3 clause 2), and asserts every remaining code appears in at least one fixture's `reasons` array. Result: **all 21 emittable codes covered**.

**Classification coverage:** all seven §D.1 classifications present. Assertion:
`copySafety.test.ts:"LOAD-BEARING: every §D.1 classification (all seven) appears at least once"`.

**Case coverage checklist (ticket-required):**

- Capped profile: **five fixtures** — `FIXTURE_CAPPED_STALE`, `FIXTURE_CAPPED_BOOK_COVERAGE`, `FIXTURE_CAPPED_PUSH_HEAVY`, `FIXTURE_CAPPED_MARKET_DISAGREES`, `FIXTURE_CAPPED_ONE_SIDED` (one per non-`'none'` value of `EvidenceQualityCapReason`).
- Unavailable: **six fixtures** — `FIXTURE_UNAVAILABLE_NO_MARKET`, `FIXTURE_TIED_CONSENSUS`, `FIXTURE_UNAVAILABLE_UNRESOLVED_PLAYER`, `FIXTURE_UNAVAILABLE_UNRESOLVED_EVENT`, `FIXTURE_UNAVAILABLE_POSTPONED`, `FIXTURE_UNAVAILABLE_CANCELED` (one per §D.1 step 1 Unavailable trigger).
- Insufficient: `FIXTURE_INSUFFICIENT`.
- Backfilled-provenance profile: `FIXTURE_BACKFILLED_PROVENANCE` (asserts `provenance_marker` fires with correct DR-23 (c) text).
- Tied-consensus case: `FIXTURE_TIED_CONSENSUS` (uses `no_unique_consensus_line` reason per DR-28).
- All §F worked-example reason sets: F.1 (`FIXTURE_MODERATE_OVER`), F.1a (`FIXTURE_STRONG_OVER`), F.2 (`FIXTURE_MODERATE_UNDER`), F.3 (`FIXTURE_MIXED`), F.4 (`FIXTURE_INSUFFICIENT`), F.5 (`FIXTURE_UNAVAILABLE_NO_MARKET`), F.6 (`FIXTURE_CAPPED_STALE`). Aliased in the fixtures file with `FIXTURE_F1_MODERATE_OVER`, etc., for direct §F traceability.

### 3.4 Result

**Load-bearing assertion result:** `PASS`. Rendered strings across the entire fixture matrix contain **zero forbidden terms**.

`copySafety.test.ts::"LOAD-BEARING: rendered strings across the ENTIRE fixture matrix contain zero forbidden terms"`:

- For every fixture, both `renderFullExplanation({ render_numeric_score: true })` and `renderCompactExplanation()` are called.
- Each output's `sweepableStrings()` is computed (classification_label, prose paragraphs, reason texts, binding-cap short tag, provenance marker text, compact label, compact display line).
- Every string is passed through `sweepForbiddenTerms(text)`.
- The union of violations is `[]`.

An independent second assertion sweeps every §E translation directly to prove the vocabulary is copy-safe BEFORE composition — proving no violation could arise from composition itself.

### 3.5 Governance-finding check

**No conflict was found between §E translations and §27.6 / §G.4.** Every §E user-facing translation was individually swept and produced zero violations. The `tests/explanation/copySafety.test.ts:"LOAD-BEARING: every §E translation itself is copy-safe"` test explicitly instructs a future reader: if any §E translation were to contain a forbidden term, that is a GOVERNANCE FINDING — the ticket's rule is to HALT and report both texts, NOT to edit the authority. This session did not encounter that condition.

---

## 4. Awkward composition — reported as findings, not fixed

The composer is a deterministic join of §E translations in DR-26 category order. When multiple reasons share a category, their §E sentences are simply concatenated with a single space. This can produce composition awkwardness that I intentionally have NOT smoothed over — the authority's words are load-bearing.

### 4.1 Finding: three support sentences run together read as three declarative micro-paragraphs, not as one paragraph

Example — `FIXTURE_MODERATE_OVER` support paragraph:

> "Recent average and/or median margin support this direction. Recent and longer-window results point in the same direction. The selected line is more favorable than sportsbook consensus for this direction."

Three §E sentences joined verbatim. The reader gets three short declaratives in a row. This is a legitimate composition — each sentence carries a distinct evidence claim — but a reader used to newsroom prose may find the rhythm blunt. The authority explicitly leaves prose smoothing as the surface's concern (`§D.4 rule 3` names "concise rendered explanation" without prescribing sentence-level rhetoric).

**Not fixed.** Rewriting §E sentences to flow together would paraphrase the authority. Reported as a finding for owner/governor review; V1-6 / V1-7 / V1-8 rendering may add typographical spacing (paragraph breaks between reasons) but MUST NOT paraphrase.

### 4.2 Finding: quality reasons composed with support/contradiction reasons in the same explanation may feel non-parallel

Example — `FIXTURE_MIXED` (three categories):

> "Margin evidence works against this direction. Recent and longer-window evidence point in different directions."

Contradiction + quality run together as one prose block per category. When a reader sees the WINDOWS_DISAGREE quality line ("Recent and longer-window evidence point in different directions.") it can read as duplicative of the composite direction summary. This is because the authority's §E translations for reasons that FORCE Mixed (windows_disagree) and reasons that describe direction disagreement (negative_margin_support) both frame the mismatch in similar prose.

**Not fixed.** The clean fix would be to expand the classification label with a why-summary in the surface — Research View can do so — but paraphrasing §E would violate the authority. Reported.

### 4.3 Finding: compact `cap_summary_short` tags are shortened §E noun phrases; the authority does not enumerate a canonical tag per cap

`§D.4 rule 6` gives the SHAPE ("Moderate Over — stale market", "Moderate Under — limited book coverage") but does not enumerate a short tag for every cap-effect reason. I made a mechanical choice: the salient noun phrase from each §E translation, lower-cased. See §S below for the itemized choice and its justification. Downstream surfaces that need the full sentence can render the underlying `translateReasonCode(binding_cap.reason_code)` directly.

**Not fixed;** documented as a silent-authority choice (§S below).

---

## 5. Test evidence

### 5.1 Typecheck

```
$ npx tsc --noEmit
(clean; no output)
```

### 5.2 Explanation tests

```
$ node --import tsx --test tests/explanation/*.test.ts
ℹ tests 29
ℹ suites 9
ℹ pass 29
ℹ fail 0
ℹ skipped 0
ℹ todo 0
```

Test file map:
- `tests/explanation/fixtures.ts` — 23 synthetic `EvidenceProfileOutput` fixtures (data literals; not a test file).
- `tests/explanation/copySafety.test.ts` — 10 tests, includes the LOAD-BEARING matrix sweep + reason-code coverage + classification coverage + case coverage.
- `tests/explanation/compose.test.ts` — 19 tests over §D.1 labels, §D.2 compact mapping, §E translations, §G disclosures, DR-19 numeric-score suppression, DR-23 provenance marker, DR-26 category order, determinism, direction-neutral text.

### 5.3 Full unit suite (worktree quiet — Agent A had just committed V1-A1-3 Phase C)

Ran the full suite after Agent A's commit landed and my `git status --short` showed only my two directories. This proves my changes cause zero regressions in the pre-existing suite:

```
$ node --import tsx --test tests/**/*.test.ts
ℹ tests 609
ℹ suites 113
ℹ pass 518
ℹ fail 0
ℹ skipped 91   (integration tests — DB-gated)
ℹ todo 0
ℹ duration_ms 3314.7
```

+29 net tests attributable to this ticket. Zero failures. Zero regressions.

---

## 6. Determinism

`tests/explanation/compose.test.ts:"identical input → byte-identical output across two calls"` — for every fixture, `JSON.stringify(renderFullExplanation(p))` and `JSON.stringify(renderCompactExplanation(p))` are compared across two calls; the output is byte-identical. No clock, no randomness, no Date, no `Math.random`, no environment reads. Every output object is `Object.freeze`d.

---

## 7. Deviations and classified assumptions

### 7.1 Deviations from ticket / expected shape

- **The composer stops short of rendering a "score label."** DR-19 says the numeric composite score MAY appear in Research View / grade-detail area; the score itself is a NUMBER, not a label the composer generates. My `FullExplanation` shape carries the §G.2 disclosure when `render_numeric_score: true` is passed, but the score value comes from `EvidenceProfileOutput.components.composite_score` (read-side property; not a template output). This preserves DR-19 without duplicating the score in the template.

### 7.2 Classified assumptions

- **Blocking if wrong (P0):** none identified. Every load-bearing behavior is a direct §E / §G / §D authority quote; the composer merely joins them in DR-26 order.
- **Non-blocking (P1):** the short cap tags in §S below (silent-authority choice). Downstream surfaces can render the full sentence instead.

### 7.3 Skipped checks

- Integration tests: none written this session (ticket explicitly forbids `tests/integration/**` — Agent A's territory).
- Live provider calls: none possible (ticket forbids; no network module imported).
- Database access: none (ticket forbids; no `pg` import).

---

## S. Places the authority was silent and I chose (implementation-neutral)

Each choice below is documented in the code with a comment naming this report section.

### S.1 Category paragraph joining

The authority's §E translations are complete sentences; DR-26 dictates the stored ORDER but not the SENTENCE-JOIN character between reasons of the same category. I chose the ASCII single space `' '` — the most conservative join that preserves each sentence intact. Alternative would be a newline between reasons (which the surface could still add by iterating `reasons[]`).

**Why implementation-neutral:** the surface can trivially re-split by `. ` if it wants per-sentence break lines. No information lost.

### S.2 `cap_summary_short` tags

The authority's §D.4 rule 6 example uses "stale market" and "limited book coverage" but does not enumerate the tag for every cap-effect reason. I chose the salient noun phrase from each §E translation, lower-cased:

| `quality_cap_reason` | Chosen tag | Underlying §E sentence's salient noun phrase |
|---|---|---|
| `stale_current_market` | `"stale market"` | "the current market snapshot is stale" |
| `insufficient_book_coverage` | `"limited book coverage"` | "cross-book confirmation is limited" |
| `push_heavy_sample` | `"push-heavy recent sample"` | "A large share of recent games landed exactly on the line" |
| `market_disagrees_with_history` | `"market disagrees with history"` | "Current market context points in a different direction from the historical results" |
| `one_sided_offering` | `"one-sided offering"` | "Only one side is offered across eligible sportsbooks" |

**Why implementation-neutral:** the composer publishes the underlying `reason_code` on `binding_cap`; a downstream surface preferring the FULL sentence can call `translateReasonCode(binding_cap.reason_code)` instead of using `cap_summary_short`. The chosen tags do NOT paraphrase the underlying §E sentences — they extract a nominal from the sentence itself.

### S.3 Sweep exemption for §G disclosures

The authority's §G.1 and §G.2 disclosures contain the tokens "guarantees" and "probability" — but ONLY in explicit-negation form. §G.4 clarifies that these tokens are forbidden "as a claim about a prop outcome"; a disclosure is the OPPOSITE of a claim. My sweep segregates the disclosures from the sweepable strings so the mandated authority text is not counted against itself, and this segregation is explicitly documented (`compose.ts::sweepableStrings` header comment + `disclosures.ts` file comment).

**Why implementation-neutral:** the sweep list is the operative list — any surface can extend the sweep to include disclosures if it prefers. The composer never rewrites the disclosure text.

### S.4 Reserved code halt semantics

The composer throws `Error("… RESERVED reason "abnormal_dispersion" — MUST NOT be rendered in evidence_method_v1 (§I.3 clause 2).")` when a profile carries the reserved code. The ticket says "if a profile somehow carries it, throw (mirror Phase A's `reasons.ts` guard)"; the choice of `Error` type (built-in `Error`) matches the engine's convention.

**Why implementation-neutral:** any downstream handler wanting a typed exception can subclass; the message is stable and greppable.

---

## 8. Files touched (must equal manifest subset)

**Created this session (all on-manifest):**

- `src/explanation/compose.ts`
- `src/explanation/copySafetyTerms.ts`
- `src/explanation/disclosures.ts`
- `src/explanation/index.ts`
- `src/explanation/labels.ts`
- `src/explanation/types.ts`
- `src/explanation/vocabulary.ts`
- `tests/explanation/compose.test.ts`
- `tests/explanation/copySafety.test.ts`
- `tests/explanation/fixtures.ts`
- `docs/product/reports/V1_TICKET_A1_4_REPORT.md` (this file)

**Read (no modifications):** `docs/product/EVIDENCE_PROFILE_METHOD_V1.md`, `docs/product/amendments/SLIPLABZ_V1_AMENDMENT_A1_INTEGRATED.md`, `docs/product/V1_GOVERNANCE_DECISIONS.md`, `src/evidence/types.ts`, `src/shared/enums.ts`, and the V1-2 / V1-3 / V1-4b / V1-5 module set for context.

**Confirmed NOT modified:**

- `src/evidence/**` and `tests/evidence/**` — Agent A's territory.
- `tests/integration/**` — Agent A's territory.
- `scripts/**` — Agent A's territory.
- `docs/product/reports/V1_TICKET_A1_3_PHASE_C_REPORT.md` — Agent A's territory.
- Any migration.
- `src/shared/enums.ts` and `tests/migrations/schemaShape.test.ts`.
- Any prior authority document.
- Agent A's local Docker Postgres (`sliplabz-a1-2-postgres` on port 55442). No container was started, no port bound, no hosted DB touched.

**No git operations performed:** no `git add`, no `git add .`, no `git add -A`, no `git commit`, no `git push`. Working-tree changes are unstaged.

---

## 9. Final `git status --short`

```
?? src/explanation/
?? tests/explanation/
?? docs/product/reports/V1_TICKET_A1_4_REPORT.md
```

Three untracked entries: the two directories from my manifest plus this report. Nothing outside the manifest was modified.

---

HALTED after V1-A1-4. Nothing committed. No files outside the manifest were touched.

---

## 10. Governor REVISE (2026-07-15) — copy-safety gate correctness

### 10.1 The defect (owned)

The prior version of `src/explanation/copySafetyTerms.ts` placed `probability`, `probabilities`, `expected value`, `guarantee`, and `guarantees` in a `CONTEXT_SENSITIVE_TOKENS` bucket that produced `attention_flags` rather than `violations`. `tests/explanation/copySafety.test.ts` asserted only on `violations` — so any composed string containing those five tokens (in claim form or otherwise) would have PASSED the gate. The tokens are on the authority's own §27.6 list, quoted in the §E preamble of `EVIDENCE_PROFILE_METHOD_V1.md` line 475:

> "User-facing translations pass A1 §27.6 (no `guaranteed`, `lock`, `sure thing`, `probability`, `expected value`, `free money`, `risk-free`, `safest bet`, `proven winner`)."

The demotion was also blinding the governance-finding detector: the test asserting each §E translation is free of forbidden terms could not detect an authority translation containing `probability`, because `probability` was not a violation. This was a latent hole in exactly the five most dangerous words in the product's vocabulary. Reported and corrected here.

Verified against the current §E translations: none contain any of the five tokens, so no active leak occurred. The correction closes the latent hole.

### 10.2 What changed

**`src/explanation/copySafetyTerms.ts`** — HARDENED. The five tokens are now hard `FORBIDDEN_COPY_TERMS` entries. `CONTEXT_SENSITIVE_TOKENS` and `attention_flags` are DELETED. `EXEMPT_ALLOWLIST_STRINGS` was added — exactly two pinned string literals (the §G.1 and §G.2 disclosure texts). The sweep exempts a string if and only if it is byte-identical to one of those two literals — no wildcard, no substring, no module scope, no negation heuristic.

**`src/explanation/index.ts`** — one downstream mechanical update: the re-export block for `copySafetyTerms.ts` now exports `EXEMPT_ALLOWLIST_STRINGS` and drops the deleted `CONTEXT_SENSITIVE_TOKENS`. This was forced by the symbol deletion (compile requirement); no other design in `index.ts` changed. Documented in a header comment on the affected export block.

**`tests/explanation/copySafety.test.ts`** — REWRITTEN. Sweeps EVERY rendered string across the fixture matrix, disclosures INCLUDED. Asserts on violations (attention_flags gone). Adds the four governor-required regression tests plus the hardened-list coverage assertion (17 terms).

**`tests/explanation/authorityConformance.test.ts`** — NEW. Reads `EVIDENCE_PROFILE_METHOD_V1.md` from disk at test time and asserts:
- The two `EXEMPT_ALLOWLIST_STRINGS` literals appear verbatim in the authority (any drift = fail).
- `DISCLOSURE_G1_TEXT` / `DISCLOSURE_G2_TEXT` from `disclosures.ts` equal the allowlist literals byte-for-byte (any drift = fail).
- Every §E reason translation in `REASON_TRANSLATIONS` appears verbatim inside the `## E. Reason codes` section of the authority (any paraphrase = fail).
- The RESERVED code `abnormal_dispersion` has no translation in code AND is marked RESERVED in the authority.

**`compose.ts`, `vocabulary.ts`, `labels.ts`, `disclosures.ts`, `types.ts`, `fixtures.ts` — UNCHANGED**, as directed. The DR-26 ordering, reserved-code guard, determinism, and compact-shape work are all preserved.

### 10.3 Hardened forbidden-term list (17 entries) with authority citations

| # | Term | Kind | Case | Authority |
|---:|---|---|---|---|
| 1 | `guaranteed` | word | insensitive | §27.6 + §G.4 |
| 2 | `lock` | word | insensitive | §27.6 + §G.4 |
| 3 | `free money` | phrase | insensitive | §27.6 + §G.4 |
| 4 | `sure thing` | phrase | insensitive | §27.6 + §G.4 |
| 5 | `guaranteed winner` | phrase | insensitive | §27.6 + §G.4 |
| 6 | `can't miss` | phrase | insensitive | §27.6 + §G.4 |
| 7 | `risk-free` | phrase | insensitive | §27.6 (§E preamble) + §G.4 |
| 8 | `safest bet` | phrase | insensitive | §27.6 (§E preamble) + §G.4 |
| 9 | `proven winner` | phrase | insensitive | §27.6 (§E preamble) + §G.4 |
| **10** | **`probability`** | word | insensitive | **§27.6 (§E preamble) + §G.4 — promoted to HARD** |
| **11** | **`probabilities`** | word | insensitive | **§27.6 (§E preamble) + §G.4 — promoted to HARD** |
| **12** | **`expected value`** | phrase | insensitive | **§27.6 (§E preamble) + §G.4 — promoted to HARD** |
| **13** | **`guarantee`** | word | insensitive | **§27.6 (§E preamble) — promoted to HARD** |
| **14** | **`guarantees`** | word | insensitive | **§27.6 (§E preamble) — promoted to HARD** |
| 15 | `EV` | word | sensitive_uppercase | §G.4 |
| 16 | `+EV` | phrase | sensitive_uppercase | §G.4 |
| 17 | `ROI` | word | sensitive_uppercase | §G.4 |

Rows 10–14 are the promotions this REVISE performs.

### 10.4 Four governor-required regression tests — mapped to `it(...)` names

All four live in `tests/explanation/copySafety.test.ts`:

| Required regression | `it(...)` name | Result |
|---|---|---|
| (a) fabricated claim-form string containing a demoted token FAILS the sweep | `regression test (a): a fabricated claim-form string containing 'probability' FAILS the sweep` | PASS |
| (b) each of the five previously-demoted tokens FAILS in a fabricated claim-form string | `regression test (b): each of the five previously-demoted tokens fails in a fabricated claim-form string` | PASS (all 5 tokens verified: probability, probabilities, expected value, guarantee, guarantees) |
| (c) a disclosure mutated by a single word (leading `not` dropped) FAILS | `exact-match allowlist: a disclosure mutated by a single word (leading 'not' dropped) FAILS (regression test (c))` | PASS (mutation of §G.1 fires "guarantees" and "probabilities"; mutation of §G.2 fires "probability") |
| (d) the unmodified §G.1 and §G.2 texts PASS | `exact-match allowlist: unmodified §G.1 and §G.2 texts PASS (regression test (d))` | PASS |

### 10.5 Two authority-conformance tests — mapped to `it(...)` names + what they read

All in `tests/explanation/authorityConformance.test.ts`:

| Conformance test | `it(...)` name | Reads |
|---|---|---|
| §G.1 disclosure literal pinned to authority | `EXEMPT_ALLOWLIST_STRINGS[0] (§G.1) appears verbatim in the authority` | `docs/product/EVIDENCE_PROFILE_METHOD_V1.md` (whole file) |
| §G.2 disclosure literal pinned to authority | `EXEMPT_ALLOWLIST_STRINGS[1] (§G.2) appears verbatim in the authority` | `docs/product/EVIDENCE_PROFILE_METHOD_V1.md` (whole file) |
| disclosures.ts constants pinned to allowlist literals (no in-repo drift) | `LOAD-BEARING: disclosures.ts constants equal EXEMPT_ALLOWLIST_STRINGS byte-for-byte (no silent drift possible)` | code only (`disclosures.ts` + `copySafetyTerms.ts`) |
| every §E translation pinned to authority | `LOAD-BEARING: every §E translation in vocabulary.ts appears verbatim inside the §E section of the authority` | `docs/product/EVIDENCE_PROFILE_METHOD_V1.md` slice between `## E.` and `## F.` anchors |
| RESERVED code marked RESERVED in authority (defense in depth) | `LOAD-BEARING: RESERVED reason code (abnormal_dispersion) has no translation in code AND the authority marks it RESERVED` | `docs/product/EVIDENCE_PROFILE_METHOD_V1.md` (whole file) |

Together these convert "verbatim" from a promise in a report into a machine-checked fact. Any edit to either the code OR the authority that drifts them apart fails a test.

### 10.6 Re-run matrix result with the hardened gate

**Result:** `PASS`. Zero violations across the entire fixture matrix (23 profiles × two shapes × every rendered string including disclosures).

Sweep coverage details for the re-run:
- Fixture matrix size: **23** profiles (unchanged from §3.3).
- Rendered strings swept per profile: full explanation's `sweepableStrings()` + `disclosure_g1.text` + `disclosure_g2.text` when present, PLUS compact explanation's `sweepableStrings()` + `disclosure_g1.text`. Range: ~5–9 strings per fixture.
- Total strings swept in the load-bearing matrix assertion: verified `≥ ALL_FIXTURES.length × 3` (an increase from the prior version's `≥ 2` because disclosures are now in the sweep set).
- HARD violations returned: **0**.
- §E translations independently swept: **21 codes** (all except RESERVED `abnormal_dispersion`); zero violations. This is now a stronger claim than before because `probability` etc. are hard terms.

**No governance finding.** No §E translation, label, cap tag, provenance marker text, or composed prose fires any of the 17 hardened terms.

### 10.7 Evidence — REVISE-only

**Typecheck:**

```
$ npx tsc --noEmit
(clean; no output)
```

**Explanation tests (mine only):**

```
$ node --import tsx --test tests/explanation/*.test.ts
ℹ tests 39
ℹ suites 10
ℹ pass 39
ℹ fail 0
```

+10 net tests vs. prior version (was 29 → now 39): 4 governor-required regression tests + 6 authority-conformance tests + 1 hardened-list coverage assertion, minus the 1 exemption-disproof test that was replaced by (d). All pass on the hardened gate.

**Full unit suite (worktree quiet — only my new files as untracked):**

```
$ node --import tsx --test tests/**/*.test.ts
ℹ tests 619
ℹ suites 114
ℹ pass 528
ℹ fail 0
ℹ skipped 91   (integration tests — DB-gated)
ℹ todo 0
ℹ duration_ms 930.4
```

+10 net tests vs. the pre-REVISE full-suite run (609 → 619). Zero failures. Zero regressions.

### 10.8 Final `git status --short` (post-REVISE)

```
?? docs/product/reports/V1_TICKET_A1_4_REPORT.md
?? src/explanation/
?? tests/explanation/
```

Same three untracked entries as before the REVISE; the corrected `copySafetyTerms.ts`, hardened `copySafety.test.ts`, new `authorityConformance.test.ts`, and the one-block edit to `index.ts` all live inside those three trees. **Nothing staged. Nothing committed. Nothing pushed.**

**Files touched by the REVISE (all on-manifest):**
- `src/explanation/copySafetyTerms.ts` — rewritten (hardened list + exact-string allowlist)
- `src/explanation/index.ts` — one-block re-export update forced by symbol deletion + addition
- `tests/explanation/copySafety.test.ts` — rewritten (violations only; disclosures included in sweep; 4 regression tests)
- `tests/explanation/authorityConformance.test.ts` — NEW
- `docs/product/reports/V1_TICKET_A1_4_REPORT.md` — this §10 appended

**Files intentionally untouched** (per REVISE directive): `src/explanation/compose.ts`, `src/explanation/vocabulary.ts`, `src/explanation/labels.ts`, `src/explanation/disclosures.ts`, `src/explanation/types.ts`, `tests/explanation/fixtures.ts`, `tests/explanation/compose.test.ts`.

HALTED after V1-A1-4 copy-safety correction. Nothing committed. Awaiting governor review.

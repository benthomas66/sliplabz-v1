# V1-7a — Research Read-Model Plumbing — Report

**Date:** 2026-07-27
**Status:** COMPLETE — nothing committed. Board untouched. Nothing rendered.

The ONE server-side path that assembles a research-grade projection for a single
(game, player, market) grain. It renders nothing; V1-7b consumes it. Every field
traces to EXISTING committed computation — no new engine work.

Starting state (verified): HEAD `daab4a6858e4923f1e71c1b0ab3f35e338403b4e` (V1-6f);
worktree clean except the two untracked founder-supplied `docs/research/` files
(V1-GOV-2 — left untouched).

---

## STEP 0 — inventory (what the pipeline already produces per grain; where it dies)

**(a) Threshold windows (L5/L10/L20/season).** Computed by `computeThresholdWindow`
(`src/computation/thresholdWindows.ts`). `ThresholdWindowResult` (`src/computation/types.ts`)
carries: `window_type, threshold, requested_n, eligible_n, incomplete, count_above,
count_equal, count_below, avg_stat_value, median_stat_value, avg_minus_threshold,
median_minus_threshold, current_streak_direction, current_streak_length,
coverage_label, includes_backfilled_historical` — **no rate/percentage field
exists** (counts-only is structural). On the evidence path the committed builder
`makeReadModelInputBuilderV2Core` (`src/evidence/driver/readModelInputBuilder.ts`,
`buildOneGrain` step 4) assembles all four into `EvidenceProfileInput.threshold_windows`,
the engine classifies on them, and **the writer discards them** (they are not
persisted — recomputable by re-running the builder).

**(b) Averages/medians, sample-size labels, historical coverage, mapping resolution.**
Avgs/medians + streaks live on `ThresholdWindowResult`. Sample size = `eligible_n` +
`coverage_label`. `HistoricalCoverageResult` (`coverage_start_date, eligible_game_count,
includes_backfilled_historical`) from `readHistoricalCoverageForPlayerMarket`.
`MappingResolutionResult` from `readMappingResolutionForGrain`. All assembled into
`EvidenceProfileInput`.

**(c) Current-market data.** `CurrentMarketRow` (`src/computation/types.ts:305`)
composed by `composeCurrentMarketRowV2` (freshness-neutral): `line_consensus`
(consensus_point, selection_method, coverage_label, counts), `line_range` (min/max),
`point_distribution` (exact-point counts), `eligible_book_count`, `first_observed`
(point/at), `movement_summary` (net movement + change counts), `book_detail`
(**offerings = PAID per-book**, `one_sided` = never paywalled §16.8), `availability_context`.

**(d) v2 evidence profile — persists vs recomputes.** `evidence_profiles`
(`20260714000001`) PERSISTS: `classification, direction, c_rtp/c_ms/c_wa/c_ma,
composite_score, quality_capped, quality_cap_reason, includes_backfilled_historical,
evaluated_line, evaluated_source_kind/identifier, method_version, computation_version,
evaluation_reference_time, profile_generated_at`; and the reason rowset in
`evidence_profile_reasons` (`20260714000002`): `reason_code, category,
intra_category_rank, contribution_magnitude`. It does NOT persist threshold windows
or current-market context — those live in the input, rebuilt by the committed builder.

**(e) What BoardProjection carries today.** `player, team, market, evaluated_line,
classification_label` (compact), `compact_display_line, disclosure_g1`, optional
`cap_tag, provenance_marker` — **none** of the research substance (no windows, counts,
components, score, current-market context, or reasons). As expected.

**Ruling:** ALL research fields require **NO new computation** — they come from
`computeThresholdWindow`, `composeCurrentMarketRowV2`, the persisted profile + reasons,
`fullClassificationLabel`, the committed compact renderer (cap tag / provenance / §G.1),
and the §G.1/§G.2 disclosure constants. **None requires new engine work.** No engine
change was needed, so none was made.

---

## Authority — quoted, with ruling applied

**§D.2 (mapping table + rule 4):** the "Discover card / Research View — MUST show"
column requires the **FULL** label verbatim (e.g. *"Strong Over Evidence"*); rule 4:
*"Strength grading (Strong vs Moderate) is NEVER discarded on Discover cards or in the
Research View."* → `ResearchProjection.classification_label_full = fullClassificationLabel(...)`
and it also carries the raw `classification` enum, preserving strength.

**DR-19 (verbatim):** *"The numeric composite score is HIDDEN BY DEFAULT … It MAY appear
ONLY inside an expanded Research View or an explicit 'How this was graded' section. When
shown: (a) present as a bounded evidence-method score in [-1.00, +1.00] rounded to 2
decimals — never as a percentage; (b) place the not-a-probability disclosure (§G.2)
immediately adjacent; (c) show component values and method version in the same
inspectable area …"*
**§D.4 rule 3 (verbatim):** *"Research View provides: full classification; … above/below/push
counts; eligible_n values; margin evidence; cross-book consensus and range; … quality caps;
reason codes …; numeric score and component values ONLY inside the explicit methodology /
grade-detail area (DR-19)."*

**Ruling applied:** DR-19 + §D.4 rule 3 **SANCTION** the numeric `composite_score` and the
four component values on the Research View. Therefore `ResearchProjection` carries
`composite_score` and `components {c_rtp, c_ms, c_wa, c_ma}`. Per DR-19(b) it also carries
`disclosure_g2` (the §G.2 text) so V1-7b can place it adjacent to the score. These remain
**forbidden on BoardProjection** — its key-set assertion still rejects `composite_score`
(verified by test group 5; the Board path is byte-identical).

**REVISE (2026-07-27), both additive:**
- **DR-19(a) — 2-decimal rounding at the boundary.** `composite_score` is ROUNDED to 2
  decimals in `constructResearchProjection` (`round2`), so the browser never receives more
  precision than the authority sanctions displaying. Full precision is retained on the internal
  `ResearchCandidate` (`profile_output.components.composite_score`). The four component values
  are unchanged (DR-19(a) governs the composite score specifically).
- **DR-19(c) — method version in the same inspectable area.** `ResearchProjection` now carries
  `method_version` and `computation_version`, added to the allowlist and the key-set assertion.
  Both are **sourced from the persisted `evidence_profiles` row** (`ep.method_version`,
  `ep.computation_version` — the production repo SELECTs them and fail-loud-validates the stored
  method), never derived or hardcoded; the fixture supplies its persisted analog.

---

## Scope A — the ResearchProjection type (in full)

Top-level keys (allowlist, all required): `player, team, market, evaluated_line,
tipoff_utc, evaluated_source_kind, classification, classification_label_full, direction,
quality_capped, quality_cap_reason, binding_cap_tag, reasons, windows, market_context,
provenance_marker, disclosure_g1, disclosure_g2, line_observed_at, composite_score
(2-decimal, DR-19(a)), components, method_version, computation_version` (DR-19(c), from the
persisted profile). Sub-shapes:
- `ResearchWindow` (×4: L5/L10/L20/season): `window_type, threshold, requested_n,
  eligible_n, incomplete, count_above, count_equal, count_below, avg_stat_value,
  median_stat_value, avg_minus_threshold, median_minus_threshold,
  current_streak_direction, current_streak_length, coverage_label,
  includes_backfilled_historical` — **counts only, no rate**.
- `ResearchReason`: `reason_code, category, intra_category_rank, contribution_magnitude`.
- `ResearchComponents`: `c_rtp, c_ms, c_wa, c_ma`.
- `ResearchMarketContext`: `consensus_point, selection_method, consensus_coverage_label,
  eligible_book_count, point_distribution[], line_range_min/max, first_observed_point/at,
  net_point_movement, point_changes_observed, over/under_price_changes, one_sided`
  — **no per-book `offerings`** (paid; dropped).

Forbidden-key list (`RESEARCH_PROJECTION_FORBIDDEN_KEYS`): `offerings, book_detail,
paid_book_offerings, profile_output, current_market_row, internal_game_id,
internal_player_id, source_snapshot_ids, input, score`. `assertResearchProjectionKeySet`
checks the exact top-level allowlist, forbids those keys, and adds a nested check that
`market_context` never carries `offerings`/`book_detail`.

---

## Scope B — construction discipline (staged call path)

```
raw rows / persisted profile
  -> ResearchCandidate            (apps/web/src/lib/researchCandidate.ts — internal; carries the
                                    committed EvidenceProfileOutput + ThresholdWindows +
                                    CurrentMarketRow, incl. the PAID book_detail.offerings)
  -> constructResearchProjection  (apps/web/src/lib/researchProjection.ts — NEW allowlisted object
                                    literal: no spread of a raw row, no spread-then-delete, no
                                    omit(), no cast; DROPS offerings; self-checks its key set)
  -> ResearchProjection
```
The cap tag, provenance text, and §G.1 come from the COMMITTED `renderCompactExplanation`
(single owner); the full label from `fullClassificationLabel`; §G.2 from `DISCLOSURE_G2_TEXT`.

---

## Scope C — repository choice + justification

**A SIBLING `ResearchRepository`** (`apps/web/src/lib/server/researchRepository.ts`), NOT an
extension of `BoardRepository`. Extending `BoardRepository` would edit `boardRepository.ts` —
a production `/board` file — breaking this ticket's byte-identical Board rail. The sibling
keeps the Board path untouched and gives research its own single-grain query shape.

- `PostgresResearchRepository.queryResearchGrain(method, game, player, market)`: `server-only`,
  transaction pooler (`SLIPLABZ_BOARD_DATABASE_URL`), fail-loud on unknown method
  (`assertKnownMethodVersion`). It READS the authoritative graded output from persisted
  `evidence_profiles` + `evidence_profile_reasons` (durable — re-running the engine is
  rejected because the committed v2 engine returns `beyond_horizon` with no profile for an
  aged grain) and REBUILDS the evidence context (windows + market + `line_observed_at`) via
  the committed `makeReadModelInputBuilderV2Core`. Not hosted-exercised in this ticket (tests
  use fixtures); composed entirely from committed functions.
- `FixtureResearchRepository` (`fixtureResearchRepository.ts`): the same interface with seven
  canned grains for tests / V1-7b.

---

## Scope D — fixtures

Seven research grains (`fixtureResearchRepository.ts`) spanning **all seven** §D.2
classifications (so all seven FULL labels are reachable) and including the four the ticket
names: a Strong-magnitude profile **capped** to Moderate (grain 2), a Moderate **with
provenance** (grain 3), an **Insufficient** (grain 6), an **Unavailable** (grain 7).
Synthetic names ("Research Guard A" … "Research Center G"). Window counts come from the
committed `computeThresholdWindow` (genuinely computed). Each grain's current-market row
carries a DISTINCTIVE paid offering so a test proves the projection DROPS it.

*Note (ties to GAP-17):* a quality cap forces max Moderate in the engine, so a "Strong
capped" profile is honestly represented as `moderate_*_evidence` + `quality_capped`
(avoiding the incoherent strong+capped combination); a separate uncapped Strong grain
supplies the "Strong Over/Under Evidence" labels.

---

## Tests — all seven groups green

`apps/web/test/researchProjection.test.ts` (11 tests):
1. **Every field traces** — window `count_above/below/equal`/`eligible_n` equal the source
   exactly; `above+equal+below === eligible_n`; score (2-decimal)/components/market/reasons/
   line_observed_at all trace to the candidate. No invented data.
   - **DR-19(c)** — `method_version` and `computation_version` present and matching the candidate.
   - **DR-19(a)** — projected `composite_score` has ≤2 decimals; the candidate retains full
     precision (a fixture carries `0.7834` → projected `0.78`, candidate keeps `0.7834`).
2. **Key-set assertion** — exact allowlist accepted; a smuggled top-level forbidden key
   (`offerings`), an unknown key, and per-book `offerings` nested in `market_context` all throw;
   plus a canary test that the distinctive paid values never appear in a projection.
3. **Counts are counts** — no projected string field contains `%`, an "N/M" form (`\d+/\d+`),
   or the word "rate".
4. **Full §D.2 labels** — all seven full labels reachable; the compact forms
   ("Over-leaning"/"Under-leaning"/"Mixed") are never used here.
5. **Board isolation** — `BOARD_PROJECTION_FORBIDDEN_KEYS` still includes `composite_score`;
   `assertBoardProjectionKeySet` throws on a smuggled `composite_score`.
6. **Nothing rendered** — a walk of `app/` asserts no route/component references any research
   module (this ticket adds no route). The **serialization audit is UNCHANGED** (`test-audit/`
   diff empty) and re-ran **11/11**, identical to V1-6f — no new response to audit.
7. **Root + app suites** — app fast **48/48** (37 prior + 11 research), root typecheck 0, root unit
   **573/573**, full serial integration **130/130**, serialization audit **11/11** (unchanged).
   None weakened.

**Board path byte-identical:** `git diff` on `app/board/`, `BoardTable.tsx`, `boardService.ts`,
`boardRepository.ts`, `boardProjection.ts`, `rankedCandidate.ts`, and `test-audit/` is EMPTY.

---

## Files (nothing committed)

New:
- `apps/web/src/lib/researchCandidate.ts` — internal research candidate
- `apps/web/src/lib/researchProjection.ts` — ResearchProjection type + constructor + key-set assertion
- `apps/web/src/lib/server/researchRepository.ts` — sibling interface + Postgres impl
- `apps/web/src/lib/server/fixtureResearchRepository.ts` — fixture impl + 7 research grains
- `apps/web/test/researchProjection.test.ts` — the seven test groups
- `docs/product/reports/V1_TICKET_7A_REPORT.md` — this report

Untouched: the entire `/board` route + `BoardProjection` (byte-identical), the serialization
audit, `src/evidence`, the engine, authorities, thresholds, the gate, writers, and templates.
No migration, no hosted write, no credit spend, no route, no component.

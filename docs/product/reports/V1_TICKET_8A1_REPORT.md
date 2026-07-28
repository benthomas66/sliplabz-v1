# V1-8a1 — Board Read-Model Inventory — Report (STEP 0 HALT / OUTCOME A)

**Date:** 2026-07-28
**Outcome:** **A — STEP 0 HALT.** Mandatory information-band fields are classified
(ii) computed-but-discarded / (iii) not-computed, and field 8 (source identity)
falls inside the paid boundary. No implementation occurred. Nothing committed,
rendered, or changed beyond this report file.

## Starting state (verified)
- `git rev-parse HEAD` → `bc7077e7a75321dca8773092a3a37971294181ce` (expected V1-GOV-5). ✓
- `git log --oneline -3` → `bc7077e` / `c872696` / `003539f`.
- `git status --short --untracked-files=all` → only the two `docs/research/` founder
  files untracked (left untouched).

## The controlling rule

Amendment 2 (BINDING): a Board reader must read values **"already committed and
RETAINED IN STORAGE"** and perform **"NO new statistical, streak, difference,
consensus, coverage, provenance, freshness, or evidence computation."** The
HALT CONDITION: *"Computed but discarded before Board reach is NOT available for
this ticket and triggers the same halt as not computed."* Amendment 4 (BINDING)
additionally prohibits reconstructing difference (`avg − line`) and streak.

So the test per field is: **is the value persisted in storage and readable by a
projection/reshaping reader, or is it (re)computed at read time?**

## STEP 0 inventory — every field, with exact source

| # | Field | Class | Exact source (module · function · type field) | Persisted? |
|---|---|---|---|---|
| 1 | per-window ordered outcome series (Evidence Strip) | **(ii)** | `src/evidence/driver/readModelInputBuilder.ts:240-245` `readHistoricalGamesForPlayerMarket()` → `computeThresholdWindow('L5'…)`; V1-7b `researchRepository.readSeries` reads raw per-game rows and derives the threshold-relative outcome at read time | **NO** — raw per-game rows persisted; the windowed threshold-relative outcome sequence is computed |
| 2 | per-window counts (above/below/push) | **(ii/iii)** | `src/computation/thresholdWindows.ts` `computeThresholdWindow` → `ThresholdWindowResult.count_above/count_equal/count_below` (computed read-time, `readModelInputBuilder.ts:241`). Persisted analog `real_line_windows.over_count/under_count/push_count` is **EMPTY** (GAP-1) and is real-line, not threshold | **NO** |
| 3 | eligible sample size (`eligible_n`) | **(ii/iii)** | `ThresholdWindowResult.eligible_n` (computed). `real_line_windows.eligible_n` **EMPTY** (GAP-1). Board reader `apps/web/src/lib/server/boardRepository.ts:133` states verbatim: *"`l10_eligible_n` is not persisted on the evidence row, so it is set to 0 here."* | **NO** |
| 4 | window average value | **(ii/iii)** | `ThresholdWindowResult.avg_stat_value` (computed, `thresholdWindows.ts`). `real_line_windows.avg_stat_value` **EMPTY** (GAP-1) | **NO** |
| 5 | difference from evaluated line | **(ii/iii)** | `ThresholdWindowResult.avg_minus_threshold` (computed). Not persisted. `real_line_windows.avg_margin` is vs the REAL closing line (not the evaluated line) and **EMPTY**. Amendment 4 forbids `avg − line` reconstruction | **NO** |
| 6 | current factual streak (direction + length) | **(ii/iii)** | `ThresholdWindowResult.current_streak_direction/current_streak_length` (computed, `thresholdWindows.ts`). `real_line_windows.current_streak_*` **EMPTY**. Amendment 4 forbids streak reconstruction | **NO** |
| 7 | coverage state (per window) | **(ii/iii)** | `ThresholdWindowResult.coverage_label` (computed). `real_line_windows.coverage_label` **EMPTY** (GAP-1) | **NO** |
| 8 | grain-level source identity list | **PAID-BOUNDARY** | Actual per-grain sources live only in `src/computation/types.ts` `BookDetailResult.offerings` → `CurrentOffering.bookmaker_key` — the **paid** field ("Per-book offerings. Paid-only; the capability filter strips this before serialization for free tier", `types.ts:332`). `current_market_rows` retains only `eligible_sportsbook_count` (a **count**) and `point_distribution` (point→count) — **not** an identity list | see Amendment 1 |
| 9 | consensus distribution | **(i)** | `current_market_rows`: `point_distribution jsonb NOT NULL`, `line_consensus_point`, `line_min_point`, `line_max_point`, `eligible_sportsbook_count` — persisted; the Board already `LEFT JOIN LATERAL current_market_rows` (`boardRepository.ts:65-72`) | **YES** |
| 10 | freshness (`line_observed_at` + state) | **(i)** | `line_observed_at` already derived + read on the Board path (V1-6d LATERAL, `boardRepository.ts`); `freshness_state` persisted on `current_market_rows` | **YES** |
| 11 | provenance (`includes_backfilled_historical`) | **(i)** | `evidence_profiles.includes_backfilled_historical` — persisted; already read (`rowToCandidate` → `provenance_marker`) | **YES** |

## The field(s) triggering the halt

**Mandatory fields 1, 2, 3, 4, 5, 6, 7 are (ii)/(iii)** — computed at read time by
the committed builder (`computeThresholdWindow`, `readModelInputBuilder.ts:241-245`)
and **not retained in storage**. The only table that would persist these window
aggregates — `real_line_windows` — is **empty on hosted** per **GAP-1** (OPEN:
*"no committed driver performs first-pass population… remains empty on hosted"*),
and it is a **real-line** window (over/under vs the actual closing line), not the
**threshold-relative** window (vs the evaluated line) the Board information band
requires.

These are **not** the expected permitted gaps: G1 (filtered windows) and G2 (H2H)
belong to V1-8d and are far narrower. The gap here is the **entire window-aggregate
layer for every window (L5/L10/L20/season)** plus the windowed Evidence-Strip
series — the core of the information band.

## AMENDMENT 1 determination (paid boundary — field 8)

The Board field "source identity list" means **item 2: grain-level ACTUAL identity**
(sources that actually supplied an offering for this grain). The only place that
factual per-grain source identity exists is inside `BookDetailResult.offerings`
(`CurrentOffering.bookmaker_key`) — the **paid** structure the projection must drop.
`current_market_rows` retains only a **count** (`eligible_sportsbook_count`) and a
point distribution (point→count), neither of which is an identity list. There is
**no committed, retained grain-level source-identity list outside the paid
`book_detail.offerings`.** Per Amendment 1, this **triggers a halt and a request
for a paid-boundary ruling.** I did not substitute the allowlist, infer from
configuration, inspect paid offering values, or derive a list from paid detail.

## Why these values cannot be projected under this ticket

- They are not retained in storage; the Board reader would have to **run
  `computeThresholdWindow`** (statistical/streak/coverage computation) — forbidden
  by Amendment 2, and per-row it is the forbidden N+1.
- Reconstructing difference/streak from ingredients is forbidden by Amendment 4.
- The persisted home (`real_line_windows`) is unpopulated (GAP-1) and is the wrong
  window family (real-line, not threshold).
- Source identity (field 8) would require crossing the paid boundary (Amendment 1).

Resolving this is a **data-plumbing / authority decision above this ticket**, e.g.:
(a) authorize a first-pass population driver for a threshold-relative persisted
window store (relates to GAP-1); or (b) authorize the Board to reuse the committed
read-model builder despite Amendment 2 (with an N+1-safe batch form); or (c) narrow
the V1-8a2 information band to the fields that ARE retained (consensus distribution,
freshness, provenance) plus the H2H unavailable marker; and (d) rule on the field-8
paid boundary.

## Confirmation — no implementation occurred
No projection change, no reader change, no test change, no UI/route/component, no
shared-reader change, and no change intended to simulate availability. The only
worktree change is this report file. The frozen method authorities, the Evidence
Grammar, the Parity Spec, `src/evidence`, the engine, the writers, the Research
View, and every committed shared reader are untouched.

## `git status --short --untracked-files=all` (classified)
```
?? docs/product/reports/V1_TICKET_8A1_REPORT.md   ← this halt report (the only authorized change)
?? docs/research/PICKFINDER_WNBA_AUDIT.md          ← founder-supplied (V1-GOV-2) — untouched
?? docs/research/PickFinder_WNBA_Audit_Clusters_1-6_Consolidated.md ← founder-supplied — untouched
```

## Requested governor rulings
1. **Fields 1–7 (information-band statistics + windowed series):** how to make them
   available as retained storage the Board may read by projection only — populate a
   threshold-relative persisted window store (GAP-1), or authorize an N+1-safe reuse
   of the committed builder, or narrow the V1-8a2 band to the retained fields.
2. **Field 8 (grain-level source identity):** paid-boundary ruling — authorize a new
   free-tier grain-level source list persisted OUTSIDE `book_detail.offerings`, or
   drop the field.

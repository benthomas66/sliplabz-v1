# V1-8a1 (REISSUE) — Board projection against the persisted contract — IMPL REPORT

**Status: COMPLETE. The Parity Spec §1.3 information band is projected from the
V1-8a0/V1-8a0a persisted contract. Nothing rendered, nothing committed. No score,
no internal identity on the Board. Research View byte-identical.**

**Starting state (verified):** branch `main`, HEAD
`a3c28f376f34250b2cdc9604a8f95296062c7a90` (match). Untracked at start: the two
founder `docs/research/` files + `docs/product/reports/V1_TICKET_OP_2_REPORT.md`
(left, per founder ruling). `git log --oneline -3`: `a3c28f3` · `f274d5f` · `6f39f48`.

This report is `V1_TICKET_8A1_IMPL_REPORT.md`; the committed halt report
`V1_TICKET_8A1_REPORT.md` is UNTOUCHED (an input, not a subject).

---

## STEP 0 — the three determinations

### (1) FIELD AVAILABILITY — every field is now (i) available; no HALT

The original halt report classified fields 1–7 as (ii) computed-but-discarded and
field 8 as paid-boundary. V1-8a0/V1-8a0a persisted them (certified by V1-OP-2).
Exact retained source on the Board read path:

| # | Field | Now | Persisted source (quoted) |
|---|---|---|---|
| 1 | per-window ordered outcome series | **(i)** | `evidence_profile_series` — `ordinal, game_date_utc, opponent_label, is_home, stat_value, evaluated_line, position_kind, outcome, eligibility_state, minutes_status, includes_backfilled_historical` (migration `20260728130000`) read by the committed `readEvidenceInputBundlesBatched` (`src/evidence/v2/readEvidenceInputs.ts`) → `PersistedSeriesPosition` |
| 2 | counts (above/equal/below) | **(i)** | `evidence_profile_window_aggregates.count_above/count_equal/count_below` → `PersistedWindowAggregate` |
| 3 | eligible_n | **(i)** | `evidence_profile_window_aggregates.eligible_n` |
| 4 | average | **(i)** | `evidence_profile_window_aggregates.avg_stat_value` |
| 5 | difference from line | **(i)** | `evidence_profile_window_aggregates.avg_minus_threshold` — **persisted; projected, never `average − line`** |
| 6 | current factual streak | **(i)** | `evidence_profile_window_aggregates.current_streak_direction, current_streak_length` — **persisted; projected, never reconstructed** |
| 7 | coverage state | **(i)** | `evidence_profile_window_aggregates.coverage_label` |
| 8 | grain-level source identity | **(i)** | `evidence_profile_source_identities.normalized_source_id, display_name` (names/IDs only — V1-8a0 approved exception) → `PersistedEvidenceInputBundle.source_identities` |
| 9 | consensus distribution / range / count | **(i)** | `current_market_rows.point_distribution, line_consensus_point, line_min_point, line_max_point, eligible_sportsbook_count` — board query LATERAL (`boardRepository.ts`) |
| 10 | freshness | **(i)** | Grammar §2.6 badge = STATE + elapsed time. STATE = `current_market_rows.freshness_state`; elapsed = **`display_age_seconds`**, the BOUNDED duration computed by the committed V1-6d serving gate (`evaluateV2ServingGate` → `display_age_seconds`, `serve_now − line_observed_at`, ≤ horizon for a served row). **`line_observed_at` itself stays SERVER-SIDE** — a FORBIDDEN projection key (V1-6d). The projection carries the state + the duration, never the timestamp (governor REVISE) |
| 11 | provenance | **(i)** | `evidence_profiles.includes_backfilled_historical` (compact renderer `provenance_marker`) + per-window `includes_backfilled_historical` |
| — | **H2H** | **carried unavailable** | G2 / V1-8d — explicit typed-unavailable marker `{status:'unavailable', reason:'requires_h2h_window_g2'}` (exemption unchanged) |

Authorities: Parity Spec §1.3 (band inventory/order); Grammar §2.2 (Strip), §2.8
(Sample), §7 (compact counts); Method §D.2/§D.4/§G (labels/caps/disclosure, via the
committed renderer); DR-19 (score forbidden).

### (2) SERIES PAYLOAD SHAPE — one series per row; SZN's full span is authority-required

Parity Spec §1.3 row #29 makes **SZN a "Season Strip + counts + average"** — a full
per-position Strip over the whole season span. Rows #24 make L5/L10/L20 Strips over
tail spans. Under the display-membership rule (V1-8a0a report) each window's strip
is the span from the Nth-most-recent **eligible** position through the most recent,
inclusive of interleaved ineligible positions.

**Decision:** carry **ONE** ordered `series` per row (the full season series) plus a
per-window `{compact_counts, sample{eligible_n,coverage}, streak, average, difference}`.
L5/L10/L20 strips are tail sub-spans of the SAME single series; V1-8a2 derives each
span from `series` + the window's `eligible_n` (deterministic under the rule). **No
positions are duplicated across windows.**

- Positions per typical row: **~21–25** (the certified production series spanned 21–25
  positions per profile, V1-OP-2).
- 50-row board: ~50 × 23 ≈ **~1,150 position objects** (each ~11 small scalar fields).
- **Tradeoff, stated:** the payload is dominated by the season series. A narrower
  carry (e.g. only the L20 span + season counts) **cannot reproduce the SZN Strip
  exactly** (§1.3 #29 requires per-position season cells) → that would HALT. But the
  *largest* option — four separate per-window strips duplicating overlapping positions
  4× — is **rejected**: one shared series feeds all four spans. So the chosen shape is
  the minimal one that satisfies §1.3 without duplication. STRK/AVG/DIFF are carried
  **per window** (all persisted per-window in `window_aggregates`); V1-8a2 selects which
  window feeds each singular band column — this ticket projects the persisted values,
  not the column layout.

### (3) QUERY SHAPE — 4 bounded queries, join key `evidence_profile_id`, no N+1

- **Base query:** 1 (`buildBoardQuery` — extended to select `ep.evidence_profile_id`
  and the `current_market_rows` band fields via the existing LATERAL).
- **Child tables:** 3 (window aggregates · source identities · series) via the
  committed `readEvidenceInputBundlesBatched(tx, ids)` — each an `ANY($ids)`, keyed by
  `evidence_profile_id`.
- **Total for a 50-row board: 4 bounded queries. Bounded as rows grow** (the child
  reads are single `ANY`-over-id-set queries, independent of row count).
- **Join key back to rows:** `evidence_profile_id` (server-side; a FORBIDDEN projection
  key). No committed shared reader or the re-frozen contract was modified (the batched
  reader is *consumed* unchanged).

---

## SCOPE A — extended `BoardProjection`

`band: BoardBand` added (always present; discriminated). New nested cell types
(`WindowCell`, `WindowSample`, `WindowStreak`, `SeriesCell`, `H2HUnavailable`,
`SourceIdentityCell`, `ConsensusCell`, `ConsensusPoint`, `FreshnessCell`). Construction
is a **newly-constructed object literal built FIELD-BY-FIELD** — no spread of a raw
row/bundle, no spread-then-delete, no `omit`, no cast (`toSeriesCell` names every field
and never reads `internal_game_id`). Compact counts via `compactCounts()` (Grammar §7:
`A-B` / `A-B-P`, never %/slash/rate). DIFF = persisted `avg_minus_threshold`; STRK =
persisted `current_streak_direction/length` — neither derived. Band order matches the
Parity Spec (L5·L10·L20·H2H·STRK·AVG·DIFF·SZN). **DR-19 unchanged:** `composite_score`
and the four components remain absent from the type and on the forbidden list; ranking
still uses full precision on the internal candidate before projection.

The information band is discriminated:
`{status:'unavailable_not_persisted'}` (legacy) | `{status:'available', windows{L5,L10,L20,season}, series[], h2h, sources[], source_count, consensus, freshness}`.

---

## SCOPE B — nested key-set enforcement

`assertBoardProjectionKeySet` now recurses: `assertExactKeys` enforces an EXACT allowed
key set (and the forbidden-key list) at every level — the projection, `band`, each
window cell + its `sample`/`streak`, every `series[i]`, `h2h`, every `sources[i]`,
`consensus` + each `distribution[i]`, and `freshness`. It uses `Object.keys` +
`hasOwnProperty` (never TypeScript typing or serialization). A forbidden or unexpected
key smuggled into ANY nested object throws (test group 9, both a window cell and a
consensus cell). The existing top-level checks + conditional cap/provenance correctness
are retained (extended, not replaced).

---

## SCOPE C — Amendment 21 containment (mechanical)

`internal_game_id` and `evidence_profile_id` are on `BOARD_PROJECTION_FORBIDDEN_KEYS`
and enforced at every nested level. Mechanical proofs (not citation):
- **Guard rejects it:** test group 3 puts `internal_game_id` on a `band.series[0]`
  object and `assertBoardProjectionKeySet` **throws**.
- **Real projection drops it:** every fixture series position carries the canary
  `internal_game_id` = `ZZQXFIXTUREGAME9911CANARY` (server-side); a real
  `constructBoardProjection` yields series cells with **no** `internal_game_id` key and
  `JSON.stringify(projection)` contains neither the canary value nor the key, nor
  `evidence_profile_id`/`epid-`.
- **Field-by-field build:** `toSeriesCell` constructs each cell naming 11 fields and
  never reads `internal_game_id` — no generic spread can carry it.
- **Serialization canary:** `BoardTable` is a `'use client'` component receiving the
  full `BoardProjection[]`, so the whole band crosses into the RSC flight. The audit
  proves the band IS in the flight (positive control `requires_h2h_window_g2`) while the
  `internal_game_id` canary is **absent** from the HTML, flight, client bundles, and
  server log.

---

## SCOPE D — legacy vs genuine zero-sample (distinguishable typed states)

- **Legacy** (107 pre-existing v2 profiles, no persisted bundle): `bundle` absent →
  `band = {status:'unavailable_not_persisted'}`. No windows, no zeros, no empty arrays,
  no read-time reconstruction. (Fixture Delta.)
- **Genuine zero-sample** (bundle persisted, no eligible observations):
  `band.status='available'` with `windows.season.sample = {eligible_n:0, coverage:'no_data'}`
  and `compact_counts:'0-0'` (real zeros). (Fixture Charlie.)
- Test group 8 asserts the two are different typed states and neither invents values.

---

## GOVERNOR REVISE — Freshness Badge §2.6 elapsed time

Grammar §2.6 requires the Freshness Badge to carry STATE **and** elapsed time. The
`FreshnessCell` now carries `{state, display_age_seconds}`. `display_age_seconds` is
the BOUNDED duration ALREADY computed by the committed V1-6d serving gate
(`evaluateV2ServingGate`): `boardService` captures the gate output per served
candidate and passes `gate.display_age_seconds` into `constructBoardProjection` →
`buildBand` → `freshness`. It is a DURATION (seconds), not `line_observed_at` — which
remains server-side and on the forbidden-key list (enforced at the nested
`freshness` level and everywhere). `FRESHNESS_KEYS` extended to
`['state','display_age_seconds']`; the nested assertion enforces the new key set.

Test (`boardBand.test.ts` "REVISE (§2.6)"): for every served available-band row,
`freshness.display_age_seconds` is present, is a bounded non-negative duration
(`[0, horizon]`), traces EXACTLY to `evaluateV2ServingGate(...).display_age_seconds`
computed with the same `serve_now` (not recomputed in the projection), and is not an
ISO timestamp; and `line_observed_at` (key and raw value) is absent from the
projection. The serialization audit's `/board` test additionally asserts the
`line_observed_at` key never appears in the served body.

## SCOPE E — serialization audit

Extended: `DISTINCTIVE_INTERNAL_GAME_ID` added to the `PROHIBITED` canary set (checked
across initial HTML incl. `<script>`, the RSC flight, `RSC:1` navigation flight,
`/design-preview` + variants, client bundles, and the server log). A new `/board` test
asserts the band reaches the flight (positive control) AND the canary does not. **All
prior canaries INTACT** — full-precision score digits, all four components (absent by
type), paid book (`ZZQXFIXTUREBOOK7788`), paid price (`424242`), secrets, `new Pool(`.
**Nothing weakened.** Audit result: build ✓, 15/15.

---

## Test accounting (per group, full)

| group | evidence | command | exit | pass | fail | skip | dur |
|---|---|---|---|---|---|---|---|
| 1 source tracing + counts | `boardBand.test.ts` G1 | (app fast) | 0 | ✓ | 0 | 0 | — |
| 2 DR-19 UNMODIFIED + smuggle | `board.test.ts` (14, byte-unchanged) + `boardBand` G9 | (app fast) | 0 | ✓ | 0 | 0 | — |
| 3 Amendment 21 | `boardBand` G3 + audit canary | (app fast + audit) | 0 | ✓ | 0 | 0 | — |
| 4 Grammar §7 (no %/slash/rate) | `boardBand` G4 | (app fast) | 0 | ✓ | 0 | 0 | — |
| 5 STRK/AVG/DIFF persisted | `boardBand` G5 (DIFF 7.7 ≠ avg−line 0.8) | (app fast) | 0 | ✓ | 0 | 0 | — |
| 6 H2H typed-unavailable | `boardBand` G6 | (app fast) | 0 | ✓ | 0 | 0 | — |
| 7 strip spans (interleaved DNP) | `boardBand` G7 | (app fast) | 0 | ✓ | 0 | 0 | — |
| 8 legacy vs zero-sample | `boardBand` G8 | (app fast) | 0 | ✓ | 0 | 0 | — |
| 9 nested key-set | `boardBand` G9 | (app fast) | 0 | ✓ | 0 | 0 | — |
| 10 serialization audit | `npm run audit` | 0 | 15 | 0 | 0 | build ✓ +~7s |
| 11 Research View untouched | `git diff` empty (below); RV tests unmodified | (app fast) | 0 | ✓ | 0 | 0 | — |
| 12 suites | see below | — | — | — | — | — |

**Suite accounting:**

| suite | command | exit | pass | fail | skip | dur |
|---|---|---|---|---|---|---|
| root typecheck | `tsc --noEmit` | 0 | — | 0 | — | ~1s |
| app typecheck | `apps/web tsc --noEmit` | 0 | — | 0 | — | ~1s |
| root unit | `node --test tests/** (excl integration)` | 0 | 578 | 0 | 0 | 0.9s |
| integration (serial) | `npm run test:integration` | 0 | 143 | 0 | 0 | ~40s |
| app fast | `apps/web npm test` (DB up) | 0 | 68 | 0 | 0 | ~1s |
| serialization audit | `apps/web npm run audit` | 0 | 15 | 0 | 0 | build ✓ +~7s |

Deltas: app fast 55→68 (+13 `boardBand`, incl. the §2.6 REVISE test); audit 14→15 (+1
band containment, extended with the `line_observed_at`-key-absence check). The 14
committed `board.test.ts` tests (incl. the DR-19 composite_score-forbidden test) pass
**UNMODIFIED**. No suite weakened. Root typecheck / root unit (578) / integration
(143) are unaffected by this apps/web-only change and remain green.

---

## Research View byte-identity (test group 11)

`git diff` is EMPTY on the Research View route (`apps/web/app/research/**`),
`researchProjection.ts`, `researchCandidate.ts`, `researchFreshness.ts`,
`server/researchRepository.ts`, `server/fixtureResearchRepository.ts`, and the RV tests
(`researchProjection.test.ts`, `researchView.test.ts`); those tests run UNMODIFIED in
the app fast suite. No component, CSS, route, or page changed — this ticket renders
nothing.

---

## `git status --short --untracked-files=all` — every path classified

```
 M apps/web/src/lib/boardProjection.ts           Scope A/B/C: band type + field-by-field construction + nested assertion
 M apps/web/src/lib/rankedCandidate.ts            server-side band inputs (bundle/consensus/evidence_profile_id), never projected
 M apps/web/src/lib/server/boardRepository.ts      base query + 3-query batched bundle (4 total, no N+1)
 M apps/web/src/lib/server/boardService.ts          REVISE §2.6: capture gate display_age per served row → freshness cell
 M apps/web/src/lib/server/fixtureRepository.ts    fixtures gain bundles + the internal_game_id canary + a zero-sample + a legacy row
 M apps/web/test-audit/serialization.test.ts       Scope E: internal_game_id canary + band positive control (prior canaries intact)
?? apps/web/test/boardBand.test.ts                 test groups 1,3,4,5,6,7,8,9 + band copy-safety
?? docs/product/reports/V1_TICKET_8A1_IMPL_REPORT.md  this report
?? docs/product/reports/V1_TICKET_OP_2_REPORT.md      founder ruling: rides a later commit — LEFT
?? docs/research/PICKFINDER_WNBA_AUDIT.md             founder file — untouched
?? docs/research/PickFinder_WNBA_Audit_Clusters_1-6_Consolidated.md  founder file — untouched
```

No `src/`, engine, `computeThresholdWindow`, thresholds, gate, writer, Grammar, Parity
Spec, frozen-authority, migration, or hosted change. No React component/CSS/route/page
change. Research View byte-identical. HEAD unchanged (`a3c28f3`); nothing staged;
nothing committed.

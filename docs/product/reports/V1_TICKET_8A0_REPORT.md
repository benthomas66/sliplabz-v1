# V1-8a0 — Persist Profile Evidence Inputs — Report (STEP 0 HALT)

**Date:** 2026-07-28
**Outcome:** **STEP 0 HALT — triggered by Determination (2).** The per-game
display enrichment the series rows require (opponent, home/away, DNP/ineligible)
is not obtainable at population time from committed `src/` code; obtaining it
would require **new read work in `src/`**, which STEP 0(2) forbids building.
No migration, writer, schema, or test change was made. Nothing committed. No
method change.

## Starting state (verified)
- `git rev-parse HEAD` → `bc7077e7a75321dca8773092a3a37971294181ce` ✓
- `git log --oneline -3` → `bc7077e` / `c872696` / `003539f`
- Untracked: `docs/product/reports/V1_TICKET_8A1_REPORT.md` + the two
  `docs/research/` founder files (all left untouched).

Authority note: the FROZEN method authority (`EVIDENCE_PROFILE_METHOD_V1.md`)
governs the engine/computation quoted below (READ ONLY). The persistence
decisions are governed by this ticket's STEP 0 and Scope A. No computation,
threshold, classification, score, or method contract is changed by this report.

---

## Determination (1) — WHAT THE ENGINE ACTUALLY RECEIVES

**Per-game input & consumption.** The committed historical reader returns
`ThresholdWindowGame[]`, and `computeThresholdWindow` consumes exactly that:

`src/evidence/driver/readModelInputBuilder.ts:494` `readHistoricalGamesForPlayerMarket`
returns rows of `{ game_date_utc, player_stat_value, is_backfilled_historical }`
(three fields only). `src/computation/thresholdWindows.ts:38`:
```ts
export function computeThresholdWindow(
  window_type, threshold, games_reverse_chron: ReadonlyArray<ThresholdWindowGame>
): ThresholdWindowResult {
  ...
  let count_above = 0, count_equal = 0, count_below = 0;
  const values: number[] = [];
  for (const g of eligible) {
    values.push(g.player_stat_value);
    if (g.player_stat_value > threshold) count_above += 1;      // per-game outcome…
    else if (g.player_stat_value < threshold) count_below += 1; // …computed here…
    else count_equal += 1;                                       // …only to increment counters
  }
  ...
}
```

**Is the per-game outcome relative to the evaluated line retained?** **No.** The
above/below/equal comparison is computed inside the loop (lines 56–58) purely to
increment counters and the streak scan (lines 65–80). **No per-game outcome
sequence is stored** — `values[]` holds only raw stat values (for avg/median).
Once counts are produced, the per-game outcomes are discarded.

**What survives to the writer boundary today.** The **window AGGREGATES** do.
`ThresholdWindowResult` (lines 83–99) carries `count_above/count_equal/count_below`,
`eligible_n`, `avg_stat_value`, `avg_minus_threshold` (**the authoritative
difference-from-evaluated-line, already produced**), `median_*`,
`current_streak_direction/current_streak_length` (**streak, already produced**),
`coverage_label`, and `includes_backfilled_historical`. These reach the writer
inside the engine input bundle: `populateV2.ts:129`
`writeV2EvidenceProfile(tx, v2_input, result, built.audit, timing)`, and
`writerV2.ts:62` `writeV2EvidenceProfile(tx, input: EvidenceProfileInput, …)` —
where `EvidenceProfileInput.threshold_windows` holds the four `ThresholdWindowResult`s.
The **raw per-game series** (`games` array) is a local in `buildOneGrain`
(`readModelInputBuilder.ts:240`) and is **discarded before the writer**.

→ **Window aggregates are available at the writer boundary today** (persistable
by a writer/schema change with no new computation). **The per-game outcome
sequence is computed-and-discarded** (would need STEP 0(3) exposure).

---

## Determination (2) — DISPLAY ENRICHMENT AT POPULATION TIME → **HALT**

The Evidence Strip and Value Chart series rows require **opponent identity,
home/away, and DNP/ineligible state**. At population time:

- The population reader `readHistoricalGamesForPlayerMarket` returns only
  `{ game_date_utc, player_stat_value, is_backfilled_historical }` — **no
  opponent, home/away, or DNP**.
- **No `src/` read path reads** `player_game_stats.internal_opponent_team_id`,
  `is_home`, or `minutes_status`. The only `src/` matches for those columns are
  BDL **ingestion/eligibility** modules (`src/bdl/sourceHash.ts`,
  `src/bdl/eligibility.ts`, `src/bdl/types.ts`) — write-side/eligibility logic,
  **not** a series reader.
- **DNP/ineligible games are structurally absent** from `historical_line_results`
  (it stores only games with a canonical closing line AND an eligible
  `player_game_stats` row), so the population source cannot surface them.
- The reader that DOES supply this enrichment — V1-7b `readSeries` — lives in
  **`apps/web/src/lib/server/researchRepository.ts`** (app-side), **not in `src/`**
  (the population path).

→ Obtaining opponent/home-away/DNP at population time requires **new read work in
`src/`**: a new `player_game_stats` reader with a `teams` join for the opponent
label, plus a query that INCLUDES the DNP/ineligible games `historical_line_results`
omits. **STEP 0(2) is explicit: "If it requires new read work in `src/`, HALT AND
REPORT — do not build it."** This is the halt trigger.

---

## Determination (3) — THE MINIMAL TRANSPORT

- **Window aggregates:** ALREADY at the writer boundary
  (`v2_input.threshold_windows` → `writeV2EvidenceProfile`). **No interface
  extension is needed** — a writer-contract + child-schema change alone would
  persist them, with zero new computation. (STEP 0(3) is not even required for
  this part.)
- **Per-game outcome series:** the per-game outcome is computed-and-discarded
  inside `computeThresholdWindow` (Determination 1). Exposing it would be a
  STEP 0(3)-authorized interface extension (return the per-game outcomes the loop
  already computes). **But** the series also requires the Determination-(2)
  enrichment, which requires new `src/` read work.

→ The window-aggregate persistence is transportable **without any method change**.
The **series persistence is blocked** by Determination (2): its mandatory display
enrichment is unavailable in `src/` at population time and cannot be built here.

---

## Why the halt, and what a ruling must resolve

Scope A requires a **profile → series rows** child relation whose rows carry
home/away, DNP/ineligible, and outcome-relative-to-line. Two of those three
enrichment facts (opponent/home-away, DNP/ineligible) are only reachable via new
`src/` read work that STEP 0(2) forbids me from building. Persisting a series
without them would not satisfy the Strip/Value-Chart requirement the ticket
states, and inventing them is forbidden.

**Requested governor ruling — pick one:**
1. **Authorize a new committed `src/` series reader** (read-only, additive): a
   `player_game_stats` SELECT (`internal_opponent_team_id` + `teams` join,
   `is_home`, `minutes_status`) plus a DNP/ineligible-inclusive query, mirroring
   V1-7b's app-side `readSeries` but in the population path. This is new read
   work and needs your sign-off (STEP 0(2) explicitly withheld it).
2. **Split the ticket:** persist the **window aggregates** now (available at the
   writer boundary, no method change, no new read work — Determination 1/3), and
   defer the **series rows** to a follow-up that first authorizes the `src/`
   reader in option 1.
3. **Reduce the series scope** to the fields already produced at population time
   (date · stat value · outcome-relative-to-line via a STEP 0(3) exposure ·
   provenance), explicitly dropping opponent/home-away/DNP — confirm you accept a
   Strip/Value-Chart that omits opponent axis labels and DNP ghosts.

(Determinations 1 and 3 show the window-aggregate half is fully buildable within
this ticket's constraints; only the series half is blocked.)

## Confirmation — no implementation occurred
No migration, no writer change, no schema change, no `src/` reader change, no test
change, no read type, and nothing intended to simulate availability. The FROZEN
method authorities, the Evidence Grammar, the Parity Spec, `src/evidence`, the
engine, the writers, and the Research View are byte-identical and untouched. The
only worktree change is this report file.

## `git status --short --untracked-files=all` (classified)
```
?? docs/product/reports/V1_TICKET_8A0_REPORT.md   ← this halt report (only authorized change)
?? docs/product/reports/V1_TICKET_8A1_REPORT.md   ← V1-8a1's halt report (rides a later commit — untouched)
?? docs/research/PICKFINDER_WNBA_AUDIT.md          ← founder-supplied (V1-GOV-2) — untouched
?? docs/research/PickFinder_WNBA_Audit_Clusters_1-6_Consolidated.md ← founder-supplied — untouched
```

<!-- ==================================================================== -->

# V1-8a0 — IMPLEMENTATION (narrowed re-issue) — Report

**Date:** 2026-07-28
**Outcome:** COMPLETE. Persists ONLY the authoritative evidence inputs already at
the writer boundary (window aggregates + source-identity set). No per-game series
(deferred to V1-8a0a/V1-8a0b). No method change. Legacy profiles typed unavailable.
Nothing committed. (The STEP-0 halt record above is preserved as section 1.)

Authority governance: `EVIDENCE_PROFILE_METHOD_V1.md` (FROZEN, READ-ONLY) governs
the computation — unchanged. `SLIPLABZ_EVIDENCE_GRAMMAR.md` §2.2/§7 governs the
Strip/count vocabulary (informs the GAP, not the schema). The founder source-identity
ruling governs the identity set. This ticket's Scope A–E govern the persistence.

## STEP 0 — boundary verification (all fields at the writer boundary)

`writeV2EvidenceProfile(tx, input: EvidenceProfileInput, result, audit, timing)`
(`writerV2.ts:62`) receives the full input bundle. Per field:

| Field | At boundary as | Source |
|---|---|---|
| counts (above/equal/below), `eligible_n`, avg, `avg_minus_threshold`, streak dir+len, coverage, per-window provenance | authoritative `ThresholdWindowResult` | `input.threshold_windows.{L5,L10,L20,season}` (`EvidenceProfileInput`) |
| consensus distribution | authoritative | `input.current_market_row.point_distribution` / `.line_consensus` |
| freshness | authoritative | `line_observed_at` on `EvidenceProfileInputV2` (v2 CMR omits `freshness_state` — freshness-neutral) |
| population-time offering context (source identity) | authoritative | `input.current_market_row.book_detail.offerings` |
| evaluated_line (the threshold each window used) | authoritative | `input.evaluated_line` (== each `ThresholdWindowResult.threshold`) |

No field required an interface extension — **STEP 0(3) extension NOT used** (Acceptance #12 N/A).

## Scope A — schema (proven on local Docker)

Two additive child tables (`supabase/migrations/20260728120000_evidence_profile_evidence_inputs.sql`),
applied and verified on local Docker (`sliplabz_v1_4b_it`):
- `evidence_profile_window_aggregates` (20 cols) — FK `→ evidence_profiles ON DELETE CASCADE`
  (verified `confdeltype='c'`), `UNIQUE(evidence_profile_id, window_type)` (prevents duplicate
  window rows), CHECKs on `window_type`/`coverage_label`/`streak_direction`. Threshold-relative;
  `real_line_windows` NOT overloaded. **No composite score.**
- `evidence_profile_source_identities` (6 cols) — FK CASCADE, `UNIQUE(evidence_profile_id,
  normalized_source_id)` (dedup — cannot reveal per-source offer/side count). Columns:
  `normalized_source_id`, `display_name`, `ordinal` (fixed alphabetical/non-economic). A test
  asserts the table has **no** `point/price/side/market_offering_id/source_snapshot_id` column.
- **No series child table** (V1-8a0a/b own it). Migration NOT pushed to hosted.

## Scope B — writer contract & atomicity

`writerV2.ts` extended to persist the bundle **from the same `input` object** that produced
`result`, under the same `evidence_profile_id`, in the same transaction (REPLACE pattern like the
reason set). **Same-evaluation-event (enforced by test, NOT by the signature — governor REVISE):**
the windows are read from the SAME `input` that produced `result`, under the SAME
`evidence_profile_id`, in the SAME transaction. The invariant holds because the single caller
(`populateV2`) passes the very `input` it classified; the signature still accepts `input`/`result`
as INDEPENDENT parameters, so this is enforced by test, not guaranteed by construction. (A governor
ruling on restructuring the signature is pending; not changed here.) **Persistence fidelity:**
windows are inserted field-for-field (no normalize/reorder/round/
derive/enrich/omit — schema mapping only). **Atomic:** all inserts run inside the caller's
`withTransaction`; a failure after the profile insert rolls everything back.

## Scope C — legacy compatibility

`readEvidenceInputs.ts` returns a typed discriminated state:
`{status:'available'; bundle} | {status:'unavailable_not_persisted'}`. A legacy profile (no child
rows) → `unavailable_not_persisted` (no zeros, no empty arrays, no read-time reconstruction). A
repopulated profile whose windows are genuinely empty (`eligible_n=0`) → `available` with real
zeros. Different facts, different discriminants (tested).

**Repopulation inventory (NOT executed here):** the 99 existing v2 profiles gain a bundle when
their grains are next repopulated by the committed v2 populator (`runEvidencePopulatorV2`, the
V1-OP-1 poll→aggregate→populate cycle), which now calls the extended writer. Coverage is verifiable
by `COUNT` of profiles WITH `evidence_profile_window_aggregates` rows vs total v2 profiles (a
bounded query). Governed repopulation is a later authorized ticket; no hosted write/credit spend here.

## Scope D — minimal read support

`readEvidenceInputBundle` (2 bounded queries) and `readEvidenceInputBundlesBatched`
(exactly 2 queries via `= ANY($1::uuid[])` — **no N+1**). Reads ONLY the two child tables; a test
asserts the reader source references neither `historical_line_results`, `player_game_stats`,
`current_market_rows`, `market_offerings`, nor `computeThresholdWindow`.

## Scope E — GAP register + Amendment 15

`docs/product/V1_OPEN_GAPS.md` gains **GAP-18** (Evidence Strip positional completeness not yet
achievable; opponent/home-away/DNP unavailable in `src/` at population time; assigned V1-8a0a/V1-8a0b;
blocks full Board Strip; Grammar unchanged and not reinterpreted).

**Amendment 15 (founder intent, recorded verbatim):**
> Expected future compatibility adaptation:
> Research View may change ONLY its import ownership so that it consumes the shared src-owned historical-series reader.
> No behavioural, computational, semantic, SQL, projection, UI, or evidence change is authorized.
> The compatibility adaptation is architectural ownership only.
> It requires explicit governor authorization inside V1-8a0b.

## Ten acceptance proofs

1. **Engine value-equivalence** — the writer change does not touch `computeEvidenceProfileV2`; the committed §F worked-example / v2-regression tests (`tests/evidence/*`) run UNMODIFIED and pass within the 577-pass unit suite. The integration test also asserts the persisted classification equals the freshly-computed `result.profile.classification`.
2. **Same evaluation event** — proven by construction (single `input`) + test (`persisted classification === computed classification` for the same bundle).
3. **Persistence fidelity (independent)** — test asserts each persisted window field (`eligible_n`, all three counts, avg, `avg_minus_threshold`, median, streak dir/len, coverage, provenance, evaluated_line) is identical to `input.threshold_windows[w]` — no rounding/derivation.
4. **Atomicity** — a write-then-throw inside `withTransaction` leaves 0 profiles AND 0 window/source rows for the grain.
5. **Read without recompute** — the reader touches only the two child tables (asserted by source scan); no history/market read.
6. **Legacy typed-unavailable vs zero-sample** — legacy → `unavailable_not_persisted` (no bundle); zero-sample → `available` with real zeros; discriminants differ.
7. **Source identity names/IDs only, non-joinable** — dedup/alphabetical; keys exactly `{normalized_source_id, display_name}`; no paid canary (`24.5`, `-137137`, `424242`, `HANDLE`, `over_price`, `market_offering_id`) in the bundle or the table columns → cannot be joined client-side to a paid offering row.
8. **Source-identity immutability (Amendment 14)** — populate P (grain G) {acme,betco}; the offering context for P's OWN grain then changes (a fresh derivation would give {gamma,delta}) WITHOUT repopulating P; re-read P → identity set IDENTICAL (`['acme','betco']`). An additional cross-grain case (persist a different grain Q {newbook}) also leaves P unchanged. The free surface reflects the historical evaluation, not today's market.
9. **No N+1** — batched reader returns 4 profiles' states from 2 queries.
10. **Frozen authorities byte-identical; Grammar & Parity Spec unchanged; Research View unchanged** — `git diff` empty for all four docs and for `apps/web/` (no Research View change needed → no HALT).

Nested allowlist: `assertSourceIdentityKeySet` (exact keys, forbidden paid/handle keys throw).
Canaries: unit + integration assert paid values/handles cannot enter the identity set; the app-side
serialization audit's prior canaries are **intact (14/14)** — this ticket added no browser-visible response.

## Full test accounting

| Group | Command | Exit | pass | fail | skipped | duration |
|---|---|---|---|---|---|---|
| root typecheck | `npx tsc --noEmit -p tsconfig.json` | 0 | — | — | — | 1.40s |
| source-identity unit | `node --import tsx --test tests/evidence/v1_8a0_source_identity.test.ts` | 0 | 4 | 0 | 0 | ~1ms |
| root unit suite | `node --import tsx --test --test-concurrency=1 tests/{bdl,computation,evidence,explanation,identity,lines,odds,seed,migrations}/*.test.ts` | 0 | 577 | 0 | 0 | 4913.9ms |
| V1-8a0 integration | `node --import tsx --test --test-concurrency=1 tests/integration/v1_8a0_persist_evidence_inputs.integration.test.ts` | 0 | 7 | 0 | 0 | ~1.2s |
| full serial integration | `node --import tsx --test --test-concurrency=1 tests/integration/*.test.ts` | 0 | 137 | 0 | 0 | ~34.7s |
| app fast tests | `(apps/web) npm test` | 0 | 55 | 0 | 0 | 812.0ms |
| serialization audit | `(apps/web) npm run audit` | 0 | 14 | 0 | 0 | 7431.9ms |

All green; none weakened (unit 573→577, integration 130→137 are additive; app/audit unchanged).

## `git status --short --untracked-files=all` (implementation, classified)
```
 M docs/product/V1_OPEN_GAPS.md                                       ← Scope E: GAP-18
 M src/evidence/v2/writerV2.ts                                        ← Scope B: persist bundle (writer-contract change)
?? supabase/migrations/20260728120000_evidence_profile_evidence_inputs.sql ← Scope A migration (local Docker only)
?? src/evidence/v2/sourceIdentity.ts                                 ← source-identity helper + nested allowlist
?? src/evidence/v2/readEvidenceInputs.ts                             ← Scope D: minimal typed reader
?? tests/evidence/v1_8a0_source_identity.test.ts                     ← unit tests
?? tests/integration/v1_8a0_persist_evidence_inputs.integration.test.ts ← integration tests
?? docs/product/reports/V1_TICKET_8A0_REPORT.md                      ← this report (halt + implementation)
?? docs/product/reports/V1_TICKET_8A1_REPORT.md                      ← V1-8a1 halt report — untouched
?? docs/research/PICKFINDER_WNBA_AUDIT.md                            ← founder-supplied (V1-GOV-2) — untouched
?? docs/research/PickFinder_WNBA_Audit_Clusters_1-6_Consolidated.md  ← founder-supplied — untouched
```
No React/CSS/route/UI, no series, no `real_line_windows` overload, no method change, no hosted write,
no migration push. `src/evidence` change is the authorized writer-contract extension only.

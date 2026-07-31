# V1 Relight Path — what has to happen, in what order, for the Board to serve again

**Governance instrument.** Surfaced by the V1-OP-4c review (GAP-28). Records the
diagnosis of why the Board is dark and the ordered path to a serving Board.
Committed so this does not live only in chat. Referenced by **GAP-28**.

Authored 2026-07-31. Hosted-verified (read-only).

---

## 1. Reconciled diagnosis — the seed ran out; nothing lapsed

An earlier inference ("the scheduler lapsed ~07-12") was **WRONG**. Hosted data:

| Pipeline | State (2026-07-31) | Evidence |
|---|---|---|
| **Current-market poll (Odds API)** | **RUNNING** | poll_cycles completed at 20:41/21:47/22:59 tonight (68 profiles at 20:41); freshest `current_poll` snapshot 22:59; 102 profiles in last 24h |
| **Box scores + finalization (BDL)** | **FROZEN** at games dated 07-12; last `player_game_stats` written **07-15** | 31 past-tip games stuck `scheduled`; newest game with pgs = 07-12 |
| **Closing lines → `historical_line_results`** | **FROZEN** at games dated 07-12; last hlr computed **07-15** | newest game with usable hlr = 07-12 |

**Conclusion: nothing broke. 07-12 is the boundary of the SEED, not of a lapse.**
The current-market poll is the only *automated* forward pipeline and it has run
continuously. The two backfill-dependent pipelines — BDL box scores and
closing-line hlr — are **operator-run one-shots** that last executed ~07-15
(covering through 07-12) and were never repeated. This is GAP-3
("seed + stats backfills are one-shots") seen from the serving side.

Consequence: the ~102 profiles/day the poll still generates are built on
historical windows frozen at 07-12 — increasingly stale. The V1-OP-4c gate now
correctly suppresses on exactly this (engine coverage behind), which is why the
Board is honestly dark rather than confidently wrong.

## 2. What a single game needs to be "covered" (three legs)

For a game to contribute a usable evidence observation, THREE independent
pipelines must each produce for it:

1. **Box scores + finalization** → `player_game_stats`. Owner: BDL. Currently
   operator-backfill-only; not running forward. **This is V1-OP-5a's leg.**
2. **Closing line** → `source_closing_quotes` → `canonical_closing_points`.
   Currently written ONLY by the historical Odds API seed path
   (`persistHistoricalSnapshot` → `canonicalClosingPointsForSeed`); no forward
   producer. Requires the game to be odds_api-mapped.
3. **hlr computed** from (2) ⋈ (1) → `historical_line_results`. Currently written
   only by the operator populator and `recomputationWriter` (corrections); an
   initial pgs landing creates none.

The evidence engine reads leg 3 (`readModelInputBuilder` →
`readHistoricalGamesForPlayerMarket`, `coverage_state IN ('complete','single_book')`),
which V1-OP-4c mirrors as the suppression trigger.

## 3. The ordered relight path

- **Phase 0 — Confirm forward polling (DONE).** The poll cycle is running
  (§1). No restart needed. This maps forward events (gives new games an
  odds_api id) and produces current-market rows + pre-tip snapshots — the raw
  material a forward closing-line capture would reuse.
- **Phase 1 — Stand up forward coverage of legs 1–3 so every new slate is
  covered within 96h of tip:**
  - **Leg 1 (V1-OP-5a, reframed + sustained):** restore BDL finalization + box
    scores for the backlog AND keep them running forward.
  - **Legs 2+3 (the forward pipeline — new ticket, proposed V1-OP-6):** capture
    the closing line per game and populate hlr automatically. Whether this needs
    the Odds API is the STEP 0 pivot (§4).
- **Phase 2 — Sustain until the recent-N window is clean.** The 23 unmapped
  in-window games (no odds_api id) can never be backfilled; they only ROLL OFF
  past rank 55 as new *covered* games accumulate — roughly **2–4 weeks of
  fully-covered slates**.
- **Phase 3 — Board relights** when the 55 most-recent past-tip games all carry
  usable hlr within 96h (the V1-OP-4c gate lifts).

## 4. The pivotal question — is forward coverage free?

Legs 2+3 can be **free** (reuse polls already happening) OR require **ongoing
Odds API spend**, depending on one authority question:

- The close-capture rule (§7.10.1 / §14.11.1) makes a closing quote an
  observation **within 10 minutes *before*** the close boundary
  (`CLOSE_CAPTURE_STALENESS_THRESHOLD_SECONDS = 600`). It is a PRE-close
  observation — post-close is NOT required.
- The live cycle already polls `current_poll` (`self_observed`) snapshots pre-tip
  (window ends at tipoff). If the last pre-tip snapshot lands within that 10-min
  window, it IS close-capture-eligible **by timing**.
- Precedent exists that `self_observed` data can feed hlr: `recomputationWriter`
  writes hlr with `provenance = 'self_observed'`.
- **The blocker to resolve:** `currentHistoricalIsolation.ts` enforces "current
  and historical snapshots cannot mix." If the closing-quote lineage is defined
  as historical-provenance-exclusive, a `self_observed` poll snapshot may NOT be
  promoted — and legs 2+3 genuinely require the Odds API historical endpoint
  (~4 credits/game/slate). **If so, that is a real methodology constraint to be
  quoted, not a cost preference.**

This is the load-bearing STEP 0 of the V1-OP-6 ticket. If promotion is permitted,
forward coverage is free and V1-OP-3's cadence floor becomes the enabling
dependency (ensuring a poll lands inside the 10-min pre-close window).

## 5. Where V1-OP-3 fits

V1-OP-3 widens the current-market poll window (3h→8h) with a cadence floor. It
produces **no hlr** and is **not** the relight trigger. It becomes relevant only
under the free-promotion branch (§4): a wider window + cadence floor makes a
near-tip snapshot (inside the 10-min close-capture window) reliably available for
promotion. Supporting dependency, not the fix.

## 6. Consequence for the plan

The "4c → 5a → look" sequence does **not** produce a working Board. Corrected:

1. V1-OP-4c — coherence gate (DONE, `df58f05`).
2. **V1-OP-6** — forward closing-line → hlr pipeline (legs 2+3). *The critical
   path to a serving Board.* STEP 0 resolves §4.
3. V1-OP-5a — BDL box scores + finalization (leg 1), reframed as backlog restore
   **and** sustained forward, not "the relight."
4. Sustain forward coverage ~2–4 weeks until the unmapped tail rolls off (§Phase 2).

V1-OP-5b (historical Odds API backfill of the 19 mapped in-window games) is
optional acceleration — it fills 19 of the 23 tail games so they need not wait to
roll off — and stays behind the ~4-credit probe. It is NOT on the critical path.

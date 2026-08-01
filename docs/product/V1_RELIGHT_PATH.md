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
  (**~40 credits/event** per §14.11.2's 10× historical multiplier — the ~4/game
  figure was the current-odds formula, SUPERSEDED; see GAP-29). **If so, that is a
  real methodology constraint to be quoted, not a cost preference.**

### 4.1 RESOLVED — FREE (V1-OP-6 STEP 0.A verdict, governor-verified 2026-07-31)

Forward coverage is **FREE** — legs 2+3 promote the last pre-tip `current_poll`
(`self_observed`) snapshot into a closing quote; **no Odds API historical endpoint
is required**. The apparent isolation/precedent tension is not a real conflict.
Verified against the authority (each quote read directly):

- **§7.10.1 (Complete Spec) is provider-agnostic.** "A source closing quote is the
  eligible conventional-sportsbook offering present in **the last successful
  provider snapshot at or before the close boundary**." Its rules are pure
  timing/eligibility. The following sentence — "**For historical API data**, the
  provider returns the closest snapshot…" — is a *clarification of that one case*,
  not an exclusivity rule. A `current_poll` snapshot **is** a provider snapshot,
  so it satisfies the definition unchanged.
- **The isolation invariant is CURRENT-DIRECTIONAL, not a lineage-purity rule.**
  `currentHistoricalIsolation.ts` (authority §11.4, Odds §16.1): "every
  current-selection, first-observed, and movement computation reads ONLY rows with
  `request_kind=current_poll AND provenance=self_observed`; historical rows are
  structurally excluded." It protects *current* computations FROM historical
  contamination; it says nothing barring a self_observed snapshot from BEING a
  closing quote.
- **The closing-quote tables carry NO provenance CHECK, and leg 3 explicitly
  PERMITS the promoted value.** `source_closing_quotes` (migration `20260711140005`)
  constrains only the `close_capture_state` pairing; `canonical_closing_points`
  (`20260711140006`) only `selection_method`. No schema barrier to a self_observed
  `source_snapshot_id`. §7.10.2 selection is provenance-agnostic (provenance is
  stored, not gated). And **`historical_line_results`** — leg 3, the table the
  evidence engine reads — is the one contested table: migration `20260711140007`
  originally shipped `CHECK (provenance='self_observed')`, and `20260711150000`
  widened it to `CHECK (provenance IN ('self_observed','backfilled_historical'))`
  with `self_observed` as the column DEFAULT. So it not only allows but defaults to
  the promoted provenance.
- **Not a method change (DR-24 not implicated).** Promotion changes the
  *population source* of an input observation, not the closing-quote definition
  (§7.10.1), the canonical selection (§7.10.2), or any `evidence_method_v1`
  formula/threshold/vocabulary. Ops-wiring, not a `method_version` event.

**Caveat (implementation risk, not a verdict change):** this is authority-permitted
but genuinely **NEW lineage** — no `self_observed` market snapshot has ever flowed
into a `canonical_closing_point` (the `recomputationWriter` "precedent" is
decorative: it hardcodes `self_observed` on hlr while reading historically-sourced
canonical points). Therefore V1-OP-6 must **prove** the promoted path, not assume
it (see the ticket's hard STEP 0.B gate: structural-shape + deterministic-content
parity vs the seed path — provenance stays honest `self_observed` per ticket STEP
0.B(1), NOT `backfilled_historical` — and one real-slate end-to-end verification).

### 4.2 STRUCTURALLY INERT — the FREE path is unreachable (GAP-30, 2026-07-31)

The §4.1 authority analysis above is **VALID and retained** — but it is
**operationally INERT**. There is no forward `actual_start_utc` producer
(`bdl/gameStatus.ts` maps status only; `actual_start_utc` is written only by the
seed path), so `evaluateCloseBoundary` selects `scheduled_with_grace`
(`scheduled+900`), and the 600s close-capture window `[scheduled+300, scheduled+900]`
sits entirely **after** scheduled tip — while forward polling stops **by** scheduled
tip. **No `self_observed` pre-tip snapshot can ever qualify; the missing element is
an eligible forward snapshot, not authority.** Registered as **GAP-30**. V1-OP-3 is
therefore **NOT** the enabler and is **removed from the critical path** — cadence
tuning cannot close a window that opens 300s after polling stops. **V1-OP-6 FREE is
SHELVED** (see the ticket's SHELVED block); the immediate relight is **Path C** (§6).

## 5. V1-OP-3 — DEMOTED (no longer the relight lever; GAP-30)

Under GAP-30 the FREE forward path is structurally blocked, so V1-OP-3's cadence
floor **cannot** enable it — the close-capture window is post-tip regardless of
cadence. **V1-OP-3 is removed from the relight critical path.** It retains only any
INDEPENDENT current-market value (fresher `current_market_rows` for the D-A1 gate /
profile freshness); it is no longer a relight dependency and is not sequenced here.
The earlier "reframed as correctness enabler" framing is withdrawn.

## 6. Relight order — Path C (paid post-hoc historical retrieval)

The FREE forward path is shelved (§4.2, GAP-30). The immediate relight is **Path C**
— retrieve closing lines post-hoc from the Odds API historical archive, which is
immune to the boundary/polling geometry (it queries the archive at the boundary
after the fact, at the archive's own ~5-min cadence). Ordered and spend-gated:

1. **V1-OP-4c** — coherence gate. DONE (`df58f05`).
2. **GAP-29 fix** (separate code package, its own commit + review) — add the
   §14.11.2 10× historical multiplier + a non-zero historical-discovery cost to
   `quotaForecast`; **committed, reviewed, green BEFORE any historical credit.** It
   is the spend guard.
3. **Independently verify** the corrected forecast against the authoritative
   `x-requests-remaining` header (`reconcileQuota`).
4. **≤40-credit bounded prop-market coverage probe** — confirm the 4 WNBA
   player-prop markets are actually present in the historical event-odds payload.
5. **Cost package → founder authorization** — one-time backlog (~1,695 credits,
   GAP-29 model) + recurring forward (~40 credits/event) — before any larger spend.
6. **On authorization:** backlog repair **+ recurring forward post-hoc close
   capture** via the historical endpoint (the sustaining forward producer, in place
   of the shelved FREE promotion).

**V1-OP-5a** — BDL box scores + finalization (leg 1) — runs **in PARALLEL**:
independent, zero credits, supplies the box scores Path C's `hlr = leg2 ⋈ leg1`
requires. It **must not** lift Board suppression on its own before hlr coherence
exists (GAP-26/28). Not on the GAP-29 critical path.

V1-OP-5b (the in-window historical backfill — ~1,695 credits, GAP-29 model;
supporting founder-held probe evidence held untracked, not a committed dependency)
is the backlog-repair face of step 6 and stays behind steps 2–5.

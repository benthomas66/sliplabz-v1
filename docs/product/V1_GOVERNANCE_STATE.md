# SlipLabz V1 — Governance State

Maintained by the governor chat. Updated whenever state materially changes. Any chat or successor governor reads THIS FILE plus `V1_OPEN_GAPS.md` before assuming anything about project state. **If this file and a chat summary disagree, this file wins.**

Last updated: 2026-07-31 (V1-GOV-8). Supersedes V1-GOV-7, which predated the V1-OP operations line (V1-OP-4 / V1-OP-4c), the relight-path spec, and the V1-OP-6 shelving / Path C ruling.

---

## Current position

- **HEAD (state recorded against):** `298f329` — "feat(ops): correct historical Odds API quota forecast — 10× multiplier + non-zero discovery (V1-OP-7, closes GAP-29)". This GAP-29-closure bookkeeping refresh ships as the **next** commit, so immediately after it lands this line is one commit stale by design.
- **Intervening since `a450ffd` (the V1-OP operations line):** V1-OP-4 ingestion gate (`58114e4`) · V1-OP-4c re-anchor to engine coverage + recent-N bound (`df58f05`) · relight-path spec (`077f900`) · V1-OP-6 STEP 0.A FREE verdict (`a0da7c2`) · GAP-29 register (`d42f512`) · V1-OP-6 audit package (`d831733`).
- **Remote:** origin (GitHub, private). Standing rule: **push after every approved commit.**
- **Hosted DB:** 56 migrations applied. Producer certified in production (V1-OP-2). Each cycle persists evidence inputs, the deduplicated source-identity set, and the complete per-game threshold-relative series with canonical game identity. `poll_cycles` ledger active. `evidence_profiles`: 145 `evidence_method_v1` (frozen, audit-only) + pre-persistence `evidence_method_v2` rows typed `unavailable_not_persisted` **permanently** (no bundle; not a transitional state) + governed v2 profiles persisted each cycle.
- **Deployed:** Vercel preview (not git-connected; `vercel` from repo root, never `--prod`). Routes: `/board` (production Board surface — empty between slates by design), `/design-preview` + variants `a`/`b` (legacy `BoardTable` + design variants — see GAP-24), `/design-preview/research` + `/design-preview/research/[idx]` (current Research View), `/research/[game]/[player]/[market]` (production Research View).

## What runs autonomously

GitHub Actions `poll-cycle`, cron `*/15 * * * *` (GitHub currently throttles actual runs to ~1.5–2.7h apart): slate gate (DB-only, free) → budget floor (1,000-credit reserve) → bounded poll (≤5 events / ≤25 credits) → aggregate → v2 populate (one `evaluation_reference_time`) → `poll_cycles` row. Pregame only. Operator-tunable constants in `src/ops/constants.ts` are **ops parameters, not method authority** (`CYCLE_WINDOW_BEFORE_TIPOFF_SECONDS` 10800 · `CYCLE_EVENT_CAP` 5 · `CYCLE_CREDIT_CEILING` 25 · `RESERVE_FLOOR_CREDITS` 1000).

---

## The four governing authorities

| Authority | Governs | Status |
|---|---|---|
| `EVIDENCE_PROFILE_METHOD_V1.md` | computation, classification, gates, surface rules §D/§G, DR-19 | **FROZEN** — v1 method retired from serving; 145 rows retained for audit |
| `EVIDENCE_PROFILE_METHOD_V2.md` | the active method; D-A1 thresholds 900/1800/3600 (unified horizon) | **FROZEN** |
| `SLIPLABZ_EVIDENCE_GRAMMAR.md` (v1.3) | **surface vocabulary** — primitives, disclosure, interaction | independently authorized extension, interpreted **alongside** §D.2. Does NOT amend the method authorities |
| `SLIPLABZ_MOBILE_PRODUCT_PARITY_SPEC.md` | **structure, density, module inventory, interaction** | screenshot-grounded; §5 screenshot-parity is a pass condition on every surface ticket |

**Tickets cite whichever authorities govern each decision, and cite BOTH where a Grammar-authorized surface form is used.**

Grammar essentials: eight primitives (Finding Mark · Evidence Strip · Margin Glyph · Consensus Bar · Gate Indicator · Freshness · Provenance · Sample) · the disclosure ladder, where **each level reveals more uncertainty, not less** · discrete states, never continua · compact count form `A–B` authorized, slash ratios forbidden · gate proximity is an orthogonal modifier on five authorized gates, outcome always stated first · Evidence Relationships named but **NOT authorized for implementation**.

**Immutable containment:** DR-19 (numeric composite score + four components never reach a browser outside the DR-19 Research View methodology area, incl. visual encodings) · DR-20 (composite-score ordering is the sole ranking; score stays internal) · Amendment 21 (`internal_game_id` SERVER-SIDE ONLY, on `RESEARCH_PROJECTION_FORBIDDEN_KEYS`) · `line_observed_at` server-side only. No probability/rate/percentage/hit-rate/EV/confidence/pick/green-red-valence anywhere.

---

## Method state

- **v1:** frozen. Never served on the Board.
- **v2:** active. Board reads it exclusively via `ACTIVE_BOARD_METHOD_VERSION`. Beyond-horizon persists no row (typed). Serving gate suppresses past `display_age` 3600 with profile-bound derivation.
- Output-affecting change requires a new `method_version` plus DR-24 regression fixtures.

## Persistence architecture (V1-8a0 / V1-8a0a / V1-8a0b)

- Evidence profiles persist outputs **and** inputs (V1-8a0), the deduplicated **source-identity set** (names/IDs only — the one approved offering-context exception, frozen with the evaluation), and the complete per-game threshold-relative series with canonical game identity (V1-8a0a).
- **V1-8a0b** moved historical-series retrieval to `src/computation/historicalSeriesRead.ts`. **One reader, one owner.** Research View is a consumer. Its reader contract is **RE-FROZEN as previously-authorized-plus-`internal_game_id`** (Amendment 21); further change requires explicit governor authorization.
- **Legacy pre-persistence v2 profiles:** input bundles **permanently unrecoverable**; `unavailable_not_persisted` is the **correct permanent representation**. Past the serve horizon; absent from the Board. No repopulation ticket exists or is required.

---

## Governing roadmap

**Board series COMPLETE and committed:** V1-8a0 (`49f0a81`) · V1-8a0b (`6f39f48`) · V1-8a0a (`a3c28f3`) · V1-8a1 (`e7b1a45`) · V1-8a2 (`77e460f`) · V1-8a3 (`66e51ac`). **Research View comprehension pass COMPLETE:** V1-8b (`a450ffd`).

**RELIGHT (the Board is honestly dark; V1-OP-4c gate suppresses on stale engine coverage — see `V1_RELIGHT_PATH.md`):**

1. **GAP-29 fix — DONE** (V1-OP-7, commit `298f329`; independently verified, `npm test` 746/603/0/143 green). `quotaForecast.ts` now applies the §14.11.2 10× historical multiplier (`forecastHistoricalEventOddsCost`) + a non-zero historical-discovery cost (`forecastHistoricalEventDiscoveryCost`, 1/call), test-pinned; current-endpoint forecasts + `reconcileQuota` byte-identical. The spend guard is in place.
2. **Path C — paid post-hoc historical retrieval** = the relight mechanism. GAP-29 spend guard DONE (step 1); the ≤81-credit prop-market probe was RUN and **PASSED** (2026-08-01 — both mapped + discovery-recovered paths identical, all 4 launch markets, close-capture eligible, billing exact); budget package committed (`V1_PATH_C_BUDGET.md`: one-time ~1,900 + recurring ~4,556 through 2026-09-25, under an 8,000-credit ceiling). **Resequenced: V1-OP-5a (leg-1 box scores) runs FIRST — it is the upstream prerequisite for OP-8's leg-3 hlr on the 46/47 backlog games — then V1-OP-8 (`tickets/V1_TICKET_OP_8.md`), validated against a representative box-score-complete backlog slate (not the single unmapped exception).** The full ~6,456-credit backlog/recurring spend stays a separate founder authorization gated on OP-8's STEP-0 gates. **Shared invariant: neither 5a nor OP-8 writes `actual_start_utc` — keeps the `scheduled+900` boundary valid (GAP-30).**
3. **V1-OP-6 (FREE forward promotion) — SHELVED** (GAP-30): structurally blocked — no forward `actual_start_utc` producer, so the `scheduled+900` grace boundary's 600s window is post-tip while polling stops at tip; no eligible forward snapshot can exist. Authority/shape verdict stays valid-but-inert. Shelved pending a future actual-start/trigger ticket.
4. **V1-OP-3 — DEMOTED** (GAP-30): no longer the relight lever (cadence cannot close a post-tip window); retains only any independent current-market freshness value. Not sequenced for relight.
5. **V1-OP-5a — IMMEDIATE NEXT implementation ticket** (leg 1 box scores + finalization; **0-credit** BDL; `tickets/V1_TICKET_OP_5A.md`). **UNHELD** — the GAP-3 hold was dissolved by V1-OP-4c (the gate no longer keys on pgs, so restoring box scores cannot prematurely lift suppression). Now the **upstream prerequisite** for OP-8's backlog hlr — only **1 of 47** backlog games currently has box scores, so 46 are blocked on 5a. Restores the ~46 missing-pgs games + finalizes ~36 stuck-`scheduled` — **BACKLOG-ONLY** (via committed operator scripts `v1_4c_stats_backfill.ts` + `v1_4e_step2_forward_games.ts`; no new `src/` driver, no workflow). **HARD invariant: must NOT write `actual_start_utc`** (cross-ticket with OP-8; GAP-30). Does NOT lift the OP-4c gate (Board stays honestly dark until hlr lands).
6b. **V1-OP-5c** (`tickets/V1_TICKET_OP_5C.md`) — **Durable Forward Box-Score & Game-Finalization Ingestion** (0-credit BDL). Forward sustainment split OUT of 5a. **The single reusable `src/` finalization owner is delivered by V1-OP-5D (the GAP-31 repair); 5c adds continuous scheduling + failure-signaling ON THAT SAME OWNER — not a parallel implementation** (governor confirms boundaries in STEP 0). Closes GAP-3's forward half. **Mandatory before relight is declared operationally durable; not required before the backlog restore or OP-8.** Carries the same `actual_start_utc` invariant. Drafted, not dispatched.

**Relight execution order — CORRECTED (2026-08-01, supersedes the prior ordering, per the GAP-31 repair ruling):** (1) record/close **V1-OP-5a Phase 1**; (2) implement + verify the scoped status-only finalizer **V1-OP-5D** (repairs GAP-31); (3) safely finalize the **36 held games** via 5D; (4) backfill their box scores; (5) amend **V1-OP-8** boundary protections (Gate 2 → BOTH start-time fields) before redispatch, then run V1-OP-8 validation on a representative box-score-complete game; (6) continue **Path C** historical repair after independent review; (7) **V1-OP-5c** before durable restoration is declared.

**⚠️ WIDENED TWO-FIELD BOUNDARY INVARIANT (verbatim):** Neither `actual_start_utc` nor `scheduled_start_utc` may be written, refreshed, synthesized, or altered by V1-OP-5a, V1-OP-5c, or V1-OP-8 (and V1-OP-5D) for games whose close-boundary-dependent evidence is being preserved or promoted, absent a separately authorized boundary migration proving downstream validity. `evaluateCloseBoundary` depends on either field (`verified_actual_start` from `actual_start_utc`; `scheduled_with_grace` = `scheduled_start_utc + 900`); moving either can flip a previously eligible archived snapshot to `close_capture_stale` (GAP-30 / GAP-31).

**V1-OP-5a Phase-1 decomposition (2026-08-01):**
- **Phase 1 — the 10 already-`final`, BDL-mapped, pgs-missing games — DONE** (via `v1_4c_stats_backfill.ts --game` per game; box-score-only writes; both start-time fields byte-identical; gate did not lift; halted uncommitted for audit). 9/10 wrote box scores; 1 (`a11faedc`) yielded 0 BDL rows.
- **Phase 1 OUTCOME (record exactly):** 10 already-final backlog targets selected · 9 became box-score-complete · ~220 player-stat rows restored · 1 target (`a11faedc`) returned no player-stat rows (→ GAP-32) · both start-time fields unchanged · no hlr/canonical/profile/gate/method state changed · the hlr-anchored gate did not lift · execution idempotent · nine representative V1-OP-8 validation targets now exist.
- **Phase 2 — the 36 stuck-`scheduled` games — HELD.** The only committed finalizer (`v1_4e_step2_forward_games.ts`) is **PROHIBITED (GAP-31)** — it would overwrite `scheduled_start_utc` with date-only midnight (BDL `datetime` null for all 332 games). Finalization must go through the scoped status-only finalizer **V1-OP-5D**. Release-condition status: (a) delta check **reviewed** ✓ (2026-08-01); (b) row-creation blast radius **known** ✓ (exactly **1** prospective insert: BDL `275552`, 2026-07-21, status `post`); (c) widened invariant **in this package** ✓; (d) **PENDING** — explicit founder authorization of the **V1-OP-5D scoped status-only path** (the "reviewed legacy-writer use" option is WITHDRAWN per GAP-31).

**Odds API balance ~32,908 credits (2026-07-31);** `RESERVE_FLOOR_CREDITS=1000`. Path C spend is entirely behind the GAP-29 fix + the cost package + founder authorization.

**Post-relight:**
6. **V1-9** — auth, Stripe, entitlement. The locked-row visual architecture is built and inert so this must not force a Board redesign.
7. **V1-10** — launch audit.
8. **Offseason empty-state** — product question (what a visitor sees for ~7 months with no slate). Needs an answer before ~October. Separate product ticket.

Deferred with their own registrations: **V1-ARCH-2** (unified classified evaluation object — not a prerequisite, not opportunistic) · **V1-OPS-3** (poll failure/skip signaling — OPEN) · G1 filtered windows · G2 H2H window · G3 supporting-stats inventory · G4 line-movement projection.

**Open gaps register (`V1_OPEN_GAPS.md`):** recent — GAP-25 (ingestion gate fail-safe log ambiguity, → V1-OP-4b) · **GAP-26 CLOSED by V1-OP-4c** (gate/engine anchor mismatch) · GAP-27 (season/L20 reach past recent-N bound, non-blocking) · GAP-28 (gate cannot relight from backfill alone; relight via Path C) · **GAP-29 CLOSED by V1-OP-7** (`298f329`) — quotaForecast historical spend guard now correct (10× multiplier + non-zero discovery); downstream Path C caller wiring still pending · **GAP-30** (forward self-observed close capture unreachable under scheduled-with-grace geometry → V1-OP-6 shelved; blocks FREE forward promotion, not launch if Path C succeeds) · **GAP-31** (legacy forward-games finalizer overwrites scheduled tip with date-only midnight — `v1_4e_step2` PROHIBITED; repaired by **V1-OP-5D**; blocks the 36-game finalization + durable forward) · **GAP-32** (backlog game `a11faedc` returned zero BDL player rows — classification required; may bound gate lift). See the register for the full list.

---

## Standing governance rules (chat-independent)

1. **One chat** (the governor) commands the terminal agent. All others propose. The governor is read-only: inspects, tests, rules; does not implement/commit/push.
2. **Two-step review:** report, then FILE INSPECTION before approval. Screenshot-parity (Parity §5) is a founder-mandated pass condition on every surface ticket; the implementation environment cannot produce screenshots, so the founder deploys and reviews on device. Never waived.
3. **One approved ticket per commit**; exact-path staging by name; commit authorizations are files, never chat paste.
4. **Tickets pin the expected HEAD and halt on mismatch. No next ticket until the previous commit is confirmed.**
5. **"Safe by absence of callers" is rejected** — require impossible by construction.
6. **Copy safety is absolute** on every emitted string. The numeric composite score never reaches a browser outside the DR-19-authorized Research View methodology area.
7. **Connections:** migrations via session pooler 5432; runtime via transaction pooler 6543; pooler URIs copied whole (username `postgres.<project_ref>`).
8. **Push after every approved commit.** Pre-push gate: only `.env.example` may be tracked among env files.
9. **Governing authority documents (and, given the corrupting paste channel, tickets) are placed into the repo as clean files, never transcribed from chat paste.** The governor reconstructs corrupted drafts as clean repository files and shows the founder before issuance.
10. **Ticket evidence branches on outcome.** A halt owes inventory and halt evidence only; never fabricate implementation evidence. Ending sentences are outcome-specific.
11. **Schema precedes producer, always** (V1-INC-1 corrective rule): any migration deploys to hosted and is verified before the producer that writes to it ships.

---

## Open founder items

- **Headshot rights (G8)** — counsel question on promotional/content use of player likenesses. Product use cleared; content use not. Image slots and fallbacks are built; production images blocked.
- **Final bottom-navigation shape** — currently Board · Players · Methodology with no dead controls; five-tab production shape is a later ruling.
- **Percentage-difference display** — currently excluded; independently authorizable.
- **Factual source-specific price display** — deferred on scope, **not forbidden**; enlarges the browser-visible market payload and needs its own ticket.
- **Distribution charter** — drafted, never approved or committed.
- **`docs/product/reports/V1_TICKET_OP_2_REPORT.md`** — production-certification evidence, held UNTRACKED by explicit founder instruction pending separate authorization.
- **`docs/research/`** holds two founder-supplied files (one a duplicate, V1-GOV-2) that remain untracked.

---

## Pending external

- The WNBA slate drives Board population; an empty Board between windows is **correct behaviour**, not a defect. WNBA regular season ends in ~6 weeks (~mid-Sept 2026); after that the Board is empty for ~7 months regardless of window (see offseason empty-state, roadmap #4).
- Odds API: budget floor 1,000; balance ~32,933 credits (observed 2026-07-31). Current 3h window draws ~3–4 completed cycles / ~12–28 credits per slate day (min 4 / median 4 / max-observed 12 credits per completed cycle). V1-OP-3 widens the window to 8h behind a cadence floor that caps daily cycles so a post-throttle 15-min cadence cannot 8× the burn.

# V1-A2-3 — EVIDENCE_METHOD_V2 LIVE VALIDATION — REPORT

**Outcome: HALTED at STEP 0 / GATE A. Zero Odds credits spent. Zero rows written. No files committed. v1 rows untouched.**

This ticket was to be the first end-to-end v2 run against hosted live current-market
data and the first persistence of any v2 profile. It did not proceed past preflight:
**GATE A fails** — the v2 populator has no production source for its required
`line_observed_at` input. A second, independent blocker was also found (GATE B could
not be read: the hosted DB password in `.env` fails authentication).

Per the ticket's GATE A instruction — *"if it does not, that is a GAP — report it
precisely (what is missing, what would supply it) and HALT before spending a credit.
Do not improvise a source. Do not derive it from a clock."* — I halted and improvised
nothing.

---

## Starting state (verified, matches expected)

```
git status --short : (clean)
git rev-parse HEAD : aaf6e8eec288640736a2478f843809371b012a12
git log --oneline -4:
  aaf6e8e feat: optimized freshness decay and book-movement probe (V1-4h)
  7eebe57 feat: evidence_method_v2 implementation with freshness-neutral engine core (V1-A2-2)
  015e23a feat: evidence_method_v2 freshness authority and timing schema (V1-A2-1)
  d834e6b feat: bounded-concurrency odds poll sweep (V1-4g)
```

Branch `main`, clean worktree, HEAD as specified. No mismatch.

Typecheck at HEAD: **`tsc --noEmit` exit 0** (tree compiles; see GATE A note on why
the contract mismatch is not itself a compile error).

---

## STEP 0 — GATE A — DOES THE v2 POPULATOR HAVE ITS INPUTS?  ❌ FAIL

### (a) Does the v2 populator obtain `line_observed_at` for each grain, and from where?

**No.** The populator does not obtain it itself and there is no production builder that
supplies it. `line_observed_at` is a **required, caller-supplied input** that the
populator delegates to an injected builder — and no such hosted builder exists.

**The populator delegates the value to an injected builder** (`src/evidence/v2/populateV2.ts`):

```ts
export type V2BuildProfileInput = (
  grain: V2EvidenceGrain,
  tx: Tx
) => Promise<{
  readonly input: EvidenceProfileInput;
  readonly line_observed_at: string | null;   // <-- REQUIRED from the builder
  readonly audit: EvidenceProfileAuditRefs;
} | null>;
```

The populator consumes whatever the builder returns and forwards it verbatim to the
engine (lines 109–118):

```ts
const built = await options.build_profile_input(grain, tx);
if (built === null) { cumulative.grains_skipped_no_input += 1; continue; }
const v2_input: EvidenceProfileInputV2 = Object.freeze({
  ...built.input,
  line_observed_at: built.line_observed_at,   // <-- passed straight through
  evaluation_reference_time,
});
```

So the populator **never derives `line_observed_at`**; it trusts the builder. The engine
then computes `classification_age = evaluation_reference_time − line_observed_at`
(`engineV2.ts`), returning `+Infinity` when it is null — i.e. a null value forces every
grain to the `absent` / stale branch. The value is load-bearing.

**The only builder in the codebase is v1's, and it does not return `line_observed_at`**
(`src/evidence/driver/readModelInputBuilder.ts`):

```ts
export type ReadModelBuilderResult = {
  readonly input: EvidenceProfileInput;
  readonly audit: EvidenceProfileAuditRefs;      // <-- NO line_observed_at field
} | null;

export function makeReadModelInputBuilder(
  ctx: ReadModelBuilderContext
): (grain: EvidenceGrain, tx: Tx) => Promise<ReadModelBuilderResult> { ... }
```

Its per-grain assembly returns `{ input, audit }` and nothing else (line 261):

```ts
return Object.freeze({ input, audit });
```

**Crucially, the value that WOULD supply the input already exists inside this builder but
is discarded.** `readCurrentMarketRow` computes the freshest observed-at across the
grain's current offerings (lines 349–352) —

```ts
const latestObserved = currentOfferings
  .map((o) => o.observed_at)
  .sort()
  .at(-1) ?? null;
```

— exactly *"the freshest `market_snapshots.observed_at` across the grain's offerings"*
that GATE A names. But `latestObserved` is consumed **only** as the composer's freshness
input (line 366, `freshness.last_observed_at: latestObserved`) and is **never surfaced on
the builder's return**. It is computed, used for freshness, and dropped.

### (b) The GAP — precisely

**What is missing:** a production `V2BuildProfileInput` builder that returns
`line_observed_at` (the freshest `market_snapshots.observed_at` across the grain's current
offerings) alongside `{ input, audit }`.

**What would supply it:** the value already exists as `latestObserved` inside
`readModelInputBuilder.readCurrentMarketRow` (lines 349–352). A v2 builder — or an
extension of the v1 builder's result contract — would surface that same
`latestObserved` as `line_observed_at`. **No new query and no clock read are required**;
it is a plumbing change to stop discarding a value the builder already computes from
`market_snapshots.observed_at`.

**Why the wiring is genuinely absent (not just unlocated):**

- No production file imports `runEvidencePopulatorV2` / `V2BuildProfileInput`. The only
  reference to those symbols is their own definition file:
  `grep -rln "runEvidencePopulatorV2\|V2BuildProfileInput" src/ scripts/` → `populateV2.ts` only.
- No file under `src/evidence/v2/` is a read-model builder — the directory is
  `populateV2 / writerV2 / engineV2 / freshnessClassifier / thresholds / servingGate`.
- Outside `src/evidence/v2/`, `line_observed_at` appears **only in comments**
  (`quality.ts:360`, `engineCore.ts:21`) — no DB read produces it.
- No script in `scripts/` mentions `line_observed_at` at all.
- The **only** code that ever supplies a `build_profile_input` returning
  `line_observed_at` is `tests/integration/v2MethodImplementation.integration.test.ts`,
  and it does so with **hardcoded literals** (e.g. `line_observed_at: '2026-07-18T18:00:00Z'`),
  never from `market_snapshots`. That is a test fixture, not a hosted source.

**Why typecheck still passes (exit 0):** the mismatch is a *contract* gap, not a type
error, precisely because nothing production-side wires the v1 builder into the v2
populator. `ReadModelBuilderResult` (`{ input, audit }`) is **not** assignable to
`V2BuildProfileInput`'s return (`{ input, line_observed_at, audit }`) — so the moment a
hosted run tried to pass `makeReadModelInputBuilder(...)` as the v2 populator's
`build_profile_input`, it would fail to compile. There is no such call site, so the tree
compiles and the gap is latent until this ticket tried to exercise it.

**Decision:** HALT before spending a credit. Building or extending a hosted v2 read-model
builder is a code change (new production wiring) and belongs to a **separate ticket** —
it is not "improvising a source" inside this validation ticket. I did not add it, did not
derive `line_observed_at` from a clock, and did not fabricate it.

**GATE A: FAIL.**

---

## STEP 0 — GATE B — IS THE GAMES TABLE STILL AHEAD OF TODAY?  ⚠️ COULD NOT BE READ

GATE B is a read-only query (zero Odds credits) and the ticket asks for both gates to be
reported, so I attempted it despite GATE A already mandating the halt. It could not be
evaluated:

- The hosted connection string in `.env`
  (`SLIPLABZ_HOSTED_DATABASE_URL = postgresql://postgres.fxlzkhaepwlnezchnkyt:<MASKED>@aws-0-ca-central-1.pooler.supabase.com:5432/postgres`)
  **fails authentication**: `error: password authentication failed for user "postgres"`
  (Postgres SQLSTATE **`28P01`**).
- The username shape is correct for the Supabase session pooler
  (`postgres.<project_ref>`; the pooler reports the tenant user as `"postgres"`), so this
  is a **stale / rotated password**, not a URL-format problem.
- `SLIPLABZ_DATABASE_URL` (the non-hosted/local URL) is **empty** in `.env`.

**Net:** this environment currently has **no working database connection at all** (local
URL empty, hosted password rejected). GATE B's three metrics — max game date, count of
`scheduled` games at/after today, any game in the next 72h — could not be read.

I did **not** hunt for or substitute working credentials (out of scope), and I did not
perform any game ingestion.

**GATE B: BLOCKED (unreadable — hosted credential failure `28P01`).**

Both gates must pass to proceed. GATE A is a definitive FAIL; GATE B is unreadable. The
ticket cannot proceed on either count.

---

## STEPS 1–7 — NOT EXECUTED

No spend, no poll, no aggregation, no persistence, no proofs, no idempotency re-run. The
mandated halt is at GATE A, before any credit. Consequently:

- STEP 1 baseline (v1 count / v2 count / checksum): **not read** (GATE B DB unreachable anyway).
- STEP 2 poll: **not run** — 0 Odds credits spent (hard ceiling 25 never approached).
- STEP 3 aggregate / STEP 4 v2 persist / STEP 5 explanations / STEP 6 seven proofs /
  STEP 7 idempotency: **not run.**

The one proof that is trivially satisfiable is stated below.

---

## EVIDENCE

| Item | Result |
|---|---|
| Starting git state | Verified — matches expected HEAD `aaf6e8e`, clean |
| Typecheck (`tsc --noEmit`) | **exit 0** (tree compiles) |
| GATE A | **FAIL** — no production source for `line_observed_at` (precise gap above) |
| GATE B | **BLOCKED** — hosted DB auth `28P01`; local URL empty; unreadable |
| Odds credits spent | **0** (halted before any spend) |
| BALLDONTLIE calls | **0** |
| Rows written to hosted | **0** (no DB connection; no persistence attempted) |
| v1 rows mutated | **none** — no write path was entered |
| Files changed / committed | **none** — two throwaway read-only probe scripts were created under `scripts/` and **deleted immediately after each run**; `git status --short` is clean |
| Unit + full serial integration suites | **Not run** — the ticket halted at preflight, and the integration suite requires DB connectivity that is currently unavailable (same `28P01` / empty-local-URL condition). Running them would exercise no v2 validation path and would fail on connection, not on code. Deferred with GATE B remediation. |

No secret (API key or DB password) was printed or persisted at any point; all diagnostics
masked credentials.

---

## WHAT THE GOVERNOR NEEDS TO DECIDE / SEQUENCE NEXT

Two separate follow-up tickets are implied; **neither is in scope here**:

1. **v2 read-model builder (unblocks GATE A).** Add a production `V2BuildProfileInput`
   that returns `line_observed_at` sourced from the freshest
   `market_snapshots.observed_at` for the grain — the value already computed as
   `latestObserved` in `readModelInputBuilder.readCurrentMarketRow` (lines 349–352) and
   currently discarded. Options: (i) a dedicated v2 builder in `src/evidence/v2/`, or
   (ii) widen `ReadModelBuilderResult` to carry `line_observed_at` and adapt it for the
   v2 populator. Requires no new query and no clock read. This is the true prerequisite
   for V1-A2-3.

2. **Hosted DB credential refresh (unblocks GATE B and all hosted work).** The
   `SLIPLABZ_HOSTED_DATABASE_URL` password in `.env` no longer authenticates (`28P01`).
   Until it is refreshed, no hosted read or write — including this ticket's validation and
   its STEP 1 baseline — can run. (Also note `SLIPLABZ_DATABASE_URL` is empty.)

Once (1) is landed and (2) is refreshed, re-issue V1-A2-3 unchanged: both gates should
then pass and the spend/persist/proof sequence can run within the 25-credit ceiling.

---

*Preflight-halt section generated 2026-07-24 (first attempt). No commit performed.*

═══════════════════════════════════════════════════════════════════════════════

# V1-A2-3 — LIVE VALIDATION RUN (second attempt, 2026-07-24)

Both prerequisites from the preflight section are now closed: V1-A2-4 (bf203a5) added the
production builder + wiring; V1-A2-5 (4c5b3e3) split the composer so the v2 path is
clock-free; and the hosted credential now authenticates. This section records the actual
live run.

**Bottom line:** the pipeline executed end to end on hosted — both gates passed, ONE
bounded poll ran (**0 credits**), aggregation and the v2 populator ran with persistence
enabled. **Zero v2 profiles were persisted** because the live WNBA slate currently carries
**no player props** in the pollable window, and the only pre-existing hosted grains are
6–8 days stale (correctly `beyond-horizon`). This is a live-data-availability outcome, not
a code or gate failure. **v1's 145 rows are byte-for-byte untouched.** The first operative
v2 persistence (DR-29) carries forward to a re-run when props are posted.

## Starting state (verified)
```
HEAD 4c5b3e392607b50c073bf7865ccf05b76bcc2a15  ("feat: freshness-neutral composer core with v1/v2 wrappers (V1-A2-5)")
git log -4: 4c5b3e3 / bf203a5 / aaf6e8e / 7eebe57
git status --short: ?? docs/product/reports/V1_TICKET_A2_3_REPORT.md   (this report; only untracked entry)
```
No mismatch. This ticket made **no code change** (operator work was throwaway scripts,
deleted after each run); the worktree carries only this report.

## STEP 0 — PREFLIGHT GATES (both PASS)

**GATE A — v2 input path (verified, not re-derived):**
- (a) `line_observed_at` per grain: `populateV2.ts:116` consumes `built.line_observed_at`
  from the production builder `makeV2ReadModelInputBuilder → makeReadModelInputBuilderV2Core
  → readCurrentMarketRowV2 → composeCurrentMarketRowV2 → assembleMarketRowCore` (single
  owner; freshest `observed_at` over the offering set).
- (b) Clock-free: zero non-comment `new Date(`/`Date.now(`/SQL `now()` across all 8
  v2-path files; the lone `new Date()` in the builder file (line 427) is inside the v1
  reader `readCurrentMarketRow` (400–447), never called by the v2 path.
- (c) GAP-12 closed on the production path: V1-A2-5 proof-3 green — grains aged
  301/901/1801s reach the v2 engine with `eligible_book_count ≥ 1`.

**GATE B — slate ahead of today:** max game date **2026-09-25**; **129** scheduled at/after
now; **1** game in the next 72h (id `5a1248ff…`, 2026-07-26 00:30 UTC). The mid-season lull
the governor flagged. PASS.

## STEP 1 — HOSTED BASELINE (read-only, before any spend)
```
evidence_method_v1 count      : 145        (expected 145) ✓
evidence_method_v2 count      : 0          (expected 0)   ✓
v1 derived-column checksum    : 91200b8e39e3dabb2f05d2f9192a891c
historical_line_results       : 4658
player_game_stats             : 4194
```
Checksum = md5 over the recomputable columns (composite_score, c_rtp/c_ms/c_wa/c_ma,
classification, direction, quality_capped, quality_cap_reason, includes_backfilled_historical,
evaluated_line, evaluated_source_kind), ordered by evidence_profile_id, over v1 rows.

## STEP 2 — POLL (ONE bounded sweep; 0 credits)
- Discovery (`/v4/sports/basketball_wnba/events`, free — `x-requests-last=0`) returned
  **7** valid events, all 97–124h out (07-28…07-30). The one game inside 72h (07-26) had
  no odds posted, so it was not in discovery.
- Selected the **5 earliest** (ceiling guard: 4 markets × 5 events = 20 projected ≤ 25).
- All 5 resolved **exactly** to internal games (`resolved_exact`): `e4dc370d→f431d198`,
  `786c1161→0b568345`, `c2e520af→c79c35a5`, `606c87e7→5f57bc9f`, `fa632e2d→23c6c6c2`.
- Concurrency = 3; wall-clock **0.70s**.
- **Per-event: every call HTTP 200, `result_state='successful_empty'`, 0 snapshots, 0
  credits.** The 4 requested player-prop markets have no offerings posted this far ahead;
  the Odds API charges nothing for an empty prop response.
- Quarantines: none. Snapshots written: 0. Offerings written: 0.
- **Credit ledger (reconciled):** `discovery_before_remaining=33035`,
  `discovery_after_remaining=33035`, `authoritative_total=0`, `sum_of_per_call_last=0`,
  `reconciled=true`. **0 credits spent** (ceiling 25).

## STEP 3 — AGGREGATE
Ran `aggregateCurrentMarketRowsForGame` for each of the 5 freshly-linked games:
`rows_written=0, grains_processed=0` for all five (no offerings to aggregate). Grains for
the polled games with `eligible_book_count ≥ 1`: **0**.

## STEP 4 — RUN v2, PERSISTING TO HOSTED
`listAllGrains(hosted)` returns **263** grains — all pre-existing from the V1-4d…4h polls
(offerings observed 2026-07-16…07-18). ONE `evaluation_reference_time` captured at batch
start: **`2026-07-24T22:23:11.844Z`**; batch wall-clock **188s** (263 grains × real
read-model reads on hosted).
- **classification_age distribution:** all 263 `beyond-horizon`
  (min age **533,479s ≈ 6.2d**, max **689,727s ≈ 8.0d**); fresh/aging/stale-present/absent = 0.
- **v2 branch distribution:** beyond-horizon **263**; fresh 0, aging 0, stale-present 0,
  absent 0.
- **Counters:** `grains_observed=263, grains_skipped_beyond_horizon=263,
  grains_skipped_no_input=0, profiles_inserted=0, profiles_updated=0`.
- **Profiles PERSISTED by classification:** none (0 rows across all seven classification
  values). Strong count: 0.
- **Reason-code frequencies:** none (0 rows).
- **Beyond-horizon grains:** 263; **CONFIRMED zero rows inserted for them** (v2 row count = 0).
- **abnormal_dispersion:** never emitted (0).

The freshness-neutral composer behaved exactly as designed: every stale grain reached the
v2 engine market-present (offerings passed through, no wall-clock gate), and each was
correctly routed `beyond-horizon` on `classification_age`, persisting nothing — the very
behaviour V1-A2-5 fixture-proved, now demonstrated on hosted at scale (263 grains).

## STEP 5 — READ WHAT IT SAYS
**Not producible this run:** zero v2 profiles were persisted, so there are no rows to
render the V1-A1-4 explanation over. This is not an explanation-template incompatibility —
it is the absence of any persisted v2 profile. The requirement (≥5 rendered persisted
profiles spanning classifications) is deferred to a re-run that yields fresh grains.

## STEP 6 — THE SEVEN PROOFS
1. **v1 UNTOUCHED** ✓ — v1 count **145**; checksum **91200b8e39e3dabb2f05d2f9192a891c** ==
   STEP-1 baseline. Both method versions live in one table; v1 did not move.
2. **TIMING** ✓ — v1 rows with any timing column non-null: **0/145** (all v1 both null).
   v2 rows: **0** (the "every v2 row has both non-null" clause is vacuous — none written).
3. **SINGLE REFERENCE TIME** — `DISTINCT evaluation_reference_time` over v2 rows: **0
   values / 0 rows** (vacuous; the batch captured one ert `…22:23:11.844Z` but persisted
   no rows).
4. **BEYOND-HORIZON** ✓ — 263 grains classified beyond-horizon; **zero** `evidence_profiles`
   rows exist for any of them (v2 count = 0).
5. **ISOLATION (both directions)** ✓ — snapshot cross-tab: `current_poll` → only
   `self_observed` (960); `historical_query` → only `backfilled_historical` (3782). Current
   snapshots that are backfilled_historical: **0**. historical_line_results sourced from a
   current_poll snapshot: **0**. No historical row leaks into current-market state; no
   current row appears via the historical path — with two method versions live.
6. **REFERENCE TABLES** ✓ — historical_line_results **4658**; player_game_stats **4194**.
7. **IDEMPOTENCY** ✓ — re-ran the v2 populator (0 credits): `grains_observed=263,
   beyond_horizon=263, inserted=0, updated=0`; v1 count **145**, checksum **stable**
   (`91200b8e…`); v2 count **0**. Stable; the second run neither duplicated nor mutated.

## EVIDENCE (suites — all green at HEAD 4c5b3e3)
- typecheck `tsc --noEmit` → **exit 0**.
- unit suite → **573 pass / 0 fail**.
- FULL SERIAL integration (`tests/integration/*.test.ts`) → **124 pass / 0 fail**.

## CREDIT ACCOUNTING
**0 Odds credits spent** this ticket (empty prop markets are free); hard ceiling 25 never
approached. **Zero BALLDONTLIE calls.** No key printed or persisted.

## WHAT THE GOVERNOR NEEDS TO DECIDE
The code and pipeline are validated end to end on hosted, but the deliverable that defines
this ticket — persisting the FIRST v2 profile from fresh live current-market data — could
not occur because the live slate carried **no player props** in the pollable window at run
time (games with lines are ~4 days out; props post ~1–2 days before game day; the pre-existing
grains are 6–8 days stale → correctly beyond-horizon). Per the ticket, I did **not** poll a
second time, did **not** manufacture volume, and did **not** persist stale beyond-horizon
churn. **Recommendation:** re-issue V1-A2-3 unchanged once props are posted — e.g. on/after
~2026-07-27 for the 07-28/29 games — when the poll will yield fresh grains that classify
`fresh` and persist, satisfying STEP 4/STEP 5. The DR-29 first-operative-profile record
carries forward to that run.

*Live-run section generated 2026-07-24. No commit performed per ticket instruction.*

═══════════════════════════════════════════════════════════════════════════════

# V1-A2-3 — LIVE VALIDATION RUN (third attempt, 2026-07-26) — SUCCESS

**Bottom line: the first `evidence_method_v2` profiles are now PERSISTED to hosted — 99
profiles across a real 5-game slate — and every proof passes.** The founder confirmed props
are posted; this poll returned real markets (contrast the 2026-07-24 empty-market run). v1's
145 rows are byte-for-byte untouched.

## Starting state (verified)
```
HEAD 68c98cd0589002ca9d27d78c9286a4fe43a4bc67  ("...GAP-13 closed (V1-6c)")   ✓ top commit is V1-6c
git log -5: 68c98cd / d75ad0b / 2b01248 / 4c5b3e3 / bf203a5
git status --short: ?? docs/product/reports/V1_TICKET_A2_3_REPORT.md   (this report; extended, not replaced)
```
No mismatch. This ticket made **no code change** (operator work was throwaway scripts,
deleted after each run; the committed sweep/aggregator/v2-populate paths in `src/` are the
load-bearing logic).

## STEP 0 — PREFLIGHT GATES (both PASS)
**GATE A (verified, not re-derived):** (a) `line_observed_at` per grain — `populateV2.ts:116`
consumes `built.line_observed_at` from `makeV2ReadModelInputBuilder → makeReadModelInputBuilderV2Core
→ readCurrentMarketRowV2 → composeCurrentMarketRowV2 → assembleMarketRowCore` (single owner).
(b) Clock-free — zero non-comment `new Date(`/`Date.now(`/SQL `now()` across all 8 v2-path
files; the lone `new Date()` (readModelInputBuilder.ts:427) is in the v1 reader, never called
by the v2 path. (c) GAP-12 closed — V1-A2-5 proof-3 green (grains aged 301/901/1801s reach
the v2 engine with `book_count ≥ 1`).
**GATE B:** max game date **2026-09-25**; **128** scheduled at/after now; **5** games in the
next 72h (07-28/07-29). Slate ahead of today.

## STEP 1 — HOSTED BASELINE (read-only, before spend)
```
evidence_method_v1 : 145   (expected 145) ✓
evidence_method_v2 : 0     (expected 0)   ✓
v1 derived-column checksum : 91200b8e39e3dabb2f05d2f9192a891c
historical_line_results : 4658 ;  player_game_stats : 4194
```

## STEP 2 — POLL (ONE bounded sweep) — 20 credits
Discovery (`/v4/sports/basketball_wnba/events`, free — `x-requests-last=0`) → 7 valid events;
selected the **5 earliest upcoming** (ceiling guard 4×5=20 ≤ 25). All 5 resolved **exactly**
to internal games. Concurrency **3**; wall-clock **61s**; observed_at spread
**18:00:21.835 → 18:01:00.853Z** (~39s).
- **Per-event: all HTTP 200, `result_state='complete'`**, snapshots 10/12/12/12/8 = **54**,
  4 credits each. Quarantines: none. **Offerings written: 524**; snapshots linked to **5**
  games; **0 unlinked**.
- **Credit ledger (reconciled):** `discovery_before_remaining=33035`,
  `discovery_after_remaining=33015` → authoritative total **20**; `sum_of_per_call_last=20`;
  `reconciled=true`. **20 credits spent** (ceiling 25). Zero BALLDONTLIE calls.

## STEP 3 — AGGREGATE
`aggregateCurrentMarketRowsForGame` for each of the 5 linked games → rows_written
14/26/24/21/14 = **99 grains processed**; **99/99 with `eligible_book_count ≥ 1`**.

## STEP 4 — RUN v2, PERSISTING TO HOSTED
ONE `evaluation_reference_time` captured at batch start: **`2026-07-26T18:03:23.393Z`**; batch
wall-clock **323s**. `listAllGrains(hosted)` = **362** (99 fresh from this poll + 263 stale
from the prior V1-4 polls).
- **classification_age distribution:** fresh **99**, aging 0, stale-present 0, beyond-horizon
  **263** (min 143s, max 846,939s ≈ 9.8d).
- **v2 branch distribution:** fresh **99** (persisted); aging/stale-present/absent **0**;
  beyond-horizon **263** (skipped). (Live fresh poll → `fresh` grades; `stale-present` did
  NOT fire on live data — correct, fixture-proven in V1-A2-5.)
- **Counters:** `grains_observed=362, grains_skipped_no_input=0,
  grains_skipped_beyond_horizon=263, profiles_inserted=99, profiles_updated=0`.
- **Profiles PERSISTED by classification (all seven values):** strong_over **1**,
  moderate_over **25**, mixed **41**, moderate_under **18**, strong_under **1**,
  insufficient **11**, unavailable **2**. **Strong count: 2.**
- **Reason-code frequencies:** window_agreement_support 45, positive_margin_support 35,
  insufficient_book_coverage 26, incomplete_historical_coverage 11, margin_measures_disagree
  9, insufficient_l10_sample 7, no_unique_consensus_line 2.
- **Beyond-horizon:** 263 grains; **CONFIRMED zero rows inserted for them** (99 inserted =
  only the fresh grains; proof 4 below).
- **`abnormal_dispersion` never emitted** (count 0).

## STEP 5 — READ WHAT IT SAYS (explanations render UNMODIFIED)
The committed V1-A1-4 renderers (`renderFullExplanation` / `renderCompactExplanation`)
consumed the persisted v2 profiles **without any template modification**. Five verbatim,
each `classification_age = 182s` (fresh), provenance marker present ("Includes seeded
historical closing lines"), §G.1 disclosure attached:

1. **Natasha Howard · player_points · line 11.5 · Strong Over** —
   full label "Strong Over Evidence"; prose: *"Recent and longer-window results point in the
   same direction. Recent average and/or median margin support this direction."*; reasons:
   window_agreement_support, positive_margin_support; **compact: "Over-leaning"**.
2. **Kelsey Mitchell · player_points · line 21.5 · Moderate Over** — full "Moderate Over
   Evidence"; same two support reasons; **compact "Over-leaning"**.
3. **Leila Lacan · player_points · line 11.5 · Mixed** — full "Mixed Evidence"; no prose/
   reasons (mixed); **compact "Mixed"**.
4. **Flau'jae Johnson · player_assists · line — (null) · Unavailable** — full "Unavailable";
   prose: *"Eligible sportsbooks are evenly split on this line, so no single consensus line
   can be established."*; reason no_unique_consensus_line; **compact "Unavailable"** (GD-15:
   not collapsed into Insufficient).
5. **Dominique Malonga · player_points · line 17.5 · Moderate Under** — full "Moderate Under
   Evidence"; two support reasons; **compact "Under-leaning"**.

No stale-present-capped profile exists (live data produced none — expected). Every rendered
compact carries `must_never_expose_numeric_score: true`. No incompatibility found — nothing
to flag for a follow-up ticket.

## STEP 6 — THE SEVEN PROOFS
1. **v1 UNTOUCHED** ✓ — count **145**; checksum **91200b8e39e3dabb2f05d2f9192a891c** ==
   STEP-1 baseline. Two method versions now live in one table; v1 did not move.
2. **TIMING** ✓ — v1 rows with any timing non-null: **0/145**; v2 rows with BOTH non-null:
   **99/99**.
3. **SINGLE REFERENCE TIME** ✓ — `DISTINCT evaluation_reference_time` over v2 = **1**
   (`2026-07-26 18:03:23.393+00`).
4. **BEYOND-HORIZON** ✓ — **263** grains classified beyond-horizon; **0** of them have a v2
   row.
5. **ISOLATION (both directions)** ✓ — snapshot cross-tab: `current_poll` → only
   `self_observed` (1014); `historical_query` → only `backfilled_historical` (3782). Current
   snapshots that are backfilled: **0**. historical_line_results sourced from a current_poll
   snapshot: **0**. No leakage either way, with two method versions live.
6. **REFERENCE TABLES** ✓ — historical_line_results **4658**; player_game_stats **4194**.
7. **IDEMPOTENCY** ✓ — re-ran the v2 populator (0 credits): `grains_observed=362,
   beyond_horizon=263, inserted=0, **updated=99**`; v1 count **145**, checksum **stable**; v2
   count **99** (unchanged); distinct ert **1**. The second run UPDATED the 99 rows rather
   than duplicating.

## EVIDENCE (suites — all green at HEAD 68c98cd)
- `npx tsc --noEmit -p tsconfig.json` → **exit 0**.
- unit suite → **573 pass / 0 fail**.
- FULL SERIAL integration (`node --import tsx --test --test-concurrency=1 tests/integration/*.test.ts`)
  → **124 pass / 0 fail**.

## CREDIT ACCOUNTING
**20 Odds credits spent** (ceiling 25); ledger reconciled (20 = 20). **Zero BALLDONTLIE
calls.** No key printed or persisted.

## OUTCOME
The freshness re-architecture sequence is validated end to end on hosted: real read-model
rows flowed through the v2 builder (clock-free), 99 v2 profiles were persisted with both
timing columns and one shared `evaluation_reference_time`, the 263 stale grains were
correctly rejected beyond-horizon, v1's 145 rows are untouched, isolation holds with two
method versions live, the populator is idempotent, and the committed explanations render v2
profiles unmodified. The DR-29 first-operative-profile obligation is discharged by this run.

*Third-run section generated 2026-07-26. No commit performed per ticket instruction.*

═══════════════════════════════════════════════════════════════════════════════

# APPENDIX — v2 SERVING GATE VERIFICATION (governor commit-authorization STEP 1, 2026-07-26)

**Question:** does the Board's server query/service path (`apps/web`) apply the v2 SERVING
GATE — display_age computed at read time, rows with `display_age > 3600` (§5,
`T_SERVE_SUPPRESS_MAX_SECONDS`) suppressed/marked?

**Answer: NO.** (This is recorded, NOT fixed — per the authorization.)

The §5 gate is IMPLEMENTED but the Board never calls it. It exists as a pure function
(`src/evidence/v2/servingGate.ts`):
```ts
//   display_age = serve_now − line_observed_at (seconds)
//   display_age ≤ T_SERVE_SUPPRESS_MAX_SECONDS → serve.
//   display_age >  T_SERVE_SUPPRESS_MAX_SECONDS → suppress.
export function evaluateV2ServingGate(input: V2ServingGateInput): V2ServingGateOutput { … }
```
But `apps/web` contains **zero** references to it — `grep -rniE "servingGate|display_age|
serve_now|T_SERVE_SUPPRESS|suppress" apps/web` returns nothing. The Board's server query
(`apps/web/src/lib/server/boardRepository.ts` `buildBoardQuery`) filters ONLY by method and
applies **no serve-time age filter**:
```ts
     WHERE ep.method_version = $1`;
  return { text, values: [method] };
```
and the service (`boardService.ts` `getBoardData`) only ranks (`dr20Compare`) and projects —
no age gate — and the Board projection does not even carry `line_observed_at`.

**Consequence:** the Board currently serves persisted v2 rows **regardless of display age**.
Today's 99 profiles (line_observed_at ≈ 2026-07-26T18:00–18:01Z) will keep rendering well
past `display_age > 3600s`; the approved empty state will NOT return ~1h after the poll as §5
requires. **§5 forbids silent stale serves.** Recorded as **GAP-16** (OPEN; blocks nothing
today because the Board is not yet on real user traffic; MUST be resolved before any real
user traffic; UNASSIGNED). This appendix does not change any code.

*Appendix generated 2026-07-26 under governor commit authorization. No code change.*

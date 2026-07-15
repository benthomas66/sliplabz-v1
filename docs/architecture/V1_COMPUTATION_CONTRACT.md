# V1 Computation Contract

**Owning ticket:** V1-5 — Shared Computation and Read Model
**Status:** current implementation contract; may be extended by later
tickets subject to their own authority.
**Anchors:** Complete spec §12 (computation ownership), §13 (movement),
§14 (historical calculations), §15 (freshness), §16 (paid boundaries),
§7.5–§7.14 (metric definitions); Odds sub-spec §16.1, §18.1, §19.2; A1
§8 (evidence inputs); GD-6 (provisional fixtures pre-V1-9); GD-9 (four
market / provider scope lock).

---

## 1. One owner per metric

Every read-model metric has EXACTLY ONE owning source file in
`src/computation/`. The Brief and the app both consume the same functions
from that module — never their own copies. Duplicating a formula, even
under a different name, is a lint failure (see
`tests/computation/readPath.test.ts:REQUIRED: Brief/app equality`).

| Metric | Owner | Method version |
|---|---|---:|
| current market row (composed) | `src/computation/currentMarketRow.ts` | 1 |
| line consensus | `src/computation/consensus.ts` (`computeLineConsensus`) | 1 |
| line range | `src/computation/consensus.ts` (`computeLineRange`) | 1 |
| exact-point counts | `src/computation/consensus.ts` (`computePointDistribution`) | 1 |
| eligible book count | `src/computation/consensus.ts` (`computeEligibleBookCount`) | 1 |
| best price at exact point/side | `src/computation/priceComparison.ts` (`bestPriceAtExactPointSide`) | 1 |
| first-observed consensus | `src/computation/firstObserved.ts` | 1 |
| movement summary | `src/computation/movementSummary.ts` | 1 |
| freshness | `src/computation/freshness.ts` | 1 |
| per-book detail (offerings + `one_sided` RME-3) | `src/computation/bookDetail.ts` | 2 |
| availability context | `src/computation/availabilityContext.ts` | 1 |
| real-line window (L5/L10/L20/season) | `src/computation/realLineWindows.ts` (wraps V1-4 `src/lines/realLineWindows.ts`) | 1 |
| threshold window (A1 §9.2) | `src/computation/thresholdWindows.ts` | 1 |
| averages / medians | `src/computation/averagesMedians.ts` | 1 |
| sample-size label | `src/computation/averagesMedians.ts` (`computeSampleSizeLabel`) | 1 |
| historical coverage (RME-1) | `src/computation/historicalCoverage.ts` | 1 |
| mapping resolution (RME-2) | `src/computation/mappingResolution.ts` | 1 |

A method-version change is a spec-authorized change to the formula (or
a governor decision for internal metrics). Downgrades are never permitted.

---

## 2. Computation version vs. method version

Two levels of versioning per §12.3:

- **method_version** — the FORMULA. Bumped when the formula changes.
- **computation_version** — a batch tag on persisted rows. Bumped when
  a re-run at the same method version is required (e.g. a normalization
  bump upstream, or a governor-authorized reseed).

The canonical constant is
`V1_5_COMPUTATION_VERSION` in
`src/computation/computationVersion.ts` — currently **3**.
(V1-4b Phase B canonical-correction wrote version 2; V1-5 recomputes
above 2.)

Every write to a persisted derived table (`current_market_rows`,
`historical_line_results`, `real_line_windows`, `canonical_closing_points`)
stores the composition version. A downstream reader that requires "the
latest version" queries `MAX(computation_version)` at the grain.

---

## 3. Recomputation triggers (§12.2)

Consumed by the V1-5 recomputation writer
(`src/computation/driver/recomputationWriter.ts`) from the V1-2
`recomputation_invalidations` queue:

- `player_game_stat` correction (`material_stat_change`) →
  `historical_line_results` for (game, player, market); `real_line_windows`
  for (player, market, reference_date=today).
- `internal_game` status change → all players' historical results for the
  game; all downstream windows for those players.
- `internal_player` identity mapping change → all games the player has
  stats for; all their windows.

The writer is idempotent per invalidation (once processed, `processed_at`
is set; a re-run skips already-processed rows). Prior-version rows are
NEVER mutated — the write is INSERT at a bumped `computation_version`.

Additional triggers surfaced by V1-3/V1-4/V1-4b but not covered by the
existing invalidation queue (added by later tickets when they land):

- current odds snapshot changes → `current_market_rows` grain is
  refreshed by `aggregateCurrentMarketRowsForGame` (the ledger-#3 driver).
- normalization version changes (§12.2 last bullet) → the whole computation
  version is bumped; all derived rows are recomputed.
- eligibility flips (§12.2) → treated as a game-level invalidation.

---

## 4. Isolation invariants

- Current-selection queries filter on `CURRENT_ONLY_WHERE_CLAUSE`
  (`request_kind = 'current_poll' AND provenance = 'self_observed'`).
  Historical rows are structurally excluded from current metrics.
- Sportsbook-only for consensus — the ONLY gate is
  `isConsensusEligibleBookmakerKey`. DFS books never contribute.
- Never a synthetic point — every canonical/consensus point equals a
  point observed in at least one eligible sportsbook offering.
- Cross-book grouping at the `(game, player, market)` grain, per V1-4b
  lesson. See `tests/computation/consensus.test.ts:ledger #7` and the
  V1-4b `canonicalClosingPointsForSeed` regression tests.
- Prices are compared at EXACT `(point, side)` only. `bestPriceAtExactPointSide`
  never consults a different point or the opposite side.
- Stale sources are excluded from consensus per §15.2 — the composer
  passes an empty offering set to the consensus formulas when the grain's
  freshness state is not `fresh` / `aging`.
- Pushes are excluded from Over/Under denominators (§14.4) but are
  preserved in actual `n` and shown as their own count.
- Partial windows label `incomplete` and preserve actual `n` (§14.3).

---

## 5. Backfilled_historical labeling (governor ledger #8)

Per governor ledger #8, the read model is EXPLICIT per metric about
whether `backfilled_historical` provenance rows are included:

| Metric | Includes backfilled_historical? | Rationale |
|---|---|---|
| line consensus / line range / point distribution / eligible book count / book detail | **NEVER** (current selection is `self_observed` only) | Historical rows are structurally excluded from current selection (§11.4). |
| first-observed consensus (`§7.8`) | NEVER | First-observed is a SlipLabz observation only. |
| movement summary | NEVER | Movement is a self-observed transition contract (§13). |
| freshness | NEVER (label reflects `self_observed` only) | Historical snapshots are not on the freshness clock. |
| availability context | N/A | Not sourced from Odds. |
| real-line window (L5/L10/L20/season) | **YES** — real-line windows include verified historical closing lines whether from `self_observed` current-poll observations or from `backfilled_historical` seed rows. The window result carries `includes_backfilled_historical: boolean` so a consumer labeling the data as "observed by SlipLabz since launch" must filter it out. | Complete spec §14 (historical calculations) authorizes the historical seed as an input to windows. |
| threshold window (A1 §9.2) | **YES** — same policy; the result carries `includes_backfilled_historical`. | Line-relative calculations use the same underlying player-game stat sample. |
| averages / medians | **YES** — same policy; the result carries `includes_backfilled_historical`. | Same. |
| sample-size label | Reflects total `n` regardless of provenance. | Labels are truthful about sample size. |
| historical coverage (RME-1) | **YES** — `HistoricalCoverageResult.coverage_start_date` reflects both `self_observed` and `backfilled_historical` rows in `historical_line_results`; the returned shape carries `includes_backfilled_historical: boolean` per EVIDENCE_PROFILE_METHOD_V1.md DR-23. | DR-23 mandates backfilled rows count toward the windows; coverage MUST reflect the same rows to keep the DR-25 30-day predicate honest. |
| mapping resolution (RME-2) | N/A | Sourced from V1-1 identity queues, not from historical line data. |
| book_detail one_sided (RME-3) | NEVER (current selection is `self_observed` only) | Grain-level summary over the CURRENT sportsbook offering set; historical rows are structurally excluded from current selection (§11.4). |

**"Observed by SlipLabz since launch"** is a distinct product surface
concept (V1-6 / V1-7 obligation). A consumer producing that view MUST
filter `real_line_window` / `threshold_window` / `averages_medians`
results whose `includes_backfilled_historical === true`. A metric that
has `includes_backfilled_historical === false` is safe to present as
observed-since-launch.

---

## 6. Server-side capability filtering

Per §16.7 ("Protected data is never sent to an unauthorized client and
merely hidden in the interface"), the read path
(`src/computation/readPath.ts`) invokes
`filterCurrentMarketRow` which STRIPS paid-only fields from the payload
BEFORE serialization. The pre-V1-9 fixture layer:

- `CAPABILITY_ANONYMOUS`, `CAPABILITY_FREE` — no paid grants; the payload
  contains a `redacted: true` marker in place of `book_detail.offerings`
  and `availability_context`.
- `CAPABILITY_PAID` — all V1-5 paid grants set to `true`.
- `CAPABILITY_INTERNAL_ADMIN` — same as paid.

Every capability record MUST carry `source_label: 'provisional_fixture_v1_5'`.
The filter refuses any other label — production entitlement is a V1-9
obligation and MUST NOT masquerade as a V1-5 fixture.

The unauthorized-client test
(`tests/computation/readPath.test.ts:REQUIRED: an anonymous caller
receives NO paid data in the payload`) asserts on the JSON-serialized
output — proving that no paid data leaves the server through this path.

---

## 7. Driver contracts (governor ledger #1–#6)

- **Movement/lifecycle batch driver** (`driver/movementLifecycleBatch.ts`):
  Per-`(prior_snapshot, current_snapshot)` invocation. Persists all movement
  events + drives lifecycle state through `transitionPresence`. A
  `requires_new_lifecycle_row === true` outcome inserts at `generation + 1`;
  the prior generation is NEVER mutated. Point transitions across grains
  emit `point_removed` + `point_added` + linked `point_changed` when
  unambiguous. Failed polls never advance confirmed-removal.
- **Recomputation writer** (`driver/recomputationWriter.ts`) — revised
  per governor 2026-07-13. Drains `recomputation_invalidations` with
  `FOR UPDATE SKIP LOCKED`. Per claimed invalidation, a single
  `withTransaction` block runs (1) read of corrected source state,
  (2) UPSERT into `historical_line_results` on
  `ON CONFLICT ON CONSTRAINT historical_line_results_grain_version_unique
  DO UPDATE SET` restricted to the recomputable derived columns,
  (3) UPSERT into `real_line_windows` on `ON CONFLICT (…) DO UPDATE SET`
  on the recomputable stat columns, (4) `UPDATE
  recomputation_invalidations SET processed_at, processed_note` where
  `processed_note` records the per-invalidation disposition
  (`'recomputed'` or `'no_eligible_source'`, never a constant). Every
  derived write verifies `rowCount === 1` and throws on mismatch —
  the transaction rolls back. Prior-version rows are IMMUTABLE per §12.3:
  the additive migration
  `20260713000000_historical_line_results_unique_includes_computation_version.sql`
  extends the UNIQUE to include `computation_version` so version bumps
  insert new rows alongside older ones. Consumers reading
  `historical_line_results` MUST select the latest `computation_version`
  per grain — use `src/computation/historicalLineResultsRead.ts`
  (`readLatestHistoricalForPlayer`, `readLatestHistoricalForGame`).
  Never relabels coverage — `real_line_windows.coverage_label` is the
  unrestricted `coverage_label` enum per its migration (line 82); all five
  values are legitimately admitted and written as-is.
- **Current market rows aggregator** (`driver/currentMarketRowsAggregator.ts`):
  Reads current offerings via `CURRENT_ONLY_WHERE_CLAUSE`; composes via the
  shared read model; upserts one row per `(game, player, market,
  computation_version)`.
- **BDL post_final reconciliation drain** (`driver/postFinalReconciliationDrain.ts`):
  `pickDueReconciliations` reserves due rows with `FOR UPDATE SKIP LOCKED`;
  `markReconciliationCompleted` finalizes them. No external cron.
- **Odds event-presence driver** (`driver/eventPresenceDriver.ts`):
  Advances `oddsapi_event_presence` only for COMPLETE event-discovery runs.
  Single omission → `single_omission`; second → `confirmed_removed`;
  reappearance is HELD (state frozen, `observed_changed_at` set for the
  caller to react).
- **Registry loader** (`registry/registryLoader.ts`):
  Seeds `bookmaker_registry` + `market_registry` from `V1_BOOKMAKER_ALLOWLIST`
  + `LAUNCH_MARKET_KEYS`. Refuses any key outside the constants.

---

## 8. Recompute-tool scoping caution (governor ledger #9)

V1-4b's `deleteAndReplaceCanonicalClosingPointsFromDb` with
`restrict_to_internal_game_ids=null` was authorized while
`canonical_closing_points` contained SEED data exclusively. That
condition still holds after V1-5 — V1-5 does not add a live close-capture
writer that would introduce live-observed canonical rows into the same
table (the Stage 1 seed pipeline is the only writer). Therefore V1-5 does
NOT deliver live close-capture wiring, and the tool remains safe as
authored for the pre-launch initial seed.

**Forward obligation (recorded here per governor):**
BEFORE any live close-capture driver goes operational, that tool MUST be
scoped or provenance-aware — either by requiring
`restrict_to_internal_game_ids != null` or by adding a provenance filter
on the DELETE. The ticket that adds live close-capture writes to
`canonical_closing_points` (a later V1 ticket, not V1-5) inherits this
hardening obligation.

---

## 9. V1-5x — Read-Model Extensions for the Evidence Engine

Delivered by ticket V1-5x per `docs/product/EVIDENCE_PROFILE_METHOD_V1.md`
§I.2 (V1-5x prerequisite ruling). Three read-model-owned inputs the
evidence engine (V1-A1-3) will consume verbatim. Engine-side parallel
derivation is FORBIDDEN by the single-owner invariant in §1.

### RME-1 — `HistoricalCoverageResult`

- **Owner:** `src/computation/historicalCoverage.ts`.
- **Grain:** per (`internal_player_id`, `market_key`).
- **Source of truth:** `historical_line_results` (`coverage_state IN ('complete', 'single_book')`,
  latest `computation_version` per grain via `DISTINCT ON`) joined to
  `games.scheduled_start_utc` for the observation date.
- **Shape (see `src/computation/types.ts`):**
  `{ internal_player_id, market_key, coverage_start_date: string | null,
     eligible_game_count, includes_backfilled_historical, method_version,
     computation_version }`.
- **`coverage_start_date` type choice:** ISO-8601 date string
  (`YYYY-MM-DD`, UTC-day). Chosen so the DR-25 30-day predicate
  reduces to whole-day arithmetic — no timezone ambiguity, no timestamp
  precision mismatches. Null when no eligible row exists.
- **Backfilled stance (DR-23):** rows with
  `provenance = 'backfilled_historical'` count toward coverage; the
  returned shape's `includes_backfilled_historical` boolean surfaces that
  stance visibly. This mirrors the read-model contract in §5 for
  threshold windows and real-line windows.
- **DR-25 predicate:** `satisfiesDR25ThirtyDayCoverage(coverage, today_utc_date)`
  returns `(today - coverage_start_date) >= 30 days`; false when
  `coverage_start_date === null`. A change to the 30-day threshold
  requires a governor decision under DR-24.

### RME-2 — `MappingResolutionResult`

- **Owner:** `src/computation/mappingResolution.ts`.
- **Grain:** per (`internal_player_id`, `internal_game_id`).
- **Source of truth:** V1-1 identity queues
  (`player_reconciliation_queue`, `event_reconciliation_queue`) filtered
  to `resolution = 'open'` and matched by
  `candidate_internal_player_ids` / `candidate_internal_game_ids`
  containment. Reason vocabularies (`player_queue_reason`,
  `event_queue_reason`) are reused verbatim — no parallel enum is
  introduced.
- **Shape (see `src/computation/types.ts`):**
  `{ internal_player_id, internal_game_id, player_resolved: boolean,
     event_resolved: boolean, queue_reason: string | null, method_version }`.
- **`queue_reason` composition rule:** null when both are resolved;
  otherwise the raw V1-1 enum value from the offending queue. When BOTH
  are unresolved, the PLAYER queue's reason wins (EVIDENCE_PROFILE_METHOD_V1.md
  §C.9 lists `UNRESOLVED_PLAYER_MAPPING` before `UNRESOLVED_EVENT_MAPPING`).
  Both booleans remain independently visible so V1-A1-3 can attach both
  `UNRESOLVED_PLAYER_MAPPING` and `UNRESOLVED_EVENT_MAPPING` if it
  chooses.
- **Read-only:** the reader is a `SELECT` pair — no `INSERT`, `UPDATE`,
  `DELETE`, or advisory lock against the identity layer. V1-1 remains the
  sole owner of writes to queues, `mapping_history`, and `provider_*`
  tables (`V1_IDENTITY_CONTRACT.md`).

### RME-3 — `BookDetailResult.one_sided`

- **Owner:** `src/computation/bookDetail.ts` (extends the pre-existing
  book-detail owner; method_version bumped `1 → 2`).
- **Grain:** the (`internal_game_id`, `internal_player_id`, `market_key`)
  grain already computed by `composeCurrentMarketRow`.
- **Enum:** `'over_only' | 'under_only' | 'neither' | null` — exactly
  the values named by EVIDENCE_PROFILE_METHOD_V1.md §A.4.
- **Derivation:** grain-level scan over the eligible sportsbook
  `CurrentOffering` set (V1-3 stores `over_price` / `under_price`
  independently per offering row). `'over_only'` when at least one
  Over quote exists and NO Under quote exists anywhere in the aggregate;
  `'under_only'` symmetrically; `'neither'` when both sides appear;
  `null` when the offering set is empty or no prices are non-null.
  The missing side is NEVER fabricated.
- **DR-18 satisfaction:** V1-A1-3 §C.7 reads
  `book_detail.one_sided ∈ {'over_only', 'under_only'}` directly to
  attach `ONE_SIDED_OFFERING`, clamp `C_MA := 0`, and cap the profile
  at Moderate — no evaluated-point relativity is required at the read-
  model boundary.
- **Capability-filter behavior:** `book_detail.offerings` remains paid-
  gated per `view_book_detail`. `book_detail.one_sided` is truth-about-
  availability per §16.8 ("truth is never paywalled") and is preserved
  on redaction — the redacted marker still carries the classification.

### V1-5x — what this ticket does NOT change

- No new migrations. The three fields derive from existing storage
  (`historical_line_results`, `games`, `player_reconciliation_queue`,
  `event_reconciliation_queue`, live `CurrentOffering[]`).
- `current_market_rows` continues to store only the summary columns it
  stored before V1-5x; `book_detail.one_sided` is recomputed by the
  composer on demand (same design as `book_detail.offerings`).
- No engine work, no evidence classifications, no reason-code emission.
  V1-A1-3 remains a separate ticket.

---

## 10. What this document does not authorize

Consistent with GD-1, GD-6, GD-9, and A1:

- No product surfaces / UI (V1-6–V1-8).
- No evidence-engine work (V1-A1-1 through V1-A1-4).
- No production entitlement enforcement — Stripe, real accounts,
  authorization checks against real user identity (V1-9).
- No live provider calls in V1-5 code paths.
- No CI/CD wiring.
- No hosted Supabase project creation (V1-4b hosted setup stands).

Later tickets may extend, but only inside their own scope.

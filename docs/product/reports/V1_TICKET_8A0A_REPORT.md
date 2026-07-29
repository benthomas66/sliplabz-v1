# V1-8a0a — Complete threshold-relative series persistence + hosted migration

**Status: COMPLETE. Hosted schema deployed (54 → 56). Producer awaits commit
authorization. Nothing committed. Frozen authorities & reader contract untouched.**

**Starting state (verified):** branch `main`, HEAD
`f274d5f765af3582f075bacad9f084aec02b0bec` (match). Untracked at start: only the two
founder `docs/research/` files (left untouched) plus this ticket's own prior halt
report (regenerated here). `git log --oneline -3`: `f274d5f` (V1-GOV-6) · `6f39f48`
(V1-8a0b) · `49f0a81` (V1-8a0).

---

## STEP 0 — the three determinations

### (1) THE JOIN KEY — resolved under Amendment 21 (was the prior halt)

The canonical stable game identity is **`internal_game_id`** (`games` PK; the game
component of `historical_line_results`'s unique grain key
`(internal_game_id, internal_player_id, market_key, computation_version)`). There is
NO uniqueness on `scheduled_start_utc` or `(player, date)` — the only `games`
constraint is `games_pkey PRIMARY KEY (internal_game_id)` — so `game_date` is not a
valid key and was not used.

**Amendment 21 (reader side).** The frozen `HistoricalSeriesRow` gained EXACTLY ONE
field, `internal_game_id`, projected UNCHANGED from the `player_game_stats` row
already joined in the committed query:

```sql
-- BEFORE                                    AFTER (one added projected column)
SELECT                                       SELECT pgs.internal_game_id::text AS internal_game_id,
       to_char(g.scheduled_start_utc ...     to_char(g.scheduled_start_utc ...
```

Everything else in the reader is byte-identical: same `WHERE
pgs.internal_player_id = $1::uuid`, same `ORDER BY g.scheduled_start_utc ASC`, same
`player_game_stats/games/teams/hlr` joins, same six other fields, same eligibility/
DNP/provenance semantics. `pgs.internal_game_id` was ALREADY the join column
(`JOIN games g ON g.internal_game_id = pgs.internal_game_id`) — no new read, no new
join, no synthesis.

**Amendment 18 (computation side).** `internal_game_id` (already present in the
builder's `latest` CTE) is now projected into `ThresholdWindowGame` and carried
through `computeThresholdWindow` into the exposed per-game outcome — copied
unchanged, no lookup, no synthesis:

```sql
SELECT latest.internal_game_id::text AS internal_game_id,   -- ← added (was in the CTE already)
       to_char(g.scheduled_start_utc ...) AS game_date_utc,
       latest.player_stat_value::float8 AS player_stat_value,
       latest.provenance = 'backfilled_historical' AS is_backfilled_historical
```

**The join** (`buildSeries`, `readModelInputBuilder.ts`): each frozen requested
position is associated to its eligible outcome on `internal_game_id` (a `Map`
lookup). It is TOTAL and EXACT because both sides derive their eligible set from the
same `coverage_state IN ('complete','single_book')` predicate keyed by
`internal_game_id`; the join asserts `reader-eligible (stat_value non-null) ⟺ present
in the eligible outcome set` and fails loud on any mismatch (data-integrity fault,
never repaired). Verified against Docker (integration test) — 5/5 eligible matched,
2/2 DNP/ineligible carry no verdict.

### (2) SERIES SHAPE — window membership proven (one series suffices)

ONE profile-level series is persisted (not one per window). The four distinct things
Amendment 19 warns against conflating, and how the four Board windows are reproduced:

| concept | in the persisted series |
|---|---|
| **requested chronological positions** | ALL rows (every `player_game_stats` position; 7 in the test), `ordinal` ASC |
| **eligible observations** | rows with `position_kind = 'eligible'` (5 in the test) |
| **computation membership (a window)** | the **N most-recent eligible observations**: L5→5, L10→10, L20→20, season→all |
| **display membership** | a Board rendering concern — out of scope here |

`position_kind = 'eligible'` is the SAME eligible set the committed
`computeThresholdWindow` operates on: `computeThresholdWindow` computes over
`eligible = games_reverse_chron.slice(0, N)` where `games_reverse_chron` is the
eligible (counted) set; the join proves `position_kind='eligible' ⟺ that set` (same
predicate, same `internal_game_id`). Therefore selecting the N most-recent
`position_kind='eligible'` rows (by `ordinal` DESC) reproduces each window EXACTLY,
using only persisted metadata (`ordinal` + `position_kind`) — **no additional
authoritative membership metadata is required, so no fallback to one-series-per-window
is needed.** Determinism: `ordinal` gives the chronological order; `internal_game_id`
is the stable row identity; both are persisted and unique per profile
(`eps_profile_ordinal_unique`, `eps_profile_game_unique`). Reconciliation with the
V1-8a0 window aggregates holds: `season.eligible_n == count(position_kind='eligible')`.

**Display membership (recorded for V1-8a2; NOT implemented here).** A window's Strip
renders the chronological span from the Nth-most-recent `position_kind='eligible'`
position through the most recent position, INCLUSIVE of any
`position_kind='ineligible'` positions interleaved within that span. Ineligible
positions occupy their chronological place and carry no verdict (Grammar §2.2: "their
absence is information"; chronological omission locations are themselves evidence). An
L10 Strip therefore renders MORE than ten cells whenever a DNP falls inside the span.
Computation membership (which games the window's counts are computed over) remains the
N eligible observations and is unaffected. V1-8a2 MUST implement this rule and must
not invent a different one; the persisted series supports it directly via `ordinal`
(chronological span) + `position_kind` (eligible anchor vs interleaved no-verdict
position).

### (3) THE EXTENSION'S EXACT SHAPE

`computeThresholdWindow` additionally returns
`games_evaluated: ReadonlyArray<ThresholdWindowGameOutcome>` —
`{ internal_game_id?, game_date_utc, player_stat_value, outcome }` per game of the
window's eligible slice, in the same reverse-chronological order. `outcome` is the
**already-computed** per-game comparison the count loop performs
(`> threshold → above`, `< threshold → below`, else `equal`) — retained, not
recomputed. Nothing derived, nothing reordered, nothing added beyond retaining the
transient. For `season` this covers every eligible game (the full slice), which is
what the join consumes.

---

## SCOPE A — interface extension: the six proofs

1. **No new computation.** `outcome` is the identical `>/</=` comparison the count
   loop already runs (`thresholdWindows.ts:89-91`); it is pushed into an array
   instead of only incrementing a counter. Proven by the Scope A unit test:
   `count(above/below/equal in games_evaluated) === count_above/below/count_below`.
2. **No threshold change.** Same `threshold` parameter / same `evaluated_line`.
3. **No classification change.** `computeThresholdWindow` does not classify; the v2
   engine does not consume `games_evaluated` (grep-confirmed) — v2 method regression
   + serialization audit green.
4. **No score change.** Composite score untouched; engine ignores the new field.
5. **No semantic change.** Every aggregate field (counts/avg/median/streak/coverage)
   is byte-identical — `windows.test.ts` field-by-field assertions unchanged and pass.
6. **Existing outputs value-equivalent.** `games_evaluated` is OPTIONAL on
   `ThresholdWindowResult`, so the committed §F worked-example fixtures
   (`fFixtures.ts`) and every v2 fixture are **byte-identical** (no fixture literal
   changed). Full root unit (578) + integration (143) + v2 regression green.

**On the optional `internal_game_id?` in `ThresholdWindowGameOutcome` (a join key).**
The field is typed optional ONLY so a windows-only consumer that persists no series
(the app's fixture research repository) may omit it without a forbidden RV change; the
production populate path (`readHistoricalGamesForPlayerMarket`) ALWAYS supplies it. An
absent identity CANNOT cause a silent skip: `buildSeries` throws
`'…an eligible per-game outcome is missing internal_game_id (Amendment 18 join key
lost).'` the moment it encounters an eligible outcome without an id — before building
the join map — and additionally the `reader-eligible ⟺ outcome-present` invariant
throws on any mismatch. A dropped join key fails the population loudly; it is never
silently skipped or defaulted.

---

## SCOPE B — schema (proven on local Docker, then hosted)

One additive migration `20260728130000_evidence_profile_series.sql` — the
`profile → series` child relation. Constraints proven (local + hosted identical):

```
p  evidence_profile_series_pkey            PRIMARY KEY (series_position_id)
f  ..._evidence_profile_id_fkey            FOREIGN KEY (evidence_profile_id)
                                            REFERENCES evidence_profiles ON DELETE CASCADE   (confdeltype=c)
u  eps_profile_game_unique                 UNIQUE (evidence_profile_id, internal_game_id)   -- no dup game rows
u  eps_profile_ordinal_unique              UNIQUE (evidence_profile_id, ordinal)            -- deterministic order
c  eps_position_kind_check                 CHECK (position_kind IN ('eligible','ineligible'))
c  eps_outcome_discriminated_check         CHECK ((position_kind='eligible'   AND outcome IN ('above','below','equal'))
                                                OR (position_kind='ineligible' AND outcome IS NULL))
   eps_profile_idx                         INDEX (evidence_profile_id)
```

- **Discriminated "no verdict":** `position_kind` is the discriminant; `outcome` is
  present ONLY on eligible positions and `NULL` (no verdict) on ineligible/DNP,
  enforced by the CHECK — never an ambiguous nullable an eligible consumer could
  misread. DB rejection of `ineligible+outcome` and `eligible+null` verified.
- **No paid offering values** (no book/price/side/timestamp/per-source handle);
  `stat_value` is the factual player stat, `evaluated_line` the same consensus
  threshold V1-8a0 already persists. **No composite score.** `real_line_windows`
  not overloaded.

---

## SCOPE C — writer: fidelity, same-event, atomicity

Extended `writeV2EvidenceProfile` to persist the series alongside the profile,
reasons, window aggregates, and source identities:

- **Persistence fidelity (schema mapping only).** The JOIN happens upstream
  (`readModelInputBuilder` Step 4b); the writer maps each `input.series` position
  1:1 to a row — `ordinal` = the array index (reader chronological order preserved),
  `position_kind`/`outcome` = the discriminated verdict mapped to storage. No
  reorder/recompute/normalize/infer/repair. Integration test asserts the read-back
  series is **field-for-field identical** to the joined bundle across all 7 positions.
- **Same evaluation event.** `input.series` rides on the SAME `input` object that
  produced `result`, under the SAME `evidence_profile_id`, in the SAME transaction.
- **Atomicity.** Profile + reasons + window aggregates + source identities + series
  all write in one `tx`. Integration test forces a mid-transaction failure AFTER the
  series write and asserts **zero** series rows remain (rollback, no partial state).
- **REPLACE semantics.** Delete-then-insert; re-persisting the same grain refreshes
  (7 rows, not 14) — asserted.
- When `input.series` is absent (engine-only callers) the series table is left
  UNTOUCHED — never wiped.

---

## SCOPE D — read support + GAP-20

- `readEvidenceInputBundle` / `readEvidenceInputBundlesBatched` now return the series
  with a **typed** `available` / `unavailable_not_persisted` sub-state. A legacy
  profile (windows but no series) reports the series `unavailable_not_persisted`
  (asserted) — distinct from a genuine empty series.
- **No N+1.** The batched reader issues exactly **3 bounded queries** (window +
  source + series, each `= ANY($ids)`) regardless of profile count — asserted by
  wrapping `tx.query` and counting (`queries === 3`).
- **GAP-20 closed.** The committed integration test invokes the REAL
  `readHistoricalSeries` against Docker and asserts its frozen contract: 7 positions
  oldest→newest; every row a non-empty stable `internal_game_id` (unique);
  DNP (`minutes_status='dnp'`, `non_participation`) and ineligible (`quarantined`)
  positions present with `stat_value=null` holding chronological place; counted rows
  carry stat + `eligibility_state='eligible'`; backfilled provenance reflected;
  opponent + home/away carried. (The gap register's GAP-20 is thereby discharged.)

---

## AMENDMENT 21 — governance proofs

**Eleven-plus conditions on the single-field contract extension — all satisfied:**
identity already exists in the committed query input (`pgs.internal_game_id`, already
joined) · no new database read · no additional join · no identity synthesized · no
date/opponent/ordinal surrogate · no ordering change (`ASC` unchanged) · no predicate
change · no eligibility/DNP semantic change · no provenance change · no existing field
renamed/removed/altered · **no second field added** · existing consumers observably
identical (below).

**Server-side-only containment (mechanical proof, exercised).**
- The Research View consumer mechanically **ignores** the new field with ZERO
  changes: `constructResearchProjection` maps series via the named-field picker
  `toSeriesEntry` (no spread), and `ResearchSeriesRow`/`ResearchSeriesEntry` do not
  even declare `internal_game_id`. **No RV type/impl/fixture/test change was required
  or made** (Amendment 21's "ideally none" outcome; app is byte-unchanged).
- The guard `assertResearchProjectionKeySet` was EXERCISED with an object CONTAINING
  `internal_game_id` → it **throws** (rejection). `internal_game_id ∈
  RESEARCH_PROJECTION_FORBIDDEN_KEYS`, `∉` the exact allowlist.
- **Serialization canary:** `constructResearchProjection` run over a candidate whose
  series rows CARRY `internal_game_id` at runtime (the widened-reader scenario)
  produces a projection whose full serialization contains **no** `internal_game_id`
  key or value — the field is mechanically dropped; no generic spread can bypass the
  exact-allowlist guard (which every projection passes before it can be served).
- **Read-path containment:** the persisted series is recovered server-side with the
  identity (`PersistedSeriesPosition.internal_game_id`, a trusted server-side type);
  it is consumed by NO browser projection in this ticket (V1-8a1 owns Board
  consumption later), so it cannot enter a client response.

**Contract re-freeze.** The shared reader contract is RE-FROZEN as: all previously
authorized inputs, fields, ordering, nullability, eligibility/provenance/DNP
semantics, PLUS the single server-side-only `internal_game_id`. No further contract
change is authorized inside V1-8a0a. (Header of `historicalSeriesRead.ts` records
this verbatim.)

---

## SCOPE E — hosted migration (the deployment boundary)

**Amendment 20 pre-checks (read-only) — all five PASS:**
1. Hosted migration state retrieved (latest recorded `20260726120000` poll_cycles).
2. Predecessor count **exactly 54**.
3. Neither pending version (`20260728120000`, `20260728130000`) already recorded (0 rows).
4. Target is the intended project — session pooler, `postgres` DB; the **54-count
   cross-checks the governance state's recorded hosted count**.
5. Endpoint is the **SESSION pooler** `aws-0-ca-central-1.pooler.supabase.com:5432`.

**Applied both migrations via the session pooler (transactional, with in-script
re-guards):**
```
BEFORE count = 54
  ✓ committed 20260728120000  (evidence_profile_evidence_inputs — V1-8a0, local-only until now)
  ✓ committed 20260728130000  (evidence_profile_series — this ticket)
AFTER count = 56
recorded: 20260728120000 evidence_profile_evidence_inputs · 20260728130000 evidence_profile_series
child tables present: evidence_profile_window_aggregates · evidence_profile_source_identities · evidence_profile_series
```

**Post-apply verification (hosted):** count **54 → 56**; both versions recorded; all
three child tables exist; `evidence_profile_series` PK + FK cascade + both uniqueness
constraints + both CHECKs + index present; **0 rows** (no producer, no population).
**No producer code committed or pushed. No production population run. No credits
spent.**

**First-cycle timing / deployment-observation gate.** The GitHub Actions
`poll-cycle` runs every 15 minutes. The first governed population occurs on the next
scheduled cycle AFTER the governor pushes the producer (a separate commit
authorization) — i.e. the next `:00/:15/:30/:45` boundary following that push. Per
Scope E.4 that population is **NOT** auto-accepted: a separate deployment-observation
operations ticket must verify the workflow used the authorized commit, population
succeeded with no missing-table/constraint error, new profiles carry aggregates +
identities + a complete series, DNP/ineligible positions hold chronology with no
verdict, no paid field entered the series, and no unexpected credit/duplicate. That
observation is required before V1-8a1 consumes hosted series data.

---

## Acceptance

1. **Requested chronology from V1-8a0b** — series positions come from the frozen
   reader (now +`internal_game_id`), unmodified. ✓
2. **Threshold-relative outcomes from the authorized interface extension** — six
   proofs above. ✓
3. **ONE complete persisted series** — every requested position present;
   DNP/ineligible hold place with no verdict; chronologically ordered (`ordinal`);
   deterministic. ✓
4. **Persistence fidelity** — field-for-field, independently asserted from the joined
   bundle. ✓
5. **Atomicity** across profile + aggregates + identities + series. ✓
6. **Legacy profiles** typed `unavailable_not_persisted` for the series, distinct
   from empty. ✓
7. **GAP-20 closed** — committed integration test executes the shared reader's SQL and
   asserts its frozen contract. ✓
7b. **Amendment 21 proofs** — all conditions; guard exercised; containment canary;
   re-freeze recorded. ✓
8. **Hosted migration success** — 54 → 56, all child tables + constraints. ✓
9. **No N+1** — 3 bounded queries. ✓
10. Frozen authorities / Grammar / Parity **byte-identical**; **no Research View
    change** (app byte-unchanged). ✓
11. Full test accounting below — green, none weakened. ✓

---

## Test accounting

| group | command | exit | pass | fail | skip | duration |
|---|---|---|---|---|---|---|
| root typecheck | `tsc --noEmit` | 0 | — | 0 | — | ~1s |
| app typecheck | `apps/web tsc --noEmit` | 0 | — | 0 | — | ~1s |
| root unit | `node --test tests/** (excl integration)` | 0 | 578 | 0 | 0 | 0.86s |
| integration (serial) | `npm run test:integration` (DB up) | 0 | 143 | 0 | 0 | 33.9s |
| app fast | `apps/web npm test` (DB up) | 0 | 55 | 0 | 0 | 0.6s |
| serialization audit | `apps/web npm run audit` | 0 | 14 | 0 | 0 | build ✓ + ~7s |
| Amendment 21 containment | scratchpad proof (exercises real guard + projection) | 0 | PASS | 0 | 0 | — |

Deltas vs pre-ticket: root unit +1 (Scope A test: 577→578), integration +6 (new
V1-8a0a suite: 137→143). No suite weakened; no existing assertion changed except the
two `windows.test.ts` `ThresholdWindowGame` literals gaining the newly-threaded
`internal_game_id` (a non-weakening input addition; those tests still assert the same
aggregate outputs).

---

## Git status (`--short --untracked-files=all`) — every path classified

```
 M src/computation/historicalSeriesRead.ts             Amendment 21: +internal_game_id (one projected column)
 M src/computation/thresholdWindows.ts                 Amendment 18 + Scope A: threaded id + games_evaluated
 M src/computation/types.ts                            Scope A: optional games_evaluated on ThresholdWindowResult
 M src/evidence/driver/readModelInputBuilder.ts        Amendment 18 projection + the authorized join (buildSeries)
 M src/evidence/types.ts                               series types + optional EvidenceProfileInput.series
 M src/evidence/v2/readEvidenceInputs.ts               Scope D: series read + typed availability (3 bounded queries)
 M src/evidence/v2/writerV2.ts                          Scope C: atomic series persistence (REPLACE)
 M tests/computation/windows.test.ts                    Scope A proof + threaded id on 2 literals (non-weakening)
?? supabase/migrations/20260728130000_evidence_profile_series.sql   Scope B migration (applied local + hosted)
?? tests/integration/v1_8a0a_series.integration.test.ts             GAP-20 + persistence/atomicity/replace/legacy/N+1
?? docs/product/reports/V1_TICKET_8A0A_REPORT.md                     this report
?? docs/research/PICKFINDER_WNBA_AUDIT.md                            founder file — untouched
?? docs/research/PickFinder_WNBA_Audit_Clusters_1-6_Consolidated.md  founder file — untouched
```

No `apps/` file changed. Frozen method authorities, Grammar, Parity Spec, engine core,
classifier, D-A1 thresholds, and the v1 writer are byte-identical. **HEAD unchanged
(`f274d5f`); nothing staged; nothing committed.** The hosted schema is deployed and
empty, awaiting the governor's producer commit authorization.

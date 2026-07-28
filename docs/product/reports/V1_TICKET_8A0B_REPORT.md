# V1-8a0b — Shared historical-series reader (architectural ownership)

**Ticket type:** architectural ownership (not a feature). Establish ONE authoritative
owner of historical-series retrieval in `src/`, make the Research View a CONSUMER.
Persists nothing, renders nothing, changes no behaviour.

**Starting HEAD (verified):** `49f0a81d79cee69b3cbfa2be28735c2d5603fbd8` — MATCH.

**Outcome:** one reader, one owner. The V1-7b app-side `readSeries` implementation
was MOVED verbatim into `src/computation/historicalSeriesRead.ts`
(`readHistoricalSeries`); the Research View now consumes it and its own copy was
deleted. Nothing committed.

---

## STEP 0 — inventory & verification (reported before moving)

### (a) The current app-side reader, in full

From `apps/web/src/lib/server/researchRepository.ts` (V1-7b), the `private async
readSeries` method and its SQL — the ONLY implementation of the historical series:

```ts
private async readSeries(
  tx: Tx, internal_game_id: string, internal_player_id: string, market_key: string,
): Promise<ReadonlyArray<ResearchSeriesRow>> {
  const r = await tx.query(
    `WITH hlr AS (
       SELECT DISTINCT ON (internal_game_id)
              internal_game_id, player_stat_value, provenance, computation_version
         FROM historical_line_results
        WHERE internal_player_id = $2::uuid
          AND market_key = $3
          AND coverage_state IN ('complete', 'single_book')
        ORDER BY internal_game_id, computation_version DESC, computed_at DESC
     )
     SELECT to_char(g.scheduled_start_utc AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS game_date_utc,
            COALESCE(ot.display_name, '') AS opponent_label,
            pgs.is_home AS is_home,
            CASE WHEN hlr.internal_game_id IS NOT NULL THEN hlr.player_stat_value::float8 ELSE NULL END AS stat_value,
            pgs.eligibility_state::text AS eligibility_state,
            pgs.minutes_status::text AS minutes_status,
            COALESCE(hlr.provenance = 'backfilled_historical', false) AS includes_backfilled_historical
       FROM player_game_stats pgs
       JOIN games g ON g.internal_game_id = pgs.internal_game_id
       LEFT JOIN teams ot ON ot.internal_team_id = pgs.internal_opponent_team_id
       LEFT JOIN hlr ON hlr.internal_game_id = pgs.internal_game_id
      WHERE pgs.internal_player_id = $1::uuid
      ORDER BY g.scheduled_start_utc ASC`,
    [internal_player_id, internal_player_id, market_key],
  );
  // NOTE: $1 (series scope: the player's games) and $2 (hlr filter) are the
  // same player id; internal_game_id is not filtered — the series spans the
  // player's window, not just the anchor game.
  void internal_game_id;
  return (r.rows as ReadonlyArray<{ ... }>).map((x) => ({ ... }));
}
```

**Semantics (borrowed, not authored):**
- **Eligibility / DNP** read verbatim off the PERSISTED columns
  `player_game_stats.eligibility_state` (enum `player_stat_eligibility`) and
  `.minutes_status` (enum `bdl_minutes_status`) — the stored output of the
  committed `src/bdl/eligibility.ts computeEligibility`. Re-authored nowhere.
- **Counted / has-a-line** set anchored to `historical_line_results` under the
  committed predicate `coverage_state IN ('complete','single_book')`, DISTINCT ON
  `internal_game_id` taking the latest `computation_version`/`computed_at`.
- **Opponent** = `teams` join on `pgs.internal_opponent_team_id`;
  **home/away** = `pgs.is_home`; **date** = `games.scheduled_start_utc` (UTC).

**Caller:** `PostgresResearchRepository.queryResearchGrain` (line 183) —
`const series = await this.readSeries(tx, internal_game_id, internal_player_id, market_key);`.
Sole caller.

### (b) Placement in `src/`

`src/computation/historicalSeriesRead.ts` — sibling of the existing committed
neighbours `src/computation/historicalLineResultsRead.ts` and (one level over)
`src/evidence/driver/readModelInputBuilder.ts`. This is where read-model /
historical retrieval already lives; the file name mirrors `historicalLineResultsRead.ts`.

### (c) Connection ownership

The app reader already takes a **caller-supplied** `tx: Tx`
(`src/db/transaction.ts` — `{ query(sql, params?) => Promise<{rows,rowCount}> }`).
No pool is opened inside the reader. The move preserves this exactly, so both
consumers supply their own connection/transaction: the Research View passes its
transaction-pooler `tx`; the V1-8a0a population path will pass its own. **No
connection-ownership change was required.** (Confirmed: no HALT.)

### (d) Requested-window completeness

The reader is anchored on `player_game_stats` with a **LEFT JOIN** to `hlr`
(`historical_line_results`). It therefore returns **ALL** games the player has a
`player_game_stats` row for — INCLUDING DNP and ineligible games — with
`stat_value = NULL` where there is no eligible line result. DNP/ineligible
positions hold their chronological place (Grammar §2.2: "their absence is
information"); they are not filtered out. **The reader returns the complete
requested window, not just the eligible subset.** (Confirmed: no HALT.)

---

## Amendment 16 — SQL IDENTITY (before / after, side by side)

The executed SQL text and the bound-parameter array are **character-for-character
identical** across the move. The only differences anywhere in the transition are
import paths / module names / parameter plumbing / comments — **zero**
predicate / join / ordering / projection / semantic-alias / optimizer changes.

| | BEFORE (`apps/web` `readSeries`) | AFTER (`src` `readHistoricalSeries`) |
|---|---|---|
| CTE | `WITH hlr AS (SELECT DISTINCT ON (internal_game_id) internal_game_id, player_stat_value, provenance, computation_version FROM historical_line_results WHERE internal_player_id = $2::uuid AND market_key = $3 AND coverage_state IN ('complete','single_book') ORDER BY internal_game_id, computation_version DESC, computed_at DESC)` | *(identical)* |
| SELECT list | `to_char(g.scheduled_start_utc AT TIME ZONE 'UTC','YYYY-MM-DD') AS game_date_utc, COALESCE(ot.display_name,'') AS opponent_label, pgs.is_home AS is_home, CASE WHEN hlr.internal_game_id IS NOT NULL THEN hlr.player_stat_value::float8 ELSE NULL END AS stat_value, pgs.eligibility_state::text AS eligibility_state, pgs.minutes_status::text AS minutes_status, COALESCE(hlr.provenance = 'backfilled_historical', false) AS includes_backfilled_historical` | *(identical)* |
| FROM / JOIN | `FROM player_game_stats pgs JOIN games g ON g.internal_game_id = pgs.internal_game_id LEFT JOIN teams ot ON ot.internal_team_id = pgs.internal_opponent_team_id LEFT JOIN hlr ON hlr.internal_game_id = pgs.internal_game_id` | *(identical)* |
| WHERE / ORDER | `WHERE pgs.internal_player_id = $1::uuid ORDER BY g.scheduled_start_utc ASC` | *(identical)* |
| Params | `[internal_player_id, internal_player_id, market_key]` | *(identical)* |

**Verified empirically** (§7-grain comparison below): running the new reader and
the verbatim old SQL string through the SAME transaction over the SAME seeded data
returned deep-equal rows across all 7 grains. **No SQL change was required — no HALT.**

Plumbing-only note: the `internal_game_id` parameter is retained in the shared
reader (dead-`void`ed exactly as before) so the call-site changes only the
function reference — the SQL and the `[player, player, market]` param array stay
byte-identical. This is the purest reading of "import ownership only."

---

## Amendment 17 — READER CONTRACT (frozen for V1-8a0a)

Public contract of `readHistoricalSeries(tx, internal_game_id, internal_player_id, market_key)`:

- **Input params:** `tx: Tx` (caller-owned connection/transaction);
  `internal_game_id: string` (accepted for call-site parity — NOT a filter);
  `internal_player_id: string` (series scope); `market_key: string`.
- **Connection owner:** the CALLER. The reader opens no pool and manages no
  transaction lifecycle; it only issues one `SELECT` on the supplied `tx`.
- **Return:** `ReadonlyArray<HistoricalSeriesRow>`, one row per `player_game_stats`
  row for the player.
- **Ordering / chronology:** `ORDER BY g.scheduled_start_utc ASC` — strictly
  oldest→newest by scheduled UTC start. Stable chronological guarantee.
- **Stable row identity:** one row per game the player has a `player_game_stats`
  row for; a missing `player_game_stats` row is absence (never fabricated as DNP).
- **Nullability:** `stat_value` is `number | null` — `null` for any game with no
  eligible `historical_line_results` row (DNP / ineligible / no line);
  `is_home` is `boolean | null` (from `pgs.is_home`); `opponent_label` is `''`
  when the opponent team is unresolved (`COALESCE`).
- **Eligibility semantics:** `eligibility_state` is the VERBATIM persisted
  `player_game_stats.eligibility_state` (enum `player_stat_eligibility`).
- **DNP semantics:** `minutes_status` is the VERBATIM persisted
  `player_game_stats.minutes_status` (enum `bdl_minutes_status`). DNP/ineligible
  games are RETURNED (they hold chronological position), with `stat_value = NULL`.
- **Provenance semantics:** `includes_backfilled_historical` is
  `true` iff the anchoring `historical_line_results` row's `provenance =
  'backfilled_historical'`, else `false` (`COALESCE`).
- **Counted set:** anchored to `historical_line_results` under
  `coverage_state IN ('complete','single_book')`, DISTINCT ON `internal_game_id`
  by latest `computation_version` then `computed_at`.

> **This contract is frozen for V1-8a0a. Series persistence must consume this
> contract exactly. Any future change to this reader contract requires explicit
> governor authorization.**

---

## Scope A — the shared reader (proof)

Created `src/computation/historicalSeriesRead.ts` exporting:
- `interface HistoricalSeriesRow` (7 readonly fields — verbatim shape of the V1-7b row);
- `async function readHistoricalSeries(tx, internal_game_id, internal_player_id, market_key)`.

The SQL is copied verbatim (Amendment 16). Semantics borrowed from committed
persisted columns (quoted above), re-authored nowhere. Connection is caller-supplied.
The app-side copy was DELETED (not wrapped).

**ONE authoritative reader — grep proof:**

```
$ grep -rln "COALESCE(hlr.provenance = 'backfilled_historical'" --include=*.ts .
src/computation/historicalSeriesRead.ts        # ← the only owner of the SQL

$ grep -rn "readSeries" --include=*.ts .
src/computation/historicalSeriesRead.ts:7:  // ...previously owned inline as `readSeries`  (doc comment only)

$ grep -rn "readHistoricalSeries" --include=*.ts .
src/computation/historicalSeriesRead.ts:45:  export async function readHistoricalSeries(
apps/web/src/lib/server/researchRepository.ts:34: import { readHistoricalSeries } ...
apps/web/src/lib/server/researchRepository.ts:183:  const series = await readHistoricalSeries(tx, ...)
```

No duplicated SQL; no duplicated metric semantics (the only `readSeries` hit is a
doc comment).

---

## Scope B — Research View consumer transition (import ownership only)

Per Amendment 15, the ONLY authorized Research View changes are import ownership
and deletion of the superseded implementation. The complete diff of
`apps/web/src/lib/server/researchRepository.ts`:

1. **Governor-note comment** refreshed to record the promotion (comment only).
2. **Import added:** `import { readHistoricalSeries } from '.../src/computation/historicalSeriesRead.js';`
3. **Imports removed** (now unused after the move): `PlayerStatEligibility, BdlMinutesStatus`;
   `Tx`; and `ResearchSeriesRow` (kept `ResearchCandidate`).
4. **Call site (line 183):** `this.readSeries(tx, ...)` → `readHistoricalSeries(tx, ...)`
   — function reference only; identical arguments.
5. **`readSeries` method + its doc comment DELETED** (the superseded implementation).

No behavioural, computational, semantic, SQL, projection, UI, or evidence change.
The returned `HistoricalSeriesRow[]` assigns structurally to the candidate's
`series: ReadonlyArray<ResearchSeriesRow>` (7 identical fields) with no mapping
step; `researchCandidate.ts` is untouched. Both root and app `tsc --noEmit` pass,
confirming the structural assignment type-checks.

---

## Behavioural-identity proof

### (1) Existing committed Research View tests — UNMODIFIED — pass

`apps/web/test/researchProjection.test.ts` and `researchView.test.ts` (the
committed RV suites) are byte-unchanged and pass in the app fast run (55/55,
below). They exercise the consumer/projection contract over the fixture grains.

### (2) 7-fixture-grain comparison — identical series rows

A DB-backed proof (scratchpad, not committed) seeded ONE player with 7
chronological games spanning the full matrix — home/away, opponent variety,
COUNTED vs DNP vs ineligible, backfilled vs live provenance — and ran BOTH the new
`readHistoricalSeries` AND the verbatim deleted `readSeries` SQL through the SAME
transaction. Result: `assert.deepEqual(newRows, oldRows)` PASSED across all 7 rows.

```
date        opp      home   stat   minutes                  eligibility        backfilled
2026-06-01  Alpha    true   22     played                   eligible           false
2026-06-02  Bravo    false  15     played                   eligible           true
2026-06-03  Alpha    true   —      dnp                      non_participation  false   ← DNP holds position, stat NULL
2026-06-04  Charlie  false  —      unresolved_non_numeric   quarantined        false   ← ineligible holds position, stat NULL
2026-06-05  Bravo    true   30     played                   eligible           false
2026-06-06  Alpha    false  8      played                   eligible           true
2026-06-07  Charlie  true   25     played                   eligible           false

row count: 7 | counted (stat_value non-null): 5 | DNP/ineligible (null): 2 | backfilled: 2
PASS — NEW reader output is byte-identical to the OLD deleted readSeries SQL across all 7 grains.
```

---

## Scope C — GAP register entry

Added **GAP-19** to `docs/product/V1_OPEN_GAPS.md`:

> **GAP-19 — writer accepts evidence inputs and classification output as
> independent parameters** — found V1-8a0 governor review, 2026-07-28. OPEN —
> architecture. `writeV2EvidenceProfile` (`src/evidence/v2/writerV2.ts:64`) takes
> `input: EvidenceProfileInput` and `result: V2ClassifiedResult` as two
> independent parameters, so the same-evaluation-event invariant is enforced
> procedurally + by test, not by construction. Resolution direction: **V1-ARCH-2 —
> Unified Classified Evaluation Object**. Assigned V1-ARCH-2 (not scheduled; NOT a
> Board prerequisite). Blocks launch: **No**.

---

## Acceptance (8 items)

1. **Exactly ONE authoritative reader** — ✓ grep shows the SQL lives only in
   `src/computation/historicalSeriesRead.ts`; the only `readSeries` hit is a doc comment.
2. **Research-View diff = import ownership only** — ✓ comment refresh + import
   add/remove + call-site function reference + deletion of the superseded method
   (Amendment 15 authorized both). Diff quoted in Scope B.
3. **No behavioural change** — ✓ committed RV tests unmodified pass (55/55) +
   7-grain `deepEqual` identical.
4. **SQL identity (Amendment 16)** — ✓ before/after side-by-side identical;
   params identical; empirically confirmed by the 7-grain run.
5. **No duplicated SQL** — ✓ the app copy was DELETED, not wrapped.
6. **No duplicated metric semantics** — ✓ eligibility/DNP borrowed verbatim from
   persisted `player_game_stats` columns (committed `computeEligibility` output),
   quoted, unchanged.
7. **Frozen authorities / Grammar / Parity byte-identical** — ✓ `git status` shows
   no change under `docs/product/EVIDENCE_PROFILE_METHOD_V1.md`, the Grammar/Parity
   docs, `src/evidence`, engine, `computeThresholdWindow`, thresholds, gate, or writers.
8. **Nothing persisted / rendered / migrated / hosted** — ✓ read-only reader; no
   migration, schema, projection, UI, or hosted access. All suites green.

---

## Test accounting

| command | exit | pass | fail | skip | duration |
|---|---|---|---|---|---|
| `tsc --noEmit` (root) | 0 | — | 0 | — | ~1s |
| `tsc --noEmit` (apps/web) | 0 | — | 0 | — | <1s |
| root unit (`tests/**` excl. integration) | 0 | 577 | 0 | 0 | 0.93s |
| `npm run test:integration` (serial, DB up) | 0 | 137 | 0 | 0 | 32.5s |
| app fast (`apps/web npm test`, DB up) | 0 | 55 | 0 | 0 | 0.6s |
| serialization audit (`apps/web npm run audit`) | 0 | 14 | 0 | 0 | build ✓ + 6.7s |
| 7-grain series comparison (scratchpad, DB) | 0 | deepEqual PASS | 0 | 0 | — |

Note: the app fast suite shows 1 DB-gated Board regression that skips when
`SLIPLABZ_DATABASE_URL` is unset; with the local Docker DB exported it runs and the
suite is 55/55/0/0 (shown above). It is a Board test, unrelated to the Research View.

---

## Git status (nothing committed)

```
 M apps/web/src/lib/server/researchRepository.ts   (Scope B — RV consumer transition)
 M docs/product/V1_OPEN_GAPS.md                     (Scope C — GAP-19)
?? docs/research/                                   (founder files — UNTOUCHED)
?? src/computation/historicalSeriesRead.ts          (Scope A — the shared reader)
```

The two untracked founder files
(`docs/research/PICKFINDER_WNBA_AUDIT.md`,
`docs/research/PickFinder_WNBA_Audit_Clusters_1-6_Consolidated.md`) are untouched.
This report (`docs/product/reports/V1_TICKET_8A0B_REPORT.md`) is a new untracked
file. No `git add`, no commit, no push.

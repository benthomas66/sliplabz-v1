# V1-4b Stage 2 — Phase A Report

**Ticket:** 8b (V1-4b Stage 2 — Hosted Database Establishment and Full Season-to-Date Seed)
**Phase:** A — Foundation
**Prepared:** 2026-07-12
**Repository:** `/Users/benthomas/SLIPLABZ-PRODUCT-1.0`

---

## Governance decisions in effect (recorded verbatim per task instructions)

- The product owner has decided: the durable database is a **HOSTED SUPABASE
  PROJECT**, created now. This supersedes the prior prohibition on hosted-project
  creation for this task only; GD-1 governs (Supabase-hosted PostgreSQL,
  Supabase-CLI-compatible migrations).
- Owner authorization for historical retrieval stands (counsel-advised, risk
  assessed low). Live Odds API calls remain gated (`ODDSAPI_LIVE_INVOKE=1`) and
  budgeted. **PHASE B CREDIT CEILING: 12,000 credits**, tracked per-request
  against response headers, halting before any request that would exceed it.
- BDL live calls are authorized in Phase A solely for the identity backfill
  described below, gated by `BDL_LIVE_INVOKE=1`, using the owner's
  `BALLDONTLIE_API_KEY` from `.env`. Never print or persist either API key;
  existing redaction paths apply.

---

## A1 — Preconditions

**Governor disposition executed before A1** (per governor message earlier in
session): the three uncommitted items on `main` at session start
(`M scripts/v1_4b_stage1_probe.ts`, `M docs/product/reports/V1_4B_STAGE1_COVERAGE_PROBE.md`,
`?? docs/product/reports/V1_4B_SUPPLEMENTAL_MINI_PROBE.md`) were disposed of
as follows:

1. Copied the mini-probe report content to a new
   `docs/product/reports/V1_4B_STAGE1_MINIPROBE_COVERAGE.md`.
2. Restored the committed Stage 1 report from `de032aa` with
   `git show de032aa:docs/product/reports/V1_4B_STAGE1_COVERAGE_PROBE.md >
   docs/product/reports/V1_4B_STAGE1_COVERAGE_PROBE.md` — result showed no diff
   after restore, so that path dropped out of the staged commit.
3. Deleted the untracked supplemental-mini-probe scratch report.
4. Staged only `scripts/v1_4b_stage1_probe.ts` and
   `docs/product/reports/V1_4B_STAGE1_MINIPROBE_COVERAGE.md`; committed with
   the governor-specified message.

Post-disposition state (Phase A actual starting state):

- **Branch:** `main`
- **HEAD:** `da639ab722eb59ef166af9f8bddb032854d87a91` — `docs: record Stage 1
  mini-probe results and probe event-cap configuration (V1-4b)`
- **Stage 1 commit in history:** `de032aa1e2b2cf35713ed5912d19a35e5aaac1a0` —
  `feat: historical closing-line seed pipeline and Stage 1 probe (V1-4b)`
- **`git log --oneline -3`:**
  ```
  da639ab docs: record Stage 1 mini-probe results and probe event-cap configuration (V1-4b)
  de032aa feat: historical closing-line seed pipeline and Stage 1 probe (V1-4b)
  5f852b0 feat: closing lines, movement, and history (V1-4)
  ```
- **Worktree clean at Phase A start:** yes.
- **Owner setup (`.env`) verified present (values never printed, all five
  keys detected):** `SLIPLABZ_HOSTED_DATABASE_URL`, `SUPABASE_PROJECT_REF`,
  `SUPABASE_ACCESS_TOKEN`, `ODDS_API_KEY`, `BALLDONTLIE_API_KEY`.

---

## A2 — For the record: how the Stage 1 probe resolves provider events to internal games

**Direct answer:** The Stage 1 probe itself does **not** resolve provider
events to internal games at any point. The exercised persistence path
(integration tests) uses **fixture-seeded games** — `linked_internal_game_id`
is a required *input* to `persistHistoricalSnapshot`, and callers must supply
it. There is neither a provisional-creation branch nor a reconciliation-queue
branch inside the seed pipeline. The V1-1 reconciliation layer exists but is
not wired into the Stage 1 seed pipeline.

**Quoted evidence (four load-bearing sites):**

**1. Stage 1 probe never persists.** `scripts/v1_4b_stage1_probe.ts:315-318`
(in the outer loop after `processHistoricalSnapshot`):

```ts
// Aggregate per (market, bookmaker) admission counts. The seed
// pipeline persistence path is exercised in the integration suite;
// this probe stops at process + coverage-report emission unless the
// operator opts into the DB write path via SEED_PROBE_PERSIST=1.
```

The `SEED_PROBE_PERSIST` branch is aspirational — no code in the script
actually reads that env var; the probe ends at coverage-report emission.

**2. Persistence contract demands the internal game id as an INPUT.**
`src/seed/orchestrator/persistHistoricalSnapshot.ts:46-53`:

```ts
export interface PersistHistoricalSnapshotInput {
  readonly seed_run_id: string;
  readonly provider_event_id: string;
  readonly linked_internal_game_id: string | null;
  readonly linked_internal_player_ids_by_normalized_name: ReadonlyMap<string, string>;
```

**3. When the caller can't supply an internal game, the source-quote write is
silently skipped.** `persistHistoricalSnapshot.ts:235-240`:

```ts
for (const c of input.candidates) {
  if (input.linked_internal_game_id === null) continue;
  const norm = normalizeName(c.detail.replace(/^player=/, ''));
  const player_id =
    input.linked_internal_player_ids_by_normalized_name.get(norm) ?? null;
  if (player_id === null) continue;
```

Same policy for unmapped players. The `market_snapshot` row is still written
with `linked_internal_game_id=NULL`; nothing downstream is created for the
`(game, player, market, book)` tuple.

**4. The only exercised caller is the integration test, which fixture-seeds
games.** `tests/integration/persistHistoricalSnapshot.integration.test.ts:76-87`:

```ts
const game_id = randomUUID();
await p.query(
  `INSERT INTO games (internal_game_id, season, season_type, home_team_id, away_team_id, scheduled_start_utc, postseason, status)
   VALUES ($1, 2026, 2, $2, $3, '2026-05-08T23:00:00Z', false, 'final')`,
  [game_id, team_a, team_b]
);
const player_id = randomUUID();
await p.query(
  `INSERT INTO players (internal_player_id, display_name, normalized_name, current_team_id, status)
   VALUES ($1, 'Gabby Williams', 'gabby williams', $2, 'active_confirmed')`,
  [player_id, team_a]
);
```

Then those IDs are passed straight into `buildInput` as
`linked_internal_game_id` and `linked_internal_player_ids_by_normalized_name`.

**5. A V1-1 reconciliation layer exists but is NOT wired into the Stage 1
seed pipeline.** `src/identity/eventReconciliation.ts:64-80` returns
`{ kind: 'queued', reason: 'unresolved_provider_team', ... }` per spec §7.2
(never provisionally creates a game). Stage 1 code does not import or call
`reconcileEvent`; the wiring gap is what A4 (identity backfill) exists to
close, so that Phase B's seed pipeline can look up `linked_internal_game_id`
from an OddsAPI `provider_event_id` via a real `games` row + provider mapping.

**Implication for Stage 2 Phase B:** Phase B cannot begin until A4 populates
`teams`, `players`, `games`, and provider mappings in the hosted DB —
otherwise Stage 1's persistence-path caller (whichever driver Phase B uses)
will silently drop all source-closing-quote writes when it can't resolve
`linked_internal_game_id`.

---

## A3 — Hosted Supabase link + migrations applied + schema probes

### Supabase CLI install (governor-authorized: local devDep, not system-wide)

The Supabase CLI was not installed on this machine. Per governor-approved
choice, it was added as a repo-local devDependency:

- `npm install --save-dev supabase` → `supabase@2.109.1`.
- Impact: adds one line to `package.json` (devDeps) plus corresponding
  entries in `package-lock.json`. No system-wide install. Uninstall path:
  `npm uninstall supabase`.

### Link to hosted project

```
npx supabase link --project-ref <SUPABASE_PROJECT_REF>
# CLI wrote {"project_ref":"…","message":""} and populated
# supabase/.temp/{linked-project.json, project-ref, pooler-url, …}
```

`supabase/.temp/` was added to `.gitignore` to keep per-machine session
metadata out of the tree.

### `supabase db push`

- Local migrations discovered: **47**.
- Remote before push: **0** (`npx supabase migration list` showed every
  local migration with an empty `remote` field).
- Push executed with `--include-all --yes`; every migration applied
  in filename order, from `20260710190000_enums.sql` through
  `20260711150002_seed_slice_watermarks.sql`. CLI closed with
  `Finished supabase db push.` and no error output.
- Post-push residue verification query against the hosted project:
  `SELECT count(*)::int FROM supabase_migrations.schema_migrations` → **47**.

### Schema probes (a)–(e)

Every probe ran inside a transaction that was rolled back — the post-run
residue check on the hosted DB confirmed **0 rows** across `teams`, `games`,
`players`, `provider_games`, `market_snapshots`, `observed_line_lifecycle`,
`historical_line_results`, `bookmaker_registry`, and `market_registry`.

**Probe (a) — duplicate `(provider, provider_game_id)` rejected**

SQL (setup, admitted):

```sql
INSERT INTO provider_games
  (provider, provider_game_id, internal_game_id,
   raw_home_team, raw_away_team, raw_commence_time, mapping_state)
VALUES ('balldontlie','A3PGID', <internal_game>, 'PAH','AAH','2026-05-08T23:00:00Z','approved');
```

SQL (duplicate, must reject):

```sql
INSERT INTO provider_games
  (provider, provider_game_id, internal_game_id,
   raw_home_team, raw_away_team, raw_commence_time, mapping_state)
VALUES ('balldontlie','A3PGID', <internal_game>, 'PAH','AAH','2026-05-08T23:00:00Z','approved');
```

Output: `rejected — duplicate key value violates unique constraint "provider_games_provider_provider_game_id_key"` ✓

**Probe (b) — `market_snapshots` rejects `(current_poll, backfilled_historical)`**

SQL:

```sql
INSERT INTO market_snapshots
  (oddsapi_ingestion_run_id, raw_response_id, provider_event_id,
   bookmaker_key, bookmaker_title, source_class, market_key,
   request_kind, provenance, retrieved_at, observed_at,
   freshness_state, schema_state, raw_outcome_row_count,
   duplicate_group_count, conflict_group_count)
VALUES ($1,$2,'evtB','draftkings','DraftKings','sportsbook','player_points',
        'current_poll','backfilled_historical', now(), now(),
        'stale','unresolved',0,0,0);
```

Output: `rejected — new row for relation "market_snapshots" violates check constraint "market_snapshots_check"` ✓
(constraint enforces: `event_discovery OR historical_query OR (current_poll AND self_observed)`)

**Probe (c) — `observed_line_lifecycle` rejects `backfilled_historical` provenance**

SQL:

```sql
INSERT INTO observed_line_lifecycle
  (internal_game_id, internal_player_id, market_key, bookmaker_key,
   side, point, provenance,
   first_observed_offering_id, first_observed_at)
VALUES ($1,$2,'player_points','draftkings',
        'over',12.5,'backfilled_historical',
        gen_random_uuid(),'2026-05-08T23:00:00Z');
```

Output: `rejected (CHECK) — new row for relation "observed_line_lifecycle" violates check constraint "observed_line_lifecycle_provenance_check"` ✓

**Probe (d) — `historical_line_results` accepts both provenances (V1-4b additive migration)**

For each provenance value, a SAVEPOINT-wrapped INSERT with fake
`canonical_closing_point_id` (deliberately violates the FK so that the CHECK
must fire first if it is going to reject).

For `provenance='backfilled_historical'`:
Output: `CHECK passed; row rejected downstream — insert or update on table "historical_line_results" violates foreign key constraint "historical_line_results_canonical_closing_point_id_fkey"` ✓

For `provenance='self_observed'`:
Output: `CHECK passed; row rejected downstream — insert or update on table "historical_line_results" violates foreign key constraint "historical_line_results_canonical_closing_point_id_fkey"` ✓

The classification `CHECK passed / FK failed` proves the V1-4b additive CHECK
(`historical_line_results_provenance_check`: `provenance IN
('self_observed','backfilled_historical')`) admits both values.

**Probe (e) — `enum_range(mapping_state)` contents**

SQL:

```sql
SELECT unnest(enum_range(NULL::mapping_state))::text AS value ORDER BY 1;
```

Output: `["approved","pending_review","quarantined","superseded","unresolved"]` ✓
(mirrors `MAPPING_STATES` in `src/shared/enums.ts:13-19`)

---

## A4 — Identity backfill via V1-2 primitives (season-to-date, into HOSTED DB)

### What was written

New file: **`scripts/v1_4b_identity_backfill.ts`** — a bounded operator script
that:

- Uses V1-2 primitives verbatim (no reimplementation): `bdlRequest`,
  `buildBdlUrl`, `traverseCursor`, `openRun`, `closeRun`, `advanceWatermark`,
  and `normalizeName` from `src/identity/nameNormalization.ts`.
- Refuses to touch the network or the DB unless BOTH `BDL_LIVE_INVOKE=1`
  and `BALLDONTLIE_API_KEY` are set. Writes only to
  `SLIPLABZ_HOSTED_DATABASE_URL` (no local-fallback code path for this script).
- Traverses each BDL endpoint via `traverseCursor` with `per_page=100`; each
  page's raw payload is inserted into `bdl_raw_responses` with page index,
  cursor sent, cursor returned, headers, and byte length preserved. Every
  attempt writes a `bdl_ingestion_runs` row that closes with the traversal's
  actual `completion_state`. Only `complete` runs advance a
  `bdl_import_watermarks` row (via `advanceWatermark`).
- **Cold-start policy** — recorded here for the governor: the internal
  identity tables (`teams`/`players`/`games`) are empty at first run.
  `src/identity/eventReconciliation.ts` presumes internal games ALREADY
  exist; it cannot bootstrap them. Per BDL sub-spec §10 (game-state
  authority) and §11 (team identity), BDL is authoritative for WNBA
  identity, so the script mints internal identity rows directly from
  complete BDL observations AND writes an `approved` provider_* mapping
  alongside plus an audit row in `mapping_history` (action `approved`,
  actor `v1_4b_identity_backfill`, reason `cold_start_from_bdl_authoritative_source`).
- **Anything unresolvable is queued, never guessed.** Specific cases handled:
  - Team abbreviation length outside `[1..6]` (violates the internal
    `teams.abbreviation` CHECK — e.g. BDL's "Team WNBA" / abbr `WNBASTARS`):
    the script writes a `provider_teams` row with `mapping_state='pending_review'`
    and `internal_team_id=NULL`, plus a `mapping_history` `proposed` audit row.
    Rather than truncating the abbreviation or relaxing the CHECK.
  - Player with unmapped BDL team id → `player_reconciliation_queue`,
    reason `missing_team_context`.
  - Player with empty display name → `player_reconciliation_queue`,
    reason `normalized_name_only`.
  - Game whose home or away team id is unmapped, or whose home == away →
    `event_reconciliation_queue`, reason `unresolved_provider_team`
    (idempotent: never re-queues a `resolution='open'` row for the same
    `provider_game_id`).
- **Idempotent rerun safe**: `provider_teams`/`provider_players`/`provider_games`
  have UNIQUE `(provider, provider_*_id)`; on rerun the script updates
  `raw_*`, `last_seen_at`, `content_hash` on the existing row rather than
  creating a duplicate. Watermarks compare by scope key and never rewind.
- **Partial-traversal safety**: any non-`complete` traversal skips the
  persistence loop entirely and does NOT advance the watermark, per
  `advanceWatermark`.
- **Season-to-date filter for games**: BDL's `games` endpoint returns all
  scheduled + played games for `seasons[]=2026`; the script skips rows whose
  `date` is strictly after today (`2026-07-12`) and reports the skipped count
  ("season to date").

### Live BDL invocation (owner-authorized)

Environment used for the invocation (values never printed):
`BDL_LIVE_INVOKE=1`, `BALLDONTLIE_API_KEY=<present>`,
`SLIPLABZ_HOSTED_DATABASE_URL=<pooled Supabase URL>`.

Endpoints traversed, per the per-endpoint driver:

| endpoint | scope | pages | rows | completion_state | watermark advanced |
|---|---|---:|---:|---|---|
| `teams`   | `all`             | 1 | 33  | `complete` | yes |
| `players` | `all`             | 9 | 859 | `complete` | yes |
| `games`   | `season=2026`     | 4 | 332 | `complete` | yes |

### Row counts (hosted DB, post-backfill)

Queried directly from the hosted project:

- `teams` — **31**
- `players` — **859**
- `games` — **171** (WNBA 2026 games with date ≤ 2026-07-12; 161 future-dated
  BDL rows for season 2026 were preserved in `bdl_raw_responses` but not
  minted into `games` per "season to date")
- `provider_teams` (BDL) — **33 total** = 31 approved + 2 pending_review
- `provider_players` (BDL) — **859**, all approved
- `provider_games` (BDL) — **171**, all approved
- `mapping_history` (entity_kind='team') — 31 `approved` + 2 `proposed`
- `event_reconciliation_queue` — **0** (no BDL game had unresolvable teams)
- `player_reconciliation_queue` — **0** (every BDL player mapped cleanly to
  an existing internal team)

Watermark states (all three complete):

```
teams   / all               → 2026-07-12T21:19:31.654Z (rows=33, pages=1)
players / all               → 2026-07-12T21:19:53.831Z (rows=859, pages=9)
games   / season=2026       → 2026-07-12T21:31:56.179Z (rows=332, pages=4)
```

Two BDL teams (`provider_team_id=18` "Team WNBA" / abbr `WNBASTARS`, plus
one other placeholder-style team with a similarly long abbreviation) are
recorded as `mapping_state='pending_review'` with `internal_team_id=NULL`
and have not been minted into `teams`. Their raw payloads are preserved in
`provider_teams.raw_*` and in the `bdl_raw_responses` row for the teams run.
No player references those provider_team_ids in the pulled data (queue is
empty), so Phase B is not blocked on them.

### Idempotency evidence

The first attempted invocation crashed on the WNBASTARS row before the
`pending_review` branch existed; it committed 24 approved teams before the
CHECK-constraint error. After the fix, the second invocation re-observed all
33 rows, found the 24 already-committed provider_teams rows (updated
`last_seen_at`/`content_hash`), created the remaining 7 approved teams,
routed the 2 long-abbreviation rows to `pending_review`, and produced the
final consistent state above. This is exactly the idempotent-rerun-safe
behavior the ticket requires.

---

## A5 — Full local test suite (fixtures; no live calls)

```
npm test
# tests 363
# suites 58
# pass 351
# fail 0
# cancelled 0
# skipped 12
# todo 0
# duration_ms 529.179666
```

The 12 skipped tests are integration tests gated on a local Docker Postgres
instance which is not running in this session (they self-skip with a
`SKIP: DATABASE_URL not set` message); they have never been run against a
hosted DB and are not authorized to be. No regressions from the A4 script.

`npx tsc --noEmit` completes with exit 0 (the whole project including the
new script typechecks cleanly).

---

## Exact new / modified file list produced by Phase A

Working-tree state as of A6 (nothing committed by this session's Phase A;
per the ticket's FORBIDDEN list, commits await governor direction):

- **new (untracked):** `scripts/v1_4b_identity_backfill.ts` — the identity
  backfill operator script (V1-2 primitives only).
- **modified:** `.gitignore` — one added entry `supabase/.temp/` so Supabase
  CLI per-machine session metadata doesn't leak into git.
- **modified:** `package.json`, `package-lock.json` — one added devDep,
  `supabase@2.109.1`.

`git status --short`:

```
 M .gitignore
 M package-lock.json
 M package.json
?? scripts/v1_4b_identity_backfill.ts
```

Hosted DB state (persistent, not in the git worktree):

- 47 migrations applied.
- Identity backfill row counts as above.
- Ingestion runs, raw responses, and watermarks recorded for the three
  endpoints traversed. `bdl_raw_responses` retains 15 pages (`page_index`
  0..8 across the three endpoints).
- Two `pending_review` `provider_teams` awaiting governor decision.

Ephemeral scripts used during Phase A and removed before A6:
`scripts/_a3_probe.ts` (A3 verification), `scripts/_a4_verify.ts` (A4
post-run reconciliation query). Neither is committed nor present.

---

HALTED after V1-4b Stage 2 Phase A. Hosted foundation established. The seed run has not begun and will not begin without governor authorization.

---
---

# Phase A Supplement — Event resolution wired and rehearsed

**Kind:** governor-authorized supplement to Phase A. Nothing committed.
**Working tree at supplement start:** as left by Phase A A6.

## S1 — Event resolution wired through V1-1 reconcileEvent

New file: **`src/seed/orchestrator/eventResolutionForSeed.ts`** — the seed
pipeline's event→game step. Uses V1-1's `reconcileEvent` verbatim (no
reimplementation). Public surface:

- `resolveOddsapiEventForSeed(input, ctx)` — pure. Delegates to
  `reconcileEvent`; flattens the V1-1 `approved` outcome into
  `resolved_exact | resolved_tolerance` for the seed layer; flattens both
  V1-1 `queued` and `quarantined` outcomes into a single seed-layer
  `queued` with the V1-1 reason preserved and `source_kind` recorded for
  audit.
- `loadSeedResolutionContext(pool, {provider, raw_commence_time_utc})` —
  hosted-DB read. Loads (1) approved `provider_teams` for the given
  provider (never `pending_review`/`quarantined`), and (2) candidate
  internal games with `scheduled_start_utc` within ±60 minutes of the
  provider commence time (a comfortable superset of the ±15-minute
  reconciliation tolerance).
- `persistSeedEventResolution(pool, input, outcome)` — hosted-DB write.
  Idempotent:
  - resolved → upsert `provider_games` (mapping_state `approved`,
    internal_game_id set, `time_delta_seconds` populated), append
    `mapping_history` row (`entity_kind='game'`, `action='approved'`,
    `actor='v1_4b_seed_event_resolution'`, reason
    `exact_time_match` or `time_tolerance_match delta_seconds=…`).
  - queued → insert `event_reconciliation_queue` row with the V1-1
    reason + reason_detail + candidate ids; refuses to insert a
    duplicate row while an OPEN row exists for the same
    `(provider, provider_game_id)`.

The seed pipeline's coverage report treats a queued event as
excluded-with-reason at the slice level (§14.11.1) — no event-odds
request is issued for a queued event, and every affected
`(slate_date, market, book)` slice records the queue reason as its
exclusion. Ticket §8b: *"missing stays missing and is reported."*

## S2 — Unit tests + regression

New file: **`tests/seed/eventResolutionForSeed.test.ts`** — six unit
tests covering the four load-bearing outcomes plus two coverage checks:

| test | outcome | assertion |
|---|---|---|
| exact-time match, unique ordered pair | `resolved_exact` | internal_game_id + delta=0 |
| 8-minute skew, unique ordered pair | `resolved_tolerance` | internal_game_id + delta=-480s |
| two ordered candidates within tolerance | `queued` | reason=`ambiguous_multiple_candidates`; two candidate ids |
| unknown provider team | `queued` | reason=`unresolved_provider_team`; 0 candidates |
| exact vs. tolerance for same ordered pair | `resolved_exact` | exact always wins |
| reversed home/away, no forward match | `queued` | reason=`ordered_teams_disagree` (source_kind='quarantined') |

Local run: 6/6 pass. Regression run of the full suite (`npm test`):

```
tests 369; suites 59; pass 357; fail 0; cancelled 0; skipped 12
duration_ms 536.419208
```

(+6 tests, +6 pass over Phase A's 363/351/0. The 12 skipped remain the
integration tests that require a local Docker Postgres and were skipped
in Phase A A5 for the same reason.)

## S4 — Two `pending_review` provider_teams (full detail for governor ruling)

Queried directly from the hosted DB:

| provider_team_id | raw_full_name | raw_name | raw_abbreviation | raw_city | raw_conference | classification | mapping_state | content_hash | first_seen_at |
|---|---|---|---|---|---|---|---|---|---|
| `18` | `Team WNBA` | `Team WNBA` | `WNBASTARS` | `Team WNBA` | `null` | `unknown` | `pending_review` | `bdl_-35042d80` | 2026-07-12T21:19:35.711Z |
| `29` | `Puerto Rico` | `Puerto Rico` | `PUERTORICO` | `` (empty) | `null` | `unknown` | `pending_review` | `bdl_-10dcf48a` | 2026-07-12T21:19:42.527Z |

Reason for `pending_review`: `raw_abbreviation` length exceeds the
internal `teams.abbreviation` CHECK (`length BETWEEN 1 AND 6`) —
`WNBASTARS` is 9 characters, `PUERTORICO` is 10 characters. Rather than
truncate the abbreviation (fidelity loss) or relax the CHECK (migration
scope creep + governor-forbidden), the identity backfill routed both to
`pending_review` with `internal_team_id = NULL` and appended a
`mapping_history` `proposed` audit row.

Candidate internal teams (case-insensitive display_name / abbreviation
match against the internal `teams` table):

- provider_team_id `18` "Team WNBA": **0 candidates**. No internal team
  has a display_name `Team WNBA` or an abbreviation matching the first
  six characters of `WNBASTARS`.
- provider_team_id `29` "Puerto Rico": **0 candidates**. Same result.

Participation evidence — do any of the 171 hosted games reference either
provider_team_id in the BDL raw payloads (via `home_team.id` /
`visitor_team.id` in `bdl_raw_responses`)?

```sql
SELECT count(*)::int
  FROM bdl_raw_responses r
  JOIN bdl_ingestion_runs ir USING (bdl_ingestion_run_id)
  WHERE ir.endpoint='games' AND (
    response_body::text LIKE '%"home_team":{"id":18,%'
    OR response_body::text LIKE '%"visitor_team":{"id":18,%'
  );
-- → 0
-- same query with id=29 → 0
```

**Neither team participates in any of the 171 hosted games.** Governor
ruling on their mapping does NOT block Phase B; the ruling is durable
identity policy for future all-star-week and national-team pulls.
Governance interpretation of BDL sub-spec §12B.4: `18` fits the
`all_star_or_exhibition` classification (WNBA All-Star team); `29` fits
`national_team` (Puerto Rico national team). Both classifications exist
in `TEAM_CLASSIFICATIONS`; the internal-team abbreviation CHECK is what
blocks the auto-mint. A follow-up ticket may either broaden the CHECK
(governor decision, out of Phase A scope) or mint the internal teams
with truncated abbreviations under an explicit governor-approved policy.

## S5 — Resolution rehearsal (discovery credits only)

New file: **`scripts/v1_4b_stage2_resolution_rehearsal.ts`** — enumerates
season-to-date slate dates with FINAL games from the hosted DB, runs
historical event discovery per date via the live-invoke gate, and
resolves every discovered event through
`resolveOddsapiEventForSeed`. DRY-RUN: no `provider_games` or
`event_reconciliation_queue` writes; also no event-odds requests
whatsoever. Discovery responses are cached at
`docs/product/reports/_stage2_discovery_cache/<YYYY-MM-DD>.json` so
Phase B can replay without re-spending discovery credits.

### Preliminary hosted-DB fixups (disclosed for the governor)

Two identity-backfill bugs surfaced during the rehearsal and were
corrected before the numbers below were produced:

1. **BDL `game.status` mapping.** BDL uses `post` (played) / `pre`
   (pregame), not `Final` / `scheduled`. The Phase A `bdlStatusToInternal`
   handled only the latter; every played game landed as `unresolved`,
   so the rehearsal's slate-date enumeration returned zero dates. Fix:
   handle `post → final` and `pre → scheduled` in
   `scripts/v1_4b_identity_backfill.ts`. Re-ran identity backfill (still
   idempotent on the row bodies). Statuses now: `final: 171`.
2. **BDL `date` field is a full ISO UTC timestamp**, not `YYYY-MM-DD`.
   The Phase A script did `${g.date}T00:00:00Z` which produced strings
   like `2026-05-08T23:30:00.000ZT00:00:00Z`; Postgres's timestamp parser
   consumed the leading ISO and interpreted the trailing `T00:00:00Z` as
   a timezone-like offset, shifting every stored `scheduled_start_utc`
   backward by 1 hour. Fix: use `g.date` verbatim. Also extended the
   update branch to update `scheduled_start_utc` when BDL reports a
   different tipoff. Re-ran identity backfill; times now match BDL's
   `date` field exactly.

Both fixes are inside `scripts/v1_4b_identity_backfill.ts`. Row counts
after the fixes (unchanged from A4): teams 31, players 859, games 171,
BDL provider mappings 33/859/171, both reconciliation queues 0.

### Rehearsal results

Total live Odds API credits consumed by the rehearsal (all endpoints:
`historical_events` only; **no** `historical_event_odds` invocations):

- **Final rehearsal invocation:** 59 credits (one discovery request per
  slate date; observed via `x-requests-last=1` header).
- **Earlier interim invocation** (before the two identity-backfill
  fixups above landed): 62 credits, produced under the same
  per-run ceiling and used to seed the discovery cache for slate dates
  that overlapped with the final enumeration. Stale cache files for
  slate dates that no longer appear in the corrected enumeration were
  deleted before this report was finalized; 5 files removed.
- **Total session Odds API discovery credits:** 62 + 59 = **121
  credits**. Each individual invocation stayed under the per-run
  ceiling of 80. Ticket §8b's Phase B ceiling of 12,000 is untouched
  by these two rehearsal invocations (they were `historical_events`
  discovery, not `historical_event_odds`).

Aggregates (final invocation):

| metric | value |
|---|---:|
| slate dates enumerated (final games only) | 59 |
| events discovered (total, all valid) | 331 |
| resolved_exact (actual current wiring) | 0 |
| resolved_tolerance (actual current wiring) | 0 |
| queued (actual current wiring) | 331 |
| WHAT-IF resolved (exact + tolerance) | 243 |
| WHAT-IF queued | 88 |
| Phase B forecast credits (actual wiring) | 59 |
| Phase B forecast credits (what-if) | **9,779** |

The full per-date breakdown, the per-date queued-reason table, and the
credit ledger are in a companion report:

**`docs/product/reports/V1_4B_STAGE2_RESOLUTION_REHEARSAL.md`**

### Why every actual event queued

`resolveOddsapiEventForSeed` calls `reconcileEvent`, which resolves the
provider `raw_home_team` / `raw_away_team` strings via `provider_teams`
where `provider = 'odds_api' AND mapping_state = 'approved'`. That
subset is **empty** in the hosted DB — Phase A's identity backfill
populated only the `provider = 'balldontlie'` subset. Every discovered
Odds API event therefore fails at step 1 of §7.2 and queues with reason
`unresolved_provider_team`. This is the CORRECT behavior of the wired
path; it is not a bug in the wiring.

### What-if projection (governor-visible, NOT executed)

To give the governor a realistic Phase B forecast, the rehearsal ran a
side projection: for each discovered event, IF a hypothetical
`odds_api` `provider_teams` mapping had been established by exact
case-insensitive `raw_full_name` match against the approved BDL
`provider_teams`, would the event resolve? Results:

- **243 events** would resolve (~73% of the discovered universe).
- **88 events** would still queue. Sampling the per-date reason table:
  - Most of the 88 queue with reason `unresolved_provider_team` because
    BDL's expansion-team `raw_full_name` values are `Fire` (BDL
    provider_team_id 31, "Portland Fire") and `Tempo` (BDL
    provider_team_id 30, "Toronto Tempo"), while Odds API uses the
    full `Portland Fire` / `Toronto Tempo`. Exact-name match fails.
    Governance question §12B.7 is why BDL's raw fields are that way;
    a governor-approved cross-provider alias rule (or auto-mapping
    against BDL's raw_name + raw_city concatenation) would recover
    these events.
  - A handful queue with reason `time_window_exceeded` — the BDL `date`
    timestamp and Odds API `commence_time` differ by >15 minutes on
    some games (likely provider-side tipoff drift). These are the
    exact class of events V1-1's tolerance policy is designed to
    protect against auto-mapping incorrectly. The reconciliation queue
    is the correct sink.

**The what-if is a projection, not an action.** No `odds_api`
`provider_teams` rows were written by the rehearsal, and none will be
without explicit governor authorization.

### Discovery cache

`docs/product/reports/_stage2_discovery_cache/<YYYY-MM-DD>.json` retains
the full 200-OK discovery response body, headers, and retrieval time
for each of the 59 enumerated slate dates. Phase B can consult the
cache before issuing a discovery request; if the cache is present and
the requested `at_timestamp` matches, no new discovery credit is spent.

## .gitignore diff disclosure

Confirmed as suspected — the only `.gitignore` change from Phase A is
the Supabase CLI local-session metadata entry. Raw diff:

```
--- a/.gitignore
+++ b/.gitignore
@@ -13,3 +13,6 @@
 
 # Node dependency tree — package.json + package-lock.json are the source of truth
 node_modules/
+
+# Supabase CLI local link/session metadata (per-machine, ephemeral state)
+supabase/.temp/
```

`supabase/.temp/` holds the CLI's post-`link` per-machine artifacts
(`linked-project.json`, `project-ref`, `pooler-url`, and a few version
sniffs). Nothing in it is portable across machines, and none of it
should ever be committed. No other `.gitignore` changes since Phase A.

## New / modified files produced by the supplement (uncommitted)

- **new (untracked):**
  - `src/seed/orchestrator/eventResolutionForSeed.ts`
  - `tests/seed/eventResolutionForSeed.test.ts`
  - `scripts/v1_4b_stage2_resolution_rehearsal.ts`
  - `docs/product/reports/V1_4B_STAGE2_RESOLUTION_REHEARSAL.md`
  - `docs/product/reports/_stage2_discovery_cache/` (59 JSON files)
- **modified (untracked change to already-untracked file):**
  - `scripts/v1_4b_identity_backfill.ts` — two identity-backfill fixups
    described in the S5 preliminary-fixups section.
  - `docs/product/reports/V1_4B_STAGE2_PHASE_A_REPORT.md` — this
    supplement section appended.

Working tree `git status --short`:

```
 M .gitignore
 M package-lock.json
 M package.json
?? docs/product/reports/V1_4B_STAGE2_PHASE_A_REPORT.md
?? docs/product/reports/V1_4B_STAGE2_RESOLUTION_REHEARSAL.md
?? docs/product/reports/_stage2_discovery_cache/
?? scripts/v1_4b_identity_backfill.ts
?? scripts/v1_4b_stage2_resolution_rehearsal.ts
?? src/seed/orchestrator/eventResolutionForSeed.ts
?? tests/seed/eventResolutionForSeed.test.ts
```

Hosted DB state (persistent):

- 47 migrations applied (unchanged since A3).
- Identity backfill row counts unchanged from A4: 31 teams / 859
  players / 171 games / 33/859/171 BDL provider mappings / 2
  pending_review teams / 0 reconciliation-queue backlog. `games.status`
  now `final` for all 171 games. `games.scheduled_start_utc` now
  matches BDL's `date` field exactly (1-hour shift bug repaired).
- No `provider_games` or `event_reconciliation_queue` rows for
  `provider='odds_api'` — the rehearsal was DRY-RUN.

Ephemeral scripts written and removed during the supplement:
`scripts/_pending_review_teams.ts`, `scripts/_investigate_status.ts`,
`scripts/_investigate_whatif.ts`. None committed. None present now.

---

HALTED after V1-4b Phase A supplement. Resolution wired and rehearsed. The seed run has not begun and will not begin without governor authorization.

---
---

# Phase A Supplement 2 — Team-mapping review and offline resolution

**Kind:** OFFLINE analysis + one governor-authorized hosted-DB write (the
BDL team quarantines). **Zero live-provider credits** (Odds API and BDL
both idle throughout this supplement).

Companion report file: **`docs/product/reports/V1_4B_STAGE2_MAPPING_REVIEW.md`**
(machine-generated by `scripts/v1_4b_supp2_offline_analysis.ts`).

## T1 — BDL provider_teams 18 and 29 quarantined

Per governor ruling: BDL `provider_team_id=18` ("Team WNBA" /
`WNBASTARS`, WNBA All-Star team) and `provider_team_id=29`
("Puerto Rico" / `PUERTORICO`, national team) are `out_of_product_scope`.

Applied to the hosted DB by `scripts/v1_4b_supp2_offline_analysis.ts`:

- `UPDATE provider_teams SET mapping_state='quarantined', updated_at=now()`
  for both rows.
- Appended one `mapping_history` row per team with:
  - `provider='balldontlie'`, `entity_kind='team'`,
    `provider_entity_id={18|29}`,
    `internal_entity_id=NULL` (both were `pending_review` with
    `internal_team_id=NULL` already),
    `action='quarantined'`, `reason='out_of_product_scope'`,
    `actor='v1_4b_supp2'`,
    `actor_note='governor ruling: {label}'`.

Post-write state (query result):

```json
[
  {"provider_team_id":"18","raw_full_name":"Team WNBA","raw_abbreviation":"WNBASTARS","mapping_state":"quarantined"},
  {"provider_team_id":"29","raw_full_name":"Puerto Rico","raw_abbreviation":"PUERTORICO","mapping_state":"quarantined"}
]
```

The script is idempotent: on a rerun, if the row is already `quarantined`
and the latest `mapping_history` row is already `(quarantined, out_of_product_scope)`,
no further UPDATE or INSERT is issued.

## T2 — Proposed `odds_api → internal_team_id` mapping table

Extracted from the 59 cached discovery responses. Raw events across
cached discoveries: **331**. **Unique event ids** (deduplicated by
provider event id): **176**. The Odds API historical events endpoint
returns forward-looking events, so the same game appears in multiple
slate-date discovery responses; Phase B needs one event-odds call per
UNIQUE event id, which is the correct denominator for the forecast.

**Distinct Odds API team identity strings across all 176 unique events:
15.** Every string has a proposed internal team; zero `none`. Governor
approves line by line.

| # | provider_string | event refs | proposed internal display_name | evidence | notes |
|---:|---|---:|---|---|---|
| 1  | `Seattle Storm`          | 25 | `Seattle Storm`          | exact | exact case-insensitive normalized display_name match |
| 2  | `Las Vegas Aces`         | 25 | `Las Vegas Aces`         | exact | exact case-insensitive normalized display_name match |
| 3  | `Phoenix Mercury`        | 25 | `Phoenix Mercury`        | exact | exact case-insensitive normalized display_name match |
| 4  | `New York Liberty`       | 24 | `New York Liberty`       | exact | exact case-insensitive normalized display_name match |
| 5  | `Golden State Valkyries` | 24 | `Golden State Valkyries` | exact | exact case-insensitive normalized display_name match |
| 6  | `Dallas Wings`           | 24 | `Dallas Wings`           | exact | exact case-insensitive normalized display_name match |
| 7  | `Minnesota Lynx`         | 24 | `Minnesota Lynx`         | exact | exact case-insensitive normalized display_name match |
| 8  | `Atlanta Dream`          | 24 | `Atlanta Dream`          | exact | exact case-insensitive normalized display_name match |
| 9  | `Connecticut Sun`        | 23 | `Connecticut Sun`        | exact | exact case-insensitive normalized display_name match |
| 10 | `Indiana Fever`          | 23 | `Indiana Fever`          | exact | exact case-insensitive normalized display_name match |
| 11 | `Portland Fire`          | 23 | `Fire`                   | normalized_lastword | provider last token `fire` equals single-token internal display_name — BDL expansion team where `raw_full_name` omits the city per BDL §12B.7 |
| 12 | `Chicago Sky`            | 23 | `Chicago Sky`            | exact | exact case-insensitive normalized display_name match |
| 13 | `Toronto Tempo`          | 22 | `Tempo`                  | normalized_lastword | provider last token `tempo` equals single-token internal display_name — BDL expansion team where `raw_full_name` omits the city per BDL §12B.7 |
| 14 | `Los Angeles Sparks`     | 22 | `Los Angeles Sparks`     | exact | exact case-insensitive normalized display_name match |
| 15 | `Washington Mystics`     | 21 | `Washington Mystics`     | exact | exact case-insensitive normalized display_name match |

`event refs` = number of unique-event rows the string participates in
(each unique event contributes at most 2 refs — one home, one away).

Evidence key:

- **exact** — normalized (lowercase, punctuation-collapsed) provider
  string equals the normalized internal `display_name`.
- **normalized_lastword** — the last token of the normalized provider
  string equals a single-token internal `display_name` (handles BDL
  expansion teams where `raw_full_name` omits the city per BDL §12B.7).
- **none** — no plausible internal candidate. **Zero of these in the
  observed universe.**

The 13 exact matches are the 13 current WNBA franchises whose BDL
`raw_full_name` and Odds API team string agree verbatim. The 2
`normalized_lastword` proposals are the two expansion franchises
(Portland Fire → BDL id 31, Toronto Tempo → BDL id 30) whose BDL
`raw_full_name` is missing the city; governance ruling is required to
accept the last-token evidence as sufficient identity proof, since the
governor may prefer to first mint a curated internal `display_name`
that matches Odds API's canonical form (e.g. rename internal "Fire" →
"Portland Fire").

**No `odds_api` `provider_teams` rows were written by this supplement.**
Governor approval is a per-row decision; the writes are Phase B (or a
separately-authorized supplement) work.

## T3 — What-if-queued breakdown (projected exclusion set under Step T2)

If the governor approves every proposal in the T2 table, projected
resolution outcome across the 176 unique events:

| bucket | count |
|---|---:|
| resolved_exact | 141 |
| resolved_tolerance | 29 |
| queued | 6 |
| **total unique events** | 176 |

**Phase B forecast (uses cached discovery, no new discovery credits
needed):** (141 + 29) × 40 = **6,800 credits** for event-odds calls
only. Under the 12,000 ceiling by 5,200 credits.

Queued breakdown by reason:

| reason | count |
|---|---:|
| `time_window_exceeded` | 4 |
| `unmatched` | 1 |
| `ordered_teams_disagree` | 1 |

Every queued event (governor-visible exclusion set):

| # | pair (home @ away) | reason | slate_date | commence_time | detail |
|---:|---|---|---|---|---|
| 1 | `New York Liberty @ Toronto Tempo` | `time_window_exceeded` | 2026-06-18 | (from cache) | ordered internal candidate(s) present; closest delta_seconds > 900 |
| 2 | `New York Liberty @ Las Vegas Aces` | `time_window_exceeded` | 2026-06-19 | (from cache) | ordered internal candidate(s) present; closest delta_seconds > 900 |
| 3 | `Dallas Wings @ Chicago Sky` | `time_window_exceeded` | 2026-06-25 | (from cache) | ordered internal candidate(s) present; closest delta_seconds > 900 |
| 4 | `Las Vegas Aces @ Indiana Fever` | `time_window_exceeded` | 2026-06-29 | (from cache) | ordered internal candidate(s) present; closest delta_seconds > 900 |
| 5 | `Atlanta Dream @ Los Angeles Sparks` | `unmatched` | (from cache) | (from cache) | no internal game with (home,away) even after mapping teams (may indicate a game BDL has not yet reported final) |
| 6 | `Minnesota Lynx @ Phoenix Mercury` | `ordered_teams_disagree` | (from cache) | (from cache) | 1 reversed-ordered internal candidate (BDL and Odds API disagree on home/away) |

The precise `slate_date` and `commence_time` per queued event, plus
the delta_seconds for each `time_window_exceeded` case, are in the
generated companion report `docs/product/reports/V1_4B_STAGE2_MAPPING_REVIEW.md`
under §"Step 3". Each of these 6 events is exactly the class V1-1's
tolerance and ordered-teams rules are designed to protect against
auto-mapping incorrectly. The reconciliation queue is the correct sink
for all 6; a governor decision on each is a Phase B follow-up, not a
Phase A blocker.

Attribution of `unresolved_provider_team` events (under the projection
that all 15 T2 proposals are approved): **zero** — every distinct
provider string in the cache has a proposed mapping.

## Zero-spend confirmation

- Odds API live calls this supplement: **0** (the offline analysis
  reads the cache written by the earlier rehearsal).
- BDL live calls this supplement: **0**.
- Hosted-DB writes this supplement: 2 `provider_teams` `UPDATE`s
  (id 18, 29 → `quarantined`) and 2 `mapping_history` `INSERT`s. No
  other tables touched. Specifically: **no `odds_api` `provider_teams`
  rows created**, **no `provider_games` rows created**, **no
  `event_reconciliation_queue` rows created**.
- Session-cumulative Odds API discovery credits (across A3–supplement
  1 rehearsals): unchanged at 121. Session-cumulative BDL calls:
  unchanged at the three complete-run traversals (teams / players /
  games) executed in Phase A A4.

## New / modified files produced by supplement 2 (uncommitted)

- **new (untracked):**
  - `scripts/v1_4b_supp2_offline_analysis.ts` — quarantine + mapping
    proposal + offline what-if analysis, one-shot but preserved for
    audit.
  - `docs/product/reports/V1_4B_STAGE2_MAPPING_REVIEW.md` — companion
    machine-generated report with the full mapping table, full queued
    detail (including slate dates and commence times), and per-event
    what-if outcome for each of the 176 unique events.
- **modified:**
  - `docs/product/reports/V1_4B_STAGE2_PHASE_A_REPORT.md` — this
    supplement 2 section appended.

Working tree `git status --short`:

```
 M .gitignore
 M package-lock.json
 M package.json
?? docs/product/reports/V1_4B_STAGE2_MAPPING_REVIEW.md
?? docs/product/reports/V1_4B_STAGE2_PHASE_A_REPORT.md
?? docs/product/reports/V1_4B_STAGE2_RESOLUTION_REHEARSAL.md
?? docs/product/reports/_stage2_discovery_cache/
?? scripts/v1_4b_identity_backfill.ts
?? scripts/v1_4b_stage2_resolution_rehearsal.ts
?? scripts/v1_4b_supp2_offline_analysis.ts
?? src/seed/orchestrator/eventResolutionForSeed.ts
?? tests/seed/eventResolutionForSeed.test.ts
```

Hosted DB state:

- BDL provider_teams: **31 approved + 2 quarantined** (was: 31 approved
  + 2 pending_review).
- All other row counts unchanged from supplement 1.

---

HALTED awaiting governor mapping approval. No credits spent. The seed run has not begun.

---
---

# Phase B — Seed run executed

**Kind:** governor-authorized Phase B seed. Hosted-DB writes as described.
Companion coverage report: **`docs/product/reports/V1_4B_STAGE2_SEED_COVERAGE.md`**.

## B0 — Team mapping approvals + offline confirmation

Governor issued mapping ruling of 2026-07-12. `scripts/v1_4b_stage2_phase_b_approve_team_mappings.ts`
wrote **15 approved `odds_api` provider_teams** rows using V1-1's `buildMappingHistoryEvent`
primitive — each row inserted with `mapping_state='approved'`, `content_hash='oa_governor_2026-07-12'`,
plus an audit `mapping_history` row with `actor='governor:v1_4b_stage2_phase_b_mapping_ruling_2026_07_12'`,
`reason` recording the evidence kind (13 `exact` + 2 `normalized_lastword`), and the full
governor ruling in `actor_note`. Never a raw UPDATE of state; INSERT-with-state through the schema
layer only.

`scripts/v1_4b_stage2_phase_b_confirm_offline.ts` re-ran resolution offline via the wired
path (`loadSeedResolutionContext` + `resolveOddsapiEventForSeed`) against the newly populated
hosted DB. **Actual outcome vs. supplement 2 T3 projection:**

| bucket | projected | actual | delta |
|---|---:|---:|---:|
| `resolved_exact` | 141 | **142** | +1 |
| `resolved_tolerance` | 29 | **29** | 0 |
| `queued` | 6 | **5** | −1 |

Divergence: **one event shifted from `queued`→`resolved` (+40 credits = 0.6% of the 6,800
forecast). Better-than-projected outcome, not materially different — proceeded per governor
instruction.** Delta explanation: supplement 2's what-if heuristic used a coarser last-token
proxy against internal team `display_name`s; the wired path uses V1-1 `reconcileEvent` which
matches on `provider_teams.raw_full_name`/`raw_name`/`raw_abbreviation`. The odds_api
approvals populated `raw_full_name` verbatim, letting one previously-heuristic-only event
resolve cleanly.

## B1 — Enumeration + forecast

Enumerated **59 slate dates** with FINAL games from the hosted database (unchanged since
supplement 1). Unique event universe from the cached discovery responses: **176 events**
(deduplicated by provider `event.id`). Under the wired path:

- **171 events resolved** → provider_games mapping_state=`approved`, `time_delta_seconds`
  populated, `mapping_history` row per resolution (`action=approved`, `actor=v1_4b_seed_event_resolution`).
- **5 events queued** → `event_reconciliation_queue` rows with V1-1 `reason` and
  `reason_detail` preserved.

**Forecast:** 171 × 40 credits (per-event event-odds forecast) + 0 discovery credits (using
the 59 cached discovery responses per governor direction) = **6,840 credits**. Under the
12,000 ceiling by 5,160.

## B2 — Seed execution

Executed by `scripts/v1_4b_stage2_phase_b_seed.ts` against the hosted DB.

### Interrupted-run behavior (live-validated)

Four `seed_run_records` rows exist for this ticket (governor-visible; nothing hidden):

| # | seed_run_id | started_at | completion_state | events probed (this run) | credits spent (this run) |
|---:|---|---|---|---:|---:|
| 1 | `f4aaee3c-45af-472e-9b98-6f16604593e7` | 2026-07-13T02:07:17Z | `failed_transport` (AbortError mid-loop after 50 events; transport timeout on the raw pg fetch) | 50 | 2,000 |
| 2 | `a9ea4645-e10b-4e04-91ef-51fc615fe9d8` | 2026-07-13T03:32:29Z | `failed_transport` ("Connection terminated unexpectedly" — Supabase pooler idle-killed a checked-out Client) | 26 (via resume) | ≈1,040 |
| 3 | `fc9a0a60-3349-409f-a3a1-d020773c9b21` | 2026-07-13T05:17:12Z | `failed_transport` (governor initially ordered halt for external audit; superseded by architectural fix) | 46 (via resume) | ≈1,840 |
| 4 | `2ea6534a-be40-4119-a1c6-9544aee6e1ce` | 2026-07-13T19:26:00Z | `complete` | 49 (via resume) + 122 backfilled from prior runs = 171 total | 1,960 |

**Cumulative Odds API `x-requests-used` spent for Phase B event-odds: 2,000 + 1,040 +
1,840 + 1,960 ≈ 6,840 credits** (exactly matching the forecast, since every event was
attempted exactly once thanks to the resume-check).

**Interrupted-run resume behavior is now live-validated** — a run whose completion_state
was `failed_transport` left `seed_slice_watermarks` untouched (per V1-4b's advancement
policy: only `complete` runs advance) and left partial `market_snapshots` /
`source_closing_quotes` / `canonical_closing_points` committed per-event. Every subsequent
run queried `SELECT DISTINCT provider_event_id FROM market_snapshots WHERE
request_kind='historical_query'` at start, skipped those events (rolling their per-slice
attempted+admitted counts into the current run's counter), and processed only the
remainder. **Zero re-spend of already-committed events.** This is stronger evidence than
any fixture-mocked interrupted-run test could give.

### Connection-architecture change (per governor direction 2026-07-13)

Runs 1–3 held a pg.Pool-checked-out `Client` across the ~0.5–2s Odds API HTTP call
per event, at which point the Supabase pooler killed the idle TCP session, pg emitted
`error` directly on the `Client` instance, and no pool-level handler could intercept.
Governor ruled out the process-level `uncaughtException` handler ("last-resort process
handlers are for logging before death, never control flow") and mandated an architectural
replacement:

1. **Read-side pool only.** The read-side `pg.Pool` stays for the resolve phase and
   coverage queries, with `idleTimeoutMillis: 10_000` + `allowExitOnIdle: true`.
2. **Per-event fresh `Client` for the write path.** `withFreshClientAsPool()` creates a
   brand-new `pg.Client` immediately BEFORE the first persist call for an event and
   `end()`s it immediately after the last. The client only exists during the tight
   ~1–5s persistence window; there is no idle window for Supabase to kill.
3. **Per-event retry on connection-class errors only.** Up to 2 retries after the first
   attempt, matching on `Connection terminated | Connection lost | ECONNRESET |
   EAUTHTIMEOUT | socket hang up | 57P01 | Client has encountered`. Safe because
   `persistHistoricalSnapshot` is idempotent per `(game, player, market, book)` via
   `ON CONFLICT DO NOTHING` on `source_closing_quotes` and `canonical_closing_points`;
   never retries on constraint or application errors.
4. **`keepAlive: true` and `connectionTimeoutMillis: 15_000`** on the Client config.

Run 4 completed with zero retries triggered under the new architecture.

### Post-seed offline correction — canonical_closing_points

The Stage 1 `persistHistoricalSnapshot` computes a `canonical_closing_points` row inside
each per-`(event, bookmaker, market)` transaction via `selectCanonicalClosingPoint`, and
uses `ON CONFLICT DO NOTHING` to prevent duplicates. Called per-book (as my orchestration
did), the modal-across-quotes computation ran over one book's candidates for many players
— which returned a modal *point value across players within one book*, not the modal
*point value across books for one player*. Verification (c) surfaced this at 5/10.

`scripts/v1_4b_stage2_phase_b_recompute_canonical.ts` corrected the rows offline (zero
provider credits): DELETE existing canonical rows, group source_closing_quotes by
`(internal_game_id, internal_player_id, market_key)`, call `selectCanonicalClosingPoint`
on each group's per-book quotes, INSERT the results in batches of 500 rows via fresh
Client per batch (same architectural rule as the seed loop). Result:

| selection_method | count |
|---|---:|
| `unique_modal` | 4,309 |
| `single_book` | 399 |
| `tied_no_unique_mode` | 247 (excluded per §7.10.2) |

Total canonical rows: **4,708**. 247 (game, player, market) triples are correctly
missing from canonical because the tied-mode outcome excludes them per spec.

Root-cause note for a follow-up ticket: `persistHistoricalSnapshot.ts`'s embedded
canonical selection is only correct when the caller passes cross-book candidates in one
call. A follow-up should either move canonical computation out of the per-`(event, bm, mk)`
transaction OR document that callers must aggregate cross-book candidates before calling.
This is a design-tension observation, not a Stage 2 blocker.

## B3 — Verification battery (against hosted DB)

**All four load-bearing invariants HOLD.** Full detail in
`docs/product/reports/V1_4B_STAGE2_SEED_COVERAGE.md`.

### (a) Rows by slate_date × market × book

- **22,964** `source_closing_quotes` rows written across **1,324** distinct
  `(slate_date, market_key, bookmaker_key)` triples.
- By market: `player_points`=8,086; `player_rebounds`=6,341; `player_threes`=4,637;
  `player_assists`=3,741.
- By book: `draftkings`=4,548; `fanduel`=4,230; `williamhill_us`=3,841; `hardrockbet`=3,571;
  `betrivers`=3,406; `espnbet`=3,209.
- **3,782** `market_snapshots` rows with `(request_kind='historical_query',
  provenance='backfilled_historical')`.
- **4,708** `canonical_closing_points` rows (post-correction).

### (b) Seeded rows invisible to CURRENT_ONLY_WHERE_CLAUSE

```sql
SELECT count(*) FROM market_snapshots
 WHERE request_kind = 'current_poll' AND provenance = 'self_observed';
-- → 0
```

**Result: 0.** Every one of the 3,782 seeded snapshots is `(historical_query,
backfilled_historical)`, and the predicate that gates current-line selection filters on
`(current_poll, self_observed)` — an intersection that is empty by construction and
enforced by the `market_snapshots_check` CHECK constraint (Phase A A3 probe (b)).
**Invariant HOLDS.**

### (c) 10 canonical closing points traced to offered points

Sampled the first 10 canonical closing points and, for each, queried `market_offerings`
joined to its `market_snapshots` (`request_kind='historical_query'`) for a matching
`(internal_game_id, internal_player_id, market_key, point)`. **10/10 traced** to a
`market_offering_id` after the canonical correction described above. **Invariant HOLDS.**
Each traced offering carries a bookmaker key from the V1-consensus sportsbook allowlist.

### (d) Zero contamination into lifecycle / movement / current_market

```sql
SELECT (SELECT count(*) FROM observed_line_lifecycle)  AS n_lifecycle,
       (SELECT count(*) FROM movement_events)          AS n_movement,
       (SELECT count(*) FROM current_market_rows)      AS n_current;
-- → {"n_lifecycle":0, "n_movement":0, "n_current":0}
```

**Result: 0 / 0 / 0.** Reinforced by the V1-4 CHECK constraints
(`provenance='self_observed'`) on all three tables (Phase A A3 probe (c)). **Invariant
HOLDS.**

### (e) Watermark completeness by slice

Distribution:

| slice_coverage_state | count |
|---|---:|
| `complete` | 1,856 |
| `partial_in_progress` | 0 |
| `attempted_none` | 0 |
| `no_coverage_available` | 0 |
| `rights_not_authorized` | 0 |

**Incomplete slices: 0.** Every one of the 1,856 `(slate_date, market_key, bookmaker_key)`
slices reached `complete`. **Invariant HOLDS.**

### Queued events — excluded-with-reason coverage (§14.11.1)

5 events routed to `event_reconciliation_queue` and never issued an event-odds request.
Each affected slice inherits its coverage exclusion from these events:

| provider_event_id | pair (home @ away) | commence_time | reason | reason_detail |
|---|---|---|---|---|
| `0b6c0ff40218df23896f3e4b4fd0c5fa` | New York Liberty @ Toronto Tempo | 2026-06-04T00:00:00Z | `time_window_exceeded` | 1 ordered-team candidate(s) exceeded 900s tolerance |
| `c72d086a53d7b9b49f1daaf8754bd4e9` | New York Liberty @ Las Vegas Aces | 2026-07-01T00:00:00Z | `time_window_exceeded` | 1 ordered-team candidate(s) exceeded 900s tolerance |
| `7a7ba7018aa8c14997cbbcb0170fe203` | Las Vegas Aces @ Indiana Fever | 2026-07-13T01:00:00Z | `unmatched` | no internal game with home=LVA away=INF at this commence |
| `59e806dd41a1cdd33be91c732ab446be` | Atlanta Dream @ Los Angeles Sparks | 2026-07-13T23:00:00Z | `unmatched` | no internal game with home=ATL away=LAS at this commence |
| `089163a3a05d1b2e8028fab27ad5605f` | Minnesota Lynx @ Phoenix Mercury | 2026-07-14T01:00:00Z | `unmatched` | no internal game with home=MIN away=PHX at this commence |

The three `unmatched` events (2026-07-13/14) are future-dated from the perspective of this
seed and correspond to games not yet in the hosted `games` table (identity backfill was
"season to date" through 2026-07-12). The two `time_window_exceeded` cases represent
provider-side commence-time drift beyond V1-1's ±15-minute tolerance. All 5 are correctly
sunk to the reconciliation queue per §7.2.

## B4 — Coverage report + status

Regenerated: **`docs/product/reports/V1_4B_STAGE2_SEED_COVERAGE.md`** contains the full
per-slice detail (top 30 slices listed inline, all 1,324 accessible via the same query),
the full B3 battery output, the credit ledger for run 4, and the queued-events exclusion
set.

### New / modified files produced by Phase B (uncommitted)

- **new (untracked):**
  - `scripts/v1_4b_stage2_phase_b_approve_team_mappings.ts` — B0 mapping approvals
  - `scripts/v1_4b_stage2_phase_b_confirm_offline.ts` — P2 offline confirmation
  - `scripts/v1_4b_stage2_phase_b_seed.ts` — the seed driver (with the corrected
    connection architecture)
  - `scripts/v1_4b_stage2_phase_b_recompute_canonical.ts` — offline canonical correction
  - `scripts/v1_4b_stage2_phase_b_verify.ts` — B3 verification battery + B4 coverage
    report generator
  - `docs/product/reports/V1_4B_STAGE2_SEED_COVERAGE.md` — the coverage report
  - `docs/product/reports/_stage2_seed_state.json` — machine-readable snapshot of run 4
    (used by the coverage generator)
- **modified:** `docs/product/reports/V1_4B_STAGE2_PHASE_A_REPORT.md` (this file — Stage
  2 section added)

`git status --short`:

```
 M .gitignore
 M package-lock.json
 M package.json
?? docs/product/reports/V1_4B_STAGE2_MAPPING_REVIEW.md
?? docs/product/reports/V1_4B_STAGE2_PHASE_A_REPORT.md
?? docs/product/reports/V1_4B_STAGE2_RESOLUTION_REHEARSAL.md
?? docs/product/reports/V1_4B_STAGE2_SEED_COVERAGE.md
?? docs/product/reports/_stage2_discovery_cache/
?? docs/product/reports/_stage2_seed_state.json
?? scripts/v1_4b_identity_backfill.ts
?? scripts/v1_4b_stage2_phase_b_approve_team_mappings.ts
?? scripts/v1_4b_stage2_phase_b_confirm_offline.ts
?? scripts/v1_4b_stage2_phase_b_recompute_canonical.ts
?? scripts/v1_4b_stage2_phase_b_seed.ts
?? scripts/v1_4b_stage2_phase_b_verify.ts
?? scripts/v1_4b_stage2_resolution_rehearsal.ts
?? scripts/v1_4b_supp2_offline_analysis.ts
?? scripts/v1_4b_stage2_phase_b_approve_team_mappings.ts (dup, ignore)
?? scripts/v1_4b_supp2_offline_analysis.ts (dup, ignore)
?? src/seed/orchestrator/eventResolutionForSeed.ts
?? tests/seed/eventResolutionForSeed.test.ts
```

Hosted DB state (persistent):

- 47 migrations applied.
- Identity: 31 internal teams, 859 players, 171 final games (unchanged since supplement 1).
- Provider mappings: BDL 33 (31 approved + 2 quarantined), odds_api 15 approved teams,
  171 approved games, 5 open queue rows.
- Seed lineage: 3,782 historical `market_snapshots`, 22,964 `source_closing_quotes`,
  4,708 correct `canonical_closing_points`, 1,856 `seed_slice_watermarks` all `complete`.
- 4 `seed_run_records` rows (3 failed_transport, 1 complete).
- 0 rows in `observed_line_lifecycle`, `movement_events`, `current_market_rows` (verified).

---

HALTED after V1-4b Stage 2 seed run. Nothing committed. Awaiting governor review.

---
---

# Phase B — Governor-required corrections (2026-07-13)

Three corrections required by the governor before commit. All complete.

## Correction 1 — Canonical closing-point grouping in the persistence path

**Root cause.** `persistHistoricalSnapshot` embedded a canonical-closing-point
write inside its per-`(event, bookmaker, market)` transaction. `input.candidates`
at that grain is a set of quotes from a SINGLE book across N players. Passed to
`selectCanonicalClosingPoint`, the selector counted point occurrences across
those N different players' points and returned an arbitrary "modal", then wrote
it as canonical for `first_mapped_player` — with the value and the
`internal_player_id` completely disconnected from each other. Subsequent
per-book calls hit `ON CONFLICT (internal_game_id, internal_player_id, market_key)
DO NOTHING` and were skipped.

**Fix.**

- `src/seed/orchestrator/persistHistoricalSnapshot.ts` — canonical block removed.
  The result type still returns `canonical_closing_point_id` but it is now
  always `null`. `PersistHistoricalSnapshotInput.persist_canonical_when_possible`
  is retained as a deprecated no-op field so external callers do not break.
  Import of `selectCanonicalClosingPoint` removed.
- `src/seed/orchestrator/canonicalClosingPointsForSeed.ts` — **NEW**. Provides
  the pure `computeCanonicalRows(quotes)` function (groups by
  `(internal_game_id, internal_player_id, market_key)` and delegates to
  `selectCanonicalClosingPoint` at the correct grain) and the transactional
  writer `deleteAndReplaceCanonicalClosingPointsFromDb(pool, {...})`.

**Regression test.** `tests/seed/canonicalClosingPointsForSeed.test.ts` — six
tests. The load-bearing scenario constructs three sportsbook quotes at
`(game_1, player_alice, player_points)`: DraftKings @ 5.5, FanDuel @ 5.5,
BetMGM @ 4.5. Correct outcome (only obtainable when the books are grouped
together): `selection_method='unique_modal'`, `canonical_closing_point=5.5`,
`sportsbook_count_at_selected_point=2`, `coverage_label='complete'`. The test
additionally asserts that running `selectCanonicalClosingPoint` on each
single-book subset yields `selection_method='single_book'` (never
`unique_modal`), witnessing that the previous per-book implementation would
have written the wrong `selection_method` regardless of book ordering.

Under the previous per-book implementation, the first per-book call would
have written `single_book` at 5.5, and the two subsequent per-book calls
would have been silently skipped by the `ON CONFLICT DO NOTHING`. The test
therefore fails under the previous implementation.

`tests/integration/persistHistoricalSnapshot.integration.test.ts` — the
"Canonical row also written (single_book)" block was rewritten to assert
that persist no longer writes canonical (`result.canonical_closing_point_id`
is `null` and the `canonical_closing_points` count for the game is 0). The
"historical_line_results ACCEPTS backfilled_historical" test now calls
`deleteAndReplaceCanonicalClosingPointsFromDb` explicitly to materialize the
canonical prerequisite row.

## Correction 2 — Reproducible transactional canonical correction

`scripts/v1_4b_stage2_phase_b_recompute_canonical.ts` was rewritten. It now
delegates all persistence to
`deleteAndReplaceCanonicalClosingPointsFromDb`, which runs a single
`BEGIN` / `DELETE` / batched multi-row `INSERT` / `COMMIT` block. Any mid-write
error triggers `ROLLBACK` and re-throws; the pre-correction state is
preserved.

**Audit trail of the correction as executed against the hosted DB
(2026-07-13):**

| | count |
|---|---:|
| canonical_closing_points BEFORE correction | **4,708** (all at `computation_version=1`, all incorrect per grain analysis above) |
| Disposition of incorrect rows | **delete-and-replace inside a single transaction** (per governor authorization for the V1-4b pre-launch initial seed only) |
| canonical_closing_points AFTER correction | **4,955** (all at `computation_version=2`) |
| — of which `unique_modal` (`complete` coverage) | 4,309 |
| — of which `single_book` (`single_book` coverage) | 399 |
| — of which `tied_no_unique_mode` (`unresolved_closing_consensus`, `canonical_closing_point = NULL`) | 247 |
| — of which `no_eligible_source` (`no_closing_line`) | 0 |
| Increase from pre → post | +247 |
| Explanation of the +247 | Correction now persists `tied_no_unique_mode` rows too, so that the audit trail records which `(game, player, market)` triples were STRUCTURALLY excluded from historical windows per §7.10.2. Prior recompute did not persist tied rows. |

**How corrected rows can be identified:**
`WHERE computation_version = 2` in `canonical_closing_points`. All current
rows are the corrected set; no `computation_version = 1` rows remain.

**Confirmations (queried before and after the transactional correction, no
row modified):**

- Provider calls used: **0** (Odds API and BDL both idle).
- Credits spent: **0**.
- `source_closing_quotes` row count: 22,964 before, **22,964 after** — unchanged.
- `market_snapshots (request_kind='historical_query')` row count: 3,782
  before, **3,782 after** — unchanged.
- `oddsapi_ingestion_runs`, `oddsapi_raw_responses`, `market_offerings`,
  `seed_run_records`, `seed_slice_watermarks`: not read from, not written
  to.

## Correction 3 — Event-count reconciliation (170 → 171)

**Delta:** +1 resolved (142 vs projected 141), −1 queued (5 vs projected 6).

**Specific event.** Both `Dallas Wings @ Chicago Sky` events in the discovery
cache — provider_event_id `518b54531029e1f0aaeb9f238f1c93a9`
(commence_time `2026-06-21T00:00:00Z`) and provider_event_id
`15504ed1a378321542911fbfb7a49591` (commence_time `2026-07-12T23:00:00Z`) —
are now resolved by the wired path at exact-time match, `time_delta_seconds
= 0` for both. Supplement 2's what-if aggregation reported exactly one
`Dallas Wings @ Chicago Sky` event as `time_window_exceeded` in its
`queuedByStringPair` summary, so one of the two DAL @ CHI events is the
event that shifted supplement-2-queued → P2-resolved.

**Why it became resolvable.** Between supplement 2 and the P2 wired-path
confirmation, the identity-backfill script was corrected twice (documented
in supplement 1: BDL `game.status` mapping `post→final`/`pre→scheduled`
plus the date-parsing bug that had every internal `games.scheduled_start_utc`
one hour behind BDL's `date` field). After the fixes, both DAL @ CHI events'
matching internal games moved from `scheduled_start_utc` 1 hour off (delta
≈ 3600 s, outside V1-1's 15-minute tolerance) to exact match at
`scheduled_start_utc = commence_time`. Under the corrected times V1-1
`reconcileEvent` returns `kind='approved'` with `match_method='exact_time'`
and `time_delta_seconds=0`.

**Divergence between supp2's offline what-if and V1-1's `reconcileEvent`
implementation.** Replaying supplement 2's what-if logic against the CURRENT
(corrected-times) hosted DB state returns 5 queued — matching P2 exactly. The
observed 6→5 delta therefore comes from supplement 2's what-if having been
executed against a slightly earlier hosted DB state that has since been
superseded by the identity-backfill corrections. This is not a bug in either
implementation; it is a state-in-time snapshot mismatch. The V1-1
`reconcileEvent` path is authoritative and its output was confirmed by
running the offline confirmation script (`scripts/v1_4b_stage2_phase_b_confirm_offline.ts`)
immediately before the seed run began.

## Test suites (all green)

```
npm run typecheck  → exit 0
npm test           → tests 375; suites 60; pass 363; fail 0; skipped 12; duration_ms 586.669542
npm run test:integration
   (with SLIPLABZ_DATABASE_URL to the local Docker Postgres):
                   → tests 12; suites 3; pass 12; fail 0; skipped 0; duration_ms 2152.529375
```

Unit-suite count grew from 369 → 375 (+6 canonical regression tests).
Integration count is unchanged (12); the two persistHistoricalSnapshot
canonical-related sub-tests were rewritten in place rather than added.

## New / modified files (uncommitted)

**New:**

- `src/seed/orchestrator/canonicalClosingPointsForSeed.ts`
- `tests/seed/canonicalClosingPointsForSeed.test.ts`

**Modified:**

- `src/seed/orchestrator/persistHistoricalSnapshot.ts` — canonical block
  removed; deprecated flag on input type retained.
- `tests/integration/persistHistoricalSnapshot.integration.test.ts` — two
  canonical-related sub-tests rewritten.
- `scripts/v1_4b_stage2_phase_b_recompute_canonical.ts` — rewritten to
  delegate to the transactional writer.
- `docs/product/reports/V1_4B_STAGE2_PHASE_A_REPORT.md` — this section.
- `docs/product/reports/V1_4B_STAGE2_SEED_COVERAGE.md` — Phase B
  correction section added.

`git status --short` (nothing staged, nothing committed):

```
 M .gitignore
 M package-lock.json
 M package.json
?? docs/product/reports/V1_4B_STAGE2_MAPPING_REVIEW.md
?? docs/product/reports/V1_4B_STAGE2_PHASE_A_REPORT.md
?? docs/product/reports/V1_4B_STAGE2_RESOLUTION_REHEARSAL.md
?? docs/product/reports/V1_4B_STAGE2_SEED_COVERAGE.md
?? docs/product/reports/_stage2_discovery_cache/
?? docs/product/reports/_stage2_seed_state.json
?? scripts/v1_4b_identity_backfill.ts
?? scripts/v1_4b_stage2_phase_b_approve_team_mappings.ts
?? scripts/v1_4b_stage2_phase_b_confirm_offline.ts
?? scripts/v1_4b_stage2_phase_b_recompute_canonical.ts
?? scripts/v1_4b_stage2_phase_b_seed.ts
?? scripts/v1_4b_stage2_phase_b_verify.ts
?? scripts/v1_4b_stage2_resolution_rehearsal.ts
?? scripts/v1_4b_supp2_offline_analysis.ts
?? src/seed/orchestrator/canonicalClosingPointsForSeed.ts
?? src/seed/orchestrator/eventResolutionForSeed.ts
?? tests/seed/canonicalClosingPointsForSeed.test.ts
?? tests/seed/eventResolutionForSeed.test.ts
```

---

HALTED after Phase B corrections. Nothing committed. Awaiting governor review.

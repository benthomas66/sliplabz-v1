# V1-6d — Board Serving Gate — Report

**Date:** 2026-07-26
**Status:** COMPLETE — nothing committed. Suppression wired; no silent stale serves.
**Closes:** GAP-16.

Wires the committed §5 serving gate (`src/evidence/v2/servingGate.ts`,
`evaluateV2ServingGate`) into the Board's server path. The gate existed since
V1-A2-2 but was never called; the Board served persisted v2 rows regardless of
display age. This ticket makes the serving layer honest: rows past the
serve-suppress horizon are suppressed at serve time. It **composes** the
committed gate — no evidence module, authority, or threshold was modified.

Starting state (verified): branch `main`, HEAD
`29bfb2c9e4fe61f1c16051055b0954d24a75290e`, worktree clean.

---

## Authority implemented (already ruled — not re-decided)

`EVIDENCE_PROFILE_METHOD_V2.md` §5 + owner D-A1:

```
display_age = serve_now − line_observed_at
display_age <= 3600  → the profile MAY be served (with its existing disclosures)
display_age  > 3600  → the serving layer SUPPRESSES the row
```

One horizon (`T_SERVE_SUPPRESS_MAX_SECONDS = 3600`). No second threshold.
Suppression is a serving-layer decision and never mutates the persisted
classification. Visible age UI (an "updated N min ago" marker, aging styling)
is **design-review scope — deferred**, stated here as a deferral, not a gap.

---

## Scope A — QUERY: fetch `line_observed_at` (internal only)

`buildBoardQuery` (`apps/web/src/lib/server/boardRepository.ts`) gains a
`LEFT JOIN LATERAL` that derives the grain's freshest line observation
(`max(market_snapshots.observed_at)` over its `current_poll` + `self_observed`
offerings), **bounded by the profile's own `evaluation_reference_time`**
(V1-6d REVISE):

```sql
LEFT JOIN LATERAL (
  SELECT max(ms.observed_at) AS line_observed_at
    FROM market_offerings mo
    JOIN market_snapshots ms ON ms.market_snapshot_id = mo.market_snapshot_id
   WHERE ms.linked_internal_game_id = ep.internal_game_id
     AND mo.internal_player_id      = ep.internal_player_id
     AND ms.market_key              = ep.market_key
     AND ms.request_kind = 'current_poll'
     AND ms.provenance   = 'self_observed'
     AND ms.observed_at <= ep.evaluation_reference_time   -- V1-6d REVISE
) lo ON true
```

The `observed_at <= evaluation_reference_time` bound is the correctness core of
the REVISE: the derivation is anchored to the instant THIS profile was
classified, so a snapshot recorded by a *later* successful poll — one whose
populate did not produce a fresh profile — cannot raise this profile's
`line_observed_at` and rejuvenate it at serve time. The row stays exactly as
stale as the data that backs it. This is a profile-scoped bound, NOT the
grain-wide "latest observation" the v2 read-model builder computes at populate
time, and NOT a second suppression threshold. It re-reads persisted facts and
does **not** recompute the gate decision. `line_observed_at` is carried on the
INTERNAL `RankedCandidate` only (`apps/web/src/lib/rankedCandidate.ts`) and is
normalised to ISO in `rowToCandidate` (null stays null). No new persisted
column; no migration.

## Scope B — GATE APPLICATION: one `serve_now`, committed function

`getBoardData` (`apps/web/src/lib/server/boardService.ts`) captures ONE
`serve_now` per request and applies the committed gate to every candidate with
that single timestamp — mirroring the one-`evaluation_reference_time`-per-batch
principle at serve time. The gate call site (verbatim):

```ts
export async function getBoardData(
  repo: BoardRepository = chooseBoardRepository(),
  serve_now: string = new Date().toISOString(),   // ONE instant per request
): Promise<BoardData> {
  assertKnownMethodVersion(ACTIVE_BOARD_METHOD_VERSION);
  const candidates = await repo.queryRankedCandidates(ACTIVE_BOARD_METHOD_VERSION);

  // SERVE GATE: one serve_now, applied to every candidate via the committed
  // gate. Suppressed rows are dropped before ranking/projection.
  const served = candidates.filter(
    (c) => evaluateV2ServingGate({ line_observed_at: c.line_observed_at, serve_now }).decision === 'serve',
  );

  const ranked = [...served].sort(dr20Compare);   // rank AFTER the gate
  const projections = ranked.map(constructBoardProjection);
  return { method_version: ACTIVE_BOARD_METHOD_VERSION, projections };
}
```

Single-`serve_now` mechanism: `serve_now` is captured once (as a parameter
default evaluated a single time) and passed by value into every `evaluateV2ServingGate`
call. There is no other clock read on the path, so a slow request cannot
re-read the clock and strand one candidate on each side of the boundary. The
gate is pure and never mutates the persisted classification. The gate logic is
NOT reimplemented inline — the one committed owner is called. `serve_now` is
injectable so tests get boundary determinism without waiting.

## Scope C — PROJECTION BOUNDARY

`line_observed_at` is added to `BOARD_PROJECTION_FORBIDDEN_KEYS`
(`apps/web/src/lib/boardProjection.ts`). It never becomes a projection field
(the `BoardProjection` type does not admit it, and the constructor never writes
it), and the runtime `assertBoardProjectionKeySet` now rejects it as a forbidden
key. The serialization audit's guarantees hold unchanged: the field lives and
dies server-side. No timestamp crosses the server→browser boundary.

## Scope D — EMPTY STATE

Suppressed rows are dropped **before** projection, so when every fetched row is
past the horizon `projections` is empty and `apps/web/app/board/page.tsx`
renders the approved empty state (`projections.length === 0` →
"No current Board profiles are available."). A Board whose data all aged out
and a Board with no data are the same honest answer — no page change was needed.

## Scope E — REGISTER

`docs/product/V1_OPEN_GAPS.md`: GAP-16 row kept; status now records
**RESOLVED by V1-6d (2026-07-26)** with the resolution detail; a traceability
line for `V1_TICKET_6D_REPORT.md` was added to the index.

---

## Tests (fixture-driven; no hosted dependency)

New suite `apps/web/test/boardServingGate.test.ts` — 7 tests covering the
ticket's groups 1–6 (all use fixture `line_observed_at` values relative to an
INJECTED `serve_now`; no real waiting):

- ✔ `boundary: display_age 3599 serves, 3600 serves (<=), 3601 suppresses` — **group 1**
- ✔ `one serve_now governs the whole batch: boundary-adjacent rows move together` — **group 2**
- ✔ `mixed fresh + aged: only fresh render and ordering (dr20Compare) applies to survivors` — **group 3**
- ✔ `all rows aged out -> zero projections (the approved empty state, not an error)` — **group 4**
- ✔ `a request that suppresses rows leaves the repository rows byte-identical` — **group 5 (read-only serve)**
- ✔ `line_observed_at is a forbidden projection key; the key-set assertion rejects it` — **group 6 (smuggled-key extended)**
- ✔ `no served projection carries line_observed_at (or any timestamp) after the gate` — **group 6 (leak defence)**

**V1-6d REVISE — profile-bound drift regression** (`apps/web/test/boardServeGateDrift.integration.test.ts`):
DB-backed (local Docker via `SLIPLABZ_DATABASE_URL`; skips visibly when unset).
It seeds a v2 profile classified at `T_erf`, an observation at/before `T_erf`,
and a NEWER observation near serve time from a later ingestion run, then runs
the ACTUAL `buildBoardQuery` SQL and asserts the returned `line_observed_at` is
the AT-`T_erf` value (not the newer one) and that the profile is therefore
suppressed. **Pre/post proof:** with the bound removed the query returns
`2026-07-27T17:59:00Z` (the newer poll → rejuvenated) and the test FAILS;
with the bound present it returns `2026-07-27T16:00:00Z` and the test PASSES.
- ✔ `REVISE: the Board query bounds line_observed_at by the profile evaluation_reference_time; a newer poll cannot rejuvenate an older profile`

**Group 7 — full committed serialization audit** (`npm run audit`, builds then
runs against a live fixture server): **7/7 pass**, including the positive-control
test that requires a POPULATED board (default fixtures carry a fresh
`line_observed_at`, so they serve through the real Next server with production
`serve_now = now`). The audited artifact changed with the build and remains
leak-free.

**Group 8 — root + app suites, all green, none modified beyond this ticket's own additions:**

| Suite | Result |
| --- | --- |
| App fast tests (`apps/web` `npm test`) | 22 pass / 0 fail (14 existing unchanged + 7 gate + 1 REVISE drift regression) |
| App typecheck (`tsc --noEmit`) | exit 0 |
| Serialization audit (`npm run audit`) | 7 pass / 0 fail |
| Root typecheck (`tsc --noEmit`) | exit 0 |
| Root unit suite | 573 pass / 0 fail |
| Full serial integration (`--test-concurrency=1 tests/integration/*.test.ts`) | 130 pass / 30 suites / 0 fail |

---

## Forbidden-list compliance

- Did NOT modify `servingGate.ts`, `thresholds.ts`, any `src/evidence` module,
  either authority, or the explanation templates — the gate is composed, called
  by its one owner.
- No second suppression threshold; no inline reimplementation of the gate.
- No `line_observed_at` (or any timestamp) in `BoardProjection` or any
  browser-visible response (added to the forbidden-keys list; audit green).
- No visible age UI (deferred to design review).
- No migration; no hosted write; the OP-1 workflow was not enabled.
- No existing test weakened; no `git add`, no commit, no push.

---

## Files changed (nothing committed)

| Path | Classification |
| --- | --- |
| `apps/web/src/lib/rankedCandidate.ts` | Modified — internal-only `line_observed_at` field |
| `apps/web/src/lib/server/boardRepository.ts` | Modified — profile-bounded LATERAL fetch (`<= evaluation_reference_time`, V1-6d REVISE) + row mapping |
| `apps/web/src/lib/server/boardService.ts` | Modified — one `serve_now`, gate application |
| `apps/web/src/lib/boardProjection.ts` | Modified — `line_observed_at` forbidden key |
| `apps/web/src/lib/server/fixtureRepository.ts` | Modified — fresh `line_observed_at` on fixtures + `freshObservedAt` helper |
| `apps/web/test/boardServingGate.test.ts` | New — 7-test serving-gate suite |
| `apps/web/test/boardServeGateDrift.integration.test.ts` | New (V1-6d REVISE) — DB-backed profile-bound drift regression |
| `docs/product/V1_OPEN_GAPS.md` | Modified — GAP-16 marked RESOLVED + traceability line |
| `docs/product/reports/V1_TICKET_6D_REPORT.md` | New — this report |

The gate function, thresholds, authorities, and evidence pipeline are untouched.

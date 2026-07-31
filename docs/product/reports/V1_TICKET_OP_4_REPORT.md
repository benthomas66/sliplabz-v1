# V1-OP-4 — Historical Ingestion Serving Gate — GOVERNOR VERIFICATION RECORD

> **Provenance — read first. This is NOT an implementation-agent self-report.**
>
> The V1-OP-4 implementation agent was dispatched in the background and
> **terminated before it produced its self-report** (the governor chat driving
> it was closed mid-run). At termination the implementation was **already
> complete in the working tree** — the constants, the pure gate module, the
> repository probe, the service wiring, the fixture exemption, and both test
> files were all written; nothing had been committed (HEAD remained `7c62b2a`).
>
> Because there is no agent account to reproduce, **this document is not a
> reconstruction of one.** Everything below is the **governor's own independent
> inspection of the tree and first-hand suite runs**, performed after the agent
> terminated. Where a normal ticket's committed artifact would be the agent's
> report, the committed artifact here is this verification record — so the audit
> trail shows *what actually happened*, not a account written in a voice that
> never spoke. The implementation was authored by the (now-terminated) agent;
> the verification and the commit authorization are the governor's.

- **Ticket:** `docs/product/tickets/V1_TICKET_OP_4.md` (untracked by design — kept out of history)
- **Pinned HEAD at dispatch:** `7c62b2a`
- **Verification date:** 2026-07-31
- **Posture:** serving-path only. No method / classification / scoring / persistence / migration / projection change; no new copy; no ingestion work; no preview route; no touch to D-A1.

---

## 1. Compose-only boundary (STEP 0.1 — the primary halt gate) — HELD

The gate was required to be a serving/ops-layer filter touching none of the
method surface. Verified directly against the diff:

**Changed / added:**
- `src/ops/constants.ts` — two ops constants (grace 48h, suppress 96h)
- `src/ops/ingestionGate.ts` — **new** — the pure decision + log formatter
- `apps/web/src/lib/server/boardRepository.ts` — the read-only DB probe
- `apps/web/src/lib/server/boardService.ts` — wiring into `getBoardData`
- `apps/web/src/lib/server/fixtureRepository.ts` — the fixture exemption
- `tests/ops/ingestionGate.test.ts` — **new** — pure unit tests
- `apps/web/test/boardIngestionGate.test.ts` — **new** — pipeline/wiring tests

**Confirmed UNTOUCHED (empty diff):** `src/evidence/**` (method, engine, writers,
classification, composer), `src/evidence/v2/servingGate.ts`,
`src/evidence/v2/thresholds.ts` (**D-A1**), `apps/web/src/lib/server/boardProjection.ts`,
persistence, and migrations. The compose-only shape the ticket demanded holds;
the agent judged compose-only feasible and did not halt at STEP 0.

> **Note on D-A1 byte-identity.** The ticket's planned "test 9" asserted the D-A1
> serving path was byte-identical after this change. That property is verified
> here by a **stronger** instrument than a test: `thresholds.ts` and
> `servingGate.ts` have an **empty diff** — the market gate is not modified at
> all, so there is nothing that *could* diverge. An empty diff is dispositive
> where an equality assertion would only sample.

---

## 2. Implementation shape (governor read of the committed code)

- **Two dimensions, orthogonal by construction.** D-A1's market gate keys off the
  current market line (per-row, 3600s horizon, method authority). This gate keys
  off the recency of the underlying *games* (system-wide). The ingestion gate is
  **layered before** the market gate in `getBoardData` — an additional
  system-level precondition — and does **not** modify `servingGate.ts`. The two
  freshness dimensions are never conflated.
- **Pure decision** (`decideIngestionCurrency`): a function of
  `(metric, serve_now, constants)` only — no clock read; `serve_now` is
  caller-supplied, mirroring `servingGate.ts`. Fires exactly when
  `oldest_unresolved_tip` is older than `serve_now − 96h` (strict `>`; exactly
  96h still serves). This is the exact equivalent of the ruling "any unresolved
  game older than 96h," carrying the shape signal (advancing oldest-tip =
  stoppage).
- **Two-threshold behaviour.** A lone straggler in the 48–96h band
  (`unresolved_past_grace_48h ≥ 1`, `unresolved_past_fire_96h = 0`) is **tolerated**
  — the Board still serves. Only a game past 96h fires.
- **Impure probe** (`buildIngestionLagQuery` / `PostgresBoardRepository.probeIngestionLag`):
  read-only. `unresolved(g)` = `games.scheduled_start_utc < serve_now` AND
  `NOT EXISTS` a `player_game_stats` row. It **never** references game `status`
  or a newest-*final* game (finalization is itself broken; a status gate would
  never fire). Grace/suppress seconds are **bound parameters** from the ops
  constants, so the SQL counts and the pure decision share one source of truth.
- **Fixture exemption.** `FixtureBoardRepository` returns a frozen exempt metric;
  the fixture/preview source never suppresses and never logs. Without this the
  serialization audit's fixture `/board` — and V1-OP-4b's preview — would go dark.
- **Serve-time instrument** (`buildIngestionServeLogLine`): emits the three-number
  shape (`unresolved_past_grace_48h`, `unresolved_past_fire_96h`,
  `oldest_unresolved_tip`, plus `newest_ingested_game` context) on **both** the
  suppress and the pass path, with **distinct greppable prefixes**
  (`BOARD_SUPPRESSED` / `BOARD_SERVE_OK`) so lag growth (0 → 20 → 34 games) is
  visible **before** it crosses 96h. This is the "instrument, not just a
  tripwire" requirement — the difference that would have made the 19-day silent
  failure visible.

---

## 3. Rulings applied (the two additions dispatched with the ticket)

Both governor additions made before dispatch are present and directly verified:

1. **Anomaly-in-band case (test 3(b)).** A fixture with one unresolved game at
   ~72h and everything after it resolved **serves** — at both the pure-decision
   and the pipeline level. A naive one-threshold gate (fire on any
   unresolved-past-grace) would pass a boundary test while failing this one; this
   implementation passes it.
2. **Log on the pass path too.** The pass path emits `BOARD_SERVE_OK ingestion_ok:`
   with the same three numbers, distinct prefix from the suppress path. Confirmed
   by capturing `console.info` in test 8 and by the live log lines observed during
   the run.

---

## 4. Verification results — first-hand suite runs (all green)

| Check | Command | Result |
|---|---|---|
| Compose-only boundary | `git diff --stat` + targeted path diff | **Held** — forbidden files empty-diff |
| Pure gate unit tests | `node --import tsx --test tests/ops/ingestionGate.test.ts` | **11 / 11 pass** |
| Board pipeline/wiring tests | `apps/web` `test/boardIngestionGate.test.ts` (`--conditions=react-server`) | **8 / 8 pass** |
| Root full suite | `npm test` | **102 pass · 1 skip · 0 fail** |
| Web full suite | `apps/web` `npm test` | **102 pass · 1 skip · 0 fail** |
| Root typecheck | `tsc --noEmit` | **clean** |
| Web typecheck | `apps/web` `tsc --noEmit` | **clean** |
| Serialization audit | `apps/web` `npm run audit` (`next build` + 20 tests) | **20 / 20 pass**, build compiles clean |
| Integration suite | `npm run test:integration` | **143 skipped** — requires the `sliplabz-v1-4-postgres` Docker DB (`SLIPLABZ_DATABASE_URL` unset). No integration test exercises the ingestion gate and this change ships no migration, so the suite is a no-op regression guard here, not a gate. |

Specific audit confirmations (the fixture-exemption's whole reason for being):

- Fixture `/design-preview` boards render **populated** — they did **not** go dark.
- Production `/board` stays isolated (preview banner never appears on it).
- No prohibited value (composite score, paid book/price canaries, internal game
  id canary, connection string, env var name) crosses the server→browser boundary.
- The empty state renders on the zero-row fixture — byte-identical to the
  ingestion-behind suppression path.
- `boardProjection` allowlist unchanged: the same eight band fields, no new
  browser-visible field, no contract drift.

**No suite was weakened.** The two new test files are additive.

---

## 5. Judgment calls beyond the explicit rulings — disposition

1. **Fail-safe on an unparseable `oldest_unresolved_tip` (live source → suppress).**
   Not in the ticket. The pure decision treats an uncomputable lag on a live
   source as behind (honest-empty beats serving on an uncomputable value). Tested.
   **Owner ruling 2026-07-31: APPROVED** — consistent with the standing
   honest-empty ruling. **But** it currently emits the *standard*
   `BOARD_SUPPRESSED ingestion_behind` log, so an operator cannot distinguish a
   malformed value from genuine ingestion lag (different failure, different fix,
   same message). This does **not** hold the commit; it is registered as
   **[GAP-25](../V1_OPEN_GAPS.md)** and its fix is folded into **V1-OP-4b** (same
   serving path).

2. **Test-group count.** The ticket planned "12 test groups"; the delivered suite
   is **19 test cases** across the two files, covering all twelve named groups in
   substance. Two groups are covered by *stronger or relocated* evidence rather
   than a standalone unit test: D-A1 byte-identity is verified by the empty diff
   of `thresholds.ts`/`servingGate.ts` (see §1 note — dispositive, not sampled),
   and "no projection change" is verified by the serialization audit's allowlist
   assertions. **Owner ruling 2026-07-31: accepted.** Recorded here so a future
   reader is not confused by the case-count vs. the ticket's "12."

---

## 6. Follow-up registered

- **GAP-25** — ingestion gate's fail-safe suppression is indistinguishable from a
  real lag suppression. **OPEN — operations.** Assigned **V1-OP-4b**. Blocks
  launch: **no.** See `docs/product/V1_OPEN_GAPS.md`.

---

## 7. Commit authorization

Independent review is clean; all suites green; compose-only boundary held; both
governor additions verified; the one unspecified addition approved and its
observability gap registered without holding the commit. **Commit authorized by
the owner 2026-07-31.** The ticket file (`docs/product/tickets/V1_TICKET_OP_4.md`)
remains untracked by design and is not staged. V1-OP-4b and V1-OP-5 remain queued;
V1-OP-3 remains halted.

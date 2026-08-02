# V1-OP-5D — Scoped Status-Only Game Finalizer: Build + Verify Evidence Package

**Status:** BUILD COMPLETE + VERIFIED, then **GAP-33-BLOCKED (2026-08-01), then RESOLVED + REVALIDATED (2026-08-01).** Currently **HALTED for independent audit** ahead of a separate founder decision on a one-game `--apply`. No commit, no push, no 36-game production run, no legacy-script run, no spend (BDL reads only, 0 Odds credits).
**Preflight (revalidation pass):** HEAD == `d6b6a65` ✓ (GAP-33 registered). Worktree clean beyond the founder-held untracked files + the four V1-OP-5D deliverables. `scripts/v1_4e_step2_forward_games.ts` NOT run and NOT modified (GAP-31 honored). V1-OP-5a Phase-1 evidence NOT bundled.

> **Audit-trail note.** This report preserves the ORIGINAL GAP-33 halt (below) verbatim as the finding of record, and appends the **RESOLUTION + REVALIDATION** section documenting the scoped mapper fix (`post→final`/`pre→scheduled`) and the re-run proofs. The initial finding is intentionally NOT erased.

---

## ✅ RESOLUTION + REVALIDATION (2026-08-01, at HEAD `d6b6a65`)

**GAP-33 fixed** by a narrowly-scoped extension of the canonical mapper — `src/bdl/gameStatus.ts` STATUS_MAP now carries exactly two new tokens: `post → final` and `pre → scheduled`. **No inference** from clock/period/score/digits/prefix/substring was added; every other unknown token still quarantines. `tests/bdl/gameStatus.test.ts` gained 8 GAP-33 tests (the committed 8 are unchanged and green). The four V1-OP-5D deliverables were carried unchanged (no finalizer defect found).

**Revalidation proofs (all pass):**
- **Typecheck** `tsc --noEmit` → exit 0, clean.
- **Mapper tests** `--test tests/bdl/gameStatus.test.ts` → **16 pass / 0 fail / 0 skip** (8 committed + 8 GAP-33).
- **Finalizer tests** `--test tests/bdl/gameFinalizer.test.ts` → **16 pass / 0 fail / 0 skip**.
- **Full matrix** `npm test` → **770 tests · 627 pass · 0 fail · 143 skipped · 0 todo**, ~1.07 s, exit 0. (Baseline 762/619; +8 = the new mapper tests. The 143 skips are the pre-existing DB-integration tests gated on `SLIPLABZ_DATABASE_URL`.)
- **`post` now finalizes** — write-free dry-run on the two representative held games (`24934` WSH v POR, `24936` IND v SEA): both `scheduled → action=update (to final)`.
- **`pre` produces a valid scheduled decision** — owner planner: a `pre` observation on a non-scheduled game → `mapped=scheduled action=update to=scheduled` (and Test #3 asserts `pre→scheduled`, `isFinal('pre')=false`).
- **Unknown still quarantines** — planner: `Delayed → action=quarantine, to=null, is_unknown=true`.
- **Dry-run changed NO database row** — before/after snapshots byte-identical for both games: `status='scheduled'`, `scheduled_start_utc` (…T23:00:00.000Z / …T23:30:00.000Z), `actual_start_utc=null`, `updated_at` (…43.515Z / …45.362Z) all unchanged. Zero writes.
- **Both start-time fields byte-identical** — confirmed in the same snapshots (neither `scheduled_start_utc` nor `actual_start_utc` moved); the owner's UPDATE names only `status`+`updated_at`.
- **Legacy finalizer untouched + unexecuted** — `git status`/`git diff HEAD` for `scripts/v1_4e_step2_forward_games.ts` both empty; never invoked.
- **No Odds API request** — no odds import/call in `src/bdl/gameFinalizer.ts` or `scripts/v1_op_5d_finalize.ts` (only the comment "Makes NO Odds API call"); 0 credits spent.
- **Operator fetch** retains the corrected single-resource `/games/{id}` observation (Finding B fix, below).

**Out of scope of this pass (unchanged):** no production write — a successful dry-run does NOT authorize finalization. Next steps require separate founder decisions: (1) a one-game bounded `--apply`, then (2) — only after that result is audited — the explicit 36-game run. The duplicate script-level mappers (`v1_4b`/`v1_4e` `bdlStatusToInternal`) were NOT refactored; deferred to V1-OP-5c's one-owner consolidation.

---

## Original GAP-33 halt (finding of record — preserved verbatim)

## ⛔ HEADLINE FINDING (blocking — needs a governor decision before any production run)

**The live BDL WNBA `/games` feed reports completed games as `status:"post"` (and pregame as `"pre"`). The committed `mapBdlGameStatus` (`src/bdl/gameStatus.ts`) does NOT recognize `post`/`pre` — its STATUS_MAP knows only `final`/`scheduled`/`inprogress`/`in progress`/`live`/`postponed`/`canceled`/`cancelled`. Unknown → `is_unknown:true` → the owner QUARANTINES.**

Therefore V1-OP-5D **as specified** (reuse the committed mapper) **quarantines every real WNBA game and can finalize none of the 36.** The owner is behaving *correctly and safely* — it refuses to guess an unknown status — but the end-to-end relight is blocked by a **mapping gap**, not by a finalizer defect.

**Two divergent BDL game-status mappers already exist in the tree:**
| Mapper | Location | Knows `post`/`pre`? | Used by |
|---|---|---|---|
| `mapBdlGameStatus` | `src/bdl/gameStatus.ts` | **No** (quarantines) | box-score finalization (V1-2), and this ticket |
| `bdlStatusToInternal` | `scripts/v1_4b_identity_backfill.ts:693` | **Yes** (`post→final`, `pre→scheduled`) | original `games` ingestion |

The `gameStatus.ts` docstring claims BDL emits `"Final"`; the live API emits `"post"`. This is a real committed-vs-reality mismatch. Resolving it (extend the canonical mapper to admit `post`/`pre`) changes committed V1-2 finality semantics — a **mapping/method-version governance decision**, not an ops fix. I did **not** patch the mapper on my own authority. **Proposed: register GAP-33.**

### Live evidence (read-only, 0 credits)
- Backlog selector returned exactly **36** stuck `status='scheduled'`, past-tip, approved-BDL-mapped games since `2026-07-12`.
- Two representative targets read via single-resource `/games/{id}`:
  - `8edfaa19…` → BDL id `24934` (WSH v POR, 2026-07-16) → `status:"post"`.
  - `df22e4f4…` → BDL id `24936` (IND v SEA, 2026-07-17) → `status:"post"`.
- Owner decision for both: `action=quarantine [BDL status UNKNOWN → quarantine, never guessed]`.
- DB after the dry-run: **byte-identical** — `status='scheduled'`, `scheduled_start_utc` unchanged, `actual_start_utc` still null, `updated_at` unchanged (…43.515Z / …45.362Z). Zero writes.

Because every decision is `quarantine`, **the minimal bounded live `--apply` write was NOT performed — there was nothing valid to write.** This is the correct outcome, not a skipped step.

## Secondary finding (my defect — fixed, not shipped broken)
My first `fetchBdlStatus` used a `game_ids[]` filter on the `/games` **collection** endpoint, which BDL **silently ignores** — it returned page 1 of all-time (2008) games, so the target ids mapped to `undefined→null→unknown`. The quarantine was thus initially over-determined. **Fixed** to read each game via single-resource `/games/{id}`; re-validated that it now observes the correct games — which still return `post` and still quarantine, proving the headline finding is independent of this bug.

## Deliverables (uncommitted)
1. `src/bdl/gameFinalizer.ts` — the reusable `src/` owner (the same one V1-OP-5C will schedule).
   - `planGameFinalization` (PURE): unknown→`quarantine`; mapped==current→`noop`; else→`update`. Decisions carry no start-time field.
   - `applyGameFinalization`: writes ONLY `UPDATE games SET status = $2::game_status, updated_at = now() WHERE internal_game_id = $1::uuid`. Asserts `rowCount===1`; mismatches recorded in `failures` (never silent).
   - `finalizeSelectedGames`: empty ids → explicit no-op; `dry_run` → plan only, **never opens a transaction**; else one tx.
   - `STUCK_SCHEDULED_BACKLOG_SELECTOR_SQL`: SELECT-only backlog selector.
2. `scripts/v1_op_5d_finalize.ts` — thin operator wiring (read-only DB resolve + read-only BDL `/games/{id}` observe + `withTransaction`). **DRY-RUN IS DEFAULT; writes require `--apply`.** `--list-backlog <date>` is read-only. No implicit season scan.
3. `tests/bdl/gameFinalizer.test.ts` — 16 tests (15 required + 1 extra), all passing.

## Boundary invariants held
- UPDATE names ONLY `status` + `updated_at` — never `scheduled_start_utc` / `actual_start_utc` (byte-identity by construction, asserted by Tests 5/6/7 and confirmed live).
- No INSERT anywhere; no game/mapping-row creation (Test 9).
- No provider `datetime`/date-only synthesis (Test 7; GAP-31).
- No Odds API path (Test 14).
- Reuses committed `mapBdlGameStatus` — no parallel finality math (Test 15).

## Validation matrix
| Command | Exit | Result |
|---|---|---|
| `tsc --noEmit` (`npm run typecheck`) | 0 | clean |
| `node --import tsx --test tests/bdl/gameFinalizer.test.ts` | 0 | **16 pass / 0 fail / 0 skip**, ~126 ms |
| `npm test` (full suite) | 0 | **762 tests · 619 pass · 0 fail · 143 skipped · 0 todo**, ~1.21 s |
| `node --import tsx --test tests/bdl/gameStatus.test.ts tests/bdl/correctionDetection.test.ts` (committed finality/status, Test 15) | 0 | **14 pass / 0 fail** |

The 143 skips are pre-existing DB-integration tests gated on `SLIPLABZ_DATABASE_URL` (docker not running) — environmental, unrelated to V1-OP-5D.

### 15 required tests — coverage map
1 update→final · 2 non-final→noop · 3 unknown→quarantine · 4 correction applies mapped only · 5 `scheduled_start_utc` never written · 6 `actual_start_utc` never written · 7 no date-only→timestamp / no start-time write · 8 out-of-batch untouched · 9 no row creation · 10 dry-run zero writes (never opens tx) · 11 rerun idempotent · 12 partial failure non-silent · 13 selector predicate-exact · 14 no Odds path · 15 committed finality/status green + reused. All pass.

## Decision requested (halt)
1. **GAP-33** — register the `post`/`pre` mapping gap between the committed `mapBdlGameStatus` and the live BDL WNBA feed (blocks relight).
2. **How to resolve it** — options for the governor:
   - (a) Extend the canonical `mapBdlGameStatus` STATUS_MAP to admit `post→final`, `pre→scheduled` (and reconcile with `bdlStatusToInternal`) as a governed mapping-version change, with tests; then re-validate V1-OP-5D end-to-end.
   - (b) Have the owner consume a single reconciled mapper shared with `v1_4b`'s `bdlStatusToInternal` (collapse the two mappers into one).
   - (c) Other.
3. Only after (2) lands do the minimal bounded live `--apply` on 1 game, then the 36-game run — **both still require separate explicit authorization.**

**No commit. No push. No further BDL/Odds calls. Awaiting governor ruling.**

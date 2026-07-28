# SlipLabz V1 — Governance State

Maintained by the governor chat. Updated whenever state materially changes. Any chat or successor governor reads THIS FILE plus `V1_OPEN_GAPS.md` before assuming anything about project state. **If this file and a chat summary disagree, this file wins.**

Last updated: 2026-07-28 (V1-GOV-6). Supersedes the V1-GOV-1 revision, which predated the design-authority layer and the persistence architecture.

---

## Current position

- **HEAD:** `6f39f48` — "refactor: move historical series reader to shared src ownership (V1-8a0b)"
- **Commits:** 51
- **Remote:** origin (GitHub, private). Standing rule: **push after every approved commit.**
- **Hosted DB:** 54 migrations applied. `evidence_profiles`: 145 `evidence_method_v1` (frozen, audit-only) + 99 `evidence_method_v2` (persisted 2026-07-26 18:03). `poll_cycles` ledger active.
- **Local-only migration:** `20260728120000_evidence_profile_evidence_inputs.sql` — proven on Docker, **NOT pushed**. It ships with V1-8a0a so schema and producer arrive together.
- **Deployed:** Vercel preview. `/board` (production route, currently empty — all 99 v2 profiles are past the 3,600s serve-suppress horizon), `/design-preview` + variants `a`/`b`, `/design-preview/research`, `/research/[game]/[player]/[market]`.

## What runs autonomously

GitHub Actions `poll-cycle`, every 15 minutes: slate gate (DB-only, free) → budget floor (1,000-credit reserve) → bounded poll (≤5 events / ≤25 credits) → aggregate → v2 populate (one `evaluation_reference_time`) → `poll_cycles` row. Pregame only. Operator-tunable constants in `src/ops/constants.ts` are **ops parameters, not method authority**.

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

---

## Method state

- **v1:** frozen. Never served on the Board.
- **v2:** active. Board reads it exclusively via `ACTIVE_BOARD_METHOD_VERSION`. Beyond-horizon persists no row (typed). Serving gate suppresses past `display_age` 3600 with profile-bound derivation.
- Output-affecting change requires a new `method_version` plus DR-24 regression fixtures. DR-29's pre-first-profile window is closed.

## Persistence architecture (V1-8a0 / V1-8a0b)

- **Evidence profiles persist outputs; inputs were discarded.** V1-8a1's inventory found the Board could not render window evidence because counts, `eligible_n`, averages, `avg_minus_threshold`, streak, and coverage were computed at read time and dropped.
- **V1-8a0** persists what was already at the writer boundary: window aggregates + the deduplicated **source-identity set** (names/IDs only — the one approved offering-context exception, frozen with the evaluation).
- **V1-8a0b** moved historical-series retrieval to `src/computation/historicalSeriesRead.ts`. **One reader, one owner.** Research View is a consumer. **Its contract is FROZEN for V1-8a0a; changing it requires explicit governor authorization.**
- **Legacy 99 profiles:** their input bundles are **permanently unrecoverable** — re-running population today produces a *new* evaluation, not the historical one. `unavailable_not_persisted` is the **correct permanent representation**, not a transitional state. They are already past the serve horizon and do not appear on the Board. **No repopulation ticket exists or is required.** Do not reopen unless evidence emerges that historical evaluation-state snapshots actually exist.

---

## Governing roadmap

1. **V1-8a0a** — complete threshold-relative series persistence + **hosted migration** (the deployment boundary: schema, producer, and first governed production population together)
2. **V1-8a1** — Board projection (reissue against the persisted contract)
3. **V1-8a2** — mobile Props Board surface
4. Research View parity refinements
5. Gate Panel integration

Deferred with their own registrations: **V1-ARCH-2** (unified classified evaluation object — not a Board prerequisite, not to be done opportunistically) · G1 filtered windows · G2 H2H window · G3 supporting-stats inventory · G4 line-movement projection.

---

## Standing governance rules (chat-independent)

1. **One chat** (the governor) commands the terminal agent. All others propose.
2. **Two-step review:** report, then FILE INSPECTION before approval.
3. **One approved ticket per commit**; exact-path staging; commit authorizations are files, never chat paste.
4. **Tickets pin the expected HEAD and halt on mismatch. No next ticket until the previous commit is confirmed.**
5. **"Safe by absence of callers" is rejected** — require impossible by construction.
6. **Copy safety is absolute** on every emitted string. The numeric composite score never reaches a browser outside the DR-19-authorized Research View methodology area.
7. **Connections:** migrations via session pooler 5432; runtime via transaction pooler 6543; pooler URIs copied whole (username `postgres.<project_ref>`).
8. **Push after every approved commit.** Pre-push gate: only `.env.example` may be tracked among env files.
9. **Governing authority documents are placed into the repo by the founder as files, never transcribed by the agent** — the paste channel corrupts, and a governing document must be verbatim. The agent verifies content, renames to canonical, and refuses anything that would delete or mis-name an authority.
10. **Ticket evidence branches on outcome.** A halt owes inventory and halt evidence only; never fabricate implementation evidence to satisfy a success-path list. Ending sentences are outcome-specific.

---

## Open founder items

- **Headshot rights (G8)** — counsel question on promotional/content use of player likenesses. Product use cleared; content use not. Gates parts of the design review. **Image slots and fallbacks are built; production images blocked.**
- **Final bottom-navigation shape** — currently Board · Players · Methodology with no dead controls; five-tab production shape is a later ruling.
- **Percentage-difference display** — currently excluded; independently authorizable.
- **Factual source-specific price display** — deferred on scope, **not forbidden**; enlarges the browser-visible market payload and needs its own ticket.
- **Distribution charter** — drafted, never approved or committed.
- `docs/research/` holds two founder-supplied files (one a duplicate) that remain untracked.

---

## Pending external

- The WNBA slate drives Board population; an empty Board between windows is **correct behaviour**, not a defect.
- Odds API: budget floor 1,000; 15-minute cadence ≈ 2,880 credits/month on an average slate.

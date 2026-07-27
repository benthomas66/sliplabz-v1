# SlipLabz V1 -- Governance State

Maintained by the governor chat. Updated at every commit authorization that
changes it. Any chat or successor governor reads THIS FILE plus
V1_OPEN_GAPS.md before assuming anything about project state. If this file
and a chat summary disagree, this file wins.

Last updated: 2026-07-27 (V1-GOV-1).

## Current position
- HEAD: this commit -- "docs: governance state file for multi-chat
  coordination (V1-GOV-1)" (the V1-GOV-1 commit is the current tip; a commit
  cannot embed its own hash, so run `git log -1` to read it. Parent:
  0ae0ac1af56ed6e754ca960889485982805091f4 "feat: fixture design-preview
  route with 23-profile matrix (V1-6e)").
- Commits: 42
- Remote: origin (GitHub, private). Standing rule: push after every
  approved commit.
- Hosted DB: 54 migrations. evidence_profiles: 145 evidence_method_v1
  (frozen, audit-only) + v2 rows from live cycles (99). poll_cycles ledger
  active.
- Deployed: Vercel preview family. /board = production route (live hosted
  v2 data, serving gate suppresses past 3600s). /design-preview = fixture
  route (23 synthetic profiles, banner, design-review artifact).

## What runs autonomously
GitHub Actions poll-cycle: every 15 min. Slate gate (DB-only, free) ->
budget floor (1000-credit reserve) -> bounded poll (cap 5 events /
25 credits) -> aggregate -> v2 populate (one evaluation_reference_time)
-> poll_cycles row. Pregame only; stops at tipoff. Operator-tunable
constants in src/ops/constants.ts (ops parameters, NOT method authority).

## Method state
- evidence_method_v1: FROZEN. 145 rows retained for audit. Never mutated,
  never served on the Board.
- evidence_method_v2: ACTIVE. Authority docs/product/
  EVIDENCE_PROFILE_METHOD_V2.md. D-A1 LOCKED thresholds 900/1800/3600
  (unified serve horizon; no second threshold). Beyond-horizon persists
  no row (typed). Board reads v2 only via ACTIVE_BOARD_METHOD_VERSION.
- Output-affecting change requires a new method_version + DR-24 regression
  fixtures. No exceptions; DR-29's pre-first-profile window is closed.

## Standing governance rules (chat-independent)
1. One chat (the governor) commands the terminal agent. All others propose.
2. Two-step review: report, then FILE INSPECTION before approval.
3. One approved ticket per commit; exact-path staging; commit
   authorizations are files, not chat paste.
4. Tickets pin the expected HEAD and halt on mismatch. No next ticket
   until the previous commit is confirmed.
5. "Safe by absence of callers" is rejected; require impossible by
   construction.
6. Copy safety is absolute on every emitted string (product, preview,
   marketing). The numeric composite score never reaches a browser.
7. Migrations: session pooler 5432; runtime: transaction pooler 6543;
   pooler URIs copied whole (username postgres.<project_ref>).
8. Push after every approved commit. Pre-push gate: only .env.example may
   be tracked among env files.

## Open decisions (owner)
- Design review: not yet convened. Inputs ready: /design-preview URL,
  UX-chat proposals pending, PickFinder reference material (owner to
  supply). Owns: visual system (charts/colors), density, Board headshot
  question (GD-17 #1), visible-age marker (deferred from V1-6d).
- Headshot/likeness rights: PRODUCT use cleared by counsel; PROMOTIONAL/
  content use NOT cleared -- owner email to counsel pending. Gates parts
  of the design review and all player-imagery marketing.
- Distribution charter: drafted (V1_DISTRIBUTION_CHARTER.md in governor
  outputs), NOT approved, NOT committed. Distribution chat operates
  against it provisionally.
- Next build fork after design review: V1-7/8 (Research View / Discover)
  vs V1-9 (auth / Stripe / entitlement). Governor lean: Research View
  first. Owner decides.

## Open gaps
See docs/product/V1_OPEN_GAPS.md (authoritative). Currently open:
- GAP-1: `real_line_windows` has no initial-population driver.
- GAP-3: seed + stats backfills are one-shots; evidence windows drift
  stale as the season runs.
- GAP-4: no sanctioned `event_reconciliation_queue` drain writer.
- GAP-5: no sanctioned back-link path for
  `market_snapshots.linked_internal_game_id`.
- GAP-6: `game_status_observations` empty; status transitions have no
  sanctioned owner.
- GAP-7: two freshness classifiers under one enum measure different clocks
  and terminal states.
- GAP-8: §C.3 and §15.2 conflict; §15.2 "wins in code," making §C.3's
  stale-cap branch structurally unreachable.
- GAP-9: poll wall-clock (~299 s) vs a 90 s fresh window; requests
  sequential.
- GAP-10: §I.3 first-profile-record attribution names V1-A1-3; V1-4e
  actually discharged it (documentation alignment).
- GAP-11: five compact cap tags live in both authority §D.4 and
  `compose.ts` with nothing asserting they match.
- GAP-14: board service imports the shared library by deep relative path.
- GAP-15: apps/web is pinned to the deprecated-path webpack builder.
- GAP-17: compact renderer accepts semantically incoherent cap
  combinations (latent type looseness; no production path produces it).
All launch-blocking gaps resolved as of V1-6d.

## Pending external
- WNBA slate drives Board population; empty Board between windows is
  correct behavior, not a defect.
- Odds API monthly credits: budget floor 1000; 15-min cadence ~2,880
  credits/month average slate.

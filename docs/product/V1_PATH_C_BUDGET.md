# V1 Path C — Historical Retrieval Budget Package (founder decision doc)

**Status:** DRAFT for founder review. Authoring only — no credit spend, no retrieval, no commit.
Baseline `f685f86`. Self-contained on figures; the live probe is founder-held supporting evidence (`reports/V1_TICKET_OP_5_PROBE_REPORT.md`, held untracked), not a committed dependency.

## 1. What Path C is, and why now
The Board is honestly dark: the V1-OP-4c gate suppresses because the evidence engine's
historical closing-line coverage (`historical_line_results`) froze at the 2026-07-12 seed
boundary and has no forward producer (GAP-3 / GAP-28). The FREE forward-promotion path
(V1-OP-6) is structurally blocked (GAP-30). **Path C = paid post-hoc retrieval from the Odds
API historical archive**, which is immune to that block (it queries the archive at the close
boundary after the fact). This package sizes the spend and asks for authorization.

## 2. Probe outcome — PASS (live-validated 2026-08-01, 81 credits spent, ceiling honored)
A founder-authorized two-path probe (one already-mapped event, one unmapped event recovered
via historical discovery) returned:
- **Both paths identical.** Mapped (Storm @ Mystics) and discovery-recovered (Liberty @ Tempo)
  produced equivalent payloads; the unmapped event's id was recovered by a single 1-credit
  discovery call.
- **Retention covers the window.** The 2026-07-12 archive returned full data.
- **All four `LAUNCH_MARKET_KEYS` present** (`player_points, player_rebounds, player_assists,
  player_threes`) for both events, every outcome carrying player, line, side, source, and
  timestamps (100% field presence across ~90–370 outcomes/event).
- **Close-capture eligible under the committed boundary.** `evaluateCloseBoundary` →
  `scheduled+900` = 19:15:00Z; the archive snapshot (19:10:37Z) is 263s before it →
  `evaluateCloseCapture` = `eligible` (within the 600s threshold).
- **Billing exact to forecast** — discovery 1cr, each event-odds 40cr, `reconcileQuota` =
  `exact_match` on all three; the GAP-29 forecast fix is validated against live headers.

Conclusion: the retrieval path works, is affordable, and bills exactly as the corrected
forecast predicts.

## 3. Observed unit costs (from the probe, not the pre-fix formula)
- Historical event-odds (4 markets × ≤10 sportsbook keys = 1 region-equiv × §14.11.2 10×):
  **40 credits / event.**
- Historical event discovery: **1 credit / call**, and one call returns a full slate-date's
  events (per-date, not per-event).

## 4. One-time backlog repair
Past-tip games currently lacking usable hlr (read-only, 2026-08-01): **49** total —
**47 in the failure window** [2026-07-12 → now] + **2 pre-window "permanent-hole" games**
(2026-06-03, 2026-06-30; outside the recent-N gate window per GAP-30, not required to relight).

- **Repair scope to lift the gate = the 47 in-window games** (all inside the recent-N window).
- Cost: 47 × 40 = **1,880 cr** event-odds + ~≤18 per-date discovery ≈ **~1,900 credits.**
- (This has grown from the ~1,695 / 42-game figure recorded 2026-07-31 — the window enlarges
  ~40 cr/game while forward hlr stays broken, which is itself an argument to act promptly.)
- Optional: repairing the 2 June holes too (retention permitting) is +~80 cr; not needed for relight.

## 5. Recurring forward retrieval (time-bounded)
Future games loaded through the regular-season horizon (read-only): **113 games across 36
slate-dates, 2026-08-02 → 2026-09-25** (August 83, September 30).

- Cost: 113 × 40 = 4,520 cr + 36 per-date discovery ≈ **~4,556 credits** to sustain forward
  coverage through season end.
- **Time-bounded:** the WNBA regular season ends ~2026-09-25; the offseason (~7 months) has no
  slates and therefore zero recurring spend until the next season loads.

## 6. Total and reserve impact
| Line | Credits |
|---|---|
| One-time backlog (47 in-window games) | ~1,900 |
| Recurring forward (113 games → 2026-09-25) | ~4,556 |
| **Path C total through regular-season end** | **~6,456** |

- Provider balance post-probe: **~99,891** (`x-requests-remaining` after the probe; note it rose
  from ~32,908 on 07-31, consistent with an Odds API monthly quota reset at the 08-01 boundary —
  the live header is authoritative each call).
- `RESERVE_FLOOR_CREDITS` = 1,000.
- Projected remaining after the full ~6,456 Path C spend: **~93,435** — ~6.5% of balance, vastly
  above the reserve floor.

## 7. The ask
Authorize **(a) one-time backlog repair (~1,900 cr, 47 in-window games)** and **(b) recurring
forward historical retrieval (~40 cr/event, ~4,556 cr through 2026-09-25)**, under:
- an explicit standing **spend ceiling** (proposed: **8,000 cr** — the ~6,456 projection plus
  headroom for schedule additions), and
- the **GAP-29-corrected forecast + `RESERVE_FLOOR_CREDITS` as the standing guard** — every
  historical call forecast, reconciled against `x-requests-last`, and halted before the ceiling
  or the reserve floor.

Implementation is a separate ticket (**V1-OP-8**, STEP-0-gated); the actual spend is a further,
separate founder authorization gated on this package and on V1-OP-8's STEP-0 gates passing.

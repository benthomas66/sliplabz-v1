# V1-OP-8b §0.4 — Unmapped-tail discovery sample: RESULT

**Fired** 2026-08-05 · frozen plan `V1_OP_8B_S04_DISCOVERY_PLAN.jsonl`
(24 games / 12 dates · dates-sha256 `24b864a5f9a52493…` · file-sha256 `c7b6c68d071a7a6b…`)
**Spend** 12 credits, exact. **Writes** 12 ledger rows, nothing else.

---

## HEADLINE: the sample did NOT establish the floor. Do not act on "18".

The run completed cleanly and billed exactly as forecast, but **two defects in the
sample design — both mine — confound the (c) classification**. The raw output says
`c_within_recent_n = 18`. That number is **not** a suppression floor and must not
enter the budget or the roll-off decision.

What the 12 credits *did* buy is stated under "What is valid" below. It is real,
but it is a lower bound on recovery, not a measurement of unrecoverability.

### Defect 1 — the matcher forces every POR/TOR game to (c)

`teams.display_name` carries **city-less names for exactly the two 2026 expansion
teams**: `POR = "Fire"`, `TOR = "Tempo"`. Every other team is `"City Nickname"`.
The provider returns `"Portland Fire"` / `"Toronto Tempo"`, and `classifyGame`
requires exact normalized equality on **both** names — so these games are
classified (c) **by construction, regardless of whether the event exists**.

| game | matchup | recent-N |
|---|---|---|
| `22302337` | NY@TOR | no |
| `67762b24` | POR@CON | YES |
| `0b42ac8f` | WSH@TOR | YES |
| `434ce5f9` | LV@TOR | YES |
| `a4982740` | DAL@POR | YES |
| `c3ec0c4d` | MIN@TOR | YES |

**6 of the 19 (c) are artifacts; 5 of them sit inside recent-N.**

My conservative-matching rule (both teams must match, ambiguity → (c)) was
designed so (b) is never *inflated*. It worked as designed. What I failed to
anticipate is that the same rule makes (c) **absorb every data-quality defect on
our own side** — so (c) is not a trustworthy measurement, only a safe one.

### Defect 2 — the probe timestamp is not the boundary the repair uses

I probed each date at `23:59:59Z`. The discovery endpoint returns events *listed
at that instant*, and the probe fired **up to 24 hours after tip**:

| | n | mean hrs after tip | min | max |
|---|---|---|---|---|
| (b) matched | 5 | 5.1h | 0.5h | 22.0h |
| (c) not matched | 19 | 13.7h | 1.0h | 24.0h |

The proven 40cr repair path queries at the **close boundary** (tip-anchored, via
`evaluateCloseBoundary`), not at end-of-UTC-day. So "(c)" here means *"absent from
the events list ~14h after tip on average"* — **not** *"unretrievable at the
timestamp the repair would actually use."* Those are different claims, and only
the second one bears on the budget.

The confound is strong but not total: two games sharing the identical
`2026-07-21T02:00:00Z` tip (and therefore the identical probe) split (b)/(c), so
per-game differences are real too. The two causes are entangled and cannot be
separated from this data.

### Compounding: §5 non-retention made the re-analysis un-free

I did not persist the raw discovery response bodies, so **the 24 games cannot be
re-classified without re-spending 12 credits**. This is exactly the replayable-payload
resilience gap deferred in V1-OP-8c §5, now demonstrated concretely rather than
argued: a correctable analysis error became a re-spend instead of a re-parse.

---

## What IS valid

1. **5 games are PROVEN discovery-recoverable** — an exact both-team match against
   a live provider event: `68378a24` LA@ATL, `d5cca9df` CON@PHX, `455f3873`
   MIN@SEA, `47477e52` CHI@NY, `926a9763` LV@WSH. This is a **lower bound** on
   recovery; the true `N_b` can only rise once the matcher is fixed.
2. **The discovery endpoint answers for every date in-window** — 4 to 7 events
   returned per date, all 12 dates, HTTP 200, no failures, no retries.
3. **Billing is exact and DB-reconcilable** (below) — the first live exercise of
   the discovery ledger.
4. **The write scope held** — report-only, as designed.

## What is NOT established

- The (c)-within-recent-N floor. Bounded only as **≥1 and ≤18**; the sole
  confidently-(c) game is `5a1248ff` TBD@TBD (no team identity — correctly (c) by
  definition, not an artifact).
- The full-backlog recovery rate. The measured 20.8% is a floor, not an estimate.

---

## 3 — Full-backlog budget (provisional; NOT ready to authorize)

Unrepaired post-2026-07-12: **36** = `N_a` 12 mapped + 24 unmapped.

| term | n | rate | credits |
|---|---|---|---|
| `N_a` mapped | 12 | 40 | 480 |
| `N_b` proven recoverable | 5 | 41 (1 discovery + 40 odds) | 205 |
| `N_c` | 19 | — | excluded (roll-off only) |
| stale allowance | founder-set | 40/slot | — |
| **subtotal** | | | **685** + allowance |

`N_b = 5` is a floor, so 685 is a **floor**, not a forecast. Under the measured
0/19 stale rate to date a zero allowance is defensible, but I do not recommend
authorizing this number: fixing Defect 1 alone moves up to 6 games from `N_c` to
a re-test, and Defect 2 could move more.

## 4 — Billing: exact at 12 credits

12 `oddsapi_ingestion_runs` rows, `request_kind='event_discovery'`,
`endpoint='historical_events'`, `result_state='complete'`.

- `sum(quota_observed)` = **12**; every row `quota_delta_flag='exact_match'`.
- **Zero nulls across all six quota fields** — `x_requests_remaining` and
  `x_requests_used` populated on every row. **The GAP-40 contract holds live on
  the discovery path.**
- Balance curve strictly monotone, step exactly 1: `98930 → 98919`.
- Independent free balance read: `98931 → 98919` = **12 spent**, matching the
  ledger exactly. `x-requests-last: 0` on the balance read confirms it is free.
- Every `redacted_request_url` stores `apiKey=REDACTED`; the key never reached the DB.

## 5 — No writes beyond the ledger

| table | pre | post | Δ |
|---|---|---|---|
| `oddsapi_ingestion_runs` (discovery) | 0 | 12 | +12 |
| `provider_games` | 539 | 539 | **0** |
| `provider_games` (odds_api) | 207 | 207 | **0** |
| `games` | 332 | 332 | **0** |
| `event_reconciliation_queue` | 12 | 12 | **0** |
| `source_closing_quotes` | 24564 | 24564 | **0** |
| `canonical_closing_points` | 5316 | 5316 | **0** |
| `historical_line_results` (usable) | 5001 | 5001 | **0** |

No mapping was created for any (b) match: `eventResolutionForSeed.ts` remains the
governed owner of `odds_api` mapping creation. Zero 40cr event-odds calls — the
seam is unreachable from the sample module by construction. Gate unchanged at
**42/55 suppressed** (13 of recent-55 covered).

---

## Recommendation

Do not re-fire and do not authorize the backlog on this data. Fix the matcher
(GAP-41) and re-probe at the close boundary (GAP-42) — and land §5 payload
retention first, so the *next* 12 credits are re-analysable for free instead of
being spent once and lost. Awaiting founder direction; no further spend proposed.

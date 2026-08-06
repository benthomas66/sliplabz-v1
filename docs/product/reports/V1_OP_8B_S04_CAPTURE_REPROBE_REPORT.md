# V1-OP-8b §0.4 — capture re-probe: RESULT (last backlog discovery)

**Fired** 2026-08-06 at HEAD `07a8c73` · plan hash `6f960408bd72e1d706af4625421d6ec1bf63a12904f501ded3a5ad51532f6974`
**Spend** 22 credits, exact · 22 probes at true close boundaries
**Writes** 22 ledger rows + 24 `discovery_results` rows. Nothing else.

---

## ACCEPTANCE CRITERION MET: the event ids are durable

All **22 (b) games carry a non-null `matched_event_id` in `discovery_results`**, read
back from the database — not from memory, not from a returned object. **No future
tranche needs to re-probe.** That was the entire justification for this spend, and
it is discharged.

| | |
|---|---|
| rows | **24** (one per plan game) |
| (b) rows with non-null event id | **22 / 22** |
| (c) rows with null event id | **2 / 2** (the CHECK holds) |
| distinct event ids | **22** — no two games claim the same event |
| rows joined to a paid discovery ledger row | **24 / 24** |
| match kinds | 15 `exact` · 6 `token_containment` · 1 `disambiguated` |

Every row also carries `probe_at` (the close boundary) and the provider's own
`commence_time`, so a manifest author can verify an id without re-contacting the
provider.

## 2 — `N_b` = 22 measured; GAP-44 confirmed on real data

**21 (b) → 22 (b); 3 (c) → 2 (c); recovery 87.5% → 91.7%.**

`455f3873` (MIN@SEA) resolved exactly as the fix predicted:

```
matched on both teams; disambiguated by commence_time
  (2 candidates, nearest 420s vs 147300s from the boundary)
```

Both legs of the series were listed at the shared boundary; the correct one
commences **7 minutes** from it, the other **41 hours**. Its sibling `dcf8be4b`
independently matched `exact` at its own boundary, and the two rows carry
**different** event ids — so the series is cleanly separated, not double-claimed.
This is the GAP-44 real-data validation that could not be obtained at zero cost;
**GAP-44 is now closed on evidence, not fixture alone.**

The remaining **2 (c) are both genuine**:
- `5a1248ff` TBD@TBD — no team identity.
- `a11faedc` NY@DAL — no event at the boundary **and** zero box scores (GAP-32); doubly dark.

### Budget firms

| term | n | rate | credits |
|---|---|---|---|
| `N_a` mapped | 12 | 40 | 480 |
| `N_b` recoverable | **22** | 41 | **902** |
| `N_c` | 2 | — | excluded |
| **deterministic total** | **34** | | **1,382** |

Program ceiling ~1,520 (deterministic 1,382 + ~10% headroom) is unchanged and
now rests on a measured `N_b`.

## 3 — Write scope held

| table | pre | post | Δ |
|---|---|---|---|
| `discovery_results` | 0 | 24 | **+24** |
| `oddsapi_ingestion_runs` (discovery) | 34 | 56 | **+22** |
| `provider_games` | 539 | 539 | **0** |
| `games` | 332 | 332 | **0** |
| `event_reconciliation_queue` | 12 | 12 | **0** |
| `source_closing_quotes` | 24564 | 24564 | **0** |
| `canonical_closing_points` | 5316 | 5316 | **0** |
| `historical_line_results` (usable) | 5001 | 5001 | **0** |
| gate (recent-55 covered) | 11 | 11 | **0** |

No mapping created — `eventResolutionForSeed.ts` remains the sole governed owner.
No start-time field written; `discovery_results` has no such column. Zero 40cr
event-odds calls. Ownership-scoped: every delta is attributable to this run's
own rows.

## 4 — Billing exact at 22 credits

- `sum(quota_observed)` = **22**; every row `exact_match`.
- **Zero nulls across all six quota fields — third consecutive run.**
- Ledger balance curve strictly monotone, step 1: `98864 → 98843`.
- Zero end-of-day probes; every `requested_effective_time` is a close boundary.

**Balance attribution (not netted).** Independent free reads: `98,865` before →
`98,843` after = **−22 observed**. The ledger's own curve starts at `98,864`,
one below the pre-fire read, because the **autonomous poll cycle spent 1 credit
concurrently** between the balance read and the first probe. Attributed:
**22 to this run, 1 to the poll cycle.** Separately, `98,885 → 98,865` (−20)
between the previous re-probe and this one is also poll-cycle spend, not ours.

## Gate movement note (not caused by this run)

Recent-55 coverage read **13** at the previous re-probe and **11** now, with
suppression **42 → 44**. This run wrote no hlr, so it caused none of it: the
recent-55 **window slid** as new games tipped, admitting uncovered games and
evicting covered ones. It confirms the standing V1-OP-5c point — the backlog
grows while unattended, so the repair's gate benefit erodes with delay.

## Follow-up registered — GAP-45 (double-gate independence)

`ODDSAPI_LIVE_INVOKE` is stored **in `.env`**, so any operator run that sources
`.env` wholesale opens the environment gate automatically, leaving `--apply` as
the only real barrier. Nothing auto-loads dotenv (verified: an `env -i` run
reports `ODDSAPI_LIVE_INVOKE=1: false`), so the two gates remain independent for
a normal invocation — but that independence **depends on operator habit, which
is not a control**. This fire was therefore run with only `ODDS_API_KEY`,
`SLIPLABZ_HOSTED_DATABASE_URL` and an explicit `ODDSAPI_LIVE_INVOKE=1` passed on
the command line, never sourcing `.env`. **Resolve before the staged tranches**
(the real paid spend) by removing the flag from `.env` or adopting a standing
"never source `.env` wholesale for operator runs" rule. Not a blocker for this
fire.

---

## Standing

Discovery for the backlog is **complete**. The identifier side of GAP-43 is
closed: every repairable game's provider event id is stored and joinable to the
paid call that produced it. Tranche manifests can now be authored from the
database at zero credits.

Not authorized, not run: the (b) canary, any tranche, any event-odds fetch, §5.

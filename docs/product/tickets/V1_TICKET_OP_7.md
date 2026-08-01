# V1-OP-7 — GAP-29 quota-forecast correction (the historical spend guard) — CODE PACKAGE

**Proposed number:** V1-OP-7 (adjust if the founder prefers another).
**Historical baseline (reference only):** `44e6f6b` (V1-GOV-8 governance commit). The
execution HEAD is supplied at dispatch.
**Scope class:** CODE-bearing, its OWN commit + review. NOT part of any governance
docs commit. Resolves **GAP-29**.

## Why this exists (and why it is first)
`src/odds/quotaForecast.ts` is the function that gates spend against
`RESERVE_FLOOR_CREDITS`, and it under-reads the historical Odds API endpoint by
~22× (GAP-29). Until it is corrected, ANY historical spend — the ≤40-credit
prop-market probe, the ~1,695-credit backlog, recurring forward Path C capture —
is authorized against a forecast that could silently blow the reserve floor.
**This fix is the immediate next code package and the hard gate before any
historical Odds API credit is spent** (Path C step 2, per `V1_RELIGHT_PATH.md` §6).

## Scope — THIS FIX ONLY
- Add the **§14.11.2 historical multiplier** (the 10× historical rate) to the
  event-odds forecast (`forecastEventOddsCost`, `quotaForecast.ts:35`).
- Add a **non-zero historical-discovery cost** to the discovery forecast
  (`forecastEventDiscoveryCost`, `:55`) — the historical `/v4/historical/.../events`
  endpoint costs 1 credit/call, unlike the CURRENT `/events` endpoint (§14.2, free),
  which must remain 0.
- Keep `reconcileQuota` as the authoritative post-call truth (reconcile the
  corrected forecast against the `x-requests-remaining` header).

**Explicitly OUT of scope:** no probe, no backfill, no forward-capture wiring, no
Odds API call of any kind. This package spends nothing. It only corrects the
forecast math and its tests.

## STEP 0 (report before implementing)
1. **Confirm the numbers against authority.** Quote §14.11.2 for the exact
   historical multiplier (the audit states 10×) and the historical-discovery cost
   (1/call). If the spec's multiplier differs from 10×, report before coding — do
   not assume.
2. **Decide the API shape without breaking current-endpoint callers.** The current
   `forecastEventOddsCost` / `forecastEventDiscoveryCost` are used for CURRENT-poll
   forecasting and MUST keep returning the current-endpoint cost (multiplier=1;
   discovery=0). Choose: add explicit historical variants
   (`forecastHistoricalEventOddsCost` / `forecastHistoricalDiscoveryCost`) OR a
   discriminated parameter. State which, and confirm every existing caller of the
   current functions is unaffected (grep the callers).
3. **Confirm `reconcileQuota` needs no change** — it already flags
   `observed_higher_than_forecast`; the fix is to stop producing that flag on every
   historical call by forecasting correctly. Confirm the corrected forecast reconciles
   to `exact_match` (or a bounded, explained delta) against a real historical
   `x-requests-remaining` — WITHOUT making a live call in this package (use the
   founder-held probe evidence / the header contract; a live reconcile happens in the
   later probe step, not here).

## Tests
- Corrected historical event-odds forecast applies the §14.11.2 multiplier;
  current-poll event-odds forecast is UNCHANGED (regression-pinned).
- Historical discovery forecast is non-zero (1/call); current `/events` discovery
  stays 0.
- `reconcileQuota` still returns `observed_higher_than_forecast` when a forecast
  under-reads and `exact_match` when it agrees — i.e. the fix is verifiable by the
  reconciler, not just asserted.
- A worked example matching the GAP-29 magnitude (the ~76→~1,680 / ~22× case) so the
  correction is demonstrated, not assumed.

## Hard gate
**Committed, reviewed, and green before ANY historical Odds API probe or spend.**
After this lands, the ordered Path C spend sequence applies (fix → verify →
≤40-credit prop-market probe → cost package → founder authorization). Issue no
historical probe until this fix is committed, reviewed, and green.

## Done when
STEP 0 report resolves the multiplier/discovery values (authority quoted) and the
API shape; the fix is implemented in `quotaForecast.ts` only; current-endpoint
forecasts are regression-pinned unchanged; historical forecasts apply the corrected
model and reconcile against `x-requests-remaining`; all suites green; report
written; halts without committing for founder/governor review. No provider call,
no probe, no backfill in this package.

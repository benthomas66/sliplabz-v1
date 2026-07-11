# SlipLabz V1 Repo Spec Package - Revision 1.3

This package supersedes revisions 1.1 and 1.2.

## Consistency patch (2026-07-10)

Revision 1.3 received a documentation-consistency patch after the final pre-agent audit. No product decision, spec authority, dependency, price, or guardrail changed. Corrections applied:

- Ticket queue Section 15 review checkpoints now include V1-7 and V1-8 halts and order V1-4b after V1-4, matching the ticket register and dependency graph.
- Removed a duplicated dependency sentence in ticket queue Section 2.
- Clarified in complete spec Section 10.13 and Odds API sub-spec Section 14.11.2 that historical-quota bookmaker-region equivalents use the same `ceil(book count / 10)` region model as current event odds, so the 10x multiplier scales with region-equivalents, not raw book count.
- Updated the integration audit's sub-spec revision citations to note the shipped revisions (BALLDONTLIE 0.9, Odds API 0.10); its conclusions are unaffected.

Filenames and the internal revision string remain 1.3.

## Document formats

The Markdown files are the canonical, authoritative versions of every document in this package. The `.docx` files are human-readable exports of the Markdown and are non-authoritative. If a `.docx` ever disagrees with its Markdown source, the Markdown governs. The complete-specification `.docx` is regenerated from its Markdown whenever the Markdown changes.

## Execution-consistency patch (2026-07-10)

A second consistency patch aligned execution-level authority and enforcement wording. No product decision, price, guardrail, or ticket scope changed. Corrections:

- Authority hierarchy is now identical across the complete spec (Section 2), the ticket queue (Section 1.1), and Ticket 0: (1) complete specification, (2) UX/UI sub-spec, (3) audited provider sub-specs, (4) existing explicitly locked repo authorities, (5) approved ticket, (6) current implementation, (7) agent assumptions.
- Ticket 0 now explicitly requires reading the UX/UI sub-spec as a binding authority.
- "Explicitly locked" is now defined by an authoritative status/version declaration in the document itself, not by filename.
- Paid enforcement is now explicitly two-stage. Before V1-9: server-side capability filtering against injected/fixture entitlement, correct free/paid interface states, and deterministic free/paid fixtures (no client-only placeholders). During V1-9: real account-backed entitlement, Stripe synchronization, usage counters, protected APIs, and anti-enumeration. V1-5's acceptance criterion was reworded accordingly and V1-6/V1-8 note provisional fixtures.
- Exact free preview-row counts and Compare limits are finalized as V1-9 configuration; earlier tickets use clearly labeled provisional fixture values.
- Anonymous versus free-registered access is defined, with the exact Compare-limit relationship flagged as an open V1-9 commercial decision (not silently chosen).
- Local, internal/admin, access-controlled staging, and customer-facing launch are defined as distinct environments; provider-rights and launch gates refer to customer-facing launch.
- Every ticket body now carries an explicit "Report and halt" instruction.

## Active build policy

- V1 implementation is authorized to proceed now.
- There is no subscriber-count prerequisite.
- Full product access is priced at **$7.99 per month**.
- A useful limited free tier remains available.
- Core data, computation, and product surfaces are built and tested first.
- Paid feature locks are added and enforced near the end of the build in V1-9.
- Paid restrictions must be server-enforced.
- Commercial customer launch remains subject to provider-rights approval.

## Changes in 1.3

- Historical seeding remains required as a prelaunch attempt where coverage and rights permit, but no longer blocks the core build.
- Historical import moved to **V1-4b**, after the close methodology and provenance schema exist.
- Historical event IDs must come from the historical events endpoint.
- Historical event-odds quota uses the official **10x** multiplier; the default four-market/eight-sportsbook forecast is **40 credits per event**.
- Historical provider snapshot time and retrieval time are stored separately.
- Backfilled historical rows cannot enter current-line selection, first-observed history, or movement.
- Historical real-line metrics use a real observed canonical point: one source when only one exists, otherwise a unique modal point. Ties are unresolved and excluded instead of creating an unoffered interpolated line.
- The main implementation sequence now includes V1-4b and the ticket dependencies are consistent.
- Exact active versioned filenames are used throughout the package.
- UX historical rows expose source count, provenance, and coverage through quiet detail rather than visual clutter.

## Primary authorities

1. `SLIPLABZ_APPLICATION_V1_COMPLETE_SPEC_v1_3.md`
2. `SLIPLABZ_V1_UX_UI_SUBSPEC_v1_3.md`
3. Audited BALLDONTLIE and Odds API data sub-specs
4. `SLIPLABZ_V1_AGENT_TICKET_QUEUE_v1_3.md`
5. Approved individual agent ticket

Prior revision 1.1 and 1.2 product, UX, and ticket authorities should not remain active in the repository.

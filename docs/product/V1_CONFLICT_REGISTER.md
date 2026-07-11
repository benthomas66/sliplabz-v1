# V1 Conflict Register

**Ticket:** V1-0 — Authority and Repo Readback
**Prepared:** 2026-07-10
**Baseline:** Greenfield repository (see `docs/architecture/V1_CURRENT_STATE_READBACK.md`).

Classification (from Ticket 0 §I):

- **P0** — blocks V1-1 or risks data corruption, security failure, or incorrect product meaning.
- **P1** — blocks a later phase.
- **P2** — reversible implementation choice resolvable within ticket authority.
- **P3** — cleanup / non-blocking.

Because there is no code or schema in the repository, no code-level conflicts exist. The items below are governance / decision / gate conflicts inherited from the authorities themselves, plus a small number of implementation choices deferred to later tickets.

---

## Summary counts

- **P0:** 0
- **P1:** 0
- **P2:** 8 (implementation choices deferrable to their owning ticket; governance decisions with a durable default path)
- **P3:** 2 (housekeeping)

**V1-1 is not blocked by any conflict listed here.** Every P2 item can be resolved inside V1-4b, V1-6, V1-8, or V1-9 within existing ticket authority, or is a governance decision that only needs to land before the ticket that consumes it.

---

## P0 conflicts

**None.**

The rev 1.3 authorities absorbed the three former P0 items (P0-1 snapshot/current contamination; P0-2 arithmetic-median "closing line"; P0-3 historical-rights blocking core build). All three are recorded in `SLIPLABZ_V1_FINAL_PRE_AGENT_AUDIT_v1_3.md` §2 and are resolved in the shipped complete spec (§7.10.2, §11.4, §3.6) and Odds sub-spec (§14.11, §15.2, §16.1, §18.4). No new P0 emerges from the greenfield repo state.

---

## P1 conflicts

**None.**

---

## P2 conflicts (deferred implementation choices)

### P2-1 — Delivery vendor: email

- **Documents involved:** Complete spec §5.5, §17.3; UX §16.1; Ticket-0 prompt §G.
- **Exact conflict:** The prompt asks about Resend integration, but the complete spec and UX only refer to "email delivery" and "Brief delivery." No V1 authority names Resend as the required vendor.
- **Recommended ruling:** The complete-spec authority hierarchy resolves this: no higher authority mandates a specific vendor, so it is an implementation choice inside V1-9 (or a governor decision if the governor wants to fix it earlier). Default recommendation is to select the vendor at V1-9 kickoff so the choice is made once, alongside Stripe integration.
- **Consequences of each option:**
  - *Fix vendor now (governor call):* V1-9 planning uses a specific SDK; earlier tickets stay unaffected because delivery is out of scope until V1-9.
  - *Defer to V1-9:* No impact on V1-1 through V1-8; V1-9 implementer chooses.
- **Ticket that should resolve it:** V1-9.
- **Governor decision required?** Optional — recommended before V1-9 kickoff so it does not stall the ticket.

### P2-2 — Delivery vendor: Telegram

- **Documents involved:** Ticket-0 prompt §G; Complete spec §5.5, §17.3 (do not require Telegram).
- **Exact conflict:** The prompt inventories Telegram integration; no V1 authority requires it as a V1 deliverable. Introducing it would extend scope beyond the complete spec.
- **Recommended ruling:** Not a V1 deliverable. If Telegram is desired, it must arrive via a spec amendment (Complete-spec §21.3, §21.8). Otherwise, the V1 build ships without Telegram.
- **Consequences:**
  - *Ship without:* no impact on V1.
  - *Add via amendment:* requires product-spec change and re-authorization.
- **Ticket that should resolve it:** governor decision *before* the amendment or explicit "no" is recorded. No implementation ticket touches Telegram until then.
- **Governor decision required?** Only if Telegram must be added. Otherwise "not in V1" is the default.

### P2-3 — Supabase as the "database" implied by the Ticket-0 prompt

- **Documents involved:** Ticket-0 prompt §Scope ("Supabase mutation" as a forbidden mutation type; §D "writes to Supabase" as an inventory question); Complete spec (does not designate Supabase).
- **Exact conflict:** The prompt language assumes Supabase is the database. The complete spec authority does not pick a database vendor; §11 defines entities and §20 requires server-side authoritative persistence and secret handling, without naming a vendor.
- **Recommended ruling:** Treat as a governor default rather than a spec conflict. If Supabase is the intended platform, that decision should be recorded (in an amendment note or an explicitly locked repo authority) before V1-1 migrations begin, so migration tooling, RLS design, and connection layering are consistent from V1-1 onward. If the platform is undecided, V1-1 needs to record the choice as a prerequisite.
- **Consequences:**
  - *Pick Supabase now:* V1-1 uses Supabase migrations; RLS design decisions land at V1-1 and V1-9; secrets configuration recorded early.
  - *Pick a different Postgres platform:* V1-1 uses a different migration tool; must revisit RLS strategy for entitlement enforcement.
- **Ticket that should resolve it:** V1-1 must operate under a fixed platform decision. Governor should record the choice before V1-1 begins.
- **Governor decision required?** Yes, recommended before V1-1 begins (not blocking this audit).

### P2-4 — Free preview-row count (Board)

- **Documents involved:** Complete spec §16.3, §16.5, §16.6; UX §15.6; ticket queue §1.5.
- **Exact conflict:** Exact preview-row count is finalized as V1-9 configuration; earlier tickets use "clearly labeled provisional fixture values" (per ticket queue §1.5 and complete-spec execution-consistency patch).
- **Recommended ruling:** Follow the queue. V1-6 uses a provisional fixture value labeled as such (e.g., "PROVISIONAL_PREVIEW_ROWS"), and V1-9 wires the real configuration.
- **Consequences:**
  - *Follow queue:* honest, matches the two-stage enforcement design.
  - *Guess earlier:* violates ticket queue §1.5 and creates a client-only paywall risk.
- **Ticket that should resolve it:** V1-9.
- **Governor decision required?** No — the queue already sets the default.

### P2-5 — Free Compare Your Line usage limit

- **Documents involved:** Complete spec §16.3, §17.1 execution-consistency patch; ticket queue §1.5.
- **Exact conflict:** Exact limit is V1-9 configuration; earlier tickets use provisional fixture values.
- **Recommended ruling:** V1-8 uses a provisional labeled fixture; V1-9 finalizes.
- **Ticket that should resolve it:** V1-9.
- **Governor decision required?** No.

### P2-6 — Anonymous vs free-registered Compare-limit relationship

- **Documents involved:** Complete spec §17.1 execution-consistency patch; UX §15.4; ticket queue §1.5.
- **Exact conflict:** Whether a free-registered account receives an identical or a modestly higher Compare limit than anonymous is an open commercial decision explicitly deferred to V1-9. The spec forbids an implementing agent from silently choosing it.
- **Recommended ruling:** Defer. V1-8 fixtures should honor a single provisional value; V1-9 finalizes both anonymous and free-registered as separate configuration entries.
- **Ticket that should resolve it:** V1-9.
- **Governor decision required?** Yes — but only before V1-9 begins.

### P2-7 — Marketing / landing page (`/`)

- **Documents involved:** UX §2.2 (routes list does not include `/`); Complete spec §5 (V1 surfaces are app surfaces, not marketing pages).
- **Exact conflict:** The four V1 surfaces plus `/methodology` and `/pricing` are the only routes the authorities call out. A public landing page is not enumerated as a V1 deliverable.
- **Recommended ruling:** Ship V1 without a bespoke landing page. `/methodology` and `/pricing` are the two public surfaces; the app itself is the primary product surface. If a landing page is desired, treat as post-V1 or as a scoped addition alongside V1-9 pricing surface.
- **Ticket that should resolve it:** V1-9 (if desired at all) or post-V1.
- **Governor decision required?** Optional.

### P2-8 — Git initialization and initial commit

- **Documents involved:** Ticket queue §1.4 (commit rules assume a git repo); complete spec §20.2 (traceability implies version control).
- **Exact conflict:** The repository is not currently under version control. Ticket queue §1.4 rules ("stage only named files," "do not push," "halt for review after the report") assume a live git repo. V1-1 cannot follow those rules until git is initialized.
- **Recommended ruling:** Initialize git and record an initial commit that captures the authority package plus this V1-0 audit's six artifacts, **before** V1-1 begins. That initialization is itself a governor decision (author, email, remote, initial branch name); Ticket 0 does not initialize git per its own scope restrictions.
- **Consequences:**
  - *Init before V1-1:* V1-1 operates under normal commit rules from the start.
  - *Skip init:* V1-1 has no revision history and no ability to enforce ticket-queue §1.4 rules.
- **Ticket that should resolve it:** Pre-V1-1 governance step (Ticket 0 is audit-only).
- **Governor decision required?** Yes — the setup call belongs to the governor, not to an implementation agent.

---

## P3 conflicts (housekeeping)

### P3-1 — `.DS_Store` present at repo root

- **Documents involved:** none.
- **Exact conflict:** A macOS metadata file exists at the repo root. It is not application state and is not authoritative. Once git is initialized, `.gitignore` should ignore it.
- **Recommended ruling:** Add `.DS_Store` to `.gitignore` during git initialization; do not remove it here since removing files is outside Ticket 0 scope.
- **Ticket that should resolve it:** Pre-V1-1 governance step or V1-1.

### P3-2 — Non-authoritative DOCX exports live next to authoritative Markdown

- **Documents involved:** `SlipLabz_Application_V1_Complete_Spec_v1_3.docx`, `SlipLabz_V1_UX_UI_Subspec_v1_3.docx`; repo-spec README §"Document formats."
- **Exact conflict:** DOCX exports are non-authoritative but live in the same directory as the authoritative Markdown, which can invite accidental citation.
- **Recommended ruling:** Retain but document status clearly (already done — see `V1_AUTHORITY_MAP.md` §2.3). No move or deletion is authorized by Ticket 0's scope.
- **Ticket that should resolve it:** Later documentation ticket if desired; not required.

---

## Cross-authority consistency check

Complete spec §2, ticket queue §1.1, and Ticket 0 prompt all state the same authority order. The repo spec README and full package manifest both attribute governance to Markdown and treat DOCX as informational only. No cross-authority conflicts were detected within rev 1.3 itself.

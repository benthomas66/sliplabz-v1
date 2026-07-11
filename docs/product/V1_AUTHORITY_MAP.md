# V1 Authority Map

**Ticket:** V1-0 — Authority and Repo Readback
**Prepared:** 2026-07-10
**Package revision under audit:** SlipLabz V1 Repo Spec Package rev 1.3
**Repository state at audit:** Greenfield. The working directory contains no application code, no schema, no migrations, no tests, no CI. Only the V1 authority-document package and a macOS `.DS_Store` file exist. Not a git repository.

---

## 1. Authority-hierarchy applied

The following order is used when documents disagree. It is copied verbatim from the complete spec §2, the ticket queue §1.1, and the Ticket 0 prompt:

1. `SLIPLABZ_APPLICATION_V1_COMPLETE_SPEC_v1_3.md` (Complete V1 specification)
2. `SLIPLABZ_V1_UX_UI_SUBSPEC_v1_3.md` (UX/UI sub-spec — interface, interaction, responsive, accessibility, UX copy)
3. Audited provider sub-specs (BALLDONTLIE 0.9, Odds API 0.10)
4. Existing **explicitly locked** repository authorities (see §2.2 below — none exist)
5. Approved individual ticket
6. Current implementation (see §2.3 below — none exists)
7. Agent assumptions

An authority counts as "explicitly locked" only when the document itself carries an authoritative status or version declaration. A filename alone does not establish locked status.

---

## 2. Primary V1 authorities present in the repository

All four binding V1 authorities are already present in the repository under the package directory. **No copy or move is required**; the prompt clause "If the four primary V1 authorities are not already in the repository, copy them" is not triggered.

### 2.1 Binding V1 authorities

| # | Authority | Path | Declared status | Declared revision | Governed scope | Conflicts with rev 1.3? | Long-term disposition |
|---|---|---|---|---|---|---|---|
| 1 | Complete V1 specification | `docs/SlipLabz_V1_Final_Pre_Agent_Package_v1_3_patched2/SLIPLABZ_APPLICATION_V1_COMPLETE_SPEC_v1_3.md` | "Integration-ready product authority" | 1.3 | Product positioning, WNBA-only scope, launch markets, analytics-vs-picks framing, Daily Brief, methodology, providers, storage model, computation ownership, movement, historical calculations, freshness, free vs paid, entitlement, delivery, security, release gates, ticket sequence | No | **Remain authoritative** |
| 2 | UX/UI sub-spec | `docs/SlipLabz_V1_Final_Pre_Agent_Package_v1_3_patched2/SLIPLABZ_V1_UX_UI_SUBSPEC_v1_3.md` | "Integration-ready UX authority" | 1.3 | Interface, IA, visual direction, board/research/compare/player/brief surfaces, responsive behavior, accessibility, empty & error states, pricing UX, copy tone | No | **Remain authoritative** |
| 3 | BALLDONTLIE data sub-spec | `docs/SlipLabz_V1_Final_Pre_Agent_Package_v1_3_patched2/SLIPLABZ_BALLDONTLIE_V1_DATA_SUBSPEC_AUDITED.md` | "Integration-ready technical authority with explicit validation and legal gates" | 0.9 | BALLDONTLIE endpoints, pagination, identity, minutes normalization, stat eligibility, teams/players/games/availability contract, error handling, cadence, storage contract, cross-provider handoff | No | **Remain authoritative** |
| 4 | Odds API data sub-spec | `docs/SlipLabz_V1_Final_Pre_Agent_Package_v1_3_patched2/SLIPLABZ_ODDS_API_V1_DATA_SUBSPEC_AUDITED.md` | "Implementation-ready technical authority with explicit validation and legal gates" | 0.10 | Odds API endpoints, event lifecycle, four-market slate, PrizePicks/Underdog treatment, quota, storage contract, current & historical snapshot separation, consensus, freshness, historical seed policy, integration handoff | No | **Remain authoritative** |

### 2.2 Governance and audit documents

| # | Document | Path | Declared status | Revision | Governed scope | Conflicts? | Long-term disposition |
|---|---|---|---|---|---|---|---|
| 5 | Ticket queue | `docs/SlipLabz_V1_Final_Pre_Agent_Package_v1_3_patched2/SLIPLABZ_V1_AGENT_TICKET_QUEUE_v1_3.md` | "Execution authority derived from complete spec" | 1.3 | V1-0 through V1-10 mission, dependencies, scope, tests, acceptance, halt behavior | No | **Remain authoritative** for ticket execution |
| 6 | Repo spec README | `docs/SlipLabz_V1_Final_Pre_Agent_Package_v1_3_patched2/SLIPLABZ_V1_REPO_SPEC_README_v1_3.md` | Package README, revision 1.3 | 1.3 | Package inventory, consistency-patch and execution-consistency-patch notes, active build policy | No | Remain authoritative (package index) |
| 7 | Final pre-agent audit | `docs/SlipLabz_V1_Final_Pre_Agent_Package_v1_3_patched2/SLIPLABZ_V1_FINAL_PRE_AGENT_AUDIT_v1_3.md` | "Passed after corrections" | 1.3 | Records P0/P1 rulings that shaped rev 1.3 (historical/current isolation, closing-point method, historical rights not blocking core, event-ID discovery, 10x quota, close-capture age, no-resurrection, V1-4b in queue, provenance fields) | No | Retain as **audit record** — subordinate to complete spec |
| 8 | Data-ingestion integration audit | `docs/SlipLabz_V1_Final_Pre_Agent_Package_v1_3_patched2/SLIPLABZ_DATA_INGESTION_INTEGRATION_AUDIT.md` | Cross-document audit; conclusions unaffected by later rev bumps | (reviewed against BALLDONTLIE 0.8 / Odds 0.7; conclusions apply to shipped 0.9 / 0.10) | Cross-document consistency, blocking defects that were corrected before shipping | No | Retain as **audit record** — subordinate to sub-specs |
| 9 | Ticket 0 prompt | `docs/SlipLabz_V1_Final_Pre_Agent_Package_v1_3_patched2/SLIPLABZ_V1_TICKET_0_AUTHORITY_REPO_READBACK_PROMPT_v1_3.md` | Prompt for this ticket | 1.3 | Instructions to this agent | N/A | Retain — prompt archive |
| 10 | Full package manifest | `docs/SlipLabz_V1_Final_Pre_Agent_Package_v1_3_patched2/SLIPLABZ_V1_FULL_PACKAGE_MANIFEST.txt` | Manifest, revision 1.3 | 1.3 | Package contents, patch notes, supersession | No | Retain — index |

### 2.3 Non-authoritative exports present

| Document | Path | Status | Disposition |
|---|---|---|---|
| Complete spec DOCX export | `docs/SlipLabz_V1_Final_Pre_Agent_Package_v1_3_patched2/SlipLabz_Application_V1_Complete_Spec_v1_3.docx` | Non-authoritative export; the README §"Document formats" states Markdown governs on any disagreement | Retain but treat as informational; do not cite as authority |
| UX/UI DOCX export | `docs/SlipLabz_V1_Final_Pre_Agent_Package_v1_3_patched2/SlipLabz_V1_UX_UI_Subspec_v1_3.docx` | Non-authoritative export | Retain but do not cite as authority |

### 2.4 Explicitly locked repository authorities

**None.** The prompt and complete spec §2 both define an "explicitly locked" repo authority as one that carries its own authoritative status or version declaration. The current repository has no additional authoritative documents beyond the V1 package itself. The complete spec §2 hierarchy line 4 ("Existing explicitly locked repository authorities") therefore currently contributes no additional binding sources.

### 2.5 Current-implementation authorities

**None.** No application code, database schema, migration history, environment configuration, tests, or fixtures exist in the repository. Complete-spec §2 hierarchy line 6 ("Current implementation") currently contributes no binding source.

---

## 3. Prior-revision authorities (rev 1.1 / 1.2)

**None present.** The repo spec README §"Primary authorities" states: *"Prior revision 1.1 and 1.2 product, UX, and ticket authorities should not remain active in the repository."*

No files matching prior revisions were located. This condition is therefore already satisfied.

---

## 4. Authority coverage by required scope

The prompt §A enumerates topics that must be covered by authority. Coverage is mapped below to the complete spec unless a more detailed authority owns the topic.

| Required scope | Governing authority | Section(s) |
|---|---|---|
| Product positioning | Complete spec | §0, §1, §5 |
| SlipLabz naming | Complete spec | Front matter, §0 |
| WNBA-only scope | Complete spec | §0, §1.2, §25 |
| Supported launch markets | Complete spec | §6.1 |
| Analytics-versus-picks positioning | Complete spec | §0, §1.4, §3.3, §18.1 |
| Prohibited predictive/recommendation language | Complete spec §18, UX/UI §21.3 | Spec §18.1; UX §21.3 |
| Daily Brief | Complete spec | §1.2, §5.5, §17.3; UX §10 |
| Methodology | Complete spec | §7, §12, §14, §18.4 |
| Data providers | Complete spec §8-10 | Detail: BALLDONTLIE sub-spec, Odds API sub-spec |
| Interface / visual hierarchy | UX/UI sub-spec | §1, §3, §4 |
| Interaction behavior | UX/UI sub-spec | §5-9, §11-13 |
| Responsive layout | UX/UI sub-spec | §6, §7.10, §18 |
| Accessibility | UX/UI sub-spec | §19 |
| UX copy | UX/UI sub-spec §20-21; Complete spec §18 | (both) |
| Database schema | Complete spec | §11 |
| Ingestion | Complete spec §9-10; Sub-specs | BDL §19, Odds §15 |
| Current lines | Complete spec | §7.9, §13; Odds §16 |
| Historical lines | Complete spec | §7.10, §7.11, §14; Odds §14.11 |
| Closing observations | Complete spec §7.10.1, §7.10.2 | Odds §18.4, §14.11.1 |
| Account & authentication | Complete spec | §17.1 |
| Payment | Complete spec | §16.1, §17.2 |
| Fixed $7.99/month | Complete spec §16.1; UX §15.1, §15.8 | (both) |
| Useful free tier behavior | Complete spec §16.3; UX §15.4 | (both) |
| Entitlement | Complete spec §16.5–16.7; UX §15.9 | (both) |
| Delivery (email / Telegram) | Complete spec | §5.5, §17.3 (Brief delivery); *note: Telegram is not called out by the complete spec — see conflict register* |
| Deployment | Complete spec | §2.3 (environment definitions), §22 (phases), §24.1 |
| Testing | Complete spec §22 acceptance blocks; Ticket queue tests per ticket | (both) |
| Security | Complete spec | §20 |
| Release / provider-rights gates | Complete spec | §2.3, §3.6, §24, §26 |

---

## 5. Disposition of the package directory

The authorities are currently housed at `docs/SlipLabz_V1_Final_Pre_Agent_Package_v1_3_patched2/`. This location is preserved unchanged (the prompt forbids deleting, moving, or rewriting authorities). The audit artifacts produced by this ticket are written to `docs/product/`, `docs/architecture/`, and `docs/product/reports/` per the Ticket 0 allowed-paths rule.

---

## 6. Summary

- All four primary V1 authorities are present and unmodified.
- No prior-revision authorities remain to archive.
- No repository document outside the package carries an explicit authoritative status declaration.
- The complete spec §2 authority hierarchy is applied as-is; hierarchy levels 4 and 6 contribute nothing at this time.
- The Markdown authorities govern; the two DOCX exports are informational only.

# SlipLabz V1 Governance Decisions

Status: Explicitly locked repository authority (complete spec §2, hierarchy level 4)
Version: 1.0 — 2026-07-10
Issued by: Implementation governor, following approved V1-0

These rulings bind all V1 tickets. They may be changed only by a governor decision recorded as a new version of this file.

1. GD-1 (resolves conflict P2-3): The database platform is Supabase-hosted PostgreSQL. Versioned SQL migrations must be Supabase-CLI compatible. This decision does not itself authorize Supabase Auth, direct client database access, generated client types, RLS policies, or entitlement architecture; those remain governed by their owning tickets.
2. GD-2 (resolves P2-8): Git baseline established by the Repository Bootstrap task; one approved ticket per commit thereafter, per ticket queue §1.4.
3. GD-3 (resolves P2-2): Telegram delivery is not a V1 deliverable. It may enter only via a spec amendment under complete spec §21.
4. GD-4 (resolves P2-7): No bespoke marketing landing page is in the V1 path. /methodology and /pricing are the public surfaces.
5. GD-5 (resolves P2-1): The transactional email vendor is selected at V1-9 kickoff, not before.
6. GD-6 (confirms P2-4/P2-5/P2-6): Free preview-row counts, Compare limits, and the anonymous-versus-free-registered relationship are V1-9 configuration. Earlier tickets use clearly labeled provisional fixture values per ticket queue §1.5.
7. GD-7 (V1-0 context): The greenfield repository state is intentional and confirmed by the product owner. No prior SlipLabz codebase is in scope. The earlier modeling work’s historical odds data is not locally present; if recovered externally it becomes a V1-4b input only.

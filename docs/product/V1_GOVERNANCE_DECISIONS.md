# SlipLabz V1 Governance Decisions

**Status:** Explicitly locked repository authority (complete spec Section 2, hierarchy level 4)
**Version:** 2.0 - 2026-07-10
**Issued by:** Implementation governor

These rulings bind all V1 tickets. They may be changed only by a governor decision recorded as a new version of this file.

1. GD-1 (resolves conflict P2-3): The database platform is Supabase-hosted PostgreSQL. Versioned SQL migrations must be Supabase-CLI compatible. This decision does not itself authorize Supabase Auth, direct client database access, generated client types, RLS policies, or entitlement architecture; those remain governed by their owning tickets.
2. GD-2 (resolves P2-8): Git baseline established by the Repository Bootstrap task; one approved ticket per commit thereafter, per ticket queue Section 1.4.
3. GD-3 (resolves P2-2): Telegram delivery is not a V1 deliverable. It may enter only via a spec amendment under complete spec Section 21.
4. GD-4 (resolves P2-7): Superseded in part by GD-13. No bespoke marketing landing page is in the V1 path; /methodology and /pricing remain the public surfaces. The default app landing surface is now governed by GD-13.
5. GD-5 (resolves P2-1): The transactional email vendor is selected at V1-9 kickoff, not before.
6. GD-6 (confirms P2-4/P2-5/P2-6): Free preview-row counts, Compare limits, and the anonymous-versus-free-registered relationship are V1-9 configuration. Earlier tickets use clearly labeled provisional fixture values per ticket queue Section 1.5.
7. GD-7 (V1-0 context): The greenfield repository state is intentional and confirmed by the product owner. No prior SlipLabz codebase is in scope. The earlier modeling work's historical odds data is not locally present; if recovered externally it becomes a V1-4b input only.
8. GD-8 through GD-13 (amendment V1-A1 adoption): Product amendment V1-A1 is adopted as an authoritative product-spec amendment. The operative hierarchy-level-1 authority is the Complete Spec v1.3 as amended by V1-A1, located at docs/product/amendments/SLIPLABZ_V1_AMENDMENT_A1_INTEGRATED.md. The full text of rulings GD-8 (precedence and narrowed recommendation restrictions), GD-9 (four-market and provider scope locked), GD-10 (proactive alerts deferred), GD-11 (persistent Research List requires registration), GD-12 (merged implementation sequence), and GD-13 (Discover is the default app landing surface) is incorporated in Section 34 of that amendment, which controls their detail. The amendment's Markdown file is canonical; its DOCX is a non-authoritative export. Ticket queue Section 1.3 prohibitions on picks, recommendation language, and predictive projections are narrowed per GD-8: amendment-authorized deterministic evidence interpretation and discovery are permitted; fabricated probabilities, expected value, guarantees, and projections remain forbidden.

Version history: 1.0 was committed at baseline 3d53450 with transmission corruption; a correction commit 1268a58 remained labeled 1.0 and introduced new typos; commit ac5688b repaired the wording (operative content identified by SHA-256 bc275622072ea1351d5fe033e3b3119507998be9e089870457d0f62717383a01). Version 2.0 supersedes all 1.x content, restores canonical formatting, and adds the V1-A1 adoption ruling. Rulings GD-1 through GD-7 are unchanged in substance except the noted partial supersession of GD-4.

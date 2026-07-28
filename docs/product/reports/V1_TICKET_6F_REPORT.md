# V1-6f — Board Design Variants on the Preview Route — Report

**Date:** 2026-07-27
**Status:** COMPLETE — nothing committed. Exact taxonomy throughout. `/board` byte-identical.

Two Board row-presentation variants built INSIDE the governed loop, where the
authority file, the real fixture matrix, and the copy-safety sweep make an
exact-taxonomy violation impossible rather than reviewable. Built under the
governor AMENDMENT (which withdrew the ticket's incorrect "Over-leaning is
invented" premise after the STEP 0 gate caught it).

Starting state (verified): HEAD `b6a6d9de20739d527de02489fe873ceadc252186`,
tracked files clean. **Worktree note:** two untracked founder-supplied files
under `docs/research/` (belong to V1-GOV-2) were left entirely untouched — not
staged, moved, deleted, or renamed.

---

## STEP 0 — verbatim authority quotes (`EVIDENCE_PROFILE_METHOD_V1.md`)

**§D.2 mapping table** (lines 437–445) — seven classifications, their compact
form (the ONLY permitted pill strings), and their full form:

| A1 §10 classification | Compact variant (dense Board only) | Discover card / Research View — MUST show |
|---|---|---|
| Strong Over Evidence | **Over-leaning** | "Strong Over Evidence" verbatim |
| Moderate Over Evidence | **Over-leaning** | "Moderate Over Evidence" verbatim |
| Mixed Evidence | **Mixed** | "Mixed Evidence" verbatim |
| Moderate Under Evidence | **Under-leaning** | "Moderate Under Evidence" verbatim |
| Strong Under Evidence | **Under-leaning** | "Strong Under Evidence" verbatim |
| Insufficient Evidence | **Insufficient Evidence** | "Insufficient Evidence" verbatim |
| Unavailable | **Unavailable** | "Unavailable" verbatim; NEVER "Insufficient Evidence" |

Rule 3: *"Unavailable is NEVER collapsed into Insufficient Evidence. Distinct labels, distinct visual treatment."*
Rule 4: *"Strength grading (Strong vs Moderate) is NEVER discarded on Discover cards or in the Research View (GD-15 d)."*

**§D.4 rule 2 (verbatim, line 458)** — quoted before building per the amendment:
> "Where a dense row uses a compact label (Over-leaning / Under-leaning / Mixed / Insufficient Evidence / Unavailable), the full classification MUST be reachable by expansion or navigation, never hover-only. Strong vs Moderate remains visible on Discover cards and in Research View. A dense row MAY carry a deterministic strength treatment (e.g. a small filled/outlined chip) that maps explicitly to Strong vs Moderate, but it MUST NOT resemble a probability meter."

**Analysis:** the sanctioned strength treatment must "map explicitly to Strong vs Moderate," which **requires knowing** Strong vs Moderate. The frozen `BoardProjection` carries only the merged compact label and no strength signal, so this treatment **requires data the projection lacks**. Per the amendment I proceeded **without** any Strong/Moderate differentiation and recorded it as an open founder question (below).

**§D.4 five ratified cap tags** (lines 466–472, verbatim): `stale_current_market` → "stale market"; `insufficient_book_coverage` → "limited book coverage"; `push_heavy_sample` → "push-heavy recent sample"; `market_disagrees_with_history` → "market disagrees with history"; `one_sided_offering` → "one-sided offering".
Rule 6 (line 462): *"When a profile is capped, compact surfaces SHOULD communicate the binding cap prominently … A user MUST NOT have to open a methodology panel to learn why a Strong-looking profile was capped."*
Rule 7 (line 475): *"Where `includes_backfilled_historical` is true, use concise surface copy such as 'Includes seeded historical closing lines'; the marker MUST NOT be hover-only … Copy MUST NEVER describe such a profile as 'observed since launch'."*

**§G.1 disclosure** (lines 758–760, verbatim):
> "Evidence profiles summarize historical results and current market information. They are research tools, not guarantees or predicted probabilities."

Placement: *"adjacent to the classification label OR in a persistent methodology-link position … May not be hidden behind hover-only or click-only affordances."*

**Short count form:** the authority sanctions **no** short "N/M" form; counts appear only as the long form (§F: "over 8 / under 2 / push 0") and only for Research View (§D.4 rule 3). Recorded for the design review.

---

## Amended-requirement compliance

1. **Labels.** Pills render `projection.classification_label` VERBATIM — never re-derived, re-mapped, paraphrased, or abbreviated. The style bucket (`pillKindForLabel`) is keyed on the exact projected string and throws on anything outside the five §D.2 compact forms. Assertion added: every pill string ∈ the five-string set; no full form or paraphrase appears (fast test + audit).
2. **Strong vs Moderate — NOT attempted.** No strength differentiation; Strong-over and Moderate-over render the identical "Over-leaning" pill. Open founder question recorded (below). §D.4 rule 2 quoted and analyzed above.
3. **Variant B counts removed.** Line 2 uses only projected fields: `market` + `evaluated_line` (+ provenance where present). Recorded: no count form is currently projectable; adding one is a separate data-plumbing ticket.
4. Everything else held: mobile-first 390px, dark only, valence-neutral hue pair (documented in code), cap chip riding the pill (persistent), provenance persistent text, §G.1 page-level, chevrons, one faked-hover row per variant, ≥6-row density in A, variants under `/design-preview` only, `/board` untouched, projection type unchanged, audit extended, preview deploy (no `--prod`), no commit.

---

## The valence-neutral hue pair (`src/lib/previewVariantStyle.ts`)

```
OVER  (Over-leaning)  = #57A6D9  (azure)
UNDER (Under-leaning) = #B58AD6  (violet)
NEUTRAL (Mixed / Insufficient / Unavailable) = #8B929B (slate)
```
Two cool, equal-weight hues — NOT green/red; neither reads as "good"/"bad". Non-directional classifications use slate so no direction is implied. Pills are never probability meters.

---

## Representative row markup (rendered fields are projection-only)

**Strong-capped** (fixture 10: strong_over + `push_heavy_sample`) → compact label "Over-leaning" (§D.2 merges Strong/Moderate), cap chip "push-heavy recent sample":

- *Variant A (single line):* `[ Fixture Guard J · Sample Falls  player_threes 3.5 ]` … right-anchored `«Over-leaning»`(azure filled pill) `‹push-heavy recent sample›`(chip riding it) `›`(chevron).
- *Variant B (two line):* L1 `Fixture Guard J · Sample Falls` … `«Over-leaning»‹push-heavy recent sample›` `›`. L2 (quiet) `player_threes 3.5`.

**Moderate-provenance** (fixture 14: moderate_under + backfilled, no cap) → "Under-leaning", provenance persistent:

- *Variant A:* `[ Fixture Center N · Mock Bay  player_assists 4.5 ]` … `«Under-leaning»`(violet pill) `›`; sub-line `Includes seeded historical closing lines`.
- *Variant B:* L1 `Fixture Center N · Mock Bay` … `«Under-leaning»` `›`. L2 `player_assists 4.5 · Includes seeded historical closing lines`.

**Insufficient** (fixture 6) → "Insufficient Evidence" pill, DASHED outline (GD-15):

- *Variant A/B:* pill `«Insufficient Evidence»` rendered `data-testid="pill-insufficient"`, dashed neutral border, transparent fill; line shows `player_rebounds 7.5`.

**Unavailable** (fixture 7) → "Unavailable" pill, SOLID low-opacity outline (GD-15, distinct from Insufficient); null line renders as "—":

- *Variant A/B:* pill `«Unavailable»` rendered `data-testid="pill-unavailable"`, solid border, opacity 0.72; line shows `player_assists —`.

---

## Tests

**Fast (`apps/web/test/designVariants.test.ts`) — 7/7:**
- every pill string ∈ the five §D.2 compact labels; all five appear; full forms never used as pills; `pillKindForLabel` ACCEPTS "Over-leaning"/"Under-leaning" (they are §D.2 labels, not invented) and REJECTS a full form / paraphrase.
- Strong and Moderate collapse to one pill treatment (no strength differentiation).
- GD-15: Insufficient (dashed) and Unavailable (solid, 0.72 opacity) are distinct; neither uses a directional hue.
- valence-neutral hue pair asserted (#57A6D9 / #B58AD6).
- capped fixtures carry each of the five cap tags; ≥2 rows carry the verbatim provenance marker.
- route isolation: `/board` files reference none of `designFixtures` / `design-preview` / `previewVariant`; both variant pages select source by route with no `searchParams`/`cookies`/`headers`/`process.env`; baseline links to both variants.

**Serialization audit (`npm run audit`) — 11/11** (7 prior + 2 V1-6e + 2 new V1-6f): `/design-preview/a` and `/b` each — banner present, populated (positive controls "stale market" + "Includes seeded historical closing lines"), all five §D.2 compact labels present, the five full forms ABSENT, GD-15 `pill-insufficient`/`pill-unavailable` treatments rendered, distinctive canaries absent.

**Full battery:** app fast **37/37** (30 prior + 7 new), app typecheck 0, root typecheck 0, root unit **573/573**, full serial integration **130/130**. `/board` production diff **EMPTY** (byte-identical).

**Invented-label negative assertion (amended):** the withdrawn "Over-leaning appears nowhere" assertion is NOT present. In its place: pills are asserted to be members of the five §D.2 compact strings, and the full Discover/Research-View forms are asserted ABSENT from the dense Board — the exact-taxonomy guarantee, authority-correct.

---

## Deployed (PREVIEW only, no `--prod`)

Topology per V1-6c: transient root link to the same project `prj_nY1Pyzci1CroQS6DsrgHe8MpGOR6`, `vercel deploy` from repo root, link removed after. No secret set, no credit spent; `apps/web/.vercel` intact.

**Preview URL (founder taps these):** `https://web-kn035s8du-bens-projects-593972b9.vercel.app`
- Variant A: `.../design-preview/a`
- Variant B: `.../design-preview/b`
- Baseline: `.../design-preview` (now links to both)

**Deployed-response audit — 6/6 pass:** `/board` unchanged (approved empty state, no banner, canaries + secrets absent); `/design-preview` populated; `/design-preview/a` and `/b` each — banner, populated, all five §D.2 compact labels, full forms absent, canaries + secrets absent; client bundles clean.

---

## OPEN FOUNDER QUESTIONS for the design review (not gaps)

1. **Should the Board surface Strong vs Moderate at all?** Today it does not — the projection carries no strength signal, and §D.2 rule 4 protects that distinction on Discover cards / Research View, not the Board; strength reaches the Board only implicitly via DR-20 ranking (higher |score| sorts first). Surfacing it would require **a new projection field plus its own governor-authorized ticket**, with the serialization audit and the projection key-set assertion extended accordingly.
2. **§D.2 rule 2 full-classification reachability.** The rule requires the full classification be reachable by expansion or navigation (never hover-only). The preview is a standalone dense surface with no Research View / row expansion yet; the affordance (expand, or link to Research View) is a design-review decision.
3. **No count form is currently projectable to the Board**, and §D.2 sanctions no short "N/M" form. Adding above/below/push counts + `eligible_n` is a separate data-plumbing ticket (the board projection deliberately carries none today).

---

## Files (nothing committed)

New:
- `apps/web/src/lib/previewVariantStyle.ts` — pure style helpers + valence-neutral hue pair
- `apps/web/components/preview/PreviewPill.tsx` — §D.2 pill + riding cap chip
- `apps/web/components/preview/PreviewChrome.tsx` — banner + variant label + page-level §G.1 + nav
- `apps/web/components/preview/DesignVariantA.tsx` — single-line "compact exact"
- `apps/web/components/preview/DesignVariantB.tsx` — two-line "evidence"
- `apps/web/app/design-preview/a/page.tsx` — Variant A route
- `apps/web/app/design-preview/b/page.tsx` — Variant B route
- `apps/web/test/designVariants.test.ts` — fast tests
- `docs/product/reports/V1_TICKET_6F_REPORT.md` — this report

Modified (additive):
- `apps/web/app/design-preview/page.tsx` — two-link index only (existing baseline render untouched)
- `apps/web/test-audit/serialization.test.ts` — `/a` + `/b` coverage
- `apps/web/test-audit/deployedResponse.test.ts` — deployed `/a` + `/b` coverage

Untouched: the entire production `/board` route (byte-identical), the projection type, `src/evidence`, the authorities, thresholds, the gate, and the templates.

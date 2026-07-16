// V1-A1-4 explanation composer — behavior tests.
//
// Assertions map one-to-one to authority sections cited inline.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  renderCompactExplanation,
  renderFullExplanation,
} from '../../src/explanation/index.js';
import {
  FULL_CLASSIFICATION_LABELS,
  COMPACT_CLASSIFICATION_LABELS,
} from '../../src/explanation/labels.js';
import {
  DISCLOSURE_G1_TEXT,
  DISCLOSURE_G2_TEXT,
} from '../../src/explanation/disclosures.js';
import { REASON_TRANSLATIONS } from '../../src/explanation/vocabulary.js';
import type { EvidenceProfileOutput } from '../../src/evidence/types.js';
import type { EvidenceReasonCode } from '../../src/shared/enums.js';
import {
  ALL_FIXTURES,
  FIXTURE_BACKFILLED_PROVENANCE,
  FIXTURE_CAPPED_BOOK_COVERAGE,
  FIXTURE_CAPPED_STALE,
  FIXTURE_INSUFFICIENT,
  FIXTURE_MODERATE_OVER,
  FIXTURE_MODERATE_UNDER,
  FIXTURE_STRONG_OVER,
  FIXTURE_STRONG_UNDER,
  FIXTURE_TIED_CONSENSUS,
  FIXTURE_UNAVAILABLE_CANCELED,
  FIXTURE_UNAVAILABLE_NO_MARKET,
  FIXTURE_UNAVAILABLE_POSTPONED,
} from './fixtures.js';

describe('§D.1 taxonomy — full classification labels are verbatim', () => {
  it('every §D.1 label is the exact string the authority names', () => {
    assert.equal(FULL_CLASSIFICATION_LABELS.strong_over_evidence, 'Strong Over Evidence');
    assert.equal(FULL_CLASSIFICATION_LABELS.moderate_over_evidence, 'Moderate Over Evidence');
    assert.equal(FULL_CLASSIFICATION_LABELS.mixed_evidence, 'Mixed Evidence');
    assert.equal(FULL_CLASSIFICATION_LABELS.moderate_under_evidence, 'Moderate Under Evidence');
    assert.equal(FULL_CLASSIFICATION_LABELS.strong_under_evidence, 'Strong Under Evidence');
    assert.equal(FULL_CLASSIFICATION_LABELS.insufficient_evidence, 'Insufficient Evidence');
    assert.equal(FULL_CLASSIFICATION_LABELS.unavailable, 'Unavailable');
  });
});

describe('§D.2 compact-display mapping — compact labels are verbatim', () => {
  it('Strong and Moderate map many-to-one onto "Over-leaning" / "Under-leaning"', () => {
    assert.equal(COMPACT_CLASSIFICATION_LABELS.strong_over_evidence, 'Over-leaning');
    assert.equal(COMPACT_CLASSIFICATION_LABELS.moderate_over_evidence, 'Over-leaning');
    assert.equal(COMPACT_CLASSIFICATION_LABELS.strong_under_evidence, 'Under-leaning');
    assert.equal(COMPACT_CLASSIFICATION_LABELS.moderate_under_evidence, 'Under-leaning');
    assert.equal(COMPACT_CLASSIFICATION_LABELS.mixed_evidence, 'Mixed');
  });

  it('LOAD-BEARING (§D.2 rule 3): Unavailable NEVER collapses into Insufficient — distinct labels', () => {
    assert.equal(COMPACT_CLASSIFICATION_LABELS.unavailable, 'Unavailable');
    assert.equal(COMPACT_CLASSIFICATION_LABELS.insufficient_evidence, 'Insufficient Evidence');
    assert.notEqual(COMPACT_CLASSIFICATION_LABELS.unavailable, COMPACT_CLASSIFICATION_LABELS.insufficient_evidence);
  });
});

describe('§E reason vocabulary — every translation is the authority verbatim', () => {
  it('a spot-check of representative translations matches §E character-for-character', () => {
    assert.equal(REASON_TRANSLATIONS.window_agreement_support, 'Recent and longer-window results point in the same direction.');
    assert.equal(REASON_TRANSLATIONS.positive_margin_support, 'Recent average and/or median margin support this direction.');
    assert.equal(REASON_TRANSLATIONS.stale_current_market, 'The current market snapshot is stale. Line and price context may not reflect the current market.');
    assert.equal(REASON_TRANSLATIONS.insufficient_l10_sample, 'Fewer than 5 eligible recent games. Sample is too small to grade evidence.');
    assert.equal(REASON_TRANSLATIONS.no_unique_consensus_line, 'Eligible sportsbooks are evenly split on this line, so no single consensus line can be established.');
    assert.equal(REASON_TRANSLATIONS.canceled_game, 'Game canceled.');
    assert.equal(REASON_TRANSLATIONS.one_sided_offering, "Only one side is offered across eligible sportsbooks. Cross-side comparison isn't available.");
  });

  it('LOAD-BEARING: abnormal_dispersion has NO translation (empty), and rendering it throws', () => {
    assert.equal(REASON_TRANSLATIONS.abnormal_dispersion, '');
    // Construct a synthetic profile that carries the RESERVED code; the
    // composer must throw. (This is defense-in-depth — the engine
    // already guards this; we double-cover so a downstream regression
    // cannot silently render it.)
    const withReserved: EvidenceProfileOutput = {
      ...FIXTURE_MODERATE_OVER,
      reasons: Object.freeze([
        { reason_code: 'abnormal_dispersion' as EvidenceReasonCode, category: 'quality', intra_category_rank: 1, contribution_magnitude: null },
      ]),
    };
    assert.throws(() => renderFullExplanation(withReserved), /RESERVED reason "abnormal_dispersion"/);
    assert.throws(() => renderCompactExplanation(withReserved), /RESERVED reason "abnormal_dispersion"/);
  });
});

describe('renderFullExplanation — Research View composition', () => {
  it('classification label matches §D.1; prose uses §E translations verbatim in DR-26 category order', () => {
    const out = renderFullExplanation(FIXTURE_MODERATE_OVER);
    assert.equal(out.kind, 'full');
    assert.equal(out.classification_label, 'Moderate Over Evidence');
    assert.equal(out.direction, 'over');
    // Support paragraph should exist (three support reasons).
    assert.ok(out.prose_paragraphs.length >= 1);
    // First paragraph is support (DR-26 category order).
    const supportPara = out.prose_paragraphs[0]!;
    assert.ok(supportPara.includes(REASON_TRANSLATIONS.positive_margin_support));
    assert.ok(supportPara.includes(REASON_TRANSLATIONS.window_agreement_support));
    assert.ok(supportPara.includes(REASON_TRANSLATIONS.favorable_consensus_difference));
    // No prose ever contains the numeric composite score literal.
    for (const p of out.prose_paragraphs) {
      assert.ok(!p.includes('0.4997'), 'full explanation MUST NOT include the composite score value in prose');
    }
  });

  it('DR-26 category order preserved end-to-end: support → contradiction → quality', () => {
    const out = renderFullExplanation(FIXTURE_CAPPED_STALE);
    // Support first, then quality (no contradiction in this fixture).
    const categoriesEncountered = out.reasons.map((r) => r.category);
    const supportIdx = categoriesEncountered.indexOf('support');
    const qualityIdx = categoriesEncountered.indexOf('quality');
    assert.ok(supportIdx >= 0 && qualityIdx >= 0 && supportIdx < qualityIdx,
      `expected support before quality; got ${JSON.stringify(categoriesEncountered)}`);
  });

  it('§G.1 disclosure is attached; §G.2 disclosure is attached only when render_numeric_score=true', () => {
    const withoutScore = renderFullExplanation(FIXTURE_MODERATE_OVER);
    assert.equal(withoutScore.disclosure_g1.text, DISCLOSURE_G1_TEXT);
    assert.equal(withoutScore.disclosure_g2, null);
    const withScore = renderFullExplanation(FIXTURE_MODERATE_OVER, { render_numeric_score: true });
    assert.equal(withScore.disclosure_g2?.text, DISCLOSURE_G2_TEXT);
  });

  it('§G disclosure placement/affordance metadata is structured (not a comment) and forbids hover-only', () => {
    const out = renderFullExplanation(FIXTURE_MODERATE_OVER, { render_numeric_score: true });
    assert.ok(out.disclosure_g1.allowed_placements.length >= 1);
    assert.equal(out.disclosure_g1.affordance_rules.must_not_be_hover_only, true);
    assert.equal(out.disclosure_g1.affordance_rules.must_not_be_click_only, true);
    assert.equal(out.disclosure_g2!.allowed_placements[0], 'adjacent_to_numeric_score');
  });

  it('DR-23 provenance marker present when includes_backfilled_historical=true; NOT hover-only', () => {
    const withFlag = renderFullExplanation(FIXTURE_BACKFILLED_PROVENANCE);
    assert.equal(withFlag.provenance_marker?.text, 'Includes seeded historical closing lines');
    assert.equal(withFlag.provenance_marker?.must_not_be_hover_only, true);
    assert.equal(withFlag.provenance_marker?.must_never_describe_as_observed_since_launch, true);
    const withoutFlag = renderFullExplanation(FIXTURE_MODERATE_OVER);
    assert.equal(withoutFlag.provenance_marker, null);
  });

  it('§D.4 rule 6 binding cap emphasis fires when quality_capped=true; carries a short tag', () => {
    const capped = renderFullExplanation(FIXTURE_CAPPED_STALE);
    assert.equal(capped.binding_cap?.reason_code, 'stale_current_market');
    assert.equal(capped.binding_cap?.cap_summary_short, 'stale market');
    assert.equal(capped.binding_cap?.visual_reordering_permitted_by_DR26_compact_clause, true);
    const uncapped = renderFullExplanation(FIXTURE_MODERATE_OVER);
    assert.equal(uncapped.binding_cap, null);
  });
});

describe('renderCompactExplanation — Board / Discover dense row composition', () => {
  it('compact label is §D.2 exact; display line takes the §D.4 rule 6 shape when capped', () => {
    const cappedStale = renderCompactExplanation(FIXTURE_CAPPED_STALE);
    assert.equal(cappedStale.compact_label, 'Over-leaning');
    assert.equal(cappedStale.compact_display_line, 'Over-leaning — stale market');

    const cappedBooks = renderCompactExplanation(FIXTURE_CAPPED_BOOK_COVERAGE);
    assert.equal(cappedBooks.compact_display_line, 'Over-leaning — limited book coverage');

    const uncapped = renderCompactExplanation(FIXTURE_MODERATE_OVER);
    assert.equal(uncapped.compact_display_line, 'Over-leaning');
  });

  it('LOAD-BEARING (DR-19): CompactExplanation shape carries `must_never_expose_numeric_score: true`, and no numeric composite-score VALUE leaks in', () => {
    const c = renderCompactExplanation(FIXTURE_STRONG_OVER);
    assert.equal(c.must_never_expose_numeric_score, true);
    // The permanent boolean marker `must_never_expose_numeric_score` is
    // the enforcement itself; any OTHER key mentioning score or composite
    // would be leaking numeric data. The marker is exempted by name.
    const numericLeakKeys = Object.keys(c).filter((k) => k !== 'must_never_expose_numeric_score' && /score|composite/i.test(k));
    assert.deepEqual(numericLeakKeys, [], `compact shape leaks numeric key(s): ${JSON.stringify(numericLeakKeys)}`);
    // Also: no VALUE in the compact shape stringifies to a numeric-looking
    // score like "0.5699" or "-0.4121". (Bounded score band per §B.6 is
    // [-1, +1].)
    const serialized = JSON.stringify(c);
    assert.ok(!/-?0\.\d{2,}/.test(serialized), `compact shape contains a numeric score-like value: ${serialized}`);
  });

  it('LOAD-BEARING: compact binding-cap and provenance marker are top-level fields, NOT nested behind hover affordances', () => {
    const cappedBackfilled = renderCompactExplanation({
      ...FIXTURE_CAPPED_STALE,
      includes_backfilled_historical: true,
    });
    // Both fields are top-level and immediately readable by the surface.
    assert.ok(cappedBackfilled.binding_cap !== null);
    assert.ok(cappedBackfilled.provenance_marker !== null);
    assert.equal(cappedBackfilled.provenance_marker!.must_not_be_hover_only, true);
  });

  it('Unavailable and Insufficient use distinct compact labels (GD-15 rule)', () => {
    const unavailable = renderCompactExplanation(FIXTURE_UNAVAILABLE_NO_MARKET);
    const insufficient = renderCompactExplanation(FIXTURE_INSUFFICIENT);
    assert.equal(unavailable.compact_label, 'Unavailable');
    assert.equal(insufficient.compact_label, 'Insufficient Evidence');
    assert.notEqual(unavailable.compact_label, insufficient.compact_label);
  });

  it('tied-consensus Unavailable uses "Unavailable" label + no_unique_consensus_line reason', () => {
    const c = renderCompactExplanation(FIXTURE_TIED_CONSENSUS);
    assert.equal(c.compact_label, 'Unavailable');
    // Full renderer reasons list carries the tied-consensus translation.
    const full = renderFullExplanation(FIXTURE_TIED_CONSENSUS);
    assert.equal(full.reasons[0]!.reason_code, 'no_unique_consensus_line');
    assert.equal(full.reasons[0]!.text, REASON_TRANSLATIONS.no_unique_consensus_line);
  });

  it('postponed and canceled Unavailable variants render distinct short reasons', () => {
    const p = renderFullExplanation(FIXTURE_UNAVAILABLE_POSTPONED);
    const c = renderFullExplanation(FIXTURE_UNAVAILABLE_CANCELED);
    assert.equal(p.reasons[0]!.text, REASON_TRANSLATIONS.postponed_game);
    assert.equal(c.reasons[0]!.text, REASON_TRANSLATIONS.canceled_game);
  });
});

describe('determinism — identical profile always renders identically', () => {
  it('identical input → byte-identical output across two calls', () => {
    for (const p of ALL_FIXTURES) {
      const a = JSON.stringify(renderFullExplanation(p, { render_numeric_score: true }));
      const b = JSON.stringify(renderFullExplanation(p, { render_numeric_score: true }));
      assert.equal(a, b, `full renderer is non-deterministic for fixture "${p._fixture_name}"`);
      const c = JSON.stringify(renderCompactExplanation(p));
      const d = JSON.stringify(renderCompactExplanation(p));
      assert.equal(c, d, `compact renderer is non-deterministic for fixture "${p._fixture_name}"`);
    }
  });
});

describe('directional variants — Under mirrors Over shape without direction-specific language', () => {
  it('Strong Under and Moderate Under render with the §D.1 labels; no direction sneaks into translations', () => {
    const strongUnder = renderFullExplanation(FIXTURE_STRONG_UNDER);
    const moderateUnder = renderFullExplanation(FIXTURE_MODERATE_UNDER);
    assert.equal(strongUnder.classification_label, 'Strong Under Evidence');
    assert.equal(moderateUnder.classification_label, 'Moderate Under Evidence');
    // §E requires direction-neutral text (WINDOW_AGREEMENT_SUPPORT etc.);
    // sanity-check that the reason texts don't mention "Over" or "Under".
    for (const r of [...strongUnder.reasons, ...moderateUnder.reasons]) {
      assert.ok(!/\b(Over|Under)\b/.test(r.text),
        `reason text should be direction-neutral: "${r.text}"`);
    }
  });
});

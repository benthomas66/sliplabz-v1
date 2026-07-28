// V1-6f — design-preview variant PRESENTATION helpers (pure, testable).
//
// These map the projection's VERBATIM §D.2 compact label string to a style
// BUCKET. They NEVER re-derive, re-map, paraphrase, or abbreviate the label:
// the pill always renders `projection.classification_label` verbatim; only the
// COLOR/treatment is chosen from which of the five permitted strings it is.
//
// The five permitted compact strings are exactly §D.2's "Compact variant
// (dense Board only)" column. Strong Over / Moderate Over BOTH arrive as
// "Over-leaning" (the mapping merges them by design); this surface does NOT and
// CANNOT distinguish Strong vs Moderate — the projection carries no strength
// signal, and §D.2 rule 4 protects that distinction on Discover cards /
// Research View, not the Board. Strength reaches the Board only implicitly via
// DR-20 ranking (higher |score| sorts first).

/** §D.2 compact-variant column — the ONLY permitted pill strings. Verbatim. */
export const COMPACT_LABEL_SET = [
  'Over-leaning',
  'Under-leaning',
  'Mixed',
  'Insufficient Evidence',
  'Unavailable',
] as const;
export type CompactLabel = (typeof COMPACT_LABEL_SET)[number];

export type PillKind = 'over' | 'under' | 'mixed' | 'insufficient' | 'unavailable';

/**
 * VALENCE-NEUTRAL directional hue pair (dark theme). Deliberately NOT
 * green/red and neither hue reads as "good"/"bad" — over and under are two
 * cool, equal-weight hues:
 *   OVER  (Over-leaning)  = azure  #57A6D9
 *   UNDER (Under-leaning) = violet #B58AD6
 * Non-directional classifications use a neutral slate so no direction is implied:
 *   NEUTRAL (Mixed / Insufficient / Unavailable) = #8B929B
 * These are pill/treatment colors only; they never form a probability meter.
 */
export const PREVIEW_HUES = Object.freeze({
  over: '#57A6D9',
  under: '#B58AD6',
  neutral: '#8B929B',
  bg: '#0E1116',
  panel: '#171C22',
  panelHover: '#212934', // faked pressed/hover row background
  text: '#E6E9ED',
  quiet: '#99A1AC',
  border: '#2A313A',
});

/**
 * Style bucket for a pill, keyed on the VERBATIM projected label string. Throws
 * on anything outside the five §D.2 compact forms — so a full label ("Strong
 * Over Evidence"), a paraphrase, or an invented variant cannot be styled and
 * fails loud rather than rendering.
 */
export function pillKindForLabel(label: string): PillKind {
  switch (label) {
    case 'Over-leaning': return 'over';
    case 'Under-leaning': return 'under';
    case 'Mixed': return 'mixed';
    case 'Insufficient Evidence': return 'insufficient';
    case 'Unavailable': return 'unavailable';
    default:
      throw new Error(
        `previewVariantStyle: "${label}" is not a §D.2 compact label. ` +
        `Permitted: ${COMPACT_LABEL_SET.join(', ')}. The Board renders the ` +
        `projection's classification_label verbatim; it never paraphrases.`
      );
  }
}

export function isCompactLabel(s: string): s is CompactLabel {
  return (COMPACT_LABEL_SET as readonly string[]).includes(s);
}

/**
 * Pill treatment per kind. Directional kinds are FILLED with the valence-neutral
 * hue; GD-15's Insufficient and Unavailable get DISTINCT non-directional
 * treatments (dashed outline vs solid low-opacity outline) so they never read as
 * each other or as a direction. No strength (Strong/Moderate) differentiation:
 * the projection carries no strength signal (see module header).
 */
export function pillStyle(kind: PillKind): Record<string, string | number> {
  const base: Record<string, string | number> = {
    display: 'inline-block',
    padding: '3px 9px',
    borderRadius: 999,
    fontSize: 13,
    fontWeight: 600,
    lineHeight: 1.2,
    whiteSpace: 'nowrap',
  };
  switch (kind) {
    case 'over':
      return { ...base, background: PREVIEW_HUES.over, color: PREVIEW_HUES.bg, border: `1px solid ${PREVIEW_HUES.over}` };
    case 'under':
      return { ...base, background: PREVIEW_HUES.under, color: PREVIEW_HUES.bg, border: `1px solid ${PREVIEW_HUES.under}` };
    case 'mixed':
      return { ...base, background: PREVIEW_HUES.neutral, color: PREVIEW_HUES.bg, border: `1px solid ${PREVIEW_HUES.neutral}` };
    case 'insufficient':
      // GD-15: distinct — DASHED outline, transparent fill.
      return { ...base, background: 'transparent', color: PREVIEW_HUES.quiet, border: `1px dashed ${PREVIEW_HUES.neutral}` };
    case 'unavailable':
      // GD-15: distinct from Insufficient — SOLID low-opacity outline.
      return { ...base, background: 'transparent', color: PREVIEW_HUES.quiet, border: `1px solid ${PREVIEW_HUES.border}`, opacity: 0.72 };
  }
}

/** Cap chip that RIDES the pill: smaller than the pill, visually attached
 *  (negative left margin overlapping the pill's rounded end), never hover-only. */
export function capChipStyle(): Record<string, string | number> {
  return {
    display: 'inline-block',
    marginLeft: -6,
    padding: '2px 7px 2px 10px',
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 600,
    lineHeight: 1.2,
    whiteSpace: 'nowrap',
    background: PREVIEW_HUES.border,
    color: PREVIEW_HUES.text,
    verticalAlign: 'middle',
  };
}

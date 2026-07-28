// V1-6f — the §D.2 compact pill with a cap chip riding it (server component).
//
// The pill text is the projection's `classification_label` rendered VERBATIM.
// The cap chip (when a cap is present) rides the pill: smaller, visually
// attached, persistent (never hover-only) per §D.4 rule 6. Shared by both
// variants so the pill treatment is identical across A and B.

import { pillKindForLabel, pillStyle, capChipStyle } from '../../src/lib/previewVariantStyle';

export function PreviewPill({ label, capTag }: { label: string; capTag?: string | undefined }) {
  const kind = pillKindForLabel(label); // throws on anything not a §D.2 compact string
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center' }}>
      <span data-testid={`pill-${kind}`} style={pillStyle(kind)}>
        {label}
      </span>
      {capTag !== undefined ? (
        <span data-testid="cap-chip" style={capChipStyle()}>
          {capTag}
        </span>
      ) : null}
    </span>
  );
}

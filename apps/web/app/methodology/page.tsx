// V1-8a3 — Methodology route (the fuller explanation the Board disclosure points
// to; Founder Ruling 1). Server component; no evidence data, no client JS.

export const runtime = 'nodejs';

import { BoardChrome } from '../../components/board/BoardSurface';
import { PREVIEW_HUES } from '../../src/lib/previewVariantStyle';

const H = PREVIEW_HUES;

export default function MethodologyPage() {
  return (
    <BoardChrome title="Methodology" subtitle="How to read the Board" active="Methodology">
      <div style={{ fontSize: 13, color: H.text, lineHeight: 1.55, maxWidth: 640 }}>
        <p>
          Each row shows how a player has performed relative to the currently evaluated line over
          recent games — not a prediction, and never a suggested wager. The classification names the
          direction of the evidence; the eight cells summarise it and the selected panel opens the
          full detail.
        </p>
        <h2 style={{ fontSize: 14, marginTop: 18 }}>The eight cells</h2>
        <p>
          <b>L5 · L10 · L20 · SZN</b> are windows over recent eligible games; each shows an above–below
          count (with pushes when present) and opens a full Evidence Strip. <b>STRK</b> is the current
          run, <b>AVG</b> the average value, and <b>DIFF</b> the factual difference from the evaluated
          line. <b>H2H</b> (head-to-head) is not yet available.
        </p>
        <h2 style={{ fontSize: 14, marginTop: 18 }}>Reading a Strip</h2>
        <p>
          Every game holds its chronological place. A filled cell is above the line, a hollow cell is
          below, a flat cell is on the line, and a ghost (dashed) cell is a game the player did not
          play or was not eligible — it keeps its position and carries no verdict. Because ghosts hold
          their place, a ten-game window can show more than ten cells.
        </p>
        <p style={{ color: H.quiet, marginTop: 18 }}>
          The Board reports counts of what happened. It does not compute or imply an outcome likelihood.
        </p>
      </div>
    </BoardChrome>
  );
}

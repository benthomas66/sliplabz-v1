// V1-8a3 — Players route. A real, working navigation destination with an honest
// pending state (not a dead control, not a fabricated list). Server component.

export const runtime = 'nodejs';

import { BoardChrome } from '../../components/board/BoardSurface';
import { PREVIEW_HUES } from '../../src/lib/previewVariantStyle';

export default function PlayersPage() {
  return (
    <BoardChrome title="Players" subtitle="Player index" active="Players">
      <p data-testid="players-pending" style={{ color: PREVIEW_HUES.quiet, fontSize: 13, lineHeight: 1.5 }}>
        A per-player index is not part of this release. For now, open any Board row to inspect a
        player&rsquo;s evidence in Research View.
      </p>
    </BoardChrome>
  );
}

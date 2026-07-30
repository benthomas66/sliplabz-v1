// V1-6a / V1-8a2 — the Board route (SERVER component; no client JS in the tree).
//
// Node runtime (pg cannot run on edge). Rendered dynamically so it reflects the
// authoritative hosted state per request. The server ranks + projects + renders
// the whole information band to HTML; the series payload NEVER crosses to a
// client component (GAP-21). Every available row renders (Founder ruling 2); the
// locked continuation architecture sits BELOW them and gates nothing.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { getBoardData } from '../../src/lib/server/boardService';
import { BoardChrome, BoardRow, LockedContinuation } from '../../components/board/BoardSurface';
import { EMPTY_STATE_HEADING, EMPTY_STATE_MESSAGE } from '../../src/lib/boardCopy';

export default async function BoardPage() {
  const { rows } = await getBoardData();

  if (rows.length === 0) {
    // Approved honest empty state — copy byte-unchanged. No placeholders, no
    // future-slate rows, no unevaluated games (Founder ruling 4).
    return (
      <BoardChrome>
        <h1 style={{ fontSize: 16, marginTop: 4 }}>{EMPTY_STATE_HEADING}</h1>
        <p data-testid="board-empty-state" style={{ opacity: 0.7 }}>{EMPTY_STATE_MESSAGE}</p>
      </BoardChrome>
    );
  }

  return (
    <BoardChrome>
      <div data-testid="board-rows" data-row-count={rows.length}>
        {rows.map((row, i) => (
          <BoardRow key={`${row.projection.player}-${row.projection.market}-${i}`} row={row} />
        ))}
      </div>
      <LockedContinuation />
    </BoardChrome>
  );
}

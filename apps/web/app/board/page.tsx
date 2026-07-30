// V1-6a / V1-8a2 / V1-8a3 — the Board route (server component; the ONLY client
// component is the filter controller `BoardControls`).
//
// Node runtime (pg cannot run on edge). Rendered dynamically so it reflects the
// authoritative hosted state per request. The server ranks + projects + renders
// each row (including all eight evidence panels) to HTML; the series payload
// NEVER crosses to a client component (GAP-21). `BoardControls` receives the
// pre-rendered row nodes + allowlisted display meta only. §G.1 is rendered ONCE
// at board level (Founder Ruling 1). Every available row renders; the locked
// continuation architecture sits BELOW them and gates nothing.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { getBoardData } from '../../src/lib/server/boardService';
import { BoardChrome, BoardRow, BoardDisclosure, LockedContinuation } from '../../components/board/BoardSurface';
import { BoardControls, type BoardControlItem } from '../../components/board/BoardControls';
import { marketBucket, directionBucket } from '../../src/lib/board/bandView';
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

  // R2-1/R2-2: ONE compact board-level disclosure sentence + a collapsible
  // "How to read the Board" help (server-rendered). The fuller explanation lives
  // in Methodology. §G.1 is NOT repeated per row (Founder Ruling 1).

  // Each item carries the pre-rendered server node + ALLOWLISTED display meta
  // only (player name, market bucket, direction bucket). No series/score/id.
  const items: ReadonlyArray<BoardControlItem> = rows.map((row, i) => ({
    key: `${row.projection.player}-${row.projection.market}-${i}`,
    meta: {
      player: row.projection.player,
      marketBucket: marketBucket(row.projection.market),
      direction: directionBucket(row.projection.classification_label),
    },
    node: <BoardRow row={row} rowId={String(i)} />,
  }));

  return (
    <BoardChrome>
      <BoardDisclosure />
      <BoardControls items={items} />
      <LockedContinuation />
    </BoardChrome>
  );
}

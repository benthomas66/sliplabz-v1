// V1-6a Scope D — the Board route (server component).
//
// Node runtime (Scope G: pg cannot run on edge; future Stripe-sensitive
// paths must also avoid edge). Rendered dynamically so it reflects the
// authoritative hosted state per request.
//
// The server ranks + projects; only `BoardProjection[]` crosses to the
// client component. Today's authoritative v2 result is the EMPTY STATE.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { getBoardData } from '../../src/lib/server/boardService';
import { BoardTable } from '../../components/BoardTable';
import { EMPTY_STATE_HEADING, EMPTY_STATE_MESSAGE, BOARD_TITLE } from '../../src/lib/boardCopy';

export default async function BoardPage() {
  const { projections } = await getBoardData();

  if (projections.length === 0) {
    return (
      <main style={{ padding: '2rem', maxWidth: 900 }}>
        <h1>{EMPTY_STATE_HEADING}</h1>
        <p data-testid="board-empty-state">{EMPTY_STATE_MESSAGE}</p>
      </main>
    );
  }

  return (
    <main style={{ padding: '2rem', maxWidth: 900 }}>
      <h1>{BOARD_TITLE}</h1>
      <BoardTable projections={projections} />
    </main>
  );
}

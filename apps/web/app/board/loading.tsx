// V1-8a2 — Board route loading state (Next app-dir streaming). Server-rendered
// skeleton matching the real row geometry; part of making a dense board feel
// alive. No client JS.

import { BoardChrome, BoardSkeleton } from '../../components/board/BoardSurface';

export default function BoardLoading() {
  return (
    <BoardChrome>
      <BoardSkeleton />
    </BoardChrome>
  );
}

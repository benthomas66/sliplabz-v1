// V1-8b — readable game-history list (R6) + per-game inspection (R5). Server
// component, no client JS. Each game is an accessible <details> row: the summary
// shows Date · Opponent · Result · Stat · Line; expanding shows ONLY persisted
// facts (home/away, eligible/ineligible state, non-participation reason).
//
// CONTAINMENT: no internal_game_id — a game is identified by its DATE + opponent
// (display-safe). DNP/ineligible rows hold chronological position and are clearly
// marked EXCLUDED FROM EVIDENCE COUNTS. No box-score stats, no prediction.

import type { ResearchSeriesEntry } from '../../src/lib/researchProjection';
import { PREVIEW_HUES } from '../../src/lib/previewVariantStyle';
import { displayStatusLabel, outcomeLabel } from '../../src/lib/research/terminology';

const H = PREVIEW_HUES;

function homeAway(is_home: boolean | null, opponent: string): string {
  if (is_home === null) return opponent;
  return `${is_home ? 'vs' : '@'} ${opponent}`;
}
function shortDate(iso: string): string {
  const m = /(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m === null ? iso : `${Number(m[2])}/${Number(m[3])}`;
}

export function GameHistory({ series }: { series: ReadonlyArray<ResearchSeriesEntry> }): React.ReactElement {
  // Newest first for scanning, but each row states its own date so chronology is
  // never inferred; the underlying order (oldest→newest) is preserved in `series`.
  const rows = series.map((s, i) => ({ s, i })).reverse();
  return (
    <div data-testid="game-history" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {rows.map(({ s, i }) => {
        const excluded = !s.counted;
        return (
          <details key={i} data-testid="game-row" data-excluded={excluded ? 'true' : 'false'}
            style={{ border: `1px solid ${H.border}`, borderRadius: 8, background: H.panel, opacity: excluded ? 0.82 : 1 }}>
            <summary style={{ cursor: 'pointer', listStyle: 'none', padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
              <span style={{ color: H.quiet, width: 40, flex: '0 0 auto' }}>{shortDate(s.game_date_utc)}</span>
              <span style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{homeAway(s.is_home, s.opponent_label)}</span>
              <span style={{ color: H.text, fontVariantNumeric: 'tabular-nums' }}>{s.stat_value === null ? '—' : s.stat_value}</span>
              <span style={{ color: H.quiet, fontVariantNumeric: 'tabular-nums' }}>/ {s.comparison_line === null ? '—' : s.comparison_line}</span>
              <span data-testid="game-result" style={{ width: 68, flex: '0 0 auto', textAlign: 'right', color: H.quiet }}>
                {excluded ? displayStatusLabel(s.display_status) : outcomeLabel(s.outcome)}
              </span>
            </summary>
            <div style={{ padding: '2px 10px 10px', fontSize: 11, color: H.quiet, lineHeight: 1.5 }}>
              <div>Date: {s.game_date_utc}</div>
              <div>Opponent: {s.opponent_label}{s.is_home === null ? '' : s.is_home ? ' (home)' : ' (away)'}</div>
              <div>Stat: {s.stat_value === null ? '—' : s.stat_value} · Evaluated line: {s.comparison_line === null ? '—' : s.comparison_line}</div>
              <div>Status: {displayStatusLabel(s.display_status)}{excluded ? ' — excluded from evidence counts' : ` · ${outcomeLabel(s.outcome)}`}</div>
            </div>
          </details>
        );
      })}
      {series.length === 0 ? <div style={{ fontSize: 12, color: H.quiet }}>No games in the record.</div> : null}
    </div>
  );
}

'use client';
// V1-6a Scope D — the ONLY client component that receives Board data.
//
// Its props are typed as `BoardProjection[]` — the allowlisted surface. By
// construction it CANNOT receive the composite score, paid offering detail,
// or a raw evidence row: those fields are absent from `BoardProjection`. The
// serialization audit proves the distinctive prohibited values never appear
// in the RSC flight payload embedded in the HTML.
//
// Minimal client interaction (a per-row disclosure toggle) demonstrates that
// the client holds the projection — including the §G.1 disclosure text — but
// nothing restricted.

import { useState } from 'react';
import type { BoardProjection } from '../src/lib/boardProjection';

export function BoardTable({ projections }: { projections: ReadonlyArray<BoardProjection> }) {
  const [openRow, setOpenRow] = useState<number | null>(null);
  return (
    <table style={{ borderCollapse: 'collapse', width: '100%' }}>
      <thead>
        <tr>
          <th style={cell}>Player</th>
          <th style={cell}>Team</th>
          <th style={cell}>Market</th>
          <th style={cell}>Line</th>
          <th style={cell}>Evidence</th>
        </tr>
      </thead>
      <tbody>
        {projections.map((p, i) => (
          <tr key={`${p.player}-${p.market}-${i}`}>
            <td style={cell}>{p.player}</td>
            <td style={cell}>{p.team}</td>
            <td style={cell}>{p.market}</td>
            <td style={cell}>{p.evaluated_line === null ? '—' : p.evaluated_line}</td>
            <td style={cell}>
              <span>{p.compact_display_line}</span>
              {p.provenance_marker !== undefined ? (
                <div style={{ fontSize: '0.85em', color: '#555' }}>{p.provenance_marker}</div>
              ) : null}
              <button
                type="button"
                onClick={() => setOpenRow(openRow === i ? null : i)}
                style={{ marginTop: 4, fontSize: '0.8em' }}
              >
                {openRow === i ? 'Hide note' : 'Show note'}
              </button>
              {openRow === i ? (
                <div style={{ fontSize: '0.8em', color: '#333', marginTop: 4 }}>{p.disclosure_g1}</div>
              ) : null}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const cell: React.CSSProperties = {
  border: '1px solid #ddd',
  padding: '6px 10px',
  textAlign: 'left',
  verticalAlign: 'top',
};

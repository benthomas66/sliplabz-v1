// Historical event discovery for the seed pipeline.
//
// Authority:
//   Odds sub-spec §14.11 (historical event discovery + event odds endpoints)
//   Complete spec §10.13 (historical seed requests)
//   Ticket §8b required tests:
//     - historical event-ID discovery.
//
// This module normalizes the raw historical-events response into the
// `HistoricalEventRow[]` the pipeline consumes. The V1-3 event-discovery
// validator has the same shape rules; this validator is intentionally
// isolated so the seed pipeline does not accidentally use current-poll
// codepaths.

import type { HistoricalEventRow } from './types.js';

export interface HistoricalEventDiscoveryValidationResult {
  readonly valid_events: ReadonlyArray<HistoricalEventRow>;
  readonly quarantined: ReadonlyArray<{
    readonly reason:
      | 'missing_event_id'
      | 'duplicate_event_id'
      | 'unexpected_field_shape';
    readonly reason_detail: string;
    readonly raw_payload: unknown;
  }>;
  readonly is_empty: boolean;
}

/**
 * Validate the historical-events response envelope. The provider returns
 * a snapshot-shaped object:
 *   { timestamp, previous_timestamp, next_timestamp, data: [...] }
 * where `data` is the events array. Callers pass `body.data` directly
 * (already extracted).
 */
export function validateHistoricalEventDiscoveryRows(
  rows: ReadonlyArray<unknown>
): HistoricalEventDiscoveryValidationResult {
  const seen = new Map<string, number>();
  const staged: Array<
    | { readonly ok: true; readonly row: HistoricalEventRow }
    | {
        readonly ok: false;
        readonly q: {
          readonly reason:
            | 'missing_event_id'
            | 'duplicate_event_id'
            | 'unexpected_field_shape';
          readonly reason_detail: string;
          readonly raw_payload: unknown;
        };
      }
  > = [];

  for (const raw of rows) {
    if (raw === null || typeof raw !== 'object') {
      staged.push({
        ok: false as const,
        q: {
          reason: 'unexpected_field_shape',
          reason_detail: 'event row is not an object',
          raw_payload: raw,
        },
      });
      continue;
    }
    const r = raw as Record<string, unknown>;
    const id = typeof r['id'] === 'string' ? (r['id'] as string).trim() : '';
    if (id === '') {
      staged.push({
        ok: false as const,
        q: {
          reason: 'missing_event_id',
          reason_detail: 'event has no id',
          raw_payload: raw,
        },
      });
      continue;
    }
    seen.set(id, (seen.get(id) ?? 0) + 1);
    const home = typeof r['home_team'] === 'string' ? (r['home_team'] as string) : '';
    const away = typeof r['away_team'] === 'string' ? (r['away_team'] as string) : '';
    const commence =
      typeof r['commence_time'] === 'string' ? (r['commence_time'] as string) : '';
    if (home === '' || away === '' || commence === '') {
      staged.push({
        ok: false as const,
        q: {
          reason: 'unexpected_field_shape',
          reason_detail: 'missing required field',
          raw_payload: raw,
        },
      });
      continue;
    }
    if (!Number.isFinite(Date.parse(commence))) {
      staged.push({
        ok: false as const,
        q: {
          reason: 'unexpected_field_shape',
          reason_detail: `commence_time is not a valid ISO-8601 timestamp: ${commence}`,
          raw_payload: raw,
        },
      });
      continue;
    }
    const event: HistoricalEventRow = {
      id,
      sport_key: typeof r['sport_key'] === 'string' ? (r['sport_key'] as string) : '',
      sport_title:
        typeof r['sport_title'] === 'string' ? (r['sport_title'] as string) : '',
      commence_time: commence,
      home_team: home,
      away_team: away,
      ...(typeof r['snapshot_ts'] === 'string'
        ? { snapshot_ts: r['snapshot_ts'] as string }
        : {}),
      ...(typeof r['previous_ts'] === 'string' || r['previous_ts'] === null
        ? { previous_ts: r['previous_ts'] as string | null }
        : {}),
      ...(typeof r['next_ts'] === 'string' || r['next_ts'] === null
        ? { next_ts: r['next_ts'] as string | null }
        : {}),
    };
    staged.push({ ok: true as const, row: event });
  }

  const valid: HistoricalEventRow[] = [];
  const quarantined: HistoricalEventDiscoveryValidationResult['quarantined'] = [] as any;
  for (const s of staged) {
    if (s.ok) {
      const c = seen.get(s.row.id) ?? 0;
      if (c > 1) {
        (quarantined as any).push({
          reason: 'duplicate_event_id',
          reason_detail: `event id ${s.row.id} appears ${c} times`,
          raw_payload: s.row,
        });
      } else {
        valid.push(s.row);
      }
    } else {
      (quarantined as any).push(s.q);
    }
  }

  return Object.freeze({
    valid_events: Object.freeze(valid),
    quarantined: Object.freeze(quarantined),
    is_empty: rows.length === 0,
  });
}

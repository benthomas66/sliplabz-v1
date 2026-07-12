// Event-discovery normalization + validation.
//
// Authority:
//   Odds sub-spec §4.4 (locked event rules; missing/duplicate ID quarantine)
//   Odds sub-spec §5 (six-event slate universe)
//   Odds sub-spec §7 (event discovery and lifecycle)
//   Odds sub-spec §14.2 (events endpoint does not count against quota)
//   Complete spec §10.1 (event discovery)
//   Ticket V1-3: fixture-only validation; NO live provider call.

import type { OddsapiEventRow } from './types.js';
import { contentHash } from './sourceHash.js';

export interface EventDiscoveryValidationResult {
  /** Rows that pass structural validation and become event snapshot inputs. */
  readonly valid_events: ReadonlyArray<ValidatedEvent>;
  /** Rows quarantined because of missing/duplicate ID or bad commence_time. */
  readonly quarantined: ReadonlyArray<QuarantineEntry>;
  /** True when the response body is well-formed but returned zero rows. */
  readonly is_empty: boolean;
}

export interface ValidatedEvent {
  readonly provider_event_id: string;
  readonly raw_sport_key: string;
  readonly raw_sport_title: string;
  readonly raw_home_team: string;
  readonly raw_away_team: string;
  readonly raw_commence_time: string;
  readonly content_hash: string;
  readonly raw_payload: OddsapiEventRow;
}

export interface QuarantineEntry {
  readonly reason: 'missing_event_id' | 'duplicate_event_id' | 'unexpected_field_shape';
  readonly reason_detail: string;
  readonly raw_payload: unknown;
}

/**
 * Validate the events endpoint response array.
 *
 * Rules:
 *   * `id` required, non-empty (Odds §4.4).
 *   * duplicate `id` values within a single response quarantine both rows.
 *   * `commence_time` required, valid ISO-8601 (Odds §4.4).
 *   * `home_team` / `away_team` required non-empty (Odds §4.3).
 *   * Invalid rows quarantine; VALID rows still proceed.
 */
export function validateEventDiscoveryResponse(
  rows: ReadonlyArray<unknown>
): EventDiscoveryValidationResult {
  const seen_ids = new Map<string, number>(); // id → count
  const staged: Array<
    | { readonly ok: true; readonly row: ValidatedEvent }
    | { readonly ok: false; readonly quarantine: QuarantineEntry }
  > = [];

  for (const raw of rows) {
    if (raw === null || typeof raw !== 'object') {
      staged.push({
        ok: false as const,
        quarantine: {
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
        quarantine: {
          reason: 'missing_event_id',
          reason_detail: 'event has no id',
          raw_payload: raw,
        },
      });
      continue;
    }
    seen_ids.set(id, (seen_ids.get(id) ?? 0) + 1);
    const home = typeof r['home_team'] === 'string' ? (r['home_team'] as string) : '';
    const away = typeof r['away_team'] === 'string' ? (r['away_team'] as string) : '';
    const commence =
      typeof r['commence_time'] === 'string' ? (r['commence_time'] as string) : '';
    if (home === '' || away === '' || commence === '') {
      staged.push({
        ok: false as const,
        quarantine: {
          reason: 'unexpected_field_shape',
          reason_detail: 'missing required field (home_team, away_team, or commence_time)',
          raw_payload: raw,
        },
      });
      continue;
    }
    const parsed_ms = Date.parse(commence);
    if (!Number.isFinite(parsed_ms)) {
      staged.push({
        ok: false as const,
        quarantine: {
          reason: 'unexpected_field_shape',
          reason_detail: `commence_time is not a valid ISO-8601 timestamp: ${commence}`,
          raw_payload: raw,
        },
      });
      continue;
    }
    const evt: ValidatedEvent = {
      provider_event_id: id,
      raw_sport_key:
        typeof r['sport_key'] === 'string' ? (r['sport_key'] as string) : '',
      raw_sport_title:
        typeof r['sport_title'] === 'string' ? (r['sport_title'] as string) : '',
      raw_home_team: home,
      raw_away_team: away,
      raw_commence_time: commence,
      content_hash: contentHash(raw),
      raw_payload: r as unknown as OddsapiEventRow,
    };
    staged.push({ ok: true as const, row: evt });
  }

  const valid: ValidatedEvent[] = [];
  const quarantined: QuarantineEntry[] = [];

  for (const s of staged) {
    if (s.ok) {
      const dup_count = seen_ids.get(s.row.provider_event_id) ?? 0;
      if (dup_count > 1) {
        quarantined.push({
          reason: 'duplicate_event_id',
          reason_detail: `event id ${s.row.provider_event_id} appears ${dup_count} times in the response`,
          raw_payload: s.row.raw_payload,
        });
      } else {
        valid.push(s.row);
      }
    } else {
      quarantined.push(s.quarantine);
    }
  }

  return {
    valid_events: Object.freeze(valid),
    quarantined: Object.freeze(quarantined),
    is_empty: rows.length === 0,
  };
}

// Outcome normalization.
//
// Authority:
//   Odds sub-spec §10.7 (outcome shape: name / description / price / point)
//   Odds sub-spec §10.14 (missing-data policy: missing point / description /
//     side / price → quarantine)
//   Ticket V1-3 hard invariant: all provider strings, prices, points, and
//     timestamps remain auditable verbatim.

import { normalizeName } from '../identity/nameNormalization.js';
import type { OutcomeSide, PriceSemantic } from '../shared/enums.js';
import type { OddsapiOutcomeRow } from './types.js';

export interface NormalizedOutcome {
  readonly raw_name: string;
  readonly raw_description: string;
  readonly raw_price: number;
  readonly raw_point: number;
  readonly raw_multiplier: number | null;
  readonly side: OutcomeSide;
  readonly normalized_player_name: string;
  readonly price_semantic: PriceSemantic;
}

export interface OutcomeQuarantine {
  readonly reason:
    | 'missing_player_description'
    | 'missing_side'
    | 'missing_point'
    | 'missing_price'
    | 'unexpected_field_shape';
  readonly reason_detail: string;
  readonly raw_row: unknown;
}

export type OutcomeNormalizeResult =
  | { readonly ok: true; readonly outcome: NormalizedOutcome }
  | { readonly ok: false; readonly quarantine: OutcomeQuarantine };

function classifySide(name: string): OutcomeSide | null {
  const s = name.trim().toLowerCase();
  if (s === 'over') return 'over';
  if (s === 'under') return 'under';
  // The provider may in principle return Push / Yes / No; the audit did not
  // observe these on the four launch markets, so we quarantine.
  return null;
}

/**
 * Normalize one outcome row.
 *
 * `price_semantic` is decided by the caller who knows the bookmaker's
 * source class. The default here is `sportsbook_american`; PrizePicks and
 * Underdog callers pass `provider_synthetic_or_display_price`.
 */
export function normalizeOutcome(
  raw: OddsapiOutcomeRow | Record<string, unknown> | null | undefined,
  price_semantic: PriceSemantic
): OutcomeNormalizeResult {
  if (raw === null || raw === undefined || typeof raw !== 'object') {
    return {
      ok: false as const,
      quarantine: {
        reason: 'unexpected_field_shape',
        reason_detail: 'outcome row is not an object',
        raw_row: raw,
      },
    };
  }
  const r = raw as Record<string, unknown>;
  const name = typeof r['name'] === 'string' ? (r['name'] as string) : '';
  const description =
    typeof r['description'] === 'string' ? (r['description'] as string) : '';
  const price_val = r['price'];
  const point_val = r['point'];
  const multiplier_val = r['multiplier'];

  if (description.trim() === '') {
    return {
      ok: false as const,
      quarantine: {
        reason: 'missing_player_description',
        reason_detail: 'outcome has no description (player display name)',
        raw_row: raw,
      },
    };
  }
  const side = classifySide(name);
  if (side === null) {
    return {
      ok: false as const,
      quarantine: {
        reason: 'missing_side',
        reason_detail: `outcome name=${JSON.stringify(name)} is not Over or Under`,
        raw_row: raw,
      },
    };
  }
  if (typeof point_val !== 'number' || !Number.isFinite(point_val)) {
    return {
      ok: false as const,
      quarantine: {
        reason: 'missing_point',
        reason_detail: 'outcome has no numeric point',
        raw_row: raw,
      },
    };
  }
  if (typeof price_val !== 'number' || !Number.isFinite(price_val)) {
    return {
      ok: false as const,
      quarantine: {
        reason: 'missing_price',
        reason_detail: 'outcome has no numeric price',
        raw_row: raw,
      },
    };
  }
  const multiplier =
    typeof multiplier_val === 'number' && Number.isFinite(multiplier_val)
      ? (multiplier_val as number)
      : null;

  return {
    ok: true as const,
    outcome: Object.freeze({
      raw_name: name,
      raw_description: description,
      raw_price: Math.trunc(price_val),
      raw_point: point_val,
      raw_multiplier: multiplier,
      side,
      normalized_player_name: normalizeName(description),
      price_semantic,
    }),
  };
}

// Canonical source-hash for player_game_stats correction detection.
//
// Authority:
//   BDL sub-spec §12C.4 (repeated pulls compare a canonical source-field hash)
//   BDL sub-spec §12C.5 (material corrections: participation, minutes,
//     counting statistics, team assignment, presence)
//   Complete spec §11.2 (source_hash field)
//
// This module defines the ONE canonical hash algorithm. Downstream code
// (correction detection, invalidation) MUST use canonicalSourceHash;
// two ingest paths that hash differently would defeat correction detection.
//
// The hash covers only the fields that materially affect computation. Raw
// payload references retain the full byte-preserved evidence separately.

import { createHash } from 'node:crypto';

import type { BdlMinutesStatus } from '../shared/enums.js';
import type { NormalizedCountingStats } from './types.js';

/**
 * Inputs to the canonical hash. Ordering here IS the ordering used to
 * assemble the hash preimage. Never reordered; changing this shape requires
 * bumping SOURCE_HASH_VERSION and a compatibility strategy.
 */
export interface SourceHashInputs {
  readonly provider_player_id: string;
  readonly provider_game_id: string;
  readonly provider_team_id: string | null;
  readonly minutes_status: BdlMinutesStatus;
  /** parsed_minutes rounded to 2 decimals or null. */
  readonly parsed_minutes: number | null;
  /** raw_minutes exactly as observed (including `"--"`). */
  readonly raw_minutes: string | null;
  /** Raw counting stats (before any null-to-zero). */
  readonly raw_stats: NormalizedCountingStats;
}

export const SOURCE_HASH_VERSION = 1;

/**
 * Compose a canonical, order-stable preimage of the material fields, hash
 * with SHA-256, and return the hex digest.
 *
 * Determinism guarantees:
 *   * JSON.stringify with a fixed key order (defined below).
 *   * Nulls preserved as `null`; not squashed to 0.
 *   * NaN and Infinity never enter this hash — the caller must not pass them.
 *   * `raw_minutes` is preserved verbatim so `"--"` produces a different
 *     hash from a missing minutes field.
 *
 * Two logically-identical observations must produce byte-identical hashes.
 * BDL §12C.2 confirmed 27-row identical captures; this hash is the guard
 * that makes such repeated pulls behave as `metadata_change=false`.
 */
export function canonicalSourceHash(inputs: SourceHashInputs): string {
  const preimage = {
    v: SOURCE_HASH_VERSION,
    provider: 'balldontlie',
    provider_player_id: inputs.provider_player_id,
    provider_game_id: inputs.provider_game_id,
    provider_team_id: inputs.provider_team_id ?? null,
    minutes_status: inputs.minutes_status,
    parsed_minutes: inputs.parsed_minutes,
    raw_minutes: inputs.raw_minutes,
    // raw_stats in a fixed key order for determinism.
    raw_stats: {
      pts: inputs.raw_stats.pts,
      reb: inputs.raw_stats.reb,
      ast: inputs.raw_stats.ast,
      fg3m: inputs.raw_stats.fg3m,
      stl: inputs.raw_stats.stl,
      blk: inputs.raw_stats.blk,
      turnover: inputs.raw_stats.turnover,
      fgm: inputs.raw_stats.fgm,
      fga: inputs.raw_stats.fga,
      fg3a: inputs.raw_stats.fg3a,
      ftm: inputs.raw_stats.ftm,
      fta: inputs.raw_stats.fta,
      oreb: inputs.raw_stats.oreb,
      dreb: inputs.raw_stats.dreb,
      pf: inputs.raw_stats.pf,
    },
  };
  const json = JSON.stringify(preimage);
  return createHash('sha256').update(json).digest('hex');
}

/**
 * Cheap content-hash for provider descriptive metadata (team, availability,
 * or roster snapshot). Used for content_hash columns where correction
 * detection is about "did the observation change" rather than "did the
 * canonical stat change". Ordering-stable when the caller passes an object
 * whose keys are inserted in a stable order.
 */
export function contentHash(obj: unknown): string {
  return createHash('sha256')
    .update(stableStringify(obj))
    .digest('hex');
}

function stableStringify(v: unknown): string {
  if (v === null) return 'null';
  if (typeof v === 'number') {
    return Number.isFinite(v) ? String(v) : 'null';
  }
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'string') return JSON.stringify(v);
  if (Array.isArray(v)) {
    return '[' + v.map((item) => stableStringify(item)).join(',') + ']';
  }
  if (typeof v === 'object') {
    const keys = Object.keys(v as Record<string, unknown>).sort();
    return (
      '{' +
      keys
        .map(
          (k) =>
            JSON.stringify(k) +
            ':' +
            stableStringify((v as Record<string, unknown>)[k])
        )
        .join(',') +
      '}'
    );
  }
  // undefined / function / symbol / bigint fall through to 'null'.
  return 'null';
}

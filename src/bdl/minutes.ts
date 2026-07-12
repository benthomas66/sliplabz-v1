// BDL minutes parsing.
//
// Authority:
//   BDL sub-spec §7.1 (observed formats: integer strings + `"--"`)
//   BDL sub-spec §7.2 (three canonical states — played, dnp, unresolved)
//   BDL sub-spec §7.3 (application rules)
//   BDL sub-spec §7.4 (low-minute appearances count as played)
//   Complete spec §9.4 (three-state minutes)
//   Ticket V1-2 hard invariant: `"--"` is a distinct minutes-state, never
//     coerced to zero, never treated as DNP.
//
// This module makes exactly ONE decision: raw string → BdlMinutesStatus and
// a parsed numeric value when applicable. It does not decide eligibility;
// that's the eligibility module's job.

import type { MinutesParseResult } from './types.js';

/**
 * Parse a BDL raw minutes value.
 *
 * Rules:
 *   * Integer strings and numeric input: parsed as numeric.
 *     - value > 0 → `played`
 *     - value = 0 → `dnp`
 *     - value < 0 → `unresolved_non_numeric` (invariant: negative minutes
 *       are not defined by BDL and never coerce)
 *   * `"--"`, empty string, whitespace-only, null, undefined, or any format
 *     other than an integer or MM:SS clock → `unresolved_non_numeric`.
 *   * A MM:SS clock string (rare; not seen in the audit but permitted by
 *     documentation) is parsed via total-minutes-with-fraction. This never
 *     rounds to zero: 0:00 is DNP, anything with seconds > 0 rounds to
 *     played via a numeric of minutes+seconds/60.
 *
 * Never coerces `"--"` to a numeric. Never treats null as zero.
 */
export function parseBdlMinutes(
  raw: string | number | null | undefined
): MinutesParseResult {
  // Preserve the exact observed string form; null/undefined -> null.
  const raw_str = raw === null || raw === undefined ? null : String(raw);

  if (raw === null || raw === undefined) {
    return {
      status: 'unresolved_non_numeric',
      parsed_minutes: null,
      raw_minutes: null,
    };
  }

  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) {
      return {
        status: 'unresolved_non_numeric',
        parsed_minutes: null,
        raw_minutes: raw_str,
      };
    }
    if (raw < 0) {
      return {
        status: 'unresolved_non_numeric',
        parsed_minutes: null,
        raw_minutes: raw_str,
      };
    }
    if (raw === 0) {
      return {
        status: 'dnp',
        parsed_minutes: 0,
        raw_minutes: raw_str,
      };
    }
    return {
      status: 'played',
      parsed_minutes: roundTo2(raw),
      raw_minutes: raw_str,
    };
  }

  const trimmed = raw.trim();

  // Load-bearing case: BDL §7.1 documents `"--"` verbatim. NEVER coerce.
  if (trimmed === '' || trimmed === '--' || trimmed.toLowerCase() === 'null') {
    return {
      status: 'unresolved_non_numeric',
      parsed_minutes: null,
      raw_minutes: raw_str,
    };
  }

  // Integer / decimal minute string.
  if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) {
    const n = Number(trimmed);
    if (!Number.isFinite(n) || n < 0) {
      return {
        status: 'unresolved_non_numeric',
        parsed_minutes: null,
        raw_minutes: raw_str,
      };
    }
    if (n === 0) {
      return { status: 'dnp', parsed_minutes: 0, raw_minutes: raw_str };
    }
    return {
      status: 'played',
      parsed_minutes: roundTo2(n),
      raw_minutes: raw_str,
    };
  }

  // MM:SS clock string. Defensive; the audit did not show these but
  // BDL documentation does not forbid them either.
  const clockMatch = /^(\d+):(\d{1,2})$/.exec(trimmed);
  if (clockMatch !== null) {
    const mins = Number(clockMatch[1]!);
    const secs = Number(clockMatch[2]!);
    if (Number.isFinite(mins) && Number.isFinite(secs) && secs < 60) {
      const total = mins + secs / 60;
      if (total === 0) {
        return { status: 'dnp', parsed_minutes: 0, raw_minutes: raw_str };
      }
      return {
        status: 'played',
        parsed_minutes: roundTo2(total),
        raw_minutes: raw_str,
      };
    }
  }

  // §7.3 last rule: newly observed non-integer formats are data-quality events.
  return {
    status: 'unresolved_non_numeric',
    parsed_minutes: null,
    raw_minutes: raw_str,
  };
}

function roundTo2(n: number): number {
  return Math.round(n * 100) / 100;
}

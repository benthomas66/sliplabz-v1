// V1-8a2 — PURE, server-side presentation helpers for the mobile Board band.
//
// No client JS, no computation, no persistence: these transform the ALREADY
// PROJECTED band (V1-8a1 `BoardProjection.band`) into render inputs. The series
// is consumed here SERVER-SIDE only and rendered to HTML; it never crosses to a
// client component (GAP-21). Colours come from the committed valence-neutral hue
// module — never redefined here.

import type { CSSProperties } from 'react';
import { PREVIEW_HUES } from '../previewVariantStyle.js';
import type { SeriesCell, WindowCell } from '../boardProjection.js';

/** One Evidence-Strip cell glyph (Grammar §2.2). filled=above · hollow=below ·
 *  dash=push · ghost=ineligible/DNP holding chronological place, no verdict. */
export type CellGlyph = 'filled' | 'hollow' | 'dash' | 'ghost';

export function cellGlyph(p: SeriesCell): CellGlyph {
  if (p.position_kind === 'ineligible') return 'ghost';
  switch (p.outcome) {
    case 'above': return 'filled';
    case 'below': return 'hollow';
    case 'equal': return 'dash';
    default: return 'ghost'; // defensive; an eligible cell always has an outcome
  }
}

/** Inline style for a cell glyph. azure=over · violet=under · slate=push/ineligible.
 *  NO green/red. ghost = dashed slate outline, no fill (holds its place). */
export function cellStyle(glyph: CellGlyph): CSSProperties {
  const box: CSSProperties = {
    width: 11, height: 11, borderRadius: 2, flex: '0 0 auto', boxSizing: 'border-box',
  };
  switch (glyph) {
    case 'filled': return { ...box, background: PREVIEW_HUES.over, border: `1px solid ${PREVIEW_HUES.over}` };
    case 'hollow': return { ...box, background: 'transparent', border: `1px solid ${PREVIEW_HUES.under}` };
    case 'dash':   return { ...box, background: 'transparent', border: `1px solid ${PREVIEW_HUES.neutral}`, height: 3, alignSelf: 'center' };
    case 'ghost':  return { ...box, background: 'transparent', border: `1px dashed ${PREVIEW_HUES.neutral}`, opacity: 0.55 };
  }
}

/**
 * DISPLAY-MEMBERSHIP RULE (V1-8a0a report), implemented exactly: a window's
 * Strip is the chronological span from the Nth-most-recent ELIGIBLE position
 * through the most recent, INCLUSIVE of interleaved ineligible positions. An
 * L10 strip therefore renders MORE than ten cells when a DNP falls inside the
 * span. `eligible_n` is the window aggregate's persisted eligible count.
 */
export function stripSpan(series: ReadonlyArray<SeriesCell>, eligible_n: number): ReadonlyArray<SeriesCell> {
  if (eligible_n <= 0) return [];
  let seen = 0;
  let start = series.length;
  for (let i = series.length - 1; i >= 0; i -= 1) {
    start = i;
    if (series[i]!.position_kind === 'eligible') {
      seen += 1;
      if (seen === eligible_n) break;
    }
  }
  return series.slice(start);
}

/** The tallies for a strip span's ELIGIBLE cells — used to prove the rendered
 *  span reconciles with the window's persisted compact_counts. */
export function spanEligibleTally(span: ReadonlyArray<SeriesCell>): { above: number; below: number; equal: number } {
  let above = 0, below = 0, equal = 0;
  for (const c of span) {
    if (c.position_kind !== 'eligible') continue;
    if (c.outcome === 'above') above += 1;
    else if (c.outcome === 'below') below += 1;
    else if (c.outcome === 'equal') equal += 1;
  }
  return { above, below, equal };
}

/** Freshness Badge (Grammar §2.6): STATE + elapsed time, desaturating toward the
 *  horizon (NOT a shift to red). `display_age_seconds` is the gate's bounded
 *  duration. Returns the label text + a slate opacity that fades with age. */
export function freshnessView(state: string | null, display_age_seconds: number | null, horizon = 3600): {
  label: string; elapsed: string; opacity: number;
} {
  const label = state ?? 'unknown';
  const secs = display_age_seconds ?? 0;
  const elapsed = secs < 90 ? 'moments ago'
    : secs < 3600 ? `${Math.floor(secs / 60)}m ago`
    : `${Math.floor(secs / 3600)}h ago`;
  // Desaturate (fade opacity) as age approaches the horizon; never below 0.45.
  const frac = Math.max(0, Math.min(1, secs / horizon));
  const opacity = Number((1 - 0.55 * frac).toFixed(3));
  return { label, elapsed, opacity };
}

/** DETERMINISTic fallback avatar: same player name → same initials + slate shade,
 *  no randomness, no photograph. Grammar §5 neutral (never green/red). */
export function fallbackAvatar(player: string): { initials: string; background: string } {
  const parts = player.trim().split(/\s+/).filter(Boolean);
  const initials = (parts.length >= 2
    ? `${parts[0]![0]}${parts[parts.length - 1]![0]}`
    : (parts[0] ?? '?').slice(0, 2)).toUpperCase();
  // Deterministic slate shade from a stable name hash (valence-neutral only).
  let h = 0;
  for (let i = 0; i < player.length; i += 1) h = (h * 31 + player.charCodeAt(i)) >>> 0;
  const shades = ['#2A313A', '#333B45', '#3C4550', '#454F5B'];
  return { initials, background: shades[h % shades.length]! };
}

/** Compact-count parts for §7 rendering; the string is already A-B / A-B-P. */
export function windowCountsAria(w: WindowCell): string {
  return `${w.compact_counts} over ${w.sample.eligible_n} eligible`;
}

// ---------------------------------------------------------------------------
// Consumer-facing labels — NEVER expose the internal market_key / enums.
// ---------------------------------------------------------------------------
export type MarketBucket = 'points' | 'rebounds' | 'assists' | 'threes' | 'other';

export function marketLabel(market_key: string): string {
  switch (market_key) {
    case 'player_points': return 'Points';
    case 'player_rebounds': return 'Rebounds';
    case 'player_assists': return 'Assists';
    case 'player_threes': return '3-Pointers';
    default: return market_key.replace(/^player_/, '').replace(/\b\w/g, (c) => c.toUpperCase());
  }
}
export function marketBucket(market_key: string): MarketBucket {
  switch (market_key) {
    case 'player_points': return 'points';
    case 'player_rebounds': return 'rebounds';
    case 'player_assists': return 'assists';
    case 'player_threes': return 'threes';
    default: return 'other';
  }
}

export type DirectionBucket = 'over' | 'under' | 'neither';
/** Direction bucket from the §D.2 compact label (never the internal direction enum). */
export function directionBucket(classification_label: string): DirectionBucket {
  return classification_label === 'Over-leaning' ? 'over'
    : classification_label === 'Under-leaning' ? 'under' : 'neither';
}

/** ONE consolidated ordinary-metadata line (§ metadata consolidation), e.g.
 *  "Fresh 31m · 6 books · Season 23 eligible". Exceptional conditions stay
 *  separate. Never a raw ISO timestamp — only the freshness state + elapsed. */
export function consolidatedMeta(
  fresh: { label: string; elapsed: string } | null,
  book_count: number | null,
  season_eligible_n: number | null,
): string {
  const parts: string[] = [];
  if (fresh !== null) parts.push(`${cap(fresh.label)} ${fresh.elapsed.replace(' ago', '')}`);
  if (book_count !== null) parts.push(`${book_count} book${book_count === 1 ? '' : 's'}`);
  if (season_eligible_n !== null) parts.push(`Season ${season_eligible_n} eligible`);
  return parts.join(' · ');
}
function cap(s: string): string { return s.length === 0 ? s : s[0]!.toUpperCase() + s.slice(1); }

// ---------------------------------------------------------------------------
// R2-3 — matchup + human-formatted tipoff (GAP-22). DETERMINISTIC, SERVER-SIDE.
// DISPLAY TIMEZONE RULE: all tipoffs render in US Eastern Time (America/New_York)
// — one fixed rule, documented; no client-side timezone computation, no account
// state. The raw ISO timestamp and any tz suffix are NEVER emitted.
// ---------------------------------------------------------------------------
export const BOARD_DISPLAY_TIMEZONE = 'America/New_York';

/** `Chicago vs Phoenix` (home) or `Chicago @ Phoenix` (away), from the player's
 *  perspective. Cities only — never internal ids or enums. */
export function formatMatchup(playerTeam: string, opponent: string, is_home: boolean): string {
  return `${playerTeam} ${is_home ? 'vs' : '@'} ${opponent}`;
}

/** `7:00 PM` in the fixed display timezone. No date, no timezone suffix, no ISO. */
export function formatTipoff(scheduled_start_utc: string): string {
  const d = new Date(scheduled_start_utc);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: BOARD_DISPLAY_TIMEZONE, hour: 'numeric', minute: '2-digit', hour12: true,
  }).format(d);
}

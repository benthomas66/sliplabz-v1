// V1-6a — INTERNAL ranked candidate (Scope B call-path stage 2).
//
//   raw database row
//     -> internal ranked candidate   (the restricted score exists ONLY here)
//     -> Board projection constructor
//     -> Board projection
//     -> rendering / client boundary
//
// This type carries the restricted composite score and the DR-20 tie-break
// fields. It is NEVER passed to a client component and NEVER rendered. The
// projection constructor reads an allowlist off it and returns a NEW object.

import type { EvidenceProfileOutput } from '../../../../src/evidence/types.js';
import type { MethodVersion } from './method.js';

export interface RankedCandidate {
  // ---- RESTRICTED (DR-19): the composite score exists ONLY at this stage ----
  readonly composite_score: number | null;

  // ---- DR-20 tie-break fields. Internal-only; they never become projection keys ----
  readonly l10_eligible_n: number;
  readonly eligible_sportsbook_count: number;
  readonly internal_game_id: string;

  // ---- the method version this row belongs to (selection integrity) ----
  readonly method_version: MethodVersion;

  // ---- V1-6d SERVE-GATE INPUT (internal-only). The freshest self-observed
  //      current_poll observation for the grain (market_snapshots.observed_at),
  //      BOUNDED by this profile's own evaluation_reference_time (V1-6d REVISE):
  //      observations recorded after the profile was classified are excluded,
  //      so a newer poll cannot rejuvenate an older profile at serve time.
  //      Consumed ONLY by the serving gate in boardService (display_age =
  //      serve_now − line_observed_at); dropped BEFORE projection and a
  //      FORBIDDEN projection key. `null` when the grain has no such
  //      offering at/before its reference time — the gate suppresses that row. ----
  readonly line_observed_at: string | null;

  // ---- allowlisted display inputs ----
  readonly player: string;
  readonly team: string;
  readonly market: string;
  readonly evaluated_line: number | null;

  // ---- the SHARED evidence output shape that drives the committed compact
  //      renderer (`renderCompactExplanation`). Note: its `.components`
  //      carries the composite score too — also restricted, also internal. ----
  readonly profile_output: EvidenceProfileOutput;

  // ---- PAID-ONLY per-book offering detail (book_detail.offerings). The free
  //      tier must NEVER receive it; the Board projection never carries it. ----
  readonly paid_book_offerings: ReadonlyArray<{ readonly book: string; readonly price: number }>;
}

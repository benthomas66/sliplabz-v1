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
import type { EvidenceInputBundleState } from '../../../../src/evidence/v2/readEvidenceInputs.js';
import type { MethodVersion } from './method.js';

/** V1-8a1 — persisted current-market context for the information band's
 *  consensus + freshness cells (from `current_market_rows`). SERVER-SIDE band
 *  input; the projection copies specific fields, never spreads this object.
 *  No paid per-book handle. */
export interface BoardConsensusContext {
  readonly consensus_point: number | null;
  readonly min_point: number | null;
  readonly max_point: number | null;
  readonly book_count: number;
  readonly distribution: ReadonlyArray<{ readonly point: number; readonly count: number }>;
  readonly freshness_state: string | null;
}

export interface RankedCandidate {
  // ---- RESTRICTED (DR-19): the composite score exists ONLY at this stage ----
  readonly composite_score: number | null;

  // ---- DR-20 tie-break fields. Internal-only; they never become projection keys ----
  readonly l10_eligible_n: number;
  readonly eligible_sportsbook_count: number;
  readonly internal_game_id: string;
  // V1-8a2: the grain player id — SERVER-SIDE only, used with internal_game_id +
  // market to build the Board→Research navigation href server-side. A FORBIDDEN
  // projection key (never a band/projection data field).
  readonly internal_player_id: string;

  // ---- V1-8a1 SERVER-SIDE band inputs. NEVER projection keys. ----
  //   `evidence_profile_id` is the batched-bundle join key (Amendment 21 sibling
  //   of internal_game_id — a stable internal identity, FORBIDDEN on the browser
  //   projection). `bundle` is the V1-8a0/V1-8a0a persisted window aggregates +
  //   series + source identities (carrying internal_game_id server-side).
  //   `consensus` is the persisted current-market context. All optional: a legacy
  //   profile with no persisted bundle omits `bundle` and projects a typed
  //   `unavailable_not_persisted` band (Scope D). The projection reads these
  //   FIELD-BY-FIELD and never carries them.
  readonly evidence_profile_id?: string | undefined;
  readonly bundle?: EvidenceInputBundleState | undefined;
  readonly consensus?: BoardConsensusContext | undefined;

  // ---- R2-3 (GAP-22) SERVER-SIDE game context. ALREADY-KNOWN fields, passed
  //      through for server-side display formatting (matchup + human tipoff).
  //      The raw scheduled_start_utc + team identities stay server-side; only the
  //      FORMATTED strings reach the projection. NEVER projection keys. ----
  readonly game_context?: {
    readonly player_team: string;
    readonly opponent: string;
    readonly is_home: boolean;
    readonly scheduled_start_utc: string;
  } | undefined;

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

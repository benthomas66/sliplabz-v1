-- ============================================================================
-- V1-4  Migration 35 : lines enums
--
-- Authority anchors:
--   Complete spec §7.10 (close boundary), §7.10.2 (canonical closing point),
--     §7.11 (historical real-line game), §7.12 (push), §7.13 (historical windows),
--     §11.5 (derived research storage)
--   Complete spec §13 (movement & disappearance)
--   Odds sub-spec §16 (current-line & snapshot selection), §17 (movement),
--     §18.4 (canonical historical closing point), §19 (freshness)
--
-- Forward-fix strategy: enum values are additive only; renames or removals
-- ship as (a) add new value, (b) code cutover, (c) later drop; never in one
-- step.
-- ============================================================================

-- The authority that determined the close boundary (complete spec §7.10).
-- `verified_actual_start` when BALLDONTLIE observed `actual_start_utc`;
-- `scheduled_with_grace` when using the approved scheduled-start grace rule;
-- `postponed_no_close` when the game was postponed and never had a valid tip.
CREATE TYPE close_boundary_source AS ENUM (
  'verified_actual_start',
  'scheduled_with_grace',
  'postponed_no_close'
);

-- Close-capture eligibility state (Odds §14.11 wording reused for both
-- current and historical, since the same boundary rules apply).
--   `eligible`             — snapshot at or before boundary, within tolerance.
--   `close_capture_stale`  — snapshot's effective time is more than the
--                            approved threshold before the boundary; ineligible.
--   `no_snapshot`          — no eligible current snapshot was ever observed
--                            before the boundary (missing closing line).
CREATE TYPE close_capture_state AS ENUM (
  'eligible',
  'close_capture_stale',
  'no_snapshot'
);

-- Canonical closing-point selection method per spec §7.10.2 / Odds §18.4.
CREATE TYPE closing_selection_method AS ENUM (
  'single_book',
  'unique_modal',
  'tied_no_unique_mode',
  'no_eligible_source'
);

-- Coverage label per spec §11.5 historical_line_results + §14.3 windows.
CREATE TYPE coverage_label AS ENUM (
  'complete',
  'single_book',
  'incomplete',
  'unresolved_closing_consensus',
  'no_closing_line'
);

-- Movement event type per Odds §17 and complete spec §13.1.
CREATE TYPE movement_type AS ENUM (
  'point_changed',
  'over_price_changed',
  'under_price_changed',
  'side_added',
  'side_removed',
  'point_added',
  'point_removed',
  'player_added',
  'player_removed',
  'market_added',
  'market_removed',
  'bookmaker_added',
  'bookmaker_removed',
  'duplicate_state_changed',
  'provider_timestamp_changed',
  'unchanged'
);

-- Per-source presence lifecycle per Odds §17 / complete spec §13.3.
--   `present`               — offering appears in latest successful snapshot.
--   `single_omission`       — absent from exactly one successful snapshot after
--                             a run of presence; NOT yet confirmed-removed.
--   `confirmed_removed`     — absent from TWO consecutive successful snapshots.
--   `resurrected_never`     — sentinel: once confirmed_removed, an offering
--                             cannot be "walked backward" to `present`; a new
--                             appearance produces a new observed_line_lifecycle
--                             row rather than resurrecting the old one.
CREATE TYPE source_presence_state AS ENUM (
  'present',
  'single_omission',
  'confirmed_removed'
);

-- Historical real-line outcome per spec §7.12.
--   `over`   — player result strictly greater than canonical closing point.
--   `under`  — strictly less than.
--   `push`   — equal to closing point. Excluded from Over/Under percentages
--             and from streak direction; retained as its own outcome.
CREATE TYPE real_line_outcome AS ENUM (
  'over',
  'under',
  'push'
);

-- Real-line window types per spec §7.13 / §14.3.
CREATE TYPE real_line_window_type AS ENUM (
  'L5',
  'L10',
  'L20',
  'season'
);

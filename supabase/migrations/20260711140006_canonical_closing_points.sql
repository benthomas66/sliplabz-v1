-- ============================================================================
-- V1-4  Migration 40 : canonical closing points
--
-- Authority anchors:
--   Complete spec §7.10.2 (canonical historical closing point selection method)
--   Complete spec §11.5 historical_line_results.canonical_closing_point,
--     .closing_selection_method, .total_eligible_sportsbook_count,
--     .sportsbook_count_at_selected_point
--   Odds sub-spec §18.4 (canonical historical closing point method — no
--     synthetic line between sportsbook points; unique modal only)
--
-- Load-bearing invariants:
--   * UNIQUE (internal_game_id, internal_player_id, market_key) — one
--     canonical closing point per (game, player, market). No composite side
--     because closing points are side-neutral (Over/Under share the point).
--   * `selection_method` = single_book | unique_modal | tied_no_unique_mode
--     | no_eligible_source. Rows with tied_no_unique_mode or no_eligible_source
--     have `canonical_closing_point = NULL` and MUST NOT contribute to
--     historical windows (spec §7.10.2, §14.2).
--   * `total_eligible_sportsbook_count` counts distinct SPORTSBOOK closing
--     quotes with `close_capture_state = 'eligible'`. `sportsbook_count_at_selected_point`
--     is the mode count (NULL when no unique modal exists).
--   * `coverage_label` mirrors §11.5 for cheap product read paths:
--     `single_book`, `complete` (unique modal, multiple books), `no_closing_line`
--     (no eligible source), `unresolved_closing_consensus` (tied).
--   * NO synthetic point is EVER stored here. If canonical_closing_point is
--     non-NULL, it MUST equal a point observed in at least one eligible
--     sportsbook source_closing_quote.
--   * Application-level enforcement of "selected point must appear in an
--     eligible source quote" via the code path in
--     src/lines/canonicalClosingPoint.ts. The schema documents the invariant.
-- ============================================================================

CREATE TABLE canonical_closing_points (
  canonical_closing_point_id       uuid                      PRIMARY KEY DEFAULT gen_random_uuid(),

  internal_game_id                 uuid                      NOT NULL
                                                             REFERENCES games(internal_game_id)
                                                             ON UPDATE RESTRICT ON DELETE RESTRICT,
  internal_player_id               uuid                      NOT NULL
                                                             REFERENCES players(internal_player_id)
                                                             ON UPDATE RESTRICT ON DELETE RESTRICT,
  market_key                       text                      NOT NULL
                                                             REFERENCES market_registry(provider_key)
                                                             ON UPDATE RESTRICT ON DELETE RESTRICT,

  selection_method                 closing_selection_method  NOT NULL,

  canonical_closing_point          numeric(10,2),

  total_eligible_sportsbook_count      integer               NOT NULL DEFAULT 0,
  sportsbook_count_at_selected_point   integer,

  coverage_label                   coverage_label            NOT NULL,

  -- Structural pairings.
  CHECK (
    (selection_method = 'single_book'
       AND canonical_closing_point IS NOT NULL
       AND total_eligible_sportsbook_count = 1
       AND sportsbook_count_at_selected_point = 1
       AND coverage_label = 'single_book')
    OR
    (selection_method = 'unique_modal'
       AND canonical_closing_point IS NOT NULL
       AND total_eligible_sportsbook_count >= 2
       AND sportsbook_count_at_selected_point IS NOT NULL
       AND sportsbook_count_at_selected_point >= 1
       AND coverage_label = 'complete')
    OR
    (selection_method = 'tied_no_unique_mode'
       AND canonical_closing_point IS NULL
       AND total_eligible_sportsbook_count >= 2
       AND sportsbook_count_at_selected_point IS NULL
       AND coverage_label = 'unresolved_closing_consensus')
    OR
    (selection_method = 'no_eligible_source'
       AND canonical_closing_point IS NULL
       AND total_eligible_sportsbook_count = 0
       AND sportsbook_count_at_selected_point IS NULL
       AND coverage_label = 'no_closing_line')
  ),

  close_boundary_utc               timestamptz               NOT NULL,

  computation_version              integer                   NOT NULL DEFAULT 1,

  computed_at                      timestamptz               NOT NULL DEFAULT now(),
  created_at                       timestamptz               NOT NULL DEFAULT now(),
  updated_at                       timestamptz               NOT NULL DEFAULT now(),

  UNIQUE (internal_game_id, internal_player_id, market_key)
);

CREATE INDEX canonical_closing_points_game_idx
  ON canonical_closing_points (internal_game_id);
CREATE INDEX canonical_closing_points_player_market_idx
  ON canonical_closing_points (internal_player_id, market_key);
CREATE INDEX canonical_closing_points_selection_idx
  ON canonical_closing_points (selection_method);
CREATE INDEX canonical_closing_points_coverage_idx
  ON canonical_closing_points (coverage_label);

COMMENT ON TABLE canonical_closing_points
  IS 'One canonical closing point per (game, player, market). Unique-modal only; no interpolation.';
COMMENT ON COLUMN canonical_closing_points.canonical_closing_point
  IS 'NEVER a synthetic point. Application-enforced: must equal a point observed in an eligible sportsbook source_closing_quote.';

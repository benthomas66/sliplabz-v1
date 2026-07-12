-- ============================================================================
-- V1-4  Migration 42 : real-line window aggregates
--
-- Authority anchors:
--   Complete spec §7.13 (L5/L10/L20 mean the most recent 5/10/20 eligible
--     real-line games — NOT the player's last appearances when line coverage
--     is missing; show actual n)
--   Complete spec §11.5 research_window_metrics
--   Complete spec §14.3 (windows: reverse-chron traversal; stop at requested
--     count; show actual n; label incomplete if n is smaller)
--   Complete spec §14.4 (Over rate = Over / (Over + Under); push excluded)
--   Complete spec §14.5 (streak stops at opposite result / unresolved coverage
--     gap / missing real line / invalid game)
--
-- Load-bearing invariants:
--   * UNIQUE (internal_player_id, market_key, reference_date, window_type,
--     computation_version) — one aggregate per grain per computation version.
--   * `eligible_n` records the ACTUAL number of eligible real-line games
--     traversed, not the requested window size. `incomplete` labels a row
--     where eligible_n < requested_n.
--   * `over_count`, `under_count`, `push_count` sum to `eligible_n`. Pushes
--     are stored separately (§7.12) and MUST NOT be added to over_count or
--     under_count. `over_rate` is stored as a computed convenience but a
--     denominator of over_count + under_count.
--   * `current_streak_direction` and `current_streak_length` are recorded at
--     the reference_date. A coverage gap stops the streak (§14.5) — the
--     write path here already excludes non-eligible games.
--   * `computation_version` allows deterministic recomputation on invalidation
--     without mutating prior rows.
-- ============================================================================

CREATE TABLE real_line_windows (
  real_line_window_id             uuid                       PRIMARY KEY DEFAULT gen_random_uuid(),

  internal_player_id              uuid                       NOT NULL
                                                             REFERENCES players(internal_player_id)
                                                             ON UPDATE RESTRICT ON DELETE RESTRICT,
  market_key                      text                       NOT NULL
                                                             REFERENCES market_registry(provider_key)
                                                             ON UPDATE RESTRICT ON DELETE RESTRICT,

  -- Reference date (UTC calendar day) the window was computed against; the
  -- window traverses games strictly BEFORE this date. Storing this makes the
  -- aggregate reproducible.
  reference_date                  date                       NOT NULL,

  window_type                     real_line_window_type      NOT NULL,

  -- Requested and actual n.
  requested_n                     integer                    NOT NULL,
  eligible_n                      integer                    NOT NULL,
  CHECK (requested_n >= 0),
  CHECK (eligible_n >= 0),
  CHECK (eligible_n <= requested_n OR window_type = 'season'),

  incomplete                      boolean                    NOT NULL,
  CHECK ( (incomplete = false AND eligible_n = requested_n)
       OR (incomplete = true  AND eligible_n < requested_n)
       OR window_type = 'season' ),

  over_count                      integer                    NOT NULL DEFAULT 0,
  under_count                     integer                    NOT NULL DEFAULT 0,
  push_count                      integer                    NOT NULL DEFAULT 0,

  CHECK (over_count >= 0 AND under_count >= 0 AND push_count >= 0),
  CHECK (over_count + under_count + push_count = eligible_n),

  -- Denominator over_count + under_count. NULL when denominator is 0.
  over_rate                       numeric(5,4),

  -- Averages / medians of margin and stat value across the eligible set.
  avg_margin                      numeric(10,4),
  median_margin                   numeric(10,4),
  avg_stat_value                  numeric(10,4),
  median_stat_value               numeric(10,4),

  current_streak_direction        real_line_outcome,
  current_streak_length           integer,
  CHECK ( (current_streak_direction IS NULL AND current_streak_length IS NULL)
       OR (current_streak_direction IS NOT NULL AND current_streak_length IS NOT NULL AND current_streak_length >= 1) ),

  coverage_label                  coverage_label             NOT NULL,

  computation_version             integer                    NOT NULL DEFAULT 1,

  computed_at                     timestamptz                NOT NULL DEFAULT now(),
  created_at                      timestamptz                NOT NULL DEFAULT now(),
  updated_at                      timestamptz                NOT NULL DEFAULT now(),

  UNIQUE (internal_player_id, market_key, reference_date, window_type, computation_version)
);

CREATE INDEX real_line_windows_player_market_idx
  ON real_line_windows (internal_player_id, market_key);
CREATE INDEX real_line_windows_reference_date_idx
  ON real_line_windows (reference_date DESC);
CREATE INDEX real_line_windows_window_type_idx
  ON real_line_windows (window_type);

COMMENT ON TABLE real_line_windows
  IS 'Real-line window aggregates: L5/L10/L20/season. Actual n preserved; pushes separate; coverage gaps stop streaks.';
COMMENT ON COLUMN real_line_windows.eligible_n
  IS 'Actual eligible real-line games traversed; never the requested window size when incomplete.';

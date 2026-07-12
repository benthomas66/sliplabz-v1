-- ============================================================================
-- V1-4  Migration 37 : observed line lifecycle
--
-- Authority anchors:
--   Complete spec §7.8 (first observed line — SlipLabz observation; NEVER
--     labeled "true opening line" unless provider evidence supports it)
--   Complete spec §7.9 (current line — latest eligible, fresh, pregame)
--   Complete spec §13 (movement & disappearance)
--   Complete spec §13.4 (first observed and close — never backfill a false
--     first-observed from a later historical query)
--   Odds sub-spec §16 (current-line & snapshot selection)
--   Odds sub-spec §16.3 (opening observation is first observed by SlipLabz)
--   Odds sub-spec §17 (movement / disappearance contract)
--
-- Load-bearing invariants:
--   * One lifecycle row per (internal_game_id, internal_player_id, market_key,
--     bookmaker_key, side, point, lifecycle_generation). Distinct points and
--     distinct sides on the same book/player are separate lifecycles —
--     never collapsed into a multi-line composite here.
--   * `first_observed_offering_id` references the FIRST market_offering
--     SlipLabz observed for that grain. This is a SlipLabz observation, not
--     a claim about the bookmaker's true market open.
--   * `current_offering_id` references the LATEST market_offering that
--     survived §16.1 selection (current_poll + self_observed + not
--     superseded + within freshness threshold + before boundary ineligible).
--   * `final_observed_pregame_offering_id` is the LAST eligible pregame
--     offering for closing-line computation; NULL until close boundary hits.
--   * `presence_state` tracks confirmed-removal per Odds §17: `present` →
--     `single_omission` (one missed successful poll) → `confirmed_removed`
--     (two consecutive missed successful polls). Once `confirmed_removed`,
--     that generation of the lifecycle is FROZEN: its presence_state,
--     first_observed_*, current_*, and final_observed_pregame_* fields are
--     never mutated by a later reappearance. See lifecycle_generation below.
--   * Every offering pointer flows through market_snapshots that are
--     `request_kind=current_poll AND provenance=self_observed`. Historical
--     backfill lifecycle NEVER writes here.
--
-- Lifecycle generation semantics (V1-4 correction, governor review):
--   * `lifecycle_generation` starts at 1 for the first appearance of a
--     grain and NEVER decreases.
--   * When a grain reaches `presence_state = 'confirmed_removed'` and later
--     REAPPEARS in a successful poll, the write path MUST insert a NEW row
--     at (same grain, generation + 1) rather than mutating the existing
--     confirmed_removed row. The prior generation's row remains untouched
--     as the historical record of that appearance-and-removal cycle.
--   * The UNIQUE constraint therefore includes lifecycle_generation as its
--     final member: two generations for the same grain coexist; two rows
--     at the same (grain, generation) are rejected.
--   * "No walking backward" (§17) is enforced as: no prior generation's
--     row is ever UPDATE'd to a state earlier than confirmed_removed. New
--     appearances create a new generation; old rows are read-only history.
-- ============================================================================

CREATE TABLE observed_line_lifecycle (
  observed_line_lifecycle_id      uuid                       PRIMARY KEY DEFAULT gen_random_uuid(),

  internal_game_id                uuid                       NOT NULL
                                                             REFERENCES games(internal_game_id)
                                                             ON UPDATE RESTRICT ON DELETE RESTRICT,
  internal_player_id              uuid                       NOT NULL
                                                             REFERENCES players(internal_player_id)
                                                             ON UPDATE RESTRICT ON DELETE RESTRICT,
  market_key                      text                       NOT NULL
                                                             REFERENCES market_registry(provider_key)
                                                             ON UPDATE RESTRICT ON DELETE RESTRICT,
  bookmaker_key                   text                       NOT NULL
                                                             REFERENCES bookmaker_registry(provider_key)
                                                             ON UPDATE RESTRICT ON DELETE RESTRICT,
  side                            outcome_side               NOT NULL,
  point                           numeric(10,2)              NOT NULL,

  -- Provenance mirror. Structural: only self_observed current_poll rows may
  -- populate any pointer here.
  provenance                      oddsapi_provenance         NOT NULL DEFAULT 'self_observed',
  CHECK (provenance = 'self_observed'),

  -- Pointers to canonical market_offerings rows.
  first_observed_offering_id      uuid                       NOT NULL
                                                             REFERENCES market_offerings(market_offering_id)
                                                             ON UPDATE RESTRICT ON DELETE RESTRICT,
  first_observed_at               timestamptz                NOT NULL,

  current_offering_id             uuid                       REFERENCES market_offerings(market_offering_id)
                                                             ON UPDATE RESTRICT ON DELETE RESTRICT,
  current_observed_at             timestamptz,

  final_observed_pregame_offering_id  uuid                   REFERENCES market_offerings(market_offering_id)
                                                             ON UPDATE RESTRICT ON DELETE RESTRICT,
  final_observed_pregame_at       timestamptz,

  presence_state                  source_presence_state      NOT NULL DEFAULT 'present',
  consecutive_omission_count      integer                    NOT NULL DEFAULT 0,
  CHECK (consecutive_omission_count >= 0 AND consecutive_omission_count <= 2),

  last_omission_at                timestamptz,
  confirmed_removed_at            timestamptz,

  -- Reappearance-after-confirmed-removal generation counter (V1-4 correction).
  -- Starts at 1. When a grain in state `confirmed_removed` reappears in a
  -- successful poll, the write path inserts a NEW row at generation + 1
  -- rather than mutating the existing confirmed_removed row. Prior
  -- generations are frozen historical records.
  lifecycle_generation            integer                    NOT NULL DEFAULT 1,
  CHECK (lifecycle_generation >= 1),

  computation_version             integer                    NOT NULL DEFAULT 1,

  created_at                      timestamptz                NOT NULL DEFAULT now(),
  updated_at                      timestamptz                NOT NULL DEFAULT now(),

  -- Load-bearing per-grain uniqueness. Multi-line preservation lives at the
  -- offerings layer; each (side, point) is its own lifecycle here. The
  -- generation is the final member so two generations for the same grain
  -- coexist while duplicates at the same (grain, generation) are rejected.
  UNIQUE (internal_game_id, internal_player_id, market_key, bookmaker_key, side, point, lifecycle_generation)
);

CREATE INDEX observed_line_lifecycle_game_player_market_idx
  ON observed_line_lifecycle (internal_game_id, internal_player_id, market_key);
CREATE INDEX observed_line_lifecycle_bookmaker_idx
  ON observed_line_lifecycle (bookmaker_key);
CREATE INDEX observed_line_lifecycle_current_idx
  ON observed_line_lifecycle (current_offering_id)
  WHERE current_offering_id IS NOT NULL;
CREATE INDEX observed_line_lifecycle_final_pregame_idx
  ON observed_line_lifecycle (final_observed_pregame_offering_id)
  WHERE final_observed_pregame_offering_id IS NOT NULL;
CREATE INDEX observed_line_lifecycle_presence_idx
  ON observed_line_lifecycle (presence_state);

COMMENT ON TABLE observed_line_lifecycle
  IS 'Per-grain lifecycle: SlipLabz first-observed / current / final-observed-pregame. Never a claim of bookmaker true open.';
COMMENT ON COLUMN observed_line_lifecycle.first_observed_offering_id
  IS 'First SlipLabz observation. See §7.8 — NEVER labeled "opening line" or "true open" in product copy.';
COMMENT ON COLUMN observed_line_lifecycle.consecutive_omission_count
  IS '0 = present; 1 = single_omission; 2 = confirmed_removed. Never walks backward.';
COMMENT ON COLUMN observed_line_lifecycle.lifecycle_generation
  IS 'Starts at 1. Reappearance after confirmed_removed creates a NEW row at generation+1; prior generations never mutate.';

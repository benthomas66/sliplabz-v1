-- ============================================================================
-- V1-3  Migration 31 : market offerings (canonical normalized outcomes)
--
-- Authority anchors:
--   Odds API sub-spec §10.5 (deduplication rules; canonical observation per
--     equivalent group; conflicts quarantine)
--   Odds API sub-spec §10.6 (one-sided offerings — never fabricate)
--   Odds API sub-spec §10.7 (outcome fields: name / description / price / point)
--   Odds API sub-spec §10.9 (offering state)
--   Odds API sub-spec §10.14 (missing-data policy)
--   Odds API sub-spec §11.6 / §12.8 (multi-line preservation)
--   Odds API sub-spec §15.3 (normalized offering: identity + fields)
--   Complete spec §11.4 market_offerings
--   Ticket V1-3 hard invariants:
--     - The missing side is NEVER fabricated, mirrored, or inferred;
--     - Exact duplicates collapse ONLY after raw retention;
--     - Conflicting duplicates quarantine with evidence;
--     - PrizePicks / Underdog `-137` prices retained as
--       `provider_synthetic_or_display_price`.
--
-- Load-bearing invariants:
--   * Canonical offering identity within a snapshot:
--       (market_snapshot_id, normalized_player_name, point, side)
--     BEFORE player resolution (Odds §15.3 staging key).
--   * `internal_player_id` populates after V1-1 reconciliation.
--   * `duplicate_count` records how many raw rows collapsed into this canonical
--     row. NEVER less than 1.
--   * `raw_price_american` retained verbatim; `price_semantic` distinguishes
--     conventional sportsbook price from PrizePicks / Underdog synthetic.
-- ============================================================================

CREATE TABLE market_offerings (
  market_offering_id           uuid                        PRIMARY KEY DEFAULT gen_random_uuid(),

  market_snapshot_id           uuid                        NOT NULL
                                                           REFERENCES market_snapshots(market_snapshot_id)
                                                           ON UPDATE RESTRICT ON DELETE RESTRICT,

  -- Raw player description exactly as observed (Odds §10.7 `description`).
  raw_player_description       text                        NOT NULL,

  -- Candidate-only normalized player key. Follows V1-1 nameNormalization
  -- rules; NEVER used for permanent identity.
  normalized_player_name       text                        NOT NULL,

  -- Populated after V1-1 reconcilePlayer approves; NULL while unresolved.
  internal_player_id           uuid                        REFERENCES players(internal_player_id)
                                                           ON UPDATE RESTRICT ON DELETE RESTRICT,

  side                         outcome_side                NOT NULL,

  point                        numeric(10,2)               NOT NULL,

  -- Raw American price preserved verbatim; §14.9 warns about small
  -- rounding discrepancies — no format conversion is applied here.
  raw_price_american           integer                     NOT NULL,

  -- Provider-specific display multiplier. NULL when not returned. Metadata,
  -- NOT converted into probability or expected value (§11.5, §12.5).
  raw_multiplier               numeric(6,3),

  -- Governs which downstream analytics apply the raw price. Sportsbook
  -- observations set `sportsbook_american`; PrizePicks / Underdog set
  -- `provider_synthetic_or_display_price`.
  price_semantic               price_semantic              NOT NULL,

  -- DFS promotion type. `unknown` per §11.7 unless explicitly established.
  promotion_type               dfs_promotion_type          NOT NULL DEFAULT 'unknown',

  offering_state               offering_state              NOT NULL,
  conflict_reason              offering_conflict_reason,

  CHECK ( (offering_state = 'conflicting' AND conflict_reason IS NOT NULL)
       OR (offering_state = 'duplicate_contaminated' AND conflict_reason IS NOT NULL)
       OR (offering_state <> 'conflicting' AND offering_state <> 'duplicate_contaminated' AND conflict_reason IS NULL) ),

  -- Number of raw rows collapsed into this canonical offering. >= 1.
  duplicate_count              integer                     NOT NULL DEFAULT 1,
  CHECK (duplicate_count >= 1),

  -- Provider market-level last_update denormalized for query hygiene.
  provider_last_update         timestamptz,

  -- Canonical source hash of the material fields for this offering.
  source_hash                  text                        NOT NULL,

  eligibility_note             text                        NOT NULL DEFAULT '',

  created_at                   timestamptz                 NOT NULL DEFAULT now(),
  updated_at                   timestamptz                 NOT NULL DEFAULT now(),

  -- Canonical offering identity within a snapshot per §15.3. Uniqueness is
  -- BEFORE player resolution — the normalized name plus point plus side
  -- collapses equivalent raw rows.
  UNIQUE (market_snapshot_id, normalized_player_name, point, side)
);

CREATE INDEX market_offerings_snapshot_idx        ON market_offerings (market_snapshot_id);
CREATE INDEX market_offerings_internal_player_idx ON market_offerings (internal_player_id)
  WHERE internal_player_id IS NOT NULL;
CREATE INDEX market_offerings_state_idx           ON market_offerings (offering_state);
CREATE INDEX market_offerings_price_semantic_idx  ON market_offerings (price_semantic);
CREATE INDEX market_offerings_normalized_idx      ON market_offerings (normalized_player_name);

COMMENT ON TABLE  market_offerings
  IS 'Canonical normalized outcome rows. Uniqueness collapses field-equivalent raw duplicates. See Odds §10.5, §15.3.';
COMMENT ON COLUMN market_offerings.price_semantic
  IS 'STRUCTURAL: sportsbook_american vs provider_synthetic_or_display_price. Governs which analytics apply the raw price.';
COMMENT ON COLUMN market_offerings.duplicate_count
  IS 'Number of raw rows collapsed into this canonical offering. See Odds §10.5 rule 4.';

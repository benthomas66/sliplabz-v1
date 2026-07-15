-- ============================================================================
-- V1-A1-2  Migration 50 : evidence_profiles
--
-- Authority anchors:
--   * A1 §25 "Data-model requirements" — enumerates the stored fields a
--     "versioned Evidence Profile representation" MUST support: profile ID,
--     game ID, player ID, market, evaluated line, evaluated source type and
--     identifier, direction, evidence classification, internal rank,
--     optional displayed score, method version, calculation timestamp,
--     source snapshot references, historical-window values, margin values,
--     market-context values, quality values, penalties, classification caps,
--     inclusion status, exclusion reason codes, explanation fields,
--     freshness state.
--   * EVIDENCE_PROFILE_METHOD_V1.md §H "Reproducibility" — a stored profile
--     row MUST be reproducible from its referenced source records plus this
--     document at the referenced `method_version`.
--   * §D.1 + GD-15 — seven-value classification taxonomy; classification and
--     direction pair according to §B.7 + §D.1.
--   * §B.6 — composite score at full stored precision (see DR-20 —
--     ranking uses the full-precision stored score, NOT the DR-19 rounded
--     display value). §B.2/§B.3/§B.4/§B.5 name every component this row
--     stores.
--   * §A.5 + DR-23 (a) — `includes_backfilled_historical` is preserved per
--     profile.
--   * DR-19 — the numeric score is a Research-View-only DISPLAY restriction
--     enforced by surfaces and capability filtering; storage carries the
--     full-precision value regardless.
--   * DR-24 — method-version bump policy; `method_version` locked to
--     `evidence_method_v1` at this ticket's writing.
--   * §I.3 clause (2/3/4) + DR-27 — no ABNORMAL_DISPERSION cap or column;
--     no dispersion-threshold storage.
--   * V1-4 canonical-correction lesson (V1_TICKET_4_REPORT.md deviations):
--     CHECKs that structurally forbid a legitimate product state force
--     later widening migrations. Every CHECK below documents which states
--     it admits and why nothing legitimate is excluded.
--   * V1-5 recomputation-writer lesson (V1_TICKET_5_REPORT.md §4 governor
--     obligation #2, migration 20260713000000_...): UNIQUE on a derived
--     evidence row MUST include the version columns (method_version AND
--     computation_version). A version-blind UNIQUE with ON CONFLICT DO
--     NOTHING silently preserved stale rows; this row's UNIQUE explicitly
--     includes both.
--
-- Grain question (mandatory disclosure — see report §Grain decision):
--   The method is threshold-relative (§A.1 "one invocation per window, all
--   against the evaluated line as threshold"). The authority does NOT
--   settle whether `evaluated_line` is part of the row's UNIQUE grain key.
--   Per this ticket's rubric ("choose the option that stores only what the
--   authority requires; mark the choice as a governor decision needed"),
--   this ticket stores `evaluated_line` and `evaluated_source_kind` as
--   ordinary columns and does NOT include them in the UNIQUE. The chosen
--   grain is (internal_game_id, internal_player_id, market_key,
--   method_version, computation_version). Rationale:
--     * One canonical persisted profile per (game, player, market) per
--       version — matches V1-5's version-bump-on-recompute pattern.
--     * §25 lists `evaluated_line` as STORED, not as GRAIN KEY.
--     * §D.4 rule 4 explicitly authorizes Research-View re-evaluation at a
--       different line "deterministically re-evaluated" — this reads as
--       on-demand, not persisted-per-line.
--     * §17 Compare Your Line results are not required to persist a
--       separate row per user-entered threshold — the Research List (V1-A1-8A
--       ticket) is where a user save becomes durable, not this table.
--   GOVERNOR RULING [RESOLVED — 2026-07-15]: the canonical persisted
--   profile is evaluated at `sportsbook_consensus`. The other three
--   `evidence_evaluated_source_kind` values — `sportsbook_specific`,
--   `pickem`, and `user_entered` — are computed ON DEMAND by V1-A1-3 from
--   the read model and are NOT persisted at `evidence_method_v1`. The
--   grain (internal_game_id, internal_player_id, market_key,
--   method_version, computation_version) is APPROVED AS SHIPPED. No
--   CHECK constrains `evaluated_source_kind` — deliberately — so the
--   additive path to per-line variants (widening the UNIQUE with
--   `evaluated_source_kind` and `evaluated_line`) remains open under
--   DR-24 without a schema-shape change forcing a wider retrofit later.
--
-- Future-writer conflict strategy (documented per this ticket's rubric;
-- the writer itself is V1-A1-3):
--   * Same-version recompute: UPSERT `ON CONFLICT
--     ON CONSTRAINT evidence_profiles_grain_version_unique DO UPDATE SET`
--     restricted to the recomputable columns (composite_score,
--     c_rtp / c_ms / c_wa / c_ma, classification, direction, quality_capped,
--     quality_cap_reason, includes_backfilled_historical, evaluated_line,
--     evaluated_source_kind, evaluated_source_identifier, reference_date,
--     source_read_model_computation_version, current_market_row_id,
--     bdl_availability_snapshot_id, book_detail_one_sided, computed_at,
--     updated_at). The IMMUTABLE columns (internal_game_id,
--     internal_player_id, market_key, method_version, computation_version,
--     evidence_profile_id, created_at) MUST NOT appear in DO UPDATE SET.
--   * Version bump: an `evidence_method_v1 → evidence_method_v2` migration
--     (DR-24) or a computation_version bump inserts a NEW row against a
--     different UNIQUE key — the ON CONFLICT clause never fires — and
--     prior-version rows remain IMMUTABLE per §H (audit reconstruction).
--   * DO UPDATE SET WHERE clause SHOULD gate on
--     `evidence_profiles.method_version = EXCLUDED.method_version AND
--     evidence_profiles.computation_version = EXCLUDED.computation_version`
--     as a defense-in-depth: even if the writer is misused, the row for a
--     different version never mutates.
--   * A version-blind UNIQUE with ON CONFLICT DO NOTHING is the shape V1-5
--     wrote and had to correct; this schema forbids that shape by
--     construction (the UNIQUE below includes both version columns).
-- ============================================================================

CREATE TABLE evidence_profiles (
  -- Surrogate PK (A1 §25 "profile ID").
  evidence_profile_id                     uuid                          PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Grain identity (A1 §25 game ID / player ID / market).
  internal_game_id                        uuid                          NOT NULL
                                                                        REFERENCES games(internal_game_id)
                                                                        ON UPDATE RESTRICT ON DELETE RESTRICT,
  internal_player_id                      uuid                          NOT NULL
                                                                        REFERENCES players(internal_player_id)
                                                                        ON UPDATE RESTRICT ON DELETE RESTRICT,
  market_key                              text                          NOT NULL
                                                                        REFERENCES market_registry(provider_key)
                                                                        ON UPDATE RESTRICT ON DELETE RESTRICT,

  -- Evaluated-line context (A1 §25 "evaluated line, evaluated source type
  -- and identifier"). Nullable: an 'unavailable' profile computed against
  -- §C.9 UNRESOLVED_*_MAPPING may not have a market context, and therefore
  -- no evaluated_line to store. Insufficient profiles (§C.1) DO have an
  -- evaluated_line — the sample was just too small.
  --
  -- evaluated_source_identifier is a free-text audit hint (§25 "identifier")
  -- and its interpretation depends on evaluated_source_kind (e.g. the
  -- bookmaker_key for sportsbook_specific, the pick'em source_class value
  -- for pickem, a user session token or NULL for user_entered, or NULL
  -- when the source is sportsbook_consensus and no identifier is needed).
  evaluated_line                          numeric(10,2),
  evaluated_source_kind                   evidence_evaluated_source_kind,
  evaluated_source_identifier             text,
  CONSTRAINT evidence_profiles_evaluated_line_availability_check
    CHECK (
      classification = 'unavailable'
      OR (evaluated_line IS NOT NULL AND evaluated_source_kind IS NOT NULL)
    ),
  -- Admitted states enumerated:
  --   * classification = 'unavailable' → evaluated_line MAY be NULL;
  --     evaluated_source_kind MAY be NULL; evaluated_source_identifier
  --     MAY be NULL (§C.3 no market / §C.8 postponed/canceled /
  --     §C.9 unresolved mapping — each of these can arise without a
  --     usable evaluated line).
  --   * any other classification → BOTH evaluated_line AND
  --     evaluated_source_kind MUST be NOT NULL (the profile was scored
  --     against a specific line from a specific source kind).
  -- Nothing legitimate is excluded: Insufficient (§C.1) still has an
  -- evaluated line because C.1 fires only after the read model produced a
  -- (line, sample) pair; classified profiles (Strong/Moderate/Mixed) trivially
  -- have both.

  -- Classification and direction (§D.1, §B.7, GD-15).
  classification                          evidence_classification       NOT NULL,
  direction                               evidence_direction,
  CONSTRAINT evidence_profiles_classification_direction_check
    CHECK (
      (classification IN ('strong_over_evidence', 'moderate_over_evidence')  AND direction = 'over')
      OR (classification IN ('strong_under_evidence', 'moderate_under_evidence') AND direction = 'under')
      OR (classification IN ('mixed_evidence', 'insufficient_evidence', 'unavailable') AND direction IS NULL)
    ),
  -- Admitted states enumerated (all seven §10 taxonomy values):
  --   * strong_over_evidence   → direction = 'over'   (§B.7 score > 0)
  --   * moderate_over_evidence → direction = 'over'
  --   * strong_under_evidence  → direction = 'under'
  --   * moderate_under_evidence→ direction = 'under'
  --   * mixed_evidence         → direction = NULL     (§B.7 near-zero score
  --                                                    OR §C.5 WINDOWS_DISAGREE
  --                                                    forces Mixed regardless
  --                                                    of composite)
  --   * insufficient_evidence  → direction = NULL     (§C.1 exclusion — no
  --                                                    directional claim)
  --   * unavailable            → direction = NULL     (§C.3 / §C.8 / §C.9
  --                                                    exclusion — engine
  --                                                    truthfully cannot run)
  -- Nothing legitimate is excluded: every taxonomy value has a legitimate
  -- direction state and no legitimate profile combines a directional label
  -- (Strong/Moderate Over/Under) with a NULL direction, nor Mixed/Insufficient/
  -- Unavailable with a non-NULL direction.

  -- Composite score + components (§B.6 / §B.2 / §B.3 / §B.4 / §B.5).
  -- Full stored precision — DR-19 is a DISPLAY restriction; DR-20 requires
  -- ranking on the stored full-precision value. numeric(12,10) gives
  -- 10 decimal places of precision for a [-1, +1] clamped value, more than
  -- sufficient for deterministic reproduction of the §B formulas.
  --
  -- All five columns are NULLABLE: for §C.9 UNRESOLVED_*_MAPPING, §C.8
  -- POSTPONED_GAME / CANCELED_GAME, and §C.3 NO_CURRENT_MARKET the writer
  -- may not compute any component at all; for §C.1 INSUFFICIENT_L10_SAMPLE
  -- the writer's policy about whether to compute a composite is V1-A1-3's
  -- decision. Absence is absence; a NULL here means "not computed," never
  -- "computed as zero" (§25.5 no fabricated value).
  composite_score                         numeric(12,10),
  c_rtp                                   numeric(12,10),
  c_ms                                    numeric(12,10),
  c_wa                                    numeric(12,10),
  c_ma                                    numeric(12,10),
  CONSTRAINT evidence_profiles_score_clamp_check
    CHECK (
      (composite_score IS NULL OR (composite_score >= -1 AND composite_score <= 1))
      AND (c_rtp IS NULL OR (c_rtp >= -1 AND c_rtp <= 1))
      AND (c_ms IS NULL OR (c_ms  >= -1 AND c_ms  <= 1))
      AND (c_wa IS NULL OR (c_wa  >= -1 AND c_wa  <= 1))
      AND (c_ma IS NULL OR (c_ma  >= -1 AND c_ma  <= 1))
    ),
  -- Admitted states: any value in [-1, +1] per §B.6 clamp and per each
  -- §B.2/B.3/B.4/B.5 component's own clamp, plus NULL for "not computed."
  -- Nothing legitimate is excluded: the §B formulas all clamp to [-1, +1];
  -- storing an out-of-range value would be a violation of §B by construction.

  -- Quality-cap state (§D.1 step 5 "boolean quality_capped: true | false").
  -- `quality_cap_reason` identifies WHICH §C cap bound (§C.2 / §C.3 / §C.5 /
  -- §C.6 / §C.7). Together they express whether a cap bound and which one.
  -- Multiple caps may fire simultaneously (see §F.6 quality-capped example
  -- where INSUFFICIENT_BOOK_COVERAGE + STALE_CURRENT_MARKET both fire);
  -- the full set of attached cap reasons lives in evidence_profile_reasons
  -- with category = 'quality'. This row column reports the PRIMARY (writer-
  -- designated) binding cap for cheap query filtering; consumers needing
  -- the complete set walk the reasons table.
  quality_capped                          boolean                       NOT NULL,
  quality_cap_reason                      evidence_quality_cap_reason   NOT NULL,
  CONSTRAINT evidence_profiles_quality_cap_pairing_check
    CHECK (
      (quality_capped = false AND quality_cap_reason = 'none')
      OR (quality_capped = true  AND quality_cap_reason <> 'none')
    ),
  -- Admitted states:
  --   * (false, 'none')                        — no cap bound (§D.3).
  --   * (true, 'insufficient_book_coverage')   — §C.2 cap bound.
  --   * (true, 'stale_current_market')         — §C.3 cap bound.
  --   * (true, 'market_disagrees_with_history')— §C.5 cap bound.
  --   * (true, 'push_heavy_sample')            — §C.6 cap bound.
  --   * (true, 'one_sided_offering')           — §C.7 cap bound.
  -- Nothing legitimate is excluded: quality_capped is a boolean summary,
  -- and every non-none cap enum value ties one-to-one to a §C cap condition.
  -- Insufficient and Unavailable are CLASSIFICATIONS, not caps, and appear
  -- via `classification` — not here (see §D.3).

  -- Provenance (§A.5 / DR-23 (a)). Preserved per profile so consumers can
  -- filter out "observed since launch" surfaces per DR-23 (c/d) and
  -- V1_COMPUTATION_CONTRACT.md §5.
  includes_backfilled_historical          boolean                       NOT NULL,

  -- Reproducibility fields (§H + A1 §25 "method version, calculation
  -- timestamp, source snapshot references").
  --
  -- method_version: locked at write time. `evidence_method_v1` today per
  -- DR-24. Stored as text so a future DR-24 bump (`evidence_method_v2`) is
  -- an additive value, not a schema migration; the writer at that time
  -- writes new-version rows alongside old-version rows via the
  -- version-aware UNIQUE below.
  method_version                          text                          NOT NULL,
  -- computation_version: matches the V1-5 pattern (V1_COMPUTATION_CONTRACT.md §2).
  -- Same method_version + different computation_version = a recompute at
  -- the same formula (e.g. after a read-model normalization bump). Version-
  -- aware UNIQUE means the new row is INSERT, not UPDATE (per V1-5 lesson).
  computation_version                     integer                       NOT NULL,
  CONSTRAINT evidence_profiles_computation_version_positive_check
    CHECK (computation_version >= 1),

  -- Source snapshot references — the minimum set required to walk back to
  -- §H source records:
  --   * `reference_date` — the UTC calendar day the L5/L10/L20/season
  --     windows were computed against (matches real_line_windows.reference_date).
  --     Consumers reproduce windows by JOINing real_line_windows on
  --     (internal_player_id, market_key, reference_date,
  --      window_type, source_read_model_computation_version).
  --   * `source_read_model_computation_version` — the computation_version
  --     of the underlying V1-4/V1-5 read-model rows (historical_line_results,
  --     real_line_windows, canonical_closing_points) consulted at write
  --     time. Distinct from evidence_profiles.computation_version, which
  --     versions the evidence-profile write itself.
  --   * `current_market_row_id` — the exact CurrentMarketRow row consulted
  --     (nullable when §C.3 no market / §C.8 postponed / §C.9 unresolved).
  --   * `bdl_availability_snapshot_id` — the availability snapshot consulted
  --     (nullable when availability was itself unresolved / source_unavailable).
  --
  -- The RME snapshots (HistoricalCoverageResult / MappingResolutionResult /
  -- BookDetailResult.one_sided) are re-derivable from these references at
  -- the same read-model computation_version PLUS the RME-derivation code
  -- pinned by the referenced source rows. See §H.
  --
  -- book_detail_one_sided is stored on the profile as a small optimization
  -- so a consumer does not have to recompose the CurrentMarketRow just to
  -- learn which one_sided classification applied at write time (per RME-3
  -- §I.2). It equals the composed value at write time; NULL is a legitimate
  -- value (offering set empty or every price null — §I.2 rule).
  reference_date                          date                          NOT NULL,
  source_read_model_computation_version   integer                       NOT NULL,
  CONSTRAINT evidence_profiles_source_read_model_positive_check
    CHECK (source_read_model_computation_version >= 1),

  current_market_row_id                   uuid                          REFERENCES current_market_rows(current_market_row_id)
                                                                        ON UPDATE RESTRICT ON DELETE RESTRICT,
  bdl_availability_snapshot_id            uuid                          REFERENCES bdl_availability_snapshots(bdl_availability_snapshot_id)
                                                                        ON UPDATE RESTRICT ON DELETE RESTRICT,
  book_detail_one_sided                   evidence_one_sided_state,
  -- Admitted states for the three optional references:
  --   * current_market_row_id NULL     — §C.3 no market OR §C.8 postponed/canceled OR §C.9 unresolved mapping.
  --   * bdl_availability_snapshot_id NULL — availability itself unresolved OR §C.9 unresolved player.
  --   * book_detail_one_sided NULL      — offering set empty or every price null (§I.2 rule).
  -- All three MAY be non-NULL for classified profiles. Nothing legitimate is
  -- excluded.

  -- Timestamps (A1 §25 "calculation timestamp").
  computed_at                             timestamptz                   NOT NULL DEFAULT now(),
  created_at                              timestamptz                   NOT NULL DEFAULT now(),
  updated_at                              timestamptz                   NOT NULL DEFAULT now(),

  -- Version-aware UNIQUE (V1-5 recomputation-writer lesson).
  -- Same-version recompute UPSERTs onto this constraint (writer strategy
  -- documented in the header comment); a bump on either method_version or
  -- computation_version inserts a NEW row alongside prior versions and
  -- ON CONFLICT never fires.
  CONSTRAINT evidence_profiles_grain_version_unique
    UNIQUE (internal_game_id, internal_player_id, market_key, method_version, computation_version)
);

CREATE INDEX evidence_profiles_game_idx
  ON evidence_profiles (internal_game_id);
CREATE INDEX evidence_profiles_player_market_idx
  ON evidence_profiles (internal_player_id, market_key);
CREATE INDEX evidence_profiles_classification_idx
  ON evidence_profiles (classification);
CREATE INDEX evidence_profiles_direction_idx
  ON evidence_profiles (direction);
-- Ranking-time queries (Top Over / Top Under per §D.4 rule 1 + DR-20) will
-- ORDER BY |composite_score| DESC. This partial index accelerates that
-- for classified profiles only.
CREATE INDEX evidence_profiles_composite_score_idx
  ON evidence_profiles (composite_score)
  WHERE composite_score IS NOT NULL;
CREATE INDEX evidence_profiles_reference_date_idx
  ON evidence_profiles (reference_date DESC);
CREATE INDEX evidence_profiles_method_computation_version_idx
  ON evidence_profiles (method_version, computation_version);

COMMENT ON TABLE evidence_profiles IS
  'Versioned Evidence Profile representation per A1 §25 + EVIDENCE_PROFILE_METHOD_V1.md §D.1 / §H. Storage-only; the writer is V1-A1-3. Version-aware UNIQUE per the V1-5 recomputation-writer lesson.';
COMMENT ON COLUMN evidence_profiles.evaluated_line IS
  'A1 §25 "evaluated line". NULL admitted ONLY when classification = ''unavailable'' (see CHECK).';
COMMENT ON COLUMN evidence_profiles.direction IS
  '§B.7 direction. NULL for Mixed / Insufficient / Unavailable (see CHECK); over / under otherwise.';
COMMENT ON COLUMN evidence_profiles.composite_score IS
  'DR-20 requires ranking on the FULL-PRECISION stored value. DR-19 restricts DISPLAY to Research View only; storage is independent.';
COMMENT ON COLUMN evidence_profiles.method_version IS
  '§H / DR-24. Locked to ''evidence_method_v1'' at V1-A1-2 shipping; bumps require a new value alongside old rows (version-aware UNIQUE).';
COMMENT ON COLUMN evidence_profiles.computation_version IS
  'V1-5 pattern (V1_COMPUTATION_CONTRACT.md §2). Recomputes at the same formula bump this; new rows insert alongside prior-version rows.';
COMMENT ON COLUMN evidence_profiles.source_read_model_computation_version IS
  'The V1-5 read-model computation_version consulted at write time. Reproducibility per §H requires walking real_line_windows / historical_line_results at THIS version, not necessarily the latest.';
COMMENT ON COLUMN evidence_profiles.book_detail_one_sided IS
  'RME-3 snapshot at write time. NULL is a legitimate value (offering set empty or every price null per §I.2 derivation rule).';
COMMENT ON CONSTRAINT evidence_profiles_grain_version_unique
  ON evidence_profiles IS
  'Version-aware UNIQUE — prior-version rows are IMMUTABLE per §H. V1-5 recomputation-writer lesson: a version-blind UNIQUE with ON CONFLICT DO NOTHING silently preserved stale rows and had to be corrected by an additive migration; this schema forbids that shape by construction.';

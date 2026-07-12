-- ============================================================================
-- V1-2  Migration 19 : player_game_stats
--
-- Authority anchors:
--   BALLDONTLIE sub-spec §4 (natural source key `(provider, player_id, game_id)`)
--   BALLDONTLIE sub-spec §7 (minutes normalization; three canonical states)
--   BALLDONTLIE sub-spec §8 (eligibility)
--   BALLDONTLIE sub-spec §9 (counting-stat normalization; raw AND normalized retained)
--   BALLDONTLIE sub-spec §9A (core V1 stat mapping: pts, reb, ast, fg3m)
--   BALLDONTLIE sub-spec §11A (referential-integrity checks & reason codes)
--   BALLDONTLIE sub-spec §19.3 (canonical normalized player-game record)
--   Complete spec §11.2 player_game_stats
--   Ticket V1-2 hard invariants:
--       - "--" is NOT DNP and NOT coerced to zero
--       - Null counting stat on eligible played row normalizes to zero;
--         null on non-played rows does NOT
--       - Raw source evidence is traceable from every derived row
--
-- Load-bearing invariants:
--   * UNIQUE (provider, provider_player_id, provider_game_id) — idempotent
--     upserts per BDL §6.3.
--   * raw_stats stores the exact BDL fields as observed. normalized_stats
--     stores the null-to-zero output only when eligibility_state = 'eligible'.
--     Non-eligible rows leave normalized_stats null on nulls.
--   * raw_minutes retained as text (may be `"--"`); parsed_minutes numeric
--     is null when minutes_status <> 'played' AND <> 'dnp'.
--   * source_hash is a canonical hash of the fields that materially affect
--     computation (see BDL §12C.5). Correction detection compares hashes.
-- ============================================================================

CREATE TABLE player_game_stats (
  player_game_stat_id       uuid                             PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Provider source key (BDL §4).
  provider                  provider_kind                    NOT NULL,
  provider_player_id        text                             NOT NULL,
  provider_game_id          text                             NOT NULL,

  -- Internal identities. NULL when unresolved / quarantined.
  internal_player_id        uuid                             REFERENCES players(internal_player_id)
                                                             ON UPDATE RESTRICT ON DELETE RESTRICT,
  internal_game_id          uuid                             REFERENCES games(internal_game_id)
                                                             ON UPDATE RESTRICT ON DELETE RESTRICT,

  -- Team context per BDL §11A. Raw provider team ID retained; derived
  -- internal team assignment lives here to accelerate eligibility checks.
  provider_team_id          text,
  internal_player_team_id   uuid                             REFERENCES teams(internal_team_id)
                                                             ON UPDATE RESTRICT ON DELETE RESTRICT,
  internal_opponent_team_id uuid                             REFERENCES teams(internal_team_id)
                                                             ON UPDATE RESTRICT ON DELETE RESTRICT,

  is_home                   boolean,

  season                    smallint,
  season_type               smallint,
  CHECK (season IS NULL OR (season BETWEEN 1997 AND 2100)),
  CHECK (season_type IS NULL OR season_type IN (2, 3)),

  -- Minutes. Raw exactly as observed; parsed only when numeric.
  raw_minutes               text,
  parsed_minutes            numeric(6,2),
  minutes_status            bdl_minutes_status               NOT NULL,

  -- If minutes are numeric, both raw_minutes and parsed_minutes reflect that
  -- number. If minutes_status = 'played' then parsed_minutes MUST be > 0.
  -- If minutes_status = 'dnp' then parsed_minutes MUST be exactly 0.
  CHECK ( (minutes_status = 'played'                 AND parsed_minutes IS NOT NULL AND parsed_minutes > 0)
       OR (minutes_status = 'dnp'                    AND parsed_minutes IS NOT NULL AND parsed_minutes = 0)
       OR (minutes_status = 'unresolved_non_numeric' AND parsed_minutes IS NULL) ),

  -- Raw BDL stats retained verbatim (JSONB includes null entries as SQL
  -- json null so the raw observation is byte-preserved).
  raw_stats                 jsonb                            NOT NULL,

  -- Normalized stats. Populated with null-to-zero for the fields listed in
  -- BDL §9 only when eligibility_state = 'eligible'. Non-played rows never
  -- receive played-row normalization (hard invariant, BDL §9 last rule).
  normalized_stats          jsonb                            NOT NULL DEFAULT '{}'::jsonb,

  -- Canonical hash of source-relevant fields (BDL §12C.4). Changes detected
  -- by comparing this hash against the prior row's hash.
  source_hash               text                             NOT NULL,

  -- Eligibility & referential-integrity.
  eligibility_state         player_stat_eligibility          NOT NULL DEFAULT 'live_or_non_final',
  quarantine_reason         player_stat_quarantine_reason,
  CHECK ( (eligibility_state = 'quarantined' AND quarantine_reason IS NOT NULL)
       OR (eligibility_state <> 'quarantined' AND quarantine_reason IS NULL) ),

  -- Correction ledger.
  first_observed_at         timestamptz                      NOT NULL DEFAULT now(),
  last_verified_at          timestamptz                      NOT NULL DEFAULT now(),
  last_material_change_at   timestamptz,

  -- Raw response traceability. Refers to the most recent raw response that
  -- produced this row. Full history lives in player_game_stat_history.
  latest_raw_response_id    uuid                             REFERENCES bdl_raw_responses(raw_response_id)
                                                             ON UPDATE RESTRICT ON DELETE RESTRICT,
  latest_ingestion_run_id   uuid                             REFERENCES bdl_ingestion_runs(bdl_ingestion_run_id)
                                                             ON UPDATE RESTRICT ON DELETE RESTRICT,

  normalization_version     integer                          NOT NULL DEFAULT 1,

  created_at                timestamptz                      NOT NULL DEFAULT now(),
  updated_at                timestamptz                      NOT NULL DEFAULT now(),

  -- Load-bearing per BDL §6.3.
  UNIQUE (provider, provider_player_id, provider_game_id)
);

CREATE INDEX player_game_stats_internal_player_idx
  ON player_game_stats (internal_player_id);
CREATE INDEX player_game_stats_internal_game_idx
  ON player_game_stats (internal_game_id);
CREATE INDEX player_game_stats_eligibility_idx
  ON player_game_stats (eligibility_state);
CREATE INDEX player_game_stats_season_idx
  ON player_game_stats (season, season_type)
  WHERE season IS NOT NULL;
CREATE INDEX player_game_stats_minutes_status_idx
  ON player_game_stats (minutes_status);

COMMENT ON TABLE  player_game_stats
  IS 'Canonical normalized BDL player-game record. UNIQUE (provider, provider_player_id, provider_game_id). See BDL §4, §19.3.';
COMMENT ON COLUMN player_game_stats.raw_minutes
  IS 'Raw minutes text preserved verbatim. May be "--" (BDL §7.1). Never coerced.';
COMMENT ON COLUMN player_game_stats.normalized_stats
  IS 'Null-to-zero only for eligible played rows (BDL §9). Non-played rows never receive played-row normalization.';
COMMENT ON COLUMN player_game_stats.source_hash
  IS 'Canonical hash of source-relevant fields. Correction detection compares hashes. See BDL §12C.4.';

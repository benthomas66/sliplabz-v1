-- ============================================================================
-- V1-2  Migration 16 : BDL team snapshots
--
-- Authority anchors:
--   BALLDONTLIE sub-spec §12B.10 (team refresh — provider metadata mutation
--     stores a snapshot; SlipLabz retains change history / auditable prior)
--   BALLDONTLIE sub-spec §12B.7 (expansion metadata: empty city, null
--     conference for Portland Fire id 31, Toronto Tempo id 30)
--   BALLDONTLIE sub-spec §12B.5 (provider_team_id is the only globally
--     unique team identifier; full_name and abbreviation are NOT unique)
--   Complete spec §11.1 provider_teams / §9.7 team registry
--
-- Load-bearing invariants:
--   * One snapshot row per (ingestion_run_id, provider_team_id). A single
--     run's teams response supplies exactly one snapshot per team.
--   * A team may appear across many runs with the same content_hash;
--     material metadata changes are detected via content_hash comparison,
--     not by rewriting historical snapshots.
--   * NO uniqueness on raw_full_name / raw_abbreviation (BDL §12B.5).
--   * raw_city defaults empty; raw_conference is nullable (BDL §12B.7).
-- ============================================================================

CREATE TABLE bdl_team_snapshots (
  bdl_team_snapshot_id   uuid          PRIMARY KEY DEFAULT gen_random_uuid(),

  bdl_ingestion_run_id   uuid          NOT NULL
                                       REFERENCES bdl_ingestion_runs(bdl_ingestion_run_id)
                                       ON UPDATE RESTRICT ON DELETE RESTRICT,

  raw_response_id        uuid          REFERENCES bdl_raw_responses(raw_response_id)
                                       ON UPDATE RESTRICT ON DELETE RESTRICT,

  -- BDL provider_team_id. Stored as text to align with provider_teams.
  provider_team_id       text          NOT NULL,

  -- Raw provider fields per §12B.10.
  raw_full_name          text          NOT NULL DEFAULT '',
  raw_name               text          NOT NULL DEFAULT '',
  raw_abbreviation       text          NOT NULL DEFAULT '',
  raw_city               text          NOT NULL DEFAULT '',
  raw_conference         text,

  -- Application classification (BDL §12B.4).
  classification         team_classification NOT NULL DEFAULT 'unknown',

  -- Content hash of the identifying raw fields. Enables cheap material-change
  -- detection when compared to the previous latest snapshot.
  content_hash           text          NOT NULL,

  -- Retrieval and rolling seen timestamps.
  retrieved_at           timestamptz   NOT NULL DEFAULT now(),
  first_seen_at          timestamptz   NOT NULL DEFAULT now(),
  last_seen_at           timestamptz   NOT NULL DEFAULT now(),
  observed_changed_at    timestamptz,

  -- Full raw provider team object (jsonb) for audit inspection.
  raw_payload            jsonb         NOT NULL,

  created_at             timestamptz   NOT NULL DEFAULT now(),

  UNIQUE (bdl_ingestion_run_id, provider_team_id)
);

CREATE INDEX bdl_team_snapshots_provider_team_idx
  ON bdl_team_snapshots (provider_team_id);
CREATE INDEX bdl_team_snapshots_content_hash_idx
  ON bdl_team_snapshots (content_hash);
CREATE INDEX bdl_team_snapshots_run_idx
  ON bdl_team_snapshots (bdl_ingestion_run_id);
CREATE INDEX bdl_team_snapshots_retrieved_idx
  ON bdl_team_snapshots (retrieved_at DESC);

COMMENT ON TABLE  bdl_team_snapshots
  IS 'Per-run BDL team registry snapshots. Immutable per (run, provider_team_id). See BDL §12B.10.';
COMMENT ON COLUMN bdl_team_snapshots.raw_conference
  IS 'NULL preserved verbatim for expansion / historical / national / placeholder teams (BDL §12B.7).';

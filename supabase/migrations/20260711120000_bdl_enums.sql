-- ============================================================================
-- V1-2  Migration 12 : BDL ingestion enums
--
-- Authority anchors:
--   BALLDONTLIE sub-spec §7 (minutes states)
--   BALLDONTLIE sub-spec §8 (eligibility)
--   BALLDONTLIE sub-spec §10 (game-state authority)
--   BALLDONTLIE sub-spec §11A (referential-integrity reason codes)
--   BALLDONTLIE sub-spec §19 (ingestion-run completion state)
--   BALLDONTLIE sub-spec §20 (availability interpretation states)
--   Complete spec §9.1-9.11 (BDL ingestion requirements)
--
-- Forward-fix strategy: enum values are additive only; never DROP or RENAME.
-- Additions land in a new migration that ships with matching code.
-- ============================================================================

-- Ingestion endpoint identity. One value per BDL WNBA endpoint the ticket
-- authorizes. Optional endpoints (advanced stats, standings) are not V1-2.
CREATE TYPE bdl_endpoint AS ENUM (
  'players',
  'active_players',
  'teams',
  'games',
  'player_stats',
  'player_injuries'
);

-- Ingestion-run lifecycle state per BDL §19.1. `complete` alone is
-- allowed to advance an import watermark; every other terminal state
-- leaves watermarks untouched (hard invariant).
CREATE TYPE bdl_run_state AS ENUM (
  'running',
  'complete',
  'partial_pagination',
  'failed_transport',
  'failed_authentication_or_access',
  'failed_invalid_request',
  'failed_schema',
  'failed_parse'
);

-- Minutes state taxonomy from BDL §7.2. `"--"` must never coerce to
-- `dnp` and must never coerce to a numeric zero. This enum is the only
-- authoritative type for interpreting the raw minutes string.
CREATE TYPE bdl_minutes_status AS ENUM (
  'played',                    -- parsed numeric > 0
  'dnp',                       -- parsed numeric exactly 0
  'unresolved_non_numeric'     -- `"--"`, null, empty, or unknown format
);

-- Player-stat row eligibility per BDL §8 and §11A. A row is `eligible`
-- only when the joined game is `final` AND minutes are `played` AND all
-- referential-integrity checks pass. Non-participation (`dnp`) and
-- unresolved-minutes rows carry their own eligibility label so downstream
-- windows never blend them with played rows.
CREATE TYPE player_stat_eligibility AS ENUM (
  'eligible',
  'non_participation',          -- dnp minutes; excluded from played windows
  'unresolved_minutes',         -- `"--"`, null, empty
  'quarantined',                -- see quarantine_reason enum
  'live_or_non_final'           -- joined game not yet `final`
);

-- Referential-integrity quarantine reasons per BDL §11A. Matches the
-- approved reason-code list exactly; no code guesses a repair.
CREATE TYPE player_stat_quarantine_reason AS ENUM (
  'missing_game',
  'missing_player',
  'team_not_in_game',
  'season_mismatch',
  'date_mismatch',
  'duplicate_source_key',
  'unsupported_competition_team',
  'unresolved_minutes',
  'unknown_game_status'
);

-- Availability interpretation state per BDL §20. `not_returned_latest_complete_snapshot`
-- is deliberately distinct from `currently_reported`; absence is its own
-- lifecycle state and never presented as "healthy".
CREATE TYPE availability_interpretation_state AS ENUM (
  'currently_reported',
  'not_returned_latest_complete_snapshot',
  'stale_feed',
  'unresolved_player',
  'source_unavailable'
);

-- Reconciliation-schedule follow-up kinds per BDL §12C.4 / complete spec §9.9.
-- `first_post_final` runs the first pull after `final`; `t_plus_2h` runs the
-- t+2h correction check; `next_day` runs the day-later check; `season_sweep`
-- is the weekly correction sweep.
CREATE TYPE post_final_reconciliation_kind AS ENUM (
  'first_post_final',
  't_plus_2h',
  'next_day',
  'season_sweep'
);

-- Recomputation-invalidation entity taxonomy. Every material stat correction
-- appends one invalidation row per affected downstream entity so V1-5 can
-- consume the queue without duplicating detection logic.
CREATE TYPE invalidation_entity_kind AS ENUM (
  'player_game_stat',
  'internal_player',
  'internal_game'
);

-- Recomputation-invalidation trigger reasons. `material_stat_change` is the
-- BDL §12C.5 material correction reason; other reasons cover status and
-- roster transitions that later tickets recompute against.
CREATE TYPE invalidation_reason AS ENUM (
  'material_stat_change',
  'minutes_state_change',
  'game_status_transition_to_final',
  'game_status_transition_from_final',
  'game_status_change_other',
  'roster_team_change',
  'availability_state_change'
);

-- ============================================================================
-- V1-1  Migration 00 : shared enums for the canonical identity layer
--
-- Authority anchors:
--   Complete spec §7.1 (internal identity)
--   Complete spec §7.2 (event mapping)
--   Complete spec §7.3 (player mapping)
--   Complete spec §11.1 (core identity storage)
--   BALLDONTLIE sub-spec §10 (game status)
--   BALLDONTLIE sub-spec §12B.4 (team classification)
--   BALLDONTLIE sub-spec §11A (referential-integrity reason codes)
--   BALLDONTLIE sub-spec §20 (availability interpretation states)
--   Odds API sub-spec §6, §7 (event lifecycle)
--
-- Forward-fix strategy: enum values are additive. Renames or removals must
-- ship as (a) new value additions, (b) code cutover, (c) later drop in a
-- follow-up migration; never destructive in a single step.
-- ============================================================================

-- Providers whose identities we bridge to internal IDs.
-- Add via ALTER TYPE ... ADD VALUE only; never DROP or RENAME.
CREATE TYPE provider_kind AS ENUM (
  'balldontlie',
  'odds_api'
);

-- Mapping / review lifecycle. Authority-required minimum: unresolved,
-- pending_review, approved, quarantined. `superseded` marks a prior approval
-- replaced by a newer approved mapping; the old row is retained in
-- mapping_history and marked superseded here for query hygiene.
CREATE TYPE mapping_state AS ENUM (
  'unresolved',
  'pending_review',
  'approved',
  'quarantined',
  'superseded'
);

-- Team classification per BDL §12B.4. Every value seen in the audited
-- 33-row registry (§12B.3) maps to exactly one classification here.
CREATE TYPE team_classification AS ENUM (
  'current_franchise',
  'historical_franchise',
  'all_star_or_exhibition',
  'national_team',
  'placeholder',
  'unknown'
);

-- Canonical game status per BDL §10. Provider clock and period fields do
-- not independently establish finality; ingestion in V1-2 will map BDL's
-- provider `status` string to exactly one of these.
CREATE TYPE game_status AS ENUM (
  'scheduled',
  'live',
  'final',
  'postponed',
  'canceled',
  'unresolved'
);

-- Player lifecycle status. Distinguishes historical identity from current-
-- roster presence. `not_seen_active` is used when a player who was
-- previously seen in the active-player endpoint no longer appears in a
-- completed active-player snapshot (BDL §12A.7). Never derived from a
-- failed or partial pull.
CREATE TYPE player_status AS ENUM (
  'active_confirmed',
  'not_seen_active',
  'historical_identity',
  'unresolved'
);

-- Event-reconciliation queue reasons (Odds §6, complete spec §7.2).
CREATE TYPE event_queue_reason AS ENUM (
  'unmatched',
  'ambiguous_multiple_candidates',
  'unresolved_provider_team',
  'time_window_exceeded',
  'ordered_teams_disagree',
  'self_match_invalid'
);

-- Player-reconciliation queue reasons (BDL §11A, §12A.6; Odds §10.11).
CREATE TYPE player_queue_reason AS ENUM (
  'unmatched',
  'ambiguous_multiple_candidates',
  'ambiguous_alias_conflict',
  'missing_event_context',
  'missing_team_context',
  'normalized_name_only'
);

-- Reconciliation-queue resolution status.
CREATE TYPE queue_resolution AS ENUM (
  'open',
  'approved',
  'quarantined',
  'withdrawn'
);

-- Mapping-history action taxonomy.
CREATE TYPE mapping_action AS ENUM (
  'proposed',
  'approved',
  'quarantined',
  'superseded',
  'withdrawn',
  'reopened',
  'alias_added',
  'alias_deactivated'
);

-- Alias scope + type. Aliases are always tied to a scope (which provider
-- data source the alias applies to) so a Team-alias approved for BDL
-- matching cannot silently start matching Odds API strings.
CREATE TYPE alias_scope_kind AS ENUM (
  'internal',            -- reviewed display alias, no provider tie
  'balldontlie',
  'odds_api'
);

CREATE TYPE alias_type AS ENUM (
  'display',             -- customer-facing preferred display string
  'match_candidate'      -- used by reconciliation to broaden candidate search
);

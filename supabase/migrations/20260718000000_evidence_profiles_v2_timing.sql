-- ============================================================================
-- V1-A2-1  Migration : evidence_profiles v2 timing columns
--
-- Ticket:      V1-A2-1 (Evidence method v2 freshness semantics + timing authority)
-- Authority:   docs/product/EVIDENCE_PROFILE_METHOD_V2.md §4 (timing architecture)
--              docs/product/EVIDENCE_PROFILE_METHOD_V1.md — UNCHANGED, IMMUTABLE
-- Owner rulings honoured:
--   R4  timing architecture — batch evaluation_reference_time captured once;
--       persist observed_at (via existing immutable audit chain), the
--       reference time, and the profile_generated_at; classification-age
--       and serve-time boundaries are DISTINCT concepts.
--   R7  additive schema; nullable columns; structural method-version
--       enforcement via CHECK; no v1 row backfill or mutation.
--
-- What this migration does:
--   1. Adds two nullable timestamptz columns to `evidence_profiles`:
--        * evaluation_reference_time
--        * profile_generated_at
--   2. Adds a CHECK constraint enforcing:
--        * method_version = 'evidence_method_v1' → BOTH columns MUST be NULL
--        * method_version = 'evidence_method_v2' → BOTH columns MUST be NON-NULL
--        * any other method_version → REJECTED (fail loudly).
--
-- What this migration does NOT do:
--   * It does NOT backfill any evidence_method_v1 row. Every v1 row already
--     satisfies the new CHECK because both new columns default to NULL and
--     the v1 branch of the CHECK requires both to be NULL. The migration
--     is byte-safe for every extant v1 row.
--   * It does NOT change any existing column, index, or constraint.
--   * It does NOT alter the evidence_profiles UNIQUE grain
--     (internal_game_id, internal_player_id, market_key, method_version,
--     computation_version). A v2 row for the SAME (game, player, market)
--     grain as a v1 row inserts against a DIFFERENT method_version and
--     therefore hits the version-aware UNIQUE cleanly; both rows coexist.
--   * It does NOT set or default any numeric freshness threshold. Boundary
--     values are OWNER-GATED and deferred to ticket D-A1.
--   * It does NOT push to hosted. The hosted push accompanies the v2
--     implementation ticket (V1-A2-2), not this authority+schema ticket.
--
-- Reader-dispatch-by-method_version contract (documented here so the v2
-- implementer cannot miss it):
--   Callers reading an `evidence_profiles` row MUST dispatch on
--   `method_version`. A `method_version = 'evidence_method_v1'` row carries
--   NO timing columns — a reader that consumes them will get NULL. A
--   `method_version = 'evidence_method_v2'` row carries BOTH; the CHECK
--   guarantees non-null. A future v3 method version requires its own
--   extension of this CHECK; until then a row with an unknown
--   method_version is rejected outright by this constraint.
--
-- Fail-loud rule (structural, enforced by this CHECK):
--   A v2 row inserted with either timing column NULL is rejected. There is
--   no "graceful fallback" that lets an incomplete v2 row persist and be
--   read later as "unknown freshness"; the write side must fill both, or
--   the row does not persist at all. This is the shape the V1-A2-2 writer
--   must satisfy.
--
-- CHECK reachability (proven in the reachability fixtures ticket delivers):
--   * v1 rows with both columns NULL: legitimate, admitted.
--   * v1 rows with EITHER column non-null: illegitimate, rejected.
--   * v2 rows with both columns non-null: legitimate, admitted.
--   * v2 rows with EITHER column NULL: illegitimate, rejected.
--   * Rows with any other method_version: illegitimate under this migration,
--     rejected — a future v3 requires a superseding migration.
-- ============================================================================

ALTER TABLE evidence_profiles
  ADD COLUMN evaluation_reference_time  timestamptz  NULL,
  ADD COLUMN profile_generated_at       timestamptz  NULL;

COMMENT ON COLUMN evidence_profiles.evaluation_reference_time IS
  'V2-only. The single batch-scoped evaluation reference time (owner R4). '
  'Freshness classification age = (evaluation_reference_time - line_observed_at). '
  'NULL for evidence_method_v1 rows; NON-NULL and enforced by CHECK for evidence_method_v2 rows. '
  'See EVIDENCE_PROFILE_METHOD_V2.md §4.';

COMMENT ON COLUMN evidence_profiles.profile_generated_at IS
  'V2-only. Wall-clock timestamp at which THIS specific profile row was '
  'produced by the writer (post-classification, pre-COMMIT). Distinct from '
  'evaluation_reference_time (which is the shared batch reference) and from '
  'created_at (surrogate DB default). Freshness display age at read time = '
  '(serve_now - line_observed_at) computed at serve boundary, using the '
  'immutable snapshot references, NOT this column. This column is retained '
  'for audit reproducibility per §H. NULL for v1 rows; NON-NULL and enforced '
  'by CHECK for v2 rows. See EVIDENCE_PROFILE_METHOD_V2.md §4.';

-- Structural method-version enforcement (owner R7).
-- Using CASE over method_version rather than an OR chain so that any unknown
-- method_version value fails loudly by hitting the ELSE FALSE arm.
ALTER TABLE evidence_profiles
  ADD CONSTRAINT evidence_profiles_v2_timing_check
  CHECK (
    CASE method_version
      WHEN 'evidence_method_v1' THEN
        evaluation_reference_time IS NULL
        AND profile_generated_at IS NULL
      WHEN 'evidence_method_v2' THEN
        evaluation_reference_time IS NOT NULL
        AND profile_generated_at IS NOT NULL
      ELSE FALSE
    END
  );

COMMENT ON CONSTRAINT evidence_profiles_v2_timing_check ON evidence_profiles IS
  'V1-A2-1 structural method-version enforcement (owner R7). Reader-dispatch-by-'
  'method_version is the contract; this constraint makes the shape of each '
  'version STRUCTURAL rather than convention. A future v3 method version '
  'requires a superseding migration that extends this CASE.';

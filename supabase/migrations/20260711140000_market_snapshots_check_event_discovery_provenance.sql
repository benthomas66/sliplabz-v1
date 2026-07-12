-- ============================================================================
-- V1-4  Migration 34 : additive CHECK — event_discovery rows must be self_observed
--
-- Authority:
--   V1-4 governor review obligation: "additive provenance tightening — ship a
--   one-line additive migration adding a CHECK to market_snapshots constraining
--   event_discovery rows' provenance to self_observed, closing the one
--   unconstrained request_kind/provenance pairing found at review. Additive
--   ALTER TABLE ADD CONSTRAINT only; do not modify the V1-3 migration file."
--   Odds sub-spec §7 (event discovery is a self-observed request kind).
--   Complete spec §11.4 (current/historical isolation is structural).
--
-- Load-bearing invariant:
--   * The V1-3 CHECK set already forces (current_poll → self_observed) and
--     (historical_query → backfilled_historical). It left event_discovery
--     unconstrained: event_discovery + backfilled_historical was structurally
--     nonsensical but not rejected. This migration closes that gap.
--
-- Forward-fix strategy: pure ADD CONSTRAINT. If the constraint ever needs to
-- be relaxed for a legitimate V1-4b use case, that requires a governance
-- decision and a follow-up migration; this ticket does not open that door.
-- ============================================================================

ALTER TABLE market_snapshots
  ADD CONSTRAINT market_snapshots_check_event_discovery_provenance
  CHECK ( request_kind <> 'event_discovery' OR provenance = 'self_observed' );

-- V1-OP-8b §0.4 — durable discovery classification results.
--
-- WHY THIS EXISTS. The §0.4 discovery sample resolves each unmapped game to a
-- provider event id, but that identifier lived only in memory: the run printed
-- classifications, retained no raw payload, and wrote no row carrying the id.
-- Authoring a repair-tranche manifest therefore required RE-PROBING at 1 credit
-- per boundary, every time. This table closes the identifier side of GAP-43.
--
-- WHAT THIS IS NOT. It is NOT a provider mapping. `provider_games` +
-- `event_reconciliation_queue`, written by `seed/orchestrator/
-- eventResolutionForSeed.ts`, remain the sole governed owners of odds_api
-- mapping creation and approval; that path also writes `actual_start_utc`,
-- which the repair must never disturb. A row here confers no mapping state, no
-- approval, and no identity resolution — it is an observation record of what a
-- specific paid discovery call returned, used only to author manifests.
--
-- The two-field invariant is structural here: this table has no start-time
-- column to write, so the capture path cannot move a close boundary.
--
-- Non-sensitive by construction: provider event ids, team names, and commence
-- times. No offering values, no odds, no paid market content.

CREATE TABLE discovery_results (
  discovery_result_id     uuid          PRIMARY KEY DEFAULT gen_random_uuid(),

  -- WHICH paid call produced this observation (billing + provenance join).
  oddsapi_ingestion_run_id uuid         NOT NULL
    REFERENCES oddsapi_ingestion_runs (oddsapi_ingestion_run_id),

  -- The game this observation is ABOUT. Server-side-only identity.
  internal_game_id        uuid          NOT NULL
    REFERENCES games (internal_game_id),

  -- The close boundary actually probed (GAP-42). Recorded so a later reader can
  -- tell WHEN the provider was observed, without recomputing it.
  probe_at                timestamptz   NOT NULL,

  -- Classification outcome. `b_discovery_recoverable` carries an event id;
  -- `c_unrecoverable` never does — enforced below so the pair cannot disagree.
  population              text          NOT NULL
    CONSTRAINT discovery_results_population_check
      CHECK (population IN ('b_discovery_recoverable', 'c_unrecoverable')),

  -- THE DELIVERABLE: the provider's event id for a (b) match.
  matched_event_id        text,

  -- How the team names matched (exact | token_containment | disambiguated).
  match_kind              text,

  -- The provider's own commence_time for the matched event, as returned.
  provider_commence_time  timestamptz,

  -- Human-readable classification detail, verbatim from the classifier.
  detail                  text          NOT NULL,

  created_at              timestamptz   NOT NULL DEFAULT now(),

  -- A (b) row MUST carry an event id; a (c) row MUST NOT. This is what makes
  -- "read the event ids back" a total operation rather than a hopeful one.
  CONSTRAINT discovery_results_population_event_check CHECK (
    (population = 'b_discovery_recoverable' AND matched_event_id IS NOT NULL)
    OR
    (population = 'c_unrecoverable'         AND matched_event_id IS NULL)
  ),

  -- One observation per (game, probed boundary): re-probing the same boundary
  -- updates rather than duplicates, so manifest authoring reads a single row.
  CONSTRAINT discovery_results_game_probe_unique UNIQUE (internal_game_id, probe_at)
);

CREATE INDEX discovery_results_game_idx       ON discovery_results (internal_game_id);
CREATE INDEX discovery_results_population_idx ON discovery_results (population);

COMMENT ON TABLE discovery_results IS
  'V1-OP-8b §0.4. Durable record of what a paid discovery call observed for one unmapped game at one close boundary. Closes the identifier side of GAP-43: repair-tranche manifests read matched_event_id from here instead of re-probing at 1cr per boundary. NOT a provider mapping — eventResolutionForSeed.ts remains the sole governed owner of provider_games/event_reconciliation_queue, and this table deliberately has no start-time column, so the capture path cannot disturb a close boundary.';
COMMENT ON COLUMN discovery_results.matched_event_id IS
  'The provider event id for a (b) match; NULL for (c), enforced by discovery_results_population_event_check. Read by tranche-manifest authoring.';
COMMENT ON COLUMN discovery_results.probe_at IS
  'The close boundary probed (GAP-42: evaluateCloseBoundary, NOT end-of-UTC-day). Part of the uniqueness key so a re-probe of the same boundary updates in place.';
COMMENT ON COLUMN discovery_results.internal_game_id IS
  'Server-side-only canonical game identity (Amendment 21). Never a browser projection field.';

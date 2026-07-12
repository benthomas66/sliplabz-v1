-- ============================================================================
-- V1-3  Migration 32 : market offering raw rows
--
-- Authority anchors:
--   Odds API sub-spec §10.5 rule 2 (preserve all raw row references)
--   Odds API sub-spec §15.3 (no source row is silently discarded)
--   Complete spec §11.4 market_offerings.source_row_references
--   Ticket V1-3 hard invariants:
--     - Raw snapshots retained BEFORE duplicate collapse;
--     - All provider strings, prices, points, and timestamps remain auditable
--       verbatim.
--
-- Load-bearing invariants:
--   * One row per raw outcome observed in the snapshot's `outcomes` array,
--     BEFORE duplicate collapse.
--   * A canonical `market_offerings` row references this table via the
--     canonical join (many raw rows → one canonical offering when duplicates
--     collapse).
--   * `raw_payload_reference` retains the byte-identical raw outcome as jsonb.
--   * `raw_row_index` records the position within the snapshot's raw
--     outcomes array so ordering is auditable.
--   * Immutable in intent: no `updated_at`.
-- ============================================================================

CREATE TABLE market_offering_raw_rows (
  market_offering_raw_row_id   uuid                        PRIMARY KEY DEFAULT gen_random_uuid(),

  market_snapshot_id           uuid                        NOT NULL
                                                           REFERENCES market_snapshots(market_snapshot_id)
                                                           ON UPDATE RESTRICT ON DELETE RESTRICT,

  -- Ordering position in the raw `outcomes` array. Preserved so an operator
  -- can walk back to a specific raw row by index without heuristic search.
  raw_row_index                integer                     NOT NULL,
  CHECK (raw_row_index >= 0),

  raw_name                     text                        NOT NULL DEFAULT '',
  raw_description              text                        NOT NULL DEFAULT '',
  raw_price                    integer,
  raw_point                    numeric(10,2),
  raw_multiplier               numeric(6,3),

  -- Full raw outcome object per §15.3. Preserved as-is; NEVER edited.
  raw_payload                  jsonb                       NOT NULL,

  -- The canonical offering this raw row collapsed into. NULL when the
  -- offering is unresolved / quarantined and no canonical row was produced.
  canonical_offering_id        uuid                        REFERENCES market_offerings(market_offering_id)
                                                           ON UPDATE RESTRICT ON DELETE RESTRICT,

  -- Explicit label so the raw row can be classified without joining. Values:
  --   'contributed'  — the row contributed to a canonical offering (may be
  --                    part of an exact-duplicate group);
  --   'duplicate'    — the row was collapsed as an exact duplicate;
  --   'quarantined'  — the row was excluded from any canonical offering
  --                    because it participated in a conflict or missed a
  --                    required field.
  disposition                  text                        NOT NULL,
  CHECK (disposition IN ('contributed', 'duplicate', 'quarantined')),

  observed_at                  timestamptz                 NOT NULL DEFAULT now(),

  created_at                   timestamptz                 NOT NULL DEFAULT now(),

  UNIQUE (market_snapshot_id, raw_row_index)
);

CREATE INDEX market_offering_raw_rows_snapshot_idx
  ON market_offering_raw_rows (market_snapshot_id);
CREATE INDEX market_offering_raw_rows_canonical_idx
  ON market_offering_raw_rows (canonical_offering_id)
  WHERE canonical_offering_id IS NOT NULL;
CREATE INDEX market_offering_raw_rows_disposition_idx
  ON market_offering_raw_rows (disposition);

COMMENT ON TABLE  market_offering_raw_rows
  IS 'One row per raw outcome BEFORE duplicate collapse. Immutable in intent. See Odds §10.5, §15.3.';
COMMENT ON COLUMN market_offering_raw_rows.disposition
  IS 'contributed | duplicate | quarantined — governs walk-back semantics per Odds §10.5.';

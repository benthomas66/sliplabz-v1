-- ============================================================================
-- V1-A1-2  Migration 49 : evidence-profile enums
--
-- Authority anchors (all references are to docs/product/EVIDENCE_PROFILE_METHOD_V1.md
-- OWNER-APPROVED v1.0 unless otherwise stated):
--   * §D.1 + GD-15 (fixed A1 §10 seven-value taxonomy).
--   * §B.7 (direction: over / under; null when Mixed / Insufficient /
--     Unavailable).
--   * §E.1 (closed reason-code vocabulary — every code below is a table row
--     in §E.1; no additions, no omissions).
--   * §E.2 + DR-26 (canonical stored reason category ordering).
--   * §C.2 / §C.3 / §C.5 / §C.6 / §C.7 (the quality-cap conditions this ticket
--     stores; the *behaviour* of capping is V1-A1-3's).
--   * §A.4 RME-3 (BookDetailResult.one_sided — 'over_only' | 'under_only' |
--     'neither' | null).
--   * DR-27 / §E.1 ABNORMAL_DISPERSION row / §I.3 clause (2) — the reason
--     code is RESERVED in the closed vocabulary but has NO ACTIVE TRIGGER in
--     `evidence_method_v1`. It appears in the enum below with an explicit
--     "RESERVED — NOT EMITTED IN `evidence_method_v1`" comment on the type so
--     any future writer that would emit it fails a code review or trips the
--     methodology halt condition in §I.3 (4).
--
-- Storage-only ticket — see V1-A1 §31 (V1-A1-2 scope: "Add versioned storage
-- and audit references"). Every enum value below is a *label* the writer
-- (V1-A1-3) will store; NO enum encodes *behaviour* (a scoring function, a
-- threshold, or a computation rule). §C conditions appear here only as the
-- CAP-REASON labels the profile row will carry — the trigger conditions
-- remain V1-A1-3's responsibility per §D.1 + §C.
-- ============================================================================

-- Classification (§D.1, GD-15). The SEVEN values are the A1 §10 taxonomy;
-- extra or missing values violate GD-15 and A1 §12 "Named classifications
-- are the primary user-facing output."
CREATE TYPE evidence_classification AS ENUM (
  'strong_over_evidence',
  'moderate_over_evidence',
  'mixed_evidence',
  'moderate_under_evidence',
  'strong_under_evidence',
  'insufficient_evidence',
  'unavailable'
);
COMMENT ON TYPE evidence_classification IS
  'A1 §10 / GD-15 taxonomy (locked). Every stored profile carries exactly one value from this set. See EVIDENCE_PROFILE_METHOD_V1.md §D.1.';

-- Direction (§B.7). Over-signed convention: Over is +1, Under is -1. Direction
-- is NULL for Mixed / Insufficient / Unavailable — those profiles do not
-- claim a direction. NULL is not an enum value; the profile row's direction
-- column is nullable and a CHECK enforces the classification-direction pairing.
CREATE TYPE evidence_direction AS ENUM (
  'over',
  'under'
);
COMMENT ON TYPE evidence_direction IS
  'B.7 direction: over-signed. NULL on the profile row for Mixed / Insufficient / Unavailable.';

-- Evaluated-source kind (A1 §25 "evaluated source type and identifier"; §17
-- Compare Your Line; §13.3 Notable Line Discrepancies). Enumerates the
-- kinds of evaluated line a persisted profile row may carry so a consumer
-- can join to the right source table (or none).
--   * 'sportsbook_consensus' — evaluated at CurrentMarketRow.line_consensus.
--     Default kind for a Discover-ranking profile.
--   * 'sportsbook_specific' — evaluated at a specific eligible sportsbook's
--     point (see §13.3 "selected sportsbook").
--   * 'pickem' — evaluated at a pick'em source's point (§13.3). Structurally
--     separate from sportsbook consensus (§A.3 pick'em isolation).
--   * 'user_entered' — evaluated at a user-entered line (§17 Compare Your
--     Line). Persistence of user-entered variants is a V1-A1-3 writer policy
--     decision — see governor-decision flag in the report.
CREATE TYPE evidence_evaluated_source_kind AS ENUM (
  'sportsbook_consensus',
  'sportsbook_specific',
  'pickem',
  'user_entered'
);
COMMENT ON TYPE evidence_evaluated_source_kind IS
  'A1 §25 evaluated-source-type vocabulary. Determines how the evaluated_line was chosen. See EVIDENCE_PROFILE_METHOD_V1.md §A.3 (sportsbook_consensus), §13.3 (specific / pickem), §17 (user_entered).';

-- Quality-cap condition (§C.2 / §C.3 / §C.5 / §C.6 / §C.7 / §C.1). This
-- enum identifies WHICH cap bound the profile (the "quality_capped: true"
-- reason) drawn EXCLUSIVELY from §C's cap conditions. It is the profile-row
-- summary of the binding cap; the reasons table separately carries every
-- attached reason code (support, contradiction, quality) for the full
-- explanation. `none` denotes "no cap bound" — the classification was
-- reached without any §C cap firing.
--
-- Values map one-to-one to the corresponding reason codes:
--   * 'insufficient_book_coverage'   — §C.2 (DR-10: eligible_book_count < 3)
--   * 'stale_current_market'         — §C.3 four-way disambiguation (stale
--     / failed_latest_poll with usable prior observation)
--   * 'market_disagrees_with_history'— §C.5 T2 (sign(C_MA) ≠ sign(C_RTP)
--     with both magnitudes ≥ 0.30)
--   * 'push_heavy_sample'            — §C.6 (DR-9: L10 pushes > 30 %)
--   * 'one_sided_offering'           — §C.7 (RME-3 one_sided ∈ over_only /
--     under_only)
--   * 'none'                         — classification not capped (§D.3)
--
-- Insufficient (§C.1) and Unavailable (§C.3 no market / §C.8 / §C.9) are
-- classifications themselves, not caps, and are therefore represented by the
-- classification value + reason codes, NOT by this cap-reason enum.
CREATE TYPE evidence_quality_cap_reason AS ENUM (
  'none',
  'insufficient_book_coverage',
  'stale_current_market',
  'market_disagrees_with_history',
  'push_heavy_sample',
  'one_sided_offering'
);
COMMENT ON TYPE evidence_quality_cap_reason IS
  'B/C/D binding-cap label. Every non-none value ties one-to-one to a §C cap condition. See EVIDENCE_PROFILE_METHOD_V1.md §C.2 / §C.3 / §C.5 / §C.6 / §C.7.';

-- RME-3 one-sided-offering state (§A.4 RME-3). Verbatim per §I.2 table row.
-- NULL on the profile column when the offering set is empty or every price
-- is NULL — per the §I.2 derivation rules "The missing side is NEVER
-- fabricated."
CREATE TYPE evidence_one_sided_state AS ENUM (
  'over_only',
  'under_only',
  'neither'
);
COMMENT ON TYPE evidence_one_sided_state IS
  'RME-3 (V1-5x) — CurrentMarketRow.book_detail.one_sided. NULL on the profile column means the offering set was empty or every price null. See EVIDENCE_PROFILE_METHOD_V1.md §A.4 + docs/architecture/V1_COMPUTATION_CONTRACT.md §9.';

-- Reason-code closed vocabulary (§E.1). EVERY value here is a table row in
-- §E.1. The engine (V1-A1-3) is the only writer; consumers translate to
-- user-facing copy per §E.1 "User-facing translation" column.
--
-- ABNORMAL_DISPERSION is present in the enum per §E.1's closed-vocabulary
-- requirement. It carries NO ACTIVE TRIGGER in `evidence_method_v1` and
-- MUST NEVER be written to evidence_profile_reasons by an
-- `evidence_method_v1` writer — see DR-27 halt condition and §I.3 clause
-- (4). A future method-version bump (DR-24) may activate it; until then a
-- code-review-time and fixture-time assertion enforces the reservation.
CREATE TYPE evidence_reason_code AS ENUM (
  -- Support (§E.1 "Support" category)
  'window_agreement_support',
  'favorable_consensus_difference',
  'positive_margin_support',
  -- Contradiction (§E.1 "Contradiction" category)
  'unfavorable_consensus_difference',
  'negative_margin_support',
  'margin_measures_disagree',
  'market_disagrees_with_history',
  'windows_disagree',
  -- Quality / downgrade (§E.1 "Downgrade" and "Attach" categories)
  'stale_current_market',
  'insufficient_book_coverage',
  'push_heavy_sample',
  'one_sided_offering',
  'source_unavailable',
  -- Exclusion → Insufficient (§E.1)
  'insufficient_l10_sample',
  'incomplete_historical_coverage',
  -- Exclusion → Unavailable (§E.1)
  'unresolved_player_mapping',
  'unresolved_event_mapping',
  'no_current_market',
  'postponed_game',
  'canceled_game',
  -- RESERVED per DR-27 / §E.1 / §I.3 — NO ACTIVE TRIGGER in
  -- `evidence_method_v1`. Present so the vocabulary stays CLOSED per §E.1;
  -- an `evidence_method_v1` writer that emits this value violates §I.3 (4).
  'abnormal_dispersion'
);
COMMENT ON TYPE evidence_reason_code IS
  'A1 §26 + EVIDENCE_PROFILE_METHOD_V1.md §E.1 closed vocabulary. ABNORMAL_DISPERSION is RESERVED — NOT EMITTED IN evidence_method_v1 per DR-27 / §I.3. Activation requires a DR-24 method-version bump AND regression fixtures per A1 §12.';

-- Reason category (§E.2 canonical stored order per DR-26). The profile
-- writer stores each attached reason with its category so consumers can
-- present them in the canonical order:
--   (1) primary supporting evidence — 'support'
--   (2) contradicting evidence      — 'contradiction'
--   (3) quality/coverage limitations — 'quality'
-- DR-26's compact-UI clause permits visual reordering; that emphasis MUST
-- NOT alter the canonical stored order.
CREATE TYPE evidence_reason_category AS ENUM (
  'support',
  'contradiction',
  'quality'
);
COMMENT ON TYPE evidence_reason_category IS
  'DR-26 canonical stored order category: support → contradiction → quality. Compact-UI reordering (DR-26 last clause) never alters stored order.';

# V1 Identity Contract

**Owning ticket:** V1-1 — Canonical Identities and Mapping
**Status:** current implementation contract; may be extended by later tickets subject to their own authority.
**Anchors:** Complete spec §7.1–7.3, §11.1, §21.5–21.6; BDL §12A–§12B, §22; Odds API §6, §10.11, §25; V1_GOVERNANCE_DECISIONS GD-1.

This document captures the invariants the identity layer must maintain across the schema, the reconciliation code, the queues, and the mapping-history audit trail. It exists because those invariants are load-bearing across several files and are easier to reason about in one place than through inline comments alone.

## 1. Identity is provider-independent

- Internal IDs (`players.internal_player_id`, `teams.internal_team_id`, `games.internal_game_id`) are UUIDs, generated with `gen_random_uuid()`, never derived from a provider string.
- Provider identities are stored separately (`provider_players`, `provider_teams`, `provider_games`) and reference internal IDs only when resolved.
- Provider strings are retained verbatim (`raw_*` columns) — never rewritten by an alias, a normalization pass, or an update.

## 2. Uniqueness invariants

- `UNIQUE (provider, provider_team_id)` on `provider_teams`.
- `UNIQUE (provider, provider_player_id)` on `provider_players`.
- `UNIQUE (provider, provider_game_id)` on `provider_games`.
- No UNIQUE on any of: team `display_name`, team `abbreviation`, player `display_name`, player `normalized_name`, provider team `raw_full_name`, provider team `raw_abbreviation`, provider player `normalized_name`, alias `alias_text`.
- Reason: BDL §12B.5 documents that provider full_name and abbreviation collide (placeholder IDs 32 & 33 both `TBD`); BDL §12A.6 warns that name similarity is not identity.

## 3. Nullability invariants that must be preserved

- `teams.city`: `NOT NULL DEFAULT ''`. Empty string is a valid value.
- `teams.conference`: nullable.
- `provider_teams.raw_city`: `NOT NULL DEFAULT ''`.
- `provider_teams.raw_conference`: nullable.
- Reason: BDL §12A.5 / §12B.7 — Portland Fire (id 31) and Toronto Tempo (id 30) currently carry empty city and null conference in the audited BDL responses.

## 4. Ordered home / away

- `games.home_team_id <> games.away_team_id` is a CHECK constraint at the schema level.
- Home vs away is semantic, not symmetric. Reversed provider payloads are quarantined at the reconciliation layer as `ordered_teams_disagree`, never auto-swapped.

## 5. Scheduled vs actual start time

- `games.scheduled_start_utc` (NOT NULL) and `games.actual_start_utc` (nullable) are separate columns.
- Neither is derived from the other. Complete spec §7.10 depends on this separation for close-boundary evaluation in V1-4.

## 6. Reconciliation precedence

### 6.1 Event reconciliation

1. Resolve provider home & away teams to internal team IDs via approved `provider_teams` mappings.
   - If either unresolved → queue `unresolved_provider_team`.
   - If both resolve to the same internal team → quarantine `self_match_invalid`.
2. Filter internal games by ordered `(home_team_id, away_team_id)`.
   - If zero candidates match ordered pair but at least one matches the *reversed* pair → quarantine `ordered_teams_disagree` (no auto-swap).
   - If zero candidates at all → queue `unmatched`.
3. Prefer exactly one exact-time candidate → approve `exact_time`, `delta_seconds = 0`.
4. Otherwise prefer exactly one candidate within ±15 minutes → approve `time_tolerance`.
5. Multiple candidates within tolerance → queue `ambiguous_multiple_candidates`.
6. Ordered-team candidates exist but all exceed the tolerance → quarantine `time_window_exceeded`.

The 15-minute window is `EVENT_RECONCILIATION_TIME_TOLERANCE_SECONDS = 900`, referenced from the complete spec §7.2. A change to that constant requires methodology review, not a code-only change.

### 6.2 Player reconciliation

1. Existing reviewed provider mapping (approved `provider_players` on `(provider, provider_player_id)`) → approve `reviewed_provider_mapping`.
2. Reviewed alias whose scope matches the input provider and whose `normalized_alias` equals `normalizeName(raw_full_name)`:
   - Alias points to two or more distinct internal players → quarantine `ambiguous_alias_conflict`.
   - Alias points to one player and provider offers a team-context row that resolves to a different internal team → queue `missing_team_context` (do not auto-approve during a possible trade).
   - Otherwise → approve `reviewed_alias`; record `alias_version_at_mapping`.
3. Normalized-name candidate plus event/team context:
   - Empty normalized name → queue `unmatched`.
   - Multiple internal players share the normalized name → queue `ambiguous_multiple_candidates`.
   - Provider offers no team context → queue `missing_team_context`.
   - Provider team is not approved-mapped → queue `missing_team_context`.
   - Single candidate, team context disagrees → `proposed_for_review` (possible trade; reviewed action required).
   - Single candidate, team context agrees → `proposed_for_review` (§7.3 requires reviewed action for normalization-based matches; **never auto-approve on name alone**).
4. Empty `provider_player_id` → quarantine `unmatched`.

The load-bearing invariant: normalization alone can never return `approved`. Confirmed by `tests/identity/playerReconciliation.test.ts:` *no name-only permanent mapping*.

## 7. Aliases

- Aliases are always tied to a `scope_kind` (`internal`, `balldontlie`, `odds_api`) and an `alias_type` (`display`, `match_candidate`).
- Versioned via `alias_version`; supersession sets `is_active=false`, `superseded_by`, `superseded_at`.
- `approved_by` is `NOT NULL` — normalization alone cannot create an alias.
- `UNIQUE (internal_*_id, scope_kind, alias_type, alias_version)` per team/player.
- Alias `alias_text` is not UNIQUE — the same string can validly be an alias for several entities via reviewed decisions (which the reconciler treats as an alias conflict and quarantines).

## 8. Reconciliation queues

- `event_reconciliation_queue` and `player_reconciliation_queue` retain the *evidence* that caused queueing: raw provider strings, candidate internal IDs (array), reason, reason detail, timestamps.
- Reason and reason_detail are immutable in intent (append-only pattern; not currently enforced by trigger to keep the migration reversible).
- Approval writes a `mapping_history` `approved` row referencing the queue's original evidence.

## 9. Mapping history

- Append-only in intent. `mapping_history` rows are never UPDATEd or DELETEd. Corrections append a new row with a new action.
- Supersession emits two events: `superseded` on the prior mapping, `approved` on the new. Both retain `prior_internal_entity_id` for walk-back.

## 10. Team changes never mint a new player identity

- The `players.internal_player_id` remains stable across a team change.
- The reconciliation layer updates the `current_team_id` (spec §7.3 requirement); the schema `REFERENCES teams(internal_team_id)` is defined with `ON UPDATE RESTRICT ON DELETE RESTRICT` to prevent silent cascades.
- Tests: `tests/identity/playerReconciliation.test.ts:` *team change: normalized single candidate with disagreeing team → proposed_for_review, NOT approved, NOT new identity*.

## 11. Forward-fix migration policy

- All migrations are additive DDL against an empty database (greenfield at V1-0).
- No `.down.sql` files. Attempting a destructive down migration would risk historical identity loss; forward-fix additions ship instead.
- Each migration's header documents the forward-fix strategy for the invariants it introduces.
- The `tests/migrations/schemaShape.test.ts` static lint asserts these invariants at commit time so a future migration cannot silently violate them.

## 12. What this document does not authorize

Consistent with GD-1:

- No Supabase Auth.
- No direct browser-to-database access.
- No generated client types.
- No RLS entitlement rules.
- No provider clients, ingestion jobs, or scheduled polls.
- No product surfaces.

Those are later-ticket territory.

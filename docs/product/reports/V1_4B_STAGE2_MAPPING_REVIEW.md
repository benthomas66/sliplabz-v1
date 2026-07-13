# V1-4b Stage 2 Team Mapping Review (supplement 2)

**Kind:** OFFLINE analysis. Zero live-provider credits (Odds API + BDL both idle).
**Hosted-DB writes performed:** quarantine of BDL provider_team_id 18 and 29 + two mapping_history rows.
**Hosted-DB writes withheld:** none of the `odds_api` proposals below have been persisted. Governor approves line by line before Phase B.

## Step 1 — Quarantine outcome

Updated 0 provider_teams row(s); appended 0 mapping_history row(s).

Non-approved BDL provider_teams after quarantine:

```json
[
  {
    "provider_team_id": "18",
    "raw_full_name": "Team WNBA",
    "raw_abbreviation": "WNBASTARS",
    "mapping_state": "quarantined"
  },
  {
    "provider_team_id": "29",
    "raw_full_name": "Puerto Rico",
    "raw_abbreviation": "PUERTORICO",
    "mapping_state": "quarantined"
  }
]
```

## Step 2 — Proposed odds_api → internal team mapping table

Cache files loaded: 59. Raw events across discoveries: 331. **Unique event ids** (dedup by provider event id): 176. Distinct provider team strings: 15.

_Note on dedup: the Odds API historical events endpoint returns forward-looking events, so a given game id appears in multiple slate-date discovery responses. Phase B needs one event-odds request per **unique** id — counts below are on the deduplicated universe. `event refs` = the number of unique-event pairs the string participates in (each unique event contributes at most 2 refs: one home, one away)._

| provider_string | event refs | proposed internal (id) | proposed internal (display) | evidence | notes |
|---|---:|---|---|---|---|
| `Seattle Storm` | 25 | `f8ac47b0-58bd-41de-be7a-352d2971c240` | `Seattle Storm` | `exact` | exact case-insensitive normalized display_name match |
| `Las Vegas Aces` | 25 | `145c717d-5a5b-4355-9335-bd9c0ee6f529` | `Las Vegas Aces` | `exact` | exact case-insensitive normalized display_name match |
| `Phoenix Mercury` | 25 | `07b42f3e-d2d9-4ae1-b90e-16296bc5f38d` | `Phoenix Mercury` | `exact` | exact case-insensitive normalized display_name match |
| `New York Liberty` | 24 | `ea9cd876-a866-4e24-88ff-f1312fd299b4` | `New York Liberty` | `exact` | exact case-insensitive normalized display_name match |
| `Golden State Valkyries` | 24 | `16464b49-9634-447f-a54d-bc6f8d6e6f2b` | `Golden State Valkyries` | `exact` | exact case-insensitive normalized display_name match |
| `Dallas Wings` | 24 | `3cca251c-1470-4409-946f-7f269362e62b` | `Dallas Wings` | `exact` | exact case-insensitive normalized display_name match |
| `Minnesota Lynx` | 24 | `ae9b2ca5-e90d-4458-89e5-da8bbb1a756c` | `Minnesota Lynx` | `exact` | exact case-insensitive normalized display_name match |
| `Atlanta Dream` | 24 | `978f5c65-0973-4288-a9da-e8f0db1c41c3` | `Atlanta Dream` | `exact` | exact case-insensitive normalized display_name match |
| `Connecticut Sun` | 23 | `dff27d7d-1e22-4e81-bb5a-4610338c448b` | `Connecticut Sun` | `exact` | exact case-insensitive normalized display_name match |
| `Indiana Fever` | 23 | `19887788-1f29-4d08-81b3-cfe5060a1c39` | `Indiana Fever` | `exact` | exact case-insensitive normalized display_name match |
| `Portland Fire` | 23 | `b84dea7f-faf1-43f6-a8c1-1f9be54d2642` | `Fire` | `normalized_lastword` | provider last token 'fire' equals single-token internal display_name — likely an expansion team where BDL raw_full_name omits the city (BDL §12B.7) |
| `Chicago Sky` | 23 | `b38f4efa-cdd3-42fc-8725-da875da40415` | `Chicago Sky` | `exact` | exact case-insensitive normalized display_name match |
| `Toronto Tempo` | 22 | `d2baf46f-058a-47aa-8a22-69e40828b6fd` | `Tempo` | `normalized_lastword` | provider last token 'tempo' equals single-token internal display_name — likely an expansion team where BDL raw_full_name omits the city (BDL §12B.7) |
| `Los Angeles Sparks` | 22 | `4d82f7ab-1b3c-4925-82e2-f22cb0566e7a` | `Los Angeles Sparks` | `exact` | exact case-insensitive normalized display_name match |
| `Washington Mystics` | 21 | `a8b3ee76-8cf5-43be-b945-bb78ae113f17` | `Washington Mystics` | `exact` | exact case-insensitive normalized display_name match |

Evidence key:

- **exact** — the normalized (lowercase, punctuation-collapsed) provider string equals the normalized internal `display_name`.
- **normalized_lastword** — the last token of the normalized provider string equals a single-token internal `display_name` (handles BDL expansion teams whose `raw_full_name` omits the city per BDL §12B.7).
- **none** — no plausible internal candidate; governor must either mint a new internal team or reject the mapping. Zero of these should exist for a properly seeded 2026 season.

## Step 3 — What-if-queued breakdown (governor-visible exclusion set)

If the governor approves every non-`none` proposal in Step 2, projected outcome:

| bucket | count |
|---|---:|
| resolved_exact | 141 |
| resolved_tolerance | 29 |
| queued | 6 |
| **total unique events** | 176 |

**Phase B forecast (uses cached discovery, no new discovery credits needed):** 6800 credits for event-odds calls only. Ceiling: 12,000. Under ceiling by 5200 credits.

Queued breakdown by reason (all events; not just per-slice):

| reason | count |
|---|---:|
| time_window_exceeded | 4 |
| unmatched | 1 |
| ordered_teams_disagree | 1 |

For queued `unresolved_provider_team` events, attribution to the specific unmapped provider string:

| unmapped provider string | contributes to N queued events |
|---|---:|
| _(none)_ | 0 |

For queued events with OTHER reasons (e.g. `time_window_exceeded`, `ambiguous_multiple_candidates`, `ordered_teams_disagree`, `unmatched`), grouped by the ordered team-string pair with per-event detail:

| pair (home @ away) | reason | slate_date | commence_time | detail |
|---|---|---|---|---|
| `New York Liberty @ Toronto Tempo` | `time_window_exceeded` | 2026-06-02 | 2026-06-04T00:00:00Z | 1 ordered internal candidate(s); closest delta_seconds=-1800 |
| `New York Liberty @ Las Vegas Aces` | `time_window_exceeded` | 2026-06-18 | 2026-07-01T00:00:00Z | 1 ordered internal candidate(s); closest delta_seconds=-3600 |
| `Dallas Wings @ Chicago Sky` | `time_window_exceeded` | 2026-07-11 | 2026-07-12T23:00:00Z | 1 ordered internal candidate(s); closest delta_seconds=-1897200 |
| `Las Vegas Aces @ Indiana Fever` | `time_window_exceeded` | 2026-07-12 | 2026-07-13T01:00:00Z | 1 ordered internal candidate(s); closest delta_seconds=-612000 |
| `Atlanta Dream @ Los Angeles Sparks` | `unmatched` | 2026-07-12 | 2026-07-13T23:00:00Z | no internal game with (home,away) even after mapping teams |
| `Minnesota Lynx @ Phoenix Mercury` | `ordered_teams_disagree` | 2026-07-12 | 2026-07-14T01:00:00Z | 2 reversed-ordered internal candidate(s) |

## Zero-spend confirmation

- Odds API calls: **0** (analysis reads cache only).
- BDL calls: **0**.
- Hosted-DB writes: only the two team quarantines + two mapping_history rows described in Step 1.
- No `odds_api` `provider_teams` rows created; no `provider_games` rows created; no `event_reconciliation_queue` rows created.
